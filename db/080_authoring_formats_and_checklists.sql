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
