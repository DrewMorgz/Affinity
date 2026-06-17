-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  BUDGET SCENARIOS / APPROVAL / ROLLING  (047)
-- Extends 043: named scenarios & versions, a submit->approve workflow with
-- maker<>checker, a rolling forecast (actuals to date + budget for the rest),
-- and scenario comparison.
-- =====================================================================

ALTER TABLE budget ADD COLUMN IF NOT EXISTS scenario text NOT NULL DEFAULT 'base';
ALTER TABLE budget ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE budget ADD COLUMN IF NOT EXISTS submitted_by text;
ALTER TABLE budget ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE budget ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE OR REPLACE FUNCTION submit_budget(p_budget bigint, p_user text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    UPDATE budget SET status='submitted', submitted_by=p_user WHERE id=p_budget AND status IN ('active','draft');
    RETURN FOUND;
END $$;

-- maker<>checker approval (mirrors the journal approval gate)
CREATE OR REPLACE FUNCTION approve_budget(p_budget bigint, p_approver text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_submitter text;
BEGIN
    SELECT submitted_by INTO v_submitter FROM budget WHERE id=p_budget AND status='submitted';
    IF v_submitter IS NULL THEN RETURN false; END IF;
    IF v_submitter = p_approver THEN
        RAISE EXCEPTION 'Segregation of duties: % cannot approve a budget they submitted', p_approver;
    END IF;
    UPDATE budget SET status='approved', approved_by=p_approver, approved_at=now() WHERE id=p_budget;
    RETURN FOUND;
END $$;

-- rolling forecast / latest estimate: actuals for periods up to p_as_of, budget thereafter
CREATE OR REPLACE FUNCTION build_rolling_forecast(p_budget bigint, p_as_of char(7))
RETURNS TABLE(account_code text, account_name text, period char(7),
              source text, amount numeric)
LANGUAGE sql STABLE AS $$
    WITH b AS (SELECT * FROM budget WHERE id=p_budget),
    actuals AS (
        SELECT jl.account_id, to_char(j.journal_date,'YYYY-MM')::char(7) AS per,
               SUM(CASE WHEN a.account_type='income' THEN -jl.func_amount ELSE jl.func_amount END) AS actual
        FROM journal_line jl
        JOIN journal j ON j.id=jl.journal_id AND j.status='posted' AND j.entity_id=(SELECT entity_id FROM b)
        JOIN account a ON a.id=jl.account_id AND a.account_type IN ('income','expense')
        GROUP BY jl.account_id, to_char(j.journal_date,'YYYY-MM')
    )
    SELECT a.code, a.name, bl.period,
           CASE WHEN bl.period <= p_as_of THEN 'actual' ELSE 'budget' END,
           CASE WHEN bl.period <= p_as_of THEN COALESCE(ac.actual,0) ELSE bl.amount END
    FROM budget_line bl
    JOIN account a ON a.id=bl.account_id
    LEFT JOIN actuals ac ON ac.account_id=bl.account_id AND ac.per=bl.period
    WHERE bl.budget_id=p_budget
    ORDER BY a.code, bl.period;
$$;

-- full-year latest estimate vs original budget, per account
CREATE OR REPLACE FUNCTION rolling_forecast_summary(p_budget bigint, p_as_of char(7))
RETURNS TABLE(account_code text, account_name text,
              original_budget numeric, latest_estimate numeric, variance numeric)
LANGUAGE sql STABLE AS $$
    SELECT f.account_code, f.account_name,
           (SELECT SUM(amount) FROM budget_line bl JOIN account a ON a.id=bl.account_id
             WHERE bl.budget_id=p_budget AND a.code=f.account_code),
           SUM(f.amount),
           SUM(f.amount) - (SELECT SUM(amount) FROM budget_line bl JOIN account a ON a.id=bl.account_id
             WHERE bl.budget_id=p_budget AND a.code=f.account_code)
    FROM build_rolling_forecast(p_budget,p_as_of) f
    GROUP BY f.account_code, f.account_name
    ORDER BY f.account_code;
$$;

-- compare two budget scenarios per account (full year)
CREATE OR REPLACE FUNCTION compare_budget_scenarios(p_budget_a bigint, p_budget_b bigint)
RETURNS TABLE(account_code text, account_name text, scenario_a numeric, scenario_b numeric, difference numeric)
LANGUAGE sql STABLE AS $$
    WITH a AS (SELECT account_id, SUM(amount) amt FROM budget_line WHERE budget_id=p_budget_a GROUP BY account_id),
         b AS (SELECT account_id, SUM(amount) amt FROM budget_line WHERE budget_id=p_budget_b GROUP BY account_id)
    SELECT acc.code, acc.name, COALESCE(a.amt,0), COALESCE(b.amt,0), COALESCE(b.amt,0)-COALESCE(a.amt,0)
    FROM (SELECT account_id FROM a UNION SELECT account_id FROM b) k
    JOIN account acc ON acc.id=k.account_id
    LEFT JOIN a ON a.account_id=k.account_id
    LEFT JOIN b ON b.account_id=k.account_id
    ORDER BY acc.code;
$$;
