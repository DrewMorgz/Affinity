-- =====================================================================
-- AFFINITY — PLANNING & CONSOLIDATION: GRANTS AND SUPABASE IDENTITY
--
-- The engine files (db/001-051) create the tables and functions but grant
-- them to a bespoke `affinity_app` role that does not exist in Supabase, so
-- without this file nothing the front end calls is reachable — the app would
-- run the SQL successfully and still show preview data.
--
-- This file:
--   1. wires current_app_user() to the Supabase JWT instead of a GUC,
--   2. grants EXECUTE on the planning and consolidation functions,
--   3. exposes read-only list functions the UI needs but the engine does not
--      provide (budget list, group list, mapping queue, intercompany rows).
--
-- Run AFTER db/001-051. Safe to re-run.
--
-- NOTE ON ACCESS: granted to `authenticated` only, NOT to `anon`. The earlier
-- register pilots were granted to anon, which means anyone with the public key
-- can write to them. Do not repeat that here — budgets and consolidated
-- results are the firm's own financial data.
-- =====================================================================

-- 1) Identity ---------------------------------------------------------
-- In Supabase the signed-in user arrives in the JWT. Fall back to the GUC so
-- the same function still works when running migrations locally.
CREATE OR REPLACE FUNCTION current_app_user()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::json ->> 'email', ''),
    NULLIF(current_setting('request.jwt.claims', true)::json ->> 'sub', ''),
    NULLIF(current_setting('affinity.app_user', true), ''),
    session_user
  );
$$;

-- 2) Planning ---------------------------------------------------------
GRANT EXECUTE ON FUNCTION report_budget_vs_actual(bigint)              TO authenticated;
GRANT EXECUTE ON FUNCTION report_budget_summary(bigint)                TO authenticated;
GRANT EXECUTE ON FUNCTION submit_budget(bigint, text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION approve_budget(bigint, text)                 TO authenticated;
GRANT EXECUTE ON FUNCTION compare_budget_scenarios(bigint, bigint)     TO authenticated;

-- 3) Consolidation ----------------------------------------------------
GRANT EXECUTE ON FUNCTION consolidated_trial_balance(bigint, date)     TO authenticated;
GRANT EXECUTE ON FUNCTION consolidated_summary(bigint, date)           TO authenticated;

