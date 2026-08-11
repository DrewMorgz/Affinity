-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  VAT ON DISBURSEMENTS  (012)
-- Two VAT treatments for a cost passed to a client:
--   'disbursement' — paid as agent, OUTSIDE the scope of VAT. Recharged at
--                    cost, no output VAT, input VAT not reclaimed.
--   'recharge'     — your onward supply, VATable. Input VAT reclaimed on the
--                    purchase, output VAT charged on the recharge, optional
--                    handling markup to revenue.
-- =====================================================================

ALTER TABLE disbursement ADD COLUMN vat_treatment text NOT NULL DEFAULT 'disbursement'
      CHECK (vat_treatment IN ('disbursement','recharge'));
ALTER TABLE disbursement ADD COLUMN vat_code  int;
ALTER TABLE disbursement ADD COLUMN markup_pct numeric(6,3) NOT NULL DEFAULT 0;


-- record_disbursement() — REPLACED: FX-aware + VAT treatment.
CREATE OR REPLACE FUNCTION record_disbursement(
    p_entity_id bigint, p_supplier text, p_amount numeric, p_ccy char(3),
    p_date date, p_created_by text,
    p_vat_treatment text DEFAULT 'disbursement', p_vat_code int DEFAULT NULL, p_markup_pct numeric DEFAULT 0)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_plc  bigint := cfg_account(p_entity_id,'PLC');
        v_vatin bigint; v_sup bigint; v_jid bigint; v_id bigint; v_inv bigint; v_loc text;
        v_func char(3); v_fxrate numeric(20,10) := 1; v_fxid bigint := NULL;
        v_rate numeric(6,4); v_net numeric(20,2); v_vat numeric(20,2); v_gross numeric(20,2);
        v_lines jsonb;
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

    IF p_vat_treatment = 'recharge' THEN
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = p_vat_code;
        v_rate := COALESCE(v_rate,0);
        v_net := p_amount; v_vat := round(v_net*v_rate,2); v_gross := v_net + v_vat;
        v_vatin := cfg_account(p_entity_id,'VAT_INPUT');
        v_lines := jsonb_build_array(
            jsonb_build_object('account_id',v_disb,'txn_ccy',p_ccy,'txn_amount',v_net,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr Disbursements (net)'),
            jsonb_build_object('account_id',v_vatin,'txn_ccy',p_ccy,'txn_amount',v_vat,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr VAT Input (recoverable)'),
            jsonb_build_object('account_id',v_plc,'txn_ccy',p_ccy,'txn_amount',-v_gross,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Purchase Ledger Control'));
    ELSE  -- true disbursement: gross to disbursements, no VAT reclaim
        v_net := p_amount; v_vat := 0; v_gross := p_amount;
        v_lines := jsonb_build_array(
            jsonb_build_object('account_id',v_disb,'txn_ccy',p_ccy,'txn_amount',v_gross,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr Disbursements (gross, at cost)'),
            jsonb_build_object('account_id',v_plc,'txn_ccy',p_ccy,'txn_amount',-v_gross,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Purchase Ledger Control'));
    END IF;

    v_jid := post_journal(p_entity_id, p_date, 'disbursement','Supplier disbursement: '||p_supplier, p_created_by, v_lines);

    INSERT INTO supplier_invoice(supplier_id,entity_id,reference,invoice_date,due_date,ccy,net,vat,gross,outstanding,is_disbursement,purchase_journal_id,fx_rate)
    VALUES (v_sup,p_entity_id,'disbursement',p_date,p_date,p_ccy,v_net,v_vat,v_gross,v_gross,true,v_jid,v_fxrate) RETURNING id INTO v_inv;
    INSERT INTO disbursement(entity_id,supplier,amount,ccy,incurred_date,status,purchase_journal_id,supplier_invoice_id,vat_treatment,vat_code,markup_pct)
    VALUES (p_entity_id,p_supplier,p_amount,p_ccy,p_date,'open',v_jid,v_inv,p_vat_treatment,p_vat_code,p_markup_pct) RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- the original returned a journal id (bigint); the new one returns a count (int),
-- so the old signature must be dropped before recreating.
DROP FUNCTION IF EXISTS recharge_disbursements(bigint, date, text);

-- recharge_disbursements() — REPLACED: per item, by VAT treatment + markup.
-- 'disbursement' -> Dr SLC / Cr Disbursements (at cost, no VAT).
-- 'recharge'     -> Dr SLC (net+markup+VAT) / Cr Disbursements (cost) /
--                   Cr recharge income (markup) / Cr VAT Output.
CREATE OR REPLACE FUNCTION recharge_disbursements(p_entity_id bigint, p_date date, p_created_by text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE v_slc bigint := cfg_account(p_entity_id,'SLC');
        v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_vatout bigint := cfg_account(p_entity_id,'VAT_OUTPUT');
        v_markupacc bigint := cfg_account(p_entity_id,'DISB_MARKUP');
        v_func char(3); v_loc text; rec record; v_rate numeric(6,4);
        v_recharge_net numeric(20,2); v_output_vat numeric(20,2); v_markup numeric(20,2);
        v_lines jsonb; v_jid bigint; v_count int := 0; v_fxid bigint; v_fxrate numeric(20,10);
BEGIN
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = p_entity_id;

    FOR rec IN SELECT * FROM disbursement WHERE entity_id = p_entity_id AND status = 'open' LOOP
        v_fxid := NULL;
        IF rec.ccy <> v_func THEN SELECT rate_id INTO v_fxid FROM fx_lookup(rec.ccy, v_func, p_date); END IF;

        IF rec.vat_treatment = 'recharge' THEN
            SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = rec.vat_code;
            v_rate := COALESCE(v_rate,0);
            v_recharge_net := round(rec.amount * (1 + COALESCE(rec.markup_pct,0)/100.0), 2);
            v_output_vat   := round(v_recharge_net * v_rate, 2);
            v_markup       := v_recharge_net - rec.amount;
            v_lines := jsonb_build_array(
                jsonb_build_object('account_id',v_slc,'txn_ccy',rec.ccy,'txn_amount', v_recharge_net + v_output_vat,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr SLC (recharge gross)'),
                jsonb_build_object('account_id',v_disb,'txn_ccy',rec.ccy,'txn_amount',-rec.amount,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Disbursements (clear at cost)'),
                jsonb_build_object('account_id',v_vatout,'txn_ccy',rec.ccy,'txn_amount',-v_output_vat,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr VAT Output'));
            IF v_markup <> 0 THEN
                v_lines := v_lines || jsonb_build_object('account_id',v_markupacc,'txn_ccy',rec.ccy,'txn_amount',-v_markup,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Disbursement recharge income');
            END IF;
        ELSE  -- true disbursement, at cost, outside scope of VAT
            v_lines := jsonb_build_array(
                jsonb_build_object('account_id',v_slc,'txn_ccy',rec.ccy,'txn_amount', rec.amount,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr SLC (disbursement at cost)'),
                jsonb_build_object('account_id',v_disb,'txn_ccy',rec.ccy,'txn_amount',-rec.amount,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Disbursements'));
        END IF;

        v_jid := post_journal(p_entity_id, p_date, 'disbursement-recharge','Recharge disbursement '||rec.id, p_created_by, v_lines);
        UPDATE disbursement SET status='billed', recharge_journal_id=v_jid WHERE id = rec.id;
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END $$;
