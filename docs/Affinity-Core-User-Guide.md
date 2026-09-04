# Affinity Core — User Guide

**Version 1.0 · September 2026**
Internal document — Affinity Group

---

## How to use this guide

Sections 1 to 3 are worth reading before you start. After that, go to the section for the
job you are doing; each one stands on its own.

Where something does not work yet, this guide says so plainly rather than describing it as
though it does. Anything greyed out in the system is deliberate, not broken — hover over it
and it will tell you what it is waiting for.

---

## 1. What Affinity Core is

Affinity Core is Affinity's own practice management platform. It holds the entities we
administer, the compliance work around them, the documents, the time we record, what we
bill, and our own accounts and budgets.

It covers six offices — **Isle of Man, Malta, Cayman Islands, United Kingdom, Miami and
Cyprus** — and two kinds of entity, which the system treats differently:

- **Client entities** — the companies, trusts and foundations we administer for clients.
- **Internal entities** — Affinity's own eight group companies. These are segregated: you
  only see them if you have specifically been granted access, because they hold the firm's
  own statutory records, accounts and bank mandates.

If you cannot see an entity you expect to see, that is the most likely reason. Ask a System
Administrator rather than assuming it is missing.

---

## 2. Signing in

Affinity Core uses your **Microsoft 365 account** — the same one you use for Outlook and
Teams. There is no separate password.

1. Go to the Affinity Core address in your browser.
2. Click **Sign in with Microsoft**.
3. Complete the usual Microsoft sign-in, including MFA if prompted.
4. You are returned to Affinity Core, signed in.

**If the Microsoft button says sign-in is not switched on yet**, IT have not finished the
setup. In the meantime there is a **Continue to preview** option. Be clear about what that
is: it shows demonstration data only. No real client information is reachable that way, so
nothing you do in preview is saved and nothing you see in it is real.

**Signing out** removes your access immediately. So does being removed from Entra by IT,
which is how leavers are handled — there is no separate account here to close.

---

## 3. Finding your way around

### The left-hand menu

Grouped by the kind of work rather than alphabetically:

| Section | Contains |
|---|---|
| **Overview** | Dashboard, Tasks |
| **Core** | Entity Admin, Documents, Timesheets, Reporting, Procedures, Generate doc, Client portal |
| **Compliance** | Compliance, CRM |
| **Onboarding** | Onboarding |
| **Internal Accounts** | WIP, Invoicing |
| **Affinity Accounting** | Bookkeeping, Transactions, Assets & Groups, Financial Reporting, Planning, Consolidation, Accounting admin |
| **People** | Intranet, Assistant |
| **System** | System admin |

You will not see all of these. The menu only shows what your role can open.

### The entity search

Every page that shows client information has the same search box under the page title:

> *Search for an entity by name or reference…*

Type a name or a reference such as `AC-2024-001` and it completes as you type. Entering a
reference resolves to the entity name. The ✕ clears it.

This is the same box everywhere, deliberately. There is no separate way to pick an entity on
different pages, and there are no entity dropdowns to scroll — if you find one, report it.

### Reading the screen

A few conventions used throughout:

- **Amber "Preview data"** — the page is showing demonstration figures, not the database.
- **Green "Live data"** — it is reading real records.
- **Greyed-out buttons** — the action cannot work yet. Hover for the reason; it is usually
  waiting on the write layer.
- **Pill badges** — status. Green is good, amber needs attention, red is a problem.
- **"Internal — Affinity Group"** on an entity means one of our own companies.

---

## 4. Dashboard and Tasks

### Dashboard

Your starting point: entities by jurisdiction, live alerts, reviews falling due, onboarding
in progress and overdue filings. Figures here are operational. **Financial figures are not
on the Dashboard** — revenue, WIP and debt live in Financial Reporting so there is one set
of numbers rather than two that can disagree.

### Tasks

Two tabs:

- **Tasks** — the work assigned to you or your team, with category, entity, assignee, due
  date and status. **＋ Add task** creates one.
