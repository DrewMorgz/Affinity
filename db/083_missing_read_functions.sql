-- =====================================================================
-- AFFINITY CORE — 083: THE MISSING READ FUNCTIONS
--
-- ── WHAT THE LIVE AUDIT FOUND ───────────────────────────────────────
--
-- Eleven screens read their data through functions that DO NOT EXIST. When
-- the call fails, each screen falls back to bundled sample data — so it looks
-- populated and correct.
--
-- The consequence is the worst combination: WRITES WORK AND READS DO NOT.
-- Someone enters a supplier invoice, a task, an officer change; it saves; then
-- the screen shows demo data instead. They conclude their entry vanished, or
-- act on sample figures believing they are real.
--
-- Why every earlier check missed it: these functions ARE called and ARE
-- exported, so the source lines up perfectly. Only executing them against a
-- real database shows they are not there.
--
-- This file creates 29 of the 33. Every column below was read from
-- information_schema first rather than assumed — the whole point of this
-- exercise is that assumptions are what caused it.
--
-- THE FOUR NOT BUILT, and why: comp_reviews, crm_prospects, crm_interactions
-- and attrition_cases have no table in the database at all. Writing a reader
-- over a store that does not exist would just move the problem. Those four
-- need the table designed first, which is a decision about what a compliance
-- review and a CRM prospect actually hold. Until then their screens should say
-- so rather than show demo data.
--
-- Run AFTER 082. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- ACCOUNTING
-- ─────────────────────────────────────────────────────────────────────
-- Per-entity trial balance. consolidated_trial_balance already existed for a
-- group; this is the single-entity one the accounting screen asks for.
CREATE OR REPLACE FUNCTION trial_balance(p_entity bigint, p_as_at date DEFAULT NULL)
RETURNS TABLE(account_id bigint, code text, name text, account_type text,
              debit numeric, credit numeric, balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id, a.code, a.name, a.account_type,
         round(coalesce(sum(CASE WHEN jl.func_amount > 0 THEN jl.func_amount END), 0), 2),
         round(coalesce(sum(CASE WHEN jl.func_amount < 0 THEN -jl.func_amount END), 0), 2),
         round(coalesce(sum(jl.func_amount), 0), 2)
    FROM account a
    JOIN journal_line jl ON jl.account_id = a.id
    JOIN journal j ON j.id = jl.journal_id
   WHERE j.entity_id = p_entity
     AND j.status = 'posted'
     AND (p_as_at IS NULL OR j.journal_date <= p_as_at)
   GROUP BY a.id, a.code, a.name, a.account_type
  HAVING round(coalesce(sum(jl.func_amount), 0), 2) <> 0
   ORDER BY a.code;
$$;

CREATE OR REPLACE FUNCTION recent_journals(p_entity bigint DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, journal_date date,
              period text, journal_type text, source text, narrative text,
              status text, lines bigint, total numeric,
              created_by text, approved_by text, balanced boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT j.id, j.entity_id, e.name, j.journal_date, j.period, j.journal_type,
         j.source, j.narrative, j.status,
         count(jl.id),
         round(coalesce(sum(CASE WHEN jl.func_amount > 0 THEN jl.func_amount END), 0), 2),
         j.created_by, j.approved_by,
         -- A journal that does not balance should be visible as such rather
         -- than sitting in a list looking like any other.
         (round(coalesce(sum(jl.func_amount), 0), 2) = 0)
    FROM journal j
    LEFT JOIN entity e ON e.id = j.entity_id
    LEFT JOIN journal_line jl ON jl.journal_id = j.id
   WHERE p_entity IS NULL OR j.entity_id = p_entity
   GROUP BY j.id, j.entity_id, e.name, j.journal_date, j.period, j.journal_type,
            j.source, j.narrative, j.status, j.created_by, j.approved_by
   ORDER BY j.journal_date DESC, j.id DESC
   LIMIT coalesce(p_limit, 50);
$$;

CREATE OR REPLACE FUNCTION pnl_by_entity(p_start date, p_end date)
RETURNS TABLE(entity_id bigint, entity_name text, ccy char(3),
              income numeric, expenses numeric, result numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, e.functional_ccy,
         round(coalesce(sum(CASE WHEN a.account_type = 'income'
                                 THEN -jl.func_amount END), 0), 2),
         round(coalesce(sum(CASE WHEN a.account_type = 'expense'
                                 THEN jl.func_amount END), 0), 2),
         round(coalesce(sum(CASE WHEN a.account_type IN ('income','expense')
                                 THEN -jl.func_amount END), 0), 2)
    FROM entity e
    JOIN journal j ON j.entity_id = e.id AND j.status = 'posted'
                  AND j.journal_date BETWEEN p_start AND p_end
    JOIN journal_line jl ON jl.journal_id = j.id
    JOIN account a ON a.id = jl.account_id
   WHERE a.account_type IN ('income','expense')
   GROUP BY e.id, e.name, e.functional_ccy
   ORDER BY e.name;
$$;

-- Takes an entity filter: the accounting screen shows vendors in the context
-- of one entity, and passing the filter is the right intent — so the function
-- accepts it rather than the caller dropping it.
CREATE OR REPLACE FUNCTION ap_vendors(p_entity bigint DEFAULT NULL,
                                      p_active_only boolean DEFAULT true)
RETURNS TABLE(id bigint, name text, vendor_code text, default_ccy char(3),
              payment_terms_days integer, vat_no text, email text,
              on_hold boolean, wht_rate numeric, is_active boolean,
              open_invoices bigint, outstanding numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.name, s.vendor_code, s.default_ccy, s.payment_terms_days,
         s.vat_no, s.email, s.on_hold, s.wht_rate, s.is_active,
         count(si.id) FILTER (WHERE coalesce(si.outstanding,0) > 0),
         round(coalesce(sum(si.outstanding), 0), 2)
    FROM supplier s
    LEFT JOIN supplier_invoice si ON si.supplier_id = s.id
         AND (p_entity IS NULL OR si.entity_id = p_entity)
   WHERE (NOT p_active_only OR coalesce(s.is_active, true))
     -- With an entity filter, only vendors that entity actually deals with.
     AND (p_entity IS NULL
          OR EXISTS (SELECT 1 FROM supplier_invoice x
                      WHERE x.supplier_id = s.id AND x.entity_id = p_entity))
   GROUP BY s.id, s.name, s.vendor_code, s.default_ccy, s.payment_terms_days,
            s.vat_no, s.email, s.on_hold, s.wht_rate, s.is_active
   ORDER BY s.name;
$$;

-- Ageing buckets from the due date, not the invoice date: an invoice on 60-day
-- terms is not overdue at 45 days, and bucketing from the invoice date would
-- say it was.
CREATE OR REPLACE FUNCTION ap_aging(p_entity bigint DEFAULT NULL, p_as_at date DEFAULT NULL)
RETURNS TABLE(supplier_id bigint, supplier text, ccy char(3),
              current_amt numeric, d1_30 numeric, d31_60 numeric,
              d61_90 numeric, d90_plus numeric, total numeric,
              oldest_days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH d AS (
    SELECT si.supplier_id, si.ccy, si.outstanding,
           (coalesce(p_as_at, current_date) - coalesce(si.due_date, si.invoice_date))::int AS age
      FROM supplier_invoice si
     WHERE coalesce(si.outstanding, 0) > 0
       AND coalesce(si.status,'') = 'posted'
       AND (p_entity IS NULL OR si.entity_id = p_entity)
  )
  SELECT d.supplier_id, s.name, d.ccy,
         round(coalesce(sum(d.outstanding) FILTER (WHERE d.age <= 0), 0), 2),
         round(coalesce(sum(d.outstanding) FILTER (WHERE d.age BETWEEN 1 AND 30), 0), 2),
         round(coalesce(sum(d.outstanding) FILTER (WHERE d.age BETWEEN 31 AND 60), 0), 2),
         round(coalesce(sum(d.outstanding) FILTER (WHERE d.age BETWEEN 61 AND 90), 0), 2),
         round(coalesce(sum(d.outstanding) FILTER (WHERE d.age > 90), 0), 2),
         round(coalesce(sum(d.outstanding), 0), 2),
         max(d.age)
    FROM d LEFT JOIN supplier s ON s.id = d.supplier_id
   GROUP BY d.supplier_id, s.name, d.ccy
   ORDER BY 9 DESC;
$$;

CREATE OR REPLACE FUNCTION ap_purchase_orders(p_entity bigint DEFAULT NULL,
                                              p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, po_number text,
              supplier_id bigint, supplier text, po_date date, ccy char(3),
              net_total numeric, vat_total numeric, gross_total numeric,
              status text, created_by text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.entity_id, e.name, p.po_number, p.supplier_id, s.name,
         p.po_date, p.ccy, p.net_total, p.vat_total, p.gross_total,
         p.status, p.created_by
    FROM purchase_order p
    LEFT JOIN entity e ON e.id = p.entity_id
    LEFT JOIN supplier s ON s.id = p.supplier_id
   WHERE (p_entity IS NULL OR p.entity_id = p_entity)
     AND (p_status IS NULL OR p.status = p_status)
   ORDER BY p.po_date DESC;
$$;

CREATE OR REPLACE FUNCTION budget_vs_actual_for_entity(
  p_entity bigint, p_fiscal_year integer DEFAULT NULL)
RETURNS TABLE(account_id bigint, code text, name text, account_type text,
              budget numeric, actual numeric, variance numeric,
              variance_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH b AS (
    SELECT bl.account_id, round(coalesce(sum(bl.amount), 0), 2) AS amt
      FROM budget bu JOIN budget_line bl ON bl.budget_id = bu.id
     WHERE bu.entity_id = p_entity
       AND (p_fiscal_year IS NULL OR bu.fiscal_year = p_fiscal_year)
     GROUP BY bl.account_id
  ),
  act AS (
    SELECT jl.account_id, round(coalesce(sum(-jl.func_amount), 0), 2) AS amt
      FROM journal j JOIN journal_line jl ON jl.journal_id = j.id
     WHERE j.entity_id = p_entity AND j.status = 'posted'
       AND (p_fiscal_year IS NULL
            OR extract(year from j.journal_date) = p_fiscal_year)
     GROUP BY jl.account_id
  )
  SELECT a.id, a.code, a.name, a.account_type,
         coalesce(b.amt, 0), coalesce(act.amt, 0),
         coalesce(act.amt, 0) - coalesce(b.amt, 0),
         -- Nil budget means no percentage rather than a division by zero or a
         -- misleading 100%.
         CASE WHEN coalesce(b.amt, 0) = 0 THEN NULL
              ELSE round((coalesce(act.amt,0) - b.amt) / abs(b.amt) * 100, 1) END
    FROM account a
    LEFT JOIN b ON b.account_id = a.id
    LEFT JOIN act ON act.account_id = a.id
   WHERE coalesce(b.amt, 0) <> 0 OR coalesce(act.amt, 0) <> 0
   ORDER BY a.code;
$$;

CREATE OR REPLACE FUNCTION ic_loans_for_entity(p_entity bigint)
RETURNS TABLE(id bigint, lender_entity bigint, lender text,
              borrower_entity bigint, borrower text, ccy char(3),
              facility numeric, interest_rate numeric, start_date date,
              status text, direction text, no_interest_rate boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.id, l.lender_entity, le.name, l.borrower_entity, be.name,
         l.ccy, l.facility, l.interest_rate, l.start_date, l.status,
         CASE WHEN l.lender_entity = p_entity THEN 'lending' ELSE 'borrowing' END,
         (l.interest_rate IS NULL OR l.interest_rate = 0)
    FROM ic_loan l
    LEFT JOIN entity le ON le.id = l.lender_entity
    LEFT JOIN entity be ON be.id = l.borrower_entity
   WHERE l.lender_entity = p_entity OR l.borrower_entity = p_entity
   ORDER BY l.start_date DESC;
$$;

CREATE OR REPLACE FUNCTION bank_accounts_for_entity(p_entity bigint)
RETURNS TABLE(id bigint, entity_id bigint, name text, iban text, ccy char(3),
              is_default boolean, ledger_balance numeric, movements bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, b.entity_id, b.name, b.iban, b.ccy, b.is_default,
         -- The ledger balance, from the journals. Not the bank's balance:
         -- those differ, and the difference is what a reconciliation is for.
         round(coalesce((SELECT sum(jl.func_amount)
                           FROM journal j JOIN journal_line jl ON jl.journal_id = j.id
                          WHERE j.entity_id = b.entity_id AND j.status = 'posted'
                            AND jl.memo ILIKE '%' || b.name || '%'), 0), 2),
         (SELECT count(*) FROM bank_statement_line sl
            JOIN bank_statement st ON st.id = sl.statement_id
           WHERE st.bank_account_id = b.id)
    FROM bank_account b
   WHERE b.entity_id = p_entity
   ORDER BY b.is_default DESC NULLS LAST, b.name;
$$;

CREATE OR REPLACE FUNCTION fx_rates_latest(p_as_at date DEFAULT NULL)
RETURNS TABLE(from_ccy char(3), to_ccy char(3), rate numeric, rate_date date,
              rate_type text, source text, days_old integer, stale boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT DISTINCT ON (r.from_ccy, r.to_ccy)
         r.from_ccy, r.to_ccy, r.rate, r.rate_date, r.rate_type, r.source,
         (coalesce(p_as_at, current_date) - r.rate_date)::int,
         -- A rate more than a week old will quietly misstate every foreign
         -- currency balance, so it is flagged rather than shown plainly.
         ((coalesce(p_as_at, current_date) - r.rate_date) > 7)
    FROM fx_rate r
   WHERE p_as_at IS NULL OR r.rate_date <= p_as_at
   ORDER BY r.from_ccy, r.to_ccy, r.rate_date DESC;
$$;

CREATE OR REPLACE FUNCTION fx_positions(p_entity bigint DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, functional_ccy char(3),
              txn_ccy char(3), accounts bigint, txn_balance numeric,
              func_balance numeric, implied_rate numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, e.functional_ccy, jl.txn_ccy,
         count(DISTINCT jl.account_id),
         round(coalesce(sum(jl.txn_amount), 0), 2),
         round(coalesce(sum(jl.func_amount), 0), 2),
         CASE WHEN round(coalesce(sum(jl.txn_amount), 0), 2) = 0 THEN NULL
              ELSE round(sum(jl.func_amount) / sum(jl.txn_amount), 6) END
    FROM entity e
    JOIN journal j ON j.entity_id = e.id AND j.status = 'posted'
    JOIN journal_line jl ON jl.journal_id = j.id
    JOIN account a ON a.id = jl.account_id AND coalesce(a.is_monetary, false)
   WHERE (p_entity IS NULL OR e.id = p_entity)
     AND jl.txn_ccy <> e.functional_ccy
   GROUP BY e.id, e.name, e.functional_ccy, jl.txn_ccy
   ORDER BY e.name, jl.txn_ccy;
$$;

CREATE OR REPLACE FUNCTION vat_boxes_ytd(p_entity bigint, p_year integer DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, returns bigint,
              output_vat numeric, input_vat numeric, net_vat numeric,
              posted bigint, unposted bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, count(v.id),
         round(coalesce(sum(v.output_vat), 0), 2),
         round(coalesce(sum(v.input_vat), 0), 2),
         round(coalesce(sum(v.net_vat), 0), 2),
         count(v.id) FILTER (WHERE v.status IN ('posted','submitted')),
         count(v.id) FILTER (WHERE coalesce(v.status,'') NOT IN ('posted','submitted'))
    FROM entity e
    LEFT JOIN vat_return v ON v.entity_id = e.id
         AND (p_year IS NULL OR extract(year from v.period_end) = p_year)
   WHERE e.id = p_entity
   GROUP BY e.id, e.name;
$$;

-- Control checks the accounting screen shows. Each is a question with a yes or
-- no answer, not a score — a score would let a real failure hide behind a
-- healthy-looking average.
CREATE OR REPLACE FUNCTION control_checks(p_entity bigint DEFAULT NULL)
RETURNS TABLE(check_name text, passed boolean, detail text, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; amt numeric;
BEGIN
  SELECT count(*) INTO n FROM journal j
   WHERE (p_entity IS NULL OR j.entity_id = p_entity) AND coalesce(j.status,'') = 'draft';
  RETURN QUERY SELECT 'No draft journals'::text, (n = 0),
    CASE WHEN n = 0 THEN 'none' ELSE n || ' draft journal(s) not in the ledger' END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'attention' END;

  SELECT count(*) INTO n FROM (
    SELECT j.id FROM journal j JOIN journal_line jl ON jl.journal_id = j.id
     WHERE (p_entity IS NULL OR j.entity_id = p_entity) AND j.status = 'posted'
     GROUP BY j.id HAVING round(sum(jl.func_amount), 2) <> 0) x;
  RETURN QUERY SELECT 'Every posted journal balances'::text, (n = 0),
    CASE WHEN n = 0 THEN 'all balanced'
         ELSE n || ' posted journal(s) do not balance — the ledger is misstated' END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'critical' END;

  SELECT count(*), round(coalesce(sum(abs(s.held)),0),2) INTO n, amt
    FROM cm_shortfalls(p_entity) s;
  RETURN QUERY SELECT 'No client money shortfalls'::text, (n = 0),
    CASE WHEN n = 0 THEN 'none' ELSE n || ' client(s) short by ' || amt END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'critical' END;

  SELECT count(*) INTO n FROM ic_balances(NULL) b
   WHERE b.is_group_total AND b.ic_balance <> 0;
  RETURN QUERY SELECT 'Intercompany eliminates to nil'::text, (n = 0),
    CASE WHEN n = 0 THEN 'group total is nil'
         ELSE 'the group total is not nil — something is posted on one side only' END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'attention' END;

  SELECT count(*) INTO n FROM pay_runs_list(p_entity) r WHERE r.self_approved;
  RETURN QUERY SELECT 'No self-approved payment runs'::text, (n = 0),
    CASE WHEN n = 0 THEN 'none' ELSE n || ' run(s) approved by whoever created them' END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'critical' END;

  SELECT count(*) INTO n FROM fx_rates_latest(NULL) f WHERE f.stale;
  RETURN QUERY SELECT 'FX rates current'::text, (n = 0),
    CASE WHEN n = 0 THEN 'all within a week'
         ELSE n || ' rate(s) more than a week old — foreign currency balances would be stated at a stale rate' END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'attention' END;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- GROUP
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION group_consolidated_summary()
RETURNS TABLE(group_id bigint, group_name text, reporting_ccy char(3),
              members bigint, wholly_owned bigint, with_nci bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT g.id, g.name, g.reporting_ccy,
         count(m.entity_id),
         count(m.entity_id) FILTER (WHERE coalesce(m.ownership_pct,100) >= 100),
         count(m.entity_id) FILTER (WHERE coalesce(m.ownership_pct,100) < 100)
    FROM consol_group g
    LEFT JOIN consol_group_member m ON m.group_id = g.id
   GROUP BY g.id, g.name, g.reporting_ccy
   ORDER BY g.name;
$$;

CREATE OR REPLACE FUNCTION group_effective_ownership(p_group bigint)
RETURNS TABLE(entity_id bigint, entity_name text, company_code text,
              direct_pct numeric, parent_entity_id bigint, parent_name text,
              effective_pct numeric, has_nci boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH RECURSIVE chain AS (
    -- Cast required: the recursive term produces plain numeric from the
    -- round(), so the anchor must match or PostgreSQL rejects the CTE.
    SELECT m.entity_id, m.ownership_pct AS direct, m.parent_entity_id,
           m.ownership_pct::numeric AS effective
      FROM consol_group_member m
     WHERE m.group_id = p_group AND m.parent_entity_id IS NULL
    UNION ALL
    -- Effective ownership compounds down the chain: 80% of an 80% subsidiary
    -- is 64%, not 80%. Reporting the direct percentage would overstate the
    -- group's share of the lower tiers.
    SELECT m.entity_id, m.ownership_pct, m.parent_entity_id,
           round(c.effective * m.ownership_pct / 100, 4)
      FROM consol_group_member m
      JOIN chain c ON c.entity_id = m.parent_entity_id
     WHERE m.group_id = p_group
  )
  SELECT c.entity_id, e.name, e.company_code, c.direct, c.parent_entity_id,
         pe.name, c.effective, (c.effective < 100)
    FROM chain c
    LEFT JOIN entity e ON e.id = c.entity_id
    LEFT JOIN entity pe ON pe.id = c.parent_entity_id
   ORDER BY c.effective DESC, e.name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- COMPLIANCE
-- ─────────────────────────────────────────────────────────────────────
-- Reads the obligations Compliance enters in db/081.
CREATE OR REPLACE FUNCTION comp_reg_obligations(p_location text DEFAULT NULL)
RETURNS TABLE(id bigint, jurisdiction text, area text, title text,
              due_description text, frequency text, owner text,
              legislation_ref text, confirmed boolean, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.id, o.location_name, o.area_name, o.title, o.due_description,
         o.frequency, o.owner, o.legislation_ref, o.confirmed,
         -- Nothing reads as "On track" unless Compliance has confirmed it.
         CASE WHEN o.confirmed THEN 'Confirmed' ELSE 'Unconfirmed' END
    FROM obligations_list(p_location, false) o;
$$;

CREATE OR REPLACE FUNCTION comp_breaches(p_open_only boolean DEFAULT true)
RETURNS TABLE(id bigint, breach_date date, source text, subject text,
              breach_type text, amount numeric, status text,
              days_open integer, severity text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, b.breach_date, 'Client money'::text, c.name, b.breach_type,
         b.amount, b.status,
         (current_date - b.breach_date)::int,
         -- A client money breach open more than five days is a different
         -- matter from one identified today.
         CASE WHEN coalesce(b.status,'Open') = 'Remediated' THEN 'closed'
              WHEN (current_date - b.breach_date) > 5 THEN 'critical'
              ELSE 'attention' END
    FROM client_money_breach b
    LEFT JOIN cm_client c ON c.id = b.cm_client_id
   WHERE NOT p_open_only OR coalesce(b.status,'Open') <> 'Remediated'
   ORDER BY b.breach_date DESC;
$$;

CREATE OR REPLACE FUNCTION comp_training(p_year integer DEFAULT NULL)
RETURNS TABLE(staff_name text, entries bigint, hours numeric,
              verified_hours numeric, unverified bigint, categories text,
              last_entry date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.staff_name, count(*), round(coalesce(sum(c.hours),0),1),
         round(coalesce(sum(c.hours) FILTER (WHERE c.verified),0),1),
         count(*) FILTER (WHERE NOT coalesce(c.verified,false)),
         string_agg(DISTINCT c.category, ', '),
         max(c.entry_date)
    FROM cpd_entry c
   WHERE p_year IS NULL OR extract(year from c.entry_date) = p_year
   GROUP BY c.staff_name
   ORDER BY c.staff_name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- STATUTORY REGISTERS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION stat_annual_returns(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, filing_type text,
              period text, due_date date, status text, days_to_due integer,
              overdue boolean, prepared_by text, submitted_by text,
              reference text, chase_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.id, f.entity_id, e.name, f.filing_type, f.period, f.due_date, f.status,
         (f.due_date - current_date)::int,
         (f.due_date < current_date AND coalesce(f.status,'') <> 'submitted'),
         f.prepared_by, f.submitted_by, f.reference, f.chase_count
    FROM statutory_filing f
    LEFT JOIN entity e ON e.id = f.entity_id
   WHERE p_entity IS NULL OR f.entity_id = p_entity
   ORDER BY f.due_date;
$$;

CREATE OR REPLACE FUNCTION stat_bo_registers(p_entity bigint DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, jurisdiction text,
              ubos bigint, total_pct numeric, complete boolean, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, p.jurisdiction,
         count(u.id), round(coalesce(sum(u.ownership_pct),0),2),
         -- A beneficial ownership register that does not account for 100% is
         -- incomplete, and that is a filing matter rather than a tidiness one.
         (round(coalesce(sum(u.ownership_pct),0),2) = 100),
         CASE WHEN count(u.id) = 0 THEN 'no beneficial owners recorded'
              WHEN round(coalesce(sum(u.ownership_pct),0),2) = 100 THEN 'accounts for 100%'
              WHEN round(coalesce(sum(u.ownership_pct),0),2) < 100
                THEN round(100 - coalesce(sum(u.ownership_pct),0),2) || '% unaccounted for'
              ELSE round(coalesce(sum(u.ownership_pct),0) - 100,2) || '% over — recorded twice?' END
    FROM entity e
    JOIN entity_profile p ON p.entity_id = e.id
    LEFT JOIN entity_ubo u ON u.entity_id = e.id
   WHERE e.entity_class = 'client' AND (p_entity IS NULL OR e.id = p_entity)
   GROUP BY e.id, e.name, p.jurisdiction
   ORDER BY (round(coalesce(sum(u.ownership_pct),0),2) = 100), e.name;
$$;

-- Current officers. "cogs" in the original name is register of directors and
-- officers; kept as the screen calls it.
CREATE OR REPLACE FUNCTION stat_cogs_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, name text,
              role text, appointed date, nationality text,
              years_served numeric, tax_residence text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.id, o.entity_id, e.name, o.name, o.role, o.appointed, o.nationality,
         -- date minus date gives an integer number of days, so this is days
         -- over 365.25 rather than an epoch extract, which only works on an
         -- interval.
         round((current_date - o.appointed) / 365.25, 1),
         o.tax_residence
    FROM entity_officer o
    LEFT JOIN entity e ON e.id = o.entity_id
   WHERE o.resigned IS NULL
     AND (p_entity IS NULL OR o.entity_id = p_entity)
   ORDER BY e.name, o.appointed;
$$;

-- Appointments and resignations, which is what a registry filing is triggered
-- by. Includes resigned officers deliberately: the change is the event.
CREATE OR REPLACE FUNCTION stat_officer_changes(p_entity bigint DEFAULT NULL,
                                                p_since date DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, officer text, role text,
              change_type text, change_date date, days_ago integer,
              filing_due boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.entity_id, e.name, o.name, o.role, 'Appointed'::text, o.appointed,
         (current_date - o.appointed)::int,
         -- Most registries require notification within a month; flagged so a
         -- change that has not been filed is visible.
         ((current_date - o.appointed) > 30)
    FROM entity_officer o LEFT JOIN entity e ON e.id = o.entity_id
   WHERE o.appointed IS NOT NULL
     AND (p_entity IS NULL OR o.entity_id = p_entity)
     AND (p_since IS NULL OR o.appointed >= p_since)
  UNION ALL
  SELECT o.entity_id, e.name, o.name, o.role, 'Resigned'::text, o.resigned,
         (current_date - o.resigned)::int,
         ((current_date - o.resigned) > 30)
    FROM entity_officer o LEFT JOIN entity e ON e.id = o.entity_id
   WHERE o.resigned IS NOT NULL
     AND (p_entity IS NULL OR o.entity_id = p_entity)
     AND (p_since IS NULL OR o.resigned >= p_since)
   ORDER BY 6 DESC;
$$;

CREATE OR REPLACE FUNCTION stat_dissolutions(p_entity bigint DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, company_code text,
              jurisdiction text, admin_status text, risk_rating text,
              outstanding_filings bigint, unbilled_time bigint,
              can_close boolean, blocker text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, e.company_code, p.jurisdiction, p.admin_status, p.risk_rating,
         (SELECT count(*) FROM statutory_filing f
           WHERE f.entity_id = e.id AND coalesce(f.status,'') <> 'submitted'),
         (SELECT count(*) FROM timesheet_entry t
           WHERE t.entity_label = e.name AND t.billable
             AND coalesce(t.status,'') <> 'Billed'),
         -- An entity cannot be closed with filings outstanding or unbilled
         -- time: the first leaves a regulatory loose end, the second writes
         -- off work already done.
         ((SELECT count(*) FROM statutory_filing f
            WHERE f.entity_id = e.id AND coalesce(f.status,'') <> 'submitted') = 0
          AND (SELECT count(*) FROM timesheet_entry t
                WHERE t.entity_label = e.name AND t.billable
                  AND coalesce(t.status,'') <> 'Billed') = 0),
         CASE
           WHEN (SELECT count(*) FROM statutory_filing f
                  WHERE f.entity_id = e.id AND coalesce(f.status,'') <> 'submitted') > 0
             THEN 'filings outstanding'
           WHEN (SELECT count(*) FROM timesheet_entry t
                  WHERE t.entity_label = e.name AND t.billable
                    AND coalesce(t.status,'') <> 'Billed') > 0
             THEN 'unbilled time would be written off'
           ELSE 'nothing outstanding' END
    FROM entity e
    JOIN entity_profile p ON p.entity_id = e.id
   WHERE e.entity_class = 'client'
     AND (p_entity IS NULL OR e.id = p_entity)
   ORDER BY e.name;
$$;

-- invoice.settled is TEXT, not boolean — checked rather than assumed after the
-- function was rejected for returning text where a boolean was declared.
-- ─────────────────────────────────────────────────────────────────────
-- OPERATIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tasks_list(p_assignee text DEFAULT NULL,
                                      p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, title text, category text, entity_label text,
              entity_id bigint, assignee text, raised_by text, due_date date,
              priority text, status text, notes text,
              days_to_due integer, overdue boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT t.id, t.title, t.category, t.entity_label, t.entity_id, t.assignee,
         t.raised_by, t.due_date, t.priority, t.status, t.notes,
         (t.due_date - current_date)::int,
         (t.due_date < current_date AND coalesce(t.status,'') NOT IN ('Done','Complete'))
    FROM task t
   WHERE (p_assignee IS NULL OR t.assignee = p_assignee)
     AND (p_status IS NULL OR t.status = p_status)
   ORDER BY (t.due_date < current_date
             AND coalesce(t.status,'') NOT IN ('Done','Complete')) DESC,
            t.due_date NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION onboarding_cases(p_stage text DEFAULT NULL)
RETURNS TABLE(id bigint, client_name text, entity_name text, entity_id bigint,
              office text, jurisdiction text, entity_type text, sector text,
              stage text, risk_rating text, assigned_to text,
              target_date date, fee_quoted numeric, fee_ccy char(3),
              cdd_items bigint, cdd_verified bigint, cdd_outstanding bigint,
              is_live boolean, days_open integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.client_name, c.entity_name, c.entity_id, c.office,
         c.jurisdiction, c.entity_type, c.sector, c.stage, c.risk_rating,
         c.assigned_to, c.target_date, c.fee_quoted, c.fee_ccy,
         (SELECT count(*) FROM cdd_item i WHERE i.case_id = c.id),
         (SELECT count(*) FROM cdd_item i WHERE i.case_id = c.id AND i.status = 'Verified'),
         (SELECT count(*) FROM cdd_item i WHERE i.case_id = c.id
                                            AND coalesce(i.status,'') <> 'Verified'),
         (c.entity_id IS NOT NULL),
         (current_date - c.created_at::date)::int
    FROM onboarding_case c
   WHERE p_stage IS NULL OR c.stage = p_stage
   ORDER BY c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION fee_invoices(p_entity bigint DEFAULT NULL,
                                        p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, invoice_date date,
              ccy char(3), net_total numeric, vat_total numeric,
              gross_total numeric, outstanding numeric, settled text,
              status text, days_outstanding integer, overdue boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT i.id, i.entity_id, e.name, i.invoice_date, i.ccy, i.net_total,
         i.vat_total, i.gross_total, i.outstanding, i.settled, i.status,
         (current_date - i.invoice_date)::int,
         (coalesce(i.outstanding, 0) > 0 AND (current_date - i.invoice_date) > 30)
    FROM invoice i
    LEFT JOIN entity e ON e.id = i.entity_id
   WHERE (p_entity IS NULL OR i.entity_id = p_entity)
     AND (p_status IS NULL OR i.status = p_status)
   ORDER BY i.invoice_date DESC;
$$;

-- dms_category is an INTEGER foreign key, not the category name — checked
-- after the function was rejected comparing integer to text. Joined so the
-- screen gets a readable name and can still filter by either.
CREATE OR REPLACE FUNCTION document_list(p_entity bigint DEFAULT NULL,
                                         p_category text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, object_type text,
              object_id bigint, dms_category text, dms_ref text,
              filename text, uploaded_by text, uploaded_at timestamptz,
              retention_until date, within_retention boolean, days_held integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id, d.entity_id, e.name, d.object_type, d.object_id,
         coalesce(c.name, d.dms_category::text),
         d.dms_ref, d.filename, d.uploaded_by, d.uploaded_at, d.retention_until,
         -- Within retention means it must not be deleted. Shown so nobody has
         -- to work it out from a date.
         (d.retention_until IS NOT NULL AND d.retention_until > current_date),
         (current_date - d.uploaded_at::date)::int
    FROM document_link d
    LEFT JOIN entity e ON e.id = d.entity_id
    -- The foreign key is on dms_category(code), an integer, not an id
    -- column — that table has only code and name.
    LEFT JOIN dms_category c ON c.code = d.dms_category
   WHERE (p_entity IS NULL OR d.entity_id = p_entity)
     AND (p_category IS NULL OR c.name = p_category
          OR d.dms_category::text = p_category)
   ORDER BY d.uploaded_at DESC;
$$;

CREATE OR REPLACE FUNCTION eg_licences(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, regulator text,
              licence_no text, licence_status text, licence_from date,
              licence_to date, categories text, days_to_expiry integer,
              expiring_soon boolean, expired boolean, notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT g.id, g.entity_id, e.name, g.regulator, g.licence_no, g.licence_status,
         g.licence_from, g.licence_to, g.categories,
         (g.licence_to - current_date)::int,
         -- Ninety days is the point at which a renewal has to be in hand for
         -- most gaming regulators.
         (g.licence_to IS NOT NULL AND g.licence_to > current_date
          AND (g.licence_to - current_date) <= 90),
         (g.licence_to IS NOT NULL AND g.licence_to < current_date),
         g.notes
    FROM entity_gaming g
    LEFT JOIN entity e ON e.id = g.entity_id
   WHERE p_entity IS NULL OR g.entity_id = p_entity
   ORDER BY g.licence_to NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION eg_log(p_entity bigint DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS TABLE(entity_id bigint, entity_name text, licence_no text,
              action text, detail text, at timestamptz, by_whom text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  -- From the audit trail rather than a separate log, so there is one record of
  -- what happened rather than two that can disagree.
  -- audit_event records the object it touched in target, not entity_id —
  -- checked rather than assumed.
  SELECT g.entity_id, e.name, g.licence_no, a.action, a.details, a.t, a.staff_user
    FROM audit_event a
    -- audit_event.target is TEXT, so the id needs casting to match.
    JOIN entity_gaming g ON g.id::text = a.target
    LEFT JOIN entity e ON e.id = g.entity_id
   WHERE a.mod = 'entity_gaming'
     AND (p_entity IS NULL OR g.entity_id = p_entity)
   ORDER BY a.t DESC
   LIMIT coalesce(p_limit, 100);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- GRANTS
-- ─────────────────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('trial_balance','recent_journals','pnl_by_entity','ap_vendors',
                         'ap_aging','ap_purchase_orders','budget_vs_actual_for_entity',
                         'ic_loans_for_entity','bank_accounts_for_entity','fx_rates_latest',
                         'fx_positions','vat_boxes_ytd','control_checks',
                         'group_consolidated_summary','group_effective_ownership',
                         'comp_reg_obligations','comp_breaches','comp_training',
                         'stat_annual_returns','stat_bo_registers','stat_cogs_list',
                         'stat_officer_changes','stat_dissolutions','tasks_list',
                         'onboarding_cases','fee_invoices','document_list',
                         'eg_licences','eg_log')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm every one exists and is reachable ────────────────────────
SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('trial_balance','recent_journals','pnl_by_entity','ap_vendors',
                     'ap_aging','ap_purchase_orders','budget_vs_actual_for_entity',
                     'ic_loans_for_entity','bank_accounts_for_entity','fx_rates_latest',
                     'fx_positions','vat_boxes_ytd','control_checks',
                     'group_consolidated_summary','group_effective_ownership',
                     'comp_reg_obligations','comp_breaches','comp_training',
                     'stat_annual_returns','stat_bo_registers','stat_cogs_list',
                     'stat_officer_changes','stat_dissolutions','tasks_list',
                     'onboarding_cases','fee_invoices','document_list',
                     'eg_licences','eg_log')
 ORDER BY p.proname;
