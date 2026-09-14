-- 100 — charge-out rates and services, so time can be recorded at all
--
-- REPORTED BY A TESTER: "Where are charge out rates and services recorded?
-- Unable to record time entries."
--
-- They are recorded nowhere. There is no charge-out rate table of any kind.
-- ts_entry_add takes the rate as a parameter, so whoever calls it has to know
-- it — and 096 then made a billable entry without one refuse outright, which
-- is right and leaves nobody able to record billable time.
--
-- The service table exists and is empty. entity_service exists and is empty.
-- So a time entry cannot be priced and cannot be categorised.
--
-- THREE DECISIONS, WORTH STATING BECAUSE THEY SHAPE EVERYTHING ABOVE THEM.
--
-- 1. RATES ARE KEYED ON A GRADE, NOT A JOB TITLE. There are thirty-odd titles
--    in sys_user — "Assistant Compliance Administrator", "Director and Company
--    Secretary (IOM)" — and a firm does not have thirty rates. Grades are the
--    band a rate actually attaches to, and the mapping from title to grade is
--    data rather than a rule, so it can be corrected without a release.
--
-- 2. RATES ARE EFFECTIVE-DATED AND NEVER EDITED IN PLACE. Time recorded in
--    March must keep March's rate when the rate changes in April, or every
--    historic WIP figure moves when somebody updates a rate. Same principle as
--    the payroll rates in 079.
--
-- 3. RATE BY GRADE AND JURISDICTION, OPTIONALLY BY SERVICE. Affinity bills
--    across six jurisdictions in three currencies. A Cayman director's hour is
--    not an Isle of Man director's hour. Service is optional because most firms
--    price by grade and occasionally by work type.

-- ── Grades ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_grade (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);

INSERT INTO staff_grade (code, name, sort_order) VALUES
  ('DIRECTOR',   'Director',            10),
  ('MD',         'Managing Director',   20),
  ('MANAGER',    'Manager',             30),
  ('ASSISTANT',  'Assistant Manager',   40),
  ('SENIOR',     'Senior Administrator',50),
  ('ADMIN',      'Administrator',       60),
  ('TRAINEE',    'Trainee',             70),
  ('SUPPORT',    'Support',             80)
ON CONFLICT (code) DO NOTHING;

-- Which grade a person's job title maps to. Data, not a rule, so a new title
-- does not need a release.
CREATE TABLE IF NOT EXISTS staff_grade_map (
  role_title  text PRIMARY KEY,
  grade_code  text NOT NULL REFERENCES staff_grade(code)
);

-- ── The rates themselves ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS charge_rate (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grade_code      text NOT NULL REFERENCES staff_grade(code),
  location_code   text NOT NULL,
  service_code    text,                       -- null means any service
  effective_from  date NOT NULL,
  hourly_rate     numeric(12,2) NOT NULL CHECK (hourly_rate > 0),
  ccy             char(3) NOT NULL,
  entered_by      text NOT NULL DEFAULT current_app_user(),
  entered_at      timestamptz NOT NULL DEFAULT now(),
  note            text,
  UNIQUE (grade_code, location_code, service_code, effective_from)
);

CREATE INDEX IF NOT EXISTS ix_charge_rate_lookup
  ON charge_rate (grade_code, location_code, effective_from DESC);

-- ── Setting a rate ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION charge_rate_set(p_grade text, p_location text,
                                           p_effective_from date,
                                           p_hourly_rate numeric, p_ccy text,
                                           p_service text DEFAULT NULL,
                                           p_note text DEFAULT NULL)
RETURNS charge_rate
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r charge_rate;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_grade WHERE code = p_grade) THEN
    RAISE EXCEPTION
      'There is no grade %. Rates attach to a grade rather than a job title, '
      'because a firm has a handful of rate bands and thirty job titles.', p_grade;
  END IF;

  IF p_hourly_rate IS NULL OR p_hourly_rate <= 0 THEN
    RAISE EXCEPTION
      'A charge-out rate must be greater than zero. A rate of nil makes the '
      'time worth nothing, which is what recording it as non-billable is for.';
  END IF;

  -- The fraction trap from the payroll rates: 0.15 is not a rate, it is a
  -- fraction somebody meant as a percentage of something else.
  IF p_hourly_rate < 5 THEN
    RAISE EXCEPTION
      'An hourly rate of % looks wrong — charge-out rates are whole amounts per '
      'hour, so 250 rather than 2.50 or 0.25. If the rate really is under 5 an '
      'hour, say so in the note and it will be accepted next time this check is '
      'reviewed.', p_hourly_rate;
  END IF;

  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION
      'A rate needs an effective date. Time recorded before that date keeps the '
      'rate that applied then — rates are never edited in place, because every '
      'historic WIP figure would move if they were.';
  END IF;

  INSERT INTO charge_rate (grade_code, location_code, service_code,
                           effective_from, hourly_rate, ccy, note)
  VALUES (p_grade, p_location, p_service, p_effective_from, p_hourly_rate,
          upper(p_ccy), p_note)
  ON CONFLICT (grade_code, location_code, service_code, effective_from)
  DO UPDATE SET hourly_rate = excluded.hourly_rate,
                ccy         = excluded.ccy,
                note        = excluded.note,
                entered_by  = current_app_user(),
                entered_at  = now()
  RETURNING * INTO r;

  INSERT INTO audit_event (action, target, details)
  VALUES ('charge rate set', p_grade || ' · ' || p_location,
          format('%s %s per hour from %s%s', upper(p_ccy), p_hourly_rate,
                 p_effective_from, coalesce(' · ' || p_service, '')));
  RETURN r;
