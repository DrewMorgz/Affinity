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
