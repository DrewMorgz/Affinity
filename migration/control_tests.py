#!/usr/bin/env python3
"""
Behavioural tests for every control that matters. Run against a real database.

WHY THIS EXISTS, AND WHY IT IS SEPARATE FROM tests/run.cjs. Those tests read
source files and assert that a check is written. These call the database and
assert that the check FIRES. The difference is not academic: a control can be
present in the source, deployed, and still not fire — 087 found a segregation
of duties rule operating on an empty table, which every source-level test
would have passed.

AND A WARNING ABOUT HOW THESE ARE WRITTEN. pgserver's psql() does not raise on
error and does not return the error text. It returns an EMPTY STRING. Checking
`if "ERROR" in output` therefore never matches, and every refusal reads as a
success. I ran a whole session of attack tests that way and reported ten
controls as broken when all ten were working. The helper in dbq.py is the only
correct form: empty return means refused.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from dbq import refused, ok, one

def run(db):
    fails = []
    def check(label, condition, want_refused=True):
        got = bool(condition)
        if got != want_refused:
            fails.append(label)
        print(f"  {'ok ' if got == want_refused else '***'} {label}")

    db.psql("SELECT set_config('request.jwt.claim.email','test@affinityco.com', false);")

    print("double entry")
    J = "SELECT bk_journal_post(3,'2026-09-15',%s,%s::jsonb);"
    two = '[{"account_code":"1000","txn_amount":100},{"account_code":"1010","txn_amount":-100}]'
    check("a one-sided journal is refused",
          refused(db, J % ("'One'", "'" + '[{"account_code":"1000","txn_amount":100}]' + "'")))
    check("an unbalanced journal is refused",
          refused(db, J % ("'Unbal'", "'" + '[{"account_code":"1000","txn_amount":100},{"account_code":"1010","txn_amount":-50}]' + "'")))
    check("a journal with no narrative is refused", refused(db, J % ("''", "'" + two + "'")))
    check("a journal into a closed period is refused",
          refused(db, "SELECT bk_journal_post(3,'2019-01-15','Old','" + two + "'::jsonb);"))
    check("a journal line cannot be written by hand",
          refused(db, "INSERT INTO journal_line (journal_id, account_id, txn_amount, func_amount) VALUES (1,1,100,100);"))

    print("trust funds")
    t = one(db, "SELECT id FROM entity WHERE name ILIKE '%trust%' LIMIT 1;")
    if t:
        check("distributing more than the fund holds is refused",
              refused(db, "SELECT distribute_to_beneficiary(%s,1,current_date,'income',999999,1,2,'x');" % t))
        check("an invalid fund name is refused",
              refused(db, "SELECT distribute_to_beneficiary(%s,1,current_date,'both',10,1,2,'x');" % t))

    print("segregation of duties")
    u = one(db, "SELECT username FROM app_user LIMIT 1;")
    if u:
        db.psql("DELETE FROM app_user_role WHERE username='%s';" % u)
        check("granting a first role works",
              refused(db, "SELECT assign_user_role('%s','preparer');" % u), want_refused=False)
        check("granting the conflicting role is refused",
              refused(db, "SELECT assign_user_role('%s','approver');" % u))
        db.psql("DELETE FROM app_user_role WHERE username='%s';" % u)
    check("granting a role to an unknown user is refused",
          refused(db, "SELECT assign_user_role('nobody@nowhere.com','preparer');"))

    print("reference data sanity")
    check("a negative payroll rate is refused",
          refused(db, "SELECT payroll_rate_set('IOM','2026-01-01',-5,NULL,NULL,NULL,NULL,NULL,NULL,'GBP','x','y');"))
    check("a rate given as a fraction is refused",
          refused(db, "SELECT payroll_rate_set('IOM','2026-01-01',0.128,NULL,NULL,NULL,NULL,NULL,NULL,'GBP','x','y');"))
    check("a negative approval threshold is refused",
          refused(db, "SELECT approval_threshold_set(3,-5);"))

    print("access")
    n = int(one(db, """SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                       WHERE ns.nspname='public' AND has_function_privilege('anon',p.oid,'EXECUTE');""") or 0)
    check("the anonymous key can execute nothing", n == 0)

    print("audit trail")
    b = int(one(db, "SELECT count(*) FROM audit_event;") or 0)
    db.psql("UPDATE entity_ubo SET nationality='AuditProbe' WHERE id=(SELECT min(id) FROM entity_ubo);")
    a = int(one(db, "SELECT count(*) FROM audit_event;") or 0)
    check("a change to a beneficial owner is recorded", a > b)

    print("integrity")
    for label, sql in [
        ("posted journals balance to nil",
         "SELECT count(*) FROM (SELECT 1 FROM journal_line jl JOIN journal j ON j.id=jl.journal_id WHERE j.status='posted' HAVING round(sum(jl.func_amount),2) <> 0) x;"),
        ("every journal balances individually",
         "SELECT count(*) FROM (SELECT journal_id FROM journal_line GROUP BY journal_id HAVING round(sum(func_amount),2) <> 0) x;"),
        ("no orphaned journal lines",
         "SELECT count(*) FROM journal_line jl LEFT JOIN journal j ON j.id=jl.journal_id WHERE j.id IS NULL;"),
    ]:
        check(label, (one(db, sql) or '0') == '0')

    print()
    print(f"{'ALL CONTROLS HOLD' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    return 1 if fails else 0

if __name__ == '__main__':
    import pgserver
    db = pgserver.get_server(pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/home/claude/pgN'))
    sys.exit(run(db))
