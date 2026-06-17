-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  ACCOUNTS RECEIVABLE / CASH APPLICATION (007)
-- Customer receipts: Dr Bank / Cr Sales Ledger Control, allocated against
-- the invoices raised in 003. Clears the debtor as clients pay.
-- Mirror of the AP payment run.
-- =====================================================================

-- track settlement on the invoice (posting status stays in `status`)
ALTER TABLE invoice ADD COLUMN outstanding numeric(20,2);
ALTER TABLE invoice ADD COLUMN settled text NOT NULL DEFAULT 'open'
      CHECK (settled IN ('open','part_paid','paid'));

-- initialise outstanding when an invoice posts (keeps generate_invoice untouched)
CREATE OR REPLACE FUNCTION init_invoice_outstanding()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'posted' AND NEW.outstanding IS NULL THEN
        NEW.outstanding := NEW.gross_total;
        NEW.settled := 'open';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_init_invoice_outstanding
    BEFORE INSERT OR UPDATE ON invoice
    FOR EACH ROW EXECUTE FUNCTION init_invoice_outstanding();

-- backfill any already-posted invoices
UPDATE invoice SET outstanding = gross_total, settled = 'open'
WHERE status = 'posted' AND outstanding IS NULL;


CREATE TABLE receipt (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id    bigint NOT NULL REFERENCES entity(id),
    receipt_date date NOT NULL,
    ccy          char(3) NOT NULL REFERENCES currency(code),
    amount       numeric(20,2) NOT NULL,
    journal_id   bigint REFERENCES journal(id),
    created_by   text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE receipt_allocation (
    receipt_id  bigint NOT NULL REFERENCES receipt(id),
    invoice_id  bigint NOT NULL REFERENCES invoice(id),
    amount      numeric(20,2) NOT NULL,
    PRIMARY KEY (receipt_id, invoice_id)
);


-- ---------------------------------------------------------------------
-- apply_receipt() — record a customer payment and allocate it to invoices.
-- Posts one Dr Bank / Cr SLC for the total; reduces each invoice's
-- outstanding; marks paid / part_paid. Refuses to over-allocate.
-- p_allocations: jsonb array of { "invoice_id": N, "amount": X }
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_receipt(
    p_entity_id bigint, p_receipt_date date, p_ccy char(3),
    p_created_by text, p_allocations jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_bank bigint := cfg_account(p_entity_id,'BANK');
        v_slc  bigint := cfg_account(p_entity_id,'SLC');
        v_loc text; v_total numeric(20,2) := 0; v_alloc jsonb;
        v_inv invoice%ROWTYPE; v_amt numeric(20,2); v_jid bigint; v_rcpt bigint;
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;

    -- validate every allocation first
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_amt := (v_alloc->>'amount')::numeric;
        SELECT * INTO v_inv FROM invoice WHERE id = (v_alloc->>'invoice_id')::bigint;
        IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', v_alloc->>'invoice_id'; END IF;
        IF v_inv.entity_id <> p_entity_id THEN RAISE EXCEPTION 'Invoice % belongs to another entity', v_inv.id; END IF;
        IF v_inv.status <> 'posted' THEN RAISE EXCEPTION 'Invoice % is not posted', v_inv.id; END IF;
        IF v_amt <= 0 THEN RAISE EXCEPTION 'Allocation amount must be positive (invoice %)', v_inv.id; END IF;
        IF v_amt > v_inv.outstanding THEN
            RAISE EXCEPTION 'Cannot allocate % to invoice %: only % outstanding', v_amt, v_inv.id, v_inv.outstanding;
        END IF;
        v_total := v_total + v_amt;
    END LOOP;

    IF v_total = 0 THEN RAISE EXCEPTION 'Receipt has no allocations'; END IF;

    v_jid := post_journal(p_entity_id, p_receipt_date, 'receipt',
        'Customer receipt', p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_bank,'txn_ccy',p_ccy,'txn_amount', v_total,'location_code',v_loc,'memo','Dr Bank'),
          jsonb_build_object('account_id',v_slc ,'txn_ccy',p_ccy,'txn_amount',-v_total,'location_code',v_loc,'memo','Cr Sales Ledger Control')));

    INSERT INTO receipt(entity_id,receipt_date,ccy,amount,journal_id,created_by)
    VALUES (p_entity_id,p_receipt_date,p_ccy,v_total,v_jid,p_created_by) RETURNING id INTO v_rcpt;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_amt := (v_alloc->>'amount')::numeric;
        INSERT INTO receipt_allocation(receipt_id,invoice_id,amount)
        VALUES (v_rcpt, (v_alloc->>'invoice_id')::bigint, v_amt);
        UPDATE invoice
           SET outstanding = outstanding - v_amt,
               settled = CASE WHEN outstanding - v_amt = 0 THEN 'paid' ELSE 'part_paid' END
         WHERE id = (v_alloc->>'invoice_id')::bigint;
    END LOOP;

    RETURN v_rcpt;
END $$;


-- AR aging: open customer invoices
CREATE OR REPLACE VIEW v_ar_open AS
SELECT i.entity_id, e.company_code, i.id AS invoice_id, i.invoice_date, i.ccy,
       i.gross_total, i.outstanding, i.settled
FROM invoice i JOIN entity e ON e.id = i.entity_id
WHERE i.status = 'posted' AND COALESCE(i.outstanding,0) > 0
ORDER BY i.invoice_date;
