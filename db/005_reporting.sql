-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  REPORTING  (005)
-- Read-only views. Trial balance, P&L, balance sheet per entity, all built
-- on ONE base view so the reversed-journal rule is defined exactly once.
-- Drill-down from any figure = a filtered query on v_posting.
-- =====================================================================


-- ---------------------------------------------------------------------
-- v_posting — THE canonical base. Every live posting line, enriched.
-- The reversed-journal-safe filter (status <> 'draft') lives here and
-- nowhere else: a reversed journal's lines remain in the books, its
-- reversal cancels them, and drafts never count.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_posting AS
SELECT j.entity_id, e.company_code, e.name AS entity_name,
       j.id   AS journal_id, j.journal_date, j.period, j.source, j.status AS journal_status,
       jl.id  AS line_id, jl.line_no,
       a.id   AS account_id, a.code AS account_code, a.name AS account_name,
       a.account_type, a.normal_balance,
       jl.txn_ccy, jl.txn_amount, jl.func_amount, jl.location_code, jl.memo
FROM journal_line jl
JOIN journal j ON j.id = jl.journal_id
JOIN entity  e ON e.id = j.entity_id
JOIN account a ON a.id = jl.account_id
WHERE j.status <> 'draft';


-- ---------------------------------------------------------------------
-- v_account_balance — signed balance per entity + account (+Dr / -Cr).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_account_balance AS
SELECT entity_id, company_code, entity_name,
       account_id, account_code, account_name, account_type, normal_balance,
       SUM(func_amount) AS balance_func
FROM v_posting
GROUP BY entity_id, company_code, entity_name,
         account_id, account_code, account_name, account_type, normal_balance;


-- ---------------------------------------------------------------------
-- v_trial_balance — classic debit/credit columns. Sums equal per entity.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT entity_id, company_code, entity_name, account_code, account_name, account_type,
       CASE WHEN balance_func > 0 THEN  balance_func ELSE 0 END AS debit,
       CASE WHEN balance_func < 0 THEN -balance_func ELSE 0 END AS credit
FROM v_account_balance
WHERE balance_func <> 0;


-- ---------------------------------------------------------------------
-- v_pl — profit & loss lines (revenue & expenses shown as positive).
-- v_pl_summary — revenue / expenses / net profit per entity.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pl AS
SELECT entity_id, company_code, entity_name, account_code, account_name,
       CASE account_type WHEN 'income' THEN 'Revenue' ELSE 'Expenses' END AS section,
       CASE account_type WHEN 'income' THEN -balance_func ELSE balance_func END AS amount
FROM v_account_balance
WHERE account_type IN ('income','expense') AND balance_func <> 0;

CREATE OR REPLACE VIEW v_pl_summary AS
SELECT entity_id, company_code, entity_name,
       SUM(CASE WHEN account_type='income'  THEN -balance_func ELSE 0 END) AS revenue,
       SUM(CASE WHEN account_type='expense' THEN  balance_func ELSE 0 END) AS expenses,
       SUM(CASE WHEN account_type='income'  THEN -balance_func ELSE 0 END)
       - SUM(CASE WHEN account_type='expense' THEN balance_func ELSE 0 END) AS net_profit
FROM v_account_balance
WHERE account_type IN ('income','expense')
GROUP BY entity_id, company_code, entity_name;


-- ---------------------------------------------------------------------
-- v_balance_sheet — assets / liabilities / equity (shown as positives),
-- plus the current-period result injected into equity so it balances:
--   Assets = Liabilities + Equity (incl. profit/(loss) for the period)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_balance_sheet AS
SELECT entity_id, company_code, entity_name, account_code, account_name,
       CASE account_type WHEN 'asset' THEN 'Assets'
                         WHEN 'liability' THEN 'Liabilities'
                         ELSE 'Equity' END AS section,
       CASE account_type WHEN 'asset' THEN balance_func ELSE -balance_func END AS amount
FROM v_account_balance
WHERE account_type IN ('asset','liability','equity') AND balance_func <> 0
UNION ALL
SELECT entity_id, company_code, entity_name,
       '——' AS account_code, 'Profit/(loss) for the period' AS account_name,
       'Equity' AS section, net_profit AS amount
FROM v_pl_summary
WHERE net_profit <> 0;


-- ---------------------------------------------------------------------
-- DRILL-DOWN
-- Any figure traces back to its journal lines, e.g.:
--   SELECT journal_id, journal_date, source, journal_status, func_amount, memo
--   FROM v_posting WHERE entity_id = :e AND account_id = :a ORDER BY journal_id;
-- ---------------------------------------------------------------------
