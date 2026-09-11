#!/usr/bin/env python3
"""
A check for every class of fault actually found in this build.

The reachability audit measured ONE thing: can a database function be reached
from a screen. Nearly every serious fault found today was a different kind, and
would have passed that audit cleanly:

  - a modal that collected input and discarded it (statutory registers)
  - two functions writing the same table, one skipping the audit trail (085)
  - the screen posting by a path that ignored the threshold (088)
  - a control operating on an empty table, so it could never fire (087)
  - a control the design assumed and the code lacked (089)
  - a screen showing sample data while the live list sat uncalled
  - a button calling a namespace the module never imported
  - a ternary whose two branches were identical, hiding a list
  - a hardcoded user id, so everyone saw the same name and role
  - an API returning entity_name while the screen read r.name

So this checks for the SHAPES, not the instances. Each one is a pattern I got
wrong at least once today.
"""
import re, os, glob, json, sys

ROOT = '/home/claude/chk/repo'
SRC  = os.path.join(ROOT, 'src')
findings = {}

def add(cat, item):
    findings.setdefault(cat, []).append(item)

jsx = {os.path.basename(f): open(f, encoding='utf8', errors='replace').read()
       for f in glob.glob(os.path.join(SRC, '*.jsx'))}
js  = {os.path.basename(f): open(f, encoding='utf8', errors='replace').read()
       for f in glob.glob(os.path.join(SRC, '*.js'))}

# 1 ── A save button that does not save ─────────────────────────────────────
# The statutory registers modals ended in onClick={()=>setModal(null)} and
# discarded everything typed. Worse than a missing button: it reads as success.
for f, s in jsx.items():
    for m in re.finditer(r'<button[^>]*onClick=\{\(\)\s*=>\s*set(?:Modal|Form|Open)\((?:null|false)\)\}[^>]*>\s*([^<]{2,40}?)\s*</button>', s):
        label = ' '.join(m.group(1).split())
        if re.match(r'(?i)(save|submit|create|add|record|post|confirm|log|apply|ok)\b', label):
            add('SAVE BUTTON THAT ONLY CLOSES', f'{f}: "{label}"')

# 2 ── A ternary whose branches are identical ───────────────────────────────
for f, s in jsx.items():
    for m in re.finditer(r'\?\s*(Promise\.resolve\([^)]*\)|\[\]|null|0|""|\{\})\s*:\s*(Promise\.resolve\([^)]*\)|\[\]|null|0|""|\{\})', s):
        if re.sub(r'\s+','',m.group(1)) == re.sub(r'\s+','',m.group(2)):
            add('TERNARY WITH IDENTICAL BRANCHES', f'{f}: {m.group(0)[:60]}')

# 3 ── A namespace used and never imported or defined ───────────────────────
known = {'Math','JSON','Object','Array','String','Number','Date','React','Promise','URL','DOM','Intl'}
for f, s in jsx.items():
    ns    = set(re.findall(r'import \* as (\w+) from', s))
    named = set(x.strip().split(' as ')[-1] for m in re.findall(r'import \{([^}]*)\} from', s) for x in m.split(','))
    local = set(re.findall(r'(?<![\w.])([A-Z][A-Z0-9_]*)\s*=(?!=)', s))
    destr = set(x.strip().split(':')[-1].strip() for m in re.findall(r'(?:const|let)\s*\{([^}]*)\}\s*=', s) for x in m.split(','))
    for u in set(re.findall(r'(?<![\w.])([A-Z][A-Z0-9_]{1,7})\.\w+\s*\(', s)):
        if u not in ns|named|local|destr|known:
            add('NAMESPACE NEVER IMPORTED', f'{f}: {u}.*')

# 4 ── A component declared inside another (remounts on every keystroke) ────
for f, s in jsx.items():
    body = s[s.find('export default function'):] if 'export default function' in s else ''
    for m in re.finditer(r'\n  (?:const|function)\s+([A-Z]\w+)\s*(?:=\s*)?\(\s*\{', body):
        nm = m.group(1)
        if re.search(r'<' + nm + r'[\s/>]', body):
            add('COMPONENT DECLARED INSIDE COMPONENT', f'{f}: {nm}')

# 5 ── Hardcoded identity ───────────────────────────────────────────────────
for f, s in jsx.items():
    for m in re.finditer(r'(assignee|user|createdBy|preparedBy|owner|signedBy)\s*:\s*"(Andrew|Andy) Morgan"', s):
        add('HARDCODED IDENTITY', f'{f}: {m.group(0)}')

print(json.dumps(findings, indent=1))

# ── Part two: faults the JSX scan cannot see ───────────────────────────────
import pgserver, pathlib
db = pgserver.get_server(pathlib.Path("/home/claude/pgN"))
f2 = {}
def add2(cat, item): f2.setdefault(cat, []).append(item)

def q(sql):
    o = db.psql(sql)
    return [l.strip() for l in o.split("\n")[2:] if l.strip() and not l.startswith("(")]

# 6 ── Two functions writing the same table, one with fewer checks ──────────
# 085 found approval_threshold_set vs set_approval_threshold; 088 found
# bk_journal_post bypassing the threshold. Both were a second path round a
# control. Look for pairs whose names are anagrams of each other's words.
names = q("SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';")
byword = {}
for n in names:
    key = tuple(sorted(n.split('_')))
    byword.setdefault(key, []).append(n)
for key, group in byword.items():
    if len(group) > 1:
        lens = {}
        for g in group:
            r = q(f"SELECT length(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='{g}' LIMIT 1;")
            lens[g] = int(r[0]) if r else 0
        add2('SAME WORDS, DIFFERENT FUNCTION', f"{group} sizes {lens}")

# 7 ── A control table that is empty, so the control cannot fire ────────────
# 087 found app_user empty, so segregation of duties could never trigger.
for tbl, why in [('sod_conflict', 'segregation of duties rules'),
                 ('app_user', 'who functional roles can be granted to'),
                 ('journal_approval_rule', 'journal approval thresholds'),
                 ('bank_match_rule', 'bank auto-matching rules'),
                 ('review_frequency', 'periodic review intervals')]:
    r = q(f"SELECT count(*) FROM {tbl};")
    if r and r[0] == '0':
        add2('CONTROL TABLE EMPTY', f"{tbl} — {why}")

# 8 ── A function that can return nothing without raising ───────────────────
r = q("SELECT function_name || ' — ' || note FROM silent_noop_candidates();")
for x in r[:10]: add2('CAN SILENTLY DO NOTHING', x)

print()
print("=== part two ===")
print(json.dumps(f2, indent=1))
