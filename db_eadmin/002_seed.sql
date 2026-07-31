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
