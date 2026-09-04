-- =====================================================================
-- AFFINITY CORE — WRITE LAYER, BATCH 2: TIME, TASKS AND PROCEDURES
--
-- Batch 1 covered the Entity Admin registers. This covers the things staff
-- do daily: recording time, raising and completing tasks, and running a
-- procedure against an entity.
--
-- Same rules as batch 1: SECURITY DEFINER, granted to `authenticated` only,
-- audit trail on every write, and validation that refuses what would quietly
-- produce a wrong figure.
--
-- Run AFTER 058. Safe to re-run.
-- =====================================================================

-- ── A tasks table ────────────────────────────────────────────────────
-- Tasks were previously front-end only. The Tasks module and the "＋ Task"
-- button on an Activity item both need somewhere to put them.
CREATE TABLE IF NOT EXISTS task (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        text NOT NULL,
  category     text,
  entity_label text,
  entity_id    bigint REFERENCES entity(id),
  assignee     text,
  raised_by    text NOT NULL DEFAULT current_app_user(),
  due_date     date,
  priority     text DEFAULT 'Normal',
  status       text NOT NULL DEFAULT 'Open',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by text
);
CREATE INDEX IF NOT EXISTS ix_task_status   ON task(status);
CREATE INDEX IF NOT EXISTS ix_task_assignee ON task(assignee);

-- ── Timesheets ───────────────────────────────────────────────────────
-- Time is the basis of WIP and therefore of billing, so the validations here
-- are deliberately firmer than elsewhere.
CREATE OR REPLACE FUNCTION ts_entry_add(
  p_staff_id bigint, p_entry_date date, p_entity_label text, p_matter text,
  p_entry_type text, p_hours numeric, p_billable boolean DEFAULT true,
  p_rate numeric DEFAULT NULL, p_narrative text DEFAULT NULL)
RETURNS timesheet_entry LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r timesheet_entry; day_total numeric;
BEGIN
  IF p_hours IS NULL OR p_hours <= 0 THEN
    RAISE EXCEPTION 'Time recorded must be greater than zero';
  END IF;
  IF p_hours > 24 THEN
    RAISE EXCEPTION 'Cannot record more than 24 hours in a single entry';
  END IF;
  IF p_entry_date IS NULL THEN RAISE EXCEPTION 'Date is required'; END IF;
  IF p_entry_date > current_date THEN
    RAISE EXCEPTION 'Time cannot be recorded against a future date';
  END IF;
  IF coalesce(trim(p_entity_label),'') = '' THEN
    RAISE EXCEPTION 'Time must be recorded against an entity';
  END IF;
  IF p_billable AND coalesce(trim(p_narrative),'') = '' THEN
    RAISE EXCEPTION 'Billable time needs a narrative — it will appear on the client invoice';
  END IF;

  INSERT INTO timesheet_entry(staff_id, entry_date, entity_label, matter, entry_type,
                              units, hours, billable, rate, value, status, narrative)
  VALUES (p_staff_id, p_entry_date, trim(p_entity_label), p_matter, p_entry_type,
          round(p_hours * 10), p_hours, p_billable, p_rate,
          round(coalesce(p_rate,0) * p_hours, 2), 'Draft', p_narrative)
  RETURNING * INTO r;

  -- More than a working day against one person is usually a mistyped decimal.
  -- Warn rather than block: long days happen, and a hard stop would be wrong.
  SELECT sum(hours) INTO day_total FROM timesheet_entry
   WHERE staff_id = p_staff_id AND entry_date = p_entry_date;
  IF day_total > 16 THEN
    RAISE NOTICE 'That is % hours recorded on % — check the entry', day_total, p_entry_date;
  END IF;

  PERFORM ea_audit(NULL, 'timesheet_entry', r.id, 'time recorded',
                   trim(p_entity_label) || ' · ' || p_hours || 'h');
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ts_entry_update(
  p_id bigint, p_hours numeric, p_matter text, p_narrative text, p_billable boolean)
