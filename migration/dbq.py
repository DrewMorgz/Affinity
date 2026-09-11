"""Correct error detection for pgserver.

db.psql() does NOT raise and does NOT return the error text. On failure it
returns an EMPTY STRING and writes the message to the process's stderr at C
level, where redirect_stdout cannot see it.

Every "ALLOWED" I printed earlier from `if "ERROR" in out` was wrong: `out` was
empty, so the check never matched, and a refusal read as a success. That
inverted the result of every attack test I ran this session.
"""
def ok(db, sql):
    """True if the statement succeeded."""
    return db.psql(sql).strip() != ''

def refused(db, sql):
    """True if the statement was refused."""
    return db.psql(sql).strip() == ''

def rows(db, sql):
    o = db.psql(sql)
    return [l.strip() for l in o.split("\n")[2:] if l.strip() and not l.startswith("(")]

def one(db, sql, default=None):
    r = rows(db, sql)
    return r[0] if r else default
