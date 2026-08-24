-- =====================================================================
-- AFFINITY CORE — RESTORE APPLICATION DATA
--
-- Puts back what the schema reset removed: entity admin, the client
-- portfolio, Affinity's seven group companies, tasks, notifications, the
-- entity chart, CPD log, compliance registers and saved reports.
--
-- 15 files, in DEPENDENCY order rather than filename order: 003_seed_clients
-- creates the entities that 002_seed's registers hang off, so it runs first.
-- Running these alphabetically fails with a not-null violation on entity_id.
--
-- These tables do not overlap the accounting engine's 91 tables, so this
-- layers on top of it safely.
--
-- SECURITY CHANGE: all 20 EXECUTE grants across these files previously went to
-- `anon` — the key embedded in the public JavaScript bundle. They now go to
-- `authenticated` only. Until Entra sign-in exists the app has no session, so
-- these modules will show demo data rather than database data. That is
-- deliberate: demo figures beat client records being readable by anyone.
--
-- Run AFTER the engine, 052 and 053.
-- =====================================================================

-- ───────────────────────────────────────────────
-- db_eadmin/001_schema.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — ENTITY ADMINISTRATION BACK OFFICE (schema)
-- Companion tables to the accounting engine's `entity` table: the CSP
-- system of record — profile, officers, shareholders, UBOs, charges,
-- addresses, meetings, file notes, services. Run once in the SQL editor.
-- Safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS entity_profile (
  entity_id         bigint PRIMARY KEY REFERENCES entity(id),
  reg_no            text,
  jurisdiction      text,
  entity_type       text,              -- Company / Trust / Foundation / Partnership
  incorporation_date date,
  year_end          text,
  tax_status        text,
  fatca_class       text,
  crs_class         text,
  giin              text,
  business_activity text,
  admin_status      text DEFAULT 'Active',   -- Active / Dormant / In liquidation / Struck off
  risk_rating       text,                    -- Low / Medium / High
  next_review_date  date,
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_officer (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  name text NOT NULL,
  role text NOT NULL,        -- Director / Secretary / Trustee / Council member / Enforcer / Protector
  appointed date, resigned date, nationality text, dob date, address text
);

CREATE TABLE IF NOT EXISTS entity_shareholder (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  name text NOT NULL, share_class text DEFAULT 'Ordinary',
  shares numeric, pct numeric, held_from date
);

CREATE TABLE IF NOT EXISTS entity_charge (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  chargee text NOT NULL, charge_type text, amount numeric, ccy char(3),
  registered_date date, satisfied_date date
);

CREATE TABLE IF NOT EXISTS entity_ubo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  name text NOT NULL, role text, dob date, nationality text,
  ownership_pct numeric, nature_of_control text
);

CREATE TABLE IF NOT EXISTS entity_address (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  address_type text NOT NULL, address text NOT NULL, from_date date, to_date date
);

CREATE TABLE IF NOT EXISTS entity_meeting (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  meeting_type text, meeting_date date, notes text
);

CREATE TABLE IF NOT EXISTS entity_file_note (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  note_date date DEFAULT current_date, author text, note text
);

CREATE TABLE IF NOT EXISTS entity_service (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id), service text NOT NULL
);

-- ---------- read functions (SECURITY DEFINER for anon key) ----------
CREATE OR REPLACE FUNCTION ea_profile(p_entity bigint)
RETURNS TABLE(code text, name text, reg_no text, jurisdiction text, entity_type text,
  incorporation_date date, year_end text, tax_status text, fatca_class text, crs_class text,
  giin text, business_activity text, admin_status text, risk_rating text, next_review_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.company_code, e.name, p.reg_no, p.jurisdiction, p.entity_type, p.incorporation_date,
    p.year_end, p.tax_status, p.fatca_class, p.crs_class, p.giin, p.business_activity,
    COALESCE(p.admin_status,'Active'), p.risk_rating, p.next_review_date
  FROM entity e LEFT JOIN entity_profile p ON p.entity_id=e.id WHERE e.id=p_entity;
$$;

CREATE OR REPLACE FUNCTION ea_officers(p_entity bigint)
RETURNS SETOF entity_officer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_officer WHERE entity_id=p_entity ORDER BY resigned NULLS FIRST, appointed; $$;

CREATE OR REPLACE FUNCTION ea_shareholders(p_entity bigint)
RETURNS SETOF entity_shareholder LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_shareholder WHERE entity_id=p_entity ORDER BY pct DESC NULLS LAST; $$;

CREATE OR REPLACE FUNCTION ea_charges(p_entity bigint)
RETURNS SETOF entity_charge LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_charge WHERE entity_id=p_entity ORDER BY registered_date DESC; $$;

CREATE OR REPLACE FUNCTION ea_ubos(p_entity bigint)
RETURNS SETOF entity_ubo LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_ubo WHERE entity_id=p_entity ORDER BY ownership_pct DESC NULLS LAST; $$;

CREATE OR REPLACE FUNCTION ea_addresses(p_entity bigint)
RETURNS SETOF entity_address LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_address WHERE entity_id=p_entity ORDER BY to_date NULLS FIRST; $$;

CREATE OR REPLACE FUNCTION ea_meetings(p_entity bigint)
RETURNS SETOF entity_meeting LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_meeting WHERE entity_id=p_entity ORDER BY meeting_date DESC; $$;

CREATE OR REPLACE FUNCTION ea_file_notes(p_entity bigint)
RETURNS SETOF entity_file_note LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_file_note WHERE entity_id=p_entity ORDER BY note_date DESC; $$;

CREATE OR REPLACE FUNCTION ea_services(p_entity bigint)
RETURNS SETOF entity_service LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_service WHERE entity_id=p_entity; $$;

GRANT EXECUTE ON FUNCTION ea_profile(bigint), ea_officers(bigint), ea_shareholders(bigint),
  ea_charges(bigint), ea_ubos(bigint), ea_addresses(bigint), ea_meetings(bigint),
  ea_file_notes(bigint), ea_services(bigint) TO authenticated;

-- ───────────────────────────────────────────────
-- db_eadmin/003_seed_clients.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — ENTITY ADMIN: FULL CLIENT PORTFOLIO SEED (demo; deletable)
-- Migrates the 14 administered client entities + their registers into the
-- database so Entity Admin reads live. Idempotent. Run once.
-- =====================================================================
-- 1) client entities (company_code = client ref)
INSERT INTO entity(company_code,name,entity_class,client_type,location_code,functional_ccy) VALUES
 ('AC-2024-001','Meridian Holdings Ltd','client','COMPANY','IOM','GBP'),
 ('AC-2019-014','Harrington Family Trust','client','COMPANY','IOM','GBP'),
 ('AC-2021-032','Caledonian Ventures Ltd','client','COMPANY','CYM','USD'),
 ('AC-2020-008','Azure Mediterranean Foundation','client','COMPANY','MALTA','EUR'),
 ('AC-2017-055','Thornbury Asset Co Ltd','client','COMPANY','UK','GBP'),
 ('AC-2022-019','Pacific Wealth Trust','client','COMPANY','CYM','USD'),
 ('AC-2023-041','Stonebridge Capital Ltd','client','COMPANY','MALTA','EUR'),
 ('AC-2016-003','North Star Holdings Ltd','client','COMPANY','IOM','GBP'),
 ('AC-2021-027','Rosewood Legacy Trust','client','COMPANY','IOM','GBP'),
 ('AC-2023-052','Apex Growth Fund Ltd','client','COMPANY','CYM','USD'),
 ('AC-2024-007','Suncoast Ventures LLC','client','COMPANY','USA','USD'),
 ('AC-2020-031','Bluewater Family Trust','client','COMPANY','CYM','USD'),
 ('AC-2025-061','Phoenix eGaming Ltd','client','COMPANY','IOM','GBP'),
 ('AC-2023-058','Meridian Digital Ltd','client','COMPANY','IOM','GBP')
ON CONFLICT (company_code) DO NOTHING;

-- 2) profiles + registers
DO $$
DECLARE r record;
  prof jsonb := '{
   "AC-2024-001":["117843C","Isle of Man","Company","2018-03-12","31/03","IOM tax resident","Holding company","Active","Medium"],
   "AC-2019-014":["T-4421","Isle of Man","Trust","2019-07-05","05/04","Trust","Family trust","Active","High"],
   "AC-2021-032":["CY-88341","Cayman Islands","Company","2021-01-22","31/12","Tax exempt","Investment holding","Active","Medium"],
   "AC-2020-008":["MLT-F-2201","Malta","Foundation","2020-09-14","31/12","Malta tax resident","Philanthropy","Active","Low"],
   "AC-2017-055":["14421876","United Kingdom","Company","2017-06-03","31/12","UK tax resident","Asset holding","Dormant","Medium"],
   "AC-2022-019":["T-CY-5521","Cayman Islands","Trust","2022-11-18","31/12","Tax exempt","Wealth trust","Active","High"],
   "AC-2023-041":["MLT-C-88221","Malta","Company","2023-02-07","31/12","Malta tax resident","Capital management","Active","Low"],
   "AC-2016-003":["104322C","Isle of Man","Company","2016-10-30","31/12","IOM tax resident","Holding company","In liquidation","High"],
   "AC-2021-027":["T-6603","Isle of Man","Trust","2021-04-25","05/04","Trust","Family trust","Active","Medium"],
   "AC-2023-052":["CY-99102","Cayman Islands","Company","2023-08-12","31/12","Tax exempt","Fund management","Active","Very High"],
   "AC-2024-007":["FL-2024-881","Miami","Company","2024-03-01","31/12","US tax resident","Ventures","Active","Low"],
   "AC-2020-031":["T-CY-9921","Cayman Islands","Trust","2020-06-19","31/12","Tax exempt","Family trust","Active","Medium"],
   "AC-2025-061":["GSC-2025-0441","Isle of Man","Company","2025-03-01","31/12","IOM tax resident","eGaming operator","Active","High"],
   "AC-2023-058":["GSC-2023-0218","Isle of Man","Company","2023-06-01","31/12","IOM tax resident","B2B platform supply","Active","Medium"]
  }'::jsonb;
  k text; v jsonb; eid bigint;
