-- =====================================================================
-- AFFINITY — CRM BACK OFFICE (prospect pipeline + interactions)
-- Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS crm_prospect (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name text, last_name text, company text, prospect_type text, jurisdiction text, office text,
  source text, stage text, bd text, annual_fee numeric, setup_fee numeric, admin_fee numeric,
  conversion_date date, risk text, website text, address text, notes text, services text[]
);
CREATE TABLE IF NOT EXISTS crm_interaction (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prospect_id bigint REFERENCES crm_prospect(id), i_date date, kind text, note text
);
CREATE OR REPLACE FUNCTION crm_prospects()
RETURNS TABLE(id bigint, first_name text, last_name text, company text, type text, jur text, office text,
  source text, stage text, bd text, annual_fee numeric, setup_fee numeric, admin_fee numeric,
  conversion_date text, risk text, website text, address text, notes text, services text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, first_name, last_name, company, prospect_type, jurisdiction, office, source, stage, bd,
    annual_fee, setup_fee, admin_fee, to_char(conversion_date,'DD/MM/YYYY'), risk, website, address, notes, services
  FROM crm_prospect ORDER BY id;
$$;
CREATE OR REPLACE FUNCTION crm_interactions(p_prospect bigint)
RETURNS TABLE(id bigint, date text, kind text, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, to_char(i_date,'DD/MM/YYYY'), kind, note FROM crm_interaction WHERE prospect_id=p_prospect ORDER BY i_date DESC;
$$;
GRANT EXECUTE ON FUNCTION crm_prospects(), crm_interactions(bigint) TO anon, authenticated;

DO $$
DECLARE d date := current_date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM crm_prospect) THEN
    INSERT INTO crm_prospect(first_name,last_name,company,prospect_type,jurisdiction,office,source,stage,bd,annual_fee,setup_fee,admin_fee,conversion_date,risk,website,address,notes,services) VALUES
     ('James','Harrington','Caledonian Futures Ltd','Company','Cayman Islands','Cayman Islands','Referral','Fees Paid','Garry Crossan',18000,2500,500,d+1,'Medium','calefutures.com','PO Box 1234, George Town, Cayman Islands','Ready to convert. LOE signed.','{Company administration,Registered office,Director services}'),
     ('William','Westbridge','Westbridge Holdings Trust','Trust','Isle of Man','Isle of Man','Existing client','KYC Arriving','Andy Morgan',24000,3000,600,d+15,'High','','14 Athol Street, Douglas, Isle of Man','EDD required before acceptance.','{Trust administration,Compliance support}'),
     ('Marco','Verano','Verano Maritime SA','Yachting','Malta','Malta','Trade show','Proposal Sent','Joanne Fenech',12000,1500,300,d+60,'Low','veranomaritime.com','Level 3, Quantum House, Malta','Met at Monaco Yacht Show.','{Yachting administration,VAT registration}'),
     ('David','Silver','Silverstone Capital Fund','Fund','Cayman Islands','Cayman Islands','Cold outreach','Initial Call','Garry Crossan',45000,5000,1000,d+150,'Medium','silverstonecap.com','Harbour Place, George Town','Awaiting business plan.','{Fund administration,FATCA/CRS}'),
     ('Sofia','Adriatic','Adriatic Holdings Ltd','Company','Malta','Malta','Referral','Initial Call','Joanne Fenech',9500,1200,250,d+90,'Low','','Valletta, Malta','Referred by Meridian Holdings.','{Company administration,Bookkeeping}'),
     ('Tom','Phoenix','Phoenix eGaming Ltd','B2C','Isle of Man','Gaming Gateway','Website','KYC Approved','Roxy Sheeley',32000,4000,800,d+30,'High','phoenixegaming.io','Douglas, Isle of Man','B2C licence application. Two-strand process.','{eGaming onboarding,GSC licence,Company admin}'),
     ('Chen','Riviera','Riviera Trust','Trust','Cayman Islands','Cayman Islands','Referral','Fees Paid','Garry Crossan',28000,3500,700,d-10,'Medium','','George Town, Cayman Islands','Converted. Onboarding in progress.','{Trust administration,Compliance,FATCA/CRS}');
    INSERT INTO crm_interaction(prospect_id,i_date,kind,note)
      SELECT id,d-5,'Call','Initial discovery call completed.' FROM crm_prospect WHERE company='Caledonian Futures Ltd';
    INSERT INTO crm_interaction(prospect_id,i_date,kind,note)
      SELECT id,d-2,'Email','Proposal and fee schedule sent.' FROM crm_prospect WHERE company='Verano Maritime SA';
  END IF;
END $$;
