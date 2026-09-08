-- =====================================================================
-- AFFINITY CORE — 077: ACCOUNTS WORKFLOW, ADJUSTMENTS AND APPROVAL THRESHOLDS
--
-- ── THE GAP THIS CLOSES ─────────────────────────────────────────────
--
-- post_statutory_adjustment refuses to touch a set that is finalised or
-- locked. It does NOT refuse a set that has been APPROVED.
--
-- So a director approves the accounts, someone posts an audit adjustment that
-- changes the figures, and the set still shows as approved by that director.
-- They signed one set of numbers and different ones would be filed.
--
-- Refusing outright would be wrong: audit adjustments genuinely arise after
-- approval, and the answer is not to prevent them. The answer is that an
-- adjustment to an approved set MUST SEND IT BACK FOR RE-APPROVAL. So this
-- allows the adjustment, reverts the set to draft, clears the approval, and
-- audits it loudly.
--
-- Also completes the workflow — draft, in review, approved, finalised — and
-- adds validation to the journal approval threshold, which had none.
--
-- Run AFTER 076. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- SUBMIT FOR REVIEW
-- ─────────────────────────────────────────────────────────────────────
-- The step between preparing and approving. Its value is that a reviewer
-- looks at the set before a director is asked to sign it, so the readiness
-- gates are reported here rather than enforced — the reviewer's job is partly
-- to see what is outstanding.
CREATE OR REPLACE FUNCTION accounts_submit_for_review(p_set bigint)
RETURNS TABLE(status text, gates_failed bigint, outstanding text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE s fs_accounts_set; n int; list text;
BEGIN
  SELECT * INTO s FROM fs_accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;

  PERFORM submit_accounts_for_review(p_set, current_app_user());

  SELECT count(*), string_agg(g.gate, '; ')
    INTO n, list
    FROM accounts_set_readiness_full(p_set) g WHERE NOT g.passed;

  PERFORM ea_audit(s.entity_id, 'fs_accounts_set', p_set, 'accounts submitted for review',
                   coalesce(n,0) || ' gate(s) still outstanding at submission');

  RETURN QUERY SELECT (SELECT fs.status FROM fs_accounts_set fs WHERE fs.id = p_set),
                      coalesce(n,0)::bigint,
                      coalesce(list, 'nothing outstanding');
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- STATUTORY ADJUSTMENTS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounts_adjust(
  p_set bigint, p_date date, p_narrative text, p_lines jsonb)
RETURNS TABLE(journal_id bigint, set_status text, approval_withdrawn boolean, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE s fs_accounts_set; jid bigint; was_approved boolean; prev_director text;
BEGIN
  SELECT * INTO s FROM fs_accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF coalesce(trim(p_narrative),'') = '' THEN
    RAISE EXCEPTION 'Give a narrative for the adjustment — an audit adjustment with no explanation cannot be reviewed';
  END IF;

  was_approved := (coalesce(s.status,'') = 'approved');
  prev_director := s.approved_by;

  -- The engine's function blocks a finalised or locked set, which is correct
  -- and left alone.
  jid := post_statutory_adjustment(p_set, p_date, p_narrative, current_app_user(), p_lines);

  -- Regenerate, so the statements reflect the adjustment rather than showing
  -- the figures the director saw.
  IF coalesce(s.status,'') <> 'draft' THEN
    UPDATE fs_accounts_set SET status = 'draft' WHERE id = p_set;
  END IF;
  PERFORM accounts_set_generate_all(p_set);

  IF was_approved THEN
    -- The approval attached to different figures. Withdrawing it is the point:
    -- the director must see the adjusted accounts and approve those.
    UPDATE fs_accounts_set
       SET approved_by = NULL, approved_at = NULL, status = 'draft'
     WHERE id = p_set;
    PERFORM ea_audit(s.entity_id, 'fs_accounts_set', p_set, 'APPROVAL WITHDRAWN BY ADJUSTMENT',
                     'adjustment "' || p_narrative || '" changed the figures ' ||
                     coalesce(prev_director,'the director') ||
                     ' had approved — the set is back to draft and must be re-approved');
  ELSE
    PERFORM ea_audit(s.entity_id, 'fs_accounts_set', p_set, 'statutory adjustment posted',
                     p_narrative);
  END IF;

  RETURN QUERY SELECT jid,
    (SELECT fs.status FROM fs_accounts_set fs WHERE fs.id = p_set),
    was_approved,
    CASE WHEN was_approved
         THEN 'The approval by ' || coalesce(prev_director,'the director') ||
              ' has been withdrawn: it attached to figures this adjustment has changed. The adjusted accounts must be approved again.'
         ELSE 'Adjustment posted and the statements regenerated.' END;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- YEAR END
-- ─────────────────────────────────────────────────────────────────────
-- Closing a year rolls the result to reserves and is not reversible in the
-- ordinary way, so the preconditions are checked first and reported together.
CREATE OR REPLACE FUNCTION year_end_readiness(
  p_entity bigint, p_fy_start date, p_fy_end date)
RETURNS TABLE(gate text, passed boolean, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  -- Draft journals in the year would be excluded from the result being rolled.
  SELECT count(*) INTO n FROM journal
   WHERE entity_id = p_entity AND journal_date BETWEEN p_fy_start AND p_fy_end
     AND coalesce(status,'') = 'draft';
  RETURN QUERY SELECT 'No draft journals in the year'::text, (n = 0),
    CASE WHEN n = 0 THEN 'none' ELSE n || ' draft journal(s) — these would be left out of the result rolled to reserves' END;

  -- Every month in the year should be closed before the year is.
  SELECT count(*) INTO n
    FROM generate_series(p_fy_start, p_fy_end, interval '1 month') m
   WHERE NOT EXISTS (
     SELECT 1 FROM accounting_period ap
      WHERE ap.entity_id = p_entity
        AND ap.period = to_char(m, 'YYYY-MM')
        AND ap.status IN ('closed','locked'));
  RETURN QUERY SELECT 'All months closed'::text, (n = 0),
    CASE WHEN n = 0 THEN 'all closed or locked'
         ELSE n || ' month(s) still open — closing the year over an open month invites postings into a closed year' END;

  -- A signed-off set of accounts for the year, where one exists at all.
  SELECT count(*) INTO n FROM fs_accounts_set
   WHERE entity_id = p_entity AND period_start = p_fy_start AND period_end = p_fy_end
     AND status IN ('approved','finalised');
  RETURN QUERY SELECT 'Accounts approved for the year'::text, (n > 0),
    CASE WHEN n > 0 THEN 'approved or finalised'
         ELSE 'no approved accounts set for this year — the year can still be closed, but the figures rolled will not have been signed off' END;

  -- Client money, where held.
  IF EXISTS (SELECT 1 FROM client_money_account WHERE cm_entity_id = p_entity) THEN
    SELECT count(*) INTO n FROM cm_shortfalls(p_entity);
    RETURN QUERY SELECT 'No client money shortfalls'::text, (n = 0),
      CASE WHEN n = 0 THEN 'none' ELSE n || ' client(s) in shortfall — these must be remediated before the year closes' END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION year_end_close(
  p_entity bigint, p_fy_start date, p_fy_end date, p_override boolean DEFAULT false)
RETURNS TABLE(journal_id bigint, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE failed text; jid bigint; blocked int;
BEGIN
  -- Two gates are hard: draft journals and client money shortfalls. The others
  -- are advisory, because a year can legitimately be closed before the
  -- accounts are signed. The distinction is stated rather than left to the
  -- caller to work out.
  SELECT count(*) INTO blocked FROM year_end_readiness(p_entity, p_fy_start, p_fy_end) g
   WHERE NOT g.passed
     AND g.gate IN ('No draft journals in the year', 'No client money shortfalls');
  IF blocked > 0 THEN
    SELECT string_agg(g.gate || ' — ' || g.detail, E'\n  - ')
      INTO failed FROM year_end_readiness(p_entity, p_fy_start, p_fy_end) g
     WHERE NOT g.passed
       AND g.gate IN ('No draft journals in the year', 'No client money shortfalls');
    RAISE EXCEPTION E'The year cannot be closed:\n  - %', failed;
  END IF;

  SELECT string_agg(g.gate || ' — ' || g.detail, E'\n  - ')
    INTO failed FROM year_end_readiness(p_entity, p_fy_start, p_fy_end) g WHERE NOT g.passed;
  IF failed IS NOT NULL AND NOT p_override THEN
    RAISE EXCEPTION E'These are not blocking, but confirm before closing:\n  - %\n\nRe-run with the override to proceed.', failed;
  END IF;

  jid := close_year(p_entity, p_fy_start, p_fy_end, current_app_user());
  PERFORM ea_audit(p_entity, 'journal', jid, 'YEAR END CLOSED',
                   p_fy_start || ' to ' || p_fy_end ||
                   CASE WHEN p_override THEN ' (closed with advisory gates outstanding)' ELSE '' END);
  RETURN QUERY SELECT jid,
    'Year closed and the result rolled to reserves.' ||
    CASE WHEN p_override THEN ' Advisory gates were outstanding and overridden.' ELSE '' END;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- JOURNAL APPROVAL THRESHOLD
-- ─────────────────────────────────────────────────────────────────────
-- post_with_approval already reads the threshold and routes a journal above it
-- for approval. set_approval_threshold had no validation at all: a negative
-- threshold, or a threshold set to nil, would silently change what needs
-- approving with nothing recorded.
CREATE OR REPLACE FUNCTION approval_threshold_set(p_entity bigint, p_threshold numeric)
RETURNS TABLE(entity_name text, threshold numeric, previous numeric, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE was numeric; nm text;
BEGIN
  SELECT e.name INTO nm FROM entity e WHERE e.id = p_entity;
  IF nm IS NULL THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;

  IF p_threshold IS NULL OR p_threshold < 0 THEN
    RAISE EXCEPTION 'The threshold must be zero or more. Zero means every journal needs approval; a null threshold would silently mean none do.';
  END IF;

  SELECT r.threshold INTO was FROM journal_approval_rule r WHERE r.entity_id = p_entity;

  INSERT INTO journal_approval_rule(entity_id, threshold)
  VALUES (p_entity, p_threshold)
  ON CONFLICT (entity_id) DO UPDATE SET threshold = EXCLUDED.threshold;

  -- Raising a threshold means fewer journals get approved, which is a
  -- loosening of control and is recorded as such.
  PERFORM ea_audit(p_entity, 'journal_approval_rule', p_entity,
                   CASE WHEN was IS NOT NULL AND p_threshold > was
                        THEN 'APPROVAL THRESHOLD RAISED'
                        ELSE 'approval threshold set' END,
                   'from ' || coalesce(was::text,'none') || ' to ' || p_threshold ||
                   CASE WHEN was IS NOT NULL AND p_threshold > was
                        THEN ' — fewer journals will now require approval'
                        ELSE '' END);

  RETURN QUERY SELECT nm, p_threshold, was,
    CASE WHEN p_threshold = 0 THEN 'Every journal will require approval.'
         WHEN was IS NULL THEN 'Journals above ' || p_threshold || ' will require approval.'
         WHEN p_threshold > was THEN 'Raised from ' || was ||
              ' — fewer journals will now require approval.'
         ELSE 'Lowered from ' || was || ' — more journals will now require approval.' END;
END $$;

CREATE OR REPLACE FUNCTION approval_thresholds_list()
RETURNS TABLE(entity_id bigint, entity_name text, threshold numeric, ccy char(3),
              journals_above bigint, none_set boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, r.threshold, e.functional_ccy,
         (SELECT count(*) FROM journal j
            JOIN journal_line jl ON jl.journal_id = j.id
           WHERE j.entity_id = e.id
             AND abs(jl.func_amount) > coalesce(r.threshold, 1e12)),
         -- No rule at all means no journal ever requires approval, which is
         -- worth showing rather than leaving as a blank.
         (r.threshold IS NULL)
    FROM entity e
    LEFT JOIN journal_approval_rule r ON r.entity_id = e.id
   WHERE e.entity_class = 'internal' OR e.is_active
   ORDER BY (r.threshold IS NULL) DESC, e.name;
$$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('accounts_submit_for_review','accounts_adjust',
                         'year_end_readiness','year_end_close',
                         'approval_threshold_set','approval_thresholds_list')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

GRANT SELECT ON journal_approval_rule TO authenticated;

SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('accounts_submit_for_review','accounts_adjust',
                     'year_end_readiness','year_end_close',
                     'approval_threshold_set','approval_thresholds_list')
 ORDER BY p.proname;