- **Activity** — what used to be a separate notifications area. Everything needing
  attention is here: task assignments, approvals, mentions, filing and review dates,
  signature requests.

The useful part of the merge: any item in Activity has a **＋ Task** button. Press it and it
becomes a tracked task, pre-filled with the title, a sensible category, and notes recording
who raised it and when. Use that rather than trying to remember something you have read.

Read state is remembered. **Mark all read** clears the badge.

---

## 5. Entity Admin

The core record for every entity. Search for one and its tabs appear, grouped:

**Entity** — Overview, Officers, Shareholders, Bank accounts, Charges, Assets, Dividends,
Beneficial owners, Meetings, Structure / chart, File notes, Archive, Safe custody, Generate
registers

**Regulatory** — Compliance register
**Registers** — Gaming (appears only for gaming entities)
**Filing Obligations** — FATCA, CRS, Substance

### Working with an entity

1. Search for it by name or reference.
2. The header shows reference, class (client or internal), jurisdiction, type, status and
   risk rating at a glance.
3. Move between tabs to see each register.

### Things worth knowing

- **Documents ↗** in the header opens the Documents module for that entity.
- **Generate register ↗** opens Generate doc to produce a statutory register.
- **Edit entity** is greyed out. Changing entity records needs the write layer.
- **Structure / chart** draws the ownership chain. Useful for CDD and for explaining a
  structure to a client.
- **Gaming** carries the licence position and, beneath it, a **Compliance log** — the same
  17 registers as the Compliance module, scoped to that entity, so gaming obligations are
  recorded in context.

---

## 6. Compliance

Sidebar organised as **Framework** and **Registers**.

### Framework

Overview, CSP licence, AML/CFT framework, Regulatory reporting, Staff training — the
firm-level position rather than any one entity.

### Registers

All 17 registers sit behind one **Registers** entry rather than cluttering the sidebar:

Errors & omissions · Deviations · Complaints · Gifts & hospitality · Conflicts ·
Sanctions · PEPs · Frozen assets · Declined business · Advertising · Outsourcing ·
Cyber incidents · Litigation · Insurance · Key staff · CPD log · Breach log

**To use them:**

1. Click **Registers**. You get a contents view: every register as a card with its entry
   count, and a green badge where entries have actually been recorded.
2. Click a card, or use the dropdown at the top, to open one.
3. **← All registers** returns to the contents view.

The dropdown includes **All registers** so you can move between them without going back
each time.

### Recording an entry

Use **＋ Add entry** within a register. The CPD log and the registers write to the database;
most other registers are read-only until the write layer lands. If the button is greyed out,
that is why.

---

## 7. Documents

The document library, organised by entity.

### Folder structure

18 top-level folders and 88 subfolders: Accounts, Aircraft/Yacht, Bank, Compliance,
Correspondence, Data Protection, Delete Documents, Duty & Taxes, E-Gaming, FINTECH,
Insurance, Investments, Invoices, KYC, Permanent, Property, Statutory, Group.

**Only folders that hold documents for that entity are shown.** A property holding company
does not see eGaming folders. This applies to everyone including administrators.

To file the first document into an empty folder, switch the toggle in the Folders header
from **In use** to **All folders**. Switch it back afterwards.

### Filing a document

1. Search for the entity.
2. Pick the folder, or reveal all folders if the one you need is empty.
3. **↑ Upload**, and it files into the selected folder.

If an entity has nothing filed at all you will see a note saying so rather than an empty
panel.

---

## 8. Timesheets

Tabs: Time entry, WIP by entity, Utilisation, Missing timesheets, Approval queue, Reports.

### Recording time

- **Timer** — set the entity using the search at the top of the page, add matter and work
  type, then start it. The entity for the timer follows the page search rather than being
  chosen separately.
- **＋ Manual entry** — for time recorded after the event.

Search for a person by name using the **person search** on the Time entry tab rather than
scrolling the staff list.

### The other tabs

- **WIP by entity** — unbilled time, ready for invoicing.
- **Utilisation** — chargeable against available hours by person.
- **Missing timesheets** — who has not submitted. Chase from here.
- **Approval queue** — managers approve submitted time.

