#!/usr/bin/env bash
# =============================================================================
# 01 — EXPORT EVERYTHING FROM SUPABASE
#
# Produces four separate dumps rather than one, because they restore into
# different places and have different risks:
#
#   roles.sql    the database roles (anon, authenticated, service_role). Must
#                exist BEFORE the schema, or every GRANT in it fails.
#   schema.sql   tables, functions, triggers, policies, grants — no data.
#   data.sql     the data only, so it can be restored, checked, or withheld
#                independently of the structure.
#   auth.sql     the auth schema, which holds the Entra identities. Separate
#                because it is the piece most likely to need special handling,
#                and because it contains personal data that should not be
#                casually copied around.
#
# Run this from a machine that can reach the Supabase database directly. You
# need the DATABASE connection string, not the API URL — find it in
# Supabase → Settings → Database → Connection string → URI.
#
# Usage:
#   export SUPABASE_DB_URL='postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres'
#   ./01_export_from_supabase.sh
# =============================================================================

set -euo pipefail

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "ERROR: SUPABASE_DB_URL is not set."
  echo
  echo "Get it from Supabase → Settings → Database → Connection string → URI."
  echo "It looks like:"
  echo "  postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
  echo
  echo "Then:  export SUPABASE_DB_URL='...'"
  exit 1
fi

STAMP=$(date -u +%Y%m%d-%H%M%SZ)
OUT="export-${STAMP}"
mkdir -p "$OUT"

echo "Exporting to ${OUT}/"
echo

# ── Roles ───────────────────────────────────────────────────────────────────
# Supabase's roles are referenced by 83 GRANT statements. Without them the
# schema restore fails on the first grant, which is a confusing place to
# discover the problem.
#
# This is NOT only the built-in roles. A trial migration surfaced
# `role "affinity_app" does not exist` — a role created inside db/044 and
# granted to in three files, which pg_dumpall's filtered output dropped. So
# the query below takes every non-superuser role that the schema actually
# depends on, rather than a list someone maintained by hand.
echo "1/5  roles"
# Generate CREATE ROLE for every role the schema grants to, whether it came
# from Supabase or from our own migrations.
psql "$SUPABASE_DB_URL" -At -o "${OUT}/roles.sql" <<'SQL'
SELECT 'DO $$ BEGIN CREATE ROLE ' || quote_ident(rolname) ||
       ' NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;'
  FROM pg_roles
 WHERE NOT rolsuper
   AND rolname NOT LIKE 'pg\_%'
   AND rolname NOT IN ('supabase_admin','supabase_auth_admin',
                       'supabase_storage_admin','supabase_read_only_user',
                       'dashboard_user','pgbouncer','authenticator')
 ORDER BY rolname;
SQL
echo "     $(wc -l < "${OUT}/roles.sql") lines"

# ── Schema ──────────────────────────────────────────────────────────────────
# public only. Supabase's own schemas (storage, realtime, vault) are the
# platform's, not ours, and are replaced by the self-hosted equivalents.
echo "2/5  schema (public)"
pg_dump "$SUPABASE_DB_URL" \
  --schema-only \
  --schema=public \
  --no-owner \
  --no-privileges=false \
  --no-comments \
  > "${OUT}/schema.sql"
echo "     $(wc -l < "${OUT}/schema.sql") lines"

# ── Data ────────────────────────────────────────────────────────────────────
echo "3/5  data (public)"
pg_dump "$SUPABASE_DB_URL" \
  --data-only \
  --schema=public \
  --no-owner \
  --disable-triggers \
  > "${OUT}/data.sql"
echo "     $(wc -l < "${OUT}/data.sql") lines"

# ── Auth ────────────────────────────────────────────────────────────────────
# The Entra identities. Held separately: it is personal data, and it is the
# part most likely to need care on restore.
echo "4/5  auth schema (Entra identities)"
pg_dump "$SUPABASE_DB_URL" \
  --schema=auth \
  --no-owner \
  > "${OUT}/auth.sql" 2>/dev/null || {
    echo "     WARNING: could not export the auth schema."
    echo "     Supabase restricts direct access to it on some plans."
    echo "     Users can be re-created by signing in again — Entra is the source"
    echo "     of truth, not this database — but note it before cutting over."
    : > "${OUT}/auth.sql"
  }
echo "     $(wc -l < "${OUT}/auth.sql") lines"

# ── A manifest, so the restore can be checked against it ────────────────────
echo "5/5  manifest"
psql "$SUPABASE_DB_URL" -At -o "${OUT}/manifest.txt" <<'SQL' 2>/dev/null || true
SELECT 'exported_at='   || now();
SELECT 'tables='        || count(*) FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE';
SELECT 'functions='     || count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
SELECT 'policies='      || count(*) FROM pg_policies WHERE schemaname='public';
SELECT 'entities='      || count(*) FROM entity;
SELECT 'journals='      || count(*) FROM journal;
SELECT 'journal_lines=' || count(*) FROM journal_line;
SELECT 'row_counts:';
SELECT '  ' || relname || '=' || n_live_tup
  FROM pg_stat_user_tables WHERE schemaname='public' AND n_live_tup > 0
 ORDER BY relname;
SQL

echo
echo "Done. ${OUT}/ contains:"
ls -la "$OUT"
echo
echo "NEXT: run ./02_verify_export.sh ${OUT}"
echo
echo "Treat this directory as client data. It contains beneficial ownership"
echo "records and CDD material. Do not leave it on a laptop or in cloud sync."
