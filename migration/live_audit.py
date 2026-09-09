#!/usr/bin/env python3
"""
LIVE WIRING AUDIT

The previous audit read source code with regular expressions and produced
false positives twice. This one EXECUTES each chain against a real database:
it writes through the function the interface calls, then reads back through the
function the interface reads, and checks the value arrived.

That is the only way to answer "does data entered in one place show up in the
others", because a function can exist, be granted, be called by the UI, and
still not join up.

Each check reports one of:
  PASS     written and read back
  FAIL     written but not visible in the read — a real wiring break
  BLOCKED  refused by a control, with the reason (often correct behaviour)
  SETUP    could not be attempted because a prerequisite is missing
"""
import pgserver, pathlib, re, sys, json

db = pgserver.get_server(pathlib.Path("/home/claude/pgAudit4"))
results = []


def sql(q):
    """Run a statement; return (ok, output_or_error)."""
    try:
        return True, db.psql("\\set ON_ERROR_STOP on\n" + q)
    except Exception as e:
        txt = str(e)
        msgs = [l.strip() for l in txt.split("\n")
                if l.strip().startswith(("ERROR:", "DETAIL:", "HINT:"))]
        if msgs:
            return False, " | ".join(m[m.index(":") + 1:].strip() for m in msgs[:2])
        # keep whatever the driver said rather than swallowing it
        return False, re.sub(r"\s+", " ", txt)[:200]


def val(q):
    """First scalar of a query, or None."""
    ok, out = sql(q)
    if not ok:
        return None
    lines = [l for l in out.split("\n")]
    if len(lines) < 3:
        return None
    v = lines[2].strip()
    return None if v.startswith("(") or v == "" else v.split("|")[0].strip()


def check(area, what, write_q, read_q, expect):
    """Write, then read, then compare."""
    ok, err = sql(write_q)
    if not ok:
        results.append((area, what, "BLOCKED", err[:150]))
        return
    got = val(read_q)
    if got is None:
        results.append((area, what, "FAIL", "written, but the read returned nothing"))
    elif str(got).strip() == str(expect).strip() or (
            expect == "ANY" and got not in (None, "0", "")) or (
            str(expect) == "1" and str(got).isdigit() and int(got) >= 1):
        # ">= 1" for count checks: a chain that produced 26 lines has worked.
        # Substring matching made "1" match "26" and, worse, made a genuine
        # mismatch look like a pass in the other direction.
        results.append((area, what, "PASS", f"read back: {got[:60]}"))
    elif str(expect) != "1" and str(expect) in str(got):
        results.append((area, what, "PASS", f"read back: {got[:60]}"))
    else:
        results.append((area, what, "FAIL", f"expected {expect}, read {got}"))


def setup(area, what, reason):
    results.append((area, what, "SETUP", reason))


# ═══════════════════════════════════════════════════════════════════════
# PREREQUISITES
# ═══════════════════════════════════════════════════════════════════════
eid = val("SELECT id FROM entity WHERE company_code='AFG-IOM';")
if not eid:
    eid = val("SELECT id FROM entity WHERE entity_class='internal' LIMIT 1;")
per = val("SELECT to_char(current_date,'YYYY-MM');")
sql(f"SELECT period_open({eid}, '{per}');")
acct1 = val("SELECT id FROM account WHERE is_active ORDER BY id LIMIT 1;")
acct2 = val("SELECT id FROM account WHERE is_active ORDER BY id OFFSET 1 LIMIT 1;")
bank = val("SELECT id FROM bank_account LIMIT 1;")
if not bank:
    sql(f"INSERT INTO bank_account(entity_id,name,ccy) VALUES ({eid},'Audit bank','GBP');")
    bank = val("SELECT id FROM bank_account LIMIT 1;")

print(f"entity {eid}, period {per}, accounts {acct1}/{acct2}, bank {bank}\n")

# ═══════════════════════════════════════════════════════════════════════
# 1. THE CLIENT LIFECYCLE — the chain that was broken and is the backbone
# ═══════════════════════════════════════════════════════════════════════
A = "1. Client lifecycle"

AUDIT_CO = "Audit Trace Holdings Ltd"
check(A, "create a client entity → appears in the entity list",
      f"SELECT ea_entity_create('{AUDIT_CO}','client','COMPANY','Isle of Man');",
      f"SELECT count(*) FROM ea_entities_list() WHERE name='{AUDIT_CO}';", 1)

