-- =====================================================================
-- AFFINITY CORE — 076: FEE TRANSFERS FROM CLIENT MONEY, AND INTERCOMPANY WRITES
--
-- ── THE CONTROL THIS ADDS, AND WHY IT DIFFERS FROM THE OTHERS ───────
--
-- transfer_fee_from_client_money has good controls already: the amount must be
-- positive, the invoice must exist, it must belong to the firm entity, and the
-- transfer cannot exceed the invoice outstanding.
--
-- What it does NOT do is check that the client holds the money first. If the
-- balance goes negative it records a breach afterwards and proceeds.
--
-- For a client-instructed payment that is the right design — the instruction
-- may be unavoidable and the shortfall then has to be remediated. A FEE
-- TRANSFER IS NOT THE SAME THING. It is entirely the firm's own decision, and
-- taking a fee from a client who does not have the money means the firm has
-- used another client's money to pay itself. There is no urgency that
-- justifies it: the bill can wait.
--
-- So this one is REFUSED rather than recorded. That is a deliberate departure
-- from how pay_client_money behaves, and the reason is the difference between
-- acting on a client's instruction and helping oneself.
--
-- Also wires the intercompany writes, completing the module whose read layer
-- was added in db/073.
--
-- Run AFTER 075. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- FEE TRANSFERS
-- ─────────────────────────────────────────────────────────────────────
-- What is available to take, before taking it. Separate and read-only so the
-- interface can show it beside the fee rather than only refusing afterwards.
CREATE OR REPLACE FUNCTION cm_fee_available(p_cm_client bigint, p_invoice bigint)
RETURNS TABLE(client_name text, held numeric, invoice_outstanding numeric,
              available_to_take numeric, sufficient boolean, ccy char(3))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.name,
         round(coalesce((SELECT sum(m.amount) FROM client_money_movement m
                          WHERE m.cm_client_id = c.id), 0), 2),
         round(coalesce(i.gross_total, 0)
               - coalesce((SELECT sum(ra.amount) FROM receipt_allocation ra
                            WHERE ra.invoice_id = i.id), 0), 2),
         -- The lower of the two: you cannot take more than the client holds,
         -- and you cannot take more than you have billed.
         LEAST(
           round(coalesce((SELECT sum(m.amount) FROM client_money_movement m
                            WHERE m.cm_client_id = c.id), 0), 2),
           round(coalesce(i.gross_total, 0)
                 - coalesce((SELECT sum(ra.amount) FROM receipt_allocation ra
                              WHERE ra.invoice_id = i.id), 0), 2)),
         (round(coalesce((SELECT sum(m.amount) FROM client_money_movement m
                            WHERE m.cm_client_id = c.id), 0), 2) > 0),
         i.ccy
    FROM cm_client c
    LEFT JOIN invoice i ON i.id = p_invoice
   WHERE c.id = p_cm_client;
$$;

CREATE OR REPLACE FUNCTION cm_fee_transfer(
  p_cm_client bigint, p_cm_account bigint, p_firm_entity bigint,
  p_firm_bank bigint, p_invoice_id bigint, p_date date, p_amount numeric)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE held numeric; nm text; res bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'The fee to transfer must be a positive amount';
  END IF;

  SELECT c.name,
         round(coalesce((SELECT sum(m.amount) FROM client_money_movement m
                          WHERE m.cm_client_id = c.id), 0), 2)
    INTO nm, held
    FROM cm_client c WHERE c.id = p_cm_client;
  IF nm IS NULL THEN RAISE EXCEPTION 'Client money client % not found', p_cm_client; END IF;

  -- The check the engine's function does not make.
  --
  -- Refused, not recorded. Unlike a payment the client instructed, a fee
  -- transfer is the firm helping itself, and taking more than the client holds
  -- means taking it from another client. The bill can wait.
  IF p_amount > held THEN
    RAISE EXCEPTION 'Cannot take % from % — only % is held for that client. Taking more would be paying the firm out of another client''s money. Bill the client and wait for funds, or transfer only the amount held.',
      round(p_amount,2), nm, round(held,2);
  END IF;

  -- Argument order checked against pg_get_function_identity_arguments:
  -- p_amount comes BEFORE p_date. Passing them the other way round failed at
  -- runtime rather than at install, which is the worst place to find it.
  res := transfer_fee_from_client_money(p_cm_client, p_cm_account, p_firm_entity,
                                        p_firm_bank, p_invoice_id, p_amount, p_date,
                                        current_app_user());

  PERFORM ea_audit(p_firm_entity, 'client_money_movement', res,
                   'FEE TAKEN FROM CLIENT MONEY',
                   round(p_amount,2) || ' from ' || nm || ' against invoice ' ||
                   p_invoice_id || ' — ' || round(held - p_amount,2) || ' remaining');
  RETURN res;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- INTERCOMPANY WRITES
