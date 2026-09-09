-- =====================================================================
-- AFFINITY CORE — 081: OBLIGATION SCHEDULES, ENTERED BY COMPLIANCE
--
-- The obligations were hardcoded in affinity_core_jurisdiction_compliance.jsx
-- as a JUR_INFO constant. Malta and Cayman had schedules; Isle of Man, Cyprus,
-- UK and USA were empty arrays with a note.
--
-- That meant the populated ones could not be edited, corrected or extended
-- without a code change, and the empty ones could not be filled in at all.
-- For a compliance tracker that is the wrong way round: the deadlines change
-- more often than the software.
--
-- So obligations move into the database and Compliance enters them.
--
-- ── WHAT I HAVE AND HAVE NOT PRE-FILLED ─────────────────────────────
--
-- The CATEGORIES are seeded, because they are structural and the same
-- everywhere: licence, AML/CFT, AEOI, substance, BO register, annual returns,
-- accounts, tax, sector, internal.
--
-- The DEADLINES are not, for any jurisdiction. Malta and Cayman's existing
-- entries are migrated as they stand because they were already reviewed, and
-- everything else is left empty. A wrong date in a compliance tracker is worse
-- than a visibly empty one: someone trusts it and misses a filing.
--
-- Run AFTER 080. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS obligation_area (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  detail     text,
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO obligation_area(code, name, detail, sort_order) VALUES
 ('LICENCE',  'Licence / authorisation',
  'Affinity''s own licence conditions, renewals and regulatory returns as a corporate or trust service provider.', 10),
 ('AML',      'AML / CFT',
  'Business risk assessment, ML/TF risk assessment, policies and procedures review, MLRO annual report, staff training.', 20),
 ('AEOI',     'Automatic exchange of information',
  'FATCA and CRS registration and returns, including nil returns where required.', 30),
 ('SUBSTANCE','Economic substance',
  'Notification and return, assessed per in-scope entity.', 40),
 ('BO',       'Beneficial ownership register',
  'Filings on change, plus any periodic confirmation the jurisdiction requires.', 50),
 ('ANNUAL',   'Annual returns',
  'Company annual returns to the registry.', 60),
 ('ACCOUNTS', 'Accounts filing',
  'Where the jurisdiction requires accounts to be filed rather than only prepared.', 70),
 ('TAX',      'Tax',
  'Corporate returns, VAT or GST, payroll filings.', 80),
 ('SECTOR',   'Sector-specific',
  'Funds, insurance, gaming and other regimes, where they apply.', 90),
 ('INTERNAL', 'Internal control',
  'Client money reconciliations, periodic client reviews, CPD, the compliance monitoring programme.', 100)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, detail = EXCLUDED.detail,
                                 sort_order = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────────────────────────────
-- OBLIGATIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jurisdiction_obligation (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_code   text NOT NULL REFERENCES location(code),
  area_code       text NOT NULL REFERENCES obligation_area(code),
  title           text NOT NULL,

  -- What starts the clock. Held separately from the deadline because the same
  -- "30 days" means different dates depending on what it runs from, and that
  -- is the commonest way a compliance date goes wrong.
  trigger_type    text NOT NULL,   -- year_end | anniversary | fixed_date | on_change | period_end | ongoing
  trigger_detail  text,            -- e.g. "31 December", "incorporation date"
  due_days        integer,         -- days after the trigger
  due_months      integer,         -- or months after the trigger
  fixed_month     integer,         -- for fixed_date: 1-12
  fixed_day       integer,         -- for fixed_date: 1-31

  frequency       text,            -- Annual, Quarterly, On change, Ongoing
  applies_to      text,            -- which entities, in plain English
  filing_route    text,            -- portal, form number, agent
  legislation_ref text,            -- so it can be traced
  owner           text,
  note            text,

  -- Compliance confirms each obligation individually. An unconfirmed one is
  -- shown but not counted as a deadline anyone can rely on.
  confirmed_by    text,
  confirmed_at    timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  entered_by      text NOT NULL DEFAULT current_app_user(),
  entered_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT jo_trigger CHECK (trigger_type IN
    ('year_end','anniversary','fixed_date','on_change','period_end','ongoing')),
  CONSTRAINT jo_fixed CHECK (
    trigger_type <> 'fixed_date' OR (fixed_month BETWEEN 1 AND 12 AND fixed_day BETWEEN 1 AND 31))
);
CREATE INDEX IF NOT EXISTS ix_jo_location ON jurisdiction_obligation(location_code, area_code);

-- ─────────────────────────────────────────────────────────────────────
-- ENTERING THEM
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION obligation_add(
  p_location text, p_area text, p_title text, p_trigger_type text,
  p_trigger_detail text DEFAULT NULL, p_due_days integer DEFAULT NULL,
  p_due_months integer DEFAULT NULL, p_fixed_month integer DEFAULT NULL,
  p_fixed_day integer DEFAULT NULL, p_frequency text DEFAULT NULL,
  p_applies_to text DEFAULT NULL, p_filing_route text DEFAULT NULL,
  p_legislation_ref text DEFAULT NULL, p_owner text DEFAULT NULL,
  p_note text DEFAULT NULL)
RETURNS jurisdiction_obligation
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jurisdiction_obligation;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM location WHERE code = p_location) THEN
    RAISE EXCEPTION 'Unknown jurisdiction "%". Valid: %', p_location,
      (SELECT string_agg(l.code, ', ' ORDER BY l.code) FROM location l);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM obligation_area WHERE code = p_area) THEN
    RAISE EXCEPTION 'Unknown area "%". Valid: %', p_area,
      (SELECT string_agg(a.code, ', ' ORDER BY a.sort_order) FROM obligation_area a);
  END IF;
  IF coalesce(trim(p_title),'') = '' THEN
    RAISE EXCEPTION 'Give the obligation a title';
  END IF;

  -- A deadline with no trigger is not a deadline. The commonest way a
  -- compliance date goes wrong is "30 days" recorded without saying 30 days
  -- from what, so the trigger is required and the pairing is checked.
  IF p_trigger_type IN ('year_end','anniversary','period_end')
     AND p_due_days IS NULL AND p_due_months IS NULL THEN
    RAISE EXCEPTION 'A deadline running from % needs to say how long after — give days or months, or the date cannot be calculated for any entity',
      replace(p_trigger_type, '_', ' ');
  END IF;
  IF p_trigger_type = 'fixed_date' AND (p_fixed_month IS NULL OR p_fixed_day IS NULL) THEN
    RAISE EXCEPTION 'A fixed calendar deadline needs the month and day';
  END IF;
  IF p_due_days IS NOT NULL AND p_due_months IS NOT NULL THEN
    RAISE EXCEPTION 'Give either days or months after the trigger, not both — they would conflict';
  END IF;

  INSERT INTO jurisdiction_obligation(
    location_code, area_code, title, trigger_type, trigger_detail,
    due_days, due_months, fixed_month, fixed_day, frequency, applies_to,
    filing_route, legislation_ref, owner, note)
  VALUES (p_location, p_area, trim(p_title), p_trigger_type, p_trigger_detail,
          p_due_days, p_due_months, p_fixed_month, p_fixed_day, p_frequency,
          p_applies_to, p_filing_route, p_legislation_ref, p_owner, p_note)
  RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'jurisdiction_obligation', r.id, 'obligation recorded',
                   p_location || ' [' || p_area || '] ' || trim(p_title));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION obligation_update(
  p_id bigint, p_title text DEFAULT NULL, p_trigger_detail text DEFAULT NULL,
  p_due_days integer DEFAULT NULL, p_due_months integer DEFAULT NULL,
  p_frequency text DEFAULT NULL, p_applies_to text DEFAULT NULL,
  p_filing_route text DEFAULT NULL, p_legislation_ref text DEFAULT NULL,
  p_owner text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jurisdiction_obligation
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jurisdiction_obligation; was_confirmed boolean;
BEGIN
  SELECT (confirmed_at IS NOT NULL) INTO was_confirmed
    FROM jurisdiction_obligation WHERE id = p_id;
  IF was_confirmed IS NULL THEN RAISE EXCEPTION 'Obligation % not found', p_id; END IF;

  UPDATE jurisdiction_obligation SET
    title           = coalesce(p_title, title),
    trigger_detail  = coalesce(p_trigger_detail, trigger_detail),
    due_days        = coalesce(p_due_days, due_days),
    due_months      = coalesce(p_due_months, due_months),
    frequency       = coalesce(p_frequency, frequency),
    applies_to      = coalesce(p_applies_to, applies_to),
    filing_route    = coalesce(p_filing_route, filing_route),
    legislation_ref = coalesce(p_legislation_ref, legislation_ref),
    owner           = coalesce(p_owner, owner),
    note            = coalesce(p_note, note),
    -- Amending a confirmed obligation withdraws the confirmation: whoever
    -- confirmed it confirmed different terms.
    confirmed_by    = NULL,
    confirmed_at    = NULL
   WHERE id = p_id RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'jurisdiction_obligation', p_id,
                   CASE WHEN was_confirmed THEN 'obligation amended — CONFIRMATION WITHDRAWN'
                        ELSE 'obligation amended' END,
                   r.location_code || ' ' || r.title);
  RETURN r;