BEGIN
  FOR k, v IN SELECT * FROM jsonb_each(prof) LOOP
    SELECT id INTO eid FROM entity WHERE company_code=k;
    INSERT INTO entity_profile(entity_id,reg_no,jurisdiction,entity_type,incorporation_date,year_end,tax_status,business_activity,admin_status,risk_rating)
    VALUES (eid, v->>0, v->>1, v->>2, (v->>3)::date, v->>4, v->>5, v->>6, v->>7, v->>8)
    ON CONFLICT (entity_id) DO NOTHING;
  END LOOP;

  -- officers / shareholders / charges / ubos / addresses for the detailed entities
  SELECT id INTO eid FROM entity WHERE company_code='AC-2024-001';
  IF NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=eid) THEN
    INSERT INTO entity_officer(entity_id,name,role,appointed,nationality,dob,address) VALUES
     (eid,'James Harrington','Director','2018-03-12','British','1968-04-15','The Old Manor, Cheshire, CH3 7YQ'),
     (eid,'Sarah Cole','Director','2018-03-12','British','1974-09-22','42 Douglas Road, Douglas, IOM');
    INSERT INTO entity_shareholder(entity_id,name,share_class,shares,pct,held_from) VALUES (eid,'Meridian Trust','Ordinary',100,100,'2018-03-12');
    INSERT INTO entity_charge(entity_id,chargee,charge_type,amount,ccy,registered_date) VALUES (eid,'HSBC Bank plc','Fixed charge',500000,'GBP','2020-06-15');
    INSERT INTO entity_ubo(entity_id,name,role,dob,nationality,ownership_pct,nature_of_control) VALUES (eid,'James Harrington','Beneficial owner / Director','1968-04-15','British',100,'Ownership of shares (>25%)');
    INSERT INTO entity_address(entity_id,address_type,address,from_date) VALUES (eid,'Registered office','2nd Floor, 14 Athol Street, Douglas, Isle of Man, IM1 1JA','2018-03-12'),(eid,'Correspondence','The Old Manor, Cheshire, CH3 7YQ','2018-03-12');
    INSERT INTO entity_meeting(entity_id,meeting_type,meeting_date,notes) VALUES (eid,'Board','2025-03-15','Q1 accounts review, dividend declaration');
  END IF;

  SELECT id INTO eid FROM entity WHERE company_code='AC-2019-014';
  IF NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=eid) THEN
    INSERT INTO entity_officer(entity_id,name,role,appointed,nationality,address) VALUES (eid,'Affinity Trust Ltd','Trustee','2019-07-05','N/A','14 Athol Street, Douglas, IOM');
    INSERT INTO entity_ubo(entity_id,name,role,dob,nationality,nature_of_control) VALUES (eid,'James Harrington','Settlor','1968-04-15','British','Settlor of trust'),(eid,'Emma Harrington','Beneficiary','1998-08-12','British','Named beneficiary');
    INSERT INTO entity_address(entity_id,address_type,address,from_date) VALUES (eid,'Registered office','2nd Floor, 14 Athol Street, Douglas, Isle of Man, IM1 1JA','2019-07-05');
  END IF;

  SELECT id INTO eid FROM entity WHERE company_code='AC-2021-032';
  IF NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=eid) THEN
    INSERT INTO entity_officer(entity_id,name,role,appointed,nationality,dob,address) VALUES
     (eid,'Lena Müller','Director / UBO','2021-01-22','German','1980-11-03','Hauptstraße 12, Munich, Germany'),
     (eid,'Patrick Walsh','Director','2021-01-22','Irish','1975-07-17','14 Grafton Street, Dublin, Ireland');
    INSERT INTO entity_shareholder(entity_id,name,share_class,shares,pct,held_from) VALUES (eid,'Lena Müller','Ordinary',5000,100,'2021-01-22');
    INSERT INTO entity_ubo(entity_id,name,role,dob,nationality,ownership_pct,nature_of_control) VALUES (eid,'Lena Müller','Beneficial owner','1980-11-03','German',100,'Ownership of shares (>25%)');
  END IF;

  SELECT id INTO eid FROM entity WHERE company_code='AC-2023-052';
  IF NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=eid) THEN
    INSERT INTO entity_officer(entity_id,name,role,appointed,nationality,dob,address) VALUES
     (eid,'Sophie Laurent','Director / UBO','2023-08-12','French','1985-06-07','12 Rue de Rivoli, Paris, France'),
     (eid,'David Park','Director','2023-08-12','South Korean','1979-10-23','Seoul, South Korea');
    INSERT INTO entity_shareholder(entity_id,name,share_class,shares,pct,held_from) VALUES (eid,'Sophie Laurent','Ordinary',6000,60,'2023-08-12'),(eid,'David Park','Ordinary',4000,40,'2023-08-12');
    INSERT INTO entity_charge(entity_id,chargee,charge_type,amount,ccy,registered_date) VALUES (eid,'Scotiabank Cayman','Fixed charge',1200000,'USD','2023-08-12');
    INSERT INTO entity_ubo(entity_id,name,role,dob,nationality,ownership_pct,nature_of_control) VALUES (eid,'Sophie Laurent','Beneficial owner','1985-06-07','French',60,'Ownership of shares (>25%)');
    INSERT INTO entity_address(entity_id,address_type,address,from_date) VALUES (eid,'Registered office','Harbour Place, 103 South Church Street, George Town, Cayman','2023-08-12');
  END IF;
END $$;

-- 3) portfolio list function
CREATE OR REPLACE FUNCTION ea_entities_list()
RETURNS TABLE(id bigint, ref text, name text, entity_type text, jurisdiction text,
              admin_status text, risk_rating text, incorporation_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.company_code, e.name, COALESCE(p.entity_type,'Company'), COALESCE(p.jurisdiction,'—'),
         COALESCE(p.admin_status,'Active'), COALESCE(p.risk_rating,'—'), p.incorporation_date
  FROM entity e JOIN entity_profile p ON p.entity_id=e.id
  WHERE e.entity_class='client'
  ORDER BY e.company_code;
$$;
GRANT EXECUTE ON FUNCTION ea_entities_list() TO authenticated;

-- ───────────────────────────────────────────────
-- db_eadmin/002_seed.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — ENTITY ADMIN SAMPLE DATA (demo; safe to delete later)
-- Populates the CSP registers for A00001/A00002/A00003. Idempotent.
-- =====================================================================
DO $$
DECLARE v1 bigint; v2 bigint; v3 bigint;
BEGIN
  SELECT id INTO v1 FROM entity WHERE company_code='A00001';
  SELECT id INTO v2 FROM entity WHERE company_code='A00002';
  SELECT id INTO v3 FROM entity WHERE company_code='A00003';

  -- These three codes predate the current client seed, which uses AC-YYYY-NNN
  -- references (see 003_seed_clients.sql). Nothing creates A00001-A00003 any
  -- more, so skip rather than fail with a not-null violation on entity_id.
  IF v1 IS NULL OR v2 IS NULL OR v3 IS NULL THEN
    RAISE NOTICE 'Skipping 002_seed: entities A00001-A00003 not present (superseded by 003_seed_clients).';
    RETURN;
  END IF;

  INSERT INTO entity_profile(entity_id,reg_no,jurisdiction,entity_type,incorporation_date,year_end,tax_status,fatca_class,crs_class,giin,business_activity,admin_status,risk_rating,next_review_date) VALUES
   (v1,'012345C','Isle of Man','Company','2018-03-12','31 December','IOM tax resident','Reporting FI — Investment Entity','Investment Entity','—','Investment holding','Active','Low','2026-03-01'),
   (v2,'C 98765','Malta','Company','2019-07-05','31 December','Malta tax resident','Reporting FI','Investment Entity','—','Fund administration','Active','Medium','2026-04-15'),
   (v3,'CY-334455','Cayman Islands','Company','2023-08-12','31 December','Tax exempt','Non-Reporting FI','Passive NFE','—','Holding company','Active','Low','2026-08-12')
  ON CONFLICT (entity_id) DO NOTHING;

  IF NOT EXISTS(SELECT 1 FROM entity_officer WHERE entity_id=v1) THEN
    INSERT INTO entity_officer(entity_id,name,role,appointed,nationality,dob,address) VALUES
     (v1,'Roxy Sheeley','Director','2018-03-12','Manx','1979-05-14','14 Athol Street, Douglas, IOM'),
     (v1,'Colin Quayle','Director / Company Secretary','2018-03-12','British','1971-09-02','14 Athol Street, Douglas, IOM');
    INSERT INTO entity_officer(entity_id,name,role,appointed,nationality,dob,address) VALUES
     (v2,'Joanne Fenech','Director','2019-07-05','Maltese','1983-02-19','Valletta, Malta'),
     (v3,'Garry Crossan','Director','2023-08-12','British','1976-11-30','George Town, Cayman');
  END IF;

  IF NOT EXISTS(SELECT 1 FROM entity_shareholder WHERE entity_id=v1) THEN
    INSERT INTO entity_shareholder(entity_id,name,share_class,shares,pct,held_from) VALUES
     (v1,'Harrington Holdings Ltd','Ordinary',1000,100,'2018-03-12'),
     (v2,'Affinity (IOM) Limited','Ordinary',800,80,'2019-07-05'),
     (v3,'Affinity (IOM) Limited','Ordinary',600,60,'2023-08-12');
  END IF;

  IF NOT EXISTS(SELECT 1 FROM entity_charge WHERE entity_id=v1) THEN
    INSERT INTO entity_charge(entity_id,chargee,charge_type,amount,ccy,registered_date) VALUES
     (v1,'HSBC Bank plc','Fixed charge',500000,'GBP','2020-06-15');
  END IF;

  IF NOT EXISTS(SELECT 1 FROM entity_ubo WHERE entity_id=v1) THEN
    INSERT INTO entity_ubo(entity_id,name,role,dob,nationality,ownership_pct,nature_of_control) VALUES
     (v1,'James Harrington','Beneficial owner','1968-04-15','British',100,'Ownership of shares (>25%)'),
     (v2,'James Harrington','Beneficial owner','1968-04-15','British',80,'Indirect via A00001'),
     (v3,'James Harrington','Beneficial owner','1968-04-15','British',60,'Indirect via A00001');
  END IF;

  IF NOT EXISTS(SELECT 1 FROM entity_address WHERE entity_id=v1) THEN
    INSERT INTO entity_address(entity_id,address_type,address,from_date) VALUES
     (v1,'Registered office','2nd Floor, 14 Athol Street, Douglas, Isle of Man, IM1 1JA','2018-03-12'),
     (v2,'Registered office','Level 3, Valletta Buildings, South Street, Valletta, Malta','2019-07-05'),
     (v3,'Registered office','Harbour Place, 103 South Church Street, George Town, Cayman','2023-08-12');
  END IF;

  IF NOT EXISTS(SELECT 1 FROM entity_meeting WHERE entity_id=v1) THEN
    INSERT INTO entity_meeting(entity_id,meeting_type,meeting_date,notes) VALUES
     (v1,'Board','2025-11-20','Annual board meeting — accounts approved, dividend declared');
  END IF;

  IF NOT EXISTS(SELECT 1 FROM entity_service WHERE entity_id=v1) THEN
    INSERT INTO entity_service(entity_id,service) VALUES
     (v1,'Company administration'),(v1,'Registered office'),(v1,'Director services'),(v1,'Annual return filing');
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- db_eadmin/004_schema2.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — ENTITY ADMIN (part 2): remaining registers
-- Bank accounts, assets, dividends, safe custody; adds subject to file notes.
-- SECURITY DEFINER read functions. Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS entity_bank (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  bank text NOT NULL, account_name text, number text, ccy char(3),
  signatories text, resolution_date date, closed_date date
);
CREATE TABLE IF NOT EXISTS entity_asset (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  description text NOT NULL, acquired_date date, last_valuation_date date,
  value numeric, ccy char(3), notes text
);
CREATE TABLE IF NOT EXISTS entity_dividend (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  share_class text, name text, requested_date date, paid_date date, per_share text, notes text
);
CREATE TABLE IF NOT EXISTS entity_safe_item (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  item text NOT NULL, deposited_date date, retrieved_date date, authorised_by text
);
ALTER TABLE entity_file_note ADD COLUMN IF NOT EXISTS subject text;

CREATE OR REPLACE FUNCTION ea_banks(p_entity bigint)
RETURNS SETOF entity_bank LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_bank WHERE entity_id=p_entity ORDER BY closed_date NULLS FIRST, bank; $$;
CREATE OR REPLACE FUNCTION ea_assets(p_entity bigint)
RETURNS SETOF entity_asset LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_asset WHERE entity_id=p_entity ORDER BY acquired_date DESC; $$;
CREATE OR REPLACE FUNCTION ea_dividends(p_entity bigint)
RETURNS SETOF entity_dividend LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_dividend WHERE entity_id=p_entity ORDER BY paid_date DESC NULLS FIRST; $$;
CREATE OR REPLACE FUNCTION ea_safe_items(p_entity bigint)
RETURNS SETOF entity_safe_item LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_safe_item WHERE entity_id=p_entity ORDER BY deposited_date DESC; $$;

GRANT EXECUTE ON FUNCTION ea_banks(bigint), ea_assets(bigint), ea_dividends(bigint), ea_safe_items(bigint) TO authenticated;

-- seed for the detailed entities
DO $$
DECLARE m bigint; h bigint; a bigint;
BEGIN
  SELECT id INTO m FROM entity WHERE company_code='AC-2024-001'; -- Meridian Holdings
  SELECT id INTO h FROM entity WHERE company_code='AC-2019-014'; -- Harrington Trust
  SELECT id INTO a FROM entity WHERE company_code='AC-2023-052'; -- Apex Growth Fund
  IF m IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entity_bank WHERE entity_id=m) THEN
    INSERT INTO entity_bank(entity_id,bank,account_name,number,ccy,signatories,resolution_date) VALUES
      (m,'Barclays Bank','Current account','****4421','GBP','Andy Morgan, Roxy Sheeley','2018-03-12');
    INSERT INTO entity_asset(entity_id,description,acquired_date,last_valuation_date,value,ccy,notes) VALUES
      (m,'Commercial property — Manchester','2020-06-01','2024-12-31',1200000,'GBP','Freehold. Tenanted.');
    INSERT INTO entity_dividend(entity_id,share_class,name,requested_date,paid_date,per_share,notes) VALUES
      (m,'Ordinary','James Harrington','2025-03-15','2025-03-30','£500','Q1 2025 dividend');
    INSERT INTO entity_safe_item(entity_id,item,deposited_date,authorised_by) VALUES
      (m,'Original certificate of incorporation','2018-03-12','Andy Morgan');
    INSERT INTO entity_file_note(entity_id,note_date,author,subject,note) VALUES
      (m,'2025-07-14','Roxy Sheeley','Client call — Q3 review','Spoke with James Harrington re Q3 accounts. Expects turnover similar to Q2.');
  END IF;
  IF h IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entity_asset WHERE entity_id=h) THEN
    INSERT INTO entity_asset(entity_id,description,acquired_date,last_valuation_date,value,ccy,notes) VALUES
      (h,'Investment portfolio — UK equities','2019-07-05','2024-12-31',2400000,'GBP','Managed by Harrington Asset Management');
    INSERT INTO entity_safe_item(entity_id,item,deposited_date,authorised_by) VALUES (h,'Original trust deed','2019-07-05','Andy Morgan');
    INSERT INTO entity_file_note(entity_id,note_date,author,subject,note) VALUES
      (h,'2025-07-12','Gary Harrison','KYC chase — Emma Harrington','Third request for updated passport sent. Escalating to MLRO.');
  END IF;
  IF a IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entity_asset WHERE entity_id=a) THEN
    INSERT INTO entity_bank(entity_id,bank,account_name,number,ccy,resolution_date) VALUES (a,'Butterfield Bank','USD account','****9102','USD','2023-08-12');
    INSERT INTO entity_asset(entity_id,description,acquired_date,last_valuation_date,value,ccy,notes) VALUES
      (a,'Fund interests — Cayman SPC','2023-08-12','2024-12-31',8500000,'USD','Segregated Portfolio Company interests');
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- db_eadmin/005_enhancements.sql
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- db_eadmin/006_group_entities.sql
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- db_eadmin/007_round2.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — ENTITY ADMIN ENHANCEMENTS (staff feedback round 2)
-- Additive columns + safe-custody/archiving movements log + signatory
-- register + cross-entity report functions. All read-only (STABLE).
-- Run once. Safe to re-run.
-- =====================================================================

