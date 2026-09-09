# Getting Affinity Core live for testing

Written for the state of the build at commit `26c48af`, 495 tests passing.

---

## 1. Run the outstanding SQL

Your production database is up to date through `063`. Run these, in order, in the
Supabase SQL editor:

```
064_entity_responsibilities.sql
065_entity_creation_and_handover.sql
066_accounting_read_layer.sql
067_payables_controls.sql
068_trust_read_layer.sql
069_statutory_accounts_model.sql
070_statutory_accounts_engine.sql
071_statement_formats.sql
072_cash_flow_and_documents.sql
073_intercompany_read_layer.sql
074_consolidate_accounts_models.sql
075_month_end_close.sql
076_fee_transfers_and_intercompany.sql
077_accounts_workflow_and_thresholds.sql
078_demo_data_management.sql
079_payroll_rates_and_allocations.sql
080_authoring_formats_and_checklists.sql
081_obligation_schedules.sql
```

Order matters — several build on the one before. Each is safe to re-run, so if
one fails part way you can fix and run it again.

**Watch for one thing.** `074` consolidates two parallel accounts-production
models and drops the duplicate I created in `069`. It reports
`accounts_set (my duplicate) | dropped` at the end. If it does not, stop and
tell me rather than continuing.

---

## 2. Settings that are not code

These matter more than anything in the SQL, because they are the difference
between a system people can test and one that leaks or breaks.

| Setting | Where | Why |
|---|---|---|
| **Turn off "Allow new users to sign up"** | Supabase → Authentication → Sign In / Providers | Anyone in your Entra tenant who finds the URL currently gets a Core account |
| **Upgrade off the free plan** | Supabase → Settings → Billing | Free projects pause after a week idle. Mid-test that looks exactly like the system breaking |
| **Session timeout** | Supabase → Authentication → Sessions | Currently never. A laptop left open stays signed in |
| **Rotate the GitHub token** | GitHub → Settings → Developer settings | The one from this session is in the chat history |
| **Get the Entra secret expiry** | From Carolyne | When it lapses, sign-in stops firm-wide with no warning and no interpretable error |

---

## 3. What testers will find, and what to tell them

Being straight about this shortens the feedback loop. Without it you will get
the same three reports twenty times.

**Every client entity is sample data.** All 18 are flagged and show
"DEMO DATA — NOT A REAL CLIENT" as the first badge, with `[DEMO]` on anything
newly created. Nothing in them is real. Real client records have not been
migrated.

**Statutory accounts cannot be finalised yet.** No framework has a verified
disclosure checklist, so the Frameworks tab shows what each one needs. That is
deliberate: Core will not produce a set that looks complete on a basis nobody
has established.

**Four jurisdictions have no obligation schedule.** Isle of Man, Cyprus, UK and
USA show "nothing recorded", and Malta and Cayman's 15 entries show as
unconfirmed. Deadlines are not pre-filled because a wrong date in a compliance
tracker is worse than a visibly empty one.

**Payroll rates are empty for all six jurisdictions.** Budgets will run on
nothing until they are entered.

**Roughly 20 buttons do not work**, each with a tooltip saying why — most need
a third party (bank feed, payment provider, regulator portal authentication).
Hovering tells them whether it is a missing feature or a missing integration.

**No journal requires a second approval.** That is your policy, confirmed. The
mechanism exists if you ever want it.

---

## 4. Reference data to enter, and who enters it

Each of these is now enterable in Core. None needs a developer.

| Data | Who | Where in Core |
|---|---|---|
| Payroll rates per jurisdiction | Neil | Planning (rates are effective-dated, agreed, then locked) |
| Group allocation percentages | Neil | Same — must total 100% before it can be agreed |
| Disclosure checklists per framework | Accountants | Fiduciary reporting → Frameworks |
| Required document lists | Accountants | Same |
| Presentation formats for Cayman, FRS 105, IOM GAAP, US GAAP | Accountants | Same |
| Obligation schedules for IOM, Cyprus, UK, USA | Compliance | Jurisdictions → Add an obligation |
| Confirming Malta and Cayman's migrated obligations | Compliance | Same — needs a legislation source and an owner each |
| Journal approval thresholds | Only if you change the policy | System admin |

**Start with the obligation schedules.** They are the only reference data that
affects whether something gets missed rather than only how a figure is
calculated.

---

## 5. Suggested order for going live

1. Run the SQL (step 1)
2. Apply the settings (step 2) — the signup toggle before anyone gets the URL
3. Sign in yourself and walk one entity end to end
4. Point two or three people at it, with the "what testers will find" list
5. Enter the obligation schedules while testing runs — they are independent
6. Widen access once the first round of feedback is in

**On Azure:** it is not on the critical path. Netlify works, and the address
staff bookmark should be the permanent custom domain rather than either
default. Move when the subscription is ready and do the domain at the same
time — one round of Supabase URL reconfiguration instead of two.

---

## 6. The one thing I cannot do

Use it. My testing is a local database and a headless browser, and today three
duplications and several wrong schema assumptions were caught only by running
things. An hour of you actually clicking through will find what I cannot.

Anything blank that should not be, any figure that looks wrong, any screen that
does not do what its buttons suggest — that is the feedback worth having.
