#!/usr/bin/env bash
# Safety-net backup before any migration/change. Produces a timestamped, restorable dump.
set -euo pipefail
: "${PGHOST:?}"; : "${PGDATABASE:?}"; : "${PGUSER:?}"
ts=$(date +%Y%m%d-%H%M%S)
pg_dump --no-owner --no-privileges -Fc -f "affinity-${PGDATABASE}-${ts}.dump"
echo "Wrote affinity-${PGDATABASE}-${ts}.dump  (restore with: pg_restore --no-owner -d <db> <file>)"
