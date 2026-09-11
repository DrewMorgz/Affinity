-- 086 — the three statutory submissions that had no function behind them
--
-- FOUND BY DRIVING THE SCREENS. Statutory registers has five modals. Each
-- collected a full set of fields and ended in a button that closed the dialog
-- and discarded everything typed. Only one of the five — logging a filing —
-- had a function behind it at all.
--
-- WHAT THE OTHER FOUR ACTUALLY ARE. The read functions they sit beside
-- (stat_bo_registers, stat_officer_changes, stat_cogs_list, stat_dissolutions)
-- are views over the entity registers rather than registers in their own
-- right. So:
--
--   Recording a BO submission        = recording that the beneficial ownership
--                                      register was FILED with the registry.
--                                      That is a statutory_filing row.
--   Requesting a certificate          = a statutory_filing row.
--   Opening a dissolution             = a statutory_filing row, plus checks.
--   Recording an officer change       = NOT one of these. Appointing and
--                                      resigning officers is Entity Admin's
--                                      job and already works there. A second
--                                      way to do it would be a second place
--                                      for the register to disagree with
--                                      itself.
--
-- So this file adds three functions rather than four, and each carries the
-- check that makes it worth having rather than being a thin wrapper over
-- stat_filing_add.

-- ── Recording that the BO register was filed ───────────────────────────────
-- The check that matters: the register must actually account for 100% before
-- anyone records having filed it. Filing an incomplete beneficial ownership
-- register is a breach in most of these jurisdictions, and the system already
-- knows whether it is complete — so it should say so rather than let someone
-- record a submission it can see is wrong.
CREATE OR REPLACE FUNCTION stat_bo_submission(p_entity bigint,
                                              p_submitted_date date,
                                              p_reference text DEFAULT NULL,
                                              p_notes text DEFAULT NULL)
RETURNS statutory_filing
LANGUAGE plpgsql
AS $$
DECLARE
  r        statutory_filing;
  nm       text;
  pct      numeric;
  n_ubos   integer;
BEGIN
  SELECT name INTO nm FROM entity WHERE id = p_entity;
  IF nm IS NULL THEN
    RAISE EXCEPTION 'There is no entity with id %.', p_entity;
  END IF;
  IF p_submitted_date IS NULL THEN
    RAISE EXCEPTION 'A submission needs the date it was filed.';
  END IF;

  SELECT count(*), coalesce(sum(ownership_pct), 0)
    INTO n_ubos, pct
    FROM entity_ubo WHERE entity_id = p_entity;

  IF n_ubos = 0 THEN
    RAISE EXCEPTION
      'No beneficial owners are recorded for %, so there is nothing to file. '
      'Record the register before recording that it was submitted.', nm;
  END IF;

  IF round(pct, 2) <> 100 THEN
    RAISE EXCEPTION
      'The beneficial ownership register for % accounts for %%%, not 100%%. '
      'Filing an incomplete register is a breach in most jurisdictions — '
      'complete it before recording the submission.', nm, round(pct, 2);
  END IF;

  INSERT INTO statutory_filing (entity_id, filing_type, due_date, status,
                                submitted_by, submitted_at, reference, notes)
  VALUES (p_entity, 'BO register submission', p_submitted_date, 'submitted',
          current_setting('request.jwt.claim.email', true),
          p_submitted_date::timestamptz, p_reference, p_notes)
  RETURNING * INTO r;

  INSERT INTO audit_event (action, target, details)
  VALUES ('BO REGISTER SUBMITTED', nm,
          format('%s beneficial owners accounting for 100%%, filed %s%s',
                 n_ubos, p_submitted_date,
                 coalesce(', ref ' || p_reference, '')));
  RETURN r;
END;
$$;

-- ── Requesting a certificate of good standing ──────────────────────────────
-- A registry will not issue one for an entity with overdue filings, so the
-- request is refused where Core can already see that. Better to be told here
-- than to wait a week and be told by the registry.
CREATE OR REPLACE FUNCTION stat_certificate_request(p_entity bigint,
                                                    p_requested_date date,
                                                    p_purpose text DEFAULT NULL)