---

## 9. Reporting

Reporting is the **report builder** and your **saved reports**. There are no pre-built
reports, deliberately: if you can build any report you need, a guessed set of "typical"
reports only takes up space.

**Accounts reporting is not here.** Revenue, WIP, aged debt, P&L and budgets are in
Affinity Accounting → Financial Reporting, reported off the ledger.

### Building a report

1. **Pick your columns.** The left panel lists every section of the system — Entity Admin,
   Owners & UBOs, Directors & Officers, Services, Gaming, Compliance, Documents, Billing &
   WIP, Statutory & Filing, Banking & Assets, Onboarding, CRM & Fees, Time & Recovery, Our
   People, Meetings, Shares & Capital, Charges, Assets & Safe Custody, Dividends, Tax &
   Substance, Procedures & Tasks, Archive & Retention. Expand a section and tick fields.
   You can mix sections freely — that is the point.
2. **Watch the basket.** Chosen columns appear as chips coloured by section. Once you span
   more than one section a *Cross-section* marker appears, so a joined report looks joined.
3. **Add conditions.** Choose a field, an operator and a value. Operators suit the field:
   *includes* for a list, *at least* for a number, *is any of* for a comma-separated list.
   All conditions must be true.
4. **Set the portfolio** — managed entities, Affinity internal, or all.
5. **Read the results.** A band above the column names shows which section each came from.

### Two worked examples

**Licensed gaming companies with beneficial owners in Australia**
Columns: entity name, jurisdiction, licence status, regulator, licence number, beneficial
owners, UBO country of residence. Conditions: licence status *is* Licensed; UBO country of
residence *includes* Australia.

**Entities where we provide directors**
Columns: entity name, jurisdiction, type, directors, number of directors, risk rating,
administrator. Condition: we provide directors *is yes*.

Both ship as starter examples under **Examples to start from**.

### Saving and re-running

Name the report and press **Save report**. It appears on the **Saved reports** tab.

A saved report stores its **definition, not a snapshot**. Re-running it evaluates against
today's data — so "UK client report" picks up new UK clients automatically. Saving again
under the same name updates it rather than creating a duplicate.

Tick **Share** to make a report visible to the whole team; otherwise it is yours. Run counts
show which reports actually get used.

### "Awaiting data"

Some fields are labelled *awaiting data*. The field is catalogued and the report will
include it once the underlying data is connected, but it returns nothing today. This is
shown deliberately so a gap is never mistaken for a nil.

---

## 10. Onboarding

Tabs: Overview, Active onboardings, Transfer-in, Attrition, Client portal.

The route from enquiry to a live entity: enquiry → CDD collection → risk rating → sign-off.
**Active onboardings** shows each case and its stage. **Transfer-in** handles entities coming
from another provider, which have their own fee and information requirements.

Sign-off, CDD source of wealth and funds, and the Zoho signature replacement are write-layer
features and currently read-only.

---

## 11. CRM

The business development pipeline: leads, proposals and fees, sector, and pipeline status
including **Invoice Issued** and **On Hold**.

Fee quoting draws on the same rate card as Invoicing → Fee schedules. If you change a rate,
change it there.

---

## 12. Internal Accounts

### WIP

Unbilled work in progress. Start at all offices and drill down: **office → client → fee
earner**, or search for a client directly using the entity search at the top of the page.

### Invoicing

Tabs: Ad-hoc invoicing, Invoice ledger, By client, Auto-bookkeeping, Aged debt, Retainers,
Credit control, Fee schedules.

- **Ad-hoc invoicing** — raise an invoice outside the retainer cycle.
- **Invoice ledger** — every invoice, searchable by number, amount or status.
- **Aged debt** — current, 31–60, 61–90 and 90+ days.
- **Retainers** — recurring fee invoicing.
- **Credit control** — collection actions.
- **Fee schedules** — standard rates by office and service type, in local currency. This is
  the rate card that drives retainer invoices and proposal fees.

---

## 13. Affinity Accounting

Our own accounts. Seven areas:

