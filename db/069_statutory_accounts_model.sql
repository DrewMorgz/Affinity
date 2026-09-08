-- =====================================================================
-- AFFINITY CORE — 069: STATUTORY ACCOUNTS MODEL
--
-- Core is to produce full filable statutory accounts under all applicable
-- standards. This is the data model and the machinery for that.
--
-- ── A NOTE ON WHAT THIS FILE DOES AND DOES NOT CONTAIN ──────────────
--
-- It contains the ENGINE: accounts sets, framework registry, statement
-- structure, notes, accounting policies, comparatives, approval, and the
-- audit trail behind all of it.
--
-- It does NOT contain authored disclosure requirements for each framework.
-- That is deliberate, and it is the most important thing to understand about
-- this build.
--
-- Filed accounts carry legal weight: directors sign that they give a true and
-- fair view, and auditors rely on them. A disclosure checklist reconstructed
-- from memory would look authoritative and be wrong in ways nobody would spot
-- until a regulator or auditor did. FRS 102 alone was materially amended in
-- 2024; IFRS changes annually; the six jurisdictions Affinity operates in do
-- not share one framework.
--
-- So the framework registry below is structured to be POPULATED AND OWNED by
-- a qualified accountant, and the engine REFUSES TO FINALISE a set with
-- unaddressed disclosure requirements. The control is real even though the
-- content is not mine to write. Where a requirement is unpopulated, the
-- interface says so rather than implying completeness.
--
-- Run AFTER 068. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- FRAMEWORK REGISTRY
-- ─────────────────────────────────────────────────────────────────────
-- Which reporting frameworks exist, and which jurisdictions accept them.
-- Separate from the disclosure requirements so a framework can be registered
-- before its checklist has been authored.
CREATE TABLE IF NOT EXISTS reporting_framework (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  issuer          text,
  applies_to      text,                    -- who may use it
  small_entity    boolean NOT NULL DEFAULT false,
  requires_audit  boolean,
  requires_cash_flow boolean NOT NULL DEFAULT true,
  notes           text,
  -- Set true only when a qualified person has reviewed the disclosure
  -- checklist below and confirmed it complete for the current edition.
  checklist_verified_by   text,
  checklist_verified_at   timestamptz,
  checklist_edition       text,            -- e.g. "FRS 102 (2024 amendments)"
  is_active       boolean NOT NULL DEFAULT true
);

-- The frameworks themselves are facts, not judgements, so they are seeded.
-- Their DISCLOSURE REQUIREMENTS are not seeded — see the note above.
INSERT INTO reporting_framework(code, name, issuer, applies_to, small_entity,
                                requires_audit, requires_cash_flow, notes)
VALUES
 ('FRS102',     'FRS 102 — The Financial Reporting Standard applicable in the UK and Republic of Ireland',
                'Financial Reporting Council', 'UK and Irish entities not applying IFRS', false, NULL, true,
                'Section 1A available for small entities with reduced disclosure.'),
 ('FRS102-1A',  'FRS 102 Section 1A — Small Entities',
                'Financial Reporting Council', 'Small entities meeting the size criteria', true, NULL, false,
                'Reduced disclosure. Size thresholds must be tested each period.'),
 ('FRS105',     'FRS 105 — The Financial Reporting Standard applicable to the Micro-entities Regime',
                'Financial Reporting Council', 'Micro-entities meeting the size criteria', true, false, false,
                'No cash flow statement. Very limited notes.'),
 ('IFRS',       'IFRS Accounting Standards (full)',
                'International Accounting Standards Board', 'Entities applying full IFRS', false, NULL, true, NULL),
 ('IFRS-SME',   'IFRS for SMEs Accounting Standard',
                'International Accounting Standards Board', 'Entities without public accountability', true, NULL, true, NULL),
 ('IOM-GAAP',   'Isle of Man — Companies Acts requirements',
                'Isle of Man Government', 'Isle of Man companies', false, NULL, true,
                'Companies Act 2006 companies have different requirements from 1931 Act companies.'),
 ('MALTA-GAPSME','GAPSME — General Accounting Principles for Small and Medium-Sized Entities',
                'Accountancy Board (Malta)', 'Maltese small and medium entities', true, NULL, true, NULL),
 ('MALTA-IFRS', 'IFRS as adopted by the EU (Malta)',
                'European Union', 'Maltese entities required to apply EU-adopted IFRS', false, NULL, true, NULL),
 ('CAYMAN',     'Cayman Islands — no prescribed framework',
                'Cayman Islands Government', 'Cayman companies', false, false, false,
                'The Companies Act does not prescribe a framework. Accounts are commonly prepared under IFRS or US GAAP; the basis must be stated.'),
 ('CYPRUS-IFRS','IFRS as adopted by the EU (Cyprus)',
                'European Union', 'Cypriot companies', false, NULL, true,
                'Cyprus requires IFRS as adopted by the EU for all companies. Affinity is licensed by CySEC as an Administrative Service Provider, so the Cyprus office is under CySEC supervision for corporate services.'),
 ('US-GAAP',    'US GAAP',
                'Financial Accounting Standards Board', 'US entities', false, NULL, true, NULL)
