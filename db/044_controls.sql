-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CONTROLS  (044)
--   * RBAC: users, roles, per-entity access
--   * Row-level security: users only see entities they are granted
--   * Segregation of duties: maker<>checker on approval; conflicting-role guard
--   * SECURITY DEFINER hardening of mutating functions
-- In Supabase, wire current_app_user() to auth.uid()/JWT; here it reads a GUC.
-- =====================================================================

CREATE TABLE IF NOT EXISTS app_role (
    code text PRIMARY KEY, name text NOT NULL );
INSERT INTO app_role(code,name) VALUES
 ('admin','Administrator'),('preparer','Preparer'),('approver','Approver'),
 ('accountant','Accountant'),('viewer','Read-only') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS app_user (
    username text PRIMARY KEY, full_name text, is_active boolean NOT NULL DEFAULT true );

CREATE TABLE IF NOT EXISTS app_user_role (
    username text NOT NULL REFERENCES app_user(username),
    role_code text NOT NULL REFERENCES app_role(code),
    PRIMARY KEY (username, role_code) );

CREATE TABLE IF NOT EXISTS user_entity_access (
    username text NOT NULL REFERENCES app_user(username),
    entity_id bigint NOT NULL REFERENCES entity(id),
    PRIMARY KEY (username, entity_id) );

-- conflicting role pairs (segregation of duties matrix)
CREATE TABLE IF NOT EXISTS sod_conflict ( role_a text NOT NULL, role_b text NOT NULL );
INSERT INTO sod_conflict(role_a,role_b) VALUES ('preparer','approver') ON CONFLICT DO NOTHING;

-- session identity (replace body with auth.uid() lookup in Supabase)
CREATE OR REPLACE FUNCTION current_app_user() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT current_setting('affinity.current_user', true) $$;

CREATE OR REPLACE FUNCTION set_app_user(p_username text) RETURNS text
LANGUAGE sql AS $$ SELECT set_config('affinity.current_user', p_username, false) $$;

CREATE OR REPLACE FUNCTION is_app_admin(p_user text) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM app_user_role WHERE username=p_user AND role_code='admin') $$;

CREATE OR REPLACE FUNCTION user_has_entity_access(p_user text, p_entity bigint) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(is_app_admin(p_user), false)
        OR EXISTS (SELECT 1 FROM user_entity_access WHERE username=p_user AND entity_id=p_entity) $$;

-- assign a role with SoD conflict guard
CREATE OR REPLACE FUNCTION assign_user_role(p_user text, p_role text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_conflict text;
BEGIN
    SELECT CASE WHEN c.role_a=p_role THEN c.role_b ELSE c.role_a END INTO v_conflict
    FROM sod_conflict c
    JOIN app_user_role ur ON ur.username=p_user
       AND ur.role_code = CASE WHEN c.role_a=p_role THEN c.role_b ELSE c.role_a END
    WHERE p_role IN (c.role_a, c.role_b) LIMIT 1;
    IF v_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'Segregation of duties: % cannot also hold % for user %', p_role, v_conflict, p_user;
    END IF;
    INSERT INTO app_user_role(username,role_code) VALUES (p_user,p_role) ON CONFLICT DO NOTHING;
END $$;

-- maker<>checker on journal approval (redefines 042 with SoD)
CREATE OR REPLACE FUNCTION approve_journal(p_journal bigint, p_approver text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_creator text;
BEGIN
    SELECT created_by INTO v_creator FROM journal WHERE id=p_journal AND status='draft';
    IF v_creator IS NULL THEN RETURN false; END IF;
    IF v_creator = p_approver THEN
        RAISE EXCEPTION 'Segregation of duties: % cannot approve their own journal %', p_approver, p_journal;
    END IF;
    UPDATE journal SET status='posted', approved_by=p_approver, posted_at=now()
      WHERE id=p_journal AND status='draft';
    RETURN FOUND;
END $$;

-- row-level security: restrict ledger + sales/purchase ledgers by entity access
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS journal_entity_access ON journal;
CREATE POLICY journal_entity_access ON journal FOR ALL
  USING (user_has_entity_access(current_app_user(), entity_id));

ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_entity_access ON invoice;
CREATE POLICY invoice_entity_access ON invoice FOR ALL
  USING (user_has_entity_access(current_app_user(), entity_id));

ALTER TABLE supplier_invoice ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sinv_entity_access ON supplier_invoice;
CREATE POLICY sinv_entity_access ON supplier_invoice FOR ALL
  USING (user_has_entity_access(current_app_user(), entity_id));

-- application role for the API to connect as (subject to RLS; not a superuser)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='affinity_app') THEN CREATE ROLE affinity_app NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO affinity_app;
GRANT SELECT ON journal, journal_line, invoice, supplier_invoice, account, entity,
                app_user, app_user_role, user_entity_access, app_role TO affinity_app;
GRANT EXECUTE ON FUNCTION current_app_user(), set_app_user(text),
                is_app_admin(text), user_has_entity_access(text,bigint) TO affinity_app;

-- ---- SECURITY DEFINER hardening of mutating functions (run search_path-pinned) ----
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname = ANY(ARRAY[
            'post_journal','reverse_journal','apply_receipt','close_year','approve_journal','reject_journal',
            'post_with_approval','capitalise_asset','post_depreciation','impair_asset','transfer_asset',
            'post_intercompany_charge','draw_ic_loan','accrue_ic_loan_interest','repay_ic_loan',
            'settle_intercompany','post_tp_charge','run_recurring_journals','run_deferrals',
            'create_prepayment','create_accrual','import_bank_statement','import_mt940','auto_match_by_rules',
            'post_bank_item','apply_withholding_tax','record_reverse_charge','post_statutory_adjustment'])
    LOOP
        EXECUTE 'ALTER FUNCTION '||r.sig||' SECURITY DEFINER SET search_path = public';
    END LOOP;
END $$;
