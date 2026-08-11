-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  PER-ENTITY CoA + GROUP MAPPING  (049)
-- The engine already resolves a chart per entity (entity.client_type ->
-- coa_template -> ledger_config). This proves it with a SECOND chart and adds
-- the group-mapping layer so entities on different charts consolidate to one
-- common group structure.
-- =====================================================================

-- second chart of accounts (a distinct trust-company chart)
INSERT INTO coa_template(code,name) SELECT 'TRUSTCOA','Trust company CoA'
WHERE NOT EXISTS (SELECT 1 FROM coa_template WHERE code='TRUSTCOA');

-- its own accounts (note: same codes as the company chart but a different template + ids)
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT t.id, x.code, x.name, x.atype, x.nb
FROM coa_template t,
 (VALUES ('1000','Trust bank account','asset','D'),
         ('1100','Settlor / debtor balances','asset','D'),
         ('2100','Trust creditors','liability','C'),
         ('3100','Trust capital','equity','C'),
         ('4300','Trust income','income','C'),
         ('6000','Trust administration expense','expense','D')) x(code,name,atype,nb)
WHERE t.code='TRUSTCOA'
  AND NOT EXISTS (SELECT 1 FROM account a WHERE a.coa_template_id=t.id AND a.code=x.code);

-- role config for the second chart (enough to post)
INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT t.id,'BANK',a.id FROM coa_template t JOIN account a ON a.coa_template_id=t.id AND a.code='1000'
WHERE t.code='TRUSTCOA' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT t.id,'PLC',a.id FROM coa_template t JOIN account a ON a.coa_template_id=t.id AND a.code='2100'
WHERE t.code='TRUSTCOA' ON CONFLICT DO NOTHING;

-- ---- group mapping: many charts -> one consolidation structure ----
CREATE TABLE IF NOT EXISTS group_account (
    code text PRIMARY KEY, name text NOT NULL, account_type text NOT NULL );
INSERT INTO group_account(code,name,account_type) VALUES
 ('G-CASH','Cash and cash equivalents','asset'),
 ('G-DEBT','Receivables','asset'),
 ('G-CRED','Payables','liability'),
 ('G-EQUITY','Equity','equity'),
 ('G-REV','Revenue','income'),
 ('G-EXP','Expenses','expense')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS account_group_map (
    account_id bigint PRIMARY KEY REFERENCES account(id),
    group_code text NOT NULL REFERENCES group_account(code) );

-- map a template's accounts (by code) to a group code
CREATE OR REPLACE FUNCTION map_to_group(p_template text, p_group text, p_codes text[])
RETURNS void LANGUAGE sql AS $$
    INSERT INTO account_group_map(account_id,group_code)
    SELECT a.id, p_group FROM account a JOIN coa_template t ON t.id=a.coa_template_id
    WHERE t.code=p_template AND a.code = ANY(p_codes)
    ON CONFLICT (account_id) DO UPDATE SET group_code=EXCLUDED.group_code;
$$;

-- map both charts onto the group structure
SELECT map_to_group('COMPANY','G-CASH', ARRAY['1000','1010','1020']);
SELECT map_to_group('COMPANY','G-DEBT', ARRAY['1100','1200','1300','1310']);
SELECT map_to_group('COMPANY','G-CRED', ARRAY['2100','2200','2210','2300','2500','2510']);
SELECT map_to_group('COMPANY','G-EQUITY',ARRAY['3100','3200']);
SELECT map_to_group('COMPANY','G-REV',  ARRAY['4000','4300']);
SELECT map_to_group('COMPANY','G-EXP',  ARRAY['6000','6100']);
SELECT map_to_group('TRUSTCOA','G-CASH', ARRAY['1000']);
SELECT map_to_group('TRUSTCOA','G-DEBT', ARRAY['1100']);
SELECT map_to_group('TRUSTCOA','G-CRED', ARRAY['2100']);
SELECT map_to_group('TRUSTCOA','G-EQUITY',ARRAY['3100']);
SELECT map_to_group('TRUSTCOA','G-REV',  ARRAY['4300']);
SELECT map_to_group('TRUSTCOA','G-EXP',  ARRAY['6000']);

-- unified group trial balance across entities on any chart
CREATE OR REPLACE VIEW v_group_trial_balance AS
SELECT gm.group_code, ga.name AS group_name, ga.account_type,
       ab.entity_id, SUM(ab.balance_func) AS balance_func
FROM v_account_balance ab
JOIN account_group_map gm ON gm.account_id = ab.account_id
JOIN group_account ga ON ga.code = gm.group_code
GROUP BY gm.group_code, ga.name, ga.account_type, ab.entity_id;
