-- 096 — two more places a missing rate was silently read as zero
--
-- 095 fixed the consolidation CTA. This is the rest of the class, found by
-- sweeping every COALESCE(<something rate-like>, 0) in the schema. Nineteen
-- occurrences; most are defensible — a missing VAT rate meaning zero-rated, a
-- disbursement recharged at cost with no markup. Two are not.
--
-- 1. BILLABLE TIME WITH NO RATE IS WORTH NOTHING.
--
--    ts_entry_add computes value as round(COALESCE(p_rate,0) * p_hours, 2). A
--    billable entry recorded without a rate therefore has a value of zero. It
--    appears in the timesheet, it looks recorded, and it is worth nothing: WIP
--    does not show it, a billing run does not pick it up, and the write-off
--    report has nothing to write off.
--
--    The function already refuses six things — zero hours, more than 24 hours,
--    a missing date, a future date, no entity, and billable time with no
--    narrative. It did not check the one number that decides whether the work
--    gets paid for.
--
--    Non-billable time with no rate is correct and stays allowed.
--
-- 2. A REDUCING-BALANCE ASSET WITH NO RATE NEVER DEPRECIATES.
--
--    post_depreciation computes round(nbv * COALESCE(rb_rate,0)/100 * months/12).
--    With no rate the charge is zero, every period, silently. The asset sits at
--    cost for ever and profit is overstated by the depreciation never taken.
--    The function refused only if the asset did not exist.
--
-- Both are the same shape as the CTA: not a refusal, not a blank, a number of
-- the right form and the wrong value. Zero is a plausible answer, which is what
-- makes it dangerous — nobody queries a charge of nil, they assume the asset is
-- fully written down.

-- ── Billable time needs a rate ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ts_entry_add(p_staff_id bigint, p_entry_date date,
                                        p_entity_label text, p_matter text,
                                        p_entry_type text, p_hours numeric,
                                        p_billable boolean DEFAULT true,
                                        p_rate numeric DEFAULT NULL::numeric,
                                        p_narrative text DEFAULT NULL::text)
RETURNS timesheet_entry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r timesheet_entry;
BEGIN
  IF p_hours IS NULL OR p_hours <= 0 THEN
    RAISE EXCEPTION 'Time recorded must be greater than zero';
  END IF;
  IF p_hours > 24 THEN
    RAISE EXCEPTION 'Cannot record more than 24 hours in a single entry';
  END IF;
  IF p_entry_date IS NULL THEN
    RAISE EXCEPTION 'Date is required';
  END IF;
  IF p_entry_date > current_date THEN
    RAISE EXCEPTION 'Time cannot be recorded against a future date';
  END IF;
  IF coalesce(trim(p_entity_label), '') = '' THEN
    RAISE EXCEPTION 'Time must be recorded against an entity';
  END IF;
  IF p_billable AND coalesce(trim(p_narrative), '') = '' THEN
    RAISE EXCEPTION
      'Billable time needs a narrative — it will appear on the client invoice';
  END IF;

  -- ── The check it did not have ──────────────────────────────────────────
  IF p_billable AND (p_rate IS NULL OR p_rate <= 0) THEN
    RAISE EXCEPTION
      'Billable time needs a charge-out rate. Without one this entry is worth '
      'nothing: it appears on the timesheet, WIP does not show it, a billing run '
      'does not pick it up, and there is nothing to write off. If the work '
      'genuinely is not chargeable, record it as non-billable instead — that is '
      'a different thing and the reports treat it differently.';
  END IF;

  INSERT INTO timesheet_entry (staff_id, entry_date, entity_label, matter,
                               entry_type, units, hours, billable, rate, value,
                               status, narrative)
  VALUES (p_staff_id, p_entry_date, trim(p_entity_label), p_matter, p_entry_type,
          round(p_hours * 10), p_hours, p_billable, p_rate,
          round(coalesce(p_rate, 0) * p_hours, 2), 'Draft', p_narrative)
  RETURNING * INTO r;

  IF p_hours > 12 THEN
    RAISE NOTICE 'That is % hours recorded on % — check the entry',
                 p_hours, p_entry_date;
  END IF;
  RETURN r;
END;
$$;

-- ── A reducing-balance asset needs a rate ──────────────────────────────────
CREATE OR REPLACE FUNCTION post_depreciation(p_asset bigint, p_date date,
                                             p_months integer,
                                             p_created_by text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fa            fixed_asset%ROWTYPE;
  v_depreciable numeric;
  v_nbv         numeric;
  v_charge      numeric;
  v_jid         bigint;
BEGIN
  SELECT * INTO fa FROM fixed_asset WHERE id = p_asset;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset % not found', p_asset;
  END IF;

  v_depreciable := fa.cost - fa.residual_value;

  IF fa.method = 'reducing_balance' THEN
    -- ── The check it did not have ────────────────────────────────────────
    IF fa.rb_rate IS NULL OR fa.rb_rate <= 0 THEN
      RAISE EXCEPTION
        'The reducing balance rate for % is not set, so the depreciation charge '
        'would be nil — every period, silently, leaving the asset at cost for '
        'ever and overstating profit by the depreciation never taken. Nobody '
        'queries a charge of nil; they assume the asset is written down. Set the '
        'rate on the asset and post again.',
        coalesce(fa.description, 'asset ' || p_asset);
    END IF;
    v_nbv    := fa.cost - fa.accumulated_dep;
    v_charge := round(v_nbv * fa.rb_rate / 100.0 * (p_months / 12.0), 2);
  ELSE
    IF fa.useful_life_months IS NULL OR fa.useful_life_months <= 0 THEN
      RAISE EXCEPTION
        'The useful life for % is not set, so a straight line charge cannot be '
        'computed.', coalesce(fa.description, 'asset ' || p_asset);
    END IF;
    v_charge := round(v_depreciable / fa.useful_life_months * p_months, 2);
  END IF;

  IF v_charge <= 0 THEN
    RAISE EXCEPTION
      'The computed charge for % is %, which is not a depreciation entry worth '
      'posting. Check the cost, the residual value and the accumulated '
      'depreciation.', coalesce(fa.description, 'asset ' || p_asset), v_charge;
  END IF;

  v_jid := post_journal(fa.entity_id, p_date, 'depreciation',
             'Depreciation — ' || coalesce(fa.description, 'asset ' || p_asset),
             p_created_by,
             jsonb_build_array(
               jsonb_build_object('account_id', fa.expense_account_id,
                                  'txn_amount', v_charge, 'func_amount', v_charge),
               jsonb_build_object('account_id', fa.accum_dep_account_id,
                                  'txn_amount', -v_charge, 'func_amount', -v_charge)
             ), 'manual');

  UPDATE fixed_asset
     SET accumulated_dep = coalesce(accumulated_dep, 0) + v_charge
   WHERE id = p_asset;

  RETURN v_jid;
END;
$$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('ts_entry_add', 'post_depreciation')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
