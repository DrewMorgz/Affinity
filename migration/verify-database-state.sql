-- ═══════════════════════════════════════════════════════════════════════════
-- AFFINITY CORE — WHAT IS ACTUALLY IN THE DATABASE
--
-- Paste into the Supabase SQL editor and Run. It changes nothing — every
-- statement is a SELECT.
--
-- The Supabase sidebar lists SAVED QUERIES, not applied changes, so running a
-- migration never appears there. This asks the database itself.
--
-- Read the "state" column. Anything saying MISSING did not apply.
-- ═══════════════════════════════════════════════════════════════════════════

WITH expected AS (
  SELECT * FROM (VALUES
    -- (what to look for, kind, which file should have created it)
    ('entity',                     'table',    '001-051 base'),
    ('journal',                    'table',    '001-051 base'),
    ('client_money_movement',      'table',    '064-077'),
    ('client_money_reconciliation','table',    '064-077'),
    ('payroll_rate',               'table',    '079'),
    ('allocation_set',             'table',    '079'),
    ('jurisdiction_obligation',    'table',    '080-081'),
    ('obligation_area',            'table',    '080-081'),
    ('review_frequency',           'table',    '084'),
    ('periodic_review',            'table',    '084'),
    ('crm_prospect',               'table',    '084'),
    ('crm_interaction',            'table',    '084'),
    ('attrition_case',             'table',    '084'),
    ('attrition_approval',         'table',    '084'),
    ('statutory_filing',           'table',    '064-077'),

    ('cm_fee_transfer',            'function', '076 — fee from client money'),
    ('demo_data_summary',          'function', '078 — demo data'),
    ('demo_entity_add',            'function', '078 — demo data'),
    ('payroll_rate_set',           'function', '079 — payroll rates'),
    ('allocation_set_agree',       'function', '079 — allocations'),
    ('obligation_add',             'function', '080-081 — obligations'),
    ('obligation_confirm',         'function', '080-081 — obligations'),
    ('ts_entry_approve',           'function', '082 — silent no-op fix'),
    ('silent_noop_candidates',     'function', '082 — standing check'),
    ('trial_balance',              'function', '083 — the 33 missing reads'),
    ('comp_reviews',               'function', '083 — the 33 missing reads'),
    ('ap_aging',                   'function', '083 — the 33 missing reads'),
    ('group_effective_ownership',  'function', '083 — the 33 missing reads'),
    ('review_start',               'function', '084 — periodic reviews'),
    ('review_complete',            'function', '084 — periodic reviews'),
    ('review_frequency_set',       'function', '084 — review intervals'),
    ('crm_prospect_convert',       'function', '084 — CRM'),
    ('attrition_approve',          'function', '084 — attrition'),
    ('approval_threshold_set',     'function', '085 — guarded setter'),
    ('set_approval_threshold',     'function', '085 — delegating wrapper'),
    ('stat_bo_submission',         'function', '086 — BO filing'),
    ('stat_certificate_request',   'function', '086 — certificates'),
    ('stat_dissolution_open',      'function', '086 — dissolutions')
  ) AS t(nm, kind, source)
),
found AS (
  SELECT e.nm, e.kind, e.source,
         CASE
           WHEN e.kind = 'table' THEN EXISTS (
             SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = e.nm)
           ELSE EXISTS (
             SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = e.nm)
         END AS present
    FROM expected e
)
SELECT CASE WHEN present THEN 'ok' ELSE '*** MISSING ***' END AS state,
       kind, nm AS name, source AS "from"
  FROM found
 ORDER BY present, source, nm;
