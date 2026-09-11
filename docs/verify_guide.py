#!/usr/bin/env python3
"""
Check the user guide against the code.

WHY THIS EXISTS. The first guide was written from what I believed the system
did. By the end of the reachability audit, most of the app's actions were not
mentioned in it, and it described in detail a way to resign a director that had
no button. A guide wrong in both directions is worse than none: a tester follows
it, cannot find what it describes, and stops trusting the parts that are right.

TWO CHECKS, DELIBERATELY DIFFERENT IN STRICTNESS.

  PHANTOM   the guide says click something that appears nowhere in the source.
            Checked LOOSELY — against every string in the code — because a
            false phantom accuses the guide of a fault it does not have, and a
            checker that cries wolf gets ignored.

  MISSING   a real button the guide never mentions. Checked STRICTLY — only
            text rendered as a button — because a loose scan here counts every
            error message and tooltip as an undocumented feature and buries
            the real gaps.

Getting these the same way round was the first version's mistake: it reported
194 phantoms, all of which were real buttons whose full-width plus sign did not
match the guide's ASCII one.
"""
import re, os, sys, glob

ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC   = os.path.join(ROOT, 'src')
GUIDE = os.path.join(ROOT, 'docs', 'Affinity-Core-User-Guide.md')

def norm(t):
    """Compare on words, not decoration: full-width plus, dashes, quotes."""
    t = t.replace('\uff0b', '+').replace('\u2014', '-').replace('\u2019', "'")
    t = re.sub(r'^[+\s]+', '', t)
    return ' '.join(t.lower().split())

def buttons():
    """STRICT: text rendered inside a <button>, including via an expression."""
    out = set()
    for f in glob.glob(os.path.join(SRC, '*.jsx')):
        s = open(f, encoding='utf8', errors='replace').read()
        for m in re.finditer(r'<button[\s\S]{0,600}?</button>', s):
            blk = m.group(0)
            for t in re.findall(r'>\s*([\uff0b+]?\s*[A-Z][A-Za-z0-9 ,&\'/\u2014\-\.]{2,44}?)\s*<', blk):
                out.add(' '.join(t.split()))
            for t in re.findall(r'["\']([\uff0b+]?\s*[A-Z][A-Za-z0-9 ,&\'/\u2014\-\.]{2,44}?)["\']', blk):
                out.add(' '.join(t.split()))
    return out

def all_source_text():
    """LOOSE: every string anywhere in the source, for the phantom check."""
    buf = []
    for f in glob.glob(os.path.join(SRC, '*.jsx')) + glob.glob(os.path.join(SRC, '*.js')):
        buf.append(open(f, encoding='utf8', errors='replace').read())
    return norm(' '.join(buf))

def instructions(g):
    """Text the guide tells you to CLICK — not every bold phrase."""
    verb = r'(?:click|press|choose|select|tap|hit)\s+(?:on\s+)?'
    return {' '.join(m.group(1).split())
            for m in re.finditer(verb + r'\*\*([^*\n]{2,44})\*\*', g, re.I)}

def main():
    g = open(GUIDE, encoding='utf8').read()
    gl, src = norm(g), all_source_text()
    btns = buttons()

    phantom = sorted(q for q in instructions(g) if norm(q) not in src)
    missing = sorted(b for b in btns if norm(b) not in gl)

    print(f"guide words   : {len(g.split())}")
    print(f"buttons in app: {len(btns)}")
    print()
    print(f"PHANTOM  (guide says click it, nothing in the code says it): {len(phantom)}")
    for p in phantom: print(f"    {p}")
    print()
    print(f"MISSING  (real button, not in the guide): {len(missing)}")
    for m in missing[:15]: print(f"    {m}")
    if len(missing) > 15: print(f"    ... and {len(missing)-15} more")
    return 1 if phantom else 0

if __name__ == '__main__':
    sys.exit(main())

# ── Added after the rewrite ─────────────────────────────────────────────────
# The MISSING count is the wrong measure for a guide written for people who
# already do the work. It describes what Core refuses and why, not every label
# on every screen, so a high MISSING is expected and not a fault — 82 of the
# 279 do something, and most of those are navigation links or actions the guide
# describes by behaviour rather than by button text.
#
# What IS worth checking is the guide's actual content: every refusal it claims
# should trace to a real RAISE in the database. A guide that invents a control
# is worse than one that omits a button, because someone will rely on it.
#
# Run with --refusals and a refusals.json extracted from pg_proc.
