-- =====================================================================
-- AFFINITY CORE — 078: DEMO DATA, FLAGGED AND MANAGEABLE
--
-- The sample entities stay, so the system can be shown and staff can practise.
-- But they sit in the same tables as real client records, and that is the part
-- that needs handling rather than accepting.
--
-- ── WHY FLAGGING IS THE FIRST THING ─────────────────────────────────
--
-- Meridian Holdings Ltd, Harrington Family Trust and the rest read exactly
-- like real clients: plausible names, real-looking registration numbers,
-- Isle of Man and Malta jurisdictions. That is what makes them useful for a
-- demonstration and dangerous in a live register.
--
-- The realistic failure is not someone confusing them in the abstract. It is
-- someone filing a real return against a demo entity, or recording real time
-- against one, or telling a client a figure that came from sample data. In a
-- fiduciary business that is a client-facing error, not a tidiness problem.
--
-- So every demo record carries a flag, the interface shows it, and the flag is
-- what the add and remove functions work from — nothing is identified by
-- guessing at names.
--
-- Run AFTER 077. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- THE FLAG
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE entity ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ix_entity_is_demo ON entity(is_demo) WHERE is_demo;

-- Mark the existing set.
--
-- A first version matched on company_code prefixes AC-2024 and AC-2025 and
-- caught 3 of 18, leaving Meridian Holdings and the rest reading as real
-- records. The seeded clients actually span AC-2016 to AC-2026, so the pattern
-- was simply wrong — and a partial flag is worse than none, because the
-- unflagged ones then look verified.
--
-- The correct criterion is not the reference at all: NO REAL CLIENT RECORDS
-- HAVE BEEN MIGRATED YET, so every client entity currently in the system is
-- sample data. Flag them all, and use demo_flag_set to unflag any that turn
-- out to be real as migration proceeds.
--
-- Guarded so it only runs while that is still true. Once real clients exist,
-- re-running this file must not sweep them up.
DO $backfill$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM entity
                  WHERE entity_class = 'client' AND NOT is_demo
                    AND created_at > (SELECT max(created_at) FROM entity WHERE is_demo)) THEN
    UPDATE entity SET is_demo = true
     WHERE entity_class = 'client' AND NOT is_demo;
  END IF;
END $backfill$;

-- Unconditional for the seeded set specifically, which is safe in any case.
UPDATE entity SET is_demo = true
 WHERE entity_class = 'client' AND NOT is_demo
   AND company_code ~ '^AC-(201[6-9]|202[0-6])-';

-- Anything created by the demo functions below is flagged at creation, so this
-- backfill is only ever needed once.

