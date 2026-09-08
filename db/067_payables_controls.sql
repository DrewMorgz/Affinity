-- =====================================================================
-- AFFINITY CORE — 067: PAYABLES CONTROLS AND READ LAYER
--
-- Building the interfaces for purchase-to-pay surfaced something more
-- important than the screens:
--
--   NEITHER PAYMENT RUN APPROVAL NOR EXPENSE CLAIM APPROVAL ENFORCES
--   SEGREGATION OF DUTIES.
--
-- approve_payment_run checks only that the run is in draft and has items.
-- approve_expense_claim checks only that the claim was submitted. Nothing
-- stops the same person creating a payment run and approving it, or approving
-- their own expense claim.
--
-- The engine's journal approval DOES enforce this — approve_journal raises
-- "Segregation of duties: % cannot approve their own journal". So this is an
-- inconsistency rather than a deliberate decision, and it sits on the two
-- paths that move money out of the firm. Someone approving their own expense
-- claim is the textbook fraud route; a self-approved payment run is worse.
--
-- Rather than edit the engine's functions, this wraps them, matching the
-- pattern already used for bk_journal_approve.
--
-- Run AFTER 066. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- SEGREGATION OF DUTIES
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pay_run_approve(p_run_id bigint)
RETURNS payment_run LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payment_run; me text;
BEGIN
  me := current_app_user();
  SELECT * INTO r FROM payment_run WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment run % not found', p_run_id; END IF;

  -- The control the engine's function does not apply. A payment run moves
  -- money out of the firm; the person who assembled it must not be the person
  -- who releases it.
  IF r.created_by IS NOT NULL AND lower(r.created_by) = lower(me) THEN
    RAISE EXCEPTION 'You created this payment run — it must be approved by someone else';
  END IF;

  PERFORM approve_payment_run(p_run_id, me);
  SELECT * INTO r FROM payment_run WHERE id = p_run_id;
  PERFORM ea_audit(NULL, 'payment_run', p_run_id, 'payment run approved',
                   'run ' || p_run_id || ' approved by ' || me ||
                   ' (created by ' || coalesce(r.created_by,'unknown') || ')');
  RETURN r;
END $$;

-- Executing is a third act. Approving releases the run; executing pays it.
-- Keeping them apart means an approved run can still be stopped.
CREATE OR REPLACE FUNCTION pay_run_execute(p_run_id bigint)
RETURNS payment_run LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payment_run;
BEGIN
  SELECT * INTO r FROM payment_run WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment run % not found', p_run_id; END IF;
  IF coalesce(r.status,'') <> 'approved' THEN
    RAISE EXCEPTION 'Run % is % — only an approved run can be executed', p_run_id, r.status;
  END IF;

  PERFORM execute_payment_run(p_run_id, current_app_user());
  SELECT * INTO r FROM payment_run WHERE id = p_run_id;
  PERFORM ea_audit(NULL, 'payment_run', p_run_id, 'PAYMENT RUN EXECUTED',
                   'run ' || p_run_id || ' paid by ' || current_app_user());
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION expense_claim_approve(p_claim_id bigint)
RETURNS expense_claim LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE c expense_claim; me text; claimant text;
BEGIN
  me := current_app_user();
  SELECT * INTO c FROM expense_claim WHERE id = p_claim_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense claim % not found', p_claim_id; END IF;

  -- Approving your own expense claim is the textbook route, and the engine's
  -- function permitted it. Matched against the staff record where the claim
  -- carries a staff id rather than a name.
  -- employee_id references the employee table, not sys_user. Checked, because
  -- matching against the wrong table would silently never find the claimant and
  -- the guard would never fire — a control that quietly does nothing.
  SELECT em.name INTO claimant FROM employee em WHERE em.id = c.employee_id;
  IF claimant IS NOT NULL AND lower(claimant) = lower(me) THEN
    RAISE EXCEPTION 'This is your own expense claim — it must be approved by someone else';
  END IF;

  PERFORM approve_expense_claim(p_claim_id, me);
  SELECT * INTO c FROM expense_claim WHERE id = p_claim_id;
  PERFORM ea_audit(NULL, 'expense_claim', p_claim_id, 'expense claim approved',
                   'claim ' || p_claim_id || ' for ' || coalesce(claimant,'unknown') ||
                   ' approved by ' || me);
  RETURN c;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- READ LAYER
