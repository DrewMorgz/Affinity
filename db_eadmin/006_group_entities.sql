-- =====================================================================
-- AFFINITY — OWN GROUP ENTITIES (staff feedback #6)
-- Adds Affinity's own regulated/holding companies as managed entities
-- (entity_class='group'), so they can hold master-file documents and act
-- as managed legal entities in Compliance. Ring-fenced from client portfolio.
-- Run once. Safe to re-run.
-- =====================================================================

-- Master-record fields for regulated/own entities
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS regulator         text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS licence_no        text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS mlro              text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS registered_office text;

DO $$
DECLARE eid bigint;
BEGIN
  -- 1) the entities (skip if already present)
  IF NOT EXISTS (SELECT 1 FROM entity WHERE company_code='AFG-000') THEN
    INSERT INTO entity(company_code,name,entity_class,client_type,location_code,functional_ccy) VALUES
     ('AFG-000','Affinity Group Limited','group','COMPANY','IOM','GBP'),
     ('AFG-IOM','Affinity (Isle of Man) Limited','group','COMPANY','IOM','GBP'),
     ('AFG-MLT','Affinity (Malta) Limited','group','COMPANY','MALTA','EUR'),
     ('AFG-CYM','Affinity (Cayman) Limited','group','COMPANY','CYM','USD'),
     ('AFG-SD','Affinity South Dakota, LLC','group','COMPANY','USA','USD'),
     ('AFG-FL','Affinity South Florida, LLC','group','COMPANY','USA','USD'),
     ('AFG-UK','Affinity (UK) Limited','group','COMPANY','UK','GBP');
  END IF;

  -- 2) profiles (one block per entity; linked by company_code)
  SELECT id INTO eid FROM entity WHERE company_code='AFG-000';
  INSERT INTO entity_profile(entity_id,reg_no,jurisdiction,entity_type,incorporation_date,business_activity,admin_status,regulator,registered_office)
    VALUES (eid,'016232V','Isle of Man','Company','2018-06-28','Group holding / parent company','Active','Not regulated (parent company)','Second Floor, 14 Athol Street, Douglas, Isle of Man')
    ON CONFLICT (entity_id) DO UPDATE SET reg_no=EXCLUDED.reg_no, regulator=EXCLUDED.regulator, registered_office=EXCLUDED.registered_office, business_activity=EXCLUDED.business_activity;

  SELECT id INTO eid FROM entity WHERE company_code='AFG-IOM';
  INSERT INTO entity_profile(entity_id,reg_no,jurisdiction,entity_type,incorporation_date,business_activity,admin_status,regulator,mlro,registered_office)
    VALUES (eid,'110310C','Isle of Man','Company','2004-03-01','Corporate & Trust Service Provider (CSP)','Active','Isle of Man Financial Services Authority (IOMFSA)','Colette Grisdale','Second Floor, 14 Athol Street, Douglas, Isle of Man')
    ON CONFLICT (entity_id) DO UPDATE SET reg_no=EXCLUDED.reg_no, regulator=EXCLUDED.regulator, mlro=EXCLUDED.mlro, registered_office=EXCLUDED.registered_office, business_activity=EXCLUDED.business_activity;

  SELECT id INTO eid FROM entity WHERE company_code='AFG-MLT';
  INSERT INTO entity_profile(entity_id,reg_no,jurisdiction,entity_type,incorporation_date,business_activity,admin_status,regulator,mlro,registered_office)
    VALUES (eid,'C53435','Malta','Company','2011-07-21','Company Service Provider (CSP)','Active','Malta Financial Services Authority (MFSA)','Gilber Spiteri Spadaro','Level 2, Progetta House, Tower Street, Swatar, Birkirkara BKR 4012, Malta')
    ON CONFLICT (entity_id) DO UPDATE SET reg_no=EXCLUDED.reg_no, regulator=EXCLUDED.regulator, mlro=EXCLUDED.mlro, registered_office=EXCLUDED.registered_office, business_activity=EXCLUDED.business_activity;

  SELECT id INTO eid FROM entity WHERE company_code='AFG-CYM';
  INSERT INTO entity_profile(entity_id,reg_no,jurisdiction,entity_type,incorporation_date,business_activity,admin_status,regulator,mlro,registered_office)
    VALUES (eid,'WT-359621','Cayman Islands','Company','2020-01-20','Corporate services','Active','Cayman Islands Monetary Authority (CIMA)','Colette Grisdale','Buckingham Square, South Building, 2nd Floor, West Bay Road, Grand Cayman')
    ON CONFLICT (entity_id) DO UPDATE SET reg_no=EXCLUDED.reg_no, regulator=EXCLUDED.regulator, mlro=EXCLUDED.mlro, registered_office=EXCLUDED.registered_office, business_activity=EXCLUDED.business_activity;

  SELECT id INTO eid FROM entity WHERE company_code='AFG-SD';
  INSERT INTO entity_profile(entity_id,reg_no,jurisdiction,entity_type,business_activity,admin_status,registered_office)
    VALUES (eid,'DL287254','United States — South Dakota','Company','US corporate services','Active','101 S Reid Street, 307 Sioux Falls, SD 57103')
    ON CONFLICT (entity_id) DO UPDATE SET reg_no=EXCLUDED.reg_no, registered_office=EXCLUDED.registered_office, business_activity=EXCLUDED.business_activity, jurisdiction=EXCLUDED.jurisdiction;
  INSERT INTO entity_officer(entity_id,name,role) SELECT eid,'A D Morgan','Director' WHERE NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=eid);
  INSERT INTO entity_officer(entity_id,name,role) SELECT eid,'A Gardner','Director' WHERE NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=eid AND name='A Gardner');

  SELECT id INTO eid FROM entity WHERE company_code='AFG-FL';
  INSERT INTO entity_profile(entity_id,reg_no,jurisdiction,entity_type,business_activity,admin_status,registered_office)
    VALUES (eid,'L23000403684','United States — Florida','Company','US corporate services','Active','1550 Madruga Ave Suite 150, Coral Gables, Florida, FL 33146')
    ON CONFLICT (entity_id) DO UPDATE SET reg_no=EXCLUDED.reg_no, registered_office=EXCLUDED.registered_office, business_activity=EXCLUDED.business_activity, jurisdiction=EXCLUDED.jurisdiction;
  INSERT INTO entity_officer(entity_id,name,role) SELECT eid,'A D Morgan','Director' WHERE NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=eid);
  INSERT INTO entity_officer(entity_id,name,role) SELECT eid,'A Gardner','Director' WHERE NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=eid AND name='A Gardner');
  INSERT INTO entity_officer(entity_id,name,role) SELECT eid,'N Kelly','Director' WHERE NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=eid AND name='N Kelly');

  SELECT id INTO eid FROM entity WHERE company_code='AFG-UK';
  INSERT INTO entity_profile(entity_id,reg_no,jurisdiction,entity_type,business_activity,admin_status,registered_office)
    VALUES (eid,NULL,'United Kingdom','Company','UK corporate services','Active','12 Bond Street, Mayfair, London, W1S 4PW')
    ON CONFLICT (entity_id) DO UPDATE SET registered_office=EXCLUDED.registered_office, business_activity=EXCLUDED.business_activity, jurisdiction=EXCLUDED.jurisdiction;
  INSERT INTO entity_officer(entity_id,name,role) SELECT eid,'A Davies','Director' WHERE NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=eid);
