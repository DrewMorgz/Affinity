-- =====================================================================
-- AFFINITY — ONBOARDING BACK OFFICE (case pipeline + attrition)
-- Status/overdue computed from target date. Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS onboarding_case (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL, ob_type text, jur text, admin text, stage text, pct int,
  started date, target date, risk text, docs_received text[], docs_outstanding text[]
);
CREATE TABLE IF NOT EXISTS attrition_case (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL, at_type text, admin text, stage text, started date, status text,
  appr_manager text, appr_director text, appr_md text, appr_cfo text
);
CREATE OR REPLACE FUNCTION onboarding_cases()
RETURNS TABLE(id bigint, name text, type text, jur text, admin text, stage text, pct int,
  started text, target text, status text, risk text, overdue boolean, docs_received text[], docs_outstanding text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, name, ob_type, jur, admin, stage, pct, to_char(started,'DD/MM/YYYY'), to_char(target,'DD/MM/YYYY'),
    CASE WHEN pct>=100 THEN 'Complete' WHEN target < current_date THEN 'Overdue' ELSE 'In progress' END,
    risk, (target < current_date AND pct < 100), COALESCE(docs_received,'{}'), COALESCE(docs_outstanding,'{}')
  FROM onboarding_case ORDER BY pct DESC;
$$;
CREATE OR REPLACE FUNCTION attrition_cases()
RETURNS TABLE(id bigint, name text, type text, admin text, stage text, started text, status text,
  appr_manager text, appr_director text, appr_md text, appr_cfo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, name, at_type, admin, stage, to_char(started,'DD/MM/YYYY'), status,
    appr_manager, appr_director, appr_md, appr_cfo FROM attrition_case ORDER BY started DESC;
$$;
GRANT EXECUTE ON FUNCTION onboarding_cases(), attrition_cases() TO anon, authenticated;

DO $$
DECLARE d date := current_date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM onboarding_case) THEN
    INSERT INTO onboarding_case(name,ob_type,jur,admin,stage,pct,started,target,risk,docs_received,docs_outstanding) VALUES
     ('Pinnacle Trading Ltd','Company','Isle of Man','Roxy Sheeley','KYC collection',35,d-30,d+15,'Medium','{}','{"KYC pack outstanding"}'),
     ('Solaris Family Trust','Trust','Cayman Islands','Garry Crossan','Compliance review',65,d-51,d-1,'High','{"KYC complete"}','{"EDD sign-off"}'),
     ('Verona Digital Holdings Ltd','Company','Malta','Joanne Fenech','LOE & fee setup',80,d-77,d+5,'Medium','{"All KYC complete"}','{"Signed LOE"}'),
     ('Beaumont Wealth Structures','Foundation','Cayman Islands','Garry Crossan','Entity setup',90,d-90,d+7,'Low','{"All KYC and LOE complete"}','{}'),
     ('Osprey Aviation Partners Ltd','Company','Cayman Islands','Andy Morgan','New business',10,d-21,d+40,'Medium','{}','{"All KYC pending — portal not yet sent"}');
    INSERT INTO attrition_case(name,at_type,admin,stage,started,status,appr_manager,appr_director,appr_md,appr_cfo) VALUES
     ('North Star Holdings Ltd','Liquidation','Roxy Sheeley','CFO sign-off',d-190,'Pending','✓','✓','✓','Pending'),
     ('Thornbury Asset Co Ltd','Transfer out','Neil Kelly','Director approval',d-55,'Pending','✓','Pending','Not started','Not started');
  END IF;
END $$;
