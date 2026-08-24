-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  DOCUMENT LINKING + AUDITOR PACKS  (045)
--   * link ledger objects (journals, invoices, assets...) to DMS documents
--   * external auditor reporting pack (JSON) assembled from the ledger
--   * journal-entry test sample (audit risk flags)
-- =====================================================================

-- DMS taxonomy (align codes to the app's 17-category folder structure)
CREATE TABLE IF NOT EXISTS dms_category ( code int PRIMARY KEY, name text NOT NULL );
INSERT INTO dms_category(code,name) VALUES
 (1,'Incorporation & Constitutional'),(2,'Statutory Registers'),(3,'KYC / CDD'),
 (4,'Client Agreements'),(5,'Board & Governance'),(6,'Accounting & Bookkeeping'),
 (7,'Financial Statements'),(8,'Tax & VAT'),(9,'Banking'),(10,'Invoices & Billing'),
 (11,'Contracts & Agreements'),(12,'Correspondence'),(13,'Regulatory & Compliance'),
 (14,'Trust Deeds & Documents'),(15,'Property & Assets'),(16,'Fixed Assets'),(17,'Archive')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS document_link (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id bigint NOT NULL REFERENCES entity(id),
    object_type text NOT NULL,             -- 'journal','invoice','supplier_invoice','fixed_asset','bank_statement'
    object_id bigint NOT NULL,
    dms_category int REFERENCES dms_category(code),
    dms_ref text,                          -- path or document id in the app DMS
    filename text,
    uploaded_by text,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_document_link_object ON document_link(object_type, object_id);

CREATE OR REPLACE FUNCTION link_document(
    p_entity bigint, p_object_type text, p_object_id bigint, p_category int,
    p_ref text, p_filename text, p_user text)
RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO document_link(entity_id,object_type,object_id,dms_category,dms_ref,filename,uploaded_by)
    VALUES (p_entity,p_object_type,p_object_id,p_category,p_ref,p_filename,p_user) RETURNING id;
$$;

CREATE OR REPLACE FUNCTION get_object_documents(p_object_type text, p_object_id bigint)
RETURNS TABLE(id bigint, category text, dms_ref text, filename text, uploaded_by text, uploaded_at timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT dl.id, dc.name, dl.dms_ref, dl.filename, dl.uploaded_by, dl.uploaded_at
    FROM document_link dl LEFT JOIN dms_category dc ON dc.code=dl.dms_category
    WHERE dl.object_type=p_object_type AND dl.object_id=p_object_id ORDER BY dl.uploaded_at;
$$;

-- audit risk sample: manual journals in the period that are high-value or weekend-posted
CREATE OR REPLACE FUNCTION journal_test_sample(p_entity bigint, p_start date, p_end date, p_threshold numeric)
RETURNS TABLE(journal_id bigint, journal_date date, created_by text, approved_by text,
              value numeric, flag text)
LANGUAGE sql STABLE AS $$
    SELECT j.id, j.journal_date, j.created_by, j.approved_by,
           t.val,
           concat_ws(' + ',
             CASE WHEN t.val >= p_threshold THEN 'high-value' END,
             CASE WHEN extract(dow from j.journal_date) IN (0,6) THEN 'weekend' END,
             CASE WHEN j.created_by = j.approved_by THEN 'maker=checker' END) AS flag
    FROM journal j
    JOIN (SELECT journal_id, SUM(func_amount) FILTER (WHERE func_amount>0) val FROM journal_line GROUP BY journal_id) t
      ON t.journal_id = j.id
    WHERE j.entity_id=p_entity AND j.status='posted' AND j.journal_type='manual'
      AND j.journal_date BETWEEN p_start AND p_end
      AND ( t.val >= p_threshold OR extract(dow from j.journal_date) IN (0,6) OR j.created_by = j.approved_by )
    ORDER BY t.val DESC;
$$;

-- external auditor pack: one JSON document with the standard year-end extracts
CREATE OR REPLACE FUNCTION build_audit_pack(p_entity bigint, p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v jsonb; v_loc text; v_name text; v_code text;
BEGIN
    SELECT name, company_code INTO v_name, v_code FROM entity WHERE id=p_entity;
    v := jsonb_build_object(
      'entity', jsonb_build_object('id',p_entity,'code',v_code,'name',v_name),
      'period', jsonb_build_object('start',p_start,'end',p_end),
      'generated_at', now(),

      'trial_balance', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'balance',bal) ORDER BY code),'[]')
        FROM (SELECT a.code,a.name,round(SUM(jl.func_amount),2) bal
              FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
                AND j.entity_id=p_entity AND j.journal_date<=p_end
              JOIN account a ON a.id=jl.account_id
              GROUP BY a.code,a.name HAVING round(SUM(jl.func_amount),2)<>0) t),

      'profit_and_loss', (
        SELECT jsonb_build_object(
          'income', COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.account_type='income'),0),
          'expenses', COALESCE(SUM(jl.func_amount) FILTER (WHERE a.account_type='expense'),0),
          'profit', COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.account_type IN ('income','expense')),0))
        FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
          AND j.entity_id=p_entity AND j.journal_date BETWEEN p_start AND p_end
        JOIN account a ON a.id=jl.account_id),

      'balance_sheet', (
        SELECT jsonb_build_object(
          'assets', COALESCE(SUM(jl.func_amount) FILTER (WHERE a.account_type='asset'),0),
          'liabilities', COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.account_type='liability'),0),
          'equity', COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.account_type='equity'),0))
        FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
          AND j.entity_id=p_entity AND j.journal_date<=p_end
        JOIN account a ON a.id=jl.account_id),

      'ar_aging', (
        SELECT jsonb_build_object(
          'current', COALESCE(SUM(outstanding) FILTER (WHERE p_end-(invoice_date+30) <= 0),0),
          'd1_30',   COALESCE(SUM(outstanding) FILTER (WHERE p_end-(invoice_date+30) BETWEEN 1 AND 30),0),
          'd31_60',  COALESCE(SUM(outstanding) FILTER (WHERE p_end-(invoice_date+30) BETWEEN 31 AND 60),0),
          'd60_plus',COALESCE(SUM(outstanding) FILTER (WHERE p_end-(invoice_date+30) > 60),0))
        FROM invoice WHERE entity_id=p_entity AND outstanding>0 AND invoice_date<=p_end),

      'ap_aging', (
        SELECT jsonb_build_object(
          'current', COALESCE(SUM(outstanding) FILTER (WHERE p_end-due_date <= 0),0),
          'd1_30',   COALESCE(SUM(outstanding) FILTER (WHERE p_end-due_date BETWEEN 1 AND 30),0),
          'd31_60',  COALESCE(SUM(outstanding) FILTER (WHERE p_end-due_date BETWEEN 31 AND 60),0),
          'd60_plus',COALESCE(SUM(outstanding) FILTER (WHERE p_end-due_date > 60),0))
        FROM supplier_invoice WHERE entity_id=p_entity AND outstanding>0 AND invoice_date<=p_end),

      'fixed_assets', (SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM note_fixed_assets(p_entity,p_start,p_end) t),
      'related_party', (SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM note_related_party(p_entity,p_start,p_end) t),
      'journal_test_sample', (SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM journal_test_sample(p_entity,p_start,p_end,10000) t),

      'document_completeness', (
        SELECT jsonb_build_object(
          'invoices_total', COUNT(*),
          'invoices_with_documents', COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM document_link dl WHERE dl.object_type='invoice' AND dl.object_id=i.id)),
          'invoices_missing_documents', COUNT(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM document_link dl WHERE dl.object_type='invoice' AND dl.object_id=i.id)))
        FROM invoice i WHERE i.entity_id=p_entity AND i.invoice_date BETWEEN p_start AND p_end)
    );
    RETURN v;
END $$;
