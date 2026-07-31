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

GRANT EXECUTE ON FUNCTION ea_banks(bigint), ea_assets(bigint), ea_dividends(bigint), ea_safe_items(bigint) TO anon, authenticated;

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
