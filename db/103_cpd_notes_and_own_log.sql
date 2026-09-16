-- 103 — a note on a CPD entry, and a person's own log
--
-- REPORTED: "CPD log only categories should be structured or general with
-- another box to type notes", and "the individual staff member should also be
-- able to review their own CPD log."
--
-- STRUCTURED AND GENERAL is the distinction the professional bodies actually
-- make. STEP, ICAEW and the IOMFSA all count structured hours separately from
-- general ones, and that split is what a CPD return asks for. Compliance,
-- Technical, Regulatory, Ethics and Leadership are subject matter rather than
-- category, and subject matter belongs in a note where somebody can write what
-- the training actually was — "AML/CFT annual update, delivered by X" tells a
-- regulator more than the word "Compliance".
--
-- The existing category values are left alone rather than migrated. An entry
-- recorded last year as "Technical" was recorded as that, and rewriting history
-- to match a new list is how a CPD log stops being evidence of anything.

ALTER TABLE cpd_entry ADD COLUMN IF NOT EXISTS note text;

-- DROP THE OLD SIGNATURE FIRST. Adding a parameter creates an OVERLOAD rather
-- than replacing the function, so cpd_add(text,text,text,numeric,date) would
-- sit alongside the new six-argument one — and an old caller would keep hitting
-- the version that silently discards the note.
--
-- That is the same duplicate-function fault this audit has removed three times
-- elsewhere, and I created it here by not thinking about it. Caught because the
-- test counted the overloads rather than assuming the replacement took.
DROP FUNCTION IF EXISTS cpd_add(text, text, text, numeric, date);

CREATE OR REPLACE FUNCTION cpd_add(p_staff text, p_activity text,
                                   p_category text, p_hours numeric,
                                   p_date date, p_note text DEFAULT NULL)
RETURNS cpd_entry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r cpd_entry;
BEGIN
  IF coalesce(trim(p_activity), '') = '' THEN
    RAISE EXCEPTION 'A CPD entry needs an activity — what the training was.';
  END IF;

  IF p_hours IS NULL OR p_hours <= 0 THEN
    RAISE EXCEPTION
      'A CPD entry needs hours greater than zero. An entry with no hours counts '
      'towards nothing, which is the same as not recording it.';
  END IF;

  IF p_hours > 24 THEN
    RAISE EXCEPTION 'Cannot record more than 24 hours of CPD in one entry.';
  END IF;

  INSERT INTO cpd_entry (staff_name, activity, category, hours, entry_date, note)
  VALUES (coalesce(nullif(trim(p_staff), ''), current_app_user()),
          trim(p_activity), coalesce(nullif(trim(p_category), ''), 'General'),
          p_hours, coalesce(p_date, current_date), nullif(trim(p_note), ''))
  RETURNING * INTO r;
  RETURN r;
END;
$$;

-- DROP BEFORE REPLACING, for the same reason as cpd_add above and for the
-- third time in this build: CREATE OR REPLACE cannot change a function's
-- return type, so adding the note column to the returned table is REJECTED and
-- the old function stays in place. 095 and 096 both shipped fixes that did not
-- apply for exactly this reason. Here it was caught because the test read a
-- note back rather than trusting that the file ran.
DROP FUNCTION IF EXISTS cpd_list();

CREATE OR REPLACE FUNCTION cpd_list()
RETURNS TABLE(id bigint, staff_name text, activity text, category text,
              hours numeric, entry_date date, verified boolean, note text)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.staff_name, c.activity, c.category, c.hours, c.entry_date,
         c.verified, c.note
    FROM cpd_entry c ORDER BY c.entry_date DESC, c.id DESC;
$$;

-- ── A person's own log ─────────────────────────────────────────────────────
-- "The individual staff member should also be able to review their own CPD
-- log." Their own, and the total that matters to them: structured hours against
-- general, because that is the split a CPD return asks for.
CREATE OR REPLACE FUNCTION cpd_my_log(p_staff text DEFAULT NULL)
RETURNS TABLE(id bigint, activity text, category text, hours numeric,
              entry_date date, verified boolean, note text)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.activity, c.category, c.hours, c.entry_date, c.verified, c.note
    FROM cpd_entry c
   WHERE lower(c.staff_name) = lower(coalesce(p_staff, current_app_user()))
   ORDER BY c.entry_date DESC, c.id DESC;
$$;

CREATE OR REPLACE FUNCTION cpd_my_summary(p_staff text DEFAULT NULL,
                                          p_year integer DEFAULT NULL)
RETURNS TABLE(staff_name text, year integer, structured_hours numeric,
              general_hours numeric, total_hours numeric, entries bigint,
              unverified bigint)
LANGUAGE sql STABLE AS $$
  SELECT coalesce(p_staff, current_app_user()),
         coalesce(p_year, extract(year FROM current_date)::integer),
         coalesce(sum(c.hours) FILTER (WHERE lower(c.category) = 'structured'), 0),
         coalesce(sum(c.hours) FILTER (WHERE lower(c.category) <> 'structured'), 0),
         coalesce(sum(c.hours), 0),
         count(*),
         count(*) FILTER (WHERE NOT coalesce(c.verified, false))
    FROM cpd_entry c
   WHERE lower(c.staff_name) = lower(coalesce(p_staff, current_app_user()))
     AND extract(year FROM c.entry_date)
         = coalesce(p_year, extract(year FROM current_date)::integer);
$$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('cpd_add','cpd_list','cpd_my_log','cpd_my_summary')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
