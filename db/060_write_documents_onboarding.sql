-- =====================================================================
-- AFFINITY CORE — WRITE LAYER, BATCH 3: DOCUMENTS AND ONBOARDING
--
-- Documents build on link_document, which already exists and already stamps
-- retention_until from the per-category, per-jurisdiction policy. Nothing here
-- recomputes retention — it calls what is there.
--
-- Onboarding had no tables at all, so this creates them. The stages follow the
-- route the system already describes: enquiry, CDD, risk rating, sign-off.
--
-- Run AFTER 059. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- DOCUMENTS
-- ─────────────────────────────────────────────────────────────────────

-- Filing a document. Thin wrapper over link_document so the retention policy
-- stays in one place, plus the validation a form needs.
--
-- document_link is object-linked by design: object_type / object_id say what
-- the document evidences — a specific officer, charge or bank mandate — which
-- is why object_id is NOT NULL. For a document filed against the entity as a
-- whole, the object IS the entity, so object_id defaults to the entity id
-- rather than being left empty.
CREATE OR REPLACE FUNCTION doc_file(
  p_entity bigint, p_category int, p_filename text,
  p_object_type text DEFAULT 'entity', p_object_id bigint DEFAULT NULL,
  p_ref text DEFAULT NULL)
RETURNS document_link LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id bigint; r document_link;
BEGIN
  IF coalesce(trim(p_filename),'') = '' THEN RAISE EXCEPTION 'A filename is required'; END IF;
  IF p_category IS NULL THEN
    RAISE EXCEPTION 'Choose a folder — an unfiled document cannot be found again';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM entity WHERE id = p_entity) THEN
    RAISE EXCEPTION 'Unknown entity';
  END IF;

  new_id := link_document(p_entity, coalesce(p_object_type,'entity'),
                          coalesce(p_object_id, p_entity),
                          p_category, p_ref, trim(p_filename), current_app_user());
  SELECT * INTO r FROM document_link WHERE id = new_id;
  PERFORM ea_audit(p_entity, 'document_link', new_id, 'document filed', trim(p_filename));
  RETURN r;
END $$;

-- Moving a document between folders. Retention is driven by category, so the
-- retention date is recalculated rather than carried over — otherwise a
-- document moved into Permanent would keep its old expiry.
CREATE OR REPLACE FUNCTION doc_reclassify(p_id bigint, p_category int, p_reason text DEFAULT NULL)
RETURNS document_link LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r document_link; juris text; yrs int;
BEGIN
  SELECT * INTO r FROM document_link WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document % not found', p_id; END IF;

  SELECT location_code INTO juris FROM entity WHERE id = r.entity_id;
  yrs := retention_years(p_category, juris);

  UPDATE document_link
     SET dms_category = p_category,
         retention_until = CASE WHEN yrs IS NULL THEN NULL
                                ELSE (current_date + (yrs || ' years')::interval)::date END
   WHERE id = p_id RETURNING * INTO r;

  PERFORM ea_audit(r.entity_id, 'document_link', p_id, 'document refiled',
                   r.filename || coalesce(' — ' || p_reason, ''));
  RETURN r;
END $$;

