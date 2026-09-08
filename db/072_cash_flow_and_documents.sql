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
