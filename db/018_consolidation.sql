-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CONSOLIDATION  (018)
-- Combine group entities into one set of figures: translate each member's
-- balances to the group reporting currency, apply ownership %, sum, and
-- eliminate intercompany accounts (which net to zero across the group).
-- (Split closing/average rates with a formal CTA reserve is the refinement;
--  this uses a single translation rate per member, which balances exactly.)
-- =====================================================================

ALTER TABLE account ADD COLUMN is_intercompany boolean NOT NULL DEFAULT false;

CREATE TABLE consol_group (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          text NOT NULL,
    reporting_ccy char(3) NOT NULL REFERENCES currency(code)
);

CREATE TABLE consol_group_member (
    group_id      bigint NOT NULL REFERENCES consol_group(id),
    entity_id     bigint NOT NULL REFERENCES entity(id),
    ownership_pct numeric(6,3) NOT NULL DEFAULT 100,
    PRIMARY KEY (group_id, entity_id)
);


-- consolidated trial balance: translated, summed, intercompany eliminated.
CREATE OR REPLACE FUNCTION consolidated_trial_balance(p_group_id bigint, p_rate_date date)
RETURNS TABLE(account_code text, account_name text, account_type text, consolidated numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_rep char(3);
BEGIN
    SELECT reporting_ccy INTO v_rep FROM consol_group WHERE id = p_group_id;
    RETURN QUERY
    WITH member_rate AS (
        SELECT m.entity_id, m.ownership_pct,
               CASE WHEN e.functional_ccy = v_rep THEN 1
                    ELSE COALESCE((SELECT rate FROM fx_lookup(e.functional_ccy, v_rep, p_rate_date)), 1) END AS rate
        FROM consol_group_member m JOIN entity e ON e.id = m.entity_id
        WHERE m.group_id = p_group_id
    )
    SELECT ab.account_code, ab.account_name, ab.account_type,
           round(SUM(ab.balance_func * mr.rate * mr.ownership_pct/100.0), 2) AS consolidated
    FROM v_account_balance ab
    JOIN member_rate mr ON mr.entity_id = ab.entity_id
    JOIN account a ON a.id = ab.account_id
    WHERE NOT a.is_intercompany            -- eliminate intercompany accounts
    GROUP BY ab.account_code, ab.account_name, ab.account_type
    HAVING round(SUM(ab.balance_func * mr.rate * mr.ownership_pct/100.0), 2) <> 0
    ORDER BY ab.account_code;
END $$;


-- consolidated P&L / balance-sheet summary
CREATE OR REPLACE FUNCTION consolidated_summary(p_group_id bigint, p_rate_date date)
RETURNS TABLE(line text, amount numeric)
LANGUAGE sql STABLE AS $$
    WITH tb AS (SELECT * FROM consolidated_trial_balance(p_group_id, p_rate_date))
    SELECT 'Revenue',        COALESCE(-SUM(consolidated),0) FROM tb WHERE account_type='income'
    UNION ALL SELECT 'Expenses', COALESCE(SUM(consolidated),0) FROM tb WHERE account_type='expense'
    UNION ALL SELECT 'Net profit', (SELECT COALESCE(-SUM(consolidated),0) FROM tb WHERE account_type IN ('income','expense'))
    UNION ALL SELECT 'Total assets', COALESCE(SUM(consolidated),0) FROM tb WHERE account_type='asset'
    UNION ALL SELECT 'Total liabilities', COALESCE(-SUM(consolidated),0) FROM tb WHERE account_type='liability'
    UNION ALL SELECT 'Total equity (excl. result)', COALESCE(-SUM(consolidated),0) FROM tb WHERE account_type='equity';
$$;
