#!/usr/bin/env python3
"""EVERY check against EVERY file. One pass, one complete list."""
import re, os, glob, json, sys
ROOT='/home/claude/chk/repo'; SRC=os.path.join(ROOT,'src')
jsx={os.path.basename(f):open(f,encoding='utf8',errors='replace').read() for f in glob.glob(os.path.join(SRC,'*.jsx'))}
js ={os.path.basename(f):open(f,encoding='utf8',errors='replace').read() for f in glob.glob(os.path.join(SRC,'*.js'))}
shell=jsx.get('affinity_core_unified_v3.jsx','')
rendered={m for m in re.findall(r'import\s+\w+\s+from\s+"\./(affinity_core_\w+)"', shell)}
F={}
def add(c,i): F.setdefault(c,[]).append(i)

# 1 save button that only closes
for f,s in jsx.items():
    for m in re.finditer(r'<button[^>]*onClick=\{\(\)\s*=>\s*set\w+\((?:null|false)\)\}[^>]*>\s*([^<]{2,44}?)\s*</button>', s):
        if re.match(r'(?i)(save|submit|create|add|record|post|confirm|log|apply|ok|send|generate|issue)\b', m.group(1).strip()):
            add('A: form discards input', f'{f}: {m.group(1).strip()}')

# 2 onClick that does nothing at all
for f,s in jsx.items():
    for m in re.finditer(r'<button[^>]*onClick=\{\(\)\s*=>\s*\{?\s*\}?\s*\}[^>]*>\s*([^<]{2,44}?)\s*</button>', s):
        add('B: button does nothing', f'{f}: {m.group(1).strip()}')

# 3 ternary with identical branches
for f,s in jsx.items():
    for m in re.finditer(r'\?\s*([^:;{}\n]{2,60}?)\s*:\s*([^;{}\n]{2,60}?)(?=[;\)\n])', s):
        a,b=re.sub(r'\s+','',m.group(1)),re.sub(r'\s+','',m.group(2))
        if a==b and len(a)>4: add('C: ternary branches identical', f'{f}: {m.group(0)[:52]}')

# 4 namespace never imported
known={'Math','JSON','Object','Array','String','Number','Date','React','Promise','URL','DOM','Intl'}
for f,s in jsx.items():
    ns=set(re.findall(r'import \* as (\w+) from',s))
    nm=set(x.strip().split(' as ')[-1] for g in re.findall(r'import \{([^}]*)\} from',s) for x in g.split(','))
    lo=set(re.findall(r'(?<![\w.])([A-Z][A-Z0-9_]*)\s*=(?!=)',s))
    de=set(x.strip().split(':')[-1].strip() for g in re.findall(r'(?:const|let)\s*\{([^}]*)\}\s*=',s) for x in g.split(','))
    for u in set(re.findall(r'(?<![\w.])([A-Z][A-Z0-9_]{1,7})\.\w+\s*\(',s)):
        if u not in ns|nm|lo|de|known: add('D: namespace not imported', f'{f}: {u}')

# 5 await on a member that the namespace does not export
exports={}
for f,s in js.items():
    exports[f]=set(re.findall(r'export const (\w+)',s))|set(re.findall(r'export function (\w+)',s))
for f,s in jsx.items():
    for alias,mod in re.findall(r'import \* as (\w+) from "\./(\w+)"',s):
        modf=mod+'.js'
        if modf not in exports: continue
        for used in set(re.findall(alias+r'\.(\w+)\s*\(',s)):
            if used not in exports[modf]: add('E: calls a function the module does not export', f'{f}: {alias}.{used} from {mod}')

# 6 hardcoded identity in a FORM DEFAULT (not sample data)
for f,s in jsx.items():
    for m in re.finditer(r'setForm\(\s*\{[^}]*?(assignee|owner|preparedBy|createdBy|user)\s*:\s*"(Andrew|Andy) Morgan"',s):
        add('F: form default hardcodes a person', f'{f}: {m.group(1)}')

# 7 a module imported but never rendered, or rendered but superseded
for f in jsx:
    base=f[:-4]
    # A module can be reached through another module rather than the shell —
    # notifications sits inside Tasks, report_builder inside Reporting, and the
    # entity chart inside Entity Admin. Checking only the shell reported all
    # three as unreachable when every one of them is on screen.
    if base.startswith('affinity_core_') and base not in rendered and base != 'affinity_core_unified_v3':
        if not re.search(r'export default', jsx[f]): continue
        imported_elsewhere = any(base in other for name, other in jsx.items() if name != f)
        if imported_elsewhere: continue
        add('G: module exists and nothing renders it', base)

print(json.dumps(F, indent=1, sort_keys=True))
