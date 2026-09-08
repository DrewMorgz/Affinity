#!/usr/bin/env python3
"""
WIRING AUDIT — does data entered actually reach everywhere it should?

Spot-checking one register proves nothing about the other 128 tables, so this
traverses the whole system mechanically and looks for four specific breaks:

  ORPHAN WRITE   a table something writes to, that nothing ever reads.
                 Data goes in and is never seen again. The worst kind, because
                 it looks like it worked.

  ORPHAN READ    a table the app reads, that nothing can write to.
                 The screen is permanently blank and users report it as broken.

  UNREACHABLE    a database function the application never calls.
                 Either dead work or a feature nobody can get to.

  BROKEN CHAIN   two steps in a workflow that don't join up — the case that
                 found the missing entity creation. These cannot be inferred
                 from tables alone, so they are declared explicitly below and
                 checked.

Run:  python3 migration/wiring_audit.py
"""
import re, os, sys, glob, json
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(REPO, "src")

# ── Read all the SQL ────────────────────────────────────────────────────────
sql_files = sorted(glob.glob(os.path.join(REPO, "db", "*.sql")) +
                   glob.glob(os.path.join(REPO, "db_eadmin", "*.sql")) +
                   glob.glob(os.path.join(REPO, "db_ops", "*.sql")))
SQL = "\n".join(open(f, encoding="utf8", errors="replace").read() for f in sql_files)

# ── Read all the front end ──────────────────────────────────────────────────
js_files = sorted(glob.glob(os.path.join(SRC, "*.js")) + glob.glob(os.path.join(SRC, "*.jsx")))
JS = "\n".join(open(f, encoding="utf8", errors="replace").read() for f in js_files)