-- ─────────────────────────────────────────────────────────────────────
-- WHAT IS DEMO AND WHAT IS REAL
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION demo_data_summary()
RETURNS TABLE(category text, demo_count bigint, real_count bigint, note text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  SELECT 'Client entities'::text,
         count(*) FILTER (WHERE e.is_demo),
         count(*) FILTER (WHERE NOT e.is_demo),
         CASE WHEN count(*) FILTER (WHERE NOT e.is_demo) = 0
              THEN 'no real client records yet — everything here is sample data'
              ELSE 'demo and real records sit in the same register, so the demo flag is what distinguishes them' END
    FROM entity e WHERE e.entity_class = 'client';

  RETURN QUERY
  SELECT 'Time recorded against demo entities'::text,
         count(*), 0::bigint,
         CASE WHEN count(*) > 0
              THEN 'time recorded against a demo entity will never be billed — check none of it is real work'
              ELSE 'none' END
    FROM timesheet_entry t
   WHERE t.entity_label IN (SELECT e.name FROM entity e WHERE e.is_demo);

  RETURN QUERY
  SELECT 'Invoices on demo entities'::text,
         count(*), 0::bigint,
         CASE WHEN count(*) > 0 THEN 'these are not real receivables' ELSE 'none' END
    FROM invoice i
   WHERE i.entity_id IN (SELECT e.id FROM entity e WHERE e.is_demo);

  RETURN QUERY
  SELECT 'Statutory filings on demo entities'::text,
         count(*), 0::bigint,
         CASE WHEN count(*) > 0
              THEN 'a filing recorded against a demo entity is the error worth catching — check none was meant for a real client'
              ELSE 'none' END
    FROM statutory_filing f
   WHERE f.entity_id IN (SELECT e.id FROM entity e WHERE e.is_demo);
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- ADDING DEMO ENTITIES
-- ─────────────────────────────────────────────────────────────────────
-- Goes through ea_entity_create, so a demo entity is built the same way a real
-- one is — including the duplicate check and the jurisdiction validation. A
-- demo record created by a different route would not exercise the same paths
-- and would be a poor rehearsal.
--
-- The name is prefixed, deliberately. A demo entity that reads exactly like a
-- real one is the problem this file exists to solve, so the flag is backed up
-- by something visible in any list, report or export that has not been taught
-- about the flag.
CREATE OR REPLACE FUNCTION demo_entity_add(
  p_name text, p_jurisdiction text DEFAULT 'IOM',
  p_entity_type text DEFAULT 'COMPANY', p_risk_rating text DEFAULT 'Medium',
  p_administrator text DEFAULT NULL)
RETURNS entity LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity; nm text;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN
    RAISE EXCEPTION 'Give the demo entity a name';
  END IF;

  nm := CASE WHEN trim(p_name) ILIKE '[DEMO]%' THEN trim(p_name)
             ELSE '[DEMO] ' || trim(p_name) END;

  r := ea_entity_create(
        p_name => nm, p_entity_class => 'client', p_entity_type => p_entity_type,
        p_jurisdiction => p_jurisdiction, p_risk_rating => p_risk_rating,
        p_administrator => p_administrator,
        p_business_activity => 'Sample data — not a real client');

  UPDATE entity SET is_demo = true WHERE id = r.id RETURNING * INTO r;
  PERFORM ea_audit(r.id, 'entity', r.id, 'demo entity created', nm);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- REMOVING DEMO ENTITIES
-- ─────────────────────────────────────────────────────────────────────
-- Refuses to touch anything not flagged as demo. That is the whole safety
-- property: a function that deletes client entities is only safe if it cannot
-- reach a real one, and the flag is checked rather than the name.
CREATE OR REPLACE FUNCTION demo_entity_remove(p_entity bigint)
RETURNS TABLE(removed text, records_deleted bigint, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE e entity; n bigint := 0; c bigint;
BEGIN
  SELECT * INTO e FROM entity WHERE id = p_entity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;

  IF NOT e.is_demo THEN
    RAISE EXCEPTION '% is not flagged as demo data, so it will not be removed by this route. If it really is sample data, flag it first; if it is a real client, close it rather than delete it — the records must survive the relationship.',
      e.name;
  END IF;

  -- Registers first, then the profile, then the entity.
  --
  -- The table list is DERIVED rather than written out. A hand-written list is
  -- how this goes wrong: my first version named entity_bank_account and
  -- entity_safe_custody, neither of which exists (they are entity_bank,
  -- entity_safe_item and entity_safe_movement), and it failed at runtime. A
  -- register added later would be missed the same way, leaving orphaned rows
  -- pointing at a deleted entity.
  DECLARE t record;
  BEGIN
    FOR t IN
      SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables tb
          ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
       WHERE c.table_schema = 'public'
         AND c.column_name = 'entity_id'
         AND tb.table_type = 'BASE TABLE'
         AND c.table_name NOT IN ('entity_profile','journal','journal_line',
                                  'onboarding_case','fs_accounts_set',
                                  'accounting_period')
       ORDER BY c.table_name
    LOOP
      EXECUTE format('DELETE FROM %I WHERE entity_id = $1', t.table_name) USING p_entity;
      GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
    END LOOP;
  END;

  -- Onboarding cases are unlinked rather than deleted: the case is a record of
  -- work done, and it survives the entity it produced.
  UPDATE onboarding_case SET entity_id = NULL WHERE entity_id = p_entity;
  DELETE FROM entity_profile WHERE entity_id = p_entity;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  PERFORM ea_audit(NULL, 'entity', p_entity, 'DEMO ENTITY REMOVED',
                   e.name || ' (' || e.company_code || ') and ' || n || ' related record(s)');

  DELETE FROM entity WHERE id = p_entity;

  RETURN QUERY SELECT e.name, n,
    'Removed along with ' || n || ' related record(s). Journals are left alone: deleting a posted journal would unbalance the ledger, so demo journals stay and are visible as belonging to a removed entity.';
END $$;

-- Removing all of them at once, for clearing a demonstration down. Reports
-- what it did rather than doing it silently.
CREATE OR REPLACE FUNCTION demo_data_clear(p_confirm text)
RETURNS TABLE(entities_removed bigint, records_removed bigint, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; ents bigint := 0; recs bigint := 0; r record;
BEGIN
  -- A typed confirmation rather than a boolean. This deletes a register, and a
  -- misplaced true is easier than a misplaced word.
  IF coalesce(p_confirm,'') <> 'REMOVE DEMO DATA' THEN
    RAISE EXCEPTION 'To clear all demo data, pass the confirmation exactly: REMOVE DEMO DATA. % demo entity(ies) would be removed.',
      (SELECT count(*) FROM entity WHERE is_demo);
  END IF;

  FOR e IN SELECT id FROM entity WHERE is_demo LOOP
    FOR r IN SELECT * FROM demo_entity_remove(e.id) LOOP
      ents := ents + 1; recs := recs + r.records_deleted;
    END LOOP;
  END LOOP;

  PERFORM ea_audit(NULL, 'entity', NULL, 'ALL DEMO DATA CLEARED',
                   ents || ' entity(ies) and ' || recs || ' related record(s)');
  RETURN QUERY SELECT ents, recs,
    CASE WHEN ents = 0 THEN 'There was no demo data to remove.'
         ELSE ents || ' demo entity(ies) removed. Real client records were not touched: the flag is what this works from, not the names.' END;
END $$;

-- Flagging or unflagging an existing entity, for the seeded records the
-- backfill above may have missed, or one created as demo that turns out to be
-- real.
CREATE OR REPLACE FUNCTION demo_flag_set(p_entity bigint, p_is_demo boolean)
RETURNS entity LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity;
BEGIN
  SELECT * INTO r FROM entity WHERE id = p_entity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;

  -- Flagging a real entity as demo is the dangerous direction, because it
  -- makes it deletable. Refused where there is any sign it has been worked on.
  IF p_is_demo AND NOT r.is_demo THEN
    IF EXISTS (SELECT 1 FROM timesheet_entry t WHERE t.entity_label = r.name)
       OR EXISTS (SELECT 1 FROM invoice i WHERE i.entity_id = p_entity)
       OR EXISTS (SELECT 1 FROM journal j WHERE j.entity_id = p_entity
                                            AND j.status = 'posted') THEN
      RAISE EXCEPTION '% has time, invoices or posted journals against it, so it will not be flagged as demo — flagging it would make it deletable. If it really is sample data, remove the work recorded against it first.',
        r.name;
    END IF;
  END IF;

  UPDATE entity SET is_demo = p_is_demo WHERE id = p_entity RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity', p_entity,
                   CASE WHEN p_is_demo THEN 'flagged as demo data'
                        ELSE 'demo flag removed — now treated as a real record' END,
                   r.name);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- MAKE THE FLAG VISIBLE IN THE ENTITY LIST
-- ─────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS ea_entities_list();
CREATE OR REPLACE FUNCTION ea_entities_list()
RETURNS TABLE(id bigint, ref text, name text, entity_type text, jurisdiction text,
              status text, risk_rating text, incorporation_date date,
              entity_class text, is_demo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.company_code, e.name,
         COALESCE(p.entity_type,'Company'), COALESCE(p.jurisdiction,'—'),
         COALESCE(p.admin_status,'Active'), COALESCE(p.risk_rating,'—'),
         p.incorporation_date, e.entity_class, e.is_demo
    FROM entity e JOIN entity_profile p ON p.entity_id = e.id
   ORDER BY e.is_demo, e.name;
$$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('demo_data_summary','demo_entity_add','demo_entity_remove',
                         'demo_data_clear','demo_flag_set','ea_entities_list')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT category, demo_count, real_count FROM demo_data_summary();
