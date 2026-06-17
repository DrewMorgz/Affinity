-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  ACCOUNTS PAYABLE  (006)
-- Supplier master + purchase ledger + payment run.
-- The payment run posts Dr Purchase Ledger Control / Cr Bank and settles
-- open supplier invoices. Disbursements now register here too, so they
-- settle through the same run (one creditor model, not two).
-- =====================================================================

CREATE TABLE supplier (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text UNIQUE NOT NULL,
    default_ccy char(3) REFERENCES currency(code),
    bank_details text,
    is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE supplier_invoice (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id     bigint NOT NULL REFERENCES supplier(id),
    entity_id       bigint NOT NULL REFERENCES entity(id),   -- whose books the creditor sits on
    reference       text,
    invoice_date    date NOT NULL,
    due_date        date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    net             numeric(20,2) NOT NULL,
    vat             numeric(20,2) NOT NULL DEFAULT 0,
    gross           numeric(20,2) NOT NULL,
    outstanding     numeric(20,2) NOT NULL,
    is_disbursement boolean NOT NULL DEFAULT false,
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','part_paid','paid')),
    purchase_journal_id bigint REFERENCES journal(id)
);

CREATE TABLE payment (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    payment_date    date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    amount          numeric(20,2) NOT NULL,
    journal_id      bigint REFERENCES journal(id),
    created_by      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_allocation (
    payment_id          bigint NOT NULL REFERENCES payment(id),
    supplier_invoice_id bigint NOT NULL REFERENCES supplier_invoice(id),
    amount              numeric(20,2) NOT NULL,
    PRIMARY KEY (payment_id, supplier_invoice_id)
);

-- link disbursements to their payable invoice
ALTER TABLE disbursement ADD COLUMN supplier_invoice_id bigint REFERENCES supplier_invoice(id);


-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_or_create_supplier(p_name text, p_ccy char(3))
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
    SELECT id INTO v_id FROM supplier WHERE name = p_name;
    IF v_id IS NULL THEN
        INSERT INTO supplier(name, default_ccy) VALUES (p_name, p_ccy) RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
END $$;


-- ---------------------------------------------------------------------
-- record_supplier_invoice() — a normal purchase invoice (overheads etc).
-- Dr Expense (net) + Dr VAT Input (vat) / Cr Purchase Ledger Control (gross).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_supplier_invoice(
    p_entity_id bigint, p_supplier text, p_reference text,
    p_invoice_date date, p_due_date date, p_net numeric, p_vat_code int,
    p_ccy char(3), p_expense_account_id bigint, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_sup bigint := get_or_create_supplier(p_supplier, p_ccy);
        v_plc bigint := cfg_account(p_entity_id,'PLC');
        v_vatin bigint;
        v_rate numeric(6,4); v_vat numeric(20,2); v_gross numeric(20,2);
        v_loc text; v_jid bigint; v_inv bigint; v_lines jsonb;
BEGIN
    SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = p_vat_code;
    v_rate := COALESCE(v_rate,0);
    v_vat  := round(p_net * v_rate, 2);
    v_gross := p_net + v_vat;
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;

    v_lines := jsonb_build_array(
        jsonb_build_object('account_id',p_expense_account_id,'txn_ccy',p_ccy,'txn_amount',p_net,'location_code',v_loc,'memo','Dr Expense'),
        jsonb_build_object('account_id',v_plc,'txn_ccy',p_ccy,'txn_amount',-v_gross,'location_code',v_loc,'memo','Cr Purchase Ledger Control'));
    IF v_vat <> 0 THEN
        v_vatin := cfg_account(p_entity_id,'VAT_INPUT');
        v_lines := v_lines || jsonb_build_object('account_id',v_vatin,'txn_ccy',p_ccy,'txn_amount',v_vat,'location_code',v_loc,'memo','Dr VAT Input');
    END IF;

    v_jid := post_journal(p_entity_id, p_invoice_date, 'purchase',
        'Supplier invoice ' || COALESCE(p_reference,'') || ' (' || p_supplier || ')', p_created_by, v_lines);

    INSERT INTO supplier_invoice(supplier_id,entity_id,reference,invoice_date,due_date,ccy,net,vat,gross,outstanding,purchase_journal_id)
    VALUES (v_sup,p_entity_id,p_reference,p_invoice_date,p_due_date,p_ccy,p_net,v_vat,v_gross,v_gross,v_jid)
    RETURNING id INTO v_inv;
    RETURN v_inv;
END $$;


-- ---------------------------------------------------------------------
-- record_disbursement() — REPLACED. Same posting as before, but now also
-- creates a payable supplier_invoice (is_disbursement = true) so the cost
-- settles through the payment run.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_disbursement(
    p_entity_id bigint, p_supplier text, p_amount numeric, p_ccy char(3),
    p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_plc  bigint := cfg_account(p_entity_id,'PLC');
        v_sup  bigint; v_jid bigint; v_id bigint; v_inv bigint; v_loc text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM entity WHERE id = p_entity_id) THEN
        RAISE EXCEPTION 'Disbursement must be allocated to a valid client to charge';
    END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;
    v_sup := get_or_create_supplier(p_supplier, p_ccy);

    v_jid := post_journal(p_entity_id, p_date, 'disbursement',
        'Supplier disbursement: ' || p_supplier, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_disb,'txn_ccy',p_ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Dr Disbursements'),
          jsonb_build_object('account_id',v_plc ,'txn_ccy',p_ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Cr Purchase Ledger Control')));

    INSERT INTO supplier_invoice(supplier_id,entity_id,reference,invoice_date,due_date,ccy,net,vat,gross,outstanding,is_disbursement,purchase_journal_id)
    VALUES (v_sup,p_entity_id,'disbursement',p_date,p_date,p_ccy,p_amount,0,p_amount,p_amount,true,v_jid)
    RETURNING id INTO v_inv;

    INSERT INTO disbursement(entity_id,supplier,amount,ccy,incurred_date,status,purchase_journal_id,supplier_invoice_id)
    VALUES (p_entity_id,p_supplier,p_amount,p_ccy,p_date,'open',v_jid,v_inv)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- ---------------------------------------------------------------------
-- run_payment() — the payment run. Settles all open supplier invoices for
-- the entity due on/before p_up_to_due (all open if null) in one batch:
-- Dr Purchase Ledger Control / Cr Bank, allocate, mark paid.
-- (Partial payment and multi-currency settlement are later refinements.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_payment(
    p_entity_id bigint, p_payment_date date, p_up_to_due date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_plc bigint := cfg_account(p_entity_id,'PLC');
        v_bank bigint := cfg_account(p_entity_id,'BANK');
        v_total numeric(20,2); v_ccy char(3); v_loc text; v_jid bigint; v_pay bigint;
        v_inv record;
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;

    SELECT COALESCE(SUM(outstanding),0), MAX(ccy) INTO v_total, v_ccy
    FROM supplier_invoice
    WHERE entity_id = p_entity_id AND status <> 'paid'
      AND (p_up_to_due IS NULL OR due_date <= p_up_to_due);
    IF v_total = 0 THEN RAISE EXCEPTION 'No supplier invoices to pay for entity %', p_entity_id; END IF;

    v_jid := post_journal(p_entity_id, p_payment_date, 'payment-run',
        'Supplier payment run', p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_plc ,'txn_ccy',v_ccy,'txn_amount', v_total,'location_code',v_loc,'memo','Dr Purchase Ledger Control'),
          jsonb_build_object('account_id',v_bank,'txn_ccy',v_ccy,'txn_amount',-v_total,'location_code',v_loc,'memo','Cr Bank')));

    INSERT INTO payment(entity_id,payment_date,ccy,amount,journal_id,created_by)
    VALUES (p_entity_id,p_payment_date,v_ccy,v_total,v_jid,p_created_by) RETURNING id INTO v_pay;

    FOR v_inv IN
        SELECT id, outstanding FROM supplier_invoice
        WHERE entity_id = p_entity_id AND status <> 'paid'
          AND (p_up_to_due IS NULL OR due_date <= p_up_to_due)
    LOOP
        INSERT INTO payment_allocation(payment_id,supplier_invoice_id,amount)
        VALUES (v_pay, v_inv.id, v_inv.outstanding);
        UPDATE supplier_invoice SET outstanding = 0, status = 'paid' WHERE id = v_inv.id;
    END LOOP;

    UPDATE disbursement SET status = 'billed'  -- keep disbursement lifecycle in step where already recharged
    WHERE supplier_invoice_id IN (SELECT supplier_invoice_id FROM payment_allocation WHERE payment_id = v_pay)
      AND status = 'billed';

    RETURN v_pay;
END $$;