# ── Inventory ───────────────────────────────────────────────────────────────
tables = set(re.findall(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)", SQL))

# Split the SQL into function bodies so writes and reads can be attributed.
functions = {}
for m in re.finditer(
        r"CREATE OR REPLACE FUNCTION (\w+)\s*\((.*?)\)\s*RETURNS(.*?)(?=CREATE OR REPLACE FUNCTION|\Z)",
        SQL, re.S):
    functions[m.group(1)] = m.group(3)

writers = defaultdict(set)   # table -> functions that write to it
readers = defaultdict(set)   # table -> functions that read from it

for fname, body in functions.items():
    for t in re.findall(r"INSERT\s+INTO\s+(\w+)", body, re.I):
        if t in tables: writers[t].add(fname)
    for t in re.findall(r"UPDATE\s+(\w+)\s+(?:\w+\s+)?SET", body, re.I):
        if t in tables: writers[t].add(fname)
    for t in re.findall(r"DELETE\s+FROM\s+(\w+)", body, re.I):
        if t in tables: writers[t].add(fname)
    for t in re.findall(r"FROM\s+(\w+)", body, re.I):
        if t in tables: readers[t].add(fname)
    for t in re.findall(r"JOIN\s+(\w+)", body, re.I):
        if t in tables: readers[t].add(fname)

# Writes and reads that happen outside functions — plain seeds and views.
raw_writes = set(t for t in re.findall(r"INSERT\s+INTO\s+(\w+)", SQL, re.I) if t in tables)
view_reads = set()
for m in re.finditer(r"CREATE (?:OR REPLACE )?VIEW \w+ AS(.*?);", SQL, re.S | re.I):
    view_reads |= set(t for t in re.findall(r"(?:FROM|JOIN)\s+(\w+)", m.group(1), re.I) if t in tables)

# What the application actually calls.
#
# NOTE: an earlier version of this audit only looked for rpc("name") and
# reported 40 false orphans as a result. The API modules wrap supabase.rpc in a
# local helper — call("name", {...}) — so the direct-rpc pattern misses almost
# everything. Both forms are matched now, plus direct table reads.
called  = set(re.findall(r'''rpc\(\s*["']([a-z_0-9]+)["']''', JS))
called |= set(re.findall(r'''\bcall\(\s*["']([a-z_0-9]+)["']''', JS))
called |= set(re.findall(r'''\.from\(\s*["']([a-z_0-9]+)["']''', JS))

# ── Findings ────────────────────────────────────────────────────────────────
findings = {"orphan_write": [], "orphan_read": [], "unreachable": [], "no_audit": []}

INFRA = {  # not expected to be read by the app
    "audit_event", "notification", "ui_dataset", "schema_migrations",
    "accounting_period", "period_lock", "retention_policy", "dms_category",
}

for t in sorted(tables):
    w = writers[t] | ({"(seed data)"} if t in raw_writes else set())
    r = readers[t] | ({"(view)"} if t in view_reads else set())

    # Is anything that reads this table reachable from the app?
    reachable = bool((readers[t] & called)) or t in called or t in view_reads

    if w and not r:
        findings["orphan_write"].append((t, sorted(w)[:3]))
    elif w and not reachable and t not in INFRA:
        findings["orphan_write"].append((t, sorted(w)[:3]))
    elif r and not w and t not in INFRA:
        findings["orphan_read"].append((t, sorted(r)[:3]))

for fname in sorted(functions):
    if fname in called: continue
    # helpers called by other functions are fine
    used_internally = any(re.search(r"\b" + fname + r"\s*\(", b)
                          for n, b in functions.items() if n != fname)
    if used_internally: continue
    if fname.startswith(("assert_", "trg_", "fn_", "_")): continue
    findings["unreachable"].append(fname)

# Every write function should leave an audit trail.
for fname, body in functions.items():
    is_write = bool(re.search(r"INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM", body, re.I))
    if not is_write: continue
    if fname in ("ea_audit",): continue
    if not re.search(r"ea_audit|audit_event", body):
        findings["no_audit"].append(fname)

# ── Declared workflow chains ────────────────────────────────────────────────
# Table wiring cannot reveal a missing step between two workflows, so the
# chains that matter are stated here and checked. This is the check that would
# have caught the missing entity creation.
CHAINS = [
    ("Onboarding produces a client entity",
     "onb_case_go_live", r"ea_entity_create"),
    ("A new client entity can be created at all",
     None, r"CREATE OR REPLACE FUNCTION ea_entity_create"),
    ("Creating an entity also creates its profile row",
     "ea_entity_create", r"INSERT INTO entity_profile"),
    ("A duplicate client name in the same jurisdiction is refused",
     "ea_entity_create", r"already exists in"),
    ("An unknown jurisdiction is named rather than failing on a foreign key",
     "ea_entity_create", r"Unknown jurisdiction"),
    ("Going live links the onboarding case to the new entity",
     "onb_case_go_live", r"UPDATE onboarding_case SET entity_id"),
    ("Going live carries the verified CDD onto the client record",
     "onb_case_go_live", r"INSERT INTO entity_file_note"),
    ("Going live still passes through the CDD gates",
     "onb_case_go_live", r"onb_case_advance"),
    ("Closing an entity is refused while time is unbilled",
     "ea_entity_close", r"unbilled"),
    ("Approved time becomes an invoice",
     "bill_wip_to_invoice", r"INSERT\s+INTO\s+invoice"),
    ("Billing marks the time as billed",
     "bill_wip_to_invoice", r"UPDATE\s+timesheet_entry"),
    ("Invoice lines update the invoice total",
     "inv_line_add", r"UPDATE\s+invoice"),
    ("Issuing an invoice is blocked when it has no lines",
     "inv_issue", r"lines\s*=\s*0|IF lines = 0"),
    ("A journal posts to the ledger",
     "bk_journal_post", r"post_journal"),
    ("Filing submission records who and when",
     "stat_filing_submit", r"submitted_by"),
    ("Verifying CDD records the method",
     "cdd_item_verify", r"method"),
    ("Documents get a retention date",
     "doc_file", r"link_document"),
    ("Reassigning a caseload moves every entity",
     "ea_reassign_caseload", r"UPDATE entity_profile"),
    ("Resigning an officer keeps the history",
     "ea_officer_resign", r"UPDATE entity_officer SET resigned"),
]
chain_results = []
for label, fn, pattern in CHAINS:
    body = functions.get(fn, "") if fn else SQL
    ok = bool(re.search(pattern, body, re.I | re.S))
    chain_results.append((label, ok))

# ── Report ──────────────────────────────────────────────────────────────────
print("=" * 74)
print("AFFINITY CORE — WIRING AUDIT")
print("=" * 74)
print(f"\n{len(tables)} tables, {len(functions)} functions, {len(called)} called by the app\n")

print("-" * 74)
print("WORKFLOW CHAINS — do the steps join up?")
print("-" * 74)
broken = 0
for label, ok in chain_results:
    print(f"  {'PASS' if ok else 'BROKEN':<7} {label}")
    if not ok: broken += 1

print()
print("-" * 74)
print("ORPHAN WRITES — data goes in, nothing reads it back")
print("-" * 74)
if findings["orphan_write"]:
    for t, w in findings["orphan_write"]:
        print(f"  {t:<26} written by {', '.join(w)}")
else:
    print("  none")

print()
print("-" * 74)
print("ORPHAN READS — the screen can never show anything")
print("-" * 74)
if findings["orphan_read"]:
    for t, r in findings["orphan_read"]:
        print(f"  {t:<26} read by {', '.join(r)}")
else:
    print("  none")

print()
print("-" * 74)
print("UNREACHABLE FUNCTIONS — built but nothing calls them")
print("-" * 74)
if findings["unreachable"]:
    for f in findings["unreachable"][:40]:
        print(f"  {f}")
    if len(findings["unreachable"]) > 40:
        print(f"  ... and {len(findings['unreachable']) - 40} more")
else:
    print("  none")

print()
print("-" * 74)
print("WRITES WITH NO AUDIT TRAIL")
print("-" * 74)
if findings["no_audit"]:
    for f in sorted(findings["no_audit"])[:25]:
        print(f"  {f}")
    if len(findings["no_audit"]) > 25:
        print(f"  ... and {len(findings['no_audit']) - 25} more")
else:
    print("  none")

print()
print("=" * 74)
total = broken + len(findings["orphan_write"]) + len(findings["orphan_read"])
print(f"BLOCKING ISSUES: {total}   "
      f"(broken chains {broken}, orphan writes {len(findings['orphan_write'])}, "
      f"orphan reads {len(findings['orphan_read'])})")
print(f"NON-BLOCKING:    unreachable {len(findings['unreachable'])}, "
      f"no audit {len(findings['no_audit'])}")
print("=" * 74)

json.dump({
    "tables": len(tables), "functions": len(functions), "called": len(called),
    "broken_chains": [l for l, ok in chain_results if not ok],
    "orphan_writes": [t for t, _ in findings["orphan_write"]],
    "orphan_reads": [t for t, _ in findings["orphan_read"]],
    "unreachable": findings["unreachable"],
    "no_audit": sorted(findings["no_audit"]),
}, open(os.path.join(REPO, "migration", "wiring_audit.json"), "w"), indent=2)
print("\nFull results written to migration/wiring_audit.json")
sys.exit(1 if total else 0)
