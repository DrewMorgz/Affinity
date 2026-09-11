-- 097 — a missing currency is not sterling
--
-- FOUND BY WIDENING THE 096 SWEEP beyond rates. The question is the same: what
-- else turns "not given" into a usable value that looks correct?
--
-- Six functions defaulted the currency parameter to 'GBP': adding a bank
-- account, an asset or a charge to an entity, creating an entity, drafting an
-- invoice, billing WIP.
--
-- Twelve of the twenty-two entities are not sterling. Malta and Cyprus are in
-- euro; Cayman, both US companies, Caledonian Ventures and Pacific Wealth Trust
-- are in dollars. So adding a bank account to the Malta company without naming
-- the currency recorded a euro balance as sterling, and it reads as a perfectly
-- ordinary number.
--
-- This is the same class as 095 and 096 and the reason to keep pulling at it: a
-- currency error does not look like an error. A wrong rate gives an implausible
-- figure someone eventually queries. A wrong currency gives a correct figure
-- against the wrong unit, and the only way to notice is to know what the entity
-- should be denominated in.
--
-- THE FIX IS TO INHERIT, NOT TO GUESS. The entity already carries a functional
-- currency. Omitting the parameter now takes the entity's own currency, and
-- refuses where the entity has none rather than falling back to anything.
--
-- These definitions are the existing ones with the default changed and the
-- resolution inserted — extracted from the database rather than rewritten,
-- because twice today I rewrote a function by hand and silently dropped half
-- its validation.

CREATE OR REPLACE FUNCTION public.ea_bank_add(p_entity bigint, p_bank text, p_account_name text DEFAULT NULL::text, p_number text DEFAULT NULL::text, p_ccy character DEFAULT NULL::bpchar, p_signatories text DEFAULT NULL::text, p_resolution_date date DEFAULT NULL::date)
 RETURNS entity_bank
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r entity_bank;
BEGIN

  -- ADDED IN 097. This parameter defaulted to 'GBP'. Twelve of the twenty-two
  -- entities are not GBP — Malta and Cyprus in euro, Cayman and both US
  -- companies in dollars — so omitting the currency silently recorded a euro
  -- balance as sterling. A currency error does not look like an error; it
  -- looks like a number.
  IF p_ccy IS NULL THEN
    SELECT functional_ccy INTO p_ccy FROM entity WHERE id = p_entity;
    IF p_ccy IS NULL THEN
      RAISE EXCEPTION 'No currency given and entity % has no functional currency set, so there is nothing to inherit. Give the currency explicitly.', p_entity;
    END IF;
  END IF;
  IF coalesce(trim(p_bank),'') = '' THEN RAISE EXCEPTION 'Bank name is required'; END IF;
  INSERT INTO entity_bank(entity_id, bank, account_name, number, ccy, signatories, resolution_date)
  VALUES (p_entity, trim(p_bank), p_account_name, p_number, upper(coalesce(p_ccy,'GBP')),
          p_signatories, p_resolution_date)
  RETURNING * INTO r;
  -- account numbers are deliberately not written to the audit detail
  PERFORM ea_audit(p_entity, 'entity_bank', r.id, 'added', trim(p_bank) || ' (' || r.ccy || ')');
  RETURN r;
END $function$;


CREATE OR REPLACE FUNCTION public.ea_asset_add(p_entity bigint, p_description text, p_acquired_date date DEFAULT NULL::date, p_value numeric DEFAULT NULL::numeric, p_ccy character DEFAULT NULL::bpchar, p_notes text DEFAULT NULL::text)
 RETURNS entity_asset
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r entity_asset;
BEGIN

  -- ADDED IN 097. This parameter defaulted to 'GBP'. Twelve of the twenty-two
  -- entities are not GBP — Malta and Cyprus in euro, Cayman and both US
  -- companies in dollars — so omitting the currency silently recorded a euro
  -- balance as sterling. A currency error does not look like an error; it
  -- looks like a number.
  IF p_ccy IS NULL THEN
    SELECT functional_ccy INTO p_ccy FROM entity WHERE id = p_entity;
    IF p_ccy IS NULL THEN
      RAISE EXCEPTION 'No currency given and entity % has no functional currency set, so there is nothing to inherit. Give the currency explicitly.', p_entity;
    END IF;
  END IF;
  IF coalesce(trim(p_description),'') = '' THEN RAISE EXCEPTION 'Asset description is required'; END IF;
  INSERT INTO entity_asset(entity_id, description, acquired_date, value, ccy, notes)
  VALUES (p_entity, trim(p_description), p_acquired_date, p_value, upper(coalesce(p_ccy,'GBP')), p_notes)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_asset', r.id, 'added', trim(p_description));
  RETURN r;
