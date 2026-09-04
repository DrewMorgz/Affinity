-- =====================================================================
-- AFFINITY CORE — WRITE LAYER, BATCH 1: ENTITY ADMIN REGISTERS
--
-- The tables and read functions already existed; what was missing was any way
-- to write to them. This adds add / update / delete for the thirteen registers
-- behind Entity Admin, which is the core record.
--
-- Every function:
--   * is SECURITY DEFINER and granted to `authenticated` only, never `anon`
--   * records who and when in audit_event, so a change can always be traced
--   * validates what would otherwise corrupt a register quietly, rather than
--     accepting it and leaving someone to find it later
--
-- Run AFTER 057. Safe to re-run.
-- =====================================================================

-- ── Audit helper ─────────────────────────────────────────────────────
-- One place, so no function can forget to write an audit trail.
-- audit_event already exists from db_ops/001 with its own column names:
-- t, staff_user, action, mod, target, details, severity. Writing to the real
-- shape rather than inventing one.
CREATE OR REPLACE FUNCTION ea_audit(
  p_entity bigint, p_table text, p_row bigint, p_action text, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE code text;
BEGIN
  SELECT company_code INTO code FROM entity WHERE id = p_entity;
  INSERT INTO audit_event(t, staff_user, action, mod, target, details, severity)
  VALUES (now(), current_app_user(), p_action, 'Entity Admin',
          coalesce(code, 'entity #' || p_entity) || ' · ' || p_table
            || coalesce(' #' || p_row, ''),
          p_detail, 'info');
EXCEPTION WHEN undefined_table OR undefined_column THEN
  -- Never block a register entry because the trail could not be written, but
  -- do not fail silently either.
  RAISE NOTICE 'audit_event not writable — % on % not logged', p_action, p_table;
END $$;

-- ── Officers ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_officer_add(
  p_entity bigint, p_name text, p_role text, p_appointed date DEFAULT NULL,
  p_nationality text DEFAULT NULL, p_dob date DEFAULT NULL, p_address text DEFAULT NULL)
RETURNS entity_officer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_officer;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN RAISE EXCEPTION 'Officer name is required'; END IF;
  IF p_dob IS NOT NULL AND p_dob > current_date THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future';
  END IF;
  IF p_appointed IS NOT NULL AND p_dob IS NOT NULL AND p_appointed < p_dob THEN
    RAISE EXCEPTION 'Appointment cannot precede date of birth';
  END IF;

  INSERT INTO entity_officer(entity_id, name, role, appointed, nationality, dob, address)
  VALUES (p_entity, trim(p_name), p_role, p_appointed, p_nationality, p_dob, p_address)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_officer', r.id, 'added', p_role || ': ' || trim(p_name));
  RETURN r;
END $$;

-- Resigning an officer, rather than deleting them. A register must keep its
-- history: who held office and when is the point of it.
CREATE OR REPLACE FUNCTION ea_officer_resign(p_id bigint, p_resigned date)
RETURNS entity_officer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_officer;
BEGIN
  SELECT * INTO r FROM entity_officer WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Officer % not found', p_id; END IF;
  IF r.appointed IS NOT NULL AND p_resigned < r.appointed THEN
    RAISE EXCEPTION 'Resignation cannot precede appointment';
  END IF;

  UPDATE entity_officer SET resigned = p_resigned WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'entity_officer', p_id, 'resigned', r.name || ' on ' || p_resigned);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_officer_update(
  p_id bigint, p_name text, p_role text, p_appointed date,
  p_nationality text, p_dob date, p_address text)
RETURNS entity_officer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_officer;
BEGIN
  UPDATE entity_officer SET name = coalesce(trim(p_name), name), role = coalesce(p_role, role),
         appointed = p_appointed, nationality = p_nationality, dob = p_dob, address = p_address
   WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Officer % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'entity_officer', p_id, 'amended', r.name);
  RETURN r;
END $$;

-- ── Shareholders ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_shareholder_add(
  p_entity bigint, p_name text, p_share_class text DEFAULT 'Ordinary',
  p_shares numeric DEFAULT NULL, p_pct numeric DEFAULT NULL, p_held_from date DEFAULT NULL)
