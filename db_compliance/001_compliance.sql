-- =====================================================================
-- AFFINITY — COMPLIANCE & RISK BACK OFFICE
-- Periodic CDD reviews, regulatory reporting obligations, breach log,
-- staff training. Review/training status computed live from dates.
-- Run once in the SQL editor. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS compliance_review (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  reviewer text, last_review date, next_review date, edd_required boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS reg_obligation (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  obligation_type text NOT NULL, regulator text, freq text, due_date date, filed_date date, status text
);
CREATE TABLE IF NOT EXISTS breach_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  breach_date date, breach_type text, entity_id bigint REFERENCES entity(id), entity_label text,
  severity text, reported boolean DEFAULT false, action text, status text DEFAULT 'Open'
);
CREATE TABLE IF NOT EXISTS staff_training (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_name text NOT NULL, role text, aml_date date, csp_date date, refresh_due date
);

CREATE OR REPLACE FUNCTION comp_reviews()
RETURNS TABLE(id bigint, name text, ref text, type text, risk text, reviewer text, next_review text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id, e.name, e.company_code, COALESCE(p.entity_type,'Company'), COALESCE(p.risk_rating,'—'),
    r.reviewer, to_char(r.next_review,'DD/MM/YYYY'),
    CASE WHEN r.next_review < current_date THEN 'Overdue'
         WHEN r.next_review < current_date + 30 THEN 'Due this month' ELSE 'Upcoming' END
  FROM compliance_review r JOIN entity e ON e.id=r.entity_id
  LEFT JOIN entity_profile p ON p.entity_id=e.id ORDER BY r.next_review;
$$;
CREATE OR REPLACE FUNCTION comp_reg_obligations()
RETURNS TABLE(id bigint, type text, regulator text, due text, filed text, status text, freq text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, obligation_type, regulator,
    COALESCE(to_char(due_date,'DD/MM/YYYY'),'Ongoing'),
    COALESCE(to_char(filed_date,'DD/MM/YYYY'), CASE WHEN status='Ongoing' THEN 'N/A' ELSE 'Current' END),
    status, freq
  FROM reg_obligation ORDER BY due_date NULLS LAST;
$$;
CREATE OR REPLACE FUNCTION comp_breaches()
RETURNS TABLE(id bigint, date text, type text, entity text, severity text, reported boolean, action text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, to_char(b.breach_date,'DD/MM/YYYY'), b.breach_type,
    COALESCE(e.name, b.entity_label, 'N/A'), b.severity, b.reported, b.action, b.status
  FROM breach_log b LEFT JOIN entity e ON e.id=b.entity_id ORDER BY b.breach_date DESC;
$$;
CREATE OR REPLACE FUNCTION comp_training()
RETURNS TABLE(name text, role text, aml text, csp text, refresh_due text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT staff_name, role, to_char(aml_date,'DD/MM/YYYY'), COALESCE(to_char(csp_date,'DD/MM/YYYY'),'N/A'),
    to_char(refresh_due,'DD/MM/YYYY'),
    CASE WHEN refresh_due < current_date THEN 'Overdue' ELSE 'Current' END
  FROM staff_training ORDER BY refresh_due;
$$;
GRANT EXECUTE ON FUNCTION comp_reviews(), comp_reg_obligations(), comp_breaches(), comp_training() TO anon, authenticated;

-- seed (dates relative to today)
DO $$
DECLARE d date := current_date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM compliance_review) THEN
    INSERT INTO compliance_review(entity_id,reviewer,last_review,next_review,edd_required) VALUES
     ((SELECT id FROM entity WHERE company_code='AC-2024-001'),'Roxy Sheeley',d-350,d+15,false),
     ((SELECT id FROM entity WHERE company_code='AC-2019-014'),'Gary Harrison',d-400,d-35,true),
     ((SELECT id FROM entity WHERE company_code='AC-2016-003'),'Gary Harrison',d-380,d-20,true),
     ((SELECT id FROM entity WHERE company_code='AC-2021-027'),'Roxy Sheeley',d-100,d+260,false),
     ((SELECT id FROM entity WHERE company_code='AC-2017-055'),'Neil Kelly',d-90,d+250,false),
     ((SELECT id FROM entity WHERE company_code='AC-2022-019'),'Garry Crossan',d-370,d-10,true);
    INSERT INTO reg_obligation(obligation_type,regulator,freq,due_date,filed_date,status) VALUES
     ('Annual compliance return','IOMFSA','Annual',d+120,d-245,'Filed'),
     ('Suspicious activity reports','FIU Isle of Man','As required',NULL,NULL,'Ongoing'),
     ('DNFBP registration renewal','IOMFSA','Annual',d+180,d-185,'Filed'),
     ('Beneficial ownership register submission','IOM Companies Registry','On change',NULL,NULL,'Current'),
     ('CSP licence renewal','IOMFSA','Annual',d+90,d-275,'Filed'),
     ('AML/CFT risk assessment','Internal','Annual',d+30,d-335,'Due Q4');
    INSERT INTO breach_log(breach_date,breach_type,entity_id,severity,reported,action,status) VALUES
     (d-40,'Late KYC renewal',(SELECT id FROM entity WHERE company_code='AC-2019-014'),'Minor',false,'KYC renewal requested. Monitoring.','Open'),
     (d-70,'Delayed periodic review',(SELECT id FROM entity WHERE company_code='AC-2022-019'),'Minor',false,'Review now in progress. EDD outstanding.','Open');
    INSERT INTO breach_log(breach_date,breach_type,entity_label,severity,reported,action,status) VALUES
     (d-120,'Missing SAR report','N/A — internal','Moderate',true,'SAR filed with FIU. Process reviewed.','Closed');
    INSERT INTO staff_training(staff_name,role,aml_date,csp_date,refresh_due) VALUES
     ('Roxy Sheeley','MD — IOM',d-190,d-170,d+175),
     ('Gary Harrison','CCO',d-185,d-170,d+180),
     ('Sarah Cole','Administrator',d-170,d-170,d+195),
     ('Neil Kelly','CFO',d-190,NULL,d+175),
     ('Andy Morgan','CEO',d-190,d-170,d+175);
  END IF;
END $$;
