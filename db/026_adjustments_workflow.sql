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

CREATE TABLE fs_accounts_set (
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

CREATE TABLE fs_adjustment (
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
