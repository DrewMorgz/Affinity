-- 088 — make the journal the screen posts honour the approval threshold
--
-- FOUND BY FOLLOWING THE PATH RATHER THAN READING THE FUNCTION. There are two
-- ways to post a journal: post_with_approval, which checks the entity's
-- threshold and holds the journal as draft where it is met, and bk_journal_post,
-- which the screen calls and which never looked at the threshold at all.
--
-- So a threshold set in System admin would have had NO EFFECT on anything
-- posted from the interface. Every journal would have posted immediately and
-- the approval queue would have stayed empty, while the setting appeared
-- configured. That is the same shape as the bare approval_threshold_set found
-- in 085: a second path that skips the control.
--
-- Andy's policy is that no journal requires approval, so nothing has been wrong
-- in practice. The moment anyone set a threshold, it would have been decorative.
--
-- THE WHOLE FUNCTION IS REPRODUCED, not rewritten. A first attempt replaced it
-- with a thin version carrying only the threshold check, which would have
-- silently dropped the journal type validation, the two-line minimum, the period
-- status check, the future-date check, the balance message in the user's terms
-- and the account code resolution — none of which exist anywhere else. Adding a
-- control by removing six others is not a net gain.

CREATE OR REPLACE FUNCTION bk_journal_post(
  p_entity bigint, p_journal_date date, p_narrative text, p_lines jsonb,
  p_journal_type text DEFAULT 'manual', p_source text DEFAULT 'Bookkeeping')
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE jid bigint; n int; total numeric;
BEGIN
  IF p_journal_date IS NULL THEN RAISE EXCEPTION 'Journal date is required'; END IF;
  IF coalesce(trim(p_narrative),'') = '' THEN
    RAISE EXCEPTION 'A journal needs a narrative — it is what the auditor reads';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'Journal lines are required';
  END IF;
  -- the engine constrains journal_type; name the allowed values rather than
  -- letting a check constraint surface as a raw violation
  IF coalesce(p_journal_type,'manual') NOT IN
     ('manual','recurring','reversing','accrual','system','stat_adjustment') THEN
    RAISE EXCEPTION 'Journal type must be one of manual, recurring, reversing, accrual, system or stat_adjustment';
  END IF;

  SELECT count(*) INTO n FROM jsonb_array_elements(p_lines);
  IF n < 2 THEN
    RAISE EXCEPTION 'A journal needs at least two lines — a single-sided entry is not double entry';
  END IF;

  -- post_journal enforces this too; checking first gives a clearer message
  -- than a raise from inside the engine.
  IF period_status(p_entity, p_journal_date) <> 'open' THEN
    RAISE EXCEPTION 'The period % is % — it must be open before posting',
      to_char(p_journal_date, 'YYYY-MM'), lower(period_status(p_entity, p_journal_date));
  END IF;

  IF p_journal_date > current_date + 31 THEN
    RAISE EXCEPTION 'That journal date is more than a month ahead — check it';
  END IF;

  -- Report the imbalance in the user's terms. The engine's trigger would catch
  -- it, but "debits and credits differ by 250.00" is more use than a
  -- constraint violation.
  SELECT sum((e->>'txn_amount')::numeric) INTO total FROM jsonb_array_elements(p_lines) e;
  IF round(coalesce(total,0), 2) <> 0 THEN
    RAISE EXCEPTION 'Journal does not balance — debits and credits differ by %', abs(round(total,2));
  END IF;

  -- Resolve account codes to ids. post_journal takes account_id; a person
  -- entering a journal knows the code, so the translation belongs here rather
  -- than in the form. An unknown code is named, with its line number.
  DECLARE
    resolved jsonb := '[]'::jsonb;
    ln       jsonb;
    idx      int := 0;
    aid      bigint;
  BEGIN
    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      idx := idx + 1;
      IF (ln ? 'account_id') AND (ln->>'account_id') IS NOT NULL THEN
        aid := (ln->>'account_id')::bigint;
      ELSE
        SELECT a.id INTO aid FROM account a
         WHERE a.code = (ln->>'account_code') AND a.is_active
         ORDER BY a.id LIMIT 1;
        IF aid IS NULL THEN
          RAISE EXCEPTION 'Account code % on line % does not exist',
            coalesce(ln->>'account_code','(blank)'), idx;
        END IF;
      END IF;
      resolved := resolved || jsonb_build_object(
        'account_id', aid,
        'txn_ccy',    coalesce(ln->>'txn_ccy', 'GBP'),
        'txn_amount', (ln->>'txn_amount')::numeric,
        'memo',       ln->>'memo');
    END LOOP;

    jid := post_journal(p_entity, p_journal_date, coalesce(p_source,'Bookkeeping'),
                        trim(p_narrative), current_app_user(), resolved,
                        coalesce(p_journal_type,'manual'), NULL);
  END;

  -- ── The approval threshold ──────────────────────────────────────────
  -- ADDED IN 088. post_with_approval read journal_approval_rule and held a
  -- journal as draft where it met the entity's threshold. This function — the
  -- one the screen actually calls — did not, so a threshold set in System
  -- admin had no effect on anything posted from the interface: the journal
  -- posted, the approval queue stayed empty, and the setting looked configured
  -- while doing nothing.
  --
  -- The check lives here rather than the validation moving to
  -- post_with_approval, because everything above this line — journal type,
  -- minimum two lines, period status, future dates, the balance message in the
  -- user's terms, account code resolution — exists only in this function.
  DECLARE
    v_thr numeric;
    v_dr  numeric;
  BEGIN
    SELECT threshold INTO v_thr
      FROM journal_approval_rule WHERE entity_id = p_entity;
    IF v_thr IS NOT NULL THEN
      SELECT coalesce(sum((e->>'txn_amount')::numeric)
                      FILTER (WHERE (e->>'txn_amount')::numeric > 0), 0)
        INTO v_dr FROM jsonb_array_elements(p_lines) e;
      IF v_dr >= v_thr THEN
        UPDATE journal SET status = 'draft', posted_at = NULL WHERE id = jid;
        PERFORM ea_audit(p_entity, 'journal', jid, 'journal held for approval',
                 format('%s is at or above the %s threshold for this entity',
                        round(v_dr, 2), round(v_thr, 2)));
      END IF;
    END IF;
  END;

  PERFORM ea_audit(p_entity, 'journal', jid, 'journal posted',
                   trim(p_narrative) || ' · ' || n || ' lines');
  RETURN jid;
END $$;

COMMENT ON FUNCTION bk_journal_post(bigint, date, text, jsonb, text, text) IS
  'Posts a journal with its full validation AND the approval threshold check. '
  'The threshold check was added in 088; before that a threshold set in System '
  'admin had no effect on anything posted from the screen.';

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'bk_journal_post'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
