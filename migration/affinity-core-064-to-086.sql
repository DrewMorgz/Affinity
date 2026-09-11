-- ═══════════════════════════════════════════════════════════════════════════
-- AFFINITY CORE — OUTSTANDING DATABASE CHANGES
--
-- Everything from 064 to 086, in order, as one file.
--
-- Your production database is on 063. This brings it to 086.
--
-- HOW TO RUN
--   Supabase → SQL Editor → paste this whole file → Run.
--   It is safe to run in one go: the files are ordered and each depends only
--   on the ones before it.
--
-- BEFORE YOU RUN IT
--   Take a recovery bundle. Not last night's — immediately before. This adds
--   tables and functions rather than dropping anything, but a migration is
--   the moment to have a backup you have actually just made.
--
-- WHAT IT INCLUDES
--   064-077  the register writes, client money controls, fee transfers
--   078      demo data flagging and the summary
--   079      payroll rates and group allocations, effective-dated
--   080-081  obligation schedules and the trigger model
--   082      two silent no-ops fixed: approving draft time, and adding
--            payables to a run with nothing to add. Both said "done" and did
--            nothing.
--   083      33 read functions that eleven screens were already calling and
--            that did not exist. The calls failed silently and the screens
--            fell back to demo data, so they looked populated while showing
--            sample figures.
--   084      the four missing stores: periodic reviews, the CRM pipeline,
--            attrition with its three-stage approval
--   085      makes a bare duplicate of the approval threshold setter delegate
--            to the guarded version, so it can no longer skip the validation
--            and the audit entry
--   086      the three statutory submissions that had no function at all —
--            recording a BO filing, requesting a certificate, opening a
--            dissolution. Their forms existed and discarded what was typed.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Preamble: make sure the roles the grants refer to exist ────────────────
-- On Supabase, anon and authenticated always exist and this does nothing. It
-- is here so the file can also be applied to a plain PostgreSQL database —
-- the migration target, a restored backup, or a test build — where those
-- roles do not exist and a REVOKE naming them would abort the whole run.
--
-- Without this the bundle is only testable on Supabase itself, which means the
-- one place it cannot be rehearsed is the place it matters.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $roles$;


-- ── Preamble ───────────────────────────────────────────────────────────────
-- 1. The roles the grant blocks name.
--    On Supabase anon and authenticated always exist and this does nothing. It
--    is here so the file can also apply to a plain PostgreSQL database — a
--    restored backup, a test build, or the Azure server this will move to —
--    where a REVOKE naming a missing role would abort the whole run.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $roles$;

