-- =====================================================================
-- AFFINITY — SAVED REPORTS (write-enabled)
-- A saved report is just a name plus the builder's definition: which
-- columns, which conditions, which portfolio scope. Re-running it means
-- re-evaluating the definition against current data, so a saved report
-- always returns today's answer, never a stale snapshot.
-- Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS saved_report (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  definition  jsonb NOT NULL,          -- { fields:[], conds:[], scope:"" }
  owner       text,                    -- staff name/upn; null = unattributed
  shared      boolean NOT NULL DEFAULT false,
  run_count   integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_report_owner_idx ON saved_report(owner);

-- WRITE: create or update by name for that owner, so saving twice with the
-- same name updates rather than duplicating.
CREATE OR REPLACE FUNCTION saved_report_upsert(
  p_name text, p_definition jsonb, p_owner text, p_shared boolean)
RETURNS saved_report LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r saved_report;
BEGIN
  UPDATE saved_report
     SET definition = p_definition, shared = p_shared, updated_at = now()
   WHERE name = p_name AND owner IS NOT DISTINCT FROM p_owner
  RETURNING * INTO r;

  IF NOT FOUND THEN
    INSERT INTO saved_report (name, definition, owner, shared)
    VALUES (p_name, p_definition, p_owner, p_shared)
    RETURNING * INTO r;
  END IF;

  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION saved_report_upsert(text,jsonb,text,boolean) TO authenticated;

-- READ: a user's own reports plus anything shared with the team
CREATE OR REPLACE FUNCTION saved_report_list(p_owner text)
RETURNS TABLE (id bigint, name text, definition jsonb, owner text, shared boolean,
               run_count integer, last_run_at timestamptz, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, name, definition, owner, shared, run_count, last_run_at, updated_at
    FROM saved_report
   WHERE owner IS NOT DISTINCT FROM p_owner OR shared = true
   ORDER BY updated_at DESC;
$$;
GRANT EXECUTE ON FUNCTION saved_report_list(text) TO authenticated;

-- Record a run, so the list can show what actually gets used
CREATE OR REPLACE FUNCTION saved_report_touch(p_id bigint)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  UPDATE saved_report SET run_count = run_count + 1, last_run_at = now() WHERE id = p_id;
$$;
GRANT EXECUTE ON FUNCTION saved_report_touch(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION saved_report_delete(p_id bigint)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  DELETE FROM saved_report WHERE id = p_id;
$$;
GRANT EXECUTE ON FUNCTION saved_report_delete(bigint) TO authenticated;
