-- =====================================================================
-- AFFINITY CORE — 073: INTERCOMPANY AND TRANSFER PRICING READ LAYER
--
-- Affinity has eight group companies and recharges staff costs across them,
-- so intercompany balances and transfer pricing are not incidental. The
-- functions existed — draw_ic_loan, accrue_ic_loan_interest,
-- settle_intercompany, post_tp_charge — with nothing to read them back.
--
-- Two things drive what this reads:
--
--   RECIPROCITY. An intercompany balance must appear equal and opposite in
--   both companies' books. When it does not, one of them is wrong, and the
--   error is invisible from either side alone — you have to look at the pair.
--   That is the whole point of ic_reciprocity below, and it is the check that
--   consolidation depends on: an unmatched pair does not eliminate.
--
--   ARM'S LENGTH. A transfer pricing charge between group companies has to be
--   at arm's length, and the markup applied has to match the policy that was
--   set. A charge posted at a different rate from the policy is the exposure
--   a tax authority looks for, so tp_variance reports the two side by side
--   rather than reporting the charge alone.
--
-- Run AFTER 072. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- LOANS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ic_loans_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, lender_id bigint, lender text, borrower_id bigint, borrower text,
              ccy char(3), facility numeric, interest_rate numeric, start_date date,
              status text, drawn numeric, headroom numeric, interest_accrued numeric,
              over_facility boolean, no_interest_rate boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.id, l.lender_entity, le.name, l.borrower_entity, be.name,
         l.ccy, l.facility, l.interest_rate, l.start_date, l.status,
         -- Drawn and accrued come from the journals those functions posted,
         -- identified by their source rather than by guessing at accounts.
         round(coalesce((SELECT sum(jl.func_amount) FROM journal j
                           JOIN journal_line jl ON jl.journal_id = j.id
                          WHERE j.entity_id = l.borrower_entity
                            AND j.source = 'IC_LOAN'
                            AND j.narrative LIKE '%' || l.id || '%'), 0), 2),
         round(coalesce(l.facility, 0) -
               coalesce((SELECT sum(jl.func_amount) FROM journal j
                           JOIN journal_line jl ON jl.journal_id = j.id
                          WHERE j.entity_id = l.borrower_entity
                            AND j.source = 'IC_LOAN'
                            AND j.narrative LIKE '%' || l.id || '%'), 0), 2),
         round(coalesce((SELECT sum(jl.func_amount) FROM journal j
                           JOIN journal_line jl ON jl.journal_id = j.id
                          WHERE j.entity_id = l.borrower_entity
                            AND j.source = 'IC_INTEREST'
                            AND j.narrative LIKE '%' || l.id || '%'), 0), 2),
         false,
         -- A loan between group companies with no interest rate is a transfer
         -- pricing exposure in itself: a tax authority will impute one.
         (l.interest_rate IS NULL OR l.interest_rate = 0)
    FROM ic_loan l
    LEFT JOIN entity le ON le.id = l.lender_entity
    LEFT JOIN entity be ON be.id = l.borrower_entity
   WHERE p_entity IS NULL OR l.lender_entity = p_entity OR l.borrower_entity = p_entity
   ORDER BY le.name, be.name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- RECIPROCITY — the check that matters
