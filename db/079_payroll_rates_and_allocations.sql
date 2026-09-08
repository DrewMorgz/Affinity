-- =====================================================================
-- AFFINITY CORE — 079: PAYROLL RATES AND GROUP ALLOCATIONS
--
-- The rates were hardcoded in affinity_budget_model.js with a warning that
-- they were placeholders. They are not placeholders because nobody got round
-- to them — they genuinely vary, by jurisdiction and by year, and are set by
-- someone who knows rather than derived.
--
-- ── WHY EFFECTIVE-DATED RATHER THAN EDITABLE ────────────────────────
--
-- The obvious design is one row per jurisdiction that gets updated. That
-- silently rewrites history: a budget approved on last year's rates would
-- recalculate on this year's, and nobody would know which rates produced the
-- figures anyone signed off.
--
-- So a rate has an effective FROM date and is never edited in place. A new
-- rate supersedes the old one from a date, both are kept, and a calculation
-- for any period uses the rate that was in force. That also means a budget can
-- be re-run months later and produce the same numbers.
--
-- ── LOCKING AND REOPENING ───────────────────────────────────────────
--
-- Once a year's rates are agreed they are locked, so a budget cannot shift
-- under someone. Reopening is deliberate, needs a reason, and is audited —
-- because rates do change mid-year and pretending otherwise would push the
-- work into spreadsheets.
--
-- Run AFTER 078. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- PAYROLL RATES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_rate (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_code     text NOT NULL REFERENCES location(code),
  effective_from    date NOT NULL,
  -- Employer social security / national insurance
  social_pct        numeric(7,4),
  social_threshold  numeric(14,2),      -- earnings below which nothing is due
  social_cap        numeric(14,2),      -- earnings above which nothing more is due; null = uncapped
  -- Employer pension
  pension_pct       numeric(7,4),
  pension_cap       numeric(14,2),
  -- Anything else charged per head rather than as a percentage
  per_head_annual   numeric(14,2),
  per_head_note     text,
  ccy               char(3),
  source            text,               -- where the figure came from
  note              text,
  status            text NOT NULL DEFAULT 'draft',   -- draft | agreed | locked
  entered_by        text NOT NULL DEFAULT current_app_user(),
  entered_at        timestamptz NOT NULL DEFAULT now(),
  agreed_by         text,
  agreed_at         timestamptz,
  CONSTRAINT payroll_rate_status CHECK (status IN ('draft','agreed','locked')),
  UNIQUE (location_code, effective_from)
);
CREATE INDEX IF NOT EXISTS ix_payroll_rate_lookup
  ON payroll_rate(location_code, effective_from DESC);

-- ─────────────────────────────────────────────────────────────────────
-- GROUP ALLOCATIONS
-- ─────────────────────────────────────────────────────────────────────
-- What share of a central cost each entity bears. Effective-dated for the same
-- reason, and constrained to sum to 100% per set, because an allocation that
-- does not add up quietly loses or duplicates cost.
CREATE TABLE IF NOT EXISTS allocation_set (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL,
  basis          text,                  -- headcount, revenue, fee income, agreed
  effective_from date NOT NULL,
  status         text NOT NULL DEFAULT 'draft',
  note           text,
  entered_by     text NOT NULL DEFAULT current_app_user(),
  entered_at     timestamptz NOT NULL DEFAULT now(),
  agreed_by      text,
  agreed_at      timestamptz,
  CONSTRAINT allocation_set_status CHECK (status IN ('draft','agreed','locked')),
  UNIQUE (name, effective_from)
);

CREATE TABLE IF NOT EXISTS allocation_line (
  set_id     bigint NOT NULL REFERENCES allocation_set(id) ON DELETE CASCADE,
  entity_id  bigint NOT NULL REFERENCES entity(id),
  pct        numeric(7,4) NOT NULL,
  note       text,
  PRIMARY KEY (set_id, entity_id),
  CONSTRAINT allocation_line_pct CHECK (pct >= 0 AND pct <= 100)
);

