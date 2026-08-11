-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  GL COMPLETENESS  (042)
--   * generic recurring journals (beyond 011 recurring billing)
--   * accrual & prepayment schedules (spread cost/income over periods)
--   * year-end close + retained-earnings roll-forward
--   * journal approval gate (draft until approved, kept out of the ledger)
-- =====================================================================

-- supporting accounts + roles
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'1400','Prepayments','asset','D' WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='1400');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'2400','Accruals','liability','C' WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='2400');
INSERT INTO account(coa_template_id,code,name,account_type,normal_balance)
SELECT 1,'3200','Retained earnings','equity','C' WHERE NOT EXISTS (SELECT 1 FROM account WHERE coa_template_id=1 AND code='3200');
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
