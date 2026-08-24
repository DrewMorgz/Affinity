-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  BILLING  (003)
-- Signed-off proposals -> invoices -> ledger, plus disbursement pass-through.
-- Everything posts through post_journal(); no module writes the ledger directly.
-- Implements the accounts team's "New System Notes".
-- =====================================================================


-- ---------------------------------------------------------------------
-- Control-account configuration per CoA template.
-- Lets billing resolve "where does the debtor / VAT / disbursement leg go"
-- without hard-coding account ids. role in: SLC, PLC, VAT_OUTPUT, DISBURSEMENTS, BANK
-- ---------------------------------------------------------------------
CREATE TABLE ledger_config (
    coa_template_id smallint NOT NULL REFERENCES coa_template(id),
    role            text NOT NULL,
    account_id      bigint NOT NULL REFERENCES account(id),
    PRIMARY KEY (coa_template_id, role)
);

CREATE TABLE vat_code (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        text UNIQUE NOT NULL,          -- 'STD','ZERO','EXEMPT','RC'
    name        text NOT NULL,
    rate        numeric(6,4) NOT NULL DEFAULT 0  -- 0.2000 = 20%
);

-- Billable service catalogue. Each service knows its revenue and deferred a/cs.
CREATE TABLE service (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                text UNIQUE NOT NULL,
    name                text NOT NULL,
    revenue_account_id  bigint NOT NULL REFERENCES account(id),  -- Sales (PL)
    deferred_account_id bigint REFERENCES account(id),           -- Def income (BS)
    default_vat_code    smallint REFERENCES vat_code(id),
    is_active           boolean NOT NULL DEFAULT true
);

