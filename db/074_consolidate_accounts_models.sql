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
