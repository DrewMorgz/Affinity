-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  EXPENSE MANAGEMENT  (015)
-- Employee expense claims: submit -> approve -> reimburse.
-- On approval the expense + recoverable VAT are recognised against a payable
-- to the employee; reimbursement clears that payable from the bank.
-- Control account via ledger_config: EMP_PAYABLE.
-- =====================================================================

CREATE TABLE employee (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id bigint NOT NULL REFERENCES entity(id),
    name      text NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE expense_claim (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id     bigint NOT NULL REFERENCES employee(id),
    entity_id       bigint NOT NULL REFERENCES entity(id),
    claim_date      date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    net_total       numeric(20,2) NOT NULL DEFAULT 0,
    vat_total       numeric(20,2) NOT NULL DEFAULT 0,
    gross_total     numeric(20,2) NOT NULL DEFAULT 0,
    status          text NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('submitted','approved','rejected','reimbursed')),
    approved_by     text,
    reject_reason   text,
    accrual_journal_id   bigint REFERENCES journal(id),
    reimburse_journal_id bigint REFERENCES journal(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expense_claim_line (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    claim_id           bigint NOT NULL REFERENCES expense_claim(id),
    expense_date       date NOT NULL,
    description        text,
    expense_account_id bigint NOT NULL REFERENCES account(id),
    net                numeric(20,2) NOT NULL,
    vat_code           int,
    vat                numeric(20,2) NOT NULL DEFAULT 0,
    gross              numeric(20,2) NOT NULL
);


-- submit_expense_claim(): create a submitted claim with lines (no posting yet).
-- p_lines: [{ "expense_date","description","expense_account_id","net","vat_code" }]
CREATE OR REPLACE FUNCTION submit_expense_claim(
    p_employee_id bigint, p_entity_id bigint, p_claim_date date, p_ccy char(3),
    p_lines jsonb, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_claim bigint; ln jsonb; v_rate numeric(6,4); v_vat numeric(20,2);
        v_net numeric(20,2); v_net_tot numeric(20,2) := 0; v_vat_tot numeric(20,2) := 0;
BEGIN
    INSERT INTO expense_claim(employee_id,entity_id,claim_date,ccy,status)
    VALUES (p_employee_id,p_entity_id,p_claim_date,p_ccy,'submitted') RETURNING id INTO v_claim;

    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_net := (ln->>'net')::numeric;
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = (ln->>'vat_code')::int;
        v_rate := COALESCE(v_rate,0); v_vat := round(v_net*v_rate,2);
        INSERT INTO expense_claim_line(claim_id,expense_date,description,expense_account_id,net,vat_code,vat,gross)
        VALUES (v_claim,(ln->>'expense_date')::date,ln->>'description',(ln->>'expense_account_id')::bigint,
                v_net,(ln->>'vat_code')::int,v_vat,v_net+v_vat);
        v_net_tot := v_net_tot + v_net; v_vat_tot := v_vat_tot + v_vat;
    END LOOP;

    UPDATE expense_claim SET net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_net_tot+v_vat_tot
    WHERE id = v_claim;
    RETURN v_claim;
END $$;


-- approve_expense_claim(): recognise expense + VAT input, accrue payable to employee.
CREATE OR REPLACE FUNCTION approve_expense_claim(p_claim_id bigint, p_approver text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c expense_claim%ROWTYPE; v_loc text; v_vatin bigint; v_pay bigint;
        ln record; v_lines jsonb := '[]'::jsonb; v_jid bigint;
BEGIN
    SELECT * INTO c FROM expense_claim WHERE id = p_claim_id;
    IF c.id IS NULL THEN RAISE EXCEPTION 'Claim % not found', p_claim_id; END IF;
    IF c.status <> 'submitted' THEN RAISE EXCEPTION 'Claim % is % — only submitted claims can be approved', p_claim_id, c.status; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = c.entity_id;
    v_pay := cfg_account(c.entity_id,'EMP_PAYABLE');

    FOR ln IN SELECT * FROM expense_claim_line WHERE claim_id = p_claim_id LOOP
        v_lines := v_lines || jsonb_build_object('account_id',ln.expense_account_id,'txn_ccy',c.ccy,
                    'txn_amount',ln.net,'location_code',v_loc,'memo',COALESCE(ln.description,'Expense'));
    END LOOP;
    IF c.vat_total <> 0 THEN
        v_vatin := cfg_account(c.entity_id,'VAT_INPUT');
        v_lines := v_lines || jsonb_build_object('account_id',v_vatin,'txn_ccy',c.ccy,'txn_amount',c.vat_total,'location_code',v_loc,'memo','VAT input');
    END IF;
    v_lines := v_lines || jsonb_build_object('account_id',v_pay,'txn_ccy',c.ccy,'txn_amount',-c.gross_total,'location_code',v_loc,'memo','Employee reimbursement payable');

    v_jid := post_journal(c.entity_id, c.claim_date, 'expense', 'Expense claim '||p_claim_id||' approved', p_approver, v_lines);
    UPDATE expense_claim SET status='approved', approved_by=p_approver, accrual_journal_id=v_jid WHERE id = p_claim_id;
    RETURN v_jid;
END $$;


-- reimburse_expense_claim(): pay the employee, clearing the payable.
CREATE OR REPLACE FUNCTION reimburse_expense_claim(p_claim_id bigint, p_date date, p_created_by text, p_bank_account_id bigint DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c expense_claim%ROWTYPE; v_loc text; v_pay bigint; v_bank bigint; v_jid bigint;
BEGIN
    SELECT * INTO c FROM expense_claim WHERE id = p_claim_id;
    IF c.id IS NULL THEN RAISE EXCEPTION 'Claim % not found', p_claim_id; END IF;
    IF c.status <> 'approved' THEN RAISE EXCEPTION 'Claim % is % — only approved claims can be reimbursed', p_claim_id, c.status; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = c.entity_id;
    v_pay := cfg_account(c.entity_id,'EMP_PAYABLE');
    v_bank := COALESCE(p_bank_account_id, cfg_account(c.entity_id,'BANK'));

    v_jid := post_journal(c.entity_id, p_date, 'expense-reimbursement', 'Reimburse expense claim '||p_claim_id, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_pay ,'txn_ccy',c.ccy,'txn_amount', c.gross_total,'location_code',v_loc,'memo','Dr Employee payable'),
          jsonb_build_object('account_id',v_bank,'txn_ccy',c.ccy,'txn_amount',-c.gross_total,'location_code',v_loc,'memo','Cr Bank')));
    UPDATE expense_claim SET status='reimbursed', reimburse_journal_id=v_jid WHERE id = p_claim_id;
    RETURN v_jid;
END $$;


CREATE OR REPLACE FUNCTION reject_expense_claim(p_claim_id bigint, p_approver text, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE expense_claim SET status='rejected', approved_by=p_approver, reject_reason=p_reason
    WHERE id = p_claim_id AND status = 'submitted';
    IF NOT FOUND THEN RAISE EXCEPTION 'Claim % not found or not in submitted state', p_claim_id; END IF;
END $$;
