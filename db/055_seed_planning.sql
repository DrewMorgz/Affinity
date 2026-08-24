-- =====================================================================
-- AFFINITY CORE — PLANNING SEED
--
-- Gives Planning and Consolidation something real to open:
--   1. a planning chart of accounts for Affinity's own P&L
--   2. the group structure (Affinity Group plus the six subsidiaries)
--   3. an FY26 budget for Affinity (Isle of Man) with all 12 periods filled
--   4. local-to-group account mappings, including a deliberate unmapped queue
--
-- ALSO FIXES A REAL DEFECT
-- account.code is NOT unique — the engine seeds 4300, 6000 and 2100 twice
-- across its two chart templates. planning_budget_set and planning_budget_grid
-- in 052 looked accounts up by code alone, so they would have resolved to an
-- arbitrary row. Both are redefined here to scope to the planning template.
--
-- Run AFTER 054. Safe to re-run.
-- =====================================================================

-- 1) Planning chart of accounts --------------------------------------
INSERT INTO coa_template(code, name)
SELECT 'AFG_PLAN', 'Affinity planning CoA'
WHERE NOT EXISTS (SELECT 1 FROM coa_template WHERE code = 'AFG_PLAN');

DO $seed$
DECLARE tpl smallint;
BEGIN
  SELECT id INTO tpl FROM coa_template WHERE code = 'AFG_PLAN';

  INSERT INTO account(coa_template_id, code, name, account_type, normal_balance)
  SELECT tpl, v.code, v.name, v.atype, v.nb
    FROM (VALUES
      ('4000','Company administration fees','income','C'),
      ('4010','Trustee fees','income','C'),
      ('4020','Directorship fees','income','C'),
      ('4030','Registered office fees','income','C'),
      ('4040','Time-based / ad hoc','income','C'),
      ('4090','Disbursements recovered','income','C'),
      ('5000','Government & registry fees','expense','D'),
      ('5010','Sub-contracted services','expense','D'),
      ('6000','Salaries','expense','D'),
      ('6010','Employer NI / social','expense','D'),
      ('6020','Pension contributions','expense','D'),
      ('6030','Recruitment & training','expense','D'),
      ('7000','Premises & rates','expense','D'),
      ('7010','IT & software','expense','D'),
      ('7020','Professional indemnity','expense','D'),
      ('7030','Regulatory & licence fees','expense','D'),
      ('7040','Travel & entertaining','expense','D'),
      ('7050','Depreciation','expense','D')
    ) AS v(code,name,atype,nb)
   WHERE NOT EXISTS (
     SELECT 1 FROM account a WHERE a.coa_template_id = tpl AND a.code = v.code);
END $seed$;

-- 2) Group structure --------------------------------------------------
INSERT INTO consol_group(name, reporting_ccy)
SELECT 'Affinity Group', 'GBP'
WHERE NOT EXISTS (SELECT 1 FROM consol_group WHERE name = 'Affinity Group');

DO $grp$
DECLARE g bigint; parent bigint;
BEGIN
  SELECT id INTO g FROM consol_group WHERE name = 'Affinity Group';
  SELECT id INTO parent FROM entity WHERE company_code = 'AFG-000';
  IF g IS NULL OR parent IS NULL THEN
    RAISE NOTICE 'Skipping group seed: run 054 first so the Affinity entities exist.';
    RETURN;
  END IF;

  INSERT INTO consol_group_member(group_id, entity_id, ownership_pct, parent_entity_id)
  SELECT g, e.id,
         CASE WHEN e.company_code = 'AFG-SD' THEN 80 ELSE 100 END,   -- 20% NCI in South Dakota
         CASE WHEN e.company_code = 'AFG-000' THEN NULL ELSE parent END
    FROM entity e
   WHERE e.entity_class = 'group'
     AND NOT EXISTS (SELECT 1 FROM consol_group_member m
                      WHERE m.group_id = g AND m.entity_id = e.id);
END $grp$;

-- 3) FY26 budget for Affinity (Isle of Man) ---------------------------
DO $bud$
DECLARE
  ent bigint; tpl smallint; b bigint; a record; m int;
  base numeric; amt numeric;
