import re, json, sys
# Skip the cover and contents pages when locating headings. Without this the
# search matches the contents page itself — which now lists every heading —
# and reports almost everything as page 2.
SKIP = 2
pages = open('pass1.txt', encoding='utf8', errors='replace').read().split('\f')
md = open('Affinity-Core-User-Guide.md', encoding='utf8').read()
heads = []
for m in re.finditer(r'^(#{1,3})\s+(.*)$', md, re.M):
    lvl = len(m.group(1)); txt = m.group(2).replace('**', '').strip()
    if lvl == 1 and txt.startswith('Affinity Core — User Guide'): continue
    heads.append((lvl, txt))
found = {}
for lvl, txt in heads:
    needle = re.sub(r'\s+', ' ', txt)[:44]
    for pno, pt in enumerate(pages, 1):
        if pno <= SKIP: continue
        if needle and needle in re.sub(r'\s+', ' ', pt):
            found[txt] = pno; break
json.dump([{"level": l, "text": t, "page": found.get(t)} for l, t in heads],
          open('toc.json', 'w'), indent=0)
loc = sum(1 for _, t in heads if t in found)
print(f"{loc}/{len(heads)} headings located (skipping the first {SKIP} pages)")
bad = [t for _, t in heads if found.get(t) in (None, 1, 2)]
print("suspicious:", bad[:4] if bad else "none")
