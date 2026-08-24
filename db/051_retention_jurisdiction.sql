-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE — JURISDICTION-AWARE RETENTION  (051)
-- Aligns document retention to the Master Security Document §8: retention
-- depends on data type (Corporate / AML-CFT / Audit) AND the entity's
-- jurisdiction. Extends the flat per-category policy from 048.
--   Corporate records : IOM/Malta/Cayman/Cyprus 6y · US 7y
--   AML/CFT records    : IOM/Malta/Cyprus 5y · Cayman up to 7y · US n/a
--   Audit logs         : 7y everywhere (reference; enforced at the log store)
-- =====================================================================

-- jurisdictions referenced by the matrix (guarded)
INSERT INTO location(code,name) VALUES
 ('USA','United States'),('CYPRUS','Cyprus'),('UK','United Kingdom')
ON CONFLICT DO NOTHING;

-- classify each document category into a data class
ALTER TABLE retention_policy ADD COLUMN IF NOT EXISTS data_class text;
UPDATE retention_policy SET data_class='AML_CFT'   WHERE dms_category IN (3,13);
UPDATE retention_policy SET data_class='CORPORATE' WHERE dms_category IN (4,6,8,9,10,11,12,15,16);
-- categories 1,2,5,7,14 (permanent) and 17 (archive) keep data_class NULL and
-- therefore fall back to their base retain_years from 048.

-- data-class × jurisdiction retention matrix (§8)
CREATE TABLE IF NOT EXISTS retention_rule (
    data_class   text NOT NULL,
    jurisdiction text NOT NULL REFERENCES location(code),
    retain_years int,                 -- NULL = no rule / permanent
    basis        text,
    PRIMARY KEY (data_class, jurisdiction)
);
INSERT INTO retention_rule(data_class,jurisdiction,retain_years,basis) VALUES
 ('CORPORATE','IOM',   6,'Corporate records — 6 years'),
 ('CORPORATE','MALTA', 6,'Corporate records — 6 years'),
 ('CORPORATE','CYM',   6,'Corporate records — 6 years'),
 ('CORPORATE','CYPRUS',6,'Corporate records — 6 years'),
 ('CORPORATE','UK',    6,'Corporate records — 6 years'),
 ('CORPORATE','USA',   7,'Corporate/tax records — 7 years'),
 ('AML_CFT','IOM',   5,'AML/CFT — 5 years'),
 ('AML_CFT','MALTA', 5,'AML/CFT — 5 years'),
 ('AML_CFT','CYM',   7,'AML/CFT — up to 7 years'),
 ('AML_CFT','CYPRUS',5,'AML/CFT — 5 years'),
 ('AML_CFT','UK',    5,'AML/CFT — 5 years'),
 -- US AML/CFT deliberately omitted (doc: N/A) -> falls back to category base
 ('AUDIT','IOM',7,'Audit logs — 7 years'),('AUDIT','MALTA',7,'Audit logs — 7 years'),
 ('AUDIT','CYM',7,'Audit logs — 7 years'),('AUDIT','CYPRUS',7,'Audit logs — 7 years'),
 ('AUDIT','UK',7,'Audit logs — 7 years'),('AUDIT','USA',7,'Audit logs — 7 years')
ON CONFLICT DO NOTHING;

-- resolve retention years for a category in a jurisdiction
CREATE OR REPLACE FUNCTION retention_years(p_category int, p_jurisdiction text)
RETURNS int LANGUAGE plpgsql STABLE AS $$
DECLARE v_class text; v_base int; v_years int;
BEGIN
    SELECT data_class, retain_years INTO v_class, v_base FROM retention_policy WHERE dms_category=p_category;
    IF v_class IS NULL THEN RETURN v_base; END IF;           -- permanent / flat base
    SELECT retain_years INTO v_years FROM retention_rule
      WHERE data_class=v_class AND jurisdiction=p_jurisdiction;
    IF FOUND THEN RETURN v_years; END IF;                     -- jurisdiction-specific
    RETURN v_base;                                            -- no rule -> category base
END $$;

-- link_document now stamps retention using the entity's jurisdiction
CREATE OR REPLACE FUNCTION link_document(
    p_entity bigint, p_object_type text, p_object_id bigint, p_category int,
    p_ref text, p_filename text, p_user text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_juris text; v_years int; v_until date; v_id bigint;
BEGIN
    SELECT location_code INTO v_juris FROM entity WHERE id=p_entity;
    v_years := retention_years(p_category, v_juris);
    v_until := CASE WHEN v_years IS NULL THEN NULL
                    ELSE (current_date + (v_years||' years')::interval)::date END;
    INSERT INTO document_link(entity_id,object_type,object_id,dms_category,dms_ref,filename,uploaded_by,retention_until)
    VALUES (p_entity,p_object_type,p_object_id,p_category,p_ref,p_filename,p_user,v_until)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- recompute retention on existing documents using their entity's jurisdiction
UPDATE document_link dl
SET retention_until = CASE WHEN retention_years(dl.dms_category, e.location_code) IS NULL THEN NULL
    ELSE (dl.uploaded_at::date + (retention_years(dl.dms_category, e.location_code)||' years')::interval)::date END
FROM entity e WHERE e.id = dl.entity_id;

-- reference schedule: category × jurisdiction × effective years
CREATE OR REPLACE VIEW v_retention_schedule AS
SELECT rp.dms_category, dc.name AS category, COALESCE(rp.data_class,'(flat)') AS data_class,
       rr.jurisdiction, COALESCE(rr.retain_years, rp.retain_years) AS retain_years
FROM retention_policy rp
JOIN dms_category dc ON dc.code=rp.dms_category
LEFT JOIN retention_rule rr ON rr.data_class=rp.data_class
ORDER BY rp.dms_category, rr.jurisdiction;