END $function$;


CREATE OR REPLACE FUNCTION public.ea_charge_add(p_entity bigint, p_chargee text, p_charge_type text DEFAULT NULL::text, p_amount numeric DEFAULT NULL::numeric, p_ccy character DEFAULT NULL::bpchar, p_registered_date date DEFAULT NULL::date)
 RETURNS entity_charge
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r entity_charge;
BEGIN

  -- ADDED IN 097. This parameter defaulted to 'GBP'. Twelve of the twenty-two
  -- entities are not GBP — Malta and Cyprus in euro, Cayman and both US
  -- companies in dollars — so omitting the currency silently recorded a euro
  -- balance as sterling. A currency error does not look like an error; it
  -- looks like a number.
  IF p_ccy IS NULL THEN
    SELECT functional_ccy INTO p_ccy FROM entity WHERE id = p_entity;
    IF p_ccy IS NULL THEN
      RAISE EXCEPTION 'No currency given and entity % has no functional currency set, so there is nothing to inherit. Give the currency explicitly.', p_entity;
    END IF;
  END IF;
  IF coalesce(trim(p_chargee),'') = '' THEN RAISE EXCEPTION 'Chargee is required'; END IF;
  INSERT INTO entity_charge(entity_id, chargee, charge_type, amount, ccy, registered_date)
  VALUES (p_entity, trim(p_chargee), p_charge_type, p_amount, upper(coalesce(p_ccy,'GBP')), p_registered_date)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_charge', r.id, 'added', trim(p_chargee));
  RETURN r;
END $function$;


CREATE OR REPLACE FUNCTION public.inv_draft_create(p_entity bigint, p_invoice_date date, p_ccy character DEFAULT NULL::bpchar, p_bank_account_id bigint DEFAULT NULL::bigint)
 RETURNS invoice
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r invoice;
BEGIN

  -- ADDED IN 097. This parameter defaulted to 'GBP'. Twelve of the twenty-two
  -- entities are not GBP — Malta and Cyprus in euro, Cayman and both US
  -- companies in dollars — so omitting the currency silently recorded a euro
  -- balance as sterling. A currency error does not look like an error; it
  -- looks like a number.
  IF p_ccy IS NULL THEN
    SELECT functional_ccy INTO p_ccy FROM entity WHERE id = p_entity;
    IF p_ccy IS NULL THEN
      RAISE EXCEPTION 'No currency given and entity % has no functional currency set, so there is nothing to inherit. Give the currency explicitly.', p_entity;
    END IF;
  END IF;
  IF p_invoice_date IS NULL THEN RAISE EXCEPTION 'Invoice date is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM entity WHERE id = p_entity) THEN
    RAISE EXCEPTION 'Unknown entity';
  END IF;

  INSERT INTO invoice(entity_id, invoice_date, ccy, bank_account_id,
                      net_total, vat_total, gross_total, status)
  VALUES (p_entity, p_invoice_date, upper(coalesce(p_ccy,'GBP')), p_bank_account_id,
          0, 0, 0, 'draft')
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'invoice', r.id, 'invoice drafted', r.ccy || ' ' || p_invoice_date);
  RETURN r;
END $function$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('ea_bank_add','ea_asset_add','ea_charge_add',
                                'inv_draft_create')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
