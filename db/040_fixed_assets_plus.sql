-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  FIXED ASSET EXTENSIONS  (040)
-- Reducing-balance depreciation, impairment write-downs, and inter-entity
-- asset transfers (intercompany disposal in the seller + re-capitalisation in
-- the buyer). Builds on 014 (fixed_asset, FA_* roles).
-- =====================================================================

ALTER TABLE fixed_asset ADD COLUMN IF NOT EXISTS rb_rate    numeric(6,3) DEFAULT 0;  -- annual % for reducing balance
ALTER TABLE fixed_asset ADD COLUMN IF NOT EXISTS impairment numeric(20,2) NOT NULL DEFAULT 0;

-- impairment expense account + role
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'6150','Impairment of fixed assets','expense','D'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6150');
INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'FA_IMPAIRMENT', a.id FROM account a WHERE a.coa_template_id=1 AND a.code='6150'
ON CONFLICT DO NOTHING;

-- post a depreciation charge for an asset (straight_line or reducing_balance)
CREATE OR REPLACE FUNCTION post_depreciation(p_asset bigint, p_date date, p_months int, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE fa fixed_asset%ROWTYPE; v_loc text; v_ccy char(3); v_dep_exp bigint; v_accum bigint;
        v_depreciable numeric; v_nbv numeric; v_charge numeric;
BEGIN
    SELECT * INTO fa FROM fixed_asset WHERE id=p_asset;
    IF fa.id IS NULL THEN RAISE EXCEPTION 'Asset % not found', p_asset; END IF;
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=fa.entity_id;
    v_dep_exp := cfg_account(fa.entity_id,'FA_DEP_EXPENSE');
    v_accum   := cfg_account(fa.entity_id,'FA_ACCUM_DEP');

    v_depreciable := fa.cost - fa.residual_value;
    IF fa.method = 'reducing_balance' THEN
        v_nbv := fa.cost - fa.accumulated_dep;
        v_charge := round(v_nbv * COALESCE(fa.rb_rate,0)/100.0 * (p_months/12.0), 2);
    ELSE
        v_charge := round(v_depreciable / NULLIF(fa.useful_life_months,0) * p_months, 2);
    END IF;
    IF fa.accumulated_dep + v_charge > v_depreciable THEN v_charge := v_depreciable - fa.accumulated_dep; END IF;
    IF v_charge <= 0 THEN RETURN NULL; END IF;

    UPDATE fixed_asset SET accumulated_dep = accumulated_dep + v_charge WHERE id=p_asset;
    RETURN post_journal(fa.entity_id, p_date, 'depreciation', 'Depreciation — '||fa.description, p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',v_dep_exp,'txn_ccy',v_ccy,'txn_amount', v_charge,'location_code',v_loc,'memo','Depreciation charge'),
        jsonb_build_object('account_id',v_accum,  'txn_ccy',v_ccy,'txn_amount',-v_charge,'location_code',v_loc,'memo','Accumulated depreciation')));
END $$;

-- impair an asset (write down carrying value)
CREATE OR REPLACE FUNCTION impair_asset(p_asset bigint, p_date date, p_impairment numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE fa fixed_asset%ROWTYPE; v_loc text; v_ccy char(3); v_imp bigint; v_accum bigint; v_jid bigint;
BEGIN
    SELECT * INTO fa FROM fixed_asset WHERE id=p_asset;
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=fa.entity_id;
    v_imp := cfg_account(fa.entity_id,'FA_IMPAIRMENT'); v_accum := cfg_account(fa.entity_id,'FA_ACCUM_DEP');
    v_jid := post_journal(fa.entity_id, p_date, 'impairment', 'Impairment — '||fa.description, p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',v_imp,  'txn_ccy',v_ccy,'txn_amount', p_impairment,'location_code',v_loc,'memo','Impairment loss'),
        jsonb_build_object('account_id',v_accum,'txn_ccy',v_ccy,'txn_amount',-p_impairment,'location_code',v_loc,'memo','Carrying value write-down')));
    UPDATE fixed_asset SET accumulated_dep=accumulated_dep+p_impairment, impairment=impairment+p_impairment WHERE id=p_asset;
    RETURN v_jid;
