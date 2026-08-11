-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  PAYMENT RUNS + SEPA  (033)
-- Batch payment of open payables with an approval gate:
--   create (draft) -> approve (generates SEPA pain.001 XML) -> execute (posts)
-- Execution posts Dr trade creditor (PLC) / Cr bank and clears the supplier
-- invoices. SEPA file is pain.001.001.03 (SEPA Credit Transfer), IBAN-only.
-- =====================================================================

-- structured payee bank details on the supplier (minimal vendor-master fields)
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS bic  text;

CREATE TABLE payment_run (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    run_date        date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    debtor_bank_account_id bigint NOT NULL REFERENCES bank_account(id),
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','executed','cancelled')),
    total           numeric(20,2) NOT NULL DEFAULT 0,
    item_count      int NOT NULL DEFAULT 0,
    created_by      text, prepared_at timestamptz DEFAULT now(),
    approved_by     text, approved_at timestamptz,
    executed_at     timestamptz,
    journal_id      bigint REFERENCES journal(id),
    sepa_xml        text
);

CREATE TABLE payment_run_item (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_run_id     bigint NOT NULL REFERENCES payment_run(id),
    supplier_invoice_id bigint REFERENCES supplier_invoice(id),
    payee_name         text NOT NULL,
    payee_iban         text,
    payee_bic          text,
    amount             numeric(20,2) NOT NULL,
    ccy                char(3) NOT NULL,
    reference          text,
    status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid'))
);

