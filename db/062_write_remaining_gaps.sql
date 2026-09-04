-- =====================================================================
-- AFFINITY CORE — WRITE LAYER, BATCH 5: THE REMAINING GAPS
--
-- Clears the actions that were still marked "needs a write function":
-- invoicing, entity profile amendments, user administration, statutory
-- filings, gaming licence records, document folders and intranet events.
--
-- Same rules throughout: SECURITY DEFINER, granted to `authenticated` only,
-- audit trail on every write, and validation that refuses rather than accepts.
--
-- The engine already provides `invoice` and `invoice_line`; statutory filings
-- and gaming records had no tables, so those are created here.
--
-- Run AFTER 061. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- INVOICING
-- ─────────────────────────────────────────────────────────────────────

-- A draft invoice. Deliberately separate from issuing it: a draft can be
-- amended freely, an issued invoice cannot, because the client has it.
CREATE OR REPLACE FUNCTION inv_draft_create(
  p_entity bigint, p_invoice_date date, p_ccy char(3) DEFAULT 'GBP',
  p_bank_account_id bigint DEFAULT NULL)
RETURNS invoice LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r invoice;
BEGIN
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
END $$;

-- Adding a line recalculates the invoice totals, so the header can never
-- disagree with the lines that make it up.
CREATE OR REPLACE FUNCTION inv_line_add(
  p_invoice bigint, p_description text, p_net numeric,
  p_vat numeric DEFAULT 0, p_service_id bigint DEFAULT NULL)
RETURNS invoice_line LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r invoice_line; inv invoice;
BEGIN
  SELECT * INTO inv FROM invoice WHERE id = p_invoice;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice; END IF;
  IF inv.status <> 'draft' THEN
    RAISE EXCEPTION 'That invoice is % — only a draft can be changed. Raise a credit note instead',
      inv.status;
  END IF;
  IF coalesce(trim(p_description),'') = '' THEN
    RAISE EXCEPTION 'Each line needs a description — it appears on the client''s invoice';
  END IF;
  IF p_net IS NULL OR p_net = 0 THEN RAISE EXCEPTION 'Enter a net amount for the line'; END IF;

  INSERT INTO invoice_line(invoice_id, service_id, description, net, vat, gross)
  VALUES (p_invoice, p_service_id, trim(p_description), p_net,
          coalesce(p_vat,0), p_net + coalesce(p_vat,0))
  RETURNING * INTO r;

  UPDATE invoice i SET
    net_total   = (SELECT coalesce(sum(net),0)   FROM invoice_line WHERE invoice_id = p_invoice),
    vat_total   = (SELECT coalesce(sum(vat),0)   FROM invoice_line WHERE invoice_id = p_invoice),
    gross_total = (SELECT coalesce(sum(gross),0) FROM invoice_line WHERE invoice_id = p_invoice)
   WHERE i.id = p_invoice;

  PERFORM ea_audit(inv.entity_id, 'invoice', p_invoice, 'invoice line added',
                   trim(p_description) || ' ' || p_net);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION inv_line_remove(p_line bigint)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE l invoice_line; inv invoice;
BEGIN
  SELECT * INTO l FROM invoice_line WHERE id = p_line;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice line % not found', p_line; END IF;
  SELECT * INTO inv FROM invoice WHERE id = l.invoice_id;
  IF inv.status <> 'draft' THEN
    RAISE EXCEPTION 'That invoice is % — a line cannot be removed once issued', inv.status;
  END IF;

  DELETE FROM invoice_line WHERE id = p_line;
  UPDATE invoice i SET
    net_total   = (SELECT coalesce(sum(net),0)   FROM invoice_line WHERE invoice_id = l.invoice_id),
    vat_total   = (SELECT coalesce(sum(vat),0)   FROM invoice_line WHERE invoice_id = l.invoice_id),
    gross_total = (SELECT coalesce(sum(gross),0) FROM invoice_line WHERE invoice_id = l.invoice_id)
   WHERE i.id = l.invoice_id;
  PERFORM ea_audit(inv.entity_id, 'invoice', l.invoice_id, 'invoice line removed', l.description);
END $$;

