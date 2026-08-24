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