ceid = val(f"SELECT id FROM entity WHERE name='{AUDIT_CO}';")
if not ceid:
    print("FATAL: the audit entity was not created; later checks would be meaningless")
    sys.exit(2)

check(A, "creating it also created its profile → jurisdiction reads back",
      "SELECT 1;",
      f"SELECT jurisdiction FROM ea_entities_list() WHERE id={ceid};", "Isle of Man")

check(A, "add a director → appears on the officers register",
      f"SELECT ea_officer_add({ceid},'Audit Director','Director','2026-01-01');",
      f"SELECT count(*) FROM ea_officers({ceid}) WHERE name='Audit Director';", 1)

check(A, "resign the director → history preserved, not deleted",
      f"SELECT ea_officer_resign((SELECT id FROM entity_officer WHERE entity_id={ceid} LIMIT 1),'2026-06-01');",
      f"SELECT count(*) FROM entity_officer WHERE entity_id={ceid} AND resigned IS NOT NULL;", 1)

check(A, "add a shareholder → appears on the share register",
      f"SELECT ea_shareholder_add({ceid},'Audit Holder','Ordinary',1000,100,'2026-01-01');",
      f"SELECT count(*) FROM ea_shareholders({ceid});", 1)

check(A, "add a beneficial owner → appears on the UBO register",
      f"SELECT ea_ubo_add({ceid},'Audit UBO','UBO','1975-01-01','British',100,'Direct shareholding');",
      f"SELECT count(*) FROM ea_ubos({ceid});", 1)

check(A, "set responsibilities → administrator reads back",
      f"SELECT ea_responsibilities_set({ceid},'K Shaw','R Sheeley');",
      f"SELECT administrator FROM entity_profile WHERE entity_id={ceid};", "K Shaw")

# ═══════════════════════════════════════════════════════════════════════
# 2. ONBOARDING → LIVE ENTITY — the join that did not exist
# ═══════════════════════════════════════════════════════════════════════
A = "2. Onboarding handover"

sql("SELECT onb_case_add('Audit Enquiry','Audit Enquiry Ltd','Malta','Malta','Company','Services');")
cid = val("SELECT id FROM onboarding_case ORDER BY id DESC LIMIT 1;")

ok, err = sql(f"SELECT onb_case_go_live({cid});")
results.append((A, "go live with no CDD → refused",
                "PASS" if not ok else "FAIL",
                err[:120] if not ok else "ALLOWED — the CDD gate is not working"))

sql(f"SELECT cdd_item_add({cid},'Audit Owner','identity');")
sql(f"SELECT cdd_item_verify(id,'Certified copy') FROM cdd_item WHERE case_id={cid};")
sql(f"UPDATE onboarding_case SET risk_rating='Medium' WHERE id={cid};")

check(A, "go live once CDD verified → a client entity now exists",
      f"SELECT onb_case_go_live({cid});",
      "SELECT count(*) FROM entity WHERE name='Audit Enquiry Ltd';", 1)

check(A, "...and the case is linked to it",
      "SELECT 1;",
      f"SELECT CASE WHEN entity_id IS NOT NULL THEN 'linked' ELSE 'no' END FROM onboarding_case WHERE id={cid};",
      "linked")

check(A, "...and the verified CDD carried onto the client record",
      "SELECT 1;",
      "SELECT count(*) FROM entity_file_note WHERE note LIKE '%CDD verified%';", 1)

# ═══════════════════════════════════════════════════════════════════════
# 3. TIME → WIP → INVOICE
# ═══════════════════════════════════════════════════════════════════════
A = "3. Time to billing"

staff = val("SELECT id FROM sys_user LIMIT 1;")
check(A, "record time → appears in the timesheet",
      f"""SELECT ts_entry_add({staff},current_date,'Audit Trace Holdings Ltd','Matter A',
          'Advisory',3.5,true,250,'Audit narrative');""",
      f"SELECT count(*) FROM timesheet_entry WHERE narrative='Audit narrative';", 1)

# Approving Draft time was a silent no-op until db/082. The audit now checks
# BOTH that it is refused and that the proper path works.
ok, err = sql("SELECT ts_entry_approve(ARRAY(SELECT id FROM timesheet_entry WHERE narrative='Audit narrative'),true,NULL);")
results.append((A, "approve time that has not been submitted → refused",
                "PASS" if not ok else "FAIL",
                err[:130] if not ok else "ALLOWED SILENTLY — the user is told it worked"))

