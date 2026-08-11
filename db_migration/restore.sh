#!/usr/bin/env bash
# Affinity Core — full database restore (Azure Database for PostgreSQL, or any Postgres 14+).
# Applies the entire schema + seed in the proven order. Verified to build clean from scratch (69/69).
set -euo pipefail
: "${PGHOST:?set PGHOST}"; : "${PGDATABASE:?set PGDATABASE}"; : "${PGUSER:?set PGUSER}"
# 1) roles the SECURITY DEFINER functions grant to (Supabase-compatible; harmless on Azure)
psql -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN
  CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;" || true
psql -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;" || true
psql -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;" || true
psql -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
# 2) apply every file in order
for f in sql/*.sql; do
  echo ">> $f"
  psql -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "Affinity Core database restored."
