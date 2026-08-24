-- =====================================================================
-- AFFINITY CORE — LOCK DOWN FUNCTION ACCESS
--
-- WHY THIS IS NEEDED
-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default. In
-- Supabase the `anon` role — the key embedded in the public JavaScript bundle
-- — inherits that. So granting EXECUTE to `authenticated` restricts nothing:
-- the function was already callable by anyone who viewed source.
--
-- This was demonstrated, not assumed: using only the publishable key taken
-- from the deployed bundle, it was possible to call consol_run_record and
-- write rows into consol_run, then read them back with consol_run_list.
--
-- This file revokes the default PUBLIC grant on the financial functions and
-- re-grants them to `authenticated` only, so a signed-in session is required.
--
-- Run AFTER 052_planning_grants.sql. Safe to re-run.
-- =====================================================================

-- 1) Remove the probe rows written while demonstrating the exposure ----
DELETE FROM consol_run WHERE run_ref IN ('PROBE-DELETE-ME', 'x');

-- 2) Revoke the default PUBLIC execute, then grant deliberately --------
DO $lock$
DECLARE
  r record;
  fns text[] := ARRAY[
    -- planning and consolidation interface (052)
    'planning_budget_list','planning_budget_grid','planning_budget_set',
    'consol_group_list','account_map_list','account_map_set',
    'consol_run_list','consol_run_record',
    -- engine reporting: these expose the group's financial position
    'report_budget_summary','report_budget_vs_actual','compare_budget_scenarios',
    'consolidated_summary','consolidated_trial_balance',
    'submit_budget','approve_budget','build_rolling_forecast','rolling_forecast_summary'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (fns)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $lock$;

-- 3) Stop the same thing happening to functions added later ------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 4) Tables: no direct table access for anon --------------------------
-- The functions above are SECURITY DEFINER, so they still work. This only
-- stops the REST API exposing the tables themselves.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- =====================================================================
-- VERIFY — this should return zero rows. Anything listed is still open
-- to the public key.
--
--   SELECT p.proname
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND has_function_privilege('anon', p.oid, 'EXECUTE')
--      AND p.proname IN ('planning_budget_set','consol_run_record',
--                        'consolidated_trial_balance','approve_budget');
-- =====================================================================
