-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  TRUST ACCOUNTING  (022)
-- The fiduciary income-vs-capital split, modelled as a FUND dimension
-- (Income / Capital) tagged on BOTH legs of every trust posting (reuses the
-- flexible dimension system + post_journal's per-line 'dimensions'). Because
-- both legs carry the same fund, the net assets tagged to a fund = that
-- fund's balance (undistributed income / remaining capital). Expenses and
-- trustee fees are apportioned across the two funds per the trust deed.
-- Beneficiary register tracks income (life tenant) vs capital (remainderman)
-- distributions and running entitlement.
-- =====================================================================

ALTER TABLE entity ADD COLUMN is_trust boolean NOT NULL DEFAULT false;

-- register the FUND dimension + its two values (idempotent)
INSERT INTO dimension_type(code,name)
SELECT 'FUND','Trust fund (income/capital)'
WHERE NOT EXISTS (SELECT 1 FROM dimension_type WHERE code='FUND');

INSERT INTO dimension_value(dimension_type_id,code,name)
SELECT dt.id,'INC','Income' FROM dimension_type dt WHERE dt.code='FUND'
  AND NOT EXISTS (SELECT 1 FROM dimension_value dv WHERE dv.dimension_type_id=dt.id AND dv.code='INC');
INSERT INTO dimension_value(dimension_type_id,code,name)
SELECT dt.id,'CAP','Capital' FROM dimension_type dt WHERE dt.code='FUND'
  AND NOT EXISTS (SELECT 1 FROM dimension_value dv WHERE dv.dimension_type_id=dt.id AND dv.code='CAP');

CREATE OR REPLACE FUNCTION fund_value(p_code text)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT dv.id FROM dimension_value dv
    JOIN dimension_type dt ON dt.id = dv.dimension_type_id AND dt.code='FUND'
    WHERE dv.code = p_code;
$$;

-- expense apportionment per trust deed
CREATE TABLE trust_apportionment (
    trust_entity_id bigint PRIMARY KEY REFERENCES entity(id),
    income_pct      numeric(6,3) NOT NULL,
    capital_pct     numeric(6,3) NOT NULL,
    CHECK (income_pct + capital_pct = 100)
);

CREATE TABLE beneficiary (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trust_entity_id bigint NOT NULL REFERENCES entity(id),
    name            text NOT NULL,
    beneficiary_type text NOT NULL CHECK (beneficiary_type IN ('life_tenant','remainderman','discretionary')),
    notes           text,
    is_active       boolean NOT NULL DEFAULT true
);

CREATE TABLE trust_distribution (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trust_entity_id bigint NOT NULL REFERENCES entity(id),
    beneficiary_id  bigint NOT NULL REFERENCES beneficiary(id),
    dist_date       date NOT NULL,
    fund            text NOT NULL CHECK (fund IN ('income','capital')),
    amount          numeric(20,2) NOT NULL,
    journal_id      bigint REFERENCES journal(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);


-- trust income arising: Dr bank / Cr income, both tagged Income
CREATE OR REPLACE FUNCTION record_trust_income(
    p_trust bigint, p_date date, p_bank bigint, p_income_acct bigint, p_amount numeric, p_desc text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_inc bigint := fund_value('INC');
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id=p_trust;
    RETURN post_journal(p_trust, p_date, 'trust', COALESCE(p_desc,'Trust income'), p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',p_bank,      'txn_ccy',(SELECT functional_ccy FROM entity WHERE id=p_trust),'txn_amount', p_amount,'location_code',v_loc,'memo','Income to bank','dimensions',jsonb_build_array(v_inc)),
        jsonb_build_object('account_id',p_income_acct,'txn_ccy',(SELECT functional_ccy FROM entity WHERE id=p_trust),'txn_amount',-p_amount,'location_code',v_loc,'memo','Trust income','dimensions',jsonb_build_array(v_inc))));
END $$;

-- capital arising / corpus: Dr bank / Cr capital, both tagged Capital
CREATE OR REPLACE FUNCTION record_trust_capital_receipt(
    p_trust bigint, p_date date, p_bank bigint, p_capital_acct bigint, p_amount numeric, p_desc text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_cap bigint := fund_value('CAP'); v_ccy char(3);
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_trust;
    RETURN post_journal(p_trust, p_date, 'trust', COALESCE(p_desc,'Capital receipt'), p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',p_bank,        'txn_ccy',v_ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Capital to bank','dimensions',jsonb_build_array(v_cap)),
        jsonb_build_object('account_id',p_capital_acct,'txn_ccy',v_ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Trust capital','dimensions',jsonb_build_array(v_cap))));
END $$;

-- trust expense, optionally apportioned income/capital per the deed
CREATE OR REPLACE FUNCTION record_trust_expense(
    p_trust bigint, p_date date, p_expense_acct bigint, p_bank bigint, p_amount numeric,
    p_apportion boolean, p_fund text, p_desc text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_ccy char(3); v_inc bigint := fund_value('INC'); v_cap bigint := fund_value('CAP');
        v_ipct numeric; v_iamt numeric; v_camt numeric; v_lines jsonb;
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_trust;
    IF p_apportion THEN
        SELECT income_pct INTO v_ipct FROM trust_apportionment WHERE trust_entity_id=p_trust;
        IF v_ipct IS NULL THEN RAISE EXCEPTION 'No apportionment policy for trust %', p_trust; END IF;
        v_iamt := round(p_amount * v_ipct/100.0, 2);
        v_camt := p_amount - v_iamt;
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id',p_expense_acct,'txn_ccy',v_ccy,'txn_amount', v_iamt,'location_code',v_loc,'memo','Expense (income share)','dimensions',jsonb_build_array(v_inc)),
          jsonb_build_object('account_id',p_expense_acct,'txn_ccy',v_ccy,'txn_amount', v_camt,'location_code',v_loc,'memo','Expense (capital share)','dimensions',jsonb_build_array(v_cap)),
          jsonb_build_object('account_id',p_bank,        'txn_ccy',v_ccy,'txn_amount',-v_iamt,'location_code',v_loc,'memo','Paid (income share)','dimensions',jsonb_build_array(v_inc)),
          jsonb_build_object('account_id',p_bank,        'txn_ccy',v_ccy,'txn_amount',-v_camt,'location_code',v_loc,'memo','Paid (capital share)','dimensions',jsonb_build_array(v_cap)));
    ELSE
        IF p_fund NOT IN ('income','capital') THEN RAISE EXCEPTION 'fund must be income or capital'; END IF;
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id',p_expense_acct,'txn_ccy',v_ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Trust expense','dimensions',jsonb_build_array(CASE WHEN p_fund='income' THEN v_inc ELSE v_cap END)),
          jsonb_build_object('account_id',p_bank,        'txn_ccy',v_ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Paid','dimensions',jsonb_build_array(CASE WHEN p_fund='income' THEN v_inc ELSE v_cap END)));
    END IF;
    RETURN post_journal(p_trust, p_date, 'trust', COALESCE(p_desc,'Trust expense'), p_created_by, v_lines);
END $$;

-- distribute to a beneficiary (income or capital)
CREATE OR REPLACE FUNCTION distribute_to_beneficiary(
    p_trust bigint, p_beneficiary bigint, p_date date, p_fund text, p_amount numeric,
    p_dist_acct bigint, p_bank bigint, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_ccy char(3); v_dim bigint; v_jid bigint;
BEGIN
    IF p_fund NOT IN ('income','capital') THEN RAISE EXCEPTION 'fund must be income or capital'; END IF;
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_trust;
    v_dim := fund_value(CASE WHEN p_fund='income' THEN 'INC' ELSE 'CAP' END);
    v_jid := post_journal(p_trust, p_date, 'trust-distribution', 'Distribution to beneficiary ('||p_fund||')', p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',p_dist_acct,'txn_ccy',v_ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Distribution','dimensions',jsonb_build_array(v_dim)),
        jsonb_build_object('account_id',p_bank,     'txn_ccy',v_ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Paid to beneficiary','dimensions',jsonb_build_array(v_dim))));
    INSERT INTO trust_distribution(trust_entity_id,beneficiary_id,dist_date,fund,amount,journal_id)
    VALUES (p_trust,p_beneficiary,p_date,p_fund,p_amount,v_jid);
    RETURN v_jid;
END $$;


-- net assets attributable to each fund = the fund balance (income / capital account)
CREATE OR REPLACE VIEW v_trust_fund_position AS
SELECT j.entity_id AS trust_entity_id, e.company_code, dv.code AS fund, dv.name AS fund_name,
       SUM(jl.func_amount) AS fund_balance
FROM journal_line jl
JOIN journal j ON j.id = jl.journal_id AND j.status <> 'draft'
JOIN entity e ON e.id = j.entity_id AND e.is_trust
JOIN journal_line_dimension jld ON jld.journal_line_id = jl.id
JOIN dimension_value dv ON dv.id = jld.dimension_value_id
JOIN dimension_type dt ON dt.id = dv.dimension_type_id AND dt.code='FUND'
JOIN account a ON a.id = jl.account_id AND a.account_type = 'asset'
GROUP BY j.entity_id, e.company_code, dv.code, dv.name;

-- income & expense arising by fund (statement detail)
CREATE OR REPLACE VIEW v_trust_fund_pnl AS
SELECT j.entity_id AS trust_entity_id, dv.code AS fund,
       -SUM(CASE WHEN a.account_type='income'  THEN jl.func_amount ELSE 0 END) AS income_arising,
        SUM(CASE WHEN a.account_type='expense' THEN jl.func_amount ELSE 0 END) AS expenses
FROM journal_line jl
JOIN journal j ON j.id = jl.journal_id AND j.status <> 'draft'
JOIN entity e ON e.id = j.entity_id AND e.is_trust
JOIN journal_line_dimension jld ON jld.journal_line_id = jl.id
JOIN dimension_value dv ON dv.id = jld.dimension_value_id
JOIN dimension_type dt ON dt.id = dv.dimension_type_id AND dt.code='FUND'
JOIN account a ON a.id = jl.account_id
GROUP BY j.entity_id, dv.code;

CREATE OR REPLACE VIEW v_beneficiary_distributions AS
SELECT b.id AS beneficiary_id, b.trust_entity_id, b.name, b.beneficiary_type,
       COALESCE(SUM(d.amount) FILTER (WHERE d.fund='income'),0)  AS income_distributed,
       COALESCE(SUM(d.amount) FILTER (WHERE d.fund='capital'),0) AS capital_distributed
FROM beneficiary b
LEFT JOIN trust_distribution d ON d.beneficiary_id = b.id
GROUP BY b.id, b.trust_entity_id, b.name, b.beneficiary_type;