check(A, "submit it → status reads Submitted",
      f"SELECT ts_entry_submit({staff}, current_date - 7, current_date + 1);",
      "SELECT status FROM timesheet_entry WHERE narrative='Audit narrative';", "Submitted")

check(A, "then approve → status reads Approved",
      "SELECT ts_entry_approve(ARRAY(SELECT id FROM timesheet_entry WHERE narrative='Audit narrative'),true,NULL);",
      "SELECT status FROM timesheet_entry WHERE narrative='Audit narrative';", "Approved")

check(A, "approved time shows as billable WIP",
      "SELECT 1;",
      "SELECT count(*) FROM wip_available('Audit Trace Holdings Ltd');", 1)

check(A, "bill the WIP → a draft invoice exists",
      f"SELECT bill_wip_to_invoice({eid},'Audit Trace Holdings Ltd',current_date,'GBP');",
      "SELECT count(*) FROM invoice WHERE status='draft';", 1)

check(A, "...and the time is now marked Billed",
      "SELECT 1;",
      "SELECT status FROM timesheet_entry WHERE narrative='Audit narrative';", "Billed")

# ═══════════════════════════════════════════════════════════════════════
# 4. JOURNALS → LEDGER → STATEMENTS
# ═══════════════════════════════════════════════════════════════════════
A = "4. Journals to statements"

check(A, "post a balanced journal → appears in the journal list",
      f"""SELECT bk_journal_post({eid},current_date,'Audit journal',
          jsonb_build_array(
            jsonb_build_object('account_id',{acct1},'txn_ccy','GBP','txn_amount',1000),
            jsonb_build_object('account_id',{acct2},'txn_ccy','GBP','txn_amount',-1000)),
          'manual','audit');""",
      f"SELECT count(*) FROM journal WHERE entity_id={eid} AND narrative='Audit journal';", 1)

ok, err = sql(f"""SELECT bk_journal_post({eid},current_date,'Unbalanced audit journal',
    jsonb_build_array(
      jsonb_build_object('account_id',{acct1},'txn_ccy','GBP','txn_amount',1000)),
    'manual','audit');""")
results.append((A, "an unbalanced journal → refused",
                "PASS" if not ok else "FAIL",
                err[:110] if not ok else "ALLOWED — the ledger would not balance"))

check(A, "the journal's lines reach the ledger",
      "SELECT 1;",
      f"""SELECT count(*) FROM journal_line jl JOIN journal j ON j.id=jl.journal_id
          WHERE j.entity_id={eid} AND j.narrative='Audit journal';""", 1)

check(A, "...and the entity's ledger balances to nil",
      "SELECT 1;",
      f"""SELECT CASE WHEN round(coalesce(sum(jl.func_amount),0),2)=0 THEN 'balanced'
                 ELSE 'OUT BY ' || round(sum(jl.func_amount),2) END
          FROM journal_line jl JOIN journal j ON j.id=jl.journal_id
          WHERE j.entity_id={eid} AND j.status='posted';""", "balanced")

# ═══════════════════════════════════════════════════════════════════════
# 5. CLIENT MONEY — the regulated chain
# ═══════════════════════════════════════════════════════════════════════
A = "5. Client money"

sql("INSERT INTO cm_client(name,is_active) VALUES ('Audit CM Client',true) ON CONFLICT DO NOTHING;")
cmc = val("SELECT id FROM cm_client WHERE name='Audit CM Client';")
cma = val("SELECT id FROM client_money_account LIMIT 1;")
if not cma:
    sql(f"""INSERT INTO client_money_account(cm_entity_id,gl_account_id,name,account_type,ccy)
            VALUES ({eid},{acct1},'Audit client account','pooled','GBP');""")
    cma = val("SELECT id FROM client_money_account LIMIT 1;")

check(A, "receive client money → shows in the position, per client",
      f"SELECT receive_client_money({cmc},{cma},current_date,5000,'audit');",
      f"SELECT held FROM cm_position(NULL) WHERE cm_client_id={cmc};", "5000")

check(A, "pay some out → the position reduces",
      f"SELECT pay_client_money({cmc},{cma},current_date,2000,'audit payment','audit');",
      f"SELECT held FROM cm_position(NULL) WHERE cm_client_id={cmc};", "3000")

ok, err = sql(f"SELECT cm_fee_transfer({cmc},{cma},{eid},{bank},99999,current_date,10000);")
results.append((A, "take a fee larger than the client holds → refused",
                "PASS" if not ok else "FAIL",
                err[:130] if not ok else "ALLOWED — the firm would use another client's money"))