| Area | Contains |
|---|---|
| **Bookkeeping** | Sales, Purchases, Cashbook, journals, reports |
| **Transactions** | General Ledger, Accounts Receivable, Accounts Payable, Banking & Reconciliation |
| **Assets & Groups** | Fixed Assets, Intercompany, Consolidation |
| **Financial Reporting** | Cash Flow & Treasury, Tax & VAT, Financial Statements, Management Reports, Auditor Pack |
| **Planning** | Budgeting and forecasting — section 14 |
| **Consolidation** | Group results — section 15 |
| **Accounting admin** | FX rates and multi-currency |

**Financial Reporting → Management Reports** holds P&L by entity, departmental
profitability, revenue by office, revenue against budget and forecast, aged debt summary,
WIP and debtors movement, and financial KPIs.

Set the company you are looking at using the entity search at the top; every tab follows it.

---

## 14. Planning — budgeting and forecasting

Seven tabs. The order below is the order you would use them.

### 14.1 Fees & sales

Where the revenue budget comes from. **Sales are not typed in** — they start from the
recurring fee book.

Each line shows the client, which Affinity company bills it, the service, description,
frequency, amount, currency, whether the 5% uplift applies, status, and the months it runs
between.

- **Frequency** — monthly, quarterly, annual or one-off. This drives both when it is
  invoiced and how it is earned.