RETURNS entity_shareholder LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_shareholder; total numeric;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN RAISE EXCEPTION 'Shareholder name is required'; END IF;
  IF p_pct IS NOT NULL AND (p_pct < 0 OR p_pct > 100) THEN
    RAISE EXCEPTION 'Holding must be between 0 and 100 per cent';
  END IF;

  INSERT INTO entity_shareholder(entity_id, name, share_class, shares, pct, held_from)
  VALUES (p_entity, trim(p_name), coalesce(p_share_class,'Ordinary'), p_shares, p_pct, p_held_from)
  RETURNING * INTO r;

  -- A share register that adds to more than 100% is wrong. Warn rather than
  -- refuse: part-paid and multiple classes make a hard block unsafe.
  SELECT sum(pct) INTO total FROM entity_shareholder WHERE entity_id = p_entity;
  IF total > 100.01 THEN
    RAISE NOTICE 'Shareholdings for this entity now total %%% — check the register', round(total,2);
  END IF;

  PERFORM ea_audit(p_entity, 'entity_shareholder', r.id, 'added',
                   trim(p_name) || ' ' || coalesce(p_pct::text,'?') || '%');
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_shareholder_remove(p_id bigint, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_shareholder;
BEGIN
  SELECT * INTO r FROM entity_shareholder WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shareholder % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'entity_shareholder', p_id, 'removed',
                   r.name || coalesce(' — ' || p_reason, ''));
  DELETE FROM entity_shareholder WHERE id = p_id;
END $$;

-- ── Beneficial owners ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_ubo_add(
  p_entity bigint, p_name text, p_role text DEFAULT NULL, p_dob date DEFAULT NULL,
  p_nationality text DEFAULT NULL, p_ownership_pct numeric DEFAULT NULL,
  p_nature_of_control text DEFAULT NULL)
RETURNS entity_ubo LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_ubo;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN RAISE EXCEPTION 'Beneficial owner name is required'; END IF;
  IF p_ownership_pct IS NOT NULL AND (p_ownership_pct < 0 OR p_ownership_pct > 100) THEN
    RAISE EXCEPTION 'Ownership must be between 0 and 100 per cent';
  END IF;
  -- A UBO record with neither a holding nor a stated nature of control does not
  -- evidence anything, which is the whole purpose of the register.
  IF p_ownership_pct IS NULL AND coalesce(trim(p_nature_of_control),'') = '' THEN
    RAISE EXCEPTION 'Give either an ownership percentage or the nature of control';
  END IF;

  INSERT INTO entity_ubo(entity_id, name, role, dob, nationality, ownership_pct, nature_of_control)
  VALUES (p_entity, trim(p_name), p_role, p_dob, p_nationality, p_ownership_pct, p_nature_of_control)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_ubo', r.id, 'added',
                   trim(p_name) || ' ' || coalesce(p_ownership_pct::text || '%', p_nature_of_control));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_ubo_update(
  p_id bigint, p_name text, p_role text, p_dob date, p_nationality text,
  p_ownership_pct numeric, p_nature_of_control text)
RETURNS entity_ubo LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_ubo;
BEGIN
  UPDATE entity_ubo SET name = coalesce(trim(p_name), name), role = p_role, dob = p_dob,
         nationality = p_nationality, ownership_pct = p_ownership_pct,
         nature_of_control = p_nature_of_control
   WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Beneficial owner % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'entity_ubo', p_id, 'amended', r.name);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_ubo_remove(p_id bigint, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_ubo;
BEGIN
  SELECT * INTO r FROM entity_ubo WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Beneficial owner % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'entity_ubo', p_id, 'removed', r.name || coalesce(' — ' || p_reason, ''));
  DELETE FROM entity_ubo WHERE id = p_id;
END $$;

-- ── Bank accounts and signatories ────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_bank_add(
  p_entity bigint, p_bank text, p_account_name text DEFAULT NULL, p_number text DEFAULT NULL,
  p_ccy char(3) DEFAULT 'GBP', p_signatories text DEFAULT NULL, p_resolution_date date DEFAULT NULL)
RETURNS entity_bank LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_bank;
BEGIN
  IF coalesce(trim(p_bank),'') = '' THEN RAISE EXCEPTION 'Bank name is required'; END IF;
  INSERT INTO entity_bank(entity_id, bank, account_name, number, ccy, signatories, resolution_date)
  VALUES (p_entity, trim(p_bank), p_account_name, p_number, upper(coalesce(p_ccy,'GBP')),
          p_signatories, p_resolution_date)
  RETURNING * INTO r;
  -- account numbers are deliberately not written to the audit detail
  PERFORM ea_audit(p_entity, 'entity_bank', r.id, 'added', trim(p_bank) || ' (' || r.ccy || ')');
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_bank_close(p_id bigint, p_closed_date date)
RETURNS entity_bank LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_bank;
BEGIN
  UPDATE entity_bank SET closed_date = p_closed_date WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank account % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'entity_bank', p_id, 'closed', r.bank || ' on ' || p_closed_date);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_signatory_add(
  p_entity bigint, p_bank_id bigint, p_name text, p_category text DEFAULT NULL,
  p_class text DEFAULT NULL, p_from_date date DEFAULT NULL)
