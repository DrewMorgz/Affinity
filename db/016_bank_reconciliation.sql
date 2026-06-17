-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  BANK RECONCILIATION  (016)
-- Import a bank statement, auto-match its lines to ledger postings on the
-- bank account by amount + date, and post statement-only items (charges,
-- interest) so the book and statement agree. Matches are tracked on the
-- statement line; the ledger is never mutated for matching.
-- =====================================================================

CREATE TABLE bank_statement (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       bigint NOT NULL REFERENCES entity(id),
    bank_account_id bigint NOT NULL REFERENCES account(id),   -- ledger GL bank account
    statement_date  date NOT NULL,
    ccy             char(3) NOT NULL REFERENCES currency(code),
    opening_balance numeric(20,2) NOT NULL DEFAULT 0,
    closing_balance numeric(20,2) NOT NULL DEFAULT 0
);

CREATE TABLE bank_statement_line (
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