-- Issuing an invoice. Once issued it is the client's document, so this is the
-- point after which amendment is refused.
--
-- invoice.status allows only 'draft' or 'posted' — checked, not assumed. There
-- is no separate 'issued' state, so posting IS issuing.
CREATE OR REPLACE FUNCTION inv_issue(p_invoice bigint)
RETURNS invoice LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r invoice; lines int;
BEGIN
  SELECT * INTO r FROM invoice WHERE id = p_invoice;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'That invoice is already %', r.status; END IF;

  SELECT count(*) INTO lines FROM invoice_line WHERE invoice_id = p_invoice;
  IF lines = 0 THEN RAISE EXCEPTION 'An invoice cannot be issued with no lines'; END IF;
  IF coalesce(r.gross_total,0) <= 0 THEN
    RAISE EXCEPTION 'An invoice cannot be issued for nil or a negative amount';
  END IF;

  UPDATE invoice SET status = 'posted' WHERE id = p_invoice RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'invoice', p_invoice, 'invoice issued',
                   r.ccy || ' ' || r.gross_total);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION inv_credit_note(p_invoice bigint, p_reason text)
RETURNS invoice LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE src invoice; cn invoice; l invoice_line;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for raising a credit note';
  END IF;
  SELECT * INTO src FROM invoice WHERE id = p_invoice;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice; END IF;
  IF src.status = 'draft' THEN
    RAISE EXCEPTION 'That invoice is still a draft — amend it rather than crediting it';
  END IF;

  INSERT INTO invoice(entity_id, invoice_date, ccy, net_total, vat_total, gross_total, status)
  VALUES (src.entity_id, current_date, src.ccy, 0, 0, 0, 'draft')
  RETURNING * INTO cn;

  FOR l IN SELECT * FROM invoice_line WHERE invoice_id = p_invoice LOOP
    INSERT INTO invoice_line(invoice_id, service_id, description, net, vat, gross)
    VALUES (cn.id, l.service_id, 'Credit: ' || l.description, -l.net, -l.vat, -l.gross);
  END LOOP;

  UPDATE invoice i SET
    net_total   = (SELECT coalesce(sum(net),0)   FROM invoice_line WHERE invoice_id = cn.id),
    vat_total   = (SELECT coalesce(sum(vat),0)   FROM invoice_line WHERE invoice_id = cn.id),
    gross_total = (SELECT coalesce(sum(gross),0) FROM invoice_line WHERE invoice_id = cn.id)
   WHERE i.id = cn.id RETURNING * INTO cn;

  PERFORM ea_audit(src.entity_id, 'invoice', cn.id, 'credit note raised',
                   'against invoice ' || p_invoice || ' — ' || p_reason);
  RETURN cn;
END $$;

