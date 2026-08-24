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