-- ─────────────────────────────────────────────────────────────────────
-- ENTERING RATES
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION payroll_rate_set(
  p_location text, p_effective_from date,
  p_social_pct numeric DEFAULT NULL, p_social_threshold numeric DEFAULT NULL,
  p_social_cap numeric DEFAULT NULL, p_pension_pct numeric DEFAULT NULL,
  p_pension_cap numeric DEFAULT NULL, p_per_head_annual numeric DEFAULT NULL,
  p_per_head_note text DEFAULT NULL, p_ccy char(3) DEFAULT NULL,
  p_source text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS payroll_rate LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payroll_rate; existing payroll_rate;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM location WHERE code = p_location) THEN
    RAISE EXCEPTION 'Unknown location "%". Valid: %', p_location,
      (SELECT string_agg(l.code, ', ' ORDER BY l.code) FROM location l);
  END IF;

  -- Percentages are entered as percentages, not fractions. 12.8 not 0.128.
  --
  -- The hardcoded values in the old budget model were FRACTIONS (0.128), so
  -- anyone copying them across would enter a rate a hundred times too small
  -- and every payroll figure would be wrong by that factor — quietly, because
  -- the result still looks like money.
  --
  -- A range check of 0 to 100 does not catch it: 0.128 is inside the range. A
  -- first version of this check let it through. So a value strictly between
  -- zero and one is refused: no employer social security or pension rate in
  -- these six jurisdictions is under 1%, and a fraction is far more likely
  -- than a real sub-1% rate.
  IF p_social_pct IS NOT NULL THEN
    IF p_social_pct < 0 OR p_social_pct > 100 THEN
      RAISE EXCEPTION 'Social security must be between 0 and 100 percent';
    END IF;
    IF p_social_pct > 0 AND p_social_pct < 1 THEN
      RAISE EXCEPTION 'A social security rate of % looks like a fraction rather than a percentage. Enter 12.8 for 12.8%%, not 0.128. If the rate really is nil, enter 0.',
        p_social_pct;
    END IF;
  END IF;
  IF p_pension_pct IS NOT NULL THEN
    IF p_pension_pct < 0 OR p_pension_pct > 100 THEN
      RAISE EXCEPTION 'Pension must be between 0 and 100 percent';
    END IF;
    IF p_pension_pct > 0 AND p_pension_pct < 1 THEN
      RAISE EXCEPTION 'A pension rate of % looks like a fraction rather than a percentage. Enter 5 for 5%%, not 0.05. If the rate really is nil, enter 0.',
        p_pension_pct;
    END IF;
  END IF;
  IF p_social_cap IS NOT NULL AND p_social_threshold IS NOT NULL
     AND p_social_cap < p_social_threshold THEN
    RAISE EXCEPTION 'The cap (%) is below the threshold (%) — nothing would ever be due',
      p_social_cap, p_social_threshold;
  END IF;

  SELECT * INTO existing FROM payroll_rate
   WHERE location_code = p_location AND effective_from = p_effective_from;

  -- A locked rate is not edited. Superseding it from a later date is the
  -- route, so what was used for a past period stays what was used.
  IF existing.id IS NOT NULL AND existing.status = 'locked' THEN
    RAISE EXCEPTION 'The rates for % from % are locked. Enter a new rate effective from a later date rather than changing this one — a budget approved on these figures must still produce them.',
      p_location, p_effective_from;
  END IF;

  INSERT INTO payroll_rate(location_code, effective_from, social_pct, social_threshold,
                           social_cap, pension_pct, pension_cap, per_head_annual,
                           per_head_note, ccy, source, note)
  VALUES (p_location, p_effective_from, p_social_pct, p_social_threshold,
          p_social_cap, p_pension_pct, p_pension_cap, p_per_head_annual,
          p_per_head_note, p_ccy, p_source, p_note)
  ON CONFLICT (location_code, effective_from) DO UPDATE SET
    social_pct = EXCLUDED.social_pct, social_threshold = EXCLUDED.social_threshold,
    social_cap = EXCLUDED.social_cap, pension_pct = EXCLUDED.pension_pct,
    pension_cap = EXCLUDED.pension_cap, per_head_annual = EXCLUDED.per_head_annual,
    per_head_note = EXCLUDED.per_head_note, ccy = EXCLUDED.ccy,
    source = EXCLUDED.source, note = EXCLUDED.note,
    status = 'draft', entered_by = current_app_user(), entered_at = now(),
    agreed_by = NULL, agreed_at = NULL
  RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'payroll_rate', r.id,
                   CASE WHEN existing.id IS NULL THEN 'payroll rates entered'
                        ELSE 'payroll rates amended' END,
                   p_location || ' from ' || p_effective_from ||
                   ': social ' || coalesce(p_social_pct::text,'—') || '%' ||
                   ', pension ' || coalesce(p_pension_pct::text,'—') || '%');
  RETURN r;
