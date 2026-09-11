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

    print("audit trail cannot be bypassed")
    # A write that cannot be audited must not happen. Tested by blocking
    # audit_event and confirming the underlying write rolls back.
    tgt = one(db, "SELECT id FROM entity_ubo ORDER BY id LIMIT 1;")
    if tgt:
        base = one(db, "SELECT nationality FROM entity_ubo WHERE id=%s;" % tgt)
        db.psql("""CREATE OR REPLACE FUNCTION probe_block_audit() RETURNS trigger
                   LANGUAGE plpgsql AS $probe$ BEGIN
                     RAISE EXCEPTION 'probe'; END $probe$;""")
        db.psql("""CREATE TRIGGER probe_block BEFORE INSERT ON audit_event
                   FOR EACH ROW EXECUTE FUNCTION probe_block_audit();""")
        db.psql("UPDATE entity_ubo SET nationality='ProbeShouldRollBack' WHERE id=%s;" % tgt)
        after = one(db, "SELECT nationality FROM entity_ubo WHERE id=%s;" % tgt)
        db.psql("DROP TRIGGER IF EXISTS probe_block ON audit_event;")
        db.psql("DROP FUNCTION IF EXISTS probe_block_audit();")
        check("a write that cannot be audited is rolled back", after == base)

    print("direct table access")
    # RBAC gates the interface. It does not gate the API — a signed-in user
    # could read any granted table through PostgREST whatever their role. The
    # tables that will hold client data are now closed; reference data stays
    # readable because a caption list is not client information.
    for t in ['crm_prospect', 'periodic_review', 'fs_accounts_set',
              'client_money_reconciliation', 'payroll_rate', 'tp_policy']:
        got = one(db, """SELECT count(*) FROM information_schema.role_table_grants
                         WHERE grantee IN ('anon','authenticated') AND table_schema='public'
                           AND table_name='%s';""" % t)
        check("%s cannot be read directly" % t, (got or '0') == '0')

    print("audit trail")
    b = int(one(db, "SELECT count(*) FROM audit_event;") or 0)
    db.psql("UPDATE entity_ubo SET nationality='AuditProbe' WHERE id=(SELECT min(id) FROM entity_ubo);")
    a = int(one(db, "SELECT count(*) FROM audit_event;") or 0)
    check("a change to a beneficial owner is recorded", a > b)

    print("a missing rate is not zero")
    check("billable time with no rate is refused",
          refused(db, "SELECT ts_entry_add(1,current_date,'RateProbe','M','advice',2,true,NULL,'x');"))
    check("billable time with a zero rate is refused",
          refused(db, "SELECT ts_entry_add(1,current_date,'RateProbe','M','advice',2,true,0,'x');"))
    check("non-billable time with no rate is allowed",
          refused(db, "SELECT ts_entry_add(1,current_date,'RateProbe','M','admin',2,false,NULL,NULL);"),
          want_refused=False)
    db.psql("DELETE FROM timesheet_entry WHERE entity_label='RateProbe';")
    g = one(db, "SELECT id FROM consol_group LIMIT 1;")
    if g:
        db.psql("DELETE FROM fx_rate WHERE rate_date='1990-01-01';")
        check("a consolidation with no FX rate is refused",
              refused(db, "SELECT * FROM consolidated_cta(%s,'1990-01-01','1990-12-31');" % g))

    print("currency")
    eur = one(db, "SELECT id FROM entity WHERE functional_ccy='EUR' LIMIT 1;")
    if eur:
        db.psql("SELECT ea_bank_add(%s,'CcyProbe','Operating');" % eur)
        got = one(db, "SELECT ccy FROM entity_bank WHERE entity_id=%s ORDER BY id DESC LIMIT 1;" % eur)
        check("a EUR entity inherits EUR, not GBP", (got or '').strip() == 'EUR', want_refused=True)
        db.psql("DELETE FROM entity_bank WHERE bank='CcyProbe';")

    print("demo data")
    real = one(db, "SELECT id FROM entity WHERE NOT coalesce(is_demo,false) LIMIT 1;")
    if real:
        check("a real entity cannot be flagged as demo",
              refused(db, "SELECT demo_flag_set(%s, true);" % real))
        check("removing a non-demo entity is refused",
              refused(db, "SELECT demo_entity_remove(%s);" % real))
    check("clearing demo data without the phrase is refused",
          refused(db, "SELECT demo_data_clear('yes');"))

    print("stage order")
    # VERIFIED BY STATE, not by the return value. A multi-statement psql call
    # returns the first statement's output, so a refusal in the second looks
    # like a success — the same detection trap as dbq.py, one level deeper.
    def as_user(email, sql):
        return db.psql("SELECT set_config('affinity.app_user','%s',false); %s" % (email, sql))
    ent = one(db, "SELECT id FROM entity WHERE entity_class='client' LIMIT 1;")
    fw  = one(db, "SELECT code FROM reporting_framework WHERE code IN (SELECT DISTINCT framework_code FROM fs_caption) LIMIT 1;")
    if ent and fw:
        db.psql("DELETE FROM fs_accounts_set WHERE entity_id=%s AND period_start='2025-01-01';" % ent)
        as_user('probe.alice@affinityco.com',
                "SELECT accounts_set_open(%s,'%s','2025-01-01','2025-12-31');" % (ent, fw))
        sid = one(db, "SELECT id FROM fs_accounts_set WHERE entity_id=%s ORDER BY id DESC LIMIT 1;" % ent)
        as_user('probe.bob@affinityco.com', "SELECT accounts_finalise(%s);" % sid)
        st = (one(db, "SELECT status FROM fs_accounts_set WHERE id=%s;" % sid) or '').strip()
        check("a draft set cannot be finalised", st == 'draft')
        as_user('probe.alice@affinityco.com', "SELECT accounts_submit_for_review(%s);" % sid)
        as_user('probe.bob@affinityco.com', "SELECT accounts_finalise(%s);" % sid)
        st2 = (one(db, "SELECT status FROM fs_accounts_set WHERE id=%s;" % sid) or '').strip()
        check("an in-review set cannot be finalised without approval", st2 == 'in_review')
        db.psql("DELETE FROM fs_accounts_set WHERE id=%s;" % sid)

    # Every staged workflow, tested by acting out of order and reading the
    # resulting state. 098 was found this way: accounts_finalise was the only
    # step in any workflow that did not check the one before it, and a draft
    # set went straight to filed.
    print("onboarding gate")
    as_user('probe.alice@affinityco.com',
            "SELECT onb_case_add('Probe','Probe Holdings Ltd','Isle of Man','Isle of Man','Company');")
    cid = one(db, "SELECT id FROM onboarding_case ORDER BY id DESC LIMIT 1;")
    if cid:
        as_user('probe.bob@affinityco.com', "SELECT onb_case_go_live(%s,'PROBE');" % cid)
        check("a case with no CDD cannot go live",
              (one(db, "SELECT stage FROM onboarding_case WHERE id=%s;" % cid) or '').strip() != 'live')
        as_user('probe.alice@affinityco.com',
                "SELECT cdd_item_add(%s,'Probe','passport','probe');" % cid)
        as_user('probe.bob@affinityco.com', "SELECT onb_case_go_live(%s,'PROBE');" % cid)
        check("a case with UNVERIFIED CDD cannot go live",
              (one(db, "SELECT stage FROM onboarding_case WHERE id=%s;" % cid) or '').strip() != 'live')
        db.psql("DELETE FROM cdd_item WHERE case_id=%s; DELETE FROM onboarding_case WHERE id=%s;" % (cid, cid))

    print("attrition sequence")
    ent2 = one(db, "SELECT id FROM entity WHERE entity_class='client' LIMIT 1;")
    if ent2:
        db.psql("DELETE FROM attrition_approval; DELETE FROM attrition_case;")
        as_user('probe.alice@affinityco.com',
                "SELECT attrition_open(%s,'probe','d','a','b',current_date+90);" % ent2)
        ac = one(db, "SELECT id FROM attrition_case ORDER BY id DESC LIMIT 1;")
        napp = lambda: one(db, "SELECT count(*) FROM attrition_approval WHERE case_id=%s;" % ac)
        as_user('probe.carol@affinityco.com',
                "SELECT attrition_approve(%s,'GROUP','Group CEO','skip');" % ac)
        check("the last attrition stage cannot be approved first", napp() == '0')
        as_user('probe.bob@affinityco.com',
                "SELECT attrition_approve(%s,'MANAGER','Manager','ok');" % ac)
        as_user('probe.bob@affinityco.com',
                "SELECT attrition_approve(%s,'MD','Managing Director','same');" % ac)
        check("one person cannot approve two attrition stages", napp() == '1')
        db.psql("DELETE FROM attrition_approval; DELETE FROM attrition_case;")

    print("periodic review gate")
    if ent2:
        db.psql("DELETE FROM periodic_review WHERE entity_id=%s;" % ent2)
        as_user('probe.alice@affinityco.com', "SELECT review_start(%s, current_date);" % ent2)
        rv = one(db, "SELECT id FROM periodic_review ORDER BY id DESC LIMIT 1;")
        as_user('probe.bob@affinityco.com', "SELECT review_approve(%s);" % rv)
        check("a review cannot be approved before it is completed",
              (one(db, "SELECT status FROM periodic_review WHERE id=%s;" % rv) or '').strip() != 'approved')
        db.psql("DELETE FROM periodic_review WHERE id=%s;" % rv)

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
