#!/usr/bin/env bash
#
# AFFINITY CORE — RECOVERY BUNDLE
#
# Produces a single archive containing everything needed to rebuild Core from
# nothing, on any host, without GitHub, Supabase or Azure.
#
# ── WHY THIS EXISTS, AND WHAT IT ACTUALLY PROTECTS AGAINST ──────────
#
# The three services are not equal risks, and it is worth being precise rather
# than treating "what if it goes down" as one question.
#
#   GitHub down          The live site is unaffected — it is already built and
#                        served by Azure. You cannot deploy a change until it
#                        returns. Inconvenient, not an outage.
#
#   Azure down           Total outage. Nobody can reach Core. The data is safe
#                        in Supabase and the code is safe in GitHub, so the fix
#                        is to deploy the same build elsewhere. Netlify still
#                        has a working deployment, which is worth keeping for
#                        exactly this reason.
#
#   Supabase down        Total outage AND the one that matters. Every record
#                        lives there: client registers, beneficial ownership,
#                        client money, journals. A long outage stops work; a
#                        data loss event is existential.
#
# So the real question is not "what if a service goes down" but "what happens
# if Supabase loses our data". This bundle answers that: a complete schema and
# data export that can be restored onto any PostgreSQL server.
#
# The second risk is subtler. Every one of those accounts is tied to Andy. A
# recovery bundle nobody else can produce, stored somewhere nobody else can
# reach, is not a backup. See the README this generates.
#
# ── USAGE ───────────────────────────────────────────────────────────
#
#   export SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
#   ./recovery_bundle.sh
#
# Produces: affinity-core-recovery-YYYY-MM-DD.tar.gz
#
set -euo pipefail

STAMP="$(date +%Y-%m-%d)"
OUT="affinity-core-recovery-${STAMP}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Affinity Core recovery bundle — ${STAMP}"
echo "Repository root: ${ROOT}"
echo

rm -rf "/tmp/${OUT}"
mkdir -p "/tmp/${OUT}"/{code,database,docs}

# ─────────────────────────────────────────────────────────────────────
# 1. THE CODE
# ─────────────────────────────────────────────────────────────────────
# A git bundle rather than a copy of the files: it carries the entire history,
# every branch and every commit message. Restoring it gives back a working
# repository, not just the current state — so the reasoning behind each change
# survives, which for a compliance system is part of the record.
echo "[1/5] Code, with full history"
git -C "${ROOT}" bundle create "/tmp/${OUT}/code/affinity-core.bundle" --all
echo "      $(du -h "/tmp/${OUT}/code/affinity-core.bundle" | cut -f1) — restore with: git clone affinity-core.bundle"

# Also a plain snapshot, because a git bundle needs git and someone recovering
# under pressure may not have it to hand.
git -C "${ROOT}" archive --format=tar.gz -o "/tmp/${OUT}/code/affinity-core-snapshot.tar.gz" HEAD
echo "      $(du -h "/tmp/${OUT}/code/affinity-core-snapshot.tar.gz" | cut -f1) — plain snapshot, no git needed"

# ─────────────────────────────────────────────────────────────────────
# 2. THE DATABASE
# ─────────────────────────────────────────────────────────────────────
echo "[2/5] Database"
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "      SKIPPED — SUPABASE_DB_URL is not set."
  echo "      This is the part that matters most. A bundle without it protects"
  echo "      the code and not the client records. Set it and run again."
  cat > "/tmp/${OUT}/database/MISSING.txt" <<'EOF'
NO DATABASE EXPORT IN THIS BUNDLE.

SUPABASE_DB_URL was not set when it was produced, so this contains the code
only. That protects against losing the repository. It does NOT protect against
losing the client records, the beneficial ownership registers, the client money
ledger or the journals.

Re-run with the connection string set:

  export SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
EOF
else
  # Schema and data separately as well as together. Separately because the
  # commonest recovery is not "everything is gone" — it is "someone deleted
  # something" or "a migration went wrong", and for those you want the schema
  # without overwriting good data, or the data without touching the schema.
  echo "      schema..."
  pg_dump --schema-only --no-owner --no-privileges \
          --file="/tmp/${OUT}/database/01_schema.sql" "${SUPABASE_DB_URL}"

  echo "      data..."
  pg_dump --data-only --no-owner --no-privileges --disable-triggers \
          --file="/tmp/${OUT}/database/02_data.sql" "${SUPABASE_DB_URL}"

  echo "      complete (custom format, for pg_restore)..."
  pg_dump --format=custom --no-owner --no-privileges \
          --file="/tmp/${OUT}/database/03_complete.dump" "${SUPABASE_DB_URL}"

  # A plain-text inventory, so a human can see what SHOULD be there without
  # restoring anything. If a restore comes back with 40 tables and this says
  # 128, that is caught in seconds rather than after someone notices a register
  # is missing.
  echo "      inventory..."
  psql "${SUPABASE_DB_URL}" -At -F' | ' > "/tmp/${OUT}/database/04_inventory.txt" <<'SQL'
SELECT 'TABLES', count(*) FROM information_schema.tables
 WHERE table_schema='public' AND table_type='BASE TABLE'
