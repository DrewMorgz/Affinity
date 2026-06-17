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
CREATE TABLE bank_match_rule (
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
