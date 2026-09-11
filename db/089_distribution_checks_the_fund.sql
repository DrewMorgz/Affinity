-- 089 — a trust distribution must check the fund it is paid from
--
-- FOUND BY WRITING THE GUIDE AND CHECKING THE CLAIM. The guide said
-- distributing checks there is enough in that fund. It did not.
-- distribute_to_beneficiary validated that the fund was spelled 'income' or
-- 'capital' and then posted, whatever the fund held.
--
-- So a trustee could pay 60,000 of income from an income fund holding 40,000,
-- and Core would allow it. The money would come from capital in substance while
-- the records showed an income distribution — which is paying the life tenant
-- out of the remaindermen's share. That is a breach of trust rather than a
-- misposting, and it is the exact thing the income/capital separation exists to
-- prevent.
--
-- trust_fund_check already computes what is available per fund: received less
-- expensed less distributed. The distribution simply never consulted it.
--
-- WHY THIS IS A REFUSAL AND NOT A WARNING. Elsewhere in Core an overdrawn
-- client money movement is allowed and named — the button says "Record anyway,
-- creates a breach" — because the movement may genuinely have happened and the
-- records must reflect reality. A trust distribution is different: it is an act
-- the trustee is about to perform, not a fact being recorded after it. Refusing
-- costs a trustee nothing they cannot undo by choosing the right fund.

CREATE OR REPLACE FUNCTION distribute_to_beneficiary(p_trust bigint,
                                                     p_beneficiary bigint,
                                                     p_date date,
                                                     p_fund text,
                                                     p_amount numeric,
                                                     p_dist_acct bigint,
                                                     p_bank bigint,
                                                     p_created_by text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_loc       text;
  v_ccy       char(3);
  v_dim       bigint;
  v_jid       bigint;
  v_available numeric;
  v_other     numeric;
  nm          text;
BEGIN
  IF p_fund NOT IN ('income', 'capital') THEN
    RAISE EXCEPTION 'fund must be income or capital';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'A distribution must be a positive amount.';
  END IF;

  SELECT location_code, functional_ccy INTO v_loc, v_ccy
    FROM entity WHERE id = p_trust;
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'There is no trust with id %.', p_trust;
  END IF;
  SELECT name INTO nm FROM entity WHERE id = p_trust;

  -- ── The check the guide described and the function did not have ────────
  SELECT available INTO v_available
    FROM trust_fund_check(p_trust) WHERE fund = p_fund;
  v_available := coalesce(v_available, 0);

  IF p_amount > v_available THEN
    SELECT coalesce(available, 0) INTO v_other
      FROM trust_fund_check(p_trust)
     WHERE fund = CASE WHEN p_fund = 'income' THEN 'capital' ELSE 'income' END;

    RAISE EXCEPTION
      'The % fund of % holds %, and this distribution is %. Paying it would '
      'take the difference from the other fund — the % fund holds %. Income '
      'belongs to the life tenant and capital to the remaindermen, so paying '
      'one out of the other is a breach of trust rather than a misposting. '
      'Distribute what the fund holds, or distribute from the fund that holds it.',
      p_fund, nm, round(v_available, 2), round(p_amount, 2),
      CASE WHEN p_fund = 'income' THEN 'capital' ELSE 'income' END,
      round(coalesce(v_other, 0), 2);
  END IF;

  v_dim := fund_value(CASE WHEN p_fund = 'income' THEN 'INC' ELSE 'CAP' END);

  v_jid := post_journal(
    p_trust, p_date, 'trust-distribution',
    'Distribution to beneficiary (' || p_fund || ')', p_created_by,
    jsonb_build_array(
      jsonb_build_object('account_id', p_dist_acct, 'txn_ccy', v_ccy,
                         'txn_amount', p_amount, 'location_code', v_loc,
                         'memo', 'Distribution', 'dim_fund', v_dim),
      jsonb_build_object('account_id', p_bank, 'txn_ccy', v_ccy,
                         'txn_amount', -p_amount, 'location_code', v_loc,
                         'memo', 'Distribution', 'dim_fund', v_dim)
    ),
    'manual');

  INSERT INTO trust_distribution (trust_id, beneficiary_id, distribution_date,
                                  fund, amount, ccy, journal_id)
  VALUES (p_trust, p_beneficiary, p_date, p_fund, p_amount, v_ccy, v_jid);

  RETURN v_jid;
END;
$$;

COMMENT ON FUNCTION distribute_to_beneficiary(bigint, bigint, date, text, numeric,
                                              bigint, bigint, text) IS
  'Distributes to a beneficiary from a named fund, refusing where that fund does '
  'not hold enough. The check was added in 089 after the user guide claimed it '
  'existed and it did not.';

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'distribute_to_beneficiary'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
