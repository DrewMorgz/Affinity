-- =====================================================================
-- AFFINITY CORE — 084: THE FOUR STORES THAT DID NOT EXIST
--
-- The pre-Azure audit found 33 read functions the API called that were not
-- there. Twenty-nine were built in db/083 over tables that existed. These four
-- had NO TABLE AT ALL:
--
--   comp_reviews      periodic client reviews
--   crm_prospects     the business development pipeline
--   crm_interactions  the contact log against a prospect
--   attrition_cases   a client leaving
--
-- Designed from what the screens already display plus Andy's answers on the
-- three points only he could settle:
--
--   * attrition sign-off is Manager, then MD, then Group CEO **or** Group COO.
--     The last stage has an ALTERNATE, so either satisfies it — modelled
--     explicitly rather than as a single named role, because a rule that
--     needs one specific person stalls when they are away.
--   * a review falls due on RISK RATING, not a fixed period.
--   * the pipeline stages are Proposal Sent, KYC Arriving, Fees Paid.
--
-- The review INTERVALS are not hardcoded. High annually and Low every three
-- years is the common shape, but it varies by jurisdiction and it is a
-- compliance judgement, so Compliance enters them — the same treatment as the
-- payroll rates and the obligation schedules.
--
-- Run AFTER 083. Safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. HOW OFTEN A REVIEW FALLS DUE
-- ─────────────────────────────────────────────────────────────────────
-- An interval applies either to one jurisdiction or to all of them. NULL was
-- the obvious way to say "all", but location_code cannot be null while it is
-- part of the primary key — primary key columns are NOT NULL, so the first
-- group-wide interval was rejected. Found by running it.
--
-- A surrogate key with a unique index over coalesce() instead, which lets NULL
-- mean "all jurisdictions" and still prevents two intervals for the same
-- rating and place.
CREATE TABLE IF NOT EXISTS review_frequency (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  risk_rating    text NOT NULL,
  location_code  text REFERENCES location(code),   -- null = applies everywhere
  months         integer NOT NULL,
  note           text,
  set_by         text NOT NULL DEFAULT current_app_user(),
  set_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_frequency_months CHECK (months > 0 AND months <= 120)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_review_frequency
  ON review_frequency(risk_rating, coalesce(location_code, '*'));
-- Deliberately empty. Until Compliance enters the intervals, no review has a
-- due date and the screen says so — a made-up interval would silently put
-- high-risk clients on the wrong cycle.

CREATE OR REPLACE FUNCTION review_frequency_set(
  p_risk text, p_months integer, p_location text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS review_frequency LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r review_frequency;
BEGIN
  IF coalesce(trim(p_risk),'') = '' THEN
    RAISE EXCEPTION 'Give the risk rating this interval applies to';
  END IF;
  IF p_months IS NULL OR p_months <= 0 THEN
    RAISE EXCEPTION 'The interval must be a positive number of months';
  END IF;
  IF p_months > 120 THEN
    RAISE EXCEPTION 'An interval of % months is over ten years — check that is intended', p_months;
  END IF;

  INSERT INTO review_frequency(risk_rating, location_code, months, note)
  VALUES (trim(p_risk), p_location, p_months, p_note)
  ON CONFLICT (risk_rating, coalesce(location_code, '*')) DO UPDATE SET
    months = EXCLUDED.months, note = EXCLUDED.note,
    set_by = current_app_user(), set_at = now()
  RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'review_frequency', NULL, 'review interval set',
                   trim(p_risk) || coalesce(' in ' || p_location, ' (all jurisdictions)') ||
                   ': every ' || p_months || ' months');
  RETURN r;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. PERIODIC CLIENT REVIEWS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS periodic_review (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id       bigint NOT NULL REFERENCES entity(id),
  review_date     date NOT NULL,
  risk_at_review  text,
  -- What was actually looked at. Held as separate flags rather than a single
  -- "reviewed" tick, because a review that did not revisit source of wealth is
  -- not the same as one that did, and the difference is what a regulator asks.
  cdd_refreshed       boolean NOT NULL DEFAULT false,
  source_of_wealth    boolean NOT NULL DEFAULT false,
  sanctions_screened  boolean NOT NULL DEFAULT false,
  pep_screened        boolean NOT NULL DEFAULT false,
  structure_confirmed boolean NOT NULL DEFAULT false,
  activity_consistent boolean NOT NULL DEFAULT false,

  risk_after      text,
  findings        text,
  actions         text,
  reviewed_by     text NOT NULL DEFAULT current_app_user(),
  approved_by     text,
  approved_at     timestamptz,
  status          text NOT NULL DEFAULT 'draft',
  next_due        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT periodic_review_status CHECK (status IN ('draft','completed','approved'))
);
CREATE INDEX IF NOT EXISTS ix_periodic_review_entity
  ON periodic_review(entity_id, review_date DESC);

CREATE OR REPLACE FUNCTION review_start(p_entity bigint, p_review_date date DEFAULT NULL)
RETURNS periodic_review LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r periodic_review; risk text;
BEGIN
  SELECT p.risk_rating INTO risk FROM entity_profile p WHERE p.entity_id = p_entity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;

  -- The risk rating at the time is captured, because a review's scope is
  -- judged against the rating it was done under, not today's.
  INSERT INTO periodic_review(entity_id, review_date, risk_at_review)
  VALUES (p_entity, coalesce(p_review_date, current_date), risk)
  RETURNING * INTO r;

  PERFORM ea_audit(p_entity, 'periodic_review', r.id, 'periodic review started',
                   'risk at review: ' || coalesce(risk, 'not rated'));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION review_complete(
  p_id bigint, p_cdd boolean, p_sow boolean, p_sanctions boolean, p_pep boolean,
  p_structure boolean, p_activity boolean, p_risk_after text,
  p_findings text DEFAULT NULL, p_actions text DEFAULT NULL)
RETURNS periodic_review LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r periodic_review; months integer; loc text;
BEGIN
  SELECT * INTO r FROM periodic_review WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review % not found', p_id; END IF;
  IF r.status = 'approved' THEN
    RAISE EXCEPTION 'That review is approved — start a new one rather than changing it';
  END IF;
  IF coalesce(trim(p_risk_after),'') = '' THEN
    RAISE EXCEPTION 'Record the risk rating after the review, even if it is unchanged — the conclusion is the point of the review';
  END IF;

  -- A review that did not screen for sanctions or PEP status is not a review.
  -- Refused rather than recorded as partial, because a partial review on file
  -- reads as a completed one.
  IF NOT p_sanctions OR NOT p_pep THEN
    RAISE EXCEPTION 'Sanctions and PEP screening are both required before a review can be completed. If either could not be done, leave the review in draft and record why in the findings.';
  END IF;
  IF NOT p_cdd AND NOT p_sow THEN
    RAISE EXCEPTION 'A review that refreshed neither the CDD nor the source of wealth has not reviewed anything — record what was actually done';
  END IF;

  -- The next due date comes from the interval Compliance recorded for the
  -- rating AFTER the review, not before: a client moved to high risk is due
  -- again sooner.
  SELECT e.location_code INTO loc FROM entity e WHERE e.id = r.entity_id;
  SELECT f.months INTO months FROM review_frequency f
   WHERE f.risk_rating = trim(p_risk_after)
     AND (f.location_code = loc OR f.location_code IS NULL)
   ORDER BY (f.location_code IS NOT NULL) DESC LIMIT 1;

  UPDATE periodic_review SET
    cdd_refreshed = p_cdd, source_of_wealth = p_sow,
    sanctions_screened = p_sanctions, pep_screened = p_pep,
    structure_confirmed = p_structure, activity_consistent = p_activity,
    risk_after = trim(p_risk_after), findings = p_findings, actions = p_actions,
    status = 'completed',
    next_due = CASE WHEN months IS NULL THEN NULL
                    ELSE coalesce(r.review_date, current_date) + (months || ' months')::interval END
   WHERE id = p_id RETURNING * INTO r;

  -- The risk rating on the entity follows the review's conclusion, so the two
  -- cannot disagree.
  UPDATE entity_profile SET risk_rating = trim(p_risk_after), next_review_date = r.next_due
   WHERE entity_id = r.entity_id;

  PERFORM ea_audit(r.entity_id, 'periodic_review', p_id, 'periodic review completed',
                   'risk ' || coalesce(r.risk_at_review,'—') || ' → ' || trim(p_risk_after) ||
                   coalesce('; next due ' || r.next_due, '; NO INTERVAL RECORDED for ' || trim(p_risk_after)));
  RETURN r;
END $$;

-- Approval is separate and refused to the reviewer: a review checked by the
-- person who did it is not independent.
CREATE OR REPLACE FUNCTION review_approve(p_id bigint)
RETURNS periodic_review LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r periodic_review;
BEGIN
  SELECT * INTO r FROM periodic_review WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review % not found', p_id; END IF;
  IF r.status <> 'completed' THEN
    RAISE EXCEPTION 'A review must be completed before approval — this one is %', r.status;
  END IF;
  IF lower(coalesce(r.reviewed_by,'')) = lower(current_app_user()) THEN
    RAISE EXCEPTION 'You carried out this review — it must be approved by someone else';
  END IF;

  UPDATE periodic_review SET status = 'approved', approved_by = current_app_user(),
         approved_at = now()
   WHERE id = p_id RETURNING * INTO r;
  PERFORM ea_audit(r.entity_id, 'periodic_review', p_id, 'PERIODIC REVIEW APPROVED',
                   'approved by ' || current_app_user());
  RETURN r;
END $$;

-- What the compliance screen reads. Every client appears, whether reviewed or
-- not — a client that has never been reviewed is the one that matters, and it
-- would be invisible in a list of reviews.
CREATE OR REPLACE FUNCTION comp_reviews(p_location text DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, company_code text,
              jurisdiction text, risk_rating text,
              last_review date, last_status text, reviewed_by text,
              approved_by text, next_due date, days_overdue integer,
              never_reviewed boolean, overdue boolean, no_interval_set boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.name, e.company_code, p.jurisdiction, p.risk_rating,
         r.review_date, r.status, r.reviewed_by, r.approved_by, r.next_due,
         CASE WHEN r.next_due IS NULL THEN NULL
              ELSE (current_date - r.next_due)::int END,
         (r.id IS NULL),
         (r.next_due IS NOT NULL AND r.next_due < current_date),
         -- No interval recorded for this rating means no due date can be
         -- calculated, which is a gap in the compliance setup rather than in
         -- the client's file.
         NOT EXISTS (SELECT 1 FROM review_frequency f
                      WHERE f.risk_rating = p.risk_rating
                        AND (f.location_code = e.location_code OR f.location_code IS NULL))
    FROM entity e
    JOIN entity_profile p ON p.entity_id = e.id
    LEFT JOIN LATERAL (
      SELECT pr.* FROM periodic_review pr
       WHERE pr.entity_id = e.id ORDER BY pr.review_date DESC LIMIT 1) r ON true
   WHERE e.entity_class = 'client'
     AND (p_location IS NULL OR p.jurisdiction = p_location)
   ORDER BY (r.id IS NULL) DESC,
            (r.next_due IS NOT NULL AND r.next_due < current_date) DESC,
            r.next_due NULLS LAST, e.name;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. CRM PIPELINE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_prospect (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name     text,
  last_name      text,
  company        text NOT NULL,
  entity_type    text,
  jurisdiction   text,
  office         text,
  source         text,
  stage          text NOT NULL DEFAULT 'Enquiry',
  bd_owner       text,
  annual_fee     numeric(14,2),
  setup_fee      numeric(14,2),
  admin_fee      numeric(14,2),
  fee_ccy        char(3) DEFAULT 'GBP',
  target_date    date,
  risk_rating    text,
  website        text,
  address        text,
  notes          text,
  -- When a prospect converts it becomes an onboarding case, and the link is
  -- kept so the pipeline and the onboarding file are one story.
  onboarding_case_id bigint REFERENCES onboarding_case(id),
  lost_reason    text,
  is_open        boolean NOT NULL DEFAULT true,
  created_by     text NOT NULL DEFAULT current_app_user(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_crm_prospect_stage ON crm_prospect(stage) WHERE is_open;

CREATE TABLE IF NOT EXISTS crm_interaction (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prospect_id  bigint NOT NULL REFERENCES crm_prospect(id) ON DELETE CASCADE,
  interaction_date date NOT NULL,
  interaction_type text NOT NULL,
  by_whom      text NOT NULL DEFAULT current_app_user(),
  note         text,
  next_action  text,
  next_action_due date,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_crm_interaction ON crm_interaction(prospect_id, interaction_date DESC);

-- The stages Andy confirmed, in order, so a stage change can be checked
-- against them rather than accepting any string.
CREATE TABLE IF NOT EXISTS crm_stage (
  name       text PRIMARY KEY,
  sort_order integer NOT NULL,
  is_won     boolean NOT NULL DEFAULT false,
  is_lost    boolean NOT NULL DEFAULT false
);
INSERT INTO crm_stage(name, sort_order, is_won, is_lost) VALUES
 ('Enquiry',        10, false, false),
 ('Proposal Sent',  20, false, false),
 ('KYC Arriving',   30, false, false),
 ('Fees Paid',      40, true,  false),
 ('Lost',           90, false, true)
ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order,
                                 is_won = EXCLUDED.is_won, is_lost = EXCLUDED.is_lost;

CREATE OR REPLACE FUNCTION crm_prospect_add(p JSONB)
RETURNS crm_prospect LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r crm_prospect; st text;
BEGIN
  IF coalesce(trim(p->>'company'),'') = '' THEN
    RAISE EXCEPTION 'Give the prospect a company or structure name';
  END IF;
  st := coalesce(nullif(trim(p->>'stage'),''), 'Enquiry');
  IF NOT EXISTS (SELECT 1 FROM crm_stage WHERE name = st) THEN
    RAISE EXCEPTION 'Unknown stage "%". Valid stages: %', st,
      (SELECT string_agg(s.name, ' → ' ORDER BY s.sort_order) FROM crm_stage s);
  END IF;

  INSERT INTO crm_prospect(first_name, last_name, company, entity_type, jurisdiction,
                           office, source, stage, bd_owner, annual_fee, setup_fee,
                           admin_fee, fee_ccy, target_date, risk_rating, website,
                           address, notes)
  VALUES (p->>'first_name', p->>'last_name', trim(p->>'company'), p->>'entity_type',
          p->>'jurisdiction', p->>'office', p->>'source', st, p->>'bd_owner',
          (p->>'annual_fee')::numeric, (p->>'setup_fee')::numeric,
          (p->>'admin_fee')::numeric, coalesce(p->>'fee_ccy','GBP'),
          (p->>'target_date')::date, p->>'risk_rating', p->>'website',
          p->>'address', p->>'notes')
  RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'crm_prospect', r.id, 'prospect added',
                   trim(p->>'company') || ' at ' || st);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION crm_stage_set(p_id bigint, p_stage text, p_lost_reason text DEFAULT NULL)
RETURNS crm_prospect LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r crm_prospect; s crm_stage; was text;
BEGIN
  SELECT * INTO r FROM crm_prospect WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prospect % not found', p_id; END IF;
  SELECT * INTO s FROM crm_stage WHERE name = trim(p_stage);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown stage "%". Valid stages: %', p_stage,
      (SELECT string_agg(x.name, ' → ' ORDER BY x.sort_order) FROM crm_stage x);
  END IF;
  -- Marking a prospect lost without saying why loses the only useful part of
  -- a lost prospect.
  IF s.is_lost AND coalesce(trim(p_lost_reason),'') = '' THEN
    RAISE EXCEPTION 'Give a reason when marking a prospect lost — why we lost it is the useful part';
  END IF;

  was := r.stage;
  UPDATE crm_prospect
     SET stage = s.name,
         lost_reason = coalesce(p_lost_reason, lost_reason),
         is_open = NOT (s.is_lost OR s.is_won)
   WHERE id = p_id RETURNING * INTO r;

  PERFORM ea_audit(NULL, 'crm_prospect', p_id, 'prospect stage changed',
                   r.company || ': ' || was || ' → ' || s.name ||
                   coalesce(' (' || p_lost_reason || ')', ''));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION crm_interaction_add(
  p_prospect bigint, p_date date, p_type text, p_note text,
  p_next_action text DEFAULT NULL, p_next_due date DEFAULT NULL)
RETURNS crm_interaction LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r crm_interaction;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_prospect WHERE id = p_prospect) THEN
    RAISE EXCEPTION 'Prospect % not found', p_prospect;
  END IF;
  IF coalesce(trim(p_type),'') = '' THEN
    RAISE EXCEPTION 'Say what kind of contact this was — call, email, meeting';
  END IF;

  INSERT INTO crm_interaction(prospect_id, interaction_date, interaction_type,
                              note, next_action, next_action_due)
  VALUES (p_prospect, coalesce(p_date, current_date), trim(p_type), p_note,
          p_next_action, p_next_due)
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION crm_prospects(p_open_only boolean DEFAULT true)
RETURNS TABLE(id bigint, contact text, company text, entity_type text,
              jurisdiction text, office text, source text, stage text,
              stage_order integer, bd_owner text, annual_fee numeric,
              setup_fee numeric, admin_fee numeric, fee_ccy char(3),
              total_first_year numeric, target_date date, risk_rating text,
              website text, notes text, interactions bigint,
              last_contact date, next_action text, next_action_due date,
              days_since_contact integer, stale boolean, is_open boolean,
              converted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id,
         nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
         p.company, p.entity_type, p.jurisdiction, p.office, p.source,
         p.stage, s.sort_order, p.bd_owner,
         p.annual_fee, p.setup_fee, p.admin_fee, p.fee_ccy,
         -- First-year value is what a pipeline is judged on, and it is the sum
         -- rather than the annual fee alone.
         round(coalesce(p.annual_fee,0) + coalesce(p.setup_fee,0)
               + coalesce(p.admin_fee,0) * 12, 2),
         p.target_date, p.risk_rating, p.website, p.notes,
         (SELECT count(*) FROM crm_interaction i WHERE i.prospect_id = p.id),
         (SELECT max(i.interaction_date) FROM crm_interaction i WHERE i.prospect_id = p.id),
         (SELECT i.next_action FROM crm_interaction i WHERE i.prospect_id = p.id
           ORDER BY i.interaction_date DESC LIMIT 1),
         (SELECT i.next_action_due FROM crm_interaction i WHERE i.prospect_id = p.id
           ORDER BY i.interaction_date DESC LIMIT 1),
         (current_date - (SELECT max(i.interaction_date) FROM crm_interaction i
                           WHERE i.prospect_id = p.id))::int,
         -- An open prospect not contacted for a month is going cold, which is
         -- the thing a pipeline review is for.
         (p.is_open AND coalesce(
            (current_date - (SELECT max(i.interaction_date) FROM crm_interaction i
                              WHERE i.prospect_id = p.id)), 999) > 30),
         p.is_open,
         (p.onboarding_case_id IS NOT NULL)
    FROM crm_prospect p
    LEFT JOIN crm_stage s ON s.name = p.stage
   WHERE NOT p_open_only OR p.is_open
   ORDER BY s.sort_order DESC, p.company;
$$;

CREATE OR REPLACE FUNCTION crm_interactions(p_prospect bigint DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS TABLE(id bigint, prospect_id bigint, company text, interaction_date date,
              interaction_type text, by_whom text, note text,
              next_action text, next_action_due date, action_overdue boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT i.id, i.prospect_id, p.company, i.interaction_date, i.interaction_type,
         i.by_whom, i.note, i.next_action, i.next_action_due,
         (i.next_action_due IS NOT NULL AND i.next_action_due < current_date)
    FROM crm_interaction i
    LEFT JOIN crm_prospect p ON p.id = i.prospect_id
   WHERE p_prospect IS NULL OR i.prospect_id = p_prospect
   ORDER BY i.interaction_date DESC, i.id DESC
   LIMIT coalesce(p_limit, 200);
$$;

-- Converting a won prospect into an onboarding case, so the pipeline and the
-- onboarding file are the same story rather than two records of one client.
CREATE OR REPLACE FUNCTION crm_prospect_convert(p_id bigint)
RETURNS TABLE(prospect text, case_id bigint, note text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE p crm_prospect; cid bigint;
BEGIN
  SELECT * INTO p FROM crm_prospect WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prospect % not found', p_id; END IF;
  IF p.onboarding_case_id IS NOT NULL THEN
    RAISE EXCEPTION 'That prospect has already been converted, to case %', p.onboarding_case_id;
  END IF;

  -- onb_case_add returns the onboarding_case ROW, not an id, so the id is
  -- taken from it rather than assigned directly. Assigning the record to a
  -- bigint failed at runtime.
  SELECT c.id INTO cid FROM onb_case_add(
    coalesce(nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),''), p.company),
    p.company, p.office, p.jurisdiction, p.entity_type, p.source) c;

  UPDATE crm_prospect SET onboarding_case_id = cid, is_open = false WHERE id = p_id;
  PERFORM ea_audit(NULL, 'crm_prospect', p_id, 'prospect converted to onboarding',
                   p.company || ' → onboarding case ' || cid);
  RETURN QUERY SELECT p.company, cid,
    'Onboarding case created. CDD still has to be recorded and verified before it can go live.';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. ATTRITION
-- ─────────────────────────────────────────────────────────────────────
-- Sign-off is Manager, then MD, then Group CEO **or** Group COO.
--
-- The last stage has an ALTERNATE, and that is modelled rather than glossed:
-- a rule requiring one named person stalls whenever they are away, and the
-- realistic result is that someone works around it.
CREATE TABLE IF NOT EXISTS attrition_stage (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  sort_order integer NOT NULL,
  roles      text[] NOT NULL     -- any one of these satisfies the stage
);
INSERT INTO attrition_stage(code, name, sort_order, roles) VALUES
 ('MANAGER',  'Manager approval',   10, ARRAY['Manager']),
 ('MD',       'MD approval',        20, ARRAY['MD','Managing Director']),
 ('GROUP',    'Group CEO or COO',   30, ARRAY['Group CEO','CEO','Group COO','COO'])
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name,
                                 sort_order = EXCLUDED.sort_order,
                                 roles = EXCLUDED.roles;

CREATE TABLE IF NOT EXISTS attrition_case (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id     bigint NOT NULL REFERENCES entity(id),
  reason        text NOT NULL,      -- Liquidation, Transfer out, Resignation, Non-payment
  detail        text,
  administrator text,
  started       date NOT NULL DEFAULT current_date,
  target_date   date,
  status        text NOT NULL DEFAULT 'open',
  closed_date   date,
  outstanding_fees numeric(14,2),
  successor     text,               -- who is taking the client on, if a transfer
  created_by    text NOT NULL DEFAULT current_app_user(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attrition_status CHECK (status IN ('open','approved','completed','abandoned'))
);

CREATE TABLE IF NOT EXISTS attrition_approval (
  case_id     bigint NOT NULL REFERENCES attrition_case(id) ON DELETE CASCADE,
  stage_code  text NOT NULL REFERENCES attrition_stage(code),
  approved_by text NOT NULL,
  role_used   text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  note        text,
  PRIMARY KEY (case_id, stage_code)
);

CREATE OR REPLACE FUNCTION attrition_open(
  p_entity bigint, p_reason text, p_detail text DEFAULT NULL,
  p_administrator text DEFAULT NULL, p_successor text DEFAULT NULL,
  p_target_date date DEFAULT NULL)
RETURNS attrition_case LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r attrition_case; nm text; unbilled numeric;
BEGIN
  SELECT e.name INTO nm FROM entity e WHERE e.id = p_entity;
  IF nm IS NULL THEN RAISE EXCEPTION 'Entity % not found', p_entity; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Record why the client is leaving — it is the whole point of the file';
  END IF;
  IF EXISTS (SELECT 1 FROM attrition_case a
              WHERE a.entity_id = p_entity AND a.status IN ('open','approved')) THEN
    RAISE EXCEPTION 'There is already an open attrition case for %', nm;
  END IF;

  -- Unbilled time is captured at the outset rather than discovered at the
  -- end, because a departing client is the hardest one to bill afterwards.
  SELECT round(coalesce(sum(t.value),0),2) INTO unbilled
    FROM timesheet_entry t
   WHERE t.entity_label = nm AND t.billable AND coalesce(t.status,'') <> 'Billed';

  INSERT INTO attrition_case(entity_id, reason, detail, administrator, successor,
                             target_date, outstanding_fees)
  VALUES (p_entity, trim(p_reason), p_detail, p_administrator, p_successor,
          p_target_date, unbilled)
  RETURNING * INTO r;

  PERFORM ea_audit(p_entity, 'attrition_case', r.id, 'ATTRITION CASE OPENED',
                   nm || ' — ' || trim(p_reason) ||
                   CASE WHEN unbilled > 0 THEN '; ' || unbilled || ' unbilled at opening'
                        ELSE '' END);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION attrition_approve(
  p_case bigint, p_stage text, p_role text, p_note text DEFAULT NULL)
RETURNS TABLE(stage text, approved_by text, stages_done bigint,
              stages_total bigint, fully_approved boolean, next_stage text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE c attrition_case; s attrition_stage; done bigint; total bigint; nxt text;
BEGIN
  SELECT * INTO c FROM attrition_case WHERE id = p_case;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attrition case % not found', p_case; END IF;
  IF c.status NOT IN ('open') THEN
    RAISE EXCEPTION 'That case is % and no longer needs approving', c.status;
  END IF;
  SELECT * INTO s FROM attrition_stage WHERE code = upper(trim(p_stage));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown stage "%". The sequence is: %', p_stage,
      (SELECT string_agg(x.name, ' → ' ORDER BY x.sort_order) FROM attrition_stage x);
  END IF;

  -- The role has to be one the stage accepts. For the final stage either Group
  -- CEO or Group COO satisfies it, which is why roles is an array.
  IF NOT (trim(p_role) = ANY(s.roles)) THEN
    RAISE EXCEPTION '"%" cannot sign off %. That stage accepts: %',
      p_role, s.name, array_to_string(s.roles, ' or ');
  END IF;

  -- In sequence. A CEO sign-off before the manager has looked at it defeats
  -- the point of having stages.
  IF EXISTS (SELECT 1 FROM attrition_stage e
              WHERE e.sort_order < s.sort_order
                AND NOT EXISTS (SELECT 1 FROM attrition_approval a
                                 WHERE a.case_id = p_case AND a.stage_code = e.code)) THEN
    RAISE EXCEPTION 'Earlier stages are outstanding: %. Approvals run in sequence.',
      (SELECT string_agg(e.name, ', ' ORDER BY e.sort_order) FROM attrition_stage e
        WHERE e.sort_order < s.sort_order
          AND NOT EXISTS (SELECT 1 FROM attrition_approval a
                           WHERE a.case_id = p_case AND a.stage_code = e.code));
  END IF;

  -- One person cannot satisfy two stages.
  IF EXISTS (SELECT 1 FROM attrition_approval a
              WHERE a.case_id = p_case
                AND lower(a.approved_by) = lower(current_app_user())) THEN
    RAISE EXCEPTION 'You have already approved an earlier stage of this case — each stage needs a different person';
  END IF;

  INSERT INTO attrition_approval(case_id, stage_code, approved_by, role_used, note)
  VALUES (p_case, s.code, current_app_user(), trim(p_role), p_note)
  ON CONFLICT (case_id, stage_code) DO UPDATE SET
    approved_by = current_app_user(), role_used = trim(p_role),
    approved_at = now(), note = p_note;

  SELECT count(*) INTO done FROM attrition_approval WHERE case_id = p_case;
  SELECT count(*) INTO total FROM attrition_stage;
  SELECT e.name INTO nxt FROM attrition_stage e
   WHERE NOT EXISTS (SELECT 1 FROM attrition_approval a
                      WHERE a.case_id = p_case AND a.stage_code = e.code)
   ORDER BY e.sort_order LIMIT 1;

  IF done >= total THEN
    UPDATE attrition_case SET status = 'approved' WHERE id = p_case;
  END IF;

  PERFORM ea_audit(c.entity_id, 'attrition_case', p_case,
                   CASE WHEN done >= total THEN 'ATTRITION FULLY APPROVED'
                        ELSE 'attrition stage approved' END,
                   s.name || ' by ' || current_app_user() || ' as ' || trim(p_role) ||
                   ' (' || done || ' of ' || total || ')');

  RETURN QUERY SELECT s.name, current_app_user(), done, total, (done >= total),
                      coalesce(nxt, 'none — fully approved');
END $$;

CREATE OR REPLACE FUNCTION attrition_cases(p_open_only boolean DEFAULT false)
RETURNS TABLE(id bigint, entity_id bigint, entity_name text, company_code text,
              reason text, detail text, administrator text, successor text,
              started date, target_date date, status text,
              outstanding_fees numeric, unbilled_now numeric,
              stages_done bigint, stages_total bigint, next_stage text,
              approvals text, fully_approved boolean, days_open integer,
              blocked_by_fees boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id, a.entity_id, e.name, e.company_code, a.reason, a.detail,
         a.administrator, a.successor, a.started, a.target_date, a.status,
         a.outstanding_fees,
         -- Unbilled now as well as at opening: it can grow while the case runs,
         -- and the difference is work done after the client gave notice.
         round(coalesce((SELECT sum(t.value) FROM timesheet_entry t
                          WHERE t.entity_label = e.name AND t.billable
                            AND coalesce(t.status,'') <> 'Billed'), 0), 2),
         (SELECT count(*) FROM attrition_approval ap WHERE ap.case_id = a.id),
         (SELECT count(*) FROM attrition_stage),
         (SELECT st.name FROM attrition_stage st
           WHERE NOT EXISTS (SELECT 1 FROM attrition_approval ap
                              WHERE ap.case_id = a.id AND ap.stage_code = st.code)
           ORDER BY st.sort_order LIMIT 1),
         (SELECT string_agg(st.name || ': ' || ap.approved_by || ' (' || ap.role_used || ')',
                            '; ' ORDER BY st.sort_order)
            FROM attrition_approval ap JOIN attrition_stage st ON st.code = ap.stage_code
           WHERE ap.case_id = a.id),
         ((SELECT count(*) FROM attrition_approval ap WHERE ap.case_id = a.id)
          >= (SELECT count(*) FROM attrition_stage)),
         (current_date - a.started)::int,
         -- Letting a client go with unbilled time on the clock writes it off.
         (coalesce((SELECT sum(t.value) FROM timesheet_entry t
                     WHERE t.entity_label = e.name AND t.billable
                       AND coalesce(t.status,'') <> 'Billed'), 0) > 0)
    FROM attrition_case a
    LEFT JOIN entity e ON e.id = a.entity_id
   WHERE NOT p_open_only OR a.status = 'open'
   ORDER BY a.started DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- GRANTS
-- ─────────────────────────────────────────────────────────────────────
DO $g$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'review_%' OR p.proname LIKE 'crm_%'
            OR p.proname LIKE 'attrition_%' OR p.proname = 'comp_reviews')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON review_frequency, periodic_review, crm_prospect, crm_interaction,
              crm_stage, attrition_stage, attrition_case, attrition_approval
  FROM PUBLIC, anon;
GRANT SELECT ON review_frequency, periodic_review, crm_prospect, crm_interaction,
                crm_stage, attrition_stage, attrition_case, attrition_approval
  TO authenticated;

SELECT 'review intervals recorded' AS item, count(*)::text AS value FROM review_frequency
UNION ALL SELECT 'pipeline stages', count(*)::text FROM crm_stage
UNION ALL SELECT 'attrition stages', count(*)::text FROM attrition_stage
UNION ALL SELECT 'clients needing a review', count(*)::text FROM comp_reviews(NULL);
