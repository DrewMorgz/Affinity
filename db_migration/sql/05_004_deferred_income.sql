-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  DEFERRED INCOME RELEASE  (004)
-- Month-end recognition: moves deferred income (BS) to sales (PL) across
-- the service period, straight-line by day. Driven by the dates on the
-- proposal service (accounts note #6b). Posts via post_journal().
-- =====================================================================


-- Recognition schedule. One row per deferred invoice line. Cumulative
-- (forward-only) recognition avoids rounding drift; the final month clears
-- exactly to the total.
CREATE TABLE deferred_schedule (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_line_id     bigint NOT NULL REFERENCES invoice_line(id),
    entity_id           bigint NOT NULL REFERENCES entity(id),
    deferred_account_id bigint NOT NULL REFERENCES account(id),
    revenue_account_id  bigint NOT NULL REFERENCES account(id),
    total_amount        numeric(20,2) NOT NULL,   -- net, to be recognised over the period
    ccy                 char(3) NOT NULL REFERENCES currency(code),
    period_start        date NOT NULL,
    period_end          date NOT NULL,
    recognised_amount   numeric(20,2) NOT NULL DEFAULT 0,
    status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','complete'))
);


-- ---------------------------------------------------------------------
-- run_deferred_income(): the month-end procedure.
-- For each open schedule, recognise the cumulative amount earned to the
-- end of p_period, less what's already been taken. Dr Deferred / Cr Sales.
-- Forward-only: re-running an earlier month posts nothing.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_deferred_income(p_entity_id bigint, p_period char(7), p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
    v_pend   date := (to_date(p_period,'YYYY-MM') + interval '1 month - 1 day')::date;
    v_rec    deferred_schedule%ROWTYPE;
    v_days   int;
    v_elapsed int;
    v_target numeric(20,2);
    v_delta  numeric(20,2);
    v_loc    text;
    v_run    numeric(20,2) := 0;
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;

    FOR v_rec IN
        SELECT * FROM deferred_schedule
        WHERE entity_id = p_entity_id AND status = 'open' AND period_start <= v_pend
    LOOP
        v_days    := (v_rec.period_end - v_rec.period_start) + 1;
        v_elapsed := (LEAST(v_pend, v_rec.period_end) - v_rec.period_start) + 1;
        v_target  := round(v_rec.total_amount * v_elapsed::numeric / v_days, 2);
        v_delta   := v_target - v_rec.recognised_amount;

        IF v_delta > 0 THEN
            PERFORM post_journal(p_entity_id, v_pend, 'month-end',
                'Deferred income release (schedule ' || v_rec.id || ')', p_created_by,
                jsonb_build_array(
                  jsonb_build_object('account_id',v_rec.deferred_account_id,'txn_ccy',v_rec.ccy,
                                     'txn_amount', v_delta,'location_code',v_loc,'memo','Dr Deferred Income'),
                  jsonb_build_object('account_id',v_rec.revenue_account_id,'txn_ccy',v_rec.ccy,
                                     'txn_amount',-v_delta,'location_code',v_loc,'memo','Cr Sales (earned)')),
                'recurring');
            UPDATE deferred_schedule
               SET recognised_amount = recognised_amount + v_delta,
                   status = CASE WHEN v_pend >= period_end THEN 'complete' ELSE 'open' END
             WHERE id = v_rec.id;
            v_run := v_run + v_delta;
        ELSIF v_pend >= v_rec.period_end THEN
            UPDATE deferred_schedule SET status='complete' WHERE id = v_rec.id;
        END IF;
    END LOOP;

    RETURN v_run;
END $$;


-- ---------------------------------------------------------------------
-- generate_invoice() — REPLACED so deferred lines also create a schedule.
-- Identical to 003 except it captures the invoice_line id and inserts a
-- deferred_schedule row for each deferred service.
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
BEGIN
    SELECT * INTO v_prop FROM proposal WHERE id = p_proposal_id;
    IF v_prop.id IS NULL THEN RAISE EXCEPTION 'Proposal % not found', p_proposal_id; END IF;
    IF v_prop.status NOT IN ('signed_off','billing') THEN
        RAISE EXCEPTION 'Proposal % is "%": cannot bill until signed off by BD/Compliance/Admin/Accounts',
            p_proposal_id, v_prop.status;
    END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = v_prop.entity_id;

    INSERT INTO invoice(entity_id, proposal_id, invoice_date, ccy, bank_account_id, status)
    VALUES (v_prop.entity_id, p_proposal_id, p_invoice_date, v_prop.ccy, v_prop.bank_account_id, 'draft')
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

        -- auto-create the recognition schedule for deferred services
        IF v_ps.is_deferred AND v_ps.deferred_account_id IS NOT NULL
           AND v_ps.period_start IS NOT NULL AND v_ps.period_end IS NOT NULL THEN
            INSERT INTO deferred_schedule(invoice_line_id, entity_id, deferred_account_id,
                                          revenue_account_id, total_amount, ccy, period_start, period_end)
            VALUES (v_il, v_prop.entity_id, v_ps.deferred_account_id, v_ps.revenue_account_id,
                    v_ps.amount, v_prop.ccy, v_ps.period_start, v_ps.period_end);
        END IF;

        v_lines := v_lines || jsonb_build_object(
            'account_id', CASE WHEN v_ps.is_deferred
                               THEN COALESCE(v_ps.deferred_account_id, v_ps.revenue_account_id)
                               ELSE v_ps.revenue_account_id END,
            'txn_ccy', v_prop.ccy, 'txn_amount', -v_ps.amount, 'location_code', v_loc,
            'memo', (CASE WHEN v_ps.is_deferred THEN 'Deferred: ' ELSE 'Sales: ' END) || v_ps.sname);
    END LOOP;

    v_lines := jsonb_build_array(jsonb_build_object(
        'account_id', v_slc, 'txn_ccy', v_prop.ccy, 'txn_amount', v_net_tot + v_vat_tot,
        'location_code', v_loc, 'memo', 'Trade debtor — invoice')) || v_lines;

    IF v_vat_tot <> 0 THEN
        v_vatacc := cfg_account(v_prop.entity_id, 'VAT_OUTPUT');
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_vatacc, 'txn_ccy', v_prop.ccy, 'txn_amount', -v_vat_tot,
            'location_code', v_loc, 'memo', 'Output VAT');
    END IF;

    v_jid := post_journal(v_prop.entity_id, p_invoice_date, 'billing',
                          'Invoice from proposal ' || p_proposal_id, p_created_by, v_lines);

    UPDATE invoice SET status='posted', journal_id=v_jid,
           net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_net_tot+v_vat_tot
    WHERE id = v_inv_id;

    RETURN v_inv_id;
END $$;
