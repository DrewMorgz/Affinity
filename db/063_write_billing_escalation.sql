-- =====================================================================
-- AFFINITY CORE — WRITE LAYER, BATCH 6: BILLING TIME, ESCALATIONS
--
-- Closes the last actions that could be built without a decision or a third
-- party. Two of these are worth the detail:
--
--   Billing approved WIP to an invoice is the one workflow that ties the two
--   halves of the system together — time recorded becomes revenue billed —
--   and it has to be atomic, or time gets marked billed against an invoice
--   that was never created.
--
--   Escalation had no policy behind it, so rather than invent one this gives a
--   mechanism: an escalation raises a high-priority task and records what it
--   came from. Who it routes to remains Affinity's decision.
--
-- Run AFTER 062. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- BILLING APPROVED TIME
-- ─────────────────────────────────────────────────────────────────────
-- Takes approved, billable, unbilled time for an entity and produces a draft
-- invoice from it: one line per matter, with the hours and value summarised.
--
-- Everything happens in one function so it is one transaction. If the invoice
-- fails to create, no time is marked billed; if marking fails, the invoice does
-- not survive either. Half-billed WIP is the failure that costs real money —
-- either the client is not billed for work done, or is billed twice.
-- The output column names changed during development, and CREATE OR REPLACE
-- cannot change a function's return type — the same trap the engine's own
-- migrations hit. Drop first so this file applies cleanly however many times
-- it has been run before.
DROP FUNCTION IF EXISTS bill_wip_to_invoice(bigint, text, date, char);
DROP FUNCTION IF EXISTS wip_available(text);

CREATE OR REPLACE FUNCTION bill_wip_to_invoice(
  p_entity bigint, p_entity_label text DEFAULT NULL,
  p_invoice_date date DEFAULT NULL, p_ccy char(3) DEFAULT 'GBP')
