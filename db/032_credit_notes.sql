-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CREDIT NOTES  (032)
-- Sales (AR) and purchase (AP) credit notes.
--   AR: Dr income + Dr VAT output  /  Cr trade debtor (SLC)   — reduces what a customer owes
--   AP: Dr trade creditor (PLC)    /  Cr expense + Cr VAT input — reduces what we owe a supplier
-- Optionally settles against a specific invoice (reduces its outstanding).
-- =====================================================================

CREATE TABLE credit_note (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id         bigint NOT NULL REFERENCES entity(id),
    cn_type           text NOT NULL CHECK (cn_type IN ('AR','AP')),
    party_name        text,
    related_invoice_id bigint,
    cn_date           date NOT NULL,
    ccy               char(3) NOT NULL REFERENCES currency(code),
    net_total         numeric(20,2) NOT NULL DEFAULT 0,
    vat_total         numeric(20,2) NOT NULL DEFAULT 0,
    gross_total       numeric(20,2) NOT NULL DEFAULT 0,
    status            text NOT NULL DEFAULT 'posted',
    reason            text,
    journal_id        bigint REFERENCES journal(id),
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credit_note_line (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    credit_note_id bigint NOT NULL REFERENCES credit_note(id),
    description   text,
    account_id    bigint NOT NULL REFERENCES account(id),  -- income (AR) / expense (AP) account
    net           numeric(20,2) NOT NULL,
    vat_code      int,
    vat           numeric(20,2) NOT NULL DEFAULT 0,
    gross         numeric(20,2) NOT NULL
);

-- reduce a specific invoice's outstanding when a credit note is applied to it
CREATE OR REPLACE FUNCTION apply_credit_to_invoice(p_invoice_id bigint, p_amount numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_out numeric;
BEGIN
    SELECT outstanding INTO v_out FROM invoice WHERE id = p_invoice_id FOR UPDATE;
    IF v_out IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
    UPDATE invoice
       SET outstanding = GREATEST(v_out - p_amount, 0),
           settled = CASE WHEN v_out - p_amount <= 0 THEN 'credited' ELSE settled END
     WHERE id = p_invoice_id;
END $$;

-- AR (sales) credit note. p_lines: [{description, account_id, net, vat_code}]
CREATE OR REPLACE FUNCTION raise_ar_credit_note(
    p_entity bigint, p_date date, p_ccy char(3), p_lines jsonb,
    p_related_invoice_id bigint, p_party text, p_reason text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE ln jsonb; v_loc text; v_rate numeric; v_net numeric; v_vat numeric;
        v_net_tot numeric := 0; v_vat_tot numeric := 0; v_gross numeric;
        v_jlines jsonb := '[]'::jsonb; v_jid bigint; v_cn bigint;
        v_slc bigint := cfg_account(p_entity,'SLC'); v_vatout bigint := cfg_account(p_entity,'VAT_OUTPUT');
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity;
    INSERT INTO credit_note(entity_id,cn_type,party_name,related_invoice_id,cn_date,ccy,reason)
      VALUES (p_entity,'AR',p_party,p_related_invoice_id,p_date,p_ccy,p_reason) RETURNING id INTO v_cn;

    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_net := (ln->>'net')::numeric;
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = (ln->>'vat_code')::int;
        v_vat := round(v_net * COALESCE(v_rate,0), 2);
        INSERT INTO credit_note_line(credit_note_id,description,account_id,net,vat_code,vat,gross)
          VALUES (v_cn, ln->>'description', (ln->>'account_id')::bigint, v_net, (ln->>'vat_code')::int, v_vat, v_net+v_vat);
        -- Dr income account (reduces income)
        v_jlines := v_jlines || jsonb_build_object('account_id',(ln->>'account_id')::bigint,'txn_ccy',p_ccy,
                     'txn_amount', v_net,'location_code',v_loc,'memo','AR credit note');
        v_net_tot := v_net_tot + v_net; v_vat_tot := v_vat_tot + v_vat;
    END LOOP;
    v_gross := v_net_tot + v_vat_tot;

    IF v_vat_tot <> 0 THEN
        v_jlines := v_jlines || jsonb_build_object('account_id',v_vatout,'txn_ccy',p_ccy,'txn_amount',v_vat_tot,'location_code',v_loc,'memo','Reverse output VAT');
    END IF;
    -- Cr trade debtor (reduces what the customer owes)
    v_jlines := v_jlines || jsonb_build_object('account_id',v_slc,'txn_ccy',p_ccy,'txn_amount',-v_gross,'location_code',v_loc,'memo','Credit to debtor');

    v_jid := post_journal(p_entity, p_date, 'credit-note', 'AR credit note'||COALESCE(' — '||p_reason,''), p_created_by, v_jlines);
    UPDATE credit_note SET net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_gross, journal_id=v_jid WHERE id=v_cn;
    IF p_related_invoice_id IS NOT NULL THEN PERFORM apply_credit_to_invoice(p_related_invoice_id, v_gross); END IF;
    RETURN v_cn;
END $$;

-- AP (purchase) credit note. p_lines: [{description, account_id, net, vat_code}]
CREATE OR REPLACE FUNCTION raise_ap_credit_note(
    p_entity bigint, p_date date, p_ccy char(3), p_lines jsonb,
    p_supplier text, p_reason text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE ln jsonb; v_loc text; v_rate numeric; v_net numeric; v_vat numeric;
        v_net_tot numeric := 0; v_vat_tot numeric := 0; v_gross numeric;
        v_jlines jsonb := '[]'::jsonb; v_jid bigint; v_cn bigint;
        v_plc bigint := cfg_account(p_entity,'PLC'); v_vatin bigint := cfg_account(p_entity,'VAT_INPUT');
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity;
    INSERT INTO credit_note(entity_id,cn_type,party_name,cn_date,ccy,reason)
      VALUES (p_entity,'AP',p_supplier,p_date,p_ccy,p_reason) RETURNING id INTO v_cn;

    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_net := (ln->>'net')::numeric;
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = (ln->>'vat_code')::int;
        v_vat := round(v_net * COALESCE(v_rate,0), 2);
        INSERT INTO credit_note_line(credit_note_id,description,account_id,net,vat_code,vat,gross)
          VALUES (v_cn, ln->>'description', (ln->>'account_id')::bigint, v_net, (ln->>'vat_code')::int, v_vat, v_net+v_vat);
        -- Cr expense account (reduces expense)
        v_jlines := v_jlines || jsonb_build_object('account_id',(ln->>'account_id')::bigint,'txn_ccy',p_ccy,
                     'txn_amount', -v_net,'location_code',v_loc,'memo','AP credit note');
        v_net_tot := v_net_tot + v_net; v_vat_tot := v_vat_tot + v_vat;
    END LOOP;
    v_gross := v_net_tot + v_vat_tot;

    IF v_vat_tot <> 0 THEN
        v_jlines := v_jlines || jsonb_build_object('account_id',v_vatin,'txn_ccy',p_ccy,'txn_amount',-v_vat_tot,'location_code',v_loc,'memo','Reverse input VAT');
    END IF;
    -- Dr trade creditor (reduces what we owe)
    v_jlines := v_jlines || jsonb_build_object('account_id',v_plc,'txn_ccy',p_ccy,'txn_amount',v_gross,'location_code',v_loc,'memo','Debit to creditor');

    v_jid := post_journal(p_entity, p_date, 'credit-note', 'AP credit note'||COALESCE(' — '||p_reason,''), p_created_by, v_jlines);
    UPDATE credit_note SET net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_gross, journal_id=v_jid WHERE id=v_cn;
    RETURN v_cn;
END $$;

CREATE OR REPLACE VIEW v_credit_note AS
SELECT cn.id, cn.entity_id, cn.cn_type, cn.party_name, cn.related_invoice_id, cn.cn_date,
       cn.ccy, cn.net_total, cn.vat_total, cn.gross_total, cn.status, cn.reason
FROM credit_note cn;