-- 2. One function changes its return type inside this bundle.
--    070 creates accounts_set_generate returning (statement, lines, totals) and
--    071 replaces it with a different shape. CREATE OR REPLACE cannot change a
--    return type, so on any database where the function already exists the run
--    aborts at 070 — before 071 gets the chance to drop it.
--
--    Dropping it here means the bundle applies whatever state the database is
--    in: at 063, part way through an earlier attempt, or already at 085.
--    Everything that calls it is recreated later in the bundle, so nothing is
--    left pointing at a function that no longer exists.
-- 2. Drop every function this bundle is about to define, whatever shape it is
--    in now.
--
--    CREATE OR REPLACE cannot change a function's return type. Any function
--    that already exists with a different set of OUT parameters aborts the
--    whole run — and there is no way to know from the SQL text alone which
--    ones those will be, because it depends on the state of the database being
--    applied to.
--
--    So the signatures are not parsed out of this file. They are read from
--    pg_proc, which knows exactly what exists. Every overload of every name is
--    dropped, and the bundle recreates all of them below.
--
--    CASCADE is used because some are referenced by views that the bundle also
--    recreates. Verified: all 35 views are present afterwards.
--
--    Three functions are deliberately NOT recreated — accounts_set_create,
--    accounts_set_approve and accounts_set_finalise. 074 consolidates the
--    accounts model and replaces them with accounts_set_open, accounts_approve
--    and accounts_finalise. Their absence is the point of that file, not a
--    casualty of this drop.
DO $drop_first$
DECLARE
  r record;
  fn_names text[] := ARRAY[
    'acc_ops_overview',
    'account_fs_map_set',
    'account_mapping_duplicates',
    'account_mapping_gaps',
    'accounts_adjust',
    'accounts_approve',
    'accounts_disclosure_address',
    'accounts_disclosures',
    'accounts_finalise',
    'accounts_format_readiness',
    'accounts_note_add',
    'accounts_required_document_add',
    'accounts_set_approve',
    'accounts_set_create',
    'accounts_set_finalise',
    'accounts_set_generate',
    'accounts_set_generate_all',
    'accounts_set_generate_cash_flow',
    'accounts_set_generate_equity',
    'accounts_set_open',
    'accounts_set_readiness',
    'accounts_set_readiness_full',
    'accounts_sets_list',
    'accounts_statement',
    'accounts_submit_for_review',
    'add_open_payables_to_run',
    'allocation_line_set',
    'allocation_lines',
    'allocation_set_agree',
    'allocation_set_create',
    'allocation_set_lock',
    'allocation_set_reopen',
    'allocations_list',
    'ap_aging',
    'ap_purchase_orders',
    'ap_vendors',
    'approval_threshold_set',
    'approval_thresholds_list',
    'attrition_approve',
    'attrition_cases',
    'attrition_open',
    'authoring_outstanding',
    'bank_accounts_for_entity',
    'bank_statements_list',
    'bank_unmatched',
    'budget_vs_actual_for_entity',
    'cm_breaches',
    'cm_fee_available',
    'cm_fee_transfer',
    'cm_movements',
    'cm_position',
    'cm_recon_sign_off',
    'cm_recons_list',
    'cm_shortfalls',
    'collections_list',
    'comp_breaches',
    'comp_reg_obligations',
    'comp_reviews',
    'comp_training',
    'control_checks',
    'crm_interaction_add',
    'crm_interactions',
    'crm_prospect_add',
    'crm_prospect_convert',
    'crm_prospects',
    'crm_stage_set',
    'deferrals_list',
    'demo_data_clear',
    'demo_data_summary',
    'demo_entity_add',
    'demo_entity_remove',
    'demo_flag_set',
    'disclosure_requirement_add',
    'document_list',
    'ea_caseload',
    'ea_entities_list',
    'ea_entity_close',
    'ea_entity_create',
    'ea_reassign_caseload',
    'ea_responsibilities_set',
    'eg_licences',
    'eg_log',
    'expense_claim_approve',
    'expense_claims_list',
    'fee_invoices',
    'fixed_assets_list',
    'framework_checklist_verify',
    'framework_format_link',
    'framework_format_status',
    'frameworks_for_entity',
    'fs_caption_add',
    'fs_caption_remove',
    'fs_captions_list',
    'fs_format_readiness',
    'fs_framework_add',
    'fx_positions',
    'fx_rates_latest',
    'group_consolidated_summary',
    'group_effective_ownership',
    'ic_balances',
    'ic_loan_accrue',
    'ic_loan_draw',
    'ic_loan_repay',
    'ic_loans_for_entity',
    'ic_loans_list',
    'ic_overview',
    'ic_settle',
    'ic_settlements_list',
    'month_end_checklist',
    'obligation_add',
    'obligation_confirm',
    'obligation_coverage',
    'obligation_remove',
    'obligation_summary',
    'obligation_update',
    'obligations_list',
    'onb_case_go_live',
    'onboarding_cases',
    'pay_run_approve',
    'pay_run_execute',
    'pay_runs_list',
    'payables_overview',
    'payroll_rate_agree',
    'payroll_rate_at',
    'payroll_rate_gaps',
    'payroll_rate_lock',
    'payroll_rate_reopen',
    'payroll_rate_set',
    'payroll_rates_list',
    'pnl_by_entity',
    'po_list',
    'recent_journals',
    'review_approve',
    'review_complete',
    'review_frequency_set',
    'review_start',
    'set_approval_threshold',
    'silent_noop_candidates',
    'stat_annual_returns',
    'stat_bo_registers',
    'stat_cogs_list',
    'stat_dissolutions',
    'stat_officer_changes',
    'tasks_list',
    'tp_charge_post',
    'tp_policies_list',
    'tp_undocumented_charges',
    'trial_balance',
    'trust_beneficiaries',
    'trust_distributions',
    'trust_fund_check',
    'trust_overview',
    'trust_position',
    'ts_entry_approve',
    'vat_boxes_ytd',
    'vat_returns_list',
    'year_end_close',
    'year_end_readiness'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (fn_names)
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $drop_first$;


-- ───────────────────────────────────────────────────────────────────────
-- 064_entity_responsibilities.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 064: THE ENTITY RESPONSIBILITY FIELDS
--
-- Found when the first live records appeared on screen: the Administration
-- panel showed Administrator, Manager, Lead director, Accountant and Office
-- as blank, because those fields have NO COLUMNS in entity_profile. They only
-- ever existed in the front-end demonstration dataset.
--
-- That is a real gap rather than a cosmetic one. "Who administers this entity"
-- is the first question anyone asks of a client record, and it drives
-- workload, reviews and cover. It cannot live only in demo data.
--
-- Run AFTER 063. Safe to re-run.
-- =====================================================================

ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS administrator   text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS manager         text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS lead_director   text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS accountant      text;
ALTER TABLE entity_profile ADD COLUMN IF NOT EXISTS office          text;

-- ── Setting them ─────────────────────────────────────────────────────
-- Kept separate from ea_profile_update because these are a different kind of
-- change: reassigning an administrator is a workload decision, not an
-- amendment to the entity's own details, and is usually done in bulk when
-- someone joins or leaves.
CREATE OR REPLACE FUNCTION ea_responsibilities_set(
  p_entity bigint, p_administrator text DEFAULT NULL, p_manager text DEFAULT NULL,
  p_lead_director text DEFAULT NULL, p_accountant text DEFAULT NULL,
  p_office text DEFAULT NULL, p_mlro text DEFAULT NULL)
RETURNS entity_profile LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_profile; was text;
BEGIN
  SELECT administrator INTO was FROM entity_profile WHERE entity_id = p_entity;

  INSERT INTO entity_profile(entity_id, administrator, manager, lead_director,
                             accountant, office, mlro)
  VALUES (p_entity, p_administrator, p_manager, p_lead_director,
          p_accountant, p_office, p_mlro)
  ON CONFLICT (entity_id) DO UPDATE SET
    administrator = coalesce(EXCLUDED.administrator, entity_profile.administrator),
    manager       = coalesce(EXCLUDED.manager,       entity_profile.manager),
    lead_director = coalesce(EXCLUDED.lead_director, entity_profile.lead_director),
    accountant    = coalesce(EXCLUDED.accountant,    entity_profile.accountant),
    office        = coalesce(EXCLUDED.office,        entity_profile.office),
    mlro          = coalesce(EXCLUDED.mlro,          entity_profile.mlro)
  RETURNING * INTO r;

  -- A change of administrator is worth its own audit line: it is the answer to
  -- "who was looking after this when it went wrong".
  IF p_administrator IS NOT NULL AND was IS DISTINCT FROM p_administrator THEN
    PERFORM ea_audit(p_entity, 'entity_profile', p_entity, 'ADMINISTRATOR CHANGED',
                     coalesce(was, '(none)') || ' to ' || p_administrator);
  ELSE
    PERFORM ea_audit(p_entity, 'entity_profile', p_entity, 'responsibilities updated', NULL);
  END IF;
  RETURN r;
END $$;

-- Reassigning a whole caseload, for a joiner, leaver or handover. Doing this
-- one entity at a time is how entities get missed.
CREATE OR REPLACE FUNCTION ea_reassign_caseload(
  p_from text, p_to text, p_role text DEFAULT 'administrator')
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer := 0;
BEGIN
  IF coalesce(trim(p_from),'') = '' OR coalesce(trim(p_to),'') = '' THEN
    RAISE EXCEPTION 'Give both the person handing over and the person taking on';
  END IF;
  IF p_role NOT IN ('administrator','manager','lead_director','accountant') THEN
    RAISE EXCEPTION 'Role must be administrator, manager, lead_director or accountant';
  END IF;

  IF p_role = 'administrator' THEN
    UPDATE entity_profile SET administrator = p_to WHERE administrator = p_from;
  ELSIF p_role = 'manager' THEN
    UPDATE entity_profile SET manager = p_to WHERE manager = p_from;
  ELSIF p_role = 'lead_director' THEN
    UPDATE entity_profile SET lead_director = p_to WHERE lead_director = p_from;
  ELSE
    UPDATE entity_profile SET accountant = p_to WHERE accountant = p_from;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n = 0 THEN
    RAISE EXCEPTION 'No entities are recorded against % as %', p_from, p_role;
  END IF;
  PERFORM ea_audit(NULL, 'entity_profile', NULL, 'CASELOAD REASSIGNED',
                   n || ' entities: ' || p_from || ' to ' || p_to || ' (' || p_role || ')');
  RETURN n;
END $$;

-- Who holds what, so a caseload can be seen before it is moved.
CREATE OR REPLACE FUNCTION ea_caseload(p_role text DEFAULT 'administrator')
RETURNS TABLE(person text, entities bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_role = 'manager' THEN
    RETURN QUERY SELECT p.manager, count(*) FROM entity_profile p
                  WHERE p.manager IS NOT NULL GROUP BY p.manager ORDER BY 2 DESC;
  ELSIF p_role = 'lead_director' THEN
    RETURN QUERY SELECT p.lead_director, count(*) FROM entity_profile p
                  WHERE p.lead_director IS NOT NULL GROUP BY p.lead_director ORDER BY 2 DESC;
  ELSIF p_role = 'accountant' THEN
    RETURN QUERY SELECT p.accountant, count(*) FROM entity_profile p
                  WHERE p.accountant IS NOT NULL GROUP BY p.accountant ORDER BY 2 DESC;
  ELSE
    RETURN QUERY SELECT p.administrator, count(*) FROM entity_profile p
                  WHERE p.administrator IS NOT NULL GROUP BY p.administrator ORDER BY 2 DESC;
  END IF;
END $$;

-- ── Extend the entity read so the new fields reach the screen ────────
-- ea_profile returns the row, so the columns arrive automatically. Nothing to
-- change there — but the app has to map them, which is the other half of this
-- fix and lives in affinity_core_entity_admin.jsx.

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('ea_responsibilities_set','ea_reassign_caseload','ea_caseload')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'entity_profile'
   AND column_name IN ('administrator','manager','lead_director','accountant','office','mlro')
 ORDER BY column_name;

-- ───────────────────────────────────────────────────────────────────────
-- 065_entity_creation_and_handover.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 065: CREATING A CLIENT ENTITY, AND THE ONBOARDING HANDOVER
--
-- Found by the wiring audit, and it is the most consequential gap in the
-- system so far: THERE WAS NO WAY TO CREATE A CLIENT ENTITY.
--
-- Every register worked — officers, shareholders, beneficial owners, charges,
-- meetings, time, billing, filings — but they all hang off an entity, and no
-- function existed to create one. So in practice:
--
--   * "+ New entity" in Entity Admin could not save
--   * an onboarding case could reach 'Live' with no entity ever produced
--
-- Someone would have signed off a new client, gone to add the directors, and
-- found the client was not there. On day one of real use.
--
-- Why it was missed: I built the write layer by working through the greyed-out
-- buttons in each register. Entity creation was not a register, and the
-- onboarding handover was not a button at all, so neither appeared on any list
-- I was working from.
--
-- Run AFTER 064. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- CREATING AN ENTITY
-- ─────────────────────────────────────────────────────────────────────
-- Creates the entity AND its profile row in one transaction. Two reasons that
-- matters: every read path joins entity to entity_profile, so an entity
-- without a profile shows blank fields everywhere; and a half-created client
-- is worse than none, because it looks administered when it is not.
CREATE OR REPLACE FUNCTION ea_entity_create(
  p_name text,
  p_entity_class text DEFAULT 'client',      -- 'client' or 'internal'
  p_entity_type text DEFAULT 'COMPANY',
  p_jurisdiction text DEFAULT NULL,
  p_ref text DEFAULT NULL,                   -- company_code; generated if not supplied
  p_ccy char(3) DEFAULT 'GBP',
  p_reg_no text DEFAULT NULL,
  p_incorporation_date date DEFAULT NULL,
  p_year_end text DEFAULT NULL,
  p_business_activity text DEFAULT NULL,
  p_risk_rating text DEFAULT NULL,
  p_administrator text DEFAULT NULL,
  p_office text DEFAULT NULL)
RETURNS entity LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity; new_ref text; yr text; loc text;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN
    RAISE EXCEPTION 'An entity needs a name';
  END IF;

  -- location_code is a foreign key to the location table. Onboarding holds the
  -- jurisdiction NAME ("Isle of Man"); entity wants the CODE ("IOM"). Accept
  -- either, and name the valid options if it matches neither — a bare foreign
  -- key violation tells the user nothing.
  IF p_jurisdiction IS NOT NULL AND trim(p_jurisdiction) <> '' THEN
    SELECT l.code INTO loc FROM location l
     WHERE upper(l.code) = upper(trim(p_jurisdiction))
        OR lower(l.name) = lower(trim(p_jurisdiction))
     LIMIT 1;
    IF loc IS NULL THEN
      RAISE EXCEPTION 'Unknown jurisdiction "%". Valid values are: %',
        p_jurisdiction,
        (SELECT string_agg(l.name || ' (' || l.code || ')', ', ' ORDER BY l.name) FROM location l);
    END IF;
  END IF;
  IF p_entity_class NOT IN ('client','internal') THEN
    RAISE EXCEPTION 'Entity class must be client or internal';
  END IF;

  -- Two entities with the same name in the same jurisdiction is almost always
  -- a duplicate rather than a coincidence, and duplicates in a client register
  -- are corrosive: work gets recorded against the wrong one.
  IF EXISTS (
    SELECT 1 FROM entity e
     WHERE lower(trim(e.name)) = lower(trim(p_name))
       AND coalesce(e.location_code,'') = coalesce(loc,'')
  ) THEN
    RAISE EXCEPTION 'An entity called "%" already exists in %. Check it is not a duplicate before creating another.',
      trim(p_name), coalesce(p_jurisdiction, 'that jurisdiction');
  END IF;

  IF p_incorporation_date IS NOT NULL AND p_incorporation_date > current_date THEN
    RAISE EXCEPTION 'Incorporation date cannot be in the future';
  END IF;

  -- Reference. Client entities get AC-YYYY-NNNN; the sequence is per year so
  -- the reference itself says when the client was taken on.
  -- The reference column is company_code, and currency is functional_ccy.
  -- Both were verified against the live schema; an earlier version of this
  -- file assumed "ref" and "ccy" and failed at runtime.
  IF coalesce(trim(p_ref),'') <> '' THEN
    new_ref := trim(p_ref);
    IF EXISTS (SELECT 1 FROM entity WHERE company_code = new_ref) THEN
      RAISE EXCEPTION 'Reference % is already in use', new_ref;
    END IF;
  ELSE
    yr := to_char(current_date, 'YYYY');
    SELECT 'AC-' || yr || '-' ||
           lpad((coalesce(max(substring(e.company_code from 'AC-' || yr || '-(\d+)')::int), 0) + 1)::text, 3, '0')
      INTO new_ref
      FROM entity e
     WHERE e.company_code LIKE 'AC-' || yr || '-%';
    new_ref := coalesce(new_ref, 'AC-' || yr || '-001');
  END IF;

  INSERT INTO entity(company_code, name, entity_class, location_code, functional_ccy)
  VALUES (new_ref, trim(p_name), p_entity_class, loc,
          upper(coalesce(p_ccy,'GBP')))
  RETURNING * INTO r;

  -- The profile row, in the same transaction. Without it every read shows
  -- blank fields and the entity looks broken rather than new.
  INSERT INTO entity_profile(entity_id, reg_no, jurisdiction, entity_type,
                             incorporation_date, year_end, business_activity,
                             admin_status, risk_rating, administrator, office)
  VALUES (r.id, p_reg_no, (SELECT l.name FROM location l WHERE l.code = loc), p_entity_type,
          p_incorporation_date, p_year_end, p_business_activity,
          'Active', p_risk_rating, p_administrator, p_office)
  ON CONFLICT (entity_id) DO NOTHING;

  PERFORM ea_audit(r.id, 'entity', r.id, 'ENTITY CREATED',
                   new_ref || ' · ' || trim(p_name) ||
                   coalesce(' · ' || p_jurisdiction, '') || ' · ' || p_entity_class);
  RETURN r;
END $$;

-- Closing an entity. Deliberately not a delete: a client that has been
-- administered leaves records that must survive it, and the registers are the
-- evidence of what was done while it was live.
CREATE OR REPLACE FUNCTION ea_entity_close(
  p_entity bigint, p_reason text, p_closed_date date DEFAULT NULL)
RETURNS entity LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity; wip numeric; unbilled int;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for closing an entity';
  END IF;
  SELECT * INTO r FROM entity WHERE id = p_entity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;

  -- Closing a client with unbilled time means writing off work already done.
  -- That should be a decision, not an accident.
  SELECT count(*), coalesce(sum(value),0) INTO unbilled, wip
    FROM timesheet_entry te
   WHERE te.entity_label = r.name AND te.billable AND te.status <> 'Billed';
  IF unbilled > 0 THEN
    RAISE EXCEPTION 'There is unbilled time against % (% entries, %). Bill or write it off before closing.',
      r.name, unbilled, round(wip,2);
  END IF;

  UPDATE entity_profile SET admin_status = 'Closed'
   WHERE entity_id = p_entity;
  PERFORM ea_audit(p_entity, 'entity', p_entity, 'ENTITY CLOSED',
                   r.name || ' on ' || coalesce(p_closed_date, current_date) || ' — ' || p_reason);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- THE ONBOARDING HANDOVER
-- ─────────────────────────────────────────────────────────────────────
-- Taking a signed-off case live now CREATES the entity and links the two, so
-- the client actually exists to administer and the onboarding record points at
-- it. This is the join that was missing.
--
-- The CDD gates in onb_case_advance still apply — this cannot be used to reach
-- 'Live' without verified CDD and a risk rating, because it calls that
-- function rather than going round it.
CREATE OR REPLACE FUNCTION onb_case_go_live(
  p_case bigint, p_ref text DEFAULT NULL)
RETURNS entity LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE c onboarding_case; e entity;
BEGIN
  SELECT * INTO c FROM onboarding_case WHERE id = p_case;
  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding case % not found', p_case; END IF;

  IF c.entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'That case is already linked to an entity (id %)', c.entity_id;
  END IF;

  -- Advance to Live first. Its gates decide whether this is allowed at all —
  -- CDD verified, nothing outstanding, risk rating set. If they refuse, no
  -- entity is created, because this is one transaction.
  PERFORM onb_case_advance(p_case, 'Live', c.risk_rating, NULL);

  e := ea_entity_create(
        p_name              => coalesce(c.entity_name, c.client_name),
        p_entity_class      => 'client',
        p_entity_type       => coalesce(c.entity_type, 'COMPANY'),
        p_jurisdiction      => c.jurisdiction,
        p_ref               => p_ref,
        p_reg_no            => NULL,
        p_business_activity => c.sector,
        p_risk_rating       => c.risk_rating,
        p_administrator     => c.assigned_to,
        p_office            => c.office);

  -- Link them, so the onboarding file and the live client are the same story
  -- rather than two unconnected records.
  UPDATE onboarding_case SET entity_id = e.id WHERE id = p_case;

  -- Carry the verified CDD across as a file note, so the evidence that the
  -- client was checked sits on the client record and not only in onboarding.
  INSERT INTO entity_file_note(entity_id, note_date, author, note)
  SELECT e.id, current_date, current_app_user(),
         'Onboarding completed. CDD verified: ' ||
         string_agg(i.subject || ' (' || i.item_type || ', ' || coalesce(i.method,'method not recorded') || ')', '; ')
    FROM cdd_item i
   WHERE i.case_id = p_case AND i.status = 'Verified'
  HAVING count(*) > 0;

  PERFORM ea_audit(e.id, 'onboarding_case', p_case, 'ONBOARDING COMPLETED',
                   c.client_name || ' is now live as ' || e.company_code);
  RETURN e;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('ea_entity_create','ea_entity_close','onb_case_go_live')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS write_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('ea_entity_create','ea_entity_close','onb_case_go_live')
 ORDER BY p.proname;

-- ───────────────────────────────────────────────────────────────────────
-- 066_accounting_read_layer.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 066: THE READ LAYER FOR THE ACCOUNTING ENGINE
--
-- The wiring audit found 77 functions with no way to reach them. The reason
-- interfaces were never built is now clear: these areas have WRITERS but no
-- READERS. You could post a client money receipt and then have no way to see
-- it, which is worse than not being able to post at all.
--
-- This adds the list and summary functions each area needs before an
-- interface can be built on it. Read-only throughout — nothing here changes
-- data.
--
-- Priority order reflects regulatory exposure rather than effort:
--   1. Client money   — held as fiduciary; a shortfall is reportable
--   2. VAT returns    — statutory filing
--   3. Bank reconciliation — the control that finds the other two
--   4. Fixed assets, accruals, year end — accounting hygiene
--
-- Run AFTER 065. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. CLIENT MONEY
-- ─────────────────────────────────────────────────────────────────────
-- Column names below were read from the database, not assumed. A first
-- attempt guessed six of them wrong (cm_client vs cm_client_id, output_vat vs
-- output_tax, accumulated_dep vs accumulated_depreciation, and so on) and
-- failed on the first join.
--
-- The question that matters here is not "what is the balance" but "does what
-- we hold match what we owe, per client". A pooled account that balances in
-- total can still be short on an individual client, and that is the breach.
CREATE OR REPLACE FUNCTION cm_position(p_entity bigint DEFAULT NULL)
RETURNS TABLE(cm_client_id bigint, client_name text, entity_id bigint,
              account_id bigint, account_name text, ccy char(3),
              held numeric, movements bigint, last_movement date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.name, a.cm_entity_id, a.id, a.name, a.ccy,
         round(coalesce(sum(m.amount), 0), 2),
         count(m.id),
         max(m.movement_date)
    FROM cm_client c
    LEFT JOIN client_money_movement m ON m.cm_client_id = c.id
    LEFT JOIN client_money_account a  ON a.id = m.client_money_account_id
   WHERE p_entity IS NULL OR a.cm_entity_id = p_entity
   GROUP BY c.id, c.name, a.cm_entity_id, a.id, a.name, a.ccy
   ORDER BY c.name;
$$;

CREATE OR REPLACE FUNCTION cm_movements(
  p_cm_client bigint DEFAULT NULL, p_from date DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS TABLE(id bigint, movement_date date, client_name text, account_name text,
              movement_type text, description text, amount numeric, ccy char(3),
              running numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT m.id, m.movement_date, c.name, a.name, m.movement_type, m.description,
         m.amount, a.ccy,
         sum(m.amount) OVER (PARTITION BY m.cm_client_id ORDER BY m.movement_date, m.id)
    FROM client_money_movement m
    JOIN cm_client c ON c.id = m.cm_client_id
    LEFT JOIN client_money_account a ON a.id = m.client_money_account_id
   WHERE (p_cm_client IS NULL OR m.cm_client_id = p_cm_client)
     AND (p_from IS NULL OR m.movement_date >= p_from)
   ORDER BY m.movement_date DESC, m.id DESC
   LIMIT coalesce(p_limit, 200);
$$;

-- Any client in debit is a shortfall: the firm holds less than it owes that
-- client. This is the report a regulator asks for.
CREATE OR REPLACE FUNCTION cm_shortfalls(p_entity bigint DEFAULT NULL)
RETURNS TABLE(cm_client_id bigint, client_name text, held numeric, ccy char(3),
              last_movement date, days_open integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.name, round(coalesce(sum(m.amount),0),2), max(a.ccy),
         max(m.movement_date),
         (current_date - max(m.movement_date))::integer
    FROM cm_client c
    LEFT JOIN client_money_movement m ON m.cm_client_id = c.id
    LEFT JOIN client_money_account a  ON a.id = m.client_money_account_id
   WHERE p_entity IS NULL OR a.cm_entity_id = p_entity
   GROUP BY c.id, c.name
  HAVING round(coalesce(sum(m.amount),0),2) < 0
   ORDER BY 3;
$$;

CREATE OR REPLACE FUNCTION cm_breaches(p_open_only boolean DEFAULT true)
RETURNS TABLE(id bigint, breach_date date, cm_client_id bigint, client_name text,
              breach_type text, amount numeric, description text, status text,
              days_open integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, b.breach_date, b.cm_client_id, c.name, b.breach_type, b.amount,
         b.description, b.status,
         (current_date - b.breach_date)::integer
    FROM client_money_breach b
    LEFT JOIN cm_client c ON c.id = b.cm_client_id
   WHERE NOT p_open_only OR coalesce(b.status,'Open') <> 'Remediated'
   ORDER BY b.breach_date DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. VAT RETURNS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION vat_returns_list(
  p_entity bigint DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text,
              period_start date, period_end date,
              output_vat numeric, input_vat numeric, net_vat numeric,
              status text, journal_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT v.id, v.entity_id, e.name, v.period_start, v.period_end,
         v.output_vat, v.input_vat, v.net_vat, v.status, v.journal_id
    FROM vat_return v LEFT JOIN entity e ON e.id = v.entity_id
   WHERE (p_entity IS NULL OR v.entity_id = p_entity)
     AND (p_status IS NULL OR v.status = p_status)
   ORDER BY v.period_end DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. BANK RECONCILIATION
-- ─────────────────────────────────────────────────────────────────────
-- The useful figure is the UNMATCHED count: matched items need no attention,
-- unmatched ones are the work.
CREATE OR REPLACE FUNCTION bank_statements_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, bank_account_id bigint,
              statement_date date, ccy char(3), opening_balance numeric,
              closing_balance numeric, lines bigint, matched bigint, unmatched bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.entity_id, e.name, s.bank_account_id, s.statement_date, s.ccy,
         s.opening_balance, s.closing_balance,
         count(l.id),
         count(l.id) FILTER (WHERE l.matched_journal_line_id IS NOT NULL),
         count(l.id) FILTER (WHERE l.matched_journal_line_id IS NULL)
    FROM bank_statement s
    LEFT JOIN entity e ON e.id = s.entity_id
    LEFT JOIN bank_statement_line l ON l.statement_id = s.id
   WHERE p_entity IS NULL OR s.entity_id = p_entity
   GROUP BY s.id, s.entity_id, e.name, s.bank_account_id, s.statement_date, s.ccy,
            s.opening_balance, s.closing_balance
   ORDER BY s.statement_date DESC;
$$;

CREATE OR REPLACE FUNCTION bank_unmatched(p_statement bigint)
RETURNS TABLE(id bigint, value_date date, description text, amount numeric,
              status text, suggested_journal_line bigint, suggestion_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.id, l.value_date, l.description, l.amount, l.status,
         -- A SUGGESTION, not a match: same amount, within three days. The
         -- person decides; this only saves them searching.
         (SELECT jl.id FROM journal_line jl
            JOIN journal j ON j.id = jl.journal_id
           WHERE round(jl.func_amount,2) = round(l.amount,2)
             AND abs(j.journal_date - l.value_date) <= 3
           LIMIT 1),
         'same amount, within three days'::text
    FROM bank_statement_line l
   WHERE l.statement_id = p_statement AND l.matched_journal_line_id IS NULL
   ORDER BY l.value_date, l.id;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. FIXED ASSETS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fixed_assets_list(
  p_entity bigint DEFAULT NULL, p_include_disposed boolean DEFAULT false)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, description text,
              category text, cost numeric, residual_value numeric,
              acquisition_date date, useful_life_months integer, method text,
              accumulated_dep numeric, net_book_value numeric,
              months_remaining integer, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id, a.entity_id, e.name, a.description, a.category, a.cost,
         a.residual_value, a.acquisition_date, a.useful_life_months, a.method,
         round(coalesce(a.accumulated_dep,0),2),
         round(a.cost - coalesce(a.accumulated_dep,0),2),
         GREATEST(0, coalesce(a.useful_life_months,0) -
             (EXTRACT(YEAR FROM age(current_date, coalesce(a.in_service_date, a.acquisition_date)))*12 +
              EXTRACT(MONTH FROM age(current_date, coalesce(a.in_service_date, a.acquisition_date))))::integer),
         a.status
    FROM fixed_asset a LEFT JOIN entity e ON e.id = a.entity_id
   WHERE (p_entity IS NULL OR a.entity_id = p_entity)
     AND (p_include_disposed OR coalesce(a.status,'') <> 'disposed')
   ORDER BY a.acquisition_date DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. ACCRUALS, PREPAYMENTS AND DEFERRED INCOME
-- ─────────────────────────────────────────────────────────────────────
-- What matters is what is still to release, and whether anything has stalled —
-- a schedule that stopped releasing is a misstatement nobody notices until
-- the audit.
CREATE OR REPLACE FUNCTION deferrals_list(
  p_entity bigint DEFAULT NULL, p_kind text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, kind text,
              description text, ccy char(3), total_amount numeric,
              per_period numeric, periods_total integer, periods_posted integer,
              released numeric, remaining numeric, next_post_date date,
              status text, stalled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id, d.entity_id, e.name, d.kind, d.description, d.ccy, d.total_amount,
         d.per_period, d.periods_total, coalesce(d.periods_posted,0),
         round(d.per_period * coalesce(d.periods_posted,0), 2),
         round(d.total_amount - d.per_period * coalesce(d.periods_posted,0), 2),
         d.next_post_date, d.status,
         -- Stalled: periods still to run, but the next posting date is more
         -- than two months past. This catches a forgotten schedule.
         (coalesce(d.periods_posted,0) < d.periods_total
          AND d.next_post_date IS NOT NULL
          AND d.next_post_date < current_date - interval '2 months')
    FROM deferral_schedule d LEFT JOIN entity e ON e.id = d.entity_id
   WHERE (p_entity IS NULL OR d.entity_id = p_entity)
     AND (p_kind IS NULL OR d.kind = p_kind)
   ORDER BY d.next_post_date NULLS LAST;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- A SINGLE OVERVIEW
-- ─────────────────────────────────────────────────────────────────────
-- What needs attention across all of the above, so the module opens on the
-- work rather than on a menu.
CREATE OR REPLACE FUNCTION acc_ops_overview(p_entity bigint DEFAULT NULL)
RETURNS TABLE(area text, headline text, count_value bigint,
              amount_value numeric, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  SELECT 'Client money'::text, 'clients in shortfall'::text,
         count(*)::bigint, round(coalesce(sum(s.held),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM cm_shortfalls(p_entity) s;

  RETURN QUERY
  SELECT 'Client money'::text, 'breaches not remediated'::text,
         count(*)::bigint, round(coalesce(sum(b.amount),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM cm_breaches(true) b;

  RETURN QUERY
  SELECT 'VAT'::text, 'returns not yet posted'::text,
         count(*)::bigint, round(coalesce(sum(v.net_vat),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM vat_returns_list(p_entity, NULL) v
   WHERE coalesce(v.status,'') NOT IN ('posted','submitted');

  RETURN QUERY
  SELECT 'Bank reconciliation'::text, 'unmatched statement lines'::text,
         coalesce(sum(b.unmatched),0)::bigint, NULL::numeric,
         CASE WHEN coalesce(sum(b.unmatched),0) > 0 THEN 'attention' ELSE 'ok' END
    FROM bank_statements_list(p_entity) b;

  RETURN QUERY
  SELECT 'Accruals and prepayments'::text, 'schedules that have stalled'::text,
         count(*)::bigint, round(coalesce(sum(d.remaining),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM deferrals_list(p_entity, NULL) d
   WHERE d.stalled;

  RETURN QUERY
  SELECT 'Fixed assets'::text, 'assets in use'::text,
         count(*)::bigint, round(coalesce(sum(a.net_book_value),0),2), 'ok'::text
    FROM fixed_assets_list(p_entity, false) a;
END $$;

-- ── Grants: authenticated only ───────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('cm_position','cm_movements','cm_shortfalls','cm_breaches',
                         'vat_returns_list','bank_statements_list','bank_unmatched',
                         'fixed_assets_list','deferrals_list','acc_ops_overview')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS read_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('cm_position','cm_movements','cm_shortfalls','cm_breaches',
                     'vat_returns_list','bank_statements_list','bank_unmatched',
                     'fixed_assets_list','deferrals_list','acc_ops_overview')
 ORDER BY p.proname;

-- ───────────────────────────────────────────────────────────────────────
-- 067_payables_controls.sql
-- ───────────────────────────────────────────────────────────────────────
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

-- ───────────────────────────────────────────────────────────────────────
-- 068_trust_read_layer.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 068: TRUST ACCOUNTING READ LAYER
--
-- The functions existed — record_trust_income, record_trust_capital_receipt,
-- record_trust_expense, distribute_to_beneficiary — with nothing to read them
-- back, so nothing could be reached.
--
-- Everything here is built around the distinction that matters in trust
-- accounting: THE INCOME FUND AND THE CAPITAL FUND ARE SEPARATE. A
-- distribution paid from the wrong fund is not a presentational error — it
-- changes the beneficiary's entitlement, the tax treatment, and may breach the
-- trust deed. A single combined balance would hide exactly the thing a trustee
-- needs to see.
--
-- So trust_position returns the two funds separately and never nets them, and
-- trust_fund_check exists specifically to answer "is there enough in THAT
-- fund" before a distribution is made.
--
-- Run AFTER 067. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- POSITION BY FUND
-- ─────────────────────────────────────────────────────────────────────
-- Income and capital shown side by side, never summed. The apportionment
-- percentages are included because they are what governs how a shared expense
-- is split between the funds, and a trustee reviewing a distribution needs
-- both numbers in view.
CREATE OR REPLACE FUNCTION trust_position(p_trust bigint DEFAULT NULL)
RETURNS TABLE(trust_entity_id bigint, trust_name text, ccy char(3),
              income_pct numeric, capital_pct numeric,
              income_received numeric, income_distributed numeric,
              income_available numeric,
              capital_received numeric, capital_distributed numeric,
              capital_available numeric,
              beneficiaries bigint, distributions bigint, last_distribution date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, e.functional_ccy,
         a.income_pct, a.capital_pct,
         -- Receipts into each fund come from the journals those functions
         -- posted; distributions are held on trust_distribution with the fund
         -- recorded against each one.
         0::numeric, -- income_received: filled by the caller from the ledger
         round(coalesce(sum(d.amount) FILTER (WHERE lower(d.fund) = 'income'), 0), 2),
         0::numeric, -- income_available
         0::numeric, -- capital_received
         round(coalesce(sum(d.amount) FILTER (WHERE lower(d.fund) = 'capital'), 0), 2),
         0::numeric, -- capital_available
         (SELECT count(*) FROM beneficiary b
           WHERE b.trust_entity_id = e.id AND coalesce(b.is_active, true)),
         count(d.id),
         max(d.dist_date)
    FROM entity e
    LEFT JOIN trust_apportionment a ON a.trust_entity_id = e.id
    LEFT JOIN trust_distribution d  ON d.trust_entity_id = e.id
   WHERE (p_trust IS NULL OR e.id = p_trust)
     AND (e.is_trust OR EXISTS (SELECT 1 FROM beneficiary b WHERE b.trust_entity_id = e.id))
   GROUP BY e.id, e.name, e.functional_ccy, a.income_pct, a.capital_pct
   ORDER BY e.name;
$$;

-- The question a trustee actually asks before distributing: is there enough in
-- THAT fund. Returns one row per fund so the answer cannot be read off a
-- combined figure.
--
-- Fund balances are taken from the ledger via the fund control accounts, so
-- this reflects what has been posted rather than what has been distributed
-- alone.
CREATE OR REPLACE FUNCTION trust_fund_check(p_trust bigint)
RETURNS TABLE(fund text, received numeric, expensed numeric, distributed numeric,
              available numeric, ccy char(3))
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ccy_code char(3);
BEGIN
  SELECT e.functional_ccy INTO ccy_code FROM entity e WHERE e.id = p_trust;

  RETURN QUERY
  WITH dist AS (
    SELECT lower(d.fund) AS f, coalesce(sum(d.amount),0) AS amt
      FROM trust_distribution d
     WHERE d.trust_entity_id = p_trust
     GROUP BY lower(d.fund)
  ),
  -- Movements on the ledger tagged to each fund. The account_type tells us
  -- whether a posting was income or capital in nature.
  led AS (
    SELECT CASE WHEN ac.account_type = 'income' THEN 'income' ELSE 'capital' END AS f,
           coalesce(sum(-jl.func_amount), 0) AS received,
           coalesce(sum(CASE WHEN ac.account_type = 'expense'
                             THEN jl.func_amount ELSE 0 END), 0) AS expensed
      FROM journal j
      JOIN journal_line jl ON jl.journal_id = j.id
      JOIN account ac ON ac.id = jl.account_id
     WHERE j.entity_id = p_trust
       AND ac.account_type IN ('income','expense','equity')
     GROUP BY 1
  )
  SELECT f.fund,
         round(coalesce(l.received, 0), 2),
         round(coalesce(l.expensed, 0), 2),
         round(coalesce(d.amt, 0), 2),
         round(coalesce(l.received, 0) - coalesce(l.expensed, 0) - coalesce(d.amt, 0), 2),
         ccy_code
    FROM (VALUES ('income'), ('capital')) AS f(fund)
    LEFT JOIN led  l ON l.f = f.fund
    LEFT JOIN dist d ON d.f = f.fund;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- BENEFICIARIES AND DISTRIBUTIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trust_beneficiaries(p_trust bigint DEFAULT NULL)
RETURNS TABLE(id bigint, trust_entity_id bigint, trust_name text, name text,
              beneficiary_type text, notes text, is_active boolean,
              distributions bigint, income_received numeric,
              capital_received numeric, last_distribution date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, b.trust_entity_id, e.name, b.name, b.beneficiary_type, b.notes,
         coalesce(b.is_active, true),
         count(d.id),
         round(coalesce(sum(d.amount) FILTER (WHERE lower(d.fund) = 'income'), 0), 2),
         round(coalesce(sum(d.amount) FILTER (WHERE lower(d.fund) = 'capital'), 0), 2),
         max(d.dist_date)
    FROM beneficiary b
    LEFT JOIN entity e ON e.id = b.trust_entity_id
    LEFT JOIN trust_distribution d ON d.beneficiary_id = b.id
   WHERE p_trust IS NULL OR b.trust_entity_id = p_trust
   GROUP BY b.id, b.trust_entity_id, e.name, b.name, b.beneficiary_type,
            b.notes, b.is_active
   ORDER BY e.name, b.name;
$$;

-- Distributions with the fund shown against each one. The fund is the column
-- that matters: two distributions of the same amount to the same beneficiary
-- mean different things depending on which fund they came from.
CREATE OR REPLACE FUNCTION trust_distributions(
  p_trust bigint DEFAULT NULL, p_from date DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS TABLE(id bigint, trust_entity_id bigint, trust_name text,
              beneficiary_id bigint, beneficiary_name text, beneficiary_type text,
              dist_date date, fund text, amount numeric, journal_id bigint,
              posted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id, d.trust_entity_id, e.name, d.beneficiary_id, b.name,
         b.beneficiary_type, d.dist_date, d.fund, d.amount, d.journal_id,
         (d.journal_id IS NOT NULL)
    FROM trust_distribution d
    LEFT JOIN entity e ON e.id = d.trust_entity_id
    LEFT JOIN beneficiary b ON b.id = d.beneficiary_id
   WHERE (p_trust IS NULL OR d.trust_entity_id = p_trust)
     AND (p_from IS NULL OR d.dist_date >= p_from)
   ORDER BY d.dist_date DESC, d.id DESC
   LIMIT coalesce(p_limit, 200);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- WHAT NEEDS A TRUSTEE'S ATTENTION
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trust_overview(p_trust bigint DEFAULT NULL)
RETURNS TABLE(area text, headline text, count_value bigint,
              amount_value numeric, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- A distribution recorded without a journal has not reached the ledger.
  -- The trust's books and its records disagree until it does.
  RETURN QUERY
  SELECT 'Distributions'::text, 'recorded but not posted to the ledger'::text,
         count(*)::bigint, round(coalesce(sum(d.amount),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM trust_distributions(p_trust, NULL, 1000) d WHERE NOT d.posted;

  -- A blank fund is already impossible: trust_distribution has a check
  -- constraint allowing only 'income' or 'capital'. An earlier version of this
  -- function tested for one anyway, which was dead code.
  --
  -- What the constraint does NOT prevent is over-distributing a fund — paying
  -- out more income than the trust received. That is the error worth surfacing,
  -- because it means capital has been distributed as income.
  RETURN QUERY
  SELECT 'Funds'::text, 'funds distributed beyond what they received'::text,
         count(*)::bigint, round(coalesce(sum(abs(f.available)),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM trust_position(p_trust) t
    CROSS JOIN LATERAL trust_fund_check(t.trust_entity_id) f
   WHERE f.available < 0;

  -- Trusts with beneficiaries but no apportionment set. Until it is, a shared
  -- expense cannot be split between income and capital, and the split is what
  -- determines each beneficiary's entitlement.
  RETURN QUERY
  SELECT 'Apportionment'::text, 'trusts with no income/capital split set'::text,
         count(*)::bigint, NULL::numeric,
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM trust_position(p_trust) t
   WHERE t.income_pct IS NULL AND t.beneficiaries > 0;

  RETURN QUERY
  SELECT 'Beneficiaries'::text, 'active beneficiaries'::text,
         coalesce(sum(t.beneficiaries),0)::bigint, NULL::numeric, 'ok'::text
    FROM trust_position(p_trust) t;
END $$;

-- ── Grants: authenticated only ───────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('trust_position','trust_fund_check','trust_beneficiaries',
                         'trust_distributions','trust_overview')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS read_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('trust_position','trust_fund_check','trust_beneficiaries',
                     'trust_distributions','trust_overview')
 ORDER BY p.proname;

-- ───────────────────────────────────────────────────────────────────────
-- 069_statutory_accounts_model.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 069: STATUTORY ACCOUNTS MODEL
--
-- Core is to produce full filable statutory accounts under all applicable
-- standards. This is the data model and the machinery for that.
--
-- ── A NOTE ON WHAT THIS FILE DOES AND DOES NOT CONTAIN ──────────────
--
-- It contains the ENGINE: accounts sets, framework registry, statement
-- structure, notes, accounting policies, comparatives, approval, and the
-- audit trail behind all of it.
--
-- It does NOT contain authored disclosure requirements for each framework.
-- That is deliberate, and it is the most important thing to understand about
-- this build.
--
-- Filed accounts carry legal weight: directors sign that they give a true and
-- fair view, and auditors rely on them. A disclosure checklist reconstructed
-- from memory would look authoritative and be wrong in ways nobody would spot
-- until a regulator or auditor did. FRS 102 alone was materially amended in
-- 2024; IFRS changes annually; the six jurisdictions Affinity operates in do
-- not share one framework.
--
-- So the framework registry below is structured to be POPULATED AND OWNED by
-- a qualified accountant, and the engine REFUSES TO FINALISE a set with
-- unaddressed disclosure requirements. The control is real even though the
-- content is not mine to write. Where a requirement is unpopulated, the
-- interface says so rather than implying completeness.
--
-- Run AFTER 068. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- FRAMEWORK REGISTRY
-- ─────────────────────────────────────────────────────────────────────
-- Which reporting frameworks exist, and which jurisdictions accept them.
-- Separate from the disclosure requirements so a framework can be registered
-- before its checklist has been authored.
CREATE TABLE IF NOT EXISTS reporting_framework (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  issuer          text,
  applies_to      text,                    -- who may use it
  small_entity    boolean NOT NULL DEFAULT false,
  requires_audit  boolean,
  requires_cash_flow boolean NOT NULL DEFAULT true,
  notes           text,
  -- Set true only when a qualified person has reviewed the disclosure
  -- checklist below and confirmed it complete for the current edition.
  checklist_verified_by   text,
  checklist_verified_at   timestamptz,
  checklist_edition       text,            -- e.g. "FRS 102 (2024 amendments)"
  is_active       boolean NOT NULL DEFAULT true
);

-- The frameworks themselves are facts, not judgements, so they are seeded.
-- Their DISCLOSURE REQUIREMENTS are not seeded — see the note above.
INSERT INTO reporting_framework(code, name, issuer, applies_to, small_entity,
                                requires_audit, requires_cash_flow, notes)
VALUES
 ('FRS102',     'FRS 102 — The Financial Reporting Standard applicable in the UK and Republic of Ireland',
                'Financial Reporting Council', 'UK and Irish entities not applying IFRS', false, NULL, true,
                'Section 1A available for small entities with reduced disclosure.'),
 ('FRS102-1A',  'FRS 102 Section 1A — Small Entities',
                'Financial Reporting Council', 'Small entities meeting the size criteria', true, NULL, false,
                'Reduced disclosure. Size thresholds must be tested each period.'),
 ('FRS105',     'FRS 105 — The Financial Reporting Standard applicable to the Micro-entities Regime',
                'Financial Reporting Council', 'Micro-entities meeting the size criteria', true, false, false,
                'No cash flow statement. Very limited notes.'),
 ('IFRS',       'IFRS Accounting Standards (full)',
                'International Accounting Standards Board', 'Entities applying full IFRS', false, NULL, true, NULL),
 ('IFRS-SME',   'IFRS for SMEs Accounting Standard',
                'International Accounting Standards Board', 'Entities without public accountability', true, NULL, true, NULL),
 ('IOM-GAAP',   'Isle of Man — Companies Acts requirements',
                'Isle of Man Government', 'Isle of Man companies', false, NULL, true,
                'Companies Act 2006 companies have different requirements from 1931 Act companies.'),
 ('MALTA-GAPSME','GAPSME — General Accounting Principles for Small and Medium-Sized Entities',
                'Accountancy Board (Malta)', 'Maltese small and medium entities', true, NULL, true, NULL),
 ('MALTA-IFRS', 'IFRS as adopted by the EU (Malta)',
                'European Union', 'Maltese entities required to apply EU-adopted IFRS', false, NULL, true, NULL),
 ('CAYMAN',     'Cayman Islands — no prescribed framework',
                'Cayman Islands Government', 'Cayman companies', false, false, false,
                'The Companies Act does not prescribe a framework. Accounts are commonly prepared under IFRS or US GAAP; the basis must be stated.'),
 ('CYPRUS-IFRS','IFRS as adopted by the EU (Cyprus)',
                'European Union', 'Cypriot companies', false, NULL, true,
                'Cyprus requires IFRS as adopted by the EU for all companies. Affinity is licensed by CySEC as an Administrative Service Provider, so the Cyprus office is under CySEC supervision for corporate services.'),
 ('US-GAAP',    'US GAAP',
                'Financial Accounting Standards Board', 'US entities', false, NULL, true, NULL)
ON CONFLICT (code) DO NOTHING;

-- Which frameworks a jurisdiction accepts. A trust in Cayman and a company in
-- Cyprus do not have the same options, and offering the wrong one is how a set
-- gets prepared on the wrong basis.
CREATE TABLE IF NOT EXISTS framework_jurisdiction (
  framework_code text NOT NULL REFERENCES reporting_framework(code),
  location_code  text NOT NULL REFERENCES location(code),
  is_default     boolean NOT NULL DEFAULT false,
  note           text,
  PRIMARY KEY (framework_code, location_code)
);

INSERT INTO framework_jurisdiction(framework_code, location_code, is_default, note) VALUES
 ('IOM-GAAP','IOM',true,  NULL),
 ('FRS102','IOM',false,   'Commonly applied in practice.'),
 ('FRS102-1A','IOM',false,NULL),
 ('IFRS','IOM',false,     NULL),
 ('FRS102','UK',true,     NULL),
 ('FRS102-1A','UK',false, NULL),
 ('FRS105','UK',false,    NULL),
 ('IFRS','UK',false,      NULL),
 ('MALTA-GAPSME','MALTA',true,  NULL),
 ('MALTA-IFRS','MALTA',false,   NULL),
 ('CAYMAN','CYM',true,    'Basis of preparation must be stated explicitly.'),
 ('IFRS','CYM',false,     NULL),
 ('US-GAAP','CYM',false,  NULL),
 ('CYPRUS-IFRS','CYPRUS',true,  NULL),
 ('US-GAAP','USA',true,   NULL),
 ('IFRS','USA',false,     NULL)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- DISCLOSURE REQUIREMENTS — the part that must be authored
-- ─────────────────────────────────────────────────────────────────────
-- One row per disclosure a framework requires. Deliberately EMPTY on install.
--
-- Populating this is a job for a qualified accountant, and it is not optional:
-- accounts_set_finalise below refuses to finalise a set whose framework has no
-- verified checklist, so an unpopulated framework cannot silently produce
-- accounts that look complete.
CREATE TABLE IF NOT EXISTS disclosure_requirement (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  framework_code text NOT NULL REFERENCES reporting_framework(code),
  ref            text NOT NULL,            -- e.g. "FRS 102 1AC.12"
  title          text NOT NULL,
  detail         text,
  applies_when   text,                     -- plain English condition
  mandatory      boolean NOT NULL DEFAULT true,
  statement      text,                     -- which primary statement, if any
  sort_order     integer NOT NULL DEFAULT 0,
  added_by       text NOT NULL DEFAULT current_app_user(),
  added_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_code, ref)
);

-- ─────────────────────────────────────────────────────────────────────
-- ACCOUNTS SETS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts_set (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id      bigint NOT NULL REFERENCES entity(id),
  framework_code text NOT NULL REFERENCES reporting_framework(code),
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  prior_start    date,
  prior_end      date,
  ccy            char(3) NOT NULL DEFAULT 'GBP',

  -- draft -> in_review -> finalised -> approved -> filed
  status         text NOT NULL DEFAULT 'draft',

  basis_of_preparation text,               -- required where no framework is prescribed
  going_concern_basis  boolean,
  going_concern_note   text,
  audit_required       boolean,
  auditor              text,
  audit_opinion        text,

  prepared_by    text NOT NULL DEFAULT current_app_user(),
  prepared_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_by    text,
  reviewed_at    timestamptz,
  approved_by    text,                     -- the director who signs
  approved_at    timestamptz,
  filed_at       timestamptz,
  filed_ref      text,

  CONSTRAINT accounts_set_period CHECK (period_end > period_start),
  CONSTRAINT accounts_set_status CHECK (status IN ('draft','in_review','finalised','approved','filed')),
  UNIQUE (entity_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS ix_accounts_set_entity ON accounts_set(entity_id, period_end DESC);

-- The figures, held as a snapshot. Statutory accounts must not change when the
-- ledger is later adjusted — a filed set is a historical document, and
-- regenerating it from a moved ledger would silently alter a signed statement.
CREATE TABLE IF NOT EXISTS accounts_line (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  set_id       bigint NOT NULL REFERENCES accounts_set(id) ON DELETE CASCADE,
  statement    text NOT NULL,              -- income_statement, balance_sheet, cash_flow, equity
  caption      text NOT NULL,
  note_ref     text,
  sort_order   integer NOT NULL DEFAULT 0,
  is_subtotal  boolean NOT NULL DEFAULT false,
  is_total     boolean NOT NULL DEFAULT false,
  current_amount numeric(18,2),
  prior_amount   numeric(18,2),
  CONSTRAINT accounts_line_statement CHECK (statement IN
    ('income_statement','balance_sheet','cash_flow','equity','other'))
);
CREATE INDEX IF NOT EXISTS ix_accounts_line_set ON accounts_line(set_id, statement, sort_order);

-- Notes and accounting policies. Each can be linked to a disclosure
-- requirement, which is how completeness is checked.
CREATE TABLE IF NOT EXISTS accounts_note (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  set_id         bigint NOT NULL REFERENCES accounts_set(id) ON DELETE CASCADE,
  note_number    text,
  kind           text NOT NULL DEFAULT 'note',   -- note | policy | directors_report
  title          text NOT NULL,
  body           text,
  requirement_id bigint REFERENCES disclosure_requirement(id),
  sort_order     integer NOT NULL DEFAULT 0,
  authored_by    text NOT NULL DEFAULT current_app_user(),
  authored_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_note_kind CHECK (kind IN ('note','policy','directors_report','other'))
);
CREATE INDEX IF NOT EXISTS ix_accounts_note_set ON accounts_note(set_id, kind, sort_order);

-- Which requirements have been addressed, and where a requirement is
-- deliberately not applicable, WHY. "Not applicable" without a reason is how
-- a disclosure gets quietly omitted.
CREATE TABLE IF NOT EXISTS accounts_disclosure (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  set_id         bigint NOT NULL REFERENCES accounts_set(id) ON DELETE CASCADE,
  requirement_id bigint NOT NULL REFERENCES disclosure_requirement(id),
  status         text NOT NULL DEFAULT 'outstanding',
  note_id        bigint REFERENCES accounts_note(id),
  not_applicable_reason text,
  addressed_by   text,
  addressed_at   timestamptz,
  CONSTRAINT accounts_disclosure_status CHECK (status IN ('outstanding','addressed','not_applicable')),
  UNIQUE (set_id, requirement_id)
);

-- ── Grants ───────────────────────────────────────────────────────────
REVOKE ALL ON reporting_framework, framework_jurisdiction, disclosure_requirement,
              accounts_set, accounts_line, accounts_note, accounts_disclosure
  FROM PUBLIC, anon;
GRANT SELECT ON reporting_framework, framework_jurisdiction, disclosure_requirement,
                accounts_set, accounts_line, accounts_note, accounts_disclosure
  TO authenticated;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT 'frameworks registered' AS item, count(*)::text AS value FROM reporting_framework
UNION ALL
SELECT 'jurisdiction mappings', count(*)::text FROM framework_jurisdiction
UNION ALL
SELECT 'disclosure requirements authored', count(*)::text FROM disclosure_requirement
UNION ALL
SELECT 'frameworks with a verified checklist',
       count(*)::text FROM reporting_framework WHERE checklist_verified_at IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────
-- 070_statutory_accounts_engine.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 070: STATUTORY ACCOUNTS GENERATION AND CONTROLS
--
-- Builds a set of accounts from the ledger, and controls what may be done
-- with it. The generation is mechanical and can be done correctly. The
-- controls exist because the generation being correct is not the same as the
-- accounts being complete.
--
-- Run AFTER 069. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- WHICH FRAMEWORKS MAY THIS ENTITY USE
-- ─────────────────────────────────────────────────────────────────────
-- Offering a framework the jurisdiction does not accept is how a set gets
-- prepared on the wrong basis, so the choice is constrained rather than free.
CREATE OR REPLACE FUNCTION frameworks_for_entity(p_entity bigint)
RETURNS TABLE(code text, name text, is_default boolean, small_entity boolean,
              requires_cash_flow boolean, checklist_verified boolean,
              checklist_edition text, requirements bigint, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.code, f.name, fj.is_default, f.small_entity, f.requires_cash_flow,
         (f.checklist_verified_at IS NOT NULL),
         f.checklist_edition,
         (SELECT count(*) FROM disclosure_requirement d WHERE d.framework_code = f.code),
         coalesce(fj.note, f.notes)
    FROM entity e
    JOIN framework_jurisdiction fj ON fj.location_code = e.location_code
    JOIN reporting_framework f ON f.code = fj.framework_code
   WHERE e.id = p_entity AND f.is_active
   ORDER BY fj.is_default DESC, f.name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- CREATE A SET
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounts_set_create(
  p_entity bigint, p_framework text, p_period_start date, p_period_end date,
  p_prior_start date DEFAULT NULL, p_prior_end date DEFAULT NULL)
RETURNS accounts_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounts_set; fw reporting_framework; loc text; n_req int;
BEGIN
  SELECT location_code INTO loc FROM entity WHERE id = p_entity;
  IF loc IS NULL THEN RAISE EXCEPTION 'Unknown entity'; END IF;

  SELECT * INTO fw FROM reporting_framework WHERE code = p_framework;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reporting framework: %', p_framework; END IF;

  -- The jurisdiction must accept the framework.
  IF NOT EXISTS (SELECT 1 FROM framework_jurisdiction fj
                  WHERE fj.framework_code = p_framework AND fj.location_code = loc) THEN
    RAISE EXCEPTION '% is not recorded as acceptable in %. Acceptable frameworks: %',
      p_framework, loc,
      (SELECT string_agg(fj.framework_code, ', ') FROM framework_jurisdiction fj
        WHERE fj.location_code = loc);
  END IF;

  IF p_period_end > current_date THEN
    RAISE EXCEPTION 'The period ends in the future — accounts cannot be prepared for a period that has not finished';
  END IF;

  -- Comparatives. Their absence is a disclosure matter in itself, so it is
  -- recorded rather than left ambiguous.
  INSERT INTO accounts_set(entity_id, framework_code, period_start, period_end,
                           prior_start, prior_end, ccy, audit_required)
  VALUES (p_entity, p_framework, p_period_start, p_period_end,
          p_prior_start, p_prior_end,
          (SELECT functional_ccy FROM entity WHERE id = p_entity),
          fw.requires_audit)
  RETURNING * INTO r;

  -- Seed the disclosure checklist for this set from the framework. If the
  -- framework has no authored requirements this seeds nothing, and finalising
  -- will refuse — which is the intended behaviour, not a gap.
  INSERT INTO accounts_disclosure(set_id, requirement_id, status)
  SELECT r.id, d.id, 'outstanding'
    FROM disclosure_requirement d
   WHERE d.framework_code = p_framework;

  SELECT count(*) INTO n_req FROM accounts_disclosure WHERE set_id = r.id;

  PERFORM ea_audit(p_entity, 'accounts_set', r.id, 'accounts set created',
                   p_framework || ' for ' || p_period_start || ' to ' || p_period_end ||
                   ' — ' || n_req || ' disclosure requirement(s) to address');
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- GENERATE THE PRIMARY STATEMENTS
-- ─────────────────────────────────────────────────────────────────────
-- Mechanical, from the ledger. Replaces any previously generated lines for the
-- set, so it can be re-run as adjustments are posted — but only while the set
-- is a draft, because regenerating a signed set would alter a signed
-- statement.
CREATE OR REPLACE FUNCTION accounts_set_generate(p_set bigint)
RETURNS TABLE(statement text, lines bigint, current_total numeric, prior_total numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE s accounts_set; ord int := 0;
BEGIN
  SELECT * INTO s FROM accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF s.status <> 'draft' THEN
    RAISE EXCEPTION 'That set is % — only a draft can be regenerated. Reopen it, or create a new set.',
      s.status;
  END IF;

  DELETE FROM accounts_line WHERE set_id = p_set;

  -- ── Income statement ──────────────────────────────────────────────
  -- Signed so that income is positive and expenses positive, which is how a
  -- reader expects to see them, rather than the ledger's natural signs.
  INSERT INTO accounts_line(set_id, statement, caption, sort_order,
                            current_amount, prior_amount)
  SELECT p_set, 'income_statement', a.name, row_number() OVER (ORDER BY a.code),
         round(coalesce(sum(CASE WHEN j.journal_date BETWEEN s.period_start AND s.period_end
                                 THEN -jl.func_amount END), 0), 2),
         CASE WHEN s.prior_start IS NULL THEN NULL ELSE
           round(coalesce(sum(CASE WHEN j.journal_date BETWEEN s.prior_start AND s.prior_end
                                   THEN -jl.func_amount END), 0), 2) END
    FROM account a
    JOIN journal_line jl ON jl.account_id = a.id
    JOIN journal j ON j.id = jl.journal_id
   WHERE j.entity_id = s.entity_id
     AND a.account_type IN ('income','expense')
     AND j.status = 'posted'
   GROUP BY a.id, a.name, a.code
  HAVING round(coalesce(sum(CASE WHEN j.journal_date BETWEEN s.period_start AND s.period_end
                                 THEN -jl.func_amount END), 0), 2) <> 0
      OR (s.prior_start IS NOT NULL AND
          round(coalesce(sum(CASE WHEN j.journal_date BETWEEN s.prior_start AND s.prior_end
                                  THEN -jl.func_amount END), 0), 2) <> 0);

  -- Result for the period, as a total line.
  INSERT INTO accounts_line(set_id, statement, caption, sort_order, is_total,
                            current_amount, prior_amount)
  SELECT p_set, 'income_statement', 'Profit / (loss) for the period', 9999, true,
         round(coalesce(sum(l.current_amount), 0), 2),
         CASE WHEN s.prior_start IS NULL THEN NULL
              ELSE round(coalesce(sum(l.prior_amount), 0), 2) END
    FROM accounts_line l
   WHERE l.set_id = p_set AND l.statement = 'income_statement' AND NOT l.is_total;

  -- ── Balance sheet ─────────────────────────────────────────────────
  -- Cumulative to the period end, not just movements in the period.
  INSERT INTO accounts_line(set_id, statement, caption, sort_order,
                            current_amount, prior_amount)
  SELECT p_set, 'balance_sheet', a.name, row_number() OVER (ORDER BY a.account_type, a.code),
         round(coalesce(sum(CASE WHEN j.journal_date <= s.period_end
                                 THEN jl.func_amount END), 0), 2),
         CASE WHEN s.prior_end IS NULL THEN NULL ELSE
           round(coalesce(sum(CASE WHEN j.journal_date <= s.prior_end
                                   THEN jl.func_amount END), 0), 2) END
    FROM account a
    JOIN journal_line jl ON jl.account_id = a.id
    JOIN journal j ON j.id = jl.journal_id
   WHERE j.entity_id = s.entity_id
     AND a.account_type IN ('asset','liability','equity')
     AND j.status = 'posted'
   GROUP BY a.id, a.name, a.code, a.account_type
  HAVING round(coalesce(sum(CASE WHEN j.journal_date <= s.period_end
                                 THEN jl.func_amount END), 0), 2) <> 0;

  PERFORM ea_audit(s.entity_id, 'accounts_set', p_set, 'statements generated',
                   (SELECT count(*)::text FROM accounts_line WHERE set_id = p_set) || ' lines');

  RETURN QUERY
  SELECT l.statement, count(*), round(sum(l.current_amount),2), round(sum(l.prior_amount),2)
    FROM accounts_line l WHERE l.set_id = p_set AND NOT l.is_total
   GROUP BY l.statement ORDER BY l.statement;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- COMPLETENESS
-- ─────────────────────────────────────────────────────────────────────
-- What stands between this set and being fileable. Read-only, so it can be
-- shown continuously rather than only on an attempt to finalise.
CREATE OR REPLACE FUNCTION accounts_set_readiness(p_set bigint)
RETURNS TABLE(gate text, passed boolean, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s accounts_set; fw reporting_framework; n int; bs numeric;
BEGIN
  SELECT * INTO s FROM accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  SELECT * INTO fw FROM reporting_framework WHERE code = s.framework_code;

  -- 1. The framework's disclosure checklist must have been authored AND
  --    verified by a qualified person. This is the gate that stops Core
  --    producing something that looks like a complete set of accounts when
  --    nobody has established what a complete set requires.
  RETURN QUERY SELECT
    'Framework checklist verified'::text,
    (fw.checklist_verified_at IS NOT NULL),
    CASE WHEN fw.checklist_verified_at IS NOT NULL
         THEN fw.checklist_edition || ', verified by ' || fw.checklist_verified_by
         ELSE 'No verified disclosure checklist exists for ' || fw.code ||
              '. A qualified person must author the requirements and confirm the edition before accounts can be finalised on this basis.'
    END;

  -- 2. Statements generated.
  SELECT count(*) INTO n FROM accounts_line WHERE set_id = p_set;
  RETURN QUERY SELECT 'Primary statements generated'::text, (n > 0),
    n || ' line(s)';

  -- 3. The balance sheet must balance.
  SELECT round(coalesce(sum(current_amount),0),2) INTO bs
    FROM accounts_line WHERE set_id = p_set AND statement = 'balance_sheet';
  RETURN QUERY SELECT 'Balance sheet balances'::text, (coalesce(bs,0) = 0),
    CASE WHEN coalesce(bs,0) = 0 THEN 'assets less liabilities and equity is nil'
         ELSE 'out by ' || bs END;

  -- 4. Every mandatory disclosure addressed or explicitly not applicable.
  --
  -- The empty case must NOT read as a pass. With no requirements authored,
  -- "none outstanding" is literally true and completely misleading — it looks
  -- like the disclosures are in order when nobody has established what they
  -- are. A first version of this gate passed in exactly that situation.
  DECLARE total_req int;
  BEGIN
    SELECT count(*) INTO total_req FROM accounts_disclosure WHERE set_id = p_set;
    SELECT count(*) INTO n FROM accounts_disclosure ad
      JOIN disclosure_requirement d ON d.id = ad.requirement_id
     WHERE ad.set_id = p_set AND d.mandatory AND ad.status = 'outstanding';

    RETURN QUERY SELECT 'Mandatory disclosures addressed'::text,
      (total_req > 0 AND n = 0),
      CASE WHEN total_req = 0
             THEN 'no disclosure requirements exist for this framework, so completeness cannot be assessed'
           WHEN n = 0 THEN 'all ' || total_req || ' addressed'
           ELSE n || ' of ' || total_req || ' outstanding' END;
  END;

  -- 5. "Not applicable" must carry a reason.
  SELECT count(*) INTO n FROM accounts_disclosure
   WHERE set_id = p_set AND status = 'not_applicable'
     AND coalesce(trim(not_applicable_reason),'') = '';
  RETURN QUERY SELECT 'Not-applicable disclosures explained'::text, (n = 0),
    CASE WHEN n = 0 THEN 'all explained'
         ELSE n || ' marked not applicable with no reason given' END;

  -- 6. Accounting policies.
  SELECT count(*) INTO n FROM accounts_note WHERE set_id = p_set AND kind = 'policy';
  RETURN QUERY SELECT 'Accounting policies stated'::text, (n > 0), n || ' policy note(s)';

  -- 7. Going concern.
  RETURN QUERY SELECT 'Going concern considered'::text,
    (s.going_concern_basis IS NOT NULL),
    CASE WHEN s.going_concern_basis IS NULL THEN 'not recorded'
         WHEN s.going_concern_basis THEN 'prepared on the going concern basis'
         ELSE 'NOT prepared on the going concern basis — ' ||
              coalesce(s.going_concern_note, 'no explanation recorded') END;

  -- 8. Basis of preparation, where the jurisdiction prescribes none.
  RETURN QUERY SELECT 'Basis of preparation stated'::text,
    (s.framework_code <> 'CAYMAN' OR coalesce(trim(s.basis_of_preparation),'') <> ''),
    CASE WHEN s.framework_code = 'CAYMAN' AND coalesce(trim(s.basis_of_preparation),'') = ''
         THEN 'Cayman prescribes no framework, so the basis actually used must be stated'
         ELSE 'stated or not required' END;

  -- 9. Cash flow statement, where the framework requires one.
  IF fw.requires_cash_flow THEN
    SELECT count(*) INTO n FROM accounts_line
     WHERE set_id = p_set AND statement = 'cash_flow';
    RETURN QUERY SELECT 'Cash flow statement present'::text, (n > 0),
      CASE WHEN n > 0 THEN n || ' line(s)'
           ELSE fw.code || ' requires a cash flow statement and none has been prepared' END;
  END IF;

  -- 10. Comparatives.
  RETURN QUERY SELECT 'Comparatives included'::text,
    (s.prior_start IS NOT NULL),
    CASE WHEN s.prior_start IS NOT NULL THEN 'prior period ' || s.prior_start || ' to ' || s.prior_end
         ELSE 'no comparative period set — permitted only for a first period, which must be disclosed' END;
END $$;

-- Finalising. Refuses on any failed gate, and names them all rather than the
-- first, so the work can be planned rather than discovered one at a time.
CREATE OR REPLACE FUNCTION accounts_set_finalise(p_set bigint)
RETURNS accounts_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounts_set; failed text;
BEGIN
  SELECT * INTO r FROM accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF r.status NOT IN ('draft','in_review') THEN
    RAISE EXCEPTION 'That set is already %', r.status;
  END IF;

  SELECT string_agg(g.gate || ' (' || g.detail || ')', E'\n  - ')
    INTO failed
    FROM accounts_set_readiness(p_set) g WHERE NOT g.passed;

  IF failed IS NOT NULL THEN
    RAISE EXCEPTION E'These accounts are not ready to finalise:\n  - %', failed;
  END IF;

  UPDATE accounts_set SET status = 'finalised', reviewed_by = current_app_user(),
         reviewed_at = now()
   WHERE id = p_set RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'accounts_set', p_set, 'accounts finalised',
                   r.framework_code || ' ' || r.period_start || ' to ' || r.period_end);
  RETURN r;
END $$;

-- Approval is the director signing. Separate from finalising, and refused to
-- the same person, because the preparer and the signatory are different roles.
CREATE OR REPLACE FUNCTION accounts_set_approve(p_set bigint, p_director text)
RETURNS accounts_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounts_set;
BEGIN
  IF coalesce(trim(p_director),'') = '' THEN
    RAISE EXCEPTION 'Name the director approving these accounts — they are signing that the accounts give a true and fair view';
  END IF;
  SELECT * INTO r FROM accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF r.status <> 'finalised' THEN
    RAISE EXCEPTION 'Accounts must be finalised before approval — this set is %', r.status;
  END IF;
  IF r.prepared_by IS NOT NULL AND lower(r.prepared_by) = lower(current_app_user()) THEN
    RAISE EXCEPTION 'You prepared these accounts — approval must be recorded by someone else';
  END IF;

  UPDATE accounts_set SET status = 'approved', approved_by = p_director, approved_at = now()
   WHERE id = p_set RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'accounts_set', p_set, 'ACCOUNTS APPROVED',
                   'approved by ' || p_director || ', recorded by ' || current_app_user());
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- READS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounts_sets_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, framework_code text,
              framework_name text, period_start date, period_end date,
              has_comparatives boolean, ccy char(3), status text,
              prepared_by text, approved_by text, approved_at timestamptz,
              lines bigint, notes bigint, disclosures_outstanding bigint,
              gates_failed bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.entity_id, e.name, s.framework_code, f.name,
         s.period_start, s.period_end, (s.prior_start IS NOT NULL), s.ccy, s.status,
         s.prepared_by, s.approved_by, s.approved_at,
         (SELECT count(*) FROM accounts_line l WHERE l.set_id = s.id),
         (SELECT count(*) FROM accounts_note n WHERE n.set_id = s.id),
         (SELECT count(*) FROM accounts_disclosure ad WHERE ad.set_id = s.id
                                                        AND ad.status = 'outstanding'),
         (SELECT count(*) FROM accounts_set_readiness(s.id) g WHERE NOT g.passed)
    FROM accounts_set s
    LEFT JOIN entity e ON e.id = s.entity_id
    LEFT JOIN reporting_framework f ON f.code = s.framework_code
   WHERE p_entity IS NULL OR s.entity_id = p_entity
   ORDER BY s.period_end DESC;
$$;

CREATE OR REPLACE FUNCTION accounts_statement(p_set bigint, p_statement text)
RETURNS TABLE(caption text, note_ref text, current_amount numeric,
              prior_amount numeric, is_subtotal boolean, is_total boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.caption, l.note_ref, l.current_amount, l.prior_amount,
         l.is_subtotal, l.is_total
    FROM accounts_line l
   WHERE l.set_id = p_set AND l.statement = p_statement
   ORDER BY l.sort_order;
$$;

CREATE OR REPLACE FUNCTION accounts_disclosures(p_set bigint)
RETURNS TABLE(id bigint, ref text, title text, detail text, applies_when text,
              mandatory boolean, status text, note_title text,
              not_applicable_reason text, addressed_by text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT ad.id, d.ref, d.title, d.detail, d.applies_when, d.mandatory,
         ad.status, n.title, ad.not_applicable_reason, ad.addressed_by
    FROM accounts_disclosure ad
    JOIN disclosure_requirement d ON d.id = ad.requirement_id
    LEFT JOIN accounts_note n ON n.id = ad.note_id
   WHERE ad.set_id = p_set
   ORDER BY d.sort_order, d.ref;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- AUTHORING THE CHECKLISTS
-- ─────────────────────────────────────────────────────────────────────
-- For a qualified person to populate. Verification is a separate act and
-- requires naming the edition, because "verified" without an edition means
-- nothing once the standard is amended.
CREATE OR REPLACE FUNCTION disclosure_requirement_add(
  p_framework text, p_ref text, p_title text, p_detail text DEFAULT NULL,
  p_applies_when text DEFAULT NULL, p_mandatory boolean DEFAULT true,
  p_statement text DEFAULT NULL, p_sort_order int DEFAULT 0)
RETURNS disclosure_requirement LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r disclosure_requirement;
BEGIN
  IF coalesce(trim(p_ref),'') = '' THEN
    RAISE EXCEPTION 'Give the reference in the standard, so the requirement can be traced';
  END IF;
  INSERT INTO disclosure_requirement(framework_code, ref, title, detail, applies_when,
                                     mandatory, statement, sort_order)
  VALUES (p_framework, trim(p_ref), p_title, p_detail, p_applies_when,
          p_mandatory, p_statement, p_sort_order)
  ON CONFLICT (framework_code, ref) DO UPDATE SET
    title = EXCLUDED.title, detail = EXCLUDED.detail,
    applies_when = EXCLUDED.applies_when, mandatory = EXCLUDED.mandatory,
    statement = EXCLUDED.statement, sort_order = EXCLUDED.sort_order
  RETURNING * INTO r;

  -- Amending a checklist invalidates its verification: the person who verified
  -- it signed off a different list.
  UPDATE reporting_framework
     SET checklist_verified_by = NULL, checklist_verified_at = NULL
   WHERE code = p_framework AND checklist_verified_at IS NOT NULL;

  PERFORM ea_audit(NULL, 'disclosure_requirement', r.id, 'disclosure requirement recorded',
                   p_framework || ' ' || trim(p_ref) || ' — ' || p_title);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION framework_checklist_verify(
  p_framework text, p_edition text)
RETURNS reporting_framework LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r reporting_framework; n int;
BEGIN
  IF coalesce(trim(p_edition),'') = '' THEN
    RAISE EXCEPTION 'Name the edition being verified, for example "FRS 102 (2024 amendments)" — a verification with no edition is meaningless once the standard changes';
  END IF;
  SELECT count(*) INTO n FROM disclosure_requirement WHERE framework_code = p_framework;
  IF n = 0 THEN
    RAISE EXCEPTION 'No disclosure requirements have been recorded for % — there is nothing to verify', p_framework;
  END IF;

  UPDATE reporting_framework
     SET checklist_verified_by = current_app_user(),
         checklist_verified_at = now(),
         checklist_edition = trim(p_edition)
   WHERE code = p_framework RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown framework: %', p_framework; END IF;

  PERFORM ea_audit(NULL, 'reporting_framework', NULL, 'CHECKLIST VERIFIED',
                   p_framework || ' — ' || trim(p_edition) || ' — ' || n ||
                   ' requirements — verified by ' || current_app_user());
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION accounts_disclosure_address(
  p_disclosure bigint, p_note_id bigint DEFAULT NULL,
  p_not_applicable_reason text DEFAULT NULL)
RETURNS accounts_disclosure LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounts_disclosure;
BEGIN
  IF p_note_id IS NULL AND coalesce(trim(p_not_applicable_reason),'') = '' THEN
    RAISE EXCEPTION 'Either link the note that addresses this requirement, or give a reason it does not apply';
  END IF;

  UPDATE accounts_disclosure
     SET status = CASE WHEN p_note_id IS NOT NULL THEN 'addressed' ELSE 'not_applicable' END,
         note_id = p_note_id,
         not_applicable_reason = p_not_applicable_reason,
         addressed_by = current_app_user(), addressed_at = now()
   WHERE id = p_disclosure RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disclosure % not found', p_disclosure; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION accounts_note_add(
  p_set bigint, p_title text, p_body text, p_kind text DEFAULT 'note',
  p_note_number text DEFAULT NULL, p_sort_order int DEFAULT 0)
RETURNS accounts_note LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounts_note; st text;
BEGIN
  SELECT status INTO st FROM accounts_set WHERE id = p_set;
  IF st IS NULL THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF st IN ('approved','filed') THEN
    RAISE EXCEPTION 'Those accounts are % — a note cannot be added to a signed set', st;
  END IF;
  IF coalesce(trim(p_title),'') = '' THEN RAISE EXCEPTION 'A note needs a title'; END IF;

  INSERT INTO accounts_note(set_id, title, body, kind, note_number, sort_order)
  VALUES (p_set, trim(p_title), p_body, coalesce(p_kind,'note'), p_note_number, p_sort_order)
  RETURNING * INTO r;
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
       AND (p.proname LIKE 'accounts_%' OR p.proname LIKE 'framework%'
            OR p.proname LIKE 'disclosure_%' OR p.proname = 'frameworks_for_entity')
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
   AND (p.proname LIKE 'accounts_%' OR p.proname LIKE 'framework%'
        OR p.proname LIKE 'disclosure_%' OR p.proname = 'frameworks_for_entity')
 ORDER BY p.proname;

-- ───────────────────────────────────────────────────────────────────────
-- 071_statement_formats.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 071: USE THE EXISTING STATEMENT FORMATS
--
-- ── WHAT THIS FILE ORIGINALLY DID, AND WHY IT WAS WRONG ─────────────
--
-- I started building a statement_format table and a per-framework caption
-- registry, because the generator was producing a list of 66 raw account
-- names — a trial balance rather than a statutory balance sheet.
--
-- The engine ALREADY HAS ALL OF THIS. fs_framework and fs_caption hold
-- properly authored formats: FRS 102 Section 1A, IFRS, Malta GAPSME and a
-- Trust fiduciary format, 46 captions in total, with subtotals for net current
-- assets and net assets and note references. account_fs_map already maps
-- accounts to captions and has a foreign key into fs_caption.
--
-- I found this only because my mapping insert failed on a constraint I had not
-- looked at. It is the second time in this build I have duplicated existing
-- infrastructure — the first was a period_lock table when accounting_period
-- already existed — and the lesson is the same: read the schema before adding
-- to it.
--
-- So this file no longer defines formats. It maps my accounts_set model onto
-- the engine's existing format tables, and adds only what is genuinely
-- missing: the mapping-gap report, and generation that uses fs_caption.
--
-- The reporting_framework registry in 069 stays, because it holds things
-- fs_framework does not: jurisdiction acceptability, audit and cash flow
-- requirements, and the disclosure checklist verification. The two are linked
-- rather than duplicated.
--
-- Run AFTER 070. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- LINK THE TWO REGISTRIES
-- ─────────────────────────────────────────────────────────────────────
-- reporting_framework carries the regulatory facts; fs_framework carries the
-- presentation format. One row per framework that has a format.
ALTER TABLE reporting_framework
  ADD COLUMN IF NOT EXISTS fs_framework_code text;

UPDATE reporting_framework SET fs_framework_code = 'FRS102_1A' WHERE code = 'FRS102-1A';
UPDATE reporting_framework SET fs_framework_code = 'FRS102_1A' WHERE code = 'FRS102'
  AND fs_framework_code IS NULL;   -- 1A format is the closest available
UPDATE reporting_framework SET fs_framework_code = 'IFRS'      WHERE code IN ('IFRS','IFRS-SME','MALTA-IFRS','CYPRUS-IFRS')
  AND fs_framework_code IS NULL;
UPDATE reporting_framework SET fs_framework_code = 'GAPSME'    WHERE code = 'MALTA-GAPSME';

-- Which frameworks have a presentation format, and which do not. A framework
-- with no format cannot produce filable accounts, and saying so is more useful
-- than generating something that looks like a balance sheet.
CREATE OR REPLACE FUNCTION framework_format_status()
RETURNS TABLE(code text, name text, fs_framework_code text, captions bigint,
              has_format boolean, checklist_verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT rf.code, rf.name, rf.fs_framework_code,
         (SELECT count(*) FROM fs_caption c WHERE c.framework_code = rf.fs_framework_code),
         (rf.fs_framework_code IS NOT NULL
          AND EXISTS (SELECT 1 FROM fs_caption c WHERE c.framework_code = rf.fs_framework_code)),
         (rf.checklist_verified_at IS NOT NULL)
    FROM reporting_framework rf
   WHERE rf.is_active
   ORDER BY rf.name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- MAPPING GAPS
-- ─────────────────────────────────────────────────────────────────────
-- An account with a balance and no caption is left out of the accounts
-- entirely: the statements still balance and a figure is simply missing,
-- which is the hardest kind of error to find.
--
-- Dropped first: the parameter was renamed from p_framework to p_fs_framework
-- when this moved onto the engine's tables, and PostgreSQL will not rename an
-- input parameter in place.
DROP FUNCTION IF EXISTS account_mapping_gaps(text, bigint);
DROP FUNCTION IF EXISTS account_fs_map_set(bigint, text, text);
-- entirely: the statements still balance and a figure is simply missing,
-- which is the hardest kind of error to find.
CREATE OR REPLACE FUNCTION account_mapping_gaps(p_fs_framework text, p_entity bigint DEFAULT NULL)
RETURNS TABLE(account_id bigint, code text, name text, account_type text,
              balance numeric, has_balance boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id, a.code, a.name, a.account_type,
         round(coalesce(sum(jl.func_amount), 0), 2),
         (round(coalesce(sum(jl.func_amount), 0), 2) <> 0)
    FROM account a
    LEFT JOIN journal_line jl ON jl.account_id = a.id
    LEFT JOIN journal j ON j.id = jl.journal_id
                       AND (p_entity IS NULL OR j.entity_id = p_entity)
                       AND j.status = 'posted'
   WHERE a.is_active
     AND NOT EXISTS (SELECT 1 FROM account_fs_map m
                      WHERE m.account_id = a.id AND m.framework_code = p_fs_framework)
   GROUP BY a.id, a.code, a.name, a.account_type
   ORDER BY (round(coalesce(sum(jl.func_amount),0),2) <> 0) DESC, a.code;
$$;

-- Mapping an account to a caption. The foreign key into fs_caption already
-- prevents an invented caption, so this adds only the audit trail.
CREATE OR REPLACE FUNCTION account_fs_map_set(
  p_account bigint, p_fs_framework text, p_caption_code text)
RETURNS account_fs_map LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r account_fs_map;
BEGIN
  INSERT INTO account_fs_map(account_id, framework_code, caption_code)
  VALUES (p_account, p_fs_framework, trim(p_caption_code))
  ON CONFLICT (account_id, framework_code) DO UPDATE SET
    caption_code = EXCLUDED.caption_code
  RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'account_fs_map', p_account, 'account mapped to caption',
                   p_fs_framework || ' → ' || trim(p_caption_code));
  RETURN r;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'There is no caption "%" in the % format. Valid captions: %',
    trim(p_caption_code), p_fs_framework,
    (SELECT string_agg(c.code, ', ' ORDER BY c.sort_order)
       FROM fs_caption c WHERE c.framework_code = p_fs_framework);
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- GENERATION, USING fs_caption
-- ─────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS accounts_set_generate(bigint);

CREATE OR REPLACE FUNCTION accounts_set_generate(p_set bigint)
RETURNS TABLE(statement text, mode text, lines bigint, unmapped_with_balance bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE s accounts_set; fsf text; unmapped int;
BEGIN
  SELECT * INTO s FROM accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF s.status <> 'draft' THEN
    RAISE EXCEPTION 'That set is % — only a draft can be regenerated, because regenerating a signed set would alter a signed statement',
      s.status;
  END IF;

  SELECT rf.fs_framework_code INTO fsf
    FROM reporting_framework rf WHERE rf.code = s.framework_code;

  DELETE FROM accounts_line WHERE set_id = p_set;

  IF fsf IS NOT NULL AND EXISTS (SELECT 1 FROM fs_caption WHERE framework_code = fsf) THEN
    -- Statutory: the engine's captions, in the engine's order.
    -- fs_caption.statement uses 'BS' and 'PL'; accounts_line uses the longer
    -- names, so they are translated rather than assumed to match.
    INSERT INTO accounts_line(set_id, statement, caption, note_ref, sort_order,
                              is_subtotal, current_amount, prior_amount)
    SELECT p_set,
           CASE c.statement WHEN 'BS' THEN 'balance_sheet'
                            WHEN 'PL' THEN 'income_statement'
                            WHEN 'IC' THEN 'income_statement'
                            WHEN 'AL' THEN 'balance_sheet'
                            ELSE 'other' END,
           c.caption, c.note_no::text, c.sort_order, coalesce(c.is_subtotal,false),
           round(coalesce(sum(CASE
             WHEN c.statement IN ('BS','AL') AND j.journal_date <= s.period_end
               THEN jl.func_amount
             WHEN c.statement IN ('PL','IC')
                  AND j.journal_date BETWEEN s.period_start AND s.period_end
               THEN -jl.func_amount END), 0), 2),
           CASE WHEN s.prior_end IS NULL THEN NULL ELSE
             round(coalesce(sum(CASE
               WHEN c.statement IN ('BS','AL') AND j.journal_date <= s.prior_end
                 THEN jl.func_amount
               WHEN c.statement IN ('PL','IC')
                    AND j.journal_date BETWEEN s.prior_start AND s.prior_end
                 THEN -jl.func_amount END), 0), 2) END
      FROM fs_caption c
      LEFT JOIN account_fs_map m ON m.framework_code = c.framework_code
                                AND m.caption_code = c.code
      LEFT JOIN account a ON a.id = m.account_id
      LEFT JOIN journal_line jl ON jl.account_id = a.id
      LEFT JOIN journal j ON j.id = jl.journal_id AND j.entity_id = s.entity_id
                         AND j.status = 'posted'
     WHERE c.framework_code = fsf
     GROUP BY c.statement, c.caption, c.note_no, c.sort_order, c.is_subtotal;
  ELSE
    -- No format for this framework. Grouped by account type and LABELLED, so
    -- it cannot be mistaken for a statutory format.
    INSERT INTO accounts_line(set_id, statement, caption, sort_order,
                              current_amount, prior_amount)
    SELECT p_set,
           CASE WHEN a.account_type IN ('income','expense')
                THEN 'income_statement' ELSE 'balance_sheet' END,
           'DRAFT — ' || initcap(a.account_type) || ': ' || a.name,
           row_number() OVER (ORDER BY a.account_type, a.code),
           round(coalesce(sum(CASE
             WHEN a.account_type IN ('income','expense')
                  AND j.journal_date BETWEEN s.period_start AND s.period_end
               THEN -jl.func_amount
             WHEN a.account_type NOT IN ('income','expense')
                  AND j.journal_date <= s.period_end
               THEN jl.func_amount END), 0), 2),
           NULL
      FROM account a
      JOIN journal_line jl ON jl.account_id = a.id
      JOIN journal j ON j.id = jl.journal_id
     WHERE j.entity_id = s.entity_id AND j.status = 'posted'
     GROUP BY a.id, a.name, a.code, a.account_type
    HAVING round(coalesce(sum(jl.func_amount),0),2) <> 0;
  END IF;

  SELECT count(*) INTO unmapped
    FROM account_mapping_gaps(coalesce(fsf,'none'), s.entity_id) g WHERE g.has_balance;

  PERFORM ea_audit(s.entity_id, 'accounts_set', p_set,
                   CASE WHEN fsf IS NOT NULL THEN 'statements generated (' || fsf || ' format)'
                        ELSE 'statements generated (DRAFT grouping — no format for this framework)' END,
                   (SELECT count(*)::text FROM accounts_line WHERE set_id = p_set) ||
                   ' lines, ' || unmapped || ' unmapped account(s) with a balance');

  RETURN QUERY
  SELECT l.statement,
         CASE WHEN fsf IS NOT NULL THEN 'statutory (' || fsf || ')' ELSE 'draft' END,
         count(*), unmapped::bigint
    FROM accounts_line l WHERE l.set_id = p_set
   GROUP BY l.statement ORDER BY l.statement;
END $$;

-- ── Format gates ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounts_format_readiness(p_set bigint)
RETURNS TABLE(gate text, passed boolean, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s accounts_set; fsf text; n_cap int; n_unmapped int;
BEGIN
  SELECT * INTO s FROM accounts_set WHERE id = p_set;
  SELECT rf.fs_framework_code INTO fsf FROM reporting_framework rf WHERE rf.code = s.framework_code;

  SELECT count(*) INTO n_cap FROM fs_caption WHERE framework_code = coalesce(fsf,'none');
  RETURN QUERY SELECT 'Statutory format available'::text, (n_cap > 0),
    CASE WHEN n_cap > 0 THEN n_cap || ' caption(s) from the ' || fsf || ' format'
         ELSE 'No presentation format exists for ' || s.framework_code ||
              '. The figures are grouped by account type, which is reviewable but NOT filable — statutory accounts use prescribed captions in a prescribed order.'
    END;

  SELECT count(*) INTO n_unmapped
    FROM account_mapping_gaps(coalesce(fsf,'none'), s.entity_id) g WHERE g.has_balance;
  RETURN QUERY SELECT 'All accounts with a balance are mapped'::text, (n_unmapped = 0),
    CASE WHEN n_unmapped = 0 THEN 'none unmapped'
         ELSE n_unmapped || ' account(s) carry a balance and map to no caption — those figures would be MISSING from the accounts while the statements still balance'
    END;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'account_fs_map%' OR p.proname LIKE 'account_mapping%'
            OR p.proname LIKE 'accounts_%' OR p.proname = 'framework_format_status')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

GRANT SELECT ON fs_framework, fs_caption, account_fs_map TO authenticated;

SELECT code, fs_framework_code, captions, has_format, checklist_verified
  FROM framework_format_status() ORDER BY has_format DESC, code;

-- ───────────────────────────────────────────────────────────────────────
-- 072_cash_flow_and_documents.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 072: CASH FLOW, EQUITY AND THE STATUTORY DOCUMENTS
--
-- Completes accounts generation. Before writing a cash flow generator I
-- checked whether one existed — it does. cash_flow_statement(entity, start,
-- end) returns the six standard sections and works. So this CALLS it rather
-- than writing a second one.
--
-- That check is here deliberately: this build has twice produced a parallel
-- version of something the engine already had (a period_lock table alongside
-- accounting_period, and a statement_format table alongside fs_caption). Both
-- times the duplicate was found by accident rather than by looking.
--
-- Run AFTER 071. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- CASH FLOW AND EQUITY INTO THE SET
-- ─────────────────────────────────────────────────────────────────────
-- Held as lines on the set like the other statements, so a filed set carries
-- its own cash flow rather than recalculating it from a ledger that has since
-- moved.
CREATE OR REPLACE FUNCTION accounts_set_generate_cash_flow(p_set bigint)
RETURNS TABLE(section text, current_amount numeric, prior_amount numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE s accounts_set; ord int := 0; r record;
BEGIN
  SELECT * INTO s FROM accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF s.status <> 'draft' THEN
    RAISE EXCEPTION 'That set is % — only a draft can be regenerated', s.status;
  END IF;

  DELETE FROM accounts_line WHERE set_id = p_set AND statement = 'cash_flow';

  FOR r IN SELECT c.section, c.amount FROM cash_flow_statement(s.entity_id, s.period_start, s.period_end) c
  LOOP
    ord := ord + 10;
    INSERT INTO accounts_line(set_id, statement, caption, sort_order,
                              is_subtotal, current_amount, prior_amount)
    VALUES (p_set, 'cash_flow', r.section, ord,
            -- The net movement and the closing balance are subtotals rather
            -- than sections in their own right.
            (r.section ILIKE 'Net %' OR r.section ILIKE 'Cash at %'),
            round(coalesce(r.amount,0),2),
            CASE WHEN s.prior_start IS NULL THEN NULL ELSE
              (SELECT round(coalesce(p.amount,0),2)
                 FROM cash_flow_statement(s.entity_id, s.prior_start, s.prior_end) p
                WHERE p.section = r.section) END);
  END LOOP;

  PERFORM ea_audit(s.entity_id, 'accounts_set', p_set, 'cash flow generated',
                   ord/10 || ' section(s)');

  RETURN QUERY
  SELECT l.caption, l.current_amount, l.prior_amount
    FROM accounts_line l
   WHERE l.set_id = p_set AND l.statement = 'cash_flow'
   ORDER BY l.sort_order;
END $$;

-- Statement of changes in equity. Built from the equity accounts plus the
-- result for the period, because a reader needs to see how the closing
-- position was arrived at rather than just what it is.
CREATE OR REPLACE FUNCTION accounts_set_generate_equity(p_set bigint)
RETURNS TABLE(caption text, current_amount numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE s accounts_set; opening numeric; result numeric; closing numeric;
BEGIN
  SELECT * INTO s FROM accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF s.status <> 'draft' THEN
    RAISE EXCEPTION 'That set is % — only a draft can be regenerated', s.status;
  END IF;

  DELETE FROM accounts_line WHERE set_id = p_set AND statement = 'equity';

  SELECT round(coalesce(sum(jl.func_amount),0),2) INTO opening
    FROM journal j JOIN journal_line jl ON jl.journal_id = j.id
    JOIN account a ON a.id = jl.account_id
   WHERE j.entity_id = s.entity_id AND j.status = 'posted'
     AND a.account_type = 'equity' AND j.journal_date < s.period_start;

  SELECT round(coalesce(sum(-jl.func_amount),0),2) INTO result
    FROM journal j JOIN journal_line jl ON jl.journal_id = j.id
    JOIN account a ON a.id = jl.account_id
   WHERE j.entity_id = s.entity_id AND j.status = 'posted'
     AND a.account_type IN ('income','expense')
     AND j.journal_date BETWEEN s.period_start AND s.period_end;

  closing := coalesce(opening,0) + coalesce(result,0);

  INSERT INTO accounts_line(set_id, statement, caption, sort_order, is_subtotal, is_total,
                            current_amount)
  VALUES (p_set,'equity','Balance at ' || to_char(s.period_start,'DD Month YYYY'),10,false,false,
          coalesce(opening,0)),
         (p_set,'equity','Profit / (loss) for the period',20,false,false, coalesce(result,0)),
         (p_set,'equity','Balance at ' || to_char(s.period_end,'DD Month YYYY'),30,false,true,
          closing);

  RETURN QUERY
  SELECT l.caption, l.current_amount FROM accounts_line l
   WHERE l.set_id = p_set AND l.statement = 'equity' ORDER BY l.sort_order;
END $$;

-- Generate everything, in the right order, and report what came out.
CREATE OR REPLACE FUNCTION accounts_set_generate_all(p_set bigint)
RETURNS TABLE(statement text, lines bigint, mode text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE s accounts_set; fw reporting_framework; m text;
BEGIN
  SELECT * INTO s FROM accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  SELECT * INTO fw FROM reporting_framework WHERE code = s.framework_code;

  SELECT g.mode INTO m FROM accounts_set_generate(p_set) g LIMIT 1;
  PERFORM accounts_set_generate_equity(p_set);

  -- Only where the framework requires one. FRS 105 and small-entity regimes do
  -- not, and producing an unrequired statement is as wrong as omitting a
  -- required one.
  IF fw.requires_cash_flow THEN
    PERFORM accounts_set_generate_cash_flow(p_set);
  END IF;

  RETURN QUERY
  SELECT l.statement, count(*), coalesce(m,'draft')
    FROM accounts_line l WHERE l.set_id = p_set
   GROUP BY l.statement ORDER BY l.statement;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- THE DOCUMENTS THAT MAKE A SET FILABLE
-- ─────────────────────────────────────────────────────────────────────
-- Filed accounts are not only the statements. A set without a directors'
-- report, a statement of directors' responsibilities and the approval wording
-- is not a filable document, and the readiness check should say so rather than
-- passing on the numbers alone.
CREATE TABLE IF NOT EXISTS accounts_required_document (
  framework_code text NOT NULL REFERENCES reporting_framework(code),
  doc_kind       text NOT NULL,
  title          text NOT NULL,
  guidance       text,
  mandatory      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (framework_code, doc_kind)
);

-- Which documents each framework needs is a matter of company law rather than
-- accounting judgement in most cases, but it still varies by jurisdiction and
-- entity size. Left to be recorded rather than assumed, on the same basis as
-- the disclosure checklists: a list I invented would look complete.
CREATE OR REPLACE FUNCTION accounts_required_document_add(
  p_framework text, p_doc_kind text, p_title text,
  p_guidance text DEFAULT NULL, p_mandatory boolean DEFAULT true,
  p_sort_order int DEFAULT 0)
RETURNS accounts_required_document LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounts_required_document;
BEGIN
  INSERT INTO accounts_required_document(framework_code, doc_kind, title, guidance,
                                         mandatory, sort_order)
  VALUES (p_framework, p_doc_kind, p_title, p_guidance, p_mandatory, p_sort_order)
  ON CONFLICT (framework_code, doc_kind) DO UPDATE SET
    title = EXCLUDED.title, guidance = EXCLUDED.guidance,
    mandatory = EXCLUDED.mandatory, sort_order = EXCLUDED.sort_order
  RETURNING * INTO r;
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- FULL READINESS
-- ─────────────────────────────────────────────────────────────────────
-- Everything: numbers, format, disclosures, documents. One call, so nothing
-- is checked in one place and forgotten in another.
CREATE OR REPLACE FUNCTION accounts_set_readiness_full(p_set bigint)
RETURNS TABLE(category text, gate text, passed boolean, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s accounts_set; n int;
BEGIN
  SELECT * INTO s FROM accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;

  RETURN QUERY SELECT 'Disclosure'::text, g.gate, g.passed, g.detail
                 FROM accounts_set_readiness(p_set) g;
  RETURN QUERY SELECT 'Presentation'::text, g.gate, g.passed, g.detail
                 FROM accounts_format_readiness(p_set) g;

  -- Statement of changes in equity.
  SELECT count(*) INTO n FROM accounts_line WHERE set_id = p_set AND statement = 'equity';
  RETURN QUERY SELECT 'Presentation'::text, 'Statement of changes in equity'::text,
    (n > 0), CASE WHEN n > 0 THEN n || ' line(s)' ELSE 'not generated' END;

  -- Required documents.
  --
  -- The empty case must FAIL, not pass. This is the same mistake I made on the
  -- disclosure gate and then fixed: with nothing recorded, "all present" is
  -- literally true and completely misleading. A gate whose own message says
  -- the list has not been recorded must not report success.
  DECLARE total_docs int;
  BEGIN
    SELECT count(*) INTO total_docs FROM accounts_required_document
     WHERE framework_code = s.framework_code;
    SELECT count(*) INTO n
      FROM accounts_required_document d
     WHERE d.framework_code = s.framework_code AND d.mandatory
       AND NOT EXISTS (SELECT 1 FROM accounts_note an
                        WHERE an.set_id = p_set AND an.kind = d.doc_kind);

    RETURN QUERY SELECT 'Documents'::text, 'Required documents present'::text,
      (total_docs > 0 AND n = 0),
      CASE WHEN total_docs = 0
             THEN 'no required documents recorded for ' || s.framework_code ||
                  ' — a filable set normally needs a directors report, a statement of directors responsibilities and approval wording. Until that list is recorded, completeness cannot be assessed.'
           WHEN n = 0 THEN 'all ' || total_docs || ' present'
           ELSE n || ' of ' || total_docs || ' missing' END;
  END;
END $$;

-- Finalising now checks everything, not only the disclosure gates.
CREATE OR REPLACE FUNCTION accounts_set_finalise(p_set bigint)
RETURNS accounts_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r accounts_set; failed text;
BEGIN
  SELECT * INTO r FROM accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF r.status NOT IN ('draft','in_review') THEN
    RAISE EXCEPTION 'That set is already %', r.status;
  END IF;

  SELECT string_agg('[' || g.category || '] ' || g.gate || ' — ' || g.detail, E'\n  - ')
    INTO failed
    FROM accounts_set_readiness_full(p_set) g WHERE NOT g.passed;

  IF failed IS NOT NULL THEN
    RAISE EXCEPTION E'These accounts are not ready to finalise:\n  - %', failed;
  END IF;

  UPDATE accounts_set SET status = 'finalised', reviewed_by = current_app_user(),
         reviewed_at = now()
   WHERE id = p_set RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'accounts_set', p_set, 'accounts finalised',
                   r.framework_code || ' ' || r.period_start || ' to ' || r.period_end);
  RETURN r;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'accounts_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON accounts_required_document FROM PUBLIC, anon;
GRANT SELECT ON accounts_required_document TO authenticated;

SELECT 'cash flow function reused' AS item, 'cash_flow_statement(entity,start,end)' AS value
UNION ALL SELECT 'statements now generated', 'income, balance sheet, equity, cash flow'
UNION ALL SELECT 'required documents recorded', count(*)::text FROM accounts_required_document;

-- ───────────────────────────────────────────────────────────────────────
-- 073_intercompany_read_layer.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 073: INTERCOMPANY AND TRANSFER PRICING READ LAYER
--
-- Affinity has eight group companies and recharges staff costs across them,
-- so intercompany balances and transfer pricing are not incidental. The
-- functions existed — draw_ic_loan, accrue_ic_loan_interest,
-- settle_intercompany, post_tp_charge — with nothing to read them back.
--
-- Two things drive what this reads:
--
--   RECIPROCITY. An intercompany balance must appear equal and opposite in
--   both companies' books. When it does not, one of them is wrong, and the
--   error is invisible from either side alone — you have to look at the pair.
--   That is the whole point of ic_reciprocity below, and it is the check that
--   consolidation depends on: an unmatched pair does not eliminate.
--
--   ARM'S LENGTH. A transfer pricing charge between group companies has to be
--   at arm's length, and the markup applied has to match the policy that was
--   set. A charge posted at a different rate from the policy is the exposure
--   a tax authority looks for, so tp_variance reports the two side by side
--   rather than reporting the charge alone.
--
-- Run AFTER 072. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- LOANS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ic_loans_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, lender_id bigint, lender text, borrower_id bigint, borrower text,
              ccy char(3), facility numeric, interest_rate numeric, start_date date,
              status text, drawn numeric, headroom numeric, interest_accrued numeric,
              over_facility boolean, no_interest_rate boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.id, l.lender_entity, le.name, l.borrower_entity, be.name,
         l.ccy, l.facility, l.interest_rate, l.start_date, l.status,
         -- Drawn and accrued come from the journals those functions posted,
         -- identified by their source rather than by guessing at accounts.
         round(coalesce((SELECT sum(jl.func_amount) FROM journal j
                           JOIN journal_line jl ON jl.journal_id = j.id
                          WHERE j.entity_id = l.borrower_entity
                            AND j.source = 'IC_LOAN'
                            AND j.narrative LIKE '%' || l.id || '%'), 0), 2),
         round(coalesce(l.facility, 0) -
               coalesce((SELECT sum(jl.func_amount) FROM journal j
                           JOIN journal_line jl ON jl.journal_id = j.id
                          WHERE j.entity_id = l.borrower_entity
                            AND j.source = 'IC_LOAN'
                            AND j.narrative LIKE '%' || l.id || '%'), 0), 2),
         round(coalesce((SELECT sum(jl.func_amount) FROM journal j
                           JOIN journal_line jl ON jl.journal_id = j.id
                          WHERE j.entity_id = l.borrower_entity
                            AND j.source = 'IC_INTEREST'
                            AND j.narrative LIKE '%' || l.id || '%'), 0), 2),
         false,
         -- A loan between group companies with no interest rate is a transfer
         -- pricing exposure in itself: a tax authority will impute one.
         (l.interest_rate IS NULL OR l.interest_rate = 0)
    FROM ic_loan l
    LEFT JOIN entity le ON le.id = l.lender_entity
    LEFT JOIN entity be ON be.id = l.borrower_entity
   WHERE p_entity IS NULL OR l.lender_entity = p_entity OR l.borrower_entity = p_entity
   ORDER BY le.name, be.name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- RECIPROCITY — the check that matters
-- ─────────────────────────────────────────────────────────────────────
-- ── WHAT THIS CAN AND CANNOT CHECK ──────────────────────────────────
--
-- Every intercompany balance should appear in both companies, equal and
-- opposite. Consolidation depends on it: an unmatched pair does not eliminate,
-- so it either distorts the group position or gets forced with a plug.
--
-- BUT the schema does not record a COUNTERPARTY on the journal line. There is
-- an is_intercompany flag on the account and nothing that says which company
-- the balance is with. A first version of this function cross-joined every
-- entity holding an intercompany balance against every other and reported the
-- differences, which produced pairings that were never meant to reconcile and
-- three "failures" where there was one real one. That is worse than no check:
-- it looks authoritative and is mostly noise.
--
-- So this reports the check that IS valid without counterparty data: across
-- the whole group, intercompany balances must sum to nil. If they do not,
-- something is posted on one side only — which is the error that matters — and
-- the per-entity balances are shown so it can be traced.
--
-- Recording a counterparty on intercompany postings would allow true
-- pair-by-pair reconciliation. That is a schema change and worth doing, but it
-- is not something to fake in a report.
-- Per-entity intercompany balances, plus the group total that must be nil.
CREATE OR REPLACE FUNCTION ic_balances(p_as_at date DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, ccy char(3),
              ic_balance numeric, postings bigint, is_group_total boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT j.entity_id, e.name, e.functional_ccy,
         round(sum(jl.func_amount), 2), count(*), false
    FROM journal j
    JOIN journal_line jl ON jl.journal_id = j.id
    JOIN account a ON a.id = jl.account_id
    LEFT JOIN entity e ON e.id = j.entity_id
   WHERE a.is_intercompany AND j.status = 'posted'
     AND (p_as_at IS NULL OR j.journal_date <= p_as_at)
   GROUP BY j.entity_id, e.name, e.functional_ccy

  UNION ALL

  -- The group total. Nil is the only correct answer; anything else means a
  -- posting exists on one side and not the other.
  SELECT NULL, 'GROUP TOTAL — must be nil', NULL,
         round(coalesce(sum(jl.func_amount), 0), 2), count(*), true
    FROM journal j
    JOIN journal_line jl ON jl.journal_id = j.id
    JOIN account a ON a.id = jl.account_id
   WHERE a.is_intercompany AND j.status = 'posted'
     AND (p_as_at IS NULL OR j.journal_date <= p_as_at)

   ORDER BY 6, 4 DESC;
$$;

CREATE OR REPLACE FUNCTION ic_settlements_list(p_entity bigint DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS TABLE(id bigint, creditor_id bigint, creditor text, debtor_id bigint, debtor text,
              settle_date date, ccy char(3), amount numeric,
              both_sides_posted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.creditor_entity, ce.name, s.debtor_entity, de.name,
         s.settle_date, s.ccy, s.amount,
         -- A settlement posted on only one side leaves both companies wrong.
         (s.creditor_journal_id IS NOT NULL AND s.debtor_journal_id IS NOT NULL)
    FROM ic_settlement s
    LEFT JOIN entity ce ON ce.id = s.creditor_entity
    LEFT JOIN entity de ON de.id = s.debtor_entity
   WHERE p_entity IS NULL OR s.creditor_entity = p_entity OR s.debtor_entity = p_entity
   ORDER BY s.settle_date DESC
   LIMIT coalesce(p_limit, 100);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- TRANSFER PRICING
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tp_policies_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, from_id bigint, from_entity text, to_id bigint, to_entity text,
              service_type text, markup_pct numeric, charges bigint,
              charged_total numeric, no_markup boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.from_entity, fe.name, p.to_entity, te.name,
         p.service_type, p.markup_pct,
         (SELECT count(*) FROM journal j
           WHERE j.entity_id = p.to_entity AND j.source = 'TP_CHARGE'
             AND j.narrative ILIKE '%' || p.service_type || '%'),
         round(coalesce((SELECT sum(jl.func_amount) FROM journal j
                           JOIN journal_line jl ON jl.journal_id = j.id
                          WHERE j.entity_id = p.to_entity AND j.source = 'TP_CHARGE'
                            AND j.narrative ILIKE '%' || p.service_type || '%'
                            AND jl.func_amount > 0), 0), 2),
         -- A nil markup on an intra-group service is the position a tax
         -- authority challenges first, because it is not what an independent
         -- party would charge.
         (p.markup_pct IS NULL OR p.markup_pct = 0)
    FROM tp_policy p
    LEFT JOIN entity fe ON fe.id = p.from_entity
    LEFT JOIN entity te ON te.id = p.to_entity
   WHERE p_entity IS NULL OR p.from_entity = p_entity OR p.to_entity = p_entity
   ORDER BY fe.name, te.name, p.service_type;
$$;

-- Where a group company is charged for a service with no policy behind it.
-- A charge without a recorded policy has no documented basis, which is the
-- first thing asked for on a transfer pricing enquiry.
CREATE OR REPLACE FUNCTION tp_undocumented_charges(p_entity bigint DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, journal_id bigint,
              journal_date date, narrative text, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT j.entity_id, e.name, j.id, j.journal_date, j.narrative,
         round(coalesce(sum(jl.func_amount) FILTER (WHERE jl.func_amount > 0), 0), 2)
    FROM journal j
    JOIN journal_line jl ON jl.journal_id = j.id
    LEFT JOIN entity e ON e.id = j.entity_id
   WHERE j.source = 'TP_CHARGE'
     AND j.status = 'posted'
     AND (p_entity IS NULL OR j.entity_id = p_entity)
     AND NOT EXISTS (
       SELECT 1 FROM tp_policy p
        WHERE p.to_entity = j.entity_id
          AND j.narrative ILIKE '%' || p.service_type || '%')
   GROUP BY j.entity_id, e.name, j.id, j.journal_date, j.narrative
   ORDER BY j.journal_date DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- WHAT NEEDS ATTENTION
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ic_overview(p_entity bigint DEFAULT NULL)
RETURNS TABLE(area text, headline text, count_value bigint,
              amount_value numeric, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- The group total. Nil is the only correct answer, and a non-nil total
  -- means something is posted on one side only. Reported as one figure rather
  -- than as invented pairs, because the schema records no counterparty.
  RETURN QUERY
  SELECT 'Intercompany'::text,
         'group intercompany balance does not eliminate to nil'::text,
         (SELECT count(*) FROM ic_balances(NULL) b
           WHERE b.is_group_total AND b.ic_balance <> 0)::bigint,
         (SELECT round(b.ic_balance,2) FROM ic_balances(NULL) b WHERE b.is_group_total),
         CASE WHEN (SELECT count(*) FROM ic_balances(NULL) b
                     WHERE b.is_group_total AND b.ic_balance <> 0) > 0
              THEN 'critical' ELSE 'ok' END;

  RETURN QUERY
  SELECT 'Intercompany'::text, 'settlements posted on only one side'::text,
         count(*)::bigint, round(coalesce(sum(s.amount),0),2),
         CASE WHEN count(*) > 0 THEN 'critical' ELSE 'ok' END
    FROM ic_settlements_list(p_entity, 1000) s WHERE NOT s.both_sides_posted;

  RETURN QUERY
  SELECT 'Transfer pricing'::text, 'charges with no recorded policy'::text,
         count(*)::bigint, round(coalesce(sum(c.amount),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM tp_undocumented_charges(p_entity) c;

  RETURN QUERY
  SELECT 'Transfer pricing'::text, 'policies with no markup'::text,
         count(*)::bigint, NULL::numeric,
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM tp_policies_list(p_entity) p WHERE p.no_markup;

  RETURN QUERY
  SELECT 'Intercompany loans'::text, 'loans with no interest rate'::text,
         count(*)::bigint, round(coalesce(sum(l.facility),0),2),
         CASE WHEN count(*) > 0 THEN 'attention' ELSE 'ok' END
    FROM ic_loans_list(p_entity) l WHERE l.no_interest_rate;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('ic_loans_list','ic_balances','ic_settlements_list',
                         'tp_policies_list','tp_undocumented_charges','ic_overview')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

GRANT SELECT ON ic_loan, ic_settlement, tp_policy TO authenticated;

SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('ic_loans_list','ic_balances','ic_settlements_list',
                     'tp_policies_list','tp_undocumented_charges','ic_overview')
 ORDER BY p.proname;

-- ───────────────────────────────────────────────────────────────────────
-- 074_consolidate_accounts_models.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 074: CONSOLIDATE THE TWO ACCOUNTS-PRODUCTION MODELS
--
-- ── WHAT WENT WRONG ─────────────────────────────────────────────────
--
-- In 069 I built an accounts_set table with create, finalise and approve
-- functions. fs_accounts_set ALREADY EXISTED, with create_accounts_set,
-- finalise_accounts, approve_accounts and a v_accounts_production_status view.
--
-- That is the third time in this build I have duplicated existing
-- infrastructure: a period_lock table when accounting_period existed, a
-- statement_format table when fs_caption existed, and now this. Each time I
-- found it by accident. The pattern is that I read the functions I needed and
-- did not read what was already there.
--
-- ── WHY THIS ONE IS WORSE ───────────────────────────────────────────
--
-- The two models have OPPOSITE WORKFLOW ORDERS:
--
--   existing:  draft → approved → finalised
--   mine:      draft → finalised → approved
--
-- Two accounts-production models in one system with reversed sequences is how
-- a set ends up approved in one place and draft in the other, and how a
-- director signs something that was never reviewed. It had to be resolved
-- rather than left for someone to discover.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────
--
-- Consolidates onto fs_accounts_set, the pre-existing table, because that is
-- the one with the view and the functions the rest of the engine may reference.
-- My model contributed the parts that make a set filable — basis of
-- preparation, going concern, the disclosure checklist, notes, statement lines
-- and required documents — so those columns are added to fs_accounts_set and
-- my satellite tables are repointed at it.
--
-- ON THE WORKFLOW ORDER: the existing sequence is kept. Approval before
-- finalisation is the correct order for statutory accounts — the directors
-- approve the accounts, and finalisation locks them afterwards. My order had
-- it backwards.
--
-- Neither table holds real data (fs_accounts_set 0 rows, mine 1 test row), so
-- nothing is lost.
--
-- Run AFTER 073. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. EXTEND fs_accounts_set WITH WHAT MADE MY MODEL USEFUL
-- ─────────────────────────────────────────────────────────────────────
-- fs_accounts_set.framework_code is a FOREIGN KEY to fs_framework (the
-- presentation formats: FRS102_1A, IFRS, GAPSME, TRUST). My reporting_framework
-- registry is a different, finer-grained list — FRS102 vs FRS102-1A vs FRS105,
-- Malta IFRS vs Cyprus IFRS — because jurisdiction acceptability and audit
-- requirements differ where the presentation format does not.
--
-- Both are needed, so the set records the presentation framework in the
-- existing column and the regulatory one alongside it. Storing only one would
-- lose either the format or the jurisdiction rules.
ALTER TABLE fs_accounts_set ADD COLUMN IF NOT EXISTS reporting_framework_code text
  REFERENCES reporting_framework(code);
ALTER TABLE fs_accounts_set ADD COLUMN IF NOT EXISTS ccy char(3);
ALTER TABLE fs_accounts_set ADD COLUMN IF NOT EXISTS basis_of_preparation text;
ALTER TABLE fs_accounts_set ADD COLUMN IF NOT EXISTS going_concern_basis boolean;
ALTER TABLE fs_accounts_set ADD COLUMN IF NOT EXISTS going_concern_note text;
ALTER TABLE fs_accounts_set ADD COLUMN IF NOT EXISTS audit_required boolean;
ALTER TABLE fs_accounts_set ADD COLUMN IF NOT EXISTS auditor text;
ALTER TABLE fs_accounts_set ADD COLUMN IF NOT EXISTS audit_opinion text;
ALTER TABLE fs_accounts_set ADD COLUMN IF NOT EXISTS filed_at timestamptz;
ALTER TABLE fs_accounts_set ADD COLUMN IF NOT EXISTS filed_ref text;

-- ─────────────────────────────────────────────────────────────────────
-- 2. REPOINT THE SATELLITE TABLES
-- ─────────────────────────────────────────────────────────────────────
-- accounts_line, accounts_note and accounts_disclosure referenced my
-- accounts_set. They now reference fs_accounts_set, so there is one set of
-- statements, notes and disclosures per accounts set rather than two possible
-- homes for them.
ALTER TABLE accounts_line       DROP CONSTRAINT IF EXISTS accounts_line_set_id_fkey;
ALTER TABLE accounts_note       DROP CONSTRAINT IF EXISTS accounts_note_set_id_fkey;
ALTER TABLE accounts_disclosure DROP CONSTRAINT IF EXISTS accounts_disclosure_set_id_fkey;

-- Nothing to migrate: my table holds one test row and fs_accounts_set is
-- empty. Clearing the satellites rather than repointing an orphan.
TRUNCATE accounts_line, accounts_disclosure;
DELETE FROM accounts_note;

ALTER TABLE accounts_line
  ADD CONSTRAINT accounts_line_set_id_fkey
  FOREIGN KEY (set_id) REFERENCES fs_accounts_set(id) ON DELETE CASCADE;
ALTER TABLE accounts_note
  ADD CONSTRAINT accounts_note_set_id_fkey
  FOREIGN KEY (set_id) REFERENCES fs_accounts_set(id) ON DELETE CASCADE;
ALTER TABLE accounts_disclosure
  ADD CONSTRAINT accounts_disclosure_set_id_fkey
  FOREIGN KEY (set_id) REFERENCES fs_accounts_set(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- 3. RETIRE MY DUPLICATE
-- ─────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS accounts_set_create(bigint, text, date, date, date, date);
DROP FUNCTION IF EXISTS accounts_set_approve(bigint, text);
DROP TABLE IF EXISTS accounts_set CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- 4. ONE SET OF FUNCTIONS, ON THE EXISTING TABLE AND THE EXISTING ORDER
-- ─────────────────────────────────────────────────────────────────────
-- Creating a set. Wraps the existing create_accounts_set so the engine's own
-- function remains the single writer, and adds what it does not do: the
-- jurisdiction check and seeding the disclosure checklist.
CREATE OR REPLACE FUNCTION accounts_set_open(
  p_entity bigint, p_framework text, p_period_start date, p_period_end date,
  p_prior_start date DEFAULT NULL, p_prior_end date DEFAULT NULL)
RETURNS fs_accounts_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r fs_accounts_set; fw reporting_framework; loc text; n_req int; new_id bigint;
BEGIN
  SELECT location_code INTO loc FROM entity WHERE id = p_entity;
  IF loc IS NULL THEN RAISE EXCEPTION 'Unknown entity'; END IF;

  SELECT * INTO fw FROM reporting_framework WHERE code = p_framework;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reporting framework: %', p_framework; END IF;

  IF NOT EXISTS (SELECT 1 FROM framework_jurisdiction fj
                  WHERE fj.framework_code = p_framework AND fj.location_code = loc) THEN
    RAISE EXCEPTION '% is not recorded as acceptable in %. Acceptable frameworks: %',
      p_framework, loc,
      (SELECT string_agg(fj.framework_code, ', ') FROM framework_jurisdiction fj
        WHERE fj.location_code = loc);
  END IF;

  IF p_period_end > current_date THEN
    RAISE EXCEPTION 'The period ends in the future — accounts cannot be prepared for a period that has not finished';
  END IF;

  -- The existing table keys on the PRESENTATION framework, so translate.
  -- A framework with no format cannot have a set opened against it, which is
  -- the correct outcome: there would be nothing to present it in.
  IF fw.fs_framework_code IS NULL THEN
    RAISE EXCEPTION 'There is no presentation format for %. A set cannot be opened until one is defined — statutory accounts need prescribed captions in a prescribed order.',
      p_framework;
  END IF;

  new_id := create_accounts_set(p_entity, fw.fs_framework_code,
                                p_period_start, p_period_end,
                                p_prior_start, p_prior_end, current_app_user());

  UPDATE fs_accounts_set
     SET reporting_framework_code = p_framework,
         ccy = (SELECT functional_ccy FROM entity WHERE id = p_entity),
         audit_required = fw.requires_audit
   WHERE id = new_id RETURNING * INTO r;

  INSERT INTO accounts_disclosure(set_id, requirement_id, status)
  SELECT new_id, d.id, 'outstanding'
    FROM disclosure_requirement d WHERE d.framework_code = p_framework
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO n_req FROM accounts_disclosure WHERE set_id = new_id;
  PERFORM ea_audit(p_entity, 'fs_accounts_set', new_id, 'accounts set opened',
                   p_framework || ' ' || p_period_start || ' to ' || p_period_end ||
                   ' — ' || n_req || ' disclosure requirement(s)');
  RETURN r;
END $$;

-- Approval, in the correct place in the sequence: BEFORE finalisation. The
-- directors approve the accounts; finalisation locks them afterwards.
--
-- Wraps the engine's approve_accounts and adds the two controls it lacks:
-- naming the director, and refusing the preparer.
CREATE OR REPLACE FUNCTION accounts_approve(p_set bigint, p_director text)
RETURNS fs_accounts_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r fs_accounts_set; failed text;
BEGIN
  IF coalesce(trim(p_director),'') = '' THEN
    RAISE EXCEPTION 'Name the director approving these accounts — they are signing that the accounts give a true and fair view';
  END IF;
  SELECT * INTO r FROM fs_accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF r.prepared_by IS NOT NULL AND lower(r.prepared_by) = lower(current_app_user()) THEN
    RAISE EXCEPTION 'You prepared these accounts — approval must be recorded by someone else';
  END IF;

  -- Every readiness gate must pass BEFORE approval, not before finalisation.
  -- A director should not be asked to approve a set with outstanding
  -- disclosures; finalisation afterwards only locks what was approved.
  SELECT string_agg('[' || g.category || '] ' || g.gate || ' — ' || g.detail, E'\n  - ')
    INTO failed FROM accounts_set_readiness_full(p_set) g WHERE NOT g.passed;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION E'These accounts are not ready for approval:\n  - %', failed;
  END IF;

  PERFORM approve_accounts(p_set, current_app_user());
  UPDATE fs_accounts_set SET approved_by = p_director WHERE id = p_set RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'fs_accounts_set', p_set, 'ACCOUNTS APPROVED',
                   'approved by ' || p_director || ', recorded by ' || current_app_user());
  RETURN r;
END $$;

-- Finalisation locks an approved set. The engine's own function already
-- refuses unless the set is approved and the trial balance balances, which is
-- the right pair of checks — this adds the audit line.
CREATE OR REPLACE FUNCTION accounts_finalise(p_set bigint)
RETURNS fs_accounts_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r fs_accounts_set;
BEGIN
  SELECT * INTO r FROM fs_accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;

  PERFORM finalise_accounts(p_set, current_app_user());
  SELECT * INTO r FROM fs_accounts_set WHERE id = p_set;
  PERFORM ea_audit(r.entity_id, 'fs_accounts_set', p_set, 'ACCOUNTS FINALISED',
                   r.framework_code || ' ' || r.period_start || ' to ' || r.period_end ||
                   ' — locked');
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. REPOINT THE READERS AND GENERATORS
-- ─────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS accounts_sets_list(bigint);
CREATE OR REPLACE FUNCTION accounts_sets_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, framework_code text,
              framework_name text, period_start date, period_end date,
              has_comparatives boolean, ccy char(3), status text, locked boolean,
              prepared_by text, approved_by text, approved_at timestamptz,
              finalised_by text, lines bigint, notes bigint,
              disclosures_outstanding bigint, gates_failed bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.entity_id, e.name,
         coalesce(s.reporting_framework_code, s.framework_code), f.name,
         s.period_start, s.period_end, (s.prior_start IS NOT NULL), s.ccy,
         s.status, s.locked, s.prepared_by, s.approved_by, s.approved_at, s.finalised_by,
         (SELECT count(*) FROM accounts_line l WHERE l.set_id = s.id),
         (SELECT count(*) FROM accounts_note n WHERE n.set_id = s.id),
         (SELECT count(*) FROM accounts_disclosure ad WHERE ad.set_id = s.id
                                                        AND ad.status = 'outstanding'),
         (SELECT count(*) FROM accounts_set_readiness_full(s.id) g WHERE NOT g.passed)
    FROM fs_accounts_set s
    LEFT JOIN entity e ON e.id = s.entity_id
    LEFT JOIN reporting_framework f
           ON f.code = coalesce(s.reporting_framework_code, s.framework_code)
   WHERE p_entity IS NULL OR s.entity_id = p_entity
   ORDER BY s.period_end DESC;
$$;

-- The generators and readiness functions referenced accounts_set by name.
-- Repointed by replacing the table reference; the logic is unchanged.
CREATE OR REPLACE FUNCTION accounts_set_readiness(p_set bigint)
RETURNS TABLE(gate text, passed boolean, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s fs_accounts_set; fw reporting_framework; n int; bs numeric; total_req int;
BEGIN
  SELECT * INTO s FROM fs_accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  -- The regulatory framework, not the presentation one: the disclosure
  -- checklist, audit and cash flow requirements hang off reporting_framework.
  SELECT * INTO fw FROM reporting_framework
   WHERE code = coalesce(s.reporting_framework_code, s.framework_code);

  RETURN QUERY SELECT 'Framework checklist verified'::text,
    (fw.checklist_verified_at IS NOT NULL),
    CASE WHEN fw.checklist_verified_at IS NOT NULL
         THEN fw.checklist_edition || ', verified by ' || fw.checklist_verified_by
         ELSE 'No verified disclosure checklist exists for ' || fw.code ||
              '. A qualified person must author the requirements and confirm the edition before accounts can be approved on this basis.'
    END;

  SELECT count(*) INTO n FROM accounts_line WHERE set_id = p_set;
  RETURN QUERY SELECT 'Primary statements generated'::text, (n > 0), n || ' line(s)';

  SELECT round(coalesce(sum(current_amount),0),2) INTO bs
    FROM accounts_line WHERE set_id = p_set AND statement = 'balance_sheet';
  RETURN QUERY SELECT 'Balance sheet balances'::text, (coalesce(bs,0) = 0),
    CASE WHEN coalesce(bs,0) = 0 THEN 'assets less liabilities and equity is nil'
         ELSE 'out by ' || bs END;

  SELECT count(*) INTO total_req FROM accounts_disclosure WHERE set_id = p_set;
  SELECT count(*) INTO n FROM accounts_disclosure ad
    JOIN disclosure_requirement d ON d.id = ad.requirement_id
   WHERE ad.set_id = p_set AND d.mandatory AND ad.status = 'outstanding';
  RETURN QUERY SELECT 'Mandatory disclosures addressed'::text,
    (total_req > 0 AND n = 0),
    CASE WHEN total_req = 0
           THEN 'no disclosure requirements exist for this framework, so completeness cannot be assessed'
         WHEN n = 0 THEN 'all ' || total_req || ' addressed'
         ELSE n || ' of ' || total_req || ' outstanding' END;

  SELECT count(*) INTO n FROM accounts_disclosure
   WHERE set_id = p_set AND status = 'not_applicable'
     AND coalesce(trim(not_applicable_reason),'') = '';
  RETURN QUERY SELECT 'Not-applicable disclosures explained'::text, (n = 0),
    CASE WHEN n = 0 THEN 'all explained' ELSE n || ' with no reason given' END;

  SELECT count(*) INTO n FROM accounts_note WHERE set_id = p_set AND kind = 'policy';
  RETURN QUERY SELECT 'Accounting policies stated'::text, (n > 0), n || ' policy note(s)';

  RETURN QUERY SELECT 'Going concern considered'::text,
    (s.going_concern_basis IS NOT NULL),
    CASE WHEN s.going_concern_basis IS NULL THEN 'not recorded'
         WHEN s.going_concern_basis THEN 'prepared on the going concern basis'
         ELSE 'NOT prepared on the going concern basis — ' ||
              coalesce(s.going_concern_note, 'no explanation recorded') END;

  RETURN QUERY SELECT 'Basis of preparation stated'::text,
    (coalesce(s.reporting_framework_code,'') <> 'CAYMAN'
     OR coalesce(trim(s.basis_of_preparation),'') <> ''),
    CASE WHEN coalesce(s.reporting_framework_code,'') = 'CAYMAN'
              AND coalesce(trim(s.basis_of_preparation),'') = ''
         THEN 'Cayman prescribes no framework, so the basis actually used must be stated'
         ELSE 'stated or not required' END;

  IF fw.requires_cash_flow THEN
    SELECT count(*) INTO n FROM accounts_line WHERE set_id = p_set AND statement = 'cash_flow';
    RETURN QUERY SELECT 'Cash flow statement present'::text, (n > 0),
      CASE WHEN n > 0 THEN n || ' line(s)'
           ELSE fw.code || ' requires a cash flow statement and none has been prepared' END;
  END IF;

  RETURN QUERY SELECT 'Comparatives included'::text, (s.prior_start IS NOT NULL),
    CASE WHEN s.prior_start IS NOT NULL THEN 'prior period ' || s.prior_start || ' to ' || s.prior_end
         ELSE 'no comparative period set — permitted only for a first period, which must be disclosed' END;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'accounts_%' OR p.proname IN ('accounts_approve','accounts_finalise'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

GRANT SELECT ON fs_accounts_set TO authenticated;

SELECT 'accounts_set (my duplicate)' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                          WHERE table_name='accounts_set') THEN 'still present'
            ELSE 'dropped' END AS value
UNION ALL
SELECT 'fs_accounts_set columns',
       count(*)::text FROM information_schema.columns WHERE table_name='fs_accounts_set'
UNION ALL
SELECT 'workflow order', 'draft → approved → finalised (the existing, correct order)';


-- ─────────────────────────────────────────────────────────────────────
-- 6. REPOINT THE GENERATORS
-- ─────────────────────────────────────────────────────────────────────
-- Seven functions declared `s accounts_set` and would fail at runtime now the
-- table is gone. Rewritten by substitution — the logic is unchanged, only the
-- type and the framework lookup.
DO $rp$
DECLARE r record; src text; newsrc text; args text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosrc LIKE '%accounts_set%'
       AND p.prosrc NOT LIKE '%fs_accounts_set%'
       AND p.proname IN ('accounts_format_readiness','accounts_note_add',
                         'accounts_set_generate','accounts_set_generate_all',
                         'accounts_set_generate_cash_flow','accounts_set_generate_equity',
                         'accounts_set_readiness_full')
  LOOP
    newsrc := replace(r.def, 's accounts_set;', 's fs_accounts_set;');
    newsrc := replace(newsrc, 'FROM accounts_set WHERE', 'FROM fs_accounts_set WHERE');
    newsrc := replace(newsrc, 'FROM accounts_set w', 'FROM fs_accounts_set w');
    newsrc := replace(newsrc, 'UPDATE accounts_set ', 'UPDATE fs_accounts_set ');
    newsrc := replace(newsrc, 'status INTO st FROM accounts_set', 'status INTO st FROM fs_accounts_set');
    -- the framework lookup must use the regulatory code where one is recorded
    newsrc := replace(newsrc,
      'reporting_framework WHERE code = s.framework_code',
      'reporting_framework WHERE code = coalesce(s.reporting_framework_code, s.framework_code)');
    newsrc := replace(newsrc,
      'rf.code = s.framework_code',
      'rf.code = coalesce(s.reporting_framework_code, s.framework_code)');
    IF newsrc <> r.def THEN
      EXECUTE newsrc;
      RAISE NOTICE 'repointed %', r.proname;
    END IF;
  END LOOP;
END $rp$;

SELECT proname AS still_referencing_dropped_table
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prosrc LIKE '%accounts_set%' AND p.prosrc NOT LIKE '%fs_accounts_set%'
   AND p.proname LIKE 'accounts%'
 ORDER BY 1;

-- ───────────────────────────────────────────────────────────────────────
-- 075_month_end_close.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 075: MONTH-END CLOSE, AND A CONTROL ON CLIENT MONEY SIGN-OFF
--
-- The month-end routines all existed and none was reachable: recurring
-- journals, deferral releases, FX revaluation, depreciation, and the client
-- money reconciliation.
--
-- ── THE CONTROL GAP ────────────────────────────────────────────────
--
-- sign_off_reconciliation correctly refuses to sign off a client money
-- reconciliation with an unremedied shortfall. It does NOT stop the person who
-- prepared the reconciliation from signing it off themselves.
--
-- That is the same gap I found on payment runs and expense claims, and it sits
-- on the regulated three-way reconciliation — bank against book against the
-- sum of client ledgers. A reconciliation prepared and signed by one person is
-- the control a regulator asks to see evidence of, and self-signature is
-- exactly what the evidence is meant to rule out.
--
-- Fixed by wrapping rather than editing the engine's function, as with
-- pay_run_approve.
--
-- Run AFTER 074. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- SEGREGATION ON CLIENT MONEY SIGN-OFF
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cm_recon_sign_off(p_recon_id bigint)
RETURNS client_money_reconciliation
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r client_money_reconciliation; me text;
BEGIN
  me := current_app_user();
  SELECT * INTO r FROM client_money_reconciliation WHERE id = p_recon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation % not found', p_recon_id; END IF;

  IF r.created_by IS NOT NULL AND lower(r.created_by) = lower(me) THEN
    RAISE EXCEPTION 'You prepared this reconciliation — it must be signed off by someone else';
  END IF;

  -- The engine's own function refuses an unremedied shortfall, which is the
  -- other half of the control and is left where it is.
  PERFORM sign_off_reconciliation(p_recon_id, me);
  SELECT * INTO r FROM client_money_reconciliation WHERE id = p_recon_id;

  PERFORM ea_audit(NULL, 'client_money_reconciliation', p_recon_id,
                   'CLIENT MONEY RECONCILIATION SIGNED OFF',
                   'as at ' || r.recon_date || ', prepared by ' ||
                   coalesce(r.created_by,'unknown') || ', signed off by ' || me);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- CLIENT MONEY RECONCILIATION HISTORY
-- ─────────────────────────────────────────────────────────────────────
-- The three differences are shown separately because they mean different
-- things: an internal difference is book against client ledgers (our own
-- records disagreeing), an external difference is book against bank (our
-- records against the bank's), and a shortfall is holding less than we owe.
-- A single "difference" figure would merge three distinct problems.
CREATE OR REPLACE FUNCTION cm_recons_list(
  p_account bigint DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE(id bigint, account_id bigint, account_name text, recon_date date,
              bank_balance numeric, book_balance numeric, client_ledger_total numeric,
              internal_diff numeric, external_diff numeric,
              shortfall numeric, excess numeric,
              status text, created_by text, signed_off_by text,
              self_signed boolean, days_since integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id, r.client_money_account_id, a.name, r.recon_date,
         r.bank_balance, r.book_balance, r.client_ledger_total,
         r.internal_diff, r.external_diff, r.shortfall, r.excess,
         r.status, r.created_by, r.signed_off_by,
         -- Flagged rather than hidden: anything signed off by its preparer
         -- predates the control above and needs reviewing.
         (r.signed_off_by IS NOT NULL AND r.created_by IS NOT NULL
          AND lower(r.signed_off_by) = lower(r.created_by)),
         (current_date - r.recon_date)::integer
    FROM client_money_reconciliation r
    LEFT JOIN client_money_account a ON a.id = r.client_money_account_id
   WHERE p_account IS NULL OR r.client_money_account_id = p_account
   ORDER BY r.recon_date DESC
   LIMIT coalesce(p_limit, 50);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- WHAT IS DUE AT MONTH END
-- ─────────────────────────────────────────────────────────────────────
-- A checklist rather than a dashboard. Each row is something that either has
-- been done for the period or has not, because that is the question at month
-- end — not how much of it there is.
CREATE OR REPLACE FUNCTION month_end_checklist(p_entity bigint, p_period char(7))
RETURNS TABLE(step text, detail text, due_count bigint, done boolean, blocking boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE period_start date; period_end date; n int; open_status text;
BEGIN
  period_start := to_date(p_period || '-01', 'YYYY-MM-DD');
  period_end   := (period_start + interval '1 month - 1 day')::date;

  -- 1. The period has to be open to post into.
  SELECT status INTO open_status FROM accounting_period
   WHERE entity_id = p_entity AND period = p_period;
  RETURN QUERY SELECT 'Period open'::text,
    coalesce('period is ' || open_status, 'no accounting period record exists for ' || p_period),
    0::bigint, (coalesce(open_status,'') = 'open'), true;

  -- 2. FX rates for the period end. Without them a revaluation cannot run and
  --    any foreign currency balance is stated at a stale rate.
  SELECT count(*) INTO n FROM fx_rate WHERE rate_date = period_end;
  RETURN QUERY SELECT 'FX rates loaded'::text,
    CASE WHEN n > 0 THEN n || ' rate(s) at ' || period_end
         ELSE 'no rates at ' || period_end || ' — a revaluation cannot run and foreign currency balances would be stated at a stale rate' END,
    n::bigint, (n > 0), true;

  -- 3. Draft journals. Closing with drafts outstanding leaves the period
  --    incomplete and they cannot be posted once it is locked.
  SELECT count(*) INTO n FROM journal
   WHERE entity_id = p_entity AND journal_date BETWEEN period_start AND period_end
     AND coalesce(status,'') = 'draft';
  RETURN QUERY SELECT 'No draft journals'::text,
    CASE WHEN n = 0 THEN 'none outstanding'
         ELSE n || ' draft journal(s) in the period — these cannot be posted once it is locked' END,
    n::bigint, (n = 0), true;

  -- 4. Recurring journals due.
  SELECT count(*) INTO n FROM recurring_journal
   WHERE entity_id = p_entity AND coalesce(is_active, true)
     AND next_date <= period_end;
  RETURN QUERY SELECT 'Recurring journals posted'::text,
    CASE WHEN n = 0 THEN 'none due' ELSE n || ' due up to ' || period_end END,
    n::bigint, (n = 0), false;

  -- 5. Deferral schedules due for release.
  SELECT count(*) INTO n FROM deferral_schedule
   WHERE entity_id = p_entity AND coalesce(status,'') <> 'complete'
     AND next_post_date IS NOT NULL AND next_post_date <= period_end;
  RETURN QUERY SELECT 'Deferrals released'::text,
    CASE WHEN n = 0 THEN 'none due'
         ELSE n || ' schedule(s) due — an unreleased accrual is a misstatement' END,
    n::bigint, (n = 0), false;

  -- 6. Depreciation.
  SELECT count(*) INTO n FROM fixed_asset
   WHERE entity_id = p_entity AND coalesce(status,'') NOT IN ('disposed','fully_depreciated')
     AND coalesce(accumulated_dep,0) < cost;
  RETURN QUERY SELECT 'Depreciation run'::text,
    CASE WHEN n = 0 THEN 'no assets to depreciate'
         ELSE n || ' asset(s) still depreciating' END,
    n::bigint, (n = 0), false;

  -- 7. Client money reconciliation, where the entity holds client money. This
  --    one is blocking: it is a regulatory requirement, not housekeeping.
  IF EXISTS (SELECT 1 FROM client_money_account WHERE cm_entity_id = p_entity) THEN
    SELECT count(*) INTO n
      FROM client_money_account a
     WHERE a.cm_entity_id = p_entity
       AND NOT EXISTS (
         SELECT 1 FROM client_money_reconciliation r
          WHERE r.client_money_account_id = a.id
            AND r.recon_date BETWEEN period_start AND period_end
            AND r.status = 'signed_off');
    RETURN QUERY SELECT 'Client money reconciled and signed off'::text,
      CASE WHEN n = 0 THEN 'all accounts reconciled and signed off'
           ELSE n || ' client money account(s) with no signed-off reconciliation for the period' END,
      n::bigint, (n = 0), true;
  END IF;

  -- 8. Intercompany elimination.
  RETURN QUERY
  SELECT 'Intercompany eliminates to nil'::text,
         CASE WHEN (SELECT b.ic_balance FROM ic_balances(period_end) b WHERE b.is_group_total) = 0
              THEN 'group total is nil'
              ELSE 'group total is ' ||
                   (SELECT b.ic_balance FROM ic_balances(period_end) b WHERE b.is_group_total) ||
                   ' — something is posted on one side only' END,
         0::bigint,
         ((SELECT b.ic_balance FROM ic_balances(period_end) b WHERE b.is_group_total) = 0),
         false;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('cm_recon_sign_off','cm_recons_list','month_end_checklist')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

GRANT SELECT ON client_money_reconciliation, recurring_journal, fx_rate TO authenticated;

SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('cm_recon_sign_off','cm_recons_list','month_end_checklist')
 ORDER BY p.proname;

-- ───────────────────────────────────────────────────────────────────────
-- 076_fee_transfers_and_intercompany.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 076: FEE TRANSFERS FROM CLIENT MONEY, AND INTERCOMPANY WRITES
--
-- ── THE CONTROL THIS ADDS, AND WHY IT DIFFERS FROM THE OTHERS ───────
--
-- transfer_fee_from_client_money has good controls already: the amount must be
-- positive, the invoice must exist, it must belong to the firm entity, and the
-- transfer cannot exceed the invoice outstanding.
--
-- What it does NOT do is check that the client holds the money first. If the
-- balance goes negative it records a breach afterwards and proceeds.
--
-- For a client-instructed payment that is the right design — the instruction
-- may be unavoidable and the shortfall then has to be remediated. A FEE
-- TRANSFER IS NOT THE SAME THING. It is entirely the firm's own decision, and
-- taking a fee from a client who does not have the money means the firm has
-- used another client's money to pay itself. There is no urgency that
-- justifies it: the bill can wait.
--
-- So this one is REFUSED rather than recorded. That is a deliberate departure
-- from how pay_client_money behaves, and the reason is the difference between
-- acting on a client's instruction and helping oneself.
--
-- Also wires the intercompany writes, completing the module whose read layer
-- was added in db/073.
--
-- Run AFTER 075. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- FEE TRANSFERS
-- ─────────────────────────────────────────────────────────────────────
-- What is available to take, before taking it. Separate and read-only so the
-- interface can show it beside the fee rather than only refusing afterwards.
CREATE OR REPLACE FUNCTION cm_fee_available(p_cm_client bigint, p_invoice bigint)
RETURNS TABLE(client_name text, held numeric, invoice_outstanding numeric,
              available_to_take numeric, sufficient boolean, ccy char(3))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.name,
         round(coalesce((SELECT sum(m.amount) FROM client_money_movement m
                          WHERE m.cm_client_id = c.id), 0), 2),
         round(coalesce(i.gross_total, 0)
               - coalesce((SELECT sum(ra.amount) FROM receipt_allocation ra
                            WHERE ra.invoice_id = i.id), 0), 2),
         -- The lower of the two: you cannot take more than the client holds,
         -- and you cannot take more than you have billed.
         LEAST(
           round(coalesce((SELECT sum(m.amount) FROM client_money_movement m
                            WHERE m.cm_client_id = c.id), 0), 2),
           round(coalesce(i.gross_total, 0)
                 - coalesce((SELECT sum(ra.amount) FROM receipt_allocation ra
                              WHERE ra.invoice_id = i.id), 0), 2)),
         (round(coalesce((SELECT sum(m.amount) FROM client_money_movement m
                            WHERE m.cm_client_id = c.id), 0), 2) > 0),
         i.ccy
    FROM cm_client c
    LEFT JOIN invoice i ON i.id = p_invoice
   WHERE c.id = p_cm_client;
$$;

CREATE OR REPLACE FUNCTION cm_fee_transfer(
  p_cm_client bigint, p_cm_account bigint, p_firm_entity bigint,
  p_firm_bank bigint, p_invoice_id bigint, p_date date, p_amount numeric)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE held numeric; nm text; res bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'The fee to transfer must be a positive amount';
  END IF;

  SELECT c.name,
         round(coalesce((SELECT sum(m.amount) FROM client_money_movement m
                          WHERE m.cm_client_id = c.id), 0), 2)
    INTO nm, held
    FROM cm_client c WHERE c.id = p_cm_client;
  IF nm IS NULL THEN RAISE EXCEPTION 'Client money client % not found', p_cm_client; END IF;

  -- The check the engine's function does not make.
  --
  -- Refused, not recorded. Unlike a payment the client instructed, a fee
  -- transfer is the firm helping itself, and taking more than the client holds
  -- means taking it from another client. The bill can wait.
  IF p_amount > held THEN
    RAISE EXCEPTION 'Cannot take % from % — only % is held for that client. Taking more would be paying the firm out of another client''s money. Bill the client and wait for funds, or transfer only the amount held.',
      round(p_amount,2), nm, round(held,2);
  END IF;

  -- Argument order checked against pg_get_function_identity_arguments:
  -- p_amount comes BEFORE p_date. Passing them the other way round failed at
  -- runtime rather than at install, which is the worst place to find it.
  res := transfer_fee_from_client_money(p_cm_client, p_cm_account, p_firm_entity,
                                        p_firm_bank, p_invoice_id, p_amount, p_date,
                                        current_app_user());

  PERFORM ea_audit(p_firm_entity, 'client_money_movement', res,
                   'FEE TAKEN FROM CLIENT MONEY',
                   round(p_amount,2) || ' from ' || nm || ' against invoice ' ||
                   p_invoice_id || ' — ' || round(held - p_amount,2) || ' remaining');
  RETURN res;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- INTERCOMPANY WRITES
-- ─────────────────────────────────────────────────────────────────────
-- Completes the module read-layered in db/073. Each wraps the engine's
-- function and adds the check it lacks.
CREATE OR REPLACE FUNCTION ic_loan_draw(p_loan bigint, p_date date, p_amount numeric)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE l ic_loan; drawn numeric; res bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'The drawdown must be a positive amount';
  END IF;
  SELECT * INTO l FROM ic_loan WHERE id = p_loan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intercompany loan % not found', p_loan; END IF;
  IF coalesce(l.status,'') NOT IN ('active','') THEN
    RAISE EXCEPTION 'Loan % is %, so it cannot be drawn on', p_loan, l.status;
  END IF;
  IF p_date < l.start_date THEN
    RAISE EXCEPTION 'The drawdown date is before the facility start date of %', l.start_date;
  END IF;

  -- Drawing beyond the facility is not a rounding matter: the facility is the
  -- agreed limit, and exceeding it means the agreement no longer describes
  -- what happened, which is what a tax authority reads.
  SELECT round(coalesce(sum(d.drawn), 0), 2) INTO drawn
    FROM ic_loans_list(NULL) d WHERE d.id = p_loan;
  IF l.facility IS NOT NULL AND l.facility > 0
     AND coalesce(drawn,0) + p_amount > l.facility THEN
    RAISE EXCEPTION 'That would draw % against a facility of % with % already drawn. Increase the facility first, or the agreement will not describe what happened.',
      round(coalesce(drawn,0) + p_amount, 2), round(l.facility,2), round(coalesce(drawn,0),2);
  END IF;

  res := draw_ic_loan(p_loan, p_date, p_amount, current_app_user());
  PERFORM ea_audit(l.borrower_entity, 'ic_loan', p_loan, 'intercompany loan drawn',
                   round(p_amount,2) || ' ' || l.ccy || ' on ' || p_date);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION ic_loan_repay(p_loan bigint, p_date date, p_amount numeric)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE l ic_loan; res bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'The repayment must be a positive amount';
  END IF;
  SELECT * INTO l FROM ic_loan WHERE id = p_loan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intercompany loan % not found', p_loan; END IF;

  res := repay_ic_loan(p_loan, p_date, p_amount, current_app_user());
  PERFORM ea_audit(l.borrower_entity, 'ic_loan', p_loan, 'intercompany loan repaid',
                   round(p_amount,2) || ' ' || l.ccy || ' on ' || p_date);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION ic_loan_accrue(p_loan bigint, p_date date, p_days integer)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE l ic_loan; res bigint;
BEGIN
  SELECT * INTO l FROM ic_loan WHERE id = p_loan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intercompany loan % not found', p_loan; END IF;

  -- A group loan at nil interest is a transfer pricing exposure, and accruing
  -- nothing on it silently is how it stays invisible until an enquiry.
  IF l.interest_rate IS NULL OR l.interest_rate = 0 THEN
    RAISE EXCEPTION 'Loan % has no interest rate, so there is nothing to accrue. A group loan at nil interest is a transfer pricing exposure — record the arm''s length rate on the facility first.',
      p_loan;
  END IF;
  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION 'Give the number of days to accrue for';
  END IF;

  res := accrue_ic_loan_interest(p_loan, p_date, p_days, current_app_user());
  PERFORM ea_audit(l.borrower_entity, 'ic_loan', p_loan, 'intercompany interest accrued',
                   p_days || ' days at ' || l.interest_rate || '% to ' || p_date);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION ic_settle(
  p_creditor bigint, p_debtor bigint, p_date date, p_ccy char(3), p_amount numeric)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE res bigint;
BEGIN
  IF p_creditor = p_debtor THEN
    RAISE EXCEPTION 'An entity cannot settle with itself';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'The settlement must be a positive amount';
  END IF;

  res := settle_intercompany(p_creditor, p_debtor, p_date, p_ccy, p_amount,
                             current_app_user());
  PERFORM ea_audit(p_creditor, 'ic_settlement', res, 'intercompany settled',
                   round(p_amount,2) || ' ' || p_ccy || ' from entity ' || p_debtor ||
                   ' to entity ' || p_creditor);
  RETURN res;
END $$;

-- A transfer pricing charge. Refused where no policy records the markup,
-- because a charge with no documented basis is the first thing asked for on an
-- enquiry.
CREATE OR REPLACE FUNCTION tp_charge_post(
  p_from bigint, p_to bigint, p_date date, p_ccy char(3),
  p_cost_base numeric, p_service_type text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE pol tp_policy; res bigint;
BEGIN
  IF p_from = p_to THEN
    RAISE EXCEPTION 'An entity cannot charge itself';
  END IF;
  IF p_cost_base IS NULL OR p_cost_base <= 0 THEN
    RAISE EXCEPTION 'Give the cost base the markup applies to';
  END IF;

  SELECT * INTO pol FROM tp_policy
   WHERE from_entity = p_from AND to_entity = p_to AND service_type = p_service_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no transfer pricing policy for "%" from entity % to entity %. Record the policy and its markup first — a charge with no documented basis is the first thing asked for on a transfer pricing enquiry.',
      p_service_type, p_from, p_to;
  END IF;

  res := post_tp_charge(p_from, p_to, p_date, p_ccy, p_cost_base, p_service_type);
  PERFORM ea_audit(p_to, 'tp_policy', pol.id, 'transfer pricing charge posted',
                   p_service_type || ': cost base ' || round(p_cost_base,2) || ' ' || p_ccy ||
                   ' at ' || coalesce(pol.markup_pct,0) || '% markup');
  RETURN res;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('cm_fee_available','cm_fee_transfer','ic_loan_draw',
                         'ic_loan_repay','ic_loan_accrue','ic_settle','tp_charge_post')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('cm_fee_available','cm_fee_transfer','ic_loan_draw',
                     'ic_loan_repay','ic_loan_accrue','ic_settle','tp_charge_post')
 ORDER BY p.proname;

-- ───────────────────────────────────────────────────────────────────────
-- 077_accounts_workflow_and_thresholds.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 077: ACCOUNTS WORKFLOW, ADJUSTMENTS AND APPROVAL THRESHOLDS
--
-- ── THE GAP THIS CLOSES ─────────────────────────────────────────────
--
-- post_statutory_adjustment refuses to touch a set that is finalised or
-- locked. It does NOT refuse a set that has been APPROVED.
--
-- So a director approves the accounts, someone posts an audit adjustment that
-- changes the figures, and the set still shows as approved by that director.
-- They signed one set of numbers and different ones would be filed.
--
-- Refusing outright would be wrong: audit adjustments genuinely arise after
-- approval, and the answer is not to prevent them. The answer is that an
-- adjustment to an approved set MUST SEND IT BACK FOR RE-APPROVAL. So this
-- allows the adjustment, reverts the set to draft, clears the approval, and
-- audits it loudly.
--
-- Also completes the workflow — draft, in review, approved, finalised — and
-- adds validation to the journal approval threshold, which had none.
--
-- Run AFTER 076. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- SUBMIT FOR REVIEW
-- ─────────────────────────────────────────────────────────────────────
-- The step between preparing and approving. Its value is that a reviewer
-- looks at the set before a director is asked to sign it, so the readiness
-- gates are reported here rather than enforced — the reviewer's job is partly
-- to see what is outstanding.
CREATE OR REPLACE FUNCTION accounts_submit_for_review(p_set bigint)
RETURNS TABLE(status text, gates_failed bigint, outstanding text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE s fs_accounts_set; n int; list text;
BEGIN
  SELECT * INTO s FROM fs_accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;

  PERFORM submit_accounts_for_review(p_set, current_app_user());

  SELECT count(*), string_agg(g.gate, '; ')
    INTO n, list
    FROM accounts_set_readiness_full(p_set) g WHERE NOT g.passed;

  PERFORM ea_audit(s.entity_id, 'fs_accounts_set', p_set, 'accounts submitted for review',
                   coalesce(n,0) || ' gate(s) still outstanding at submission');

  RETURN QUERY SELECT (SELECT fs.status FROM fs_accounts_set fs WHERE fs.id = p_set),
                      coalesce(n,0)::bigint,
                      coalesce(list, 'nothing outstanding');
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- STATUTORY ADJUSTMENTS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounts_adjust(
  p_set bigint, p_date date, p_narrative text, p_lines jsonb)
RETURNS TABLE(journal_id bigint, set_status text, approval_withdrawn boolean, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE s fs_accounts_set; jid bigint; was_approved boolean; prev_director text;
BEGIN
  SELECT * INTO s FROM fs_accounts_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts set % not found', p_set; END IF;
  IF coalesce(trim(p_narrative),'') = '' THEN
    RAISE EXCEPTION 'Give a narrative for the adjustment — an audit adjustment with no explanation cannot be reviewed';
  END IF;

  was_approved := (coalesce(s.status,'') = 'approved');
  prev_director := s.approved_by;

  -- The engine's function blocks a finalised or locked set, which is correct
  -- and left alone.
  jid := post_statutory_adjustment(p_set, p_date, p_narrative, current_app_user(), p_lines);

  -- Regenerate, so the statements reflect the adjustment rather than showing
  -- the figures the director saw.
  IF coalesce(s.status,'') <> 'draft' THEN
    UPDATE fs_accounts_set SET status = 'draft' WHERE id = p_set;
  END IF;
  PERFORM accounts_set_generate_all(p_set);

  IF was_approved THEN
    -- The approval attached to different figures. Withdrawing it is the point:
    -- the director must see the adjusted accounts and approve those.
    UPDATE fs_accounts_set
       SET approved_by = NULL, approved_at = NULL, status = 'draft'
     WHERE id = p_set;
    PERFORM ea_audit(s.entity_id, 'fs_accounts_set', p_set, 'APPROVAL WITHDRAWN BY ADJUSTMENT',
                     'adjustment "' || p_narrative || '" changed the figures ' ||
                     coalesce(prev_director,'the director') ||
                     ' had approved — the set is back to draft and must be re-approved');
  ELSE
    PERFORM ea_audit(s.entity_id, 'fs_accounts_set', p_set, 'statutory adjustment posted',
                     p_narrative);
  END IF;

  RETURN QUERY SELECT jid,
    (SELECT fs.status FROM fs_accounts_set fs WHERE fs.id = p_set),
    was_approved,
    CASE WHEN was_approved
         THEN 'The approval by ' || coalesce(prev_director,'the director') ||
              ' has been withdrawn: it attached to figures this adjustment has changed. The adjusted accounts must be approved again.'
         ELSE 'Adjustment posted and the statements regenerated.' END;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- YEAR END
-- ─────────────────────────────────────────────────────────────────────
-- Closing a year rolls the result to reserves and is not reversible in the
-- ordinary way, so the preconditions are checked first and reported together.
CREATE OR REPLACE FUNCTION year_end_readiness(
  p_entity bigint, p_fy_start date, p_fy_end date)
RETURNS TABLE(gate text, passed boolean, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  -- Draft journals in the year would be excluded from the result being rolled.
  SELECT count(*) INTO n FROM journal
   WHERE entity_id = p_entity AND journal_date BETWEEN p_fy_start AND p_fy_end
     AND coalesce(status,'') = 'draft';
  RETURN QUERY SELECT 'No draft journals in the year'::text, (n = 0),
    CASE WHEN n = 0 THEN 'none' ELSE n || ' draft journal(s) — these would be left out of the result rolled to reserves' END;

  -- Every month in the year should be closed before the year is.
  SELECT count(*) INTO n
    FROM generate_series(p_fy_start, p_fy_end, interval '1 month') m
   WHERE NOT EXISTS (
     SELECT 1 FROM accounting_period ap
      WHERE ap.entity_id = p_entity
        AND ap.period = to_char(m, 'YYYY-MM')
        AND ap.status IN ('closed','locked'));
  RETURN QUERY SELECT 'All months closed'::text, (n = 0),
    CASE WHEN n = 0 THEN 'all closed or locked'
         ELSE n || ' month(s) still open — closing the year over an open month invites postings into a closed year' END;

  -- A signed-off set of accounts for the year, where one exists at all.
  SELECT count(*) INTO n FROM fs_accounts_set
   WHERE entity_id = p_entity AND period_start = p_fy_start AND period_end = p_fy_end
     AND status IN ('approved','finalised');
  RETURN QUERY SELECT 'Accounts approved for the year'::text, (n > 0),
    CASE WHEN n > 0 THEN 'approved or finalised'
         ELSE 'no approved accounts set for this year — the year can still be closed, but the figures rolled will not have been signed off' END;

  -- Client money, where held.
  IF EXISTS (SELECT 1 FROM client_money_account WHERE cm_entity_id = p_entity) THEN
    SELECT count(*) INTO n FROM cm_shortfalls(p_entity);
    RETURN QUERY SELECT 'No client money shortfalls'::text, (n = 0),
      CASE WHEN n = 0 THEN 'none' ELSE n || ' client(s) in shortfall — these must be remediated before the year closes' END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION year_end_close(
  p_entity bigint, p_fy_start date, p_fy_end date, p_override boolean DEFAULT false)
RETURNS TABLE(journal_id bigint, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE failed text; jid bigint; blocked int;
BEGIN
  -- Two gates are hard: draft journals and client money shortfalls. The others
  -- are advisory, because a year can legitimately be closed before the
  -- accounts are signed. The distinction is stated rather than left to the
  -- caller to work out.
  SELECT count(*) INTO blocked FROM year_end_readiness(p_entity, p_fy_start, p_fy_end) g
   WHERE NOT g.passed
     AND g.gate IN ('No draft journals in the year', 'No client money shortfalls');
  IF blocked > 0 THEN
    SELECT string_agg(g.gate || ' — ' || g.detail, E'\n  - ')
      INTO failed FROM year_end_readiness(p_entity, p_fy_start, p_fy_end) g
     WHERE NOT g.passed
       AND g.gate IN ('No draft journals in the year', 'No client money shortfalls');
    RAISE EXCEPTION E'The year cannot be closed:\n  - %', failed;
  END IF;

  SELECT string_agg(g.gate || ' — ' || g.detail, E'\n  - ')
    INTO failed FROM year_end_readiness(p_entity, p_fy_start, p_fy_end) g WHERE NOT g.passed;
  IF failed IS NOT NULL AND NOT p_override THEN
    RAISE EXCEPTION E'These are not blocking, but confirm before closing:\n  - %\n\nRe-run with the override to proceed.', failed;
  END IF;

  jid := close_year(p_entity, p_fy_start, p_fy_end, current_app_user());
  PERFORM ea_audit(p_entity, 'journal', jid, 'YEAR END CLOSED',
                   p_fy_start || ' to ' || p_fy_end ||
                   CASE WHEN p_override THEN ' (closed with advisory gates outstanding)' ELSE '' END);
  RETURN QUERY SELECT jid,
    'Year closed and the result rolled to reserves.' ||
    CASE WHEN p_override THEN ' Advisory gates were outstanding and overridden.' ELSE '' END;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- JOURNAL APPROVAL THRESHOLD
-- ─────────────────────────────────────────────────────────────────────
-- post_with_approval already reads the threshold and routes a journal above it
-- for approval. set_approval_threshold had no validation at all: a negative
-- threshold, or a threshold set to nil, would silently change what needs
-- approving with nothing recorded.
CREATE OR REPLACE FUNCTION approval_threshold_set(p_entity bigint, p_threshold numeric)
RETURNS TABLE(entity_name text, threshold numeric, previous numeric, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE was numeric; nm text;
BEGIN
  SELECT e.name INTO nm FROM entity e WHERE e.id = p_entity;
  IF nm IS NULL THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;

  IF p_threshold IS NULL OR p_threshold < 0 THEN
    RAISE EXCEPTION 'The threshold must be zero or more. Zero means every journal needs approval; a null threshold would silently mean none do.';
  END IF;

  SELECT r.threshold INTO was FROM journal_approval_rule r WHERE r.entity_id = p_entity;

  INSERT INTO journal_approval_rule(entity_id, threshold)
  VALUES (p_entity, p_threshold)
  ON CONFLICT (entity_id) DO UPDATE SET threshold = EXCLUDED.threshold;

  -- Raising a threshold means fewer journals get approved, which is a
  -- loosening of control and is recorded as such.
  PERFORM ea_audit(p_entity, 'journal_approval_rule', p_entity,
                   CASE WHEN was IS NOT NULL AND p_threshold > was
                        THEN 'APPROVAL THRESHOLD RAISED'
                        ELSE 'approval threshold set' END,
                   'from ' || coalesce(was::text,'none') || ' to ' || p_threshold ||
                   CASE WHEN was IS NOT NULL AND p_threshold > was
                        THEN ' — fewer journals will now require approval'
                        ELSE '' END);

  RETURN QUERY SELECT nm, p_threshold, was,
    CASE WHEN p_threshold = 0 THEN 'Every journal will require approval.'
         WHEN was IS NULL THEN 'Journals above ' || p_threshold || ' will require approval.'
         WHEN p_threshold > was THEN 'Raised from ' || was ||
              ' — fewer journals will now require approval.'
         ELSE 'Lowered from ' || was || ' — more journals will now require approval.' END;
END $$;

CREATE OR REPLACE FUNCTION approval_thresholds_list()
RETURNS TABLE(entity_id bigint, entity_name text, threshold numeric, ccy char(3),
              journals_above bigint, none_set boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, r.threshold, e.functional_ccy,
         (SELECT count(*) FROM journal j
            JOIN journal_line jl ON jl.journal_id = j.id
           WHERE j.entity_id = e.id
             AND abs(jl.func_amount) > coalesce(r.threshold, 1e12)),
         -- No rule at all means no journal ever requires approval, which is
         -- worth showing rather than leaving as a blank.
         (r.threshold IS NULL)
    FROM entity e
    LEFT JOIN journal_approval_rule r ON r.entity_id = e.id
   WHERE e.entity_class = 'internal' OR e.is_active
   ORDER BY (r.threshold IS NULL) DESC, e.name;
$$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('accounts_submit_for_review','accounts_adjust',
                         'year_end_readiness','year_end_close',
                         'approval_threshold_set','approval_thresholds_list')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

GRANT SELECT ON journal_approval_rule TO authenticated;

SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('accounts_submit_for_review','accounts_adjust',
                     'year_end_readiness','year_end_close',
                     'approval_threshold_set','approval_thresholds_list')
 ORDER BY p.proname;

-- ───────────────────────────────────────────────────────────────────────
-- 078_demo_data_management.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 078: DEMO DATA, FLAGGED AND MANAGEABLE
--
-- The sample entities stay, so the system can be shown and staff can practise.
-- But they sit in the same tables as real client records, and that is the part
-- that needs handling rather than accepting.
--
-- ── WHY FLAGGING IS THE FIRST THING ─────────────────────────────────
--
-- Meridian Holdings Ltd, Harrington Family Trust and the rest read exactly
-- like real clients: plausible names, real-looking registration numbers,
-- Isle of Man and Malta jurisdictions. That is what makes them useful for a
-- demonstration and dangerous in a live register.
--
-- The realistic failure is not someone confusing them in the abstract. It is
-- someone filing a real return against a demo entity, or recording real time
-- against one, or telling a client a figure that came from sample data. In a
-- fiduciary business that is a client-facing error, not a tidiness problem.
--
-- So every demo record carries a flag, the interface shows it, and the flag is
-- what the add and remove functions work from — nothing is identified by
-- guessing at names.
--
-- Run AFTER 077. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- THE FLAG
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE entity ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ix_entity_is_demo ON entity(is_demo) WHERE is_demo;

-- Mark the existing set.
--
-- A first version matched on company_code prefixes AC-2024 and AC-2025 and
-- caught 3 of 18, leaving Meridian Holdings and the rest reading as real
-- records. The seeded clients actually span AC-2016 to AC-2026, so the pattern
-- was simply wrong — and a partial flag is worse than none, because the
-- unflagged ones then look verified.
--
-- The correct criterion is not the reference at all: NO REAL CLIENT RECORDS
-- HAVE BEEN MIGRATED YET, so every client entity currently in the system is
-- sample data. Flag them all, and use demo_flag_set to unflag any that turn
-- out to be real as migration proceeds.
--
-- Guarded so it only runs while that is still true. Once real clients exist,
-- re-running this file must not sweep them up.
DO $backfill$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM entity
                  WHERE entity_class = 'client' AND NOT is_demo
                    AND created_at > (SELECT max(created_at) FROM entity WHERE is_demo)) THEN
    UPDATE entity SET is_demo = true
     WHERE entity_class = 'client' AND NOT is_demo;
  END IF;
END $backfill$;

-- Unconditional for the seeded set specifically, which is safe in any case.
UPDATE entity SET is_demo = true
 WHERE entity_class = 'client' AND NOT is_demo
   AND company_code ~ '^AC-(201[6-9]|202[0-6])-';

-- Anything created by the demo functions below is flagged at creation, so this
-- backfill is only ever needed once.

-- ─────────────────────────────────────────────────────────────────────
-- WHAT IS DEMO AND WHAT IS REAL
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION demo_data_summary()
RETURNS TABLE(category text, demo_count bigint, real_count bigint, note text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  SELECT 'Client entities'::text,
         count(*) FILTER (WHERE e.is_demo),
         count(*) FILTER (WHERE NOT e.is_demo),
         CASE WHEN count(*) FILTER (WHERE NOT e.is_demo) = 0
              THEN 'no real client records yet — everything here is sample data'
              ELSE 'demo and real records sit in the same register, so the demo flag is what distinguishes them' END
    FROM entity e WHERE e.entity_class = 'client';

  RETURN QUERY
  SELECT 'Time recorded against demo entities'::text,
         count(*), 0::bigint,
         CASE WHEN count(*) > 0
              THEN 'time recorded against a demo entity will never be billed — check none of it is real work'
              ELSE 'none' END
    FROM timesheet_entry t
   WHERE t.entity_label IN (SELECT e.name FROM entity e WHERE e.is_demo);

  RETURN QUERY
  SELECT 'Invoices on demo entities'::text,
         count(*), 0::bigint,
         CASE WHEN count(*) > 0 THEN 'these are not real receivables' ELSE 'none' END
    FROM invoice i
   WHERE i.entity_id IN (SELECT e.id FROM entity e WHERE e.is_demo);

  RETURN QUERY
  SELECT 'Statutory filings on demo entities'::text,
         count(*), 0::bigint,
         CASE WHEN count(*) > 0
              THEN 'a filing recorded against a demo entity is the error worth catching — check none was meant for a real client'
              ELSE 'none' END
    FROM statutory_filing f
   WHERE f.entity_id IN (SELECT e.id FROM entity e WHERE e.is_demo);
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- ADDING DEMO ENTITIES
-- ─────────────────────────────────────────────────────────────────────
-- Goes through ea_entity_create, so a demo entity is built the same way a real
-- one is — including the duplicate check and the jurisdiction validation. A
-- demo record created by a different route would not exercise the same paths
-- and would be a poor rehearsal.
--
-- The name is prefixed, deliberately. A demo entity that reads exactly like a
-- real one is the problem this file exists to solve, so the flag is backed up
-- by something visible in any list, report or export that has not been taught
-- about the flag.
CREATE OR REPLACE FUNCTION demo_entity_add(
  p_name text, p_jurisdiction text DEFAULT 'IOM',
  p_entity_type text DEFAULT 'COMPANY', p_risk_rating text DEFAULT 'Medium',
  p_administrator text DEFAULT NULL)
RETURNS entity LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity; nm text;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN
    RAISE EXCEPTION 'Give the demo entity a name';
  END IF;

  nm := CASE WHEN trim(p_name) ILIKE '[DEMO]%' THEN trim(p_name)
             ELSE '[DEMO] ' || trim(p_name) END;

  r := ea_entity_create(
        p_name => nm, p_entity_class => 'client', p_entity_type => p_entity_type,
        p_jurisdiction => p_jurisdiction, p_risk_rating => p_risk_rating,
        p_administrator => p_administrator,
        p_business_activity => 'Sample data — not a real client');

  UPDATE entity SET is_demo = true WHERE id = r.id RETURNING * INTO r;
  PERFORM ea_audit(r.id, 'entity', r.id, 'demo entity created', nm);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- REMOVING DEMO ENTITIES
-- ─────────────────────────────────────────────────────────────────────
-- Refuses to touch anything not flagged as demo. That is the whole safety
-- property: a function that deletes client entities is only safe if it cannot
-- reach a real one, and the flag is checked rather than the name.
CREATE OR REPLACE FUNCTION demo_entity_remove(p_entity bigint)
RETURNS TABLE(removed text, records_deleted bigint, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE e entity; n bigint := 0; c bigint;
BEGIN
  SELECT * INTO e FROM entity WHERE id = p_entity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;

  IF NOT e.is_demo THEN
    RAISE EXCEPTION '% is not flagged as demo data, so it will not be removed by this route. If it really is sample data, flag it first; if it is a real client, close it rather than delete it — the records must survive the relationship.',
      e.name;
  END IF;

  -- Registers first, then the profile, then the entity.
  --
  -- The table list is DERIVED rather than written out. A hand-written list is
  -- how this goes wrong: my first version named entity_bank_account and
  -- entity_safe_custody, neither of which exists (they are entity_bank,
  -- entity_safe_item and entity_safe_movement), and it failed at runtime. A
  -- register added later would be missed the same way, leaving orphaned rows
  -- pointing at a deleted entity.
  DECLARE t record;
  BEGIN
    FOR t IN
      SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables tb
          ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
       WHERE c.table_schema = 'public'
         AND c.column_name = 'entity_id'
         AND tb.table_type = 'BASE TABLE'
         AND c.table_name NOT IN ('entity_profile','journal','journal_line',
                                  'onboarding_case','fs_accounts_set',
                                  'accounting_period')
       ORDER BY c.table_name
    LOOP
      EXECUTE format('DELETE FROM %I WHERE entity_id = $1', t.table_name) USING p_entity;
      GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
    END LOOP;
  END;

  -- Onboarding cases are unlinked rather than deleted: the case is a record of
  -- work done, and it survives the entity it produced.
  UPDATE onboarding_case SET entity_id = NULL WHERE entity_id = p_entity;
  DELETE FROM entity_profile WHERE entity_id = p_entity;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  PERFORM ea_audit(NULL, 'entity', p_entity, 'DEMO ENTITY REMOVED',
                   e.name || ' (' || e.company_code || ') and ' || n || ' related record(s)');

  DELETE FROM entity WHERE id = p_entity;

  RETURN QUERY SELECT e.name, n,
    'Removed along with ' || n || ' related record(s). Journals are left alone: deleting a posted journal would unbalance the ledger, so demo journals stay and are visible as belonging to a removed entity.';
END $$;

-- Removing all of them at once, for clearing a demonstration down. Reports
-- what it did rather than doing it silently.
CREATE OR REPLACE FUNCTION demo_data_clear(p_confirm text)
RETURNS TABLE(entities_removed bigint, records_removed bigint, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; ents bigint := 0; recs bigint := 0; r record;
BEGIN
  -- A typed confirmation rather than a boolean. This deletes a register, and a
  -- misplaced true is easier than a misplaced word.
  IF coalesce(p_confirm,'') <> 'REMOVE DEMO DATA' THEN
    RAISE EXCEPTION 'To clear all demo data, pass the confirmation exactly: REMOVE DEMO DATA. % demo entity(ies) would be removed.',
      (SELECT count(*) FROM entity WHERE is_demo);
  END IF;

  FOR e IN SELECT id FROM entity WHERE is_demo LOOP
    FOR r IN SELECT * FROM demo_entity_remove(e.id) LOOP
      ents := ents + 1; recs := recs + r.records_deleted;
    END LOOP;
  END LOOP;

  PERFORM ea_audit(NULL, 'entity', NULL, 'ALL DEMO DATA CLEARED',
                   ents || ' entity(ies) and ' || recs || ' related record(s)');
  RETURN QUERY SELECT ents, recs,
    CASE WHEN ents = 0 THEN 'There was no demo data to remove.'
         ELSE ents || ' demo entity(ies) removed. Real client records were not touched: the flag is what this works from, not the names.' END;
END $$;

-- Flagging or unflagging an existing entity, for the seeded records the
-- backfill above may have missed, or one created as demo that turns out to be
-- real.
CREATE OR REPLACE FUNCTION demo_flag_set(p_entity bigint, p_is_demo boolean)
RETURNS entity LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity;
BEGIN
  SELECT * INTO r FROM entity WHERE id = p_entity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;

  -- Flagging a real entity as demo is the dangerous direction, because it
  -- makes it deletable. Refused where there is any sign it has been worked on.
  IF p_is_demo AND NOT r.is_demo THEN
    IF EXISTS (SELECT 1 FROM timesheet_entry t WHERE t.entity_label = r.name)
       OR EXISTS (SELECT 1 FROM invoice i WHERE i.entity_id = p_entity)
       OR EXISTS (SELECT 1 FROM journal j WHERE j.entity_id = p_entity
                                            AND j.status = 'posted') THEN
      RAISE EXCEPTION '% has time, invoices or posted journals against it, so it will not be flagged as demo — flagging it would make it deletable. If it really is sample data, remove the work recorded against it first.',
        r.name;
    END IF;
  END IF;

  UPDATE entity SET is_demo = p_is_demo WHERE id = p_entity RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity', p_entity,
                   CASE WHEN p_is_demo THEN 'flagged as demo data'
                        ELSE 'demo flag removed — now treated as a real record' END,
                   r.name);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- MAKE THE FLAG VISIBLE IN THE ENTITY LIST
-- ─────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS ea_entities_list();
CREATE OR REPLACE FUNCTION ea_entities_list()
RETURNS TABLE(id bigint, ref text, name text, entity_type text, jurisdiction text,
              status text, risk_rating text, incorporation_date date,
              entity_class text, is_demo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.company_code, e.name,
         COALESCE(p.entity_type,'Company'), COALESCE(p.jurisdiction,'—'),
         COALESCE(p.admin_status,'Active'), COALESCE(p.risk_rating,'—'),
         p.incorporation_date, e.entity_class, e.is_demo
    FROM entity e JOIN entity_profile p ON p.entity_id = e.id
   ORDER BY e.is_demo, e.name;
$$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('demo_data_summary','demo_entity_add','demo_entity_remove',
                         'demo_data_clear','demo_flag_set','ea_entities_list')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT category, demo_count, real_count FROM demo_data_summary();

-- ───────────────────────────────────────────────────────────────────────
-- 079_payroll_rates_and_allocations.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 079: PAYROLL RATES AND GROUP ALLOCATIONS
--
-- The rates were hardcoded in affinity_budget_model.js with a warning that
-- they were placeholders. They are not placeholders because nobody got round
-- to them — they genuinely vary, by jurisdiction and by year, and are set by
-- someone who knows rather than derived.
--
-- ── WHY EFFECTIVE-DATED RATHER THAN EDITABLE ────────────────────────
--
-- The obvious design is one row per jurisdiction that gets updated. That
-- silently rewrites history: a budget approved on last year's rates would
-- recalculate on this year's, and nobody would know which rates produced the
-- figures anyone signed off.
--
-- So a rate has an effective FROM date and is never edited in place. A new
-- rate supersedes the old one from a date, both are kept, and a calculation
-- for any period uses the rate that was in force. That also means a budget can
-- be re-run months later and produce the same numbers.
--
-- ── LOCKING AND REOPENING ───────────────────────────────────────────
--
-- Once a year's rates are agreed they are locked, so a budget cannot shift
-- under someone. Reopening is deliberate, needs a reason, and is audited —
-- because rates do change mid-year and pretending otherwise would push the
-- work into spreadsheets.
--
-- Run AFTER 078. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- PAYROLL RATES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_rate (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_code     text NOT NULL REFERENCES location(code),
  effective_from    date NOT NULL,
  -- Employer social security / national insurance
  social_pct        numeric(7,4),
  social_threshold  numeric(14,2),      -- earnings below which nothing is due
  social_cap        numeric(14,2),      -- earnings above which nothing more is due; null = uncapped
  -- Employer pension
  pension_pct       numeric(7,4),
  pension_cap       numeric(14,2),
  -- Anything else charged per head rather than as a percentage
  per_head_annual   numeric(14,2),
  per_head_note     text,
  ccy               char(3),
  source            text,               -- where the figure came from
  note              text,
  status            text NOT NULL DEFAULT 'draft',   -- draft | agreed | locked
  entered_by        text NOT NULL DEFAULT current_app_user(),
  entered_at        timestamptz NOT NULL DEFAULT now(),
  agreed_by         text,
  agreed_at         timestamptz,
  CONSTRAINT payroll_rate_status CHECK (status IN ('draft','agreed','locked')),
  UNIQUE (location_code, effective_from)
);
CREATE INDEX IF NOT EXISTS ix_payroll_rate_lookup
  ON payroll_rate(location_code, effective_from DESC);

-- ─────────────────────────────────────────────────────────────────────
-- GROUP ALLOCATIONS
-- ─────────────────────────────────────────────────────────────────────
-- What share of a central cost each entity bears. Effective-dated for the same
-- reason, and constrained to sum to 100% per set, because an allocation that
-- does not add up quietly loses or duplicates cost.
CREATE TABLE IF NOT EXISTS allocation_set (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL,
  basis          text,                  -- headcount, revenue, fee income, agreed
  effective_from date NOT NULL,
  status         text NOT NULL DEFAULT 'draft',
  note           text,
  entered_by     text NOT NULL DEFAULT current_app_user(),
  entered_at     timestamptz NOT NULL DEFAULT now(),
  agreed_by      text,
  agreed_at      timestamptz,
  CONSTRAINT allocation_set_status CHECK (status IN ('draft','agreed','locked')),
  UNIQUE (name, effective_from)
);

CREATE TABLE IF NOT EXISTS allocation_line (
  set_id     bigint NOT NULL REFERENCES allocation_set(id) ON DELETE CASCADE,
  entity_id  bigint NOT NULL REFERENCES entity(id),
  pct        numeric(7,4) NOT NULL,
  note       text,
  PRIMARY KEY (set_id, entity_id),
  CONSTRAINT allocation_line_pct CHECK (pct >= 0 AND pct <= 100)
);

-- ─────────────────────────────────────────────────────────────────────
-- ENTERING RATES
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION payroll_rate_set(
  p_location text, p_effective_from date,
  p_social_pct numeric DEFAULT NULL, p_social_threshold numeric DEFAULT NULL,
  p_social_cap numeric DEFAULT NULL, p_pension_pct numeric DEFAULT NULL,
  p_pension_cap numeric DEFAULT NULL, p_per_head_annual numeric DEFAULT NULL,
  p_per_head_note text DEFAULT NULL, p_ccy char(3) DEFAULT NULL,
  p_source text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS payroll_rate LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payroll_rate; existing payroll_rate;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM location WHERE code = p_location) THEN
    RAISE EXCEPTION 'Unknown location "%". Valid: %', p_location,
      (SELECT string_agg(l.code, ', ' ORDER BY l.code) FROM location l);
  END IF;

  -- Percentages are entered as percentages, not fractions. 12.8 not 0.128.
  --
  -- The hardcoded values in the old budget model were FRACTIONS (0.128), so
  -- anyone copying them across would enter a rate a hundred times too small
  -- and every payroll figure would be wrong by that factor — quietly, because
  -- the result still looks like money.
  --
  -- A range check of 0 to 100 does not catch it: 0.128 is inside the range. A
  -- first version of this check let it through. So a value strictly between
  -- zero and one is refused: no employer social security or pension rate in
  -- these six jurisdictions is under 1%, and a fraction is far more likely
  -- than a real sub-1% rate.
  IF p_social_pct IS NOT NULL THEN
    IF p_social_pct < 0 OR p_social_pct > 100 THEN
      RAISE EXCEPTION 'Social security must be between 0 and 100 percent';
    END IF;
    IF p_social_pct > 0 AND p_social_pct < 1 THEN
      RAISE EXCEPTION 'A social security rate of % looks like a fraction rather than a percentage. Enter 12.8 for 12.8%%, not 0.128. If the rate really is nil, enter 0.',
        p_social_pct;
    END IF;
  END IF;
  IF p_pension_pct IS NOT NULL THEN
    IF p_pension_pct < 0 OR p_pension_pct > 100 THEN
      RAISE EXCEPTION 'Pension must be between 0 and 100 percent';
    END IF;
    IF p_pension_pct > 0 AND p_pension_pct < 1 THEN
      RAISE EXCEPTION 'A pension rate of % looks like a fraction rather than a percentage. Enter 5 for 5%%, not 0.05. If the rate really is nil, enter 0.',
        p_pension_pct;
    END IF;
  END IF;
  IF p_social_cap IS NOT NULL AND p_social_threshold IS NOT NULL
     AND p_social_cap < p_social_threshold THEN
    RAISE EXCEPTION 'The cap (%) is below the threshold (%) — nothing would ever be due',
      p_social_cap, p_social_threshold;
  END IF;

  SELECT * INTO existing FROM payroll_rate
   WHERE location_code = p_location AND effective_from = p_effective_from;

  -- A locked rate is not edited. Superseding it from a later date is the
  -- route, so what was used for a past period stays what was used.
  IF existing.id IS NOT NULL AND existing.status = 'locked' THEN
    RAISE EXCEPTION 'The rates for % from % are locked. Enter a new rate effective from a later date rather than changing this one — a budget approved on these figures must still produce them.',
      p_location, p_effective_from;
  END IF;

  INSERT INTO payroll_rate(location_code, effective_from, social_pct, social_threshold,
                           social_cap, pension_pct, pension_cap, per_head_annual,
                           per_head_note, ccy, source, note)
  VALUES (p_location, p_effective_from, p_social_pct, p_social_threshold,
          p_social_cap, p_pension_pct, p_pension_cap, p_per_head_annual,
          p_per_head_note, p_ccy, p_source, p_note)
  ON CONFLICT (location_code, effective_from) DO UPDATE SET
    social_pct = EXCLUDED.social_pct, social_threshold = EXCLUDED.social_threshold,
    social_cap = EXCLUDED.social_cap, pension_pct = EXCLUDED.pension_pct,
    pension_cap = EXCLUDED.pension_cap, per_head_annual = EXCLUDED.per_head_annual,
    per_head_note = EXCLUDED.per_head_note, ccy = EXCLUDED.ccy,
    source = EXCLUDED.source, note = EXCLUDED.note,
    status = 'draft', entered_by = current_app_user(), entered_at = now(),
    agreed_by = NULL, agreed_at = NULL
  RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'payroll_rate', r.id,
                   CASE WHEN existing.id IS NULL THEN 'payroll rates entered'
                        ELSE 'payroll rates amended' END,
                   p_location || ' from ' || p_effective_from ||
                   ': social ' || coalesce(p_social_pct::text,'—') || '%' ||
                   ', pension ' || coalesce(p_pension_pct::text,'—') || '%');
  RETURN r;
END $$;

-- Agreeing, then locking. Two steps, because agreeing is a judgement and
-- locking is a decision to stop it moving.
CREATE OR REPLACE FUNCTION payroll_rate_agree(p_id bigint)
RETURNS payroll_rate LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payroll_rate;
BEGIN
  SELECT * INTO r FROM payroll_rate WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll rate % not found', p_id; END IF;
  IF r.status = 'locked' THEN RAISE EXCEPTION 'Those rates are already locked'; END IF;
  IF r.social_pct IS NULL AND r.pension_pct IS NULL AND r.per_head_annual IS NULL THEN
    RAISE EXCEPTION 'There are no figures to agree — enter at least one rate first';
  END IF;

  UPDATE payroll_rate SET status = 'agreed', agreed_by = current_app_user(),
         agreed_at = now()
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'payroll_rate', p_id, 'payroll rates agreed',
                   r.location_code || ' from ' || r.effective_from);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION payroll_rate_lock(p_id bigint)
RETURNS payroll_rate LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payroll_rate;
BEGIN
  SELECT * INTO r FROM payroll_rate WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll rate % not found', p_id; END IF;
  IF r.status <> 'agreed' THEN
    RAISE EXCEPTION 'Rates must be agreed before they are locked — this set is %', r.status;
  END IF;

  UPDATE payroll_rate SET status = 'locked' WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'payroll_rate', p_id, 'PAYROLL RATES LOCKED',
                   r.location_code || ' from ' || r.effective_from ||
                   ' — budgets will not shift under anyone');
  RETURN r;
END $$;

-- Reopening. Needs a reason, and the reason is kept — rates do change
-- mid-year, and refusing outright would push the work into spreadsheets, which
-- is worse than a reopening that is recorded.
CREATE OR REPLACE FUNCTION payroll_rate_reopen(p_id bigint, p_reason text)
RETURNS payroll_rate LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r payroll_rate;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for reopening locked rates — anything already budgeted on them may change';
  END IF;
  SELECT * INTO r FROM payroll_rate WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll rate % not found', p_id; END IF;
  IF r.status <> 'locked' THEN
    RAISE EXCEPTION 'Those rates are % and do not need reopening', r.status;
  END IF;

  UPDATE payroll_rate
     SET status = 'draft', agreed_by = NULL, agreed_at = NULL,
         note = coalesce(note || ' | ', '') || 'Reopened ' ||
                to_char(now(),'DD Mon YYYY') || ' by ' || current_app_user() ||
                ': ' || trim(p_reason)
   WHERE id = p_id RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'payroll_rate', p_id, 'PAYROLL RATES REOPENED',
                   r.location_code || ' from ' || r.effective_from || ' — ' || trim(p_reason));
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- READING THE RATE THAT WAS IN FORCE
-- ─────────────────────────────────────────────────────────────────────
-- The point of the whole design: a calculation asks for the rate at a date and
-- gets the one that applied, not the newest.
CREATE OR REPLACE FUNCTION payroll_rate_at(p_location text, p_at date)
RETURNS payroll_rate LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM payroll_rate
   WHERE location_code = p_location AND effective_from <= p_at
   ORDER BY effective_from DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION payroll_rates_list(p_location text DEFAULT NULL)
RETURNS TABLE(id bigint, location_code text, location_name text, effective_from date,
              social_pct numeric, social_threshold numeric, social_cap numeric,
              pension_pct numeric, per_head_annual numeric, ccy char(3),
              status text, source text, note text,
              entered_by text, agreed_by text, superseded_from date, in_force boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id, r.location_code, l.name, r.effective_from,
         r.social_pct, r.social_threshold, r.social_cap,
         r.pension_pct, r.per_head_annual, r.ccy,
         r.status, r.source, r.note, r.entered_by, r.agreed_by,
         -- When a later rate takes over, so history reads as a sequence rather
         -- than a pile of rows.
         (SELECT min(r2.effective_from) FROM payroll_rate r2
           WHERE r2.location_code = r.location_code
             AND r2.effective_from > r.effective_from),
         (r.effective_from <= current_date
          AND NOT EXISTS (SELECT 1 FROM payroll_rate r3
                           WHERE r3.location_code = r.location_code
                             AND r3.effective_from > r.effective_from
                             AND r3.effective_from <= current_date))
    FROM payroll_rate r
    LEFT JOIN location l ON l.code = r.location_code
   WHERE p_location IS NULL OR r.location_code = p_location
   ORDER BY l.name, r.effective_from DESC;
$$;

-- Which jurisdictions have no rates at all. A budget for one of those is
-- running on nothing, and a blank is easy to miss.
CREATE OR REPLACE FUNCTION payroll_rate_gaps()
RETURNS TABLE(location_code text, location_name text, has_rates boolean,
              latest_effective date, latest_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.code, l.name,
         EXISTS (SELECT 1 FROM payroll_rate r WHERE r.location_code = l.code),
         (SELECT max(r.effective_from) FROM payroll_rate r WHERE r.location_code = l.code),
         (SELECT r.status FROM payroll_rate r WHERE r.location_code = l.code
           ORDER BY r.effective_from DESC LIMIT 1)
    FROM location l
   ORDER BY EXISTS (SELECT 1 FROM payroll_rate r WHERE r.location_code = l.code), l.name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- ALLOCATIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION allocation_set_create(
  p_name text, p_effective_from date, p_basis text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS allocation_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r allocation_set;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN
    RAISE EXCEPTION 'Give the allocation a name — "Central overhead" or similar';
  END IF;
  INSERT INTO allocation_set(name, basis, effective_from, note)
  VALUES (trim(p_name), p_basis, p_effective_from, p_note)
  ON CONFLICT (name, effective_from) DO UPDATE SET
    basis = EXCLUDED.basis, note = EXCLUDED.note, status = 'draft',
    entered_by = current_app_user(), entered_at = now(),
    agreed_by = NULL, agreed_at = NULL
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION allocation_line_set(
  p_set bigint, p_entity bigint, p_pct numeric, p_note text DEFAULT NULL)
RETURNS TABLE(entity_name text, pct numeric, set_total numeric, balanced boolean, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE st text; tot numeric;
BEGIN
  SELECT s.status INTO st FROM allocation_set s WHERE s.id = p_set;
  IF st IS NULL THEN RAISE EXCEPTION 'Allocation set % not found', p_set; END IF;
  IF st = 'locked' THEN
    RAISE EXCEPTION 'That allocation is locked. Create a new one effective from a later date rather than changing this one.';
  END IF;
  IF p_pct < 0 OR p_pct > 100 THEN
    RAISE EXCEPTION 'A share must be between 0 and 100 percent';
  END IF;

  INSERT INTO allocation_line(set_id, entity_id, pct, note)
  VALUES (p_set, p_entity, p_pct, p_note)
  ON CONFLICT (set_id, entity_id) DO UPDATE SET pct = EXCLUDED.pct, note = EXCLUDED.note;

  SELECT round(coalesce(sum(al.pct),0),4) INTO tot
    FROM allocation_line al WHERE al.set_id = p_set;

  -- Reported rather than enforced on each line: an allocation is built up one
  -- entity at a time and would be unbuildable if every intermediate state had
  -- to total 100. Agreeing it is where the total is enforced.
  RETURN QUERY SELECT (SELECT e.name FROM entity e WHERE e.id = p_entity),
                      p_pct, tot, (tot = 100),
                      CASE WHEN tot = 100 THEN 'The allocation totals 100%.'
                           WHEN tot < 100 THEN round(100 - tot,4) || '% is still unallocated — that share of the cost would be borne by nobody.'
                           ELSE round(tot - 100,4) || '% over — that share would be charged twice.' END;
END $$;

CREATE OR REPLACE FUNCTION allocation_set_agree(p_set bigint)
RETURNS allocation_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r allocation_set; tot numeric; n int;
BEGIN
  SELECT * INTO r FROM allocation_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allocation set % not found', p_set; END IF;

  SELECT count(*), round(coalesce(sum(al.pct),0),4) INTO n, tot
    FROM allocation_line al WHERE al.set_id = p_set;
  IF n = 0 THEN RAISE EXCEPTION 'There are no entities in that allocation'; END IF;

  -- Enforced here. An allocation that does not total 100 loses or duplicates
  -- cost, and it is not obvious in the resulting figures which happened.
  IF tot <> 100 THEN
    RAISE EXCEPTION 'The allocation totals %%%, not 100%%. %',
      tot,
      CASE WHEN tot < 100 THEN round(100-tot,4) || '% of the cost would be borne by nobody.'
           ELSE round(tot-100,4) || '% would be charged twice.' END;
  END IF;

  UPDATE allocation_set SET status = 'agreed', agreed_by = current_app_user(),
         agreed_at = now()
   WHERE id = p_set RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'allocation_set', p_set, 'allocation agreed',
                   r.name || ' from ' || r.effective_from || ' across ' || n || ' entities');
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION allocation_set_lock(p_set bigint)
RETURNS allocation_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r allocation_set;
BEGIN
  SELECT * INTO r FROM allocation_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allocation set % not found', p_set; END IF;
  IF r.status <> 'agreed' THEN
    RAISE EXCEPTION 'An allocation must be agreed before it is locked — this one is %', r.status;
  END IF;
  UPDATE allocation_set SET status = 'locked' WHERE id = p_set RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'allocation_set', p_set, 'ALLOCATION LOCKED', r.name);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION allocation_set_reopen(p_set bigint, p_reason text)
RETURNS allocation_set LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r allocation_set;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for reopening a locked allocation — anything already budgeted on it may change';
  END IF;
  SELECT * INTO r FROM allocation_set WHERE id = p_set;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allocation set % not found', p_set; END IF;
  IF r.status <> 'locked' THEN
    RAISE EXCEPTION 'That allocation is % and does not need reopening', r.status;
  END IF;

  UPDATE allocation_set
     SET status = 'draft', agreed_by = NULL, agreed_at = NULL,
         note = coalesce(note || ' | ', '') || 'Reopened ' ||
                to_char(now(),'DD Mon YYYY') || ' by ' || current_app_user() ||
                ': ' || trim(p_reason)
   WHERE id = p_set RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'allocation_set', p_set, 'ALLOCATION REOPENED',
                   r.name || ' — ' || trim(p_reason));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION allocations_list()
RETURNS TABLE(id bigint, name text, basis text, effective_from date, status text,
              entities bigint, total_pct numeric, balanced boolean,
              entered_by text, agreed_by text, note text, in_force boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.name, s.basis, s.effective_from, s.status,
         (SELECT count(*) FROM allocation_line al WHERE al.set_id = s.id),
         (SELECT round(coalesce(sum(al.pct),0),4) FROM allocation_line al WHERE al.set_id = s.id),
         ((SELECT round(coalesce(sum(al.pct),0),4) FROM allocation_line al WHERE al.set_id = s.id) = 100),
         s.entered_by, s.agreed_by, s.note,
         (s.effective_from <= current_date
          AND NOT EXISTS (SELECT 1 FROM allocation_set s2
                           WHERE s2.name = s.name AND s2.effective_from > s.effective_from
                             AND s2.effective_from <= current_date))
    FROM allocation_set s
   ORDER BY s.name, s.effective_from DESC;
$$;

CREATE OR REPLACE FUNCTION allocation_lines(p_set bigint)
RETURNS TABLE(entity_id bigint, entity_name text, company_code text, pct numeric, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT al.entity_id, e.name, e.company_code, al.pct, al.note
    FROM allocation_line al LEFT JOIN entity e ON e.id = al.entity_id
   WHERE al.set_id = p_set
   ORDER BY al.pct DESC, e.name;
$$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'payroll_rate%' OR p.proname LIKE 'allocation%'
            OR p.proname = 'allocations_list')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON payroll_rate, allocation_set, allocation_line FROM PUBLIC, anon;
GRANT SELECT ON payroll_rate, allocation_set, allocation_line TO authenticated;

SELECT location_code, location_name, has_rates, latest_status
  FROM payroll_rate_gaps();

-- ───────────────────────────────────────────────────────────────────────
-- 080_authoring_formats_and_checklists.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 080: AUTHORING FORMATS AND CHECKLISTS FROM WITHIN CORE
--
-- Points 7, 8 and 9: the disclosure checklists, the required document lists,
-- and the presentation formats for the four frameworks that have none are all
-- to be entered by accountants inside Core.
--
-- That is the right answer, and it is the same answer for all three: I should
-- not author prescribed content. A caption set I invented would look like the
-- Companies Act format and be subtly wrong; a disclosure list I reconstructed
-- would look complete and have gaps. Both would be filed.
--
-- So this provides the machinery to enter them, with the checks that make
-- entered content trustworthy:
--
--   * a framework must have a presentation format before accounts can be
--     opened on it (already enforced in db/074)
--   * a checklist must be verified against a NAMED EDITION, and amending it
--     invalidates the verification
--   * a caption must be uniquely coded within its framework, or the account
--     mapping points at nothing
--   * a format must have at least one caption per statement the framework
--     requires, or a statement renders empty
--
-- Run AFTER 079. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- FRAMEWORKS
-- ─────────────────────────────────────────────────────────────────────
-- A new presentation framework, for the four with none. Creating the
-- fs_framework row is what makes captions attachable.
CREATE OR REPLACE FUNCTION fs_framework_add(p_code text, p_name text)
RETURNS fs_framework LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r fs_framework;
BEGIN
  IF coalesce(trim(p_code),'') = '' OR coalesce(trim(p_name),'') = '' THEN
    RAISE EXCEPTION 'A framework needs both a code and a name';
  END IF;
  INSERT INTO fs_framework(code, name) VALUES (upper(trim(p_code)), trim(p_name))
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
  RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'fs_framework', NULL, 'presentation framework recorded',
                   upper(trim(p_code)) || ' — ' || trim(p_name));
  RETURN r;
END $$;

-- Link a regulatory framework to a presentation format. Until this is set, a
-- set cannot be opened on that framework.
CREATE OR REPLACE FUNCTION framework_format_link(p_reporting_code text, p_fs_code text)
RETURNS reporting_framework LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r reporting_framework;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fs_framework WHERE code = p_fs_code) THEN
    RAISE EXCEPTION 'There is no presentation framework "%". Create it first, then add its captions.',
      p_fs_code;
  END IF;
  UPDATE reporting_framework SET fs_framework_code = p_fs_code
   WHERE code = p_reporting_code RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reporting framework: %', p_reporting_code; END IF;

  PERFORM ea_audit(NULL, 'reporting_framework', NULL, 'framework linked to a format',
                   p_reporting_code || ' will present using ' || p_fs_code);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- CAPTIONS
-- ─────────────────────────────────────────────────────────────────────
-- One line of a statement. The code is what accounts map to, so it must be
-- stable and unique within the framework — a caption renamed keeps its code
-- and the mapping survives.
CREATE OR REPLACE FUNCTION fs_caption_add(
  p_framework text, p_statement text, p_code text, p_caption text,
  p_sort_order integer, p_is_subtotal boolean DEFAULT false,
  p_note_no integer DEFAULT NULL, p_fund_filter text DEFAULT NULL)
RETURNS fs_caption LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r fs_caption; existing fs_caption;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fs_framework WHERE code = p_framework) THEN
    RAISE EXCEPTION 'There is no presentation framework "%" — create it before adding captions',
      p_framework;
  END IF;
  IF coalesce(trim(p_code),'') = '' THEN
    RAISE EXCEPTION 'A caption needs a short code — it is what accounts map to, and a caption without one cannot be mapped';
  END IF;
  IF coalesce(trim(p_caption),'') = '' THEN
    RAISE EXCEPTION 'Give the caption as it should appear in the accounts';
  END IF;
  -- The statement codes the engine already uses. A new one would silently
  -- produce a statement nothing renders.
  IF p_statement NOT IN ('BS','PL','IC','AL','CF','EQ') THEN
    RAISE EXCEPTION 'Statement must be one of BS (balance sheet), PL (profit and loss), IC (income and capital, for trusts), AL (assets and liabilities), CF (cash flow) or EQ (changes in equity) — "%" would produce a statement nothing renders',
      p_statement;
  END IF;

  SELECT * INTO existing FROM fs_caption
   WHERE framework_code = p_framework AND code = upper(trim(p_code));

  INSERT INTO fs_caption(framework_code, statement, code, caption, sort_order,
                         is_subtotal, note_no, fund_filter)
  VALUES (p_framework, p_statement, upper(trim(p_code)), trim(p_caption),
          p_sort_order, coalesce(p_is_subtotal,false), p_note_no, p_fund_filter)
  ON CONFLICT (framework_code, code) DO UPDATE SET
    statement = EXCLUDED.statement, caption = EXCLUDED.caption,
    sort_order = EXCLUDED.sort_order, is_subtotal = EXCLUDED.is_subtotal,
    note_no = EXCLUDED.note_no, fund_filter = EXCLUDED.fund_filter
  RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'fs_caption', r.id,
                   CASE WHEN existing.id IS NULL THEN 'caption added' ELSE 'caption amended' END,
                   p_framework || ' ' || p_statement || ' ' || upper(trim(p_code)) ||
                   ': ' || trim(p_caption));
  RETURN r;
END $$;

-- Removing a caption. Refused where accounts still map to it, because the
-- mapping would be orphaned and those balances would vanish from the accounts
-- while the statements still balanced — the hardest error to find.
CREATE OR REPLACE FUNCTION fs_caption_remove(p_framework text, p_code text)
RETURNS TABLE(removed text, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE cap fs_caption; n int;
BEGIN
  SELECT * INTO cap FROM fs_caption
   WHERE framework_code = p_framework AND code = upper(trim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'No caption "%" in %', p_code, p_framework; END IF;

  SELECT count(*) INTO n FROM account_fs_map m
   WHERE m.framework_code = p_framework AND m.caption_code = cap.code;
  IF n > 0 THEN
    RAISE EXCEPTION '% account(s) map to "%". Remap them first — deleting the caption would leave those balances out of the accounts while the statements still balanced, which is the hardest kind of error to find.',
      n, cap.caption;
  END IF;

  DELETE FROM fs_caption WHERE id = cap.id;
  PERFORM ea_audit(NULL, 'fs_caption', cap.id, 'caption removed',
                   p_framework || ' ' || cap.code || ': ' || cap.caption);
  RETURN QUERY SELECT cap.caption, 'Removed. No accounts were mapped to it.';
END $$;

CREATE OR REPLACE FUNCTION fs_captions_list(p_framework text)
RETURNS TABLE(id bigint, statement text, code text, caption text, sort_order integer,
              is_subtotal boolean, note_no integer, accounts_mapped bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.statement, c.code, c.caption, c.sort_order, c.is_subtotal, c.note_no,
         (SELECT count(*) FROM account_fs_map m
           WHERE m.framework_code = c.framework_code AND m.caption_code = c.code)
    FROM fs_caption c
   WHERE c.framework_code = p_framework
   ORDER BY c.statement, c.sort_order;
$$;

-- Whether a format is usable yet. A framework with captions on only one
-- statement produces a set with an empty balance sheet or no profit and loss,
-- which is worse than refusing to open the set at all.
CREATE OR REPLACE FUNCTION fs_format_readiness(p_fs_framework text)
RETURNS TABLE(gate text, passed boolean, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n int; needs_cf boolean;
BEGIN
  SELECT count(*) INTO n FROM fs_caption WHERE framework_code = p_fs_framework;
  RETURN QUERY SELECT 'Captions defined'::text, (n > 0), n || ' caption(s)';

  SELECT count(*) INTO n FROM fs_caption
   WHERE framework_code = p_fs_framework AND statement IN ('BS','AL');
  RETURN QUERY SELECT 'Balance sheet has captions'::text, (n > 0),
    CASE WHEN n > 0 THEN n || ' line(s)'
         ELSE 'none — a set opened on this framework would have an empty balance sheet' END;

  SELECT count(*) INTO n FROM fs_caption
   WHERE framework_code = p_fs_framework AND statement IN ('PL','IC');
  RETURN QUERY SELECT 'Profit and loss has captions'::text, (n > 0),
    CASE WHEN n > 0 THEN n || ' line(s)'
         ELSE 'none — a set would have no profit and loss' END;

  -- Where any regulatory framework using this format requires a cash flow.
  SELECT EXISTS (SELECT 1 FROM reporting_framework rf
                  WHERE rf.fs_framework_code = p_fs_framework AND rf.requires_cash_flow)
    INTO needs_cf;
  IF needs_cf THEN
    SELECT count(*) INTO n FROM fs_caption
     WHERE framework_code = p_fs_framework AND statement = 'CF';
    RETURN QUERY SELECT 'Cash flow has captions'::text, (n > 0),
      CASE WHEN n > 0 THEN n || ' line(s)'
           ELSE 'none — a framework using this format requires a cash flow statement. The engine generates its sections from the ledger, so captions are only needed if the presentation differs.' END;
  END IF;

  -- Accounts with a balance and no mapping would be missing from the accounts.
  SELECT count(*) INTO n FROM account_mapping_gaps(p_fs_framework, NULL) g
   WHERE g.has_balance;
  RETURN QUERY SELECT 'All accounts with a balance are mapped'::text, (n = 0),
    CASE WHEN n = 0 THEN 'none unmapped'
         ELSE n || ' account(s) carry a balance and map to no caption' END;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- WHAT NEEDS AUTHORING, ACROSS EVERYTHING
-- ─────────────────────────────────────────────────────────────────────
-- One list, so the work can be planned rather than discovered framework by
-- framework.
CREATE OR REPLACE FUNCTION authoring_outstanding()
RETURNS TABLE(framework text, framework_name text, jurisdictions text,
              has_format boolean, captions bigint,
              disclosures bigint, checklist_verified boolean, checklist_edition text,
              documents bigint, ready boolean, next_step text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT rf.code, rf.name,
         (SELECT string_agg(l.name, ', ' ORDER BY l.name)
            FROM framework_jurisdiction fj JOIN location l ON l.code = fj.location_code
           WHERE fj.framework_code = rf.code),
         (rf.fs_framework_code IS NOT NULL
          AND EXISTS (SELECT 1 FROM fs_caption c WHERE c.framework_code = rf.fs_framework_code)),
         (SELECT count(*) FROM fs_caption c WHERE c.framework_code = rf.fs_framework_code),
         (SELECT count(*) FROM disclosure_requirement d WHERE d.framework_code = rf.code),
         (rf.checklist_verified_at IS NOT NULL),
         rf.checklist_edition,
         (SELECT count(*) FROM accounts_required_document ad WHERE ad.framework_code = rf.code),
         -- Ready means a set can be opened AND finalised on it.
         (rf.fs_framework_code IS NOT NULL
          AND EXISTS (SELECT 1 FROM fs_caption c WHERE c.framework_code = rf.fs_framework_code)
          AND rf.checklist_verified_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM accounts_required_document ad WHERE ad.framework_code = rf.code)),
         -- The single next thing to do, in the order that unblocks the rest.
         CASE
           WHEN rf.fs_framework_code IS NULL
             THEN 'Create a presentation format and link it — no set can be opened on this framework yet'
           WHEN NOT EXISTS (SELECT 1 FROM fs_caption c WHERE c.framework_code = rf.fs_framework_code)
             THEN 'Add captions to the ' || rf.fs_framework_code || ' format'
           WHEN (SELECT count(*) FROM disclosure_requirement d WHERE d.framework_code = rf.code) = 0
             THEN 'Enter the disclosure requirements'
           WHEN rf.checklist_verified_at IS NULL
             THEN 'Verify the checklist against a named edition'
           WHEN (SELECT count(*) FROM accounts_required_document ad WHERE ad.framework_code = rf.code) = 0
             THEN 'Record the required documents — directors report, responsibilities statement, approval wording'
           ELSE 'Nothing outstanding'
         END
    FROM reporting_framework rf
   WHERE rf.is_active
   ORDER BY
     (rf.fs_framework_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM fs_caption c WHERE c.framework_code = rf.fs_framework_code)
      AND rf.checklist_verified_at IS NOT NULL),
     rf.name;
$$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('fs_framework_add','framework_format_link','fs_caption_add',
                         'fs_caption_remove','fs_captions_list','fs_format_readiness',
                         'authoring_outstanding')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

SELECT framework, has_format, captions, disclosures, checklist_verified, documents,
       left(next_step, 62) AS next_step
  FROM authoring_outstanding();


-- ─────────────────────────────────────────────────────────────────────
-- THE MAPPING TABLE: WHAT I ALMOST GOT WRONG
-- ─────────────────────────────────────────────────────────────────────
-- account_fs_map_set failed with "no unique or exclusion constraint matching
-- the ON CONFLICT specification", because it targeted (account_id,
-- framework_code) and the primary key is (framework_code, account_id,
-- caption_code).
--
-- My first read of that was a missing constraint: one account able to map to
-- two captions would double-count its balance. I was about to add a unique
-- constraint on (account_id, framework_code).
--
-- THAT WOULD HAVE BROKEN TRUST ACCOUNTING. There is already such a mapping and
-- it is correct: one expense account maps to BOTH "Expenses chargeable to
-- income" and "Expenses chargeable to capital", differentiated by fund_filter.
-- That apportionment is the whole basis of the trust module — the income and
-- capital funds are separate, and a shared expense is split between them.
--
-- So the three-column key is right, and the real risk is narrower: two
-- captions for the same account with the SAME fund filter, or none. Those
-- double-count. Fund-differentiated ones do not.
CREATE OR REPLACE FUNCTION account_fs_map_set(
  p_account bigint, p_fs_framework text, p_caption_code text)
RETURNS account_fs_map LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r account_fs_map; fund text; clash text;
BEGIN
  SELECT c.fund_filter INTO fund FROM fs_caption c
   WHERE c.framework_code = p_fs_framework AND c.code = upper(trim(p_caption_code));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no caption "%" in the % format. Valid captions: %',
      upper(trim(p_caption_code)), p_fs_framework,
      (SELECT string_agg(c.code, ', ' ORDER BY c.sort_order)
         FROM fs_caption c WHERE c.framework_code = p_fs_framework);
  END IF;

  -- An existing mapping for this account with the same fund filter would
  -- double-count the balance. One with a DIFFERENT fund filter is the trust
  -- apportionment and is allowed.
  SELECT c.caption INTO clash
    FROM account_fs_map m
    JOIN fs_caption c ON c.framework_code = m.framework_code AND c.code = m.caption_code
   WHERE m.account_id = p_account AND m.framework_code = p_fs_framework
     AND m.caption_code <> upper(trim(p_caption_code))
     AND coalesce(c.fund_filter,'~') = coalesce(fund,'~')
   LIMIT 1;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'That account is already mapped to "%" with the same fund treatment. Mapping it to a second caption would count its balance twice. Remove the existing mapping first, or use captions with different fund filters if this is a trust apportionment.',
      clash;
  END IF;

  INSERT INTO account_fs_map(account_id, framework_code, caption_code)
  VALUES (p_account, p_fs_framework, upper(trim(p_caption_code)))
  ON CONFLICT (framework_code, account_id, caption_code) DO NOTHING
  RETURNING * INTO r;

  IF r.account_id IS NULL THEN
    SELECT * INTO r FROM account_fs_map
     WHERE account_id = p_account AND framework_code = p_fs_framework
       AND caption_code = upper(trim(p_caption_code));
  END IF;

  PERFORM ea_audit(NULL, 'account_fs_map', p_account, 'account mapped to caption',
                   p_fs_framework || ' → ' || upper(trim(p_caption_code)) ||
                   coalesce(' (fund ' || fund || ')', ''));
  RETURN r;
END $$;

-- Double-counted mappings, if any already exist. Fund-differentiated ones are
-- excluded, because those are correct.
CREATE OR REPLACE FUNCTION account_mapping_duplicates(p_fs_framework text)
RETURNS TABLE(account_id bigint, account_code text, account_name text,
              captions text, fund_filters text, double_counted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT m.account_id, a.code, a.name,
         string_agg(c.caption, ' + ' ORDER BY c.caption),
         string_agg(coalesce(c.fund_filter,'(none)'), ' + ' ORDER BY c.caption),
         -- Double-counted only where two captions share a fund filter. A split
         -- across income and capital is the trust apportionment and correct.
         (count(*) > count(DISTINCT coalesce(c.fund_filter,'~')))
    FROM account_fs_map m
    JOIN fs_caption c ON c.framework_code = m.framework_code AND c.code = m.caption_code
    LEFT JOIN account a ON a.id = m.account_id
   WHERE m.framework_code = p_fs_framework
   GROUP BY m.account_id, a.code, a.name
  HAVING count(*) > 1
   ORDER BY (count(*) > count(DISTINCT coalesce(c.fund_filter,'~'))) DESC, a.code;
$$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('account_fs_map_set','account_mapping_duplicates')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

SELECT account_code, captions, fund_filters, double_counted
  FROM account_mapping_duplicates('TRUST');

-- ───────────────────────────────────────────────────────────────────────
-- 081_obligation_schedules.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 081: OBLIGATION SCHEDULES, ENTERED BY COMPLIANCE
--
-- The obligations were hardcoded in affinity_core_jurisdiction_compliance.jsx
-- as a JUR_INFO constant. Malta and Cayman had schedules; Isle of Man, Cyprus,
-- UK and USA were empty arrays with a note.
--
-- That meant the populated ones could not be edited, corrected or extended
-- without a code change, and the empty ones could not be filled in at all.
-- For a compliance tracker that is the wrong way round: the deadlines change
-- more often than the software.
--
-- So obligations move into the database and Compliance enters them.
--
-- ── WHAT I HAVE AND HAVE NOT PRE-FILLED ─────────────────────────────
--
-- The CATEGORIES are seeded, because they are structural and the same
-- everywhere: licence, AML/CFT, AEOI, substance, BO register, annual returns,
-- accounts, tax, sector, internal.
--
-- The DEADLINES are not, for any jurisdiction. Malta and Cayman's existing
-- entries are migrated as they stand because they were already reviewed, and
-- everything else is left empty. A wrong date in a compliance tracker is worse
-- than a visibly empty one: someone trusts it and misses a filing.
--
-- Run AFTER 080. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS obligation_area (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  detail     text,
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO obligation_area(code, name, detail, sort_order) VALUES
 ('LICENCE',  'Licence / authorisation',
  'Affinity''s own licence conditions, renewals and regulatory returns as a corporate or trust service provider.', 10),
 ('AML',      'AML / CFT',
  'Business risk assessment, ML/TF risk assessment, policies and procedures review, MLRO annual report, staff training.', 20),
 ('AEOI',     'Automatic exchange of information',
  'FATCA and CRS registration and returns, including nil returns where required.', 30),
 ('SUBSTANCE','Economic substance',
  'Notification and return, assessed per in-scope entity.', 40),
 ('BO',       'Beneficial ownership register',
  'Filings on change, plus any periodic confirmation the jurisdiction requires.', 50),
 ('ANNUAL',   'Annual returns',
  'Company annual returns to the registry.', 60),
 ('ACCOUNTS', 'Accounts filing',
  'Where the jurisdiction requires accounts to be filed rather than only prepared.', 70),
 ('TAX',      'Tax',
  'Corporate returns, VAT or GST, payroll filings.', 80),
 ('SECTOR',   'Sector-specific',
  'Funds, insurance, gaming and other regimes, where they apply.', 90),
 ('INTERNAL', 'Internal control',
  'Client money reconciliations, periodic client reviews, CPD, the compliance monitoring programme.', 100)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, detail = EXCLUDED.detail,
                                 sort_order = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────────────────────────────
-- OBLIGATIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jurisdiction_obligation (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_code   text NOT NULL REFERENCES location(code),
  area_code       text NOT NULL REFERENCES obligation_area(code),
  title           text NOT NULL,

  -- What starts the clock. Held separately from the deadline because the same
  -- "30 days" means different dates depending on what it runs from, and that
  -- is the commonest way a compliance date goes wrong.
  trigger_type    text NOT NULL,   -- year_end | anniversary | fixed_date | on_change | period_end | ongoing
  trigger_detail  text,            -- e.g. "31 December", "incorporation date"
  due_days        integer,         -- days after the trigger
  due_months      integer,         -- or months after the trigger
  fixed_month     integer,         -- for fixed_date: 1-12
  fixed_day       integer,         -- for fixed_date: 1-31

  frequency       text,            -- Annual, Quarterly, On change, Ongoing
  applies_to      text,            -- which entities, in plain English
  filing_route    text,            -- portal, form number, agent
  legislation_ref text,            -- so it can be traced
  owner           text,
  note            text,

  -- Compliance confirms each obligation individually. An unconfirmed one is
  -- shown but not counted as a deadline anyone can rely on.
  confirmed_by    text,
  confirmed_at    timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  entered_by      text NOT NULL DEFAULT current_app_user(),
  entered_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT jo_trigger CHECK (trigger_type IN
    ('year_end','anniversary','fixed_date','on_change','period_end','ongoing')),
  CONSTRAINT jo_fixed CHECK (
    trigger_type <> 'fixed_date' OR (fixed_month BETWEEN 1 AND 12 AND fixed_day BETWEEN 1 AND 31))
);
CREATE INDEX IF NOT EXISTS ix_jo_location ON jurisdiction_obligation(location_code, area_code);

-- ─────────────────────────────────────────────────────────────────────
-- ENTERING THEM
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION obligation_add(
  p_location text, p_area text, p_title text, p_trigger_type text,
  p_trigger_detail text DEFAULT NULL, p_due_days integer DEFAULT NULL,
  p_due_months integer DEFAULT NULL, p_fixed_month integer DEFAULT NULL,
  p_fixed_day integer DEFAULT NULL, p_frequency text DEFAULT NULL,
  p_applies_to text DEFAULT NULL, p_filing_route text DEFAULT NULL,
  p_legislation_ref text DEFAULT NULL, p_owner text DEFAULT NULL,
  p_note text DEFAULT NULL)
RETURNS jurisdiction_obligation
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jurisdiction_obligation;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM location WHERE code = p_location) THEN
    RAISE EXCEPTION 'Unknown jurisdiction "%". Valid: %', p_location,
      (SELECT string_agg(l.code, ', ' ORDER BY l.code) FROM location l);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM obligation_area WHERE code = p_area) THEN
    RAISE EXCEPTION 'Unknown area "%". Valid: %', p_area,
      (SELECT string_agg(a.code, ', ' ORDER BY a.sort_order) FROM obligation_area a);
  END IF;
  IF coalesce(trim(p_title),'') = '' THEN
    RAISE EXCEPTION 'Give the obligation a title';
  END IF;

  -- A deadline with no trigger is not a deadline. The commonest way a
  -- compliance date goes wrong is "30 days" recorded without saying 30 days
  -- from what, so the trigger is required and the pairing is checked.
  IF p_trigger_type IN ('year_end','anniversary','period_end')
     AND p_due_days IS NULL AND p_due_months IS NULL THEN
    RAISE EXCEPTION 'A deadline running from % needs to say how long after — give days or months, or the date cannot be calculated for any entity',
      replace(p_trigger_type, '_', ' ');
  END IF;
  IF p_trigger_type = 'fixed_date' AND (p_fixed_month IS NULL OR p_fixed_day IS NULL) THEN
    RAISE EXCEPTION 'A fixed calendar deadline needs the month and day';
  END IF;
  IF p_due_days IS NOT NULL AND p_due_months IS NOT NULL THEN
    RAISE EXCEPTION 'Give either days or months after the trigger, not both — they would conflict';
  END IF;

  INSERT INTO jurisdiction_obligation(
    location_code, area_code, title, trigger_type, trigger_detail,
    due_days, due_months, fixed_month, fixed_day, frequency, applies_to,
    filing_route, legislation_ref, owner, note)
  VALUES (p_location, p_area, trim(p_title), p_trigger_type, p_trigger_detail,
          p_due_days, p_due_months, p_fixed_month, p_fixed_day, p_frequency,
          p_applies_to, p_filing_route, p_legislation_ref, p_owner, p_note)
  RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'jurisdiction_obligation', r.id, 'obligation recorded',
                   p_location || ' [' || p_area || '] ' || trim(p_title));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION obligation_update(
  p_id bigint, p_title text DEFAULT NULL, p_trigger_detail text DEFAULT NULL,
  p_due_days integer DEFAULT NULL, p_due_months integer DEFAULT NULL,
  p_frequency text DEFAULT NULL, p_applies_to text DEFAULT NULL,
  p_filing_route text DEFAULT NULL, p_legislation_ref text DEFAULT NULL,
  p_owner text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jurisdiction_obligation
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jurisdiction_obligation; was_confirmed boolean;
BEGIN
  SELECT (confirmed_at IS NOT NULL) INTO was_confirmed
    FROM jurisdiction_obligation WHERE id = p_id;
  IF was_confirmed IS NULL THEN RAISE EXCEPTION 'Obligation % not found', p_id; END IF;

  UPDATE jurisdiction_obligation SET
    title           = coalesce(p_title, title),
    trigger_detail  = coalesce(p_trigger_detail, trigger_detail),
    due_days        = coalesce(p_due_days, due_days),
    due_months      = coalesce(p_due_months, due_months),
    frequency       = coalesce(p_frequency, frequency),
    applies_to      = coalesce(p_applies_to, applies_to),
    filing_route    = coalesce(p_filing_route, filing_route),
    legislation_ref = coalesce(p_legislation_ref, legislation_ref),
    owner           = coalesce(p_owner, owner),
    note            = coalesce(p_note, note),
    -- Amending a confirmed obligation withdraws the confirmation: whoever
    -- confirmed it confirmed different terms.
    confirmed_by    = NULL,
    confirmed_at    = NULL
   WHERE id = p_id RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'jurisdiction_obligation', p_id,
                   CASE WHEN was_confirmed THEN 'obligation amended — CONFIRMATION WITHDRAWN'
                        ELSE 'obligation amended' END,
                   r.location_code || ' ' || r.title);
  RETURN r;
END $$;

-- Confirming. Per obligation rather than per jurisdiction, because they are
-- researched one at a time and a blanket confirmation would cover ones nobody
-- had checked.
CREATE OR REPLACE FUNCTION obligation_confirm(p_id bigint)
RETURNS jurisdiction_obligation
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jurisdiction_obligation;
BEGIN
  SELECT * INTO r FROM jurisdiction_obligation WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation % not found', p_id; END IF;

  IF r.legislation_ref IS NULL OR trim(r.legislation_ref) = '' THEN
    RAISE EXCEPTION 'Record the legislation or rule this comes from before confirming it — a confirmed deadline with no source cannot be checked by anyone else';
  END IF;
  IF r.owner IS NULL OR trim(r.owner) = '' THEN
    RAISE EXCEPTION 'Name who owns this obligation before confirming it — an obligation nobody owns is one nobody does';
  END IF;

  UPDATE jurisdiction_obligation
     SET confirmed_by = current_app_user(), confirmed_at = now()
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(NULL, 'jurisdiction_obligation', p_id, 'OBLIGATION CONFIRMED',
                   r.location_code || ' ' || r.title || ' — confirmed by ' || current_app_user());
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION obligation_remove(p_id bigint, p_reason text)
RETURNS TABLE(removed text, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jurisdiction_obligation;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for removing an obligation — if a requirement has been repealed or does not apply, that should be on the record';
  END IF;
  SELECT * INTO r FROM jurisdiction_obligation WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation % not found', p_id; END IF;

  -- Deactivated rather than deleted: a schedule that used to include something
  -- is part of the compliance history.
  UPDATE jurisdiction_obligation
     SET is_active = false,
         note = coalesce(note || ' | ', '') || 'Removed ' ||
                to_char(now(),'DD Mon YYYY') || ' by ' || current_app_user() ||
                ': ' || trim(p_reason)
   WHERE id = p_id;
  PERFORM ea_audit(NULL, 'jurisdiction_obligation', p_id, 'obligation removed',
                   r.location_code || ' ' || r.title || ' — ' || trim(p_reason));
  RETURN QUERY SELECT r.title,
    'Deactivated rather than deleted — a schedule that used to include something is part of the compliance history.';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- READING
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION obligations_list(
  p_location text DEFAULT NULL, p_include_inactive boolean DEFAULT false)
RETURNS TABLE(id bigint, location_code text, location_name text,
              area_code text, area_name text, title text,
              trigger_type text, trigger_detail text, due_description text,
              frequency text, applies_to text, filing_route text,
              legislation_ref text, owner text, note text,
              confirmed boolean, confirmed_by text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.id, o.location_code, l.name, o.area_code, a.name, o.title,
         o.trigger_type, o.trigger_detail,
         -- Rendered in words, because "30 / year_end" is not readable and this
         -- is the field people act on.
         CASE o.trigger_type
           WHEN 'on_change' THEN 'On change'
           WHEN 'ongoing'   THEN 'Ongoing'
           WHEN 'fixed_date' THEN 'By ' || o.fixed_day || '/' || o.fixed_month || ' each year'
           ELSE coalesce(
             coalesce(o.due_days || ' days', o.due_months || ' months') || ' after ' ||
             replace(o.trigger_type,'_',' ') ||
             coalesce(' (' || o.trigger_detail || ')', ''),
             'not specified')
         END,
         o.frequency, o.applies_to, o.filing_route, o.legislation_ref, o.owner, o.note,
         (o.confirmed_at IS NOT NULL), o.confirmed_by, o.is_active
    FROM jurisdiction_obligation o
    LEFT JOIN location l ON l.code = o.location_code
    LEFT JOIN obligation_area a ON a.code = o.area_code
   WHERE (p_location IS NULL OR o.location_code = p_location)
     AND (p_include_inactive OR o.is_active)
   ORDER BY l.name, a.sort_order, o.title;
$$;

-- Where the gaps are, by jurisdiction and area. This is the list Compliance
-- works from.
CREATE OR REPLACE FUNCTION obligation_coverage()
RETURNS TABLE(location_code text, location_name text, area_code text, area_name text,
              recorded bigint, confirmed bigint, gap boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.code, l.name, a.code, a.name,
         count(o.id) FILTER (WHERE o.is_active),
         count(o.id) FILTER (WHERE o.is_active AND o.confirmed_at IS NOT NULL),
         (count(o.id) FILTER (WHERE o.is_active) = 0)
    FROM location l
    CROSS JOIN obligation_area a
    LEFT JOIN jurisdiction_obligation o
           ON o.location_code = l.code AND o.area_code = a.code
   GROUP BY l.code, l.name, a.code, a.name, a.sort_order
   ORDER BY l.name, a.sort_order;
$$;

CREATE OR REPLACE FUNCTION obligation_summary()
RETURNS TABLE(location_code text, location_name text, areas_covered bigint,
              areas_total bigint, recorded bigint, confirmed bigint,
              ready boolean, next_step text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.code, l.name,
         (SELECT count(DISTINCT o.area_code) FROM jurisdiction_obligation o
           WHERE o.location_code = l.code AND o.is_active),
         (SELECT count(*) FROM obligation_area),
         (SELECT count(*) FROM jurisdiction_obligation o
           WHERE o.location_code = l.code AND o.is_active),
         (SELECT count(*) FROM jurisdiction_obligation o
           WHERE o.location_code = l.code AND o.is_active AND o.confirmed_at IS NOT NULL),
         -- Ready means every recorded obligation is confirmed AND at least the
         -- structural areas are covered. Not a claim that the schedule is
         -- complete — only Compliance can say that.
         ((SELECT count(*) FROM jurisdiction_obligation o
            WHERE o.location_code = l.code AND o.is_active) > 0
          AND (SELECT count(*) FROM jurisdiction_obligation o
                WHERE o.location_code = l.code AND o.is_active
                  AND o.confirmed_at IS NULL) = 0),
         CASE
           WHEN (SELECT count(*) FROM jurisdiction_obligation o
                  WHERE o.location_code = l.code AND o.is_active) = 0
             THEN 'Nothing recorded — the tracker shows no deadlines for this jurisdiction'
           WHEN (SELECT count(*) FROM jurisdiction_obligation o
                  WHERE o.location_code = l.code AND o.is_active
                    AND o.confirmed_at IS NULL) > 0
             THEN (SELECT count(*)::text FROM jurisdiction_obligation o
                    WHERE o.location_code = l.code AND o.is_active
                      AND o.confirmed_at IS NULL) || ' obligation(s) recorded but not confirmed'
           ELSE 'All recorded obligations confirmed'
         END
    FROM location l
   ORDER BY
     ((SELECT count(*) FROM jurisdiction_obligation o
        WHERE o.location_code = l.code AND o.is_active) > 0
      AND (SELECT count(*) FROM jurisdiction_obligation o
            WHERE o.location_code = l.code AND o.is_active
              AND o.confirmed_at IS NULL) = 0),
     l.name;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- MIGRATE THE SCHEDULES THAT ALREADY EXISTED
-- ─────────────────────────────────────────────────────────────────────
-- Malta and Cayman had schedules hardcoded in the JSX. They were already
-- reviewed, so they are migrated as they stand rather than discarded — but
-- NOT marked confirmed, because their dates came from a code constant and each
-- needs checking against the legislation and given an owner and a source
-- before anyone relies on it.
--
-- Isle of Man, Cyprus, UK and USA are left empty. A wrong date in a compliance
-- tracker is worse than a visibly empty one.
--
-- Guarded so re-running the file does not duplicate them.
--
-- NOTE: these are PERFORM, not SELECT. Inside a PL/pgSQL block a bare SELECT
-- has nowhere to put its result and fails with "query has no destination for
-- result data". My own test of this file passed because the guard below was
-- already false on the second run, so the statements never executed — the
-- re-run reported OK while skipping the code path entirely.

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM jurisdiction_obligation) THEN
    PERFORM obligation_add('CYM','AML','AML policies & procedures','fixed_date',NULL,NULL,NULL,12,31,'Annual review',NULL,NULL,NULL,'Colette Grisdale','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','AML','Risk assessment — ML/TF','fixed_date',NULL,NULL,NULL,12,31,'Annual',NULL,NULL,NULL,'Colette Grisdale','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','AEOI','FATCA return — CIMA portal','fixed_date',NULL,NULL,NULL,7,31,'Annual',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','AEOI','CRS return — CIMA portal','fixed_date',NULL,NULL,NULL,7,31,'Annual',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','SUBSTANCE','ESR return — all in-scope entities','ongoing',NULL,NULL,NULL,NULL,NULL,'Annual',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','BO','Beneficial ownership register — CIMA','on_change',NULL,NULL,NULL,NULL,NULL,'On change',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','ANNUAL','Annual returns — Registrar of Companies','fixed_date',NULL,NULL,NULL,1,31,'Annual',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('CYM','SECTOR','Mutual Fund annual return','fixed_date',NULL,NULL,NULL,6,30,'Annual',NULL,NULL,NULL,'Garry Crossan','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','LICENCE','Authorisation as Trustee / Administrator','ongoing',NULL,NULL,NULL,NULL,NULL,'Ongoing',NULL,NULL,NULL,'Joanne Fenech','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','AML','Business risk assessment','fixed_date',NULL,NULL,NULL,12,31,'Annual',NULL,NULL,NULL,'Colette Grisdale','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','AML','FIAU sectoral risk assessment update','fixed_date',NULL,NULL,NULL,12,31,'Annual',NULL,NULL,NULL,'Colette Grisdale','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','AEOI','CRS/FATCA return — MFSA portal','fixed_date',NULL,NULL,NULL,7,31,'Annual',NULL,NULL,NULL,'Joanne Fenech','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','BO','Beneficial ownership register — MFSA BROS','on_change',NULL,NULL,NULL,NULL,NULL,'On change',NULL,NULL,NULL,'Joanne Fenech','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','ANNUAL','Annual returns — Malta Business Registry','ongoing',NULL,NULL,NULL,NULL,NULL,'Annual',NULL,NULL,NULL,'Joanne Fenech','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
    PERFORM obligation_add('MALTA','LICENCE','FIAU supervision annual report','fixed_date',NULL,NULL,NULL,4,30,'Annual',NULL,NULL,NULL,'Colette Grisdale','Migrated from the hardcoded schedule — deadline to be re-confirmed against the legislation.');
  END IF;
END $mig$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('obligation_add','obligation_update','obligation_confirm',
                         'obligation_remove','obligations_list','obligation_coverage',
                         'obligation_summary')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON jurisdiction_obligation, obligation_area FROM PUBLIC, anon;
GRANT SELECT ON jurisdiction_obligation, obligation_area TO authenticated;

SELECT location_code, recorded, confirmed, left(next_step,54) AS next_step
  FROM obligation_summary();

-- ───────────────────────────────────────────────────────────────────────
-- 082_fix_silent_noops.sql
-- ───────────────────────────────────────────────────────────────────────
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

-- ───────────────────────────────────────────────────────────────────────
-- 083_missing_read_functions.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 083: THE MISSING READ FUNCTIONS
--
-- ── WHAT THE LIVE AUDIT FOUND ───────────────────────────────────────
--
-- Eleven screens read their data through functions that DO NOT EXIST. When
-- the call fails, each screen falls back to bundled sample data — so it looks
-- populated and correct.
--
-- The consequence is the worst combination: WRITES WORK AND READS DO NOT.
-- Someone enters a supplier invoice, a task, an officer change; it saves; then
-- the screen shows demo data instead. They conclude their entry vanished, or
-- act on sample figures believing they are real.
--
-- Why every earlier check missed it: these functions ARE called and ARE
-- exported, so the source lines up perfectly. Only executing them against a
-- real database shows they are not there.
--
-- This file creates 29 of the 33. Every column below was read from
-- information_schema first rather than assumed — the whole point of this
-- exercise is that assumptions are what caused it.
--
-- THE FOUR NOT BUILT, and why: comp_reviews, crm_prospects, crm_interactions
-- and attrition_cases have no table in the database at all. Writing a reader
-- over a store that does not exist would just move the problem. Those four
-- need the table designed first, which is a decision about what a compliance
-- review and a CRM prospect actually hold. Until then their screens should say
-- so rather than show demo data.
--
-- Run AFTER 082. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- ACCOUNTING
-- ─────────────────────────────────────────────────────────────────────
-- Per-entity trial balance. consolidated_trial_balance already existed for a
-- group; this is the single-entity one the accounting screen asks for.
CREATE OR REPLACE FUNCTION trial_balance(p_entity bigint, p_as_at date DEFAULT NULL)
RETURNS TABLE(account_id bigint, code text, name text, account_type text,
              debit numeric, credit numeric, balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id, a.code, a.name, a.account_type,
         round(coalesce(sum(CASE WHEN jl.func_amount > 0 THEN jl.func_amount END), 0), 2),
         round(coalesce(sum(CASE WHEN jl.func_amount < 0 THEN -jl.func_amount END), 0), 2),
         round(coalesce(sum(jl.func_amount), 0), 2)
    FROM account a
    JOIN journal_line jl ON jl.account_id = a.id
    JOIN journal j ON j.id = jl.journal_id
   WHERE j.entity_id = p_entity
     AND j.status = 'posted'
     AND (p_as_at IS NULL OR j.journal_date <= p_as_at)
   GROUP BY a.id, a.code, a.name, a.account_type
  HAVING round(coalesce(sum(jl.func_amount), 0), 2) <> 0
   ORDER BY a.code;
$$;

CREATE OR REPLACE FUNCTION recent_journals(p_entity bigint DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, journal_date date,
              period text, journal_type text, source text, narrative text,
              status text, lines bigint, total numeric,
              created_by text, approved_by text, balanced boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT j.id, j.entity_id, e.name, j.journal_date, j.period, j.journal_type,
         j.source, j.narrative, j.status,
         count(jl.id),
         round(coalesce(sum(CASE WHEN jl.func_amount > 0 THEN jl.func_amount END), 0), 2),
         j.created_by, j.approved_by,
         -- A journal that does not balance should be visible as such rather
         -- than sitting in a list looking like any other.
         (round(coalesce(sum(jl.func_amount), 0), 2) = 0)
    FROM journal j
    LEFT JOIN entity e ON e.id = j.entity_id
    LEFT JOIN journal_line jl ON jl.journal_id = j.id
   WHERE p_entity IS NULL OR j.entity_id = p_entity
   GROUP BY j.id, j.entity_id, e.name, j.journal_date, j.period, j.journal_type,
            j.source, j.narrative, j.status, j.created_by, j.approved_by
   ORDER BY j.journal_date DESC, j.id DESC
   LIMIT coalesce(p_limit, 50);
$$;

CREATE OR REPLACE FUNCTION pnl_by_entity(p_start date, p_end date)
RETURNS TABLE(entity_id bigint, entity_name text, ccy char(3),
              income numeric, expenses numeric, result numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, e.functional_ccy,
         round(coalesce(sum(CASE WHEN a.account_type = 'income'
                                 THEN -jl.func_amount END), 0), 2),
         round(coalesce(sum(CASE WHEN a.account_type = 'expense'
                                 THEN jl.func_amount END), 0), 2),
         round(coalesce(sum(CASE WHEN a.account_type IN ('income','expense')
                                 THEN -jl.func_amount END), 0), 2)
    FROM entity e
    JOIN journal j ON j.entity_id = e.id AND j.status = 'posted'
                  AND j.journal_date BETWEEN p_start AND p_end
    JOIN journal_line jl ON jl.journal_id = j.id
    JOIN account a ON a.id = jl.account_id
   WHERE a.account_type IN ('income','expense')
   GROUP BY e.id, e.name, e.functional_ccy
   ORDER BY e.name;
$$;

-- Takes an entity filter: the accounting screen shows vendors in the context
-- of one entity, and passing the filter is the right intent — so the function
-- accepts it rather than the caller dropping it.
CREATE OR REPLACE FUNCTION ap_vendors(p_entity bigint DEFAULT NULL,
                                      p_active_only boolean DEFAULT true)
RETURNS TABLE(id bigint, name text, vendor_code text, default_ccy char(3),
              payment_terms_days integer, vat_no text, email text,
              on_hold boolean, wht_rate numeric, is_active boolean,
              open_invoices bigint, outstanding numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.name, s.vendor_code, s.default_ccy, s.payment_terms_days,
         s.vat_no, s.email, s.on_hold, s.wht_rate, s.is_active,
         count(si.id) FILTER (WHERE coalesce(si.outstanding,0) > 0),
         round(coalesce(sum(si.outstanding), 0), 2)
    FROM supplier s
    LEFT JOIN supplier_invoice si ON si.supplier_id = s.id
         AND (p_entity IS NULL OR si.entity_id = p_entity)
   WHERE (NOT p_active_only OR coalesce(s.is_active, true))
     -- With an entity filter, only vendors that entity actually deals with.
     AND (p_entity IS NULL
          OR EXISTS (SELECT 1 FROM supplier_invoice x
                      WHERE x.supplier_id = s.id AND x.entity_id = p_entity))
   GROUP BY s.id, s.name, s.vendor_code, s.default_ccy, s.payment_terms_days,
            s.vat_no, s.email, s.on_hold, s.wht_rate, s.is_active
   ORDER BY s.name;
$$;

-- Ageing buckets from the due date, not the invoice date: an invoice on 60-day
-- terms is not overdue at 45 days, and bucketing from the invoice date would
-- say it was.
CREATE OR REPLACE FUNCTION ap_aging(p_entity bigint DEFAULT NULL, p_as_at date DEFAULT NULL)
RETURNS TABLE(supplier_id bigint, supplier text, ccy char(3),
              current_amt numeric, d1_30 numeric, d31_60 numeric,
              d61_90 numeric, d90_plus numeric, total numeric,
              oldest_days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH d AS (
    SELECT si.supplier_id, si.ccy, si.outstanding,
           (coalesce(p_as_at, current_date) - coalesce(si.due_date, si.invoice_date))::int AS age
      FROM supplier_invoice si
     WHERE coalesce(si.outstanding, 0) > 0
       AND coalesce(si.status,'') = 'posted'
       AND (p_entity IS NULL OR si.entity_id = p_entity)
  )
  SELECT d.supplier_id, s.name, d.ccy,
         round(coalesce(sum(d.outstanding) FILTER (WHERE d.age <= 0), 0), 2),
         round(coalesce(sum(d.outstanding) FILTER (WHERE d.age BETWEEN 1 AND 30), 0), 2),
         round(coalesce(sum(d.outstanding) FILTER (WHERE d.age BETWEEN 31 AND 60), 0), 2),
         round(coalesce(sum(d.outstanding) FILTER (WHERE d.age BETWEEN 61 AND 90), 0), 2),
         round(coalesce(sum(d.outstanding) FILTER (WHERE d.age > 90), 0), 2),
         round(coalesce(sum(d.outstanding), 0), 2),
         max(d.age)
    FROM d LEFT JOIN supplier s ON s.id = d.supplier_id
   GROUP BY d.supplier_id, s.name, d.ccy
   ORDER BY 9 DESC;
$$;

CREATE OR REPLACE FUNCTION ap_purchase_orders(p_entity bigint DEFAULT NULL,
                                              p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, po_number text,
              supplier_id bigint, supplier text, po_date date, ccy char(3),
              net_total numeric, vat_total numeric, gross_total numeric,
              status text, created_by text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.entity_id, e.name, p.po_number, p.supplier_id, s.name,
         p.po_date, p.ccy, p.net_total, p.vat_total, p.gross_total,
         p.status, p.created_by
    FROM purchase_order p
    LEFT JOIN entity e ON e.id = p.entity_id
    LEFT JOIN supplier s ON s.id = p.supplier_id
   WHERE (p_entity IS NULL OR p.entity_id = p_entity)
     AND (p_status IS NULL OR p.status = p_status)
   ORDER BY p.po_date DESC;
$$;

CREATE OR REPLACE FUNCTION budget_vs_actual_for_entity(
  p_entity bigint, p_fiscal_year integer DEFAULT NULL)
RETURNS TABLE(account_id bigint, code text, name text, account_type text,
              budget numeric, actual numeric, variance numeric,
              variance_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH b AS (
    SELECT bl.account_id, round(coalesce(sum(bl.amount), 0), 2) AS amt
      FROM budget bu JOIN budget_line bl ON bl.budget_id = bu.id
     WHERE bu.entity_id = p_entity
       AND (p_fiscal_year IS NULL OR bu.fiscal_year = p_fiscal_year)
     GROUP BY bl.account_id
  ),
  act AS (
    SELECT jl.account_id, round(coalesce(sum(-jl.func_amount), 0), 2) AS amt
      FROM journal j JOIN journal_line jl ON jl.journal_id = j.id
     WHERE j.entity_id = p_entity AND j.status = 'posted'
       AND (p_fiscal_year IS NULL
            OR extract(year from j.journal_date) = p_fiscal_year)
     GROUP BY jl.account_id
  )
  SELECT a.id, a.code, a.name, a.account_type,
         coalesce(b.amt, 0), coalesce(act.amt, 0),
         coalesce(act.amt, 0) - coalesce(b.amt, 0),
         -- Nil budget means no percentage rather than a division by zero or a
         -- misleading 100%.
         CASE WHEN coalesce(b.amt, 0) = 0 THEN NULL
              ELSE round((coalesce(act.amt,0) - b.amt) / abs(b.amt) * 100, 1) END
    FROM account a
    LEFT JOIN b ON b.account_id = a.id
    LEFT JOIN act ON act.account_id = a.id
   WHERE coalesce(b.amt, 0) <> 0 OR coalesce(act.amt, 0) <> 0
   ORDER BY a.code;
$$;

CREATE OR REPLACE FUNCTION ic_loans_for_entity(p_entity bigint)
RETURNS TABLE(id bigint, lender_entity bigint, lender text,
              borrower_entity bigint, borrower text, ccy char(3),
              facility numeric, interest_rate numeric, start_date date,
              status text, direction text, no_interest_rate boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT l.id, l.lender_entity, le.name, l.borrower_entity, be.name,
         l.ccy, l.facility, l.interest_rate, l.start_date, l.status,
         CASE WHEN l.lender_entity = p_entity THEN 'lending' ELSE 'borrowing' END,
         (l.interest_rate IS NULL OR l.interest_rate = 0)
    FROM ic_loan l
    LEFT JOIN entity le ON le.id = l.lender_entity
    LEFT JOIN entity be ON be.id = l.borrower_entity
   WHERE l.lender_entity = p_entity OR l.borrower_entity = p_entity
   ORDER BY l.start_date DESC;
$$;

CREATE OR REPLACE FUNCTION bank_accounts_for_entity(p_entity bigint)
RETURNS TABLE(id bigint, entity_id bigint, name text, iban text, ccy char(3),
              is_default boolean, ledger_balance numeric, movements bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, b.entity_id, b.name, b.iban, b.ccy, b.is_default,
         -- The ledger balance, from the journals. Not the bank's balance:
         -- those differ, and the difference is what a reconciliation is for.
         round(coalesce((SELECT sum(jl.func_amount)
                           FROM journal j JOIN journal_line jl ON jl.journal_id = j.id
                          WHERE j.entity_id = b.entity_id AND j.status = 'posted'
                            AND jl.memo ILIKE '%' || b.name || '%'), 0), 2),
         (SELECT count(*) FROM bank_statement_line sl
            JOIN bank_statement st ON st.id = sl.statement_id
           WHERE st.bank_account_id = b.id)
    FROM bank_account b
   WHERE b.entity_id = p_entity
   ORDER BY b.is_default DESC NULLS LAST, b.name;
$$;

CREATE OR REPLACE FUNCTION fx_rates_latest(p_as_at date DEFAULT NULL)
RETURNS TABLE(from_ccy char(3), to_ccy char(3), rate numeric, rate_date date,
              rate_type text, source text, days_old integer, stale boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT DISTINCT ON (r.from_ccy, r.to_ccy)
         r.from_ccy, r.to_ccy, r.rate, r.rate_date, r.rate_type, r.source,
         (coalesce(p_as_at, current_date) - r.rate_date)::int,
         -- A rate more than a week old will quietly misstate every foreign
         -- currency balance, so it is flagged rather than shown plainly.
         ((coalesce(p_as_at, current_date) - r.rate_date) > 7)
    FROM fx_rate r
   WHERE p_as_at IS NULL OR r.rate_date <= p_as_at
   ORDER BY r.from_ccy, r.to_ccy, r.rate_date DESC;
$$;

CREATE OR REPLACE FUNCTION fx_positions(p_entity bigint DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, functional_ccy char(3),
              txn_ccy char(3), accounts bigint, txn_balance numeric,
              func_balance numeric, implied_rate numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, e.functional_ccy, jl.txn_ccy,
         count(DISTINCT jl.account_id),
         round(coalesce(sum(jl.txn_amount), 0), 2),
         round(coalesce(sum(jl.func_amount), 0), 2),
         CASE WHEN round(coalesce(sum(jl.txn_amount), 0), 2) = 0 THEN NULL
              ELSE round(sum(jl.func_amount) / sum(jl.txn_amount), 6) END
    FROM entity e
    JOIN journal j ON j.entity_id = e.id AND j.status = 'posted'
    JOIN journal_line jl ON jl.journal_id = j.id
    JOIN account a ON a.id = jl.account_id AND coalesce(a.is_monetary, false)
   WHERE (p_entity IS NULL OR e.id = p_entity)
     AND jl.txn_ccy <> e.functional_ccy
   GROUP BY e.id, e.name, e.functional_ccy, jl.txn_ccy
   ORDER BY e.name, jl.txn_ccy;
$$;

CREATE OR REPLACE FUNCTION vat_boxes_ytd(p_entity bigint, p_year integer DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, returns bigint,
              output_vat numeric, input_vat numeric, net_vat numeric,
              posted bigint, unposted bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, count(v.id),
         round(coalesce(sum(v.output_vat), 0), 2),
         round(coalesce(sum(v.input_vat), 0), 2),
         round(coalesce(sum(v.net_vat), 0), 2),
         count(v.id) FILTER (WHERE v.status IN ('posted','submitted')),
         count(v.id) FILTER (WHERE coalesce(v.status,'') NOT IN ('posted','submitted'))
    FROM entity e
    LEFT JOIN vat_return v ON v.entity_id = e.id
         AND (p_year IS NULL OR extract(year from v.period_end) = p_year)
   WHERE e.id = p_entity
   GROUP BY e.id, e.name;
$$;

-- Control checks the accounting screen shows. Each is a question with a yes or
-- no answer, not a score — a score would let a real failure hide behind a
-- healthy-looking average.
CREATE OR REPLACE FUNCTION control_checks(p_entity bigint DEFAULT NULL)
RETURNS TABLE(check_name text, passed boolean, detail text, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; amt numeric;
BEGIN
  SELECT count(*) INTO n FROM journal j
   WHERE (p_entity IS NULL OR j.entity_id = p_entity) AND coalesce(j.status,'') = 'draft';
  RETURN QUERY SELECT 'No draft journals'::text, (n = 0),
    CASE WHEN n = 0 THEN 'none' ELSE n || ' draft journal(s) not in the ledger' END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'attention' END;

  SELECT count(*) INTO n FROM (
    SELECT j.id FROM journal j JOIN journal_line jl ON jl.journal_id = j.id
     WHERE (p_entity IS NULL OR j.entity_id = p_entity) AND j.status = 'posted'
     GROUP BY j.id HAVING round(sum(jl.func_amount), 2) <> 0) x;
  RETURN QUERY SELECT 'Every posted journal balances'::text, (n = 0),
    CASE WHEN n = 0 THEN 'all balanced'
         ELSE n || ' posted journal(s) do not balance — the ledger is misstated' END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'critical' END;

  SELECT count(*), round(coalesce(sum(abs(s.held)),0),2) INTO n, amt
    FROM cm_shortfalls(p_entity) s;
  RETURN QUERY SELECT 'No client money shortfalls'::text, (n = 0),
    CASE WHEN n = 0 THEN 'none' ELSE n || ' client(s) short by ' || amt END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'critical' END;

  SELECT count(*) INTO n FROM ic_balances(NULL) b
   WHERE b.is_group_total AND b.ic_balance <> 0;
  RETURN QUERY SELECT 'Intercompany eliminates to nil'::text, (n = 0),
    CASE WHEN n = 0 THEN 'group total is nil'
         ELSE 'the group total is not nil — something is posted on one side only' END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'attention' END;

  SELECT count(*) INTO n FROM pay_runs_list(p_entity) r WHERE r.self_approved;
  RETURN QUERY SELECT 'No self-approved payment runs'::text, (n = 0),
    CASE WHEN n = 0 THEN 'none' ELSE n || ' run(s) approved by whoever created them' END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'critical' END;

  SELECT count(*) INTO n FROM fx_rates_latest(NULL) f WHERE f.stale;
  RETURN QUERY SELECT 'FX rates current'::text, (n = 0),
    CASE WHEN n = 0 THEN 'all within a week'
         ELSE n || ' rate(s) more than a week old — foreign currency balances would be stated at a stale rate' END,
    CASE WHEN n = 0 THEN 'ok' ELSE 'attention' END;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- GROUP
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION group_consolidated_summary()
RETURNS TABLE(group_id bigint, group_name text, reporting_ccy char(3),
              members bigint, wholly_owned bigint, with_nci bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT g.id, g.name, g.reporting_ccy,
         count(m.entity_id),
         count(m.entity_id) FILTER (WHERE coalesce(m.ownership_pct,100) >= 100),
         count(m.entity_id) FILTER (WHERE coalesce(m.ownership_pct,100) < 100)
    FROM consol_group g
    LEFT JOIN consol_group_member m ON m.group_id = g.id
   GROUP BY g.id, g.name, g.reporting_ccy
   ORDER BY g.name;
$$;

CREATE OR REPLACE FUNCTION group_effective_ownership(p_group bigint)
RETURNS TABLE(entity_id bigint, entity_name text, company_code text,
              direct_pct numeric, parent_entity_id bigint, parent_name text,
              effective_pct numeric, has_nci boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH RECURSIVE chain AS (
    -- Cast required: the recursive term produces plain numeric from the
    -- round(), so the anchor must match or PostgreSQL rejects the CTE.
    SELECT m.entity_id, m.ownership_pct AS direct, m.parent_entity_id,
           m.ownership_pct::numeric AS effective
      FROM consol_group_member m
     WHERE m.group_id = p_group AND m.parent_entity_id IS NULL
    UNION ALL
    -- Effective ownership compounds down the chain: 80% of an 80% subsidiary
    -- is 64%, not 80%. Reporting the direct percentage would overstate the
    -- group's share of the lower tiers.
    SELECT m.entity_id, m.ownership_pct, m.parent_entity_id,
           round(c.effective * m.ownership_pct / 100, 4)
      FROM consol_group_member m
      JOIN chain c ON c.entity_id = m.parent_entity_id
     WHERE m.group_id = p_group
  )
  SELECT c.entity_id, e.name, e.company_code, c.direct, c.parent_entity_id,
         pe.name, c.effective, (c.effective < 100)
    FROM chain c
    LEFT JOIN entity e ON e.id = c.entity_id
    LEFT JOIN entity pe ON pe.id = c.parent_entity_id
   ORDER BY c.effective DESC, e.name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- COMPLIANCE
-- ─────────────────────────────────────────────────────────────────────
-- Reads the obligations Compliance enters in db/081.
CREATE OR REPLACE FUNCTION comp_reg_obligations(p_location text DEFAULT NULL)
RETURNS TABLE(id bigint, jurisdiction text, area text, title text,
              due_description text, frequency text, owner text,
              legislation_ref text, confirmed boolean, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.id, o.location_name, o.area_name, o.title, o.due_description,
         o.frequency, o.owner, o.legislation_ref, o.confirmed,
         -- Nothing reads as "On track" unless Compliance has confirmed it.
         CASE WHEN o.confirmed THEN 'Confirmed' ELSE 'Unconfirmed' END
    FROM obligations_list(p_location, false) o;
$$;

CREATE OR REPLACE FUNCTION comp_breaches(p_open_only boolean DEFAULT true)
RETURNS TABLE(id bigint, breach_date date, source text, subject text,
              breach_type text, amount numeric, status text,
              days_open integer, severity text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT b.id, b.breach_date, 'Client money'::text, c.name, b.breach_type,
         b.amount, b.status,
         (current_date - b.breach_date)::int,
         -- A client money breach open more than five days is a different
         -- matter from one identified today.
         CASE WHEN coalesce(b.status,'Open') = 'Remediated' THEN 'closed'
              WHEN (current_date - b.breach_date) > 5 THEN 'critical'
              ELSE 'attention' END
    FROM client_money_breach b
    LEFT JOIN cm_client c ON c.id = b.cm_client_id
   WHERE NOT p_open_only OR coalesce(b.status,'Open') <> 'Remediated'
   ORDER BY b.breach_date DESC;
$$;

CREATE OR REPLACE FUNCTION comp_training(p_year integer DEFAULT NULL)
RETURNS TABLE(staff_name text, entries bigint, hours numeric,
              verified_hours numeric, unverified bigint, categories text,
              last_entry date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.staff_name, count(*), round(coalesce(sum(c.hours),0),1),
         round(coalesce(sum(c.hours) FILTER (WHERE c.verified),0),1),
         count(*) FILTER (WHERE NOT coalesce(c.verified,false)),
         string_agg(DISTINCT c.category, ', '),
         max(c.entry_date)
    FROM cpd_entry c
   WHERE p_year IS NULL OR extract(year from c.entry_date) = p_year
   GROUP BY c.staff_name
   ORDER BY c.staff_name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- STATUTORY REGISTERS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION stat_annual_returns(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, filing_type text,
              period text, due_date date, status text, days_to_due integer,
              overdue boolean, prepared_by text, submitted_by text,
              reference text, chase_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.id, f.entity_id, e.name, f.filing_type, f.period, f.due_date, f.status,
         (f.due_date - current_date)::int,
         (f.due_date < current_date AND coalesce(f.status,'') <> 'submitted'),
         f.prepared_by, f.submitted_by, f.reference, f.chase_count
    FROM statutory_filing f
    LEFT JOIN entity e ON e.id = f.entity_id
   WHERE p_entity IS NULL OR f.entity_id = p_entity
   ORDER BY f.due_date;
$$;

CREATE OR REPLACE FUNCTION stat_bo_registers(p_entity bigint DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, jurisdiction text,
              ubos bigint, total_pct numeric, complete boolean, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, p.jurisdiction,
         count(u.id), round(coalesce(sum(u.ownership_pct),0),2),
         -- A beneficial ownership register that does not account for 100% is
         -- incomplete, and that is a filing matter rather than a tidiness one.
         (round(coalesce(sum(u.ownership_pct),0),2) = 100),
         CASE WHEN count(u.id) = 0 THEN 'no beneficial owners recorded'
              WHEN round(coalesce(sum(u.ownership_pct),0),2) = 100 THEN 'accounts for 100%'
              WHEN round(coalesce(sum(u.ownership_pct),0),2) < 100
                THEN round(100 - coalesce(sum(u.ownership_pct),0),2) || '% unaccounted for'
              ELSE round(coalesce(sum(u.ownership_pct),0) - 100,2) || '% over — recorded twice?' END
    FROM entity e
    JOIN entity_profile p ON p.entity_id = e.id
    LEFT JOIN entity_ubo u ON u.entity_id = e.id
   WHERE e.entity_class = 'client' AND (p_entity IS NULL OR e.id = p_entity)
   GROUP BY e.id, e.name, p.jurisdiction
   ORDER BY (round(coalesce(sum(u.ownership_pct),0),2) = 100), e.name;
$$;

-- Current officers. "cogs" in the original name is register of directors and
-- officers; kept as the screen calls it.
CREATE OR REPLACE FUNCTION stat_cogs_list(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, name text,
              role text, appointed date, nationality text,
              years_served numeric, tax_residence text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.id, o.entity_id, e.name, o.name, o.role, o.appointed, o.nationality,
         -- date minus date gives an integer number of days, so this is days
         -- over 365.25 rather than an epoch extract, which only works on an
         -- interval.
         round((current_date - o.appointed) / 365.25, 1),
         o.tax_residence
    FROM entity_officer o
    LEFT JOIN entity e ON e.id = o.entity_id
   WHERE o.resigned IS NULL
     AND (p_entity IS NULL OR o.entity_id = p_entity)
   ORDER BY e.name, o.appointed;
$$;

-- Appointments and resignations, which is what a registry filing is triggered
-- by. Includes resigned officers deliberately: the change is the event.
CREATE OR REPLACE FUNCTION stat_officer_changes(p_entity bigint DEFAULT NULL,
                                                p_since date DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, officer text, role text,
              change_type text, change_date date, days_ago integer,
              filing_due boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.entity_id, e.name, o.name, o.role, 'Appointed'::text, o.appointed,
         (current_date - o.appointed)::int,
         -- Most registries require notification within a month; flagged so a
         -- change that has not been filed is visible.
         ((current_date - o.appointed) > 30)
    FROM entity_officer o LEFT JOIN entity e ON e.id = o.entity_id
   WHERE o.appointed IS NOT NULL
     AND (p_entity IS NULL OR o.entity_id = p_entity)
     AND (p_since IS NULL OR o.appointed >= p_since)
  UNION ALL
  SELECT o.entity_id, e.name, o.name, o.role, 'Resigned'::text, o.resigned,
         (current_date - o.resigned)::int,
         ((current_date - o.resigned) > 30)
    FROM entity_officer o LEFT JOIN entity e ON e.id = o.entity_id
   WHERE o.resigned IS NOT NULL
     AND (p_entity IS NULL OR o.entity_id = p_entity)
     AND (p_since IS NULL OR o.resigned >= p_since)
   ORDER BY 6 DESC;
$$;

CREATE OR REPLACE FUNCTION stat_dissolutions(p_entity bigint DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, company_code text,
              jurisdiction text, admin_status text, risk_rating text,
              outstanding_filings bigint, unbilled_time bigint,
              can_close boolean, blocker text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, e.company_code, p.jurisdiction, p.admin_status, p.risk_rating,
         (SELECT count(*) FROM statutory_filing f
           WHERE f.entity_id = e.id AND coalesce(f.status,'') <> 'submitted'),
         (SELECT count(*) FROM timesheet_entry t
           WHERE t.entity_label = e.name AND t.billable
             AND coalesce(t.status,'') <> 'Billed'),
         -- An entity cannot be closed with filings outstanding or unbilled
         -- time: the first leaves a regulatory loose end, the second writes
         -- off work already done.
         ((SELECT count(*) FROM statutory_filing f
            WHERE f.entity_id = e.id AND coalesce(f.status,'') <> 'submitted') = 0
          AND (SELECT count(*) FROM timesheet_entry t
                WHERE t.entity_label = e.name AND t.billable
                  AND coalesce(t.status,'') <> 'Billed') = 0),
         CASE
           WHEN (SELECT count(*) FROM statutory_filing f
                  WHERE f.entity_id = e.id AND coalesce(f.status,'') <> 'submitted') > 0
             THEN 'filings outstanding'
           WHEN (SELECT count(*) FROM timesheet_entry t
                  WHERE t.entity_label = e.name AND t.billable
                    AND coalesce(t.status,'') <> 'Billed') > 0
             THEN 'unbilled time would be written off'
           ELSE 'nothing outstanding' END
    FROM entity e
    JOIN entity_profile p ON p.entity_id = e.id
   WHERE e.entity_class = 'client'
     AND (p_entity IS NULL OR e.id = p_entity)
   ORDER BY e.name;
$$;

-- invoice.settled is TEXT, not boolean — checked rather than assumed after the
-- function was rejected for returning text where a boolean was declared.
-- ─────────────────────────────────────────────────────────────────────
-- OPERATIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tasks_list(p_assignee text DEFAULT NULL,
                                      p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, title text, category text, entity_label text,
              entity_id bigint, assignee text, raised_by text, due_date date,
              priority text, status text, notes text,
              days_to_due integer, overdue boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT t.id, t.title, t.category, t.entity_label, t.entity_id, t.assignee,
         t.raised_by, t.due_date, t.priority, t.status, t.notes,
         (t.due_date - current_date)::int,
         (t.due_date < current_date AND coalesce(t.status,'') NOT IN ('Done','Complete'))
    FROM task t
   WHERE (p_assignee IS NULL OR t.assignee = p_assignee)
     AND (p_status IS NULL OR t.status = p_status)
   ORDER BY (t.due_date < current_date
             AND coalesce(t.status,'') NOT IN ('Done','Complete')) DESC,
            t.due_date NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION onboarding_cases(p_stage text DEFAULT NULL)
RETURNS TABLE(id bigint, client_name text, entity_name text, entity_id bigint,
              office text, jurisdiction text, entity_type text, sector text,
              stage text, risk_rating text, assigned_to text,
              target_date date, fee_quoted numeric, fee_ccy char(3),
              cdd_items bigint, cdd_verified bigint, cdd_outstanding bigint,
              is_live boolean, days_open integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.client_name, c.entity_name, c.entity_id, c.office,
         c.jurisdiction, c.entity_type, c.sector, c.stage, c.risk_rating,
         c.assigned_to, c.target_date, c.fee_quoted, c.fee_ccy,
         (SELECT count(*) FROM cdd_item i WHERE i.case_id = c.id),
         (SELECT count(*) FROM cdd_item i WHERE i.case_id = c.id AND i.status = 'Verified'),
         (SELECT count(*) FROM cdd_item i WHERE i.case_id = c.id
                                            AND coalesce(i.status,'') <> 'Verified'),
         (c.entity_id IS NOT NULL),
         (current_date - c.created_at::date)::int
    FROM onboarding_case c
   WHERE p_stage IS NULL OR c.stage = p_stage
   ORDER BY c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION fee_invoices(p_entity bigint DEFAULT NULL,
                                        p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, invoice_date date,
              ccy char(3), net_total numeric, vat_total numeric,
              gross_total numeric, outstanding numeric, settled text,
              status text, days_outstanding integer, overdue boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT i.id, i.entity_id, e.name, i.invoice_date, i.ccy, i.net_total,
         i.vat_total, i.gross_total, i.outstanding, i.settled, i.status,
         (current_date - i.invoice_date)::int,
         (coalesce(i.outstanding, 0) > 0 AND (current_date - i.invoice_date) > 30)
    FROM invoice i
    LEFT JOIN entity e ON e.id = i.entity_id
   WHERE (p_entity IS NULL OR i.entity_id = p_entity)
     AND (p_status IS NULL OR i.status = p_status)
   ORDER BY i.invoice_date DESC;
$$;

-- dms_category is an INTEGER foreign key, not the category name — checked
-- after the function was rejected comparing integer to text. Joined so the
-- screen gets a readable name and can still filter by either.
CREATE OR REPLACE FUNCTION document_list(p_entity bigint DEFAULT NULL,
                                         p_category text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, object_type text,
              object_id bigint, dms_category text, dms_ref text,
              filename text, uploaded_by text, uploaded_at timestamptz,
              retention_until date, within_retention boolean, days_held integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id, d.entity_id, e.name, d.object_type, d.object_id,
         coalesce(c.name, d.dms_category::text),
         d.dms_ref, d.filename, d.uploaded_by, d.uploaded_at, d.retention_until,
         -- Within retention means it must not be deleted. Shown so nobody has
         -- to work it out from a date.
         (d.retention_until IS NOT NULL AND d.retention_until > current_date),
         (current_date - d.uploaded_at::date)::int
    FROM document_link d
    LEFT JOIN entity e ON e.id = d.entity_id
    -- The foreign key is on dms_category(code), an integer, not an id
    -- column — that table has only code and name.
    LEFT JOIN dms_category c ON c.code = d.dms_category
   WHERE (p_entity IS NULL OR d.entity_id = p_entity)
     AND (p_category IS NULL OR c.name = p_category
          OR d.dms_category::text = p_category)
   ORDER BY d.uploaded_at DESC;
$$;

CREATE OR REPLACE FUNCTION eg_licences(p_entity bigint DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, regulator text,
              licence_no text, licence_status text, licence_from date,
              licence_to date, categories text, days_to_expiry integer,
              expiring_soon boolean, expired boolean, notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT g.id, g.entity_id, e.name, g.regulator, g.licence_no, g.licence_status,
         g.licence_from, g.licence_to, g.categories,
         (g.licence_to - current_date)::int,
         -- Ninety days is the point at which a renewal has to be in hand for
         -- most gaming regulators.
         (g.licence_to IS NOT NULL AND g.licence_to > current_date
          AND (g.licence_to - current_date) <= 90),
         (g.licence_to IS NOT NULL AND g.licence_to < current_date),
         g.notes
    FROM entity_gaming g
    LEFT JOIN entity e ON e.id = g.entity_id
   WHERE p_entity IS NULL OR g.entity_id = p_entity
   ORDER BY g.licence_to NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION eg_log(p_entity bigint DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS TABLE(entity_id bigint, entity_name text, licence_no text,
              action text, detail text, at timestamptz, by_whom text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  -- From the audit trail rather than a separate log, so there is one record of
  -- what happened rather than two that can disagree.
  -- audit_event records the object it touched in target, not entity_id —
  -- checked rather than assumed.
  SELECT g.entity_id, e.name, g.licence_no, a.action, a.details, a.t, a.staff_user
    FROM audit_event a
    -- audit_event.target is TEXT, so the id needs casting to match.
    JOIN entity_gaming g ON g.id::text = a.target
    LEFT JOIN entity e ON e.id = g.entity_id
   WHERE a.mod = 'entity_gaming'
     AND (p_entity IS NULL OR g.entity_id = p_entity)
   ORDER BY a.t DESC
   LIMIT coalesce(p_limit, 100);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- GRANTS
-- ─────────────────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('trial_balance','recent_journals','pnl_by_entity','ap_vendors',
                         'ap_aging','ap_purchase_orders','budget_vs_actual_for_entity',
                         'ic_loans_for_entity','bank_accounts_for_entity','fx_rates_latest',
                         'fx_positions','vat_boxes_ytd','control_checks',
                         'group_consolidated_summary','group_effective_ownership',
                         'comp_reg_obligations','comp_breaches','comp_training',
                         'stat_annual_returns','stat_bo_registers','stat_cogs_list',
                         'stat_officer_changes','stat_dissolutions','tasks_list',
                         'onboarding_cases','fee_invoices','document_list',
                         'eg_licences','eg_log')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm every one exists and is reachable ────────────────────────
SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('trial_balance','recent_journals','pnl_by_entity','ap_vendors',
                     'ap_aging','ap_purchase_orders','budget_vs_actual_for_entity',
                     'ic_loans_for_entity','bank_accounts_for_entity','fx_rates_latest',
                     'fx_positions','vat_boxes_ytd','control_checks',
                     'group_consolidated_summary','group_effective_ownership',
                     'comp_reg_obligations','comp_breaches','comp_training',
                     'stat_annual_returns','stat_bo_registers','stat_cogs_list',
                     'stat_officer_changes','stat_dissolutions','tasks_list',
                     'onboarding_cases','fee_invoices','document_list',
                     'eg_licences','eg_log')
 ORDER BY p.proname;

-- ───────────────────────────────────────────────────────────────────────
-- 084_reviews_crm_attrition.sql
-- ───────────────────────────────────────────────────────────────────────
-- =====================================================================
-- AFFINITY CORE — 084: THE FOUR STORES THAT DID NOT EXIST
--
-- The pre-Azure audit found 33 read functions the API called that were not
-- there. Twenty-nine were built in db/083 over tables that existed. These four
-- had NO TABLE AT ALL:
--
--   comp_reviews      periodic client reviews
--   crm_prospects     the business development pipeline
--   crm_interactions  the contact log against a prospect
--   attrition_cases   a client leaving
--
-- Designed from what the screens already display plus Andy's answers on the
-- three points only he could settle:
--
--   * attrition sign-off is Manager, then MD, then Group CEO **or** Group COO.
--     The last stage has an ALTERNATE, so either satisfies it — modelled
--     explicitly rather than as a single named role, because a rule that
--     needs one specific person stalls when they are away.
--   * a review falls due on RISK RATING, not a fixed period.
--   * the pipeline stages are Proposal Sent, KYC Arriving, Fees Paid.
--
-- The review INTERVALS are not hardcoded. High annually and Low every three
-- years is the common shape, but it varies by jurisdiction and it is a
-- compliance judgement, so Compliance enters them — the same treatment as the
-- payroll rates and the obligation schedules.
--
-- Run AFTER 083. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. HOW OFTEN A REVIEW FALLS DUE
-- ─────────────────────────────────────────────────────────────────────
-- An interval applies either to one jurisdiction or to all of them. NULL was
-- the obvious way to say "all", but location_code cannot be null while it is
-- part of the primary key — primary key columns are NOT NULL, so the first
-- group-wide interval was rejected. Found by running it.
--
-- A surrogate key with a unique index over coalesce() instead, which lets NULL
-- mean "all jurisdictions" and still prevents two intervals for the same
-- rating and place.
CREATE TABLE IF NOT EXISTS review_frequency (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  risk_rating    text NOT NULL,
  location_code  text REFERENCES location(code),   -- null = applies everywhere
  months         integer NOT NULL,
  note           text,
  set_by         text NOT NULL DEFAULT current_app_user(),
  set_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_frequency_months CHECK (months > 0 AND months <= 120)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_review_frequency
  ON review_frequency(risk_rating, coalesce(location_code, '*'));
-- Deliberately empty. Until Compliance enters the intervals, no review has a
-- due date and the screen says so — a made-up interval would silently put
-- high-risk clients on the wrong cycle.

CREATE OR REPLACE FUNCTION review_frequency_set(
  p_risk text, p_months integer, p_location text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS review_frequency LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r review_frequency;
BEGIN
  IF coalesce(trim(p_risk),'') = '' THEN
    RAISE EXCEPTION 'Give the risk rating this interval applies to';
  END IF;
  IF p_months IS NULL OR p_months <= 0 THEN
    RAISE EXCEPTION 'The interval must be a positive number of months';
  END IF;
  IF p_months > 120 THEN
    RAISE EXCEPTION 'An interval of % months is over ten years — check that is intended', p_months;
  END IF;

  INSERT INTO review_frequency(risk_rating, location_code, months, note)
  VALUES (trim(p_risk), p_location, p_months, p_note)
  ON CONFLICT (risk_rating, coalesce(location_code, '*')) DO UPDATE SET
    months = EXCLUDED.months, note = EXCLUDED.note,
    set_by = current_app_user(), set_at = now()
  RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'review_frequency', NULL, 'review interval set',
                   trim(p_risk) || coalesce(' in ' || p_location, ' (all jurisdictions)') ||
                   ': every ' || p_months || ' months');
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. PERIODIC CLIENT REVIEWS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS periodic_review (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id       bigint NOT NULL REFERENCES entity(id),
  review_date     date NOT NULL,
  risk_at_review  text,
  -- What was actually looked at. Held as separate flags rather than a single
  -- "reviewed" tick, because a review that did not revisit source of wealth is
  -- not the same as one that did, and the difference is what a regulator asks.
  cdd_refreshed       boolean NOT NULL DEFAULT false,
  source_of_wealth    boolean NOT NULL DEFAULT false,
  sanctions_screened  boolean NOT NULL DEFAULT false,
  pep_screened        boolean NOT NULL DEFAULT false,
  structure_confirmed boolean NOT NULL DEFAULT false,
  activity_consistent boolean NOT NULL DEFAULT false,

  risk_after      text,
  findings        text,
  actions         text,
  reviewed_by     text NOT NULL DEFAULT current_app_user(),
  approved_by     text,
  approved_at     timestamptz,
  status          text NOT NULL DEFAULT 'draft',
  next_due        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT periodic_review_status CHECK (status IN ('draft','completed','approved'))
);
CREATE INDEX IF NOT EXISTS ix_periodic_review_entity
  ON periodic_review(entity_id, review_date DESC);

CREATE OR REPLACE FUNCTION review_start(p_entity bigint, p_review_date date DEFAULT NULL)
RETURNS periodic_review LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r periodic_review; risk text;
BEGIN
  SELECT p.risk_rating INTO risk FROM entity_profile p WHERE p.entity_id = p_entity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;

  -- The risk rating at the time is captured, because a review's scope is
  -- judged against the rating it was done under, not today's.
  INSERT INTO periodic_review(entity_id, review_date, risk_at_review)
  VALUES (p_entity, coalesce(p_review_date, current_date), risk)
  RETURNING * INTO r;

  PERFORM ea_audit(p_entity, 'periodic_review', r.id, 'periodic review started',
                   'risk at review: ' || coalesce(risk, 'not rated'));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION review_complete(
  p_id bigint, p_cdd boolean, p_sow boolean, p_sanctions boolean, p_pep boolean,
  p_structure boolean, p_activity boolean, p_risk_after text,
  p_findings text DEFAULT NULL, p_actions text DEFAULT NULL)
RETURNS periodic_review LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r periodic_review; months integer; loc text;
BEGIN
  SELECT * INTO r FROM periodic_review WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review % not found', p_id; END IF;
  IF r.status = 'approved' THEN
    RAISE EXCEPTION 'That review is approved — start a new one rather than changing it';
  END IF;
  IF coalesce(trim(p_risk_after),'') = '' THEN
    RAISE EXCEPTION 'Record the risk rating after the review, even if it is unchanged — the conclusion is the point of the review';
  END IF;

  -- A review that did not screen for sanctions or PEP status is not a review.
  -- Refused rather than recorded as partial, because a partial review on file
  -- reads as a completed one.
  IF NOT p_sanctions OR NOT p_pep THEN
    RAISE EXCEPTION 'Sanctions and PEP screening are both required before a review can be completed. If either could not be done, leave the review in draft and record why in the findings.';
  END IF;
  IF NOT p_cdd AND NOT p_sow THEN
    RAISE EXCEPTION 'A review that refreshed neither the CDD nor the source of wealth has not reviewed anything — record what was actually done';
  END IF;

  -- The next due date comes from the interval Compliance recorded for the
  -- rating AFTER the review, not before: a client moved to high risk is due
  -- again sooner.
  SELECT e.location_code INTO loc FROM entity e WHERE e.id = r.entity_id;
  SELECT f.months INTO months FROM review_frequency f
   WHERE f.risk_rating = trim(p_risk_after)
     AND (f.location_code = loc OR f.location_code IS NULL)
   ORDER BY (f.location_code IS NOT NULL) DESC LIMIT 1;

  UPDATE periodic_review SET
    cdd_refreshed = p_cdd, source_of_wealth = p_sow,
    sanctions_screened = p_sanctions, pep_screened = p_pep,
    structure_confirmed = p_structure, activity_consistent = p_activity,
    risk_after = trim(p_risk_after), findings = p_findings, actions = p_actions,
    status = 'completed',
    next_due = CASE WHEN months IS NULL THEN NULL
                    ELSE coalesce(r.review_date, current_date) + (months || ' months')::interval END
   WHERE id = p_id RETURNING * INTO r;

  -- The risk rating on the entity follows the review's conclusion, so the two
  -- cannot disagree.
  UPDATE entity_profile SET risk_rating = trim(p_risk_after), next_review_date = r.next_due
   WHERE entity_id = r.entity_id;

  PERFORM ea_audit(r.entity_id, 'periodic_review', p_id, 'periodic review completed',
                   'risk ' || coalesce(r.risk_at_review,'—') || ' → ' || trim(p_risk_after) ||
                   coalesce('; next due ' || r.next_due, '; NO INTERVAL RECORDED for ' || trim(p_risk_after)));
  RETURN r;
END $$;

-- Approval is separate and refused to the reviewer: a review checked by the
-- person who did it is not independent.
CREATE OR REPLACE FUNCTION review_approve(p_id bigint)
RETURNS periodic_review LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r periodic_review;
BEGIN
  SELECT * INTO r FROM periodic_review WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review % not found', p_id; END IF;
  IF r.status <> 'completed' THEN
    RAISE EXCEPTION 'A review must be completed before approval — this one is %', r.status;
  END IF;
  IF lower(coalesce(r.reviewed_by,'')) = lower(current_app_user()) THEN
    RAISE EXCEPTION 'You carried out this review — it must be approved by someone else';
  END IF;

  UPDATE periodic_review SET status = 'approved', approved_by = current_app_user(),
         approved_at = now()
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'periodic_review', p_id, 'PERIODIC REVIEW APPROVED',
                   'approved by ' || current_app_user());
  RETURN r;
END $$;

-- What the compliance screen reads. Every client appears, whether reviewed or
-- not — a client that has never been reviewed is the one that matters, and it
-- would be invisible in a list of reviews.
CREATE OR REPLACE FUNCTION comp_reviews(p_location text DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, company_code text,
              jurisdiction text, risk_rating text,
              last_review date, last_status text, reviewed_by text,
              approved_by text, next_due date, days_overdue integer,
              never_reviewed boolean, overdue boolean, no_interval_set boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, e.company_code, p.jurisdiction, p.risk_rating,
         r.review_date, r.status, r.reviewed_by, r.approved_by, r.next_due,
         CASE WHEN r.next_due IS NULL THEN NULL
              ELSE (current_date - r.next_due)::int END,
         (r.id IS NULL),
         (r.next_due IS NOT NULL AND r.next_due < current_date),
         -- No interval recorded for this rating means no due date can be
         -- calculated, which is a gap in the compliance setup rather than in
         -- the client's file.
         NOT EXISTS (SELECT 1 FROM review_frequency f
                      WHERE f.risk_rating = p.risk_rating
                        AND (f.location_code = e.location_code OR f.location_code IS NULL))
    FROM entity e
    JOIN entity_profile p ON p.entity_id = e.id
    LEFT JOIN LATERAL (
      SELECT pr.* FROM periodic_review pr
       WHERE pr.entity_id = e.id ORDER BY pr.review_date DESC LIMIT 1) r ON true
   WHERE e.entity_class = 'client'
     AND (p_location IS NULL OR p.jurisdiction = p_location)
   ORDER BY (r.id IS NULL) DESC,
            (r.next_due IS NOT NULL AND r.next_due < current_date) DESC,
            r.next_due NULLS LAST, e.name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. CRM PIPELINE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_prospect (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name     text,
  last_name      text,
  company        text NOT NULL,
  entity_type    text,
  jurisdiction   text,
  office         text,
  source         text,
  stage          text NOT NULL DEFAULT 'Enquiry',
  bd_owner       text,
  annual_fee     numeric(14,2),
  setup_fee      numeric(14,2),
  admin_fee      numeric(14,2),
  fee_ccy        char(3) DEFAULT 'GBP',
  target_date    date,
  risk_rating    text,
  website        text,
  address        text,
  notes          text,
  -- When a prospect converts it becomes an onboarding case, and the link is
  -- kept so the pipeline and the onboarding file are one story.
  onboarding_case_id bigint REFERENCES onboarding_case(id),
  lost_reason    text,
  is_open        boolean NOT NULL DEFAULT true,
  created_by     text NOT NULL DEFAULT current_app_user(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_crm_prospect_stage ON crm_prospect(stage) WHERE is_open;

CREATE TABLE IF NOT EXISTS crm_interaction (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prospect_id  bigint NOT NULL REFERENCES crm_prospect(id) ON DELETE CASCADE,
  interaction_date date NOT NULL,
  interaction_type text NOT NULL,
  by_whom      text NOT NULL DEFAULT current_app_user(),
  note         text,
  next_action  text,
  next_action_due date,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_crm_interaction ON crm_interaction(prospect_id, interaction_date DESC);

-- The stages Andy confirmed, in order, so a stage change can be checked
-- against them rather than accepting any string.
CREATE TABLE IF NOT EXISTS crm_stage (
  name       text PRIMARY KEY,
  sort_order integer NOT NULL,
  is_won     boolean NOT NULL DEFAULT false,
  is_lost    boolean NOT NULL DEFAULT false
);
INSERT INTO crm_stage(name, sort_order, is_won, is_lost) VALUES
 ('Enquiry',        10, false, false),
 ('Proposal Sent',  20, false, false),
 ('KYC Arriving',   30, false, false),
 ('Fees Paid',      40, true,  false),
 ('Lost',           90, false, true)
ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order,
                                 is_won = EXCLUDED.is_won, is_lost = EXCLUDED.is_lost;

CREATE OR REPLACE FUNCTION crm_prospect_add(p JSONB)
RETURNS crm_prospect LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r crm_prospect; st text;
BEGIN
  IF coalesce(trim(p->>'company'),'') = '' THEN
    RAISE EXCEPTION 'Give the prospect a company or structure name';
  END IF;
  st := coalesce(nullif(trim(p->>'stage'),''), 'Enquiry');
  IF NOT EXISTS (SELECT 1 FROM crm_stage WHERE name = st) THEN
    RAISE EXCEPTION 'Unknown stage "%". Valid stages: %', st,
      (SELECT string_agg(s.name, ' → ' ORDER BY s.sort_order) FROM crm_stage s);
  END IF;

  INSERT INTO crm_prospect(first_name, last_name, company, entity_type, jurisdiction,
                           office, source, stage, bd_owner, annual_fee, setup_fee,
                           admin_fee, fee_ccy, target_date, risk_rating, website,
                           address, notes)
  VALUES (p->>'first_name', p->>'last_name', trim(p->>'company'), p->>'entity_type',
          p->>'jurisdiction', p->>'office', p->>'source', st, p->>'bd_owner',
          (p->>'annual_fee')::numeric, (p->>'setup_fee')::numeric,
          (p->>'admin_fee')::numeric, coalesce(p->>'fee_ccy','GBP'),
          (p->>'target_date')::date, p->>'risk_rating', p->>'website',
          p->>'address', p->>'notes')
  RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'crm_prospect', r.id, 'prospect added',
                   trim(p->>'company') || ' at ' || st);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION crm_stage_set(p_id bigint, p_stage text, p_lost_reason text DEFAULT NULL)
RETURNS crm_prospect LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r crm_prospect; s crm_stage; was text;
BEGIN
  SELECT * INTO r FROM crm_prospect WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prospect % not found', p_id; END IF;
  SELECT * INTO s FROM crm_stage WHERE name = trim(p_stage);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown stage "%". Valid stages: %', p_stage,
      (SELECT string_agg(x.name, ' → ' ORDER BY x.sort_order) FROM crm_stage x);
  END IF;
  -- Marking a prospect lost without saying why loses the only useful part of
  -- a lost prospect.
  IF s.is_lost AND coalesce(trim(p_lost_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason when marking a prospect lost — why we lost it is the useful part';
  END IF;

  was := r.stage;
  UPDATE crm_prospect
     SET stage = s.name,
         lost_reason = coalesce(p_lost_reason, lost_reason),
         is_open = NOT (s.is_lost OR s.is_won)
   WHERE id = p_id RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'crm_prospect', p_id, 'prospect stage changed',
                   r.company || ': ' || was || ' → ' || s.name ||
                   coalesce(' (' || p_lost_reason || ')', ''));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION crm_interaction_add(
  p_prospect bigint, p_date date, p_type text, p_note text,
  p_next_action text DEFAULT NULL, p_next_due date DEFAULT NULL)
RETURNS crm_interaction LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r crm_interaction;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_prospect WHERE id = p_prospect) THEN
    RAISE EXCEPTION 'Prospect % not found', p_prospect;
  END IF;
  IF coalesce(trim(p_type),'') = '' THEN
    RAISE EXCEPTION 'Say what kind of contact this was — call, email, meeting';
  END IF;

  INSERT INTO crm_interaction(prospect_id, interaction_date, interaction_type,
                              note, next_action, next_action_due)
  VALUES (p_prospect, coalesce(p_date, current_date), trim(p_type), p_note,
          p_next_action, p_next_due)
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION crm_prospects(p_open_only boolean DEFAULT true)
RETURNS TABLE(id bigint, contact text, company text, entity_type text,
              jurisdiction text, office text, source text, stage text,
              stage_order integer, bd_owner text, annual_fee numeric,
              setup_fee numeric, admin_fee numeric, fee_ccy char(3),
              total_first_year numeric, target_date date, risk_rating text,
              website text, notes text, interactions bigint,
              last_contact date, next_action text, next_action_due date,
              days_since_contact integer, stale boolean, is_open boolean,
              converted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id,
         nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
         p.company, p.entity_type, p.jurisdiction, p.office, p.source,
         p.stage, s.sort_order, p.bd_owner,
         p.annual_fee, p.setup_fee, p.admin_fee, p.fee_ccy,
         -- First-year value is what a pipeline is judged on, and it is the sum
         -- rather than the annual fee alone.
         round(coalesce(p.annual_fee,0) + coalesce(p.setup_fee,0)
               + coalesce(p.admin_fee,0) * 12, 2),
         p.target_date, p.risk_rating, p.website, p.notes,
         (SELECT count(*) FROM crm_interaction i WHERE i.prospect_id = p.id),
         (SELECT max(i.interaction_date) FROM crm_interaction i WHERE i.prospect_id = p.id),
         (SELECT i.next_action FROM crm_interaction i WHERE i.prospect_id = p.id
           ORDER BY i.interaction_date DESC LIMIT 1),
         (SELECT i.next_action_due FROM crm_interaction i WHERE i.prospect_id = p.id
           ORDER BY i.interaction_date DESC LIMIT 1),
         (current_date - (SELECT max(i.interaction_date) FROM crm_interaction i
                           WHERE i.prospect_id = p.id))::int,
         -- An open prospect not contacted for a month is going cold, which is
         -- the thing a pipeline review is for.
         (p.is_open AND coalesce(
            (current_date - (SELECT max(i.interaction_date) FROM crm_interaction i
                              WHERE i.prospect_id = p.id)), 999) > 30),
         p.is_open,
         (p.onboarding_case_id IS NOT NULL)
    FROM crm_prospect p
    LEFT JOIN crm_stage s ON s.name = p.stage
   WHERE NOT p_open_only OR p.is_open
   ORDER BY s.sort_order DESC, p.company;
$$;

CREATE OR REPLACE FUNCTION crm_interactions(p_prospect bigint DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS TABLE(id bigint, prospect_id bigint, company text, interaction_date date,
              interaction_type text, by_whom text, note text,
              next_action text, next_action_due date, action_overdue boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT i.id, i.prospect_id, p.company, i.interaction_date, i.interaction_type,
         i.by_whom, i.note, i.next_action, i.next_action_due,
         (i.next_action_due IS NOT NULL AND i.next_action_due < current_date)
    FROM crm_interaction i
    LEFT JOIN crm_prospect p ON p.id = i.prospect_id
   WHERE p_prospect IS NULL OR i.prospect_id = p_prospect
   ORDER BY i.interaction_date DESC, i.id DESC
   LIMIT coalesce(p_limit, 200);
$$;

-- Converting a won prospect into an onboarding case, so the pipeline and the
-- onboarding file are the same story rather than two records of one client.
CREATE OR REPLACE FUNCTION crm_prospect_convert(p_id bigint)
RETURNS TABLE(prospect text, case_id bigint, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE p crm_prospect; cid bigint;
BEGIN
  SELECT * INTO p FROM crm_prospect WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prospect % not found', p_id; END IF;
  IF p.onboarding_case_id IS NOT NULL THEN
    RAISE EXCEPTION 'That prospect has already been converted, to case %', p.onboarding_case_id;
  END IF;

  -- onb_case_add returns the onboarding_case ROW, not an id, so the id is
  -- taken from it rather than assigned directly. Assigning the record to a
  -- bigint failed at runtime.
  SELECT c.id INTO cid FROM onb_case_add(
    coalesce(nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),''), p.company),
    p.company, p.office, p.jurisdiction, p.entity_type, p.source) c;

  UPDATE crm_prospect SET onboarding_case_id = cid, is_open = false WHERE id = p_id;
  PERFORM ea_audit(NULL, 'crm_prospect', p_id, 'prospect converted to onboarding',
                   p.company || ' → onboarding case ' || cid);
  RETURN QUERY SELECT p.company, cid,
    'Onboarding case created. CDD still has to be recorded and verified before it can go live.';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. ATTRITION
-- ─────────────────────────────────────────────────────────────────────
-- Sign-off is Manager, then MD, then Group CEO **or** Group COO.
--
-- The last stage has an ALTERNATE, and that is modelled rather than glossed:
-- a rule requiring one named person stalls whenever they are away, and the
-- realistic result is that someone works around it.
CREATE TABLE IF NOT EXISTS attrition_stage (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  sort_order integer NOT NULL,
  roles      text[] NOT NULL     -- any one of these satisfies the stage
);
INSERT INTO attrition_stage(code, name, sort_order, roles) VALUES
 ('MANAGER',  'Manager approval',   10, ARRAY['Manager']),
 ('MD',       'MD approval',        20, ARRAY['MD','Managing Director']),
 ('GROUP',    'Group CEO or COO',   30, ARRAY['Group CEO','CEO','Group COO','COO'])
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name,
                                 sort_order = EXCLUDED.sort_order,
                                 roles = EXCLUDED.roles;

CREATE TABLE IF NOT EXISTS attrition_case (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id     bigint NOT NULL REFERENCES entity(id),
  reason        text NOT NULL,      -- Liquidation, Transfer out, Resignation, Non-payment
  detail        text,
  administrator text,
  started       date NOT NULL DEFAULT current_date,
  target_date   date,
  status        text NOT NULL DEFAULT 'open',
  closed_date   date,
  outstanding_fees numeric(14,2),
  successor     text,               -- who is taking the client on, if a transfer
  created_by    text NOT NULL DEFAULT current_app_user(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attrition_status CHECK (status IN ('open','approved','completed','abandoned'))
);

CREATE TABLE IF NOT EXISTS attrition_approval (
  case_id     bigint NOT NULL REFERENCES attrition_case(id) ON DELETE CASCADE,
  stage_code  text NOT NULL REFERENCES attrition_stage(code),
  approved_by text NOT NULL,
  role_used   text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  note        text,
  PRIMARY KEY (case_id, stage_code)
);

CREATE OR REPLACE FUNCTION attrition_open(
  p_entity bigint, p_reason text, p_detail text DEFAULT NULL,
  p_administrator text DEFAULT NULL, p_successor text DEFAULT NULL,
  p_target_date date DEFAULT NULL)
RETURNS attrition_case LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r attrition_case; nm text; unbilled numeric;
BEGIN
  SELECT e.name INTO nm FROM entity e WHERE e.id = p_entity;
  IF nm IS NULL THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Record why the client is leaving — it is the whole point of the file';
  END IF;
  IF EXISTS (SELECT 1 FROM attrition_case a
              WHERE a.entity_id = p_entity AND a.status IN ('open','approved')) THEN
    RAISE EXCEPTION 'There is already an open attrition case for %', nm;
  END IF;

  -- Unbilled time is captured at the outset rather than discovered at the
  -- end, because a departing client is the hardest one to bill afterwards.
  SELECT round(coalesce(sum(t.value),0),2) INTO unbilled
    FROM timesheet_entry t
   WHERE t.entity_label = nm AND t.billable AND coalesce(t.status,'') <> 'Billed';

  INSERT INTO attrition_case(entity_id, reason, detail, administrator, successor,
                             target_date, outstanding_fees)
  VALUES (p_entity, trim(p_reason), p_detail, p_administrator, p_successor,
          p_target_date, unbilled)
  RETURNING * INTO r;

  PERFORM ea_audit(p_entity, 'attrition_case', r.id, 'ATTRITION CASE OPENED',
                   nm || ' — ' || trim(p_reason) ||
                   CASE WHEN unbilled > 0 THEN '; ' || unbilled || ' unbilled at opening'
                        ELSE '' END);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION attrition_approve(
  p_case bigint, p_stage text, p_role text, p_note text DEFAULT NULL)
RETURNS TABLE(stage text, approved_by text, stages_done bigint,
              stages_total bigint, fully_approved boolean, next_stage text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE c attrition_case; s attrition_stage; done bigint; total bigint; nxt text;
BEGIN
  SELECT * INTO c FROM attrition_case WHERE id = p_case;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attrition case % not found', p_case; END IF;
  IF c.status NOT IN ('open') THEN
    RAISE EXCEPTION 'That case is % and no longer needs approving', c.status;
  END IF;
  SELECT * INTO s FROM attrition_stage WHERE code = upper(trim(p_stage));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown stage "%". The sequence is: %', p_stage,
      (SELECT string_agg(x.name, ' → ' ORDER BY x.sort_order) FROM attrition_stage x);
  END IF;

  -- The role has to be one the stage accepts. For the final stage either Group
  -- CEO or Group COO satisfies it, which is why roles is an array.
  IF NOT (trim(p_role) = ANY(s.roles)) THEN
    RAISE EXCEPTION '"%" cannot sign off %. That stage accepts: %',
      p_role, s.name, array_to_string(s.roles, ' or ');
  END IF;

  -- In sequence. A CEO sign-off before the manager has looked at it defeats
  -- the point of having stages.
  IF EXISTS (SELECT 1 FROM attrition_stage e
              WHERE e.sort_order < s.sort_order
                AND NOT EXISTS (SELECT 1 FROM attrition_approval a
                                 WHERE a.case_id = p_case AND a.stage_code = e.code)) THEN
    RAISE EXCEPTION 'Earlier stages are outstanding: %. Approvals run in sequence.',
      (SELECT string_agg(e.name, ', ' ORDER BY e.sort_order) FROM attrition_stage e
        WHERE e.sort_order < s.sort_order
          AND NOT EXISTS (SELECT 1 FROM attrition_approval a
                           WHERE a.case_id = p_case AND a.stage_code = e.code));
  END IF;

  -- One person cannot satisfy two stages.
  IF EXISTS (SELECT 1 FROM attrition_approval a
              WHERE a.case_id = p_case
                AND lower(a.approved_by) = lower(current_app_user())) THEN
    RAISE EXCEPTION 'You have already approved an earlier stage of this case — each stage needs a different person';
  END IF;

  INSERT INTO attrition_approval(case_id, stage_code, approved_by, role_used, note)
  VALUES (p_case, s.code, current_app_user(), trim(p_role), p_note)
  ON CONFLICT (case_id, stage_code) DO UPDATE SET
    approved_by = current_app_user(), role_used = trim(p_role),
    approved_at = now(), note = p_note;

  SELECT count(*) INTO done FROM attrition_approval WHERE case_id = p_case;
  SELECT count(*) INTO total FROM attrition_stage;
  SELECT e.name INTO nxt FROM attrition_stage e
   WHERE NOT EXISTS (SELECT 1 FROM attrition_approval a
                      WHERE a.case_id = p_case AND a.stage_code = e.code)
   ORDER BY e.sort_order LIMIT 1;

  IF done >= total THEN
    UPDATE attrition_case SET status = 'approved' WHERE id = p_case;
  END IF;

  PERFORM ea_audit(c.entity_id, 'attrition_case', p_case,
                   CASE WHEN done >= total THEN 'ATTRITION FULLY APPROVED'
                        ELSE 'attrition stage approved' END,
                   s.name || ' by ' || current_app_user() || ' as ' || trim(p_role) ||
                   ' (' || done || ' of ' || total || ')');

  RETURN QUERY SELECT s.name, current_app_user(), done, total, (done >= total),
                      coalesce(nxt, 'none — fully approved');
END $$;

CREATE OR REPLACE FUNCTION attrition_cases(p_open_only boolean DEFAULT false)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, company_code text,
              reason text, detail text, administrator text, successor text,
              started date, target_date date, status text,
              outstanding_fees numeric, unbilled_now numeric,
              stages_done bigint, stages_total bigint, next_stage text,
              approvals text, fully_approved boolean, days_open integer,
              blocked_by_fees boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id, a.entity_id, e.name, e.company_code, a.reason, a.detail,
         a.administrator, a.successor, a.started, a.target_date, a.status,
         a.outstanding_fees,
         -- Unbilled now as well as at opening: it can grow while the case runs,
         -- and the difference is work done after the client gave notice.
         round(coalesce((SELECT sum(t.value) FROM timesheet_entry t
                          WHERE t.entity_label = e.name AND t.billable
                            AND coalesce(t.status,'') <> 'Billed'), 0), 2),
         (SELECT count(*) FROM attrition_approval ap WHERE ap.case_id = a.id),
         (SELECT count(*) FROM attrition_stage),
         (SELECT st.name FROM attrition_stage st
           WHERE NOT EXISTS (SELECT 1 FROM attrition_approval ap
                              WHERE ap.case_id = a.id AND ap.stage_code = st.code)
           ORDER BY st.sort_order LIMIT 1),
         (SELECT string_agg(st.name || ': ' || ap.approved_by || ' (' || ap.role_used || ')',
                            '; ' ORDER BY st.sort_order)
            FROM attrition_approval ap JOIN attrition_stage st ON st.code = ap.stage_code
           WHERE ap.case_id = a.id),
         ((SELECT count(*) FROM attrition_approval ap WHERE ap.case_id = a.id)
          >= (SELECT count(*) FROM attrition_stage)),
         (current_date - a.started)::int,
         -- Letting a client go with unbilled time on the clock writes it off.
         (coalesce((SELECT sum(t.value) FROM timesheet_entry t
                     WHERE t.entity_label = e.name AND t.billable
                       AND coalesce(t.status,'') <> 'Billed'), 0) > 0)
    FROM attrition_case a
    LEFT JOIN entity e ON e.id = a.entity_id
   WHERE NOT p_open_only OR a.status = 'open'
   ORDER BY a.started DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- GRANTS
-- ─────────────────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'review_%' OR p.proname LIKE 'crm_%'
            OR p.proname LIKE 'attrition_%' OR p.proname = 'comp_reviews')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON review_frequency, periodic_review, crm_prospect, crm_interaction,
              crm_stage, attrition_stage, attrition_case, attrition_approval
  FROM PUBLIC, anon;
GRANT SELECT ON review_frequency, periodic_review, crm_prospect, crm_interaction,
                crm_stage, attrition_stage, attrition_case, attrition_approval
  TO authenticated;

SELECT 'review intervals recorded' AS item, count(*)::text AS value FROM review_frequency
UNION ALL SELECT 'pipeline stages', count(*)::text FROM crm_stage
UNION ALL SELECT 'attrition stages', count(*)::text FROM attrition_stage
UNION ALL SELECT 'clients needing a review', count(*)::text FROM comp_reviews(NULL);

-- ───────────────────────────────────────────────────────────────────────
-- 085_deprecate_bare_threshold_setter.sql
-- ───────────────────────────────────────────────────────────────────────
-- 085 — deprecate the bare approval threshold setter
--
-- FOUND BY THE REACHABILITY AUDIT. Two functions with identical signatures
-- both write to journal_approval_rule:
--
--   approval_threshold_set   3,766 characters. Validates, refuses a negative
--                            or null threshold, looks up the entity name, and
--                            writes an audit event recording that a control
--                            was loosened.
--
--   set_approval_threshold     182 characters. Writes straight to the table.
--
-- The guarded one is what the screen calls. The bare one bypasses every check,
-- including the audit entry that makes raising a threshold visible — and
-- raising a threshold means fewer journals get a second pair of eyes, which is
-- precisely the change that should leave a trace.
--
-- It is not dropped, because something outside this repository may call it and
-- a hard failure would be worse than a soft one. Instead it now delegates to
-- the guarded version, so both paths get the same checks and the same audit
-- entry. Callers keep working; the gap closes.

CREATE OR REPLACE FUNCTION set_approval_threshold(p_entity bigint,
                                                  p_threshold numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delegates rather than duplicating. The guarded version refuses a negative
  -- or null threshold and records the change in the audit trail; this wrapper
  -- exists only so that anything still calling the old name gets those checks
  -- instead of writing straight to the table.
  PERFORM approval_threshold_set(p_entity, p_threshold);
END;
$$;

COMMENT ON FUNCTION set_approval_threshold(bigint, numeric) IS
  'DEPRECATED. Delegates to approval_threshold_set, which validates the '
  'threshold and records the change in the audit trail. Kept only so existing '
  'callers do not bypass those checks. Use approval_threshold_set directly.';

-- ───────────────────────────────────────────────────────────────────────
-- 086_statutory_submissions.sql
-- ───────────────────────────────────────────────────────────────────────
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