RETURNS TABLE(invoice_id bigint, line_count integer, total_hours numeric, total_value numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  inv     invoice;
  lbl     text := coalesce(p_entity_label, (SELECT name FROM entity WHERE id = p_entity));
  n_lines integer := 0;
  t_hours numeric := 0;
  t_value numeric := 0;
  r       record;
BEGIN
  IF lbl IS NULL THEN RAISE EXCEPTION 'Unknown entity'; END IF;

  -- Only approved, billable, unbilled time is billable. Draft or submitted
  -- time has not been through approval, so billing it would bypass the
  -- control that approval exists to provide.
  SELECT count(*), coalesce(sum(te.hours),0), coalesce(sum(te.value),0)
    INTO n_lines, t_hours, t_value
    FROM timesheet_entry te
   WHERE te.entity_label = lbl AND te.billable AND te.status = 'Approved';

  IF n_lines = 0 THEN
    RAISE EXCEPTION 'There is no approved billable time for % to invoice', lbl;
  END IF;

  INSERT INTO invoice(entity_id, invoice_date, ccy, net_total, vat_total, gross_total, status)
  VALUES (p_entity, coalesce(p_invoice_date, current_date), upper(coalesce(p_ccy,'GBP')),
          0, 0, 0, 'draft')
  RETURNING * INTO inv;

  -- One line per matter rather than per entry: a client invoice listing 40
  -- six-minute entries is not a document anyone wants to receive.
  FOR r IN
    SELECT coalesce(te.matter, 'Professional services') AS matter_name,
           sum(te.hours) AS matter_hours, sum(te.value) AS matter_value
      FROM timesheet_entry te
     WHERE te.entity_label = lbl AND te.billable AND te.status = 'Approved'
     GROUP BY coalesce(te.matter, 'Professional services')
     ORDER BY 1
  LOOP
    INSERT INTO invoice_line(invoice_id, description, net, vat, gross)
    VALUES (inv.id,
            r.matter_name || ' — ' || round(r.matter_hours, 2) || ' hours',
            round(r.matter_value, 2), 0, round(r.matter_value, 2));
  END LOOP;

  UPDATE invoice i SET
    net_total   = (SELECT coalesce(sum(il.net),0)   FROM invoice_line il WHERE il.invoice_id = inv.id),
    vat_total   = (SELECT coalesce(sum(il.vat),0)   FROM invoice_line il WHERE il.invoice_id = inv.id),
    gross_total = (SELECT coalesce(sum(il.gross),0) FROM invoice_line il WHERE il.invoice_id = inv.id)
   WHERE i.id = inv.id;

  -- Mark the time billed only now, in the same transaction as the invoice.
  UPDATE timesheet_entry te SET status = 'Billed'
   WHERE te.entity_label = lbl AND te.billable AND te.status = 'Approved';

  PERFORM ea_audit(p_entity, 'invoice', inv.id, 'WIP billed',
                   lbl || ': ' || round(t_hours,2) || ' hours, ' || t_value);

  RETURN QUERY SELECT inv.id,
                      (SELECT count(*)::integer FROM invoice_line il WHERE il.invoice_id = inv.id),
                      round(t_hours, 2), round(t_value, 2);
END $$;

-- What is available to bill, so the button can say so before it is pressed.
CREATE OR REPLACE FUNCTION wip_available(p_entity_label text DEFAULT NULL)
RETURNS TABLE(entity_label text, entries bigint, hours numeric, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT te.entity_label, count(*), round(coalesce(sum(te.hours),0),2),
         round(coalesce(sum(te.value),0),2)
    FROM timesheet_entry te
   WHERE te.billable AND te.status = 'Approved'
     AND (p_entity_label IS NULL OR te.entity_label = p_entity_label)
   GROUP BY te.entity_label
   ORDER BY 4 DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- ESCALATION
-- ─────────────────────────────────────────────────────────────────────
-- There is no escalation policy recorded — who a matter escalates to, and
-- after how long, is Affinity's decision and not one to guess. What this gives
-- is the MECHANISM: raising an escalation creates a high-priority task that
-- records what it came from, so nothing is lost while the policy is settled.
--
-- When a policy does exist, the assignee can be derived here rather than
-- being asked for.
CREATE OR REPLACE FUNCTION escalate(
  p_what text, p_source_module text, p_entity_label text DEFAULT NULL,
  p_entity_id bigint DEFAULT NULL, p_assignee text DEFAULT NULL,
  p_reason text DEFAULT NULL)
RETURNS task LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r task;
BEGIN
  IF coalesce(trim(p_what),'') = '' THEN
    RAISE EXCEPTION 'Say what is being escalated';
  END IF;
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for escalating — it is the first thing the person receiving it will ask';
  END IF;

  INSERT INTO task(title, category, entity_label, entity_id, assignee,
                   due_date, priority, status, notes)
  VALUES ('ESCALATED: ' || trim(p_what),
          coalesce(p_source_module, 'Escalation'),
          p_entity_label, p_entity_id, p_assignee,
          current_date + 2,                       -- an escalation is not a next-month task
          'High', 'Open',
          'Escalated by ' || current_app_user() || ' on ' || current_date ||
          coalesce(' from ' || p_source_module, '') || E'\n' || trim(p_reason))
  RETURNING * INTO r;

  PERFORM ea_audit(p_entity_id, 'task', r.id, 'ESCALATED',
                   trim(p_what) || ' — ' || trim(p_reason));
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- STATUTORY STAGE
-- ─────────────────────────────────────────────────────────────────────
-- Statutory work moves Not started → Prepared → Submitted, which prepare and
-- submit already do individually. This advances by one stage from wherever it
-- is, for the button that just says "advance".
CREATE OR REPLACE FUNCTION stat_filing_advance(p_id bigint, p_reference text DEFAULT NULL)
RETURNS statutory_filing LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r statutory_filing;
BEGIN
  SELECT * INTO r FROM statutory_filing WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Filing % not found', p_id; END IF;

  IF r.status = 'Submitted' THEN
    RAISE EXCEPTION 'That filing was already submitted on %', r.submitted_at::date;
  ELSIF r.status = 'Prepared' THEN
    RETURN stat_filing_submit(p_id, p_reference);
  ELSE
    RETURN stat_filing_prepare(p_id, p_reference);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- CONSOLIDATION IMPORT ROLLBACK
-- ─────────────────────────────────────────────────────────────────────
-- Trial balance imports were not being recorded at all, so there was nothing
-- to roll back. This gives them a register, which is what makes rollback
-- meaningful: an import can be superseded and the previous one restored.
CREATE TABLE IF NOT EXISTS tb_import (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_ref   text NOT NULL,
  entity_id    bigint NOT NULL REFERENCES entity(id),
  period       char(7) NOT NULL,
  rows_loaded  integer NOT NULL DEFAULT 0,
  checksum     text,
  status       text NOT NULL DEFAULT 'Posted',
  imported_by  text NOT NULL DEFAULT current_app_user(),
  imported_at  timestamptz NOT NULL DEFAULT now(),
  note         text
);
CREATE INDEX IF NOT EXISTS ix_tb_import_entity ON tb_import(entity_id, period);

CREATE OR REPLACE FUNCTION tb_import_record(
  p_entity bigint, p_period char(7), p_rows integer,
  p_checksum text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS tb_import LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r tb_import; ref text;
BEGIN
  ref := 'TB-' || to_char(now(),'YYYY') || '-' ||
         lpad((coalesce((SELECT count(*) FROM tb_import),0) + 1)::text, 4, '0');

  -- Re-importing the same entity and period supersedes the earlier file rather
  -- than sitting alongside it, so a period cannot end up double counted.
  UPDATE tb_import SET status = 'Superseded'
   WHERE entity_id = p_entity AND period = p_period AND status = 'Posted';

  INSERT INTO tb_import(import_ref, entity_id, period, rows_loaded, checksum, note)
  VALUES (ref, p_entity, p_period, coalesce(p_rows,0), p_checksum, p_note)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'tb_import', r.id, 'trial balance imported',
                   ref || ' · ' || p_period || ' · ' || coalesce(p_rows,0) || ' rows');
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION tb_import_rollback(p_id bigint, p_reason text)
RETURNS tb_import LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r tb_import; restored tb_import;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for rolling back an import';
  END IF;
  SELECT * INTO r FROM tb_import WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import % not found', p_id; END IF;
  IF r.status <> 'Posted' THEN
    RAISE EXCEPTION 'That import is % and cannot be rolled back', lower(r.status);
  END IF;

  UPDATE tb_import SET status = 'Rolled back',
         note = coalesce(note || ' | ','') || 'Rolled back: ' || p_reason
   WHERE id = p_id RETURNING * INTO r;

  -- Bring back the one it superseded, so the period is not left with nothing.
  UPDATE tb_import SET status = 'Posted'
   WHERE entity_id = r.entity_id AND period = r.period AND status = 'Superseded'
     AND id = (SELECT max(id) FROM tb_import
                WHERE entity_id = r.entity_id AND period = r.period AND status = 'Superseded')
  RETURNING * INTO restored;

  PERFORM ea_audit(r.entity_id, 'tb_import', p_id, 'IMPORT ROLLED BACK',
                   r.import_ref || ' — ' || p_reason ||
                   coalesce(' — restored ' || restored.import_ref, ' — no earlier import to restore'));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION tb_import_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, import_ref text, entity_id bigint, entity_name text, period char(7),
              rows_loaded integer, checksum text, status text, imported_by text,
              imported_at timestamptz, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT t.id, t.import_ref, t.entity_id, e.name, t.period, t.rows_loaded, t.checksum,
         t.status, t.imported_by, t.imported_at, t.note
    FROM tb_import t LEFT JOIN entity e ON e.id = t.entity_id
   WHERE p_entity IS NULL OR t.entity_id = p_entity
   ORDER BY t.imported_at DESC;
$$;

-- ── Grants: authenticated only ───────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname IN ('bill_wip_to_invoice','wip_available','escalate','stat_filing_advance')
            OR p.proname LIKE 'tb_import%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON tb_import FROM PUBLIC, anon;
GRANT SELECT ON tb_import TO authenticated;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS write_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND (p.proname IN ('bill_wip_to_invoice','wip_available','escalate','stat_filing_advance')
        OR p.proname LIKE 'tb_import%')
 ORDER BY p.proname;
