-- 101 — FATCA and CRS classification as reference data, not free text
--
-- REQUESTED: "Can we add a workflow in order to find the classifications for
-- FATCA and CRS."
--
-- Today entity_profile carries fatca_class, crs_class and giin as free text.
-- Anyone can type anything, nothing validates it, and two administrators will
-- write the same classification three different ways — "Passive NFFE",
-- "passive nffe", "Passive NFE" — which are not the same thing and one of which
-- is the CRS term rather than the FATCA one.
--
-- The classification drives the reporting obligation. Getting it wrong means
-- reporting the wrong thing, or nothing at all, and the error surfaces at the
-- point a regulator asks rather than at the point it is made.
--
-- WHAT THIS ADDS. The valid classifications for each regime, with what each
-- one means for reporting, and a setter that refuses anything not on the list.
-- Not a decision engine: classifying an entity is a judgement a person makes
-- with the structure in front of them, and a wizard that appears to make it for
-- them would be worse than a list. What the system can usefully do is stop the
-- answer being written down wrong, and say what follows from it.

CREATE TABLE IF NOT EXISTS classification_regime (
  code text PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO classification_regime (code, name) VALUES
  ('FATCA', 'FATCA — US Foreign Account Tax Compliance Act'),
  ('CRS',   'CRS — OECD Common Reporting Standard')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS entity_classification_type (
  regime        text NOT NULL REFERENCES classification_regime(code),
  code          text NOT NULL,
  name          text NOT NULL,
  category      text NOT NULL,          -- Financial Institution or NFFE/NFE
  reportable    boolean NOT NULL,       -- does this classification report?
  needs_giin    boolean NOT NULL DEFAULT false,
  note          text,
  sort_order    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (regime, code)
);

-- ── FATCA ──────────────────────────────────────────────────────────────────
INSERT INTO entity_classification_type
  (regime, code, name, category, reportable, needs_giin, note, sort_order) VALUES
 ('FATCA','RFI','Reporting Financial Institution','Financial Institution',true,true,
  'Registers with the IRS, holds a GIIN, and reports US reportable accounts annually.',10),
 ('FATCA','RDC','Registered Deemed-Compliant FI','Financial Institution',false,true,
  'Registers and holds a GIIN but does not report, provided it keeps meeting the conditions of its category.',20),
 ('FATCA','CDC','Certified Deemed-Compliant FI','Financial Institution',false,false,
  'Self-certifies rather than registering. No GIIN. The conditions are narrow and worth re-checking annually.',30),
 ('FATCA','TDT','Trustee-Documented Trust','Financial Institution',false,false,
  'The trust is an FI but the TRUSTEE reports on its behalf. Common across Affinity trusts — the reporting obligation sits with the trustee company, not the trust.',40),
 ('FATCA','SPON','Sponsored Investment Entity','Financial Institution',false,false,
  'A sponsoring entity reports for it. The sponsor needs a GIIN; this entity may not.',50),
 ('FATCA','ODFI','Owner-Documented FI','Financial Institution',false,false,
  'Only available where a designated withholding agent agrees to report. Depends on that agreement remaining in place.',60),
 ('FATCA','EBO','Exempt Beneficial Owner','Financial Institution',false,false,
  'Governments, international organisations, central banks, certain pension funds.',70),
 ('FATCA','ANFFE','Active NFFE','NFFE',false,false,
  'Not a financial institution, and less than 50% of income is passive. Controlling persons are not reported.',80),
 ('FATCA','PNFFE','Passive NFFE','NFFE',true,false,
  'Not a financial institution, and mostly passive income. CONTROLLING PERSONS ARE LOOKED THROUGH AND REPORTED where they are US persons. This is the classification most holding companies land on.',90),
 ('FATCA','DRNFFE','Direct Reporting NFFE','NFFE',true,true,
  'Elects to report its own substantial US owners directly to the IRS. Needs a GIIN.',100),
 ('FATCA','XNFFE','Excepted NFFE','NFFE',false,false,
  'Publicly traded corporations and their affiliates, and certain start-ups and entities in liquidation.',110)
ON CONFLICT (regime, code) DO UPDATE SET name = excluded.name, note = excluded.note,
  reportable = excluded.reportable, needs_giin = excluded.needs_giin;

-- ── CRS ────────────────────────────────────────────────────────────────────
INSERT INTO entity_classification_type
  (regime, code, name, category, reportable, needs_giin, note, sort_order) VALUES
 ('CRS','CUST','Custodial Institution','Financial Institution',true,false,
  'Holds financial assets for the account of others as a substantial part of its business.',10),
 ('CRS','DEP','Depository Institution','Financial Institution',true,false,
  'Accepts deposits in the ordinary course of a banking business.',20),
 ('CRS','INVA','Investment Entity — managed by another FI','Financial Institution',true,false,
  'Primarily conducts investment activity AND is managed by another financial institution. Most professionally administered trusts and holding structures fall here — which makes the trust itself an FI with reporting obligations.',30),
 ('CRS','INVB','Investment Entity — trading, managing, investing','Financial Institution',true,false,
  'Conducts the activity itself as a business for customers.',40),
 ('CRS','INSUR','Specified Insurance Company','Financial Institution',true,false,
  'Issues or is obliged to make payments on cash value insurance or annuity contracts.',50),
 ('CRS','NRFI','Non-Reporting Financial Institution','Financial Institution',false,false,
  'Governmental entities, international organisations, central banks, broad participation retirement funds, exempt collective investment vehicles, trustee-documented trusts.',60),
 ('CRS','ANFE','Active NFE','NFE',false,false,
  'Less than 50% passive income and less than 50% passive assets, or a listed company, governmental entity, holding company of a non-financial group, start-up, or entity in liquidation. Controlling persons are not reported.',70),
 ('CRS','PNFE','Passive NFE','NFE',true,false,
  'Any NFE that is not active, and any investment entity managed by another FI that sits in a non-participating jurisdiction. CONTROLLING PERSONS ARE LOOKED THROUGH AND REPORTED.',80)
ON CONFLICT (regime, code) DO UPDATE SET name = excluded.name, note = excluded.note,
  reportable = excluded.reportable, needs_giin = excluded.needs_giin;

-- ── Reading them ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION classification_types(p_regime text DEFAULT NULL)
RETURNS TABLE(regime text, code text, name text, category text,
              reportable boolean, needs_giin boolean, note text)
LANGUAGE sql STABLE AS $$
  SELECT t.regime, t.code, t.name, t.category, t.reportable, t.needs_giin, t.note
    FROM entity_classification_type t
   WHERE p_regime IS NULL OR t.regime = upper(p_regime)
   ORDER BY t.regime, t.sort_order;
$$;

-- ── Setting a classification, validated ────────────────────────────────────
CREATE OR REPLACE FUNCTION entity_classification_set(p_entity bigint,
                                                     p_fatca text DEFAULT NULL,
                                                     p_crs text DEFAULT NULL,
                                                     p_giin text DEFAULT NULL)
RETURNS entity_profile
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      entity_profile;
  f      entity_classification_type;
  c      entity_classification_type;
  nm     text;
BEGIN
  SELECT name INTO nm FROM entity WHERE id = p_entity;
  IF nm IS NULL THEN
    RAISE EXCEPTION 'There is no entity with id %.', p_entity;
  END IF;

  IF p_fatca IS NOT NULL THEN
    SELECT * INTO f FROM entity_classification_type
     WHERE regime = 'FATCA' AND code = upper(p_fatca);
    IF NOT FOUND THEN
      RAISE EXCEPTION
        '% is not a FATCA classification. The valid codes are on the '
        'classification list — free text was the old behaviour and it produced '
        'three spellings of the same thing, one of which was the CRS term.',
        p_fatca;
    END IF;
    IF f.needs_giin AND coalesce(trim(p_giin), '') = '' THEN
      RAISE EXCEPTION
        '% requires a GIIN and none was given. An entity classified this way is '
        'registered with the IRS, and the GIIN is what the registration is '
        'evidenced by.', f.name;
    END IF;
  END IF;

  IF p_crs IS NOT NULL THEN
    SELECT * INTO c FROM entity_classification_type
     WHERE regime = 'CRS' AND code = upper(p_crs);
    IF NOT FOUND THEN
      RAISE EXCEPTION '% is not a CRS classification.', p_crs;
    END IF;
  END IF;

  UPDATE entity_profile
     SET fatca_class = coalesce(upper(p_fatca), fatca_class),
         crs_class   = coalesce(upper(p_crs), crs_class),
         giin        = coalesce(nullif(trim(p_giin), ''), giin)
   WHERE entity_id = p_entity
   RETURNING * INTO r;

  IF NOT FOUND THEN
    INSERT INTO entity_profile (entity_id, fatca_class, crs_class, giin)
    VALUES (p_entity, upper(p_fatca), upper(p_crs), nullif(trim(p_giin), ''))
    RETURNING * INTO r;
  END IF;

  PERFORM ea_audit(p_entity, 'entity', p_entity, 'classification set',
    concat_ws(' · ', nullif('FATCA ' || coalesce(f.name, ''), 'FATCA '),
                     nullif('CRS ' || coalesce(c.name, ''), 'CRS ')));
  RETURN r;
END;
$$;

-- ── What the classification means, per entity ──────────────────────────────
-- The useful question is not "what is it classified as" but "what follows from
-- that" — whether it reports, whether controlling persons are looked through,
-- and whether anything is missing.
CREATE OR REPLACE FUNCTION classification_status(p_entity bigint DEFAULT NULL)
RETURNS TABLE(entity_id bigint, entity_name text, jurisdiction text,
              fatca_code text, fatca_name text, fatca_reports boolean,
              crs_code text, crs_name text, crs_reports boolean,
              giin text, look_through boolean, gap text)
LANGUAGE sql STABLE AS $$
  SELECT e.id, e.name, e.location_code,
         p.fatca_class, f.name, f.reportable,
         p.crs_class,  c.name, c.reportable,
         p.giin,
         coalesce(p.fatca_class IN ('PNFFE','DRNFFE'), false)
           OR coalesce(p.crs_class = 'PNFE', false)                     AS look_through,
         nullif(concat_ws('; ',
           CASE WHEN p.fatca_class IS NULL THEN 'no FATCA classification' END,
           CASE WHEN p.crs_class   IS NULL THEN 'no CRS classification' END,
           CASE WHEN f.needs_giin AND coalesce(trim(p.giin),'') = ''
                THEN 'classified as ' || f.name || ' but no GIIN recorded' END,
           CASE WHEN (coalesce(p.fatca_class,'') IN ('PNFFE','DRNFFE')
                      OR coalesce(p.crs_class,'') = 'PNFE')
                 AND NOT EXISTS (SELECT 1 FROM entity_ubo u WHERE u.entity_id = e.id)
                THEN 'controlling persons are reportable and none are recorded' END
         ), '') AS gap
    FROM entity e
    LEFT JOIN entity_profile p ON p.entity_id = e.id
    LEFT JOIN entity_classification_type f ON f.regime='FATCA' AND f.code = p.fatca_class
    LEFT JOIN entity_classification_type c ON c.regime='CRS'   AND c.code = p.crs_class
   WHERE (p_entity IS NULL OR e.id = p_entity)
     AND e.entity_class = 'client'
   ORDER BY e.name;
$$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('classification_types','entity_classification_set',
                                'classification_status')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;

REVOKE ALL ON TABLE entity_classification_type, classification_regime FROM PUBLIC, anon;
GRANT SELECT ON TABLE entity_classification_type, classification_regime TO authenticated;