-- ─────────────────────────────────────────────────────────────────────
-- Column names read from the database. A first attempt guessed seven of them
-- wrong in this one file (supplier, po_date, run_id, staff_id, action_type and
-- others), which is why the read layer is written after checking rather than
-- from memory.
CREATE OR REPLACE FUNCTION po_list(p_entity bigint DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, po_number text,
              po_date date, ccy char(3), net_total numeric, gross_total numeric,
              status text, lines bigint, received bigint, outstanding bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.entity_id, e.name, p.po_number, p.po_date, p.ccy, p.net_total,
         p.gross_total, p.status,
         count(l.id),
         count(l.id) FILTER (WHERE coalesce(l.qty_received,0) >= coalesce(l.quantity,0)),
         count(l.id) FILTER (WHERE coalesce(l.qty_received,0) < coalesce(l.quantity,0))
    FROM purchase_order p
    LEFT JOIN entity e ON e.id = p.entity_id
    LEFT JOIN purchase_order_line l ON l.po_id = p.id
   WHERE (p_entity IS NULL OR p.entity_id = p_entity)
     AND (p_status IS NULL OR p.status = p_status)
   GROUP BY p.id, p.entity_id, e.name, p.po_number, p.po_date, p.ccy,
            p.net_total, p.gross_total, p.status
   ORDER BY p.po_date DESC;
$$;

-- The status and who did what at each step, because the control is only worth
-- having if it is visible.
CREATE OR REPLACE FUNCTION pay_runs_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, run_date date,
              ccy char(3), status text, items bigint, total numeric,
              created_by text, approved_by text,
              self_approved boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id, r.entity_id, e.name, r.run_date, r.ccy, r.status,
         count(i.id), round(coalesce(sum(i.amount),0),2),
         r.created_by, r.approved_by,
         -- Flagged rather than hidden. Any run already approved by the person
         -- who created it predates the control and should be looked at.
         (r.approved_by IS NOT NULL AND r.created_by IS NOT NULL
          AND lower(r.approved_by) = lower(r.created_by))
    FROM payment_run r
    LEFT JOIN entity e ON e.id = r.entity_id
    LEFT JOIN payment_run_item i ON i.payment_run_id = r.id
   GROUP BY r.id, r.entity_id, e.name, r.run_date, r.ccy, r.status,
            r.created_by, r.approved_by
   ORDER BY r.run_date DESC;
$$;

CREATE OR REPLACE FUNCTION expense_claims_list(p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, employee_id bigint, employee_name text, entity_id bigint,
              claim_date date, ccy char(3), total numeric, status text, lines bigint,
              approved_by text, self_approved boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.employee_id, s.name, c.entity_id, c.claim_date, c.ccy,
         round(coalesce(c.gross_total,0),2), c.status,
         count(l.id), c.approved_by,
         -- Flagged rather than hidden: a claim already approved by the
         -- claimant predates the control and needs looking at.
         (c.approved_by IS NOT NULL AND s.name IS NOT NULL
          AND lower(c.approved_by) = lower(s.name))
    FROM expense_claim c
    LEFT JOIN employee s ON s.id = c.employee_id
    LEFT JOIN expense_claim_line l ON l.claim_id = c.id
   WHERE p_status IS NULL OR c.status = p_status
   GROUP BY c.id, c.employee_id, s.name, c.entity_id, c.claim_date, c.ccy,
            c.gross_total, c.status, c.approved_by
   ORDER BY c.claim_date DESC;
$$;

-- Credit control: what is owed, how old, and what has been done about it.
CREATE OR REPLACE FUNCTION collections_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(customer_id bigint, customer_name text, ccy char(3),
              credit_limit numeric, payment_terms_days integer, on_hold boolean,
              invoices bigint, outstanding numeric, oldest_days integer,
              last_action date, last_level text, actions bigint,
              over_limit boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT cu.id, cu.name, cu.ccy, cu.credit_limit, cu.payment_terms_days, cu.on_hold,
         count(DISTINCT i.id),
         round(coalesce(sum(i.gross_total),0),2),
         max((current_date - i.invoice_date))::integer,
         max(a.action_date),
         (SELECT a2.level FROM collection_action a2
           WHERE a2.customer_id = cu.id ORDER BY a2.action_date DESC LIMIT 1),
         count(DISTINCT a.id),
         -- Over the agreed credit limit. Worth its own flag: continuing to
         -- work for a client already past their limit is a decision, not an
         -- oversight.
         (cu.credit_limit IS NOT NULL AND cu.credit_limit > 0
          AND coalesce(sum(i.gross_total),0) > cu.credit_limit)
    FROM customer cu
    LEFT JOIN invoice i ON i.entity_id = cu.owner_entity_id
                       AND coalesce(i.status,'') = 'posted'
    LEFT JOIN collection_action a ON a.customer_id = cu.id
   WHERE p_entity IS NULL OR cu.owner_entity_id = p_entity
   GROUP BY cu.id, cu.name, cu.ccy, cu.credit_limit, cu.payment_terms_days, cu.on_hold
  HAVING coalesce(sum(i.gross_total),0) > 0
   ORDER BY 8 DESC;
$$;

-- What needs attention across payables and receivables.
CREATE OR REPLACE FUNCTION payables_overview(p_entity bigint DEFAULT NULL)
RETURNS TABLE(area text, headline text, count_value bigint,
              amount_value numeric, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- Self-approved runs are the first thing to surface: they are the control
  -- failure this file exists to close, and any historic ones need reviewing.
  RETURN QUERY
  SELECT 'Payment runs'::text, 'approved by the person who created them'::text,
         count(*)::bigint, round(coalesce(sum(r.total),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM pay_runs_list(p_entity) r WHERE r.self_approved;

  RETURN QUERY
  SELECT 'Expense claims'::text, 'approved by the claimant'::text,
         count(*)::bigint, round(coalesce(sum(c.total),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM expense_claims_list(NULL) c WHERE c.self_approved;

  RETURN QUERY
  SELECT 'Payment runs'::text, 'awaiting approval'::text,
         count(*)::bigint, round(coalesce(sum(r.total),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM pay_runs_list(p_entity) r WHERE coalesce(r.status,'') = 'draft';

  RETURN QUERY
  SELECT 'Expense claims'::text, 'awaiting approval'::text,
         count(*)::bigint, round(coalesce(sum(c.total),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM expense_claims_list('submitted') c;

  RETURN QUERY
  SELECT 'Purchase orders'::text, 'with goods not yet received'::text,
         count(*)::bigint, round(coalesce(sum(p.net_total),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM po_list(p_entity, NULL) p WHERE p.outstanding > 0;

  RETURN QUERY
  SELECT 'Credit control'::text, 'customers with debt over 90 days'::text,
         count(*)::bigint, round(coalesce(sum(c.outstanding),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM collections_list(p_entity) c WHERE c.oldest_days > 90;

  RETURN QUERY
  SELECT 'Credit control'::text, 'customers over their credit limit'::text,
         count(*)::bigint, round(coalesce(sum(c.outstanding),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM collections_list(p_entity) c WHERE c.over_limit;
END $$;

-- ── Grants: authenticated only ───────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('pay_run_approve','pay_run_execute','expense_claim_approve',
                         'po_list','pay_runs_list','expense_claims_list',
                         'collections_list','payables_overview')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('pay_run_approve','pay_run_execute','expense_claim_approve',
                     'po_list','pay_runs_list','expense_claims_list',
                     'collections_list','payables_overview')
 ORDER BY p.proname;
