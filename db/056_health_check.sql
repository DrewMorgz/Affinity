-- =====================================================================
-- AFFINITY CORE — DATABASE HEALTH CHECK
--
-- Read-only. Paste into the Supabase SQL editor any time to confirm the
-- database is intact and locked down. Changes nothing.
--
-- Every row comes back with a PASS or FAIL, so it can be read at a glance
-- rather than interpreted.
-- =====================================================================

WITH checks AS (

  -- ── Structure ──────────────────────────────────────────────────────
  SELECT 1 AS ord, 'Structure' AS area, 'Core tables present' AS check_name,
         (SELECT count(*)::text FROM information_schema.tables
           WHERE table_schema='public') AS value,
         (SELECT count(*) FROM information_schema.tables
           WHERE table_schema='public') >= 120 AS pass

  UNION ALL SELECT 2, 'Structure', 'Entities loaded',
         (SELECT count(*)::text FROM entity),
         (SELECT count(*) FROM entity) > 0

  UNION ALL SELECT 3, 'Structure', 'Affinity group companies flagged internal',
         (SELECT count(*)::text FROM entity WHERE entity_class='group'),
         (SELECT count(*) FROM entity WHERE entity_class='group') = 7

  UNION ALL SELECT 4, 'Structure', 'No entity left without a class',
         (SELECT count(*)::text FROM entity WHERE entity_class IS NULL),
         (SELECT count(*) FROM entity WHERE entity_class IS NULL) = 0

  -- ── Planning ───────────────────────────────────────────────────────
  UNION ALL SELECT 10, 'Planning', 'Planning chart of accounts',
         (SELECT count(*)::text FROM account a JOIN coa_template t ON t.id=a.coa_template_id
           WHERE t.code='AFG_PLAN'),
         (SELECT count(*) FROM account a JOIN coa_template t ON t.id=a.coa_template_id
           WHERE t.code='AFG_PLAN') = 18

  UNION ALL SELECT 11, 'Planning', 'Budget lines seeded (18 accounts x 12 periods)',
         (SELECT count(*)::text FROM budget_line),
         (SELECT count(*) FROM budget_line) >= 216

  UNION ALL SELECT 12, 'Planning', 'Every budget has all twelve periods',
         COALESCE((SELECT string_agg(DISTINCT n::text, ', ') FROM (
            SELECT count(DISTINCT period) AS n FROM budget_line GROUP BY budget_id) x), 'none'),
         NOT EXISTS (SELECT 1 FROM (
            SELECT count(DISTINCT period) AS n FROM budget_line GROUP BY budget_id) y WHERE n <> 12)

  UNION ALL SELECT 13, 'Planning', 'No negative budget lines (use the opposite account)',
         (SELECT count(*)::text FROM budget_line WHERE amount < 0),
         (SELECT count(*) FROM budget_line WHERE amount < 0) = 0

  -- ── Consolidation ──────────────────────────────────────────────────
  UNION ALL SELECT 20, 'Consolidation', 'Group members registered',
         (SELECT count(*)::text FROM consol_group_member),
         (SELECT count(*) FROM consol_group_member) = 7

  UNION ALL SELECT 21, 'Consolidation', 'Ownership never exceeds 100%',
         COALESCE((SELECT max(ownership_pct)::text FROM consol_group_member),'0'),
         COALESCE((SELECT max(ownership_pct) FROM consol_group_member),0) <= 100

  UNION ALL SELECT 22, 'Consolidation', 'Exactly one parent (no parent_entity_id)',
         (SELECT count(*)::text FROM consol_group_member WHERE parent_entity_id IS NULL),
         (SELECT count(*) FROM consol_group_member WHERE parent_entity_id IS NULL) = 1

  UNION ALL SELECT 23, 'Consolidation', 'Unmapped accounts awaiting attention',
         (SELECT count(*)::text FROM account_map WHERE group_code IS NULL),
         true   -- informational: a non-zero count is expected and correct

  -- ── Ledger integrity ───────────────────────────────────────────────
  UNION ALL SELECT 30, 'Ledger', 'Every journal balances (lines sum to zero)',
         COALESCE((SELECT count(*)::text FROM (
            SELECT journal_id FROM journal_line GROUP BY journal_id
             HAVING round(sum(func_amount),2) <> 0) b),'0'),
         NOT EXISTS (SELECT 1 FROM (
            SELECT journal_id FROM journal_line GROUP BY journal_id
             HAVING round(sum(func_amount),2) <> 0) c)

  -- ── Security ───────────────────────────────────────────────────────
  UNION ALL SELECT 40, 'Security', 'Functions reachable with the PUBLIC key (must be 0)',
         (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prokind='f'
             AND has_function_privilege('anon', p.oid, 'EXECUTE')),
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prokind='f'
             AND has_function_privilege('anon', p.oid, 'EXECUTE')) = 0

  UNION ALL SELECT 41, 'Security', 'Tables readable with the PUBLIC key (must be 0)',
         (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r'
             AND has_table_privilege('anon', c.oid, 'SELECT')),
         (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r'
             AND has_table_privilege('anon', c.oid, 'SELECT')) = 0

  UNION ALL SELECT 42, 'Security', 'Functions available to a signed-in user',
         (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prokind='f'
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prokind='f'
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) > 50
)
SELECT area,
       check_name,
       value,
       CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result
  FROM checks
 ORDER BY ord;
