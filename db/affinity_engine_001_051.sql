-- =====================================================================
-- AFFINITY CORE — ACCOUNTING ENGINE (safe to re-run)
--
-- 49 migration files in numeric order, adjusted so the script completes on a
-- database that already holds some of this schema or seed data:
--   66 CREATE TABLE   -> CREATE TABLE IF NOT EXISTS
--   15 ADD COLUMN     -> ADD COLUMN IF NOT EXISTS
--   2 trigger(s)     -> dropped before recreation
--   9 function names -> every overload dropped first (pre-flight below)
--   67 seed INSERT(s) -> ON CONFLICT DO NOTHING
--
-- Statements were split with a parser that respects quoted strings, dollar
-- quoted function bodies and comments, so INSERTs inside function bodies are
-- untouched and RETURNING / posting logic behaves exactly as written.
--
-- Run this, then 052_planning_grants.sql.
-- =====================================================================

-- ── PRE-FLIGHT ───────────────────────────────────────────────────────
DO $preflight$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname IN ('apply_receipt', 'approve_journal', 'current_app_user', 'generate_invoice', 'link_document', 'recharge_disbursements', 'record_disbursement', 'record_supplier_invoice', 'run_payment')
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS '||r.sig||' CASCADE'; END LOOP;
END $preflight$;

-- ─── 001_ledger_core.sql ───
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

CREATE TABLE IF NOT EXISTS currency (
    code            char(3) PRIMARY KEY,            -- ISO 4217: GBP, EUR, USD...
    name            text NOT NULL,
    minor_units     smallint NOT NULL DEFAULT 2     -- decimal places
);

-- Multiple rate sets, CSV/API upload (accounts note #3); realised &
-- unrealised revaluation read from here (note #4).
CREATE TABLE IF NOT EXISTS fx_rate (
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

CREATE TABLE IF NOT EXISTS location (
    code            text PRIMARY KEY,               -- 'IOM','MALTA','UK','CAYMAN','US'
    name            text NOT NULL
);

CREATE TABLE IF NOT EXISTS dimension_type (
    id              smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            text UNIQUE NOT NULL,           -- 'DEPT','PROJECT','COST_CENTRE'
    name            text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS dimension_value (
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

CREATE TABLE IF NOT EXISTS entity (
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

CREATE TABLE IF NOT EXISTS coa_template (
    id              smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            text UNIQUE NOT NULL,            -- 'TRUST','COMPANY','GROUP'
    name            text NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
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

CREATE TABLE IF NOT EXISTS accounting_period (
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

CREATE TABLE IF NOT EXISTS journal (
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

CREATE TABLE IF NOT EXISTS journal_line (
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
CREATE TABLE IF NOT EXISTS journal_line_dimension (
    journal_line_id     bigint NOT NULL REFERENCES journal_line(id),
    dimension_value_id  bigint NOT NULL REFERENCES dimension_value(id),
    PRIMARY KEY (journal_line_id, dimension_value_id)
);


-- =====================================================================
-- 7. AUDIT TRAIL  (regulated requirement: who / what / when, before & after)
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_log (
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

DROP TRIGGER IF EXISTS trg_journal_balances ON journal;
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

-- ─── 002_posting_engine.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  POSTING ENGINE
-- The single gatekeeper. Billing, disbursements, month-end, manual entry
-- all call post_journal(). Nothing writes to journal/journal_line directly.
-- Corrections are made only via reverse_journal() — history is never edited.
-- Target: PostgreSQL (Supabase). Exposed to the app as Supabase RPC.
-- =====================================================================
--
-- DEPLOY NOTE: in Supabase, mark these SECURITY DEFINER and gate them
-- behind RLS + an authenticated role so only the app (not raw SQL) can post.
-- =====================================================================


-- ---------------------------------------------------------------------
-- post_journal()
-- Validates the period is open, derives functional amounts (FX), enforces
-- balance, writes the journal + lines (+ optional dimensions) + audit row.
-- Returns the new journal id. All-or-nothing: any failure rolls back.
--
-- p_lines is a jsonb array; each element:
--   { "account_id": 1, "txn_ccy": "GBP", "txn_amount": 12000.00,
--     "func_amount": 12000.00,   -- optional; derived if omitted
--     "fx_rate_id": null,        -- optional; required for foreign ccy w/o func_amount
--     "location_code": "IOM",
--     "memo": "...",
--     "dimensions": [5, 9] }     -- optional dimension_value_ids
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION post_journal(
    p_entity_id     bigint,
    p_journal_date  date,
    p_source        text,
    p_narrative     text,
    p_created_by    text,
    p_lines         jsonb,
    p_journal_type  text DEFAULT 'manual',
    p_approved_by   text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
    v_period       char(7) := to_char(p_journal_date, 'YYYY-MM');
    v_func_ccy     char(3);
    v_period_stat  text;
    v_journal_id   bigint;
    v_line         jsonb;
    v_line_no      smallint := 0;
    v_func         numeric(20,2);
    v_rate         numeric(20,10);
    v_line_ccy     char(3);
    v_balance      numeric(20,2) := 0;
    v_line_id      bigint;
    v_dim          jsonb;
BEGIN
    -- entity must exist and be active
    SELECT functional_ccy INTO v_func_ccy
    FROM entity WHERE id = p_entity_id AND is_active;
    IF v_func_ccy IS NULL THEN
        RAISE EXCEPTION 'Entity % not found or inactive', p_entity_id;
    END IF;

    -- period must be open
    SELECT status INTO v_period_stat
    FROM accounting_period WHERE entity_id = p_entity_id AND period = v_period;
    IF v_period_stat IS NULL THEN
        RAISE EXCEPTION 'No accounting period % for entity %', v_period, p_entity_id;
    ELSIF v_period_stat <> 'open' THEN
        RAISE EXCEPTION 'Period % for entity % is % — cannot post', v_period, p_entity_id, v_period_stat;
    END IF;

    IF jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'A journal needs at least two lines';
    END IF;

    -- create the header (posted); deferred trigger re-checks balance at commit
    INSERT INTO journal(entity_id, journal_date, period, journal_type, source,
                        narrative, status, created_by, approved_by, posted_at)
    VALUES (p_entity_id, p_journal_date, v_period, p_journal_type, p_source,
            p_narrative, 'posted', p_created_by, p_approved_by, now())
    RETURNING id INTO v_journal_id;

    -- lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_line_no := v_line_no + 1;
        v_line_ccy := v_line->>'txn_ccy';

        -- account must exist and be active
        PERFORM 1 FROM account WHERE id = (v_line->>'account_id')::bigint AND is_active;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Account % not found or inactive (line %)',
                v_line->>'account_id', v_line_no;
        END IF;

        -- derive functional amount
        IF v_line ? 'func_amount' AND v_line->>'func_amount' IS NOT NULL THEN
            v_func := (v_line->>'func_amount')::numeric;
        ELSIF v_line_ccy = v_func_ccy THEN
            v_func := (v_line->>'txn_amount')::numeric;
        ELSIF v_line ? 'fx_rate_id' AND v_line->>'fx_rate_id' IS NOT NULL THEN
            SELECT rate INTO v_rate FROM fx_rate WHERE id = (v_line->>'fx_rate_id')::bigint;
            IF v_rate IS NULL THEN
                RAISE EXCEPTION 'fx_rate_id % not found (line %)', v_line->>'fx_rate_id', v_line_no;
            END IF;
            v_func := round((v_line->>'txn_amount')::numeric * v_rate, 2);
        ELSE
            RAISE EXCEPTION 'Line %: foreign currency (%) needs func_amount or fx_rate_id',
                v_line_no, v_line_ccy;
        END IF;

        v_balance := v_balance + v_func;

        INSERT INTO journal_line(journal_id, line_no, account_id, txn_ccy,
                                 txn_amount, fx_rate_id, func_amount, location_code, memo)
        VALUES (v_journal_id, v_line_no, (v_line->>'account_id')::bigint, v_line_ccy,
                (v_line->>'txn_amount')::numeric,
                NULLIF(v_line->>'fx_rate_id','')::bigint,
                v_func, v_line->>'location_code', v_line->>'memo')
        RETURNING id INTO v_line_id;

        -- optional flexible dimensions
        IF v_line ? 'dimensions' THEN
            FOR v_dim IN SELECT * FROM jsonb_array_elements(v_line->'dimensions') LOOP
                INSERT INTO journal_line_dimension(journal_line_id, dimension_value_id)
                VALUES (v_line_id, v_dim::text::bigint);
            END LOOP;
        END IF;
    END LOOP;

    -- early, clean balance check (the DB trigger is the ultimate guard)
    IF v_balance <> 0 THEN
        RAISE EXCEPTION 'Journal does not balance: functional sum = % (must be 0)', v_balance;
    END IF;

    INSERT INTO audit_log(actor, action, object_type, object_id, after_state)
    VALUES (p_created_by, 'post', 'journal', v_journal_id::text,
            jsonb_build_object('entity_id', p_entity_id, 'period', v_period,
                               'source', p_source, 'lines', jsonb_array_length(p_lines)));

    RETURN v_journal_id;
END $$;


-- ---------------------------------------------------------------------
-- reverse_journal()
-- The ONLY correction mechanism. Posts a mirror journal with negated
-- amounts, links it to the original, and marks the original 'reversed'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reverse_journal(
    p_journal_id  bigint,
    p_reversed_by text,
    p_date        date DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
    v_orig    journal%ROWTYPE;
    v_period  char(7);
    v_pstat   text;
    v_new_id  bigint;
    v_date    date;
BEGIN
    SELECT * INTO v_orig FROM journal WHERE id = p_journal_id;
    IF v_orig.id IS NULL THEN
        RAISE EXCEPTION 'Journal % not found', p_journal_id;
    ELSIF v_orig.status <> 'posted' THEN
        RAISE EXCEPTION 'Journal % is % — only posted journals can be reversed', p_journal_id, v_orig.status;
    END IF;

    v_date   := COALESCE(p_date, v_orig.journal_date);
    v_period := to_char(v_date, 'YYYY-MM');

    SELECT status INTO v_pstat FROM accounting_period
    WHERE entity_id = v_orig.entity_id AND period = v_period;
    IF v_pstat IS DISTINCT FROM 'open' THEN
        RAISE EXCEPTION 'Reversal period % is not open', v_period;
    END IF;

    INSERT INTO journal(entity_id, journal_date, period, journal_type, source,
                        narrative, status, reversal_of, created_by, posted_at)
    VALUES (v_orig.entity_id, v_date, v_period, 'reversing', v_orig.source,
            'Reversal of journal ' || p_journal_id, 'posted', p_journal_id, p_reversed_by, now())
    RETURNING id INTO v_new_id;

    INSERT INTO journal_line(journal_id, line_no, account_id, txn_ccy,
                             txn_amount, fx_rate_id, func_amount, location_code, memo)
    SELECT v_new_id, line_no, account_id, txn_ccy,
           -txn_amount, fx_rate_id, -func_amount, location_code, 'Reversal: ' || COALESCE(memo,'')
    FROM journal_line WHERE journal_id = p_journal_id;

    UPDATE journal SET status = 'reversed' WHERE id = p_journal_id;

    INSERT INTO audit_log(actor, action, object_type, object_id, after_state)
    VALUES (p_reversed_by, 'reverse', 'journal', p_journal_id::text,
            jsonb_build_object('reversing_journal_id', v_new_id));

    RETURN v_new_id;
END $$;

-- ─── 003_billing.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  BILLING  (003)
-- Signed-off proposals -> invoices -> ledger, plus disbursement pass-through.
-- Everything posts through post_journal(); no module writes the ledger directly.
-- Implements the accounts team's "New System Notes".
-- =====================================================================


-- ---------------------------------------------------------------------
-- Control-account configuration per CoA template.
-- Lets billing resolve "where does the debtor / VAT / disbursement leg go"
-- without hard-coding account ids. role in: SLC, PLC, VAT_OUTPUT, DISBURSEMENTS, BANK
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_config (
    coa_template_id smallint NOT NULL REFERENCES coa_template(id),
    role            text NOT NULL,
    account_id      bigint NOT NULL REFERENCES account(id),
    PRIMARY KEY (coa_template_id, role)
);

CREATE TABLE IF NOT EXISTS vat_code (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        text UNIQUE NOT NULL,          -- 'STD','ZERO','EXEMPT','RC'
    name        text NOT NULL,
    rate        numeric(6,4) NOT NULL DEFAULT 0  -- 0.2000 = 20%
);

-- Billable service catalogue. Each service knows its revenue and deferred a/cs.
CREATE TABLE IF NOT EXISTS service (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                text UNIQUE NOT NULL,
    name                text NOT NULL,
    revenue_account_id  bigint NOT NULL REFERENCES account(id),  -- Sales (PL)
    deferred_account_id bigint REFERENCES account(id),           -- Def income (BS)
    default_vat_code    smallint REFERENCES vat_code(id),
    is_active           boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS bank_account (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id   bigint NOT NULL REFERENCES entity(id),   -- revenue entity (pay-to)
    name        text NOT NULL,
    iban        text,
    ccy         char(3) NOT NULL REFERENCES currency(code),
    is_default  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------
-- Proposals. Billing pulls from here; no manual billing setup (note #6).
-- Must clear signoff (BD/Compliance/Admin/Accounts) before it can bill.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposal (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),   -- the client being billed
    ccy             char(3) NOT NULL REFERENCES currency(code),
    frequency       text NOT NULL DEFAULT 'annual'
                      CHECK (frequency IN ('one_off','monthly','quarterly','annual')),
    bank_account_id bigint REFERENCES bank_account(id),
    status          text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','awaiting_signoff','signed_off','billing','closed')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposal_service (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id     bigint NOT NULL REFERENCES proposal(id),
    service_id      bigint NOT NULL REFERENCES service(id),
    amount          numeric(20,2) NOT NULL,         -- net, in proposal ccy
    vat_code        smallint REFERENCES vat_code(id),
    is_deferred     boolean NOT NULL DEFAULT false,  -- billed in advance -> Def income then released
    period_start    date,                            -- service period (drives month-end release)
    period_end      date,
    effective_from  date NOT NULL DEFAULT current_date  -- date-specific changes (note #6)
);

-- Signoff register. All required roles must sign before billing.
CREATE TABLE IF NOT EXISTS proposal_signoff (
    proposal_id bigint NOT NULL REFERENCES proposal(id),
    role        text NOT NULL CHECK (role IN ('BD','Compliance','Admin','Accounts')),
    signed_by   text NOT NULL,
    signed_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (proposal_id, role)
);

CREATE TABLE IF NOT EXISTS invoice (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    proposal_id     bigint REFERENCES proposal(id),
    invoice_date    date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    bank_account_id bigint REFERENCES bank_account(id),
    net_total       numeric(20,2) NOT NULL DEFAULT 0,
    vat_total       numeric(20,2) NOT NULL DEFAULT 0,
    gross_total     numeric(20,2) NOT NULL DEFAULT 0,
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
    journal_id      bigint REFERENCES journal(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_line (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id  bigint NOT NULL REFERENCES invoice(id),
    service_id  bigint REFERENCES service(id),
    description text,
    net         numeric(20,2) NOT NULL,
    vat         numeric(20,2) NOT NULL DEFAULT 0,
    gross       numeric(20,2) NOT NULL
);

-- ---------------------------------------------------------------------
-- Disbursements. A supplier cost posted here MUST be allocated to a client
-- to charge (note: "posting without a corresponding client should not be
-- allowed"). Picked up by the next billing run; nothing sits unallocated.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disbursement (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id           bigint NOT NULL REFERENCES entity(id),  -- client to charge
    supplier            text NOT NULL,
    amount              numeric(20,2) NOT NULL,
    ccy                 char(3) NOT NULL REFERENCES currency(code),
    incurred_date       date NOT NULL,
    status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','billed')),
    purchase_journal_id bigint REFERENCES journal(id),
    recharge_journal_id bigint REFERENCES journal(id)
);


-- =====================================================================
-- HELPERS
-- =====================================================================

-- Resolve a control account for the entity's CoA template.
CREATE OR REPLACE FUNCTION cfg_account(p_entity_id bigint, p_role text)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT lc.account_id
    FROM entity e
    JOIN coa_template t ON t.code = e.client_type
    JOIN ledger_config lc ON lc.coa_template_id = t.id AND lc.role = p_role
    WHERE e.id = p_entity_id;
$$;


-- =====================================================================
-- sign_off_proposal()
-- Records a role's signoff; promotes the proposal to 'signed_off' once
-- BD + Compliance + Admin + Accounts have all signed.
-- =====================================================================
CREATE OR REPLACE FUNCTION sign_off_proposal(p_proposal_id bigint, p_role text, p_who text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_have int;
BEGIN
    INSERT INTO proposal_signoff(proposal_id, role, signed_by)
    VALUES (p_proposal_id, p_role, p_who)
    ON CONFLICT (proposal_id, role) DO UPDATE SET signed_by = excluded.signed_by, signed_at = now();

    SELECT count(*) INTO v_have FROM proposal_signoff
    WHERE proposal_id = p_proposal_id AND role IN ('BD','Compliance','Admin','Accounts');

    IF v_have = 4 THEN
        UPDATE proposal SET status = 'signed_off'
        WHERE id = p_proposal_id AND status IN ('draft','awaiting_signoff');
        RETURN 'signed_off';
    END IF;
    RETURN 'awaiting: ' || (4 - v_have) || ' more';
END $$;


-- =====================================================================
-- generate_invoice()
-- Turns a signed-off proposal into a posted invoice. For each service:
--   deferred  -> Cr Deferred Income (net)   [released to Sales at month-end]
--   immediate -> Cr Sales (net)
-- plus a single Dr SLC (gross) and Cr VAT output (total vat).
-- Posts via post_journal(); refuses if the proposal isn't signed off.
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_invoice(p_proposal_id bigint, p_invoice_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
    v_prop     proposal%ROWTYPE;
    v_inv_id   bigint;
    v_ps       record;
    v_rate     numeric(6,4);
    v_vat      numeric(20,2);
    v_net_tot  numeric(20,2) := 0;
    v_vat_tot  numeric(20,2) := 0;
    v_lines    jsonb := '[]'::jsonb;
    v_slc      bigint := cfg_account( (SELECT entity_id FROM proposal WHERE id=p_proposal_id), 'SLC');
    v_vatacc   bigint;
    v_jid      bigint;
BEGIN
    SELECT * INTO v_prop FROM proposal WHERE id = p_proposal_id;
    IF v_prop.id IS NULL THEN RAISE EXCEPTION 'Proposal % not found', p_proposal_id; END IF;
    IF v_prop.status NOT IN ('signed_off','billing') THEN
        RAISE EXCEPTION 'Proposal % is "%": cannot bill until signed off by BD/Compliance/Admin/Accounts',
            p_proposal_id, v_prop.status;
    END IF;

    INSERT INTO invoice(entity_id, proposal_id, invoice_date, ccy, bank_account_id, status)
    VALUES (v_prop.entity_id, p_proposal_id, p_invoice_date, v_prop.ccy, v_prop.bank_account_id, 'draft')
    RETURNING id INTO v_inv_id;

    -- build invoice lines + the revenue/deferred legs of the journal
    FOR v_ps IN
        SELECT ps.*, s.revenue_account_id, s.deferred_account_id, s.name AS sname
        FROM proposal_service ps JOIN service s ON s.id = ps.service_id
        WHERE ps.proposal_id = p_proposal_id
    LOOP
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = v_ps.vat_code;
        v_rate := COALESCE(v_rate, 0);
        v_vat  := round(v_ps.amount * v_rate, 2);
        v_net_tot := v_net_tot + v_ps.amount;
        v_vat_tot := v_vat_tot + v_vat;

        INSERT INTO invoice_line(invoice_id, service_id, description, net, vat, gross)
        VALUES (v_inv_id, v_ps.service_id, v_ps.sname, v_ps.amount, v_vat, v_ps.amount + v_vat);

        -- credit revenue (or deferred income if billed in advance)
        v_lines := v_lines || jsonb_build_object(
            'account_id', CASE WHEN v_ps.is_deferred
                               THEN COALESCE(v_ps.deferred_account_id, v_ps.revenue_account_id)
                               ELSE v_ps.revenue_account_id END,
            'txn_ccy', v_prop.ccy, 'txn_amount', -v_ps.amount,
            'location_code', (SELECT location_code FROM entity WHERE id=v_prop.entity_id),
            'memo', (CASE WHEN v_ps.is_deferred THEN 'Deferred: ' ELSE 'Sales: ' END) || v_ps.sname);
    END LOOP;

    -- single debtor leg (gross)
    v_lines := jsonb_build_array(jsonb_build_object(
        'account_id', v_slc, 'txn_ccy', v_prop.ccy, 'txn_amount', v_net_tot + v_vat_tot,
        'location_code', (SELECT location_code FROM entity WHERE id=v_prop.entity_id),
        'memo', 'Trade debtor — invoice')) || v_lines;

    -- VAT output leg, if any
    IF v_vat_tot <> 0 THEN
        v_vatacc := cfg_account(v_prop.entity_id, 'VAT_OUTPUT');
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_vatacc, 'txn_ccy', v_prop.ccy, 'txn_amount', -v_vat_tot,
            'location_code', (SELECT location_code FROM entity WHERE id=v_prop.entity_id),
            'memo', 'Output VAT');
    END IF;

    v_jid := post_journal(v_prop.entity_id, p_invoice_date, 'billing',
                          'Invoice from proposal ' || p_proposal_id, p_created_by, v_lines);

    UPDATE invoice SET status='posted', journal_id=v_jid,
           net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_net_tot+v_vat_tot
    WHERE id = v_inv_id;

    RETURN v_inv_id;
END $$;


-- =====================================================================
-- record_disbursement()
-- Dr Disbursements / Cr Purchase Ledger Control. MUST be tied to a client.
-- =====================================================================
CREATE OR REPLACE FUNCTION record_disbursement(
    p_entity_id bigint, p_supplier text, p_amount numeric, p_ccy char(3),
    p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_plc  bigint := cfg_account(p_entity_id,'PLC');
        v_jid  bigint; v_id bigint; v_loc text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM entity WHERE id = p_entity_id) THEN
        RAISE EXCEPTION 'Disbursement must be allocated to a valid client to charge';
    END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;

    v_jid := post_journal(p_entity_id, p_date, 'disbursement',
        'Supplier disbursement: ' || p_supplier, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_disb,'txn_ccy',p_ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Dr Disbursements'),
          jsonb_build_object('account_id',v_plc ,'txn_ccy',p_ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Cr Purchase Ledger Control')));

    INSERT INTO disbursement(entity_id,supplier,amount,ccy,incurred_date,status,purchase_journal_id)
    VALUES (p_entity_id,p_supplier,p_amount,p_ccy,p_date,'open',v_jid)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- =====================================================================
-- recharge_disbursements()
-- Bills all open disbursements for a client: Dr SLC / Cr Disbursements.
-- The disbursements account nets to zero -> clean reconciliation.
-- =====================================================================
CREATE OR REPLACE FUNCTION recharge_disbursements(p_entity_id bigint, p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_total numeric(20,2); v_ccy char(3); v_loc text;
        v_slc bigint := cfg_account(p_entity_id,'SLC');
        v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_jid bigint;
BEGIN
    SELECT sum(amount), max(ccy) INTO v_total, v_ccy
    FROM disbursement WHERE entity_id=p_entity_id AND status='open';
    IF COALESCE(v_total,0) = 0 THEN RAISE EXCEPTION 'No open disbursements for client %', p_entity_id; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id=p_entity_id;

    v_jid := post_journal(p_entity_id, p_date, 'disbursement-recharge',
        'Recharge disbursements to client', p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_slc ,'txn_ccy',v_ccy,'txn_amount', v_total,'location_code',v_loc,'memo','Dr Sales Ledger Control'),
          jsonb_build_object('account_id',v_disb,'txn_ccy',v_ccy,'txn_amount',-v_total,'location_code',v_loc,'memo','Cr Disbursements')));

    UPDATE disbursement SET status='billed', recharge_journal_id=v_jid
    WHERE entity_id=p_entity_id AND status='open';
    RETURN v_jid;
END $$;

-- NOTE: VAT on disbursements (true disbursement = outside scope vs recharge = VATable)
-- and disbursement mark-up are deliberately not modelled in this first cut — both are
-- flagged refinements. This matches the accounts team's at-cost pass-through.

-- ─── 003a_seed_reference.sql ───
-- ============================================================
-- 003a_seed_reference.sql
-- Base reference data the engine assumes but earlier migrations don't
-- seed: COMPANY chart of accounts, role config, currencies, VAT codes,
-- and jurisdictions. Runs after billing (003) so all target tables
-- exist. Every insert is guarded — safe to re-run, no collision with
-- later migrations (which add their own rows via WHERE NOT EXISTS).
-- ============================================================

INSERT INTO coa_template (id, code, name) OVERRIDING SYSTEM VALUE
SELECT 1,'COMPANY','Company CoA' WHERE NOT EXISTS (SELECT 1 FROM coa_template WHERE code='COMPANY')
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('coa_template','id'), GREATEST((SELECT max(id) FROM coa_template),1));

INSERT INTO currency(code,name,minor_units) VALUES ('EUR','Euro',2) ON CONFLICT DO NOTHING;
INSERT INTO currency(code,name,minor_units) VALUES ('GBP','Pound Sterling',2) ON CONFLICT DO NOTHING;
INSERT INTO currency(code,name,minor_units) VALUES ('USD','USD',2) ON CONFLICT DO NOTHING;
INSERT INTO vat_code(code,name,rate) SELECT 'STD','Standard 20%',0.2000 WHERE NOT EXISTS (SELECT 1 FROM vat_code WHERE code='STD')
ON CONFLICT DO NOTHING;
INSERT INTO vat_code(code,name,rate) SELECT 'ZERO','Zero',0.0000 WHERE NOT EXISTS (SELECT 1 FROM vat_code WHERE code='ZERO')
ON CONFLICT DO NOTHING;
INSERT INTO location(code,name) VALUES ('CYM','Cayman Islands') ON CONFLICT DO NOTHING;
INSERT INTO location(code,name) VALUES ('IOM','Isle of Man') ON CONFLICT DO NOTHING;
INSERT INTO location(code,name) VALUES ('MALTA','Malta') ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1000','Bank','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1000')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1010','Bank — EUR','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1010')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1020','Bank — recon test','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1020')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1100','Trade Debtors (SLC)','asset','D','t',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1100')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1150','Disbursements','asset','D','t',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1150')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1200','VAT Input','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1200')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1300','Intercompany receivable','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1300')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1310','Intercompany loan receivable','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1310')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1400','Prepayments','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1400')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1500','Fixed assets — cost','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1500')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1510','Accumulated depreciation','asset','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1510')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1900','Client bank account','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1900')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'1910','Client bank — designated','asset','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1910')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2100','Purchase Ledger Control','liability','C','t',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2100')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2200','VAT Output','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2200')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2210','VAT payable to authority','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2210')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2220','Withholding tax payable','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2220')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2300','Deferred Income','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2300')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2400','Employee reimbursements payable','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2400')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2500','Intercompany payable','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2500')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2510','Intercompany loan payable','liability','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2510')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'2900','Client money held','liability','C','t',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2900')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'3100','Trust capital','equity','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='3100')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'3200','Retained earnings','equity','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='3200')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'4000','Sales','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4000')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'4100','Disbursement recharge income','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4100')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'4200','Intercompany income','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4200')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'4300','Trust income','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4300')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'4400','Intercompany interest income','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4400')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6000','Administrative expenses','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6000')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6100','Depreciation expense','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6100')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6150','Impairment of fixed assets','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6150')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6200','Staff travel & expenses','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6200')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6300','Bank charges','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6300')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6400','Intercompany expense','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6400')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6410','Intercompany interest expense','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6410')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'6500','Client money funding cost','expense','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6500')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'7100','FX gain/(loss) — unrealised','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='7100')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'7200','FX gain/(loss) — realised','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='7200')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'7300','Gain/(loss) on disposal','income','C','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='7300')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'8100','Distributions — income','equity','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='8100')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance,is_control,fs_line) SELECT 1,'8200','Distributions — capital','equity','D','f',NULL WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='8200')
ON CONFLICT DO NOTHING;
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