UNION ALL SELECT 'VIEWS', count(*) FROM information_schema.views WHERE table_schema='public'
UNION ALL SELECT 'FUNCTIONS', count(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
UNION ALL SELECT 'ENTITIES', count(*)::text FROM entity
UNION ALL SELECT 'CLIENT ENTITIES', count(*)::text FROM entity WHERE entity_class='client'
UNION ALL SELECT 'DEMO ENTITIES', count(*)::text FROM entity WHERE is_demo
UNION ALL SELECT 'JOURNALS', count(*)::text FROM journal
UNION ALL SELECT 'JOURNAL LINES', count(*)::text FROM journal_line
UNION ALL SELECT 'LEDGER BALANCES TO NIL',
  CASE WHEN round(coalesce(sum(func_amount),0),2)=0 THEN 'yes'
       ELSE 'NO — OUT BY ' || round(sum(func_amount),2) END
  FROM journal_line jl JOIN journal j ON j.id=jl.journal_id WHERE j.status='posted'
UNION ALL SELECT 'CLIENT MONEY MOVEMENTS', count(*)::text FROM client_money_movement
UNION ALL SELECT 'AUDIT EVENTS', count(*)::text FROM audit_event;
SQL
  echo "      $(du -sh "/tmp/${OUT}/database" | cut -f1) total"
  cat "/tmp/${OUT}/database/04_inventory.txt" | sed 's/^/        /'
fi

# ─────────────────────────────────────────────────────────────────────
# 3. THE SELF-HOSTING PACKAGE
# ─────────────────────────────────────────────────────────────────────
# Already in the repo, but copied to the top of the bundle so whoever opens
# this does not have to know it is in there.
echo "[3/5] Self-hosting package"
cp -r "${ROOT}/migration" "/tmp/${OUT}/self-hosting" 2>/dev/null || true
echo "      docker-compose stack for running without Supabase"

# ─────────────────────────────────────────────────────────────────────
# 4. DOCUMENTATION
# ─────────────────────────────────────────────────────────────────────
echo "[4/5] Documentation"
cp -r "${ROOT}/docs/." "/tmp/${OUT}/docs/" 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────
# 5. THE README THAT MAKES IT USABLE
# ─────────────────────────────────────────────────────────────────────
echo "[5/5] Recovery instructions"
cat > "/tmp/${OUT}/README.md" <<EOF
# Affinity Core — recovery bundle, ${STAMP}

Everything needed to rebuild Affinity Core without GitHub, Supabase or Azure.

## What is in here

| Folder | Contents |
|---|---|
| \`code/\` | The full repository. \`affinity-core.bundle\` carries the entire git history; \`affinity-core-snapshot.tar.gz\` is a plain copy for when git is not to hand |
| \`database/\` | Schema, data, a complete dump, and an inventory of what should be present |
| \`self-hosting/\` | A docker-compose stack that runs the database and API without Supabase |
| \`docs/\` | User guide and the go-live runbook |

## Restoring the code

    git clone code/affinity-core.bundle affinity-core
    cd affinity-core
    npm ci
    npm run build

## Restoring the database

Onto any PostgreSQL 15 or later:

    createdb affinity_core
    psql affinity_core -f database/01_schema.sql
    psql affinity_core -f database/02_data.sql

Or in one step from the custom-format dump:

    pg_restore --dbname=affinity_core --no-owner --no-privileges database/03_complete.dump

**Then check it against \`database/04_inventory.txt\`.** That file records what
should be there. A restore that completes without error but produces 40 tables
where the inventory says 128 is a restore that failed quietly, and finding that
now is far better than finding it when someone notices a register is empty.

## What this does NOT contain, deliberately

- **No secrets.** No Supabase keys, no Entra client secret, no deployment
  tokens. Those are held in a password manager and in the Entra tenant. A
  backup archive that contains live credentials is a liability, not an asset —
  anyone who obtains it obtains the system.
- **No documents.** Files themselves live in the DMS. \`document_link\` records
  the metadata and where each file sits; the files are that system's backup
  responsibility, not this one's.

## The part that is not technical

Every account this system depends on — GitHub, Supabase, Azure, the domain — is
currently tied to one person. So is the ability to produce this bundle.

A backup only one person can create, stored somewhere only that person can
reach, is not a backup. It is a single point of failure with a copy of the data
attached.

Two things worth doing:

1. **A second administrator** on GitHub, Supabase and the Azure subscription.
   Not for convenience — so the firm is not locked out of its own client
   records if one person is unavailable.
2. **This bundle somewhere the firm controls**, not a personal drive. It
   contains client data, so it needs the same protection as any client file:
   encrypted, access-logged, and inside the firm's retention policy.

## How often

Quarterly at minimum, and before any significant change. A restore test — not
just producing the bundle, but actually restoring it and checking the inventory
— is itself worth diarising. An untested backup is a hope.
EOF

# ── Package ──────────────────────────────────────────────────────────
cd /tmp
tar -czf "${ROOT}/${OUT}.tar.gz" "${OUT}"
rm -rf "/tmp/${OUT}"

echo
echo "─────────────────────────────────────────────────────────────"
echo "  ${OUT}.tar.gz"
echo "  $(du -h "${ROOT}/${OUT}.tar.gz" | cut -f1)"
echo "─────────────────────────────────────────────────────────────"
echo
echo "Store it somewhere the FIRM controls, not a personal drive. It contains"
echo "client data and needs the same protection as any client file."
echo
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "WARNING: no database export in this bundle. It protects the code and"
  echo "         not the client records. Set SUPABASE_DB_URL and run again."
fi
