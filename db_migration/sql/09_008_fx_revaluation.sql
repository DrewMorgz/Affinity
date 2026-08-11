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
ALTER TABLE account ADD COLUMN is_monetary boolean NOT NULL DEFAULT false;
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
