-- =====================================================================
-- AFFINITY — STATUTORY FILINGS BACK OFFICE
-- Firm-wide filing tracker: annual returns, BO registers, certs of good
-- standing, officer changes, dissolutions. Status computed live from dates.
-- Run once in the SQL editor. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS stat_annual_return (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  return_type text, reg_no text, due_date date, last_filed date, admin text, fee text
);
CREATE TABLE IF NOT EXISTS stat_bo_register (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  bo_required boolean DEFAULT true, submitted date, system text, next_review date
);
CREATE TABLE IF NOT EXISTS stat_cogs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  requested date, issued date, requested_by text, purpose text
);
CREATE TABLE IF NOT EXISTS stat_officer_change (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  change_type text, person_name text, change_date date, form text, filed text, due_date date, admin text
);
CREATE TABLE IF NOT EXISTS stat_dissolution (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  dissolution_type text, started date, stage text, admin text, target_close date
);

CREATE OR REPLACE FUNCTION stat_annual_returns()
RETURNS TABLE(id bigint, entity text, jur text, type text, reg_no text, due text, last_filed text, admin text, status text, fee text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id, e.name, COALESCE(p.jurisdiction,'—'), r.return_type, r.reg_no,
    to_char(r.due_date,'DD/MM/YYYY'), to_char(r.last_filed,'DD/MM/YYYY'), r.admin,
    CASE WHEN r.due_date < current_date THEN 'Overdue'
         WHEN r.due_date < current_date + 60 THEN 'Due soon' ELSE 'Upcoming' END, r.fee
  FROM stat_annual_return r JOIN entity e ON e.id=r.entity_id
  LEFT JOIN entity_profile p ON p.entity_id=e.id ORDER BY r.due_date;
$$;
CREATE OR REPLACE FUNCTION stat_bo_registers()
RETURNS TABLE(id bigint, entity text, jur text, bo_required boolean, submitted text, status text, system text, next_review text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, e.name, COALESCE(p.jurisdiction,'—'), b.bo_required, to_char(b.submitted,'DD/MM/YYYY'),
    CASE WHEN b.next_review < current_date THEN 'Overdue'
         WHEN b.next_review < current_date + 60 THEN 'Due soon' ELSE 'Current' END,
    b.system, to_char(b.next_review,'DD/MM/YYYY')
  FROM stat_bo_register b JOIN entity e ON e.id=b.entity_id
  LEFT JOIN entity_profile p ON p.entity_id=e.id ORDER BY b.next_review;
$$;
CREATE OR REPLACE FUNCTION stat_cogs_list()
RETURNS TABLE(id bigint, entity text, requested text, issued text, requested_by text, status text, purpose text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, e.name, to_char(c.requested,'DD/MM/YYYY'), to_char(c.issued,'DD/MM/YYYY'),
    c.requested_by, CASE WHEN c.issued IS NOT NULL THEN 'Issued' ELSE 'Pending' END, c.purpose
  FROM stat_cogs c JOIN entity e ON e.id=c.entity_id ORDER BY c.requested DESC;
$$;
CREATE OR REPLACE FUNCTION stat_officer_changes()
RETURNS TABLE(id bigint, entity text, change text, name text, date text, form text, filed text, due_date text, admin text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.id, e.name, o.change_type, o.person_name, to_char(o.change_date,'DD/MM/YYYY'),
    o.form, o.filed, to_char(o.due_date,'DD/MM/YYYY'), o.admin
  FROM stat_officer_change o JOIN entity e ON e.id=o.entity_id ORDER BY o.due_date;
$$;
CREATE OR REPLACE FUNCTION stat_dissolutions()
RETURNS TABLE(id bigint, entity text, type text, started text, admin text, stage text, target_close text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id, e.name, d.dissolution_type, to_char(d.started,'DD/MM/YYYY'), d.admin, d.stage, to_char(d.target_close,'DD/MM/YYYY')
  FROM stat_dissolution d JOIN entity e ON e.id=d.entity_id ORDER BY d.started DESC;
$$;

GRANT EXECUTE ON FUNCTION stat_annual_returns(), stat_bo_registers(), stat_cogs_list(),
  stat_officer_changes(), stat_dissolutions() TO anon, authenticated;

-- seed from the real portfolio (dates relative to today for a realistic spread)
DO $$
DECLARE d date := current_date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM stat_annual_return) THEN
    INSERT INTO stat_annual_return(entity_id,return_type,reg_no,due_date,last_filed,admin,fee) VALUES
     ((SELECT id FROM entity WHERE company_code='AC-2023-041'),'Private Ltd','MLT-C-88221',d-30,d-395,'Joanne Fenech','€85'),
     ((SELECT id FROM entity WHERE company_code='AC-2019-014'),'Trust','T-4421',d-12,d-377,'Roxy Sheeley','—'),
     ((SELECT id FROM entity WHERE company_code='AC-2020-008'),'Foundation','MLT-F-2201',d+18,d-347,'Joanne Fenech','€85'),
     ((SELECT id FROM entity WHERE company_code='AC-2023-052'),'Exempted Company','CY-99102',d+40,d-325,'Garry Crossan','$1,200'),
     ((SELECT id FROM entity WHERE company_code='AC-2024-001'),'Companies Act 1931','117843C',d+200,d-165,'Roxy Sheeley','£20'),
     ((SELECT id FROM entity WHERE company_code='AC-2021-032'),'Exempted Company','CY-88341',d+150,d-215,'Garry Crossan','$900'),
     ((SELECT id FROM entity WHERE company_code='AC-2021-027'),'Trust','T-6603',d+250,d-115,'Roxy Sheeley','—'),
     ((SELECT id FROM entity WHERE company_code='AC-2022-019'),'STAR Trust','T-CY-5521',d+150,d-215,'Garry Crossan','—'),
     ((SELECT id FROM entity WHERE company_code='AC-2016-003'),'Companies Act 1931','104322C',d-60,d-425,'Roxy Sheeley','£20'),
     ((SELECT id FROM entity WHERE company_code='AC-2020-031'),'Ordinary Trust','T-CY-9921',d+160,d-205,'Garry Crossan','—');
    INSERT INTO stat_bo_register(entity_id,submitted,system,next_review) VALUES
     ((SELECT id FROM entity WHERE company_code='AC-2024-001'),d-200,'BORS (ITD)',d+165),
     ((SELECT id FROM entity WHERE company_code='AC-2021-032'),d-190,'CIMA portal',d+175),
     ((SELECT id FROM entity WHERE company_code='AC-2020-008'),d-345,'MFSA BROS',d+20),
     ((SELECT id FROM entity WHERE company_code='AC-2023-052'),d-355,'CIMA portal',d+10),
     ((SELECT id FROM entity WHERE company_code='AC-2023-041'),d-400,'MFSA BROS',d-35),
     ((SELECT id FROM entity WHERE company_code='AC-2016-003'),d-280,'BORS (ITD)',d+85);
    INSERT INTO stat_cogs(entity_id,requested,issued,requested_by,purpose) VALUES
     ((SELECT id FROM entity WHERE company_code='AC-2024-001'),d-28,d-26,'Rory James (auditor)','Audit'),
     ((SELECT id FROM entity WHERE company_code='AC-2021-032'),d-44,d-41,'First Caribbean Bank','Bank account opening'),
     ((SELECT id FROM entity WHERE company_code='AC-2023-052'),d-19,NULL,'Butterfield Bank','Loan facility');
    INSERT INTO stat_officer_change(entity_id,change_type,person_name,change_date,form,filed,due_date,admin) VALUES
     ((SELECT id FROM entity WHERE company_code='AC-2023-041'),'Director appointment','Maria Borg',d-8,'Form 6 (Malta)','Not yet',d+21,'Joanne Fenech'),
     ((SELECT id FROM entity WHERE company_code='AC-2024-001'),'Director resignation','Emma Harrington',d-25,'Form 6C (IOM)','Filed',d+5,'Roxy Sheeley'),
     ((SELECT id FROM entity WHERE company_code='AC-2022-019'),'Trustee change','Affinity Trust Ltd',d-55,'Trust deed amdt','Filed',d-25,'Garry Crossan');
    INSERT INTO stat_dissolution(entity_id,dissolution_type,started,stage,admin,target_close) VALUES
     ((SELECT id FROM entity WHERE company_code='AC-2016-003'),'Liquidation',d-190,'Creditor notice period','Roxy Sheeley',d+40),
     ((SELECT id FROM entity WHERE company_code='AC-2017-055'),'Transfer out',d-55,'Director resolution signed','Neil Kelly',d+30);
  END IF;
END $$;
