-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  ACCOUNTING DIMENSIONS  (031)
-- Department / project / cost-centre analysis on top of the existing
-- dimension engine (dimension_type / dimension_value / journal_line_dimension;
-- post_journal already accepts a per-line 'dimensions' array). Adds the
-- standard management dimensions + reporting (P&L and balances by dimension),
-- which also enables departmental expense allocation and project profitability.
-- =====================================================================

-- register the management dimension types (idempotent)
INSERT INTO dimension_type(code,name)
SELECT v.code, v.name FROM (VALUES
  ('DEPT','Department'), ('PROJECT','Project'), ('COST_CENTRE','Cost centre')
) v(code,name)
WHERE NOT EXISTS (SELECT 1 FROM dimension_type dt WHERE dt.code = v.code);

-- seed starter values per type (idempotent)
INSERT INTO dimension_value(dimension_type_id, code, name)
SELECT dt.id, v.code, v.name
FROM dimension_type dt
JOIN (VALUES
  ('DEPT','ADMIN','Administration'),
  ('DEPT','CLIENT','Client services'),
  ('DEPT','COMPLY','Compliance'),
  ('DEPT','BD','Business development'),
  ('PROJECT','ONBOARD','Client onboarding programme'),
  ('PROJECT','CORE','Affinity Core build'),
  ('COST_CENTRE','OPS','Operations'),
  ('COST_CENTRE','FRONT','Front office')
) v(type_code,code,name) ON v.type_code = dt.code
WHERE NOT EXISTS (
  SELECT 1 FROM dimension_value dv WHERE dv.dimension_type_id = dt.id AND dv.code = v.code
);

-- resolve a dimension value id by type + code (mirrors fund_value)
CREATE OR REPLACE FUNCTION dim_value(p_type_code text, p_value_code text)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT dv.id FROM dimension_value dv
    JOIN dimension_type dt ON dt.id = dv.dimension_type_id AND dt.code = p_type_code
    WHERE dv.code = p_value_code;
$$;

-- P&L by dimension value (movement-based; presentation-normalised positive)
CREATE OR REPLACE VIEW v_dimension_pnl AS
SELECT j.entity_id, dt.code AS dim_type, dv.code AS dim_value, dv.name AS dim_name,
       -SUM(jl.func_amount) FILTER (WHERE a.account_type='income')  AS income,
        SUM(jl.func_amount) FILTER (WHERE a.account_type='expense') AS expense,
       -SUM(jl.func_amount)                                         AS profit
FROM journal_line jl
JOIN journal j ON j.id = jl.journal_id AND j.status <> 'draft'
JOIN account a ON a.id = jl.account_id AND a.account_type IN ('income','expense')
JOIN journal_line_dimension jld ON jld.journal_line_id = jl.id
JOIN dimension_value dv ON dv.id = jld.dimension_value_id
JOIN dimension_type dt ON dt.id = dv.dimension_type_id
GROUP BY j.entity_id, dt.code, dv.code, dv.name;

-- account balances by dimension value (any account type)
CREATE OR REPLACE VIEW v_dimension_balance AS
SELECT j.entity_id, dt.code AS dim_type, dv.code AS dim_value,
       a.account_type, SUM(jl.func_amount) AS balance_func
FROM journal_line jl
JOIN journal j ON j.id = jl.journal_id AND j.status <> 'draft'
JOIN account a ON a.id = jl.account_id
JOIN journal_line_dimension jld ON jld.journal_line_id = jl.id
JOIN dimension_value dv ON dv.id = jld.dimension_value_id
JOIN dimension_type dt ON dt.id = dv.dimension_type_id
GROUP BY j.entity_id, dt.code, dv.code, a.account_type;

-- P&L for one dimension type over a window (e.g. department P&L)
CREATE OR REPLACE FUNCTION report_dimension_pnl(
    p_entity bigint, p_dim_type text, p_start date, p_end date)
RETURNS TABLE(dim_value text, dim_name text, income numeric, expense numeric, profit numeric)
LANGUAGE sql STABLE AS $$
    SELECT dv.code, dv.name,
           -SUM(jl.func_amount) FILTER (WHERE a.account_type='income'),
            SUM(jl.func_amount) FILTER (WHERE a.account_type='expense'),
           -SUM(jl.func_amount)
    FROM journal_line jl
    JOIN journal j ON j.id = jl.journal_id AND j.status <> 'draft'
       AND j.entity_id = p_entity AND j.journal_date BETWEEN p_start AND p_end
    JOIN account a ON a.id = jl.account_id AND a.account_type IN ('income','expense')
    JOIN journal_line_dimension jld ON jld.journal_line_id = jl.id
    JOIN dimension_value dv ON dv.id = jld.dimension_value_id
    JOIN dimension_type dt ON dt.id = dv.dimension_type_id AND dt.code = p_dim_type
    GROUP BY dv.code, dv.name
    ORDER BY dv.code;
$$;
