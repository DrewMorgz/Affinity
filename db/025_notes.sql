-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  NOTES  (025)
-- Data-driven notes hang off fs_caption.note_no and the account mappings:
--   * account-analysis notes  (debtors, creditors, ...)  — component accounts
--   * fixed-asset note         — cost / depreciation / NBV + movement in year
--   * related-party note       — intercompany balances and transactions
-- Narrative notes (accounting policies, going concern, events after the
-- reporting period) are templated per framework with {placeholders} and
-- reflect the post-2026 FRS 102 position (5-step revenue, leases on balance
-- sheet, expanded Section 1A related-party disclosure).
-- =====================================================================

CREATE TABLE fs_note_template (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    framework_code text NOT NULL REFERENCES fs_framework(code),
    note_no        int NOT NULL,
    title          text NOT NULL,
    body           text NOT NULL,
    sort_order     int NOT NULL,
    UNIQUE (framework_code, note_no)
);

-- ---- data-driven: component breakdown for any BS caption carrying a note_no
--      (excludes the fixed-asset captions, which have their own movement note)
CREATE OR REPLACE FUNCTION note_account_analysis(
    p_entity bigint, p_framework text, p_cur_end date, p_prior_end date)
RETURNS TABLE(note_no int, note_title text, line_label text,
              current_amount numeric, prior_amount numeric)
LANGUAGE sql STABLE AS $$
    SELECT c.note_no, c.caption, a.name,
      COALESCE(SUM((jl.func_amount * CASE a.normal_balance WHEN 'D' THEN 1 ELSE -1 END))
               FILTER (WHERE j.journal_date <= p_cur_end), 0),
      COALESCE(SUM((jl.func_amount * CASE a.normal_balance WHEN 'D' THEN 1 ELSE -1 END))
               FILTER (WHERE j.journal_date <= p_prior_end), 0)
    FROM fs_caption c
    JOIN account_fs_map m ON m.framework_code=c.framework_code AND m.caption_code=c.code
    JOIN account a ON a.id=m.account_id
    LEFT JOIN journal_line jl ON jl.account_id=a.id
    LEFT JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft' AND j.entity_id=p_entity
    WHERE c.framework_code=p_framework AND c.note_no IS NOT NULL AND c.statement='BS'
      AND c.code NOT IN ('TANGIBLE','PPE','FIXED','ROU')
    GROUP BY c.note_no, c.caption, a.name, a.normal_balance
    HAVING COALESCE(SUM(jl.func_amount) FILTER (WHERE j.journal_date<=p_cur_end),0) <> 0
        OR COALESCE(SUM(jl.func_amount) FILTER (WHERE j.journal_date<=p_prior_end),0) <> 0
    ORDER BY c.note_no, a.name;
$$;

-- ---- data-driven: fixed asset note (closing cost / dep / NBV + in-year movement)
CREATE OR REPLACE FUNCTION note_fixed_assets(
    p_entity bigint, p_cur_start date, p_cur_end date)
RETURNS TABLE(line_label text, cost numeric, depreciation numeric, net_book_value numeric)
LANGUAGE sql STABLE AS $$
    SELECT fa.category,
           SUM(fa.cost),
           SUM(fa.accumulated_dep),
           SUM(fa.cost - fa.accumulated_dep)
    FROM fixed_asset fa
    WHERE fa.entity_id=p_entity AND fa.acquisition_date <= p_cur_end
      AND (fa.status IS DISTINCT FROM 'disposed')
    GROUP BY fa.category
    UNION ALL
    SELECT 'Additions in the year',
           COALESCE(SUM(fa.cost),0), 0, COALESCE(SUM(fa.cost),0)
    FROM fixed_asset fa
    WHERE fa.entity_id=p_entity AND fa.in_service_date BETWEEN p_cur_start AND p_cur_end
      AND (fa.status IS DISTINCT FROM 'disposed')
    ORDER BY 1;
$$;

-- ---- data-driven: related-party (intercompany) note
CREATE OR REPLACE FUNCTION note_related_party(
    p_entity bigint, p_cur_start date, p_cur_end date)