ON CONFLICT (code) DO NOTHING;

-- Which frameworks a jurisdiction accepts. A trust in Cayman and a company in
-- Cyprus do not have the same options, and offering the wrong one is how a set
-- gets prepared on the wrong basis.
CREATE TABLE IF NOT EXISTS framework_jurisdiction (
  framework_code text NOT NULL REFERENCES reporting_framework(code),
  location_code  text NOT NULL REFERENCES location(code),
  is_default     boolean NOT NULL DEFAULT false,
  note           text,
  PRIMARY KEY (framework_code, location_code)
);

INSERT INTO framework_jurisdiction(framework_code, location_code, is_default, note) VALUES
 ('IOM-GAAP','IOM',true,  NULL),
 ('FRS102','IOM',false,   'Commonly applied in practice.'),
 ('FRS102-1A','IOM',false,NULL),
 ('IFRS','IOM',false,     NULL),
 ('FRS102','UK',true,     NULL),
 ('FRS102-1A','UK',false, NULL),
 ('FRS105','UK',false,    NULL),
 ('IFRS','UK',false,      NULL),
 ('MALTA-GAPSME','MALTA',true,  NULL),
 ('MALTA-IFRS','MALTA',false,   NULL),
 ('CAYMAN','CYM',true,    'Basis of preparation must be stated explicitly.'),
 ('IFRS','CYM',false,     NULL),
 ('US-GAAP','CYM',false,  NULL),
 ('CYPRUS-IFRS','CYPRUS',true,  NULL),
 ('US-GAAP','USA',true,   NULL),
 ('IFRS','USA',false,     NULL)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- DISCLOSURE REQUIREMENTS — the part that must be authored
-- ─────────────────────────────────────────────────────────────────────
-- One row per disclosure a framework requires. Deliberately EMPTY on install.
--
-- Populating this is a job for a qualified accountant, and it is not optional:
-- accounts_set_finalise below refuses to finalise a set whose framework has no
-- verified checklist, so an unpopulated framework cannot silently produce
-- accounts that look complete.
CREATE TABLE IF NOT EXISTS disclosure_requirement (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  framework_code text NOT NULL REFERENCES reporting_framework(code),
  ref            text NOT NULL,            -- e.g. "FRS 102 1AC.12"
  title          text NOT NULL,
  detail         text,
  applies_when   text,                     -- plain English condition
  mandatory      boolean NOT NULL DEFAULT true,
  statement      text,                     -- which primary statement, if any
  sort_order     integer NOT NULL DEFAULT 0,
  added_by       text NOT NULL DEFAULT current_app_user(),
  added_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_code, ref)
);

