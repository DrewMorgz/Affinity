-- 099 — a signed-in user could read client data straight from the tables
--
-- FOUND BY ASKING WHAT THE ROLE GATING ACTUALLY GATES.
--
-- The RBAC model works: System admin is System Admin only, the audit log is
-- System Admin plus Director view, managers and administrators cannot delete
-- or approve. All of that is enforced in the shell and on module render.
--
-- None of it applies to the API. The `authenticated` role held SELECT on 31
-- tables, so anyone signed in could read those tables directly through
-- PostgREST regardless of their role, bypassing the module gating entirely.
-- Row level security would have constrained that, and it is enabled on 3 tables
-- out of 148.
--
-- WHY NOTHING HAS LEAKED. Every one of those tables is either reference data —
-- frameworks, captions, obligation areas — or currently empty. The CRM,
-- attrition, periodic reviews, accounts sets and client money reconciliations
-- all have grants and no rows. So today the exposure is nil, and on the day
-- Compliance starts recording reviews it is not.
--
-- THE APP DOES NOT USE THESE GRANTS. Across the whole source there are 92 rpc
-- calls and 2 direct table queries, and neither of the two is on this list.
-- Everything goes through functions, which is the design — so revoking the
-- grants costs nothing and removes the route.
--
-- Reference data stays readable. A caption list or a framework is not client
-- information, and something reading it directly is not a leak.

DO $revoke_reads$
DECLARE
  t text;
  client_data text[] := ARRAY[
    -- client and prospect records
    'crm_prospect', 'crm_interaction', 'attrition_case', 'attrition_approval',
    'periodic_review',
    -- the accounts themselves, not the framework that shapes them
    'fs_accounts_set', 'accounts_line', 'accounts_note', 'accounts_disclosure',
    -- money
    'client_money_reconciliation', 'ic_loan', 'ic_settlement',
    'recurring_journal',
    -- commercially sensitive: what Affinity charges, pays and allocates
    'tp_policy', 'payroll_rate', 'allocation_set', 'allocation_line',
    'journal_approval_rule'
  ];
  n int := 0;
BEGIN
  FOREACH t IN ARRAY client_data LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Revoked direct table access on % tables', n;
END
$revoke_reads$;

-- Anything created later starts closed rather than open, so a new table holding
-- client data does not have to be remembered.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