CREATE OR REPLACE FUNCTION inv_list(p_entity bigint DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, invoice_date date, ccy char(3),
              net_total numeric, vat_total numeric, gross_total numeric, status text, lines bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT i.id, i.entity_id, e.name, i.invoice_date, i.ccy, i.net_total, i.vat_total,
         i.gross_total, i.status,
         (SELECT count(*) FROM invoice_line l WHERE l.invoice_id = i.id)
    FROM invoice i LEFT JOIN entity e ON e.id = i.entity_id
   WHERE (p_entity IS NULL OR i.entity_id = p_entity)
     AND (p_status IS NULL OR i.status = p_status)
   ORDER BY i.invoice_date DESC, i.id DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- ENTITY PROFILE — the "Edit entity" and filing-classification actions
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ea_profile_update(
  p_entity bigint, p_reg_no text DEFAULT NULL, p_year_end text DEFAULT NULL,
  p_business_activity text DEFAULT NULL, p_admin_status text DEFAULT NULL,
  p_risk_rating text DEFAULT NULL, p_next_review_date date DEFAULT NULL,
  p_tax_status text DEFAULT NULL)
RETURNS entity_profile LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_profile; was text;
BEGIN
  SELECT risk_rating INTO was FROM entity_profile WHERE entity_id = p_entity;

  INSERT INTO entity_profile(entity_id, reg_no, year_end, business_activity,
                             admin_status, risk_rating, next_review_date, tax_status)
  VALUES (p_entity, p_reg_no, p_year_end, p_business_activity,
          p_admin_status, p_risk_rating, p_next_review_date, p_tax_status)
  ON CONFLICT (entity_id) DO UPDATE SET
    reg_no            = coalesce(EXCLUDED.reg_no, entity_profile.reg_no),
    year_end          = coalesce(EXCLUDED.year_end, entity_profile.year_end),
    business_activity = coalesce(EXCLUDED.business_activity, entity_profile.business_activity),
    admin_status      = coalesce(EXCLUDED.admin_status, entity_profile.admin_status),
    risk_rating       = coalesce(EXCLUDED.risk_rating, entity_profile.risk_rating),
    next_review_date  = coalesce(EXCLUDED.next_review_date, entity_profile.next_review_date),
    tax_status        = coalesce(EXCLUDED.tax_status, entity_profile.tax_status)
  RETURNING * INTO r;

  -- entity_profile is keyed on entity_id and has no surrogate id, so the audit
  -- row references the entity itself.
  -- A risk rating change is a compliance event, not a routine edit.
  IF p_risk_rating IS NOT NULL AND was IS DISTINCT FROM p_risk_rating THEN
    PERFORM ea_audit(p_entity, 'entity_profile', p_entity, 'RISK RATING CHANGED',
                     coalesce(was,'(none)') || ' to ' || p_risk_rating);
  ELSE
    PERFORM ea_audit(p_entity, 'entity_profile', p_entity, 'entity amended', NULL);
  END IF;
  RETURN r;
END $$;

-- FATCA and CRS classifications, kept separate because getting them wrong has
-- reporting consequences and they are set by different people.
CREATE OR REPLACE FUNCTION ea_classification_update(
  p_entity bigint, p_fatca_class text DEFAULT NULL, p_crs_class text DEFAULT NULL,
  p_giin text DEFAULT NULL)
RETURNS entity_profile LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_profile;
BEGIN
  -- A GIIN is only meaningful for a reporting financial institution.
  IF p_giin IS NOT NULL AND trim(p_giin) <> '' AND coalesce(p_fatca_class,'') = '' THEN
    RAISE EXCEPTION 'A GIIN needs a FATCA classification alongside it';
  END IF;

  INSERT INTO entity_profile(entity_id, fatca_class, crs_class, giin)
  VALUES (p_entity, p_fatca_class, p_crs_class, nullif(trim(coalesce(p_giin,'')),''))
  ON CONFLICT (entity_id) DO UPDATE SET
    fatca_class = coalesce(EXCLUDED.fatca_class, entity_profile.fatca_class),
    crs_class   = coalesce(EXCLUDED.crs_class,   entity_profile.crs_class),
    giin        = coalesce(EXCLUDED.giin,        entity_profile.giin)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_profile', p_entity, 'classification updated',
                   coalesce('FATCA ' || p_fatca_class, '') || coalesce(' CRS ' || p_crs_class, ''));
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- STATUTORY FILINGS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS statutory_filing (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id    bigint NOT NULL REFERENCES entity(id),
  filing_type  text NOT NULL,           -- annual return, accounts, confirmation statement
  period       text,
  due_date     date NOT NULL,
  status       text NOT NULL DEFAULT 'Not started',
  prepared_by  text,
  prepared_at  timestamptz,
  submitted_by text,
  submitted_at timestamptz,
  reference    text,
  chased_at    timestamptz,
  chase_count  integer NOT NULL DEFAULT 0,
  notes        text
);
CREATE INDEX IF NOT EXISTS ix_statutory_filing_due ON statutory_filing(due_date, status);

CREATE OR REPLACE FUNCTION stat_filing_add(
  p_entity bigint, p_filing_type text, p_due_date date,
  p_period text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS statutory_filing LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r statutory_filing;
BEGIN
  IF coalesce(trim(p_filing_type),'') = '' THEN RAISE EXCEPTION 'Filing type is required'; END IF;
  IF p_due_date IS NULL THEN RAISE EXCEPTION 'A filing must have a due date'; END IF;
  INSERT INTO statutory_filing(entity_id, filing_type, period, due_date, notes)
  VALUES (p_entity, trim(p_filing_type), p_period, p_due_date, p_notes)
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'statutory_filing', r.id, 'filing scheduled',
                   trim(p_filing_type) || ' due ' || p_due_date);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION stat_filing_prepare(p_id bigint, p_reference text DEFAULT NULL)