END $$;

-- Agreeing, then locking. Two steps, because agreeing is a judgement and
-- locking is a decision to stop it moving.
CREATE OR REPLACE FUNCTION payroll_rate_agree(p_id bigint)
RETURNS payroll_rate LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payroll_rate;
BEGIN
  SELECT * INTO r FROM payroll_rate WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll rate % not found', p_id; END IF;
  IF r.status = 'locked' THEN RAISE EXCEPTION 'Those rates are already locked'; END IF;
  IF r.social_pct IS NULL AND r.pension_pct IS NULL AND r.per_head_annual IS NULL THEN
    RAISE EXCEPTION 'There are no figures to agree — enter at least one rate first';
  END IF;

  UPDATE payroll_rate SET status = 'agreed', agreed_by = current_app_user(),
         agreed_at = now()
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'payroll_rate', p_id, 'payroll rates agreed',
                   r.location_code || ' from ' || r.effective_from);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION payroll_rate_lock(p_id bigint)
RETURNS payroll_rate LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payroll_rate;
BEGIN
  SELECT * INTO r FROM payroll_rate WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll rate % not found', p_id; END IF;
  IF r.status <> 'agreed' THEN
    RAISE EXCEPTION 'Rates must be agreed before they are locked — this set is %', r.status;
  END IF;

  UPDATE payroll_rate SET status = 'locked' WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'payroll_rate', p_id, 'PAYROLL RATES LOCKED',
                   r.location_code || ' from ' || r.effective_from ||
                   ' — budgets will not shift under anyone');
  RETURN r;
END $$;

-- Reopening. Needs a reason, and the reason is kept — rates do change
-- mid-year, and refusing outright would push the work into spreadsheets, which
-- is worse than a reopening that is recorded.
CREATE OR REPLACE FUNCTION payroll_rate_reopen(p_id bigint, p_reason text)
RETURNS payroll_rate LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payroll_rate;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for reopening locked rates — anything already budgeted on them may change';
  END IF;
  SELECT * INTO r FROM payroll_rate WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll rate % not found', p_id; END IF;
  IF r.status <> 'locked' THEN
    RAISE EXCEPTION 'Those rates are % and do not need reopening', r.status;
  END IF;

  UPDATE payroll_rate
     SET status = 'draft', agreed_by = NULL, agreed_at = NULL,
         note = coalesce(note || ' | ', '') || 'Reopened ' ||
                to_char(now(),'DD Mon YYYY') || ' by ' || current_app_user() ||
                ': ' || trim(p_reason)
   WHERE id = p_id RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'payroll_rate', p_id, 'PAYROLL RATES REOPENED',
                   r.location_code || ' from ' || r.effective_from || ' — ' || trim(p_reason));
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- READING THE RATE THAT WAS IN FORCE
-- ─────────────────────────────────────────────────────────────────────
-- The point of the whole design: a calculation asks for the rate at a date and
-- gets the one that applied, not the newest.
CREATE OR REPLACE FUNCTION payroll_rate_at(p_location text, p_at date)
RETURNS payroll_rate LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM payroll_rate
   WHERE location_code = p_location AND effective_from <= p_at
   ORDER BY effective_from DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION payroll_rates_list(p_location text DEFAULT NULL)
