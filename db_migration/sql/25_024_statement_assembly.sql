-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  STATEMENT ASSEMBLY  (024)
-- Turn the mapped trial balance into ordered FS lines with prior-year
-- comparatives and computed totals. Amounts are presentation-normalised
-- (natural balances shown positive: assets/expenses by debit side,
-- liabilities/equity/income by credit side). Balance-sheet captions are
-- cumulative to period-end; P&L / income-&-capital captions are the movement
-- in the period. For trust accounts the income vs capital split is applied
-- via the FUND dimension (one expense account feeds both INC and CAP captions).
-- =====================================================================

-- allow one account to feed >1 caption (the trust expense splits income/capital)
ALTER TABLE account_fs_map DROP CONSTRAINT account_fs_map_pkey;
ALTER TABLE account_fs_map ADD PRIMARY KEY (framework_code, account_id, caption_code);

-- captions can be restricted to a FUND (income/capital) for trust statements
ALTER TABLE fs_caption ADD COLUMN fund_filter text CHECK (fund_filter IN ('INC','CAP'));
UPDATE fs_caption SET fund_filter='INC' WHERE framework_code='TRUST' AND code IN ('INC_ARISING','INC_EXPENSE','INC_DISTRIB');
UPDATE fs_caption SET fund_filter='CAP' WHERE framework_code='TRUST' AND code IN ('CAP_CORPUS','CAP_EXPENSE','CAP_DISTRIB');

-- the trust expense account also feeds the capital-expense caption (split by FUND)
INSERT INTO account_fs_map(framework_code,account_id,caption_code)
SELECT 'TRUST', a.id, 'CAP_EXPENSE' FROM account a WHERE a.coa_template_id=1 AND a.code='6000'
ON CONFLICT DO NOTHING;

-- FX gain/(loss) accounts are income-type; present them as other income, not admin
UPDATE account_fs_map SET caption_code='OTHER_INC'
WHERE framework_code IN ('FRS102_1A','IFRS','GAPSME')
  AND account_id IN (SELECT id FROM account WHERE coa_template_id=1 AND code IN ('7100','7200'));


-- caption amount for a window, presentation-normalised, fund-aware
CREATE OR REPLACE FUNCTION fs_caption_amount(
    p_framework text, p_entity bigint, p_caption text, p_start date, p_end date, p_statement text)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT COALESCE(SUM(jl.func_amount * CASE a.normal_balance WHEN 'D' THEN 1 ELSE -1 END), 0)
    FROM account_fs_map m
    JOIN fs_caption c ON c.framework_code = m.framework_code AND c.code = m.caption_code
    JOIN account a ON a.id = m.account_id
    JOIN journal_line jl ON jl.account_id = m.account_id
    JOIN journal j ON j.id = jl.journal_id AND j.status <> 'draft' AND j.entity_id = p_entity
    LEFT JOIN (
        SELECT jld.journal_line_id, dv.code
        FROM journal_line_dimension jld
        JOIN dimension_value dv ON dv.id = jld.dimension_value_id
        JOIN dimension_type dt ON dt.id = dv.dimension_type_id AND dt.code = 'FUND'
    ) fd ON fd.journal_line_id = jl.id
    WHERE m.framework_code = p_framework AND m.caption_code = p_caption
      AND ( (p_statement IN ('BS','AL') AND j.journal_date <= p_end)
         OR (p_statement NOT IN ('BS','AL') AND j.journal_date BETWEEN p_start AND p_end) )
      AND ( c.fund_filter IS NULL OR fd.code = c.fund_filter );
$$;


-- assemble a full statement set with comparatives + computed totals
CREATE OR REPLACE FUNCTION assemble_financial_statements(
    p_entity bigint, p_framework text,
    p_cur_start date, p_cur_end date, p_prior_start date, p_prior_end date)
