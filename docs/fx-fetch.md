# FX rate fetch (Netlify scheduled function)

Pulls ECB reference rates (via [Frankfurter](https://www.frankfurter.app), free, no API key) for the
currencies the accounting engine uses and upserts them into `fx_rate` through the engine's own
`upsert_fx_rates(jsonb, source, with_inverse)` entrypoint. `fx_lookup()`, FX revaluation (008) and
multi-currency AR/AP (009/010) read those rows.

## Files
- `netlify/functions/fetch-fx-rates.mjs` — the function (Netlify Functions v2, ESM).

## Environment variables (Netlify site settings)
| var | required | default | notes |
|-----|----------|---------|-------|
| `SUPABASE_URL` | yes | — | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | — | server-side only; never expose to the client |
| `FX_CURRENCIES` | no | `GBP,EUR,USD` | comma-separated ISO codes; every directed pair is fetched |
| `FX_PROVIDER_BASE` | no | `https://api.frankfurter.app` | swap provider if needed |

## Schedule
Runs weekdays at 17:00 UTC (after the ECB ~16:00 CET publication), set via
`export const config = { schedule: "0 17 * * 1-5" }` in the function. No `netlify.toml` entry needed.

## Manual run / test
Trigger on demand once deployed:
```
curl -X POST https://<site>.netlify.app/.netlify/functions/fetch-fx-rates
```
Returns `{ ok, rate_date, currencies, pairs_sent, rows_upserted }`.

## Notes
- `upsert_fx_rates` registers any unseen currency, upserts on `(from_ccy,to_ccy,rate_date,rate_type)`,
  and writes an `audit_log` row — so re-runs are idempotent.
- `with_inverse` is left `false` here because the function already fetches both directions
  (base-by-base), giving exact provider rates rather than computed reciprocals.
