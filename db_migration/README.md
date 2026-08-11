# Affinity Core — Database Migration Bundle

Self-contained, ordered rebuild of the **entire** Affinity Core database (engine + all modules).
**Verified: builds clean from scratch, 69/69 files, zero errors.**

## Contents
- `sql/` — 69 SQL files, numbered in dependency order (01…69). Run in filename order.
- `restore.sh` — applies roles + pgcrypto + every file in order (Azure Postgres or any Postgres 14+).
- `backup.sh` — pg_dump safety net; run before any change.

## Usage (target: Azure Database for PostgreSQL Flexible Server)
```bash
export PGHOST=<server>.postgres.database.azure.com PGDATABASE=affinity PGUSER=<admin> PGPASSWORD=<pw>
./backup.sh      # only if the DB already has data
./restore.sh     # builds the whole schema + seed
```

## What this proves / fixes
- The engine (49 files, db/001–051 on the `accounting-engine` branch) + 20 module files apply cleanly in one ordered pass.
- Ordering fix baked in: `003_billing` (creates `vat_code`) runs **before** `003a_seed_reference` (seeds currencies, VAT codes, and the **location codes** every entity FK depends on). Getting this wrong cascades into ~7 downstream failures.
- The legacy `db_eadmin/002_seed.sql` (old `A00001` placeholder entities) is **excluded** — superseded by `003_seed_clients.sql`.

## Notes for Azure
- Role names `anon` / `authenticated` / `service_role` are kept so the existing SECURITY DEFINER grants apply unchanged. On Azure with PostgREST + Entra, these map to the JWT `role` claim; with a custom API they're harmless.
- No Supabase-specific extensions are required beyond `pgcrypto`.
- After restore, point the app's data layer at the new host (one connection change) — see the Azure Migration Plan.
