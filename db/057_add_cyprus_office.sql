-- =====================================================================
-- AFFINITY CORE — ADD THE CYPRUS OFFICE
--
-- Affinity has opened in Cyprus. This adds it as a group company alongside the
-- existing six, so it appears in the entity register, the consolidation group,
-- the permission matrix and reporting rather than only in the payroll rates.
--
-- Run AFTER 055. Safe to re-run.
--
-- ⚠️ TWO THINGS THIS DOES NOT DO, because they need a decision rather than a
-- default:
--   1. The regulator and licence position. A Cyprus CSP may need ASP licensing
--      from CySEC depending on the activities carried on. Left null rather than
--      guessed at — Compliance to confirm and set.
--   2. The statutory filing calendar. Cyprus has its own annual return and
--      audit requirements with different dates from the Isle of Man. Nothing is
--      scheduled until those are entered, so no false reassurance is given.
-- =====================================================================

-- 1) The entity ------------------------------------------------------
INSERT INTO entity (company_code, name, entity_class, client_type, location_code,
                    functional_ccy, accounting_ref_date, is_active)
SELECT 'AFG-CYP', 'Affinity (Cyprus) Limited', 'group', 'COMPANY', 'CYPRUS',
       'EUR', DATE '2026-12-31', true
WHERE NOT EXISTS (SELECT 1 FROM entity WHERE company_code = 'AFG-CYP');

-- 2) Add it to the consolidation group -------------------------------
DO $cyp$
DECLARE g bigint; e bigint; parent bigint;
BEGIN
  SELECT id INTO g      FROM consol_group WHERE name = 'Affinity Group';
  SELECT id INTO e      FROM entity WHERE company_code = 'AFG-CYP';
  SELECT id INTO parent FROM entity WHERE company_code = 'AFG-000';

  IF g IS NULL OR e IS NULL OR parent IS NULL THEN
    RAISE NOTICE 'Skipping: run 054 and 055 first so the group and parent exist.';
    RETURN;
  END IF;

  INSERT INTO consol_group_member (group_id, entity_id, ownership_pct, parent_entity_id)
  SELECT g, e, 100, parent
  WHERE NOT EXISTS (
    SELECT 1 FROM consol_group_member m WHERE m.group_id = g AND m.entity_id = e);

  RAISE NOTICE 'Affinity (Cyprus) Limited added to the Affinity Group consolidation.';
END $cyp$;

-- 3) Its own local chart, mapped to the group chart -------------------
-- Seeded with the accounts a new office needs first, all mapped, so Cyprus does
-- not sit in the unmapped queue from day one.
DO $map$
DECLARE cyp bigint;
BEGIN
  SELECT id INTO cyp FROM entity WHERE company_code = 'AFG-CYP';
  IF cyp IS NULL THEN RETURN; END IF;

  INSERT INTO account_map (entity_id, local_code, local_name, group_code)
  SELECT v.eid, v.lc, v.ln, v.gc FROM (VALUES
    (cyp, '4000', 'Company administration fees',   '4000'),
    (cyp, '4020', 'Director services',             '4020'),
    (cyp, '4030', 'Registered office',             '4030'),
    (cyp, '5000', 'Registrar of Companies fees',   '5000'),
    (cyp, '6000', 'Salaries',                      '6000'),
    (cyp, '6010', 'Social insurance & cohesion',   '6010'),
    (cyp, '7000', 'Nicosia office rent',           '7000'),
    (cyp, '7030', 'Regulatory & licence fees',     '7030')
  ) AS v(eid, lc, ln, gc)
  WHERE NOT EXISTS (
    SELECT 1 FROM account_map m WHERE m.entity_id = v.eid AND m.local_code = v.lc);
END $map$;

-- 4) Confirm -----------------------------------------------------------
SELECT e.company_code,
       e.name,
       e.entity_class,
       e.location_code,
       e.functional_ccy,
       (SELECT count(*) FROM consol_group_member m WHERE m.entity_id = e.id) AS in_group,
       (SELECT count(*) FROM account_map a WHERE a.entity_id = e.id)         AS mappings
  FROM entity e
 WHERE e.entity_class = 'group'
 ORDER BY e.company_code;
