-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  MULTI-CURRENCY AR + REALISED FX  (009)
-- Foreign-currency invoices are booked at the rate on the invoice date and
-- carry that rate. On settlement, the debtor is cleared at the BOOKING rate
-- and the cash leg lands at the SETTLEMENT rate; the difference is the
-- REALISED FX gain/(loss), posted to the realised FX account.
-- (AP mirror — run_payment / record_supplier_invoice — is the next brick.)
-- =====================================================================

ALTER TABLE invoice ADD COLUMN fx_rate numeric(20,10) NOT NULL DEFAULT 1;
UPDATE invoice SET fx_rate = 1 WHERE fx_rate IS NULL;  -- existing GBP invoices


-- pick the latest rate on/before a date; empty if same currency / none found
CREATE OR REPLACE FUNCTION fx_lookup(p_from char(3), p_to char(3), p_date date)
RETURNS TABLE(rate_id bigint, rate numeric) LANGUAGE sql STABLE AS $$
    SELECT id, rate FROM fx_rate
    WHERE from_ccy = p_from AND to_ccy = p_to AND rate_date <= p_date
    ORDER BY rate_date DESC, id DESC LIMIT 1;
$$;


-- ---------------------------------------------------------------------
-- generate_invoice() — REPLACED: now FX-aware. Functional-currency
-- proposals behave exactly as before (rate 1); foreign proposals book at
-- the invoice-date rate and store it on the invoice.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_invoice(p_proposal_id bigint, p_invoice_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
    v_prop     proposal%ROWTYPE;
    v_inv_id   bigint;
    v_ps       record;
    v_rate     numeric(6,4);
    v_vat      numeric(20,2);
    v_net_tot  numeric(20,2) := 0;
    v_vat_tot  numeric(20,2) := 0;
    v_lines    jsonb := '[]'::jsonb;
    v_slc      bigint := cfg_account( (SELECT entity_id FROM proposal WHERE id=p_proposal_id), 'SLC');
    v_vatacc   bigint;
    v_jid      bigint;
    v_il       bigint;
    v_loc      text;
    v_func     char(3);
    v_fxrate   numeric(20,10) := 1;
    v_fxid     bigint := NULL;
BEGIN
    SELECT * INTO v_prop FROM proposal WHERE id = p_proposal_id;
    IF v_prop.id IS NULL THEN RAISE EXCEPTION 'Proposal % not found', p_proposal_id; END IF;
    IF v_prop.status NOT IN ('signed_off','billing') THEN
        RAISE EXCEPTION 'Proposal % is "%": cannot bill until signed off', p_proposal_id, v_prop.status;
    END IF;
    SELECT location_code, functional_ccy INTO v_loc, v_func FROM entity WHERE id = v_prop.entity_id;

    -- booking rate (proposal ccy -> functional)
    IF v_prop.ccy <> v_func THEN
        SELECT rate_id, rate INTO v_fxid, v_fxrate FROM fx_lookup(v_prop.ccy, v_func, p_invoice_date);
        IF v_fxrate IS NULL THEN
            RAISE EXCEPTION 'No FX rate %->% on/before %', v_prop.ccy, v_func, p_invoice_date;
        END IF;
    END IF;

    INSERT INTO invoice(entity_id, proposal_id, invoice_date, ccy, bank_account_id, status, fx_rate)
    VALUES (v_prop.entity_id, p_proposal_id, p_invoice_date, v_prop.ccy, v_prop.bank_account_id, 'draft', v_fxrate)
    RETURNING id INTO v_inv_id;

    FOR v_ps IN
        SELECT ps.*, s.revenue_account_id, s.deferred_account_id, s.name AS sname
        FROM proposal_service ps JOIN service s ON s.id = ps.service_id
        WHERE ps.proposal_id = p_proposal_id
    LOOP
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = v_ps.vat_code;
        v_rate := COALESCE(v_rate, 0);
        v_vat  := round(v_ps.amount * v_rate, 2);
        v_net_tot := v_net_tot + v_ps.amount;
        v_vat_tot := v_vat_tot + v_vat;

        INSERT INTO invoice_line(invoice_id, service_id, description, net, vat, gross)
        VALUES (v_inv_id, v_ps.service_id, v_ps.sname, v_ps.amount, v_vat, v_ps.amount + v_vat)
        RETURNING id INTO v_il;

        IF v_ps.is_deferred AND v_ps.deferred_account_id IS NOT NULL
           AND v_ps.period_start IS NOT NULL AND v_ps.period_end IS NOT NULL THEN
            INSERT INTO deferred_schedule(invoice_line_id, entity_id, deferred_account_id,
                                          revenue_account_id, total_amount, ccy, period_start, period_end)
            VALUES (v_il, v_prop.entity_id, v_ps.deferred_account_id, v_ps.revenue_account_id,
                    v_ps.amount, v_prop.ccy, v_ps.period_start, v_ps.period_end);
        END IF;

        v_lines := v_lines || jsonb_build_object(
            'account_id', CASE WHEN v_ps.is_deferred THEN COALESCE(v_ps.deferred_account_id, v_ps.revenue_account_id)
                               ELSE v_ps.revenue_account_id END,
            'txn_ccy', v_prop.ccy, 'txn_amount', -v_ps.amount, 'fx_rate_id', v_fxid, 'location_code', v_loc,
            'memo', (CASE WHEN v_ps.is_deferred THEN 'Deferred: ' ELSE 'Sales: ' END) || v_ps.sname);
    END LOOP;

    v_lines := jsonb_build_array(jsonb_build_object(
        'account_id', v_slc, 'txn_ccy', v_prop.ccy, 'txn_amount', v_net_tot + v_vat_tot,
        'fx_rate_id', v_fxid, 'location_code', v_loc, 'memo', 'Trade debtor — invoice')) || v_lines;

    IF v_vat_tot <> 0 THEN
        v_vatacc := cfg_account(v_prop.entity_id, 'VAT_OUTPUT');
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_vatacc, 'txn_ccy', v_prop.ccy, 'txn_amount', -v_vat_tot,
            'fx_rate_id', v_fxid, 'location_code', v_loc, 'memo', 'Output VAT');
    END IF;

    v_jid := post_journal(v_prop.entity_id, p_invoice_date, 'billing',
                          'Invoice from proposal ' || p_proposal_id, p_created_by, v_lines);

    UPDATE invoice SET status='posted', journal_id=v_jid,
           net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_net_tot+v_vat_tot
    WHERE id = v_inv_id;

    RETURN v_inv_id;
