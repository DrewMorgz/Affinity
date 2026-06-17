-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CUSTOMER MASTER + CREDIT CONTROL  (046)
-- A first-class AR customer record (previously customers were implicit),
-- credit limits / hold, a dunning ladder, a collections worklist, and a
-- per-customer statement. Invoices gain an optional customer_id.
-- =====================================================================

CREATE TABLE IF NOT EXISTS customer (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_entity_id    bigint NOT NULL REFERENCES entity(id),   -- the Affinity entity that bills them
    code               text NOT NULL,
    name               text NOT NULL,
    ccy                char(3) NOT NULL DEFAULT 'GBP',
    credit_limit       numeric(20,2) NOT NULL DEFAULT 0,
    payment_terms_days int NOT NULL DEFAULT 30,
    on_hold            boolean NOT NULL DEFAULT false,
    email              text,
    address            text,
    is_active          boolean NOT NULL DEFAULT true,
    UNIQUE (owner_entity_id, code)
);

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS customer_id bigint REFERENCES customer(id);

-- dunning ladder (suggested escalation by days overdue)
CREATE TABLE IF NOT EXISTS dunning_level (
    level int PRIMARY KEY, name text NOT NULL, min_days_overdue int NOT NULL );
INSERT INTO dunning_level(level,name,min_days_overdue) VALUES
 (1,'Statement / reminder',1),(2,'First chaser',15),(3,'Final notice',30),(4,'Pre-legal / stop credit',60)
ON CONFLICT DO NOTHING;

-- collection actions log (audit of chasing activity)
CREATE TABLE IF NOT EXISTS collection_action (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id bigint NOT NULL REFERENCES customer(id),
    invoice_id  bigint REFERENCES invoice(id),
    action_date date NOT NULL,
    level int REFERENCES dunning_level(level),
    note text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION log_collection_action(
    p_customer bigint, p_invoice bigint, p_date date, p_level int, p_note text, p_user text)
RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO collection_action(customer_id,invoice_id,action_date,level,note,created_by)
    VALUES (p_customer,p_invoice,p_date,p_level,p_note,p_user) RETURNING id;
$$;

-- credit status per customer (exposure vs limit)
CREATE OR REPLACE FUNCTION customer_credit_status(p_owner_entity bigint)
RETURNS TABLE(customer_id bigint, code text, name text, credit_limit numeric,
              outstanding numeric, available numeric, over_limit boolean, on_hold boolean)
LANGUAGE sql STABLE AS $$
    SELECT c.id, c.code, c.name, c.credit_limit,
           COALESCE(SUM(i.outstanding),0),
           c.credit_limit - COALESCE(SUM(i.outstanding),0),
           COALESCE(SUM(i.outstanding),0) > c.credit_limit,
           c.on_hold
    FROM customer c
    LEFT JOIN invoice i ON i.customer_id=c.id AND i.outstanding>0
    WHERE c.owner_entity_id=p_owner_entity
    GROUP BY c.id, c.code, c.name, c.credit_limit, c.on_hold
    ORDER BY c.code;
$$;

-- collections worklist: overdue invoices with days overdue + suggested dunning level
CREATE OR REPLACE FUNCTION report_collections(p_owner_entity bigint, p_as_at date DEFAULT current_date)
RETURNS TABLE(customer_code text, customer_name text, invoice_id bigint, invoice_date date,
              due_date date, outstanding numeric, days_overdue int, suggested_level int, dunning_name text)
LANGUAGE sql STABLE AS $$
    SELECT c.code, c.name, i.id, i.invoice_date,
           (i.invoice_date + c.payment_terms_days) AS due_date,
           i.outstanding,
           (p_as_at - (i.invoice_date + c.payment_terms_days))::int AS days_overdue,
           dl.level, dl.name
    FROM invoice i
    JOIN customer c ON c.id = i.customer_id
    LEFT JOIN LATERAL (
        SELECT level, name FROM dunning_level
        WHERE min_days_overdue <= (p_as_at - (i.invoice_date + c.payment_terms_days))
        ORDER BY level DESC LIMIT 1
    ) dl ON true
    WHERE i.entity_id=p_owner_entity AND i.outstanding>0
      AND (i.invoice_date + c.payment_terms_days) < p_as_at
    ORDER BY days_overdue DESC, c.code;
$$;

-- per-customer statement (open items)
CREATE OR REPLACE FUNCTION customer_statement_for(p_customer bigint, p_as_at date DEFAULT current_date)
RETURNS TABLE(invoice_id bigint, invoice_date date, gross numeric, outstanding numeric, status text)
LANGUAGE sql STABLE AS $$
    SELECT i.id, i.invoice_date, i.gross_total, i.outstanding, i.settled
    FROM invoice i WHERE i.customer_id=p_customer AND i.invoice_date<=p_as_at
    ORDER BY i.invoice_date, i.id;
$$;
