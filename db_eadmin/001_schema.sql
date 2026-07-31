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
  ea_file_notes(bigint), ea_services(bigint) TO anon, authenticated;
