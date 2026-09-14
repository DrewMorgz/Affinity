-- 102 — a FATCA and CRS classification methodology, and the reporting extract
--
-- TWO THINGS, AND A CORRECTION WORTH MAKING FIRST.
--
-- The FATCA return to the IRS is XML, not CSV — the FATCA XML Schema v2.0 — and
-- CRS is the OECD CRS XML Schema v2.0. Several jurisdiction portals accept a
-- CSV template and convert it themselves, and the templates differ by
-- jurisdiction: the Isle of Man, Malta and Cayman each publish their own.
--
-- So a single "the CSV file required for reporting" does not exist. What DOES
-- exist, and is the same whatever comes out of the end, is the set of
-- reportable accounts with their holders, controlling persons and balances.
-- That is what this builds. Turning it into a specific portal's file is a
-- formatting step on top, and needs the template for each jurisdiction.
--
-- ── PART ONE: THE METHODOLOGY ──────────────────────────────────────────────
--
-- 101 gave the valid classifications. This asks the questions that arrive at
-- one, and records the ANSWERS as well as the conclusion.
--
-- The answers are the point. A classification with no record of how it was
-- reached cannot be defended three years later when the person who made it has
-- left, and "Passive NFFE" written in a box tells a regulator nothing about
-- whether anybody thought about it. The questions below are the ones that
-- actually determine the answer, in the order that resolves fastest.
--
-- It still does not decide. The last step records what a person concluded,
-- with the answers beside it.

CREATE TABLE IF NOT EXISTS classification_question (
  regime      text NOT NULL REFERENCES classification_regime(code),
  seq         integer NOT NULL,
  code        text NOT NULL,
  question    text NOT NULL,
  help        text,
  PRIMARY KEY (regime, code)
);

INSERT INTO classification_question (regime, seq, code, question, help) VALUES
 ('FATCA',10,'FI','Does the entity accept deposits, hold financial assets for others, or is it managed by a financial institution and primarily investing?',
  'If yes it is a Financial Institution and the FI classifications apply. A trust administered by a professional trustee that primarily holds investments usually IS an FI — this is the question most structures turn on.'),
 ('FATCA',20,'TRUSTEE','If it is an FI: does a trustee report on its behalf?',
  'A Trustee-Documented Trust is an FI whose trustee reports for it. Common across Affinity trusts. The obligation sits with the trustee company.'),
 ('FATCA',30,'SPONSOR','If it is an FI: does a sponsoring entity report for it?',
  'A Sponsored Investment Entity. The sponsor needs the GIIN.'),
 ('FATCA',40,'REGISTERED','If it reports for itself: is it registered with the IRS with a GIIN?',
  'A Reporting FI must hold a GIIN. If it should have one and does not, that is the gap to close before anything else.'),
 ('FATCA',50,'PASSIVE','If it is NOT an FI: is 50% or more of its income passive, or 50% or more of its assets held for passive income?',
  'Dividends, interest, rents and royalties are passive. If yes it is a Passive NFFE and its CONTROLLING PERSONS are looked through and reported where they are US persons. Most holding companies land here.'),
 ('FATCA',60,'EXCEPTED','Is it publicly traded, an affiliate of a publicly traded corporation, a start-up, or in liquidation?',
  'These are Excepted NFFEs and do not report.'),
 ('CRS',10,'FI','Is it a custodial institution, a depository institution, an investment entity, or a specified insurance company?',
  'An investment entity managed by another FI is the category most administered trusts and holding structures fall into — which makes the entity itself an FI with its own reporting obligation.'),
 ('CRS',20,'MANAGED','If it is an investment entity: is it managed by another financial institution?',
  'Managed by another FI is Investment Entity type A. Conducting the activity itself for customers is type B.'),
 ('CRS',30,'NONREPORTING','Is it a governmental entity, international organisation, central bank, broad participation retirement fund, exempt collective investment vehicle, or trustee-documented trust?',
  'These are Non-Reporting Financial Institutions.'),
 ('CRS',40,'ACTIVE','If it is NOT an FI: is less than 50% of income passive AND less than 50% of assets held for passive income?',
  'Also active: listed companies and their affiliates, governmental entities, holding companies of a non-financial group, start-ups under 24 months, entities in liquidation, treasury centres, and non-profits.'),
 ('CRS',50,'PASSIVE','Otherwise it is a Passive NFE.',
  'CONTROLLING PERSONS ARE LOOKED THROUGH AND REPORTED. An investment entity managed by another FI but resident in a non-participating jurisdiction is also treated as a Passive NFE.')
