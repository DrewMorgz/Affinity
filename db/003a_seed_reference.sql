-- ============================================================
-- 003a_seed_reference.sql
-- Base reference data the engine assumes but earlier migrations don't
-- seed: COMPANY chart of accounts, role config, currencies, VAT codes,
-- and jurisdictions. Runs after billing (003) so all target tables
-- exist. Every insert is guarded — safe to re-run, no collision with
-- later migrations (which add their own rows via WHERE NOT EXISTS).
-- ============================================================

INSERT INTO coa_template (id, code, name) OVERRIDING SYSTEM VALUE
SELECT 1,'COMPANY','Company CoA' WHERE NOT EXISTS (SELECT 1 FROM coa_template WHERE code='COMPANY');
SELECT setval(pg_get_serial_sequence('coa_template','id'), GREATEST((SELECT max(id) FROM coa_template),1));

INSERT INTO currency(code,name,minor_units) VALUES ('EUR','Euro',2) ON CONFLICT DO NOTHING;
INSERT INTO currency(code,name,minor_units) VALUES ('GBP','Pound Sterling',2) ON CONFLICT DO NOTHING;
INSERT INTO currency(code,name,minor_units) VALUES ('USD','USD',2) ON CONFLICT DO NOTHING;
INSERT INTO vat_code(code,name,rate) SELECT 'STD','Standard 20%',0.2000 WHERE NOT EXISTS (SELECT 1 FROM vat_code WHERE code='STD');
INSERT INTO vat_code(code,name,rate) SELECT 'ZERO','Zero',0.0000 WHERE NOT EXISTS (SELECT 1 FROM vat_code WHERE code='ZERO');
INSERT INTO location(code,name) VALUES ('CYM','Cayman Islands') ON CONFLICT DO NOTHING;
INSERT INTO location(code,name) VALUES ('IOM','Isle of Man') ON CONFLICT DO NOTHING;
INSERT INTO location(code,name) VALUES ('MALTA','Malta') ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1000','Bank','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1000');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1010','Bank — EUR','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1010');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1020','Bank — recon test','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1020');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1100','Trade Debtors (SLC)','asset','D','t',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1100');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1150','Disbursements','asset','D','t',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1150');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1200','VAT Input','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1200');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1300','Intercompany receivable','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1300');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1310','Intercompany loan receivable','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1310');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1400','Prepayments','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1400');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1500','Fixed assets — cost','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1500');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1510','Accumulated depreciation','asset','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1510');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1900','Client bank account','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1900');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1910','Client bank — designated','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1910');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2100','Purchase Ledger Control','liability','C','t',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2100');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2200','VAT Output','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2200');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2210','VAT payable to authority','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2210');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2220','Withholding tax payable','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2220');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2300','Deferred Income','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2300');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2400','Employee reimbursements payable','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2400');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2500','Intercompany payable','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2500');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2510','Intercompany loan payable','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2510');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2900','Client money held','liability','C','t',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2900');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'3100','Trust capital','equity','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='3100');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'3200','Retained earnings','equity','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='3200');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'4000','Sales','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4000');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'4100','Disbursement recharge income','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4100');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'4200','Intercompany income','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4200');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'4300','Trust income','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4300');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'4400','Intercompany interest income','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4400');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6000','Administrative expenses','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6000');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6100','Depreciation expense','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6100');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6150','Impairment of fixed assets','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6150');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6200','Staff travel & expenses','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6200');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6300','Bank charges','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6300');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6400','Intercompany expense','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6400');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6410','Intercompany interest expense','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6410');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6500','Client money funding cost','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6500');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'7100','FX gain/(loss) — unrealised','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='7100');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'7200','FX gain/(loss) — realised','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='7200');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'7300','Gain/(loss) on disposal','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='7300');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'8100','Distributions — income','equity','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='8100');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'8200','Distributions — capital','equity','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='8200');
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'ACCRUALS',id FROM account WHERE coa_template_id=1 AND code='2400' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'BANK',id FROM account WHERE coa_template_id=1 AND code='1000' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'CM_CONTROL',id FROM account WHERE coa_template_id=1 AND code='2900' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'CM_FUNDING_COST',id FROM account WHERE coa_template_id=1 AND code='6500' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'DISBURSEMENTS',id FROM account WHERE coa_template_id=1 AND code='1150' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'DISB_MARKUP',id FROM account WHERE coa_template_id=1 AND code='4100' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'EMP_PAYABLE',id FROM account WHERE coa_template_id=1 AND code='2400' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'FA_ACCUM_DEP',id FROM account WHERE coa_template_id=1 AND code='1510' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'FA_COST',id FROM account WHERE coa_template_id=1 AND code='1500' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'FA_DEP_EXPENSE',id FROM account WHERE coa_template_id=1 AND code='6100' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'FA_DISPOSAL',id FROM account WHERE coa_template_id=1 AND code='7300' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'FA_IMPAIRMENT',id FROM account WHERE coa_template_id=1 AND code='6150' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'FX_REALISED',id FROM account WHERE coa_template_id=1 AND code='7200' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'FX_UNREALISED',id FROM account WHERE coa_template_id=1 AND code='7100' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'IC_EXPENSE',id FROM account WHERE coa_template_id=1 AND code='6400' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'IC_INCOME',id FROM account WHERE coa_template_id=1 AND code='4200' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'IC_INTEREST_EXPENSE',id FROM account WHERE coa_template_id=1 AND code='6410' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'IC_INTEREST_INCOME',id FROM account WHERE coa_template_id=1 AND code='4400' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'IC_LOAN_PAYABLE',id FROM account WHERE coa_template_id=1 AND code='2510' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'IC_LOAN_RECEIVABLE',id FROM account WHERE coa_template_id=1 AND code='1310' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'IC_PAYABLE',id FROM account WHERE coa_template_id=1 AND code='2500' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'IC_RECEIVABLE',id FROM account WHERE coa_template_id=1 AND code='1300' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'PLC',id FROM account WHERE coa_template_id=1 AND code='2100' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'PREPAYMENTS',id FROM account WHERE coa_template_id=1 AND code='1400' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'RETAINED_EARNINGS',id FROM account WHERE coa_template_id=1 AND code='3200' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'SLC',id FROM account WHERE coa_template_id=1 AND code='1100' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'VAT_INPUT',id FROM account WHERE coa_template_id=1 AND code='1200' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'VAT_OUTPUT',id FROM account WHERE coa_template_id=1 AND code='2200' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'VAT_PAYABLE',id FROM account WHERE coa_template_id=1 AND code='2210' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'WHT_PAYABLE',id FROM account WHERE coa_template_id=1 AND code='2220' ON CONFLICT DO NOTHING;