RETURNS TABLE(id bigint, location_code text, location_name text, effective_from date,
              social_pct numeric, social_threshold numeric, social_cap numeric,
              pension_pct numeric, per_head_annual numeric, ccy char(3),
              status text, source text, note text,
              entered_by text, agreed_by text, superseded_from date, in_force boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id, r.location_code, l.name, r.effective_from,
         r.social_pct, r.social_threshold, r.social_cap,
         r.pension_pct, r.per_head_annual, r.ccy,
         r.status, r.source, r.note, r.entered_by, r.agreed_by,
         -- When a later rate takes over, so history reads as a sequence rather
         -- than a pile of rows.
         (SELECT min(r2.effective_from) FROM payroll_rate r2
           WHERE r2.location_code = r.location_code
             AND r2.effective_from > r.effective_from),
         (r.effective_from <= current_date
          AND NOT EXISTS (SELECT 1 FROM payroll_rate r3
                           WHERE r3.location_code = r.location_code
                             AND r3.effective_from > r.effective_from
                             AND r3.effective_from <= current_date))
    FROM payroll_rate r
    LEFT JOIN location l ON l.code = r.location_code
   WHERE p_location IS NULL OR r.location_code = p_location
   ORDER BY l.name, r.effective_from DESC;
$$;

-- Which jurisdictions have no rates at all. A budget for one of those is
-- running on nothing, and a blank is easy to miss.
CREATE OR REPLACE FUNCTION payroll_rate_gaps()
RETURNS TABLE(location_code text, location_name text, has_rates boolean,
              latest_effective date, latest_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.code, l.name,
         EXISTS (SELECT 1 FROM payroll_rate r WHERE r.location_code = l.code),
         (SELECT max(r.effective_from) FROM payroll_rate r WHERE r.location_code = l.code),
         (SELECT r.status FROM payroll_rate r WHERE r.location_code = l.code
           ORDER BY r.effective_from DESC LIMIT 1)
    FROM location l
   ORDER BY EXISTS (SELECT 1 FROM payroll_rate r WHERE r.location_code = l.code), l.name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- ALLOCATIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION allocation_set_create(
  p_name text, p_effective_from date, p_basis text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS allocation_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r allocation_set;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN
    RAISE EXCEPTION 'Give the allocation a name — "Central overhead" or similar';
  END IF;
  INSERT INTO allocation_set(name, basis, effective_from, note)
  VALUES (trim(p_name), p_basis, p_effective_from, p_note)
  ON CONFLICT (name, effective_from) DO UPDATE SET
    basis = EXCLUDED.basis, note = EXCLUDED.note, status = 'draft',
    entered_by = current_app_user(), entered_at = now(),
    agreed_by = NULL, agreed_at = NULL
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION allocation_line_set(
  p_set bigint, p_entity bigint, p_pct numeric, p_note text DEFAULT NULL)
RETURNS TABLE(entity_name text, pct numeric, set_total numeric, balanced boolean, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE st text; tot numeric;
BEGIN
  SELECT s.status INTO st FROM allocation_set s WHERE s.id = p_set;
  IF st IS NULL THEN RAISE EXCEPTION 'Allocation set % not found', p_set; END IF;
  IF st = 'locked' THEN
    RAISE EXCEPTION 'That allocation is locked. Create a new one effective from a later date rather than changing this one.';
  END IF;
  IF p_pct < 0 OR p_pct > 100 THEN
    RAISE EXCEPTION 'A share must be between 0 and 100 percent';
  END IF;

  INSERT INTO allocation_line(set_id, entity_id, pct, note)
  VALUES (p_set, p_entity, p_pct, p_note)
  ON CONFLICT (set_id, entity_id) DO UPDATE SET pct = EXCLUDED.pct, note = EXCLUDED.note;

  SELECT round(coalesce(sum(al.pct),0),4) INTO tot
    FROM allocation_line al WHERE al.set_id = p_set;

  -- Reported rather than enforced on each line: an allocation is built up one
  -- entity at a time and would be unbuildable if every intermediate state had
  -- to total 100. Agreeing it is where the total is enforced.
  RETURN QUERY SELECT (SELECT e.name FROM entity e WHERE e.id = p_entity),
                      p_pct, tot, (tot = 100),
                      CASE WHEN tot = 100 THEN 'The allocation totals 100%.'
                           WHEN tot < 100 THEN round(100 - tot,4) || '% is still unallocated — that share of the cost would be borne by nobody.'
                           ELSE round(tot - 100,4) || '% over — that share would be charged twice.' END;
END $$;

CREATE OR REPLACE FUNCTION allocation_set_agree(p_set bigint)
RETURNS allocation_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r allocation_set; tot numeric; n int;
BEGIN
  SELECT * INTO r FROM allocation_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allocation set % not found', p_set; END IF;

  SELECT count(*), round(coalesce(sum(al.pct),0),4) INTO n, tot
    FROM allocation_line al WHERE al.set_id = p_set;
  IF n = 0 THEN RAISE EXCEPTION 'There are no entities in that allocation'; END IF;

  -- Enforced here. An allocation that does not total 100 loses or duplicates
  -- cost, and it is not obvious in the resulting figures which happened.
  IF tot <> 100 THEN
    RAISE EXCEPTION 'The allocation totals %%%, not 100%%. %',
      tot,
      CASE WHEN tot < 100 THEN round(100-tot,4) || '% of the cost would be borne by nobody.'
           ELSE round(tot-100,4) || '% would be charged twice.' END;
  END IF;

  UPDATE allocation_set SET status = 'agreed', agreed_by = current_app_user(),
         agreed_at = now()
   WHERE id = p_set RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'allocation_set', p_set, 'allocation agreed',
                   r.name || ' from ' || r.effective_from || ' across ' || n || ' entities');
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION allocation_set_lock(p_set bigint)
RETURNS allocation_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r allocation_set;
BEGIN
  SELECT * INTO r FROM allocation_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allocation set % not found', p_set; END IF;
  IF r.status <> 'agreed' THEN
    RAISE EXCEPTION 'An allocation must be agreed before it is locked — this one is %', r.status;
  END IF;
  UPDATE allocation_set SET status = 'locked' WHERE id = p_set RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'allocation_set', p_set, 'ALLOCATION LOCKED', r.name);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION allocation_set_reopen(p_set bigint, p_reason text)
RETURNS allocation_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r allocation_set;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for reopening a locked allocation — anything already budgeted on it may change';
  END IF;
  SELECT * INTO r FROM allocation_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allocation set % not found', p_set; END IF;
  IF r.status <> 'locked' THEN
    RAISE EXCEPTION 'That allocation is % and does not need reopening', r.status;
  END IF;

  UPDATE allocation_set
     SET status = 'draft', agreed_by = NULL, agreed_at = NULL,
         note = coalesce(note || ' | ', '') || 'Reopened ' ||
                to_char(now(),'DD Mon YYYY') || ' by ' || current_app_user() ||
                ': ' || trim(p_reason)
   WHERE id = p_set RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'allocation_set', p_set, 'ALLOCATION REOPENED',
                   r.name || ' — ' || trim(p_reason));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION allocations_list()
RETURNS TABLE(id bigint, name text, basis text, effective_from date, status text,
              entities bigint, total_pct numeric, balanced boolean,
              entered_by text, agreed_by text, note text, in_force boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.name, s.basis, s.effective_from, s.status,
         (SELECT count(*) FROM allocation_line al WHERE al.set_id = s.id),
         (SELECT round(coalesce(sum(al.pct),0),4) FROM allocation_line al WHERE al.set_id = s.id),
         ((SELECT round(coalesce(sum(al.pct),0),4) FROM allocation_line al WHERE al.set_id = s.id) = 100),
         s.entered_by, s.agreed_by, s.note,
         (s.effective_from <= current_date
          AND NOT EXISTS (SELECT 1 FROM allocation_set s2
                           WHERE s2.name = s.name AND s2.effective_from > s.effective_from
                             AND s2.effective_from <= current_date))
    FROM allocation_set s
   ORDER BY s.name, s.effective_from DESC;
$$;

CREATE OR REPLACE FUNCTION allocation_lines(p_set bigint)
RETURNS TABLE(entity_id bigint, entity_name text, company_code text, pct numeric, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT al.entity_id, e.name, e.company_code, al.pct, al.note
    FROM allocation_line al LEFT JOIN entity e ON e.id = al.entity_id
   WHERE al.set_id = p_set
   ORDER BY al.pct DESC, e.name;
$$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'payroll_rate%' OR p.proname LIKE 'allocation%'
            OR p.proname = 'allocations_list')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON payroll_rate, allocation_set, allocation_line FROM PUBLIC, anon;
GRANT SELECT ON payroll_rate, allocation_set, allocation_line TO authenticated;

SELECT location_code, location_name, has_rates, latest_status
  FROM payroll_rate_gaps();