ON CONFLICT (regime, code) DO UPDATE SET question = excluded.question, help = excluded.help;

-- The answers somebody gave, and what they concluded.
CREATE TABLE IF NOT EXISTS classification_assessment (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id     bigint NOT NULL REFERENCES entity(id),
  regime        text NOT NULL REFERENCES classification_regime(code),
  answers       jsonb NOT NULL,
  concluded     text NOT NULL,
  rationale     text,
  assessed_by   text NOT NULL DEFAULT current_app_user(),
  assessed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_class_assess ON classification_assessment (entity_id, regime, assessed_at DESC);

CREATE OR REPLACE FUNCTION classification_questions(p_regime text)
RETURNS TABLE(seq integer, code text, question text, help text)
LANGUAGE sql STABLE AS $$
  SELECT q.seq, q.code, q.question, q.help FROM classification_question q
   WHERE q.regime = upper(p_regime) ORDER BY q.seq;
$$;

-- Record an assessment: the answers, the conclusion, and why. Setting the
-- classification itself goes through entity_classification_set, which
-- validates it — this records the working.
CREATE OR REPLACE FUNCTION classification_assess(p_entity bigint, p_regime text,
                                                 p_answers jsonb,
                                                 p_concluded text,
                                                 p_rationale text DEFAULT NULL)
RETURNS classification_assessment
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r classification_assessment; nm text;
BEGIN
  SELECT name INTO nm FROM entity WHERE id = p_entity;
  IF nm IS NULL THEN RAISE EXCEPTION 'There is no entity with id %.', p_entity; END IF;

  IF NOT EXISTS (SELECT 1 FROM entity_classification_type
                  WHERE regime = upper(p_regime) AND code = upper(p_concluded)) THEN
    RAISE EXCEPTION '% is not a % classification.', p_concluded, upper(p_regime);
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION
      'An assessment needs the answers, not just the conclusion. A classification '
      'with no record of how it was reached cannot be defended three years later '
      'when the person who made it has left.';
  END IF;

  INSERT INTO classification_assessment (entity_id, regime, answers, concluded, rationale)
  VALUES (p_entity, upper(p_regime), p_answers, upper(p_concluded), p_rationale)
  RETURNING * INTO r;

  -- Apply it too, through the validating setter.
  IF upper(p_regime) = 'FATCA' THEN
    PERFORM entity_classification_set(p_entity, upper(p_concluded), NULL, NULL);
  ELSE
    PERFORM entity_classification_set(p_entity, NULL, upper(p_concluded), NULL);
  END IF;

  PERFORM ea_audit(p_entity, 'entity', p_entity, 'classification assessed',
                   upper(p_regime) || ' → ' || upper(p_concluded));
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION classification_history(p_entity bigint)
RETURNS TABLE(regime text, concluded text, classification text, rationale text,
              assessed_by text, assessed_at timestamptz, answers jsonb)
LANGUAGE sql STABLE AS $$
  SELECT a.regime, a.concluded, t.name, a.rationale, a.assessed_by, a.assessed_at, a.answers
    FROM classification_assessment a
    LEFT JOIN entity_classification_type t
           ON t.regime = a.regime AND t.code = a.concluded
   WHERE a.entity_id = p_entity
   ORDER BY a.assessed_at DESC;
$$;

-- ── PART TWO: THE REPORTING EXTRACT ────────────────────────────────────────
--
-- One row per reportable account, with the holder and — where the holder is a
-- passive NFE — one row per controlling person. This is the content of a FATCA
-- or CRS return whatever file format the portal wants.
--
-- It reports what is MISSING as well as what is present, because a return
-- rejected by a portal for a missing TIN is found out days later, and a return
-- accepted with a wrong one is found out considerably later than that.

CREATE OR REPLACE FUNCTION fatca_crs_extract(p_regime text,
                                             p_period_end date,
                                             p_jurisdiction text DEFAULT NULL)
RETURNS TABLE(
  entity_id        bigint,
  entity_name      text,
  entity_juris     text,
  classification   text,
  class_name       text,
  reports          boolean,
  look_through     boolean,
  account_bank     text,
  account_number   text,
  account_ccy      text,
  account_balance  numeric,
  balance_date     date,
  account_closed   boolean,
  person_role      text,
  person_name      text,
  person_tin       text,
  person_residence text,
  person_dob       date,
  missing          text)
LANGUAGE sql STABLE AS $$
  WITH cls AS (
    SELECT e.id, e.name, e.location_code,
           CASE WHEN upper(p_regime) = 'FATCA' THEN p.fatca_class ELSE p.crs_class END AS code
      FROM entity e LEFT JOIN entity_profile p ON p.entity_id = e.id
     WHERE e.entity_class = 'client'
       AND (p_jurisdiction IS NULL OR e.location_code = p_jurisdiction)
  )
  SELECT c.id, c.name, c.location_code, c.code, t.name, t.reportable,
         coalesce(t.code IN ('PNFFE','DRNFFE','PNFE'), false),
         b.bank, b.number, b.ccy, b.balance, b.balance_date,
         b.closed_date IS NOT NULL AND b.closed_date <= p_period_end,
         CASE WHEN u.id IS NULL THEN 'Account holder' ELSE 'Controlling person' END,
         coalesce(u.name, c.name), u.tin, u.tax_residence, u.dob,
         nullif(concat_ws('; ',
           CASE WHEN c.code IS NULL THEN 'no ' || upper(p_regime) || ' classification' END,
           CASE WHEN b.id IS NULL THEN 'no bank account recorded' END,
           CASE WHEN b.balance IS NULL THEN 'no balance recorded' END,
           CASE WHEN b.balance_date IS NULL OR b.balance_date > p_period_end
                THEN 'balance is not as at the period end' END,
           CASE WHEN u.id IS NOT NULL AND coalesce(trim(u.tin), '') = ''
                THEN 'controlling person has no TIN' END,
           CASE WHEN u.id IS NOT NULL AND coalesce(trim(u.tax_residence), '') = ''
                THEN 'controlling person has no tax residence' END,
           CASE WHEN coalesce(t.code IN ('PNFFE','DRNFFE','PNFE'), false)
                 AND u.id IS NULL
                THEN 'looks through to controlling persons and none are recorded' END
         ), '')
    FROM cls c
    LEFT JOIN entity_classification_type t
           ON t.regime = upper(p_regime) AND t.code = c.code
    LEFT JOIN entity_bank b ON b.entity_id = c.id
    LEFT JOIN entity_ubo  u ON u.entity_id = c.id
         AND coalesce(t.code IN ('PNFFE','DRNFFE','PNFE'), false)
   ORDER BY c.name, b.bank, u.name;
$$;

-- Whether the return could be filed at all, before anybody tries.
CREATE OR REPLACE FUNCTION fatca_crs_readiness(p_regime text, p_period_end date)
RETURNS TABLE(entities bigint, reportable bigint, rows_with_gaps bigint, first_gaps text)
LANGUAGE sql STABLE AS $$
  SELECT count(DISTINCT entity_id),
         count(DISTINCT entity_id) FILTER (WHERE reports),
         count(*) FILTER (WHERE missing IS NOT NULL),
         string_agg(DISTINCT missing, ' | ' ORDER BY missing)
    FROM fatca_crs_extract(p_regime, p_period_end, NULL);
$$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('classification_questions','classification_assess',
                                'classification_history','fatca_crs_extract',
                                'fatca_crs_readiness')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON TABLE classification_assessment FROM PUBLIC, anon;
GRANT SELECT ON TABLE classification_question TO authenticated;
