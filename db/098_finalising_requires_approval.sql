-- 098 — a set of accounts cannot be finalised without being approved
--
-- FOUND BY TRYING TO DO STEP FIVE WITHOUT STEP FOUR.
--
-- accounts_approve is the serious gate in this module. It refuses self-approval
-- and it refuses unless every readiness gate passes — on the test set that was
-- nine separate refusals: no verified disclosure checklist for the framework, no
-- primary statements generated, no accounting policies, going concern not
-- recorded, no cash flow statement, no comparatives, no statement of changes in
-- equity, no required documents recorded.
--
-- accounts_finalise did not check the status at all. So calling it directly on
-- a DRAFT set locked it as finalised, with locked = true, having passed none of
-- those nine gates and without any director approving anything.
--
-- Verified before the fix: a set went from 'draft' to 'finalised' in one call.
--
-- FINALISING IS WHAT MAKES THE FIGURES THE FILED ONES. Everything
-- accounts_approve refuses is refused precisely so that it cannot happen before
-- this step, and this step did not require that step to have happened.
--
-- I ADDED THE SELF-APPROVAL CHECK TO THIS FUNCTION IN 093 and did not add a
-- status check while I was in it. My own note in that file said finalising
-- "makes these the filed figures" — so I understood what it does, fixed the
-- smaller gap, and left the larger one open. Checking the prior state is now
-- part of the behavioural tests for every staged workflow, rather than
-- something I look at when I happen to think of it.

CREATE OR REPLACE FUNCTION accounts_finalise(p_set bigint)
RETURNS fs_accounts_set
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s  fs_accounts_set;
  me text;
BEGIN
  me := current_app_user();

  SELECT * INTO s FROM fs_accounts_set WHERE id = p_set;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accounts set % not found', p_set;
  END IF;

  -- ── The check this function did not have ────────────────────────────────
  IF coalesce(s.status, '') <> 'approved' THEN
    RAISE EXCEPTION
      'These accounts are %, not approved, so they cannot be finalised. '
      'Finalising locks them as the filed figures, and everything the approval '
      'step refuses — the readiness gates, the disclosure checklist, a director '
      'signing that they give a true and fair view — is refused precisely so it '
      'cannot be skipped by coming straight here. Submit for review, then have '
      'a director approve them.',
      coalesce(s.status, 'in no state');
  END IF;

  IF s.locked THEN
    RAISE EXCEPTION 'These accounts are already finalised and locked.';
  END IF;

  -- Added in 093: the preparer should not be the one who closes the door.
  IF s.prepared_by IS NOT NULL AND lower(s.prepared_by) = lower(me) THEN
    RAISE EXCEPTION
      'You prepared this set, so you cannot finalise it. Finalising makes these '
      'the filed figures, and the person who prepared them should not be the one '
      'who closes the door on them.';
  END IF;

  UPDATE fs_accounts_set
     SET status = 'finalised', locked = true,
         finalised_by = me, finalised_at = now()
   WHERE id = p_set
   RETURNING * INTO s;

  PERFORM ea_audit(s.entity_id, 'accounts_set', p_set, 'accounts finalised',
                   'finalised by ' || me || ', approved by ' ||
                   coalesce(s.approved_by, 'unknown'));
  RETURN s;
END;
$$;

COMMENT ON FUNCTION accounts_finalise(bigint) IS
  'Locks a set as the filed figures. Requires status approved, refuses the '
  'preparer, and refuses a set already locked. The status check was added in '
  '098 after a draft set was finalised directly, skipping nine readiness gates.';

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'accounts_finalise'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
