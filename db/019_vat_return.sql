-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  VAT RETURN  (019)
-- Prepare a VAT return for a period from the output VAT (on sales/recharges)
-- and input VAT (on purchases/expenses) already captured on every document,
-- then post the period's net to a VAT payable control account.
-- Control account via ledger_config: VAT_PAYABLE (+ existing VAT_OUTPUT, VAT_INPUT).
-- =====================================================================

CREATE TABLE vat_return (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id     bigint NOT NULL REFERENCES entity(id),
    period_start  date NOT NULL,
    period_end    date NOT NULL,
    output_vat    numeric(20,2) NOT NULL DEFAULT 0,   -- Box 1
    input_vat     numeric(20,2) NOT NULL DEFAULT 0,   -- Box 4
    net_vat       numeric(20,2) NOT NULL DEFAULT 0,   -- Box 5 (due if +ve)
    status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
    journal_id    bigint REFERENCES journal(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);


-- box figures for a period (does not write anything)
CREATE OR REPLACE FUNCTION vat_return_boxes(p_entity_id bigint, p_start date, p_end date)
RETURNS TABLE(output_vat numeric, input_vat numeric, net_vat numeric)
LANGUAGE sql STABLE AS $$
    WITH o AS (
        SELECT COALESCE(-SUM(jl.func_amount),0) AS v
        FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
        JOIN account a ON a.id=jl.account_id
        WHERE j.entity_id=p_entity_id AND j.journal_date BETWEEN p_start AND p_end
          AND a.id = cfg_account(p_entity_id,'VAT_OUTPUT')),
    i AS (
        SELECT COALESCE(SUM(jl.func_amount),0) AS v
        FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
        JOIN account a ON a.id=jl.account_id
        WHERE j.entity_id=p_entity_id AND j.journal_date BETWEEN p_start AND p_end
          AND a.id = cfg_account(p_entity_id,'VAT_INPUT'))
    SELECT o.v, i.v, o.v - i.v FROM o, i;
$$;


-- create a draft return for the period
CREATE OR REPLACE FUNCTION prepare_vat_return(p_entity_id bigint, p_start date, p_end date)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE b record; v_id bigint;
BEGIN
    SELECT * INTO b FROM vat_return_boxes(p_entity_id, p_start, p_end);
    INSERT INTO vat_return(entity_id,period_start,period_end,output_vat,input_vat,net_vat)
    VALUES (p_entity_id,p_start,p_end,b.output_vat,b.input_vat,b.net_vat) RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- post the return: clear the period's output & input VAT into a VAT payable.
-- Dr VAT Output / Cr VAT Input / Cr VAT Payable (net).
CREATE OR REPLACE FUNCTION post_vat_return(p_return_id bigint, p_post_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r vat_return%ROWTYPE; v_func char(3); v_loc text;
        v_out bigint; v_in bigint; v_pay bigint; v_lines jsonb; v_jid bigint;
BEGIN
    SELECT * INTO r FROM vat_return WHERE id = p_return_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'VAT return % not found', p_return_id; END IF;
    IF r.status <> 'draft' THEN RAISE EXCEPTION 'VAT return % already posted', p_return_id; END IF;
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = r.entity_id;
    v_out := cfg_account(r.entity_id,'VAT_OUTPUT');
    v_in  := cfg_account(r.entity_id,'VAT_INPUT');
    v_pay := cfg_account(r.entity_id,'VAT_PAYABLE');

    v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_out,'txn_ccy',v_func,'txn_amount', r.output_vat,'location_code',v_loc,'memo','Clear output VAT'),
        jsonb_build_object('account_id',v_in ,'txn_ccy',v_func,'txn_amount',-r.input_vat ,'location_code',v_loc,'memo','Clear input VAT'),
        jsonb_build_object('account_id',v_pay,'txn_ccy',v_func,'txn_amount',-(r.output_vat - r.input_vat),'location_code',v_loc,'memo','VAT payable to authority'));

    v_jid := post_journal(r.entity_id, p_post_date, 'vat-return',
        'VAT return '||r.period_start||' to '||r.period_end, p_created_by, v_lines);
    UPDATE vat_return SET status='posted', journal_id=v_jid WHERE id = p_return_id;
    RETURN v_jid;
END $$;
