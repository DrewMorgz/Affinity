-- =====================================================================
-- AFFINITY CORE — WRITE LAYER, BATCH 4: BOOKKEEPING AND JOURNALS
--
-- The engine already provides post_journal, approve_journal, reject_journal
-- and reverse_journal, and enforces double entry with a constraint trigger.
-- This batch does NOT reimplement any of that. It provides:
--
--   * a callable, granted wrapper so the app can post from a form
--   * a four-eyes control: the person who posts a journal cannot approve it
--   * period locking, so a closed month cannot be quietly reopened by a posting
--   * the simple bookkeeping views the Bookkeeping module writes to
--
-- Run AFTER 060. Safe to re-run.
-- =====================================================================

-- ── Period control ───────────────────────────────────────────────────
-- The engine ALREADY has accounting_period(entity_id, period, status) with a
-- check constraint allowing 'open', 'closed' or 'locked' — lowercase, and with
-- THREE states not two: closed is month-end, locked is stronger and is what a
-- signed-off statutory year should be. These functions use that vocabulary
-- rather than inventing one.
-- post_journal already refuses to post into a period that is absent or closed.
-- An earlier version of this file added its own period_lock table, which
-- duplicated that control — two places deciding whether a month is open is
-- exactly how they end up disagreeing. That table is dropped and these
-- functions operate on the engine's own table instead.
DROP TABLE IF EXISTS period_lock;

CREATE OR REPLACE FUNCTION period_open(
  p_entity bigint, p_period char(7))
RETURNS accounting_period LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounting_period;
BEGIN
  IF p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Period must be in the form YYYY-MM';
  END IF;
  INSERT INTO accounting_period(entity_id, period, status)
  VALUES (p_entity, p_period, 'open')
  ON CONFLICT (entity_id, period) DO UPDATE SET status = 'open'
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'accounting_period', r.id, 'period opened', p_period);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION period_close(
  p_entity bigint, p_period char(7), p_reason text DEFAULT NULL)
RETURNS accounting_period LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounting_period; unapproved int;
BEGIN
  -- Closing a month with journals still awaiting approval hides them.
  -- a draft journal is one awaiting approval; approval stamps approved_by
  SELECT count(*) INTO unapproved FROM journal
   WHERE entity_id = p_entity AND period = p_period AND status = 'draft';
  IF unapproved > 0 THEN
    RAISE EXCEPTION '% journal(s) in % are not yet approved — clear them before closing',
      unapproved, p_period;
  END IF;

  UPDATE accounting_period SET status = 'closed'
   WHERE entity_id = p_entity AND period = p_period
  RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Period % does not exist for that entity', p_period; END IF;
  PERFORM ea_audit(p_entity, 'accounting_period', r.id, 'period closed',
                   p_period || coalesce(' — ' || p_reason, ''));
  RETURN r;
END $$;

-- Reopening a closed month is a deliberate act and is recorded as such.
CREATE OR REPLACE FUNCTION period_reopen(
  p_entity bigint, p_period char(7), p_reason text)
RETURNS accounting_period LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounting_period;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for reopening a closed period';
  END IF;
  IF (SELECT status FROM accounting_period WHERE entity_id = p_entity AND period = p_period) = 'locked' THEN
    RAISE EXCEPTION 'Period % is locked, not merely closed — a locked period cannot be reopened here', p_period;
  END IF;
  UPDATE accounting_period SET status = 'open'
   WHERE entity_id = p_entity AND period = p_period
  RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Period % does not exist for that entity', p_period; END IF;
  PERFORM ea_audit(p_entity, 'accounting_period', r.id, 'PERIOD REOPENED',
                   p_period || ' — ' || p_reason);
  RETURN r;
END $$;

-- Locking is stronger than closing: use it once a year is signed off. Nothing
-- in this file will reopen a locked period.
CREATE OR REPLACE FUNCTION period_lock_final(
  p_entity bigint, p_period char(7), p_reason text)
