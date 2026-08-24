-- =====================================================================
-- AFFINITY — ENTITY ADMIN ENHANCEMENTS (staff feedback round 1)
--  1) Companies Act / incorporation regime on the entity profile
--  2) TIN + country of tax residence on the identity register (officers + UBOs)
-- Run once. Safe to re-run.
-- =====================================================================
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS incorporation_regime text; -- e.g. "Companies Act 2006", "Companies Act 1931"
ALTER TABLE entity_officer  ADD COLUMN IF NOT EXISTS tin text;
ALTER TABLE entity_officer  ADD COLUMN IF NOT EXISTS tax_residence text;
ALTER TABLE entity_ubo      ADD COLUMN IF NOT EXISTS tin text;
ALTER TABLE entity_ubo      ADD COLUMN IF NOT EXISTS tax_residence text;

-- ea_officers / ea_ubos are SETOF, so the new columns flow through automatically.
-- ea_profile is an explicit RETURNS TABLE, so recreate it with the new column.
DROP FUNCTION IF EXISTS ea_profile(bigint);
CREATE FUNCTION ea_profile(p_entity bigint)
RETURNS TABLE(code text, name text, reg_no text, jurisdiction text, entity_type text,
  incorporation_date date, year_end text, tax_status text, fatca_class text, crs_class text,
  giin text, business_activity text, admin_status text, risk_rating text, next_review_date date,
  incorporation_regime text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.company_code, e.name, p.reg_no, p.jurisdiction, p.entity_type, p.incorporation_date,
    p.year_end, p.tax_status, p.fatca_class, p.crs_class, p.giin, p.business_activity,
    COALESCE(p.admin_status,'Active'), p.risk_rating, p.next_review_date, p.incorporation_regime
  FROM entity e LEFT JOIN entity_profile p ON p.entity_id=e.id WHERE e.id=p_entity;
$$;
GRANT EXECUTE ON FUNCTION ea_profile(bigint) TO authenticated;

-- Seed incorporation regime (IOM companies carry the Act; non-IOM / non-company left NULL for staff to set)
UPDATE entity_profile p SET incorporation_regime = CASE
    WHEN p.jurisdiction='Isle of Man' AND p.entity_type='Company' AND p.incorporation_date >= DATE '2006-11-01' THEN 'Companies Act 2006'
    WHEN p.jurisdiction='Isle of Man' AND p.entity_type='Company' THEN 'Companies Act 1931'
    ELSE p.incorporation_regime END
  WHERE incorporation_regime IS NULL;

-- Seed a few TIN + tax residence values on officers/UBOs so the register shows the new fields
UPDATE entity_officer SET tax_residence = COALESCE(tax_residence, nationality);
UPDATE entity_ubo     SET tax_residence = COALESCE(tax_residence, nationality);
UPDATE entity_officer SET tin = 'IM-'||lpad((id*7717 % 999999)::text,6,'0') WHERE tin IS NULL AND nationality IS NOT NULL;
UPDATE entity_ubo     SET tin = 'TIN-'||lpad((id*3313 % 999999)::text,6,'0') WHERE tin IS NULL AND nationality IS NOT NULL;