- **Uplift** — tick to apply the annual increase.
- **Status** — Recurring, **Lost** (stops in the month you set in *To*) or **New business**
  (starts in the month you set in *From*, and carries the client's sector for reporting).
- **Billed by** — which Affinity company bills it. The revenue lands on that company's
  budget, so this matters.

Beneath the list, **billed against earned by month, with the difference**. This is the part
worth understanding:

> An annual fee is **invoiced** in one month but **earned** across the year by days in
> month. A quarterly fee is invoiced four times but earned across each quarter. The gap
> between invoiced and earned is **deferred income** — and it is what allows a balance sheet
> and a cash flow to be calculated rather than budgeted separately.

Day counts use the actual days in the year, so a leap year is handled correctly.

### 14.2 Staff

Where the staff budget comes from, starting from the payroll file.

Each person shows: name, **employing company**, department, role, payroll region (which
follows the employing company automatically), opening salary, a pay change and the month it
takes effect, bonus, start and leave months, and their cost for the year.

- **Employing company** — whose budget carries this person. Change it and the cost moves.
- **Pay change** — enter the new annual salary and the month it applies from. Gross,
  employer social and pension recalculate from that month, not the whole year.
- **Bonus** — lands in its month, with employer social applied to it.
- **Leaves** — cost stops after that month. **Starts** — cost begins in that month.
- Healthcare, wellness and cinema follow headcount automatically. Do not budget them
  separately.

**Employer on-costs by region.** Employer social and pension are charged at the employing
company's jurisdiction rates, and **ceilings are applied cumulatively** across the year — so
a capped contribution correctly stops once the year's earnings pass the limit rather than
being charged flat every month. The rates, thresholds and ceilings in force are shown in
their own table. They are set by Finance and change every tax year.

### 14.3 Recharges

The blue columns on the right, for people who work across companies.

Press **Recharges ▾** on a row to open up to **six** targets. For each, choose the company
and the percentage. Every percentage is entered per person — there are no default rates.

- The employing company keeps the balance and shows a credit on **Recharged out — direct**.
- The receiving company picks it up on **Recharged in — direct**, converted into **its own**
  budget currency at the year's planning rate.
- **Retained %** shows what stays with the employer. Over 100% is flagged.

**Charging to Affinity Group Limited means one of two things**, so it is set per line with a
**pass on** tick:

- **Left clear — a contribution to group.** Paid by a subsidiary with a share charged across
  for group work performed. That share **stays at group**. This is the usual case, such as an
  Isle of Man employee charging 20% across.
- **Ticked — a conduit.** Group receives the charge and spreads it to the operating companies
  on the group allocation basis. Use this for someone paid by one company but working across
  the whole group.

Getting this wrong is worth avoiding: a contribution marked *pass on* would be pushed
straight back out to the operating companies, including returning part of it to the company
that paid it.

The **group allocation basis** — how group spreads a conduit charge — is shown as its own
table and is set by Finance.

### 14.4 Budget input — the front sheet

Accounts down, months across, with group subtotals and a net result line.

**Cells you cannot type in.** Anything supplied by another tab is locked and shaded, and
carries a **FROM FEES** or **FROM STAFF** badge. Click the badge to jump to the tab where
that figure is actually maintained. Revenue and all staff costs work this way. An editable
cell that another sheet overwrites would be worse than no cell at all.

**Cells you can type in** — direct costs, overheads, recruitment and training.

Working in the grid:

| Action | How |
|---|---|
| Move | Arrow keys |
| Start editing | Enter, or just start typing |
| Next cell | Tab |
| Clear a cell | Delete |
| Paste a block | Copy from Excel and paste — tab or comma separated, from the selected cell |
| Spread a year across months | **spread** beside the account name, then enter the annual figure |
| Undo | **↶ Undo**, up to 25 steps |

Changes save automatically; the header shows when they last saved.

**FORMULA** rows are derived. **ACTUAL** rows come from the ledger. Once a budget is
approved the whole grid becomes read-only.

**Validation** — the drawer lists blank periods, negative figures and unusual margins.
**Submit for approval is blocked while there are errors.**

**Comments** — select a cell and add a note explaining a movement. Approvers see it beside
the figure.

### 14.5 Balance sheet & cash

Calculated from the budget, not budgeted separately.

Set **debtor days** and **creditor days**. The projection returns, by month: invoiced,
earned, costs, receipts, payments, debtors, deferred income, creditors, bank and retained
earnings.

On 35-day terms, nothing is collected in the first month and January's invoice is collected
in February — which is the point of separating invoiced from earned.

A badge confirms **assets less liabilities equals retained earnings in every month**. If the
assumptions ever stop hanging together it will say so rather than quietly producing a wrong
answer.

### 14.6 Workflow

The budget process, in eight stages:

1. **Principles set** — Group finance issues the year's assumptions: headcount, fee uplift,
   growth.
2. **Wish list** — each cost centre owner gathers requirements from their team.
3. **Owner / MD review** — costs reviewed, discussed and amended with the team.
4. **MD consolidated review** — the MD reviews every centre for their office.
5. **Group discussion** — key points agreed with Group before submission.
6. **Submitted to Group finance**
7. **Approved**
8. **Locked** — closed to further change. Reopening is possible and is recorded.

Beneath it, every cost centre with its **named business owner** — sales with the MD, events
with BD, bank charges and depreciation with the Accountant — and the stage each has reached.

Every transition is recorded in the approval history with who and when.

### 14.7 Scenarios and Variance

- **Scenarios** — copies of an approved budget. Changing a scenario never touches the
  approved figures. The comparison shows the *effect of changed drivers* on the result rather
  than two spreadsheets side by side.
- **Variance & analysis** — budget against actual year to date with variance and status,
  revenue by service line, monthly budget against forecast against actual, and key metrics.
  **＋ Explain** attaches a note to a variance.

---

## 15. Consolidation

Five tabs.

- **Cockpit** — an operational control screen. Every group member against seven readiness
  gates: data received, mapped, balanced, translated, intercompany, journals, approved. The
  **first failing gate** is marked, so the blocker is obvious. **Resolve ↗** takes you to it.
- **Data collection** — trial balance imports with checksum, who imported, when, row count
  and status. A failed import says why. **↑ Import trial balance** runs a three-step wizard:
  file, column mapping, then validation showing rows parsed, whether debits equal credits,
  duplicates and unmapped accounts. Re-importing the same entity and period supersedes the
  earlier file rather than duplicating it.
- **Mapping** — local chart to group chart, per entity. **Unmapped accounts block
  consolidation**, and the queue is shown. Mappings are versioned by effective date, so
  restating a prior period uses the mapping that applied then.
- **Intercompany** — both entities, both accounts, both reported amounts, the difference,
  owner and status. Set a **tolerance** and **auto-match within tolerance**. Differences
  inside tolerance are flagged rather than hidden. Anything outside it blocks the run.
- **Runs** — every run with its reference, period, timing, who started it, rules version and
  outcome, so any figure traces back to the run that produced it.

**Running a consolidation:** clear the readiness gates, resolve intercompany differences,
then **Run consolidation**. A blocked run still executes and records why, rather than
refusing silently.

---

## 16. Procedures, Generate doc, Client portal, Intranet

- **Procedures** — Overview, Procedure library, Active runs, History. The written procedures
  staff follow, and where a procedure has been run against an entity.
- **Generate doc** — produces documents from live entity data. Set the entity at the top of
  the page; every document on the page uses it.
- **Client portal** — what a client sees of their own entities.
- **Intranet** — firm news, policies, offices, birthdays and anniversaries. Editable.
- **Assistant** — question-and-answer help across the system.

---

## 17. System admin

Restricted to System Administrators. Eight tabs.

- **Users** — staff, roles, MFA status, office.
- **Roles & permissions** — what each role can do.
- **Permission matrix** — every module broken down by sub-section, expandable, so
  permissions can be seen at the level people actually work. Beneath it, **individual user
  rights** for Affinity's own group companies: a column per company, per person. An override
  replaces the role default.
- **Document permissions** — its own section, because the library is 18 folders and 88
  subfolders. Expand a folder to set View, Add, Edit and Delete per subfolder per role.
  Subfolders inherit their parent unless set explicitly, and an overridden row is badged.
- **Custom fields & lists** — the 28 dropdown lists the system reads: entity type,
  jurisdiction, incorporation regime, officer role, share class, source of wealth and funds,
  verification method, PEP category, risk rating, work type, sector, fee type and more.
  Adding an option here is an administrative change, not a development one. Values in use can
  be retired but not deleted, so existing records keep their value.
- **Procedures & templates** — procedures, workflows, document templates, checklists and
  register definitions, in one place.
- **Audit log** — activity trail.
- **System config** — session, IP and general settings.

### Granting access to Affinity's own companies

1. **Permission matrix**.
2. Scroll to **Individual user rights**.
3. Tick the companies that person should see.

Role defaults are deliberately tight: only Super Admin holds all eight by default, Directors
hold Group and Isle of Man, Managers and Administrators hold none until granted.

---

## 18. What does not work yet, and why

Being straightforward about this saves time reporting things that were never built.

**Waiting on Microsoft sign-in:** the app cannot read the database without an authenticated
session, so most modules show demonstration data until IT complete the Entra setup.

**Waiting on the write layer:** roughly a hundred actions are visibly greyed out. Reading,
searching, filtering and reporting work; saving mostly does not. This includes editing entity
records, most register entries, onboarding sign-off, statutory forms, and posting forms.

**Working today:** the CPD log, compliance registers, saved reports, and the Planning and
Consolidation calculations.

**Preview figures:** the report builder holds 22 sections and 137 fields, of which about
half return data today; the rest are labelled *awaiting data*. Planning and Consolidation
calculate correctly but against preview figures until connected.

**Rates and percentages set by Finance**, currently placeholders: employer social and
pension rates and ceilings for all six regions, budget FX planning rates, and the group
allocation basis.

---

## 19. Getting help

- **Something looks wrong** — note the page, the tab and what you did. "Compliance → Gifts
  register → Add entry does nothing" is actionable; "compliance is broken" is not.
- **Something is greyed out** — hover it first. It will say what it is waiting for.
- **You cannot see an entity** — most likely an access question, particularly for Affinity's
  own companies. Ask a System Administrator.
- **A figure looks wrong in Planning** — check which tab supplies it. Revenue comes from Fees
  & sales, staff costs from Staff. The front sheet only displays them.
- **Rates or percentages look wrong** — those are Finance's to set, not a system fault.

---

*Affinity Core is developed in-house and changes regularly. Where this guide and the system
disagree, the system is right — please flag it so the guide can be corrected.*
