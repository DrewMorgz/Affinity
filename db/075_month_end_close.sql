-- =====================================================================
-- AFFINITY CORE — 075: MONTH-END CLOSE, AND A CONTROL ON CLIENT MONEY SIGN-OFF
--
-- The month-end routines all existed and none was reachable: recurring
-- journals, deferral releases, FX revaluation, depreciation, and the client
-- money reconciliation.
--
-- ── THE CONTROL GAP ────────────────────────────────────────────────
--
-- sign_off_reconciliation correctly refuses to sign off a client money
-- reconciliation with an unremedied shortfall. It does NOT stop the person who
-- prepared the reconciliation from signing it off themselves.
--
-- That is the same gap I found on payment runs and expense claims, and it sits
-- on the regulated three-way reconciliation — bank against book against the
-- sum of client ledgers. A reconciliation prepared and signed by one person is
-- the control a regulator asks to see evidence of, and self-signature is
-- exactly what the evidence is meant to rule out.
--
-- Fixed by wrapping rather than editing the engine's function, as with
-- pay_run_approve.
--
-- Run AFTER 074. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- SEGREGATION ON CLIENT MONEY SIGN-OFF
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cm_recon_sign_off(p_recon_id bigint)
RETURNS client_money_reconciliation
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r client_money_reconciliation; me text;
BEGIN
  me := current_app_user();
  SELECT * INTO r FROM client_money_reconciliation WHERE id = p_recon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation % not found', p_recon_id; END IF;

  IF r.created_by IS NOT NULL AND lower(r.created_by) = lower(me) THEN
    RAISE EXCEPTION 'You prepared this reconciliation — it must be signed off by someone else';
  END IF;

  -- The engine's own function refuses an unremedied shortfall, which is the
  -- other half of the control and is left where it is.
  PERFORM sign_off_reconciliation(p_recon_id, me);
  SELECT * INTO r FROM client_money_reconciliation WHERE id = p_recon_id;

  PERFORM ea_audit(NULL, 'client_money_reconciliation', p_recon_id,
                   'CLIENT MONEY RECONCILIATION SIGNED OFF',
                   'as at ' || r.recon_date || ', prepared by ' ||
                   coalesce(r.created_by,'unknown') || ', signed off by ' || me);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- CLIENT MONEY RECONCILIATION HISTORY
