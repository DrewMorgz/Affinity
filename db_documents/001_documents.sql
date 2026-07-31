-- =====================================================================
-- AFFINITY — DOCUMENTS / DMS BACK OFFICE (document metadata store)
-- 17-category folder structure. 'Expired' computed from expiry date.
-- Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS document (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_label text, folder text, subfolder text, name text NOT NULL,
  status text, doc_date date, expiry_date date, uploaded_by text, size text
);
DROP FUNCTION IF EXISTS document_list();
CREATE FUNCTION document_list()
RETURNS TABLE(id bigint, entity text, folder text, subfolder text, name text, status text,
  date text, expiry text, by text, size text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, entity_label, folder, subfolder, name,
    CASE WHEN expiry_date IS NOT NULL AND expiry_date < current_date THEN 'Expired' ELSE status END,
    to_char(doc_date,'DD/MM/YYYY'), to_char(expiry_date,'DD/MM/YYYY'), uploaded_by, size
  FROM document ORDER BY id;
$$;
GRANT EXECUTE ON FUNCTION document_list() TO anon, authenticated;

DO $$
DECLARE d date := current_date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM document) THEN
    INSERT INTO document(entity_label,folder,subfolder,name,status,doc_date,expiry_date,uploaded_by,size) VALUES
     ('Harrington Family Trust','KYC','CDD','Emma Harrington — Passport','Current',d-2200,d-800,'Roxy Sheeley','1.2MB'),
     ('Harrington Family Trust','Statutory','Memorandum & Articles of Association','Trust deed','Executed',d-2200,NULL,'Roxy Sheeley','3.4MB'),
     ('Apex Growth Fund Ltd','KYC','CDD','Worldcheck result — Apex Growth Fund','Current',d-20,d+340,'Gary Harrison','0.8MB'),
     ('Stonebridge Capital Ltd','Statutory','Minutes of Meetings','Board resolution — director appt','Under review',d-30,NULL,'Joanne Fenech','0.5MB'),
     ('Meridian Holdings Ltd','Accounts','Management Accounts','Q1 2025 management accounts','Executed',d-110,NULL,'Neil Kelly','2.1MB'),
     ('Pacific Wealth Trust','KYC','CDD','EDD pack — Wei Chen','Draft',d-20,NULL,'Garry Crossan','4.2MB'),
     ('North Star Holdings Ltd','Correspondence','Correspondence','Client attrition letter','Under review',d-190,NULL,'Roxy Sheeley','0.3MB'),
     ('Caledonian Ventures Ltd','Permanent','Agreements','Asset sale agreement','Executed',d-460,NULL,'Garry Crossan','1.8MB'),
     ('Meridian Holdings Ltd','Bank','Statements','Barclays statement — June','Current',d-30,NULL,'Neil Kelly','0.6MB'),
     ('Harrington Family Trust','KYC','Source of Wealth','SOW declaration — James Harrington','Current',d-140,d+500,'Roxy Sheeley','0.9MB'),
     ('Rosewood Legacy Trust','Statutory','Certificate of Incorporation/Name Change','Certificate of incorporation','Executed',d-1550,NULL,'Roxy Sheeley','0.4MB'),
     ('Azure Mediterranean Fdn','Accounts','Financial Statements','FY2024 audited accounts','Executed',d-30,NULL,'Joanne Fenech','5.1MB');
  END IF;
END $$;