-- ─────────────────────────────────────────────────────────────────────
-- ACCOUNTS SETS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts_set (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id      bigint NOT NULL REFERENCES entity(id),
  framework_code text NOT NULL REFERENCES reporting_framework(code),
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  prior_start    date,
  prior_end      date,
  ccy            char(3) NOT NULL DEFAULT 'GBP',

  -- draft -> in_review -> finalised -> approved -> filed
  status         text NOT NULL DEFAULT 'draft',

  basis_of_preparation text,               -- required where no framework is prescribed
  going_concern_basis  boolean,
  going_concern_note   text,
  audit_required       boolean,
  auditor              text,
  audit_opinion        text,

  prepared_by    text NOT NULL DEFAULT current_app_user(),
  prepared_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_by    text,
  reviewed_at    timestamptz,
  approved_by    text,                     -- the director who signs
  approved_at    timestamptz,
  filed_at       timestamptz,
  filed_ref      text,

  CONSTRAINT accounts_set_period CHECK (period_end > period_start),
  CONSTRAINT accounts_set_status CHECK (status IN ('draft','in_review','finalised','approved','filed')),
  UNIQUE (entity_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS ix_accounts_set_entity ON accounts_set(entity_id, period_end DESC);

-- The figures, held as a snapshot. Statutory accounts must not change when the
-- ledger is later adjusted — a filed set is a historical document, and
-- regenerating it from a moved ledger would silently alter a signed statement.
CREATE TABLE IF NOT EXISTS accounts_line (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  set_id       bigint NOT NULL REFERENCES accounts_set(id) ON DELETE CASCADE,
  statement    text NOT NULL,              -- income_statement, balance_sheet, cash_flow, equity
  caption      text NOT NULL,
  note_ref     text,
  sort_order   integer NOT NULL DEFAULT 0,
  is_subtotal  boolean NOT NULL DEFAULT false,
  is_total     boolean NOT NULL DEFAULT false,
  current_amount numeric(18,2),
  prior_amount   numeric(18,2),
  CONSTRAINT accounts_line_statement CHECK (statement IN
    ('income_statement','balance_sheet','cash_flow','equity','other'))
);
CREATE INDEX IF NOT EXISTS ix_accounts_line_set ON accounts_line(set_id, statement, sort_order);

-- Notes and accounting policies. Each can be linked to a disclosure
-- requirement, which is how completeness is checked.
CREATE TABLE IF NOT EXISTS accounts_note (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  set_id         bigint NOT NULL REFERENCES accounts_set(id) ON DELETE CASCADE,
  note_number    text,
  kind           text NOT NULL DEFAULT 'note',   -- note | policy | directors_report
  title          text NOT NULL,
  body           text,
  requirement_id bigint REFERENCES disclosure_requirement(id),
  sort_order     integer NOT NULL DEFAULT 0,
  authored_by    text NOT NULL DEFAULT current_app_user(),
  authored_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_note_kind CHECK (kind IN ('note','policy','directors_report','other'))
);
CREATE INDEX IF NOT EXISTS ix_accounts_note_set ON accounts_note(set_id, kind, sort_order);

-- Which requirements have been addressed, and where a requirement is
-- deliberately not applicable, WHY. "Not applicable" without a reason is how
-- a disclosure gets quietly omitted.
CREATE TABLE IF NOT EXISTS accounts_disclosure (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  set_id         bigint NOT NULL REFERENCES accounts_set(id) ON DELETE CASCADE,
  requirement_id bigint NOT NULL REFERENCES disclosure_requirement(id),
  status         text NOT NULL DEFAULT 'outstanding',
  note_id        bigint REFERENCES accounts_note(id),
  not_applicable_reason text,
  addressed_by   text,
  addressed_at   timestamptz,
  CONSTRAINT accounts_disclosure_status CHECK (status IN ('outstanding','addressed','not_applicable')),
  UNIQUE (set_id, requirement_id)
);

-- ── Grants ───────────────────────────────────────────────────────────
REVOKE ALL ON reporting_framework, framework_jurisdiction, disclosure_requirement,
              accounts_set, accounts_line, accounts_note, accounts_disclosure
  FROM PUBLIC, anon;
GRANT SELECT ON reporting_framework, framework_jurisdiction, disclosure_requirement,
                accounts_set, accounts_line, accounts_note, accounts_disclosure
  TO authenticated;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT 'frameworks registered' AS item, count(*)::text AS value FROM reporting_framework
UNION ALL
SELECT 'jurisdiction mappings', count(*)::text FROM framework_jurisdiction
UNION ALL
SELECT 'disclosure requirements authored', count(*)::text FROM disclosure_requirement
UNION ALL
SELECT 'frameworks with a verified checklist',
       count(*)::text FROM reporting_framework WHERE checklist_verified_at IS NOT NULL;
