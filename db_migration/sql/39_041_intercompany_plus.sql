-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  INTERCOMPANY LOANS / TP / SETTLEMENT  (041)
-- Builds on 017 (post_intercompany_charge, intercompany_charge, recon):
--   * intercompany loans: drawdown / interest accrual / repayment
--   * transfer pricing: cost-plus markup policy on intercompany charges
--   * settlement: cash-settle intercompany trading balances, with history
-- =====================================================================

-- loan + interest accounts and roles
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'1310','Intercompany loan receivable','asset','D'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1310');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'2510','Intercompany loan payable','liability','C'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2510');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'4400','Intercompany interest income','income','C'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4400');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'6410','Intercompany interest expense','expense','D'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6410');

INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'IC_LOAN_RECEIVABLE',id FROM account WHERE coa_template_id=1 AND code='1310' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'IC_LOAN_PAYABLE',id FROM account WHERE coa_template_id=1 AND code='2510' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'IC_INTEREST_INCOME',id FROM account WHERE coa_template_id=1 AND code='4400' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'IC_INTEREST_EXPENSE',id FROM account WHERE coa_template_id=1 AND code='6410' ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS ic_loan (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lender_entity bigint NOT NULL REFERENCES entity(id),
    borrower_entity bigint NOT NULL REFERENCES entity(id),
    ccy           char(3) NOT NULL,
    facility      numeric(20,2),
    interest_rate numeric(7,4) NOT NULL DEFAULT 0,   -- annual %
    start_date    date NOT NULL,
    status        text NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS ic_loan_movement (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loan_id    bigint NOT NULL REFERENCES ic_loan(id),
    move_date  date NOT NULL,
    move_type  text NOT NULL CHECK (move_type IN ('drawdown','interest','repayment')),
    amount     numeric(20,2) NOT NULL,
    lender_journal_id bigint,
    borrower_journal_id bigint
);

-- drawdown: lender funds borrower
CREATE OR REPLACE FUNCTION draw_ic_loan(p_loan bigint, p_date date, p_amount numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE l ic_loan%ROWTYPE; lloc text; bloc text; jl bigint; jb bigint;
BEGIN
    SELECT * INTO l FROM ic_loan WHERE id=p_loan;
    SELECT location_code INTO lloc FROM entity WHERE id=l.lender_entity;
    SELECT location_code INTO bloc FROM entity WHERE id=l.borrower_entity;
    jl := post_journal(l.lender_entity,p_date,'ic-loan','Loan drawdown to borrower',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'IC_LOAN_RECEIVABLE'),'txn_ccy',l.ccy,'txn_amount', p_amount,'location_code',lloc,'memo','Loan receivable'),
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'BANK'),'txn_ccy',l.ccy,'txn_amount',-p_amount,'location_code',lloc,'memo','Cash advanced')));
    jb := post_journal(l.borrower_entity,p_date,'ic-loan','Loan drawdown from lender',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'BANK'),'txn_ccy',l.ccy,'txn_amount', p_amount,'location_code',bloc,'memo','Cash received'),
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'IC_LOAN_PAYABLE'),'txn_ccy',l.ccy,'txn_amount',-p_amount,'location_code',bloc,'memo','Loan payable')));
    INSERT INTO ic_loan_movement(loan_id,move_date,move_type,amount,lender_journal_id,borrower_journal_id)
      VALUES (p_loan,p_date,'drawdown',p_amount,jl,jb);
    RETURN p_loan;
END $$;

-- outstanding principal (drawdowns less repayments)
CREATE OR REPLACE FUNCTION ic_loan_principal(p_loan bigint, p_as_at date DEFAULT current_date)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT COALESCE(SUM(CASE WHEN move_type='drawdown' THEN amount WHEN move_type='repayment' THEN -amount ELSE 0 END),0)
    FROM ic_loan_movement WHERE loan_id=p_loan AND move_date<=p_as_at;
$$;

-- accrue interest on outstanding principal for a number of days
CREATE OR REPLACE FUNCTION accrue_ic_loan_interest(p_loan bigint, p_date date, p_days int, p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE l ic_loan%ROWTYPE; lloc text; bloc text; v_int numeric; jl bigint; jb bigint;
BEGIN
    SELECT * INTO l FROM ic_loan WHERE id=p_loan;
    SELECT location_code INTO lloc FROM entity WHERE id=l.lender_entity;
    SELECT location_code INTO bloc FROM entity WHERE id=l.borrower_entity;
    v_int := round(ic_loan_principal(p_loan,p_date) * l.interest_rate/100.0 * p_days/365.0, 2);
    IF v_int <= 0 THEN RETURN 0; END IF;
    jl := post_journal(l.lender_entity,p_date,'ic-loan-interest','Loan interest income',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'IC_LOAN_RECEIVABLE'),'txn_ccy',l.ccy,'txn_amount', v_int,'location_code',lloc,'memo','Interest accrued'),
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'IC_INTEREST_INCOME'),'txn_ccy',l.ccy,'txn_amount',-v_int,'location_code',lloc,'memo','Interest income')));
    jb := post_journal(l.borrower_entity,p_date,'ic-loan-interest','Loan interest expense',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'IC_INTEREST_EXPENSE'),'txn_ccy',l.ccy,'txn_amount', v_int,'location_code',bloc,'memo','Interest expense'),
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'IC_LOAN_PAYABLE'),'txn_ccy',l.ccy,'txn_amount',-v_int,'location_code',bloc,'memo','Interest payable')));
    INSERT INTO ic_loan_movement(loan_id,move_date,move_type,amount,lender_journal_id,borrower_journal_id)
      VALUES (p_loan,p_date,'interest',v_int,jl,jb);
    RETURN v_int;