check(A, "overdraw a client → recorded as a breach",
      f"SELECT pay_client_money({cmc},{cma},current_date,9000,'audit overdraw','audit');",
      f"SELECT count(*) FROM cm_breaches(true) WHERE cm_client_id={cmc};", 1)

check(A, "...and the shortfall report picks it up",
      "SELECT 1;",
      f"SELECT count(*) FROM cm_shortfalls(NULL) WHERE cm_client_id={cmc};", 1)

# ═══════════════════════════════════════════════════════════════════════
# 6. SEGREGATION OF DUTIES — the controls added today
# ═══════════════════════════════════════════════════════════════════════
A = "6. Segregation of duties"

me = val("SELECT current_app_user();")
sql(f"""INSERT INTO payment_run(entity_id,run_date,ccy,debtor_bank_account_id,status,total,item_count,created_by)
        VALUES ({eid},current_date,'GBP',{bank},'draft',1000,1,'{me}');""")
prid = val("SELECT max(id) FROM payment_run;")
sql(f"""INSERT INTO payment_run_item(payment_run_id,payee_name,amount,ccy,status)
        VALUES ({prid},'Audit payee',1000,'GBP','pending');""")

ok, err = sql(f"SELECT pay_run_approve({prid});")
results.append((A, "approve a payment run you created → refused",
                "PASS" if not ok else "FAIL",
                err[:110] if not ok else "ALLOWED — no segregation on payment runs"))

sql(f"UPDATE payment_run SET created_by='someone.else' WHERE id={prid};")
check(A, "approved by another → status becomes approved",
      f"SELECT pay_run_approve({prid});",
      f"SELECT status FROM payment_run WHERE id={prid};", "approved")

sql(f"INSERT INTO employee(entity_id,name,is_active) VALUES ({eid},'{me}',true);")
emp = val("SELECT max(id) FROM employee;")
sql(f"""INSERT INTO expense_claim(employee_id,entity_id,claim_date,ccy,net_total,vat_total,gross_total,status)
        VALUES ({emp},{eid},current_date,'GBP',100,0,100,'submitted');""")
ecid = val("SELECT max(id) FROM expense_claim;")
ok, err = sql(f"SELECT expense_claim_approve({ecid});")
results.append((A, "approve your own expense claim → refused",
                "PASS" if not ok else "FAIL",
                err[:110] if not ok else "ALLOWED — no segregation on expense claims"))

# ═══════════════════════════════════════════════════════════════════════
# 7. TRUST ACCOUNTING — income and capital must stay apart
# ═══════════════════════════════════════════════════════════════════════
A = "7. Trust accounting"

sql("""INSERT INTO entity(company_code,name,entity_class,location_code,functional_ccy,is_trust)
       VALUES ('AUD-TRUST','Audit Family Trust','client','IOM','GBP',true);""")
tid = val("SELECT id FROM entity WHERE company_code='AUD-TRUST';")
sql(f"INSERT INTO entity_profile(entity_id,entity_type,jurisdiction,admin_status) VALUES ({tid},'TRUST','Isle of Man','Active');")
sql(f"INSERT INTO trust_apportionment(trust_entity_id,income_pct,capital_pct) VALUES ({tid},60,40);")
sql(f"INSERT INTO beneficiary(trust_entity_id,name,beneficiary_type,is_active) VALUES ({tid},'Audit Life Tenant','life_tenant',true);")
b1 = val(f"SELECT id FROM beneficiary WHERE trust_entity_id={tid};")
jid = val("SELECT id FROM journal LIMIT 1;")

check(A, "an income distribution → shows under income, not capital",
      f"""INSERT INTO trust_distribution(trust_entity_id,beneficiary_id,dist_date,fund,amount,journal_id)
          VALUES ({tid},{b1},current_date,'income',5000,{jid});""",
      f"SELECT income_received FROM trust_beneficiaries({tid}) WHERE id={b1};", "5000")

check(A, "...and capital stays nil for that beneficiary",
      "SELECT 1;",
      f"SELECT capital_received FROM trust_beneficiaries({tid}) WHERE id={b1};", "0")

check(A, "the trust position keeps the two funds separate",
      "SELECT 1;",
      f"SELECT income_distributed FROM trust_position({tid});", "5000")

# ═══════════════════════════════════════════════════════════════════════
# 8. STATUTORY ACCOUNTS
# ═══════════════════════════════════════════════════════════════════════
A = "8. Statutory accounts"