BEGIN
  SELECT id INTO ent FROM entity WHERE company_code = 'AFG-IOM';
  SELECT id INTO tpl FROM coa_template WHERE code = 'AFG_PLAN';
  IF ent IS NULL THEN
    RAISE NOTICE 'Skipping budget seed: AFG-IOM not found. Run 054 first.';
    RETURN;
  END IF;

  SELECT id INTO b FROM budget
   WHERE entity_id = ent AND fiscal_year = 2026 AND name = 'FY26 Budget';

  IF b IS NULL THEN
    INSERT INTO budget(entity_id, name, fiscal_year, ccy, status, created_by, scenario, version)
    VALUES (ent, 'FY26 Budget', 2026, 'GBP', 'draft', 'seed', 'base', 1)
    RETURNING id INTO b;
  END IF;

  -- Twelve periods per account, with a mild upward drift so the numbers look
  -- like a plan rather than a flat line.
  FOR a IN SELECT id, code, account_type FROM account WHERE coa_template_id = tpl ORDER BY code LOOP
    base := CASE a.code
      WHEN '4000' THEN 42000 WHEN '4010' THEN 18500 WHEN '4020' THEN 12500
      WHEN '4030' THEN  6200 WHEN '4040' THEN 14000 WHEN '4090' THEN  3100
      WHEN '5000' THEN  5400 WHEN '5010' THEN  2600
      WHEN '6000' THEN 41000 WHEN '6010' THEN  4510 WHEN '6020' THEN  2460
      WHEN '6030' THEN  1800 WHEN '7000' THEN  6800 WHEN '7010' THEN  4200
      WHEN '7020' THEN  2900 WHEN '7030' THEN  3400 WHEN '7040' THEN  1700
      WHEN '7050' THEN  1250 ELSE 1000 END;

    FOR m IN 1..12 LOOP
      amt := round(base * (1 + (m - 1) * 0.004), 0);
      UPDATE budget_line SET amount = amt
       WHERE budget_id = b AND account_id = a.id
         AND period = '2026-' || lpad(m::text, 2, '0');
      IF NOT FOUND THEN
        INSERT INTO budget_line(budget_id, account_id, period, amount)
        VALUES (b, a.id, '2026-' || lpad(m::text, 2, '0'), amt);
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'FY26 Budget seeded for AFG-IOM: budget id %', b;
END $bud$;

-- 4) Account mappings, with an unmapped queue to work through ---------
DO $map$
DECLARE cym bigint; mlt bigint;
BEGIN
  SELECT id INTO cym FROM entity WHERE company_code = 'AFG-CYM';
  SELECT id INTO mlt FROM entity WHERE company_code = 'AFG-MLT';
  IF cym IS NULL THEN RETURN; END IF;

  INSERT INTO account_map(entity_id, local_code, local_name, group_code)
  SELECT v.eid, v.lc, v.ln, v.gc FROM (VALUES
    (cym,'41000','Administration fees — corporate','4000'),
    (cym,'41500','Trustee fees — private client','4010'),
    (cym,'41800','Directorship — Cayman','4020'),
    (cym,'49100','FX gains on client balances',NULL),
    (cym,'52300','CIMA annual fees',NULL),
    (cym,'61200','Staff — Cayman payroll','6000'),
    (cym,'61900','Work permit fees',NULL),
    (cym,'72400','Hurricane contingency provision',NULL),
    (cym,'73100','Local D&O insurance','7020'),
    (cym,'78000','Cayman office rent','7000'),
    (mlt,'4100','Servizzi ta'' amministrazzjoni','4000'),
    (mlt,'4700','Foundation administration',NULL),
    (mlt,'6100','Pagi u salarji','6000')
  ) AS v(eid,lc,ln,gc)
  WHERE NOT EXISTS (
    SELECT 1 FROM account_map m WHERE m.entity_id = v.eid AND m.local_code = v.lc);
END $map$;

-- 5) Correct the account lookups from 052 to respect the template -----
CREATE OR REPLACE FUNCTION planning_budget_grid(p_budget bigint)
RETURNS TABLE(account_code text, account_name text, account_type text,
              period char(7), amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.code, a.name, a.account_type, l.period, l.amount
    FROM budget_line l
    JOIN account a ON a.id = l.account_id
   WHERE l.budget_id = p_budget
   ORDER BY a.code, l.period;
$$;

-- account.code is not unique across templates, so resolve within the planning
-- chart specifically rather than taking whichever row comes back first.
CREATE OR REPLACE FUNCTION planning_budget_set(
  p_budget bigint, p_account_code text, p_period char(7), p_amount numeric)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE aid bigint; st text; tpl smallint;
BEGIN
  SELECT COALESCE(status,'draft') INTO st FROM budget WHERE id = p_budget;
  IF st IN ('approved','locked') THEN
    RAISE EXCEPTION 'Budget % is % and cannot be edited', p_budget, st;
  END IF;

  SELECT id INTO tpl FROM coa_template WHERE code = 'AFG_PLAN';
  SELECT id INTO aid FROM account
   WHERE code = p_account_code AND (tpl IS NULL OR coa_template_id = tpl)
   ORDER BY id LIMIT 1;
  IF aid IS NULL THEN
    RAISE EXCEPTION 'Unknown account code % in the planning chart', p_account_code;
  END IF;

  UPDATE budget_line SET amount = p_amount
   WHERE budget_id = p_budget AND account_id = aid AND period = p_period;
  IF NOT FOUND THEN
    INSERT INTO budget_line(budget_id, account_id, period, amount)
    VALUES (p_budget, aid, p_period, p_amount);
  END IF;
END $$;

-- 6) Keep these locked to signed-in users -----------------------------
DO $lock$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname='public'
              AND p.proname IN ('planning_budget_grid','planning_budget_set')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $lock$;
