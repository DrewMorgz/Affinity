-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  BUDGETS + BUDGET vs ACTUAL  (043)
-- Budget header/lines (monthly phasing per account) and reporting that
-- compares budget to live ledger actuals, giving variance and variance %.
-- Feeds the front-end Budgeting module.
-- =====================================================================

CREATE TABLE IF NOT EXISTS budget (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id bigint NOT NULL REFERENCES entity(id),
    name text NOT NULL,
    fiscal_year int NOT NULL,
    ccy char(3) NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_by text
);

CREATE TABLE IF NOT EXISTS budget_line (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    budget_id bigint NOT NULL REFERENCES budget(id),
    account_id bigint NOT NULL REFERENCES account(id),
    period char(7) NOT NULL,            -- 'YYYY-MM'
    amount numeric(20,2) NOT NULL,      -- natural P&L sense (positive income / positive expense)
    dimension_value_id bigint REFERENCES dimension_value(id)
);
CREATE INDEX IF NOT EXISTS ix_budget_line_budget ON budget_line(budget_id);

-- monthly budget vs actual for every budgeted account/period
CREATE OR REPLACE FUNCTION report_budget_vs_actual(p_budget bigint)
RETURNS TABLE(account_code text, account_name text, account_type text, period char(7),
              budget numeric, actual numeric, variance numeric, variance_pct numeric)
LANGUAGE sql STABLE AS $$
    WITH b AS (SELECT * FROM budget WHERE id = p_budget),
    actuals AS (
        SELECT jl.account_id, to_char(j.journal_date,'YYYY-MM')::char(7) AS per,
               SUM(CASE WHEN a.account_type='income' THEN -jl.func_amount ELSE jl.func_amount END) AS actual
        FROM journal_line jl
        JOIN journal j ON j.id=jl.journal_id AND j.status='posted' AND j.entity_id=(SELECT entity_id FROM b)
        JOIN account a ON a.id=jl.account_id AND a.account_type IN ('income','expense')
        GROUP BY jl.account_id, to_char(j.journal_date,'YYYY-MM')
    )
    SELECT a.code, a.name, a.account_type, bl.period,
           bl.amount AS budget,
           COALESCE(ac.actual,0) AS actual,
           COALESCE(ac.actual,0) - bl.amount AS variance,
           CASE WHEN bl.amount <> 0 THEN round((COALESCE(ac.actual,0) - bl.amount)/bl.amount*100,1) ELSE NULL END AS variance_pct
    FROM budget_line bl
    JOIN account a ON a.id = bl.account_id
    LEFT JOIN actuals ac ON ac.account_id = bl.account_id AND ac.per = bl.period
    WHERE bl.budget_id = p_budget
    ORDER BY a.code, bl.period;
$$;

-- full-year roll-up per account
CREATE OR REPLACE FUNCTION report_budget_summary(p_budget bigint)
RETURNS TABLE(account_code text, account_name text, account_type text,
              budget numeric, actual numeric, variance numeric, variance_pct numeric)
LANGUAGE sql STABLE AS $$
    SELECT account_code, account_name, account_type,
           SUM(budget), SUM(actual), SUM(variance),
           CASE WHEN SUM(budget)<>0 THEN round(SUM(variance)/SUM(budget)*100,1) ELSE NULL END
    FROM report_budget_vs_actual(p_budget)
    GROUP BY account_code, account_name, account_type
    ORDER BY account_code;
$$;