-- 4) List functions the interface needs -------------------------------
-- The engine reports on a budget once you know its id; the UI needs to offer
-- the choice first.
CREATE OR REPLACE FUNCTION planning_budget_list()
RETURNS TABLE(id bigint, name text, entity_name text, period_start date,
              period_end date, status text, currency text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, b.name, e.name, b.period_start, b.period_end,
         COALESCE(b.status,'draft'), COALESCE(e.functional_currency,'GBP')
    FROM budget b
    LEFT JOIN entity e ON e.id = b.entity_id
   ORDER BY b.period_start DESC, b.name;
$$;
GRANT EXECUTE ON FUNCTION planning_budget_list() TO authenticated;

-- Budget lines shaped exactly as the grid renders them: account down,
-- period across. The UI pivots; the database stays normalised.
CREATE OR REPLACE FUNCTION planning_budget_grid(p_budget bigint)
RETURNS TABLE(account_code text, account_name text, account_type text,
              period char(7), amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.code, a.name, a.account_type, l.period, l.amount
    FROM budget_line l
    JOIN account a ON a.id = l.account_id
   WHERE l.budget_id = p_budget
   ORDER BY a.code, l.period;
$$;
GRANT EXECUTE ON FUNCTION planning_budget_grid(bigint) TO authenticated;

-- Write a single cell. The grid autosaves per cell rather than per sheet.
CREATE OR REPLACE FUNCTION planning_budget_set(
  p_budget bigint, p_account_code text, p_period char(7), p_amount numeric)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE aid bigint; st text;
BEGIN
  SELECT COALESCE(status,'draft') INTO st FROM budget WHERE id = p_budget;
  IF st IN ('approved','locked') THEN
    RAISE EXCEPTION 'Budget % is % and cannot be edited', p_budget, st;
  END IF;

  SELECT id INTO aid FROM account WHERE code = p_account_code;
  IF aid IS NULL THEN
    RAISE EXCEPTION 'Unknown account code %', p_account_code;
  END IF;

  UPDATE budget_line SET amount = p_amount
   WHERE budget_id = p_budget AND account_id = aid AND period = p_period;

  IF NOT FOUND THEN
    INSERT INTO budget_line(budget_id, account_id, period, amount)
    VALUES (p_budget, aid, p_period, p_amount);
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION planning_budget_set(bigint, text, char, numeric) TO authenticated;

-- Consolidation groups, for the cockpit's member list.
CREATE OR REPLACE FUNCTION consol_group_list()
RETURNS TABLE(group_id bigint, group_name text, entity_id bigint, entity_name text,
              company_code text, currency text, ownership numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT g.id, g.name, e.id, e.name, e.company_code,
         COALESCE(e.functional_currency,'GBP'), COALESCE(m.ownership_pct,100)
    FROM consol_group g
    JOIN consol_group_member m ON m.group_id = g.id
    JOIN entity e ON e.id = m.entity_id
   ORDER BY g.name, e.company_code;
$$;
GRANT EXECUTE ON FUNCTION consol_group_list() TO authenticated;

-- 5) Mapping queue ----------------------------------------------------
-- Local-to-group account mapping, with the unmapped queue the cockpit gates on.
CREATE TABLE IF NOT EXISTS account_map (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id     bigint NOT NULL REFERENCES entity(id),
  local_code    text NOT NULL,
  local_name    text,
  group_code    text,                      -- null = unmapped
  effective_from date NOT NULL DEFAULT current_date,
  UNIQUE (entity_id, local_code, effective_from)
);
CREATE INDEX IF NOT EXISTS ix_account_map_entity ON account_map(entity_id);

CREATE OR REPLACE FUNCTION account_map_list(p_entity bigint)
RETURNS TABLE(id bigint, local_code text, local_name text, group_code text,
              group_name text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT m.id, m.local_code, m.local_name, m.group_code, a.name,
         CASE WHEN m.group_code IS NULL THEN 'Unmapped' ELSE 'Mapped' END
    FROM account_map m
    LEFT JOIN account a ON a.code = m.group_code
   WHERE m.entity_id = p_entity
   ORDER BY m.local_code;
$$;
GRANT EXECUTE ON FUNCTION account_map_list(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION account_map_set(p_id bigint, p_group_code text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  UPDATE account_map SET group_code = NULLIF(p_group_code,'') WHERE id = p_id;
$$;
GRANT EXECUTE ON FUNCTION account_map_set(bigint, text) TO authenticated;

-- 6) Consolidation run register ---------------------------------------
CREATE TABLE IF NOT EXISTS consol_run (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_ref        text NOT NULL,
  group_id       bigint REFERENCES consol_group(id),
  period         char(7) NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  initiated_by   text NOT NULL DEFAULT current_app_user(),
  rules_version  text,
  status         text NOT NULL DEFAULT 'running',
  member_count   integer,
  note           text,
  log            jsonb
);

CREATE OR REPLACE FUNCTION consol_run_list(p_group bigint)
RETURNS TABLE(id bigint, run_ref text, period char(7), started_at timestamptz,
              finished_at timestamptz, initiated_by text, rules_version text,
              status text, member_count integer, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, run_ref, period, started_at, finished_at, initiated_by,
         rules_version, status, member_count, note
    FROM consol_run
   WHERE p_group IS NULL OR group_id = p_group
   ORDER BY started_at DESC;
$$;
GRANT EXECUTE ON FUNCTION consol_run_list(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION consol_run_record(
  p_run_ref text, p_group bigint, p_period char(7), p_rules text,
  p_status text, p_members integer, p_note text, p_log jsonb)
RETURNS consol_run LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO consol_run(run_ref, group_id, period, finished_at, rules_version,
                         status, member_count, note, log)
  VALUES (p_run_ref, p_group, p_period, now(), p_rules, p_status, p_members, p_note, p_log)
  RETURNING *;
$$;
GRANT EXECUTE ON FUNCTION consol_run_record(text, bigint, char, text, text, integer, text, jsonb) TO authenticated;

-- 7) Table reads the functions above depend on ------------------------
GRANT SELECT ON budget, budget_line, account, entity, consol_group,
                consol_group_member, account_map, consol_run TO authenticated;