-- ---- Bank accounts: IBAN, sort code, balance (FSA reporting) ----
ALTER TABLE entity_bank ADD COLUMN IF NOT EXISTS iban         text;
ALTER TABLE entity_bank ADD COLUMN IF NOT EXISTS sort_code    text;
ALTER TABLE entity_bank ADD COLUMN IF NOT EXISTS balance      numeric;
ALTER TABLE entity_bank ADD COLUMN IF NOT EXISTS balance_date date;

-- ---- Assets: date + value of disposal ----
ALTER TABLE entity_asset ADD COLUMN IF NOT EXISTS disposal_date  date;
ALTER TABLE entity_asset ADD COLUMN IF NOT EXISTS disposal_value numeric;

-- ---- File notes: employee name + link to another masterfile ----
ALTER TABLE entity_file_note ADD COLUMN IF NOT EXISTS employee_name    text;
ALTER TABLE entity_file_note ADD COLUMN IF NOT EXISTS linked_entity_id bigint REFERENCES entity(id);

-- ---- Overview: audit status ----
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS audit_status text;  -- e.g. Up to date / In progress / Overdue / Not required

-- ---- Safe custody / Archiving: record type, location, box number, description ----
ALTER TABLE entity_safe_item ADD COLUMN IF NOT EXISTS record_type text DEFAULT 'Safe custody'; -- 'Safe custody' | 'Archiving'
ALTER TABLE entity_safe_item ADD COLUMN IF NOT EXISTS location    text;
ALTER TABLE entity_safe_item ADD COLUMN IF NOT EXISTS box_number  text;
ALTER TABLE entity_safe_item ADD COLUMN IF NOT EXISTS description text;

-- Movements log (requested by / action / date / reason)
CREATE TABLE IF NOT EXISTS entity_safe_movement (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  safe_item_id bigint REFERENCES entity_safe_item(id),
  entity_id bigint NOT NULL REFERENCES entity(id),
  requested_by text, action text, movement_date date DEFAULT current_date, reason text
);

-- Authorised signatory register (per entity, optionally tied to a bank mandate)
CREATE TABLE IF NOT EXISTS entity_signatory (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint NOT NULL REFERENCES entity(id),
  bank_id bigint REFERENCES entity_bank(id),
  name text NOT NULL, category text, class text,  -- e.g. 'A' / 'B' signatory class
  from_date date, to_date date
);

-- ---- Per-entity read functions (SETOF auto-includes new columns) ----
CREATE OR REPLACE FUNCTION ea_safe_movements(p_entity bigint)
RETURNS SETOF entity_safe_movement LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_safe_movement WHERE entity_id=p_entity ORDER BY movement_date DESC, id DESC; $$;
CREATE OR REPLACE FUNCTION ea_signatories(p_entity bigint)
RETURNS SETOF entity_signatory LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM entity_signatory WHERE entity_id=p_entity ORDER BY to_date NULLS FIRST, name; $$;
GRANT EXECUTE ON FUNCTION ea_safe_movements(bigint), ea_signatories(bigint) TO authenticated;

