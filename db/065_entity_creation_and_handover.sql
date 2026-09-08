-- =====================================================================
-- AFFINITY CORE — 065: CREATING A CLIENT ENTITY, AND THE ONBOARDING HANDOVER
--
-- Found by the wiring audit, and it is the most consequential gap in the
-- system so far: THERE WAS NO WAY TO CREATE A CLIENT ENTITY.
--
-- Every register worked — officers, shareholders, beneficial owners, charges,
-- meetings, time, billing, filings — but they all hang off an entity, and no
-- function existed to create one. So in practice:
--
--   * "+ New entity" in Entity Admin could not save
--   * an onboarding case could reach 'Live' with no entity ever produced
--
-- Someone would have signed off a new client, gone to add the directors, and
-- found the client was not there. On day one of real use.
--
-- Why it was missed: I built the write layer by working through the greyed-out
-- buttons in each register. Entity creation was not a register, and the
-- onboarding handover was not a button at all, so neither appeared on any list
-- I was working from.
--
-- Run AFTER 064. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- CREATING AN ENTITY
-- ─────────────────────────────────────────────────────────────────────
-- Creates the entity AND its profile row in one transaction. Two reasons that
-- matters: every read path joins entity to entity_profile, so an entity
-- without a profile shows blank fields everywhere; and a half-created client
-- is worse than none, because it looks administered when it is not.
CREATE OR REPLACE FUNCTION ea_entity_create(
  p_name text,
  p_entity_class text DEFAULT 'client',      -- 'client' or 'internal'
  p_entity_type text DEFAULT 'COMPANY',
  p_jurisdiction text DEFAULT NULL,
  p_ref text DEFAULT NULL,                   -- company_code; generated if not supplied
  p_ccy char(3) DEFAULT 'GBP',
  p_reg_no text DEFAULT NULL,
  p_incorporation_date date DEFAULT NULL,
  p_year_end text DEFAULT NULL,
  p_business_activity text DEFAULT NULL,
  p_risk_rating text DEFAULT NULL,
  p_administrator text DEFAULT NULL,
  p_office text DEFAULT NULL)
RETURNS entity LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity; new_ref text; yr text; loc text;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN
    RAISE EXCEPTION 'An entity needs a name';
  END IF;

  -- location_code is a foreign key to the location table. Onboarding holds the
  -- jurisdiction NAME ("Isle of Man"); entity wants the CODE ("IOM"). Accept
  -- either, and name the valid options if it matches neither — a bare foreign
  -- key violation tells the user nothing.
  IF p_jurisdiction IS NOT NULL AND trim(p_jurisdiction) <> '' THEN
    SELECT l.code INTO loc FROM location l
     WHERE upper(l.code) = upper(trim(p_jurisdiction))
        OR lower(l.name) = lower(trim(p_jurisdiction))
     LIMIT 1;
    IF loc IS NULL THEN
      RAISE EXCEPTION 'Unknown jurisdiction "%". Valid values are: %',
        p_jurisdiction,
        (SELECT string_agg(l.name || ' (' || l.code || ')', ', ' ORDER BY l.name) FROM location l);
    END IF;
  END IF;
  IF p_entity_class NOT IN ('client','internal') THEN
    RAISE EXCEPTION 'Entity class must be client or internal';
  END IF;

  -- Two entities with the same name in the same jurisdiction is almost always
  -- a duplicate rather than a coincidence, and duplicates in a client register
  -- are corrosive: work gets recorded against the wrong one.
  IF EXISTS (
    SELECT 1 FROM entity e
     WHERE lower(trim(e.name)) = lower(trim(p_name))
       AND coalesce(e.location_code,'') = coalesce(loc,'')
  ) THEN
    RAISE EXCEPTION 'An entity called "%" already exists in %. Check it is not a duplicate before creating another.',
      trim(p_name), coalesce(p_jurisdiction, 'that jurisdiction');
  END IF;

  IF p_incorporation_date IS NOT NULL AND p_incorporation_date > current_date THEN
    RAISE EXCEPTION 'Incorporation date cannot be in the future';
  END IF;

  -- Reference. Client entities get AC-YYYY-NNNN; the sequence is per year so
  -- the reference itself says when the client was taken on.
  -- The reference column is company_code, and currency is functional_ccy.
  -- Both were verified against the live schema; an earlier version of this
  -- file assumed "ref" and "ccy" and failed at runtime.
  IF coalesce(trim(p_ref),'') <> '' THEN
    new_ref := trim(p_ref);
    IF EXISTS (SELECT 1 FROM entity WHERE company_code = new_ref) THEN
      RAISE EXCEPTION 'Reference % is already in use', new_ref;
    END IF;
  ELSE
    yr := to_char(current_date, 'YYYY');
    SELECT 'AC-' || yr || '-' ||
           lpad((coalesce(max(substring(e.company_code from 'AC-' || yr || '-(\d+)')::int), 0) + 1)::text, 3, '0')
      INTO new_ref
      FROM entity e
     WHERE e.company_code LIKE 'AC-' || yr || '-%';
    new_ref := coalesce(new_ref, 'AC-' || yr || '-001');
  END IF;

  INSERT INTO entity(company_code, name, entity_class, location_code, functional_ccy)
  VALUES (new_ref, trim(p_name), p_entity_class, loc,
          upper(coalesce(p_ccy,'GBP')))
  RETURNING * INTO r;

  -- The profile row, in the same transaction. Without it every read shows
  -- blank fields and the entity looks broken rather than new.
  INSERT INTO entity_profile(entity_id, reg_no, jurisdiction, entity_type,
                             incorporation_date, year_end, business_activity,
                             admin_status, risk_rating, administrator, office)
  VALUES (r.id, p_reg_no, (SELECT l.name FROM location l WHERE l.code = loc), p_entity_type,
          p_incorporation_date, p_year_end, p_business_activity,
          'Active', p_risk_rating, p_administrator, p_office)
  ON CONFLICT (entity_id) DO NOTHING;

  PERFORM ea_audit(r.id, 'entity', r.id, 'ENTITY CREATED',
                   new_ref || ' · ' || trim(p_name) ||
                   coalesce(' · ' || p_jurisdiction, '') || ' · ' || p_entity_class);
  RETURN r;
