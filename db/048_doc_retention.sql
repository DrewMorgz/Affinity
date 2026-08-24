-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  DOCUMENT RETENTION + SEARCH  (048)
-- Extends 045: a per-category retention policy that stamps a retention_until
-- date on every linked document, a destruction-review worklist, and full-text
-- search across the document repository (filename / reference / category).
-- =====================================================================

CREATE TABLE IF NOT EXISTS retention_policy (
    dms_category int PRIMARY KEY REFERENCES dms_category(code),
    retain_years int,            -- NULL = retain permanently
    basis text
);
-- sensible CSP / trust defaults (NULL = permanent)
INSERT INTO retention_policy(dms_category,retain_years,basis) VALUES
 (1,NULL,'Constitutional — retain permanently'),
 (2,NULL,'Statutory registers — retain permanently'),
 (3,5,'KYC/CDD — 5 years after end of relationship'),
 (4,6,'Client agreements — 6 years'),
 (5,NULL,'Board & governance — retain permanently'),
 (6,6,'Accounting records — 6 years'),
 (7,NULL,'Financial statements — retain permanently'),
 (8,6,'Tax & VAT — 6 years'),
 (9,6,'Banking — 6 years'),
 (10,6,'Invoices & billing — 6 years'),
 (11,6,'Contracts — 6 years'),
 (12,6,'Correspondence — 6 years'),
 (13,6,'Regulatory & compliance — 6 years'),
 (14,NULL,'Trust deeds — retain permanently'),
 (15,6,'Property & assets — 6 years'),
 (16,6,'Fixed assets — 6 years'),
 (17,10,'Archive — 10 years')
ON CONFLICT DO NOTHING;

ALTER TABLE document_link ADD COLUMN IF NOT EXISTS retention_until date;

-- recreate link_document so it stamps retention_until from the policy
CREATE OR REPLACE FUNCTION link_document(
    p_entity bigint, p_object_type text, p_object_id bigint, p_category int,
    p_ref text, p_filename text, p_user text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_years int; v_until date; v_id bigint;
BEGIN
    SELECT retain_years INTO v_years FROM retention_policy WHERE dms_category=p_category;
    v_until := CASE WHEN v_years IS NULL THEN NULL ELSE (current_date + (v_years||' years')::interval)::date END;
    INSERT INTO document_link(entity_id,object_type,object_id,dms_category,dms_ref,filename,uploaded_by,retention_until)
    VALUES (p_entity,p_object_type,p_object_id,p_category,p_ref,p_filename,p_user,v_until)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- backfill retention_until on documents linked before this migration
UPDATE document_link dl
SET retention_until = CASE WHEN rp.retain_years IS NULL THEN NULL
                           ELSE (dl.uploaded_at::date + (rp.retain_years||' years')::interval)::date END
FROM retention_policy rp
WHERE dl.dms_category = rp.dms_category AND dl.retention_until IS NULL;

-- documents past their retention date (destruction review worklist)
CREATE OR REPLACE VIEW v_documents_due_destruction AS
SELECT dl.id, dl.entity_id, dc.name AS category, dl.filename, dl.dms_ref,
       dl.uploaded_at::date AS uploaded, dl.retention_until
FROM document_link dl JOIN dms_category dc ON dc.code=dl.dms_category
WHERE dl.retention_until IS NOT NULL AND dl.retention_until <= current_date;

-- full-text search across the repository (filename / reference / category)
CREATE OR REPLACE FUNCTION search_documents(p_entity bigint, p_query text)
RETURNS TABLE(id bigint, object_type text, object_id bigint, category text,
              filename text, dms_ref text, uploaded timestamptz, rank real)
LANGUAGE sql STABLE AS $$
    SELECT dl.id, dl.object_type, dl.object_id, dc.name, dl.filename, dl.dms_ref, dl.uploaded_at,
           ts_rank(to_tsvector('english',
               coalesce(dl.filename,'')||' '||coalesce(dl.dms_ref,'')||' '||coalesce(dc.name,'')),
               websearch_to_tsquery('english', p_query)) AS rank
    FROM document_link dl JOIN dms_category dc ON dc.code=dl.dms_category
    WHERE (p_entity IS NULL OR dl.entity_id=p_entity)
      AND to_tsvector('english',
            coalesce(dl.filename,'')||' '||coalesce(dl.dms_ref,'')||' '||coalesce(dc.name,''))
          @@ websearch_to_tsquery('english', p_query)
    ORDER BY rank DESC, dl.uploaded_at DESC;
$$;