-- ─────────────────────────────────────────────────────────────────────
-- The three differences are shown separately because they mean different
-- things: an internal difference is book against client ledgers (our own
-- records disagreeing), an external difference is book against bank (our
-- records against the bank's), and a shortfall is holding less than we owe.
-- A single "difference" figure would merge three distinct problems.
CREATE OR REPLACE FUNCTION cm_recons_list(
  p_account bigint DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE(id bigint, account_id bigint, account_name text, recon_date date,
              bank_balance numeric, book_balance numeric, client_ledger_total numeric,
              internal_diff numeric, external_diff numeric,
              shortfall numeric, excess numeric,
              status text, created_by text, signed_off_by text,
              self_signed boolean, days_since integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id, r.client_money_account_id, a.name, r.recon_date,
         r.bank_balance, r.book_balance, r.client_ledger_total,
         r.internal_diff, r.external_diff, r.shortfall, r.excess,
         r.status, r.created_by, r.signed_off_by,
         -- Flagged rather than hidden: anything signed off by its preparer
         -- predates the control above and needs reviewing.
         (r.signed_off_by IS NOT NULL AND r.created_by IS NOT NULL
          AND lower(r.signed_off_by) = lower(r.created_by)),
         (current_date - r.recon_date)::integer
    FROM client_money_reconciliation r
    LEFT JOIN client_money_account a ON a.id = r.client_money_account_id
   WHERE p_account IS NULL OR r.client_money_account_id = p_account
   ORDER BY r.recon_date DESC
   LIMIT coalesce(p_limit, 50);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- WHAT IS DUE AT MONTH END
-- ─────────────────────────────────────────────────────────────────────
-- A checklist rather than a dashboard. Each row is something that either has
-- been done for the period or has not, because that is the question at month
-- end — not how much of it there is.
CREATE OR REPLACE FUNCTION month_end_checklist(p_entity bigint, p_period char(7))
RETURNS TABLE(step text, detail text, due_count bigint, done boolean, blocking boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE period_start date; period_end date; n int; open_status text;
BEGIN
  period_start := to_date(p_period || '-01', 'YYYY-MM-DD');
  period_end   := (period_start + interval '1 month - 1 day')::date;

  -- 1. The period has to be open to post into.
  SELECT status INTO open_status FROM accounting_period
   WHERE entity_id = p_entity AND period = p_period;
  RETURN QUERY SELECT 'Period open'::text,
    coalesce('period is ' || open_status, 'no accounting period record exists for ' || p_period),
    0::bigint, (coalesce(open_status,'') = 'open'), true;

  -- 2. FX rates for the period end. Without them a revaluation cannot run and
  --    any foreign currency balance is stated at a stale rate.
  SELECT count(*) INTO n FROM fx_rate WHERE rate_date = period_end;
  RETURN QUERY SELECT 'FX rates loaded'::text,
    CASE WHEN n > 0 THEN n || ' rate(s) at ' || period_end
         ELSE 'no rates at ' || period_end || ' — a revaluation cannot run and foreign currency balances would be stated at a stale rate' END,
    n::bigint, (n > 0), true;

  -- 3. Draft journals. Closing with drafts outstanding leaves the period
  --    incomplete and they cannot be posted once it is locked.
  SELECT count(*) INTO n FROM journal
   WHERE entity_id = p_entity AND journal_date BETWEEN period_start AND period_end
     AND coalesce(status,'') = 'draft';
  RETURN QUERY SELECT 'No draft journals'::text,
    CASE WHEN n = 0 THEN 'none outstanding'
         ELSE n || ' draft journal(s) in the period — these cannot be posted once it is locked' END,
    n::bigint, (n = 0), true;

  -- 4. Recurring journals due.
  SELECT count(*) INTO n FROM recurring_journal
   WHERE entity_id = p_entity AND coalesce(is_active, true)
     AND next_date <= period_end;
  RETURN QUERY SELECT 'Recurring journals posted'::text,
    CASE WHEN n = 0 THEN 'none due' ELSE n || ' due up to ' || period_end END,
    n::bigint, (n = 0), false;

  -- 5. Deferral schedules due for release.
  SELECT count(*) INTO n FROM deferral_schedule
   WHERE entity_id = p_entity AND coalesce(status,'') <> 'complete'
     AND next_post_date IS NOT NULL AND next_post_date <= period_end;
  RETURN QUERY SELECT 'Deferrals released'::text,
    CASE WHEN n = 0 THEN 'none due'
         ELSE n || ' schedule(s) due — an unreleased accrual is a misstatement' END,
    n::bigint, (n = 0), false;

  -- 6. Depreciation.
  SELECT count(*) INTO n FROM fixed_asset
   WHERE entity_id = p_entity AND coalesce(status,'') NOT IN ('disposed','fully_depreciated')
     AND coalesce(accumulated_dep,0) < cost;
  RETURN QUERY SELECT 'Depreciation run'::text,
    CASE WHEN n = 0 THEN 'no assets to depreciate'
         ELSE n || ' asset(s) still depreciating' END,
    n::bigint, (n = 0), false;

  -- 7. Client money reconciliation, where the entity holds client money. This
  --    one is blocking: it is a regulatory requirement, not housekeeping.
  IF EXISTS (SELECT 1 FROM client_money_account WHERE cm_entity_id = p_entity) THEN
    SELECT count(*) INTO n
      FROM client_money_account a
     WHERE a.cm_entity_id = p_entity
       AND NOT EXISTS (
         SELECT 1 FROM client_money_reconciliation r
          WHERE r.client_money_account_id = a.id
            AND r.recon_date BETWEEN period_start AND period_end
            AND r.status = 'signed_off');
    RETURN QUERY SELECT 'Client money reconciled and signed off'::text,
      CASE WHEN n = 0 THEN 'all accounts reconciled and signed off'
           ELSE n || ' client money account(s) with no signed-off reconciliation for the period' END,
      n::bigint, (n = 0), true;
  END IF;

  -- 8. Intercompany elimination.
  RETURN QUERY
  SELECT 'Intercompany eliminates to nil'::text,
         CASE WHEN (SELECT b.ic_balance FROM ic_balances(period_end) b WHERE b.is_group_total) = 0
              THEN 'group total is nil'
              ELSE 'group total is ' ||
                   (SELECT b.ic_balance FROM ic_balances(period_end) b WHERE b.is_group_total) ||
                   ' — something is posted on one side only' END,
         0::bigint,
         ((SELECT b.ic_balance FROM ic_balances(period_end) b WHERE b.is_group_total) = 0),
         false;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('cm_recon_sign_off','cm_recons_list','month_end_checklist')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

GRANT SELECT ON client_money_reconciliation, recurring_journal, fx_rate TO authenticated;

SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('cm_recon_sign_off','cm_recons_list','month_end_checklist')
 ORDER BY p.proname;
