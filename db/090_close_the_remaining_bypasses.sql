-- 090 — three more second paths that skipped their controls
--
-- FOUND BY AUDITING FOR THE SHAPE RATHER THAN THE INSTANCE. 085 found a bare
-- approval_threshold_set beside the guarded one. 088 found the screen posting
-- journals by a path that ignored the threshold. Both were the same thing: a
-- control exists, a second way round it exists.
--
-- So I looked for every pair of functions whose names are the same words in a
-- different order. Eleven pairs. Three of them are genuine bypasses:
--
--   approve_accounts   571 chars, 1 refusal,  no audit entry
--   accounts_approve  2940 chars, 4 refusals, audited
--
--   draw_ic_loan      2479 chars, 0 refusals, no audit entry
--   ic_loan_draw      4442 chars, 5 refusals, audited
--
--   post_tp_charge     807 chars, 0 refusals, no audit entry
--   tp_charge_post    4308 chars, 3 refusals, audited
--
-- The first pair is the one that matters. Approving a set of statutory accounts
-- is a director signing that they give a true and fair view. The guarded version
-- refuses if you prepared the set, refuses unless every readiness gate passes,
-- and records who approved what. The bare one checks almost nothing and records
-- nothing.
--
-- EVERY SCREEN CALLS THE GUARDED VERSION. These are dormant rather than live,
-- which is why nothing has gone wrong. They are closed anyway, because a door
-- nobody is currently using is still a door, and the reason 085 existed is that
-- I could not promise nothing outside this repository calls them.
--
-- Each now delegates rather than being dropped, so any existing caller keeps
-- working and gets the checks it was missing.

-- ── Approving statutory accounts ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_accounts(p_set_id bigint, p_by text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delegates to accounts_approve, which refuses where the approver prepared
  -- the set, refuses unless the readiness gates pass, and records the approval.
  -- This wrapper exists only so an old caller does not sign off a set of
  -- accounts without any of that happening.
  PERFORM accounts_approve(p_set_id, p_by);
END;
$$;

COMMENT ON FUNCTION approve_accounts(bigint, text) IS
  'DEPRECATED. Delegates to accounts_approve, which checks the readiness gates, '
  'refuses self-approval and records who approved. Use accounts_approve.';

-- ── Drawing on a group loan ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION draw_ic_loan(p_loan bigint, p_date date,
                                        p_amount numeric,
                                        p_created_by text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
AS $$
BEGIN
  -- ic_loan_draw checks the facility limit, the dates and the currency, and
  -- writes the audit entry. This one did none of that.
  RETURN ic_loan_draw(p_loan, p_date, p_amount);
END;
$$;

COMMENT ON FUNCTION draw_ic_loan(bigint, date, numeric, text) IS
  'DEPRECATED. Delegates to ic_loan_draw, which validates the drawdown and '
  'records it. Use ic_loan_draw.';

-- ── Posting a transfer pricing charge ──────────────────────────────────────
CREATE OR REPLACE FUNCTION post_tp_charge(p_from bigint, p_to bigint,
                                          p_date date, p_ccy character,
                                          p_cost_base numeric,
                                          p_service_type text,
                                          p_created_by text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE v_id bigint;
BEGIN
  -- tp_charge_post reads the markup from the agreed policy rather than taking
  -- it on trust, refuses where no policy exists, and audits the charge. A
  -- transfer pricing charge posted without a policy behind it is the thing a
  -- tax authority asks about.
  v_id := tp_charge_post(p_from, p_to, p_date, p_ccy, p_cost_base, p_service_type);
  RETURN v_id::numeric;
END;
$$;

COMMENT ON FUNCTION post_tp_charge(bigint, bigint, date, character, numeric, text, text) IS
  'DEPRECATED. Delegates to tp_charge_post, which takes the markup from the '
  'agreed policy and audits the charge. Use tp_charge_post.';

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('approve_accounts', 'draw_ic_loan', 'post_tp_charge')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
