-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  PURCHASE ORDERS + MATCHING  (034)
-- Vendor master enrichment, purchase orders, goods receipts, and 2-way
-- (PO<->invoice) / 3-way (PO<->receipt<->invoice) matching with tolerance
-- and exception flagging. Reuses record_supplier_invoice for the AP posting.
-- =====================================================================

-- vendor master enrichment on the existing supplier table
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS vendor_code        text;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS vat_no             text;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS payment_terms_days int DEFAULT 30;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS email              text;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS address            text;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS on_hold            boolean NOT NULL DEFAULT false;

CREATE TABLE purchase_order (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id   bigint NOT NULL REFERENCES entity(id),
    supplier_id bigint NOT NULL REFERENCES supplier(id),
    po_number   text,
    po_date     date NOT NULL,
    ccy         char(3) NOT NULL REFERENCES currency(code),
    status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','partially_received','received','closed','cancelled')),
    net_total   numeric(20,2) NOT NULL DEFAULT 0,
    vat_total   numeric(20,2) NOT NULL DEFAULT 0,
    gross_total numeric(20,2) NOT NULL DEFAULT 0,
    created_by  text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_line (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_id        bigint NOT NULL REFERENCES purchase_order(id),
    description  text,
    account_id   bigint NOT NULL REFERENCES account(id),
    quantity     numeric(20,4) NOT NULL,
    unit_price   numeric(20,4) NOT NULL,
    vat_code     int,
    net          numeric(20,2) NOT NULL,
    vat          numeric(20,2) NOT NULL,
    gross        numeric(20,2) NOT NULL,
    qty_received numeric(20,4) NOT NULL DEFAULT 0
);

CREATE TABLE goods_receipt (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_id         bigint NOT NULL REFERENCES purchase_order(id),
    receipt_date  date NOT NULL,
    received_by   text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE goods_receipt_line (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    goods_receipt_id bigint NOT NULL REFERENCES goods_receipt(id),
    po_line_id       bigint NOT NULL REFERENCES purchase_order_line(id),
    qty_received     numeric(20,4) NOT NULL
);

CREATE TABLE po_match (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_id              bigint NOT NULL REFERENCES purchase_order(id),
    supplier_invoice_id bigint NOT NULL REFERENCES supplier_invoice(id),
    match_type         text NOT NULL CHECK (match_type IN ('2way','3way')),
    ordered_value      numeric(20,2),
    received_value     numeric(20,2),
    invoiced_to_date   numeric(20,2),
    this_invoice       numeric(20,2),
    variance           numeric(20,2),
    status             text NOT NULL,   -- matched / over_invoiced / awaiting_receipt / price_variance
    matched_by         text, matched_at timestamptz NOT NULL DEFAULT now()
);

-- create a PO. p_lines: [{description, account_id, quantity, unit_price, vat_code}]
CREATE OR REPLACE FUNCTION create_purchase_order(
    p_entity bigint, p_supplier_id bigint, p_po_date date, p_ccy char(3), p_lines jsonb, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_po bigint; ln jsonb; v_qty numeric; v_price numeric; v_rate numeric; v_net numeric; v_vat numeric;
        v_net_tot numeric := 0; v_vat_tot numeric := 0;
BEGIN
    INSERT INTO purchase_order(entity_id,supplier_id,po_date,ccy,created_by)
      VALUES (p_entity,p_supplier_id,p_po_date,p_ccy,p_created_by) RETURNING id INTO v_po;
    UPDATE purchase_order SET po_number='PO-'||lpad(v_po::text,6,'0') WHERE id=v_po;

    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_qty := (ln->>'quantity')::numeric; v_price := (ln->>'unit_price')::numeric;
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id=(ln->>'vat_code')::int;
        v_net := round(v_qty*v_price,2); v_vat := round(v_net*COALESCE(v_rate,0),2);
        INSERT INTO purchase_order_line(po_id,description,account_id,quantity,unit_price,vat_code,net,vat,gross)
          VALUES (v_po, ln->>'description', (ln->>'account_id')::bigint, v_qty, v_price, (ln->>'vat_code')::int, v_net, v_vat, v_net+v_vat);
        v_net_tot := v_net_tot + v_net; v_vat_tot := v_vat_tot + v_vat;
    END LOOP;
    UPDATE purchase_order SET net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_net_tot+v_vat_tot WHERE id=v_po;
    RETURN v_po;
END $$;

-- record a goods receipt. p_lines: [{po_line_id, qty}]
CREATE OR REPLACE FUNCTION receive_goods(
    p_po_id bigint, p_receipt_date date, p_lines jsonb, p_received_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_grn bigint; ln jsonb; v_full boolean;
BEGIN
    INSERT INTO goods_receipt(po_id,receipt_date,received_by) VALUES (p_po_id,p_receipt_date,p_received_by) RETURNING id INTO v_grn;
    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO goods_receipt_line(goods_receipt_id,po_line_id,qty_received)
          VALUES (v_grn,(ln->>'po_line_id')::bigint,(ln->>'qty')::numeric);
        UPDATE purchase_order_line SET qty_received = qty_received + (ln->>'qty')::numeric WHERE id=(ln->>'po_line_id')::bigint;
    END LOOP;
    SELECT bool_and(qty_received >= quantity) INTO v_full FROM purchase_order_line WHERE po_id=p_po_id;
    UPDATE purchase_order SET status = CASE WHEN v_full THEN 'received' ELSE 'partially_received' END
      WHERE id=p_po_id AND status NOT IN ('closed','cancelled');
    RETURN v_grn;
END $$;

-- match a supplier invoice to a PO (2-way or 3-way) with a tolerance %
CREATE OR REPLACE FUNCTION match_invoice_to_po(
    p_si_id bigint, p_po_id bigint, p_match_type text, p_tolerance_pct numeric DEFAULT 0, p_by text DEFAULT 'system')
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_ordered numeric; v_received numeric; v_inv_todate numeric; v_this numeric;
        v_tol numeric; v_status text; v_var numeric;
BEGIN
    SELECT gross_total INTO v_ordered FROM purchase_order WHERE id=p_po_id;
    SELECT COALESCE(SUM( (qty_received/NULLIF(quantity,0)) * gross ),0) INTO v_received FROM purchase_order_line WHERE po_id=p_po_id;
    SELECT COALESCE(SUM(this_invoice),0) INTO v_inv_todate FROM po_match WHERE po_id=p_po_id;
    SELECT gross INTO v_this FROM supplier_invoice WHERE id=p_si_id;
    v_tol := v_ordered * p_tolerance_pct/100.0;

    IF v_inv_todate + v_this > v_ordered + v_tol THEN
        v_status := 'over_invoiced';
    ELSIF p_match_type='3way' AND v_inv_todate + v_this > v_received + v_tol THEN
        v_status := 'awaiting_receipt';
    ELSE
        v_status := 'matched';
    END IF;
    v_var := (v_inv_todate + v_this) - CASE WHEN p_match_type='3way' THEN v_received ELSE v_ordered END;

    INSERT INTO po_match(po_id,supplier_invoice_id,match_type,ordered_value,received_value,invoiced_to_date,this_invoice,variance,status,matched_by)
      VALUES (p_po_id,p_si_id,p_match_type,v_ordered,v_received,v_inv_todate,v_this,v_var,v_status,p_by);

    IF v_status='matched' AND (v_inv_todate + v_this) >= v_ordered THEN
        UPDATE purchase_order SET status='closed' WHERE id=p_po_id AND status NOT IN ('cancelled');
    END IF;
    RETURN v_status;
END $$;

CREATE OR REPLACE VIEW v_purchase_order AS
SELECT po.id, po.po_number, e.name AS entity, s.name AS supplier, po.po_date, po.ccy,
       po.status, po.net_total, po.vat_total, po.gross_total
FROM purchase_order po JOIN entity e ON e.id=po.entity_id JOIN supplier s ON s.id=po.supplier_id;

CREATE OR REPLACE VIEW v_po_match AS
SELECT m.id, m.po_id, po.po_number, m.supplier_invoice_id, m.match_type,
       m.ordered_value, m.received_value, m.invoiced_to_date, m.this_invoice, m.variance, m.status, m.matched_at
FROM po_match m JOIN purchase_order po ON po.id=m.po_id;