-- ---- CROSS-ENTITY REPORT FUNCTIONS (read-only) ----
-- Assets under management
DROP FUNCTION IF EXISTS rep_aum();
CREATE FUNCTION rep_aum()
RETURNS TABLE(entity text, ref text, jurisdiction text, description text, acquired date,
  last_valuation date, value numeric, ccy text, disposed date, disposal_value numeric, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.name, e.company_code, p.jurisdiction, a.description, a.acquired_date, a.last_valuation_date,
    a.value, a.ccy, a.disposal_date, a.disposal_value,
    CASE WHEN a.disposal_date IS NOT NULL THEN 'Disposed' ELSE 'Under management' END
  FROM entity_asset a JOIN entity e ON e.id=a.entity_id LEFT JOIN entity_profile p ON p.entity_id=e.id
  ORDER BY (a.disposal_date IS NOT NULL), a.value DESC NULLS LAST;
$$;
-- Bank balances (FSA reporting)
DROP FUNCTION IF EXISTS rep_bank_balances();
CREATE FUNCTION rep_bank_balances()
RETURNS TABLE(entity text, ref text, jurisdiction text, bank text, account_name text, ccy text,
  balance numeric, balance_date text, iban text, sort_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.name, e.company_code, p.jurisdiction, b.bank, b.account_name, b.ccy, b.balance,
    to_char(b.balance_date,'DD/MM/YYYY'), b.iban, b.sort_code
  FROM entity_bank b JOIN entity e ON e.id=b.entity_id LEFT JOIN entity_profile p ON p.entity_id=e.id
  WHERE b.closed_date IS NULL AND b.balance IS NOT NULL
  ORDER BY e.name, b.bank;
$$;
-- Safe custody register (all entities), filterable to Archiving via record_type
DROP FUNCTION IF EXISTS rep_safe_custody(text);
CREATE FUNCTION rep_safe_custody(p_type text DEFAULT NULL)
RETURNS TABLE(entity text, ref text, record_type text, item text, description text, location text,
  box_number text, deposited text, retrieved text, authorised_by text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.name, e.company_code, COALESCE(s.record_type,'Safe custody'), s.item, s.description, s.location,
    s.box_number, to_char(s.deposited_date,'DD/MM/YYYY'), to_char(s.retrieved_date,'DD/MM/YYYY'), s.authorised_by
  FROM entity_safe_item s JOIN entity e ON e.id=s.entity_id
  WHERE p_type IS NULL OR COALESCE(s.record_type,'Safe custody')=p_type
  ORDER BY e.name, s.item;
$$;
-- Authorised signatory register (all entities)
DROP FUNCTION IF EXISTS rep_signatories();
CREATE FUNCTION rep_signatories()
RETURNS TABLE(entity text, ref text, signatory text, category text, class text, bank text,
  from_date text, to_date text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.name, e.company_code, sg.name, sg.category, sg.class, b.bank,
    to_char(sg.from_date,'DD/MM/YYYY'), to_char(sg.to_date,'DD/MM/YYYY')
  FROM entity_signatory sg JOIN entity e ON e.id=sg.entity_id
  LEFT JOIN entity_bank b ON b.id=sg.bank_id
  ORDER BY e.name, sg.name;
$$;
GRANT EXECUTE ON FUNCTION rep_aum(), rep_bank_balances(), rep_safe_custody(text), rep_signatories() TO authenticated;

-- ---- light seed so the new fields/reports show data immediately ----
DO $$
DECLARE bid bigint; sid bigint; e1 bigint;
BEGIN
  -- backfill a couple of bank balances + IBAN/sort where banks exist
  UPDATE entity_bank SET iban = COALESCE(iban,'GB'||lpad((id*8887%99)::text,2,'0')||' BARC 2000 00'||lpad((id*131%999999)::text,6,'0')),
                         sort_code = COALESCE(sort_code,'20-'||lpad((id*13%99)::text,2,'0')||'-'||lpad((id*29%99)::text,2,'0')),
                         balance = COALESCE(balance, round((id*104729 % 900000)::numeric/100 + 5000, 2)),
                         balance_date = COALESCE(balance_date, current_date)
    WHERE closed_date IS NULL;
  -- backfill asset disposal example on one disposed asset if none set
  UPDATE entity_asset SET disposal_date = current_date - 60, disposal_value = round(value*0.9,2)
    WHERE id = (SELECT id FROM entity_asset ORDER BY id DESC LIMIT 1) AND disposal_date IS NULL;
  -- tag one safe item as Archiving with a box number, add location to the rest
  UPDATE entity_safe_item SET location = COALESCE(location,'Douglas — fireproof cabinet 3') WHERE location IS NULL;
  UPDATE entity_safe_item SET record_type='Archiving', box_number='BOX-'||lpad(id::text,4,'0')
    WHERE id = (SELECT id FROM entity_safe_item ORDER BY id LIMIT 1);
  -- a couple of movements + signatories on the first entity that has a safe item
  SELECT entity_id, id INTO e1, sid FROM entity_safe_item ORDER BY id LIMIT 1;
  IF e1 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entity_safe_movement) THEN
    INSERT INTO entity_safe_movement(safe_item_id,entity_id,requested_by,action,movement_date,reason) VALUES
     (sid,e1,'Roxy Sheeley','Deposit',current_date-120,'Original share certificates lodged'),
     (sid,e1,'Gary Harrison','Temporary removal',current_date-20,'Produced for statutory audit'),
     (sid,e1,'Gary Harrison','Return',current_date-13,'Returned to safe custody post-audit');
  END IF;
  SELECT id INTO bid FROM entity_bank ORDER BY id LIMIT 1;
  IF bid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entity_signatory) THEN
    SELECT entity_id INTO e1 FROM entity_bank WHERE id=bid;
    INSERT INTO entity_signatory(entity_id,bank_id,name,category,class,from_date) VALUES
     (e1,bid,'Andy Morgan','Director','A signatory',current_date-800),
     (e1,bid,'Roxy Sheeley','Authorised administrator','B signatory',current_date-800);
  END IF;
  -- seed an audit status on profiles that lack one
  UPDATE entity_profile SET audit_status = CASE (entity_id % 4)
      WHEN 0 THEN 'Up to date' WHEN 1 THEN 'In progress' WHEN 2 THEN 'Overdue' ELSE 'Not required' END
    WHERE audit_status IS NULL;
END $$;

-- ───────────────────────────────────────────────
-- db_ops/001_batch1.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — OPS BATCH 1: timesheets, notifications, audit log, procedures
-- Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS timesheet_entry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id int, entry_date date, entity_label text, matter text, entry_type text,
  units int, hours numeric, billable boolean, rate numeric, value numeric, status text, narrative text
);
CREATE TABLE IF NOT EXISTS notification (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  t timestamptz, ntype text, title text, body text, who text, mod text
);
CREATE TABLE IF NOT EXISTS audit_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  t timestamptz, staff_user text, user_id int, action text, mod text, target text, details text, ip text, severity text
);
CREATE TABLE IF NOT EXISTS procedure (
  id text PRIMARY KEY, title text, category text, office text, owner text, steps int, avg_time text, active_runs int
);
CREATE TABLE IF NOT EXISTS procedure_run (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proc text, title text, entity_label text, started date, step int, total int, assignee text, status text
);
CREATE TABLE IF NOT EXISTS procedure_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proc text, title text, entity_label text, done_date date, dur text, done_by text, result text
);

