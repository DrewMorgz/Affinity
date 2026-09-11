-- 095 — a missing FX rate is a gap, not a rate of zero
--
-- FOUND BY READING THE CONSOLIDATION ARITHMETIC.
--
-- consolidated_cta computed the translation adjustment as:
--
--     cta := round(v_na * (COALESCE(v_c,0) - COALESCE(v_o,0)), 2)
--
-- COALESCE(rate, 0). If the closing rate is missing it is treated as zero, and
-- the currency translation adjustment becomes net assets multiplied by the
-- negative of the opening rate. If the opening rate is missing, net assets
-- multiplied by the closing rate.
--
-- On a subsidiary with a million dollars of net assets, opening 0.79 and
-- closing 0.81:
--
--     correct CTA                  20,000
--     closing rate missing       -790,000
--     opening rate missing        810,000
--
-- All three are plausible magnitudes for a group translation adjustment. The
-- wrong ones arrive silently, in a figure that goes to the consolidated
-- reserves, and nothing anywhere says a rate was absent.
--
-- This is the quietest class of error in the whole system: not a refusal, not a
-- blank, not a crash — a number of the right shape and the wrong value. It is
-- worse than a failure because a failure gets investigated.
--
-- A MISSING RATE IS A REFERENCE-DATA GAP. The right response is to say so and
-- stop, naming the currency and the date so somebody can load it. Treating it
-- as zero is the system guessing, and it guesses badly.

CREATE OR REPLACE FUNCTION consolidated_cta(p_group bigint,
                                            p_opening_date date,
                                            p_closing_date date)
RETURNS TABLE(entity_id bigint, entity_name text, functional_ccy text,
              net_assets_func numeric, opening_rate numeric,
              closing_rate numeric, cta numeric)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  g      consol_group%ROWTYPE;
  m      record;
  v_func text;
  v_name text;
  v_na   numeric;
  v_o    numeric;
  v_c    numeric;
BEGIN
  SELECT * INTO g FROM consol_group WHERE id = p_group;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consolidation group % not found', p_group;
  END IF;

  FOR m IN SELECT cgm.entity_id FROM consol_group_member cgm
            WHERE cgm.group_id = p_group LOOP

    SELECT e.functional_ccy, e.name INTO v_func, v_name
      FROM entity e WHERE e.id = m.entity_id;

    -- Same currency as the group: no translation difference to compute.
    IF v_func = g.reporting_ccy THEN CONTINUE; END IF;

    v_na := entity_net_assets(m.entity_id, p_closing_date);

    SELECT f.rate INTO v_o FROM fx_lookup(v_func, g.reporting_ccy, p_opening_date) f;
    SELECT f.rate INTO v_c FROM fx_lookup(v_func, g.reporting_ccy, p_closing_date) f;

    -- ── The check that was a COALESCE to zero ──────────────────────────────
    IF v_o IS NULL THEN
      RAISE EXCEPTION
        'No % to % rate for %, which is the opening date for this '
        'consolidation. % holds % in net assets, and without the opening rate '
        'its translation adjustment cannot be computed — treating the missing '
        'rate as zero would report roughly % instead, which looks like a real '
        'figure. Load the rate and run it again.',
        v_func, g.reporting_ccy, p_opening_date, v_name, round(v_na, 2),
        round(v_na * coalesce(v_c, 0), 2);
    END IF;

    IF v_c IS NULL THEN
      RAISE EXCEPTION
        'No % to % rate for %, which is the closing date for this '
        'consolidation. % holds % in net assets, and treating the missing rate '
        'as zero would report roughly % as its translation adjustment. Load the '
        'rate and run it again.',
        v_func, g.reporting_ccy, p_closing_date, v_name, round(v_na, 2),
        round(v_na * (0 - coalesce(v_o, 0)), 2);
    END IF;

    entity_id       := m.entity_id;
    entity_name     := v_name;
    functional_ccy  := v_func;
    net_assets_func := v_na;
    opening_rate    := v_o;
    closing_rate    := v_c;
    cta             := round(v_na * (v_c - v_o), 2);
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION consolidated_cta(bigint, date, date) IS
  'Currency translation adjustment per group member. Refuses where an FX rate '
  'is missing rather than treating it as zero — a missing rate produced a '
  'plausible and badly wrong CTA, silently.';

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'consolidated_cta'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
