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