END $$;

-- repayment: borrower repays lender
CREATE OR REPLACE FUNCTION repay_ic_loan(p_loan bigint, p_date date, p_amount numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE l ic_loan%ROWTYPE; lloc text; bloc text; jl bigint; jb bigint;
BEGIN
    SELECT * INTO l FROM ic_loan WHERE id=p_loan;
    SELECT location_code INTO lloc FROM entity WHERE id=l.lender_entity;
    SELECT location_code INTO bloc FROM entity WHERE id=l.borrower_entity;
    jb := post_journal(l.borrower_entity,p_date,'ic-loan','Loan repayment to lender',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'IC_LOAN_PAYABLE'),'txn_ccy',l.ccy,'txn_amount', p_amount,'location_code',bloc,'memo','Loan repaid'),
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'BANK'),'txn_ccy',l.ccy,'txn_amount',-p_amount,'location_code',bloc,'memo','Cash paid')));
    jl := post_journal(l.lender_entity,p_date,'ic-loan','Loan repayment from borrower',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'BANK'),'txn_ccy',l.ccy,'txn_amount', p_amount,'location_code',lloc,'memo','Cash received'),
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'IC_LOAN_RECEIVABLE'),'txn_ccy',l.ccy,'txn_amount',-p_amount,'location_code',lloc,'memo','Loan receivable reduced')));
    INSERT INTO ic_loan_movement(loan_id,move_date,move_type,amount,lender_journal_id,borrower_journal_id)
      VALUES (p_loan,p_date,'repayment',p_amount,jl,jb);
    RETURN p_loan;
END $$;

-- ----- transfer pricing: cost-plus markup policy on intercompany charges -----
CREATE TABLE IF NOT EXISTS tp_policy (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_entity  bigint NOT NULL REFERENCES entity(id),
    to_entity    bigint NOT NULL REFERENCES entity(id),
    service_type text NOT NULL,
    markup_pct   numeric(7,4) NOT NULL DEFAULT 0
);

-- charge an arm's-length price = cost base + policy markup, via the IC engine
CREATE OR REPLACE FUNCTION post_tp_charge(
    p_from bigint, p_to bigint, p_date date, p_ccy char(3), p_cost_base numeric,
    p_service_type text, p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_markup numeric; v_price numeric;
BEGIN
    SELECT markup_pct INTO v_markup FROM tp_policy
      WHERE from_entity=p_from AND to_entity=p_to AND service_type=p_service_type LIMIT 1;
    v_markup := COALESCE(v_markup,0);
    v_price  := round(p_cost_base * (1 + v_markup/100.0), 2);
    PERFORM post_intercompany_charge(p_from,p_to,p_date,p_ccy,v_price,
        'TP '||p_service_type||' (cost + '||v_markup||'%)', p_created_by);
    RETURN v_price;
END $$;

-- ----- settlement of intercompany trading balances -----
CREATE TABLE IF NOT EXISTS ic_settlement (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    creditor_entity bigint NOT NULL REFERENCES entity(id),   -- holds the receivable
    debtor_entity   bigint NOT NULL REFERENCES entity(id),   -- holds the payable
    settle_date  date NOT NULL,
    ccy          char(3) NOT NULL,
    amount       numeric(20,2) NOT NULL,
    creditor_journal_id bigint,
    debtor_journal_id bigint
);

-- debtor pays creditor; clears IC trading receivable/payable
CREATE OR REPLACE FUNCTION settle_intercompany(
    p_creditor bigint, p_debtor bigint, p_date date, p_ccy char(3), p_amount numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE cloc text; dloc text; jc bigint; jd bigint; v_id bigint;
BEGIN
    SELECT location_code INTO cloc FROM entity WHERE id=p_creditor;
    SELECT location_code INTO dloc FROM entity WHERE id=p_debtor;
    jc := post_journal(p_creditor,p_date,'ic-settle','IC settlement received',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(p_creditor,'BANK'),'txn_ccy',p_ccy,'txn_amount', p_amount,'location_code',cloc,'memo','Cash received'),
            jsonb_build_object('account_id',cfg_account(p_creditor,'IC_RECEIVABLE'),'txn_ccy',p_ccy,'txn_amount',-p_amount,'location_code',cloc,'memo','IC receivable cleared')));
    jd := post_journal(p_debtor,p_date,'ic-settle','IC settlement paid',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(p_debtor,'IC_PAYABLE'),'txn_ccy',p_ccy,'txn_amount', p_amount,'location_code',dloc,'memo','IC payable cleared'),
            jsonb_build_object('account_id',cfg_account(p_debtor,'BANK'),'txn_ccy',p_ccy,'txn_amount',-p_amount,'location_code',dloc,'memo','Cash paid')));
    INSERT INTO ic_settlement(creditor_entity,debtor_entity,settle_date,ccy,amount,creditor_journal_id,debtor_journal_id)
      VALUES (p_creditor,p_debtor,p_date,p_ccy,p_amount,jc,jd) RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- net intercompany loan position
CREATE OR REPLACE VIEW v_ic_loan_position AS
SELECT l.id AS loan_id, l.lender_entity, l.borrower_entity, l.ccy, l.interest_rate,
       ic_loan_principal(l.id, current_date) AS outstanding_principal,
       COALESCE(SUM(m.amount) FILTER (WHERE m.move_type='interest'),0) AS interest_accrued,
       l.status
FROM ic_loan l LEFT JOIN ic_loan_movement m ON m.loan_id=l.id
GROUP BY l.id, l.lender_entity, l.borrower_entity, l.ccy, l.interest_rate, l.status;
