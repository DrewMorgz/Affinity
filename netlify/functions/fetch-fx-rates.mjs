// netlify/functions/fetch-fx-rates.mjs
//
// Affinity Core — daily FX rate fetch
// Pulls ECB reference rates (via Frankfurter, free, no API key) for the
// currencies the accounting engine deals in and upserts them into fx_rate
// through the engine's own SQL entrypoint:
//
//     SELECT upsert_fx_rates(:rates_json, 'frankfurter', false);
//
// That function registers any unseen currency, upserts on
// (from_ccy,to_ccy,rate_date,rate_type), and writes an audit_log row.
// fx_lookup() / FX revaluation / multi-currency AR/AP then read these rows.
//
// Env required:
//   SUPABASE_URL                 e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    service role (server-side only)
//   FX_CURRENCIES                optional, default "GBP,EUR,USD"
//   FX_PROVIDER_BASE             optional, default "https://api.frankfurter.app"
//
// Schedule: weekdays at 17:00 UTC (after the ECB ~16:00 CET publication).

import { createClient } from "@supabase/supabase-js";

const PROVIDER = process.env.FX_PROVIDER_BASE || "https://api.frankfurter.app";

// ---- pure helpers (exported for testing) ---------------------------------

// turn one provider response into directed pairs base -> each symbol
export function buildPairs(base, date, rates) {
  return Object.entries(rates).map(([to, rate]) => ({
    from_ccy: base,
    to_ccy: to,
    rate,
    rate_date: date,
    rate_type: "closing",
  }));
}

// fetch every directed pair across the currency set (base by base)
export async function collectRates(currencies, fetcher) {
  const pairs = [];
  for (const base of currencies) {
    const symbols = currencies.filter((c) => c !== base);
    if (symbols.length === 0) continue;
    const url = `${PROVIDER}/latest?base=${base}&symbols=${symbols.join(",")}`;
    const json = await fetcher(url);
    if (!json || !json.rates || !json.date) {
      throw new Error(`Bad provider response for base ${base}`);
    }
    pairs.push(...buildPairs(base, json.date, json.rates));
  }
  return pairs;
}

const jsonFetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Provider ${url} -> HTTP ${res.status}`);
  return res.json();
};

// ---- Netlify handler -----------------------------------------------------

export default async function handler() {
  const currencies = (process.env.FX_CURRENCIES || "GBP,EUR,USD")
    .split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ ok: false, error: "Supabase env not configured" }),
      { status: 500, headers: { "content-type": "application/json" } });
  }

  try {
    const pairs = await collectRates(currencies, jsonFetcher);
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc("upsert_fx_rates", {
      p_rates: pairs, p_source: "frankfurter", p_with_inverse: false,
    });
    if (error) throw error;

    const rateDate = pairs[0]?.rate_date;
    return new Response(JSON.stringify({
      ok: true, rate_date: rateDate, currencies, pairs_sent: pairs.length, rows_upserted: data,
    }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message || e) }),
      { status: 502, headers: { "content-type": "application/json" } });
  }
}

export const config = { schedule: "0 17 * * 1-5" };