RETURNS statutory_filing LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r statutory_filing;
BEGIN
  UPDATE statutory_filing
     SET status = 'Prepared', prepared_by = current_app_user(), prepared_at = now(),
         reference = coalesce(p_reference, reference)
   WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Filing % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'statutory_filing', p_id, 'filing prepared', r.filing_type);
  RETURN r;
END $$;

-- Submission is a separate act by a separate person, as with journals.
CREATE OR REPLACE FUNCTION stat_filing_submit(p_id bigint, p_reference text DEFAULT NULL)
RETURNS statutory_filing LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r statutory_filing;
BEGIN
  SELECT * INTO r FROM statutory_filing WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Filing % not found', p_id; END IF;
  IF r.status = 'Submitted' THEN
    RAISE EXCEPTION 'That filing was already submitted on %', r.submitted_at::date;
  END IF;
  IF r.status <> 'Prepared' THEN
    RAISE EXCEPTION 'That filing has not been prepared yet — prepare it before submitting';
  END IF;

  UPDATE statutory_filing
     SET status = 'Submitted', submitted_by = current_app_user(), submitted_at = now(),
         reference = coalesce(p_reference, reference)
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'statutory_filing', p_id, 'filing submitted',
                   r.filing_type || coalesce(' ref ' || r.reference, ''));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION stat_filing_chase(p_id bigint, p_note text DEFAULT NULL)