RETURNS statutory_filing
LANGUAGE plpgsql
AS $$
DECLARE
  r       statutory_filing;
  nm      text;
  overdue integer;
BEGIN
  SELECT name INTO nm FROM entity WHERE id = p_entity;
  IF nm IS NULL THEN
    RAISE EXCEPTION 'There is no entity with id %.', p_entity;
  END IF;
  IF p_requested_date IS NULL THEN
    RAISE EXCEPTION 'A certificate request needs a date.';
  END IF;

  SELECT count(*) INTO overdue
    FROM statutory_filing
   WHERE entity_id = p_entity
     AND status <> 'submitted'
     AND due_date < current_date;

  IF overdue > 0 THEN
    RAISE EXCEPTION
      '% has % overdue filing(s). A registry will not issue a certificate of '
      'good standing while filings are outstanding, so the request would be '
      'refused — clear them first.', nm, overdue;
  END IF;

  INSERT INTO statutory_filing (entity_id, filing_type, due_date, status, notes)
  VALUES (p_entity, 'Certificate of good standing', p_requested_date,
          'requested', p_purpose)
  RETURNING * INTO r;

  INSERT INTO audit_event (action, target, details)
  VALUES ('CERTIFICATE REQUESTED', nm,
          coalesce('purpose: ' || p_purpose, 'no purpose given'));
  RETURN r;
END;
$$;

-- ── Opening a dissolution ──────────────────────────────────────────────────
-- The two checks are the same ones that refuse closing an entity, and for the
-- same reasons: unbilled time is written off by a dissolution, and outstanding
-- filings do not disappear because the entity is being wound up — a registry
-- will pursue them.
CREATE OR REPLACE FUNCTION stat_dissolution_open(p_entity bigint,
                                                 p_opened_date date,
                                                 p_reason text)
RETURNS statutory_filing
LANGUAGE plpgsql
AS $$
DECLARE
  r        statutory_filing;
  nm       text;
  overdue  integer;
  unbilled numeric;
BEGIN
  SELECT name INTO nm FROM entity WHERE id = p_entity;
  IF nm IS NULL THEN
    RAISE EXCEPTION 'There is no entity with id %.', p_entity;
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION
      'A dissolution needs a reason. Why an entity was wound up is asked about '
      'years later, and it is the one thing nobody can reconstruct.';
  END IF;

  SELECT count(*) INTO overdue
    FROM statutory_filing
   WHERE entity_id = p_entity AND status <> 'submitted' AND due_date < current_date;

  IF overdue > 0 THEN
    RAISE EXCEPTION
      '% has % overdue filing(s). Winding an entity up does not discharge them '
      '— a registry will still pursue them, and often from the officers '
      'personally. Clear them first.', nm, overdue;
  END IF;

  -- timesheet_entry keys on entity_label, a name, rather than an id — and it
  -- stores the computed value rather than hours multiplied by a rate. Matching
  -- ea_entity_close exactly, so the two agree about what unbilled means; two
  -- different definitions of the same figure is how a check gets argued with.
  SELECT coalesce(sum(value), 0) INTO unbilled
    FROM timesheet_entry te
   WHERE te.entity_label = nm AND te.billable AND te.status <> 'Billed';

  IF unbilled > 0 THEN
    RAISE EXCEPTION
      '% has % of unbilled time against it. Opening a dissolution writes that '
      'work off. Bill it or write it off deliberately first.',
      nm, round(unbilled, 2);
  END IF;

  INSERT INTO statutory_filing (entity_id, filing_type, due_date, status, notes)
  VALUES (p_entity, 'Dissolution', p_opened_date, 'open', p_reason)
  RETURNING * INTO r;

  UPDATE entity_profile SET admin_status = 'Dissolving' WHERE entity_id = p_entity;

  INSERT INTO audit_event (action, target, details)
  VALUES ('DISSOLUTION OPENED', nm, p_reason);
  RETURN r;
END;
$$;

-- ── Access ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('stat_bo_submission', 'stat_certificate_request',
                         'stat_dissolution_open')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
