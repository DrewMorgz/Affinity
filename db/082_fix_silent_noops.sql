-- =====================================================================
-- AFFINITY CORE — 082: TWO SILENT NO-OPS FOUND BY THE LIVE AUDIT
--
-- The live audit executed each chain rather than reading the source, and found
-- something a source-level check cannot: two functions that do nothing and
-- report success.
--
-- ── 1. APPROVING TIME THAT IS NOT SUBMITTED ─────────────────────────
--
-- ts_entry_approve updates only rows with status 'Submitted'. Select Draft
-- entries and press Approve and it updates nothing, returns 0, and raises no
-- error — while the interface says "Approved." The fee earner's time is still
-- sitting in draft and everyone believes it was approved.
--
-- The workflow itself is right: Draft, Submitted, Approved. The fault is that
-- the refusal is silent.
--
-- ── 2. BUILDING A PAYMENT RUN WITH NO OPEN PAYABLES ─────────────────
--
-- add_open_payables_to_run adds nothing and returns 0, so an empty run looks
-- assembled and someone goes on to approve it.
--
-- Both are fixed in the DATABASE rather than in each screen, so every caller
-- gets the refusal — including any future one.
--
-- Run AFTER 081. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. TIME APPROVAL
-- ─────────────────────────────────────────────────────────────────────
-- Dropped first: the original had a parameter default and PostgreSQL will not
-- remove one in place.
DROP FUNCTION IF EXISTS ts_entry_approve(bigint[], boolean, text);
CREATE OR REPLACE FUNCTION ts_entry_approve(
  p_ids bigint[], p_approve boolean, p_reason text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; total integer; wrong_status text;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Nothing selected to approve';
  END IF;
  IF NOT p_approve AND coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason when returning time to the fee earner';
  END IF;

  UPDATE timesheet_entry
     SET status = CASE WHEN p_approve THEN 'Approved' ELSE 'Returned' END,
         narrative = CASE WHEN p_approve THEN narrative
                          ELSE coalesce(narrative,'') || ' [returned: ' || p_reason || ']' END
   WHERE id = ANY(p_ids) AND status = 'Submitted';
  GET DIAGNOSTICS n = ROW_COUNT;

  -- The fix. Nothing matched means the selection was not submitted time, and
  -- saying so is the difference between the fee earner's time being approved
  -- and everyone believing it was.
  IF n = 0 THEN
    SELECT count(*), string_agg(DISTINCT status, ', ')
      INTO total, wrong_status
      FROM timesheet_entry WHERE id = ANY(p_ids);

    IF total = 0 THEN
      RAISE EXCEPTION 'None of those time entries exist';
    END IF;
    RAISE EXCEPTION 'Nothing was %. % entr% selected, with status %. Only submitted time can be approved — a fee earner has to submit it first.',
      CASE WHEN p_approve THEN 'approved' ELSE 'returned' END,
      total,
      CASE WHEN total = 1 THEN 'y' ELSE 'ies' END,
      coalesce(wrong_status, 'unknown');
  END IF;

  PERFORM ea_audit(NULL, 'timesheet_entry', NULL,
                   CASE WHEN p_approve THEN 'time approved' ELSE 'time returned' END,
                   n || ' entries' || coalesce(' — ' || p_reason, ''));
  RETURN n;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. PAYMENT RUN ASSEMBLY
-- ─────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS add_open_payables_to_run(bigint);
CREATE OR REPLACE FUNCTION add_open_payables_to_run(p_run_id bigint)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payment_run; n integer; open_count integer;
BEGIN
  SELECT * INTO r FROM payment_run WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment run % not found', p_run_id; END IF;
  IF coalesce(r.status,'') <> 'draft' THEN
    RAISE EXCEPTION 'Run % is % — items can only be added to a draft run', p_run_id, r.status;
  END IF;

  INSERT INTO payment_run_item(payment_run_id, payee_name, amount, ccy, status,
                               supplier_invoice_id)
  SELECT p_run_id, coalesce(s.name, 'Supplier ' || si.supplier_id),
         si.gross_total - coalesce((SELECT sum(pa.amount) FROM payment_allocation pa
                                     WHERE pa.supplier_invoice_id = si.id), 0),
         si.ccy, 'pending', si.id
    FROM supplier_invoice si
    LEFT JOIN supplier s ON s.id = si.supplier_id
   WHERE si.entity_id = r.entity_id
     AND si.ccy = r.ccy
     AND coalesce(si.status,'') = 'posted'
     AND si.gross_total - coalesce((SELECT sum(pa.amount) FROM payment_allocation pa
                                     WHERE pa.supplier_invoice_id = si.id), 0) > 0
     AND NOT EXISTS (SELECT 1 FROM payment_run_item pri
                      WHERE pri.payment_run_id = p_run_id
                        AND pri.supplier_invoice_id = si.id);
  GET DIAGNOSTICS n = ROW_COUNT;

  -- The fix. An empty run that looks assembled is one someone goes on to
  -- approve, and the reason it is empty matters: no payables at all is a
  -- different problem from payables in another currency.
  IF n = 0 THEN
    SELECT count(*) INTO open_count
      FROM supplier_invoice si
     WHERE si.entity_id = r.entity_id AND coalesce(si.status,'') = 'posted'
       AND si.gross_total - coalesce((SELECT sum(pa.amount) FROM payment_allocation pa
                                       WHERE pa.supplier_invoice_id = si.id), 0) > 0;
    IF open_count = 0 THEN
      RAISE EXCEPTION 'There are no open payables for that entity, so nothing was added to the run';
    END IF;
    RAISE EXCEPTION 'Nothing was added: there are % open payable(s) for that entity but none in %. Either change the run currency or pay them on a separate run.',
      open_count, r.ccy;
  END IF;

  UPDATE payment_run
     SET item_count = (SELECT count(*) FROM payment_run_item WHERE payment_run_id = p_run_id),
         total = (SELECT round(coalesce(sum(amount),0),2) FROM payment_run_item
                   WHERE payment_run_id = p_run_id)
   WHERE id = p_run_id;

  PERFORM ea_audit(r.entity_id, 'payment_run', p_run_id, 'open payables added to run',
                   n || ' item(s)');
  RETURN n;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- A STANDING CHECK FOR THE SAME PATTERN
-- ─────────────────────────────────────────────────────────────────────
-- Any function that returns a row count and can return zero without saying so
-- is a candidate for the same fault. This lists them, so the next one is found
-- deliberately rather than by a user believing something happened.
CREATE OR REPLACE FUNCTION silent_noop_candidates()
RETURNS TABLE(function_name text, returns text, raises_on_zero boolean, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.proname,
         pg_get_function_result(p.oid),
         (p.prosrc ~* 'IF\s+\w+\s*=\s*0\s+THEN'),
         CASE WHEN (p.prosrc ~* 'IF\s+\w+\s*=\s*0\s+THEN')
              THEN 'reports when nothing matched'
              ELSE 'CAN RETURN ZERO SILENTLY — a caller may report success' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND pg_get_function_result(p.oid) IN ('integer','bigint')
     AND p.prosrc LIKE '%GET DIAGNOSTICS%ROW_COUNT%'
   ORDER BY (p.prosrc ~* 'IF\s+\w+\s*=\s*0\s+THEN'), p.proname;
$$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('ts_entry_approve','add_open_payables_to_run',
                         'silent_noop_candidates')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

SELECT function_name, raises_on_zero, note FROM silent_noop_candidates();
