-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  TAX EXTENSIONS  (038)
-- Withholding tax, reverse-charge VAT, and multi-jurisdiction VAT reporting,
-- on top of the existing VAT engine (012 disbursement VAT / 019 VAT return).
-- =====================================================================

-- WHT payable control account + role
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'2220','Withholding tax payable','liability','C'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2220');

INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'WHT_PAYABLE', a.id FROM account a WHERE a.coa_template_id=1 AND a.code='2220'
ON CONFLICT DO NOTHING;

-- optional default WHT rate per supplier
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS wht_rate numeric(6,4) DEFAULT 0;

-- withhold tax from an amount owed to a supplier:
--   Dr trade creditor (reduces what we pay out)  /  Cr WHT payable (we owe the authority)
CREATE OR REPLACE FUNCTION apply_withholding_tax(
    p_entity bigint, p_date date, p_base_net numeric, p_wht_rate numeric,
    p_supplier text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_ccy char(3); v_plc bigint := cfg_account(p_entity,'PLC');
        v_wht bigint := cfg_account(p_entity,'WHT_PAYABLE'); v_amt numeric;
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_entity;
    v_amt := round(p_base_net * p_wht_rate/100.0, 2);
    RETURN post_journal(p_entity, p_date, 'wht', 'Withholding tax — '||p_supplier, p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',v_plc,'txn_ccy',v_ccy,'txn_amount', v_amt,'location_code',v_loc,'memo','WHT withheld from supplier'),
        jsonb_build_object('account_id',v_wht,'txn_ccy',v_ccy,'txn_amount',-v_amt,'location_code',v_loc,'memo','WHT due to authority')));
END $$;

-- reverse-charge VAT on a cross-border service purchase:
--   Dr expense (net) + Dr VAT input (notional)  /  Cr VAT output (notional) + Cr creditor (net)
-- Net VAT and net cash effect is nil, but both VAT boxes are populated.
CREATE OR REPLACE FUNCTION record_reverse_charge(
    p_entity bigint, p_date date, p_net numeric, p_vat_rate numeric,
    p_expense_account bigint, p_supplier text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_ccy char(3); v_vat numeric;
        v_vatin bigint := cfg_account(p_entity,'VAT_INPUT');
        v_vatout bigint := cfg_account(p_entity,'VAT_OUTPUT');
        v_plc bigint := cfg_account(p_entity,'PLC');
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_entity;
    v_vat := round(p_net * p_vat_rate/100.0, 2);
    RETURN post_journal(p_entity, p_date, 'reverse-charge', 'Reverse charge — '||p_supplier, p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',p_expense_account,'txn_ccy',v_ccy,'txn_amount', p_net,'location_code',v_loc,'memo','Service (net)'),
        jsonb_build_object('account_id',v_vatin, 'txn_ccy',v_ccy,'txn_amount', v_vat,'location_code',v_loc,'memo','Reverse charge input VAT'),
        jsonb_build_object('account_id',v_vatout,'txn_ccy',v_ccy,'txn_amount',-v_vat,'location_code',v_loc,'memo','Reverse charge output VAT'),
        jsonb_build_object('account_id',v_plc,   'txn_ccy',v_ccy,'txn_amount',-p_net,'location_code',v_loc,'memo','Supplier (net)')));
END $$;

-- VAT output / input by jurisdiction (entity location) for a period
CREATE OR REPLACE FUNCTION report_vat_by_jurisdiction(p_start date, p_end date)
RETURNS TABLE(jurisdiction text, output_vat numeric, input_vat numeric, net_vat numeric)
LANGUAGE sql STABLE AS $$
    SELECT e.location_code,
      COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.code IN ('2200')),0),   -- output VAT (liability, credit)
      COALESCE( SUM(jl.func_amount) FILTER (WHERE a.code IN ('1200')),0),    -- input VAT (asset, debit)
      COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.code IN ('2200')),0)
        - COALESCE(SUM(jl.func_amount) FILTER (WHERE a.code IN ('1200')),0)
    FROM journal_line jl
    JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft' AND j.journal_date BETWEEN p_start AND p_end
    JOIN entity e ON e.id=j.entity_id
    JOIN account a ON a.id=jl.account_id AND a.code IN ('2200','1200')
    GROUP BY e.location_code
    ORDER BY e.location_code;
$$;

-- WHT payable accrued in a period (to remit to the authority)
CREATE OR REPLACE VIEW v_wht_payable AS
SELECT j.entity_id, e.location_code AS jurisdiction,
       -SUM(jl.func_amount) AS wht_payable
FROM journal_line jl
JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
JOIN entity e ON e.id=j.entity_id
JOIN account a ON a.id=jl.account_id AND a.code='2220'
GROUP BY j.entity_id, e.location_code;