END $$;

-- 3) portfolio list now includes group entities + returns entity_class so the UI can badge/filter
DROP FUNCTION IF EXISTS ea_entities_list();
CREATE FUNCTION ea_entities_list()
RETURNS TABLE(id bigint, ref text, name text, entity_type text, jurisdiction text,
              admin_status text, risk_rating text, incorporation_date date, entity_class text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.company_code, e.name, COALESCE(p.entity_type,'Company'), COALESCE(p.jurisdiction,'—'),
         COALESCE(p.admin_status,'Active'), COALESCE(p.risk_rating,'—'), p.incorporation_date, e.entity_class
  FROM entity e JOIN entity_profile p ON p.entity_id=e.id
  WHERE e.entity_class IN ('client','group')
  ORDER BY (e.entity_class='group') DESC, e.company_code;
$$;
GRANT EXECUTE ON FUNCTION ea_entities_list() TO authenticated;

-- 4) expose the new master-record fields on ea_profile (regulated/own entities)
DROP FUNCTION IF EXISTS ea_profile(bigint);
CREATE FUNCTION ea_profile(p_entity bigint)
RETURNS TABLE(code text, name text, reg_no text, jurisdiction text, entity_type text,
  incorporation_date date, year_end text, tax_status text, fatca_class text, crs_class text,
  giin text, business_activity text, admin_status text, risk_rating text, next_review_date date,
  incorporation_regime text, regulator text, licence_no text, mlro text, registered_office text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.company_code, e.name, p.reg_no, p.jurisdiction, p.entity_type, p.incorporation_date,
    p.year_end, p.tax_status, p.fatca_class, p.crs_class, p.giin, p.business_activity,
    COALESCE(p.admin_status,'Active'), p.risk_rating, p.next_review_date, p.incorporation_regime,
    p.regulator, p.licence_no, p.mlro, p.registered_office
  FROM entity e LEFT JOIN entity_profile p ON p.entity_id=e.id WHERE e.id=p_entity;
$$;
GRANT EXECUTE ON FUNCTION ea_profile(bigint) TO authenticated;