-- ─────────────────────────────────────────────────────────────────────
-- Completes the module read-layered in db/073. Each wraps the engine's
-- function and adds the check it lacks.
CREATE OR REPLACE FUNCTION ic_loan_draw(p_loan bigint, p_date date, p_amount numeric)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE l ic_loan; drawn numeric; res bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'The drawdown must be a positive amount';
  END IF;
  SELECT * INTO l FROM ic_loan WHERE id = p_loan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intercompany loan % not found', p_loan; END IF;
  IF coalesce(l.status,'') NOT IN ('active','') THEN
    RAISE EXCEPTION 'Loan % is %, so it cannot be drawn on', p_loan, l.status;
  END IF;
  IF p_date < l.start_date THEN
    RAISE EXCEPTION 'The drawdown date is before the facility start date of %', l.start_date;
  END IF;

  -- Drawing beyond the facility is not a rounding matter: the facility is the
  -- agreed limit, and exceeding it means the agreement no longer describes
  -- what happened, which is what a tax authority reads.
  SELECT round(coalesce(sum(d.drawn), 0), 2) INTO drawn
    FROM ic_loans_list(NULL) d WHERE d.id = p_loan;
  IF l.facility IS NOT NULL AND l.facility > 0
     AND coalesce(drawn,0) + p_amount > l.facility THEN
    RAISE EXCEPTION 'That would draw % against a facility of % with % already drawn. Increase the facility first, or the agreement will not describe what happened.',
      round(coalesce(drawn,0) + p_amount, 2), round(l.facility,2), round(coalesce(drawn,0),2);
  END IF;

  res := draw_ic_loan(p_loan, p_date, p_amount, current_app_user());
  PERFORM ea_audit(l.borrower_entity, 'ic_loan', p_loan, 'intercompany loan drawn',
                   round(p_amount,2) || ' ' || l.ccy || ' on ' || p_date);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION ic_loan_repay(p_loan bigint, p_date date, p_amount numeric)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE l ic_loan; res bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'The repayment must be a positive amount';
  END IF;
  SELECT * INTO l FROM ic_loan WHERE id = p_loan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intercompany loan % not found', p_loan; END IF;

  res := repay_ic_loan(p_loan, p_date, p_amount, current_app_user());
  PERFORM ea_audit(l.borrower_entity, 'ic_loan', p_loan, 'intercompany loan repaid',
                   round(p_amount,2) || ' ' || l.ccy || ' on ' || p_date);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION ic_loan_accrue(p_loan bigint, p_date date, p_days integer)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE l ic_loan; res bigint;
BEGIN
  SELECT * INTO l FROM ic_loan WHERE id = p_loan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intercompany loan % not found', p_loan; END IF;

  -- A group loan at nil interest is a transfer pricing exposure, and accruing
  -- nothing on it silently is how it stays invisible until an enquiry.
  IF l.interest_rate IS NULL OR l.interest_rate = 0 THEN
    RAISE EXCEPTION 'Loan % has no interest rate, so there is nothing to accrue. A group loan at nil interest is a transfer pricing exposure — record the arm''s length rate on the facility first.',
      p_loan;
  END IF;
  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION 'Give the number of days to accrue for';
  END IF;

  res := accrue_ic_loan_interest(p_loan, p_date, p_days, current_app_user());
  PERFORM ea_audit(l.borrower_entity, 'ic_loan', p_loan, 'intercompany interest accrued',
                   p_days || ' days at ' || l.interest_rate || '% to ' || p_date);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION ic_settle(
  p_creditor bigint, p_debtor bigint, p_date date, p_ccy char(3), p_amount numeric)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE res bigint;
BEGIN
  IF p_creditor = p_debtor THEN
    RAISE EXCEPTION 'An entity cannot settle with itself';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'The settlement must be a positive amount';
  END IF;

  res := settle_intercompany(p_creditor, p_debtor, p_date, p_ccy, p_amount,
                             current_app_user());
  PERFORM ea_audit(p_creditor, 'ic_settlement', res, 'intercompany settled',
                   round(p_amount,2) || ' ' || p_ccy || ' from entity ' || p_debtor ||
                   ' to entity ' || p_creditor);
  RETURN res;
END $$;

-- A transfer pricing charge. Refused where no policy records the markup,
-- because a charge with no documented basis is the first thing asked for on an
-- enquiry.
CREATE OR REPLACE FUNCTION tp_charge_post(
  p_from bigint, p_to bigint, p_date date, p_ccy char(3),
  p_cost_base numeric, p_service_type text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE pol tp_policy; res bigint;
BEGIN
  IF p_from = p_to THEN
    RAISE EXCEPTION 'An entity cannot charge itself';
  END IF;
  IF p_cost_base IS NULL OR p_cost_base <= 0 THEN
    RAISE EXCEPTION 'Give the cost base the markup applies to';
  END IF;

  SELECT * INTO pol FROM tp_policy
   WHERE from_entity = p_from AND to_entity = p_to AND service_type = p_service_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no transfer pricing policy for "%" from entity % to entity %. Record the policy and its markup first — a charge with no documented basis is the first thing asked for on a transfer pricing enquiry.',
      p_service_type, p_from, p_to;
  END IF;

  res := post_tp_charge(p_from, p_to, p_date, p_ccy, p_cost_base, p_service_type);
  PERFORM ea_audit(p_to, 'tp_policy', pol.id, 'transfer pricing charge posted',
                   p_service_type || ': cost base ' || round(p_cost_base,2) || ' ' || p_ccy ||
                   ' at ' || coalesce(pol.markup_pct,0) || '% markup');
  RETURN res;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('cm_fee_available','cm_fee_transfer','ic_loan_draw',
                         'ic_loan_repay','ic_loan_accrue','ic_settle','tp_charge_post')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

SELECT p.proname AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('cm_fee_available','cm_fee_transfer','ic_loan_draw',
                     'ic_loan_repay','ic_loan_accrue','ic_settle','tp_charge_post')
 ORDER BY p.proname;