-- ─── 004_deferred_income.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  DEFERRED INCOME RELEASE  (004)
-- Month-end recognition: moves deferred income (BS) to sales (PL) across
-- the service period, straight-line by day. Driven by the dates on the
-- proposal service (accounts note #6b). Posts via post_journal().
-- =====================================================================


-- Recognition schedule. One row per deferred invoice line. Cumulative
-- (forward-only) recognition avoids rounding drift; the final month clears
-- exactly to the total.
CREATE TABLE IF NOT EXISTS deferred_schedule (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_line_id     bigint NOT NULL REFERENCES invoice_line(id),
    entity_id           bigint NOT NULL REFERENCES entity(id),
    deferred_account_id bigint NOT NULL REFERENCES account(id),
    revenue_account_id  bigint NOT NULL REFERENCES account(id),
    total_amount        numeric(20,2) NOT NULL,   -- net, to be recognised over the period
    ccy                 char(3) NOT NULL REFERENCES currency(code),
    period_start        date NOT NULL,
    period_end          date NOT NULL,
    recognised_amount   numeric(20,2) NOT NULL DEFAULT 0,
    status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','complete'))
);


-- ---------------------------------------------------------------------
-- run_deferred_income(): the month-end procedure.
-- For each open schedule, recognise the cumulative amount earned to the
-- end of p_period, less what's already been taken. Dr Deferred / Cr Sales.
-- Forward-only: re-running an earlier month posts nothing.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_deferred_income(p_entity_id bigint, p_period char(7), p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
    v_pend   date := (to_date(p_period,'YYYY-MM') + interval '1 month - 1 day')::date;
    v_rec    deferred_schedule%ROWTYPE;
    v_days   int;
    v_elapsed int;
    v_target numeric(20,2);
    v_delta  numeric(20,2);
    v_loc    text;
    v_run    numeric(20,2) := 0;
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;

    FOR v_rec IN
        SELECT * FROM deferred_schedule
        WHERE entity_id = p_entity_id AND status = 'open' AND period_start <= v_pend
    LOOP
        v_days    := (v_rec.period_end - v_rec.period_start) + 1;
        v_elapsed := (LEAST(v_pend, v_rec.period_end) - v_rec.period_start) + 1;
        v_target  := round(v_rec.total_amount * v_elapsed::numeric / v_days, 2);
        v_delta   := v_target - v_rec.recognised_amount;

        IF v_delta > 0 THEN
            PERFORM post_journal(p_entity_id, v_pend, 'month-end',
                'Deferred income release (schedule ' || v_rec.id || ')', p_created_by,
                jsonb_build_array(
                  jsonb_build_object('account_id',v_rec.deferred_account_id,'txn_ccy',v_rec.ccy,
                                     'txn_amount', v_delta,'location_code',v_loc,'memo','Dr Deferred Income'),
                  jsonb_build_object('account_id',v_rec.revenue_account_id,'txn_ccy',v_rec.ccy,
                                     'txn_amount',-v_delta,'location_code',v_loc,'memo','Cr Sales (earned)')),
                'recurring');
            UPDATE deferred_schedule
               SET recognised_amount = recognised_amount + v_delta,
                   status = CASE WHEN v_pend >= period_end THEN 'complete' ELSE 'open' END
             WHERE id = v_rec.id;
            v_run := v_run + v_delta;
        ELSIF v_pend >= v_rec.period_end THEN
            UPDATE deferred_schedule SET status='complete' WHERE id = v_rec.id;
        END IF;
    END LOOP;

    RETURN v_run;
END $$;


-- ---------------------------------------------------------------------
-- generate_invoice() — REPLACED so deferred lines also create a schedule.
-- Identical to 003 except it captures the invoice_line id and inserts a
-- deferred_schedule row for each deferred service.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_invoice(p_proposal_id bigint, p_invoice_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
    v_prop     proposal%ROWTYPE;
    v_inv_id   bigint;
    v_ps       record;
    v_rate     numeric(6,4);
    v_vat      numeric(20,2);
    v_net_tot  numeric(20,2) := 0;
    v_vat_tot  numeric(20,2) := 0;
    v_lines    jsonb := '[]'::jsonb;
    v_slc      bigint := cfg_account( (SELECT entity_id FROM proposal WHERE id=p_proposal_id), 'SLC');
    v_vatacc   bigint;
    v_jid      bigint;
    v_il       bigint;
    v_loc      text;
BEGIN
    SELECT * INTO v_prop FROM proposal WHERE id = p_proposal_id;
    IF v_prop.id IS NULL THEN RAISE EXCEPTION 'Proposal % not found', p_proposal_id; END IF;
    IF v_prop.status NOT IN ('signed_off','billing') THEN
        RAISE EXCEPTION 'Proposal % is "%": cannot bill until signed off by BD/Compliance/Admin/Accounts',
            p_proposal_id, v_prop.status;
    END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = v_prop.entity_id;

    INSERT INTO invoice(entity_id, proposal_id, invoice_date, ccy, bank_account_id, status)
    VALUES (v_prop.entity_id, p_proposal_id, p_invoice_date, v_prop.ccy, v_prop.bank_account_id, 'draft')
    RETURNING id INTO v_inv_id;

    FOR v_ps IN
        SELECT ps.*, s.revenue_account_id, s.deferred_account_id, s.name AS sname
        FROM proposal_service ps JOIN service s ON s.id = ps.service_id
        WHERE ps.proposal_id = p_proposal_id
    LOOP
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = v_ps.vat_code;
        v_rate := COALESCE(v_rate, 0);
        v_vat  := round(v_ps.amount * v_rate, 2);
        v_net_tot := v_net_tot + v_ps.amount;
        v_vat_tot := v_vat_tot + v_vat;

        INSERT INTO invoice_line(invoice_id, service_id, description, net, vat, gross)
        VALUES (v_inv_id, v_ps.service_id, v_ps.sname, v_ps.amount, v_vat, v_ps.amount + v_vat)
        RETURNING id INTO v_il;

        -- auto-create the recognition schedule for deferred services
        IF v_ps.is_deferred AND v_ps.deferred_account_id IS NOT NULL
           AND v_ps.period_start IS NOT NULL AND v_ps.period_end IS NOT NULL THEN
            INSERT INTO deferred_schedule(invoice_line_id, entity_id, deferred_account_id,
                                          revenue_account_id, total_amount, ccy, period_start, period_end)
            VALUES (v_il, v_prop.entity_id, v_ps.deferred_account_id, v_ps.revenue_account_id,
                    v_ps.amount, v_prop.ccy, v_ps.period_start, v_ps.period_end);
        END IF;

        v_lines := v_lines || jsonb_build_object(
            'account_id', CASE WHEN v_ps.is_deferred
                               THEN COALESCE(v_ps.deferred_account_id, v_ps.revenue_account_id)
                               ELSE v_ps.revenue_account_id END,
            'txn_ccy', v_prop.ccy, 'txn_amount', -v_ps.amount, 'location_code', v_loc,
            'memo', (CASE WHEN v_ps.is_deferred THEN 'Deferred: ' ELSE 'Sales: ' END) || v_ps.sname);
    END LOOP;

    v_lines := jsonb_build_array(jsonb_build_object(
        'account_id', v_slc, 'txn_ccy', v_prop.ccy, 'txn_amount', v_net_tot + v_vat_tot,
        'location_code', v_loc, 'memo', 'Trade debtor — invoice')) || v_lines;

    IF v_vat_tot <> 0 THEN
        v_vatacc := cfg_account(v_prop.entity_id, 'VAT_OUTPUT');
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_vatacc, 'txn_ccy', v_prop.ccy, 'txn_amount', -v_vat_tot,
            'location_code', v_loc, 'memo', 'Output VAT');
    END IF;

    v_jid := post_journal(v_prop.entity_id, p_invoice_date, 'billing',
                          'Invoice from proposal ' || p_proposal_id, p_created_by, v_lines);

    UPDATE invoice SET status='posted', journal_id=v_jid,
           net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_net_tot+v_vat_tot
    WHERE id = v_inv_id;

    RETURN v_inv_id;
END $$;

-- ─── 005_reporting.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  REPORTING  (005)
-- Read-only views. Trial balance, P&L, balance sheet per entity, all built
-- on ONE base view so the reversed-journal rule is defined exactly once.
-- Drill-down from any figure = a filtered query on v_posting.
-- =====================================================================


-- ---------------------------------------------------------------------
-- v_posting — THE canonical base. Every live posting line, enriched.
-- The reversed-journal-safe filter (status <> 'draft') lives here and
-- nowhere else: a reversed journal's lines remain in the books, its
-- reversal cancels them, and drafts never count.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_posting AS
SELECT j.entity_id, e.company_code, e.name AS entity_name,
       j.id   AS journal_id, j.journal_date, j.period, j.source, j.status AS journal_status,
       jl.id  AS line_id, jl.line_no,
       a.id   AS account_id, a.code AS account_code, a.name AS account_name,
       a.account_type, a.normal_balance,
       jl.txn_ccy, jl.txn_amount, jl.func_amount, jl.location_code, jl.memo
FROM journal_line jl
JOIN journal j ON j.id = jl.journal_id
JOIN entity  e ON e.id = j.entity_id
JOIN account a ON a.id = jl.account_id
WHERE j.status <> 'draft';


-- ---------------------------------------------------------------------
-- v_account_balance — signed balance per entity + account (+Dr / -Cr).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_account_balance AS
SELECT entity_id, company_code, entity_name,
       account_id, account_code, account_name, account_type, normal_balance,
       SUM(func_amount) AS balance_func
FROM v_posting
GROUP BY entity_id, company_code, entity_name,
         account_id, account_code, account_name, account_type, normal_balance;


-- ---------------------------------------------------------------------
-- v_trial_balance — classic debit/credit columns. Sums equal per entity.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT entity_id, company_code, entity_name, account_code, account_name, account_type,
       CASE WHEN balance_func > 0 THEN  balance_func ELSE 0 END AS debit,
       CASE WHEN balance_func < 0 THEN -balance_func ELSE 0 END AS credit
FROM v_account_balance
WHERE balance_func <> 0;


-- ---------------------------------------------------------------------
-- v_pl — profit & loss lines (revenue & expenses shown as positive).
-- v_pl_summary — revenue / expenses / net profit per entity.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pl AS
SELECT entity_id, company_code, entity_name, account_code, account_name,
       CASE account_type WHEN 'income' THEN 'Revenue' ELSE 'Expenses' END AS section,
       CASE account_type WHEN 'income' THEN -balance_func ELSE balance_func END AS amount
FROM v_account_balance
WHERE account_type IN ('income','expense') AND balance_func <> 0;

CREATE OR REPLACE VIEW v_pl_summary AS
SELECT entity_id, company_code, entity_name,
       SUM(CASE WHEN account_type='income'  THEN -balance_func ELSE 0 END) AS revenue,
       SUM(CASE WHEN account_type='expense' THEN  balance_func ELSE 0 END) AS expenses,
       SUM(CASE WHEN account_type='income'  THEN -balance_func ELSE 0 END)
       - SUM(CASE WHEN account_type='expense' THEN balance_func ELSE 0 END) AS net_profit
FROM v_account_balance
WHERE account_type IN ('income','expense')
GROUP BY entity_id, company_code, entity_name;


-- ---------------------------------------------------------------------
-- v_balance_sheet — assets / liabilities / equity (shown as positives),
-- plus the current-period result injected into equity so it balances:
--   Assets = Liabilities + Equity (incl. profit/(loss) for the period)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_balance_sheet AS
SELECT entity_id, company_code, entity_name, account_code, account_name,
       CASE account_type WHEN 'asset' THEN 'Assets'
                         WHEN 'liability' THEN 'Liabilities'
                         ELSE 'Equity' END AS section,
       CASE account_type WHEN 'asset' THEN balance_func ELSE -balance_func END AS amount
FROM v_account_balance
WHERE account_type IN ('asset','liability','equity') AND balance_func <> 0
UNION ALL
SELECT entity_id, company_code, entity_name,
       '——' AS account_code, 'Profit/(loss) for the period' AS account_name,
       'Equity' AS section, net_profit AS amount
FROM v_pl_summary
WHERE net_profit <> 0;


-- ---------------------------------------------------------------------
-- DRILL-DOWN
-- Any figure traces back to its journal lines, e.g.:
--   SELECT journal_id, journal_date, source, journal_status, func_amount, memo
--   FROM v_posting WHERE entity_id = :e AND account_id = :a ORDER BY journal_id;
-- ---------------------------------------------------------------------

-- ─── 006_accounts_payable.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  ACCOUNTS PAYABLE  (006)
-- Supplier master + purchase ledger + payment run.
-- The payment run posts Dr Purchase Ledger Control / Cr Bank and settles
-- open supplier invoices. Disbursements now register here too, so they
-- settle through the same run (one creditor model, not two).
-- =====================================================================

CREATE TABLE IF NOT EXISTS supplier (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text UNIQUE NOT NULL,
    default_ccy char(3) REFERENCES currency(code),
    bank_details text,
    is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS supplier_invoice (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id     bigint NOT NULL REFERENCES supplier(id),
    entity_id       bigint NOT NULL REFERENCES entity(id),   -- whose books the creditor sits on
    reference       text,
    invoice_date    date NOT NULL,
    due_date        date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    net             numeric(20,2) NOT NULL,
    vat             numeric(20,2) NOT NULL DEFAULT 0,
    gross           numeric(20,2) NOT NULL,
    outstanding     numeric(20,2) NOT NULL,
    is_disbursement boolean NOT NULL DEFAULT false,
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','part_paid','paid')),
    purchase_journal_id bigint REFERENCES journal(id)
);

CREATE TABLE IF NOT EXISTS payment (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    payment_date    date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    amount          numeric(20,2) NOT NULL,
    journal_id      bigint REFERENCES journal(id),
    created_by      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_allocation (
    payment_id          bigint NOT NULL REFERENCES payment(id),
    supplier_invoice_id bigint NOT NULL REFERENCES supplier_invoice(id),
    amount              numeric(20,2) NOT NULL,
    PRIMARY KEY (payment_id, supplier_invoice_id)
);

-- link disbursements to their payable invoice
ALTER TABLE disbursement ADD COLUMN IF NOT EXISTS supplier_invoice_id bigint REFERENCES supplier_invoice(id);


-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_or_create_supplier(p_name text, p_ccy char(3))
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
    SELECT id INTO v_id FROM supplier WHERE name = p_name;
    IF v_id IS NULL THEN
        INSERT INTO supplier(name, default_ccy) VALUES (p_name, p_ccy) RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
END $$;


-- ---------------------------------------------------------------------
-- record_supplier_invoice() — a normal purchase invoice (overheads etc).
-- Dr Expense (net) + Dr VAT Input (vat) / Cr Purchase Ledger Control (gross).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_supplier_invoice(
    p_entity_id bigint, p_supplier text, p_reference text,
    p_invoice_date date, p_due_date date, p_net numeric, p_vat_code int,
    p_ccy char(3), p_expense_account_id bigint, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_sup bigint := get_or_create_supplier(p_supplier, p_ccy);
        v_plc bigint := cfg_account(p_entity_id,'PLC');
        v_vatin bigint;
        v_rate numeric(6,4); v_vat numeric(20,2); v_gross numeric(20,2);
        v_loc text; v_jid bigint; v_inv bigint; v_lines jsonb;
BEGIN
    SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = p_vat_code;
    v_rate := COALESCE(v_rate,0);
    v_vat  := round(p_net * v_rate, 2);
    v_gross := p_net + v_vat;
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;

    v_lines := jsonb_build_array(
        jsonb_build_object('account_id',p_expense_account_id,'txn_ccy',p_ccy,'txn_amount',p_net,'location_code',v_loc,'memo','Dr Expense'),
        jsonb_build_object('account_id',v_plc,'txn_ccy',p_ccy,'txn_amount',-v_gross,'location_code',v_loc,'memo','Cr Purchase Ledger Control'));
    IF v_vat <> 0 THEN
        v_vatin := cfg_account(p_entity_id,'VAT_INPUT');
        v_lines := v_lines || jsonb_build_object('account_id',v_vatin,'txn_ccy',p_ccy,'txn_amount',v_vat,'location_code',v_loc,'memo','Dr VAT Input');
    END IF;

    v_jid := post_journal(p_entity_id, p_invoice_date, 'purchase',
        'Supplier invoice ' || COALESCE(p_reference,'') || ' (' || p_supplier || ')', p_created_by, v_lines);

    INSERT INTO supplier_invoice(supplier_id,entity_id,reference,invoice_date,due_date,ccy,net,vat,gross,outstanding,purchase_journal_id)
    VALUES (v_sup,p_entity_id,p_reference,p_invoice_date,p_due_date,p_ccy,p_net,v_vat,v_gross,v_gross,v_jid)
    RETURNING id INTO v_inv;
    RETURN v_inv;
END $$;


-- ---------------------------------------------------------------------
-- record_disbursement() — REPLACED. Same posting as before, but now also
-- creates a payable supplier_invoice (is_disbursement = true) so the cost
-- settles through the payment run.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_disbursement(
    p_entity_id bigint, p_supplier text, p_amount numeric, p_ccy char(3),
    p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_plc  bigint := cfg_account(p_entity_id,'PLC');
        v_sup  bigint; v_jid bigint; v_id bigint; v_inv bigint; v_loc text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM entity WHERE id = p_entity_id) THEN
        RAISE EXCEPTION 'Disbursement must be allocated to a valid client to charge';
    END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;
    v_sup := get_or_create_supplier(p_supplier, p_ccy);

    v_jid := post_journal(p_entity_id, p_date, 'disbursement',
        'Supplier disbursement: ' || p_supplier, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_disb,'txn_ccy',p_ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Dr Disbursements'),
          jsonb_build_object('account_id',v_plc ,'txn_ccy',p_ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Cr Purchase Ledger Control')));

    INSERT INTO supplier_invoice(supplier_id,entity_id,reference,invoice_date,due_date,ccy,net,vat,gross,outstanding,is_disbursement,purchase_journal_id)
    VALUES (v_sup,p_entity_id,'disbursement',p_date,p_date,p_ccy,p_amount,0,p_amount,p_amount,true,v_jid)
    RETURNING id INTO v_inv;

    INSERT INTO disbursement(entity_id,supplier,amount,ccy,incurred_date,status,purchase_journal_id,supplier_invoice_id)
    VALUES (p_entity_id,p_supplier,p_amount,p_ccy,p_date,'open',v_jid,v_inv)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- ---------------------------------------------------------------------
-- run_payment() — the payment run. Settles all open supplier invoices for
-- the entity due on/before p_up_to_due (all open if null) in one batch:
-- Dr Purchase Ledger Control / Cr Bank, allocate, mark paid.
-- (Partial payment and multi-currency settlement are later refinements.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_payment(
    p_entity_id bigint, p_payment_date date, p_up_to_due date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_plc bigint := cfg_account(p_entity_id,'PLC');
        v_bank bigint := cfg_account(p_entity_id,'BANK');
        v_total numeric(20,2); v_ccy char(3); v_loc text; v_jid bigint; v_pay bigint;
        v_inv record;
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;

    SELECT COALESCE(SUM(outstanding),0), MAX(ccy) INTO v_total, v_ccy
    FROM supplier_invoice
    WHERE entity_id = p_entity_id AND status <> 'paid'
      AND (p_up_to_due IS NULL OR due_date <= p_up_to_due);
    IF v_total = 0 THEN RAISE EXCEPTION 'No supplier invoices to pay for entity %', p_entity_id; END IF;

    v_jid := post_journal(p_entity_id, p_payment_date, 'payment-run',
        'Supplier payment run', p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_plc ,'txn_ccy',v_ccy,'txn_amount', v_total,'location_code',v_loc,'memo','Dr Purchase Ledger Control'),
          jsonb_build_object('account_id',v_bank,'txn_ccy',v_ccy,'txn_amount',-v_total,'location_code',v_loc,'memo','Cr Bank')));

    INSERT INTO payment(entity_id,payment_date,ccy,amount,journal_id,created_by)
    VALUES (p_entity_id,p_payment_date,v_ccy,v_total,v_jid,p_created_by) RETURNING id INTO v_pay;

    FOR v_inv IN
        SELECT id, outstanding FROM supplier_invoice
        WHERE entity_id = p_entity_id AND status <> 'paid'
          AND (p_up_to_due IS NULL OR due_date <= p_up_to_due)
    LOOP
        INSERT INTO payment_allocation(payment_id,supplier_invoice_id,amount)
        VALUES (v_pay, v_inv.id, v_inv.outstanding);
        UPDATE supplier_invoice SET outstanding = 0, status = 'paid' WHERE id = v_inv.id;
    END LOOP;

    UPDATE disbursement SET status = 'billed'  -- keep disbursement lifecycle in step where already recharged
    WHERE supplier_invoice_id IN (SELECT supplier_invoice_id FROM payment_allocation WHERE payment_id = v_pay)
      AND status = 'billed';

    RETURN v_pay;
END $$;

-- ─── 007_accounts_receivable.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  ACCOUNTS RECEIVABLE / CASH APPLICATION (007)
-- Customer receipts: Dr Bank / Cr Sales Ledger Control, allocated against
-- the invoices raised in 003. Clears the debtor as clients pay.
-- Mirror of the AP payment run.
-- =====================================================================

-- track settlement on the invoice (posting status stays in `status`)
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS outstanding numeric(20,2);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS settled text NOT NULL DEFAULT 'open'
      CHECK (settled IN ('open','part_paid','paid'));

-- initialise outstanding when an invoice posts (keeps generate_invoice untouched)
CREATE OR REPLACE FUNCTION init_invoice_outstanding()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'posted' AND NEW.outstanding IS NULL THEN
        NEW.outstanding := NEW.gross_total;
        NEW.settled := 'open';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_init_invoice_outstanding ON invoice;
CREATE TRIGGER trg_init_invoice_outstanding
    BEFORE INSERT OR UPDATE ON invoice
    FOR EACH ROW EXECUTE FUNCTION init_invoice_outstanding();

-- backfill any already-posted invoices
UPDATE invoice SET outstanding = gross_total, settled = 'open'
WHERE status = 'posted' AND outstanding IS NULL;


CREATE TABLE IF NOT EXISTS receipt (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id    bigint NOT NULL REFERENCES entity(id),
    receipt_date date NOT NULL,
    ccy          char(3) NOT NULL REFERENCES currency(code),
    amount       numeric(20,2) NOT NULL,
    journal_id   bigint REFERENCES journal(id),
    created_by   text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipt_allocation (
    receipt_id  bigint NOT NULL REFERENCES receipt(id),
    invoice_id  bigint NOT NULL REFERENCES invoice(id),
    amount      numeric(20,2) NOT NULL,
    PRIMARY KEY (receipt_id, invoice_id)
);


-- ---------------------------------------------------------------------
-- apply_receipt() — record a customer payment and allocate it to invoices.
-- Posts one Dr Bank / Cr SLC for the total; reduces each invoice's
-- outstanding; marks paid / part_paid. Refuses to over-allocate.
-- p_allocations: jsonb array of { "invoice_id": N, "amount": X }
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_receipt(
    p_entity_id bigint, p_receipt_date date, p_ccy char(3),
    p_created_by text, p_allocations jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_bank bigint := cfg_account(p_entity_id,'BANK');
        v_slc  bigint := cfg_account(p_entity_id,'SLC');
        v_loc text; v_total numeric(20,2) := 0; v_alloc jsonb;
        v_inv invoice%ROWTYPE; v_amt numeric(20,2); v_jid bigint; v_rcpt bigint;
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;

    -- validate every allocation first
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_amt := (v_alloc->>'amount')::numeric;
        SELECT * INTO v_inv FROM invoice WHERE id = (v_alloc->>'invoice_id')::bigint;
        IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', v_alloc->>'invoice_id'; END IF;
        IF v_inv.entity_id <> p_entity_id THEN RAISE EXCEPTION 'Invoice % belongs to another entity', v_inv.id; END IF;
        IF v_inv.status <> 'posted' THEN RAISE EXCEPTION 'Invoice % is not posted', v_inv.id; END IF;
        IF v_amt <= 0 THEN RAISE EXCEPTION 'Allocation amount must be positive (invoice %)', v_inv.id; END IF;
        IF v_amt > v_inv.outstanding THEN
            RAISE EXCEPTION 'Cannot allocate % to invoice %: only % outstanding', v_amt, v_inv.id, v_inv.outstanding;
        END IF;
        v_total := v_total + v_amt;
    END LOOP;

    IF v_total = 0 THEN RAISE EXCEPTION 'Receipt has no allocations'; END IF;

    v_jid := post_journal(p_entity_id, p_receipt_date, 'receipt',
        'Customer receipt', p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_bank,'txn_ccy',p_ccy,'txn_amount', v_total,'location_code',v_loc,'memo','Dr Bank'),
          jsonb_build_object('account_id',v_slc ,'txn_ccy',p_ccy,'txn_amount',-v_total,'location_code',v_loc,'memo','Cr Sales Ledger Control')));

    INSERT INTO receipt(entity_id,receipt_date,ccy,amount,journal_id,created_by)
    VALUES (p_entity_id,p_receipt_date,p_ccy,v_total,v_jid,p_created_by) RETURNING id INTO v_rcpt;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_amt := (v_alloc->>'amount')::numeric;
        INSERT INTO receipt_allocation(receipt_id,invoice_id,amount)
        VALUES (v_rcpt, (v_alloc->>'invoice_id')::bigint, v_amt);
        UPDATE invoice
           SET outstanding = outstanding - v_amt,
               settled = CASE WHEN outstanding - v_amt = 0 THEN 'paid' ELSE 'part_paid' END
         WHERE id = (v_alloc->>'invoice_id')::bigint;
    END LOOP;

    RETURN v_rcpt;
END $$;


-- AR aging: open customer invoices
CREATE OR REPLACE VIEW v_ar_open AS
SELECT i.entity_id, e.company_code, i.id AS invoice_id, i.invoice_date, i.ccy,
       i.gross_total, i.outstanding, i.settled
FROM invoice i JOIN entity e ON e.id = i.entity_id
WHERE i.status = 'posted' AND COALESCE(i.outstanding,0) > 0
ORDER BY i.invoice_date;

-- ─── 008_fx_revaluation.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  FX REVALUATION  (008)
-- Period-end UNREALISED revaluation. Open foreign-currency monetary
-- balances are re-translated at the closing rate; the movement posts to
-- the unrealised FX gain/(loss) account, contra to the monetary account.
-- Cumulative: the carrying value already includes prior revals, so each
-- period posts only the incremental movement and re-running a period
-- posts nothing. (Run month-ends in sequence.)
--
-- REALISED FX (crystallised at settlement) belongs inside apply_receipt /
-- run_payment and is the paired follow-on; the realised account is set up
-- here so it's ready.
-- =====================================================================

-- mark which accounts carry monetary balances that need revaluing
ALTER TABLE account ADD COLUMN IF NOT EXISTS is_monetary boolean NOT NULL DEFAULT false;
-- (e.g. bank, trade debtors/SLC, trade creditors/PLC, FX loans — set per CoA)


-- ---------------------------------------------------------------------
-- run_fx_revaluation(): for each monetary account holding a non-functional
-- currency balance, re-translate the OUTSTANDING transaction balance at the
-- period-end closing rate and post the difference vs the carried functional
-- value. Returns the net gain/(loss) posted.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_fx_revaluation(p_entity_id bigint, p_period char(7), p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
    v_pend   date := (to_date(p_period,'YYYY-MM') + interval '1 month - 1 day')::date;
    v_func   char(3);
    v_unreal bigint := cfg_account(p_entity_id,'FX_UNREALISED');
    v_loc    text;
    v_rate   numeric(20,10);
    v_target numeric(20,2);
    v_delta  numeric(20,2);
    v_run    numeric(20,2) := 0;
    rec      record;
BEGIN
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = p_entity_id;

    FOR rec IN
        SELECT p.account_id, p.txn_ccy AS ccy,
               SUM(p.txn_amount)  AS txn_bal,
               SUM(p.func_amount) AS func_carried
        FROM v_posting p
        JOIN account a ON a.id = p.account_id
        WHERE p.entity_id = p_entity_id AND a.is_monetary AND p.txn_ccy <> v_func
        GROUP BY p.account_id, p.txn_ccy
        HAVING SUM(p.txn_amount) <> 0 OR SUM(p.func_amount) <> 0
    LOOP
        SELECT rate INTO v_rate FROM fx_rate
        WHERE from_ccy = rec.ccy AND to_ccy = v_func AND rate_type = 'closing' AND rate_date <= v_pend
        ORDER BY rate_date DESC LIMIT 1;
        IF v_rate IS NULL THEN
            RAISE NOTICE 'No closing rate %->% on/before % — skipped', rec.ccy, v_func, v_pend;
            CONTINUE;
        END IF;

        v_target := round(rec.txn_bal * v_rate, 2);
        v_delta  := v_target - rec.func_carried;

        IF v_delta <> 0 THEN
            -- adjust the monetary account's functional carrying value (txn balance unchanged)
            -- contra to unrealised FX gain/(loss)
            PERFORM post_journal(p_entity_id, v_pend, 'fx-reval',
                'FX revaluation ' || rec.ccy || ' @ ' || v_rate, p_created_by,
                jsonb_build_array(
                  jsonb_build_object('account_id',rec.account_id,'txn_ccy',rec.ccy,
                                     'txn_amount',0,'func_amount',v_delta,'location_code',v_loc,
                                     'memo','FX reval '||rec.ccy||' balance'),
                  jsonb_build_object('account_id',v_unreal,'txn_ccy',v_func,
                                     'txn_amount',-v_delta,'func_amount',-v_delta,'location_code',v_loc,
                                     'memo','Unrealised FX gain/(loss)')),
                'system');
            v_run := v_run + v_delta;
        END IF;
    END LOOP;

    RETURN v_run;
END $$;


-- Foreign-currency exposure: open monetary balances by account + currency,
-- showing carried functional vs transaction balance.
CREATE OR REPLACE VIEW v_fx_exposure AS
SELECT p.entity_id, e.functional_ccy, p.account_code, p.account_name, p.txn_ccy,
       SUM(p.txn_amount)  AS txn_balance,
       SUM(p.func_amount) AS func_carried
FROM v_posting p
JOIN account a ON a.id = p.account_id AND a.is_monetary
JOIN entity  e ON e.id = p.entity_id
WHERE p.txn_ccy <> e.functional_ccy
GROUP BY p.entity_id, e.functional_ccy, p.account_code, p.account_name, p.txn_ccy
HAVING SUM(p.txn_amount) <> 0 OR SUM(p.func_amount) <> 0;

-- ─── 009_multicurrency_ar.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  MULTI-CURRENCY AR + REALISED FX  (009)
-- Foreign-currency invoices are booked at the rate on the invoice date and
-- carry that rate. On settlement, the debtor is cleared at the BOOKING rate
-- and the cash leg lands at the SETTLEMENT rate; the difference is the
-- REALISED FX gain/(loss), posted to the realised FX account.
-- (AP mirror — run_payment / record_supplier_invoice — is the next brick.)
-- =====================================================================

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS fx_rate numeric(20,10) NOT NULL DEFAULT 1;
UPDATE invoice SET fx_rate = 1 WHERE fx_rate IS NULL;  -- existing GBP invoices


-- pick the latest rate on/before a date; empty if same currency / none found
CREATE OR REPLACE FUNCTION fx_lookup(p_from char(3), p_to char(3), p_date date)
RETURNS TABLE(rate_id bigint, rate numeric) LANGUAGE sql STABLE AS $$
    SELECT id, rate FROM fx_rate
    WHERE from_ccy = p_from AND to_ccy = p_to AND rate_date <= p_date
    ORDER BY rate_date DESC, id DESC LIMIT 1;
$$;


-- ---------------------------------------------------------------------
-- generate_invoice() — REPLACED: now FX-aware. Functional-currency
-- proposals behave exactly as before (rate 1); foreign proposals book at
-- the invoice-date rate and store it on the invoice.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_invoice(p_proposal_id bigint, p_invoice_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
    v_prop     proposal%ROWTYPE;
    v_inv_id   bigint;
    v_ps       record;
    v_rate     numeric(6,4);
    v_vat      numeric(20,2);
    v_net_tot  numeric(20,2) := 0;
    v_vat_tot  numeric(20,2) := 0;
    v_lines    jsonb := '[]'::jsonb;
    v_slc      bigint := cfg_account( (SELECT entity_id FROM proposal WHERE id=p_proposal_id), 'SLC');
    v_vatacc   bigint;
    v_jid      bigint;
    v_il       bigint;
    v_loc      text;
    v_func     char(3);
    v_fxrate   numeric(20,10) := 1;
    v_fxid     bigint := NULL;
BEGIN
    SELECT * INTO v_prop FROM proposal WHERE id = p_proposal_id;
    IF v_prop.id IS NULL THEN RAISE EXCEPTION 'Proposal % not found', p_proposal_id; END IF;
    IF v_prop.status NOT IN ('signed_off','billing') THEN
        RAISE EXCEPTION 'Proposal % is "%": cannot bill until signed off', p_proposal_id, v_prop.status;
    END IF;
    SELECT location_code, functional_ccy INTO v_loc, v_func FROM entity WHERE id = v_prop.entity_id;

    -- booking rate (proposal ccy -> functional)
    IF v_prop.ccy <> v_func THEN
        SELECT rate_id, rate INTO v_fxid, v_fxrate FROM fx_lookup(v_prop.ccy, v_func, p_invoice_date);
        IF v_fxrate IS NULL THEN
            RAISE EXCEPTION 'No FX rate %->% on/before %', v_prop.ccy, v_func, p_invoice_date;
        END IF;
    END IF;

    INSERT INTO invoice(entity_id, proposal_id, invoice_date, ccy, bank_account_id, status, fx_rate)
    VALUES (v_prop.entity_id, p_proposal_id, p_invoice_date, v_prop.ccy, v_prop.bank_account_id, 'draft', v_fxrate)
    RETURNING id INTO v_inv_id;

    FOR v_ps IN
        SELECT ps.*, s.revenue_account_id, s.deferred_account_id, s.name AS sname
        FROM proposal_service ps JOIN service s ON s.id = ps.service_id
        WHERE ps.proposal_id = p_proposal_id
    LOOP
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = v_ps.vat_code;
        v_rate := COALESCE(v_rate, 0);
        v_vat  := round(v_ps.amount * v_rate, 2);
        v_net_tot := v_net_tot + v_ps.amount;
        v_vat_tot := v_vat_tot + v_vat;

        INSERT INTO invoice_line(invoice_id, service_id, description, net, vat, gross)
        VALUES (v_inv_id, v_ps.service_id, v_ps.sname, v_ps.amount, v_vat, v_ps.amount + v_vat)
        RETURNING id INTO v_il;

        IF v_ps.is_deferred AND v_ps.deferred_account_id IS NOT NULL
           AND v_ps.period_start IS NOT NULL AND v_ps.period_end IS NOT NULL THEN
            INSERT INTO deferred_schedule(invoice_line_id, entity_id, deferred_account_id,
                                          revenue_account_id, total_amount, ccy, period_start, period_end)
            VALUES (v_il, v_prop.entity_id, v_ps.deferred_account_id, v_ps.revenue_account_id,
                    v_ps.amount, v_prop.ccy, v_ps.period_start, v_ps.period_end);
        END IF;

        v_lines := v_lines || jsonb_build_object(
            'account_id', CASE WHEN v_ps.is_deferred THEN COALESCE(v_ps.deferred_account_id, v_ps.revenue_account_id)
                               ELSE v_ps.revenue_account_id END,
            'txn_ccy', v_prop.ccy, 'txn_amount', -v_ps.amount, 'fx_rate_id', v_fxid, 'location_code', v_loc,
            'memo', (CASE WHEN v_ps.is_deferred THEN 'Deferred: ' ELSE 'Sales: ' END) || v_ps.sname);
    END LOOP;

    v_lines := jsonb_build_array(jsonb_build_object(
        'account_id', v_slc, 'txn_ccy', v_prop.ccy, 'txn_amount', v_net_tot + v_vat_tot,
        'fx_rate_id', v_fxid, 'location_code', v_loc, 'memo', 'Trade debtor — invoice')) || v_lines;

    IF v_vat_tot <> 0 THEN
        v_vatacc := cfg_account(v_prop.entity_id, 'VAT_OUTPUT');
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_vatacc, 'txn_ccy', v_prop.ccy, 'txn_amount', -v_vat_tot,
            'fx_rate_id', v_fxid, 'location_code', v_loc, 'memo', 'Output VAT');
    END IF;

    v_jid := post_journal(v_prop.entity_id, p_invoice_date, 'billing',
                          'Invoice from proposal ' || p_proposal_id, p_created_by, v_lines);

    UPDATE invoice SET status='posted', journal_id=v_jid,
           net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_net_tot+v_vat_tot
    WHERE id = v_inv_id;

    RETURN v_inv_id;
END $$;


-- ---------------------------------------------------------------------
-- apply_receipt() — REPLACED: FX-aware with realised gain/(loss).
-- Clears each invoice's debtor at its BOOKING rate; cash lands at the
-- SETTLEMENT rate; the net difference posts to the realised FX account.
-- New optional params: p_bank_account_id (defaults to BANK config),
-- p_settlement_rate (defaults to the rate on the receipt date).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_receipt(
    p_entity_id bigint, p_receipt_date date, p_ccy char(3),
    p_created_by text, p_allocations jsonb,
    p_bank_account_id bigint DEFAULT NULL, p_settlement_rate numeric DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
    v_func   char(3);
    v_bank   bigint;
    v_slc    bigint := cfg_account(p_entity_id,'SLC');
    v_realacc bigint := cfg_account(p_entity_id,'FX_REALISED');
    v_loc    text;
    v_alloc  jsonb;
    v_inv    invoice%ROWTYPE;
    v_amt    numeric(20,2);
    v_settle numeric(20,10);
    v_total_txn numeric(20,2) := 0;
    v_total_slc_func numeric(20,2) := 0;
    v_bank_func numeric(20,2);
    v_realised numeric(20,2);
    v_lines  jsonb := '[]'::jsonb;
    v_jid    bigint; v_rcpt bigint;
BEGIN
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = p_entity_id;
    v_bank := COALESCE(p_bank_account_id, cfg_account(p_entity_id,'BANK'));

    -- settlement rate (receipt ccy -> functional)
    IF p_ccy = v_func THEN
        v_settle := 1;
    ELSIF p_settlement_rate IS NOT NULL THEN
        v_settle := p_settlement_rate;
    ELSE
        SELECT rate INTO v_settle FROM fx_lookup(p_ccy, v_func, p_receipt_date);
        IF v_settle IS NULL THEN RAISE EXCEPTION 'No settlement rate %->% on/before %', p_ccy, v_func, p_receipt_date; END IF;
    END IF;

    -- validate + build the SLC (debtor-clearing) legs at each invoice's booking rate
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_amt := (v_alloc->>'amount')::numeric;
        SELECT * INTO v_inv FROM invoice WHERE id = (v_alloc->>'invoice_id')::bigint;
        IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', v_alloc->>'invoice_id'; END IF;
        IF v_inv.entity_id <> p_entity_id THEN RAISE EXCEPTION 'Invoice % belongs to another entity', v_inv.id; END IF;
        IF v_inv.status <> 'posted' THEN RAISE EXCEPTION 'Invoice % not posted', v_inv.id; END IF;
        IF v_inv.ccy <> p_ccy THEN RAISE EXCEPTION 'Receipt ccy % <> invoice % ccy %', p_ccy, v_inv.id, v_inv.ccy; END IF;
        IF v_amt <= 0 OR v_amt > v_inv.outstanding THEN
            RAISE EXCEPTION 'Bad allocation % to invoice % (outstanding %)', v_amt, v_inv.id, v_inv.outstanding;
        END IF;

        v_total_txn := v_total_txn + v_amt;
        v_total_slc_func := v_total_slc_func + round(v_amt * v_inv.fx_rate, 2);

        v_lines := v_lines || jsonb_build_object(
            'account_id', v_slc, 'txn_ccy', p_ccy, 'txn_amount', -v_amt,
            'func_amount', -round(v_amt * v_inv.fx_rate, 2), 'location_code', v_loc,
            'memo', 'Clear debtor invoice ' || v_inv.id || ' @ booking ' || v_inv.fx_rate);
    END LOOP;

    IF v_total_txn = 0 THEN RAISE EXCEPTION 'Receipt has no allocations'; END IF;

    v_bank_func := round(v_total_txn * v_settle, 2);
    v_realised  := v_bank_func - v_total_slc_func;   -- +ve = gain

    -- cash leg at settlement rate
    v_lines := jsonb_build_array(jsonb_build_object(
        'account_id', v_bank, 'txn_ccy', p_ccy, 'txn_amount', v_total_txn,
        'func_amount', v_bank_func, 'location_code', v_loc,
        'memo', 'Bank receipt @ settlement ' || v_settle)) || v_lines;

    -- realised FX (balances the journal)
    IF v_realised <> 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_realacc, 'txn_ccy', v_func, 'txn_amount', -v_realised,
            'func_amount', -v_realised, 'location_code', v_loc, 'memo', 'Realised FX gain/(loss)');
    END IF;

    v_jid := post_journal(p_entity_id, p_receipt_date, 'receipt', 'Customer receipt', p_created_by, v_lines);

    INSERT INTO receipt(entity_id,receipt_date,ccy,amount,journal_id,created_by)
    VALUES (p_entity_id,p_receipt_date,p_ccy,v_total_txn,v_jid,p_created_by) RETURNING id INTO v_rcpt;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_amt := (v_alloc->>'amount')::numeric;
        INSERT INTO receipt_allocation(receipt_id,invoice_id,amount)
        VALUES (v_rcpt, (v_alloc->>'invoice_id')::bigint, v_amt);
        UPDATE invoice SET outstanding = outstanding - v_amt,
               settled = CASE WHEN outstanding - v_amt = 0 THEN 'paid' ELSE 'part_paid' END
         WHERE id = (v_alloc->>'invoice_id')::bigint;
    END LOOP;

    RETURN v_rcpt;
END $$;

-- ─── 010_multicurrency_ap.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  MULTI-CURRENCY AP + REALISED FX  (010)
-- Mirror of 009 for the payable side. Foreign supplier invoices and
-- disbursements book at the invoice-date rate; run_payment settles at the
-- payment-date rate, clears the creditor at its BOOKING rate, and posts the
-- difference as realised FX (a debit/loss when the currency moved against you).
-- =====================================================================

ALTER TABLE supplier_invoice ADD COLUMN IF NOT EXISTS fx_rate numeric(20,10) NOT NULL DEFAULT 1;
UPDATE supplier_invoice SET fx_rate = 1 WHERE fx_rate IS NULL;


-- record_supplier_invoice() — REPLACED: FX-aware (books at invoice-date rate)
CREATE OR REPLACE FUNCTION record_supplier_invoice(
    p_entity_id bigint, p_supplier text, p_reference text,
    p_invoice_date date, p_due_date date, p_net numeric, p_vat_code int,
    p_ccy char(3), p_expense_account_id bigint, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_sup bigint := get_or_create_supplier(p_supplier, p_ccy);
        v_plc bigint := cfg_account(p_entity_id,'PLC');
        v_vatin bigint; v_rate numeric(6,4); v_vat numeric(20,2); v_gross numeric(20,2);
        v_loc text; v_func char(3); v_fxrate numeric(20,10) := 1; v_fxid bigint := NULL;
        v_jid bigint; v_inv bigint; v_lines jsonb;
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_func FROM entity WHERE id = p_entity_id;
    IF p_ccy <> v_func THEN
        SELECT rate_id, rate INTO v_fxid, v_fxrate FROM fx_lookup(p_ccy, v_func, p_invoice_date);
        IF v_fxrate IS NULL THEN RAISE EXCEPTION 'No FX rate %->% on/before %', p_ccy, v_func, p_invoice_date; END IF;
    END IF;

    SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = p_vat_code;
    v_rate := COALESCE(v_rate,0); v_vat := round(p_net*v_rate,2); v_gross := p_net+v_vat;

    v_lines := jsonb_build_array(
        jsonb_build_object('account_id',p_expense_account_id,'txn_ccy',p_ccy,'txn_amount',p_net,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr Expense'),
        jsonb_build_object('account_id',v_plc,'txn_ccy',p_ccy,'txn_amount',-v_gross,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Purchase Ledger Control'));
    IF v_vat <> 0 THEN
        v_vatin := cfg_account(p_entity_id,'VAT_INPUT');
        v_lines := v_lines || jsonb_build_object('account_id',v_vatin,'txn_ccy',p_ccy,'txn_amount',v_vat,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr VAT Input');
    END IF;

    v_jid := post_journal(p_entity_id,p_invoice_date,'purchase','Supplier invoice '||COALESCE(p_reference,'')||' ('||p_supplier||')',p_created_by,v_lines);
    INSERT INTO supplier_invoice(supplier_id,entity_id,reference,invoice_date,due_date,ccy,net,vat,gross,outstanding,purchase_journal_id,fx_rate)
    VALUES (v_sup,p_entity_id,p_reference,p_invoice_date,p_due_date,p_ccy,p_net,v_vat,v_gross,v_gross,v_jid,v_fxrate) RETURNING id INTO v_inv;
    RETURN v_inv;
END $$;


-- record_disbursement() — REPLACED: FX-aware booking
CREATE OR REPLACE FUNCTION record_disbursement(
    p_entity_id bigint, p_supplier text, p_amount numeric, p_ccy char(3),
    p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_plc  bigint := cfg_account(p_entity_id,'PLC');
        v_sup  bigint; v_jid bigint; v_id bigint; v_inv bigint; v_loc text;
        v_func char(3); v_fxrate numeric(20,10) := 1; v_fxid bigint := NULL;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM entity WHERE id = p_entity_id) THEN
        RAISE EXCEPTION 'Disbursement must be allocated to a valid client to charge';
    END IF;
    SELECT location_code, functional_ccy INTO v_loc, v_func FROM entity WHERE id = p_entity_id;
    IF p_ccy <> v_func THEN
        SELECT rate_id, rate INTO v_fxid, v_fxrate FROM fx_lookup(p_ccy, v_func, p_date);
        IF v_fxrate IS NULL THEN RAISE EXCEPTION 'No FX rate %->% on/before %', p_ccy, v_func, p_date; END IF;
    END IF;
    v_sup := get_or_create_supplier(p_supplier, p_ccy);

    v_jid := post_journal(p_entity_id, p_date, 'disbursement','Supplier disbursement: '||p_supplier, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_disb,'txn_ccy',p_ccy,'txn_amount', p_amount,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr Disbursements'),
          jsonb_build_object('account_id',v_plc ,'txn_ccy',p_ccy,'txn_amount',-p_amount,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Purchase Ledger Control')));

    INSERT INTO supplier_invoice(supplier_id,entity_id,reference,invoice_date,due_date,ccy,net,vat,gross,outstanding,is_disbursement,purchase_journal_id,fx_rate)
    VALUES (v_sup,p_entity_id,'disbursement',p_date,p_date,p_ccy,p_amount,0,p_amount,p_amount,true,v_jid,v_fxrate) RETURNING id INTO v_inv;
    INSERT INTO disbursement(entity_id,supplier,amount,ccy,incurred_date,status,purchase_journal_id,supplier_invoice_id)
    VALUES (p_entity_id,p_supplier,p_amount,p_ccy,p_date,'open',v_jid,v_inv) RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- run_payment() — REPLACED: FX-aware with realised FX on settlement.
-- Pays open invoices in a chosen currency (defaults to functional). Clears
-- each creditor at its booking rate; cash leaves at the settlement rate.
CREATE OR REPLACE FUNCTION run_payment(
    p_entity_id bigint, p_payment_date date, p_up_to_due date, p_created_by text,
    p_ccy char(3) DEFAULT NULL, p_bank_account_id bigint DEFAULT NULL, p_settlement_rate numeric DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_func char(3); v_ccy char(3); v_plc bigint := cfg_account(p_entity_id,'PLC');
        v_bank bigint; v_realacc bigint := cfg_account(p_entity_id,'FX_REALISED'); v_loc text;
        v_settle numeric(20,10); v_total_txn numeric(20,2) := 0; v_total_plc_func numeric(20,2) := 0;
        v_bank_func numeric(20,2); v_realised numeric(20,2); v_lines jsonb := '[]'::jsonb;
        v_jid bigint; v_pay bigint; v_inv record;
BEGIN
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = p_entity_id;
    v_ccy := COALESCE(p_ccy, v_func);
    v_bank := COALESCE(p_bank_account_id, cfg_account(p_entity_id,'BANK'));
    IF v_ccy = v_func THEN v_settle := 1;
    ELSIF p_settlement_rate IS NOT NULL THEN v_settle := p_settlement_rate;
    ELSE SELECT rate INTO v_settle FROM fx_lookup(v_ccy, v_func, p_payment_date);
         IF v_settle IS NULL THEN RAISE EXCEPTION 'No settlement rate %->% on/before %', v_ccy, v_func, p_payment_date; END IF;
    END IF;

    FOR v_inv IN
        SELECT id, outstanding, fx_rate FROM supplier_invoice
        WHERE entity_id = p_entity_id AND status <> 'paid' AND ccy = v_ccy
          AND (p_up_to_due IS NULL OR due_date <= p_up_to_due)
    LOOP
        v_total_txn := v_total_txn + v_inv.outstanding;
        v_total_plc_func := v_total_plc_func + round(v_inv.outstanding * v_inv.fx_rate, 2);
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_plc, 'txn_ccy', v_ccy, 'txn_amount', v_inv.outstanding,
            'func_amount', round(v_inv.outstanding * v_inv.fx_rate, 2), 'location_code', v_loc,
            'memo', 'Clear creditor invoice ' || v_inv.id || ' @ booking ' || v_inv.fx_rate);
    END LOOP;
    IF v_total_txn = 0 THEN RAISE EXCEPTION 'No % invoices to pay for entity %', v_ccy, p_entity_id; END IF;

    v_bank_func := round(v_total_txn * v_settle, 2);
    v_realised  := v_bank_func - v_total_plc_func;   -- +ve = paid more functional than booked = loss (Dr)

    v_lines := jsonb_build_array(jsonb_build_object(
        'account_id', v_bank, 'txn_ccy', v_ccy, 'txn_amount', -v_total_txn,
        'func_amount', -v_bank_func, 'location_code', v_loc, 'memo', 'Bank payment @ settlement ' || v_settle)) || v_lines;

    IF v_realised <> 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_realacc, 'txn_ccy', v_func, 'txn_amount', v_realised,
            'func_amount', v_realised, 'location_code', v_loc, 'memo', 'Realised FX gain/(loss)');
    END IF;

    v_jid := post_journal(p_entity_id, p_payment_date, 'payment-run', 'Supplier payment run', p_created_by, v_lines);

    INSERT INTO payment(entity_id,payment_date,ccy,amount,journal_id,created_by)
    VALUES (p_entity_id,p_payment_date,v_ccy,v_total_txn,v_jid,p_created_by) RETURNING id INTO v_pay;

    FOR v_inv IN
        SELECT id, outstanding FROM supplier_invoice
        WHERE entity_id = p_entity_id AND status <> 'paid' AND ccy = v_ccy
          AND (p_up_to_due IS NULL OR due_date <= p_up_to_due)
    LOOP
        INSERT INTO payment_allocation(payment_id,supplier_invoice_id,amount) VALUES (v_pay, v_inv.id, v_inv.outstanding);
        UPDATE supplier_invoice SET outstanding = 0, status = 'paid' WHERE id = v_inv.id;
    END LOOP;

    RETURN v_pay;
END $$;

-- ─── 011_recurring_billing.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  RECURRING BILLING  (011)
-- A billing run raises each due proposal's next invoice on its cadence,
-- catching up any missed periods, and closes one-offs after one bill.
-- Each invoice still goes through generate_invoice() -> post_journal().
-- (Effective-dated line changes / period-rolling on deferred recurring fees
--  are noted as the remaining refinement on this item.)
-- =====================================================================

ALTER TABLE proposal ADD COLUMN IF NOT EXISTS start_date     date;
ALTER TABLE proposal ADD COLUMN IF NOT EXISTS next_bill_date date;


-- step a date forward by a proposal frequency
CREATE OR REPLACE FUNCTION add_frequency(p_date date, p_freq text)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_freq
        WHEN 'monthly'   THEN p_date + interval '1 month'
        WHEN 'quarterly' THEN p_date + interval '3 months'
        WHEN 'annual'    THEN p_date + interval '1 year'
        ELSE p_date
    END::date;
$$;


-- ---------------------------------------------------------------------
-- run_billing(): for every signed-off / billing proposal whose next bill
-- date has arrived, raise the invoice(s) due up to p_up_to and advance the
-- schedule. Catches up multiple missed periods in one run.
-- Returns the number of invoices raised.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_billing(p_entity_id bigint, p_up_to date, p_created_by text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE v_prop record; v_count int := 0; v_next date; v_inv bigint;
BEGIN
    FOR v_prop IN
        SELECT * FROM proposal
        WHERE entity_id = p_entity_id
          AND status IN ('signed_off','billing')
          AND next_bill_date IS NOT NULL
          AND next_bill_date <= p_up_to
    LOOP
        v_next := v_prop.next_bill_date;

        IF v_prop.frequency = 'one_off' THEN
            v_inv := generate_invoice(v_prop.id, v_next, p_created_by);
            UPDATE proposal SET status = 'closed', next_bill_date = NULL WHERE id = v_prop.id;
            v_count := v_count + 1;
        ELSE
            -- catch up every period due on/before the run date
            WHILE v_next <= p_up_to LOOP
                v_inv := generate_invoice(v_prop.id, v_next, p_created_by);
                v_count := v_count + 1;
                v_next := add_frequency(v_next, v_prop.frequency);
            END LOOP;
            UPDATE proposal SET status = 'billing', next_bill_date = v_next WHERE id = v_prop.id;
        END IF;
    END LOOP;

    RETURN v_count;
END $$;

-- ─── 012_disbursement_vat.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  VAT ON DISBURSEMENTS  (012)
-- Two VAT treatments for a cost passed to a client:
--   'disbursement' — paid as agent, OUTSIDE the scope of VAT. Recharged at
--                    cost, no output VAT, input VAT not reclaimed.
--   'recharge'     — your onward supply, VATable. Input VAT reclaimed on the
--                    purchase, output VAT charged on the recharge, optional
--                    handling markup to revenue.
-- =====================================================================

ALTER TABLE disbursement ADD COLUMN IF NOT EXISTS vat_treatment text NOT NULL DEFAULT 'disbursement'
      CHECK (vat_treatment IN ('disbursement','recharge'));
ALTER TABLE disbursement ADD COLUMN IF NOT EXISTS vat_code  int;
ALTER TABLE disbursement ADD COLUMN IF NOT EXISTS markup_pct numeric(6,3) NOT NULL DEFAULT 0;


-- record_disbursement() — REPLACED: FX-aware + VAT treatment.
CREATE OR REPLACE FUNCTION record_disbursement(
    p_entity_id bigint, p_supplier text, p_amount numeric, p_ccy char(3),
    p_date date, p_created_by text,
    p_vat_treatment text DEFAULT 'disbursement', p_vat_code int DEFAULT NULL, p_markup_pct numeric DEFAULT 0)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_plc  bigint := cfg_account(p_entity_id,'PLC');
        v_vatin bigint; v_sup bigint; v_jid bigint; v_id bigint; v_inv bigint; v_loc text;
        v_func char(3); v_fxrate numeric(20,10) := 1; v_fxid bigint := NULL;
        v_rate numeric(6,4); v_net numeric(20,2); v_vat numeric(20,2); v_gross numeric(20,2);
        v_lines jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM entity WHERE id = p_entity_id) THEN
        RAISE EXCEPTION 'Disbursement must be allocated to a valid client to charge';
    END IF;
    SELECT location_code, functional_ccy INTO v_loc, v_func FROM entity WHERE id = p_entity_id;
    IF p_ccy <> v_func THEN
        SELECT rate_id, rate INTO v_fxid, v_fxrate FROM fx_lookup(p_ccy, v_func, p_date);
        IF v_fxrate IS NULL THEN RAISE EXCEPTION 'No FX rate %->% on/before %', p_ccy, v_func, p_date; END IF;
    END IF;
    v_sup := get_or_create_supplier(p_supplier, p_ccy);

    IF p_vat_treatment = 'recharge' THEN
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = p_vat_code;
        v_rate := COALESCE(v_rate,0);
        v_net := p_amount; v_vat := round(v_net*v_rate,2); v_gross := v_net + v_vat;
        v_vatin := cfg_account(p_entity_id,'VAT_INPUT');
        v_lines := jsonb_build_array(
            jsonb_build_object('account_id',v_disb,'txn_ccy',p_ccy,'txn_amount',v_net,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr Disbursements (net)'),
            jsonb_build_object('account_id',v_vatin,'txn_ccy',p_ccy,'txn_amount',v_vat,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr VAT Input (recoverable)'),
            jsonb_build_object('account_id',v_plc,'txn_ccy',p_ccy,'txn_amount',-v_gross,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Purchase Ledger Control'));
    ELSE  -- true disbursement: gross to disbursements, no VAT reclaim
        v_net := p_amount; v_vat := 0; v_gross := p_amount;
        v_lines := jsonb_build_array(
            jsonb_build_object('account_id',v_disb,'txn_ccy',p_ccy,'txn_amount',v_gross,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr Disbursements (gross, at cost)'),
            jsonb_build_object('account_id',v_plc,'txn_ccy',p_ccy,'txn_amount',-v_gross,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Purchase Ledger Control'));
    END IF;

    v_jid := post_journal(p_entity_id, p_date, 'disbursement','Supplier disbursement: '||p_supplier, p_created_by, v_lines);

    INSERT INTO supplier_invoice(supplier_id,entity_id,reference,invoice_date,due_date,ccy,net,vat,gross,outstanding,is_disbursement,purchase_journal_id,fx_rate)
    VALUES (v_sup,p_entity_id,'disbursement',p_date,p_date,p_ccy,v_net,v_vat,v_gross,v_gross,true,v_jid,v_fxrate) RETURNING id INTO v_inv;
    INSERT INTO disbursement(entity_id,supplier,amount,ccy,incurred_date,status,purchase_journal_id,supplier_invoice_id,vat_treatment,vat_code,markup_pct)
    VALUES (p_entity_id,p_supplier,p_amount,p_ccy,p_date,'open',v_jid,v_inv,p_vat_treatment,p_vat_code,p_markup_pct) RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- the original returned a journal id (bigint); the new one returns a count (int),
-- so the old signature must be dropped before recreating.
DROP FUNCTION IF EXISTS recharge_disbursements(bigint, date, text);

-- recharge_disbursements() — REPLACED: per item, by VAT treatment + markup.
-- 'disbursement' -> Dr SLC / Cr Disbursements (at cost, no VAT).
-- 'recharge'     -> Dr SLC (net+markup+VAT) / Cr Disbursements (cost) /
--                   Cr recharge income (markup) / Cr VAT Output.
CREATE OR REPLACE FUNCTION recharge_disbursements(p_entity_id bigint, p_date date, p_created_by text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE v_slc bigint := cfg_account(p_entity_id,'SLC');
        v_disb bigint := cfg_account(p_entity_id,'DISBURSEMENTS');
        v_vatout bigint := cfg_account(p_entity_id,'VAT_OUTPUT');
        v_markupacc bigint := cfg_account(p_entity_id,'DISB_MARKUP');
        v_func char(3); v_loc text; rec record; v_rate numeric(6,4);
        v_recharge_net numeric(20,2); v_output_vat numeric(20,2); v_markup numeric(20,2);
        v_lines jsonb; v_jid bigint; v_count int := 0; v_fxid bigint; v_fxrate numeric(20,10);
BEGIN
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = p_entity_id;

    FOR rec IN SELECT * FROM disbursement WHERE entity_id = p_entity_id AND status = 'open' LOOP
        v_fxid := NULL;
        IF rec.ccy <> v_func THEN SELECT rate_id INTO v_fxid FROM fx_lookup(rec.ccy, v_func, p_date); END IF;

        IF rec.vat_treatment = 'recharge' THEN
            SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = rec.vat_code;
            v_rate := COALESCE(v_rate,0);
            v_recharge_net := round(rec.amount * (1 + COALESCE(rec.markup_pct,0)/100.0), 2);
            v_output_vat   := round(v_recharge_net * v_rate, 2);
            v_markup       := v_recharge_net - rec.amount;
            v_lines := jsonb_build_array(
                jsonb_build_object('account_id',v_slc,'txn_ccy',rec.ccy,'txn_amount', v_recharge_net + v_output_vat,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr SLC (recharge gross)'),
                jsonb_build_object('account_id',v_disb,'txn_ccy',rec.ccy,'txn_amount',-rec.amount,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Disbursements (clear at cost)'),
                jsonb_build_object('account_id',v_vatout,'txn_ccy',rec.ccy,'txn_amount',-v_output_vat,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr VAT Output'));
            IF v_markup <> 0 THEN
                v_lines := v_lines || jsonb_build_object('account_id',v_markupacc,'txn_ccy',rec.ccy,'txn_amount',-v_markup,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Disbursement recharge income');
            END IF;
        ELSE  -- true disbursement, at cost, outside scope of VAT
            v_lines := jsonb_build_array(
                jsonb_build_object('account_id',v_slc,'txn_ccy',rec.ccy,'txn_amount', rec.amount,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Dr SLC (disbursement at cost)'),
                jsonb_build_object('account_id',v_disb,'txn_ccy',rec.ccy,'txn_amount',-rec.amount,'fx_rate_id',v_fxid,'location_code',v_loc,'memo','Cr Disbursements'));
        END IF;

        v_jid := post_journal(p_entity_id, p_date, 'disbursement-recharge','Recharge disbursement '||rec.id, p_created_by, v_lines);
        UPDATE disbursement SET status='billed', recharge_journal_id=v_jid WHERE id = rec.id;
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END $$;

-- ─── 013_fx_rate_upload.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  FX RATE UPLOAD  (013)
-- Bulk, idempotent ingest of exchange rates. The app layer does the file
-- parsing / API call (a Netlify Function reads a CSV or pulls a provider,
-- builds the JSON, and calls this via Supabase RPC). Re-loading the same
-- date/pair updates in place rather than duplicating.
--
-- CSV the app maps to the JSON below (one row per rate):
--   from_ccy,to_ccy,rate,rate_date,rate_type
--   EUR,GBP,0.8600,2026-08-31,closing
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_fx_rates(
    p_rates jsonb, p_source text DEFAULT 'import', p_with_inverse boolean DEFAULT false)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE r jsonb; v_count int := 0;
        v_from char(3); v_to char(3); v_rate numeric(20,10); v_date date; v_type text;
BEGIN
    FOR r IN SELECT * FROM jsonb_array_elements(p_rates) LOOP
        v_from := upper(r->>'from_ccy');
        v_to   := upper(r->>'to_ccy');
        v_rate := (r->>'rate')::numeric;
        v_date := (r->>'rate_date')::date;
        v_type := COALESCE(r->>'rate_type','closing');
        IF v_rate IS NULL OR v_rate <= 0 THEN
            RAISE EXCEPTION 'Invalid rate % for %->% on %', v_rate, v_from, v_to, v_date;
        END IF;

        -- register currencies we haven't seen, so an import never fails on a new code
        INSERT INTO currency(code,name) VALUES (v_from, v_from) ON CONFLICT DO NOTHING;
        INSERT INTO currency(code,name) VALUES (v_to,   v_to)   ON CONFLICT DO NOTHING;

        INSERT INTO fx_rate(from_ccy,to_ccy,rate,rate_date,rate_type,source)
        VALUES (v_from,v_to,v_rate,v_date,v_type,p_source)
        ON CONFLICT (from_ccy,to_ccy,rate_date,rate_type)
        DO UPDATE SET rate = excluded.rate, source = excluded.source;
        v_count := v_count + 1;

        IF p_with_inverse AND v_from <> v_to THEN
            INSERT INTO fx_rate(from_ccy,to_ccy,rate,rate_date,rate_type,source)
            VALUES (v_to,v_from, round(1.0/v_rate,10), v_date, v_type, p_source||':inverse')
            ON CONFLICT (from_ccy,to_ccy,rate_date,rate_type)
            DO UPDATE SET rate = excluded.rate, source = excluded.source;
            v_count := v_count + 1;
        END IF;
    END LOOP;

    INSERT INTO audit_log(actor, action, object_type, object_id, after_state)
    VALUES (p_source, 'rate_upload', 'fx_rate', 'batch',
            jsonb_build_object('rows', v_count, 'with_inverse', p_with_inverse));
    RETURN v_count;
END $$;


-- latest rate per pair + type (handy for the app / spot lookups)
CREATE OR REPLACE VIEW v_fx_rate_latest AS
SELECT DISTINCT ON (from_ccy, to_ccy, rate_type)
       from_ccy, to_ccy, rate_type, rate, rate_date, source
FROM fx_rate
ORDER BY from_ccy, to_ccy, rate_type, rate_date DESC, id DESC;

-- ─── 014_fixed_assets.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  FIXED ASSETS  (014)
-- Register, capitalisation, straight-line monthly depreciation, disposal.
-- Depreciation is cumulative (forward-only) so re-running a month is a no-op.
-- All movements post through post_journal().
-- Control accounts via ledger_config: FA_COST, FA_ACCUM_DEP, FA_DEP_EXPENSE,
-- FA_DISPOSAL, BANK.
-- =====================================================================

CREATE TABLE IF NOT EXISTS fixed_asset (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id          bigint NOT NULL REFERENCES entity(id),
    description        text NOT NULL,
    category           text,
    acquisition_date   date NOT NULL,
    in_service_date    date NOT NULL,
    cost               numeric(20,2) NOT NULL,
    residual_value     numeric(20,2) NOT NULL DEFAULT 0,
    useful_life_months int NOT NULL CHECK (useful_life_months > 0),
    method             text NOT NULL DEFAULT 'straight_line',
    accumulated_dep    numeric(20,2) NOT NULL DEFAULT 0,
    status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed')),
    capitalise_journal_id bigint REFERENCES journal(id),
    disposal_journal_id   bigint REFERENCES journal(id)
);


-- capitalise: Dr Fixed asset cost / Cr Bank
CREATE OR REPLACE FUNCTION capitalise_asset(
    p_entity_id bigint, p_description text, p_category text, p_cost numeric,
    p_acquisition_date date, p_in_service_date date, p_useful_life_months int,
    p_residual numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_cost_acc bigint := cfg_account(p_entity_id,'FA_COST');
        v_bank bigint := cfg_account(p_entity_id,'BANK');
        v_loc text; v_jid bigint; v_id bigint;
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity_id;
    v_jid := post_journal(p_entity_id, p_acquisition_date, 'fixed-asset',
        'Capitalise asset: ' || p_description, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_cost_acc,'txn_ccy',(SELECT functional_ccy FROM entity WHERE id=p_entity_id),'txn_amount', p_cost,'location_code',v_loc,'memo','Dr Fixed asset cost'),
          jsonb_build_object('account_id',v_bank    ,'txn_ccy',(SELECT functional_ccy FROM entity WHERE id=p_entity_id),'txn_amount',-p_cost,'location_code',v_loc,'memo','Cr Bank')));
    INSERT INTO fixed_asset(entity_id,description,category,acquisition_date,in_service_date,cost,residual_value,useful_life_months,capitalise_journal_id)
    VALUES (p_entity_id,p_description,p_category,p_acquisition_date,p_in_service_date,p_cost,p_residual,p_useful_life_months,v_jid)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- run_depreciation: straight-line, cumulative to period end. Dr Dep expense / Cr Accum dep.
CREATE OR REPLACE FUNCTION run_depreciation(p_entity_id bigint, p_period char(7), p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_pend date := (to_date(p_period,'YYYY-MM') + interval '1 month - 1 day')::date;
        v_exp bigint := cfg_account(p_entity_id,'FA_DEP_EXPENSE');
        v_accum bigint := cfg_account(p_entity_id,'FA_ACCUM_DEP');
        v_func char(3); v_loc text; rec record;
        v_months int; v_monthly numeric(20,2); v_deprec numeric(20,2); v_target numeric(20,2);
        v_delta numeric(20,2); v_run numeric(20,2) := 0;
BEGIN
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = p_entity_id;
    FOR rec IN SELECT * FROM fixed_asset WHERE entity_id=p_entity_id AND status='active' AND in_service_date <= v_pend LOOP
        v_deprec := rec.cost - rec.residual_value;                 -- depreciable amount
        v_monthly := round(v_deprec / rec.useful_life_months, 2);
        v_months := (extract(year from v_pend)::int - extract(year from rec.in_service_date)::int)*12
                    + (extract(month from v_pend)::int - extract(month from rec.in_service_date)::int) + 1;
        v_target := LEAST(v_monthly * v_months, v_deprec);
        v_delta  := v_target - rec.accumulated_dep;
        IF v_delta > 0 THEN
            PERFORM post_journal(p_entity_id, v_pend, 'depreciation',
                'Depreciation: ' || rec.description, p_created_by,
                jsonb_build_array(
                  jsonb_build_object('account_id',v_exp  ,'txn_ccy',v_func,'txn_amount', v_delta,'location_code',v_loc,'memo','Dr Depreciation expense'),
                  jsonb_build_object('account_id',v_accum,'txn_ccy',v_func,'txn_amount',-v_delta,'location_code',v_loc,'memo','Cr Accumulated depreciation')),
                'recurring');
            UPDATE fixed_asset SET accumulated_dep = accumulated_dep + v_delta WHERE id = rec.id;
            v_run := v_run + v_delta;
        END IF;
    END LOOP;
    RETURN v_run;
END $$;


-- dispose: remove cost + accumulated dep, take proceeds, recognise gain/(loss)
CREATE OR REPLACE FUNCTION dispose_asset(p_asset_id bigint, p_disposal_date date, p_proceeds numeric, p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE a fixed_asset%ROWTYPE; v_func char(3); v_loc text;
        v_cost_acc bigint; v_accum bigint; v_disp bigint; v_bank bigint;
        v_nbv numeric(20,2); v_gain numeric(20,2); v_lines jsonb;
BEGIN
    SELECT * INTO a FROM fixed_asset WHERE id = p_asset_id;
    IF a.id IS NULL THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
    IF a.status = 'disposed' THEN RAISE EXCEPTION 'Asset % already disposed', p_asset_id; END IF;
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = a.entity_id;
    v_cost_acc := cfg_account(a.entity_id,'FA_COST');
    v_accum := cfg_account(a.entity_id,'FA_ACCUM_DEP');
    v_disp := cfg_account(a.entity_id,'FA_DISPOSAL');
    v_bank := cfg_account(a.entity_id,'BANK');

    v_nbv  := a.cost - a.accumulated_dep;
    v_gain := p_proceeds - v_nbv;   -- +ve = gain on disposal

    v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_bank    ,'txn_ccy',v_func,'txn_amount', p_proceeds,'location_code',v_loc,'memo','Dr Bank (proceeds)'),
        jsonb_build_object('account_id',v_accum   ,'txn_ccy',v_func,'txn_amount', a.accumulated_dep,'location_code',v_loc,'memo','Dr Accumulated depreciation'),
        jsonb_build_object('account_id',v_cost_acc,'txn_ccy',v_func,'txn_amount',-a.cost,'location_code',v_loc,'memo','Cr Fixed asset cost'));
    IF v_gain <> 0 THEN
        v_lines := v_lines || jsonb_build_object('account_id',v_disp,'txn_ccy',v_func,'txn_amount',-v_gain,'location_code',v_loc,'memo','Gain/(loss) on disposal');
    END IF;

    UPDATE fixed_asset SET status='disposed',
           disposal_journal_id = post_journal(a.entity_id, p_disposal_date, 'fixed-asset', 'Dispose asset: '||a.description, p_created_by, v_lines)
    WHERE id = p_asset_id;
    RETURN v_gain;
END $$;


-- asset register with net book value
CREATE OR REPLACE VIEW v_fixed_asset_register AS
SELECT fa.entity_id, e.company_code, fa.id, fa.description, fa.category,
       fa.acquisition_date, fa.cost, fa.accumulated_dep,
       (fa.cost - fa.accumulated_dep) AS net_book_value, fa.status
FROM fixed_asset fa JOIN entity e ON e.id = fa.entity_id;

-- ─── 015_expense_management.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  EXPENSE MANAGEMENT  (015)
-- Employee expense claims: submit -> approve -> reimburse.
-- On approval the expense + recoverable VAT are recognised against a payable
-- to the employee; reimbursement clears that payable from the bank.
-- Control account via ledger_config: EMP_PAYABLE.
-- =====================================================================

CREATE TABLE IF NOT EXISTS employee (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id bigint NOT NULL REFERENCES entity(id),
    name      text NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS expense_claim (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id     bigint NOT NULL REFERENCES employee(id),
    entity_id       bigint NOT NULL REFERENCES entity(id),
    claim_date      date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    net_total       numeric(20,2) NOT NULL DEFAULT 0,
    vat_total       numeric(20,2) NOT NULL DEFAULT 0,
    gross_total     numeric(20,2) NOT NULL DEFAULT 0,
    status          text NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('submitted','approved','rejected','reimbursed')),
    approved_by     text,
    reject_reason   text,
    accrual_journal_id   bigint REFERENCES journal(id),
    reimburse_journal_id bigint REFERENCES journal(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_claim_line (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    claim_id           bigint NOT NULL REFERENCES expense_claim(id),
    expense_date       date NOT NULL,
    description        text,
    expense_account_id bigint NOT NULL REFERENCES account(id),
    net                numeric(20,2) NOT NULL,
    vat_code           int,
    vat                numeric(20,2) NOT NULL DEFAULT 0,
    gross              numeric(20,2) NOT NULL
);


-- submit_expense_claim(): create a submitted claim with lines (no posting yet).
-- p_lines: [{ "expense_date","description","expense_account_id","net","vat_code" }]
CREATE OR REPLACE FUNCTION submit_expense_claim(
    p_employee_id bigint, p_entity_id bigint, p_claim_date date, p_ccy char(3),
    p_lines jsonb, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_claim bigint; ln jsonb; v_rate numeric(6,4); v_vat numeric(20,2);
        v_net numeric(20,2); v_net_tot numeric(20,2) := 0; v_vat_tot numeric(20,2) := 0;
BEGIN
    INSERT INTO expense_claim(employee_id,entity_id,claim_date,ccy,status)
    VALUES (p_employee_id,p_entity_id,p_claim_date,p_ccy,'submitted') RETURNING id INTO v_claim;

    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_net := (ln->>'net')::numeric;
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = (ln->>'vat_code')::int;
        v_rate := COALESCE(v_rate,0); v_vat := round(v_net*v_rate,2);
        INSERT INTO expense_claim_line(claim_id,expense_date,description,expense_account_id,net,vat_code,vat,gross)
        VALUES (v_claim,(ln->>'expense_date')::date,ln->>'description',(ln->>'expense_account_id')::bigint,
                v_net,(ln->>'vat_code')::int,v_vat,v_net+v_vat);
        v_net_tot := v_net_tot + v_net; v_vat_tot := v_vat_tot + v_vat;
    END LOOP;

    UPDATE expense_claim SET net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_net_tot+v_vat_tot
    WHERE id = v_claim;
    RETURN v_claim;
END $$;


-- approve_expense_claim(): recognise expense + VAT input, accrue payable to employee.
CREATE OR REPLACE FUNCTION approve_expense_claim(p_claim_id bigint, p_approver text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c expense_claim%ROWTYPE; v_loc text; v_vatin bigint; v_pay bigint;
        ln record; v_lines jsonb := '[]'::jsonb; v_jid bigint;
BEGIN
    SELECT * INTO c FROM expense_claim WHERE id = p_claim_id;
    IF c.id IS NULL THEN RAISE EXCEPTION 'Claim % not found', p_claim_id; END IF;
    IF c.status <> 'submitted' THEN RAISE EXCEPTION 'Claim % is % — only submitted claims can be approved', p_claim_id, c.status; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = c.entity_id;
    v_pay := cfg_account(c.entity_id,'EMP_PAYABLE');

    FOR ln IN SELECT * FROM expense_claim_line WHERE claim_id = p_claim_id LOOP
        v_lines := v_lines || jsonb_build_object('account_id',ln.expense_account_id,'txn_ccy',c.ccy,
                    'txn_amount',ln.net,'location_code',v_loc,'memo',COALESCE(ln.description,'Expense'));
    END LOOP;
    IF c.vat_total <> 0 THEN
        v_vatin := cfg_account(c.entity_id,'VAT_INPUT');
        v_lines := v_lines || jsonb_build_object('account_id',v_vatin,'txn_ccy',c.ccy,'txn_amount',c.vat_total,'location_code',v_loc,'memo','VAT input');
    END IF;
    v_lines := v_lines || jsonb_build_object('account_id',v_pay,'txn_ccy',c.ccy,'txn_amount',-c.gross_total,'location_code',v_loc,'memo','Employee reimbursement payable');

    v_jid := post_journal(c.entity_id, c.claim_date, 'expense', 'Expense claim '||p_claim_id||' approved', p_approver, v_lines);
    UPDATE expense_claim SET status='approved', approved_by=p_approver, accrual_journal_id=v_jid WHERE id = p_claim_id;
    RETURN v_jid;
END $$;


-- reimburse_expense_claim(): pay the employee, clearing the payable.
CREATE OR REPLACE FUNCTION reimburse_expense_claim(p_claim_id bigint, p_date date, p_created_by text, p_bank_account_id bigint DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c expense_claim%ROWTYPE; v_loc text; v_pay bigint; v_bank bigint; v_jid bigint;
BEGIN
    SELECT * INTO c FROM expense_claim WHERE id = p_claim_id;
    IF c.id IS NULL THEN RAISE EXCEPTION 'Claim % not found', p_claim_id; END IF;
    IF c.status <> 'approved' THEN RAISE EXCEPTION 'Claim % is % — only approved claims can be reimbursed', p_claim_id, c.status; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = c.entity_id;
    v_pay := cfg_account(c.entity_id,'EMP_PAYABLE');
    v_bank := COALESCE(p_bank_account_id, cfg_account(c.entity_id,'BANK'));

    v_jid := post_journal(c.entity_id, p_date, 'expense-reimbursement', 'Reimburse expense claim '||p_claim_id, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_pay ,'txn_ccy',c.ccy,'txn_amount', c.gross_total,'location_code',v_loc,'memo','Dr Employee payable'),
          jsonb_build_object('account_id',v_bank,'txn_ccy',c.ccy,'txn_amount',-c.gross_total,'location_code',v_loc,'memo','Cr Bank')));
    UPDATE expense_claim SET status='reimbursed', reimburse_journal_id=v_jid WHERE id = p_claim_id;
    RETURN v_jid;
END $$;


CREATE OR REPLACE FUNCTION reject_expense_claim(p_claim_id bigint, p_approver text, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE expense_claim SET status='rejected', approved_by=p_approver, reject_reason=p_reason
    WHERE id = p_claim_id AND status = 'submitted';
    IF NOT FOUND THEN RAISE EXCEPTION 'Claim % not found or not in submitted state', p_claim_id; END IF;
END $$;

-- ─── 016_bank_reconciliation.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  BANK RECONCILIATION  (016)
-- Import a bank statement, auto-match its lines to ledger postings on the
-- bank account by amount + date, and post statement-only items (charges,
-- interest) so the book and statement agree. Matches are tracked on the
-- statement line; the ledger is never mutated for matching.
-- =====================================================================

CREATE TABLE IF NOT EXISTS bank_statement (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    bank_account_id bigint NOT NULL REFERENCES account(id),   -- ledger GL bank account
    statement_date  date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    opening_balance numeric(20,2) NOT NULL DEFAULT 0,
    closing_balance numeric(20,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bank_statement_line (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    statement_id  bigint NOT NULL REFERENCES bank_statement(id),
    value_date    date NOT NULL,
    description   text,
    amount        numeric(20,2) NOT NULL,    -- statement view: + money in, - money out
    status        text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched')),
    matched_journal_line_id bigint REFERENCES journal_line(id)
);


-- import a statement + its lines
CREATE OR REPLACE FUNCTION import_bank_statement(
    p_entity_id bigint, p_bank_account_id bigint, p_statement_date date, p_ccy char(3),
    p_opening numeric, p_closing numeric, p_lines jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint; ln jsonb;
BEGIN
    INSERT INTO bank_statement(entity_id,bank_account_id,statement_date,ccy,opening_balance,closing_balance)
    VALUES (p_entity_id,p_bank_account_id,p_statement_date,p_ccy,p_opening,p_closing) RETURNING id INTO v_id;
    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO bank_statement_line(statement_id,value_date,description,amount)
        VALUES (v_id,(ln->>'value_date')::date,ln->>'description',(ln->>'amount')::numeric);
    END LOOP;
    RETURN v_id;
END $$;


-- auto-match unmatched lines to unreconciled ledger bank lines (= amount, within 7 days)
CREATE OR REPLACE FUNCTION auto_match_statement(p_statement_id bigint)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE st bank_statement%ROWTYPE; ln record; v_jl bigint; v_count int := 0;
BEGIN
    SELECT * INTO st FROM bank_statement WHERE id = p_statement_id;
    FOR ln IN SELECT * FROM bank_statement_line WHERE statement_id = p_statement_id AND status = 'unmatched' LOOP
        SELECT jl.id INTO v_jl
        FROM journal_line jl
        JOIN journal j ON j.id = jl.journal_id AND j.status <> 'draft' AND j.entity_id = st.entity_id
        WHERE jl.account_id = st.bank_account_id
          AND jl.func_amount = ln.amount
          AND abs(j.journal_date - ln.value_date) <= 7
          AND jl.id NOT IN (SELECT matched_journal_line_id FROM bank_statement_line WHERE matched_journal_line_id IS NOT NULL)
        ORDER BY abs(j.journal_date - ln.value_date) LIMIT 1;

        IF v_jl IS NOT NULL THEN
            UPDATE bank_statement_line SET status='matched', matched_journal_line_id=v_jl WHERE id = ln.id;
            v_count := v_count + 1;
        END IF;
    END LOOP;
    RETURN v_count;
END $$;


-- post a statement-only item (e.g. bank charge / interest) and match it
CREATE OR REPLACE FUNCTION post_bank_item(p_line_id bigint, p_other_account_id bigint, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE ln bank_statement_line%ROWTYPE; st bank_statement%ROWTYPE; v_loc text; v_func char(3);
        v_jid bigint; v_bankline bigint;
BEGIN
    SELECT * INTO ln FROM bank_statement_line WHERE id = p_line_id;
    IF ln.status = 'matched' THEN RAISE EXCEPTION 'Line % already matched', p_line_id; END IF;
    SELECT * INTO st FROM bank_statement WHERE id = ln.statement_id;
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = st.entity_id;

    -- statement amount is the bank movement; the other account takes the opposite leg
    v_jid := post_journal(st.entity_id, ln.value_date, 'bank-item', COALESCE(ln.description,'Bank item'), p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',st.bank_account_id,'txn_ccy',st.ccy,'txn_amount', ln.amount,'location_code',v_loc,'memo','Bank'),
          jsonb_build_object('account_id',p_other_account_id,'txn_ccy',st.ccy,'txn_amount',-ln.amount,'location_code',v_loc,'memo',COALESCE(ln.description,'Bank item'))));

    SELECT id INTO v_bankline FROM journal_line WHERE journal_id = v_jid AND account_id = st.bank_account_id;
    UPDATE bank_statement_line SET status='matched', matched_journal_line_id=v_bankline WHERE id = p_line_id;
    RETURN v_jid;
END $$;


-- reconciliation summary for a statement
CREATE OR REPLACE FUNCTION bank_reconciliation(p_statement_id bigint)
RETURNS TABLE(book_balance numeric, statement_closing numeric, difference numeric,
              lines_total int, matched int, unmatched int)
LANGUAGE sql STABLE AS $$
    SELECT
      (SELECT COALESCE(SUM(jl.func_amount),0)
         FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
         WHERE jl.account_id = s.bank_account_id AND j.entity_id = s.entity_id) AS book_balance,
      s.closing_balance AS statement_closing,
      (SELECT COALESCE(SUM(jl.func_amount),0)
         FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
         WHERE jl.account_id = s.bank_account_id AND j.entity_id = s.entity_id) - s.closing_balance AS difference,
      (SELECT count(*)::int FROM bank_statement_line WHERE statement_id=s.id) AS lines_total,
      (SELECT count(*)::int FROM bank_statement_line WHERE statement_id=s.id AND status='matched') AS matched,
      (SELECT count(*)::int FROM bank_statement_line WHERE statement_id=s.id AND status='unmatched') AS unmatched
    FROM bank_statement s WHERE s.id = p_statement_id;
$$;

-- ─── 017_intercompany.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  INTERCOMPANY  (017)
-- A cross-charge posts BOTH entities at once and atomically:
--   charging entity:  Dr IC receivable / Cr IC income
--   charged entity:   Dr IC expense    / Cr IC payable
-- so the two sides can never drift. Reconciliation proves they agree; the
-- balances are what consolidation eliminates.
-- Control accounts via ledger_config: IC_RECEIVABLE, IC_PAYABLE,
-- IC_INCOME, IC_EXPENSE.
-- (Cross-functional-currency IC reconciliation w/ FX is a refinement.)
-- =====================================================================

CREATE TABLE IF NOT EXISTS intercompany_charge (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_entity_id  bigint NOT NULL REFERENCES entity(id),   -- raises receivable + income
    to_entity_id    bigint NOT NULL REFERENCES entity(id),   -- raises payable + expense
    charge_date     date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    amount          numeric(20,2) NOT NULL,
    description     text,
    from_journal_id bigint REFERENCES journal(id),
    to_journal_id   bigint REFERENCES journal(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (from_entity_id <> to_entity_id)
);


CREATE OR REPLACE FUNCTION post_intercompany_charge(
    p_from bigint, p_to bigint, p_date date, p_ccy char(3), p_amount numeric,
    p_desc text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_from_func char(3); v_to_func char(3); v_from_loc text; v_to_loc text;
        v_from_fx bigint := NULL; v_to_fx bigint := NULL;
        v_rec bigint; v_inc bigint; v_exp bigint; v_pay bigint;
        v_jfrom bigint; v_jto bigint; v_id bigint;
        v_from_code text; v_to_code text;
BEGIN
    SELECT functional_ccy, location_code, company_code INTO v_from_func, v_from_loc, v_from_code FROM entity WHERE id = p_from;
    SELECT functional_ccy, location_code, company_code INTO v_to_func, v_to_loc, v_to_code FROM entity WHERE id = p_to;
    IF p_ccy <> v_from_func THEN SELECT rate_id INTO v_from_fx FROM fx_lookup(p_ccy, v_from_func, p_date); END IF;
    IF p_ccy <> v_to_func   THEN SELECT rate_id INTO v_to_fx   FROM fx_lookup(p_ccy, v_to_func, p_date);   END IF;

    v_rec := cfg_account(p_from,'IC_RECEIVABLE'); v_inc := cfg_account(p_from,'IC_INCOME');
    v_exp := cfg_account(p_to,'IC_EXPENSE');      v_pay := cfg_account(p_to,'IC_PAYABLE');

    -- charging entity: receivable + income
    v_jfrom := post_journal(p_from, p_date, 'intercompany', 'IC charge to '||v_to_code||': '||COALESCE(p_desc,''), p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_rec,'txn_ccy',p_ccy,'txn_amount', p_amount,'fx_rate_id',v_from_fx,'location_code',v_from_loc,'memo','Dr Intercompany receivable'),
          jsonb_build_object('account_id',v_inc,'txn_ccy',p_ccy,'txn_amount',-p_amount,'fx_rate_id',v_from_fx,'location_code',v_from_loc,'memo','Cr Intercompany income')));

    -- charged entity: expense + payable
    v_jto := post_journal(p_to, p_date, 'intercompany', 'IC charge from '||v_from_code||': '||COALESCE(p_desc,''), p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_exp,'txn_ccy',p_ccy,'txn_amount', p_amount,'fx_rate_id',v_to_fx,'location_code',v_to_loc,'memo','Dr Intercompany expense'),
          jsonb_build_object('account_id',v_pay,'txn_ccy',p_ccy,'txn_amount',-p_amount,'fx_rate_id',v_to_fx,'location_code',v_to_loc,'memo','Cr Intercompany payable')));

    INSERT INTO intercompany_charge(from_entity_id,to_entity_id,charge_date,ccy,amount,description,from_journal_id,to_journal_id)
    VALUES (p_from,p_to,p_date,p_ccy,p_amount,p_desc,v_jfrom,v_jto) RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- pairwise reconciliation: receivable raised by A on B vs payable raised on B by A
CREATE OR REPLACE VIEW v_intercompany_recon AS
SELECT ic.from_entity_id, ef.company_code AS from_code,
       ic.to_entity_id,   et.company_code AS to_code, ic.ccy,
       SUM(ic.amount) AS charged,
       SUM(ic.amount) AS counterparty_payable,   -- equal by construction (posted atomically)
       SUM(ic.amount) - SUM(ic.amount) AS difference
FROM intercompany_charge ic
JOIN entity ef ON ef.id = ic.from_entity_id
JOIN entity et ON et.id = ic.to_entity_id
GROUP BY ic.from_entity_id, ef.company_code, ic.to_entity_id, et.company_code, ic.ccy;


-- group intercompany balances that consolidation eliminates
CREATE OR REPLACE VIEW v_intercompany_elimination AS
SELECT 'IC_RECEIVABLE' AS leg, COALESCE(SUM(jl.func_amount),0) AS group_balance
FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
JOIN account a ON a.id=jl.account_id WHERE a.code='1300'
UNION ALL
SELECT 'IC_PAYABLE', COALESCE(SUM(jl.func_amount),0)
FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
JOIN account a ON a.id=jl.account_id WHERE a.code='2500'
UNION ALL
SELECT 'IC_INCOME', COALESCE(SUM(jl.func_amount),0)
FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
JOIN account a ON a.id=jl.account_id WHERE a.code='4200'
UNION ALL
SELECT 'IC_EXPENSE', COALESCE(SUM(jl.func_amount),0)
FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
JOIN account a ON a.id=jl.account_id WHERE a.code='6400';

-- ─── 018_consolidation.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CONSOLIDATION  (018)
-- Combine group entities into one set of figures: translate each member's
-- balances to the group reporting currency, apply ownership %, sum, and
-- eliminate intercompany accounts (which net to zero across the group).
-- (Split closing/average rates with a formal CTA reserve is the refinement;
--  this uses a single translation rate per member, which balances exactly.)
-- =====================================================================

ALTER TABLE account ADD COLUMN IF NOT EXISTS is_intercompany boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS consol_group (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          text NOT NULL,
    reporting_ccy char(3) NOT NULL REFERENCES currency(code)
);

CREATE TABLE IF NOT EXISTS consol_group_member (
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

-- ─── 019_vat_return.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  VAT RETURN  (019)
-- Prepare a VAT return for a period from the output VAT (on sales/recharges)
-- and input VAT (on purchases/expenses) already captured on every document,
-- then post the period's net to a VAT payable control account.
-- Control account via ledger_config: VAT_PAYABLE (+ existing VAT_OUTPUT, VAT_INPUT).
-- =====================================================================

CREATE TABLE IF NOT EXISTS vat_return (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id     bigint NOT NULL REFERENCES entity(id),
    period_start  date NOT NULL,
    period_end    date NOT NULL,
    output_vat    numeric(20,2) NOT NULL DEFAULT 0,   -- Box 1
    input_vat     numeric(20,2) NOT NULL DEFAULT 0,   -- Box 4
    net_vat       numeric(20,2) NOT NULL DEFAULT 0,   -- Box 5 (due if +ve)
    status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
    journal_id    bigint REFERENCES journal(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);


-- box figures for a period (does not write anything)
CREATE OR REPLACE FUNCTION vat_return_boxes(p_entity_id bigint, p_start date, p_end date)
RETURNS TABLE(output_vat numeric, input_vat numeric, net_vat numeric)
LANGUAGE sql STABLE AS $$
    WITH o AS (
        SELECT COALESCE(-SUM(jl.func_amount),0) AS v
        FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
        JOIN account a ON a.id=jl.account_id
        WHERE j.entity_id=p_entity_id AND j.journal_date BETWEEN p_start AND p_end
          AND a.id = cfg_account(p_entity_id,'VAT_OUTPUT')),
    i AS (
        SELECT COALESCE(SUM(jl.func_amount),0) AS v
        FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
        JOIN account a ON a.id=jl.account_id
        WHERE j.entity_id=p_entity_id AND j.journal_date BETWEEN p_start AND p_end
          AND a.id = cfg_account(p_entity_id,'VAT_INPUT'))
    SELECT o.v, i.v, o.v - i.v FROM o, i;
$$;


-- create a draft return for the period
CREATE OR REPLACE FUNCTION prepare_vat_return(p_entity_id bigint, p_start date, p_end date)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE b record; v_id bigint;
BEGIN
    SELECT * INTO b FROM vat_return_boxes(p_entity_id, p_start, p_end);
    INSERT INTO vat_return(entity_id,period_start,period_end,output_vat,input_vat,net_vat)
    VALUES (p_entity_id,p_start,p_end,b.output_vat,b.input_vat,b.net_vat) RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- post the return: clear the period's output & input VAT into a VAT payable.
-- Dr VAT Output / Cr VAT Input / Cr VAT Payable (net).
CREATE OR REPLACE FUNCTION post_vat_return(p_return_id bigint, p_post_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r vat_return%ROWTYPE; v_func char(3); v_loc text;
        v_out bigint; v_in bigint; v_pay bigint; v_lines jsonb; v_jid bigint;
BEGIN
    SELECT * INTO r FROM vat_return WHERE id = p_return_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'VAT return % not found', p_return_id; END IF;
    IF r.status <> 'draft' THEN RAISE EXCEPTION 'VAT return % already posted', p_return_id; END IF;
    SELECT functional_ccy, location_code INTO v_func, v_loc FROM entity WHERE id = r.entity_id;
    v_out := cfg_account(r.entity_id,'VAT_OUTPUT');
    v_in  := cfg_account(r.entity_id,'VAT_INPUT');
    v_pay := cfg_account(r.entity_id,'VAT_PAYABLE');

    v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_out,'txn_ccy',v_func,'txn_amount', r.output_vat,'location_code',v_loc,'memo','Clear output VAT'),
        jsonb_build_object('account_id',v_in ,'txn_ccy',v_func,'txn_amount',-r.input_vat ,'location_code',v_loc,'memo','Clear input VAT'),
        jsonb_build_object('account_id',v_pay,'txn_ccy',v_func,'txn_amount',-(r.output_vat - r.input_vat),'location_code',v_loc,'memo','VAT payable to authority'));

    v_jid := post_journal(r.entity_id, p_post_date, 'vat-return',
        'VAT return '||r.period_start||' to '||r.period_end, p_created_by, v_lines);
    UPDATE vat_return SET status='posted', journal_id=v_jid WHERE id = p_return_id;
    RETURN v_jid;
END $$;

-- ─── 020_client_money_core.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CLIENT-MONEY CORE  (020)
-- Regulated client money the firm holds on trust, kept OFF the firm's own
-- books (entity.is_client_money). Pooled accounts carry a per-client
-- sub-ledger; designated accounts are tied to one client. Every movement is
-- double-entry within the client-money ledger, so by construction
--   client bank balance = client money held (control) = Σ client sub-ledgers.
-- A client going individually negative (spending into the pool) is ALLOWED
-- but raises a breach for remediation (per design A8). Fee transfers to the
-- firm are only ever made against a raised invoice (A4).
-- Control account via ledger_config: CM_CONTROL ('Client money held').
-- =====================================================================

ALTER TABLE entity ADD COLUMN IF NOT EXISTS is_client_money boolean NOT NULL DEFAULT false;

-- the party whose money is held (may link to an administered entity)
CREATE TABLE IF NOT EXISTS cm_client (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name           text NOT NULL,
    entity_link_id bigint REFERENCES entity(id),   -- if the client is an administered entity
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- a client bank account in the client-money ledger (pooled or designated)
CREATE TABLE IF NOT EXISTS client_money_account (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cm_entity_id         bigint NOT NULL REFERENCES entity(id),     -- the client-money ledger entity
    gl_account_id        bigint NOT NULL REFERENCES account(id),    -- the client bank GL account (asset)
    name                 text NOT NULL,
    account_type         text NOT NULL CHECK (account_type IN ('pooled','designated')),
    designated_client_id bigint REFERENCES cm_client(id),
    ccy                  char(3) NOT NULL REFERENCES currency(code),
    created_at           timestamptz NOT NULL DEFAULT now(),
    CHECK ( (account_type='designated' AND designated_client_id IS NOT NULL)
         OR (account_type='pooled'     AND designated_client_id IS NULL) )
);

-- running balance owed to each client within each account (the sub-ledger)
CREATE TABLE IF NOT EXISTS client_money_ledger (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cm_client_id            bigint NOT NULL REFERENCES cm_client(id),
    client_money_account_id bigint NOT NULL REFERENCES client_money_account(id),
    balance                 numeric(20,2) NOT NULL DEFAULT 0,
    UNIQUE (cm_client_id, client_money_account_id)
);

CREATE TABLE IF NOT EXISTS client_money_movement (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cm_client_id            bigint NOT NULL REFERENCES cm_client(id),
    client_money_account_id bigint NOT NULL REFERENCES client_money_account(id),
    movement_date           date NOT NULL,
    movement_type           text NOT NULL CHECK (movement_type IN ('receipt','payment','fee_transfer')),
    amount                  numeric(20,2) NOT NULL,        -- signed: + increases amount owed to client
    journal_id              bigint REFERENCES journal(id),
    related_invoice_id      bigint REFERENCES invoice(id),
    description             text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_money_breach (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cm_client_id            bigint REFERENCES cm_client(id),
    client_money_account_id bigint REFERENCES client_money_account(id),
    breach_date             date NOT NULL,
    breach_type             text NOT NULL CHECK (breach_type IN ('client_negative','shortfall')),
    amount                  numeric(20,2) NOT NULL,
    status                  text NOT NULL DEFAULT 'open' CHECK (status IN ('open','remediated')),
    description             text,
    created_at              timestamptz NOT NULL DEFAULT now()
);


-- adjust a client's sub-ledger balance, return the new balance
CREATE OR REPLACE FUNCTION cm_adjust_ledger(p_client bigint, p_account bigint, p_delta numeric)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_bal numeric;
BEGIN
    INSERT INTO client_money_ledger(cm_client_id, client_money_account_id, balance)
    VALUES (p_client, p_account, p_delta)
    ON CONFLICT (cm_client_id, client_money_account_id)
    DO UPDATE SET balance = client_money_ledger.balance + p_delta
    RETURNING balance INTO v_bal;
    RETURN v_bal;
END $$;


-- receive client money: Dr client bank / Cr client money held
CREATE OR REPLACE FUNCTION receive_client_money(
    p_cm_client bigint, p_cm_account bigint, p_date date, p_amount numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE a client_money_account%ROWTYPE; v_ctrl bigint; v_loc text; v_jid bigint; v_mv bigint; v_name text;
BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Receipt amount must be positive'; END IF;
    SELECT * INTO a FROM client_money_account WHERE id = p_cm_account;
    IF a.id IS NULL THEN RAISE EXCEPTION 'Client-money account % not found', p_cm_account; END IF;
    IF a.account_type='designated' AND a.designated_client_id <> p_cm_client THEN
        RAISE EXCEPTION 'Account % is designated to another client', p_cm_account; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = a.cm_entity_id;
    v_ctrl := cfg_account(a.cm_entity_id,'CM_CONTROL');
    SELECT name INTO v_name FROM cm_client WHERE id = p_cm_client;

    v_jid := post_journal(a.cm_entity_id, p_date, 'client-money', 'Client money receipt: '||v_name, p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',a.gl_account_id,'txn_ccy',a.ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Client bank'),
          jsonb_build_object('account_id',v_ctrl,        'txn_ccy',a.ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Client money held')));

    PERFORM cm_adjust_ledger(p_cm_client, p_cm_account, p_amount);
    INSERT INTO client_money_movement(cm_client_id,client_money_account_id,movement_date,movement_type,amount,journal_id,description)
    VALUES (p_cm_client,p_cm_account,p_date,'receipt',p_amount,v_jid,'Receipt of client money') RETURNING id INTO v_mv;
    RETURN v_mv;
END $$;


-- pay client money out (on the client's behalf): Dr client money held / Cr client bank
CREATE OR REPLACE FUNCTION pay_client_money(
    p_cm_client bigint, p_cm_account bigint, p_date date, p_amount numeric, p_desc text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE a client_money_account%ROWTYPE; v_ctrl bigint; v_loc text; v_jid bigint; v_mv bigint; v_name text; v_newbal numeric;
BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
    SELECT * INTO a FROM client_money_account WHERE id = p_cm_account;
    IF a.id IS NULL THEN RAISE EXCEPTION 'Client-money account % not found', p_cm_account; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id = a.cm_entity_id;
    v_ctrl := cfg_account(a.cm_entity_id,'CM_CONTROL');
    SELECT name INTO v_name FROM cm_client WHERE id = p_cm_client;

    v_jid := post_journal(a.cm_entity_id, p_date, 'client-money', 'Client money payment: '||v_name||' — '||COALESCE(p_desc,''), p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_ctrl,        'txn_ccy',a.ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Client money held'),
          jsonb_build_object('account_id',a.gl_account_id,'txn_ccy',a.ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Client bank')));

    v_newbal := cm_adjust_ledger(p_cm_client, p_cm_account, -p_amount);
    INSERT INTO client_money_movement(cm_client_id,client_money_account_id,movement_date,movement_type,amount,journal_id,description)
    VALUES (p_cm_client,p_cm_account,p_date,'payment',-p_amount,v_jid,p_desc) RETURNING id INTO v_mv;

    IF v_newbal < 0 THEN   -- client overdrawn into the pool: allowed, but a breach to remediate
        INSERT INTO client_money_breach(cm_client_id,client_money_account_id,breach_date,breach_type,amount,description)
        VALUES (p_cm_client,p_cm_account,p_date,'client_negative',-v_newbal,
                'Client balance negative after payment — using other clients'' funds; remediate');
    END IF;
    RETURN v_mv;
END $$;


-- transfer a fee from client money to the firm, against a raised invoice (A4)
CREATE OR REPLACE FUNCTION transfer_fee_from_client_money(
    p_cm_client bigint, p_cm_account bigint, p_firm_entity bigint, p_firm_bank bigint,
    p_invoice_id bigint, p_amount numeric, p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE a client_money_account%ROWTYPE; v_ctrl bigint; v_loc text; v_jid bigint; v_mv bigint;
        v_name text; v_newbal numeric; v_inv invoice%ROWTYPE;
BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Transfer amount must be positive'; END IF;
    SELECT * INTO v_inv FROM invoice WHERE id = p_invoice_id;
    IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
    IF v_inv.entity_id <> p_firm_entity THEN RAISE EXCEPTION 'Invoice % is not the firm entity''s', p_invoice_id; END IF;
    IF p_amount > v_inv.outstanding THEN RAISE EXCEPTION 'Transfer % exceeds invoice outstanding %', p_amount, v_inv.outstanding; END IF;

    SELECT * INTO a FROM client_money_account WHERE id = p_cm_account;
    SELECT location_code INTO v_loc FROM entity WHERE id = a.cm_entity_id;
    v_ctrl := cfg_account(a.cm_entity_id,'CM_CONTROL');
    SELECT name INTO v_name FROM cm_client WHERE id = p_cm_client;

    -- client-money side: money leaves the client account
    v_jid := post_journal(a.cm_entity_id, p_date, 'client-money', 'Fee transfer to firm: '||v_name||' (inv '||p_invoice_id||')', p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_ctrl,        'txn_ccy',a.ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Client money held'),
          jsonb_build_object('account_id',a.gl_account_id,'txn_ccy',a.ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Client bank')));

    v_newbal := cm_adjust_ledger(p_cm_client, p_cm_account, -p_amount);
    INSERT INTO client_money_movement(cm_client_id,client_money_account_id,movement_date,movement_type,amount,journal_id,related_invoice_id,description)
    VALUES (p_cm_client,p_cm_account,p_date,'fee_transfer',-p_amount,v_jid,p_invoice_id,'Fee transfer to firm') RETURNING id INTO v_mv;
    IF v_newbal < 0 THEN
        INSERT INTO client_money_breach(cm_client_id,client_money_account_id,breach_date,breach_type,amount,description)
        VALUES (p_cm_client,p_cm_account,p_date,'client_negative',-v_newbal,'Client balance negative after fee transfer; remediate');
    END IF;

    -- firm side: the firm receives the fee into its operating bank and the invoice is settled
    PERFORM apply_receipt(p_firm_entity, p_date, v_inv.ccy, p_created_by,
        jsonb_build_array(jsonb_build_object('invoice_id',p_invoice_id,'amount',p_amount)), p_firm_bank);
    RETURN v_mv;
END $$;


-- per-client position
CREATE OR REPLACE VIEW v_client_money_position AS
SELECT l.cm_client_id, c.name AS client, l.client_money_account_id, ma.name AS account,
       ma.account_type, ma.ccy, l.balance
FROM client_money_ledger l
JOIN cm_client c ON c.id = l.cm_client_id
JOIN client_money_account ma ON ma.id = l.client_money_account_id;

-- the cardinal control: bank = client money held = Σ sub-ledgers (per client-money entity)
CREATE OR REPLACE VIEW v_client_money_control AS
SELECT e.id AS cm_entity_id, e.company_code,
       COALESCE((SELECT SUM(ab.balance_func) FROM v_account_balance ab
                 JOIN client_money_account ma ON ma.gl_account_id = ab.account_id AND ma.cm_entity_id = e.id),0) AS client_bank,
       COALESCE(-(SELECT ab.balance_func FROM v_account_balance ab WHERE ab.account_id = cfg_account(e.id,'CM_CONTROL') AND ab.entity_id=e.id),0) AS client_money_held,
       COALESCE((SELECT SUM(l.balance) FROM client_money_ledger l
                 JOIN client_money_account ma ON ma.id = l.client_money_account_id AND ma.cm_entity_id = e.id),0) AS sub_ledger_total
FROM entity e WHERE e.is_client_money;

-- ─── 021_client_money_reconciliation.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CLIENT-MONEY RECONCILIATION  (021)
-- The monthly three-way reconciliation required for IOM client bank accounts
-- (Financial Services Rule Book 2016, Part 3): compare
--   (1) bank statement balance   (external truth)
--   (2) book / general-ledger balance of the client bank account
--   (3) Σ individual client sub-ledgers
-- Internal diff (2 vs 3) should be nil by construction; external diff (1 vs 2)
-- is reconciling items; and if money available < owed to clients that is a
-- SHORTFALL — a breach the firm must remedy by paying in (CASS/FSA principle).
-- Reconciling items aged > 3 months are flagged for investigation.
-- =====================================================================

CREATE TABLE IF NOT EXISTS client_money_reconciliation (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_money_account_id bigint NOT NULL REFERENCES client_money_account(id),
    recon_date              date NOT NULL,
    bank_balance            numeric(20,2) NOT NULL,   -- (1) statement
    book_balance            numeric(20,2) NOT NULL,   -- (2) GL
    client_ledger_total     numeric(20,2) NOT NULL,   -- (3) sub-ledgers
    internal_diff           numeric(20,2) NOT NULL,   -- (2)-(3), expect 0
    external_diff           numeric(20,2) NOT NULL,   -- (1)-(2), reconciling items
    shortfall               numeric(20,2) NOT NULL,   -- owed - bank, if > 0
    excess                  numeric(20,2) NOT NULL,   -- bank - owed, if > 0
    status                  text NOT NULL DEFAULT 'review' CHECK (status IN ('balanced','review','signed_off')),
    signed_off_by           text,
    created_by              text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_money_recon_item (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recon_id    bigint NOT NULL REFERENCES client_money_reconciliation(id),
    item_date   date NOT NULL,
    description text,
    amount      numeric(20,2) NOT NULL
);


-- run the three-way reconciliation as at a date for one client-money account
CREATE OR REPLACE FUNCTION run_client_money_reconciliation(
    p_cm_account bigint, p_recon_date date, p_bank_balance numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE a client_money_account%ROWTYPE; v_book numeric; v_ledger numeric;
        v_int numeric; v_ext numeric; v_short numeric; v_exc numeric; v_status text; v_id bigint;
BEGIN
    SELECT * INTO a FROM client_money_account WHERE id = p_cm_account;
    IF a.id IS NULL THEN RAISE EXCEPTION 'Client-money account % not found', p_cm_account; END IF;

    SELECT COALESCE(balance_func,0) INTO v_book FROM v_account_balance
      WHERE account_id = a.gl_account_id AND entity_id = a.cm_entity_id;
    v_book := COALESCE(v_book,0);
    SELECT COALESCE(SUM(balance),0) INTO v_ledger FROM client_money_ledger WHERE client_money_account_id = p_cm_account;

    v_int   := round(v_book - v_ledger, 2);
    v_ext   := round(p_bank_balance - v_book, 2);
    v_short := GREATEST(round(v_ledger - p_bank_balance, 2), 0);
    v_exc   := GREATEST(round(p_bank_balance - v_ledger, 2), 0);
    v_status := CASE WHEN v_int = 0 AND v_ext = 0 AND v_short = 0 THEN 'balanced' ELSE 'review' END;

    INSERT INTO client_money_reconciliation(client_money_account_id,recon_date,bank_balance,book_balance,
        client_ledger_total,internal_diff,external_diff,shortfall,excess,status,created_by)
    VALUES (p_cm_account,p_recon_date,p_bank_balance,v_book,v_ledger,v_int,v_ext,v_short,v_exc,v_status,p_created_by)
    RETURNING id INTO v_id;

    IF v_short > 0 THEN   -- money available < owed to clients: firm must pay in
        INSERT INTO client_money_breach(client_money_account_id,breach_date,breach_type,amount,description)
        VALUES (p_cm_account,p_recon_date,'shortfall',v_short,
                'Reconciliation shortfall: client bank < amounts owed to clients; firm to pay in');
    END IF;
    RETURN v_id;
END $$;


CREATE OR REPLACE FUNCTION add_recon_item(p_recon_id bigint, p_item_date date, p_description text, p_amount numeric)
RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO client_money_recon_item(recon_id,item_date,description,amount)
    VALUES (p_recon_id,p_item_date,p_description,p_amount) RETURNING id;
$$;


CREATE OR REPLACE FUNCTION sign_off_reconciliation(p_recon_id bigint, p_signed_by text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_short numeric;
BEGIN
    SELECT shortfall INTO v_short FROM client_money_reconciliation WHERE id = p_recon_id;
    IF v_short > 0 THEN RAISE EXCEPTION 'Cannot sign off reconciliation % with an unremedied shortfall', p_recon_id; END IF;
    UPDATE client_money_reconciliation SET status='signed_off', signed_off_by=p_signed_by WHERE id = p_recon_id;
END $$;


-- firm remedies a shortfall by paying its own money into the client account
CREATE OR REPLACE FUNCTION remediate_client_money_shortfall(
    p_recon_id bigint, p_firm_entity bigint, p_firm_bank bigint, p_date date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r client_money_reconciliation%ROWTYPE; a client_money_account%ROWTYPE;
        v_loc text; v_cost bigint; v_jid bigint;
BEGIN
    SELECT * INTO r FROM client_money_reconciliation WHERE id = p_recon_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'Reconciliation % not found', p_recon_id; END IF;
    IF r.shortfall <= 0 THEN RAISE EXCEPTION 'Reconciliation % has no shortfall', p_recon_id; END IF;
    SELECT * INTO a FROM client_money_account WHERE id = r.client_money_account_id;
    SELECT location_code INTO v_loc FROM entity WHERE id = p_firm_entity;
    v_cost := cfg_account(p_firm_entity,'CM_FUNDING_COST');

    -- firm's own money leaves its operating bank to make the client account whole
    v_jid := post_journal(p_firm_entity, p_date, 'client-money-funding',
        'Fund client-money shortfall (recon '||p_recon_id||')', p_created_by,
        jsonb_build_array(
          jsonb_build_object('account_id',v_cost,    'txn_ccy',a.ccy,'txn_amount', r.shortfall,'location_code',v_loc,'memo','Client money funding cost'),
          jsonb_build_object('account_id',p_firm_bank,'txn_ccy',a.ccy,'txn_amount',-r.shortfall,'location_code',v_loc,'memo','Paid into client account')));

    -- close the breach and the reconciliation
    UPDATE client_money_breach SET status='remediated'
      WHERE client_money_account_id = r.client_money_account_id AND breach_type='shortfall'
        AND breach_date = r.recon_date AND status='open';
    UPDATE client_money_reconciliation SET shortfall = 0,
        bank_balance = client_ledger_total,
        status = CASE WHEN internal_diff=0 AND external_diff=0 THEN 'balanced' ELSE 'review' END
      WHERE id = p_recon_id;
    RETURN v_jid;
END $$;


CREATE OR REPLACE VIEW v_client_money_reconciliation AS
SELECT r.id, ma.name AS account, ma.account_type, r.recon_date,
       r.bank_balance, r.book_balance, r.client_ledger_total,
       r.internal_diff, r.external_diff, r.shortfall, r.excess, r.status, r.signed_off_by
FROM client_money_reconciliation r
JOIN client_money_account ma ON ma.id = r.client_money_account_id;

-- reconciling items older than three months (IOM/RICS investigate threshold)
CREATE OR REPLACE VIEW v_client_money_aged_items AS
SELECT i.recon_id, ma.name AS account, i.item_date, i.description, i.amount,
       (CURRENT_DATE - i.item_date) AS age_days
FROM client_money_recon_item i
JOIN client_money_reconciliation r ON r.id = i.recon_id
JOIN client_money_account ma ON ma.id = r.client_money_account_id
WHERE (CURRENT_DATE - i.item_date) > 90;

-- ─── 022_trust_accounting.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  TRUST ACCOUNTING  (022)
-- The fiduciary income-vs-capital split, modelled as a FUND dimension
-- (Income / Capital) tagged on BOTH legs of every trust posting (reuses the
-- flexible dimension system + post_journal's per-line 'dimensions'). Because
-- both legs carry the same fund, the net assets tagged to a fund = that
-- fund's balance (undistributed income / remaining capital). Expenses and
-- trustee fees are apportioned across the two funds per the trust deed.
-- Beneficiary register tracks income (life tenant) vs capital (remainderman)
-- distributions and running entitlement.
-- =====================================================================

ALTER TABLE entity ADD COLUMN IF NOT EXISTS is_trust boolean NOT NULL DEFAULT false;

-- register the FUND dimension + its two values (idempotent)
INSERT INTO dimension_type(code,name)
SELECT 'FUND','Trust fund (income/capital)'
WHERE NOT EXISTS (SELECT 1 FROM dimension_type WHERE code='FUND')
ON CONFLICT DO NOTHING;

INSERT INTO dimension_value(dimension_type_id,code,name)
SELECT dt.id,'INC','Income' FROM dimension_type dt WHERE dt.code='FUND'
  AND NOT EXISTS (SELECT 1 FROM dimension_value dv WHERE dv.dimension_type_id=dt.id AND dv.code='INC')
ON CONFLICT DO NOTHING;
INSERT INTO dimension_value(dimension_type_id,code,name)
SELECT dt.id,'CAP','Capital' FROM dimension_type dt WHERE dt.code='FUND'
  AND NOT EXISTS (SELECT 1 FROM dimension_value dv WHERE dv.dimension_type_id=dt.id AND dv.code='CAP')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION fund_value(p_code text)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT dv.id FROM dimension_value dv
    JOIN dimension_type dt ON dt.id = dv.dimension_type_id AND dt.code='FUND'
    WHERE dv.code = p_code;
$$;

-- expense apportionment per trust deed
CREATE TABLE IF NOT EXISTS trust_apportionment (
    trust_entity_id bigint PRIMARY KEY REFERENCES entity(id),
    income_pct      numeric(6,3) NOT NULL,
    capital_pct     numeric(6,3) NOT NULL,
    CHECK (income_pct + capital_pct = 100)
);

CREATE TABLE IF NOT EXISTS beneficiary (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trust_entity_id bigint NOT NULL REFERENCES entity(id),
    name            text NOT NULL,
    beneficiary_type text NOT NULL CHECK (beneficiary_type IN ('life_tenant','remainderman','discretionary')),
    notes           text,
    is_active       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS trust_distribution (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trust_entity_id bigint NOT NULL REFERENCES entity(id),
    beneficiary_id  bigint NOT NULL REFERENCES beneficiary(id),
    dist_date       date NOT NULL,
    fund            text NOT NULL CHECK (fund IN ('income','capital')),
    amount          numeric(20,2) NOT NULL,
    journal_id      bigint REFERENCES journal(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);


-- trust income arising: Dr bank / Cr income, both tagged Income
CREATE OR REPLACE FUNCTION record_trust_income(
    p_trust bigint, p_date date, p_bank bigint, p_income_acct bigint, p_amount numeric, p_desc text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_inc bigint := fund_value('INC');
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id=p_trust;
    RETURN post_journal(p_trust, p_date, 'trust', COALESCE(p_desc,'Trust income'), p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',p_bank,      'txn_ccy',(SELECT functional_ccy FROM entity WHERE id=p_trust),'txn_amount', p_amount,'location_code',v_loc,'memo','Income to bank','dimensions',jsonb_build_array(v_inc)),
        jsonb_build_object('account_id',p_income_acct,'txn_ccy',(SELECT functional_ccy FROM entity WHERE id=p_trust),'txn_amount',-p_amount,'location_code',v_loc,'memo','Trust income','dimensions',jsonb_build_array(v_inc))));
END $$;

-- capital arising / corpus: Dr bank / Cr capital, both tagged Capital
CREATE OR REPLACE FUNCTION record_trust_capital_receipt(
    p_trust bigint, p_date date, p_bank bigint, p_capital_acct bigint, p_amount numeric, p_desc text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_cap bigint := fund_value('CAP'); v_ccy char(3);
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_trust;
    RETURN post_journal(p_trust, p_date, 'trust', COALESCE(p_desc,'Capital receipt'), p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',p_bank,        'txn_ccy',v_ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Capital to bank','dimensions',jsonb_build_array(v_cap)),
        jsonb_build_object('account_id',p_capital_acct,'txn_ccy',v_ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Trust capital','dimensions',jsonb_build_array(v_cap))));
END $$;

-- trust expense, optionally apportioned income/capital per the deed
CREATE OR REPLACE FUNCTION record_trust_expense(
    p_trust bigint, p_date date, p_expense_acct bigint, p_bank bigint, p_amount numeric,
    p_apportion boolean, p_fund text, p_desc text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_ccy char(3); v_inc bigint := fund_value('INC'); v_cap bigint := fund_value('CAP');
        v_ipct numeric; v_iamt numeric; v_camt numeric; v_lines jsonb;
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_trust;
    IF p_apportion THEN
        SELECT income_pct INTO v_ipct FROM trust_apportionment WHERE trust_entity_id=p_trust;
        IF v_ipct IS NULL THEN RAISE EXCEPTION 'No apportionment policy for trust %', p_trust; END IF;
        v_iamt := round(p_amount * v_ipct/100.0, 2);
        v_camt := p_amount - v_iamt;
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id',p_expense_acct,'txn_ccy',v_ccy,'txn_amount', v_iamt,'location_code',v_loc,'memo','Expense (income share)','dimensions',jsonb_build_array(v_inc)),
          jsonb_build_object('account_id',p_expense_acct,'txn_ccy',v_ccy,'txn_amount', v_camt,'location_code',v_loc,'memo','Expense (capital share)','dimensions',jsonb_build_array(v_cap)),
          jsonb_build_object('account_id',p_bank,        'txn_ccy',v_ccy,'txn_amount',-v_iamt,'location_code',v_loc,'memo','Paid (income share)','dimensions',jsonb_build_array(v_inc)),
          jsonb_build_object('account_id',p_bank,        'txn_ccy',v_ccy,'txn_amount',-v_camt,'location_code',v_loc,'memo','Paid (capital share)','dimensions',jsonb_build_array(v_cap)));
    ELSE
        IF p_fund NOT IN ('income','capital') THEN RAISE EXCEPTION 'fund must be income or capital'; END IF;
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id',p_expense_acct,'txn_ccy',v_ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Trust expense','dimensions',jsonb_build_array(CASE WHEN p_fund='income' THEN v_inc ELSE v_cap END)),
          jsonb_build_object('account_id',p_bank,        'txn_ccy',v_ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Paid','dimensions',jsonb_build_array(CASE WHEN p_fund='income' THEN v_inc ELSE v_cap END)));
    END IF;
    RETURN post_journal(p_trust, p_date, 'trust', COALESCE(p_desc,'Trust expense'), p_created_by, v_lines);
END $$;

-- distribute to a beneficiary (income or capital)
CREATE OR REPLACE FUNCTION distribute_to_beneficiary(
    p_trust bigint, p_beneficiary bigint, p_date date, p_fund text, p_amount numeric,
    p_dist_acct bigint, p_bank bigint, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_ccy char(3); v_dim bigint; v_jid bigint;
BEGIN
    IF p_fund NOT IN ('income','capital') THEN RAISE EXCEPTION 'fund must be income or capital'; END IF;
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_trust;
    v_dim := fund_value(CASE WHEN p_fund='income' THEN 'INC' ELSE 'CAP' END);
    v_jid := post_journal(p_trust, p_date, 'trust-distribution', 'Distribution to beneficiary ('||p_fund||')', p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',p_dist_acct,'txn_ccy',v_ccy,'txn_amount', p_amount,'location_code',v_loc,'memo','Distribution','dimensions',jsonb_build_array(v_dim)),
        jsonb_build_object('account_id',p_bank,     'txn_ccy',v_ccy,'txn_amount',-p_amount,'location_code',v_loc,'memo','Paid to beneficiary','dimensions',jsonb_build_array(v_dim))));
    INSERT INTO trust_distribution(trust_entity_id,beneficiary_id,dist_date,fund,amount,journal_id)
    VALUES (p_trust,p_beneficiary,p_date,p_fund,p_amount,v_jid);
    RETURN v_jid;
END $$;


-- net assets attributable to each fund = the fund balance (income / capital account)
CREATE OR REPLACE VIEW v_trust_fund_position AS
SELECT j.entity_id AS trust_entity_id, e.company_code, dv.code AS fund, dv.name AS fund_name,
       SUM(jl.func_amount) AS fund_balance
FROM journal_line jl
JOIN journal j ON j.id = jl.journal_id AND j.status <> 'draft'
JOIN entity e ON e.id = j.entity_id AND e.is_trust
JOIN journal_line_dimension jld ON jld.journal_line_id = jl.id
JOIN dimension_value dv ON dv.id = jld.dimension_value_id
JOIN dimension_type dt ON dt.id = dv.dimension_type_id AND dt.code='FUND'
JOIN account a ON a.id = jl.account_id AND a.account_type = 'asset'
GROUP BY j.entity_id, e.company_code, dv.code, dv.name;

-- income & expense arising by fund (statement detail)
CREATE OR REPLACE VIEW v_trust_fund_pnl AS
SELECT j.entity_id AS trust_entity_id, dv.code AS fund,
       -SUM(CASE WHEN a.account_type='income'  THEN jl.func_amount ELSE 0 END) AS income_arising,
        SUM(CASE WHEN a.account_type='expense' THEN jl.func_amount ELSE 0 END) AS expenses
FROM journal_line jl
JOIN journal j ON j.id = jl.journal_id AND j.status <> 'draft'
JOIN entity e ON e.id = j.entity_id AND e.is_trust
JOIN journal_line_dimension jld ON jld.journal_line_id = jl.id
JOIN dimension_value dv ON dv.id = jld.dimension_value_id
JOIN dimension_type dt ON dt.id = dv.dimension_type_id AND dt.code='FUND'
JOIN account a ON a.id = jl.account_id
GROUP BY j.entity_id, dv.code;

CREATE OR REPLACE VIEW v_beneficiary_distributions AS
SELECT b.id AS beneficiary_id, b.trust_entity_id, b.name, b.beneficiary_type,
       COALESCE(SUM(d.amount) FILTER (WHERE d.fund='income'),0)  AS income_distributed,
       COALESCE(SUM(d.amount) FILTER (WHERE d.fund='capital'),0) AS capital_distributed
FROM beneficiary b
LEFT JOIN trust_distribution d ON d.beneficiary_id = b.id
GROUP BY b.id, b.trust_entity_id, b.name, b.beneficiary_type;

-- ─── 023_fs_taxonomy.sql ───
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

CREATE TABLE IF NOT EXISTS fs_framework (
    code text PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE IF NOT EXISTS fs_caption (
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

CREATE TABLE IF NOT EXISTS account_fs_map (
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
 ('TRUST','Trust fiduciary accounts')
ON CONFLICT DO NOTHING;

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
 ('FRS102_1A','PL','PROFIT','Profit/(loss) for the financial year',1400,true,NULL)
ON CONFLICT DO NOTHING;

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
 ('IFRS','PL','PROFIT','Profit for the year',1400,true,NULL)
ON CONFLICT DO NOTHING;

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
 ('GAPSME','PL','PROFIT','Profit for the year',1400,true,NULL)
ON CONFLICT DO NOTHING;

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
 ('TRUST','AL','TRUST_INVEST','Investments',310,false,NULL)
ON CONFLICT DO NOTHING;

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

-- ─── 024_statement_assembly.sql ───
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
ALTER TABLE fs_caption ADD COLUMN IF NOT EXISTS fund_filter text CHECK (fund_filter IN ('INC','CAP'));
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

-- ─── 025_notes.sql ───
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

CREATE TABLE IF NOT EXISTS fs_note_template (
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
 'These fiduciary accounts of {entity_name} present the income and capital of the trust separately, in accordance with the trust deed. Expenses are apportioned between income and capital as required by the deed, and distributions are recorded against the relevant fund.',1)
ON CONFLICT DO NOTHING;

-- ─── 026_adjustments_workflow.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  ADJUSTMENTS + WORKFLOW  (026)
-- Accounts production lifecycle for a financial-statement set:
--   draft -> in_review -> approved -> finalised (locked)
-- Statutory adjustments are normal posted journals flagged
-- journal_type='stat_adjustment' and linked to the accounts set, so they
-- sit in the ledger (auditable, distinguishable) and flow into the FS.
-- On finalisation the assembled statements + notes are snapshotted to JSON
-- so the signed-off accounts are fixed even if the ledger later moves.
-- This closes the engine; front-end rendering and iXBRL consume the JSON.
-- =====================================================================

-- allow statutory-adjustment journals to be tagged as such
ALTER TABLE journal DROP CONSTRAINT IF EXISTS journal_journal_type_check;
ALTER TABLE journal ADD CONSTRAINT journal_journal_type_check
  CHECK (journal_type = ANY (ARRAY['manual','recurring','reversing','accrual','system','stat_adjustment']));

CREATE TABLE IF NOT EXISTS fs_accounts_set (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id      bigint NOT NULL REFERENCES entity(id),
    framework_code text NOT NULL REFERENCES fs_framework(code),
    period_start   date NOT NULL,
    period_end     date NOT NULL,
    prior_start    date,
    prior_end      date,
    status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','in_review','approved','finalised')),
    locked         boolean NOT NULL DEFAULT false,
    prepared_by    text, prepared_at  timestamptz,
    reviewed_by    text, reviewed_at  timestamptz,
    approved_by    text, approved_at  timestamptz,
    finalised_by   text, finalised_at timestamptz,
    snapshot       jsonb,
    UNIQUE (entity_id, framework_code, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS fs_adjustment (
    accounts_set_id bigint NOT NULL REFERENCES fs_accounts_set(id),
    journal_id      bigint NOT NULL REFERENCES journal(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (accounts_set_id, journal_id)
);

-- build the structured accounts (statements + notes) as JSON
CREATE OR REPLACE FUNCTION build_accounts_json(p_set_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v fs_accounts_set; r jsonb;
BEGIN
    SELECT * INTO v FROM fs_accounts_set WHERE id=p_set_id;
    IF v.id IS NULL THEN RAISE EXCEPTION 'Accounts set % not found', p_set_id; END IF;
    SELECT jsonb_build_object(
      'entity', (SELECT to_jsonb(x) FROM (SELECT id,company_code,name,functional_ccy FROM entity WHERE id=v.entity_id) x),
      'framework', v.framework_code,
      'period', jsonb_build_object('start',v.period_start,'end',v.period_end),
      'statements', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.statement, s.sort_order)
                              FROM assemble_financial_statements(v.entity_id,v.framework_code,v.period_start,v.period_end,v.prior_start,v.prior_end) s),'[]'),
      'notes_analysis', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.note_no)
                              FROM note_account_analysis(v.entity_id,v.framework_code,v.period_end,v.prior_end) n),'[]'),
      'notes_fixed_assets', COALESCE((SELECT jsonb_agg(to_jsonb(fa)) FROM note_fixed_assets(v.entity_id,v.period_start,v.period_end) fa),'[]'),
      'notes_related_party', COALESCE((SELECT jsonb_agg(to_jsonb(rp)) FROM note_related_party(v.entity_id,v.period_start,v.period_end) rp),'[]'),
      'notes_narrative', COALESCE((SELECT jsonb_agg(to_jsonb(nn) ORDER BY nn.sort_order) FROM render_narrative_notes(v.entity_id,v.framework_code) nn),'[]')
    ) INTO r;
    RETURN r;
END $$;

-- create a new accounts set (status draft)
CREATE OR REPLACE FUNCTION create_accounts_set(
    p_entity bigint, p_framework text, p_period_start date, p_period_end date,
    p_prior_start date, p_prior_end date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
    INSERT INTO fs_accounts_set(entity_id,framework_code,period_start,period_end,prior_start,prior_end,
                                status,prepared_by,prepared_at)
    VALUES (p_entity,p_framework,p_period_start,p_period_end,p_prior_start,p_prior_end,'draft',p_created_by,now())
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- post a statutory adjustment into the ledger, flagged + linked to the set
CREATE OR REPLACE FUNCTION post_statutory_adjustment(
    p_set_id bigint, p_date date, p_narrative text, p_created_by text, p_lines jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v fs_accounts_set; v_jid bigint;
BEGIN
    SELECT * INTO v FROM fs_accounts_set WHERE id=p_set_id FOR UPDATE;
    IF v.id IS NULL THEN RAISE EXCEPTION 'Accounts set % not found', p_set_id; END IF;
    IF v.locked OR v.status='finalised' THEN
        RAISE EXCEPTION 'Accounts set % is finalised/locked — no further adjustments', p_set_id;
    END IF;
    v_jid := post_journal(v.entity_id, p_date, 'stat-adjustment', p_narrative, p_created_by, p_lines, 'stat_adjustment');
    INSERT INTO fs_adjustment(accounts_set_id, journal_id) VALUES (p_set_id, v_jid);
    RETURN v_jid;
END $$;

-- workflow transitions (each enforces the predecessor state)
CREATE OR REPLACE FUNCTION submit_accounts_for_review(p_set_id bigint, p_by text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
    SELECT status INTO v_status FROM fs_accounts_set WHERE id=p_set_id FOR UPDATE;
    IF v_status <> 'draft' THEN RAISE EXCEPTION 'Set must be draft to submit (is %)', v_status; END IF;
    UPDATE fs_accounts_set SET status='in_review', reviewed_by=p_by, reviewed_at=now() WHERE id=p_set_id;
END $$;

CREATE OR REPLACE FUNCTION approve_accounts(p_set_id bigint, p_by text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
    SELECT status INTO v_status FROM fs_accounts_set WHERE id=p_set_id FOR UPDATE;
    IF v_status <> 'in_review' THEN RAISE EXCEPTION 'Set must be in_review to approve (is %)', v_status; END IF;
    UPDATE fs_accounts_set SET status='approved', approved_by=p_by, approved_at=now() WHERE id=p_set_id;
END $$;

CREATE OR REPLACE FUNCTION finalise_accounts(p_set_id bigint, p_by text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v fs_accounts_set; v_dr numeric; v_cr numeric;
BEGIN
    SELECT * INTO v FROM fs_accounts_set WHERE id=p_set_id FOR UPDATE;
    IF v.status <> 'approved' THEN RAISE EXCEPTION 'Set must be approved to finalise (is %)', v.status; END IF;
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_dr, v_cr
      FROM v_trial_balance WHERE entity_id=v.entity_id;
    IF round(v_dr,2) <> round(v_cr,2) THEN
        RAISE EXCEPTION 'Trial balance does not balance (Dr % / Cr %) — cannot finalise', v_dr, v_cr;
    END IF;
    UPDATE fs_accounts_set
       SET status='finalised', locked=true, finalised_by=p_by, finalised_at=now(),
           snapshot=build_accounts_json(p_set_id)
     WHERE id=p_set_id;
END $$;

-- return the signed-off snapshot if finalised, else a live build
CREATE OR REPLACE FUNCTION get_accounts_set_json(p_set_id bigint)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT COALESCE(snapshot, build_accounts_json(id)) FROM fs_accounts_set WHERE id=p_set_id;
$$;

-- views
CREATE OR REPLACE VIEW v_accounts_production_status AS
SELECT s.id, e.company_code, e.name AS entity_name, s.framework_code,
       s.period_start, s.period_end, s.status, s.locked,
       s.prepared_by, s.reviewed_by, s.approved_by, s.finalised_by, s.finalised_at
FROM fs_accounts_set s JOIN entity e ON e.id=s.entity_id;

CREATE OR REPLACE VIEW v_statutory_adjustments AS
SELECT adj.accounts_set_id, j.id AS journal_id, j.entity_id, j.journal_date, j.narrative,
       j.created_by, j.status,
       (SELECT COALESCE(SUM(jl.func_amount) FILTER (WHERE jl.func_amount>0),0)
        FROM journal_line jl WHERE jl.journal_id=j.id) AS debit_total
FROM fs_adjustment adj
JOIN journal j ON j.id=adj.journal_id;

-- ─── 030_invoice_json.sql ───
-- =====================================================================
-- AFFINITY CORE — INVOICE JSON (integration layer, 030)
-- Assembles a complete invoice for the front-end / PDF template from the
-- billing tables. The firm's own letterhead (per jurisdiction) is supplied
-- by the front-end; this returns only ledger-sourced data.
--   SELECT get_invoice_json(:invoice_id);
-- =====================================================================

CREATE OR REPLACE FUNCTION get_invoice_json(p_invoice_id bigint)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
      'invoice', jsonb_build_object(
          'id', i.id,
          'number', 'INV-'||lpad(i.id::text,6,'0'),
          'invoice_date', i.invoice_date,
          'ccy', i.ccy,
          'status', i.status,
          'settled', i.settled,
          'net_total', i.net_total,
          'vat_total', i.vat_total,
          'gross_total', i.gross_total,
          'outstanding', i.outstanding
      ),
      'bill_to', (SELECT jsonb_build_object('name', e.name, 'code', e.company_code, 'jurisdiction', e.location_code)
                  FROM entity e WHERE e.id = i.entity_id),
      'jurisdiction', (SELECT location_code FROM entity e WHERE e.id = i.entity_id),
      'bank', (SELECT jsonb_build_object('name', b.name, 'iban', b.iban, 'ccy', b.ccy)
               FROM bank_account b WHERE b.id = i.bank_account_id),
      'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'description', l.description, 'net', l.net, 'vat', l.vat, 'gross', l.gross) ORDER BY l.id)
                 FROM invoice_line l WHERE l.invoice_id = i.id), '[]')
    )
    FROM invoice i WHERE i.id = p_invoice_id;
$$;

-- ─── 031_dimensions.sql ───
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
WHERE NOT EXISTS (SELECT 1 FROM dimension_type dt WHERE dt.code = v.code)
ON CONFLICT DO NOTHING;

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
)
ON CONFLICT DO NOTHING;

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

-- ─── 032_credit_notes.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CREDIT NOTES  (032)
-- Sales (AR) and purchase (AP) credit notes.
--   AR: Dr income + Dr VAT output  /  Cr trade debtor (SLC)   — reduces what a customer owes
--   AP: Dr trade creditor (PLC)    /  Cr expense + Cr VAT input — reduces what we owe a supplier
-- Optionally settles against a specific invoice (reduces its outstanding).
-- =====================================================================

CREATE TABLE IF NOT EXISTS credit_note (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id         bigint NOT NULL REFERENCES entity(id),
    cn_type           text NOT NULL CHECK (cn_type IN ('AR','AP')),
    party_name        text,
    related_invoice_id bigint,
    cn_date           date NOT NULL,
    ccy               char(3) NOT NULL REFERENCES currency(code),
    net_total         numeric(20,2) NOT NULL DEFAULT 0,
    vat_total         numeric(20,2) NOT NULL DEFAULT 0,
    gross_total       numeric(20,2) NOT NULL DEFAULT 0,
    status            text NOT NULL DEFAULT 'posted',
    reason            text,
    journal_id        bigint REFERENCES journal(id),
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_note_line (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    credit_note_id bigint NOT NULL REFERENCES credit_note(id),
    description   text,
    account_id    bigint NOT NULL REFERENCES account(id),  -- income (AR) / expense (AP) account
    net           numeric(20,2) NOT NULL,
    vat_code      int,
    vat           numeric(20,2) NOT NULL DEFAULT 0,
    gross         numeric(20,2) NOT NULL
);

-- reduce a specific invoice's outstanding when a credit note is applied to it
CREATE OR REPLACE FUNCTION apply_credit_to_invoice(p_invoice_id bigint, p_amount numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_out numeric;
BEGIN
    SELECT outstanding INTO v_out FROM invoice WHERE id = p_invoice_id FOR UPDATE;
    IF v_out IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
    UPDATE invoice
       SET outstanding = GREATEST(v_out - p_amount, 0),
           settled = CASE WHEN v_out - p_amount <= 0 THEN 'credited' ELSE settled END
     WHERE id = p_invoice_id;
END $$;

-- AR (sales) credit note. p_lines: [{description, account_id, net, vat_code}]
CREATE OR REPLACE FUNCTION raise_ar_credit_note(
    p_entity bigint, p_date date, p_ccy char(3), p_lines jsonb,
    p_related_invoice_id bigint, p_party text, p_reason text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE ln jsonb; v_loc text; v_rate numeric; v_net numeric; v_vat numeric;
        v_net_tot numeric := 0; v_vat_tot numeric := 0; v_gross numeric;
        v_jlines jsonb := '[]'::jsonb; v_jid bigint; v_cn bigint;
        v_slc bigint := cfg_account(p_entity,'SLC'); v_vatout bigint := cfg_account(p_entity,'VAT_OUTPUT');
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity;
    INSERT INTO credit_note(entity_id,cn_type,party_name,related_invoice_id,cn_date,ccy,reason)
      VALUES (p_entity,'AR',p_party,p_related_invoice_id,p_date,p_ccy,p_reason) RETURNING id INTO v_cn;

    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_net := (ln->>'net')::numeric;
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = (ln->>'vat_code')::int;
        v_vat := round(v_net * COALESCE(v_rate,0), 2);
        INSERT INTO credit_note_line(credit_note_id,description,account_id,net,vat_code,vat,gross)
          VALUES (v_cn, ln->>'description', (ln->>'account_id')::bigint, v_net, (ln->>'vat_code')::int, v_vat, v_net+v_vat);
        -- Dr income account (reduces income)
        v_jlines := v_jlines || jsonb_build_object('account_id',(ln->>'account_id')::bigint,'txn_ccy',p_ccy,
                     'txn_amount', v_net,'location_code',v_loc,'memo','AR credit note');
        v_net_tot := v_net_tot + v_net; v_vat_tot := v_vat_tot + v_vat;
    END LOOP;
    v_gross := v_net_tot + v_vat_tot;

    IF v_vat_tot <> 0 THEN
        v_jlines := v_jlines || jsonb_build_object('account_id',v_vatout,'txn_ccy',p_ccy,'txn_amount',v_vat_tot,'location_code',v_loc,'memo','Reverse output VAT');
    END IF;
    -- Cr trade debtor (reduces what the customer owes)
    v_jlines := v_jlines || jsonb_build_object('account_id',v_slc,'txn_ccy',p_ccy,'txn_amount',-v_gross,'location_code',v_loc,'memo','Credit to debtor');

    v_jid := post_journal(p_entity, p_date, 'credit-note', 'AR credit note'||COALESCE(' — '||p_reason,''), p_created_by, v_jlines);
    UPDATE credit_note SET net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_gross, journal_id=v_jid WHERE id=v_cn;
    IF p_related_invoice_id IS NOT NULL THEN PERFORM apply_credit_to_invoice(p_related_invoice_id, v_gross); END IF;
    RETURN v_cn;
END $$;

-- AP (purchase) credit note. p_lines: [{description, account_id, net, vat_code}]
CREATE OR REPLACE FUNCTION raise_ap_credit_note(
    p_entity bigint, p_date date, p_ccy char(3), p_lines jsonb,
    p_supplier text, p_reason text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE ln jsonb; v_loc text; v_rate numeric; v_net numeric; v_vat numeric;
        v_net_tot numeric := 0; v_vat_tot numeric := 0; v_gross numeric;
        v_jlines jsonb := '[]'::jsonb; v_jid bigint; v_cn bigint;
        v_plc bigint := cfg_account(p_entity,'PLC'); v_vatin bigint := cfg_account(p_entity,'VAT_INPUT');
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id = p_entity;
    INSERT INTO credit_note(entity_id,cn_type,party_name,cn_date,ccy,reason)
      VALUES (p_entity,'AP',p_supplier,p_date,p_ccy,p_reason) RETURNING id INTO v_cn;

    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_net := (ln->>'net')::numeric;
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id = (ln->>'vat_code')::int;
        v_vat := round(v_net * COALESCE(v_rate,0), 2);
        INSERT INTO credit_note_line(credit_note_id,description,account_id,net,vat_code,vat,gross)
          VALUES (v_cn, ln->>'description', (ln->>'account_id')::bigint, v_net, (ln->>'vat_code')::int, v_vat, v_net+v_vat);
        -- Cr expense account (reduces expense)
        v_jlines := v_jlines || jsonb_build_object('account_id',(ln->>'account_id')::bigint,'txn_ccy',p_ccy,
                     'txn_amount', -v_net,'location_code',v_loc,'memo','AP credit note');
        v_net_tot := v_net_tot + v_net; v_vat_tot := v_vat_tot + v_vat;
    END LOOP;
    v_gross := v_net_tot + v_vat_tot;

    IF v_vat_tot <> 0 THEN
        v_jlines := v_jlines || jsonb_build_object('account_id',v_vatin,'txn_ccy',p_ccy,'txn_amount',-v_vat_tot,'location_code',v_loc,'memo','Reverse input VAT');
    END IF;
    -- Dr trade creditor (reduces what we owe)
    v_jlines := v_jlines || jsonb_build_object('account_id',v_plc,'txn_ccy',p_ccy,'txn_amount',v_gross,'location_code',v_loc,'memo','Debit to creditor');

    v_jid := post_journal(p_entity, p_date, 'credit-note', 'AP credit note'||COALESCE(' — '||p_reason,''), p_created_by, v_jlines);
    UPDATE credit_note SET net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_gross, journal_id=v_jid WHERE id=v_cn;
    RETURN v_cn;
END $$;

CREATE OR REPLACE VIEW v_credit_note AS
SELECT cn.id, cn.entity_id, cn.cn_type, cn.party_name, cn.related_invoice_id, cn.cn_date,
       cn.ccy, cn.net_total, cn.vat_total, cn.gross_total, cn.status, cn.reason
FROM credit_note cn;

-- ─── 033_payment_runs_sepa.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  PAYMENT RUNS + SEPA  (033)
-- Batch payment of open payables with an approval gate:
--   create (draft) -> approve (generates SEPA pain.001 XML) -> execute (posts)
-- Execution posts Dr trade creditor (PLC) / Cr bank and clears the supplier
-- invoices. SEPA file is pain.001.001.03 (SEPA Credit Transfer), IBAN-only.
-- =====================================================================

-- structured payee bank details on the supplier (minimal vendor-master fields)
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS bic  text;

CREATE TABLE IF NOT EXISTS payment_run (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    run_date        date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    debtor_bank_account_id bigint NOT NULL REFERENCES bank_account(id),
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','executed','cancelled')),
    total           numeric(20,2) NOT NULL DEFAULT 0,
    item_count      int NOT NULL DEFAULT 0,
    created_by      text, prepared_at timestamptz DEFAULT now(),
    approved_by     text, approved_at timestamptz,
    executed_at     timestamptz,
    journal_id      bigint REFERENCES journal(id),
    sepa_xml        text
);

CREATE TABLE IF NOT EXISTS payment_run_item (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_run_id     bigint NOT NULL REFERENCES payment_run(id),
    supplier_invoice_id bigint REFERENCES supplier_invoice(id),
    payee_name         text NOT NULL,
    payee_iban         text,
    payee_bic          text,
    amount             numeric(20,2) NOT NULL,
    ccy                char(3) NOT NULL,
    reference          text,
    status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid'))
);

CREATE OR REPLACE FUNCTION xml_escape(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT replace(replace(replace(COALESCE(p,''),'&','&amp;'),'<','&lt;'),'>','&gt;');
$$;

CREATE OR REPLACE FUNCTION create_payment_run(
    p_entity bigint, p_run_date date, p_ccy char(3), p_bank_account_id bigint, p_created_by text)
RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO payment_run(entity_id,run_date,ccy,debtor_bank_account_id,created_by)
    VALUES (p_entity,p_run_date,p_ccy,p_bank_account_id,p_created_by) RETURNING id;
$$;

-- pull all open payables (matching the run's currency) that have a payee IBAN
CREATE OR REPLACE FUNCTION add_open_payables_to_run(p_run_id bigint)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE r payment_run; v_n int := 0;
BEGIN
    SELECT * INTO r FROM payment_run WHERE id=p_run_id FOR UPDATE;
    IF r.status <> 'draft' THEN RAISE EXCEPTION 'Run % is % — items can only be added while draft', p_run_id, r.status; END IF;
    INSERT INTO payment_run_item(payment_run_id,supplier_invoice_id,payee_name,payee_iban,payee_bic,amount,ccy,reference)
    SELECT p_run_id, si.id, s.name, s.iban, s.bic, si.outstanding, si.ccy, si.reference
    FROM supplier_invoice si JOIN supplier s ON s.id=si.supplier_id
    WHERE si.entity_id=r.entity_id AND si.ccy=r.ccy AND si.outstanding>0 AND si.status<>'paid';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE payment_run
       SET item_count=(SELECT count(*) FROM payment_run_item WHERE payment_run_id=p_run_id),
           total=(SELECT COALESCE(SUM(amount),0) FROM payment_run_item WHERE payment_run_id=p_run_id)
     WHERE id=p_run_id;
    RETURN v_n;
END $$;

-- build a SEPA pain.001.001.03 credit-transfer file for the run
CREATE OR REPLACE FUNCTION generate_sepa_pain001(p_run_id bigint)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE r payment_run; v_bank bank_account; v_dbtr text; v_msgid text; v_txs text; v_xml text;
BEGIN
    SELECT * INTO r FROM payment_run WHERE id=p_run_id;
    SELECT * INTO v_bank FROM bank_account WHERE id=r.debtor_bank_account_id;
    SELECT name INTO v_dbtr FROM entity WHERE id=r.entity_id;
    v_msgid := 'AFF-'||p_run_id||'-'||to_char(now(),'YYYYMMDDHH24MISS');

    SELECT string_agg(
      '      <CdtTrfTxInf>'||
      '<PmtId><EndToEndId>'||xml_escape(COALESCE(i.reference,'PAY-'||i.id))||'</EndToEndId></PmtId>'||
      '<Amt><InstdAmt Ccy="'||i.ccy||'">'||to_char(i.amount,'FM9999999990.00')||'</InstdAmt></Amt>'||
      '<CdtrAgt><FinInstnId>'||CASE WHEN i.payee_bic IS NOT NULL THEN '<BIC>'||i.payee_bic||'</BIC>' ELSE '<Othr><Id>NOTPROVIDED</Id></Othr>' END||'</FinInstnId></CdtrAgt>'||
      '<Cdtr><Nm>'||xml_escape(i.payee_name)||'</Nm></Cdtr>'||
      '<CdtrAcct><Id><IBAN>'||COALESCE(i.payee_iban,'')||'</IBAN></Id></CdtrAcct>'||
      '<RmtInf><Ustrd>'||xml_escape(COALESCE(i.reference,''))||'</Ustrd></RmtInf></CdtTrfTxInf>', E'\n'
      ORDER BY i.id)
    INTO v_txs FROM payment_run_item i WHERE i.payment_run_id=p_run_id;

    v_xml :=
'<?xml version="1.0" encoding="UTF-8"?>'||E'\n'||
'<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">'||E'\n'||
'  <CstmrCdtTrfInitn>'||E'\n'||
'    <GrpHdr><MsgId>'||v_msgid||'</MsgId><CreDtTm>'||to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS')||'</CreDtTm>'||
       '<NbOfTxs>'||r.item_count||'</NbOfTxs><CtrlSum>'||to_char(r.total,'FM9999999990.00')||'</CtrlSum>'||
       '<InitgPty><Nm>'||xml_escape(v_dbtr)||'</Nm></InitgPty></GrpHdr>'||E'\n'||
'    <PmtInf><PmtInfId>'||v_msgid||'</PmtInfId><PmtMtd>TRF</PmtMtd>'||
       '<NbOfTxs>'||r.item_count||'</NbOfTxs><CtrlSum>'||to_char(r.total,'FM9999999990.00')||'</CtrlSum>'||
       '<ReqdExctnDt>'||to_char(r.run_date,'YYYY-MM-DD')||'</ReqdExctnDt>'||
       '<Dbtr><Nm>'||xml_escape(v_dbtr)||'</Nm></Dbtr>'||
       '<DbtrAcct><Id><IBAN>'||COALESCE(v_bank.iban,'')||'</IBAN></Id></DbtrAcct>'||
       '<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>'||E'\n'||
       v_txs||E'\n'||
'    </PmtInf>'||E'\n'||
'  </CstmrCdtTrfInitn>'||E'\n'||
'</Document>';
    RETURN v_xml;
END $$;

-- approve: lock the run and attach the SEPA file
CREATE OR REPLACE FUNCTION approve_payment_run(p_run_id bigint, p_approver text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r payment_run;
BEGIN
    SELECT * INTO r FROM payment_run WHERE id=p_run_id FOR UPDATE;
    IF r.status <> 'draft' THEN RAISE EXCEPTION 'Run % must be draft to approve (is %)', p_run_id, r.status; END IF;
    IF r.item_count = 0 THEN RAISE EXCEPTION 'Run % has no items', p_run_id; END IF;
    UPDATE payment_run SET status='approved', approved_by=p_approver, approved_at=now(),
                           sepa_xml=generate_sepa_pain001(p_run_id) WHERE id=p_run_id;
END $$;

-- execute: post Dr PLC / Cr bank and clear the payables
CREATE OR REPLACE FUNCTION execute_payment_run(p_run_id bigint, p_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r payment_run; v_loc text; v_plc bigint; v_bank bigint; v_jid bigint; v_lines jsonb := '[]'::jsonb; it record;
BEGIN
    SELECT * INTO r FROM payment_run WHERE id=p_run_id FOR UPDATE;
    IF r.status <> 'approved' THEN RAISE EXCEPTION 'Run % must be approved to execute (is %)', p_run_id, r.status; END IF;
    SELECT location_code INTO v_loc FROM entity WHERE id=r.entity_id;
    v_plc := cfg_account(r.entity_id,'PLC'); v_bank := cfg_account(r.entity_id,'BANK');

    FOR it IN SELECT * FROM payment_run_item WHERE payment_run_id=p_run_id LOOP
        v_lines := v_lines || jsonb_build_object('account_id',v_plc,'txn_ccy',r.ccy,'txn_amount',it.amount,'location_code',v_loc,'memo','Pay '||it.payee_name);
    END LOOP;
    v_lines := v_lines || jsonb_build_object('account_id',v_bank,'txn_ccy',r.ccy,'txn_amount',-r.total,'location_code',v_loc,'memo','Payment run '||p_run_id);

    v_jid := post_journal(r.entity_id, r.run_date, 'payment-run', 'SEPA payment run '||p_run_id, p_by, v_lines);

    UPDATE supplier_invoice si SET outstanding=0, status='paid'
      FROM payment_run_item i WHERE i.payment_run_id=p_run_id AND i.supplier_invoice_id=si.id;
    UPDATE payment_run_item SET status='paid' WHERE payment_run_id=p_run_id;
    UPDATE payment_run SET status='executed', executed_at=now(), journal_id=v_jid WHERE id=p_run_id;
    RETURN v_jid;
END $$;

CREATE OR REPLACE VIEW v_payment_run AS
SELECT pr.id, e.name AS entity, pr.run_date, pr.ccy, pr.status, pr.item_count, pr.total,
       pr.created_by, pr.approved_by, pr.executed_at
FROM payment_run pr JOIN entity e ON e.id=pr.entity_id;

-- ─── 034_purchase_orders_matching.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  PURCHASE ORDERS + MATCHING  (034)
-- Vendor master enrichment, purchase orders, goods receipts, and 2-way
-- (PO<->invoice) / 3-way (PO<->receipt<->invoice) matching with tolerance
-- and exception flagging. Reuses record_supplier_invoice for the AP posting.
-- =====================================================================

-- vendor master enrichment on the existing supplier table
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS vendor_code        text;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS vat_no             text;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS payment_terms_days int DEFAULT 30;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS email              text;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS address            text;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS on_hold            boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS purchase_order (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id   bigint NOT NULL REFERENCES entity(id),
    supplier_id bigint NOT NULL REFERENCES supplier(id),
    po_number   text,
    po_date     date NOT NULL,
    ccy         char(3) NOT NULL REFERENCES currency(code),
    status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','partially_received','received','closed','cancelled')),
    net_total   numeric(20,2) NOT NULL DEFAULT 0,
    vat_total   numeric(20,2) NOT NULL DEFAULT 0,
    gross_total numeric(20,2) NOT NULL DEFAULT 0,
    created_by  text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_line (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_id        bigint NOT NULL REFERENCES purchase_order(id),
    description  text,
    account_id   bigint NOT NULL REFERENCES account(id),
    quantity     numeric(20,4) NOT NULL,
    unit_price   numeric(20,4) NOT NULL,
    vat_code     int,
    net          numeric(20,2) NOT NULL,
    vat          numeric(20,2) NOT NULL,
    gross        numeric(20,2) NOT NULL,
    qty_received numeric(20,4) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goods_receipt (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_id         bigint NOT NULL REFERENCES purchase_order(id),
    receipt_date  date NOT NULL,
    received_by   text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS goods_receipt_line (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    goods_receipt_id bigint NOT NULL REFERENCES goods_receipt(id),
    po_line_id       bigint NOT NULL REFERENCES purchase_order_line(id),
    qty_received     numeric(20,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS po_match (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_id              bigint NOT NULL REFERENCES purchase_order(id),
    supplier_invoice_id bigint NOT NULL REFERENCES supplier_invoice(id),
    match_type         text NOT NULL CHECK (match_type IN ('2way','3way')),
    ordered_value      numeric(20,2),
    received_value     numeric(20,2),
    invoiced_to_date   numeric(20,2),
    this_invoice       numeric(20,2),
    variance           numeric(20,2),
    status             text NOT NULL,   -- matched / over_invoiced / awaiting_receipt / price_variance
    matched_by         text, matched_at timestamptz NOT NULL DEFAULT now()
);

-- create a PO. p_lines: [{description, account_id, quantity, unit_price, vat_code}]
CREATE OR REPLACE FUNCTION create_purchase_order(
    p_entity bigint, p_supplier_id bigint, p_po_date date, p_ccy char(3), p_lines jsonb, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_po bigint; ln jsonb; v_qty numeric; v_price numeric; v_rate numeric; v_net numeric; v_vat numeric;
        v_net_tot numeric := 0; v_vat_tot numeric := 0;
BEGIN
    INSERT INTO purchase_order(entity_id,supplier_id,po_date,ccy,created_by)
      VALUES (p_entity,p_supplier_id,p_po_date,p_ccy,p_created_by) RETURNING id INTO v_po;
    UPDATE purchase_order SET po_number='PO-'||lpad(v_po::text,6,'0') WHERE id=v_po;

    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_qty := (ln->>'quantity')::numeric; v_price := (ln->>'unit_price')::numeric;
        SELECT COALESCE(rate,0) INTO v_rate FROM vat_code WHERE id=(ln->>'vat_code')::int;
        v_net := round(v_qty*v_price,2); v_vat := round(v_net*COALESCE(v_rate,0),2);
        INSERT INTO purchase_order_line(po_id,description,account_id,quantity,unit_price,vat_code,net,vat,gross)
          VALUES (v_po, ln->>'description', (ln->>'account_id')::bigint, v_qty, v_price, (ln->>'vat_code')::int, v_net, v_vat, v_net+v_vat);
        v_net_tot := v_net_tot + v_net; v_vat_tot := v_vat_tot + v_vat;
    END LOOP;
    UPDATE purchase_order SET net_total=v_net_tot, vat_total=v_vat_tot, gross_total=v_net_tot+v_vat_tot WHERE id=v_po;
    RETURN v_po;
END $$;

-- record a goods receipt. p_lines: [{po_line_id, qty}]
CREATE OR REPLACE FUNCTION receive_goods(
    p_po_id bigint, p_receipt_date date, p_lines jsonb, p_received_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_grn bigint; ln jsonb; v_full boolean;
BEGIN
    INSERT INTO goods_receipt(po_id,receipt_date,received_by) VALUES (p_po_id,p_receipt_date,p_received_by) RETURNING id INTO v_grn;
    FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO goods_receipt_line(goods_receipt_id,po_line_id,qty_received)
          VALUES (v_grn,(ln->>'po_line_id')::bigint,(ln->>'qty')::numeric);
        UPDATE purchase_order_line SET qty_received = qty_received + (ln->>'qty')::numeric WHERE id=(ln->>'po_line_id')::bigint;
    END LOOP;
    SELECT bool_and(qty_received >= quantity) INTO v_full FROM purchase_order_line WHERE po_id=p_po_id;
    UPDATE purchase_order SET status = CASE WHEN v_full THEN 'received' ELSE 'partially_received' END
      WHERE id=p_po_id AND status NOT IN ('closed','cancelled');
    RETURN v_grn;
END $$;

-- match a supplier invoice to a PO (2-way or 3-way) with a tolerance %
CREATE OR REPLACE FUNCTION match_invoice_to_po(
    p_si_id bigint, p_po_id bigint, p_match_type text, p_tolerance_pct numeric DEFAULT 0, p_by text DEFAULT 'system')
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_ordered numeric; v_received numeric; v_inv_todate numeric; v_this numeric;
        v_tol numeric; v_status text; v_var numeric;
BEGIN
    SELECT gross_total INTO v_ordered FROM purchase_order WHERE id=p_po_id;
    SELECT COALESCE(SUM( (qty_received/NULLIF(quantity,0)) * gross ),0) INTO v_received FROM purchase_order_line WHERE po_id=p_po_id;
    SELECT COALESCE(SUM(this_invoice),0) INTO v_inv_todate FROM po_match WHERE po_id=p_po_id;
    SELECT gross INTO v_this FROM supplier_invoice WHERE id=p_si_id;
    v_tol := v_ordered * p_tolerance_pct/100.0;

    IF v_inv_todate + v_this > v_ordered + v_tol THEN
        v_status := 'over_invoiced';
    ELSIF p_match_type='3way' AND v_inv_todate + v_this > v_received + v_tol THEN
        v_status := 'awaiting_receipt';
    ELSE
        v_status := 'matched';
    END IF;
    v_var := (v_inv_todate + v_this) - CASE WHEN p_match_type='3way' THEN v_received ELSE v_ordered END;

    INSERT INTO po_match(po_id,supplier_invoice_id,match_type,ordered_value,received_value,invoiced_to_date,this_invoice,variance,status,matched_by)
      VALUES (p_po_id,p_si_id,p_match_type,v_ordered,v_received,v_inv_todate,v_this,v_var,v_status,p_by);

    IF v_status='matched' AND (v_inv_todate + v_this) >= v_ordered THEN
        UPDATE purchase_order SET status='closed' WHERE id=p_po_id AND status NOT IN ('cancelled');
    END IF;
    RETURN v_status;
END $$;

CREATE OR REPLACE VIEW v_purchase_order AS
SELECT po.id, po.po_number, e.name AS entity, s.name AS supplier, po.po_date, po.ccy,
       po.status, po.net_total, po.vat_total, po.gross_total
FROM purchase_order po JOIN entity e ON e.id=po.entity_id JOIN supplier s ON s.id=po.supplier_id;

CREATE OR REPLACE VIEW v_po_match AS
SELECT m.id, m.po_id, po.po_number, m.supplier_invoice_id, m.match_type,
       m.ordered_value, m.received_value, m.invoiced_to_date, m.this_invoice, m.variance, m.status, m.matched_at
FROM po_match m JOIN purchase_order po ON po.id=m.po_id;

-- ─── 035_statements_aging.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  STATEMENTS + AGING  (035)
-- Debtor (AR) and creditor (AP) aging by bucket, customer/supplier
-- statements as at a date, and overdue-interest calculation on AR.
-- AR due date derived as invoice_date + 30 days (standard terms);
-- AP uses the supplier_invoice due_date.
-- =====================================================================

CREATE OR REPLACE FUNCTION aging_bucket(p_days int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_days <= 0 THEN 'current'
                WHEN p_days <= 30 THEN '1-30'
                WHEN p_days <= 60 THEN '31-60'
                WHEN p_days <= 90 THEN '61-90'
                ELSE '90+' END;
$$;

-- AR aging summary per customer (entity), as at a date
CREATE OR REPLACE FUNCTION report_ar_aging(p_as_at date DEFAULT current_date)
RETURNS TABLE(entity_id bigint, customer text, current_amt numeric,
              d1_30 numeric, d31_60 numeric, d61_90 numeric, d90_plus numeric, total numeric)
LANGUAGE sql STABLE AS $$
    SELECT i.entity_id, e.name,
      COALESCE(SUM(i.outstanding) FILTER (WHERE p_as_at-(i.invoice_date+30) <= 0),0),
      COALESCE(SUM(i.outstanding) FILTER (WHERE p_as_at-(i.invoice_date+30) BETWEEN 1 AND 30),0),
      COALESCE(SUM(i.outstanding) FILTER (WHERE p_as_at-(i.invoice_date+30) BETWEEN 31 AND 60),0),
      COALESCE(SUM(i.outstanding) FILTER (WHERE p_as_at-(i.invoice_date+30) BETWEEN 61 AND 90),0),
      COALESCE(SUM(i.outstanding) FILTER (WHERE p_as_at-(i.invoice_date+30) > 90),0),
      COALESCE(SUM(i.outstanding),0)
    FROM invoice i JOIN entity e ON e.id=i.entity_id
    WHERE i.outstanding > 0
    GROUP BY i.entity_id, e.name
    ORDER BY e.name;
$$;

-- AP aging summary per supplier, as at a date
CREATE OR REPLACE FUNCTION report_ap_aging(p_as_at date DEFAULT current_date)
RETURNS TABLE(supplier_id bigint, supplier text, current_amt numeric,
              d1_30 numeric, d31_60 numeric, d61_90 numeric, d90_plus numeric, total numeric)
LANGUAGE sql STABLE AS $$
    SELECT si.supplier_id, s.name,
      COALESCE(SUM(si.outstanding) FILTER (WHERE p_as_at-si.due_date <= 0),0),
      COALESCE(SUM(si.outstanding) FILTER (WHERE p_as_at-si.due_date BETWEEN 1 AND 30),0),
      COALESCE(SUM(si.outstanding) FILTER (WHERE p_as_at-si.due_date BETWEEN 31 AND 60),0),
      COALESCE(SUM(si.outstanding) FILTER (WHERE p_as_at-si.due_date BETWEEN 61 AND 90),0),
      COALESCE(SUM(si.outstanding) FILTER (WHERE p_as_at-si.due_date > 90),0),
      COALESCE(SUM(si.outstanding),0)
    FROM supplier_invoice si JOIN supplier s ON s.id=si.supplier_id
    WHERE si.outstanding > 0
    GROUP BY si.supplier_id, s.name
    ORDER BY s.name;
$$;

-- customer statement: open invoices for a customer (entity) as at a date
CREATE OR REPLACE FUNCTION customer_statement(p_entity bigint, p_as_at date DEFAULT current_date)
RETURNS TABLE(doc text, doc_date date, due_date date, ccy char(3),
              gross numeric, outstanding numeric, days_overdue int, bucket text)
LANGUAGE sql STABLE AS $$
    SELECT 'INV-'||lpad(i.id::text,6,'0'), i.invoice_date, (i.invoice_date+30)::date, i.ccy,
           i.gross_total, i.outstanding, (p_as_at-(i.invoice_date+30))::int,
           aging_bucket((p_as_at-(i.invoice_date+30))::int)
    FROM invoice i
    WHERE i.entity_id=p_entity AND i.outstanding > 0 AND i.invoice_date <= p_as_at
    ORDER BY i.invoice_date;
$$;

-- supplier statement: open invoices from a supplier as at a date
CREATE OR REPLACE FUNCTION supplier_statement(p_supplier bigint, p_as_at date DEFAULT current_date)
RETURNS TABLE(doc text, doc_date date, due_date date, ccy char(3),
              gross numeric, outstanding numeric, days_overdue int, bucket text)
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(si.reference,'SI-'||si.id), si.invoice_date, si.due_date, si.ccy,
           si.gross, si.outstanding, (p_as_at-si.due_date)::int, aging_bucket((p_as_at-si.due_date)::int)
    FROM supplier_invoice si
    WHERE si.supplier_id=p_supplier AND si.outstanding > 0 AND si.invoice_date <= p_as_at
    ORDER BY si.invoice_date;
$$;

-- overdue interest on AR (simple: outstanding * annual_rate * days_overdue/365)
CREATE OR REPLACE FUNCTION report_ar_overdue_interest(p_annual_rate_pct numeric, p_as_at date DEFAULT current_date)
RETURNS TABLE(entity_id bigint, customer text, overdue_outstanding numeric, interest numeric)
LANGUAGE sql STABLE AS $$
    SELECT i.entity_id, e.name,
      COALESCE(SUM(i.outstanding),0),
      COALESCE(SUM(round(i.outstanding * p_annual_rate_pct/100.0 * (p_as_at-(i.invoice_date+30))/365.0, 2)),0)
    FROM invoice i JOIN entity e ON e.id=i.entity_id
    WHERE i.outstanding > 0 AND (p_as_at-(i.invoice_date+30)) > 0
    GROUP BY i.entity_id, e.name
    ORDER BY e.name;
$$;

-- ─── 036_bank_import_mt940.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  BANK IMPORT (MT940) + MATCH RULES  (036)
-- Extends 016 (import_bank_statement / auto_match_statement / post_bank_item):
--   * parse_mt940 / import_mt940  — read SWIFT MT940 statements
--   * bank_match_rule + auto_match_by_rules — auto-code unmatched lines
--     (e.g. bank charges, interest) to a GL account by description pattern
-- CSV import is already covered by import_bank_statement (structured lines).
-- =====================================================================

-- parse MT940 :61: transaction lines (paired with the following :86: detail)
CREATE OR REPLACE FUNCTION parse_mt940(p_text text)
RETURNS TABLE(value_date date, amount numeric, description text)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE l text; m text[]; v_date date; v_amt numeric; v_dc text; v_have boolean := false;
BEGIN
    FOR l IN SELECT regexp_split_to_table(replace(p_text, E'\r',''), E'\n') LOOP
        IF l ~ '^:61:' THEN
            IF v_have THEN  -- previous txn had no :86:, emit it
                value_date := v_date; amount := v_amt; description := NULL; RETURN NEXT;
            END IF;
            m := regexp_match(l, '^:61:(\d{6})(\d{4})?(RC|RD|C|D)([0-9,]+)');
            IF m IS NOT NULL THEN
                v_date := to_date('20'||m[1],'YYYYMMDD');
                v_amt  := replace(m[4], ',', '.')::numeric;       -- MT940 uses comma decimal
                v_dc   := m[3];
                IF v_dc IN ('D','RD') THEN v_amt := -v_amt; END IF;  -- debit = money out
                v_have := true;
            END IF;
        ELSIF l ~ '^:86:' AND v_have THEN
            value_date := v_date; amount := v_amt; description := btrim(substring(l from 5));
            RETURN NEXT; v_have := false;
        END IF;
    END LOOP;
    IF v_have THEN value_date := v_date; amount := v_amt; description := NULL; RETURN NEXT; END IF;
END $$;

-- import an MT940 statement into the engine (then auto_match_statement can run)
CREATE OR REPLACE FUNCTION import_mt940(
    p_entity bigint, p_bank_gl_account bigint, p_ccy char(3),
    p_statement_date date, p_opening numeric, p_closing numeric, p_mt940 text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_lines jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('value_date',value_date,'description',description,'amount',amount)),'[]')
      INTO v_lines FROM parse_mt940(p_mt940);
    RETURN import_bank_statement(p_entity, p_bank_gl_account, p_statement_date, p_ccy, p_opening, p_closing, v_lines);
END $$;

-- rules that auto-code statement lines to a GL account by description pattern
CREATE TABLE IF NOT EXISTS bank_match_rule (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    priority        int NOT NULL DEFAULT 100,
    pattern         text NOT NULL,                 -- matched with ILIKE %pattern%
    match_account_id bigint NOT NULL REFERENCES account(id),
    memo            text,
    is_active       boolean NOT NULL DEFAULT true
);

-- post unmatched lines whose description matches a rule (Dr/Cr bank vs rule account)
CREATE OR REPLACE FUNCTION auto_match_by_rules(p_statement_id bigint, p_created_by text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE st bank_statement%ROWTYPE; ln record; v_acct bigint; v_n int := 0;
BEGIN
    SELECT * INTO st FROM bank_statement WHERE id = p_statement_id;
    FOR ln IN SELECT * FROM bank_statement_line WHERE statement_id = p_statement_id AND status='unmatched' LOOP
        SELECT r.match_account_id INTO v_acct
        FROM bank_match_rule r
        WHERE r.entity_id = st.entity_id AND r.is_active
          AND ln.description ILIKE '%'||r.pattern||'%'
        ORDER BY r.priority LIMIT 1;
        IF v_acct IS NOT NULL THEN
            PERFORM post_bank_item(ln.id, v_acct, p_created_by);
            v_n := v_n + 1;
        END IF;
    END LOOP;
    RETURN v_n;
END $$;

CREATE OR REPLACE VIEW v_bank_statement_lines AS
SELECT bsl.id, bsl.statement_id, bs.entity_id, bsl.value_date, bsl.description,
       bsl.amount, bsl.status
FROM bank_statement_line bsl JOIN bank_statement bs ON bs.id = bsl.statement_id;

-- ─── 037_cash_flow.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CASH FLOW + FORECAST  (037)
-- Direct-method cash flow: every journal touching a bank/cash account is
-- categorised by its contra legs into operating / investing / financing,
-- so the statement always reconciles to the movement on cash. Plus a
-- forward forecast built from open receivables and payables by due date.
-- =====================================================================

-- direct-method cash flow statement for a period
CREATE OR REPLACE FUNCTION cash_flow_statement(p_entity bigint, p_start date, p_end date)
RETURNS TABLE(section text, amount numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_open numeric; v_close numeric; v_op numeric; v_inv numeric; v_fin numeric;
        v_cash bigint[];
BEGIN
    SELECT array_agg(id) INTO v_cash FROM account WHERE coa_template_id=1 AND code IN ('1000','1010','1020');

    SELECT COALESCE(SUM(jl.func_amount),0) INTO v_open
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft' AND j.entity_id=p_entity
    WHERE jl.account_id = ANY(v_cash) AND j.journal_date < p_start;

    SELECT COALESCE(SUM(jl.func_amount),0) INTO v_close
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft' AND j.entity_id=p_entity
    WHERE jl.account_id = ANY(v_cash) AND j.journal_date <= p_end;

    WITH cash_lines AS (
        SELECT jl.journal_id, jl.func_amount AS cash_amt
        FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
          AND j.entity_id=p_entity AND j.journal_date BETWEEN p_start AND p_end
        WHERE jl.account_id = ANY(v_cash)
    ), cat AS (
        SELECT cl.cash_amt,
          CASE
            WHEN EXISTS (SELECT 1 FROM journal_line x JOIN account a ON a.id=x.account_id
                         WHERE x.journal_id=cl.journal_id AND a.code IN ('1500','1510')) THEN 'investing'
            WHEN EXISTS (SELECT 1 FROM journal_line x JOIN account a ON a.id=x.account_id
                         WHERE x.journal_id=cl.journal_id AND a.account_type='equity'
                           AND a.id <> ALL(v_cash)) THEN 'financing'
            ELSE 'operating'
          END AS category
        FROM cash_lines cl
    )
    SELECT COALESCE(SUM(cash_amt) FILTER (WHERE category='operating'),0),
           COALESCE(SUM(cash_amt) FILTER (WHERE category='investing'),0),
           COALESCE(SUM(cash_amt) FILTER (WHERE category='financing'),0)
    INTO v_op, v_inv, v_fin FROM cat;

    section:='Cash from operating activities'; amount:=v_op; RETURN NEXT;
    section:='Cash from investing activities'; amount:=v_inv; RETURN NEXT;
    section:='Cash from financing activities'; amount:=v_fin; RETURN NEXT;
    section:='Net increase/(decrease) in cash'; amount:=v_op+v_inv+v_fin; RETURN NEXT;
    section:='Cash at beginning of period'; amount:=v_open; RETURN NEXT;
    section:='Cash at end of period'; amount:=v_close; RETURN NEXT;
END $$;

-- forward cash flow forecast from open AR (receipts) and AP (payments) by due date
CREATE OR REPLACE FUNCTION cash_flow_forecast(
    p_entity bigint, p_from date DEFAULT current_date, p_buckets int DEFAULT 4, p_bucket_days int DEFAULT 30)
RETURNS TABLE(period_start date, period_end date, opening numeric,
              expected_receipts numeric, expected_payments numeric, net numeric, projected_close numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_cash numeric; i int; b_start date; b_end date; v_rec numeric; v_pay numeric;
BEGIN
    SELECT COALESCE(SUM(jl.func_amount),0) INTO v_cash
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft' AND j.entity_id=p_entity
    JOIN account a ON a.id=jl.account_id AND a.code IN ('1000','1010','1020');

    FOR i IN 0..(p_buckets-1) LOOP
        b_start := p_from + (i*p_bucket_days);
        b_end   := p_from + ((i+1)*p_bucket_days) - 1;
        SELECT COALESCE(SUM(outstanding),0) INTO v_rec FROM invoice
          WHERE entity_id=p_entity AND outstanding>0 AND (invoice_date+30) BETWEEN b_start AND b_end;
        SELECT COALESCE(SUM(outstanding),0) INTO v_pay FROM supplier_invoice
          WHERE entity_id=p_entity AND outstanding>0 AND due_date BETWEEN b_start AND b_end;
        period_start:=b_start; period_end:=b_end; opening:=v_cash;
        expected_receipts:=v_rec; expected_payments:=v_pay; net:=v_rec-v_pay;
        v_cash := v_cash + (v_rec - v_pay); projected_close:=v_cash;
        RETURN NEXT;
    END LOOP;
END $$;

-- ─── 038_tax_extensions.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  TAX EXTENSIONS  (038)
-- Withholding tax, reverse-charge VAT, and multi-jurisdiction VAT reporting,
-- on top of the existing VAT engine (012 disbursement VAT / 019 VAT return).
-- =====================================================================

-- WHT payable control account + role
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'2220','Withholding tax payable','liability','C'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2220')
ON CONFLICT DO NOTHING;

INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'WHT_PAYABLE', a.id FROM account a WHERE a.coa_template_id=1 AND a.code='2220'
ON CONFLICT DO NOTHING;

-- optional default WHT rate per supplier
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS wht_rate numeric(6,4) DEFAULT 0;

-- withhold tax from an amount owed to a supplier:
--   Dr trade creditor (reduces what we pay out)  /  Cr WHT payable (we owe the authority)
CREATE OR REPLACE FUNCTION apply_withholding_tax(
    p_entity bigint, p_date date, p_base_net numeric, p_wht_rate numeric,
    p_supplier text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_ccy char(3); v_plc bigint := cfg_account(p_entity,'PLC');
        v_wht bigint := cfg_account(p_entity,'WHT_PAYABLE'); v_amt numeric;
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_entity;
    v_amt := round(p_base_net * p_wht_rate/100.0, 2);
    RETURN post_journal(p_entity, p_date, 'wht', 'Withholding tax — '||p_supplier, p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',v_plc,'txn_ccy',v_ccy,'txn_amount', v_amt,'location_code',v_loc,'memo','WHT withheld from supplier'),
        jsonb_build_object('account_id',v_wht,'txn_ccy',v_ccy,'txn_amount',-v_amt,'location_code',v_loc,'memo','WHT due to authority')));
END $$;

-- reverse-charge VAT on a cross-border service purchase:
--   Dr expense (net) + Dr VAT input (notional)  /  Cr VAT output (notional) + Cr creditor (net)
-- Net VAT and net cash effect is nil, but both VAT boxes are populated.
CREATE OR REPLACE FUNCTION record_reverse_charge(
    p_entity bigint, p_date date, p_net numeric, p_vat_rate numeric,
    p_expense_account bigint, p_supplier text, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_ccy char(3); v_vat numeric;
        v_vatin bigint := cfg_account(p_entity,'VAT_INPUT');
        v_vatout bigint := cfg_account(p_entity,'VAT_OUTPUT');
        v_plc bigint := cfg_account(p_entity,'PLC');
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_entity;
    v_vat := round(p_net * p_vat_rate/100.0, 2);
    RETURN post_journal(p_entity, p_date, 'reverse-charge', 'Reverse charge — '||p_supplier, p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',p_expense_account,'txn_ccy',v_ccy,'txn_amount', p_net,'location_code',v_loc,'memo','Service (net)'),
        jsonb_build_object('account_id',v_vatin, 'txn_ccy',v_ccy,'txn_amount', v_vat,'location_code',v_loc,'memo','Reverse charge input VAT'),
        jsonb_build_object('account_id',v_vatout,'txn_ccy',v_ccy,'txn_amount',-v_vat,'location_code',v_loc,'memo','Reverse charge output VAT'),
        jsonb_build_object('account_id',v_plc,   'txn_ccy',v_ccy,'txn_amount',-p_net,'location_code',v_loc,'memo','Supplier (net)')));
END $$;

-- VAT output / input by jurisdiction (entity location) for a period
CREATE OR REPLACE FUNCTION report_vat_by_jurisdiction(p_start date, p_end date)
RETURNS TABLE(jurisdiction text, output_vat numeric, input_vat numeric, net_vat numeric)
LANGUAGE sql STABLE AS $$
    SELECT e.location_code,
      COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.code IN ('2200')),0),   -- output VAT (liability, credit)
      COALESCE( SUM(jl.func_amount) FILTER (WHERE a.code IN ('1200')),0),    -- input VAT (asset, debit)
      COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.code IN ('2200')),0)
        - COALESCE(SUM(jl.func_amount) FILTER (WHERE a.code IN ('1200')),0)
    FROM journal_line jl
    JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft' AND j.journal_date BETWEEN p_start AND p_end
    JOIN entity e ON e.id=j.entity_id
    JOIN account a ON a.id=jl.account_id AND a.code IN ('2200','1200')
    GROUP BY e.location_code
    ORDER BY e.location_code;
$$;

-- WHT payable accrued in a period (to remit to the authority)
CREATE OR REPLACE VIEW v_wht_payable AS
SELECT j.entity_id, e.location_code AS jurisdiction,
       -SUM(jl.func_amount) AS wht_payable
FROM journal_line jl
JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft'
JOIN entity e ON e.id=j.entity_id
JOIN account a ON a.id=jl.account_id AND a.code='2220'
GROUP BY j.entity_id, e.location_code;

-- ─── 039_consolidation_plus.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CONSOLIDATION ENHANCEMENTS  (039)
-- Multi-level ownership (effective % down a chain), minority / non-controlling
-- interest on net assets, and a currency translation reserve (CTA) for foreign
-- subsidiaries. Builds on 018 (consol_group / consol_group_member).
-- =====================================================================

-- model the ownership chain: who is the direct parent of each member
ALTER TABLE consol_group_member ADD COLUMN IF NOT EXISTS parent_entity_id bigint;

-- effective ownership % for every member (top parent x ... x direct %)
CREATE OR REPLACE FUNCTION effective_ownership(p_group bigint)
RETURNS TABLE(entity_id bigint, direct_pct numeric, effective_pct numeric)
LANGUAGE sql STABLE AS $$
    WITH RECURSIVE oc AS (
        SELECT m.entity_id, m.ownership_pct AS direct_pct, m.ownership_pct::numeric AS effective_pct
        FROM consol_group_member m
        WHERE m.group_id = p_group AND m.parent_entity_id IS NULL
        UNION ALL
        SELECT m.entity_id, m.ownership_pct, round(oc.effective_pct * m.ownership_pct / 100.0, 4)
        FROM consol_group_member m
        JOIN oc ON m.parent_entity_id = oc.entity_id
        WHERE m.group_id = p_group
    )
    SELECT entity_id, direct_pct, effective_pct FROM oc;
$$;

-- net assets (functional ccy) of an entity as at a date
CREATE OR REPLACE FUNCTION entity_net_assets(p_entity bigint, p_as_at date)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT COALESCE(SUM(jl.func_amount),0)
    FROM journal_line jl
    JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft' AND j.entity_id=p_entity AND j.journal_date<=p_as_at
    JOIN account a ON a.id=jl.account_id AND a.account_type IN ('asset','liability');
$$;

-- group share vs minority/non-controlling interest on each member's net assets
CREATE OR REPLACE FUNCTION consolidated_nci(p_group bigint, p_rate_date date)
RETURNS TABLE(entity_id bigint, entity_name text, functional_ccy text, effective_pct numeric,
              net_assets_func numeric, rate numeric, net_assets_reporting numeric,
              group_share numeric, nci_share numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE g consol_group%ROWTYPE; eo record; v_func char(3); v_name text; v_na numeric; v_rate numeric; v_rep numeric;
BEGIN
    SELECT * INTO g FROM consol_group WHERE id=p_group;
    FOR eo IN SELECT * FROM effective_ownership(p_group) LOOP
        SELECT e.functional_ccy, e.name INTO v_func, v_name FROM entity e WHERE e.id=eo.entity_id;
        v_na := entity_net_assets(eo.entity_id, p_rate_date);
        IF v_func = g.reporting_ccy THEN v_rate := 1; ELSE SELECT f.rate INTO v_rate FROM fx_lookup(v_func, g.reporting_ccy, p_rate_date) f; END IF;
        v_rate := COALESCE(v_rate,1);
        v_rep := round(v_na * v_rate, 2);
        entity_id:=eo.entity_id; entity_name:=v_name; functional_ccy:=v_func; effective_pct:=eo.effective_pct;
        net_assets_func:=v_na; rate:=v_rate; net_assets_reporting:=v_rep;
        group_share := round(v_rep * eo.effective_pct/100.0, 2);
        nci_share   := round(v_rep * (100-eo.effective_pct)/100.0, 2);
        RETURN NEXT;
    END LOOP;
END $$;

-- currency translation reserve: movement on foreign net assets between two rate dates
CREATE OR REPLACE FUNCTION consolidated_cta(p_group bigint, p_opening_date date, p_closing_date date)
RETURNS TABLE(entity_id bigint, entity_name text, functional_ccy text,
              net_assets_func numeric, opening_rate numeric, closing_rate numeric, cta numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE g consol_group%ROWTYPE; m record; v_func char(3); v_name text; v_na numeric; v_o numeric; v_c numeric;
BEGIN
    SELECT * INTO g FROM consol_group WHERE id=p_group;
    FOR m IN SELECT cgm.entity_id FROM consol_group_member cgm WHERE cgm.group_id=p_group LOOP
        SELECT e.functional_ccy, e.name INTO v_func, v_name FROM entity e WHERE e.id=m.entity_id;
        IF v_func = g.reporting_ccy THEN CONTINUE; END IF;  -- no translation difference for same-ccy
        v_na := entity_net_assets(m.entity_id, p_closing_date);
        SELECT f.rate INTO v_o FROM fx_lookup(v_func, g.reporting_ccy, p_opening_date) f;
        SELECT f.rate INTO v_c FROM fx_lookup(v_func, g.reporting_ccy, p_closing_date) f;
        entity_id:=m.entity_id; entity_name:=v_name; functional_ccy:=v_func; net_assets_func:=v_na;
        opening_rate:=v_o; closing_rate:=v_c; cta := round(v_na * (COALESCE(v_c,0)-COALESCE(v_o,0)), 2);
        RETURN NEXT;
    END LOOP;
END $$;

-- ─── 040_fixed_assets_plus.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  FIXED ASSET EXTENSIONS  (040)
-- Reducing-balance depreciation, impairment write-downs, and inter-entity
-- asset transfers (intercompany disposal in the seller + re-capitalisation in
-- the buyer). Builds on 014 (fixed_asset, FA_* roles).
-- =====================================================================

ALTER TABLE fixed_asset ADD COLUMN IF NOT EXISTS rb_rate    numeric(6,3) DEFAULT 0;  -- annual % for reducing balance
ALTER TABLE fixed_asset ADD COLUMN IF NOT EXISTS impairment numeric(20,2) NOT NULL DEFAULT 0;

-- impairment expense account + role
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'6150','Impairment of fixed assets','expense','D'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6150')
ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'FA_IMPAIRMENT', a.id FROM account a WHERE a.coa_template_id=1 AND a.code='6150'
ON CONFLICT DO NOTHING;

-- post a depreciation charge for an asset (straight_line or reducing_balance)
CREATE OR REPLACE FUNCTION post_depreciation(p_asset bigint, p_date date, p_months int, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE fa fixed_asset%ROWTYPE; v_loc text; v_ccy char(3); v_dep_exp bigint; v_accum bigint;
        v_depreciable numeric; v_nbv numeric; v_charge numeric;
BEGIN
    SELECT * INTO fa FROM fixed_asset WHERE id=p_asset;
    IF fa.id IS NULL THEN RAISE EXCEPTION 'Asset % not found', p_asset; END IF;
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=fa.entity_id;
    v_dep_exp := cfg_account(fa.entity_id,'FA_DEP_EXPENSE');
    v_accum   := cfg_account(fa.entity_id,'FA_ACCUM_DEP');

    v_depreciable := fa.cost - fa.residual_value;
    IF fa.method = 'reducing_balance' THEN
        v_nbv := fa.cost - fa.accumulated_dep;
        v_charge := round(v_nbv * COALESCE(fa.rb_rate,0)/100.0 * (p_months/12.0), 2);
    ELSE
        v_charge := round(v_depreciable / NULLIF(fa.useful_life_months,0) * p_months, 2);
    END IF;
    IF fa.accumulated_dep + v_charge > v_depreciable THEN v_charge := v_depreciable - fa.accumulated_dep; END IF;
    IF v_charge <= 0 THEN RETURN NULL; END IF;

    UPDATE fixed_asset SET accumulated_dep = accumulated_dep + v_charge WHERE id=p_asset;
    RETURN post_journal(fa.entity_id, p_date, 'depreciation', 'Depreciation — '||fa.description, p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',v_dep_exp,'txn_ccy',v_ccy,'txn_amount', v_charge,'location_code',v_loc,'memo','Depreciation charge'),
        jsonb_build_object('account_id',v_accum,  'txn_ccy',v_ccy,'txn_amount',-v_charge,'location_code',v_loc,'memo','Accumulated depreciation')));
END $$;

-- impair an asset (write down carrying value)
CREATE OR REPLACE FUNCTION impair_asset(p_asset bigint, p_date date, p_impairment numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE fa fixed_asset%ROWTYPE; v_loc text; v_ccy char(3); v_imp bigint; v_accum bigint; v_jid bigint;
BEGIN
    SELECT * INTO fa FROM fixed_asset WHERE id=p_asset;
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=fa.entity_id;
    v_imp := cfg_account(fa.entity_id,'FA_IMPAIRMENT'); v_accum := cfg_account(fa.entity_id,'FA_ACCUM_DEP');
    v_jid := post_journal(fa.entity_id, p_date, 'impairment', 'Impairment — '||fa.description, p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',v_imp,  'txn_ccy',v_ccy,'txn_amount', p_impairment,'location_code',v_loc,'memo','Impairment loss'),
        jsonb_build_object('account_id',v_accum,'txn_ccy',v_ccy,'txn_amount',-p_impairment,'location_code',v_loc,'memo','Carrying value write-down')));
    UPDATE fixed_asset SET accumulated_dep=accumulated_dep+p_impairment, impairment=impairment+p_impairment WHERE id=p_asset;
    RETURN v_jid;
END $$;

-- transfer an asset to another group entity (intercompany disposal + re-capitalise)
CREATE OR REPLACE FUNCTION transfer_asset(
    p_asset bigint, p_to_entity bigint, p_date date, p_transfer_value numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE fa fixed_asset%ROWTYPE; v_floc text; v_fccy char(3); v_tloc text; v_tccy char(3);
        v_nbv numeric; v_gain numeric; v_new bigint; v_jfrom bigint; v_jto bigint; v_lines jsonb;
        f_cost bigint; f_accum bigint; f_disp bigint; f_icr bigint; t_cost bigint; t_icp bigint;
BEGIN
    SELECT * INTO fa FROM fixed_asset WHERE id=p_asset;
    IF fa.id IS NULL THEN RAISE EXCEPTION 'Asset % not found', p_asset; END IF;
    SELECT location_code, functional_ccy INTO v_floc, v_fccy FROM entity WHERE id=fa.entity_id;
    SELECT location_code, functional_ccy INTO v_tloc, v_tccy FROM entity WHERE id=p_to_entity;
    v_nbv := fa.cost - fa.accumulated_dep; v_gain := p_transfer_value - v_nbv;

    f_cost:=cfg_account(fa.entity_id,'FA_COST'); f_accum:=cfg_account(fa.entity_id,'FA_ACCUM_DEP');
    f_disp:=cfg_account(fa.entity_id,'FA_DISPOSAL'); f_icr:=cfg_account(fa.entity_id,'IC_RECEIVABLE');
    t_cost:=cfg_account(p_to_entity,'FA_COST'); t_icp:=cfg_account(p_to_entity,'IC_PAYABLE');

    -- seller: remove cost & accum, raise intercompany receivable, recognise gain/loss
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id',f_accum,'txn_ccy',v_fccy,'txn_amount', fa.accumulated_dep,'location_code',v_floc,'memo','Remove accum dep'),
      jsonb_build_object('account_id',f_icr,  'txn_ccy',v_fccy,'txn_amount', p_transfer_value,'location_code',v_floc,'memo','IC receivable on transfer'),
      jsonb_build_object('account_id',f_cost, 'txn_ccy',v_fccy,'txn_amount',-fa.cost,'location_code',v_floc,'memo','Remove asset cost'));
    IF v_gain <> 0 THEN
      v_lines := v_lines || jsonb_build_object('account_id',f_disp,'txn_ccy',v_fccy,'txn_amount',-v_gain,'location_code',v_floc,'memo','Gain/(loss) on transfer');
    END IF;
    v_jfrom := post_journal(fa.entity_id, p_date, 'asset-transfer', 'Transfer out — '||fa.description, p_created_by, v_lines);

    -- buyer: capitalise at transfer value against intercompany payable
    v_jto := post_journal(p_to_entity, p_date, 'asset-transfer', 'Transfer in — '||fa.description, p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',t_cost,'txn_ccy',v_tccy,'txn_amount', p_transfer_value,'location_code',v_tloc,'memo','Asset acquired (transfer)'),
        jsonb_build_object('account_id',t_icp, 'txn_ccy',v_tccy,'txn_amount',-p_transfer_value,'location_code',v_tloc,'memo','IC payable on transfer')));

    UPDATE fixed_asset SET status='transferred', disposal_journal_id=v_jfrom WHERE id=p_asset;
    INSERT INTO fixed_asset(entity_id,description,category,acquisition_date,in_service_date,cost,residual_value,
                            useful_life_months,method,rb_rate,accumulated_dep,status,capitalise_journal_id)
      VALUES (p_to_entity, fa.description, fa.category, p_date, p_date, p_transfer_value, fa.residual_value,
              fa.useful_life_months, fa.method, fa.rb_rate, 0, 'active', v_jto)
      RETURNING id INTO v_new;
    RETURN v_new;
END $$;

-- allow the transfer/impaired statuses
ALTER TABLE fixed_asset DROP CONSTRAINT IF EXISTS fixed_asset_status_check;
ALTER TABLE fixed_asset ADD CONSTRAINT fixed_asset_status_check
  CHECK (status IN ('active','disposed','transferred','impaired','draft'));

-- ─── 041_intercompany_plus.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  INTERCOMPANY LOANS / TP / SETTLEMENT  (041)
-- Builds on 017 (post_intercompany_charge, intercompany_charge, recon):
--   * intercompany loans: drawdown / interest accrual / repayment
--   * transfer pricing: cost-plus markup policy on intercompany charges
--   * settlement: cash-settle intercompany trading balances, with history
-- =====================================================================

-- loan + interest accounts and roles
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'1310','Intercompany loan receivable','asset','D'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1310')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'2510','Intercompany loan payable','liability','C'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2510')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'4400','Intercompany interest income','income','C'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='4400')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'6410','Intercompany interest expense','expense','D'
WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='6410')
ON CONFLICT DO NOTHING;

INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'IC_LOAN_RECEIVABLE',id FROM account WHERE coa_template_id=1 AND code='1310' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'IC_LOAN_PAYABLE',id FROM account WHERE coa_template_id=1 AND code='2510' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'IC_INTEREST_INCOME',id FROM account WHERE coa_template_id=1 AND code='4400' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id)
SELECT 1,'IC_INTEREST_EXPENSE',id FROM account WHERE coa_template_id=1 AND code='6410' ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS ic_loan (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lender_entity bigint NOT NULL REFERENCES entity(id),
    borrower_entity bigint NOT NULL REFERENCES entity(id),
    ccy           char(3) NOT NULL,
    facility      numeric(20,2),
    interest_rate numeric(7,4) NOT NULL DEFAULT 0,   -- annual %
    start_date    date NOT NULL,
    status        text NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS ic_loan_movement (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loan_id    bigint NOT NULL REFERENCES ic_loan(id),
    move_date  date NOT NULL,
    move_type  text NOT NULL CHECK (move_type IN ('drawdown','interest','repayment')),
    amount     numeric(20,2) NOT NULL,
    lender_journal_id bigint,
    borrower_journal_id bigint
);

-- drawdown: lender funds borrower
CREATE OR REPLACE FUNCTION draw_ic_loan(p_loan bigint, p_date date, p_amount numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE l ic_loan%ROWTYPE; lloc text; bloc text; jl bigint; jb bigint;
BEGIN
    SELECT * INTO l FROM ic_loan WHERE id=p_loan;
    SELECT location_code INTO lloc FROM entity WHERE id=l.lender_entity;
    SELECT location_code INTO bloc FROM entity WHERE id=l.borrower_entity;
    jl := post_journal(l.lender_entity,p_date,'ic-loan','Loan drawdown to borrower',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'IC_LOAN_RECEIVABLE'),'txn_ccy',l.ccy,'txn_amount', p_amount,'location_code',lloc,'memo','Loan receivable'),
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'BANK'),'txn_ccy',l.ccy,'txn_amount',-p_amount,'location_code',lloc,'memo','Cash advanced')));
    jb := post_journal(l.borrower_entity,p_date,'ic-loan','Loan drawdown from lender',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'BANK'),'txn_ccy',l.ccy,'txn_amount', p_amount,'location_code',bloc,'memo','Cash received'),
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'IC_LOAN_PAYABLE'),'txn_ccy',l.ccy,'txn_amount',-p_amount,'location_code',bloc,'memo','Loan payable')));
    INSERT INTO ic_loan_movement(loan_id,move_date,move_type,amount,lender_journal_id,borrower_journal_id)
      VALUES (p_loan,p_date,'drawdown',p_amount,jl,jb);
    RETURN p_loan;
END $$;

-- outstanding principal (drawdowns less repayments)
CREATE OR REPLACE FUNCTION ic_loan_principal(p_loan bigint, p_as_at date DEFAULT current_date)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT COALESCE(SUM(CASE WHEN move_type='drawdown' THEN amount WHEN move_type='repayment' THEN -amount ELSE 0 END),0)
    FROM ic_loan_movement WHERE loan_id=p_loan AND move_date<=p_as_at;
$$;

-- accrue interest on outstanding principal for a number of days
CREATE OR REPLACE FUNCTION accrue_ic_loan_interest(p_loan bigint, p_date date, p_days int, p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE l ic_loan%ROWTYPE; lloc text; bloc text; v_int numeric; jl bigint; jb bigint;
BEGIN
    SELECT * INTO l FROM ic_loan WHERE id=p_loan;
    SELECT location_code INTO lloc FROM entity WHERE id=l.lender_entity;
    SELECT location_code INTO bloc FROM entity WHERE id=l.borrower_entity;
    v_int := round(ic_loan_principal(p_loan,p_date) * l.interest_rate/100.0 * p_days/365.0, 2);
    IF v_int <= 0 THEN RETURN 0; END IF;
    jl := post_journal(l.lender_entity,p_date,'ic-loan-interest','Loan interest income',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'IC_LOAN_RECEIVABLE'),'txn_ccy',l.ccy,'txn_amount', v_int,'location_code',lloc,'memo','Interest accrued'),
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'IC_INTEREST_INCOME'),'txn_ccy',l.ccy,'txn_amount',-v_int,'location_code',lloc,'memo','Interest income')));
    jb := post_journal(l.borrower_entity,p_date,'ic-loan-interest','Loan interest expense',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'IC_INTEREST_EXPENSE'),'txn_ccy',l.ccy,'txn_amount', v_int,'location_code',bloc,'memo','Interest expense'),
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'IC_LOAN_PAYABLE'),'txn_ccy',l.ccy,'txn_amount',-v_int,'location_code',bloc,'memo','Interest payable')));
    INSERT INTO ic_loan_movement(loan_id,move_date,move_type,amount,lender_journal_id,borrower_journal_id)
      VALUES (p_loan,p_date,'interest',v_int,jl,jb);
    RETURN v_int;
END $$;

-- repayment: borrower repays lender
CREATE OR REPLACE FUNCTION repay_ic_loan(p_loan bigint, p_date date, p_amount numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE l ic_loan%ROWTYPE; lloc text; bloc text; jl bigint; jb bigint;
BEGIN
    SELECT * INTO l FROM ic_loan WHERE id=p_loan;
    SELECT location_code INTO lloc FROM entity WHERE id=l.lender_entity;
    SELECT location_code INTO bloc FROM entity WHERE id=l.borrower_entity;
    jb := post_journal(l.borrower_entity,p_date,'ic-loan','Loan repayment to lender',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'IC_LOAN_PAYABLE'),'txn_ccy',l.ccy,'txn_amount', p_amount,'location_code',bloc,'memo','Loan repaid'),
            jsonb_build_object('account_id',cfg_account(l.borrower_entity,'BANK'),'txn_ccy',l.ccy,'txn_amount',-p_amount,'location_code',bloc,'memo','Cash paid')));
    jl := post_journal(l.lender_entity,p_date,'ic-loan','Loan repayment from borrower',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'BANK'),'txn_ccy',l.ccy,'txn_amount', p_amount,'location_code',lloc,'memo','Cash received'),
            jsonb_build_object('account_id',cfg_account(l.lender_entity,'IC_LOAN_RECEIVABLE'),'txn_ccy',l.ccy,'txn_amount',-p_amount,'location_code',lloc,'memo','Loan receivable reduced')));
    INSERT INTO ic_loan_movement(loan_id,move_date,move_type,amount,lender_journal_id,borrower_journal_id)
      VALUES (p_loan,p_date,'repayment',p_amount,jl,jb);
    RETURN p_loan;
END $$;

-- ----- transfer pricing: cost-plus markup policy on intercompany charges -----
CREATE TABLE IF NOT EXISTS tp_policy (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_entity  bigint NOT NULL REFERENCES entity(id),
    to_entity    bigint NOT NULL REFERENCES entity(id),
    service_type text NOT NULL,
    markup_pct   numeric(7,4) NOT NULL DEFAULT 0
);

-- charge an arm's-length price = cost base + policy markup, via the IC engine
CREATE OR REPLACE FUNCTION post_tp_charge(
    p_from bigint, p_to bigint, p_date date, p_ccy char(3), p_cost_base numeric,
    p_service_type text, p_created_by text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_markup numeric; v_price numeric;
BEGIN
    SELECT markup_pct INTO v_markup FROM tp_policy
      WHERE from_entity=p_from AND to_entity=p_to AND service_type=p_service_type LIMIT 1;
    v_markup := COALESCE(v_markup,0);
    v_price  := round(p_cost_base * (1 + v_markup/100.0), 2);
    PERFORM post_intercompany_charge(p_from,p_to,p_date,p_ccy,v_price,
        'TP '||p_service_type||' (cost + '||v_markup||'%)', p_created_by);
    RETURN v_price;
END $$;

-- ----- settlement of intercompany trading balances -----
CREATE TABLE IF NOT EXISTS ic_settlement (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    creditor_entity bigint NOT NULL REFERENCES entity(id),   -- holds the receivable
    debtor_entity   bigint NOT NULL REFERENCES entity(id),   -- holds the payable
    settle_date  date NOT NULL,
    ccy          char(3) NOT NULL,
    amount       numeric(20,2) NOT NULL,
    creditor_journal_id bigint,
    debtor_journal_id bigint
);

-- debtor pays creditor; clears IC trading receivable/payable
CREATE OR REPLACE FUNCTION settle_intercompany(
    p_creditor bigint, p_debtor bigint, p_date date, p_ccy char(3), p_amount numeric, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE cloc text; dloc text; jc bigint; jd bigint; v_id bigint;
BEGIN
    SELECT location_code INTO cloc FROM entity WHERE id=p_creditor;
    SELECT location_code INTO dloc FROM entity WHERE id=p_debtor;
    jc := post_journal(p_creditor,p_date,'ic-settle','IC settlement received',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(p_creditor,'BANK'),'txn_ccy',p_ccy,'txn_amount', p_amount,'location_code',cloc,'memo','Cash received'),
            jsonb_build_object('account_id',cfg_account(p_creditor,'IC_RECEIVABLE'),'txn_ccy',p_ccy,'txn_amount',-p_amount,'location_code',cloc,'memo','IC receivable cleared')));
    jd := post_journal(p_debtor,p_date,'ic-settle','IC settlement paid',p_created_by, jsonb_build_array(
            jsonb_build_object('account_id',cfg_account(p_debtor,'IC_PAYABLE'),'txn_ccy',p_ccy,'txn_amount', p_amount,'location_code',dloc,'memo','IC payable cleared'),
            jsonb_build_object('account_id',cfg_account(p_debtor,'BANK'),'txn_ccy',p_ccy,'txn_amount',-p_amount,'location_code',dloc,'memo','Cash paid')));
    INSERT INTO ic_settlement(creditor_entity,debtor_entity,settle_date,ccy,amount,creditor_journal_id,debtor_journal_id)
      VALUES (p_creditor,p_debtor,p_date,p_ccy,p_amount,jc,jd) RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- net intercompany loan position
CREATE OR REPLACE VIEW v_ic_loan_position AS
SELECT l.id AS loan_id, l.lender_entity, l.borrower_entity, l.ccy, l.interest_rate,
       ic_loan_principal(l.id, current_date) AS outstanding_principal,
       COALESCE(SUM(m.amount) FILTER (WHERE m.move_type='interest'),0) AS interest_accrued,
       l.status
FROM ic_loan l LEFT JOIN ic_loan_movement m ON m.loan_id=l.id
GROUP BY l.id, l.lender_entity, l.borrower_entity, l.ccy, l.interest_rate, l.status;

-- ─── 042_gl_completeness.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  GL COMPLETENESS  (042)
--   * generic recurring journals (beyond 011 recurring billing)
--   * accrual & prepayment schedules (spread cost/income over periods)
--   * year-end close + retained-earnings roll-forward
--   * journal approval gate (draft until approved, kept out of the ledger)
-- =====================================================================

-- supporting accounts + roles
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'1400','Prepayments','asset','D' WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1400')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'2400','Accruals','liability','C' WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2400')
ON CONFLICT DO NOTHING;
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'3200','Retained earnings','equity','C' WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='3200')
ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'PREPAYMENTS',id FROM account WHERE coa_template_id=1 AND code='1400' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'ACCRUALS',id FROM account WHERE coa_template_id=1 AND code='2400' ON CONFLICT DO NOTHING;
INSERT INTO ledger_config(coa_template_id,role,account_id) SELECT 1,'RETAINED_EARNINGS',id FROM account WHERE coa_template_id=1 AND code='3200' ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- recurring journals
CREATE TABLE IF NOT EXISTS recurring_journal (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id bigint NOT NULL REFERENCES entity(id),
    description text NOT NULL,
    source text NOT NULL DEFAULT 'recurring',
    ccy char(3) NOT NULL,
    lines jsonb NOT NULL,             -- post_journal line template
    frequency_months int NOT NULL DEFAULT 1,
    next_date date NOT NULL,
    end_date date,
    is_active boolean NOT NULL DEFAULT true,
    created_by text
);

CREATE OR REPLACE FUNCTION run_recurring_journals(p_as_of date, p_created_by text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE r record; v_next date; v_n int := 0;
BEGIN
    FOR r IN SELECT * FROM recurring_journal WHERE is_active AND next_date <= p_as_of LOOP
        v_next := r.next_date;
        WHILE v_next <= p_as_of AND (r.end_date IS NULL OR v_next <= r.end_date) LOOP
            PERFORM post_journal(r.entity_id, v_next, r.source, r.description, p_created_by, r.lines, 'recurring');
            v_n := v_n + 1;
            v_next := (v_next + (r.frequency_months||' months')::interval)::date;
        END LOOP;
        UPDATE recurring_journal SET next_date = v_next WHERE id = r.id;
    END LOOP;
    RETURN v_n;
END $$;

-- ---------------------------------------------------------------- accrual / prepayment schedules
CREATE TABLE IF NOT EXISTS deferral_schedule (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id bigint NOT NULL REFERENCES entity(id),
    kind text NOT NULL CHECK (kind IN ('prepayment','accrual')),
    description text NOT NULL,
    ccy char(3) NOT NULL,
    total_amount numeric(20,2) NOT NULL,
    per_period numeric(20,2) NOT NULL,
    periods_total int NOT NULL,
    periods_posted int NOT NULL DEFAULT 0,
    pl_account bigint NOT NULL REFERENCES account(id),
    frequency_months int NOT NULL DEFAULT 1,
    next_post_date date NOT NULL,
    status text NOT NULL DEFAULT 'active'
);

-- prepayment: cash out now to a prepayment asset, released to P&L over periods
CREATE OR REPLACE FUNCTION create_prepayment(
    p_entity bigint, p_date date, p_total numeric, p_expense_account bigint, p_periods int, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_ccy char(3); v_sid bigint;
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_entity;
    PERFORM post_journal(p_entity, p_date, 'prepayment', 'Prepaid: '||(SELECT name FROM account WHERE id=p_expense_account), p_created_by,
      jsonb_build_array(
        jsonb_build_object('account_id',cfg_account(p_entity,'PREPAYMENTS'),'txn_ccy',v_ccy,'txn_amount', p_total,'location_code',v_loc,'memo','Prepayment asset'),
        jsonb_build_object('account_id',cfg_account(p_entity,'BANK'),'txn_ccy',v_ccy,'txn_amount',-p_total,'location_code',v_loc,'memo','Cash paid')));
    INSERT INTO deferral_schedule(entity_id,kind,description,ccy,total_amount,per_period,periods_total,pl_account,next_post_date)
      VALUES (p_entity,'prepayment','Prepayment',v_ccy,p_total,round(p_total/p_periods,2),p_periods,p_expense_account,p_date)
      RETURNING id INTO v_sid;
    RETURN v_sid;
END $$;

-- accrual: recognise expense over periods against an accruals liability (no cash yet)
CREATE OR REPLACE FUNCTION create_accrual(
    p_entity bigint, p_date date, p_per_period numeric, p_expense_account bigint, p_periods int, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_ccy char(3); v_sid bigint;
BEGIN
    SELECT functional_ccy INTO v_ccy FROM entity WHERE id=p_entity;
    INSERT INTO deferral_schedule(entity_id,kind,description,ccy,total_amount,per_period,periods_total,pl_account,next_post_date)
      VALUES (p_entity,'accrual','Accrual',v_ccy,round(p_per_period*p_periods,2),p_per_period,p_periods,p_expense_account,p_date)
      RETURNING id INTO v_sid;
    RETURN v_sid;
END $$;

-- post all due deferral periods up to a date
CREATE OR REPLACE FUNCTION run_deferrals(p_entity bigint, p_as_of date, p_created_by text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE s record; v_posted int; v_next date; v_amt numeric; v_bal bigint; v_loc text; v_n int := 0;
BEGIN
    SELECT location_code INTO v_loc FROM entity WHERE id=p_entity;
    FOR s IN SELECT * FROM deferral_schedule WHERE entity_id=p_entity AND status='active' AND next_post_date<=p_as_of LOOP
        v_posted := s.periods_posted; v_next := s.next_post_date;
        v_bal := CASE WHEN s.kind='prepayment' THEN cfg_account(p_entity,'PREPAYMENTS') ELSE cfg_account(p_entity,'ACCRUALS') END;
        WHILE v_posted < s.periods_total AND v_next <= p_as_of LOOP
            v_amt := CASE WHEN v_posted = s.periods_total-1
                          THEN s.total_amount - s.per_period*(s.periods_total-1)  -- true-up final period
                          ELSE s.per_period END;
            PERFORM post_journal(p_entity, v_next, s.kind, s.kind||' release', p_created_by,
              jsonb_build_array(
                jsonb_build_object('account_id',s.pl_account,'txn_ccy',s.ccy,'txn_amount', v_amt,'location_code',v_loc,'memo','P&L charge'),
                jsonb_build_object('account_id',v_bal,'txn_ccy',s.ccy,'txn_amount',-v_amt,'location_code',v_loc,'memo','Balance sheet release')),
              'accrual');
            v_posted := v_posted + 1;
            v_next := (v_next + (s.frequency_months||' months')::interval)::date;
            v_n := v_n + 1;
        END LOOP;
        UPDATE deferral_schedule SET periods_posted=v_posted, next_post_date=v_next,
               status = CASE WHEN v_posted >= s.periods_total THEN 'complete' ELSE 'active' END
        WHERE id = s.id;
    END LOOP;
    RETURN v_n;
END $$;

-- ---------------------------------------------------------------- year-end close
CREATE OR REPLACE FUNCTION close_year(p_entity bigint, p_fy_start date, p_fy_end date, p_created_by text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loc text; v_ccy char(3); v_net numeric := 0; v_lines jsonb := '[]'::jsonb; r record; v_jid bigint; v_re bigint;
BEGIN
    SELECT location_code, functional_ccy INTO v_loc, v_ccy FROM entity WHERE id=p_entity;
    v_re := cfg_account(p_entity,'RETAINED_EARNINGS');
    FOR r IN
        SELECT jl.account_id, SUM(jl.func_amount) AS s
        FROM journal_line jl
        JOIN journal j ON j.id=jl.journal_id AND j.status='posted' AND j.entity_id=p_entity AND j.journal_date BETWEEN p_fy_start AND p_fy_end
        JOIN account a ON a.id=jl.account_id AND a.account_type IN ('income','expense')
        GROUP BY jl.account_id HAVING SUM(jl.func_amount) <> 0
    LOOP
        v_lines := v_lines || jsonb_build_object('account_id',r.account_id,'txn_ccy',v_ccy,'txn_amount',-r.s,'location_code',v_loc,'memo','Year-end close');
        v_net := v_net + r.s;
    END LOOP;
    IF v_lines = '[]'::jsonb THEN RAISE EXCEPTION 'Nothing to close for % %..%', p_entity, p_fy_start, p_fy_end; END IF;
    v_lines := v_lines || jsonb_build_object('account_id',v_re,'txn_ccy',v_ccy,'txn_amount',v_net,'location_code',v_loc,'memo','Profit/(loss) to retained earnings');
    v_jid := post_journal(p_entity, p_fy_end, 'year-end-close', 'Year-end close '||p_fy_start||' to '||p_fy_end, p_created_by, v_lines, 'system');
    UPDATE accounting_period SET status='closed'
      WHERE entity_id=p_entity AND period BETWEEN to_char(p_fy_start,'YYYY-MM') AND to_char(p_fy_end,'YYYY-MM');
    RETURN v_jid;
END $$;

-- ---------------------------------------------------------------- journal approval gate
CREATE TABLE IF NOT EXISTS journal_approval_rule (
    entity_id bigint PRIMARY KEY REFERENCES entity(id),
    threshold numeric(20,2) NOT NULL
);
CREATE OR REPLACE FUNCTION set_approval_threshold(p_entity bigint, p_threshold numeric)
RETURNS void LANGUAGE sql AS $$
    INSERT INTO journal_approval_rule(entity_id,threshold) VALUES (p_entity,p_threshold)
    ON CONFLICT (entity_id) DO UPDATE SET threshold=EXCLUDED.threshold;
$$;

-- post a journal; if its value is at/above the entity threshold, hold it as draft (out of the ledger) pending approval
CREATE OR REPLACE FUNCTION post_with_approval(
    p_entity bigint, p_date date, p_source text, p_narrative text, p_created_by text, p_lines jsonb, p_type text DEFAULT 'manual')
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_j bigint; v_thr numeric; v_dr numeric;
BEGIN
    v_j := post_journal(p_entity, p_date, p_source, p_narrative, p_created_by, p_lines, p_type);
    SELECT threshold INTO v_thr FROM journal_approval_rule WHERE entity_id=p_entity;
    IF v_thr IS NOT NULL THEN
        SELECT COALESCE(SUM((e->>'txn_amount')::numeric) FILTER (WHERE (e->>'txn_amount')::numeric>0),0)
          INTO v_dr FROM jsonb_array_elements(p_lines) e;
        IF v_dr >= v_thr THEN UPDATE journal SET status='draft', posted_at=NULL WHERE id=v_j; END IF;
    END IF;
    RETURN v_j;
END $$;

CREATE OR REPLACE FUNCTION approve_journal(p_journal bigint, p_approver text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    UPDATE journal SET status='posted', approved_by=p_approver, posted_at=now()
      WHERE id=p_journal AND status='draft';
    RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION reject_journal(p_journal bigint)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM journal_line WHERE journal_id=p_journal AND EXISTS (SELECT 1 FROM journal WHERE id=p_journal AND status='draft');
    DELETE FROM journal WHERE id=p_journal AND status='draft';
    RETURN FOUND;
END $$;

-- ─── 043_budgets.sql ───
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

-- ─── 044_controls.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CONTROLS  (044)
--   * RBAC: users, roles, per-entity access
--   * Row-level security: users only see entities they are granted
--   * Segregation of duties: maker<>checker on approval; conflicting-role guard
--   * SECURITY DEFINER hardening of mutating functions
-- In Supabase, wire current_app_user() to auth.uid()/JWT; here it reads a GUC.
-- =====================================================================

CREATE TABLE IF NOT EXISTS app_role (
    code text PRIMARY KEY, name text NOT NULL );
INSERT INTO app_role(code,name) VALUES
 ('admin','Administrator'),('preparer','Preparer'),('approver','Approver'),
 ('accountant','Accountant'),('viewer','Read-only') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS app_user (
    username text PRIMARY KEY, full_name text, is_active boolean NOT NULL DEFAULT true );

CREATE TABLE IF NOT EXISTS app_user_role (
    username text NOT NULL REFERENCES app_user(username),
    role_code text NOT NULL REFERENCES app_role(code),
    PRIMARY KEY (username, role_code) );

CREATE TABLE IF NOT EXISTS user_entity_access (
    username text NOT NULL REFERENCES app_user(username),
    entity_id bigint NOT NULL REFERENCES entity(id),
    PRIMARY KEY (username, entity_id) );

-- conflicting role pairs (segregation of duties matrix)
CREATE TABLE IF NOT EXISTS sod_conflict ( role_a text NOT NULL, role_b text NOT NULL );
INSERT INTO sod_conflict(role_a,role_b) VALUES ('preparer','approver') ON CONFLICT DO NOTHING;

-- session identity (replace body with auth.uid() lookup in Supabase)
CREATE OR REPLACE FUNCTION current_app_user() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT current_setting('affinity.current_user', true) $$;

CREATE OR REPLACE FUNCTION set_app_user(p_username text) RETURNS text
LANGUAGE sql AS $$ SELECT set_config('affinity.current_user', p_username, false) $$;

CREATE OR REPLACE FUNCTION is_app_admin(p_user text) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM app_user_role WHERE username=p_user AND role_code='admin') $$;

CREATE OR REPLACE FUNCTION user_has_entity_access(p_user text, p_entity bigint) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(is_app_admin(p_user), false)
        OR EXISTS (SELECT 1 FROM user_entity_access WHERE username=p_user AND entity_id=p_entity) $$;

-- assign a role with SoD conflict guard
CREATE OR REPLACE FUNCTION assign_user_role(p_user text, p_role text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_conflict text;
BEGIN
    SELECT CASE WHEN c.role_a=p_role THEN c.role_b ELSE c.role_a END INTO v_conflict
    FROM sod_conflict c
    JOIN app_user_role ur ON ur.username=p_user
       AND ur.role_code = CASE WHEN c.role_a=p_role THEN c.role_b ELSE c.role_a END
    WHERE p_role IN (c.role_a, c.role_b) LIMIT 1;
    IF v_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'Segregation of duties: % cannot also hold % for user %', p_role, v_conflict, p_user;
    END IF;
    INSERT INTO app_user_role(username,role_code) VALUES (p_user,p_role) ON CONFLICT DO NOTHING;
END $$;

-- maker<>checker on journal approval (redefines 042 with SoD)
CREATE OR REPLACE FUNCTION approve_journal(p_journal bigint, p_approver text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_creator text;
BEGIN
    SELECT created_by INTO v_creator FROM journal WHERE id=p_journal AND status='draft';
    IF v_creator IS NULL THEN RETURN false; END IF;
    IF v_creator = p_approver THEN
        RAISE EXCEPTION 'Segregation of duties: % cannot approve their own journal %', p_approver, p_journal;
    END IF;
    UPDATE journal SET status='posted', approved_by=p_approver, posted_at=now()
      WHERE id=p_journal AND status='draft';
    RETURN FOUND;
END $$;

-- row-level security: restrict ledger + sales/purchase ledgers by entity access
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS journal_entity_access ON journal;
CREATE POLICY journal_entity_access ON journal FOR ALL
  USING (user_has_entity_access(current_app_user(), entity_id));

ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_entity_access ON invoice;
CREATE POLICY invoice_entity_access ON invoice FOR ALL
  USING (user_has_entity_access(current_app_user(), entity_id));

ALTER TABLE supplier_invoice ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sinv_entity_access ON supplier_invoice;
CREATE POLICY sinv_entity_access ON supplier_invoice FOR ALL
  USING (user_has_entity_access(current_app_user(), entity_id));

-- application role for the API to connect as (subject to RLS; not a superuser)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='affinity_app') THEN CREATE ROLE affinity_app NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO affinity_app;
GRANT SELECT ON journal, journal_line, invoice, supplier_invoice, account, entity,
                app_user, app_user_role, user_entity_access, app_role TO affinity_app;
GRANT EXECUTE ON FUNCTION current_app_user(), set_app_user(text),
                is_app_admin(text), user_has_entity_access(text,bigint) TO affinity_app;

-- ---- SECURITY DEFINER hardening of mutating functions (run search_path-pinned) ----
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname = ANY(ARRAY[
            'post_journal','reverse_journal','apply_receipt','close_year','approve_journal','reject_journal',
            'post_with_approval','capitalise_asset','post_depreciation','impair_asset','transfer_asset',
            'post_intercompany_charge','draw_ic_loan','accrue_ic_loan_interest','repay_ic_loan',
            'settle_intercompany','post_tp_charge','run_recurring_journals','run_deferrals',
            'create_prepayment','create_accrual','import_bank_statement','import_mt940','auto_match_by_rules',
            'post_bank_item','apply_withholding_tax','record_reverse_charge','post_statutory_adjustment'])
    LOOP
        EXECUTE 'ALTER FUNCTION '||r.sig||' SECURITY DEFINER SET search_path = public';
    END LOOP;
END $$;

-- ─── 045_documents_audit.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  DOCUMENT LINKING + AUDITOR PACKS  (045)
--   * link ledger objects (journals, invoices, assets...) to DMS documents
--   * external auditor reporting pack (JSON) assembled from the ledger
--   * journal-entry test sample (audit risk flags)
-- =====================================================================

-- DMS taxonomy (align codes to the app's 17-category folder structure)
CREATE TABLE IF NOT EXISTS dms_category ( code int PRIMARY KEY, name text NOT NULL );
INSERT INTO dms_category(code,name) VALUES
 (1,'Incorporation & Constitutional'),(2,'Statutory Registers'),(3,'KYC / CDD'),
 (4,'Client Agreements'),(5,'Board & Governance'),(6,'Accounting & Bookkeeping'),
 (7,'Financial Statements'),(8,'Tax & VAT'),(9,'Banking'),(10,'Invoices & Billing'),
 (11,'Contracts & Agreements'),(12,'Correspondence'),(13,'Regulatory & Compliance'),
 (14,'Trust Deeds & Documents'),(15,'Property & Assets'),(16,'Fixed Assets'),(17,'Archive')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS document_link (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id bigint NOT NULL REFERENCES entity(id),
    object_type text NOT NULL,             -- 'journal','invoice','supplier_invoice','fixed_asset','bank_statement'
    object_id bigint NOT NULL,
    dms_category int REFERENCES dms_category(code),
    dms_ref text,                          -- path or document id in the app DMS
    filename text,
    uploaded_by text,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_document_link_object ON document_link(object_type, object_id);

CREATE OR REPLACE FUNCTION link_document(
    p_entity bigint, p_object_type text, p_object_id bigint, p_category int,
    p_ref text, p_filename text, p_user text)
RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO document_link(entity_id,object_type,object_id,dms_category,dms_ref,filename,uploaded_by)
    VALUES (p_entity,p_object_type,p_object_id,p_category,p_ref,p_filename,p_user) RETURNING id;
$$;

CREATE OR REPLACE FUNCTION get_object_documents(p_object_type text, p_object_id bigint)
RETURNS TABLE(id bigint, category text, dms_ref text, filename text, uploaded_by text, uploaded_at timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT dl.id, dc.name, dl.dms_ref, dl.filename, dl.uploaded_by, dl.uploaded_at
    FROM document_link dl LEFT JOIN dms_category dc ON dc.code=dl.dms_category
    WHERE dl.object_type=p_object_type AND dl.object_id=p_object_id ORDER BY dl.uploaded_at;
$$;

-- audit risk sample: manual journals in the period that are high-value or weekend-posted
CREATE OR REPLACE FUNCTION journal_test_sample(p_entity bigint, p_start date, p_end date, p_threshold numeric)
RETURNS TABLE(journal_id bigint, journal_date date, created_by text, approved_by text,
              value numeric, flag text)
LANGUAGE sql STABLE AS $$
    SELECT j.id, j.journal_date, j.created_by, j.approved_by,
           t.val,
           concat_ws(' + ',
             CASE WHEN t.val >= p_threshold THEN 'high-value' END,
             CASE WHEN extract(dow from j.journal_date) IN (0,6) THEN 'weekend' END,
             CASE WHEN j.created_by = j.approved_by THEN 'maker=checker' END) AS flag
    FROM journal j
    JOIN (SELECT journal_id, SUM(func_amount) FILTER (WHERE func_amount>0) val FROM journal_line GROUP BY journal_id) t
      ON t.journal_id = j.id
    WHERE j.entity_id=p_entity AND j.status='posted' AND j.journal_type='manual'
      AND j.journal_date BETWEEN p_start AND p_end
      AND ( t.val >= p_threshold OR extract(dow from j.journal_date) IN (0,6) OR j.created_by = j.approved_by )
    ORDER BY t.val DESC;
$$;

-- external auditor pack: one JSON document with the standard year-end extracts
CREATE OR REPLACE FUNCTION build_audit_pack(p_entity bigint, p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v jsonb; v_loc text; v_name text; v_code text;
BEGIN
    SELECT name, company_code INTO v_name, v_code FROM entity WHERE id=p_entity;
    v := jsonb_build_object(
      'entity', jsonb_build_object('id',p_entity,'code',v_code,'name',v_name),
      'period', jsonb_build_object('start',p_start,'end',p_end),
      'generated_at', now(),

      'trial_balance', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'balance',bal) ORDER BY code),'[]')
        FROM (SELECT a.code,a.name,round(SUM(jl.func_amount),2) bal
              FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
                AND j.entity_id=p_entity AND j.journal_date<=p_end
              JOIN account a ON a.id=jl.account_id
              GROUP BY a.code,a.name HAVING round(SUM(jl.func_amount),2)<>0) t),

      'profit_and_loss', (
        SELECT jsonb_build_object(
          'income', COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.account_type='income'),0),
          'expenses', COALESCE(SUM(jl.func_amount) FILTER (WHERE a.account_type='expense'),0),
          'profit', COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.account_type IN ('income','expense')),0))
        FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
          AND j.entity_id=p_entity AND j.journal_date BETWEEN p_start AND p_end
        JOIN account a ON a.id=jl.account_id),

      'balance_sheet', (
        SELECT jsonb_build_object(
          'assets', COALESCE(SUM(jl.func_amount) FILTER (WHERE a.account_type='asset'),0),
          'liabilities', COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.account_type='liability'),0),
          'equity', COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.account_type='equity'),0))
        FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
          AND j.entity_id=p_entity AND j.journal_date<=p_end
        JOIN account a ON a.id=jl.account_id),

      'ar_aging', (
        SELECT jsonb_build_object(
          'current', COALESCE(SUM(outstanding) FILTER (WHERE p_end-(invoice_date+30) <= 0),0),
          'd1_30',   COALESCE(SUM(outstanding) FILTER (WHERE p_end-(invoice_date+30) BETWEEN 1 AND 30),0),
          'd31_60',  COALESCE(SUM(outstanding) FILTER (WHERE p_end-(invoice_date+30) BETWEEN 31 AND 60),0),
          'd60_plus',COALESCE(SUM(outstanding) FILTER (WHERE p_end-(invoice_date+30) > 60),0))
        FROM invoice WHERE entity_id=p_entity AND outstanding>0 AND invoice_date<=p_end),

      'ap_aging', (
        SELECT jsonb_build_object(
          'current', COALESCE(SUM(outstanding) FILTER (WHERE p_end-due_date <= 0),0),
          'd1_30',   COALESCE(SUM(outstanding) FILTER (WHERE p_end-due_date BETWEEN 1 AND 30),0),
          'd31_60',  COALESCE(SUM(outstanding) FILTER (WHERE p_end-due_date BETWEEN 31 AND 60),0),
          'd60_plus',COALESCE(SUM(outstanding) FILTER (WHERE p_end-due_date > 60),0))
        FROM supplier_invoice WHERE entity_id=p_entity AND outstanding>0 AND invoice_date<=p_end),

      'fixed_assets', (SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM note_fixed_assets(p_entity,p_start,p_end) t),
      'related_party', (SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM note_related_party(p_entity,p_start,p_end) t),
      'journal_test_sample', (SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM journal_test_sample(p_entity,p_start,p_end,10000) t),

      'document_completeness', (
        SELECT jsonb_build_object(
          'invoices_total', COUNT(*),
          'invoices_with_documents', COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM document_link dl WHERE dl.object_type='invoice' AND dl.object_id=i.id)),
          'invoices_missing_documents', COUNT(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM document_link dl WHERE dl.object_type='invoice' AND dl.object_id=i.id)))
        FROM invoice i WHERE i.entity_id=p_entity AND i.invoice_date BETWEEN p_start AND p_end)
    );
    RETURN v;
END $$;

-- ─── 046_customer_master.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CUSTOMER MASTER + CREDIT CONTROL  (046)
-- A first-class AR customer record (previously customers were implicit),
-- credit limits / hold, a dunning ladder, a collections worklist, and a
-- per-customer statement. Invoices gain an optional customer_id.
-- =====================================================================

CREATE TABLE IF NOT EXISTS customer (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_entity_id    bigint NOT NULL REFERENCES entity(id),   -- the Affinity entity that bills them
    code               text NOT NULL,
    name               text NOT NULL,
    ccy                char(3) NOT NULL DEFAULT 'GBP',
    credit_limit       numeric(20,2) NOT NULL DEFAULT 0,
    payment_terms_days int NOT NULL DEFAULT 30,
    on_hold            boolean NOT NULL DEFAULT false,
    email              text,
    address            text,
    is_active          boolean NOT NULL DEFAULT true,
    UNIQUE (owner_entity_id, code)
);

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS customer_id bigint REFERENCES customer(id);

-- dunning ladder (suggested escalation by days overdue)
CREATE TABLE IF NOT EXISTS dunning_level (
    level int PRIMARY KEY, name text NOT NULL, min_days_overdue int NOT NULL );
INSERT INTO dunning_level(level,name,min_days_overdue) VALUES
 (1,'Statement / reminder',1),(2,'First chaser',15),(3,'Final notice',30),(4,'Pre-legal / stop credit',60)
ON CONFLICT DO NOTHING;

-- collection actions log (audit of chasing activity)
CREATE TABLE IF NOT EXISTS collection_action (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id bigint NOT NULL REFERENCES customer(id),
    invoice_id  bigint REFERENCES invoice(id),
    action_date date NOT NULL,
    level int REFERENCES dunning_level(level),
    note text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION log_collection_action(
    p_customer bigint, p_invoice bigint, p_date date, p_level int, p_note text, p_user text)
RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO collection_action(customer_id,invoice_id,action_date,level,note,created_by)
    VALUES (p_customer,p_invoice,p_date,p_level,p_note,p_user) RETURNING id;
$$;

-- credit status per customer (exposure vs limit)
CREATE OR REPLACE FUNCTION customer_credit_status(p_owner_entity bigint)
RETURNS TABLE(customer_id bigint, code text, name text, credit_limit numeric,
              outstanding numeric, available numeric, over_limit boolean, on_hold boolean)
LANGUAGE sql STABLE AS $$
    SELECT c.id, c.code, c.name, c.credit_limit,
           COALESCE(SUM(i.outstanding),0),
           c.credit_limit - COALESCE(SUM(i.outstanding),0),
           COALESCE(SUM(i.outstanding),0) > c.credit_limit,
           c.on_hold
    FROM customer c
    LEFT JOIN invoice i ON i.customer_id=c.id AND i.outstanding>0
    WHERE c.owner_entity_id=p_owner_entity
    GROUP BY c.id, c.code, c.name, c.credit_limit, c.on_hold
    ORDER BY c.code;
$$;

-- collections worklist: overdue invoices with days overdue + suggested dunning level
CREATE OR REPLACE FUNCTION report_collections(p_owner_entity bigint, p_as_at date DEFAULT current_date)
RETURNS TABLE(customer_code text, customer_name text, invoice_id bigint, invoice_date date,
              due_date date, outstanding numeric, days_overdue int, suggested_level int, dunning_name text)
LANGUAGE sql STABLE AS $$
    SELECT c.code, c.name, i.id, i.invoice_date,
           (i.invoice_date + c.payment_terms_days) AS due_date,
           i.outstanding,
           (p_as_at - (i.invoice_date + c.payment_terms_days))::int AS days_overdue,
           dl.level, dl.name
    FROM invoice i
    JOIN customer c ON c.id = i.customer_id
    LEFT JOIN LATERAL (
        SELECT level, name FROM dunning_level
        WHERE min_days_overdue <= (p_as_at - (i.invoice_date + c.payment_terms_days))
        ORDER BY level DESC LIMIT 1
    ) dl ON true
    WHERE i.entity_id=p_owner_entity AND i.outstanding>0
      AND (i.invoice_date + c.payment_terms_days) < p_as_at
    ORDER BY days_overdue DESC, c.code;
$$;

-- per-customer statement (open items)
CREATE OR REPLACE FUNCTION customer_statement_for(p_customer bigint, p_as_at date DEFAULT current_date)
RETURNS TABLE(invoice_id bigint, invoice_date date, gross numeric, outstanding numeric, status text)
LANGUAGE sql STABLE AS $$
    SELECT i.id, i.invoice_date, i.gross_total, i.outstanding, i.settled
    FROM invoice i WHERE i.customer_id=p_customer AND i.invoice_date<=p_as_at
    ORDER BY i.invoice_date, i.id;
$$;

-- ─── 047_budget_plus.sql ───
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

-- ─── 048_doc_retention.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  DOCUMENT RETENTION + SEARCH  (048)
-- Extends 045: a per-category retention policy that stamps a retention_until
-- date on every linked document, a destruction-review worklist, and full-text
-- search across the document repository (filename / reference / category).
-- =====================================================================

CREATE TABLE IF NOT EXISTS retention_policy (
    dms_category int PRIMARY KEY REFERENCES dms_category(code),
    retain_years int,            -- NULL = retain permanently
    basis text
);
-- sensible CSP / trust defaults (NULL = permanent)
INSERT INTO retention_policy(dms_category,retain_years,basis) VALUES
 (1,NULL,'Constitutional — retain permanently'),
 (2,NULL,'Statutory registers — retain permanently'),
 (3,5,'KYC/CDD — 5 years after end of relationship'),
 (4,6,'Client agreements — 6 years'),
 (5,NULL,'Board & governance — retain permanently'),
 (6,6,'Accounting records — 6 years'),
 (7,NULL,'Financial statements — retain permanently'),
 (8,6,'Tax & VAT — 6 years'),
 (9,6,'Banking — 6 years'),
 (10,6,'Invoices & billing — 6 years'),
 (11,6,'Contracts — 6 years'),
 (12,6,'Correspondence — 6 years'),
 (13,6,'Regulatory & compliance — 6 years'),
 (14,NULL,'Trust deeds — retain permanently'),
 (15,6,'Property & assets — 6 years'),
 (16,6,'Fixed assets — 6 years'),
 (17,10,'Archive — 10 years')
ON CONFLICT DO NOTHING;

ALTER TABLE document_link ADD COLUMN IF NOT EXISTS retention_until date;

-- recreate link_document so it stamps retention_until from the policy
CREATE OR REPLACE FUNCTION link_document(
    p_entity bigint, p_object_type text, p_object_id bigint, p_category int,
    p_ref text, p_filename text, p_user text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_years int; v_until date; v_id bigint;
BEGIN
    SELECT retain_years INTO v_years FROM retention_policy WHERE dms_category=p_category;
    v_until := CASE WHEN v_years IS NULL THEN NULL ELSE (current_date + (v_years||' years')::interval)::date END;
    INSERT INTO document_link(entity_id,object_type,object_id,dms_category,dms_ref,filename,uploaded_by,retention_until)
    VALUES (p_entity,p_object_type,p_object_id,p_category,p_ref,p_filename,p_user,v_until)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- backfill retention_until on documents linked before this migration
UPDATE document_link dl
SET retention_until = CASE WHEN rp.retain_years IS NULL THEN NULL
                           ELSE (dl.uploaded_at::date + (rp.retain_years||' years')::interval)::date END
FROM retention_policy rp
WHERE dl.dms_category = rp.dms_category AND dl.retention_until IS NULL;

-- documents past their retention date (destruction review worklist)
CREATE OR REPLACE VIEW v_documents_due_destruction AS
SELECT dl.id, dl.entity_id, dc.name AS category, dl.filename, dl.dms_ref,
       dl.uploaded_at::date AS uploaded, dl.retention_until
FROM document_link dl JOIN dms_category dc ON dc.code=dl.dms_category
WHERE dl.retention_until IS NOT NULL AND dl.retention_until <= current_date;

-- full-text search across the repository (filename / reference / category)
CREATE OR REPLACE FUNCTION search_documents(p_entity bigint, p_query text)
RETURNS TABLE(id bigint, object_type text, object_id bigint, category text,
              filename text, dms_ref text, uploaded timestamptz, rank real)
LANGUAGE sql STABLE AS $$
    SELECT dl.id, dl.object_type, dl.object_id, dc.name, dl.filename, dl.dms_ref, dl.uploaded_at,
           ts_rank(to_tsvector('english',
               coalesce(dl.filename,'')||' '||coalesce(dl.dms_ref,'')||' '||coalesce(dc.name,'')),
               websearch_to_tsquery('english', p_query)) AS rank
    FROM document_link dl JOIN dms_category dc ON dc.code=dl.dms_category
    WHERE (p_entity IS NULL OR dl.entity_id=p_entity)
      AND to_tsvector('english',
            coalesce(dl.filename,'')||' '||coalesce(dl.dms_ref,'')||' '||coalesce(dc.name,''))
          @@ websearch_to_tsquery('english', p_query)
    ORDER BY rank DESC, dl.uploaded_at DESC;
$$;

-- ─── 049_per_entity_coa.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  PER-ENTITY CoA + GROUP MAPPING  (049)
-- The engine already resolves a chart per entity (entity.client_type ->
-- coa_template -> ledger_config). This proves it with a SECOND chart and adds
-- the group-mapping layer so entities on different charts consolidate to one
-- common group structure.
-- =====================================================================

-- second chart of accounts (a distinct trust-company chart)
INSERT INTO coa_template(code,name) SELECT 'TRUSTCOA','Trust company CoA'
WHERE NOT EXISTS (SELECT 1 FROM coa_template WHERE code='TRUSTCOA')
ON CONFLICT DO NOTHING;

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
  AND NOT EXISTS (SELECT 1 FROM account a WHERE a.coa_template_id=t.id AND a.code=x.code)
ON CONFLICT DO NOTHING;

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

-- ─── 050_kpis.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  KPI METRICS LAYER  (050)
-- Engine-side data backbone for the app's KPI dashboard (chart rendering is
-- front-end). Computes standard finance KPIs per entity for a period.
-- =====================================================================

CREATE OR REPLACE FUNCTION entity_kpis(p_entity bigint, p_start date, p_end date)
RETURNS TABLE(metric text, value numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_rev numeric; v_exp numeric; v_cash numeric; v_debt numeric; v_cred numeric;
        v_days int := GREATEST((p_end - p_start) + 1, 1);
BEGIN
    SELECT COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.account_type='income'),0),
           COALESCE( SUM(jl.func_amount) FILTER (WHERE a.account_type='expense'),0)
      INTO v_rev, v_exp
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
      AND j.entity_id=p_entity AND j.journal_date BETWEEN p_start AND p_end
    JOIN account a ON a.id=jl.account_id;

    SELECT COALESCE(SUM(jl.func_amount),0) INTO v_cash
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
      AND j.entity_id=p_entity AND j.journal_date<=p_end
    JOIN account a ON a.id=jl.account_id AND a.code IN ('1000','1010','1020');

    SELECT COALESCE(SUM(jl.func_amount),0) INTO v_debt
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
      AND j.entity_id=p_entity AND j.journal_date<=p_end
    JOIN account a ON a.id=jl.account_id AND a.code='1100';

    SELECT COALESCE(-SUM(jl.func_amount),0) INTO v_cred
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
      AND j.entity_id=p_entity AND j.journal_date<=p_end
    JOIN account a ON a.id=jl.account_id AND a.code='2100';

    metric:='revenue';        value:=round(v_rev,2); RETURN NEXT;
    metric:='expenses';       value:=round(v_exp,2); RETURN NEXT;
    metric:='net_profit';     value:=round(v_rev-v_exp,2); RETURN NEXT;
    metric:='profit_margin_pct'; value:=CASE WHEN v_rev<>0 THEN round((v_rev-v_exp)/v_rev*100,1) ELSE NULL END; RETURN NEXT;
    metric:='cash';           value:=round(v_cash,2); RETURN NEXT;
    metric:='trade_debtors';  value:=round(v_debt,2); RETURN NEXT;
    metric:='trade_creditors';value:=round(v_cred,2); RETURN NEXT;
    metric:='working_capital';value:=round(v_cash+v_debt-v_cred,2); RETURN NEXT;
    metric:='current_ratio';  value:=CASE WHEN v_cred<>0 THEN round((v_cash+v_debt)/v_cred,2) ELSE NULL END; RETURN NEXT;
    metric:='dso_days';       value:=CASE WHEN v_rev<>0 THEN round(v_debt/v_rev*v_days,0) ELSE NULL END; RETURN NEXT;
END $$;

-- JSON KPI bundle for the dashboard to bind to
CREATE OR REPLACE FUNCTION build_kpi_dashboard(p_entity bigint, p_start date, p_end date)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'entity', (SELECT jsonb_build_object('id',id,'code',company_code,'name',name) FROM entity WHERE id=p_entity),
        'period', jsonb_build_object('start',p_start,'end',p_end),
        'kpis', (SELECT jsonb_object_agg(metric, value) FROM entity_kpis(p_entity,p_start,p_end)));
$$;

-- ─── 051_retention_jurisdiction.sql ───
-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE — JURISDICTION-AWARE RETENTION  (051)
-- Aligns document retention to the Master Security Document §8: retention
-- depends on data type (Corporate / AML-CFT / Audit) AND the entity's
-- jurisdiction. Extends the flat per-category policy from 048.
--   Corporate records : IOM/Malta/Cayman/Cyprus 6y · US 7y
--   AML/CFT records    : IOM/Malta/Cyprus 5y · Cayman up to 7y · US n/a
--   Audit logs         : 7y everywhere (reference; enforced at the log store)
-- =====================================================================

-- jurisdictions referenced by the matrix (guarded)
INSERT INTO location(code,name) VALUES
 ('USA','United States'),('CYPRUS','Cyprus'),('UK','United Kingdom')
ON CONFLICT DO NOTHING;

-- classify each document category into a data class
ALTER TABLE retention_policy ADD COLUMN IF NOT EXISTS data_class text;
UPDATE retention_policy SET data_class='AML_CFT'   WHERE dms_category IN (3,13);
UPDATE retention_policy SET data_class='CORPORATE' WHERE dms_category IN (4,6,8,9,10,11,12,15,16);
-- categories 1,2,5,7,14 (permanent) and 17 (archive) keep data_class NULL and
-- therefore fall back to their base retain_years from 048.

-- data-class × jurisdiction retention matrix (§8)
CREATE TABLE IF NOT EXISTS retention_rule (
    data_class   text NOT NULL,
    jurisdiction text NOT NULL REFERENCES location(code),
    retain_years int,                 -- NULL = no rule / permanent
    basis        text,
    PRIMARY KEY (data_class, jurisdiction)
);
INSERT INTO retention_rule(data_class,jurisdiction,retain_years,basis) VALUES
 ('CORPORATE','IOM',   6,'Corporate records — 6 years'),
 ('CORPORATE','MALTA', 6,'Corporate records — 6 years'),
 ('CORPORATE','CYM',   6,'Corporate records — 6 years'),
 ('CORPORATE','CYPRUS',6,'Corporate records — 6 years'),
 ('CORPORATE','UK',    6,'Corporate records — 6 years'),
 ('CORPORATE','USA',   7,'Corporate/tax records — 7 years'),
 ('AML_CFT','IOM',   5,'AML/CFT — 5 years'),
 ('AML_CFT','MALTA', 5,'AML/CFT — 5 years'),
 ('AML_CFT','CYM',   7,'AML/CFT — up to 7 years'),
 ('AML_CFT','CYPRUS',5,'AML/CFT — 5 years'),
 ('AML_CFT','UK',    5,'AML/CFT — 5 years'),
 -- US AML/CFT deliberately omitted (doc: N/A) -> falls back to category base
 ('AUDIT','IOM',7,'Audit logs — 7 years'),('AUDIT','MALTA',7,'Audit logs — 7 years'),
 ('AUDIT','CYM',7,'Audit logs — 7 years'),('AUDIT','CYPRUS',7,'Audit logs — 7 years'),
 ('AUDIT','UK',7,'Audit logs — 7 years'),('AUDIT','USA',7,'Audit logs — 7 years')
ON CONFLICT DO NOTHING;

-- resolve retention years for a category in a jurisdiction
CREATE OR REPLACE FUNCTION retention_years(p_category int, p_jurisdiction text)
RETURNS int LANGUAGE plpgsql STABLE AS $$
DECLARE v_class text; v_base int; v_years int;
BEGIN
    SELECT data_class, retain_years INTO v_class, v_base FROM retention_policy WHERE dms_category=p_category;
    IF v_class IS NULL THEN RETURN v_base; END IF;           -- permanent / flat base
    SELECT retain_years INTO v_years FROM retention_rule
      WHERE data_class=v_class AND jurisdiction=p_jurisdiction;
    IF FOUND THEN RETURN v_years; END IF;                     -- jurisdiction-specific
    RETURN v_base;                                            -- no rule -> category base
END $$;

-- link_document now stamps retention using the entity's jurisdiction
CREATE OR REPLACE FUNCTION link_document(
    p_entity bigint, p_object_type text, p_object_id bigint, p_category int,
    p_ref text, p_filename text, p_user text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_juris text; v_years int; v_until date; v_id bigint;
BEGIN
    SELECT location_code INTO v_juris FROM entity WHERE id=p_entity;
    v_years := retention_years(p_category, v_juris);
    v_until := CASE WHEN v_years IS NULL THEN NULL
                    ELSE (current_date + (v_years||' years')::interval)::date END;
    INSERT INTO document_link(entity_id,object_type,object_id,dms_category,dms_ref,filename,uploaded_by,retention_until)
    VALUES (p_entity,p_object_type,p_object_id,p_category,p_ref,p_filename,p_user,v_until)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- recompute retention on existing documents using their entity's jurisdiction
UPDATE document_link dl
SET retention_until = CASE WHEN retention_years(dl.dms_category, e.location_code) IS NULL THEN NULL
    ELSE (dl.uploaded_at::date + (retention_years(dl.dms_category, e.location_code)||' years')::interval)::date END
FROM entity e WHERE e.id = dl.entity_id;

-- reference schedule: category × jurisdiction × effective years
CREATE OR REPLACE VIEW v_retention_schedule AS
SELECT rp.dms_category, dc.name AS category, COALESCE(rp.data_class,'(flat)') AS data_class,
       rr.jurisdiction, COALESCE(rr.retain_years, rp.retain_years) AS retain_years
FROM retention_policy rp
JOIN dms_category dc ON dc.code=rp.dms_category
LEFT JOIN retention_rule rr ON rr.data_class=rp.data_class
ORDER BY rp.dms_category, rr.jurisdiction;