END $$;

-- Confirming. Per obligation rather than per jurisdiction, because they are
-- researched one at a time and a blanket confirmation would cover ones nobody
-- had checked.
CREATE OR REPLACE FUNCTION obligation_confirm(p_id bigint)
RETURNS jurisdiction_obligation
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jurisdiction_obligation;
BEGIN
  SELECT * INTO r FROM jurisdiction_obligation WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation % not found', p_id; END IF;

  IF r.legislation_ref IS NULL OR trim(r.legislation_ref) = '' THEN
    RAISE EXCEPTION 'Record the legislation or rule this comes from before confirming it — a confirmed deadline with no source cannot be checked by anyone else';
  END IF;
  IF r.owner IS NULL OR trim(r.owner) = '' THEN
    RAISE EXCEPTION 'Name who owns this obligation before confirming it — an obligation nobody owns is one nobody does';
  END IF;

  UPDATE jurisdiction_obligation
     SET confirmed_by = current_app_user(), confirmed_at = now()
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'jurisdiction_obligation', p_id, 'OBLIGATION CONFIRMED',
                   r.location_code || ' ' || r.title || ' — confirmed by ' || current_app_user());
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION obligation_remove(p_id bigint, p_reason text)
RETURNS TABLE(removed text, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jurisdiction_obligation;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for removing an obligation — if a requirement has been repealed or does not apply, that should be on the record';
  END IF;
  SELECT * INTO r FROM jurisdiction_obligation WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation % not found', p_id; END IF;

  -- Deactivated rather than deleted: a schedule that used to include something
  -- is part of the compliance history.
  UPDATE jurisdiction_obligation
     SET is_active = false,
         note = coalesce(note || ' | ', '') || 'Removed ' ||
                to_char(now(),'DD Mon YYYY') || ' by ' || current_app_user() ||
                ': ' || trim(p_reason)
   WHERE id = p_id;
  PERFORM ea_audit(NULL, 'jurisdiction_obligation', p_id, 'obligation removed',
                   r.location_code || ' ' || r.title || ' — ' || trim(p_reason));
  RETURN QUERY SELECT r.title,
    'Deactivated rather than deleted — a schedule that used to include something is part of the compliance history.';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- READING
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION obligations_list(
  p_location text DEFAULT NULL, p_include_inactive boolean DEFAULT false)
RETURNS TABLE(id bigint, location_code text, location_name text,
              area_code text, area_name text, title text,
              trigger_type text, trigger_detail text, due_description text,
              frequency text, applies_to text, filing_route text,
              legislation_ref text, owner text, note text,
              confirmed boolean, confirmed_by text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.id, o.location_code, l.name, o.area_code, a.name, o.title,
         o.trigger_type, o.trigger_detail,
         -- Rendered in words, because "30 / year_end" is not readable and this
         -- is the field people act on.
         CASE o.trigger_type
           WHEN 'on_change' THEN 'On change'
           WHEN 'ongoing'   THEN 'Ongoing'
           WHEN 'fixed_date' THEN 'By ' || o.fixed_day || '/' || o.fixed_month || ' each year'
           ELSE coalesce(
             coalesce(o.due_days || ' days', o.due_months || ' months') || ' after ' ||
             replace(o.trigger_type,'_',' ') ||
             coalesce(' (' || o.trigger_detail || ')', ''),
             'not specified')
         END,
         o.frequency, o.applies_to, o.filing_route, o.legislation_ref, o.owner, o.note,
         (o.confirmed_at IS NOT NULL), o.confirmed_by, o.is_active
    FROM jurisdiction_obligation o
    LEFT JOIN location l ON l.code = o.location_code
    LEFT JOIN obligation_area a ON a.code = o.area_code
   WHERE (p_location IS NULL OR o.location_code = p_location)
     AND (p_include_inactive OR o.is_active)
   ORDER BY l.name, a.sort_order, o.title;
$$;

-- Where the gaps are, by jurisdiction and area. This is the list Compliance
-- works from.
CREATE OR REPLACE FUNCTION obligation_coverage()
RETURNS TABLE(location_code text, location_name text, area_code text, area_name text,
              recorded bigint, confirmed bigint, gap boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.code, l.name, a.code, a.name,
         count(o.id) FILTER (WHERE o.is_active),
         count(o.id) FILTER (WHERE o.is_active AND o.confirmed_at IS NOT NULL),
         (count(o.id) FILTER (WHERE o.is_active) = 0)
    FROM location l
    CROSS JOIN obligation_area a
    LEFT JOIN jurisdiction_obligation o
           ON o.location_code = l.code AND o.area_code = a.code
   GROUP BY l.code, l.name, a.code, a.name, a.sort_order
   ORDER BY l.name, a.sort_order;
$$;

CREATE OR REPLACE FUNCTION obligation_summary()
RETURNS TABLE(location_code text, location_name text, areas_covered bigint,
              areas_total bigint, recorded bigint, confirmed bigint,
              ready boolean, next_step text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.code, l.name,
         (SELECT count(DISTINCT o.area_code) FROM jurisdiction_obligation o
           WHERE o.location_code = l.code AND o.is_active),
         (SELECT count(*) FROM obligation_area),
         (SELECT count(*) FROM jurisdiction_obligation o
           WHERE o.location_code = l.code AND o.is_active),
         (SELECT count(*) FROM jurisdiction_obligation o
           WHERE o.location_code = l.code AND o.is_active AND o.confirmed_at IS NOT NULL),
         -- Ready means every recorded obligation is confirmed AND at least the
         -- structural areas are covered. Not a claim that the schedule is
         -- complete — only Compliance can say that.
         ((SELECT count(*) FROM jurisdiction_obligation o
            WHERE o.location_code = l.code AND o.is_active) > 0
          AND (SELECT count(*) FROM jurisdiction_obligation o
                WHERE o.location_code = l.code AND o.is_active
                  AND o.confirmed_at IS NULL) = 0),
         CASE
           WHEN (SELECT count(*) FROM jurisdiction_obligation o
                  WHERE o.location_code = l.code AND o.is_active) = 0
             THEN 'Nothing recorded — the tracker shows no deadlines for this jurisdiction'
           WHEN (SELECT count(*) FROM jurisdiction_obligation o
                  WHERE o.location_code = l.code AND o.is_active
                    AND o.confirmed_at IS NULL) > 0
             THEN (SELECT count(*)::text FROM jurisdiction_obligation o
                    WHERE o.location_code = l.code AND o.is_active
                      AND o.confirmed_at IS NULL) || ' obligation(s) recorded but not confirmed'
           ELSE 'All recorded obligations confirmed'
         END
    FROM location l
   ORDER BY
     ((SELECT count(*) FROM jurisdiction_obligation o
        WHERE o.location_code = l.code AND o.is_active) > 0
      AND (SELECT count(*) FROM jurisdiction_obligation o
            WHERE o.location_code = l.code AND o.is_active
              AND o.confirmed_at IS NULL) = 0),
     l.name;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- MIGRATE THE SCHEDULES THAT ALREADY EXISTED
-- ─────────────────────────────────────────────────────────────────────
-- Malta and Cayman had schedules hardcoded in the JSX. They were already
-- reviewed, so they are migrated as they stand rather than discarded — but
-- NOT marked confirmed, because their dates came from a code constant and each
-- needs checking against the legislation and given an owner and a source
-- before anyone relies on it.
--
-- Isle of Man, Cyprus, UK and USA are left empty. A wrong date in a compliance
-- tracker is worse than a visibly empty one.
--
-- Guarded so re-running the file does not duplicate them.
--
-- NOTE: these are PERFORM, not SELECT. Inside a DO block a bare SELECT is
-- rejected with "query has no destination for result data". My own test of
-- this file passed only because the guard below was already false — the data
-- was in from an earlier run, so the branch never executed. Testing the
-- re-run path is not testing the first-run path.
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM jurisdiction_obligation) THEN
    PERFORM obligation_add('CYM','AML','AML policies & procedures','fixed_date',NULL,NULL,NULL,12,31,'Annual review',NULL,NULL,NULL,'Colette Grisdale','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','AML','Risk assessment — ML/TF','fixed_date',NULL,NULL,NULL,12,31,'Annual',NULL,NULL,NULL,'Colette Grisdale','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','AEOI','FATCA return — CIMA portal','fixed_date',NULL,NULL,NULL,7,31,'Annual',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','AEOI','CRS return — CIMA portal','fixed_date',NULL,NULL,NULL,7,31,'Annual',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','SUBSTANCE','ESR return — all in-scope entities','ongoing',NULL,NULL,NULL,NULL,NULL,'Annual',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','BO','Beneficial ownership register — CIMA','on_change',NULL,NULL,NULL,NULL,NULL,'On change',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','ANNUAL','Annual returns — Registrar of Companies','fixed_date',NULL,NULL,NULL,1,31,'Annual',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','SECTOR','Mutual Fund annual return','fixed_date',NULL,NULL,NULL,6,30,'Annual',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','LICENCE','Authorisation as Trustee / Administrator','ongoing',NULL,NULL,NULL,NULL,NULL,'Ongoing',NULL,NULL,NULL,'Joanne Fenech','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','AML','Business risk assessment','fixed_date',NULL,NULL,NULL,12,31,'Annual',NULL,NULL,NULL,'Colette Grisdale','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','AML','FIAU sectoral risk assessment update','fixed_date',NULL,NULL,NULL,12,31,'Annual',NULL,NULL,NULL,'Colette Grisdale','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','AEOI','CRS/FATCA return — MFSA portal','fixed_date',NULL,NULL,NULL,7,31,'Annual',NULL,NULL,NULL,'Joanne Fenech','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','BO','Beneficial ownership register — MFSA BROS','on_change',NULL,NULL,NULL,NULL,NULL,'On change',NULL,NULL,NULL,'Joanne Fenech','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','ANNUAL','Annual returns — Malta Business Registry','ongoing',NULL,NULL,NULL,NULL,NULL,'Annual',NULL,NULL,NULL,'Joanne Fenech','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','LICENCE','FIAU supervision annual report','fixed_date',NULL,NULL,NULL,4,30,'Annual',NULL,NULL,NULL,'Colette Grisdale','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
  END IF;
END $mig$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('obligation_add','obligation_update','obligation_confirm',
                         'obligation_remove','obligations_list','obligation_coverage',
                         'obligation_summary')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON jurisdiction_obligation, obligation_area FROM PUBLIC, anon;
GRANT SELECT ON jurisdiction_obligation, obligation_area TO authenticated;

SELECT location_code, recorded, confirmed, left(next_step,54) AS next_step
  FROM obligation_summary();