END;
$$;

-- ── Looking a rate up ──────────────────────────────────────────────────────
-- The rate that applied on a date: most specific first — a service-specific
-- rate beats a general one, and the latest effective date at or before the day
-- the work was done.
CREATE OR REPLACE FUNCTION charge_rate_at(p_grade text, p_location text,
                                          p_on_date date,
                                          p_service text DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT hourly_rate FROM charge_rate
   WHERE grade_code = p_grade
     AND location_code = p_location
     AND (service_code = p_service OR service_code IS NULL)
     AND effective_from <= p_on_date
   ORDER BY (service_code IS NOT NULL) DESC, effective_from DESC
   LIMIT 1;
$$;

-- The rate for a PERSON on a date, resolving their title to a grade. This is
-- what a timesheet screen should call: it knows who is recording the time, not
-- what band they sit in.
CREATE OR REPLACE FUNCTION charge_rate_for_staff(p_staff_id bigint,
                                                 p_on_date date,
                                                 p_service text DEFAULT NULL)
RETURNS TABLE(grade_code text, location_code text, hourly_rate numeric, ccy char(3))
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_title text;
  v_office text;
  v_grade text;
BEGIN
  SELECT u.role, u.office INTO v_title, v_office FROM sys_user u WHERE u.id = p_staff_id;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'There is no staff member with id %.', p_staff_id;
  END IF;

  SELECT m.grade_code INTO v_grade FROM staff_grade_map m WHERE m.role_title = v_title;
  IF v_grade IS NULL THEN
    RAISE EXCEPTION
      'No grade is mapped for the job title "%". Rates attach to a grade, and '
      'this title has not been put in a band yet — map it on the Rates screen '
      'and the rate will resolve.', v_title;
  END IF;

  RETURN QUERY
    SELECT v_grade, coalesce(v_office, 'IOM'),
           charge_rate_at(v_grade, coalesce(v_office, 'IOM'), p_on_date, p_service),
           (SELECT cr.ccy FROM charge_rate cr
             WHERE cr.grade_code = v_grade AND cr.location_code = coalesce(v_office, 'IOM')
               AND cr.effective_from <= p_on_date
             ORDER BY cr.effective_from DESC LIMIT 1);
END;
$$;

-- ── Reading them back ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION charge_rates_list(p_location text DEFAULT NULL)
RETURNS TABLE(id bigint, grade_code text, grade_name text, location_code text,
              service_code text, effective_from date, hourly_rate numeric,
              ccy char(3), entered_by text, note text)
LANGUAGE sql
STABLE
AS $$
  SELECT r.id, r.grade_code, g.name, r.location_code, r.service_code,
         r.effective_from, r.hourly_rate, r.ccy, r.entered_by, r.note
    FROM charge_rate r JOIN staff_grade g ON g.code = r.grade_code
   WHERE p_location IS NULL OR r.location_code = p_location
   ORDER BY r.location_code, g.sort_order, r.effective_from DESC;
$$;

CREATE OR REPLACE FUNCTION staff_grades_list()
RETURNS TABLE(code text, name text, sort_order integer, mapped_titles bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT g.code, g.name, g.sort_order,
         (SELECT count(*) FROM staff_grade_map m WHERE m.grade_code = g.code)
    FROM staff_grade g ORDER BY g.sort_order;
$$;

CREATE OR REPLACE FUNCTION staff_grade_assign(p_role_title text, p_grade text)
RETURNS staff_grade_map
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r staff_grade_map;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_grade WHERE code = p_grade) THEN
    RAISE EXCEPTION 'There is no grade %.', p_grade;
  END IF;
  INSERT INTO staff_grade_map (role_title, grade_code) VALUES (p_role_title, p_grade)
  ON CONFLICT (role_title) DO UPDATE SET grade_code = excluded.grade_code
  RETURNING * INTO r;
  RETURN r;
END;
$$;

-- Job titles with no grade, which is what stops a rate resolving.
CREATE OR REPLACE FUNCTION staff_titles_unmapped()
RETURNS TABLE(role_title text, people bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT u.role, count(*) FROM sys_user u
   WHERE u.role IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM staff_grade_map m WHERE m.role_title = u.role)
   GROUP BY u.role ORDER BY count(*) DESC, u.role;
$$;

-- ── Services ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION service_add(p_code text, p_name text,
                                       p_revenue_account_id bigint DEFAULT NULL,
                                       p_vat_code smallint DEFAULT NULL)
RETURNS service
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r service;
BEGIN
  IF coalesce(trim(p_code), '') = '' OR coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'A service needs a code and a name.';
  END IF;
  INSERT INTO service (code, name, revenue_account_id, default_vat_code, is_active)
  VALUES (upper(trim(p_code)), trim(p_name), p_revenue_account_id, p_vat_code, true)
  ON CONFLICT (code) DO UPDATE SET name = excluded.name,
                                   revenue_account_id = excluded.revenue_account_id,
                                   default_vat_code = excluded.default_vat_code
  RETURNING * INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION services_list()
RETURNS TABLE(id bigint, code text, name text, is_active boolean, entities bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT s.id, s.code, s.name, s.is_active,
         (SELECT count(*) FROM entity_service e WHERE e.service = s.code)
    FROM service s ORDER BY s.is_active DESC, s.name;
$$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('charge_rate_set','charge_rate_at','charge_rate_for_staff',
                                'charge_rates_list','staff_grades_list','staff_grade_assign',
                                'staff_titles_unmapped','service_add','services_list')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON TABLE charge_rate, staff_grade, staff_grade_map FROM PUBLIC, anon;