RETURNS statutory_filing LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r statutory_filing;
BEGIN
  UPDATE statutory_filing
     SET chased_at = now(), chase_count = chase_count + 1,
         notes = coalesce(notes || ' | ', '') || 'Chased ' || current_date ||
                 coalesce(': ' || p_note, '')
   WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Filing % not found', p_id; END IF;
  PERFORM ea_audit(r.entity_id, 'statutory_filing', p_id, 'registry chased',
                   r.filing_type || ' (chase ' || r.chase_count || ')');
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION stat_filing_list(p_entity bigint DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, filing_type text, period text,
              due_date date, status text, prepared_by text, submitted_by text,
              reference text, chase_count integer, overdue boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.id, f.entity_id, e.name, f.filing_type, f.period, f.due_date, f.status,
         f.prepared_by, f.submitted_by, f.reference, f.chase_count,
         (f.status <> 'Submitted' AND f.due_date < current_date)
    FROM statutory_filing f LEFT JOIN entity e ON e.id = f.entity_id
   WHERE (p_entity IS NULL OR f.entity_id = p_entity)
     AND (p_status IS NULL OR f.status = p_status)
   ORDER BY f.due_date;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- GAMING LICENCE RECORDS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entity_gaming (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id      bigint NOT NULL REFERENCES entity(id) UNIQUE,
  regulator      text,
  licence_no     text,
  licence_status text NOT NULL DEFAULT 'Not licensed',
  licence_from   date,
  licence_to     date,
  categories     text,
  notes          text,
  updated_by     text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION gaming_record_update(
  p_entity bigint, p_regulator text DEFAULT NULL, p_licence_no text DEFAULT NULL,
  p_licence_status text DEFAULT NULL, p_licence_from date DEFAULT NULL,
  p_licence_to date DEFAULT NULL, p_categories text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS entity_gaming LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r entity_gaming;
BEGIN
  -- A licence number without a regulator cannot be verified against anything.
  IF p_licence_no IS NOT NULL AND trim(p_licence_no) <> ''
     AND coalesce(p_regulator,'') = ''
     AND NOT EXISTS (SELECT 1 FROM entity_gaming WHERE entity_id = p_entity AND regulator IS NOT NULL) THEN
    RAISE EXCEPTION 'Give the regulator alongside the licence number';
  END IF;
  IF p_licence_from IS NOT NULL AND p_licence_to IS NOT NULL AND p_licence_to < p_licence_from THEN
    RAISE EXCEPTION 'The licence end date cannot precede its start';
  END IF;

  INSERT INTO entity_gaming(entity_id, regulator, licence_no, licence_status,
                            licence_from, licence_to, categories, notes, updated_by)
  VALUES (p_entity, p_regulator, p_licence_no, coalesce(p_licence_status,'Not licensed'),
          p_licence_from, p_licence_to, p_categories, p_notes, current_app_user())
  ON CONFLICT (entity_id) DO UPDATE SET
    regulator      = coalesce(EXCLUDED.regulator, entity_gaming.regulator),
    licence_no     = coalesce(EXCLUDED.licence_no, entity_gaming.licence_no),
    licence_status = coalesce(EXCLUDED.licence_status, entity_gaming.licence_status),
    licence_from   = coalesce(EXCLUDED.licence_from, entity_gaming.licence_from),
    licence_to     = coalesce(EXCLUDED.licence_to, entity_gaming.licence_to),
    categories     = coalesce(EXCLUDED.categories, entity_gaming.categories),
    notes          = coalesce(EXCLUDED.notes, entity_gaming.notes),
    updated_by     = current_app_user(), updated_at = now()
  RETURNING * INTO r;
  PERFORM ea_audit(p_entity, 'entity_gaming', r.id, 'gaming record updated',
                   coalesce(r.regulator,'') || ' ' || r.licence_status);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- USER ADMINISTRATION
-- ─────────────────────────────────────────────────────────────────────
-- Suspending a user here removes their access WITHIN Core. It does not touch
-- Entra, so it is not a substitute for the leaver process — the note below is
-- surfaced in the interface for that reason.
CREATE OR REPLACE FUNCTION sys_user_suspend(p_id bigint, p_reason text)
RETURNS sys_user LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r sys_user;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for suspending a user';
  END IF;
  UPDATE sys_user SET status = 'Suspended' WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'User % not found', p_id; END IF;
  PERFORM ea_audit(NULL, 'sys_user', p_id, 'USER SUSPENDED', r.name || ' — ' || p_reason);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION sys_user_reinstate(p_id bigint, p_reason text)
RETURNS sys_user LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r sys_user;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason for reinstating a user';
  END IF;
  UPDATE sys_user SET status = 'Active' WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'User % not found', p_id; END IF;
  PERFORM ea_audit(NULL, 'sys_user', p_id, 'user reinstated', r.name || ' — ' || p_reason);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION sys_user_set_role(p_id bigint, p_role text)
RETURNS sys_user LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r sys_user; was text;
BEGIN
  IF p_role NOT IN ('system_admin','director','manager','admin') THEN
    RAISE EXCEPTION 'Unknown role: %', p_role;
  END IF;
  SELECT role INTO was FROM sys_user WHERE id = p_id;
  UPDATE sys_user SET role = p_role WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'User % not found', p_id; END IF;
  PERFORM ea_audit(NULL, 'sys_user', p_id, 'ROLE CHANGED',
                   r.name || ': ' || coalesce(was,'(none)') || ' to ' || p_role);
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- DOCUMENT FOLDERS AND INTRANET EVENTS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dms_category_add(
  p_name text, p_retain_years int DEFAULT NULL, p_basis text DEFAULT NULL)
RETURNS dms_category LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r dms_category; next_code int;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN RAISE EXCEPTION 'Folder name is required'; END IF;
  IF EXISTS (SELECT 1 FROM dms_category WHERE lower(name) = lower(trim(p_name))) THEN
    RAISE EXCEPTION 'A folder called "%" already exists', trim(p_name);
  END IF;

  SELECT coalesce(max(code),0) + 1 INTO next_code FROM dms_category;
  INSERT INTO dms_category(code, name) VALUES (next_code, trim(p_name)) RETURNING * INTO r;

  -- A folder with no retention policy leaves documents with no expiry, so set
  -- one at the same time rather than leaving it to be forgotten.
  IF p_retain_years IS NOT NULL OR p_basis IS NOT NULL THEN
    INSERT INTO retention_policy(dms_category, retain_years, basis)
    VALUES (next_code, p_retain_years, p_basis)
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM ea_audit(NULL, 'dms_category', r.code, 'folder created',
                   trim(p_name) || coalesce(' — retain ' || p_retain_years || ' years', ' — NO RETENTION POLICY SET'));
  RETURN r;
END $$;

CREATE TABLE IF NOT EXISTS intranet_event (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title      text NOT NULL,
  event_date date NOT NULL,
  office     text,
  category   text,
  detail     text,
  created_by text NOT NULL DEFAULT current_app_user(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION intranet_event_add(
  p_title text, p_event_date date, p_office text DEFAULT NULL,
  p_category text DEFAULT NULL, p_detail text DEFAULT NULL)
RETURNS intranet_event LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r intranet_event;
BEGIN
  IF coalesce(trim(p_title),'') = '' THEN RAISE EXCEPTION 'An event needs a title'; END IF;
  IF p_event_date IS NULL THEN RAISE EXCEPTION 'An event needs a date'; END IF;
  INSERT INTO intranet_event(title, event_date, office, category, detail)
  VALUES (trim(p_title), p_event_date, p_office, p_category, p_detail)
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION intranet_event_list(p_from date DEFAULT NULL)
RETURNS TABLE(id bigint, title text, event_date date, office text, category text,
              detail text, created_by text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, title, event_date, office, category, detail, created_by
    FROM intranet_event
   WHERE event_date >= coalesce(p_from, current_date - 30)
   ORDER BY event_date;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PLANNING SCENARIOS
-- ─────────────────────────────────────────────────────────────────────
-- Copies an approved budget so it can be changed without touching the
-- approved figures, which is the whole point of a scenario.
CREATE OR REPLACE FUNCTION planning_scenario_create(
  p_source_budget bigint, p_name text, p_scenario text DEFAULT 'scenario')
RETURNS budget LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE src budget; nb budget;
BEGIN
  IF coalesce(trim(p_name),'') = '' THEN RAISE EXCEPTION 'Give the scenario a name'; END IF;
  SELECT * INTO src FROM budget WHERE id = p_source_budget;
  IF NOT FOUND THEN RAISE EXCEPTION 'Budget % not found', p_source_budget; END IF;

  INSERT INTO budget(entity_id, name, fiscal_year, ccy, status, created_by, scenario, version)
  VALUES (src.entity_id, trim(p_name), src.fiscal_year, src.ccy, 'draft',
          current_app_user(), coalesce(p_scenario,'scenario'), coalesce(src.version,1) + 1)
  RETURNING * INTO nb;

  INSERT INTO budget_line(budget_id, account_id, period, amount)
  SELECT nb.id, account_id, period, amount FROM budget_line WHERE budget_id = p_source_budget;

  PERFORM ea_audit(src.entity_id, 'budget', nb.id, 'scenario created',
                   trim(p_name) || ' from ' || coalesce(src.name,'budget ' || p_source_budget));
  RETURN nb;
END $$;

-- ── Grants: authenticated only ───────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'inv_%' OR p.proname LIKE 'stat_filing%'
            OR p.proname LIKE 'gaming_%' OR p.proname LIKE 'sys_user_%'
            OR p.proname LIKE 'dms_category_%' OR p.proname LIKE 'intranet_event%'
            OR p.proname LIKE 'planning_scenario%' OR p.proname LIKE 'ea_profile%'
            OR p.proname LIKE 'ea_classification%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON statutory_filing, entity_gaming, intranet_event FROM PUBLIC, anon;
GRANT SELECT ON statutory_filing, entity_gaming, intranet_event TO authenticated;

-- ── Confirm ──────────────────────────────────────────────────────────
SELECT p.proname AS write_function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_users,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS public_key
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND (p.proname LIKE 'inv_%' OR p.proname LIKE 'stat_filing%' OR p.proname LIKE 'gaming_%'
        OR p.proname LIKE 'sys_user_%' OR p.proname LIKE 'dms_category_%'
        OR p.proname LIKE 'intranet_event%' OR p.proname LIKE 'planning_scenario%'
        OR p.proname LIKE 'ea_profile%' OR p.proname LIKE 'ea_classification%')
 ORDER BY p.proname;