-- Deleting a document. This is the one that needs a real control: a document
-- inside its retention period must not be deletable on a whim, because that is
-- exactly what a regulator asks about. Requires an explicit override and a
-- reason, both recorded.
CREATE OR REPLACE FUNCTION doc_delete(
  p_id bigint, p_reason text, p_override_retention boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r document_link;
BEGIN
  SELECT * INTO r FROM document_link WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document % not found', p_id; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for deleting a document';
  END IF;

  IF r.retention_until IS NOT NULL AND r.retention_until > current_date THEN
    IF NOT p_override_retention THEN
      RAISE EXCEPTION 'That document must be retained until % — deletion needs an explicit override',
        to_char(r.retention_until, 'DD/MM/YYYY');
    END IF;
    PERFORM ea_audit(r.entity_id, 'document_link', p_id, 'RETENTION OVERRIDDEN',
                     r.filename || ' — retained until ' || r.retention_until || ' — ' || p_reason);
  END IF;

  PERFORM ea_audit(r.entity_id, 'document_link', p_id, 'document deleted',
                   r.filename || ' — ' || p_reason);
  DELETE FROM document_link WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION doc_list(p_entity bigint, p_category int DEFAULT NULL)
RETURNS TABLE(id bigint, dms_category int, category_name text, dms_ref text, filename text,
              uploaded_by text, uploaded_at timestamptz, retention_until date, retained boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id, d.dms_category, c.name, d.dms_ref, d.filename, d.uploaded_by,
         d.uploaded_at, d.retention_until,
         (d.retention_until IS NOT NULL AND d.retention_until > current_date)
    FROM document_link d
    LEFT JOIN dms_category c ON c.code = d.dms_category
   WHERE d.entity_id = p_entity
     AND (p_category IS NULL OR d.dms_category = p_category)
   ORDER BY d.uploaded_at DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- ONBOARDING
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS onboarding_case (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_name    text NOT NULL,
  entity_name    text,
  entity_id      bigint REFERENCES entity(id),
  office         text,
  jurisdiction   text,
  entity_type    text,
  sector         text,
  source         text,                       -- referral, transfer-in, direct
  introducer     text,
  stage          text NOT NULL DEFAULT 'Enquiry',
  risk_rating    text,
  assigned_to    text,
  target_date    date,
  fee_quoted     numeric,
  fee_ccy        char(3) DEFAULT 'GBP',
  created_by     text NOT NULL DEFAULT current_app_user(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  signed_off_by  text,
  signed_off_at  timestamptz,
  declined_reason text
);
CREATE INDEX IF NOT EXISTS ix_onboarding_stage ON onboarding_case(stage);

-- Customer due diligence items, one row per document or check required.
CREATE TABLE IF NOT EXISTS cdd_item (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id      bigint NOT NULL REFERENCES onboarding_case(id) ON DELETE CASCADE,
  subject      text NOT NULL,               -- who or what the item concerns
  item_type    text NOT NULL,               -- identity, address, source of funds, source of wealth
  status       text NOT NULL DEFAULT 'Outstanding',
  verified_by  text,
  verified_at  timestamptz,
  method       text,                        -- certified copy, electronic, original seen
  notes        text,
  UNIQUE (case_id, subject, item_type)
);

-- The stages, in order. Kept here so a case cannot skip a stage by accident.
CREATE OR REPLACE FUNCTION onb_stages()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['Enquiry','CDD collection','Risk rating','Sign-off','Live','Declined']::text[];
$$;

CREATE OR REPLACE FUNCTION onb_case_add(
  p_client_name text, p_entity_name text DEFAULT NULL, p_office text DEFAULT NULL,
  p_jurisdiction text DEFAULT NULL, p_entity_type text DEFAULT NULL, p_sector text DEFAULT NULL,
  p_source text DEFAULT NULL, p_introducer text DEFAULT NULL, p_assigned_to text DEFAULT NULL,
  p_target_date date DEFAULT NULL, p_fee_quoted numeric DEFAULT NULL, p_fee_ccy char(3) DEFAULT 'GBP')
RETURNS onboarding_case LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r onboarding_case;
BEGIN
  IF coalesce(trim(p_client_name),'') = '' THEN RAISE EXCEPTION 'Client name is required'; END IF;
  INSERT INTO onboarding_case(client_name, entity_name, office, jurisdiction, entity_type,
                              sector, source, introducer, assigned_to, target_date,
                              fee_quoted, fee_ccy)
  VALUES (trim(p_client_name), p_entity_name, p_office, p_jurisdiction, p_entity_type,
          p_sector, p_source, p_introducer, coalesce(p_assigned_to, current_app_user()),
          p_target_date, p_fee_quoted, upper(coalesce(p_fee_ccy,'GBP')))
  RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'onboarding_case', r.id, 'enquiry raised', trim(p_client_name));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION cdd_item_add(
  p_case bigint, p_subject text, p_item_type text, p_notes text DEFAULT NULL)
RETURNS cdd_item LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r cdd_item;
BEGIN
  IF coalesce(trim(p_subject),'') = '' THEN RAISE EXCEPTION 'Say who or what the item concerns'; END IF;
  INSERT INTO cdd_item(case_id, subject, item_type, notes)
  VALUES (p_case, trim(p_subject), p_item_type, p_notes)
  ON CONFLICT (case_id, subject, item_type) DO UPDATE SET notes = coalesce(EXCLUDED.notes, cdd_item.notes)
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION cdd_item_verify(
  p_id bigint, p_method text, p_notes text DEFAULT NULL)
RETURNS cdd_item LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r cdd_item;
BEGIN
  IF coalesce(trim(p_method),'') = '' THEN
    RAISE EXCEPTION 'Record how the item was verified — certified copy, electronic, or original seen';
  END IF;
  UPDATE cdd_item
     SET status = 'Verified', method = p_method, notes = coalesce(p_notes, notes),
         verified_by = current_app_user(), verified_at = now()
   WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'CDD item % not found', p_id; END IF;
  PERFORM ea_audit(NULL, 'cdd_item', p_id, 'CDD verified',
                   r.subject || ' · ' || r.item_type || ' · ' || p_method);
  RETURN r;
END $$;

-- Moving a case forward. The gates are the point of this function: a case
-- cannot reach sign-off with CDD outstanding, and cannot go live without a
-- risk rating. Enforcing that here means it holds however the case is edited.
CREATE OR REPLACE FUNCTION onb_case_advance(
  p_id bigint, p_stage text, p_risk_rating text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS onboarding_case LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r onboarding_case; outstanding int; unverified int;
BEGIN
  SELECT * INTO r FROM onboarding_case WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding case % not found', p_id; END IF;
  IF NOT (p_stage = ANY (onb_stages())) THEN
    RAISE EXCEPTION 'Unknown onboarding stage: %', p_stage;
  END IF;
  IF r.stage = 'Live' THEN RAISE EXCEPTION 'That case is already live'; END IF;

  IF p_stage = 'Declined' AND coalesce(trim(p_note),'') = '' THEN
    RAISE EXCEPTION 'Give a reason when declining business — it goes on the declined business register';
  END IF;

  -- Gate 1: no sign-off with CDD outstanding.
  IF p_stage IN ('Sign-off','Live') THEN
    SELECT count(*) INTO outstanding FROM cdd_item WHERE case_id = p_id AND status <> 'Verified';
    IF outstanding > 0 THEN
      RAISE EXCEPTION '% CDD item(s) are still outstanding — these must be verified before sign-off',
        outstanding;
    END IF;
    SELECT count(*) INTO unverified FROM cdd_item WHERE case_id = p_id;
    IF unverified = 0 THEN
      RAISE EXCEPTION 'No CDD has been recorded for this case at all';
    END IF;
  END IF;

  -- Gate 2: no risk rating, no going live.
  IF p_stage IN ('Sign-off','Live') AND coalesce(p_risk_rating, r.risk_rating) IS NULL THEN
    RAISE EXCEPTION 'A risk rating is required before sign-off';
  END IF;

  UPDATE onboarding_case
     SET stage = p_stage,
         risk_rating = coalesce(p_risk_rating, risk_rating),
         declined_reason = CASE WHEN p_stage = 'Declined' THEN p_note ELSE declined_reason END,
         signed_off_by = CASE WHEN p_stage IN ('Sign-off','Live') THEN current_app_user() ELSE signed_off_by END,
         signed_off_at = CASE WHEN p_stage IN ('Sign-off','Live') THEN now() ELSE signed_off_at END
   WHERE id = p_id RETURNING * INTO r;

  PERFORM ea_audit(r.entity_id, 'onboarding_case', p_id, 'onboarding ' || lower(p_stage),
                   r.client_name || coalesce(' — ' || p_note, ''));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION onb_case_list(p_stage text DEFAULT NULL)
RETURNS TABLE(id bigint, client_name text, entity_name text, office text, jurisdiction text,
              entity_type text, sector text, stage text, risk_rating text, assigned_to text,
              target_date date, fee_quoted numeric, fee_ccy char(3),
              cdd_total int, cdd_verified int, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.client_name, c.entity_name, c.office, c.jurisdiction, c.entity_type,
         c.sector, c.stage, c.risk_rating, c.assigned_to, c.target_date,
         c.fee_quoted, c.fee_ccy,
         (SELECT count(*)::int FROM cdd_item i WHERE i.case_id = c.id),
         (SELECT count(*)::int FROM cdd_item i WHERE i.case_id = c.id AND i.status = 'Verified'),
         c.created_at
    FROM onboarding_case c
   WHERE p_stage IS NULL OR c.stage = p_stage
   ORDER BY c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION cdd_item_list(p_case bigint)
RETURNS TABLE(id bigint, subject text, item_type text, status text, method text,
              verified_by text, verified_at timestamptz, notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, subject, item_type, status, method, verified_by, verified_at, notes
    FROM cdd_item WHERE case_id = p_case ORDER BY subject, item_type;
$$;

-- ── Grants: authenticated only ───────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'doc_%' OR p.proname LIKE 'onb_%' OR p.proname LIKE 'cdd_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON onboarding_case, cdd_item FROM PUBLIC, anon;
GRANT SELECT ON onboarding_case, cdd_item TO authenticated;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS write_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND (p.proname LIKE 'doc_%' OR p.proname LIKE 'onb_%' OR p.proname LIKE 'cdd_%')
 ORDER BY p.proname;