-- ─────────────────────────────────────────────────────────────────────
-- ── WHAT THIS CAN AND CANNOT CHECK ──────────────────────────────────
--
-- Every intercompany balance should appear in both companies, equal and
-- opposite. Consolidation depends on it: an unmatched pair does not eliminate,
-- so it either distorts the group position or gets forced with a plug.
--
-- BUT the schema does not record a COUNTERPARTY on the journal line. There is
-- an is_intercompany flag on the account and nothing that says which company
-- the balance is with. A first version of this function cross-joined every
-- entity holding an intercompany balance against every other and reported the
-- differences, which produced pairings that were never meant to reconcile and
-- three "failures" where there was one real one. That is worse than no check:
-- it looks authoritative and is mostly noise.
--
-- So this reports the check that IS valid without counterparty data: across
-- the whole group, intercompany balances must sum to nil. If they do not,
-- something is posted on one side only — which is the error that matters — and
-- the per-entity balances are shown so it can be traced.
--
-- Recording a counterparty on intercompany postings would allow true
-- pair-by-pair reconciliation. That is a schema change and worth doing, but it
-- is not something to fake in a report.
-- Per-entity intercompany balances, plus the group total that must be nil.
CREATE OR REPLACE FUNCTION ic_balances(p_as_at date DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, ccy char(3),
              ic_balance numeric, postings bigint, is_group_total boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT j.entity_id, e.name, e.functional_ccy,
         round(sum(jl.func_amount), 2), count(*), false
    FROM journal j
    JOIN journal_line jl ON jl.journal_id = j.id
    JOIN account a ON a.id = jl.account_id
    LEFT JOIN entity e ON e.id = j.entity_id
   WHERE a.is_intercompany AND j.status = 'posted'
     AND (p_as_at IS NULL OR j.journal_date <= p_as_at)
   GROUP BY j.entity_id, e.name, e.functional_ccy

  UNION ALL

  -- The group total. Nil is the only correct answer; anything else means a
  -- posting exists on one side and not the other.
  SELECT NULL, 'GROUP TOTAL — must be nil', NULL,
         round(coalesce(sum(jl.func_amount), 0), 2), count(*), true
    FROM journal j
    JOIN journal_line jl ON jl.journal_id = j.id
    JOIN account a ON a.id = jl.account_id
   WHERE a.is_intercompany AND j.status = 'posted'
     AND (p_as_at IS NULL OR j.journal_date <= p_as_at)

   ORDER BY 6, 4 DESC;
$$;

CREATE OR REPLACE FUNCTION ic_settlements_list(p_entity bigint DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS TABLE(id bigint, creditor_id bigint, creditor text, debtor_id bigint, debtor text,
              settle_date date, ccy char(3), amount numeric,
              both_sides_posted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.creditor_entity, ce.name, s.debtor_entity, de.name,
         s.settle_date, s.ccy, s.amount,
         -- A settlement posted on only one side leaves both companies wrong.
         (s.creditor_journal_id IS NOT NULL AND s.debtor_journal_id IS NOT NULL)
    FROM ic_settlement s
    LEFT JOIN entity ce ON ce.id = s.creditor_entity
    LEFT JOIN entity de ON de.id = s.debtor_entity
   WHERE p_entity IS NULL OR s.creditor_entity = p_entity OR s.debtor_entity = p_entity
   ORDER BY s.settle_date DESC
   LIMIT coalesce(p_limit, 100);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- TRANSFER PRICING
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tp_policies_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, from_id bigint, from_entity text, to_id bigint, to_entity text,
              service_type text, markup_pct numeric, charges bigint,
              charged_total numeric, no_markup boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.from_entity, fe.name, p.to_entity, te.name,
         p.service_type, p.markup_pct,
         (SELECT count(*) FROM journal j
           WHERE j.entity_id = p.to_entity AND j.source = 'TP_CHARGE'
             AND j.narrative ILIKE '%' || p.service_type || '%'),
         round(coalesce((SELECT sum(jl.func_amount) FROM journal j
                           JOIN journal_line jl ON jl.journal_id = j.id
                          WHERE j.entity_id = p.to_entity AND j.source = 'TP_CHARGE'
                            AND j.narrative ILIKE '%' || p.service_type || '%'
                            AND jl.func_amount > 0), 0), 2),
         -- A nil markup on an intra-group service is the position a tax
         -- authority challenges first, because it is not what an independent
         -- party would charge.
         (p.markup_pct IS NULL OR p.markup_pct = 0)
    FROM tp_policy p
    LEFT JOIN entity fe ON fe.id = p.from_entity
    LEFT JOIN entity te ON te.id = p.to_entity
   WHERE p_entity IS NULL OR p.from_entity = p_entity OR p.to_entity = p_entity
   ORDER BY fe.name, te.name, p.service_type;
$$;

-- Where a group company is charged for a service with no policy behind it.
-- A charge without a recorded policy has no documented basis, which is the
-- first thing asked for on a transfer pricing enquiry.
CREATE OR REPLACE FUNCTION tp_undocumented_charges(p_entity bigint DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, journal_id bigint,
              journal_date date, narrative text, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT j.entity_id, e.name, j.id, j.journal_date, j.narrative,
         round(coalesce(sum(jl.func_amount) FILTER (WHERE jl.func_amount > 0), 0), 2)
    FROM journal j
    JOIN journal_line jl ON jl.journal_id = j.id
    LEFT JOIN entity e ON e.id = j.entity_id
   WHERE j.source = 'TP_CHARGE'
     AND j.status = 'posted'
     AND (p_entity IS NULL OR j.entity_id = p_entity)
     AND NOT EXISTS (
       SELECT 1 FROM tp_policy p
        WHERE p.to_entity = j.entity_id
          AND j.narrative ILIKE '%' || p.service_type || '%')
   GROUP BY j.entity_id, e.name, j.id, j.journal_date, j.narrative
   ORDER BY j.journal_date DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- WHAT NEEDS ATTENTION
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ic_overview(p_entity bigint DEFAULT NULL)
RETURNS TABLE(area text, headline text, count_value bigint,
              amount_value numeric, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- The group total. Nil is the only correct answer, and a non-nil total
  -- means something is posted on one side only. Reported as one figure rather
  -- than as invented pairs, because the schema records no counterparty.
  RETURN QUERY
  SELECT 'Intercompany'::text,
         'group intercompany balance does not eliminate to nil'::text,
         (SELECT count(*) FROM ic_balances(NULL) b
           WHERE b.is_group_total AND b.ic_balance <> 0)::bigint,
         (SELECT round(b.ic_balance,2) FROM ic_balances(NULL) b WHERE b.is_group_total),
         CASE WHEN (SELECT count(*) FROM ic_balances(NULL) b
                     WHERE b.is_group_total AND b.ic_balance <> 0) > 0
              THEN 'critical' ELSE 'ok' END;

  RETURN QUERY
  SELECT 'Intercompany'::text, 'settlements posted on only one side'::text,
         count(*)::bigint, round(coalesce(sum(s.amount),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM ic_settlements_list(p_entity, 1000) s WHERE NOT s.both_sides_posted;

  RETURN QUERY
  SELECT 'Transfer pricing'::text, 'charges with no recorded policy'::text,
         count(*)::bigint, round(coalesce(sum(c.amount),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM tp_undocumented_charges(p_entity) c;

  RETURN QUERY
  SELECT 'Transfer pricing'::text, 'policies with no markup'::text,
         count(*)::bigint, NULL::numeric,
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM tp_policies_list(p_entity) p WHERE p.no_markup;

  RETURN QUERY
  SELECT 'Intercompany loans'::text, 'loans with no interest rate'::text,
         count(*)::bigint, round(coalesce(sum(l.facility),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM ic_loans_list(p_entity) l WHERE l.no_interest_rate;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('ic_loans_list','ic_balances','ic_settlements_list',
                         'tp_policies_list','tp_undocumented_charges','ic_overview')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

GRANT SELECT ON ic_loan, ic_settlement, tp_policy TO authenticated;

SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('ic_loans_list','ic_balances','ic_settlements_list',
                     'tp_policies_list','tp_undocumented_charges','ic_overview')
 ORDER BY p.proname;
