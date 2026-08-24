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
