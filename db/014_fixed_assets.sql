-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  FIXED ASSETS  (014)
-- Register, capitalisation, straight-line monthly depreciation, disposal.
-- Depreciation is cumulative (forward-only) so re-running a month is a no-op.
-- All movements post through post_journal().
-- Control accounts via ledger_config: FA_COST, FA_ACCUM_DEP, FA_DEP_EXPENSE,
-- FA_DISPOSAL, BANK.
-- =====================================================================

CREATE TABLE fixed_asset (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id          bigint NOT NULL REFERENCES entity(id),
    description        text NOT NULL,
    category           text,
    acquisition_date   date NOT NULL,
    in_service_date    date NOT NULL,
    cost               numeric(20,2) NOT NULL,
    residual_value     numeric(20,2) NOT NULL DEFAULT 0,
    useful_life_months int NOT NULL CHECK (useful_life_months > 0),
    method             text NOT NULL DEFAULT 'straight_line',
    accumulated_dep    numeric(20,2) NOT NULL DEFAULT 0,
    status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed')),
    capitalise_journal_id bigint REFERENCES journal(id),
    disposal_journal_id   bigint REFERENCES journal(id)
);


-- capitalise: Dr Fixed asset cost / Cr Bank
CREATE OR REPLACE FUNCTION capitalise_asset(
    p_entity_id bigint, p_description text, p_category text, p_cost numeric,
    p_acquisition_date date, p_in_service_date date, p_useful_life_months int,
    p_residual numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_cost_acc bigint := cfg_account(p_entity_id,'FA_COST');
        v_bank bigint := cfg_account(p_entity_id,'BANK');
        v_loc text; v_jid bigint; v_id bigint;
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;
    v_jid := post_journal(p_entity_id, p_acquisition_date, 'fixed-asset',
        'Capitalise asset: ' || p_description, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_cost_acc,'txn_ccy',(SELECT functional_ccy FROM entity WHERE id=p_entity_id),'txn_amount', p_cost,'location_code',v_loc,'memo','Dr Fixed asset cost'),
          jsonb_build_object('account_id',v_bank    ,'txn_ccy',(SELECT functional_ccy FROM entity WHERE id=p_entity_id),'txn_amount',-p_cost,'location_code',v_loc,'memo','Cr Bank')));
    INSERT INTO fixed_asset(entity_id,description,category,acquisition_date,in_service_date,cost,residual_value,useful_life_months,capitalise_journal_id)
    VALUES (p_entity_id,p_description,p_category,p_acquisition_date,p_in_service_date,p_cost,p_residual,p_useful_life_months,v_jid)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- run_depreciation: straight-line, cumulative to period end. Dr Dep expense / Cr Accum dep.
CREATE OR REPLACE FUNCTION run_depreciation(p_entity_id bigint, p_period char(7), p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_pend date := (to_date(p_period,'YYYY-MM') + interval '1 month - 1 day')::date;
        v_exp bigint := cfg_account(p_entity_id,'FA_DEP_EXPENSE');
        v_accum bigint := cfg_account(p_entity_id,'FA_ACCUM_DEP');
        v_func char(3); v_loc text; rec record;
        v_months int; v_monthly numeric(20,2); v_deprec numeric(20,2); v_target numeric(20,2);
        v_delta numeric(20,2); v_run numeric(20,2) := 0;
BEGIN
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = p_entity_id;
    FOR rec IN SELECT * FROM fixed_asset WHERE entity_id=p_entity_id AND status='active' AND in_service_date <= v_pend LOOP
        v_deprec := rec.cost - rec.residual_value;                 -- depreciable amount
        v_monthly := round(v_deprec / rec.useful_life_months, 2);
        v_months := (extract(year from v_pend)::int - extract(year from rec.in_service_date)::int)*12
                    + (extract(month from v_pend)::int - extract(month from rec.in_service_date)::int) + 1;
        v_target := LEAST(v_monthly * v_months, v_deprec);
        v_delta  := v_target - rec.accumulated_dep;
        IF v_delta > 0 THEN
            PERFORM post_journal(p_entity_id, v_pend, 'depreciation',
                'Depreciation: ' || rec.description, p_created_by,
                jsonb_build_array(
                  jsonb_build_object('account_id',v_exp  ,'txn_ccy',v_func,'txn_amount', v_delta,'location_code',v_loc,'memo','Dr Depreciation expense'),
                  jsonb_build_object('account_id',v_accum,'txn_ccy',v_func,'txn_amount',-v_delta,'location_code',v_loc,'memo','Cr Accumulated depreciation')),
                'recurring');
            UPDATE fixed_asset SET accumulated_dep = accumulated_dep + v_delta WHERE id = rec.id;
            v_run := v_run + v_delta;
        END IF;
    END LOOP;
    RETURN v_run;
END $$;


-- dispose: remove cost + accumulated dep, take proceeds, recognise gain/(loss)
CREATE OR REPLACE FUNCTION dispose_asset(p_asset_id bigint, p_disposal_date date, p_proceeds numeric, p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE a fixed_asset%ROWTYPE; v_func char(3); v_loc text;
        v_cost_acc bigint; v_accum bigint; v_disp bigint; v_bank bigint;
        v_nbv numeric(20,2); v_gain numeric(20,2); v_lines jsonb;
BEGIN
    SELECT * INTO a FROM fixed_asset WHERE id = p_asset_id;
    IF a.id IS NULL THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
    IF a.status = 'disposed' THEN RAISE EXCEPTION 'Asset % already disposed', p_asset_id; END IF;
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = a.entity_id;
    v_cost_acc := cfg_account(a.entity_id,'FA_COST');
    v_accum := cfg_account(a.entity_id,'FA_ACCUM_DEP');
    v_disp := cfg_account(a.entity_id,'FA_DISPOSAL');
    v_bank := cfg_account(a.entity_id,'BANK');

    v_nbv  := a.cost - a.accumulated_dep;
    v_gain := p_proceeds - v_nbv;   -- +ve = gain on disposal

    v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_bank    ,'txn_ccy',v_func,'txn_amount', p_proceeds,'location_code',v_loc,'memo','Dr Bank (proceeds)'),
        jsonb_build_object('account_id',v_accum   ,'txn_ccy',v_func,'txn_amount', a.accumulated_dep,'location_code',v_loc,'memo','Dr Accumulated depreciation'),
        jsonb_build_object('account_id',v_cost_acc,'txn_ccy',v_func,'txn_amount',-a.cost,'location_code',v_loc,'memo','Cr Fixed asset cost'));
    IF v_gain <> 0 THEN
        v_lines := v_lines || jsonb_build_object('account_id',v_disp,'txn_ccy',v_func,'txn_amount',-v_gain,'location_code',v_loc,'memo','Gain/(loss) on disposal');
    END IF;

    UPDATE fixed_asset SET status='disposed',
           disposal_journal_id = post_journal(a.entity_id, p_disposal_date, 'fixed-asset', 'Dispose asset: '||a.description, p_created_by, v_lines)
    WHERE id = p_asset_id;
    RETURN v_gain;
END $$;


-- asset register with net book value
CREATE OR REPLACE VIEW v_fixed_asset_register AS
SELECT fa.entity_id, e.company_code, fa.id, fa.description, fa.category,
       fa.acquisition_date, fa.cost, fa.accumulated_dep,
       (fa.cost - fa.accumulated_dep) AS net_book_value, fa.status
FROM fixed_asset fa JOIN entity e ON e.id = fa.entity_id;