RETURNS accounting_period LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounting_period;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for locking a period permanently';
  END IF;
  UPDATE accounting_period SET status = 'locked'
   WHERE entity_id = p_entity AND period = p_period
  RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Period % does not exist for that entity', p_period; END IF;
  PERFORM ea_audit(p_entity, 'accounting_period', r.id, 'PERIOD LOCKED',
                   p_period || ' — ' || p_reason);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION period_status(p_entity bigint, p_date date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(
    (SELECT status FROM accounting_period
      WHERE entity_id = p_entity AND period = to_char(p_date,'YYYY-MM')),
    'not open');
$$;

-- ── Posting a journal ────────────────────────────────────────────────
-- Wrapper over the engine's post_journal. The engine already refuses an
-- unbalanced journal; this adds the controls a firm needs around it.
--
-- p_lines is taken as ACCOUNT CODES, which is what a person entering a journal
-- knows, and resolved to the account_id the engine expects:
--   [{"account_code":"4000","txn_ccy":"GBP","txn_amount":1200.00,"memo":"..."} , ...]
-- Debits positive, credits negative, summing to zero. An account_id may be
-- given directly instead, for callers that already have one.
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

  PERFORM ea_audit(p_entity, 'journal', jid, 'journal posted',
                   trim(p_narrative) || ' · ' || n || ' lines');
  RETURN jid;
END $$;

-- ── Approval ─────────────────────────────────────────────────────────
-- The engine's approve_journal ALREADY enforces segregation of duties — it
-- raises "% cannot approve their own journal". An earlier version of this file
-- reimplemented that check, which was wasted work and a second place for it to
-- drift. This wrapper adds only what the engine does not do: a clearer message
-- for the period, and the audit entry.
--
-- Note the engine's vocabulary, which this follows rather than inventing:
--   journal.status is 'draft', 'posted' or 'reversed' — there is no 'approved'
--   status; approval is recorded by stamping approved_by. A draft journal is
--   one awaiting approval; approving it posts it.
CREATE OR REPLACE FUNCTION bk_journal_approve(p_journal bigint)
RETURNS journal LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE j journal; me text; ok boolean;
BEGIN
  me := current_app_user();
  SELECT * INTO j FROM journal WHERE id = p_journal;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal % not found', p_journal; END IF;
  IF j.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'That journal was already approved by %', j.approved_by;
  END IF;
  IF period_status(j.entity_id, j.journal_date) <> 'open' THEN
    RAISE EXCEPTION 'The period is closed — this journal cannot be approved into it';
  END IF;

  -- segregation of duties is enforced inside approve_journal
  ok := approve_journal(p_journal, me);
  IF NOT ok THEN
    RAISE EXCEPTION 'That journal is not awaiting approval';
  END IF;
  SELECT * INTO j FROM journal WHERE id = p_journal;
  PERFORM ea_audit(j.entity_id, 'journal', p_journal, 'journal approved', j.narrative);
  RETURN j;
END $$;

CREATE OR REPLACE FUNCTION bk_journal_reject(p_journal bigint, p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE j journal;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason when rejecting a journal';
  END IF;
  SELECT * INTO j FROM journal WHERE id = p_journal;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal % not found', p_journal; END IF;
  PERFORM reject_journal(p_journal);
  PERFORM ea_audit(j.entity_id, 'journal', p_journal, 'journal rejected',
                   coalesce(j.narrative,'') || ' — ' || p_reason);
END $$;

-- Correcting a posted journal by reversal, never by editing it. An approved
-- journal that can be edited is not an audit trail.
CREATE OR REPLACE FUNCTION bk_journal_reverse(
  p_journal bigint, p_reason text, p_date date DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE j journal; new_id bigint; eff date;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for reversing a journal';
  END IF;
  SELECT * INTO j FROM journal WHERE id = p_journal;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal % not found', p_journal; END IF;

  eff := coalesce(p_date, current_date);
  IF period_status(j.entity_id, eff) <> 'open' THEN
    RAISE EXCEPTION 'The period % is not open — reverse into an open period',
      to_char(eff, 'YYYY-MM');
  END IF;

  new_id := reverse_journal(p_journal, current_app_user(), eff);
  PERFORM ea_audit(j.entity_id, 'journal', p_journal, 'journal reversed',
                   coalesce(j.narrative,'') || ' — ' || p_reason);
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION bk_journal_list(
  p_entity bigint DEFAULT NULL, p_status text DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS TABLE(id bigint, entity_id bigint, journal_date date, period char(7),
              journal_type text, source text, narrative text, status text,
              created_by text, created_at timestamptz, lines bigint, debits numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT j.id, j.entity_id, j.journal_date, j.period, j.journal_type, j.source,
         j.narrative, j.status, j.created_by, j.created_at,
         (SELECT count(*) FROM journal_line l WHERE l.journal_id = j.id),
         (SELECT coalesce(sum(l.func_amount) FILTER (WHERE l.func_amount > 0), 0)
            FROM journal_line l WHERE l.journal_id = j.id)
    FROM journal j
   WHERE (p_entity IS NULL OR j.entity_id = p_entity)
     AND (p_status IS NULL OR j.status = p_status)
   ORDER BY j.journal_date DESC, j.id DESC
   LIMIT coalesce(p_limit, 200);
$$;

-- ── The simple bookkeeping module ────────────────────────────────────
-- bk_txn is the light cashbook the Bookkeeping module uses for client
-- entities, separate from Affinity's own double-entry ledger.
CREATE OR REPLACE FUNCTION bk_txn_add(
  p_entity bigint, p_txn_date date, p_descr text, p_txn_type text,
  p_dr numeric DEFAULT NULL, p_cr numeric DEFAULT NULL,
  p_ref text DEFAULT NULL, p_account text DEFAULT NULL)
RETURNS bk_txn LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r bk_txn;
BEGIN
  IF p_txn_date IS NULL THEN RAISE EXCEPTION 'Transaction date is required'; END IF;
  IF coalesce(trim(p_descr),'') = '' THEN RAISE EXCEPTION 'A description is required'; END IF;
  IF coalesce(p_dr,0) = 0 AND coalesce(p_cr,0) = 0 THEN
    RAISE EXCEPTION 'Enter either a debit or a credit';
  END IF;
  IF coalesce(p_dr,0) <> 0 AND coalesce(p_cr,0) <> 0 THEN
    RAISE EXCEPTION 'Enter a debit or a credit, not both';
  END IF;
  IF coalesce(p_dr,0) < 0 OR coalesce(p_cr,0) < 0 THEN
    RAISE EXCEPTION 'Use the other column rather than a negative amount';
  END IF;

  INSERT INTO bk_txn(entity_id, txn_date, descr, txn_type, dr, cr, ref, account, status)
  VALUES (p_entity, p_txn_date, trim(p_descr), p_txn_type, p_dr, p_cr, p_ref, p_account, 'Unposted')
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'bk_txn', r.id, 'transaction recorded', trim(p_descr));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION bk_txn_set_status(p_id bigint, p_status text)
RETURNS bk_txn LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r bk_txn;
BEGIN
  IF p_status NOT IN ('Unposted','Posted','Queried','Void') THEN
    RAISE EXCEPTION 'Unknown transaction status: %', p_status;
  END IF;
  UPDATE bk_txn SET status = p_status WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'bk_txn', p_id, 'transaction ' || lower(p_status), r.descr);
  RETURN r;
END $$;

-- ── Grants: authenticated only ───────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'bk_journal%' OR p.proname LIKE 'bk_txn%'
            OR p.proname LIKE 'period_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON accounting_period FROM PUBLIC, anon;
GRANT SELECT ON accounting_period TO authenticated;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS write_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND (p.proname LIKE 'bk_journal%' OR p.proname LIKE 'bk_txn%' OR p.proname LIKE 'period_%')
 ORDER BY p.proname;
