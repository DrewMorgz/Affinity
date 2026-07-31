-- =====================================================================
-- AFFINITY — eGAMING / OGRA BACK OFFICE
-- Gaming licence register + compliance log. Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS egaming_licence (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint REFERENCES entity(id), entity_label text,
  lic_type text, subtype text, ref text, status text,
  issued date, expiry date, admin text, risk text, notes text
);
CREATE TABLE IF NOT EXISTS egaming_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint REFERENCES entity(id), entity_label text,
  log_date date, log_type text, status text, detail text
);

CREATE OR REPLACE FUNCTION eg_licences()
RETURNS TABLE(id bigint, entity text, type text, subtype text, ref text, status text,
              issued text, expiry text, admin text, risk text, notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.id, COALESCE(e.name, l.entity_label), l.lic_type, l.subtype, l.ref, l.status,
    to_char(l.issued,'DD/MM/YYYY'), to_char(l.expiry,'DD/MM/YYYY'), l.admin, l.risk, l.notes
  FROM egaming_licence l LEFT JOIN entity e ON e.id=l.entity_id ORDER BY l.id;
$$;
CREATE OR REPLACE FUNCTION eg_log()
RETURNS TABLE(id bigint, entity text, date text, type text, status text, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT g.id, COALESCE(e.name, g.entity_label), to_char(g.log_date,'DD/MM/YYYY'), g.log_type, g.status, g.detail
  FROM egaming_log g LEFT JOIN entity e ON e.id=g.entity_id ORDER BY g.log_date DESC;
$$;
GRANT EXECUTE ON FUNCTION eg_licences(), eg_log() TO anon, authenticated;

DO $$
DECLARE d date := current_date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM egaming_licence) THEN
    INSERT INTO egaming_licence(entity_id,entity_label,lic_type,subtype,ref,status,issued,expiry,admin,risk,notes) VALUES
     ((SELECT id FROM entity WHERE company_code='AC-2025-061'),'Phoenix eGaming Ltd','B2C','Casino','GSC-2025-0441','Application — stage 2',NULL,NULL,'Roxy Sheeley','High','IIF submitted. Awaiting OGRA suitability decision.'),
     ((SELECT id FROM entity WHERE company_code='AC-2023-058'),'Meridian Digital Ltd','B2B','Platform supply','GSC-2023-0218','Live',d-760,d+300,'Roxy Sheeley','Medium','Annual OGRA return due in the autumn.'),
     (NULL,'Neptune Interactive Ltd','B2C','Sports betting','GSC-2022-0104','Live',d-1200,d-140,'Roxy Sheeley','High','⚠️ Renewal overdue — contact OGRA immediately.'),
     (NULL,'Apex Gaming Solutions Ltd','B2B','Software supply','GSC-2024-0312','Under review',NULL,NULL,'Roxy Sheeley','Medium','Business plan queries raised by OGRA. Response drafted.');
    INSERT INTO egaming_log(entity_id,entity_label,log_date,log_type,status,detail) VALUES
     ((SELECT id FROM entity WHERE company_code='AC-2023-058'),'Meridian Digital Ltd',d-20,'Player complaint','Closed','Complaint resolved within 48 hours per licence condition 7.3.'),
     (NULL,'Neptune Interactive Ltd',d-56,'Licence breach','Open','⚠️ Licence lapsed — no renewal filed. OGRA notified. Urgent.'),
     (NULL,'Apex Gaming Solutions',d-72,'OGRA query response','In progress','Business plan queries under consideration.'),
     ((SELECT id FROM entity WHERE company_code='AC-2023-058'),'Meridian Digital Ltd',d-120,'AML/KYC review','Closed','Annual AML review completed. No issues raised.');
  END IF;
END $$;