END $$;

-- transfer an asset to another group entity (intercompany disposal + re-capitalise)
CREATE OR REPLACE FUNCTION transfer_asset(
    p_asset bigint, p_to_entity bigint, p_date date, p_transfer_value numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE fa fixed_asset%ROWTYPE; v_floc text; v_fccy char(3); v_tloc text; v_tccy char(3);
        v_nbv numeric; v_gain numeric; v_new bigint; v_jfrom bigint; v_jto bigint; v_lines jsonb;
        f_cost bigint; f_accum bigint; f_disp bigint; f_icr bigint; t_cost bigint; t_icp bigint;
BEGIN
    SELECT * INTO fa FROM fixed_asset WHERE id=p_asset;
    IF fa.id IS NULL THEN RAISE EXCEPTION 'Asset % not found', p_asset; END IF;
    SELECT location_code, functional_ccy INTO v_floc, v_fccy FROM entity WHERE id=fa.entity_id;
    SELECT location_code, functional_ccy INTO v_tloc, v_tccy FROM entity WHERE id=p_to_entity;
    v_nbv := fa.cost - fa.accumulated_dep; v_gain := p_transfer_value - v_nbv;

    f_cost:=cfg_account(fa.entity_id,'FA_COST'); f_accum:=cfg_account(fa.entity_id,'FA_ACCUM_DEP');
    f_disp:=cfg_account(fa.entity_id,'FA_DISPOSAL'); f_icr:=cfg_account(fa.entity_id,'IC_RECEIVABLE');
    t_cost:=cfg_account(p_to_entity,'FA_COST'); t_icp:=cfg_account(p_to_entity,'IC_PAYABLE');

    -- seller: remove cost & accum, raise intercompany receivable, recognise gain/loss
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id',f_accum,'txn_ccy',v_fccy,'txn_amount', fa.accumulated_dep,'location_code',v_floc,'memo','Remove accum dep'),
      jsonb_build_object('account_id',f_icr,  'txn_ccy',v_fccy,'txn_amount', p_transfer_value,'location_code',v_floc,'memo','IC receivable on transfer'),
      jsonb_build_object('account_id',f_cost, 'txn_ccy',v_fccy,'txn_amount',-fa.cost,'location_code',v_floc,'memo','Remove asset cost'));
    IF v_gain <> 0 THEN
      v_lines := v_lines || jsonb_build_object('account_id',f_disp,'txn_ccy',v_fccy,'txn_amount',-v_gain,'location_code',v_floc,'memo','Gain/(loss) on transfer');
    END IF;
    v_jfrom := post_journal(fa.entity_id, p_date, 'asset-transfer', 'Transfer out — '||fa.description, p_created_by, v_lines);

    -- buyer: capitalise at transfer value against intercompany payable
    v_jto := post_journal(p_to_entity, p_date, 'asset-transfer', 'Transfer in — '||fa.description, p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',t_cost,'txn_ccy',v_tccy,'txn_amount', p_transfer_value,'location_code',v_tloc,'memo','Asset acquired (transfer)'),
        jsonb_build_object('account_id',t_icp, 'txn_ccy',v_tccy,'txn_amount',-p_transfer_value,'location_code',v_tloc,'memo','IC payable on transfer')));

    UPDATE fixed_asset SET status='transferred', disposal_journal_id=v_jfrom WHERE id=p_asset;
    INSERT INTO fixed_asset(entity_id,description,category,acquisition_date,in_service_date,cost,residual_value,
                            useful_life_months,method,rb_rate,accumulated_dep,status,capitalise_journal_id)
      VALUES (p_to_entity, fa.description, fa.category, p_date, p_date, p_transfer_value, fa.residual_value,
              fa.useful_life_months, fa.method, fa.rb_rate, 0, 'active', v_jto)
      RETURNING id INTO v_new;
    RETURN v_new;
END $$;

-- allow the transfer/impaired statuses
ALTER TABLE fixed_asset DROP CONSTRAINT IF EXISTS fixed_asset_status_check;
ALTER TABLE fixed_asset ADD CONSTRAINT fixed_asset_status_check
  CHECK (status IN ('active','disposed','transferred','impaired','draft'));
