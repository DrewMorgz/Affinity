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
