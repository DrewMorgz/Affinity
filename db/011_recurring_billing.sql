-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  RECURRING BILLING  (011)
-- A billing run raises each due proposal's next invoice on its cadence,
-- catching up any missed periods, and closes one-offs after one bill.
-- Each invoice still goes through generate_invoice() -> post_journal().
-- (Effective-dated line changes / period-rolling on deferred recurring fees
--  are noted as the remaining refinement on this item.)
-- =====================================================================

ALTER TABLE proposal ADD COLUMN start_date     date;
ALTER TABLE proposal ADD COLUMN next_bill_date date;


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