CREATE TABLE bank_account (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id   bigint NOT NULL REFERENCES entity(id),   -- revenue entity (pay-to)
    name        text NOT NULL,
    iban        text,
    ccy         char(3) NOT NULL REFERENCES currency(code),
    is_default  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------
-- Proposals. Billing pulls from here; no manual billing setup (note #6).
-- Must clear signoff (BD/Compliance/Admin/Accounts) before it can bill.
-- ---------------------------------------------------------------------
CREATE TABLE proposal (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),   -- the client being billed
    ccy             char(3) NOT NULL REFERENCES currency(code),
    frequency       text NOT NULL DEFAULT 'annual'
                      CHECK (frequency IN ('one_off','monthly','quarterly','annual')),
    bank_account_id bigint REFERENCES bank_account(id),
    status          text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','awaiting_signoff','signed_off','billing','closed')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proposal_service (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id     bigint NOT NULL REFERENCES proposal(id),
    service_id      bigint NOT NULL REFERENCES service(id),
    amount          numeric(20,2) NOT NULL,         -- net, in proposal ccy
    vat_code        smallint REFERENCES vat_code(id),
    is_deferred     boolean NOT NULL DEFAULT false,  -- billed in advance -> Def income then released
    period_start    date,                            -- service period (drives month-end release)
    period_end      date,
    effective_from  date NOT NULL DEFAULT current_date  -- date-specific changes (note #6)
);

-- Signoff register. All required roles must sign before billing.
CREATE TABLE proposal_signoff (
    proposal_id bigint NOT NULL REFERENCES proposal(id),
    role        text NOT NULL CHECK (role IN ('BD','Compliance','Admin','Accounts')),
    signed_by   text NOT NULL,
    signed_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (proposal_id, role)
);

CREATE TABLE invoice (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    proposal_id     bigint REFERENCES proposal(id),
    invoice_date    date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    bank_account_id bigint REFERENCES bank_account(id),
    net_total       numeric(20,2) NOT NULL DEFAULT 0,
    vat_total       numeric(20,2) NOT NULL DEFAULT 0,
    gross_total     numeric(20,2) NOT NULL DEFAULT 0,
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
    journal_id      bigint REFERENCES journal(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoice_line (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id  bigint NOT NULL REFERENCES invoice(id),
    service_id  bigint REFERENCES service(id),
    description text,
    net         numeric(20,2) NOT NULL,
    vat         numeric(20,2) NOT NULL DEFAULT 0,
    gross       numeric(20,2) NOT NULL
);

-- ---------------------------------------------------------------------
-- Disbursements. A supplier cost posted here MUST be allocated to a client
-- to charge (note: "posting without a corresponding client should not be
-- allowed"). Picked up by the next billing run; nothing sits unallocated.
-- ---------------------------------------------------------------------
CREATE TABLE disbursement (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id           bigint NOT NULL REFERENCES entity(id),  -- client to charge
    supplier            text NOT NULL,
    amount              numeric(20,2) NOT NULL,
    ccy                 char(3) NOT NULL REFERENCES currency(code),
    incurred_date       date NOT NULL,
    status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','billed')),
    purchase_journal_id bigint REFERENCES journal(id),
    recharge_journal_id bigint REFERENCES journal(id)
);


-- =====================================================================
-- HELPERS
-- =====================================================================

-- Resolve a control account for the entity's CoA template.
CREATE OR REPLACE FUNCTION cfg_account(p_entity_id bigint, p_role text)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT lc.account_id
    FROM entity e
    JOIN coa_template t ON t.code = e.client_type
    JOIN ledger_config lc ON lc.coa_template_id = t.id AND lc.role = p_role
    WHERE e.id = p_entity_id;
$$;


-- =====================================================================
-- sign_off_proposal()
-- Records a role's signoff; promotes the proposal to 'signed_off' once
-- BD + Compliance + Admin + Accounts have all signed.
-- =====================================================================
CREATE OR REPLACE FUNCTION sign_off_proposal(p_proposal_id bigint, p_role text, p_who text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_have int;
BEGIN
    INSERT INTO proposal_signoff(proposal_id, role, signed_by)
    VALUES (p_proposal_id, p_role, p_who)
    ON CONFLICT (proposal_id, role) DO UPDATE SET signed_by = excluded.signed_by, signed_at = now();

    SELECT count(*) INTO v_have FROM proposal_signoff
    WHERE proposal_id = p_proposal_id AND role IN ('BD','Compliance','Admin','Accounts');

    IF v_have = 4 THEN
        UPDATE proposal SET status = 'signed_off'
        WHERE id = p_proposal_id AND status IN ('draft','awaiting_signoff');
        RETURN 'signed_off';
    END IF;
    RETURN 'awaiting: ' || (4 - v_have) || ' more';
END $$;


-- =====================================================================
-- generate_invoice()
-- Turns a signed-off proposal into a posted invoice. For each service:
--   deferred  -> Cr Deferred Income (net)   [released to Sales at month-end]
--   immediate -> Cr Sales (net)
-- plus a single Dr SLC (gross) and Cr VAT output (total vat).
-- Posts via post_journal(); refuses if the proposal isn't signed off.
-- =====================================================================
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
BEGIN
    SELECT * INTO v_prop FROM proposal WHERE id = p_proposal_id;
    IF v_prop.id IS NULL THEN RAISE EXCEPTION 'Proposal % not found', p_proposal_id; END IF;
    IF v_prop.status NOT IN ('signed_off','billing') THEN
        RAISE EXCEPTION 'Proposal % is "%": cannot bill until signed off by BD/Compliance/Admin/Accounts',
            p_proposal_id, v_prop.status;
    END IF;

    INSERT INTO invoice(entity_id, proposal_id, invoice_date, ccy, bank_account_id, status)
    VALUES (v_prop.entity_id, p_proposal_id, p_invoice_date, v_prop.ccy, v_prop.bank_account_id, 'draft')
    RETURNING id INTO v_inv_id;

    -- build invoice lines + the revenue/deferred legs of the journal
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
        VALUES (v_inv_id, v_ps.service_id, v_ps.sname, v_ps.amount, v_vat, v_ps.amount + v_vat);

        -- credit revenue (or deferred income if billed in advance)
        v_lines := v_lines || jsonb_build_object(
            'account_id', CASE WHEN v_ps.is_deferred
                               THEN COALESCE(v_ps.deferred_account_id, v_ps.revenue_account_id)
                               ELSE v_ps.revenue_account_id END,
            'txn_ccy', v_prop.ccy, 'txn_amount', -v_ps.amount,
            'location_code', (SELECT location_code FROM entity WHERE id=v_prop.entity_id),
            'memo', (CASE WHEN v_ps.is_deferred THEN 'Deferred: ' ELSE 'Sales: ' END) || v_ps.sname);
    END LOOP;

    -- single debtor leg (gross)
    v_lines := jsonb_build_array(jsonb_build_object(
        'account_id', v_slc, 'txn_ccy', v_prop.ccy, 'txn_amount', v_net_tot + v_vat_tot,
        'location_code', (SELECT location_code FROM entity WHERE id=v_prop.entity_id),
        'memo', 'Trade debtor — invoice')) || v_lines;

    -- VAT output leg, if any
    IF v_vat_tot <> 0 THEN
        v_vatacc := cfg_account(v_prop.entity_id, 'VAT_OUTPUT');
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_vatacc, 'txn_ccy', v_prop.ccy, 'txn_amount', -v_vat_tot,
            'location_code', (SELECT location_code FROM entity WHERE id=v_prop.entity_id),
            'memo', 'Output VAT');
    END IF;

    v_jid := post_journal(v_prop.entity_id, p_invoice_date, 'billing',
                          'Invoice from proposal ' || p_proposal_id, p_created_by, v_lines);

    UPDATE invoice SET status='posted', journal_id=v_jid,
           net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_net_tot+v_vat_tot
    WHERE id = v_inv_id;

    RETURN v_inv_id;
END $$;


-- =====================================================================
-- record_disbursement()
-- Dr Disbursements / Cr Purchase Ledger Control. MUST be tied to a client.
-- =====================================================================
CREATE OR REPLACE FUNCTION record_disbursement(
    p_entity_id bigint, p_supplier text, p_amount numeric, p_ccy char(3),
    p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_plc  bigint := cfg_account(p_entity_id,'PLC');
        v_jid  bigint; v_id bigint; v_loc text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM entity WHERE id = p_entity_id) THEN
        RAISE EXCEPTION 'Disbursement must be allocated to a valid client to charge';
    END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;

    v_jid := post_journal(p_entity_id, p_date, 'disbursement',
        'Supplier disbursement: ' || p_supplier, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_disb,'txn_ccy',p_ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Dr Disbursements'),
          jsonb_build_object('account_id',v_plc ,'txn_ccy',p_ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Cr Purchase Ledger Control')));

    INSERT INTO disbursement(entity_id,supplier,amount,ccy,incurred_date,status,purchase_journal_id)
    VALUES (p_entity_id,p_supplier,p_amount,p_ccy,p_date,'open',v_jid)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- =====================================================================
-- recharge_disbursements()
-- Bills all open disbursements for a client: Dr SLC / Cr Disbursements.
-- The disbursements account nets to zero -> clean reconciliation.
-- =====================================================================
CREATE OR REPLACE FUNCTION recharge_disbursements(p_entity_id bigint, p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_total numeric(20,2); v_ccy char(3); v_loc text;
        v_slc bigint := cfg_account(p_entity_id,'SLC');
        v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_jid bigint;
BEGIN
    SELECT sum(amount), max(ccy) INTO v_total, v_ccy
    FROM disbursement WHERE entity_id=p_entity_id AND status='open';
    IF COALESCE(v_total,0) = 0 THEN RAISE EXCEPTION 'No open disbursements for client %', p_entity_id; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id=p_entity_id;

    v_jid := post_journal(p_entity_id, p_date, 'disbursement-recharge',
        'Recharge disbursements to client', p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_slc ,'txn_ccy',v_ccy,'txn_amount', v_total,'location_code',v_loc,'memo','Dr Sales Ledger Control'),
          jsonb_build_object('account_id',v_disb,'txn_ccy',v_ccy,'txn_amount',-v_total,'location_code',v_loc,'memo','Cr Disbursements')));

    UPDATE disbursement SET status='billed', recharge_journal_id=v_jid
    WHERE entity_id=p_entity_id AND status='open';
    RETURN v_jid;
END $$;

-- NOTE: VAT on disbursements (true disbursement = outside scope vs recharge = VATable)
-- and disbursement mark-up are deliberately not modelled in this first cut — both are
-- flagged refinements. This matches the accounts team's at-cost pass-through.
