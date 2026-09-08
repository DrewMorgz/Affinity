-- =====================================================================
-- AFFINITY CORE — 066: THE READ LAYER FOR THE ACCOUNTING ENGINE
--
-- The wiring audit found 77 functions with no way to reach them. The reason
-- interfaces were never built is now clear: these areas have WRITERS but no
-- READERS. You could post a client money receipt and then have no way to see
-- it, which is worse than not being able to post at all.
--
-- This adds the list and summary functions each area needs before an
-- interface can be built on it. Read-only throughout — nothing here changes
-- data.
--
-- Priority order reflects regulatory exposure rather than effort:
--   1. Client money   — held as fiduciary; a shortfall is reportable
--   2. VAT returns    — statutory filing
--   3. Bank reconciliation — the control that finds the other two
--   4. Fixed assets, accruals, year end — accounting hygiene
--
-- Run AFTER 065. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. CLIENT MONEY
-- ─────────────────────────────────────────────────────────────────────
-- Column names below were read from the database, not assumed. A first
-- attempt guessed six of them wrong (cm_client vs cm_client_id, output_vat vs
-- output_tax, accumulated_dep vs accumulated_depreciation, and so on) and
-- failed on the first join.
--
-- The question that matters here is not "what is the balance" but "does what
-- we hold match what we owe, per client". A pooled account that balances in
-- total can still be short on an individual client, and that is the breach.
CREATE OR REPLACE FUNCTION cm_position(p_entity bigint DEFAULT NULL)
RETURNS TABLE(cm_client_id bigint, client_name text, entity_id bigint,
              account_id bigint, account_name text, ccy char(3),
              held numeric, movements bigint, last_movement date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.name, a.cm_entity_id, a.id, a.name, a.ccy,
         round(coalesce(sum(m.amount), 0), 2),
         count(m.id),
         max(m.movement_date)
    FROM cm_client c
    LEFT JOIN client_money_movement m ON m.cm_client_id = c.id
    LEFT JOIN client_money_account a  ON a.id = m.client_money_account_id
   WHERE p_entity IS NULL OR a.cm_entity_id = p_entity
   GROUP BY c.id, c.name, a.cm_entity_id, a.id, a.name, a.ccy
   ORDER BY c.name;
$$;

CREATE OR REPLACE FUNCTION cm_movements(
  p_cm_client bigint DEFAULT NULL, p_from date DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS TABLE(id bigint, movement_date date, client_name text, account_name text,
              movement_type text, description text, amount numeric, ccy char(3),
              running numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT m.id, m.movement_date, c.name, a.name, m.movement_type, m.description,
         m.amount, a.ccy,
         sum(m.amount) OVER (PARTITION BY m.cm_client_id ORDER BY m.movement_date, m.id)
    FROM client_money_movement m
    JOIN cm_client c ON c.id = m.cm_client_id
    LEFT JOIN client_money_account a ON a.id = m.client_money_account_id
   WHERE (p_cm_client IS NULL OR m.cm_client_id = p_cm_client)
     AND (p_from IS NULL OR m.movement_date >= p_from)
   ORDER BY m.movement_date DESC, m.id DESC
   LIMIT coalesce(p_limit, 200);
$$;

-- Any client in debit is a shortfall: the firm holds less than it owes that
-- client. This is the report a regulator asks for.
CREATE OR REPLACE FUNCTION cm_shortfalls(p_entity bigint DEFAULT NULL)
RETURNS TABLE(cm_client_id bigint, client_name text, held numeric, ccy char(3),
              last_movement date, days_open integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.name, round(coalesce(sum(m.amount),0),2), max(a.ccy),
         max(m.movement_date),
         (current_date - max(m.movement_date))::integer
    FROM cm_client c
    LEFT JOIN client_money_movement m ON m.cm_client_id = c.id
    LEFT JOIN client_money_account a  ON a.id = m.client_money_account_id
   WHERE p_entity IS NULL OR a.cm_entity_id = p_entity
   GROUP BY c.id, c.name
  HAVING round(coalesce(sum(m.amount),0),2) < 0
   ORDER BY 3;
$$;

CREATE OR REPLACE FUNCTION cm_breaches(p_open_only boolean DEFAULT true)
RETURNS TABLE(id bigint, breach_date date, cm_client_id bigint, client_name text,
              breach_type text, amount numeric, description text, status text,
              days_open integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, b.breach_date, b.cm_client_id, c.name, b.breach_type, b.amount,
         b.description, b.status,
         (current_date - b.breach_date)::integer
    FROM client_money_breach b
    LEFT JOIN cm_client c ON c.id = b.cm_client_id
   WHERE NOT p_open_only OR coalesce(b.status,'Open') <> 'Remediated'
   ORDER BY b.breach_date DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. VAT RETURNS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION vat_returns_list(
  p_entity bigint DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text,
              period_start date, period_end date,
              output_vat numeric, input_vat numeric, net_vat numeric,
              status text, journal_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT v.id, v.entity_id, e.name, v.period_start, v.period_end,
         v.output_vat, v.input_vat, v.net_vat, v.status, v.journal_id
    FROM vat_return v LEFT JOIN entity e ON e.id = v.entity_id
   WHERE (p_entity IS NULL OR v.entity_id = p_entity)
     AND (p_status IS NULL OR v.status = p_status)
   ORDER BY v.period_end DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. BANK RECONCILIATION
-- ─────────────────────────────────────────────────────────────────────
-- The useful figure is the UNMATCHED count: matched items need no attention,
-- unmatched ones are the work.
CREATE OR REPLACE FUNCTION bank_statements_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, bank_account_id bigint,
              statement_date date, ccy char(3), opening_balance numeric,
              closing_balance numeric, lines bigint, matched bigint, unmatched bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.entity_id, e.name, s.bank_account_id, s.statement_date, s.ccy,
         s.opening_balance, s.closing_balance,
         count(l.id),
         count(l.id) FILTER (WHERE l.matched_journal_line_id IS NOT NULL),
         count(l.id) FILTER (WHERE l.matched_journal_line_id IS NULL)
    FROM bank_statement s
    LEFT JOIN entity e ON e.id = s.entity_id
    LEFT JOIN bank_statement_line l ON l.statement_id = s.id
   WHERE p_entity IS NULL OR s.entity_id = p_entity
   GROUP BY s.id, s.entity_id, e.name, s.bank_account_id, s.statement_date, s.ccy,
            s.opening_balance, s.closing_balance
   ORDER BY s.statement_date DESC;
$$;

CREATE OR REPLACE FUNCTION bank_unmatched(p_statement bigint)
RETURNS TABLE(id bigint, value_date date, description text, amount numeric,
              status text, suggested_journal_line bigint, suggestion_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.id, l.value_date, l.description, l.amount, l.status,
         -- A SUGGESTION, not a match: same amount, within three days. The
         -- person decides; this only saves them searching.
         (SELECT jl.id FROM journal_line jl
            JOIN journal j ON j.id = jl.journal_id
           WHERE round(jl.func_amount,2) = round(l.amount,2)
             AND abs(j.journal_date - l.value_date) <= 3
           LIMIT 1),
         'same amount, within three days'::text
    FROM bank_statement_line l
   WHERE l.statement_id = p_statement AND l.matched_journal_line_id IS NULL
   ORDER BY l.value_date, l.id;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. FIXED ASSETS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fixed_assets_list(
  p_entity bigint DEFAULT NULL, p_include_disposed boolean DEFAULT false)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, description text,
              category text, cost numeric, residual_value numeric,
              acquisition_date date, useful_life_months integer, method text,
              accumulated_dep numeric, net_book_value numeric,
              months_remaining integer, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id, a.entity_id, e.name, a.description, a.category, a.cost,
         a.residual_value, a.acquisition_date, a.useful_life_months, a.method,
         round(coalesce(a.accumulated_dep,0),2),
         round(a.cost - coalesce(a.accumulated_dep,0),2),
         GREATEST(0, coalesce(a.useful_life_months,0) -
             (EXTRACT(YEAR FROM age(current_date, coalesce(a.in_service_date, a.acquisition_date)))*12 +
              EXTRACT(MONTH FROM age(current_date, coalesce(a.in_service_date, a.acquisition_date))))::integer),
         a.status
    FROM fixed_asset a LEFT JOIN entity e ON e.id = a.entity_id
   WHERE (p_entity IS NULL OR a.entity_id = p_entity)
     AND (p_include_disposed OR coalesce(a.status,'') <> 'disposed')
   ORDER BY a.acquisition_date DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. ACCRUALS, PREPAYMENTS AND DEFERRED INCOME
-- ─────────────────────────────────────────────────────────────────────
-- What matters is what is still to release, and whether anything has stalled —
-- a schedule that stopped releasing is a misstatement nobody notices until
-- the audit.
CREATE OR REPLACE FUNCTION deferrals_list(
  p_entity bigint DEFAULT NULL, p_kind text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, kind text,
              description text, ccy char(3), total_amount numeric,
              per_period numeric, periods_total integer, periods_posted integer,
              released numeric, remaining numeric, next_post_date date,
              status text, stalled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id, d.entity_id, e.name, d.kind, d.description, d.ccy, d.total_amount,
         d.per_period, d.periods_total, coalesce(d.periods_posted,0),
         round(d.per_period * coalesce(d.periods_posted,0), 2),
         round(d.total_amount - d.per_period * coalesce(d.periods_posted,0), 2),
         d.next_post_date, d.status,
         -- Stalled: periods still to run, but the next posting date is more
         -- than two months past. This catches a forgotten schedule.
         (coalesce(d.periods_posted,0) < d.periods_total
          AND d.next_post_date IS NOT NULL
          AND d.next_post_date < current_date - interval '2 months')
    FROM deferral_schedule d LEFT JOIN entity e ON e.id = d.entity_id
   WHERE (p_entity IS NULL OR d.entity_id = p_entity)
     AND (p_kind IS NULL OR d.kind = p_kind)
   ORDER BY d.next_post_date NULLS LAST;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- A SINGLE OVERVIEW
-- ─────────────────────────────────────────────────────────────────────
-- What needs attention across all of the above, so the module opens on the
-- work rather than on a menu.
CREATE OR REPLACE FUNCTION acc_ops_overview(p_entity bigint DEFAULT NULL)
RETURNS TABLE(area text, headline text, count_value bigint,
              amount_value numeric, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  SELECT 'Client money'::text, 'clients in shortfall'::text,
         count(*)::bigint, round(coalesce(sum(s.held),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM cm_shortfalls(p_entity) s;

  RETURN QUERY
  SELECT 'Client money'::text, 'breaches not remediated'::text,
         count(*)::bigint, round(coalesce(sum(b.amount),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM cm_breaches(true) b;

  RETURN QUERY
  SELECT 'VAT'::text, 'returns not yet posted'::text,
         count(*)::bigint, round(coalesce(sum(v.net_vat),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM vat_returns_list(p_entity, NULL) v
   WHERE coalesce(v.status,'') NOT IN ('posted','submitted');

  RETURN QUERY
  SELECT 'Bank reconciliation'::text, 'unmatched statement lines'::text,
         coalesce(sum(b.unmatched),0)::bigint, NULL::numeric,
         CASE WHEN coalesce(sum(b.unmatched),0) > 0 THEN 'attention' ELSE 'ok' END
    FROM bank_statements_list(p_entity) b;

  RETURN QUERY
  SELECT 'Accruals and prepayments'::text, 'schedules that have stalled'::text,
         count(*)::bigint, round(coalesce(sum(d.remaining),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM deferrals_list(p_entity, NULL) d
   WHERE d.stalled;

  RETURN QUERY
  SELECT 'Fixed assets'::text, 'assets in use'::text,
         count(*)::bigint, round(coalesce(sum(a.net_book_value),0),2), 'ok'::text
    FROM fixed_assets_list(p_entity, false) a;
END $$;

-- ── Grants: authenticated only ───────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('cm_position','cm_movements','cm_shortfalls','cm_breaches',
                         'vat_returns_list','bank_statements_list','bank_unmatched',
                         'fixed_assets_list','deferrals_list','acc_ops_overview')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS read_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('cm_position','cm_movements','cm_shortfalls','cm_breaches',
                     'vat_returns_list','bank_statements_list','bank_unmatched',
                     'fixed_assets_list','deferrals_list','acc_ops_overview')
 ORDER BY p.proname;