DROP FUNCTION IF EXISTS ts_entries();
CREATE FUNCTION ts_entries()
RETURNS TABLE(id bigint, "staffId" int, date text, entity text, matter text, type text, units int,
  hours numeric, billable boolean, rate numeric, value numeric, status text, narrative text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, staff_id, to_char(entry_date,'DD/MM/YYYY'), entity_label, matter, entry_type, units,
    hours, billable, rate, value, status, narrative FROM timesheet_entry ORDER BY entry_date DESC, id;
$$;
DROP FUNCTION IF EXISTS notifications_list();
CREATE FUNCTION notifications_list()
RETURNS TABLE(id bigint, t text, type text, title text, body text, who text, mod text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, to_char(t,'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ntype, title, body, who, mod FROM notification ORDER BY t DESC;
$$;
DROP FUNCTION IF EXISTS audit_events();
CREATE FUNCTION audit_events()
RETURNS TABLE(t text, "user" text, "userId" int, action text, mod text, target text, details text, ip text, severity text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT to_char(t,'YYYY-MM-DD"T"HH24:MI:SS"Z"'), staff_user, user_id, action, mod, target, details, ip, severity
  FROM audit_event ORDER BY t DESC;
$$;
DROP FUNCTION IF EXISTS procedures_list();
CREATE FUNCTION procedures_list()
RETURNS TABLE(id text, title text, category text, office text, owner text, steps int, "avgTime" text, "activeRuns" int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, title, category, office, owner, steps, avg_time, active_runs FROM procedure ORDER BY id;
$$;
DROP FUNCTION IF EXISTS procedure_runs();
CREATE FUNCTION procedure_runs()
RETURNS TABLE(id bigint, proc text, title text, entity text, started text, step int, total int, assignee text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, proc, title, entity_label, to_char(started,'DD/MM/YYYY'), step, total, assignee, status FROM procedure_run ORDER BY started DESC;
$$;
DROP FUNCTION IF EXISTS procedure_hist();
CREATE FUNCTION procedure_hist()
RETURNS TABLE(proc text, title text, entity text, date text, dur text, by text, result text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT proc, title, entity_label, to_char(done_date,'DD/MM/YYYY'), dur, done_by, result FROM procedure_history ORDER BY done_date DESC;
$$;
GRANT EXECUTE ON FUNCTION ts_entries(), notifications_list(), audit_events(), procedures_list(), procedure_runs(), procedure_hist() TO authenticated;

DO $$
DECLARE d date := current_date; n timestamptz := now();
BEGIN
  IF NOT EXISTS(SELECT 1 FROM timesheet_entry) THEN
    INSERT INTO timesheet_entry(staff_id,entry_date,entity_label,matter,entry_type,units,hours,billable,rate,value,status,narrative) VALUES
     (1,d,'Harrington Family Trust','Compliance review','Client — compliance',6,1.0,true,250,250,'Submitted','Reviewed outstanding KYC requirements.'),
     (1,d,'Meridian Holdings Ltd','Company administration','Client — admin',3,0.5,true,250,125,'Submitted','Updated director register following board meeting.'),
     (1,d,'Rosewood Legacy Trust','Trustee services','Client — trust',4,0.67,true,250,167.50,'Submitted','Q2 trust distribution — reviewed resolution.'),
     (1,d-3,'North Star Holdings Ltd','Liquidation admin','Client — admin',5,0.83,true,250,208.33,'Approved','Coordinated with liquidator re documents.'),
     (1,d-3,'Internal','Team meeting','Non-billable — internal',6,1.0,false,0,0,'Approved','Weekly administration team meeting.');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM notification) THEN
    INSERT INTO notification(t,ntype,title,body,who,mod) VALUES
     (n-interval '20 min','task','Roxy assigned you a task','Renew Apex Growth Fund licence','Roxy Sheeley','tasks'),
     (n-interval '55 min','approval','Document awaiting your approval','Engagement Letter — Adriatic Holdings','Joanne Fenech','documents'),
     (n-interval '90 min','mention','Colin @mentioned you','Need your sign-off on capital reorg','Colin Quayle','entities'),
     (n-interval '3 hour','compliance','KYC review due in 7 days','Pacific Wealth Trust · Cayman · High risk','System','compliance'),
     (n-interval '5 hour','onboarding','KYC pack received','Verona Digital Holdings — ready for review','Krista Fenech','onboarding');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM audit_event) THEN
    INSERT INTO audit_event(t,staff_user,user_id,action,mod,target,details,ip,severity) VALUES
     (n-interval '5 min','Andrew Morgan',1,'Logged in','System','Affinity Core','Login from Miami office IP','104.28.241.18','info'),
     (n-interval '25 min','Roxy Sheeley',14,'Document uploaded','Documents','AGM Minutes — Meridian Holdings','4.2 MB · Statutory','86.176.20.4','info'),
     (n-interval '50 min','Colin Quayle',12,'Director added','Entity Admin','Stonebridge Capital Ltd','Appointed new Director','86.176.21.92','info'),
     (n-interval '2 hour','Gary Harrison',5,'Risk rating changed','Compliance','Apex Growth Fund Ltd','Medium → High','86.176.22.10','warning');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM procedure) THEN
    INSERT INTO procedure(id,title,category,office,owner,steps,avg_time,active_runs) VALUES
     ('3.01','New client onboarding — company','Onboarding','All','Administrator',12,'10 days',2),
     ('3.02','New client onboarding — trust','Onboarding','All','Administrator',14,'14 days',1),
     ('3.05','New director appointment','Statutory','All','Administrator',7,'3 days',1),
     ('3.07','Periodic compliance review','Compliance','All','Compliance',9,'5 days',1),
     ('3.14','Annual return filing — IOM','Statutory','Isle of Man','Administrator',6,'2 days',0);
    INSERT INTO procedure_run(proc,title,entity_label,started,step,total,assignee,status) VALUES
     ('3.07','Periodic compliance review','Harrington Family Trust',d-10,4,9,'Roxy Sheeley','In progress'),
     ('3.05','New director appointment','Stonebridge Capital Ltd',d-5,2,7,'Joanne Fenech','In progress');
    INSERT INTO procedure_history(proc,title,entity_label,done_date,dur,done_by,result) VALUES
     ('3.07','Periodic compliance review','Stonebridge Capital Ltd',d-8,'2 days','Joanne Fenech','Complete'),
     ('3.14','Annual return filing — IOM','Rosewood Legacy Trust',d-11,'1 day','Roxy Sheeley','Complete');
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- db_ops/002_bookkeeping.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — BOOKKEEPING BACK OFFICE (per-entity client ledgers)
-- Preserves the module's own entity id space. Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS bk_entity (
  id int PRIMARY KEY, name text, currency char(3), sym text, jur text, year_end text
);
CREATE TABLE IF NOT EXISTS bk_txn (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id int, txn_date date, descr text, txn_type text, dr numeric, cr numeric, ref text, account text, status text
);
CREATE TABLE IF NOT EXISTS bk_pnl (
  entity_id int PRIMARY KEY, income numeric, expenses numeric, net numeric, currency char(3), sym text
);
CREATE TABLE IF NOT EXISTS bk_bank (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id int, name text, bank text, currency char(3), balance numeric, as_at date
);
DROP FUNCTION IF EXISTS bk_entities();
CREATE FUNCTION bk_entities()
RETURNS TABLE(id int, name text, currency text, sym text, jur text, "yearEnd" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, name, currency, sym, jur, year_end FROM bk_entity ORDER BY name; $$;
DROP FUNCTION IF EXISTS bk_txns_all();
CREATE FUNCTION bk_txns_all()
RETURNS TABLE(id bigint, entity_id int, date text, "desc" text, type text, dr numeric, cr numeric, ref text, account text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, entity_id, to_char(txn_date,'DD/MM/YYYY'), descr, txn_type, dr, cr, ref, account, status FROM bk_txn ORDER BY entity_id, id; $$;
DROP FUNCTION IF EXISTS bk_pnl_all();
CREATE FUNCTION bk_pnl_all()
RETURNS TABLE(entity_id int, income numeric, expenses numeric, net numeric, currency text, sym text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT entity_id, income, expenses, net, currency, sym FROM bk_pnl; $$;
DROP FUNCTION IF EXISTS bk_banks_all();
CREATE FUNCTION bk_banks_all()
RETURNS TABLE(entity_id int, name text, bank text, currency text, balance numeric, "asAt" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT entity_id, name, bank, currency, balance, to_char(as_at,'DD/MM/YYYY') FROM bk_bank ORDER BY entity_id, id; $$;
GRANT EXECUTE ON FUNCTION bk_entities(), bk_txns_all(), bk_pnl_all(), bk_banks_all() TO authenticated;

DO $$
DECLARE d date := current_date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM bk_entity) THEN
    INSERT INTO bk_entity(id,name,currency,sym,jur,year_end) VALUES
     (1,'Meridian Holdings Ltd','GBP','£','Isle of Man','31/03'),
     (3,'Caledonian Ventures Ltd','USD','$','Cayman Islands','31/12'),
     (4,'Azure Mediterranean Foundation','EUR','€','Malta','31/12'),
     (6,'Pacific Wealth Trust','USD','$','Cayman Islands','31/12'),
     (10,'Apex Growth Fund Ltd','USD','$','Cayman Islands','31/12'),
     (9,'Rosewood Legacy Trust','GBP','£','Isle of Man','05/04');
    INSERT INTO bk_txn(entity_id,txn_date,descr,txn_type,dr,cr,ref,account,status) VALUES
     (1,d-105,'Opening balance','Balance',0,0,'OB-2025','Current account','Locked'),
     (1,d-105,'Q1 retainer fee — Affinity','Income',0,2000,'INV-041','Current account','Posted'),
     (1,d-90,'Registered office disbursement','Expense',250,0,'DIS-001','Current account','Posted'),
     (1,d-75,'Bank charges','Expense',45,0,'BANK-APR','Current account','Posted'),
     (1,d-14,'Q2 retainer fee — Affinity','Income',0,2000,'INV-041','Current account','Posted'),
     (1,d,'Directors fee','Expense',1500,0,'DIR-JUL','Current account','Draft'),
     (1,d,'Q2 retainer received','Receipt',0,2000,'REC-001','Current account','Posted'),
     (3,d-195,'Opening balance','Balance',0,0,'OB-2025','USD account','Locked'),
     (3,d-105,'Q1 retainer fee','Income',0,3600,'INV-019','USD account','Posted'),
     (3,d-100,'Legal fees — asset sale','Expense',4200,0,'LEG-001','USD account','Posted'),
     (3,d-96,'Asset sale proceeds','Income',0,250000,'SALE-001','USD account','Posted'),
     (3,d-14,'Q2 retainer fee','Income',0,5100,'INV-019','USD account','Posted');
    INSERT INTO bk_pnl(entity_id,income,expenses,net,currency,sym) VALUES
     (1,16000,7650,8350,'GBP','£'),(3,262700,4200,258500,'USD','$'),(4,3600,320,3280,'EUR','€'),
     (6,7200,1200,6000,'USD','$'),(10,11000,850,10150,'USD','$'),(9,4800,5000,-200,'GBP','£');
    INSERT INTO bk_bank(entity_id,name,bank,currency,balance,as_at) VALUES
     (1,'Current account','Barclays Bank','GBP',18240.50,d),(1,'Deposit account','Barclays Bank','GBP',50000,d),
     (3,'USD account','First Caribbean Bank','USD',312480,d),(4,'EUR account','Bank of Valletta','EUR',9240.80,d),
     (6,'USD account','Scotiabank Cayman','USD',28640,d),(10,'USD account','Butterfield Bank','USD',88340,d),
     (9,'GBP account','Lloyds Bank','GBP',7640,d);
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- db_ops/003_datasets.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — UI DATASET STORE (chart/analytics data for Budgeting + Reporting)
-- Precomputed datasets as JSON. In production these become computed views.
-- Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS ui_dataset ( dkey text PRIMARY KEY, data jsonb NOT NULL );
DROP FUNCTION IF EXISTS get_datasets(text);
CREATE FUNCTION get_datasets(p_prefix text)
RETURNS TABLE(dkey text, data jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT dkey, data FROM ui_dataset WHERE dkey LIKE p_prefix || '%' ORDER BY dkey; $$;
GRANT EXECUTE ON FUNCTION get_datasets(text) TO authenticated;

INSERT INTO ui_dataset(dkey,data) VALUES
('budget.budgets','[
 {"id":1,"name":"Group — FY 2025/26","type":"Annual","status":"Approved","owner":"Neil Kelly","version":"v3","period":"Apr 2025 – Mar 2026","totalRev":2100000,"totalCost":1420000},
 {"id":2,"name":"Isle of Man — FY 2025/26","type":"Departmental","status":"Approved","owner":"Roxy Sheeley","version":"v2","period":"Apr 2025 – Mar 2026","totalRev":620000,"totalCost":390000},
 {"id":3,"name":"Malta — FY 2025/26","type":"Departmental","status":"Approved","owner":"Joanne Fenech","version":"v1","period":"Apr 2025 – Mar 2026","totalRev":310000,"totalCost":210000},
 {"id":4,"name":"Cayman — FY 2025/26","type":"Departmental","status":"Draft","owner":"Garry Crossan","version":"v1","period":"Apr 2025 – Mar 2026","totalRev":840000,"totalCost":580000},
 {"id":5,"name":"Group — FY 2025/26 Reforecast Q1","type":"Reforecast","status":"Under review","owner":"Neil Kelly","version":"v1","period":"Apr 2025 – Mar 2026","totalRev":2240000,"totalCost":1460000}]'::jsonb),
('budget.monthly','[
 {"month":"Apr","budget":160000,"forecast":165000,"actual":158000,"budgetC":115000,"forecastC":118000,"actualC":112000},
 {"month":"May","budget":163000,"forecast":168000,"actual":171000,"budgetC":117000,"forecastC":120000,"actualC":119000},
 {"month":"Jun","budget":165000,"forecast":172000,"actual":168000,"budgetC":118000,"forecastC":122000,"actualC":117000},
 {"month":"Jul","budget":168000,"forecast":175000,"actual":null,"budgetC":120000,"forecastC":124000,"actualC":null},
 {"month":"Aug","budget":162000,"forecast":170000,"actual":null,"budgetC":116000,"forecastC":121000,"actualC":null},
 {"month":"Sep","budget":170000,"forecast":178000,"actual":null,"budgetC":122000,"forecastC":127000,"actualC":null}]'::jsonb),
('budget.scenarios','[
 {"name":"Base case","rev":2100000,"cost":1420000,"margin":32.4,"prob":"60%","color":"#00C4CC"},
 {"name":"Best case","rev":2380000,"cost":1440000,"margin":39.5,"prob":"20%","color":"#4CAF7D"},
 {"name":"Downside","rev":1820000,"cost":1400000,"margin":23.1,"prob":"20%","color":"#EF4444"}]'::jsonb),
('budget.variance','[
 {"line":"Retainer income","budget":980000,"actual":497000,"variance":12000,"pct":"+2.5%","status":"Favourable"},
 {"line":"Ad hoc income","budget":420000,"actual":198000,"variance":-8000,"pct":"-3.8%","status":"Adverse"},
 {"line":"Specialist income","budget":700000,"actual":372000,"variance":18000,"pct":"+5.1%","status":"Favourable"},
 {"line":"Staff costs","budget":860000,"actual":428000,"variance":6000,"pct":"+1.4%","status":"Adverse"},
 {"line":"Office & premises","budget":180000,"actual":88000,"variance":-4000,"pct":"-4.3%","status":"Favourable"},
 {"line":"IT & software","budget":95000,"actual":52000,"variance":2000,"pct":"+4.0%","status":"Adverse"},
 {"line":"Professional fees","budget":120000,"actual":58000,"variance":-8000,"pct":"-12.1%","status":"Favourable"},
 {"line":"Travel & expenses","budget":65000,"actual":28000,"variance":4000,"pct":"+16.7%","status":"Adverse"}]'::jsonb),
('budget.servicelines','[
 {"line":"Company administration","budget":680000,"forecast":710000,"actual":348000,"margin":38},
 {"line":"Trust administration","budget":520000,"forecast":545000,"actual":268000,"margin":42},
 {"line":"Compliance services","budget":310000,"forecast":325000,"actual":162000,"margin":45},
 {"line":"Accounting & finance","budget":280000,"forecast":290000,"actual":141000,"margin":35},
 {"line":"Specialist — Yachting","budget":180000,"forecast":195000,"actual":94000,"margin":52},
 {"line":"Specialist — Sports","budget":130000,"forecast":138000,"actual":68000,"margin":48}]'::jsonb),
('budget.pos','[
 {"ref":"PO-2025-018","supplier":"Carey Olsen — Legal","amount":12000,"status":"Approved","raised":"01/05/2025","dept":"Legal"},
 {"ref":"PO-2025-019","supplier":"Microsoft Azure","amount":3200,"status":"Approved","raised":"01/06/2025","dept":"IT"},
 {"ref":"PO-2025-020","supplier":"Worldcheck — Refinitiv","amount":8400,"status":"Approved","raised":"01/04/2025","dept":"Compliance"},
 {"ref":"PO-2025-021","supplier":"KPMG — Audit fees","amount":28000,"status":"Pending","raised":"14/07/2025","dept":"Finance"},
 {"ref":"PO-2025-022","supplier":"Office supplies — IOM","amount":1200,"status":"Approved","raised":"10/07/2025","dept":"Operations"},
 {"ref":"PO-2025-023","supplier":"Staff training — AML","amount":4500,"status":"Pending","raised":"14/07/2025","dept":"Compliance"}]'::jsonb),
('report.revenueByOffice','[
 {"month":"Jan","IOM":18200,"Malta":9400,"Cayman":24600,"UK":6200,"Miami":3100},
 {"month":"Feb","IOM":17800,"Malta":10200,"Cayman":23100,"UK":5800,"Miami":2900},
 {"month":"Mar","IOM":19400,"Malta":11000,"Cayman":25800,"UK":7100,"Miami":4200},
 {"month":"Apr","IOM":20100,"Malta":9800,"Cayman":26400,"UK":6600,"Miami":3800},
 {"month":"May","IOM":18900,"Malta":12200,"Cayman":27200,"UK":7400,"Miami":5100},
 {"month":"Jun","IOM":21300,"Malta":11600,"Cayman":28900,"UK":8200,"Miami":4600},
 {"month":"Jul","IOM":19800,"Malta":10900,"Cayman":26100,"UK":7800,"Miami":5400}]'::jsonb),
('report.wipTrend','[{"month":"Feb","wip":38200},{"month":"Mar","wip":41500},{"month":"Apr","wip":44800},{"month":"May","wip":42100},{"month":"Jun","wip":46300},{"month":"Jul","wip":48320}]'::jsonb),
('report.debtorTrend','[{"month":"Feb","overdue":18200},{"month":"Mar","overdue":22400},{"month":"Apr","overdue":19800},{"month":"May","overdue":24100},{"month":"Jun","overdue":21600},{"month":"Jul","overdue":27720}]'::jsonb),
('report.utilData','[{"name":"Garry Crossan","util":82,"target":75},{"name":"Gary Harrison","util":77,"target":75},{"name":"Roxy Sheeley","util":76,"target":75},{"name":"Neil Kelly","util":75,"target":75},{"name":"Joanne Fenech","util":74,"target":75},{"name":"Patrick Walsh","util":74,"target":75},{"name":"Maria Borg","util":74,"target":75},{"name":"Andy Morgan","util":56,"target":75},{"name":"Sarah Cole","util":0,"target":75}]'::jsonb),
('report.riskPie','[{"name":"Low","value":142,"color":"#4CAF7D"},{"name":"Medium","value":112,"color":"#F59E0B"},{"name":"High","value":38,"color":"#EF4444"},{"name":"Very High","value":8,"color":"#7B1D1D"}]'::jsonb),
('report.jurPie','[{"name":"Isle of Man","value":114,"color":"#00C4CC"},{"name":"Cayman Islands","value":87,"color":"#1A7FBF"},{"name":"Malta","value":52,"color":"#7C5CBF"},{"name":"United Kingdom","value":31,"color":"#4A7C6F"},{"name":"Miami","value":16,"color":"#BF5C7A"}]'::jsonb)
ON CONFLICT (dkey) DO UPDATE SET data=EXCLUDED.data;

-- ───────────────────────────────────────────────
-- db_ops/004_admin_content.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — SYSTEM ADMIN USERS + INTRANET/PORTAL/JURISDICTION DATASETS
-- Dollar-quoted literals (collision-proof). sys_user avoids app_user clash.
-- Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS sys_user (
  id int PRIMARY KEY, name text, email text, role text, office text, flag text,
  status text, last_login text, mfa boolean, modules text[]
);
DROP FUNCTION IF EXISTS app_users();
CREATE FUNCTION app_users()
RETURNS TABLE(id int, name text, email text, role text, office text, flag text, status text, "lastLogin" text, mfa boolean, modules text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
  SELECT su.id,su.name,su.email,su.role,su.office,su.flag,su.status,su.last_login,su.mfa,su.modules FROM sys_user su ORDER BY su.id; $fn$;
GRANT EXECUTE ON FUNCTION app_users() TO authenticated;

DO $do$ BEGIN
IF NOT EXISTS(SELECT 1 FROM sys_user) THEN
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (1,$aff$Andrew Morgan$aff$,$aff$andrew.morgan@affinityco.com$aff$,$aff$CEO — Super Admin$aff$,$aff$USA$aff$,$aff$🇺🇸$aff$,$aff$Active$aff$,$aff$Today 09:14$aff$,true,ARRAY[$aff$All$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (2,$aff$Michael Barlow$aff$,$aff$michael.barlow@affinityco.com$aff$,$aff$Compliance Manager (IOM)$aff$,$aff$Isle of Man$aff$,$aff$🇮🇲$aff$,$aff$Active$aff$,$aff$Today 08:52$aff$,true,ARRAY[$aff$Compliance$aff$,$aff$Entities$aff$,$aff$Reporting$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (3,$aff$Joanne Fenech$aff$,$aff$joanne.fenech@affinityco.com$aff$,$aff$Managing Director (IOM)$aff$,$aff$Malta$aff$,$aff$🇲🇹$aff$,$aff$Active$aff$,$aff$Yesterday$aff$,true,ARRAY[$aff$All — Malta$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (4,$aff$Krista Fenech$aff$,$aff$krista.fenech@affinityco.com$aff$,$aff$Client Administrator$aff$,$aff$Malta$aff$,$aff$🇲🇹$aff$,$aff$Active$aff$,$aff$Today 07:38$aff$,false,ARRAY[$aff$Entities$aff$,$aff$Documents$aff$,$aff$Timesheets$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (5,$aff$Alexandra Gardner$aff$,$aff$alexandra.gardner@affinityco.com$aff$,$aff$COO — Super Admin$aff$,$aff$USA$aff$,$aff$🇺🇸$aff$,$aff$Active$aff$,$aff$Today 09:01$aff$,true,ARRAY[$aff$All$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (6,$aff$Debbie Gooding$aff$,$aff$debbie.gooding@affinityco.com$aff$,$aff$Manager$aff$,$aff$Isle of Man$aff$,$aff$🇮🇲$aff$,$aff$Active$aff$,$aff$Today 08:45$aff$,true,ARRAY[$aff$Entities$aff$,$aff$Documents$aff$,$aff$Timesheets$aff$,$aff$Onboarding$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (7,$aff$Natalie Johnson$aff$,$aff$natalie.johnson@affinityco.com$aff$,$aff$Assistant Compliance Administrator$aff$,$aff$USA$aff$,$aff$🇺🇸$aff$,$aff$Active$aff$,$aff$Today 08:21$aff$,true,ARRAY[$aff$Compliance$aff$,$aff$Entities$aff$,$aff$Reporting$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (8,$aff$Neil Kelly$aff$,$aff$neil.kelly@affinityco.com$aff$,$aff$CFO$aff$,$aff$USA$aff$,$aff$🇺🇸$aff$,$aff$Active$aff$,$aff$2d ago$aff$,false,ARRAY[$aff$Reporting$aff$,$aff$Invoicing$aff$,$aff$Timesheets$aff$,$aff$Entities$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (9,$aff$Elena Pace$aff$,$aff$elena.pace@affinityco.com$aff$,$aff$Manager$aff$,$aff$Isle of Man$aff$,$aff$🇮🇲$aff$,$aff$Active$aff$,$aff$Yesterday$aff$,true,ARRAY[$aff$Entities$aff$,$aff$Documents$aff$,$aff$Timesheets$aff$,$aff$Onboarding$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (10,$aff$Shanya Pickett$aff$,$aff$shanya.pickett@affinityco.com$aff$,$aff$Assistant Manager$aff$,$aff$Isle of Man$aff$,$aff$🇮🇲$aff$,$aff$Active$aff$,$aff$Today 10:02$aff$,true,ARRAY[$aff$Entities$aff$,$aff$Documents$aff$,$aff$Timesheets$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (11,$aff$Mattei Pisani$aff$,$aff$mattei.pisani@affinityco.com$aff$,$aff$Director (Malta)$aff$,$aff$Isle of Man$aff$,$aff$🇮🇲$aff$,$aff$Active$aff$,$aff$3d ago$aff$,true,ARRAY[$aff$Entities$aff$,$aff$Documents$aff$,$aff$Timesheets$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (12,$aff$Colin Quayle$aff$,$aff$colin.quayle@affinityco.com$aff$,$aff$Director and Company Secretary (IOM)$aff$,$aff$Isle of Man$aff$,$aff$🇮🇲$aff$,$aff$Active$aff$,$aff$Today 08:30$aff$,false,ARRAY[$aff$Entities$aff$,$aff$Documents$aff$,$aff$Timesheets$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (13,$aff$Kate Shaw$aff$,$aff$kate.shaw@affinityco.com$aff$,$aff$Manager$aff$,$aff$Isle of Man$aff$,$aff$🇮🇲$aff$,$aff$Active$aff$,$aff$4d ago$aff$,true,ARRAY[$aff$Entities$aff$,$aff$Documents$aff$,$aff$Timesheets$aff$,$aff$Onboarding$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (14,$aff$Roxy Sheeley$aff$,$aff$roxy.sheeley@affinityco.com$aff$,$aff$Managing Director (IOM)$aff$,$aff$Isle of Man$aff$,$aff$🇮🇲$aff$,$aff$Active$aff$,$aff$Today 09:25$aff$,true,ARRAY[$aff$All — Isle of Man$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (15,$aff$Gilbert Spiteri Spadaro$aff$,$aff$gilbert.spiterispadaro@affinityco.com$aff$,$aff$Compliance Officer (Malta)$aff$,$aff$Malta$aff$,$aff$🇲🇹$aff$,$aff$Active$aff$,$aff$Today 08:55$aff$,true,ARRAY[$aff$Compliance$aff$,$aff$Entities$aff$,$aff$Reporting$aff$]::text[]);
  INSERT INTO sys_user(id,name,email,role,office,flag,status,last_login,mfa,modules) VALUES (16,$aff$Gary Harrison$aff$,$aff$gary.harrison@affinityco.com$aff$,$aff$COO$aff$,$aff$Isle of Man$aff$,$aff$🇮🇲$aff$,$aff$Active$aff$,$aff$Today 09:30$aff$,true,ARRAY[$aff$All — Isle of Man$aff$]::text[]);
END IF; END $do$;

CREATE TABLE IF NOT EXISTS ui_dataset ( dkey text PRIMARY KEY, data jsonb NOT NULL );
INSERT INTO ui_dataset(dkey,data) VALUES
('intranet.OFFICES',$aff$[{"city":"Douglas","country":"Isle of Man","tz":"Europe/London","offset":0},{"city":"Miami","country":"Florida, USA","tz":"America/New_York","offset":-5},{"city":"Rapid City","country":"South Dakota","tz":"America/Chicago","offset":-6},{"city":"Valletta","country":"Malta","tz":"Europe/Malta","offset":1},{"city":"George Town","country":"Cayman Islands","tz":"America/Cayman","offset":-5},{"city":"London","country":"United Kingdom","tz":"Europe/London","offset":0}]$aff$::jsonb),
('intranet.NEWS',$aff$[{"id":1,"title":"IOM Departmental — July 2025","author":"Roxy Sheeley","date":"10 Jul","preview":"Team update: Sarah Cole returns from maternity leave on 1 August. Welcome back! Timesheets reminder — please ensure all entries are complete by 10am Monday. Congratulations to the team on achieving 100% compliance review completion for Malta this quarter.","img":"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300&q=80"},{"id":2,"title":"Group News — Cayman expansion","author":"Andy Morgan","date":"05 Jul","preview":"Exciting news — we have been appointed as registered office for three new Cayman entities this month, bringing our Cayman portfolio to 87 entities. Garry and Patrick have done an outstanding job building the office.","img":"https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=300&q=80"},{"id":3,"title":"Malta Update — MFSA licensing","author":"Joanne Fenech","date":"28 Jun","preview":"Our Malta MFSA licence renewal was approved last week with no conditions. Special thanks to Maria for preparing the renewal pack. We also welcomed a new client — Verona Digital Holdings — to the Malta portfolio.","img":"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&q=80"},{"id":4,"title":"Welcome — New joiners June 2025","author":"Andy Morgan","date":"02 Jun","preview":"Please join me in welcoming Eliza Rayner (IOM, Administrator) and David O'Brien (Cayman, Compliance Officer) to the Affinity team. Both will be attending the July group offsite. Excited to have them on board.","img":"https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=300&q=80"}]$aff$::jsonb),
('intranet.EVENTS',$aff$[{"id":1,"title":"Group offsite — Isle of Man","date":"21–23 Aug 2025","location":"Douglas, IOM","type":"Group"},{"id":2,"title":"AML training — all staff","date":"15 Jul 2025","location":"Video call","type":"Training"},{"id":3,"title":"IOM Annual compliance forum","date":"04 Sep 2025","location":"Douglas, IOM","type":"External"},{"id":4,"title":"STEP Caribbean conference","date":"14–16 Oct 2025","location":"Cayman Islands","type":"External"},{"id":5,"title":"Q3 board meetings","date":"w/c 20 Oct 2025","location":"All offices","type":"Group"},{"id":6,"title":"Malta MFSA industry day","date":"11 Sep 2025","location":"Valletta, Malta","type":"External"}]$aff$::jsonb),
('intranet.RESOURCES',$aff$[{"name":"Expense claim form","type":"Form","desc":"Submit expenses — complete and email to finance@affinitygroup.com"},{"name":"Holiday request form","type":"Form","desc":"Annual leave request — minimum 2 weeks notice"},{"name":"IT support request","type":"Link","desc":"Log an IT issue — helpdesk.affinitygroup.com"},{"name":"Employee handbook","type":"Document","desc":"Group policies, code of conduct, benefits"},{"name":"AML & compliance manual","type":"Document","desc":"Current AML policies and procedures — all staff"},{"name":"Fee schedule 2025","type":"Document","desc":"Current client fee schedule — confidential"},{"name":"Brand guidelines","type":"Document","desc":"Affinity brand standards — logos, fonts, colours"},{"name":"Health & safety policy","type":"Document","desc":"Group health & safety — all jurisdictions"},{"name":"Data protection policy","type":"Document","desc":"GDPR and data protection — all staff"},{"name":"Whistleblowing policy","type":"Document","desc":"Confidential reporting — anonymity guaranteed"}]$aff$::jsonb),
('intranet.VALUES',$aff$[{"v":"Honesty","icon":"✓","desc":"We are transparent and truthful in all our dealings — with clients, regulators and each other."},{"v":"Transparent Communication","icon":"💬","desc":"We share information openly and ensure everyone has what they need to do their best work."},{"v":"Respect","icon":"⭐","desc":"We treat every person — colleague, client, counterparty — with dignity and professionalism."},{"v":"Inclusivity","icon":"🤝","desc":"We celebrate difference and ensure everyone at Affinity has an equal opportunity to thrive."}]$aff$::jsonb),
('portal.client',$aff${"name":"Emma Harrington","email":"emma.harrington@gmail.com","phone":"+44 7700 900123","lastLogin":"2026-06-03T14:20:00Z","rm":{"name":"Roxy Sheeley","role":"Managing Director — IOM","email":"roxy.sheeley@affinityco.com","phone":"+44 1624 555 102","avatar":"RS","color":"#3C5CBF"},"entities":[{"id":1,"name":"Harrington Family Trust","role":"Settlor & Beneficiary","jurisdiction":"Cayman Islands","flag":"🇰🇾","type":"Trust","status":"Active"},{"id":2,"name":"Meridian Holdings Ltd","role":"Ultimate Beneficial Owner (75%)","jurisdiction":"Isle of Man","flag":"🇮🇲","type":"Company","status":"Active"},{"id":3,"name":"Harrington Investments Ltd","role":"Sole Director & Shareholder","jurisdiction":"United Kingdom","flag":"🇬🇧","type":"Company","status":"Active"}],"actions":[{"id":1,"type":"kyc","title":"KYC renewal due","desc":"Upload an updated passport copy (current expires 30 Jul)","due":"2026-06-30","urgent":true},{"id":2,"type":"sign","title":"Board resolution awaiting signature","desc":"Meridian Holdings — capital reorganisation","due":"2026-06-15","urgent":false},{"id":3,"type":"invoice","title":"Q2 admin invoice ready","desc":"INV-2026-0851 · £4,250 · Harrington Family Trust","due":"2026-06-25","urgent":false}],"documents":[{"id":1,"name":"Trust Deed — Harrington Family","entity":"Harrington Family Trust","date":"12 Mar 2024","type":"PDF","size":"2.8 MB"},{"id":2,"name":"Memorandum & Articles — Meridian Holdings","entity":"Meridian Holdings Ltd","date":"05 Sep 2018","type":"PDF","size":"1.2 MB"},{"id":3,"name":"AGM Minutes — Meridian Holdings 2025","entity":"Meridian Holdings Ltd","date":"30 May 2025","type":"PDF","size":"4.2 MB"},{"id":4,"name":"Annual Statement — Harrington Trust 2025","entity":"Harrington Family Trust","date":"15 Apr 2025","type":"PDF","size":"850 KB"}],"messages":[{"id":1,"from":"rm","t":"2026-06-04T11:30:00Z","text":"Hi Emma — just a heads up that we'll need an updated passport copy in the next couple of weeks. The renewal portal upload is the easiest way."},{"id":2,"from":"client","t":"2026-06-04T15:45:00Z","text":"Thanks Roxy, will sort that this week. Also — when you have a minute, can we discuss adding James as a beneficiary?"},{"id":3,"from":"rm","t":"2026-06-04T16:12:00Z","text":"Absolutely. I'll send over a call invite for Friday afternoon and a short note on what we'll need to add him properly."}],"invoices":[{"id":"INV-2026-0851","date":"01 Jun 2026","amount":"£4,250.00","status":"Outstanding","entity":"Harrington Family Trust"},{"id":"INV-2026-0712","date":"01 Mar 2026","amount":"£4,250.00","status":"Paid","entity":"Harrington Family Trust"},{"id":"INV-2026-0698","date":"01 Mar 2026","amount":"£1,825.00","status":"Paid","entity":"Meridian Holdings Ltd"}]}$aff$::jsonb),
('jur.info',$aff${"Cayman":{"name":"Cayman Islands","regulator":"Cayman Islands Monetary Authority (CIMA)","legislation":["Companies Law (2023 Revision)","Trusts Law (2021 Revision)","Anti-Money Laundering Regulations (2024)","Beneficial Ownership Transparency Law 2023","International Tax Co-operation (ESR) Law 2018","Mutual Funds Law (2023)","Securities Investment Business Law (2020)"],"obligations":[{"id":1,"area":"AML/CFT","title":"AML policies & procedures","freq":"Annual review","due":"31/12/2025","status":"On track","owner":"Gary Harrison"},{"id":2,"area":"AML/CFT","title":"Risk assessment — ML/TF","freq":"Annual","due":"31/12/2025","status":"On track","owner":"Gary Harrison"},{"id":3,"area":"AEOI","title":"FATCA return — CIMA portal","freq":"Annual","due":"31/07/2025","status":"Overdue","owner":"Garry Crossan"},{"id":4,"area":"AEOI","title":"CRS return — CIMA portal","freq":"Annual","due":"31/07/2025","status":"Overdue","owner":"Garry Crossan"},{"id":5,"area":"Substance","title":"ESR return — all in-scope entities","freq":"Annual","due":"12 months after year end","status":"On track","owner":"Garry Crossan"},{"id":6,"area":"BO register","title":"Beneficial ownership register — CIMA","freq":"On change","due":"Ongoing","status":"Current","owner":"Garry Crossan"},{"id":7,"area":"Annual returns","title":"Annual returns — Registrar of Companies","freq":"Annual","due":"31/01/2026","status":"On track","owner":"Garry Crossan"},{"id":8,"area":"Funds","title":"Mutual Fund annual return","freq":"Annual","due":"30/06/2025","status":"Overdue","owner":"Garry Crossan"}],"entities":[{"name":"Caledonian Ventures Ltd","type":"Exempted Co","risk":"Medium","administrator":"Garry Crossan","issues":0},{"name":"Pacific Wealth Trust","type":"STAR Trust","risk":"High","administrator":"Garry Crossan","issues":1},{"name":"Apex Growth Fund Ltd","type":"Exempted Co","risk":"Very High","administrator":"Garry Crossan","issues":2},{"name":"Bluewater Family Trust","type":"Ordinary Trust","risk":"Medium","administrator":"Garry Crossan","issues":0},{"name":"Riviera Trust","type":"STAR Trust","risk":"Medium","administrator":"Garry Crossan","issues":0}],"amlKey":[["MLRO","Gary Harrison (Group CCO)"],["DMLRO — Cayman","Garry Crossan"],["Screening provider","Worldcheck"],["STR filing body","Financial Reporting Authority (FRA)"],["Review cycles","VH: 6mo · H: 12mo · M: 18mo · S: 24mo"],["EDD threshold","All VH + High risk + all PEPs"]]},"Malta":{"name":"Malta","regulator":"Malta Financial Services Authority (MFSA)","legislation":["Companies Act (Cap. 386)","Foundations (Properties) Act","Financial Intelligence Analysis Unit (FIAU) Regulations","Prevention of Money Laundering Act (PMLA)","Beneficial Ownership Registration Regulations 2020","MFSA Conduct of Business Rulebook"],"obligations":[{"id":1,"area":"CSP licence","title":"Authorisation as Trustee / Administrator","freq":"Ongoing","due":"30/09/2025","status":"Active","owner":"Joanne Fenech"},{"id":2,"area":"AML/CFT","title":"Business risk assessment","freq":"Annual","due":"31/12/2025","status":"On track","owner":"Gary Harrison"},{"id":3,"area":"AML/CFT","title":"FIAU sectoral risk assessment update","freq":"Annual","due":"31/12/2025","status":"On track","owner":"Gary Harrison"},{"id":4,"area":"AEOI","title":"CRS/FATCA return — MFSA portal","freq":"Annual","due":"31/07/2025","status":"Overdue","owner":"Joanne Fenech"},{"id":5,"area":"BO register","title":"Beneficial ownership register — MFSA BROS","freq":"On change","due":"Ongoing","status":"Current","owner":"Joanne Fenech"},{"id":6,"area":"Annual returns","title":"Annual returns — Malta Business Registry","freq":"Annual","due":"Within 42 days of anniversary","status":"On track","owner":"Joanne Fenech"},{"id":7,"area":"Reporting","title":"FIAU supervision annual report","freq":"Annual","due":"30/04/2026","status":"On track","owner":"Gary Harrison"},{"id":8,"area":"Data protection","title":"Data Protection Officer annual review","freq":"Annual","due":"31/10/2025","status":"On track","owner":"Joanne Fenech"}],"entities":[{"name":"Azure Mediterranean Fdn","type":"Foundation","risk":"Low","administrator":"Joanne Fenech","issues":0},{"name":"Stonebridge Capital Ltd","type":"Private Ltd","risk":"Low","administrator":"Joanne Fenech","issues":1},{"name":"Malta Ventures","type":"Company","risk":"Medium","administrator":"Joanne Fenech","issues":2,"note":"Unregulated entity — AML/KYC pending"},{"name":"Verano Maritime SA (pend.)","type":"Company","risk":"Low","administrator":"Joanne Fenech","issues":0}],"amlKey":[["MLRO","Gary Harrison (Group CCO)"],["DMLRO — Malta","Joanne Fenech"],["Screening provider","Worldcheck"],["STR filing body","Financial Intelligence Analysis Unit (FIAU)"],["Review cycles","VH: 6mo · H: 12mo · M: 18mo · S: 24mo"],["EDD threshold","All VH + High risk + all PEPs"]]}}$aff$::jsonb)
ON CONFLICT (dkey) DO UPDATE SET data=EXCLUDED.data;

-- ───────────────────────────────────────────────
-- db_ops/005_entity_chart.sql
-- ───────────────────────────────────────────────
-- AFFINITY — ENTITY CHART: ownership/group structures (nodes = entities, children = {id,pct} ownership edges)
CREATE TABLE IF NOT EXISTS ui_dataset ( dkey text PRIMARY KEY, data jsonb NOT NULL );
INSERT INTO ui_dataset(dkey,data) VALUES ('chart.structures',$aff$[{"id":1,"name":"Harrington Family Group","admin":"Roxy Sheeley","nodes":[{"id":"hft","label":"Harrington Family Trust","type":"Trust","jur":"Isle of Man","risk":"High","x":340,"y":40,"children":[{"id":"hnl","pct":100},{"id":"hhl","pct":75}]},{"id":"hnl","label":"Harrington Nominees Ltd","type":"Company","jur":"Isle of Man","risk":"Medium","x":160,"y":180,"children":[]},{"id":"hhl","label":"Harrington Holdings Ltd","type":"Company","jur":"Cayman Islands","risk":"Medium","x":520,"y":180,"children":[{"id":"hpa","pct":100}]},{"id":"hpa","label":"Harrington Property Assoc","type":"Company","jur":"United Kingdom","risk":"Low","x":520,"y":320,"children":[]}],"roles":[{"name":"James Harrington","role":"Settlor / Protector","entity":"hft"},{"name":"Emma Harrington","role":"Beneficiary","entity":"hft"},{"name":"Affinity Trust Ltd","role":"Trustee","entity":"hft"}]},{"id":2,"name":"Meridian Group","admin":"Roxy Sheeley","nodes":[{"id":"mhl","label":"Meridian Holdings Ltd","type":"Company","jur":"Isle of Man","risk":"Medium","x":340,"y":40,"children":[{"id":"mdl","pct":100},{"id":"msa","pct":60}]},{"id":"mdl","label":"Meridian Digital Ltd","type":"Company","jur":"Isle of Man","risk":"Medium","x":160,"y":180,"children":[]},{"id":"msa","label":"Meridian Services Asia Ltd","type":"Company","jur":"Cayman Islands","risk":"Low","x":520,"y":180,"children":[]}],"roles":[{"name":"Wei Chen","role":"Director / UBO","entity":"mhl"},{"name":"Sophie Laurent","role":"Director","entity":"mhl"}]},{"id":3,"name":"Pacific Wealth","admin":"Garry Crossan","nodes":[{"id":"pwt","label":"Pacific Wealth Trust","type":"Trust","jur":"Cayman Islands","risk":"High","x":340,"y":40,"children":[{"id":"pwh","pct":100},{"id":"pwa","pct":80}]},{"id":"pwh","label":"Pacific Wealth Holdings Ltd","type":"Company","jur":"Cayman Islands","risk":"Medium","x":160,"y":180,"children":[]},{"id":"pwa","label":"Pacific Wealth Asia Ltd","type":"Company","jur":"Cayman Islands","risk":"Medium","x":520,"y":180,"children":[]}],"roles":[{"name":"David Park","role":"Settlor","entity":"pwt"},{"name":"Affinity Trust Ltd","role":"Trustee","entity":"pwt"}]}]$aff$::jsonb)
ON CONFLICT (dkey) DO UPDATE SET data=EXCLUDED.data;

-- ───────────────────────────────────────────────
-- db_ops/006_cpd.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — CPD LOG (first write-enabled feature)
-- Staff log their own CPD; it persists and surfaces in the Compliance
-- CPD register. cpd_add is VOLATILE (a real write). Run once; safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS cpd_entry (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_name text NOT NULL,
  activity   text NOT NULL,
  category   text,
  hours      numeric,
  entry_date date DEFAULT current_date,
  verified   boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- WRITE: log a CPD entry
CREATE OR REPLACE FUNCTION cpd_add(p_staff text, p_activity text, p_category text, p_hours numeric, p_date date)
RETURNS cpd_entry LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO cpd_entry(staff_name, activity, category, hours, entry_date)
  VALUES (NULLIF(p_staff,''), p_activity, COALESCE(NULLIF(p_category,''),'General'), p_hours, COALESCE(p_date, current_date))
  RETURNING *;
$$;
GRANT EXECUTE ON FUNCTION cpd_add(text,text,text,numeric,date) TO authenticated;

-- READ: full CPD register
CREATE OR REPLACE FUNCTION cpd_list()
RETURNS TABLE(id bigint, staff text, activity text, category text, hours text, entry_date text, verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, staff_name, activity, category, to_char(COALESCE(hours,0),'FM990.0'),
         to_char(entry_date,'DD/MM/YYYY'), COALESCE(verified,false)
  FROM cpd_entry ORDER BY entry_date DESC, id DESC;
$$;
GRANT EXECUTE ON FUNCTION cpd_list() TO authenticated;

-- light seed (only if empty)
INSERT INTO cpd_entry(staff_name, activity, category, hours, entry_date, verified)
SELECT * FROM (VALUES
  ('Colette Grisdale','AML/CFT annual update','Compliance',4.0,current_date-30,true),
  ('Roxy Sheeley','Trust administration webinar','Technical',2.0,current_date-20,true)
) v(a,b,c,d,e,f) WHERE NOT EXISTS (SELECT 1 FROM cpd_entry);

-- ───────────────────────────────────────────────
-- db_ops/007_creg.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — COMPLIANCE REGISTERS (write-enabled, generic)
-- One flexible table backs every register (gifts, complaints, breaches,
-- conflicts, sanctions, etc.). Row values stored as jsonb keyed by the
-- register's columns. creg_add is a real write. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS creg_entry (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  register     text NOT NULL,
  jurisdiction text,
  data         jsonb NOT NULL,
  created_by   text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creg_entry_register_idx ON creg_entry(register);

-- WRITE: add a register entry
CREATE OR REPLACE FUNCTION creg_add(p_register text, p_jurisdiction text, p_data jsonb, p_by text)
RETURNS creg_entry LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO creg_entry(register, jurisdiction, data, created_by)
  VALUES (p_register, NULLIF(p_jurisdiction,''), COALESCE(p_data,'{}'::jsonb), NULLIF(p_by,''))
  RETURNING *;
$$;
GRANT EXECUTE ON FUNCTION creg_add(text,text,jsonb,text) TO authenticated;

-- READ: entries for one register (newest first)
CREATE OR REPLACE FUNCTION creg_list(p_register text)
RETURNS TABLE(id bigint, register text, jurisdiction text, data jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, register, jurisdiction, data, created_at
  FROM creg_entry WHERE register = p_register ORDER BY id DESC;
$$;
GRANT EXECUTE ON FUNCTION creg_list(text) TO authenticated;

-- ───────────────────────────────────────────────
-- db_ops/008_saved_reports.sql
-- ───────────────────────────────────────────────
-- =====================================================================
-- AFFINITY — SAVED REPORTS (write-enabled)
-- A saved report is just a name plus the builder's definition: which
-- columns, which conditions, which portfolio scope. Re-running it means
-- re-evaluating the definition against current data, so a saved report
-- always returns today's answer, never a stale snapshot.
-- Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS saved_report (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  definition  jsonb NOT NULL,          -- { fields:[], conds:[], scope:"" }
  owner       text,                    -- staff name/upn; null = unattributed
  shared      boolean NOT NULL DEFAULT false,
  run_count   integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_report_owner_idx ON saved_report(owner);

-- WRITE: create or update by name for that owner, so saving twice with the
-- same name updates rather than duplicating.
CREATE OR REPLACE FUNCTION saved_report_upsert(
  p_name text, p_definition jsonb, p_owner text, p_shared boolean)
RETURNS saved_report LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r saved_report;
BEGIN
  UPDATE saved_report
     SET definition = p_definition, shared = p_shared, updated_at = now()
   WHERE name = p_name AND owner IS NOT DISTINCT FROM p_owner
  RETURNING * INTO r;

  IF NOT FOUND THEN
    INSERT INTO saved_report (name, definition, owner, shared)
    VALUES (p_name, p_definition, p_owner, p_shared)
    RETURNING * INTO r;
  END IF;

  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION saved_report_upsert(text,jsonb,text,boolean) TO authenticated;

-- READ: a user's own reports plus anything shared with the team
CREATE OR REPLACE FUNCTION saved_report_list(p_owner text)
RETURNS TABLE (id bigint, name text, definition jsonb, owner text, shared boolean,
               run_count integer, last_run_at timestamptz, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, name, definition, owner, shared, run_count, last_run_at, updated_at
    FROM saved_report
   WHERE owner IS NOT DISTINCT FROM p_owner OR shared = true
   ORDER BY updated_at DESC;
$$;
GRANT EXECUTE ON FUNCTION saved_report_list(text) TO authenticated;

-- Record a run, so the list can show what actually gets used
CREATE OR REPLACE FUNCTION saved_report_touch(p_id bigint)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  UPDATE saved_report SET run_count = run_count + 1, last_run_at = now() WHERE id = p_id;
$$;
GRANT EXECUTE ON FUNCTION saved_report_touch(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION saved_report_delete(p_id bigint)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  DELETE FROM saved_report WHERE id = p_id;
$$;
GRANT EXECUTE ON FUNCTION saved_report_delete(bigint) TO authenticated;


-- =====================================================================
-- LOCKDOWN — must run last
--
-- Creating a function grants EXECUTE to PUBLIC by default, and in Supabase
-- `anon` inherits that. So every function created above is reachable with the
-- publishable key until this block runs, regardless of who the GRANT names.
-- 053 closed this for the engine; this closes it for the application layer,
-- and for anything added here later.
-- =====================================================================
DO $lockdown$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $lockdown$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- Verify: should return 0. Anything above 0 is still open to the public key.
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
