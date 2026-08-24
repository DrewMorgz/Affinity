-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  FX RATE UPLOAD  (013)
-- Bulk, idempotent ingest of exchange rates. The app layer does the file
-- parsing / API call (a Netlify Function reads a CSV or pulls a provider,
-- builds the JSON, and calls this via Supabase RPC). Re-loading the same
-- date/pair updates in place rather than duplicating.
--
-- CSV the app maps to the JSON below (one row per rate):
--   from_ccy,to_ccy,rate,rate_date,rate_type
--   EUR,GBP,0.8600,2026-08-31,closing
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_fx_rates(
    p_rates jsonb, p_source text DEFAULT 'import', p_with_inverse boolean DEFAULT false)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE r jsonb; v_count int := 0;
        v_from char(3); v_to char(3); v_rate numeric(20,10); v_date date; v_type text;
BEGIN
    FOR r IN SELECT * FROM jsonb_array_elements(p_rates) LOOP
        v_from := upper(r->>'from_ccy');
        v_to   := upper(r->>'to_ccy');
        v_rate := (r->>'rate')::numeric;
        v_date := (r->>'rate_date')::date;
        v_type := COALESCE(r->>'rate_type','closing');
        IF v_rate IS NULL OR v_rate <= 0 THEN
            RAISE EXCEPTION 'Invalid rate % for %->% on %', v_rate, v_from, v_to, v_date;
        END IF;

        -- register currencies we haven't seen, so an import never fails on a new code
        INSERT INTO currency(code,name) VALUES (v_from, v_from) ON CONFLICT DO NOTHING;
        INSERT INTO currency(code,name) VALUES (v_to,   v_to)   ON CONFLICT DO NOTHING;

        INSERT INTO fx_rate(from_ccy,to_ccy,rate,rate_date,rate_type,source)
        VALUES (v_from,v_to,v_rate,v_date,v_type,p_source)
        ON CONFLICT (from_ccy,to_ccy,rate_date,rate_type)
        DO UPDATE SET rate = excluded.rate, source = excluded.source;
        v_count := v_count + 1;

        IF p_with_inverse AND v_from <> v_to THEN
            INSERT INTO fx_rate(from_ccy,to_ccy,rate,rate_date,rate_type,source)
            VALUES (v_to,v_from, round(1.0/v_rate,10), v_date, v_type, p_source||':inverse')
            ON CONFLICT (from_ccy,to_ccy,rate_date,rate_type)
            DO UPDATE SET rate = excluded.rate, source = excluded.source;
            v_count := v_count + 1;
        END IF;
    END LOOP;

    INSERT INTO audit_log(actor, action, object_type, object_id, after_state)
    VALUES (p_source, 'rate_upload', 'fx_rate', 'batch',
            jsonb_build_object('rows', v_count, 'with_inverse', p_with_inverse));
    RETURN v_count;
END $$;


-- latest rate per pair + type (handy for the app / spot lookups)
CREATE OR REPLACE VIEW v_fx_rate_latest AS
SELECT DISTINCT ON (from_ccy, to_ccy, rate_type)
       from_ccy, to_ccy, rate_type, rate, rate_date, source
FROM fx_rate
ORDER BY from_ccy, to_ccy, rate_type, rate_date DESC, id DESC;