RETURNS timesheet_entry LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r timesheet_entry;
BEGIN
  SELECT * INTO r FROM timesheet_entry WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Time entry % not found', p_id; END IF;
  -- Once time is approved it has been billed or is about to be. Amending it
  -- silently would change a client's bill after the event.
  IF r.status IN ('Approved','Billed') THEN
    RAISE EXCEPTION 'That entry is % and can no longer be amended', lower(r.status);
  END IF;
  IF p_hours IS NOT NULL AND p_hours <= 0 THEN
    RAISE EXCEPTION 'Time recorded must be greater than zero';
  END IF;

  UPDATE timesheet_entry
     SET hours = coalesce(p_hours, hours),
         units = round(coalesce(p_hours, hours) * 10),
         value = round(coalesce(rate,0) * coalesce(p_hours, hours), 2),
         matter = coalesce(p_matter, matter),
         narrative = coalesce(p_narrative, narrative),
         billable = coalesce(p_billable, billable)
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'timesheet_entry', p_id, 'time amended', r.entity_label);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ts_entry_submit(p_staff_id bigint, p_from date, p_to date)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  UPDATE timesheet_entry SET status = 'Submitted'
   WHERE staff_id = p_staff_id AND entry_date BETWEEN p_from AND p_to AND status = 'Draft';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'There is no draft time to submit for that period'; END IF;
  PERFORM ea_audit(NULL, 'timesheet_entry', NULL, 'time submitted',
                   n || ' entries, ' || p_from || ' to ' || p_to);
  RETURN n;
END $$;

-- Approval is a separate act by a different person, so it is its own function.
CREATE OR REPLACE FUNCTION ts_entry_approve(p_ids bigint[], p_approve boolean, p_reason text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
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
  PERFORM ea_audit(NULL, 'timesheet_entry', NULL,
                   CASE WHEN p_approve THEN 'time approved' ELSE 'time returned' END,
                   n || ' entries' || coalesce(' — ' || p_reason, ''));
  RETURN n;
END $$;

-- ── Tasks ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION task_add(
  p_title text, p_category text DEFAULT NULL, p_entity_label text DEFAULT NULL,
  p_entity_id bigint DEFAULT NULL, p_assignee text DEFAULT NULL,
  p_due_date date DEFAULT NULL, p_priority text DEFAULT 'Normal', p_notes text DEFAULT NULL)
RETURNS task LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r task;
BEGIN
  IF coalesce(trim(p_title),'') = '' THEN RAISE EXCEPTION 'A task needs a title'; END IF;
  INSERT INTO task(title, category, entity_label, entity_id, assignee, due_date, priority, notes)
  VALUES (trim(p_title), p_category, p_entity_label, p_entity_id, p_assignee,
          p_due_date, coalesce(p_priority,'Normal'), p_notes)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity_id, 'task', r.id, 'task raised', trim(p_title));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION task_set_status(p_id bigint, p_status text, p_notes text DEFAULT NULL)
RETURNS task LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r task;
BEGIN
  IF p_status NOT IN ('Open','In progress','Blocked','Complete','Cancelled') THEN
    RAISE EXCEPTION 'Unknown task status: %', p_status;
  END IF;
  UPDATE task
     SET status = p_status,
         notes = coalesce(p_notes, notes),
         completed_at = CASE WHEN p_status IN ('Complete','Cancelled') THEN now() ELSE NULL END,
         completed_by = CASE WHEN p_status IN ('Complete','Cancelled') THEN current_app_user() ELSE NULL END
   WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'task', p_id, 'task ' || lower(p_status), r.title);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION task_reassign(p_id bigint, p_assignee text)