END $$;


-- ---------------------------------------------------------------------
-- apply_receipt() — REPLACED: FX-aware with realised gain/(loss).
-- Clears each invoice's debtor at its BOOKING rate; cash lands at the
-- SETTLEMENT rate; the net difference posts to the realised FX account.
-- New optional params: p_bank_account_id (defaults to BANK config),
-- p_settlement_rate (defaults to the rate on the receipt date).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_receipt(
    p_entity_id bigint, p_receipt_date date, p_ccy char(3),
    p_created_by text, p_allocations jsonb,
    p_bank_account_id bigint DEFAULT NULL, p_settlement_rate numeric DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
    v_func   char(3);
    v_bank   bigint;
    v_slc    bigint := cfg_account(p_entity_id,'SLC');
    v_realacc bigint := cfg_account(p_entity_id,'FX_REALISED');
    v_loc    text;
    v_alloc  jsonb;
    v_inv    invoice%ROWTYPE;
    v_amt    numeric(20,2);
    v_settle numeric(20,10);
    v_total_txn numeric(20,2) := 0;
    v_total_slc_func numeric(20,2) := 0;
    v_bank_func numeric(20,2);
    v_realised numeric(20,2);
    v_lines  jsonb := '[]'::jsonb;
    v_jid    bigint; v_rcpt bigint;
BEGIN
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = p_entity_id;
    v_bank := COALESCE(p_bank_account_id, cfg_account(p_entity_id,'BANK'));

    -- settlement rate (receipt ccy -> functional)
    IF p_ccy = v_func THEN
        v_settle := 1;
    ELSIF p_settlement_rate IS NOT NULL THEN
        v_settle := p_settlement_rate;
    ELSE
        SELECT rate INTO v_settle FROM fx_lookup(p_ccy, v_func, p_receipt_date);
        IF v_settle IS NULL THEN RAISE EXCEPTION 'No settlement rate %->% on/before %', p_ccy, v_func, p_receipt_date; END IF;
    END IF;

    -- validate + build the SLC (debtor-clearing) legs at each invoice's booking rate
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_amt := (v_alloc->>'amount')::numeric;
        SELECT * INTO v_inv FROM invoice WHERE id = (v_alloc->>'invoice_id')::bigint;
        IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', v_alloc->>'invoice_id'; END IF;
        IF v_inv.entity_id <> p_entity_id THEN RAISE EXCEPTION 'Invoice % belongs to another entity', v_inv.id; END IF;
        IF v_inv.status <> 'posted' THEN RAISE EXCEPTION 'Invoice % not posted', v_inv.id; END IF;
        IF v_inv.ccy <> p_ccy THEN RAISE EXCEPTION 'Receipt ccy % <> invoice % ccy %', p_ccy, v_inv.id, v_inv.ccy; END IF;
        IF v_amt <= 0 OR v_amt > v_inv.outstanding THEN
            RAISE EXCEPTION 'Bad allocation % to invoice % (outstanding %)', v_amt, v_inv.id, v_inv.outstanding;
        END IF;

        v_total_txn := v_total_txn + v_amt;
        v_total_slc_func := v_total_slc_func + round(v_amt * v_inv.fx_rate, 2);

        v_lines := v_lines || jsonb_build_object(
            'account_id', v_slc, 'txn_ccy', p_ccy, 'txn_amount', -v_amt,
            'func_amount', -round(v_amt * v_inv.fx_rate, 2), 'location_code', v_loc,
            'memo', 'Clear debtor invoice ' || v_inv.id || ' @ booking ' || v_inv.fx_rate);
    END LOOP;

    IF v_total_txn = 0 THEN RAISE EXCEPTION 'Receipt has no allocations'; END IF;

    v_bank_func := round(v_total_txn * v_settle, 2);
    v_realised  := v_bank_func - v_total_slc_func;   -- +ve = gain

    -- cash leg at settlement rate
    v_lines := jsonb_build_array(jsonb_build_object(
        'account_id', v_bank, 'txn_ccy', p_ccy, 'txn_amount', v_total_txn,
        'func_amount', v_bank_func, 'location_code', v_loc,
        'memo', 'Bank receipt @ settlement ' || v_settle)) || v_lines;

    -- realised FX (balances the journal)
    IF v_realised <> 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_realacc, 'txn_ccy', v_func, 'txn_amount', -v_realised,
            'func_amount', -v_realised, 'location_code', v_loc, 'memo', 'Realised FX gain/(loss)');
    END IF;

    v_jid := post_journal(p_entity_id, p_receipt_date, 'receipt', 'Customer receipt', p_created_by, v_lines);

    INSERT INTO receipt(entity_id,receipt_date,ccy,amount,journal_id,created_by)
    VALUES (p_entity_id,p_receipt_date,p_ccy,v_total_txn,v_jid,p_created_by) RETURNING id INTO v_rcpt;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_amt := (v_alloc->>'amount')::numeric;
        INSERT INTO receipt_allocation(receipt_id,invoice_id,amount)
        VALUES (v_rcpt, (v_alloc->>'invoice_id')::bigint, v_amt);
        UPDATE invoice SET outstanding = outstanding - v_amt,
               settled = CASE WHEN outstanding - v_amt = 0 THEN 'paid' ELSE 'part_paid' END
         WHERE id = (v_alloc->>'invoice_id')::bigint;
    END LOOP;

    RETURN v_rcpt;
END $$;
