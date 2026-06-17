-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  MULTI-CURRENCY AP + REALISED FX  (010)
-- Mirror of 009 for the payable side. Foreign supplier invoices and
-- disbursements book at the invoice-date rate; run_payment settles at the
-- payment-date rate, clears the creditor at its BOOKING rate, and posts the
-- difference as realised FX (a debit/loss when the currency moved against you).
-- =====================================================================

ALTER TABLE supplier_invoice ADD COLUMN fx_rate numeric(20,10) NOT NULL DEFAULT 1;
UPDATE supplier_invoice SET fx_rate = 1 WHERE fx_rate IS NULL;


-- record_supplier_invoice() — REPLACED: FX-aware (books at invoice-date rate)
CREATE OR REPLACE FUNCTION record_supplier_invoice(
    p_entity_id bigint, p_supplier text, p_reference text,
    p_invoice_date date, p_due_date date, p_net numeric, p_vat_code int,
    p_ccy char(3), p_expense_account_id bigint, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_sup bigint := get_or_create_supplier(p_supplier, p_ccy);
        v_plc bigint := cfg_account(p_entity_id,'PLC');
        v_vatin bigint; v_rate numeric(6,4); v_vat numeric(20,2); v_gross numeric(20,2);
        v_loc text; v_func char(3); v_fxrate numeric(20,10) := 1; v_fxid bigint := NULL;
        v_jid bigint; v_inv bigint; v_lines jsonb;
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_func FROM entity WHERE id = p_entity_id;
    IF p_ccy <> v_func THEN
        SELECT rate_id, rate INTO v_fxid, v_fxrate FROM fx_lookup(p_ccy, v_func, p_invoice_date);
        IF v_fxrate IS NULL THEN RAISE EXCEPTION 'No FX rate %->% on/before %', p_ccy, v_func, p_invoice_date; END IF;
    END IF;

    SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = p_vat_code;
    v_rate := COALESCE(v_rate,0); v_vat := round(p_net*v_rate,2); v_gross := p_net+v_vat;

    v_lines := jsonb_build_array(
        jsonb_build_object('account_id',p_expense_account_id,'txn_ccy',p_ccy,'txn_amount',p_net,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr Expense'),
        jsonb_build_object('account_id',v_plc,'txn_ccy',p_ccy,'txn_amount',-v_gross,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Purchase Ledger Control'));
    IF v_vat <> 0 THEN
        v_vatin := cfg_account(p_entity_id,'VAT_INPUT');
        v_lines := v_lines || jsonb_build_object('account_id',v_vatin,'txn_ccy',p_ccy,'txn_amount',v_vat,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr VAT Input');
    END IF;

    v_jid := post_journal(p_entity_id,p_invoice_date,'purchase','Supplier invoice '||COALESCE(p_reference,'')||' ('||p_supplier||')',p_created_by,v_lines);
    INSERT INTO supplier_invoice(supplier_id,entity_id,reference,invoice_date,due_date,ccy,net,vat,gross,outstanding,purchase_journal_id,fx_rate)
    VALUES (v_sup,p_entity_id,p_reference,p_invoice_date,p_due_date,p_ccy,p_net,v_vat,v_gross,v_gross,v_jid,v_fxrate) RETURNING id INTO v_inv;
    RETURN v_inv;
END $$;


-- record_disbursement() — REPLACED: FX-aware booking
CREATE OR REPLACE FUNCTION record_disbursement(
    p_entity_id bigint, p_supplier text, p_amount numeric, p_ccy char(3),
    p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_plc  bigint := cfg_account(p_entity_id,'PLC');
        v_sup  bigint; v_jid bigint; v_id bigint; v_inv bigint; v_loc text;
        v_func char(3); v_fxrate numeric(20,10) := 1; v_fxid bigint := NULL;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM entity WHERE id = p_entity_id) THEN
        RAISE EXCEPTION 'Disbursement must be allocated to a valid client to charge';
    END IF;
    SELECT location_code, functional_ccy INTO v_loc, v_func FROM entity WHERE id = p_entity_id;
    IF p_ccy <> v_func THEN
        SELECT rate_id, rate INTO v_fxid, v_fxrate FROM fx_lookup(p_ccy, v_func, p_date);
        IF v_fxrate IS NULL THEN RAISE EXCEPTION 'No FX rate %->% on/before %', p_ccy, v_func, p_date; END IF;
    END IF;
    v_sup := get_or_create_supplier(p_supplier, p_ccy);

    v_jid := post_journal(p_entity_id, p_date, 'disbursement','Supplier disbursement: '||p_supplier, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_disb,'txn_ccy',p_ccy,'txn_amount', p_amount,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr Disbursements'),
          jsonb_build_object('account_id',v_plc ,'txn_ccy',p_ccy,'txn_amount',-p_amount,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Purchase Ledger Control')));

    INSERT INTO supplier_invoice(supplier_id,entity_id,reference,invoice_date,due_date,ccy,net,vat,gross,outstanding,is_disbursement,purchase_journal_id,fx_rate)
    VALUES (v_sup,p_entity_id,'disbursement',p_date,p_date,p_ccy,p_amount,0,p_amount,p_amount,true,v_jid,v_fxrate) RETURNING id INTO v_inv;
    INSERT INTO disbursement(entity_id,supplier,amount,ccy,incurred_date,status,purchase_journal_id,supplier_invoice_id)
    VALUES (p_entity_id,p_supplier,p_amount,p_ccy,p_date,'open',v_jid,v_inv) RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- run_payment() — REPLACED: FX-aware with realised FX on settlement.
-- Pays open invoices in a chosen currency (defaults to functional). Clears
-- each creditor at its booking rate; cash leaves at the settlement rate.
CREATE OR REPLACE FUNCTION run_payment(
    p_entity_id bigint, p_payment_date date, p_up_to_due date, p_created_by text,
    p_ccy char(3) DEFAULT NULL, p_bank_account_id bigint DEFAULT NULL, p_settlement_rate numeric DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_func char(3); v_ccy char(3); v_plc bigint := cfg_account(p_entity_id,'PLC');
        v_bank bigint; v_realacc bigint := cfg_account(p_entity_id,'FX_REALISED'); v_loc text;
        v_settle numeric(20,10); v_total_txn numeric(20,2) := 0; v_total_plc_func numeric(20,2) := 0;
        v_bank_func numeric(20,2); v_realised numeric(20,2); v_lines jsonb := '[]'::jsonb;
        v_jid bigint; v_pay bigint; v_inv record;
BEGIN
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = p_entity_id;
    v_ccy := COALESCE(p_ccy, v_func);
    v_bank := COALESCE(p_bank_account_id, cfg_account(p_entity_id,'BANK'));
    IF v_ccy = v_func THEN v_settle := 1;
    ELSIF p_settlement_rate IS NOT NULL THEN v_settle := p_settlement_rate;
    ELSE SELECT rate INTO v_settle FROM fx_lookup(v_ccy, v_func, p_payment_date);
         IF v_settle IS NULL THEN RAISE EXCEPTION 'No settlement rate %->% on/before %', v_ccy, v_func, p_payment_date; END IF;
    END IF;

    FOR v_inv IN
        SELECT id, outstanding, fx_rate FROM supplier_invoice
        WHERE entity_id = p_entity_id AND status <> 'paid' AND ccy = v_ccy
          AND (p_up_to_due IS NULL OR due_date <= p_up_to_due)
    LOOP
        v_total_txn := v_total_txn + v_inv.outstanding;
        v_total_plc_func := v_total_plc_func + round(v_inv.outstanding * v_inv.fx_rate, 2);
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_plc, 'txn_ccy', v_ccy, 'txn_amount', v_inv.outstanding,
            'func_amount', round(v_inv.outstanding * v_inv.fx_rate, 2), 'location_code', v_loc,
            'memo', 'Clear creditor invoice ' || v_inv.id || ' @ booking ' || v_inv.fx_rate);
    END LOOP;
    IF v_total_txn = 0 THEN RAISE EXCEPTION 'No % invoices to pay for entity %', v_ccy, p_entity_id; END IF;

    v_bank_func := round(v_total_txn * v_settle, 2);
    v_realised  := v_bank_func - v_total_plc_func;   -- +ve = paid more functional than booked = loss (Dr)

    v_lines := jsonb_build_array(jsonb_build_object(
        'account_id', v_bank, 'txn_ccy', v_ccy, 'txn_amount', -v_total_txn,
        'func_amount', -v_bank_func, 'location_code', v_loc, 'memo', 'Bank payment @ settlement ' || v_settle)) || v_lines;

    IF v_realised <> 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_realacc, 'txn_ccy', v_func, 'txn_amount', v_realised,
            'func_amount', v_realised, 'location_code', v_loc, 'memo', 'Realised FX gain/(loss)');
    END IF;

    v_jid := post_journal(p_entity_id, p_payment_date, 'payment-run', 'Supplier payment run', p_created_by, v_lines);

    INSERT INTO payment(entity_id,payment_date,ccy,amount,journal_id,created_by)
    VALUES (p_entity_id,p_payment_date,v_ccy,v_total_txn,v_jid,p_created_by) RETURNING id INTO v_pay;

    FOR v_inv IN
        SELECT id, outstanding FROM supplier_invoice
        WHERE entity_id = p_entity_id AND status <> 'paid' AND ccy = v_ccy
          AND (p_up_to_due IS NULL OR due_date <= p_up_to_due)
    LOOP
        INSERT INTO payment_allocation(payment_id,supplier_invoice_id,amount) VALUES (v_pay, v_inv.id, v_inv.outstanding);
        UPDATE supplier_invoice SET outstanding = 0, status = 'paid' WHERE id = v_inv.id;
    END LOOP;

    RETURN v_pay;
END $$;
