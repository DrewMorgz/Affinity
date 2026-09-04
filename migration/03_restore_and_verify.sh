#!/usr/bin/env bash
# =============================================================================
# 03 — RESTORE INTO AZURE, AND PROVE IT WORKED
#
# The restore is the easy half. The verification is the point of this script:
# a restore that "completed without errors" is not the same as a restore that
# carried everything across, and the difference is only discoverable by
# counting.
#
# So this compares the target against the manifest taken at export time and
# refuses to report success on any mismatch. Finding a missing table here is
# cheap; finding it three weeks later, after people have been entering data,
# is not.
#
# Usage:
#   export TARGET_DB_URL='postgresql://user:pass@yourserver.postgres.database.azure.com:5432/affinity?sslmode=require'
#   ./03_restore_to_azure.sh export-20260904-190000Z
# =============================================================================

set -euo pipefail

EXPORT_DIR="${1:-}"
if [ -z "$EXPORT_DIR" ] || [ ! -d "$EXPORT_DIR" ]; then
  echo "Usage: $0 <export-directory>"
  exit 1
fi
if [ -z "${TARGET_DB_URL:-}" ]; then
  echo "ERROR: TARGET_DB_URL is not set."
  echo "Azure gives it in Portal → your PostgreSQL server → Connect."
  echo "Append ?sslmode=require — Azure rejects unencrypted connections."
  exit 1
fi

echo "Restoring ${EXPORT_DIR} into the target database"
echo

# ── Refuse to overwrite a database that already holds data ──────────────────
# Running this twice, or against the wrong server, would be unrecoverable.
EXISTING=$(psql "$TARGET_DB_URL" -At -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" \
  2>/dev/null || echo "0")
if [ "$EXISTING" -gt 0 ]; then
  echo "REFUSING TO CONTINUE: the target already has ${EXISTING} tables in public."
  echo
  echo "If this is a deliberate re-run, drop and recreate the schema first:"
  echo "  psql \"\$TARGET_DB_URL\" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"
  echo
  echo "If this is the wrong server, stop and check TARGET_DB_URL."
  exit 1
fi

# ── Order matters ───────────────────────────────────────────────────────────
echo "1/4  roles"
# Errors are tolerated: some roles may already exist on a managed server, and
# Azure does not permit creating certain reserved names.
psql "$TARGET_DB_URL" -f "${EXPORT_DIR}/roles.sql" >/dev/null 2>&1 || \
  echo "     some roles already existed or are reserved — continuing"

echo "2/4  schema"
psql "$TARGET_DB_URL" --set ON_ERROR_STOP=on -f "${EXPORT_DIR}/schema.sql" >/dev/null
echo "     applied"

echo "3/4  data"
psql "$TARGET_DB_URL" --set ON_ERROR_STOP=on -f "${EXPORT_DIR}/data.sql" >/dev/null
echo "     applied"

echo "4/4  verifying against the export manifest"
echo

# ── Verification ────────────────────────────────────────────────────────────
fail=0
expected() { grep "^$1=" "${EXPORT_DIR}/manifest.txt" 2>/dev/null | head -1 | cut -d= -f2; }
actual()   { psql "$TARGET_DB_URL" -At -c "$1" 2>/dev/null || echo "ERR"; }

check() {
  local label="$1" exp="$2" act="$3"
  if [ -z "$exp" ]; then
    printf "  %-22s %-10s (not in manifest — skipped)\n" "$label" "$act"
    return
  fi
  if [ "$exp" == "$act" ]; then
    printf "  %-22s %-10s matches\n" "$label" "$act"
  else
    printf "  %-22s %-10s MISMATCH — expected %s\n" "$label" "$act" "$exp"
    fail=1
  fi
}

check "tables"        "$(expected tables)" \
      "$(actual "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
check "functions"     "$(expected functions)" \
      "$(actual "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';")"
check "policies"      "$(expected policies)" \
      "$(actual "SELECT count(*) FROM pg_policies WHERE schemaname='public';")"
check "entities"      "$(expected entities)" \
      "$(actual "SELECT count(*) FROM entity;")"
check "journals"      "$(expected journals)" \
      "$(actual "SELECT count(*) FROM journal;")"
check "journal_lines" "$(expected journal_lines)" \
      "$(actual "SELECT count(*) FROM journal_line;")"

echo
echo "Structural checks that matter more than counts:"

# Double entry must still hold. If the data arrived but unbalanced, something
# was lost in transit and no row count would reveal it.
UNBAL=$(actual "SELECT count(*) FROM (SELECT journal_id FROM journal_line GROUP BY journal_id HAVING round(sum(func_amount),2) <> 0) x;")
if [ "$UNBAL" == "0" ]; then
  echo "  every journal still balances"
else
  echo "  ${UNBAL} JOURNALS DO NOT BALANCE — the data did not arrive intact"
  fail=1
fi

# The write layer has to be callable, or the app comes up read-only.
FNS=$(actual "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('ea_officer_add','bk_journal_post','bill_wip_to_invoice','doc_file','onb_case_advance','planning_budget_set');")
if [ "$FNS" == "6" ]; then
  echo "  the write layer functions are present"
else
  echo "  only ${FNS} of 6 sampled write functions are present"
  fail=1
fi

# Grants are the thing most often lost, and the failure is silent: the app
# authenticates and then returns nothing.
GRANTED=$(actual "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege('authenticated', p.oid, 'EXECUTE');")
if [ "$GRANTED" -gt 100 ]; then
  echo "  ${GRANTED} functions are executable by signed-in users"
else
  echo "  only ${GRANTED} functions are executable by 'authenticated' — grants were lost"
  echo "  the app would sign in and then show nothing. Re-run db/052 and db/053."
  fail=1
fi

# And the reverse: anon must not have gained access in the move.
ANON=$(actual "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE') AND p.proname ~ '^(ea_|bk_|inv_|stat_|onb_|cdd_)';")
if [ "$ANON" == "0" ]; then
  echo "  no write function is reachable without signing in"
else
  echo "  ${ANON} WRITE FUNCTIONS ARE REACHABLE BY 'anon' — re-run db/053 immediately"
  fail=1
fi

echo
if [ "$fail" == "0" ]; then
  echo "RESTORE VERIFIED. Everything in the manifest arrived, journals balance,"
  echo "and the grants are as they should be."
  echo
  echo "NEXT: point the application at this database by changing"
  echo "REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to the new stack,"
  echo "then sign in and confirm Entity Admin shows 'Live data'."
else
  echo "RESTORE INCOMPLETE — see the mismatches above. Do NOT cut over."
  exit 1
fi
