-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CLIENT-MONEY RECONCILIATION  (021)
-- The monthly three-way reconciliation required for IOM client bank accounts
-- (Financial Services Rule Book 2016, Part 3): compare
--   (1) bank statement balance   (external truth)
--   (2) book / general-ledger balance of the client bank account
--   (3) Σ individual client sub-ledgers
-- Internal diff (2 vs 3) should be nil by construction; external diff (1 vs 2)
-- is reconciling items; and if money available < owed to clients that is a
-- SHORTFALL — a breach the firm must remedy by paying in (CASS/FSA principle).
-- Reconciling items aged > 3 months are flagged for investigation.
-- =====================================================================

CREATE TABLE client_money_reconciliation (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_money_account_id bigint NOT NULL REFERENCES client_money_account(id),
    recon_date              date NOT NULL,
    bank_balance            numeric(20,2) NOT NULL,   -- (1) statement
    book_balance            numeric(20,2) NOT NULL,   -- (2) GL
    client_ledger_total     numeric(20,2) NOT NULL,   -- (3) sub-ledgers
    internal_diff           numeric(20,2) NOT NULL,   -- (2)-(3), expect 0
    external_diff           numeric(20,2) NOT NULL,   -- (1)-(2), reconciling items
    shortfall               numeric(20,2) NOT NULL,   -- owed - bank, if > 0
    excess                  numeric(20,2) NOT NULL,   -- bank - owed, if > 0
    status                  text NOT NULL DEFAULT 'review' CHECK (status IN ('balanced','review','signed_off')),
    signed_off_by           text,
    created_by              text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_money_recon_item (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recon_id    bigint NOT NULL REFERENCES client_money_reconciliation(id),
    item_date   date NOT NULL,
    description text,
    amount      numeric(20,2) NOT NULL
);


-- run the three-way reconciliation as at a date for one client-money account
CREATE OR REPLACE FUNCTION run_client_money_reconciliation(
    p_cm_account bigint, p_recon_date date, p_bank_balance numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE a client_money_account%ROWTYPE; v_book numeric; v_ledger numeric;
        v_int numeric; v_ext numeric; v_short numeric; v_exc numeric; v_status text; v_id bigint;
BEGIN
    SELECT * INTO a FROM client_money_account WHERE id = p_cm_account;
    IF a.id IS NULL THEN RAISE EXCEPTION 'Client-money account % not found', p_cm_account; END IF;

    SELECT COALESCE(balance_func,0) INTO v_book FROM v_account_balance
      WHERE account_id = a.gl_account_id AND entity_id = a.cm_entity_id;
    v_book := COALESCE(v_book,0);
    SELECT COALESCE(SUM(balance),0) INTO v_ledger FROM client_money_ledger WHERE client_money_account_id = p_cm_account;

    v_int   := round(v_book - v_ledger, 2);
    v_ext   := round(p_bank_balance - v_book, 2);
    v_short := GREATEST(round(v_ledger - p_bank_balance, 2), 0);
    v_exc   := GREATEST(round(p_bank_balance - v_ledger, 2), 0);
    v_status := CASE WHEN v_int = 0 AND v_ext = 0 AND v_short = 0 THEN 'balanced' ELSE 'review' END;

    INSERT INTO client_money_reconciliation(client_money_account_id,recon_date,bank_balance,book_balance,
        client_ledger_total,internal_diff,external_diff,shortfall,excess,status,created_by)
    VALUES (p_cm_account,p_recon_date,p_bank_balance,v_book,v_ledger,v_int,v_ext,v_short,v_exc,v_status,p_created_by)
    RETURNING id INTO v_id;

    IF v_short > 0 THEN   -- money available < owed to clients: firm must pay in
        INSERT INTO client_money_breach(client_money_account_id,breach_date,breach_type,amount,description)
        VALUES (p_cm_account,p_recon_date,'shortfall',v_short,
                'Reconciliation shortfall: client bank < amounts owed to clients; firm to pay in');
    END IF;
    RETURN v_id;
END $$;


CREATE OR REPLACE FUNCTION add_recon_item(p_recon_id bigint, p_item_date date, p_description text, p_amount numeric)
RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO client_money_recon_item(recon_id,item_date,description,amount)
    VALUES (p_recon_id,p_item_date,p_description,p_amount) RETURNING id;
$$;


CREATE OR REPLACE FUNCTION sign_off_reconciliation(p_recon_id bigint, p_signed_by text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_short numeric;
BEGIN
    SELECT shortfall INTO v_short FROM client_money_reconciliation WHERE id = p_recon_id;
    IF v_short > 0 THEN RAISE EXCEPTION 'Cannot sign off reconciliation % with an unremedied shortfall', p_recon_id; END IF;
    UPDATE client_money_reconciliation SET status='signed_off', signed_off_by=p_signed_by WHERE id = p_recon_id;
END $$;


-- firm remedies a shortfall by paying its own money into the client account
CREATE OR REPLACE FUNCTION remediate_client_money_shortfall(
    p_recon_id bigint, p_firm_entity bigint, p_firm_bank bigint, p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r client_money_reconciliation%ROWTYPE; a client_money_account%ROWTYPE;
        v_loc text; v_cost bigint; v_jid bigint;
BEGIN
    SELECT * INTO r FROM client_money_reconciliation WHERE id = p_recon_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'Reconciliation % not found', p_recon_id; END IF;
    IF r.shortfall <= 0 THEN RAISE EXCEPTION 'Reconciliation % has no shortfall', p_recon_id; END IF;
    SELECT * INTO a FROM client_money_account WHERE id = r.client_money_account_id;
    SELECT location_code INTO v_loc FROM entity WHERE id = p_firm_entity;
    v_cost := cfg_account(p_firm_entity,'CM_FUNDING_COST');

    -- firm's own money leaves its operating bank to make the client account whole
    v_jid := post_journal(p_firm_entity, p_date, 'client-money-funding',
        'Fund client-money shortfall (recon '||p_recon_id||')', p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_cost,    'txn_ccy',a.ccy,'txn_amount', r.shortfall,'location_code',v_loc,'memo','Client money funding cost'),
          jsonb_build_object('account_id',p_firm_bank,'txn_ccy',a.ccy,'txn_amount',-r.shortfall,'location_code',v_loc,'memo','Paid into client account')));

    -- close the breach and the reconciliation
    UPDATE client_money_breach SET status='remediated'
      WHERE client_money_account_id = r.client_money_account_id AND breach_type='shortfall'
        AND breach_date = r.recon_date AND status='open';
    UPDATE client_money_reconciliation SET shortfall = 0,
        bank_balance = client_ledger_total,
        status = CASE WHEN internal_diff=0 AND external_diff=0 THEN 'balanced' ELSE 'review' END
      WHERE id = p_recon_id;
    RETURN v_jid;
END $$;


CREATE OR REPLACE VIEW v_client_money_reconciliation AS
SELECT r.id, ma.name AS account, ma.account_type, r.recon_date,
       r.bank_balance, r.book_balance, r.client_ledger_total,
       r.internal_diff, r.external_diff, r.shortfall, r.excess, r.status, r.signed_off_by
FROM client_money_reconciliation r
JOIN client_money_account ma ON ma.id = r.client_money_account_id;

-- reconciling items older than three months (IOM/RICS investigate threshold)
CREATE OR REPLACE VIEW v_client_money_aged_items AS
SELECT i.recon_id, ma.name AS account, i.item_date, i.description, i.amount,
       (CURRENT_DATE - i.item_date) AS age_days
FROM client_money_recon_item i
JOIN client_money_reconciliation r ON r.id = i.recon_id
JOIN client_money_account ma ON ma.id = r.client_money_account_id
WHERE (CURRENT_DATE - i.item_date) > 90;
