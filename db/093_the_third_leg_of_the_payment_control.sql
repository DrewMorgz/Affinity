-- 093 — the third leg of the payment control, and finalising accounts
--
-- FOUND BY TESTING WHETHER THE TWO-PERSON RULES ACTUALLY HOLD, rather than
-- whether they exist. Two gaps, one of which I documented as working.
--
-- 1. RELEASING A PAYMENT RUN CHECKED NOBODY.
--
--    pay_run_approve refuses the person who created the run: "You created this
--    payment run — it must be approved by someone else." Correct, and it works.
--
--    pay_run_execute checks only that the run is in approved status. The person
--    who approved it can then release it. So the control is two-way, not
--    three-way — and the user guide I wrote today says, in terms, that the
--    person who chooses who gets paid "should not authorise it, nor release
--    it". The first half was true and the second was not.
--
--    Assembling and approving being separate stops one person paying an account
--    nobody checked. Approving and releasing being separate is what stops the
--    approver changing the bank details between the two. Both halves matter and
--    only one existed.
--
-- 2. FINALISING A SET OF ACCOUNTS CHECKED NOBODY EITHER.
--
--    accounts_approve refuses self-approval — a director cannot sign accounts
--    they prepared. accounts_finalise, the step that locks the set, refused
--    only if the set did not exist. Finalising is what makes the figures the
--    filed ones, so it deserves the same treatment.

-- ── Releasing a payment run ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pay_run_execute(p_run_id bigint)
RETURNS payment_run
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r  payment_run;
  me text;
BEGIN
  me := current_app_user();

  SELECT * INTO r FROM payment_run WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment run % not found', p_run_id;
  END IF;

  IF coalesce(r.status, '') <> 'approved' THEN
    RAISE EXCEPTION 'Run % is % — only an approved run can be executed',
                    p_run_id, r.status;
  END IF;

  -- THE CHECK THIS FUNCTION DID NOT HAVE. Approving and releasing must be
  -- different people, because the gap between the two is where bank details
  -- can be changed. Approving already refuses whoever assembled the run; this
  -- completes the separation rather than leaving it two thirds done.
  IF r.approved_by IS NOT NULL AND lower(r.approved_by) = lower(me) THEN
    RAISE EXCEPTION
      'You approved this payment run, so you cannot also release it. Assembling, '
      'approving and releasing are three separate acts by three people — the gap '
      'between approving and releasing is where bank details can change, and one '
      'person holding both ends closes it.';
  END IF;

  IF r.created_by IS NOT NULL AND lower(r.created_by) = lower(me) THEN
    RAISE EXCEPTION
      'You assembled this payment run, so you cannot release it either.';
  END IF;

  PERFORM execute_payment_run(p_run_id, me);
  SELECT * INTO r FROM payment_run WHERE id = p_run_id;
  PERFORM ea_audit(NULL, 'payment_run', p_run_id, 'payment run released',
                   'released by ' || me || ', approved by ' ||
                   coalesce(r.approved_by, 'unknown'));
  RETURN r;
END;
$$;

-- ── Finalising a set of accounts ───────────────────────────────────────────
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

  -- Finalising is what makes these the filed figures. accounts_approve already
  -- refuses a director signing a set they prepared; this refuses the preparer
  -- locking their own work, which is the same principle one step later.
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
                   'finalised by ' || me);
  RETURN s;
END;
$$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('pay_run_execute', 'accounts_finalise')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