RETURNS task LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r task;
BEGIN
  UPDATE task SET assignee = p_assignee WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'task', p_id, 'task reassigned', r.title || ' to ' || p_assignee);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION task_list(p_assignee text DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, title text, category text, entity_label text, assignee text,
              raised_by text, due_date date, priority text, status text, notes text,
              created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, title, category, entity_label, assignee, raised_by, due_date,
         priority, status, notes, created_at
    FROM task
   WHERE (p_assignee IS NULL OR assignee = p_assignee)
     AND (p_status IS NULL OR status = p_status)
   ORDER BY (status = 'Complete'), due_date NULLS LAST, created_at DESC;
$$;

-- ── Notifications ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notification_add(
  p_ntype text, p_title text, p_body text DEFAULT NULL,
  p_who text DEFAULT NULL, p_mod text DEFAULT NULL)
RETURNS notification LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r notification;
BEGIN
  IF coalesce(trim(p_title),'') = '' THEN RAISE EXCEPTION 'A notification needs a title'; END IF;
  INSERT INTO notification(t, ntype, title, body, who, mod)
  VALUES (now(), coalesce(p_ntype,'info'), trim(p_title), p_body,
          coalesce(p_who, current_app_user()), p_mod)
  RETURNING * INTO r;
  RETURN r;
END $$;

-- ── Procedure runs ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_run_start(
  p_proc text, p_title text, p_entity_label text, p_total integer, p_assignee text DEFAULT NULL)
RETURNS procedure_run LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r procedure_run;
BEGIN
  IF coalesce(trim(p_proc),'') = '' THEN RAISE EXCEPTION 'A procedure must be identified'; END IF;
  INSERT INTO procedure_run(proc, title, entity_label, started, step, total, assignee, status)
  VALUES (p_proc, p_title, p_entity_label, current_date, 0,
          coalesce(p_total,1), coalesce(p_assignee, current_app_user()), 'In progress')
  RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'procedure_run', r.id, 'procedure started',
                   coalesce(p_title, p_proc) || coalesce(' · ' || p_entity_label, ''));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION proc_run_advance(p_id bigint, p_step integer DEFAULT NULL)
RETURNS procedure_run LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r procedure_run;
BEGIN
  SELECT * INTO r FROM procedure_run WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedure run % not found', p_id; END IF;
  IF r.status <> 'In progress' THEN
    RAISE EXCEPTION 'That run is % and cannot be advanced', lower(r.status);
  END IF;

  UPDATE procedure_run
     SET step = least(coalesce(p_step, r.step + 1), r.total)
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'procedure_run', p_id, 'procedure step',
                   'step ' || r.step || ' of ' || r.total);
  RETURN r;
END $$;

-- Completing a run moves it to history, so Active runs shows only live work.
CREATE OR REPLACE FUNCTION proc_run_complete(p_id bigint, p_result text DEFAULT 'Completed')
RETURNS procedure_history LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE run procedure_run; h procedure_history;
BEGIN
  SELECT * INTO run FROM procedure_run WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedure run % not found', p_id; END IF;
  IF run.step < run.total THEN
    RAISE EXCEPTION 'That procedure is at step % of % — complete the remaining steps first',
      run.step, run.total;
  END IF;

  INSERT INTO procedure_history(proc, title, entity_label, done_date, dur, done_by, result)
  VALUES (run.proc, run.title, run.entity_label, current_date,
          (current_date - run.started)::text || ' days', current_app_user(), p_result)
  RETURNING * INTO h;

  UPDATE procedure_run SET status = 'Complete' WHERE id = p_id;
  PERFORM ea_audit(NULL, 'procedure_run', p_id, 'procedure completed',
                   coalesce(run.title, run.proc));
  RETURN h;
END $$;

CREATE OR REPLACE FUNCTION proc_run_abandon(p_id bigint, p_reason text)
RETURNS procedure_run LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r procedure_run;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for abandoning a procedure';
  END IF;
  UPDATE procedure_run SET status = 'Abandoned' WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedure run % not found', p_id; END IF;
  PERFORM ea_audit(NULL, 'procedure_run', p_id, 'procedure abandoned', p_reason);
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
       AND (p.proname LIKE 'ts_%' OR p.proname LIKE 'task_%'
            OR p.proname LIKE 'proc_run_%' OR p.proname LIKE 'notification_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON task FROM PUBLIC, anon;
GRANT SELECT ON task TO authenticated;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS write_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND (p.proname LIKE 'ts_entry%' OR p.proname LIKE 'task_%'
        OR p.proname LIKE 'proc_run_%' OR p.proname LIKE 'notification_add')
 ORDER BY p.proname;