RETURNS entity_signatory LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_signatory;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN RAISE EXCEPTION 'Signatory name is required'; END IF;
  INSERT INTO entity_signatory(entity_id, bank_id, name, category, class, from_date)
  VALUES (p_entity, p_bank_id, trim(p_name), p_category, p_class, p_from_date)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_signatory', r.id, 'added', trim(p_name));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_signatory_remove(p_id bigint, p_to_date date)
RETURNS entity_signatory LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_signatory;
BEGIN
  UPDATE entity_signatory SET to_date = p_to_date WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Signatory % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'entity_signatory', p_id, 'removed', r.name || ' from ' || p_to_date);
  RETURN r;
END $$;

-- ── Charges ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_charge_add(
  p_entity bigint, p_chargee text, p_charge_type text DEFAULT NULL, p_amount numeric DEFAULT NULL,
  p_ccy char(3) DEFAULT 'GBP', p_registered_date date DEFAULT NULL)
RETURNS entity_charge LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_charge;
BEGIN
  IF coalesce(trim(p_chargee),'') = '' THEN RAISE EXCEPTION 'Chargee is required'; END IF;
  INSERT INTO entity_charge(entity_id, chargee, charge_type, amount, ccy, registered_date)
  VALUES (p_entity, trim(p_chargee), p_charge_type, p_amount, upper(coalesce(p_ccy,'GBP')), p_registered_date)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_charge', r.id, 'added', trim(p_chargee));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_charge_satisfy(p_id bigint, p_satisfied_date date)
RETURNS entity_charge LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_charge;
BEGIN
  SELECT * INTO r FROM entity_charge WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Charge % not found', p_id; END IF;
  IF r.registered_date IS NOT NULL AND p_satisfied_date < r.registered_date THEN
    RAISE EXCEPTION 'Satisfaction cannot precede registration';
  END IF;
  UPDATE entity_charge SET satisfied_date = p_satisfied_date WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'entity_charge', p_id, 'satisfied', r.chargee || ' on ' || p_satisfied_date);
  RETURN r;
END $$;

-- ── Assets ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_asset_add(
  p_entity bigint, p_description text, p_acquired_date date DEFAULT NULL,
  p_value numeric DEFAULT NULL, p_ccy char(3) DEFAULT 'GBP', p_notes text DEFAULT NULL)
RETURNS entity_asset LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_asset;
BEGIN
  IF coalesce(trim(p_description),'') = '' THEN RAISE EXCEPTION 'Asset description is required'; END IF;
  INSERT INTO entity_asset(entity_id, description, acquired_date, value, ccy, notes)
  VALUES (p_entity, trim(p_description), p_acquired_date, p_value, upper(coalesce(p_ccy,'GBP')), p_notes)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_asset', r.id, 'added', trim(p_description));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_asset_revalue(
  p_id bigint, p_value numeric, p_valuation_date date DEFAULT NULL)
RETURNS entity_asset LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_asset; was numeric;
BEGIN
  SELECT value INTO was FROM entity_asset WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_id; END IF;
  UPDATE entity_asset SET value = p_value,
         last_valuation_date = coalesce(p_valuation_date, current_date)
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'entity_asset', p_id, 'revalued',
                   r.description || ': ' || coalesce(was::text,'?') || ' to ' || p_value);
  RETURN r;
END $$;

-- ── Dividends ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_dividend_add(
  p_entity bigint, p_share_class text, p_name text DEFAULT NULL,
  p_requested_date date DEFAULT NULL, p_per_share numeric DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS entity_dividend LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_dividend;
BEGIN
  INSERT INTO entity_dividend(entity_id, share_class, name, requested_date, per_share, notes)
  VALUES (p_entity, coalesce(p_share_class,'Ordinary'), p_name, p_requested_date, p_per_share, p_notes)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_dividend', r.id, 'declared',
                   coalesce(p_share_class,'Ordinary') || ' ' || coalesce(p_per_share::text,''));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_dividend_pay(p_id bigint, p_paid_date date)
RETURNS entity_dividend LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_dividend;
BEGIN
  SELECT * INTO r FROM entity_dividend WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dividend % not found', p_id; END IF;
  IF r.requested_date IS NOT NULL AND p_paid_date < r.requested_date THEN
    RAISE EXCEPTION 'Payment cannot precede the declaration';
  END IF;
  UPDATE entity_dividend SET paid_date = p_paid_date WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'entity_dividend', p_id, 'paid', 'on ' || p_paid_date);
  RETURN r;
