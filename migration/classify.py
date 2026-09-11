#!/usr/bin/env python3
"""
CLASSIFY THE UNREACHABLE FUNCTIONS

142 database functions cannot be reached from a screen. Working through them
blind is slow and may build screens nobody needs. This classifies each one by
EVIDENCE, so the remaining work can be sequenced by what matters.

The last time I triaged this list I did it by guessing what each function
needed — search_documents went under "needs the document store" when it needed
a screen. So every category here is decided by something checkable:

  BUILDING BLOCK   another database function calls it. Giving it a screen
                   would be wrong: it is machinery, not a feature.

  SUPERSEDED       a guarded wrapper exists that calls it, and the wrapper IS
                   reachable. The raw function should stay unreachable — the
                   whole point of the wrapper is that callers cannot bypass
                   its checks.

  NEEDS EXTERNAL   the function's own body or name shows it depends on
                   something Core does not have: a bank file, a portal
                   session, a document store.

  READ, NO SCREEN  returns a table and nothing displays it. A missing report.

  WRITE, NO SCREEN takes parameters and changes data, and nothing calls it.
                   A missing feature, and the category that matters.

The output is ordered so the WRITE ones come first, because those are things a
user cannot do at all.
"""
import pgserver, pathlib, re, os, json
from collections import defaultdict

db = pgserver.get_server(pathlib.Path("/home/claude/pgFinal"))
SRC = "/home/claude/chk/repo/src"

# ── the unreachable set, from the reachability audit ─────────────────
audit = json.load(open("/home/claude/reachability.json"))
unreachable = [d["function"] for d in audit if d["status"] in ("API_ONLY", "ORPHAN")]
reachable = {d["function"] for d in audit if d["status"] == "WIRED"}

# ── every function's shape, from the database ────────────────────────
# Fetched WITHOUT prosrc: function bodies contain newlines and pipes, which
# broke a single combined query and left the metadata empty — every function
# then classified as UNKNOWN. Shape and source are fetched separately.
meta = {}
rows = db.psql("""
SELECT p.proname || '|' ||
       CASE WHEN pg_get_function_result(p.oid) LIKE 'TABLE%' THEN 'table'
            WHEN pg_get_function_result(p.oid) = 'void' THEN 'void'
            ELSE 'scalar' END || '|' ||
       coalesce(pg_get_function_identity_arguments(p.oid), '')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prokind = 'f';
""")
for line in rows.split("\n"):
    line = line.strip()
    if "|" not in line or line.startswith("?column") or line.startswith("-"):
        continue
    parts = line.split("|")
    if len(parts) < 2:
        continue
    meta[parts[0].strip()] = {"returns": parts[1].strip(),
                              "args": "|".join(parts[2:]).strip(), "src": ""}

# the bodies, one function at a time so newlines cannot corrupt the parse
for fn in list(meta):
    r = db.psql("SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                f"WHERE n.nspname='public' AND proname='{fn}' LIMIT 1;")
    body = " ".join(l.strip() for l in r.split("\n")[2:-2])
    meta[fn]["src"] = body

allsrc = " ".join(m["src"] for m in meta.values())

# ── who calls whom, inside the database ──────────────────────────────
def called_by_functions(fn):
    """Is fn invoked from inside another function's body?"""
    pat = re.compile(r"(?:PERFORM|SELECT|:=|FROM|JOIN|,)\s+" + re.escape(fn) + r"\s*\(", re.I)
    for name, m in meta.items():
        if name == fn:
            continue
        if pat.search(m["src"]):
            return name
    return None

# ── is there a reachable wrapper that calls it? ──────────────────────
def superseding_wrapper(fn):
    pat = re.compile(r"(?:PERFORM|SELECT|:=)\s+" + re.escape(fn) + r"\s*\(", re.I)
    for name, m in meta.items():
        if name == fn:
            continue
        if pat.search(m["src"]) and name in reachable:
            return name
    return None

# ── external dependency, by evidence in the body or the name ────────
EXTERNAL = [
    (r"mt940|swift|camt|statement file|import.*file", "a bank statement file"),
    (r"sepa|pain\.001|payment file|bacs", "a payment provider"),
    (r"portal|submission|regulator.*submit", "a regulator portal session"),
    (r"email|smtp|send.*mail", "an email service"),
    (r"dms_ref|document store|blob|upload", "document storage"),
]
def external_need(fn):
    body = (meta.get(fn, {}).get("src", "") + " " + fn).lower()
    for pat, need in EXTERNAL:
        if re.search(pat, body):
            return need
    return None

# ── classify ─────────────────────────────────────────────────────────
out = []
for fn in sorted(unreachable):
    m = meta.get(fn)
    if not m:
        out.append((fn, "UNKNOWN", "not found in the database"))
        continue

    w = superseding_wrapper(fn)
    if w:
        out.append((fn, "SUPERSEDED", f"{w}() wraps it and IS reachable"))
        continue

    caller = called_by_functions(fn)
    if caller:
        out.append((fn, "BUILDING BLOCK", f"called by {caller}()"))
        continue

    ext = external_need(fn)
    if ext:
        out.append((fn, "NEEDS EXTERNAL", f"depends on {ext}"))
        continue

    if m["returns"] == "table":
        out.append((fn, "READ, NO SCREEN", "returns a table that nothing displays"))
    else:
        args = len([a for a in m["args"].split(",") if a.strip()])
        out.append((fn, "WRITE, NO SCREEN", f"{args} parameter(s), changes data"))

# ── report, most actionable first ────────────────────────────────────
ORDER = ["WRITE, NO SCREEN", "READ, NO SCREEN", "NEEDS EXTERNAL",
         "SUPERSEDED", "BUILDING BLOCK", "UNKNOWN"]
groups = defaultdict(list)
for fn, cat, why in out:
    groups[cat].append((fn, why))

print("=" * 78)
print(f"CLASSIFICATION OF {len(unreachable)} UNREACHABLE FUNCTIONS")
print("=" * 78)
for cat in ORDER:
    if groups[cat]:
        print(f"  {len(groups[cat]):4}  {cat}")
print()

for cat in ORDER:
    if not groups[cat]:
        continue
    print("─" * 78)
    print(f"{cat}  ({len(groups[cat])})")
    print("─" * 78)
    for fn, why in groups[cat]:
        print(f"  {fn:<34} {why}")
    print()

json.dump([{"function": f, "category": c, "why": w} for f, c, w in out],
          open("/home/claude/classification.json", "w"), indent=1)
print("written: /home/claude/classification.json")
