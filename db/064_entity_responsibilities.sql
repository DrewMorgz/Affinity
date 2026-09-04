-- =====================================================================
-- AFFINITY CORE — 064: THE ENTITY RESPONSIBILITY FIELDS
--
-- Found when the first live records appeared on screen: the Administration
-- panel showed Administrator, Manager, Lead director, Accountant and Office
-- as blank, because those fields have NO COLUMNS in entity_profile. They only
-- ever existed in the front-end demonstration dataset.
--
-- That is a real gap rather than a cosmetic one. "Who administers this entity"
-- is the first question anyone asks of a client record, and it drives
-- workload, reviews and cover. It cannot live only in demo data.
--
-- Run AFTER 063. Safe to re-run.
-- =====================================================================

ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS administrator   text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS manager         text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS lead_director   text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS accountant      text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS office          text;

-- ── Setting them ─────────────────────────────────────────────────────
-- Kept separate from ea_profile_update because these are a different kind of
-- change: reassigning an administrator is a workload decision, not an
-- amendment to the entity's own details, and is usually done in bulk when
-- someone joins or leaves.
CREATE OR REPLACE FUNCTION ea_responsibilities_set(
  p_entity bigint, p_administrator text DEFAULT NULL, p_manager text DEFAULT NULL,
  p_lead_director text DEFAULT NULL, p_accountant text DEFAULT NULL,
  p_office text DEFAULT NULL, p_mlro text DEFAULT NULL)
RETURNS entity_profile LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_profile; was text;
BEGIN
  SELECT administrator INTO was FROM entity_profile WHERE entity_id = p_entity;

  INSERT INTO entity_profile(entity_id, administrator, manager, lead_director,
                             accountant, office, mlro)
  VALUES (p_entity, p_administrator, p_manager, p_lead_director,
          p_accountant, p_office, p_mlro)
  ON CONFLICT (entity_id) DO UPDATE SET
    administrator = coalesce(EXCLUDED.administrator, entity_profile.administrator),
    manager       = coalesce(EXCLUDED.manager,       entity_profile.manager),
    lead_director = coalesce(EXCLUDED.lead_director, entity_profile.lead_director),
    accountant    = coalesce(EXCLUDED.accountant,    entity_profile.accountant),
    office        = coalesce(EXCLUDED.office,        entity_profile.office),
    mlro          = coalesce(EXCLUDED.mlro,          entity_profile.mlro)
  RETURNING * INTO r;

  -- A change of administrator is worth its own audit line: it is the answer to
  -- "who was looking after this when it went wrong".
  IF p_administrator IS NOT NULL AND was IS DISTINCT FROM p_administrator THEN
    PERFORM ea_audit(p_entity, 'entity_profile', p_entity, 'ADMINISTRATOR CHANGED',
                     coalesce(was, '(none)') || ' to ' || p_administrator);
  ELSE
    PERFORM ea_audit(p_entity, 'entity_profile', p_entity, 'responsibilities updated', NULL);
  END IF;
  RETURN r;
END $$;

-- Reassigning a whole caseload, for a joiner, leaver or handover. Doing this
-- one entity at a time is how entities get missed.
CREATE OR REPLACE FUNCTION ea_reassign_caseload(
  p_from text, p_to text, p_role text DEFAULT 'administrator')
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer := 0;
BEGIN
  IF coalesce(trim(p_from),'') = '' OR coalesce(trim(p_to),'') = '' THEN
    RAISE EXCEPTION 'Give both the person handing over and the person taking on';
  END IF;
  IF p_role NOT IN ('administrator','manager','lead_director','accountant') THEN
    RAISE EXCEPTION 'Role must be administrator, manager, lead_director or accountant';
  END IF;

  IF p_role = 'administrator' THEN
    UPDATE entity_profile SET administrator = p_to WHERE administrator = p_from;
  ELSIF p_role = 'manager' THEN
    UPDATE entity_profile SET manager = p_to WHERE manager = p_from;
  ELSIF p_role = 'lead_director' THEN
    UPDATE entity_profile SET lead_director = p_to WHERE lead_director = p_from;
  ELSE
    UPDATE entity_profile SET accountant = p_to WHERE accountant = p_from;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n = 0 THEN
    RAISE EXCEPTION 'No entities are recorded against % as %', p_from, p_role;
  END IF;
  PERFORM ea_audit(NULL, 'entity_profile', NULL, 'CASELOAD REASSIGNED',
                   n || ' entities: ' || p_from || ' to ' || p_to || ' (' || p_role || ')');
  RETURN n;
END $$;

-- Who holds what, so a caseload can be seen before it is moved.
CREATE OR REPLACE FUNCTION ea_caseload(p_role text DEFAULT 'administrator')
RETURNS TABLE(person text, entities bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_role = 'manager' THEN
    RETURN QUERY SELECT p.manager, count(*) FROM entity_profile p
                  WHERE p.manager IS NOT NULL GROUP BY p.manager ORDER BY 2 DESC;
  ELSIF p_role = 'lead_director' THEN
    RETURN QUERY SELECT p.lead_director, count(*) FROM entity_profile p
                  WHERE p.lead_director IS NOT NULL GROUP BY p.lead_director ORDER BY 2 DESC;
  ELSIF p_role = 'accountant' THEN
    RETURN QUERY SELECT p.accountant, count(*) FROM entity_profile p
                  WHERE p.accountant IS NOT NULL GROUP BY p.accountant ORDER BY 2 DESC;
  ELSE
    RETURN QUERY SELECT p.administrator, count(*) FROM entity_profile p
                  WHERE p.administrator IS NOT NULL GROUP BY p.administrator ORDER BY 2 DESC;
  END IF;
END $$;

-- ── Extend the entity read so the new fields reach the screen ────────
-- ea_profile returns the row, so the columns arrive automatically. Nothing to
-- change there — but the app has to map them, which is the other half of this
-- fix and lives in affinity_core_entity_admin.jsx.

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('ea_responsibilities_set','ea_reassign_caseload','ea_caseload')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'entity_profile'
   AND column_name IN ('administrator','manager','lead_director','accountant','office','mlro')
 ORDER BY column_name;