END $$;

-- Closing an entity. Deliberately not a delete: a client that has been
-- administered leaves records that must survive it, and the registers are the
-- evidence of what was done while it was live.
CREATE OR REPLACE FUNCTION ea_entity_close(
  p_entity bigint, p_reason text, p_closed_date date DEFAULT NULL)
RETURNS entity LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity; wip numeric; unbilled int;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for closing an entity';
  END IF;
  SELECT * INTO r FROM entity WHERE id = p_entity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;

  -- Closing a client with unbilled time means writing off work already done.
  -- That should be a decision, not an accident.
  SELECT count(*), coalesce(sum(value),0) INTO unbilled, wip
    FROM timesheet_entry te
   WHERE te.entity_label = r.name AND te.billable AND te.status <> 'Billed';
  IF unbilled > 0 THEN
    RAISE EXCEPTION 'There is unbilled time against % (% entries, %). Bill or write it off before closing.',
      r.name, unbilled, round(wip,2);
  END IF;

  UPDATE entity_profile SET admin_status = 'Closed'
   WHERE entity_id = p_entity;
  PERFORM ea_audit(p_entity, 'entity', p_entity, 'ENTITY CLOSED',
                   r.name || ' on ' || coalesce(p_closed_date, current_date) || ' — ' || p_reason);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- THE ONBOARDING HANDOVER
-- ─────────────────────────────────────────────────────────────────────
-- Taking a signed-off case live now CREATES the entity and links the two, so
-- the client actually exists to administer and the onboarding record points at
-- it. This is the join that was missing.
--
-- The CDD gates in onb_case_advance still apply — this cannot be used to reach
-- 'Live' without verified CDD and a risk rating, because it calls that
-- function rather than going round it.
CREATE OR REPLACE FUNCTION onb_case_go_live(
  p_case bigint, p_ref text DEFAULT NULL)
RETURNS entity LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE c onboarding_case; e entity;
BEGIN
  SELECT * INTO c FROM onboarding_case WHERE id = p_case;
  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding case % not found', p_case; END IF;

  IF c.entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'That case is already linked to an entity (id %)', c.entity_id;
  END IF;

  -- Advance to Live first. Its gates decide whether this is allowed at all —
  -- CDD verified, nothing outstanding, risk rating set. If they refuse, no
  -- entity is created, because this is one transaction.
  PERFORM onb_case_advance(p_case, 'Live', c.risk_rating, NULL);

  e := ea_entity_create(
        p_name              => coalesce(c.entity_name, c.client_name),
        p_entity_class      => 'client',
        p_entity_type       => coalesce(c.entity_type, 'COMPANY'),
        p_jurisdiction      => c.jurisdiction,
        p_ref               => p_ref,
        p_reg_no            => NULL,
        p_business_activity => c.sector,
        p_risk_rating       => c.risk_rating,
        p_administrator     => c.assigned_to,
        p_office            => c.office);

  -- Link them, so the onboarding file and the live client are the same story
  -- rather than two unconnected records.
  UPDATE onboarding_case SET entity_id = e.id WHERE id = p_case;

  -- Carry the verified CDD across as a file note, so the evidence that the
  -- client was checked sits on the client record and not only in onboarding.
  INSERT INTO entity_file_note(entity_id, note_date, author, note)
  SELECT e.id, current_date, current_app_user(),
         'Onboarding completed. CDD verified: ' ||
         string_agg(i.subject || ' (' || i.item_type || ', ' || coalesce(i.method,'method not recorded') || ')', '; ')
    FROM cdd_item i
   WHERE i.case_id = p_case AND i.status = 'Verified'
  HAVING count(*) > 0;

  PERFORM ea_audit(e.id, 'onboarding_case', p_case, 'ONBOARDING COMPLETED',
                   c.client_name || ' is now live as ' || e.company_code);
  RETURN e;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('ea_entity_create','ea_entity_close','onb_case_go_live')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS write_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('ea_entity_create','ea_entity_close','onb_case_go_live')
 ORDER BY p.proname;
