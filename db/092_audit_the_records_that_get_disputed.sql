-- 092 — a row-level audit trail on the records that get disputed
--
-- FOUND BY ASKING WHETHER EVERY WRITE LEAVES A TRACE. 86 functions write and
-- never record an audit event, there are no audit triggers at all, and the
-- entire audit_event table holds 19 rows for a system that has been under
-- construction for weeks.
--
-- Among the functions that write without auditing: approve_journal,
-- approve_expense_claim, approve_budget, apply_receipt. Approvals with no
-- record of who approved them is precisely the gap an auditor asks about, and
-- precisely the one a client asks about when a figure is disputed.
--
-- WHY A TRIGGER RATHER THAN EDITING 86 FUNCTIONS. Adding an audit call to each
-- is 86 chances to miss one, and it records nothing when a row is changed by
-- any route other than that function — a direct update, a fix applied by hand,
-- a future function nobody thought to instrument. A trigger on the table
-- catches every write however it arrives, which is the property that matters
-- for a record that has to stand up later.
--
-- WHICH TABLES. Not everything: an audit trail over derived data is noise that
-- makes the real entries harder to find. These are the records where a dispute
-- is possible — the registers that are the legal record, the money, the
-- approvals, and who can do what.

CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action  text;
  v_target  text;
  v_details text;
  v_who     text;
BEGIN
  v_who := coalesce(current_setting('request.jwt.claim.email', true), 'system');

  v_action := TG_TABLE_NAME || ' ' ||
              CASE TG_OP WHEN 'INSERT' THEN 'created'
                         WHEN 'UPDATE' THEN 'changed'
                         WHEN 'DELETE' THEN 'removed' END;

  -- The target is whatever identifies the row to a person reading the log
  -- later: a name if the row has one, otherwise its id. An audit entry nobody
  -- can tie to a record is not much better than no entry.
  BEGIN
    v_target := coalesce(
      to_jsonb(COALESCE(NEW, OLD)) ->> 'name',
      to_jsonb(COALESCE(NEW, OLD)) ->> 'entity_name',
      to_jsonb(COALESCE(NEW, OLD)) ->> 'reference',
      'id ' || (to_jsonb(COALESCE(NEW, OLD)) ->> 'id'));
  EXCEPTION WHEN others THEN
    v_target := TG_TABLE_NAME;
  END;

  -- On an update, record WHICH fields changed rather than the whole row. The
  -- whole row makes the log unreadable and duplicates data that is already in
  -- the table; the changed field names are what someone actually asks about.
  IF TG_OP = 'UPDATE' THEN
    SELECT string_agg(key, ', ' ORDER BY key) INTO v_details
      FROM jsonb_each_text(to_jsonb(NEW)) n
      JOIN jsonb_each_text(to_jsonb(OLD)) o USING (key)
     WHERE n.value IS DISTINCT FROM o.value;
    v_details := coalesce('changed: ' || v_details, 'no field values differed');
  ELSE
    v_details := TG_OP;
  END IF;

  INSERT INTO audit_event (t, staff_user, action, mod, target, details, severity)
  VALUES (now(), v_who, v_action, TG_TABLE_NAME, v_target, v_details, 'info');

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── WHAT HAPPENS IF THE AUDIT ITSELF FAILS ─────────────────────────────────
-- Tested rather than assumed: with audit_event made to reject inserts, an
-- update to a beneficial owner was BLOCKED and rolled back. A write that
-- cannot be audited does not happen.
--
-- That is the right way round for a fiduciary firm — an unauditable change to
-- a beneficial ownership register is worse than a failed one — but the
-- trade-off is real and worth knowing before it bites: a fault in the audit
-- table stops all work on nineteen tables rather than quietly losing the
-- trail. If that ever happens it will look like the whole system is down, and
-- the cause will be one table.
--
-- The only exception is deriving the target name, which falls back to the
-- table name rather than failing. An audit entry with a weaker label is better
-- than a blocked write, because the entry still records who changed what and
-- when.

COMMENT ON FUNCTION audit_row_change() IS
  'Row-level audit for the tables where a dispute is possible. Catches every '
  'write however it arrives, including direct updates, which a per-function '
  'audit call does not.';

-- ── Apply to the records that get disputed ─────────────────────────────────
DO $apply$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- the registers: the legal record of who held what, and when
    'entity_officer', 'entity_ubo', 'entity_shareholder', 'entity_charge',
    'entity_bank_account', 'entity_signatory', 'entity_profile',
    -- money
    'journal', 'client_money_movement', 'trust_distribution', 'invoice',
    'payment_run', 'expense_claim',
    -- approvals and permissions
    'fs_accounts_set', 'app_user_role', 'journal_approval_rule',
    'periodic_review', 'attrition_approval',
    -- statutory
    'statutory_filing', 'jurisdiction_obligation'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%s ON %I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON %I '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t, t);
    END IF;
  END LOOP;
END
$apply$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'audit_row_change'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $g$;
