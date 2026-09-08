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
