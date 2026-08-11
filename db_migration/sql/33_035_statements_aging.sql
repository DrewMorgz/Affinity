-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  STATEMENTS + AGING  (035)
-- Debtor (AR) and creditor (AP) aging by bucket, customer/supplier
-- statements as at a date, and overdue-interest calculation on AR.
-- AR due date derived as invoice_date + 30 days (standard terms);
-- AP uses the supplier_invoice due_date.
-- =====================================================================

CREATE OR REPLACE FUNCTION aging_bucket(p_days int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_days <= 0 THEN 'current'
                WHEN p_days <= 30 THEN '1-30'
                WHEN p_days <= 60 THEN '31-60'
                WHEN p_days <= 90 THEN '61-90'
                ELSE '90+' END;
$$;

-- AR aging summary per customer (entity), as at a date
CREATE OR REPLACE FUNCTION report_ar_aging(p_as_at date DEFAULT current_date)
RETURNS TABLE(entity_id bigint, customer text, current_amt numeric,
              d1_30 numeric, d31_60 numeric, d61_90 numeric, d90_plus numeric, total numeric)
LANGUAGE sql STABLE AS $$
    SELECT i.entity_id, e.name,
      COALESCE(SUM(i.outstanding) FILTER (WHERE p_as_at-(i.invoice_date+30) <= 0),0),
      COALESCE(SUM(i.outstanding) FILTER (WHERE p_as_at-(i.invoice_date+30) BETWEEN 1 AND 30),0),
      COALESCE(SUM(i.outstanding) FILTER (WHERE p_as_at-(i.invoice_date+30) BETWEEN 31 AND 60),0),
      COALESCE(SUM(i.outstanding) FILTER (WHERE p_as_at-(i.invoice_date+30) BETWEEN 61 AND 90),0),
      COALESCE(SUM(i.outstanding) FILTER (WHERE p_as_at-(i.invoice_date+30) > 90),0),
      COALESCE(SUM(i.outstanding),0)
    FROM invoice i JOIN entity e ON e.id=i.entity_id
    WHERE i.outstanding > 0
    GROUP BY i.entity_id, e.name
    ORDER BY e.name;
$$;

-- AP aging summary per supplier, as at a date
CREATE OR REPLACE FUNCTION report_ap_aging(p_as_at date DEFAULT current_date)
RETURNS TABLE(supplier_id bigint, supplier text, current_amt numeric,
              d1_30 numeric, d31_60 numeric, d61_90 numeric, d90_plus numeric, total numeric)
LANGUAGE sql STABLE AS $$
    SELECT si.supplier_id, s.name,
      COALESCE(SUM(si.outstanding) FILTER (WHERE p_as_at-si.due_date <= 0),0),
      COALESCE(SUM(si.outstanding) FILTER (WHERE p_as_at-si.due_date BETWEEN 1 AND 30),0),
      COALESCE(SUM(si.outstanding) FILTER (WHERE p_as_at-si.due_date BETWEEN 31 AND 60),0),
      COALESCE(SUM(si.outstanding) FILTER (WHERE p_as_at-si.due_date BETWEEN 61 AND 90),0),
      COALESCE(SUM(si.outstanding) FILTER (WHERE p_as_at-si.due_date > 90),0),
      COALESCE(SUM(si.outstanding),0)
    FROM supplier_invoice si JOIN supplier s ON s.id=si.supplier_id
    WHERE si.outstanding > 0
    GROUP BY si.supplier_id, s.name
    ORDER BY s.name;
$$;

-- customer statement: open invoices for a customer (entity) as at a date
CREATE OR REPLACE FUNCTION customer_statement(p_entity bigint, p_as_at date DEFAULT current_date)
RETURNS TABLE(doc text, doc_date date, due_date date, ccy char(3),
              gross numeric, outstanding numeric, days_overdue int, bucket text)
LANGUAGE sql STABLE AS $$
    SELECT 'INV-'||lpad(i.id::text,6,'0'), i.invoice_date, (i.invoice_date+30)::date, i.ccy,
           i.gross_total, i.outstanding, (p_as_at-(i.invoice_date+30))::int,
           aging_bucket((p_as_at-(i.invoice_date+30))::int)
    FROM invoice i
    WHERE i.entity_id=p_entity AND i.outstanding > 0 AND i.invoice_date <= p_as_at
    ORDER BY i.invoice_date;
$$;

-- supplier statement: open invoices from a supplier as at a date
CREATE OR REPLACE FUNCTION supplier_statement(p_supplier bigint, p_as_at date DEFAULT current_date)
RETURNS TABLE(doc text, doc_date date, due_date date, ccy char(3),
              gross numeric, outstanding numeric, days_overdue int, bucket text)
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(si.reference,'SI-'||si.id), si.invoice_date, si.due_date, si.ccy,
           si.gross, si.outstanding, (p_as_at-si.due_date)::int, aging_bucket((p_as_at-si.due_date)::int)
    FROM supplier_invoice si
    WHERE si.supplier_id=p_supplier AND si.outstanding > 0 AND si.invoice_date <= p_as_at
    ORDER BY si.invoice_date;
$$;

-- overdue interest on AR (simple: outstanding * annual_rate * days_overdue/365)
CREATE OR REPLACE FUNCTION report_ar_overdue_interest(p_annual_rate_pct numeric, p_as_at date DEFAULT current_date)
RETURNS TABLE(entity_id bigint, customer text, overdue_outstanding numeric, interest numeric)
LANGUAGE sql STABLE AS $$
    SELECT i.entity_id, e.name,
      COALESCE(SUM(i.outstanding),0),
      COALESCE(SUM(round(i.outstanding * p_annual_rate_pct/100.0 * (p_as_at-(i.invoice_date+30))/365.0, 2)),0)
    FROM invoice i JOIN entity e ON e.id=i.entity_id
    WHERE i.outstanding > 0 AND (p_as_at-(i.invoice_date+30)) > 0
    GROUP BY i.entity_id, e.name
    ORDER BY e.name;
$$;