CREATE OR REPLACE FUNCTION xml_escape(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT replace(replace(replace(COALESCE(p,''),'&','&amp;'),'<','&lt;'),'>','&gt;');
$$;

CREATE OR REPLACE FUNCTION create_payment_run(
    p_entity bigint, p_run_date date, p_ccy char(3), p_bank_account_id bigint, p_created_by text)
RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO payment_run(entity_id,run_date,ccy,debtor_bank_account_id,created_by)
    VALUES (p_entity,p_run_date,p_ccy,p_bank_account_id,p_created_by) RETURNING id;
$$;

-- pull all open payables (matching the run's currency) that have a payee IBAN
CREATE OR REPLACE FUNCTION add_open_payables_to_run(p_run_id bigint)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE r payment_run; v_n int := 0;
BEGIN
    SELECT * INTO r FROM payment_run WHERE id=p_run_id FOR UPDATE;
    IF r.status <> 'draft' THEN RAISE EXCEPTION 'Run % is % — items can only be added while draft', p_run_id, r.status; END IF;
    INSERT INTO payment_run_item(payment_run_id,supplier_invoice_id,payee_name,payee_iban,payee_bic,amount,ccy,reference)
    SELECT p_run_id, si.id, s.name, s.iban, s.bic, si.outstanding, si.ccy, si.reference
    FROM supplier_invoice si JOIN supplier s ON s.id=si.supplier_id
    WHERE si.entity_id=r.entity_id AND si.ccy=r.ccy AND si.outstanding>0 AND si.status<>'paid';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE payment_run
       SET item_count=(SELECT count(*) FROM payment_run_item WHERE payment_run_id=p_run_id),
           total=(SELECT COALESCE(SUM(amount),0) FROM payment_run_item WHERE payment_run_id=p_run_id)
     WHERE id=p_run_id;
    RETURN v_n;
END $$;

-- build a SEPA pain.001.001.03 credit-transfer file for the run
CREATE OR REPLACE FUNCTION generate_sepa_pain001(p_run_id bigint)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE r payment_run; v_bank bank_account; v_dbtr text; v_msgid text; v_txs text; v_xml text;
BEGIN
    SELECT * INTO r FROM payment_run WHERE id=p_run_id;
    SELECT * INTO v_bank FROM bank_account WHERE id=r.debtor_bank_account_id;
    SELECT name INTO v_dbtr FROM entity WHERE id=r.entity_id;
    v_msgid := 'AFF-'||p_run_id||'-'||to_char(now(),'YYYYMMDDHH24MISS');

    SELECT string_agg(
      '      <CdtTrfTxInf>'||
      '<PmtId><EndToEndId>'||xml_escape(COALESCE(i.reference,'PAY-'||i.id))||'</EndToEndId></PmtId>'||
      '<Amt><InstdAmt Ccy="'||i.ccy||'">'||to_char(i.amount,'FM9999999990.00')||'</InstdAmt></Amt>'||
      '<CdtrAgt><FinInstnId>'||CASE WHEN i.payee_bic IS NOT NULL THEN '<BIC>'||i.payee_bic||'</BIC>' ELSE '<Othr><Id>NOTPROVIDED</Id></Othr>' END||'</FinInstnId></CdtrAgt>'||
      '<Cdtr><Nm>'||xml_escape(i.payee_name)||'</Nm></Cdtr>'||
      '<CdtrAcct><Id><IBAN>'||COALESCE(i.payee_iban,'')||'</IBAN></Id></CdtrAcct>'||
      '<RmtInf><Ustrd>'||xml_escape(COALESCE(i.reference,''))||'</Ustrd></RmtInf></CdtTrfTxInf>', E'\n'
      ORDER BY i.id)
    INTO v_txs FROM payment_run_item i WHERE i.payment_run_id=p_run_id;

    v_xml :=
'<?xml version="1.0" encoding="UTF-8"?>'||E'\n'||
'<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">'||E'\n'||
'  <CstmrCdtTrfInitn>'||E'\n'||
'    <GrpHdr><MsgId>'||v_msgid||'</MsgId><CreDtTm>'||to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS')||'</CreDtTm>'||
       '<NbOfTxs>'||r.item_count||'</NbOfTxs><CtrlSum>'||to_char(r.total,'FM9999999990.00')||'</CtrlSum>'||
       '<InitgPty><Nm>'||xml_escape(v_dbtr)||'</Nm></InitgPty></GrpHdr>'||E'\n'||
'    <PmtInf><PmtInfId>'||v_msgid||'</PmtInfId><PmtMtd>TRF</PmtMtd>'||
       '<NbOfTxs>'||r.item_count||'</NbOfTxs><CtrlSum>'||to_char(r.total,'FM9999999990.00')||'</CtrlSum>'||
       '<ReqdExctnDt>'||to_char(r.run_date,'YYYY-MM-DD')||'</ReqdExctnDt>'||
       '<Dbtr><Nm>'||xml_escape(v_dbtr)||'</Nm></Dbtr>'||
       '<DbtrAcct><Id><IBAN>'||COALESCE(v_bank.iban,'')||'</IBAN></Id></DbtrAcct>'||
       '<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>'||E'\n'||
       v_txs||E'\n'||
'    </PmtInf>'||E'\n'||
'  </CstmrCdtTrfInitn>'||E'\n'||
'</Document>';
    RETURN v_xml;
END $$;

-- approve: lock the run and attach the SEPA file
CREATE OR REPLACE FUNCTION approve_payment_run(p_run_id bigint, p_approver text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r payment_run;
BEGIN
    SELECT * INTO r FROM payment_run WHERE id=p_run_id FOR UPDATE;
    IF r.status <> 'draft' THEN RAISE EXCEPTION 'Run % must be draft to approve (is %)', p_run_id, r.status; END IF;
    IF r.item_count = 0 THEN RAISE EXCEPTION 'Run % has no items', p_run_id; END IF;
    UPDATE payment_run SET status='approved', approved_by=p_approver, approved_at=now(),
                           sepa_xml=generate_sepa_pain001(p_run_id) WHERE id=p_run_id;
END $$;

-- execute: post Dr PLC / Cr bank and clear the payables
CREATE OR REPLACE FUNCTION execute_payment_run(p_run_id bigint, p_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r payment_run; v_loc text; v_plc bigint; v_bank bigint; v_jid bigint; v_lines jsonb := '[]'::jsonb; it record;
BEGIN
    SELECT * INTO r FROM payment_run WHERE id=p_run_id FOR UPDATE;
    IF r.status <> 'approved' THEN RAISE EXCEPTION 'Run % must be approved to execute (is %)', p_run_id, r.status; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id=r.entity_id;
    v_plc := cfg_account(r.entity_id,'PLC'); v_bank := cfg_account(r.entity_id,'BANK');

    FOR it IN SELECT * FROM payment_run_item WHERE payment_run_id=p_run_id LOOP
        v_lines := v_lines || jsonb_build_object('account_id',v_plc,'txn_ccy',r.ccy,'txn_amount',it.amount,'location_code',v_loc,'memo','Pay '||it.payee_name);
    END LOOP;
    v_lines := v_lines || jsonb_build_object('account_id',v_bank,'txn_ccy',r.ccy,'txn_amount',-r.total,'location_code',v_loc,'memo','Payment run '||p_run_id);

    v_jid := post_journal(r.entity_id, r.run_date, 'payment-run', 'SEPA payment run '||p_run_id, p_by, v_lines);

    UPDATE supplier_invoice si SET outstanding=0, status='paid'
      FROM payment_run_item i WHERE i.payment_run_id=p_run_id AND i.supplier_invoice_id=si.id;
    UPDATE payment_run_item SET status='paid' WHERE payment_run_id=p_run_id;
    UPDATE payment_run SET status='executed', executed_at=now(), journal_id=v_jid WHERE id=p_run_id;
    RETURN v_jid;
END $$;

CREATE OR REPLACE VIEW v_payment_run AS
SELECT pr.id, e.name AS entity, pr.run_date, pr.ccy, pr.status, pr.item_count, pr.total,
       pr.created_by, pr.approved_by, pr.executed_at
FROM payment_run pr JOIN entity e ON e.id=pr.entity_id;
