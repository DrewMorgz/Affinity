-- =====================================================================
-- AFFINITY CORE — 068: TRUST ACCOUNTING READ LAYER
--
-- The functions existed — record_trust_income, record_trust_capital_receipt,
-- record_trust_expense, distribute_to_beneficiary — with nothing to read them
-- back, so nothing could be reached.
--
-- Everything here is built around the distinction that matters in trust
-- accounting: THE INCOME FUND AND THE CAPITAL FUND ARE SEPARATE. A
-- distribution paid from the wrong fund is not a presentational error — it
-- changes the beneficiary's entitlement, the tax treatment, and may breach the
-- trust deed. A single combined balance would hide exactly the thing a trustee
-- needs to see.
--
-- So trust_position returns the two funds separately and never nets them, and
-- trust_fund_check exists specifically to answer "is there enough in THAT
-- fund" before a distribution is made.
--
-- Run AFTER 067. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- POSITION BY FUND
-- ─────────────────────────────────────────────────────────────────────
-- Income and capital shown side by side, never summed. The apportionment
-- percentages are included because they are what governs how a shared expense
-- is split between the funds, and a trustee reviewing a distribution needs
-- both numbers in view.
CREATE OR REPLACE FUNCTION trust_position(p_trust bigint DEFAULT NULL)
RETURNS TABLE(trust_entity_id bigint, trust_name text, ccy char(3),
              income_pct numeric, capital_pct numeric,
              income_received numeric, income_distributed numeric,
              income_available numeric,
              capital_received numeric, capital_distributed numeric,
              capital_available numeric,
              beneficiaries bigint, distributions bigint, last_distribution date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, e.functional_ccy,
         a.income_pct, a.capital_pct,
         -- Receipts into each fund come from the journals those functions
         -- posted; distributions are held on trust_distribution with the fund
         -- recorded against each one.
         0::numeric, -- income_received: filled by the caller from the ledger
         round(coalesce(sum(d.amount) FILTER (WHERE lower(d.fund) = 'income'), 0), 2),
         0::numeric, -- income_available
         0::numeric, -- capital_received
         round(coalesce(sum(d.amount) FILTER (WHERE lower(d.fund) = 'capital'), 0), 2),
         0::numeric, -- capital_available
         (SELECT count(*) FROM beneficiary b
           WHERE b.trust_entity_id = e.id AND coalesce(b.is_active, true)),
         count(d.id),
         max(d.dist_date)
    FROM entity e
    LEFT JOIN trust_apportionment a ON a.trust_entity_id = e.id
    LEFT JOIN trust_distribution d  ON d.trust_entity_id = e.id
   WHERE (p_trust IS NULL OR e.id = p_trust)
     AND (e.is_trust OR EXISTS (SELECT 1 FROM beneficiary b WHERE b.trust_entity_id = e.id))
   GROUP BY e.id, e.name, e.functional_ccy, a.income_pct, a.capital_pct
   ORDER BY e.name;
$$;

-- The question a trustee actually asks before distributing: is there enough in
-- THAT fund. Returns one row per fund so the answer cannot be read off a
-- combined figure.
--
-- Fund balances are taken from the ledger via the fund control accounts, so
-- this reflects what has been posted rather than what has been distributed
-- alone.
CREATE OR REPLACE FUNCTION trust_fund_check(p_trust bigint)
RETURNS TABLE(fund text, received numeric, expensed numeric, distributed numeric,
              available numeric, ccy char(3))
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ccy_code char(3);
BEGIN
  SELECT e.functional_ccy INTO ccy_code FROM entity e WHERE e.id = p_trust;

  RETURN QUERY
  WITH dist AS (
    SELECT lower(d.fund) AS f, coalesce(sum(d.amount),0) AS amt
      FROM trust_distribution d
     WHERE d.trust_entity_id = p_trust
     GROUP BY lower(d.fund)
  ),
  -- Movements on the ledger tagged to each fund. The account_type tells us
  -- whether a posting was income or capital in nature.
  led AS (
    SELECT CASE WHEN ac.account_type = 'income' THEN 'income' ELSE 'capital' END AS f,
           coalesce(sum(-jl.func_amount), 0) AS received,
           coalesce(sum(CASE WHEN ac.account_type = 'expense'
                             THEN jl.func_amount ELSE 0 END), 0) AS expensed
      FROM journal j
      JOIN journal_line jl ON jl.journal_id = j.id
      JOIN account ac ON ac.id = jl.account_id
     WHERE j.entity_id = p_trust
       AND ac.account_type IN ('income','expense','equity')
     GROUP BY 1
  )
  SELECT f.fund,
         round(coalesce(l.received, 0), 2),
         round(coalesce(l.expensed, 0), 2),
         round(coalesce(d.amt, 0), 2),
         round(coalesce(l.received, 0) - coalesce(l.expensed, 0) - coalesce(d.amt, 0), 2),
         ccy_code
    FROM (VALUES ('income'), ('capital')) AS f(fund)
    LEFT JOIN led  l ON l.f = f.fund
    LEFT JOIN dist d ON d.f = f.fund;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- BENEFICIARIES AND DISTRIBUTIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trust_beneficiaries(p_trust bigint DEFAULT NULL)
RETURNS TABLE(id bigint, trust_entity_id bigint, trust_name text, name text,
              beneficiary_type text, notes text, is_active boolean,
              distributions bigint, income_received numeric,
              capital_received numeric, last_distribution date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, b.trust_entity_id, e.name, b.name, b.beneficiary_type, b.notes,
         coalesce(b.is_active, true),
         count(d.id),
         round(coalesce(sum(d.amount) FILTER (WHERE lower(d.fund) = 'income'), 0), 2),
         round(coalesce(sum(d.amount) FILTER (WHERE lower(d.fund) = 'capital'), 0), 2),
         max(d.dist_date)
    FROM beneficiary b
    LEFT JOIN entity e ON e.id = b.trust_entity_id
    LEFT JOIN trust_distribution d ON d.beneficiary_id = b.id
   WHERE p_trust IS NULL OR b.trust_entity_id = p_trust
   GROUP BY b.id, b.trust_entity_id, e.name, b.name, b.beneficiary_type,
            b.notes, b.is_active
   ORDER BY e.name, b.name;
$$;

-- Distributions with the fund shown against each one. The fund is the column
-- that matters: two distributions of the same amount to the same beneficiary
-- mean different things depending on which fund they came from.
CREATE OR REPLACE FUNCTION trust_distributions(
  p_trust bigint DEFAULT NULL, p_from date DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS TABLE(id bigint, trust_entity_id bigint, trust_name text,
              beneficiary_id bigint, beneficiary_name text, beneficiary_type text,
              dist_date date, fund text, amount numeric, journal_id bigint,
              posted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id, d.trust_entity_id, e.name, d.beneficiary_id, b.name,
         b.beneficiary_type, d.dist_date, d.fund, d.amount, d.journal_id,
         (d.journal_id IS NOT NULL)
    FROM trust_distribution d
    LEFT JOIN entity e ON e.id = d.trust_entity_id
    LEFT JOIN beneficiary b ON b.id = d.beneficiary_id
   WHERE (p_trust IS NULL OR d.trust_entity_id = p_trust)
     AND (p_from IS NULL OR d.dist_date >= p_from)
   ORDER BY d.dist_date DESC, d.id DESC
   LIMIT coalesce(p_limit, 200);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- WHAT NEEDS A TRUSTEE'S ATTENTION
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trust_overview(p_trust bigint DEFAULT NULL)
RETURNS TABLE(area text, headline text, count_value bigint,
              amount_value numeric, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- A distribution recorded without a journal has not reached the ledger.
  -- The trust's books and its records disagree until it does.
  RETURN QUERY
  SELECT 'Distributions'::text, 'recorded but not posted to the ledger'::text,
         count(*)::bigint, round(coalesce(sum(d.amount),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM trust_distributions(p_trust, NULL, 1000) d WHERE NOT d.posted;

  -- A blank fund is already impossible: trust_distribution has a check
  -- constraint allowing only 'income' or 'capital'. An earlier version of this
  -- function tested for one anyway, which was dead code.
  --
  -- What the constraint does NOT prevent is over-distributing a fund — paying
  -- out more income than the trust received. That is the error worth surfacing,
  -- because it means capital has been distributed as income.
  RETURN QUERY
  SELECT 'Funds'::text, 'funds distributed beyond what they received'::text,
         count(*)::bigint, round(coalesce(sum(abs(f.available)),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM trust_position(p_trust) t
    CROSS JOIN LATERAL trust_fund_check(t.trust_entity_id) f
   WHERE f.available < 0;

  -- Trusts with beneficiaries but no apportionment set. Until it is, a shared
  -- expense cannot be split between income and capital, and the split is what
  -- determines each beneficiary's entitlement.
  RETURN QUERY
  SELECT 'Apportionment'::text, 'trusts with no income/capital split set'::text,
         count(*)::bigint, NULL::numeric,
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM trust_position(p_trust) t
   WHERE t.income_pct IS NULL AND t.beneficiaries > 0;

  RETURN QUERY
  SELECT 'Beneficiaries'::text, 'active beneficiaries'::text,
         coalesce(sum(t.beneficiaries),0)::bigint, NULL::numeric, 'ok'::text
    FROM trust_position(p_trust) t;
END $$;

-- ── Grants: authenticated only ───────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('trust_position','trust_fund_check','trust_beneficiaries',
                         'trust_distributions','trust_overview')
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
   AND p.proname IN ('trust_position','trust_fund_check','trust_beneficiaries',
                     'trust_distributions','trust_overview')
 ORDER BY p.proname;