RETURNS TABLE(statement text, sort_order int, caption text, note_no int,
              is_total boolean, current_amount numeric, prior_amount numeric)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT c.statement, c.sort_order, c.caption, c.note_no, c.code,
               fs_caption_amount(p_framework,p_entity,c.code,p_cur_start,p_cur_end,c.statement)     AS cur,
               fs_caption_amount(p_framework,p_entity,c.code,p_prior_start,p_prior_end,c.statement)  AS pri
        FROM fs_caption c
        WHERE c.framework_code = p_framework AND NOT c.is_subtotal
    ),
    acct AS (
        SELECT DISTINCT m.account_id, a.account_type
        FROM account_fs_map m JOIN account a ON a.id = m.account_id
        WHERE m.framework_code = p_framework
    ),
    amt AS (
        SELECT ac.account_type,
          (SELECT COALESCE(SUM(jl.func_amount),0) FROM journal_line jl
             JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft' AND j.entity_id=p_entity
             WHERE jl.account_id=ac.account_id
               AND ((ac.account_type IN ('income','expense') AND j.journal_date BETWEEN p_cur_start AND p_cur_end)
                 OR (ac.account_type NOT IN ('income','expense') AND j.journal_date <= p_cur_end))) AS cur_f,
          (SELECT COALESCE(SUM(jl.func_amount),0) FROM journal_line jl
             JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft' AND j.entity_id=p_entity
             WHERE jl.account_id=ac.account_id
               AND ((ac.account_type IN ('income','expense') AND j.journal_date BETWEEN p_prior_start AND p_prior_end)
                 OR (ac.account_type NOT IN ('income','expense') AND j.journal_date <= p_prior_end))) AS pri_f
        FROM acct ac
    )
    -- line items (suppress all-zero lines)
    SELECT b.statement, b.sort_order, b.caption, b.note_no, false, b.cur, b.pri
    FROM base b WHERE b.cur <> 0 OR b.pri <> 0
    UNION ALL
    -- P&L profit for the year (company frameworks) — by account type
    SELECT 'PL', 9999, 'Profit/(loss) for the financial year', NULL, true,
           COALESCE(SUM(-cur_f) FILTER (WHERE account_type IN ('income','expense')),0),
           COALESCE(SUM(-pri_f) FILTER (WHERE account_type IN ('income','expense')),0)
    FROM amt WHERE p_framework <> 'TRUST'
    HAVING COUNT(*) FILTER (WHERE account_type IN ('income','expense')) > 0
    UNION ALL
    SELECT 'BS', 9997, 'Total assets', NULL, true,
           COALESCE(SUM(cur_f) FILTER (WHERE account_type='asset'),0),
           COALESCE(SUM(pri_f) FILTER (WHERE account_type='asset'),0)
    FROM amt WHERE p_framework <> 'TRUST' HAVING COUNT(*) FILTER (WHERE account_type='asset') > 0
    UNION ALL
    SELECT 'BS', 9998, 'Total liabilities', NULL, true,
           COALESCE(SUM(-cur_f) FILTER (WHERE account_type='liability'),0),
           COALESCE(SUM(-pri_f) FILTER (WHERE account_type='liability'),0)
    FROM amt WHERE p_framework <> 'TRUST' HAVING COUNT(*) FILTER (WHERE account_type='liability') > 0
    UNION ALL
    SELECT 'BS', 9999, 'Net assets', NULL, true,
           COALESCE(SUM(cur_f) FILTER (WHERE account_type IN ('asset','liability')),0),
           COALESCE(SUM(pri_f) FILTER (WHERE account_type IN ('asset','liability')),0)
    FROM amt WHERE p_framework <> 'TRUST' HAVING COUNT(*) FILTER (WHERE account_type IN ('asset','liability')) > 0
    UNION ALL
    -- Trust income & capital account totals (by caption code, fund-split aware)
    SELECT 'IC', 9998, 'Undistributed income carried forward', NULL, true,
           COALESCE(SUM(CASE b.code WHEN 'INC_ARISING' THEN b.cur WHEN 'INC_EXPENSE' THEN -b.cur WHEN 'INC_DISTRIB' THEN -b.cur ELSE 0 END),0),
           COALESCE(SUM(CASE b.code WHEN 'INC_ARISING' THEN b.pri WHEN 'INC_EXPENSE' THEN -b.pri WHEN 'INC_DISTRIB' THEN -b.pri ELSE 0 END),0)
    FROM base b WHERE b.statement='IC' HAVING COUNT(*) FILTER (WHERE b.statement='IC')>0
    UNION ALL
    SELECT 'IC', 9999, 'Capital fund carried forward', NULL, true,
           COALESCE(SUM(CASE b.code WHEN 'CAP_CORPUS' THEN b.cur WHEN 'CAP_EXPENSE' THEN -b.cur WHEN 'CAP_DISTRIB' THEN -b.cur ELSE 0 END),0),
           COALESCE(SUM(CASE b.code WHEN 'CAP_CORPUS' THEN b.pri WHEN 'CAP_EXPENSE' THEN -b.pri WHEN 'CAP_DISTRIB' THEN -b.pri ELSE 0 END),0)
    FROM base b WHERE b.statement='IC' HAVING COUNT(*) FILTER (WHERE b.statement='IC')>0
    ORDER BY 1,2;
END $$;
