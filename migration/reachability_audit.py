#!/usr/bin/env python3
"""
COMPLETE REACHABILITY AUDIT

Every function in the database, traced through the API layer to a screen.

Written after a failure. The previous audit verified that every API call
resolves to a real function (310/310, sound) but checked the opposite
direction badly: it found unreachable functions, worked through some, and then
TRIAGED THE REMAINDER BY GUESSING what they needed. search_documents and
get_object_documents were filed under "needs the document store". They need no
such thing. They need a screen.

So this script does not characterise anything. For each function it reports
exactly one of:

  WIRED        a screen calls it, naming the screen
  API_ONLY     an API wrapper exists but no screen calls it
  ORPHAN       nothing references it at all
  INTERNAL     called only by other database functions, which is correct

Nothing is excused, dismissed or explained away. Where a function is not
reachable, that is the finding, and the reason is a separate question to be
answered with evidence rather than assumed.
"""
import pgserver, pathlib, re, os, json, sys
from collections import defaultdict

DB  = pathlib.Path("/home/claude/pgFinal")
SRC = "/home/claude/chk/repo/src"

db = pgserver.get_server(DB)

# ── every function in the database ───────────────────────────────────
out = db.psql("""
SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prokind = 'f'
 GROUP BY p.proname
 ORDER BY p.proname;
""")
fns = [l.strip() for l in out.split("\n")[2:] if l.strip() and not l.startswith("(")]

# ── which functions are called from inside other functions ──────────
# A function called only by other functions is correctly not reachable from a
# screen — it is a building block. That has to be distinguished from a function
# nothing calls at all.
bodies = db.psql("SELECT string_agg(prosrc, ' ~~~ ') FROM pg_proc p "
                 "JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';")
allsrc = bodies

# ── read the front end ───────────────────────────────────────────────
api_files, ui_files = {}, {}
for f in sorted(os.listdir(SRC)):
    p = os.path.join(SRC, f)
    if f.endswith('.js'):
        api_files[f] = open(p, encoding='utf8', errors='replace').read()
    elif f.endswith('.jsx'):
        ui_files[f] = open(p, encoding='utf8', errors='replace').read()

# map: rpc name -> [(api file, exported wrapper name)]
wrappers = defaultdict(list)
for f, s in api_files.items():
    # split the file into export blocks so a wrapper can be attributed
    names = re.findall(r'\n\s*export\s+(?:const|async function|function)\s+(\w+)', s)
    parts = re.split(r'\n\s*export\s+(?:const|async function|function)\s+\w+', s)
    for nm, body in zip(names, parts[1:]):
        for rpc in re.findall(r'(?:call|rpc)\(\s*["\']([a-z_0-9]+)["\']', body):
            wrappers[rpc].append((f, nm))

# which wrappers a screen actually calls
def screens_calling(wrapper, api_file):
    hits = []
    for f, s in ui_files.items():
        # imported as a namespace (OPS.foo) or named (foo)
        if re.search(r'\b\w+\.' + re.escape(wrapper) + r'\s*\(', s) or \
           re.search(r'(?<![\w.])' + re.escape(wrapper) + r'\s*\(', s):
            hits.append(f)
    return hits

results = []
for fn in fns:
    ws = wrappers.get(fn, [])
    if ws:
        screens = []
        for api_f, w in ws:
            screens += screens_calling(w, api_f)
        screens = sorted(set(screens))
        if screens:
            results.append((fn, 'WIRED', ', '.join(s.replace('affinity_core_', '')
                                                    .replace('.jsx', '') for s in screens[:3])))
        else:
            results.append((fn, 'API_ONLY',
                            'wrapper ' + ws[0][1] + ' in ' + ws[0][0] + ' — no screen calls it'))
    else:
        # is it called from inside another function?
        called_internally = re.search(r'(?:PERFORM|SELECT|:=|FROM|JOIN)\s+' + re.escape(fn) + r'\s*\(',
                                      allsrc)
        if called_internally:
            results.append((fn, 'INTERNAL', 'called by another database function only'))
        else:
            results.append((fn, 'ORPHAN', 'nothing references it anywhere'))

# ── report ───────────────────────────────────────────────────────────
counts = defaultdict(int)
for _, st, _ in results: counts[st] += 1

print("=" * 78)
print("COMPLETE REACHABILITY AUDIT")
print("=" * 78)
print(f"  {len(fns)} functions in the database\n")
for st in ('WIRED', 'INTERNAL', 'API_ONLY', 'ORPHAN'):
    print(f"    {st:10} {counts[st]:4}")
print()

for st, label in (('API_ONLY', 'AN API WRAPPER EXISTS BUT NO SCREEN CALLS IT'),
                  ('ORPHAN',   'NOTHING REFERENCES IT AT ALL')):
    rows = [(f, d) for f, s, d in results if s == st]
    if not rows: continue
    print("─" * 78)
    print(f"{label}  ({len(rows)})")
    print("─" * 78)
    for f, d in rows:
        print(f"  {f}")
    print()

json.dump([{"function": f, "status": s, "detail": d} for f, s, d in results],
          open('/home/claude/reachability.json', 'w'), indent=1)
print(f"written: /home/claude/reachability.json")
