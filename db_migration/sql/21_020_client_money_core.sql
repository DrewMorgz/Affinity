-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CLIENT-MONEY CORE  (020)
-- Regulated client money the firm holds on trust, kept OFF the firm's own
-- books (entity.is_client_money). Pooled accounts carry a per-client
-- sub-ledger; designated accounts are tied to one client. Every movement is
-- double-entry within the client-money ledger, so by construction
--   client bank balance = client money held (control) = Σ client sub-ledgers.
-- A client going individually negative (spending into the pool) is ALLOWED
-- but raises a breach for remediation (per design A8). Fee transfers to the
-- firm are only ever made against a raised invoice (A4).
-- Control account via ledger_config: CM_CONTROL ('Client money held').
-- =====================================================================

ALTER TABLE entity ADD COLUMN is_client_money boolean NOT NULL DEFAULT false;

-- the party whose money is held (may link to an administered entity)
CREATE TABLE cm_client (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name           text NOT NULL,
    entity_link_id bigint REFERENCES entity(id),   -- if the client is an administered entity
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- a client bank account in the client-money ledger (pooled or designated)
CREATE TABLE client_money_account (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cm_entity_id         bigint NOT NULL REFERENCES entity(id),     -- the client-money ledger entity
    gl_account_id        bigint NOT NULL REFERENCES account(id),    -- the client bank GL account (asset)
    name                 text NOT NULL,
    account_type         text NOT NULL CHECK (account_type IN ('pooled','designated')),
    designated_client_id bigint REFERENCES cm_client(id),
    ccy                  char(3) NOT NULL REFERENCES currency(code),
    created_at           timestamptz NOT NULL DEFAULT now(),
    CHECK ( (account_type='designated' AND designated_client_id IS NOT NULL)
         OR (account_type='pooled'     AND designated_client_id IS NULL) )
);

-- running balance owed to each client within each account (the sub-ledger)
CREATE TABLE client_money_ledger (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cm_client_id            bigint NOT NULL REFERENCES cm_client(id),
    client_money_account_id bigint NOT NULL REFERENCES client_money_account(id),
    balance                 numeric(20,2) NOT NULL DEFAULT 0,
    UNIQUE (cm_client_id, client_money_account_id)
);

CREATE TABLE client_money_movement (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cm_client_id            bigint NOT NULL REFERENCES cm_client(id),
    client_money_account_id bigint NOT NULL REFERENCES client_money_account(id),
    movement_date           date NOT NULL,
    movement_type           text NOT NULL CHECK (movement_type IN ('receipt','payment','fee_transfer')),
    amount                  numeric(20,2) NOT NULL,        -- signed: + increases amount owed to client
    journal_id              bigint REFERENCES journal(id),
    related_invoice_id      bigint REFERENCES invoice(id),
    description             text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_money_breach (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cm_client_id            bigint REFERENCES cm_client(id),
    client_money_account_id bigint REFERENCES client_money_account(id),
    breach_date             date NOT NULL,
    breach_type             text NOT NULL CHECK (breach_type IN ('client_negative','shortfall')),
    amount                  numeric(20,2) NOT NULL,
    status                  text NOT NULL DEFAULT 'open' CHECK (status IN ('open','remediated')),
    description             text,
    created_at              timestamptz NOT NULL DEFAULT now()
);


-- adjust a client's sub-ledger balance, return the new balance
CREATE OR REPLACE FUNCTION cm_adjust_ledger(p_client bigint, p_account bigint, p_delta numeric)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_bal numeric;
BEGIN
    INSERT INTO client_money_ledger(cm_client_id, client_money_account_id, balance)
    VALUES (p_client, p_account, p_delta)
    ON CONFLICT (cm_client_id, client_money_account_id)
    DO UPDATE SET balance = client_money_ledger.balance + p_delta
    RETURNING balance INTO v_bal;
    RETURN v_bal;
END $$;


-- receive client money: Dr client bank / Cr client money held
CREATE OR REPLACE FUNCTION receive_client_money(
    p_cm_client bigint, p_cm_account bigint, p_date date, p_amount numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE a client_money_account%ROWTYPE; v_ctrl bigint; v_loc text; v_jid bigint; v_mv bigint; v_name text;
BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Receipt amount must be positive'; END IF;
    SELECT * INTO a FROM client_money_account WHERE id = p_cm_account;
    IF a.id IS NULL THEN RAISE EXCEPTION 'Client-money account % not found', p_cm_account; END IF;
    IF a.account_type='designated' AND a.designated_client_id <> p_cm_client THEN
        RAISE EXCEPTION 'Account % is designated to another client', p_cm_account; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = a.cm_entity_id;
    v_ctrl := cfg_account(a.cm_entity_id,'CM_CONTROL');
    SELECT name INTO v_name FROM cm_client WHERE id = p_cm_client;

    v_jid := post_journal(a.cm_entity_id, p_date, 'client-money', 'Client money receipt: '||v_name, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',a.gl_account_id,'txn_ccy',a.ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Client bank'),
          jsonb_build_object('account_id',v_ctrl,        'txn_ccy',a.ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Client money held')));

    PERFORM cm_adjust_ledger(p_cm_client, p_cm_account, p_amount);
    INSERT INTO client_money_movement(cm_client_id,client_money_account_id,movement_date,movement_type,amount,journal_id,description)
    VALUES (p_cm_client,p_cm_account,p_date,'receipt',p_amount,v_jid,'Receipt of client money') RETURNING id INTO v_mv;
    RETURN v_mv;
END $$;


-- pay client money out (on the client's behalf): Dr client money held / Cr client bank
CREATE OR REPLACE FUNCTION pay_client_money(
    p_cm_client bigint, p_cm_account bigint, p_date date, p_amount numeric, p_desc text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE a client_money_account%ROWTYPE; v_ctrl bigint; v_loc text; v_jid bigint; v_mv bigint; v_name text; v_newbal numeric;
BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
    SELECT * INTO a FROM client_money_account WHERE id = p_cm_account;
    IF a.id IS NULL THEN RAISE EXCEPTION 'Client-money account % not found', p_cm_account; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = a.cm_entity_id;
    v_ctrl := cfg_account(a.cm_entity_id,'CM_CONTROL');
    SELECT name INTO v_name FROM cm_client WHERE id = p_cm_client;

    v_jid := post_journal(a.cm_entity_id, p_date, 'client-money', 'Client money payment: '||v_name||' — '||COALESCE(p_desc,''), p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_ctrl,        'txn_ccy',a.ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Client money held'),
          jsonb_build_object('account_id',a.gl_account_id,'txn_ccy',a.ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Client bank')));

    v_newbal := cm_adjust_ledger(p_cm_client, p_cm_account, -p_amount);
    INSERT INTO client_money_movement(cm_client_id,client_money_account_id,movement_date,movement_type,amount,journal_id,description)
    VALUES (p_cm_client,p_cm_account,p_date,'payment',-p_amount,v_jid,p_desc) RETURNING id INTO v_mv;

    IF v_newbal < 0 THEN   -- client overdrawn into the pool: allowed, but a breach to remediate
        INSERT INTO client_money_breach(cm_client_id,client_money_account_id,breach_date,breach_type,amount,description)
        VALUES (p_cm_client,p_cm_account,p_date,'client_negative',-v_newbal,
                'Client balance negative after payment — using other clients'' funds; remediate');
    END IF;
    RETURN v_mv;
END $$;


-- transfer a fee from client money to the firm, against a raised invoice (A4)
CREATE OR REPLACE FUNCTION transfer_fee_from_client_money(
    p_cm_client bigint, p_cm_account bigint, p_firm_entity bigint, p_firm_bank bigint,
    p_invoice_id bigint, p_amount numeric, p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE a client_money_account%ROWTYPE; v_ctrl bigint; v_loc text; v_jid bigint; v_mv bigint;
        v_name text; v_newbal numeric; v_inv invoice%ROWTYPE;
BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Transfer amount must be positive'; END IF;
    SELECT * INTO v_inv FROM invoice WHERE id = p_invoice_id;
    IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
    IF v_inv.entity_id <> p_firm_entity THEN RAISE EXCEPTION 'Invoice % is not the firm entity''s', p_invoice_id; END IF;
    IF p_amount > v_inv.outstanding THEN RAISE EXCEPTION 'Transfer % exceeds invoice outstanding %', p_amount, v_inv.outstanding; END IF;

    SELECT * INTO a FROM client_money_account WHERE id = p_cm_account;
    SELECT location_code INTO v_loc FROM entity WHERE id = a.cm_entity_id;
    v_ctrl := cfg_account(a.cm_entity_id,'CM_CONTROL');
    SELECT name INTO v_name FROM cm_client WHERE id = p_cm_client;

    -- client-money side: money leaves the client account
    v_jid := post_journal(a.cm_entity_id, p_date, 'client-money', 'Fee transfer to firm: '||v_name||' (inv '||p_invoice_id||')', p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_ctrl,        'txn_ccy',a.ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Client money held'),
          jsonb_build_object('account_id',a.gl_account_id,'txn_ccy',a.ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Client bank')));

    v_newbal := cm_adjust_ledger(p_cm_client, p_cm_account, -p_amount);
    INSERT INTO client_money_movement(cm_client_id,client_money_account_id,movement_date,movement_type,amount,journal_id,related_invoice_id,description)
    VALUES (p_cm_client,p_cm_account,p_date,'fee_transfer',-p_amount,v_jid,p_invoice_id,'Fee transfer to firm') RETURNING id INTO v_mv;
    IF v_newbal < 0 THEN
        INSERT INTO client_money_breach(cm_client_id,client_money_account_id,breach_date,breach_type,amount,description)
        VALUES (p_cm_client,p_cm_account,p_date,'client_negative',-v_newbal,'Client balance negative after fee transfer; remediate');
    END IF;

    -- firm side: the firm receives the fee into its operating bank and the invoice is settled
    PERFORM apply_receipt(p_firm_entity, p_date, v_inv.ccy, p_created_by,
        jsonb_build_array(jsonb_build_object('invoice_id',p_invoice_id,'amount',p_amount)), p_firm_bank);
    RETURN v_mv;
END $$;


-- per-client position
CREATE OR REPLACE VIEW v_client_money_position AS
SELECT l.cm_client_id, c.name AS client, l.client_money_account_id, ma.name AS account,
       ma.account_type, ma.ccy, l.balance
FROM client_money_ledger l
JOIN cm_client c ON c.id = l.cm_client_id
JOIN client_money_account ma ON ma.id = l.client_money_account_id;

-- the cardinal control: bank = client money held = Σ sub-ledgers (per client-money entity)
CREATE OR REPLACE VIEW v_client_money_control AS
SELECT e.id AS cm_entity_id, e.company_code,
       COALESCE((SELECT SUM(ab.balance_func) FROM v_account_balance ab
                 JOIN client_money_account ma ON ma.gl_account_id = ab.account_id AND ma.cm_entity_id = e.id),0) AS client_bank,
       COALESCE(-(SELECT ab.balance_func FROM v_account_balance ab WHERE ab.account_id = cfg_account(e.id,'CM_CONTROL') AND ab.entity_id=e.id),0) AS client_money_held,
       COALESCE((SELECT SUM(l.balance) FROM client_money_ledger l
                 JOIN client_money_account ma ON ma.id = l.client_money_account_id AND ma.cm_entity_id = e.id),0) AS sub_ledger_total
FROM entity e WHERE e.is_client_money;