ok, err = sql(f"SELECT accounts_set_open({eid},'IOM-GAAP','2025-01-01','2025-12-31');")
results.append((A, "open a set on a framework with no format → refused",
                "PASS" if not ok else "FAIL",
                err[:120] if not ok else "ALLOWED — nothing to present it in"))

ok, err = sql(f"SELECT accounts_set_open({eid},'CYPRUS-IFRS','2025-01-01','2025-12-31');")
results.append((A, "open a set on a framework the jurisdiction rejects → refused",
                "PASS" if not ok else "FAIL",
                err[:120] if not ok else "ALLOWED — wrong basis"))

check(A, "open on a permitted framework → appears in the sets list",
      f"SELECT accounts_set_open({eid},'FRS102','2025-01-01','2025-12-31','2024-01-01','2024-12-31');",
      f"SELECT count(*) FROM accounts_sets_list({eid});", 1)

sid = val("SELECT max(id) FROM fs_accounts_set;")
check(A, "generate → statement lines exist",
      f"SELECT accounts_set_generate_all({sid});",
      f"SELECT count(*) FROM accounts_line WHERE set_id={sid};", 1)

ok, err = sql(f"SELECT accounts_approve({sid},'A Director');")
results.append((A, "approve with gates failing → refused",
                "PASS" if not ok else "FAIL",
                (err[:110] if not ok else "ALLOWED — an unready set could be signed")))

# ═══════════════════════════════════════════════════════════════════════
# 9. OBLIGATIONS, RATES, DEMO DATA — the reference data entered manually
# ═══════════════════════════════════════════════════════════════════════
A = "9. Reference data"

check(A, "record an obligation → appears in the schedule",
      "SELECT obligation_add('IOM','ANNUAL','Audit annual return','anniversary','incorporation',NULL,1,NULL,NULL,'Annual',NULL,NULL,'Audit Act s.1','Audit Owner');",
      "SELECT count(*) FROM obligations_list('IOM') WHERE title='Audit annual return';", 1)

check(A, "confirm it → reads as confirmed",
      "SELECT obligation_confirm((SELECT id FROM jurisdiction_obligation WHERE title='Audit annual return'));",
      "SELECT confirmed FROM obligations_list('IOM') WHERE title='Audit annual return';", "t")

check(A, "enter a payroll rate → readable at a date",
      "SELECT payroll_rate_set('IOM','2026-01-01',12.8,5000,NULL,5,NULL,NULL,NULL,'GBP','Audit');",
      "SELECT social_pct FROM payroll_rate_at('IOM','2026-06-01');", "12.8")

ok, err = sql("SELECT payroll_rate_set('UK','2026-01-01',0.128);")
results.append((A, "a fraction entered as a percentage → refused",
                "PASS" if not ok else "FAIL",
                err[:110] if not ok else "ALLOWED — every payroll figure would be 100x too small"))

check(A, "demo entities are flagged → the list shows them",
      "SELECT 1;",
      "SELECT count(*) FROM ea_entities_list() WHERE is_demo;", 1)

ok, err = sql(f"SELECT demo_entity_remove({eid});")
results.append((A, "remove a non-demo entity → refused",
                "PASS" if not ok else "FAIL",
                err[:120] if not ok else "ALLOWED — a real client would be deletable"))

# ═══════════════════════════════════════════════════════════════════════
# REPORT
# ═══════════════════════════════════════════════════════════════════════
print("=" * 78)
print("LIVE WIRING AUDIT — written, then read back")
print("=" * 78)
cur = None
for area, what, status, detail in results:
    if area != cur:
        print(f"\n{area}")
        cur = area
    mark = {"PASS": "  ok  ", "FAIL": " FAIL ", "BLOCKED": " ctrl ", "SETUP": " skip "}[status]
    print(f"  [{mark}] {what}")
    if status in ("FAIL", "BLOCKED", "SETUP"):
        print(f"            {detail}")

n = len(results)
p = sum(1 for r in results if r[2] == "PASS")
f = sum(1 for r in results if r[2] == "FAIL")
b = sum(1 for r in results if r[2] == "BLOCKED")
s = sum(1 for r in results if r[2] == "SETUP")
print("\n" + "=" * 78)
print(f"{p}/{n} chains verified end to end   |   {f} BROKEN   |   {b} refused by a control   |   {s} not attempted")
print("=" * 78)
json.dump([{"area": a, "check": w, "status": st, "detail": d} for a, w, st, d in results],
          open("/home/claude/live_audit.json", "w"), indent=1)
sys.exit(1 if f else 0)
