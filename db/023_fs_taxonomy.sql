-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  FS TAXONOMY + PER-FRAMEWORK MAPPING  (023)
-- One trial balance, four presentations. Each ledger account maps to a
-- financial-statement caption (and note) separately per framework, so the
-- same numbers render as FRS 102 1A / IFRS / Malta GAPSME / trust fiduciary
-- accounts. Statement assembly (024) groups the TB by these captions; notes
-- (025) hang off note_no. Captions tolerate statutory and adapted formats and
-- carry the post-2026 lease/related-party lines.
-- Seed below is a working starter set (firm core accounts + trust accounts);
-- v_fs_unmapped surfaces gaps to extend. The trust income/capital split is
-- applied by the FUND dimension at assembly time, not by account mapping.
-- =====================================================================

CREATE TABLE fs_framework (
    code text PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE fs_caption (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    framework_code text NOT NULL REFERENCES fs_framework(code),
    statement      text NOT NULL CHECK (statement IN ('BS','PL','EQ','CF','IC','AL')),  -- IC/AL = trust income&capital / assets&liabilities
    code           text NOT NULL,
    caption        text NOT NULL,
    sort_order     int  NOT NULL,
    is_subtotal    boolean NOT NULL DEFAULT false,
    note_no        int,
    UNIQUE (framework_code, code)
);

CREATE TABLE account_fs_map (
    framework_code text NOT NULL REFERENCES fs_framework(code),
    account_id     bigint NOT NULL REFERENCES account(id),
    caption_code   text NOT NULL,
    PRIMARY KEY (framework_code, account_id),
    FOREIGN KEY (framework_code, caption_code) REFERENCES fs_caption(framework_code, code)
);

CREATE OR REPLACE FUNCTION map_accounts(p_framework text, p_caption text, p_codes text[])
RETURNS void LANGUAGE sql AS $$
    INSERT INTO account_fs_map(framework_code,account_id,caption_code)
    SELECT p_framework, a.id, p_caption FROM account a
    WHERE a.coa_template_id=1 AND a.code = ANY(p_codes)
    ON CONFLICT (framework_code,account_id) DO UPDATE SET caption_code = EXCLUDED.caption_code;
$$;

-- ---------------------------------------------------------------- frameworks
INSERT INTO fs_framework(code,name) VALUES
 ('FRS102_1A','FRS 102 Section 1A (UK/IOM)'),
 ('IFRS','IFRS'),
 ('GAPSME','Malta GAPSME'),
 ('TRUST','Trust fiduciary accounts');

-- ---------------------------------------------------------------- FRS 102 1A
INSERT INTO fs_caption(framework_code,statement,code,caption,sort_order,is_subtotal,note_no) VALUES
 ('FRS102_1A','BS','TANGIBLE','Tangible fixed assets',100,false,3),
 ('FRS102_1A','BS','ROU','Right-of-use assets',110,false,4),
 ('FRS102_1A','BS','DEBTORS','Debtors',200,false,5),
 ('FRS102_1A','BS','CASH','Cash at bank and in hand',210,false,NULL),
 ('FRS102_1A','BS','CRED_1YR','Creditors: amounts falling due within one year',300,false,6),
 ('FRS102_1A','BS','NET_CURRENT','Net current assets/(liabilities)',310,true,NULL),
 ('FRS102_1A','BS','CRED_GT1YR','Creditors: amounts falling due after more than one year',400,false,7),
 ('FRS102_1A','BS','NET_ASSETS','Net assets',490,true,NULL),
 ('FRS102_1A','BS','CAPITAL','Capital and reserves',500,false,8),
 ('FRS102_1A','PL','TURNOVER','Turnover',1000,false,2),
 ('FRS102_1A','PL','COST_SALES','Cost of sales',1010,false,NULL),
 ('FRS102_1A','PL','OTHER_INC','Other operating income',1050,false,NULL),
 ('FRS102_1A','PL','ADMIN','Administrative expenses',1100,false,NULL),
 ('FRS102_1A','PL','OP_PROFIT','Operating profit',1150,true,NULL),
 ('FRS102_1A','PL','INTEREST','Interest payable and similar charges',1200,false,NULL),
 ('FRS102_1A','PL','TAX','Tax on profit',1300,false,NULL),
 ('FRS102_1A','PL','PROFIT','Profit/(loss) for the financial year',1400,true,NULL);

SELECT map_accounts('FRS102_1A','TANGIBLE', ARRAY['1500','1510']);                 -- FA cost / accum dep (if present)
SELECT map_accounts('FRS102_1A','DEBTORS',  ARRAY['1100','1200','1300']);          -- trade debtors, VAT input, IC receivable
SELECT map_accounts('FRS102_1A','CASH',     ARRAY['1000','1010','1020']);
SELECT map_accounts('FRS102_1A','CRED_1YR', ARRAY['2100','2200','2210','2300','2500']);
SELECT map_accounts('FRS102_1A','TURNOVER', ARRAY['4000']);
SELECT map_accounts('FRS102_1A','OTHER_INC',ARRAY['4100','4200','7300']);
SELECT map_accounts('FRS102_1A','ADMIN',    ARRAY['6000','6100','6200','6300','6400','6500','7100','7200']);

-- ---------------------------------------------------------------- IFRS
INSERT INTO fs_caption(framework_code,statement,code,caption,sort_order,is_subtotal,note_no) VALUES
 ('IFRS','BS','PPE','Property, plant and equipment',100,false,NULL),
 ('IFRS','BS','ROU','Right-of-use assets',110,false,NULL),
 ('IFRS','BS','TRADE_REC','Trade and other receivables',200,false,NULL),
 ('IFRS','BS','CCE','Cash and cash equivalents',210,false,NULL),
 ('IFRS','BS','TRADE_PAY','Trade and other payables',300,false,NULL),
 ('IFRS','BS','EQUITY','Equity',500,false,NULL),
 ('IFRS','PL','REVENUE','Revenue',1000,false,NULL),
 ('IFRS','PL','OTHER_INC','Other income',1050,false,NULL),
 ('IFRS','PL','OPEX','Operating expenses',1100,false,NULL),
 ('IFRS','PL','FIN_COST','Finance costs',1200,false,NULL),
 ('IFRS','PL','TAX','Income tax expense',1300,false,NULL),
 ('IFRS','PL','PROFIT','Profit for the year',1400,true,NULL);

SELECT map_accounts('IFRS','PPE',      ARRAY['1500','1510']);
SELECT map_accounts('IFRS','TRADE_REC',ARRAY['1100','1200','1300']);
SELECT map_accounts('IFRS','CCE',      ARRAY['1000','1010','1020']);
SELECT map_accounts('IFRS','TRADE_PAY',ARRAY['2100','2200','2210','2300','2500']);
SELECT map_accounts('IFRS','REVENUE',  ARRAY['4000']);
SELECT map_accounts('IFRS','OTHER_INC',ARRAY['4100','4200','7300']);
SELECT map_accounts('IFRS','OPEX',     ARRAY['6000','6100','6200','6300','6400','6500','7100','7200']);

-- ---------------------------------------------------------------- Malta GAPSME (EU Accounting Directive style)
INSERT INTO fs_caption(framework_code,statement,code,caption,sort_order,is_subtotal,note_no) VALUES
 ('GAPSME','BS','FIXED','Fixed assets',100,false,NULL),
 ('GAPSME','BS','CURRENT','Current assets',200,false,NULL),
 ('GAPSME','BS','CASH','Cash at bank and in hand',210,false,NULL),
 ('GAPSME','BS','CREDITORS','Creditors',300,false,NULL),
 ('GAPSME','BS','CAPITAL','Capital and reserves',500,false,NULL),
 ('GAPSME','PL','REVENUE','Revenue',1000,false,NULL),
 ('GAPSME','PL','OTHER_INC','Other income',1050,false,NULL),
 ('GAPSME','PL','ADMIN','Administrative expenses',1100,false,NULL),
 ('GAPSME','PL','PROFIT','Profit for the year',1400,true,NULL);

SELECT map_accounts('GAPSME','FIXED',    ARRAY['1500','1510']);
SELECT map_accounts('GAPSME','CURRENT',  ARRAY['1100','1200','1300']);
SELECT map_accounts('GAPSME','CASH',     ARRAY['1000','1010','1020']);
SELECT map_accounts('GAPSME','CREDITORS',ARRAY['2100','2200','2210','2300','2500']);
SELECT map_accounts('GAPSME','REVENUE',  ARRAY['4000']);
SELECT map_accounts('GAPSME','OTHER_INC',ARRAY['4100','4200','7300']);
SELECT map_accounts('GAPSME','ADMIN',    ARRAY['6000','6100','6200','6300','6400','6500','7100','7200']);

-- ---------------------------------------------------------------- Trust fiduciary
INSERT INTO fs_caption(framework_code,statement,code,caption,sort_order,is_subtotal,note_no) VALUES
 ('TRUST','IC','INC_ARISING','Income arising',100,false,NULL),
 ('TRUST','IC','INC_EXPENSE','Expenses chargeable to income',110,false,NULL),
 ('TRUST','IC','INC_DISTRIB','Distributions to income beneficiaries',120,false,NULL),
 ('TRUST','IC','CAP_CORPUS','Capital / settled property',200,false,NULL),
 ('TRUST','IC','CAP_EXPENSE','Expenses chargeable to capital',210,false,NULL),
 ('TRUST','IC','CAP_DISTRIB','Capital distributions',220,false,NULL),
 ('TRUST','AL','TRUST_CASH','Cash at bank',300,false,NULL),
 ('TRUST','AL','TRUST_INVEST','Investments',310,false,NULL);

SELECT map_accounts('TRUST','INC_ARISING',ARRAY['4300']);
SELECT map_accounts('TRUST','INC_DISTRIB',ARRAY['8100']);
SELECT map_accounts('TRUST','CAP_CORPUS', ARRAY['3100']);
SELECT map_accounts('TRUST','CAP_DISTRIB',ARRAY['8200']);
SELECT map_accounts('TRUST','INC_EXPENSE',ARRAY['6000']);   -- split income/capital by FUND dimension at assembly
SELECT map_accounts('TRUST','TRUST_CASH', ARRAY['1000','1010','1020']);

-- ---------------------------------------------------------------- views
-- mapped trial balance grouped by caption (preview of the statement structure)
CREATE OR REPLACE VIEW v_fs_caption_balance AS
SELECT m.framework_code, ab.entity_id, c.statement, c.code AS caption_code, c.caption,
       c.sort_order, c.is_subtotal, c.note_no, SUM(ab.balance_func) AS balance_func
FROM account_fs_map m
JOIN fs_caption c ON c.framework_code = m.framework_code AND c.code = m.caption_code
JOIN v_account_balance ab ON ab.account_id = m.account_id
GROUP BY m.framework_code, ab.entity_id, c.statement, c.code, c.caption, c.sort_order, c.is_subtotal, c.note_no;

-- coverage: accounts that have postings but no mapping in a given framework
CREATE OR REPLACE VIEW v_fs_unmapped AS
SELECT f.code AS framework_code, ab.entity_id, ab.account_code, ab.account_name, ab.balance_func
FROM fs_framework f
JOIN (SELECT DISTINCT entity_id, account_id, account_code, account_name, balance_func FROM v_account_balance) ab ON true
LEFT JOIN account_fs_map m ON m.framework_code = f.code AND m.account_id = ab.account_id
WHERE m.account_id IS NULL;
