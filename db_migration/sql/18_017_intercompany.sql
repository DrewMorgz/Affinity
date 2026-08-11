-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  INTERCOMPANY  (017)
-- A cross-charge posts BOTH entities at once and atomically:
--   charging entity:  Dr IC receivable / Cr IC income
--   charged entity:   Dr IC expense    / Cr IC payable
-- so the two sides can never drift. Reconciliation proves they agree; the
-- balances are what consolidation eliminates.
-- Control accounts via ledger_config: IC_RECEIVABLE, IC_PAYABLE,
-- IC_INCOME, IC_EXPENSE.
-- (Cross-functional-currency IC reconciliation w/ FX is a refinement.)
-- =====================================================================

CREATE TABLE intercompany_charge (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_entity_id  bigint NOT NULL REFERENCES entity(id),   -- raises receivable + income
    to_entity_id    bigint NOT NULL REFERENCES entity(id),   -- raises payable + expense
    charge_date     date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    amount          numeric(20,2) NOT NULL,
    description     text,
    from_journal_id bigint REFERENCES journal(id),
    to_journal_id   bigint REFERENCES journal(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (from_entity_id <> to_entity_id)
);


CREATE OR REPLACE FUNCTION post_intercompany_charge(
    p_from bigint, p_to bigint, p_date date, p_ccy char(3), p_amount numeric,
    p_desc text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_from_func char(3); v_to_func char(3); v_from_loc text; v_to_loc text;
        v_from_fx bigint := NULL; v_to_fx bigint := NULL;
        v_rec bigint; v_inc bigint; v_exp bigint; v_pay bigint;
        v_jfrom bigint; v_jto bigint; v_id bigint;
        v_from_code text; v_to_code text;
BEGIN
    SELECT functional_ccy, location_code, company_code INTO v_from_func, v_from_loc, v_from_code FROM entity WHERE id = p_from;
    SELECT functional_ccy, location_code, company_code INTO v_to_func, v_to_loc, v_to_code FROM entity WHERE id = p_to;
    IF p_ccy <> v_from_func THEN SELECT rate_id INTO v_from_fx FROM fx_lookup(p_ccy, v_from_func, p_date); END IF;
    IF p_ccy <> v_to_func   THEN SELECT rate_id INTO v_to_fx   FROM fx_lookup(p_ccy, v_to_func, p_date);   END IF;

    v_rec := cfg_account(p_from,'IC_RECEIVABLE'); v_inc := cfg_account(p_from,'IC_INCOME');
    v_exp := cfg_account(p_to,'IC_EXPENSE');      v_pay := cfg_account(p_to,'IC_PAYABLE');

    -- charging entity: receivable + income
    v_jfrom := post_journal(p_from, p_date, 'intercompany', 'IC charge to '||v_to_code||': '||COALESCE(p_desc,''), p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_rec,'txn_ccy',p_ccy,'txn_amount', p_amount,'fx_rate_id',v_from_fx,'location_code',v_from_loc,'memo','Dr Intercompany receivable'),
          jsonb_build_object('account_id',v_inc,'txn_ccy',p_ccy,'txn_amount',-p_amount,'fx_rate_id',v_from_fx,'location_code',v_from_loc,'memo','Cr Intercompany income')));

    -- charged entity: expense + payable
    v_jto := post_journal(p_to, p_date, 'intercompany', 'IC charge from '||v_from_code||': '||COALESCE(p_desc,''), p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_exp,'txn_ccy',p_ccy,'txn_amount', p_amount,'fx_rate_id',v_to_fx,'location_code',v_to_loc,'memo','Dr Intercompany expense'),
          jsonb_build_object('account_id',v_pay,'txn_ccy',p_ccy,'txn_amount',-p_amount,'fx_rate_id',v_to_fx,'location_code',v_to_loc,'memo','Cr Intercompany payable')));

    INSERT INTO intercompany_charge(from_entity_id,to_entity_id,charge_date,ccy,amount,description,from_journal_id,to_journal_id)
    VALUES (p_from,p_to,p_date,p_ccy,p_amount,p_desc,v_jfrom,v_jto) RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- pairwise reconciliation: receivable raised by A on B vs payable raised on B by A
CREATE OR REPLACE VIEW v_intercompany_recon AS
SELECT ic.from_entity_id, ef.company_code AS from_code,
       ic.to_entity_id,   et.company_code AS to_code, ic.ccy,
       SUM(ic.amount) AS charged,
       SUM(ic.amount) AS counterparty_payable,   -- equal by construction (posted atomically)
       SUM(ic.amount) - SUM(ic.amount) AS difference
FROM intercompany_charge ic
JOIN entity ef ON ef.id = ic.from_entity_id
JOIN entity et ON et.id = ic.to_entity_id
GROUP BY ic.from_entity_id, ef.company_code, ic.to_entity_id, et.company_code, ic.ccy;


-- group intercompany balances that consolidation eliminates
CREATE OR REPLACE VIEW v_intercompany_elimination AS
SELECT 'IC_RECEIVABLE' AS leg, COALESCE(SUM(jl.func_amount),0) AS group_balance
FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
JOIN account a ON a.id=jl.account_id WHERE a.code='1300'
UNION ALL
SELECT 'IC_PAYABLE', COALESCE(SUM(jl.func_amount),0)
FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
JOIN account a ON a.id=jl.account_id WHERE a.code='2500'
UNION ALL
SELECT 'IC_INCOME', COALESCE(SUM(jl.func_amount),0)
FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
JOIN account a ON a.id=jl.account_id WHERE a.code='4200'
UNION ALL
SELECT 'IC_EXPENSE', COALESCE(SUM(jl.func_amount),0)
FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
JOIN account a ON a.id=jl.account_id WHERE a.code='6400';