RETURNS TABLE(kind text, line_label text, counterparty text, amount numeric)
LANGUAGE sql STABLE AS $$
    -- transactions in the year
    SELECT 'Transaction',
           ic.charge_date::text || ' — ' || COALESCE(ic.description,'intercompany charge'),
           ce.name,
           CASE WHEN ic.from_entity_id=p_entity THEN ic.amount ELSE -ic.amount END
    FROM intercompany_charge ic
    JOIN entity ce ON ce.id = CASE WHEN ic.from_entity_id=p_entity THEN ic.to_entity_id ELSE ic.from_entity_id END
    WHERE (ic.from_entity_id=p_entity OR ic.to_entity_id=p_entity)
      AND ic.charge_date BETWEEN p_cur_start AND p_cur_end
    UNION ALL
    -- intercompany balances at the period end
    SELECT 'Balance', 'Amounts owed by/(to) group undertakings', NULL,
           COALESCE(SUM(ab.balance_func),0)
    FROM v_account_balance ab
    JOIN account a ON a.id=ab.account_id
    WHERE ab.entity_id=p_entity AND a.is_intercompany
    ORDER BY 1,2;
$$;

-- ---- narrative notes: render templates for an entity
CREATE OR REPLACE FUNCTION render_narrative_notes(p_entity bigint, p_framework text)
RETURNS TABLE(note_no int, title text, body text, sort_order int)
LANGUAGE sql STABLE AS $$
    SELECT t.note_no, t.title,
           replace(replace(replace(t.body,
             '{entity_name}', e.name),
             '{framework_name}', f.name),
             '{accounting_ref_date}', COALESCE(to_char(e.accounting_ref_date,'DD Month'),'the year end')),
           t.sort_order
    FROM fs_note_template t
    JOIN fs_framework f ON f.code=t.framework_code
    JOIN entity e ON e.id=p_entity
    WHERE t.framework_code=p_framework
    ORDER BY t.sort_order;
$$;

-- ---------------------------------------------------------------- seed narrative
INSERT INTO fs_note_template(framework_code,note_no,title,body,sort_order) VALUES
('FRS102_1A',1,'Accounting policies',
 'The financial statements of {entity_name} have been prepared under the historical cost convention and in accordance with {framework_name} of the Financial Reporting Standard applicable in the UK and Republic of Ireland, as revised by the FRC Periodic Review (effective for periods beginning on or after 1 January 2026). '||
 'Revenue is recognised in accordance with the five-step model, reflecting the consideration to which the company expects to be entitled as performance obligations are satisfied. '||
 'Leases: the company recognises a right-of-use asset and a corresponding lease liability for its leases, other than short-term and low-value leases. '||
 'Monetary assets and liabilities denominated in foreign currencies are translated at the rates of exchange ruling at the balance sheet date.',1),
('FRS102_1A',90,'Going concern',
 'The directors have assessed the company''s ability to continue as a going concern and, having regard to its forecasts and available resources, consider it appropriate to prepare the financial statements on the going concern basis.',90),
('FRS102_1A',95,'Related party transactions',
 'In accordance with the expanded disclosure requirements of Section 1A, all material transactions with related parties, including group undertakings, are disclosed in the related-party note.',95),
('FRS102_1A',99,'Events after the reporting period',
 'There were no events after the reporting period requiring adjustment to, or disclosure in, the financial statements of {entity_name}.',99),
('IFRS',1,'Material accounting policy information',
 'The financial statements of {entity_name} have been prepared in accordance with {framework_name}. Revenue is recognised under IFRS 15 using the five-step model; leases are accounted for under IFRS 16 with right-of-use assets and lease liabilities recognised at commencement.',1),
('IFRS',99,'Events after the reporting period',
 'No adjusting or material non-adjusting events have occurred between the reporting date and the date of authorisation of these financial statements.',99),
('GAPSME',1,'Accounting policies',
 'The financial statements of {entity_name} have been prepared in accordance with {framework_name} (General Accounting Principles for Small and Medium-Sized Entities) issued under the Maltese Companies Act.',1),
('TRUST',1,'Basis of preparation',
 'These fiduciary accounts of {entity_name} present the income and capital of the trust separately, in accordance with the trust deed. Expenses are apportioned between income and capital as required by the deed, and distributions are recorded against the relevant fund.',1);