END $$;

-- ── Meetings ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_meeting_add(
  p_entity bigint, p_meeting_type text, p_meeting_date date, p_notes text DEFAULT NULL)
RETURNS entity_meeting LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_meeting;
BEGIN
  IF p_meeting_date IS NULL THEN RAISE EXCEPTION 'Meeting date is required'; END IF;
  INSERT INTO entity_meeting(entity_id, meeting_type, meeting_date, notes)
  VALUES (p_entity, coalesce(p_meeting_type,'Board meeting'), p_meeting_date, p_notes)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_meeting', r.id, 'recorded',
                   r.meeting_type || ' on ' || p_meeting_date);
  RETURN r;
END $$;

-- ── Addresses ────────────────────────────────────────────────────────
-- Changing a registered office is a filing event, so the previous address is
-- end-dated rather than overwritten.
CREATE OR REPLACE FUNCTION ea_address_add(
  p_entity bigint, p_address_type text, p_address text, p_from_date date DEFAULT NULL)
RETURNS entity_address LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_address; eff date;
BEGIN
  IF coalesce(trim(p_address),'') = '' THEN RAISE EXCEPTION 'Address is required'; END IF;
  eff := coalesce(p_from_date, current_date);

  UPDATE entity_address SET to_date = eff - 1
   WHERE entity_id = p_entity AND address_type = p_address_type AND to_date IS NULL;

  INSERT INTO entity_address(entity_id, address_type, address, from_date)
  VALUES (p_entity, p_address_type, trim(p_address), eff)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_address', r.id, 'changed', p_address_type);
  RETURN r;
END $$;

-- ── File notes ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_file_note_add(
  p_entity bigint, p_note text, p_note_date date DEFAULT NULL)
RETURNS entity_file_note LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_file_note;
BEGIN
  IF coalesce(trim(p_note),'') = '' THEN RAISE EXCEPTION 'A note cannot be empty'; END IF;
  INSERT INTO entity_file_note(entity_id, note_date, author, note)
  VALUES (p_entity, coalesce(p_note_date, current_date), current_app_user(), trim(p_note))
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_file_note', r.id, 'added', left(trim(p_note), 60));
  RETURN r;
END $$;

-- ── Safe custody ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_safe_item_add(
  p_entity bigint, p_item text, p_deposited_date date DEFAULT NULL, p_authorised_by text DEFAULT NULL)
RETURNS entity_safe_item LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_safe_item;
BEGIN
  IF coalesce(trim(p_item),'') = '' THEN RAISE EXCEPTION 'Item description is required'; END IF;
  INSERT INTO entity_safe_item(entity_id, item, deposited_date, authorised_by)
  VALUES (p_entity, trim(p_item), coalesce(p_deposited_date, current_date),
          coalesce(p_authorised_by, current_app_user()))
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_safe_item', r.id, 'deposited', trim(p_item));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION ea_safe_item_retrieve(
  p_id bigint, p_retrieved_date date, p_authorised_by text DEFAULT NULL)
RETURNS entity_safe_item LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_safe_item;
BEGIN
  SELECT * INTO r FROM entity_safe_item WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Safe custody item % not found', p_id; END IF;
  IF r.retrieved_date IS NOT NULL THEN
    RAISE EXCEPTION 'That item was already retrieved on %', r.retrieved_date;
  END IF;
  UPDATE entity_safe_item SET retrieved_date = p_retrieved_date,
         authorised_by = coalesce(p_authorised_by, current_app_user())
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'entity_safe_item', p_id, 'retrieved', r.item);
  RETURN r;
END $$;

-- ── Services ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_service_set(p_entity bigint, p_service text, p_active boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_active THEN
    INSERT INTO entity_service(entity_id, service)
    SELECT p_entity, p_service
    WHERE NOT EXISTS (SELECT 1 FROM entity_service
                       WHERE entity_id = p_entity AND service = p_service);
    PERFORM ea_audit(p_entity, 'entity_service', NULL, 'service added', p_service);
  ELSE
    DELETE FROM entity_service WHERE entity_id = p_entity AND service = p_service;
    PERFORM ea_audit(p_entity, 'entity_service', NULL, 'service removed', p_service);
  END IF;
END $$;

-- ── Grants: authenticated only, never anon ───────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'ea_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS write_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname ~ '^ea_(officer|shareholder|ubo|bank|signatory|charge|asset|dividend|meeting|address|file_note|safe_item|service)'
 ORDER BY p.proname;
