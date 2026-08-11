-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  FOUNDATION LAYER
-- Multi-entity, multi-currency double-entry ledger core
-- Target: PostgreSQL (Supabase)
--
-- This is the load-bearing foundation. Billing, AP/AR, disbursements,
-- deferred income, intercompany, consolidation and statutory accounts
-- all POST INTO this ledger. They never keep their own truth.
-- Build order is documented at the foot of this file.
-- =====================================================================


-- =====================================================================
-- 1. REFERENCE DATA
-- =====================================================================

CREATE TABLE currency (
    code            char(3) PRIMARY KEY,            -- ISO 4217: GBP, EUR, USD...
    name            text NOT NULL,
    minor_units     smallint NOT NULL DEFAULT 2     -- decimal places
);

-- Multiple rate sets, CSV/API upload (accounts note #3); realised &
-- unrealised revaluation read from here (note #4).
CREATE TABLE fx_rate (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_ccy        char(3) NOT NULL REFERENCES currency(code),
    to_ccy          char(3) NOT NULL REFERENCES currency(code),
    rate            numeric(20,10) NOT NULL CHECK (rate > 0),
    rate_date       date NOT NULL,
    rate_type       text NOT NULL DEFAULT 'closing'
                      CHECK (rate_type IN ('closing','average','historical')),
    source          text,                           -- 'manual' | 'csv' | 'api:<provider>'
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (from_ccy, to_ccy, rate_date, rate_type)
);


-- =====================================================================
-- 2. DIMENSIONS  (flexible — NOT hard-coded columns)
-- Accounts note #1: Dim 1 = Company Code (= entity, on the journal),
-- Dim 2 = Location (on the line). Any further dimension is added as DATA,
-- never as a schema change — this is the fix for the "limited columns" risk.
-- =====================================================================

CREATE TABLE location (
    code            text PRIMARY KEY,               -- 'IOM','MALTA','UK','CAYMAN','US'
    name            text NOT NULL
);

CREATE TABLE dimension_type (
    id              smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            text UNIQUE NOT NULL,           -- 'DEPT','PROJECT','COST_CENTRE'
    name            text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true
);

CREATE TABLE dimension_value (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dimension_type_id smallint NOT NULL REFERENCES dimension_type(id),
    code            text NOT NULL,
    name            text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    UNIQUE (dimension_type_id, code)
);


-- =====================================================================
-- 3. ENTITIES  (administered + group companies — Dimension 1)
-- client_type drives which CoA template is used (accounts note #2).
-- =====================================================================

CREATE TABLE entity (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_code        text UNIQUE NOT NULL,        -- e.g. 'A00001'
    name                text NOT NULL,
    entity_class        text NOT NULL CHECK (entity_class IN ('group','client')),
    client_type         text,                        -- 'TRUST','COMPANY','FUND'...
    location_code       text NOT NULL REFERENCES location(code),  -- Dim 2 default
    functional_ccy      char(3) NOT NULL REFERENCES currency(code),
    gaap                text,                        -- 'FRS102','IFRS','LOCAL'
    accounting_ref_date date,                        -- year-end
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now()
);


-- =====================================================================
-- 4. CHART OF ACCOUNTS  (selectable by client type — accounts note #2)
-- CoA is a shared DEFINITION. Balances are always derived by (entity, account),
-- so many entities can share one template without duplicating accounts.
-- =====================================================================

CREATE TABLE coa_template (
    id              smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            text UNIQUE NOT NULL,            -- 'TRUST','COMPANY','GROUP'
    name            text NOT NULL
);

CREATE TABLE account (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coa_template_id smallint NOT NULL REFERENCES coa_template(id),
    code            text NOT NULL,                   -- '1000','4000'...
    name            text NOT NULL,
    account_type    text NOT NULL
                      CHECK (account_type IN ('asset','liability','equity','income','expense')),
    normal_balance  char(1) NOT NULL CHECK (normal_balance IN ('D','C')),
    is_control      boolean NOT NULL DEFAULT false,  -- AR / AP / disbursement control a/cs
    fs_line         text,                            -- statutory-accounts grouping (Phase 3)
    is_active       boolean NOT NULL DEFAULT true,
    UNIQUE (coa_template_id, code)
);


-- =====================================================================
-- 5. PERIOD CONTROL  (period-end / year-end locking)
-- The posting engine must reject any journal into a 'closed' or 'locked' period.
-- =====================================================================

CREATE TABLE accounting_period (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    period          char(7) NOT NULL,                -- 'YYYY-MM'
    status          text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','closed','locked')),
    UNIQUE (entity_id, period)
);


-- =====================================================================
-- 6. THE LEDGER  (double-entry core — every module posts here)
-- Amount convention: SIGNED functional amount, +Dr / -Cr.
-- A posted journal must sum to zero in functional currency (see §8).
-- Posted journals are IMMUTABLE: corrections are made by a reversing
-- journal (reversal_of), never by editing or deleting history.
-- =====================================================================

CREATE TABLE journal (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    journal_date    date NOT NULL,
    period          char(7) NOT NULL,                -- 'YYYY-MM'
    journal_type    text NOT NULL DEFAULT 'manual'
                      CHECK (journal_type IN
                        ('manual','recurring','reversing','accrual','system')),
    source          text NOT NULL DEFAULT 'manual',  -- 'billing','disbursement','month-end','proposal'...
    narrative       text,
    status          text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','posted','reversed')),
    reversal_of     bigint REFERENCES journal(id),   -- a reversing journal points at its original
    created_by      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    approved_by     text,
    posted_at       timestamptz
);

CREATE TABLE journal_line (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    journal_id      bigint NOT NULL REFERENCES journal(id),
    line_no         smallint NOT NULL,
    account_id      bigint NOT NULL REFERENCES account(id),
    txn_ccy         char(3) NOT NULL REFERENCES currency(code),
    txn_amount      numeric(20,2) NOT NULL,          -- signed, transaction currency
    fx_rate_id      bigint REFERENCES fx_rate(id),   -- rate used to derive func_amount
    func_amount     numeric(20,2) NOT NULL,          -- signed, entity functional currency
    location_code   text REFERENCES location(code),  -- mandatory Dim 2
    memo            text,
    UNIQUE (journal_id, line_no)
);

-- Optional/flexible dimensions per line (Dept, Project, Cost Centre...).
-- Adding a new dimension = inserting rows, never altering the schema.
CREATE TABLE journal_line_dimension (
    journal_line_id     bigint NOT NULL REFERENCES journal_line(id),
    dimension_value_id  bigint NOT NULL REFERENCES dimension_value(id),
    PRIMARY KEY (journal_line_id, dimension_value_id)
);


-- =====================================================================
-- 7. AUDIT TRAIL  (regulated requirement: who / what / when, before & after)
-- =====================================================================

CREATE TABLE audit_log (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    actor           text NOT NULL,
    action          text NOT NULL,                   -- 'post','reverse','approve','rate_upload'
    object_type     text NOT NULL,                   -- 'journal','fx_rate','period'
    object_id       text NOT NULL,
    before_state    jsonb,
    after_state     jsonb
);


-- =====================================================================
-- 8. THE CORE INVARIANT  (double-entry must balance in functional currency)
-- Drafts may be unbalanced while being built; a POSTED journal can never be.
-- Implemented as a deferred constraint trigger so it fires at commit.
-- =====================================================================

CREATE OR REPLACE FUNCTION assert_journal_balances()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    bal numeric(20,2);
BEGIN
    IF NEW.status = 'posted' THEN
        SELECT COALESCE(SUM(func_amount), 0) INTO bal
        FROM journal_line WHERE journal_id = NEW.id;
        IF bal <> 0 THEN
            RAISE EXCEPTION
              'Journal % does not balance: functional sum = % (must be 0)', NEW.id, bal;
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER trg_journal_balances
    AFTER INSERT OR UPDATE OF status ON journal
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION assert_journal_balances();


-- =====================================================================
-- BUILD ORDER FROM HERE (each brick posts into the ledger above)
--   Phase 1  Own-firm finance + billing
--            - posting engine API (validate period, derive func_amount, balance, post)
--            - AR / AP control sub-ledgers
--            - billing-from-proposals  (services -> Def income / Sales / Disbursements)
--            - disbursements pass-through  (Dr Disb / Cr PLC -> Dr SLC / Cr Disb)
--            - deferred income month-end release
--            - FX revaluation (realised + unrealised)
--   Phase 2  Client/entity bookkeeping — run parallel to Quantios, reconcile
--   Phase 3  Client money, statutory accounts (multi-GAAP, iXBRL), consolidation
-- =====================================================================
