-- =====================================================================
-- AFFINITY CORE — INVOICE JSON (integration layer, 030)
-- Assembles a complete invoice for the front-end / PDF template from the
-- billing tables. The firm's own letterhead (per jurisdiction) is supplied
-- by the front-end; this returns only ledger-sourced data.
--   SELECT get_invoice_json(:invoice_id);
-- =====================================================================

CREATE OR REPLACE FUNCTION get_invoice_json(p_invoice_id bigint)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
      'invoice', jsonb_build_object(
          'id', i.id,
          'number', 'INV-'||lpad(i.id::text,6,'0'),
          'invoice_date', i.invoice_date,
          'ccy', i.ccy,
          'status', i.status,
          'settled', i.settled,
          'net_total', i.net_total,
          'vat_total', i.vat_total,
          'gross_total', i.gross_total,
          'outstanding', i.outstanding
      ),
      'bill_to', (SELECT jsonb_build_object('name', e.name, 'code', e.company_code, 'jurisdiction', e.location_code)
                  FROM entity e WHERE e.id = i.entity_id),
      'jurisdiction', (SELECT location_code FROM entity e WHERE e.id = i.entity_id),
      'bank', (SELECT jsonb_build_object('name', b.name, 'iban', b.iban, 'ccy', b.ccy)
               FROM bank_account b WHERE b.id = i.bank_account_id),
      'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'description', l.description, 'net', l.net, 'vat', l.vat, 'gross', l.gross) ORDER BY l.id)
                 FROM invoice_line l WHERE l.invoice_id = i.id), '[]')
    )
    FROM invoice i WHERE i.id = p_invoice_id;
$$;
