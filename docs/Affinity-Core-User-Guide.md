# Affinity Core — User Guide

**Version 2, September 2026.** Written for someone who has never seen the
system before.

---

## How to read this guide

You do not need to read it all. It is arranged so you can find the one thing
you need:

- **Part 1** covers signing in and finding your way around. Read this once.
- **Part 2** covers each module in turn. Read only the ones you use.
- **Part 3** covers reference data, month-end and year-end — the periodic work.
- **Part 4** is for administrators.
- **Part 5** covers what does not work yet, and why.

Throughout, anything in a box like this is worth pausing on:

> **Why it works this way.** Where Core refuses to do something, or asks for
> something that seems unnecessary, there is usually a reason connected to
> getting a client's affairs wrong. Those reasons are explained rather than
> left as friction. If a refusal ever seems wrong, that is worth reporting —
> the reasoning may be mistaken.

---

# Part 1 — The basics

## 1.1 What Affinity Core is

Core is Affinity's internal system. It holds the client register, the statutory
records, the compliance calendar, time and billing, and the accounting for both
client structures and the Affinity group itself.

It replaces the situation where the same information lived in several
spreadsheets and nobody was certain which was current.

**Six jurisdictions:** Isle of Man, Malta, Cayman Islands, United Kingdom,
United States (Miami), Cyprus.

**Three service lines:** private wealth and fiduciary, corporate services, and
iGaming.

### What Core is not

It is not the document management system. Documents themselves live in the DMS;
Core records what documents exist, which entity they belong to, and their
retention date. It is not the bank, and it does not move money. It is not a
substitute for professional judgement — it will tell you a filing is overdue,
not whether the filing is right.

## 1.2 Signing in

Core uses your normal Affinity Microsoft account. There is no separate
password.

1. Go to **core.affinityco.com**
2. Click **Sign in with Microsoft**
3. Use your Affinity email and the password you use for Outlook and Teams
4. Approve the multi-factor prompt if asked

You will land on the Dashboard.

### If sign-in does not work

**"You need permission to access this application"** — your account has not
been given access. Contact IT; this is not something you can fix yourself.

**Nothing happens when you click Sign in** — usually a browser blocking the
popup. Try a different browser, or a private window.

**Everyone in the firm cannot sign in at once** — almost certainly the Entra
client secret has expired. This affects everybody simultaneously and needs IT.
It is worth knowing this failure looks alarming and is quick to fix.

> **Why there is no separate password.** Anything holding beneficial ownership
> data should not have its own password to be forgotten, reused or written down.
> Using your Microsoft account means access is removed when someone leaves, in
> one place, by the person who already does that job.

## 1.3 Finding your way around

### The left sidebar

Every module is listed down the left. It is a long list, and you will use a
small part of it. Grouped by what they are for:

**Daily client work**
Dashboard, Tasks, Entity Admin, Documents, Timesheets, Reporting

**Bringing clients in**
CRM, Onboarding

**Keeping clients compliant**
Jurisdictions, Compliance, Procedures, Generate doc

**Billing**
WIP, Invoicing

**Client and group accounting**
Bookkeeping, Transactions, Assets & Groups, Financial Reporting, Accounting
ops, Purchases & AR, Fiduciary reporting, Reports

**Group management**
Planning, Consolidation, Accounting admin

**Other**
Client portal, Intranet, Assistant, System admin

### The top bar

**Office filter.** Restricts everything to one jurisdiction. If a screen looks
emptier than expected, check this first — it is the commonest cause of "my
entities have disappeared".

**Search.** Finds entities, people and modules. Typing a client name is usually
the fastest way to get anywhere.

**Your name.** Sign out is here.

### Badges you will see, and what they mean

These appear throughout and are worth learning once.

| Badge | Meaning |
|---|---|
| **Live data · N entities** (green) | Reading real records from the database |
| **Preview data** (amber) | Showing bundled sample data, not the database. You are probably not signed in |
| **DEMO DATA — NOT A REAL CLIENT** (amber) | This entity is sample data. Nothing on it is real |
| **Unconfirmed** (amber) | Recorded but nobody has verified it against the source |
| **Self-signed** (red) | A control was satisfied by the same person twice — needs review |

> **Why demo records are badged so loudly.** The sample entities read exactly
> like real clients: plausible names, real-looking registration numbers, real
> jurisdictions. That is what makes them useful for training and dangerous in a
> live register. The realistic mistake is not confusing them in the abstract —
> it is filing a real return against a demo entity, or telling a client a figure
> that came from sample data.

## 1.4 Things that apply everywhere

### Nothing is deleted

Core closes records rather than deleting them. A resigned director stays on the
register with a resignation date; a closed entity keeps its history.

> **Why.** The register is a historical record, not a list of current facts. Who
> was a director in 2019 matters, and a register that only shows today cannot
> answer it. This is also why removing an officer asks for a resignation date
> rather than just removing them.

### Two people, not one

Several actions are refused if the same person does both halves: approving a
payment run you created, approving your own expense claim, signing off a client
money reconciliation you prepared, approving accounts you produced, approving a
client review you carried out.

> **Why.** These are the controls a regulator asks for evidence of. A
> reconciliation prepared and signed by one person is exactly what the evidence
> is meant to rule out. Core will name the reason when it refuses.

### Refusals explain themselves

Where Core will not do something, the message says why and usually what to do
instead. They are worth reading rather than dismissing — for example:

> *"Cannot take 3,500.00 from Meridian Holdings — only 2,000.00 is held for that
> client. Taking more would be paying the firm out of another client's money.
> Bill the client and wait for funds, or transfer only the amount held."*

### Empty is not the same as broken

Where Core has no data it says so and says why. "No obligations recorded for
Isle of Man" with an explanation is deliberate: a wrong deadline in a
compliance tracker is worse than a visibly empty one, because someone trusts it
and misses a filing.

---

# Part 2 — The modules

## 2.1 Dashboard

The first screen after signing in. A summary, not a place to do work.

**What is on it:** entities under administration, tasks assigned to you,
obligations falling due, unbilled time, and recent activity.

**How to use it:** as a morning check. Anything needing action links through to
the module that handles it.

**If it looks wrong:** check the office filter in the top bar.

## 2.2 Tasks

Your work list, and the firm's.

### Tabs

**All** — every task assigned to you.
**Unread** — tasks you have not yet opened.

### Creating a task

**+ New task**, then:

| Field | Notes |
|---|---|
| Title | What needs doing, in a few words |
| Category | Groups tasks for reporting |
| Entity | Which client it relates to. Leave blank for internal work |
| Assignee | Who does it |
| Due date | Overdue tasks are flagged red |
| Priority | Sequences your list |
| Notes | Context the assignee will need |

### Completing a task

Open it and click **Complete**. It records who completed it and when, and stays
on the record.

> **Why tasks are not just a to-do list.** Several parts of Core raise tasks
> automatically — an obligation falling due, a review becoming overdue, a
> filing needing chasing. So the list is not only what you typed in; it is also
> what the system noticed.

## 2.3 Entity Admin

The heart of the system. Everything Core knows about a client entity.

Expect to spend more time here than anywhere else, so this section is the
longest.

### Finding an entity

The left panel lists every entity you can see. Three ways to narrow it:

1. **Search box** — matches name or reference. Fastest if you know the client.
2. **Jurisdiction and type filters** — for browsing a portfolio.
3. **Office filter in the top bar** — applies across the whole system.

Click an entity to open it. The header shows its name, reference, jurisdiction,
type, status and risk rating — and the **DEMO DATA** badge if it is sample data.

### Creating an entity

**+ New entity**. You will be asked for:

| Field | Required | Notes |
|---|---|---|
| Name | Yes | The full legal name |
| Entity class | Yes | **Client** for client structures, **Internal** for Affinity group companies |
| Entity type | Yes | Company, Trust, Foundation, Partnership, LLC |
| Jurisdiction | Yes | Must be one Core knows |
| Risk rating | Yes | Drives how often the client is reviewed |
| Administrator | No | Can be set later |
| Incorporation date | No | |
| Registration number | No | |

Core will refuse in three cases, each for a reason:

**A duplicate name in the same jurisdiction.** Two entities with the same name
in the same place is nearly always a mistake, and if it is genuinely not, the
message tells you so you can check first.

**An unknown jurisdiction.** Named explicitly, with the valid options listed,
rather than a database error.

**A missing required field.** Named individually rather than "please complete
all fields".

> **What happens behind the scenes.** Creating an entity produces both the entity
> and its profile record in one step, and generates the AC-YYYY-NNN reference.
> Until recently this did not work at all — the button existed and saved
> nothing. It is worth knowing because it is the reason the reference appears
> automatically rather than being typed.

### The tabs on an entity

#### Overview

The summary: registration details, year end, tax status, FATCA and CRS
classification, business activity, current status and risk rating, and who is
responsible.

**Editing it:** click **Edit entity**. Changes are recorded in the audit trail
with who made them and when.

#### Officers

Directors, secretaries and other officers.

**Adding one:** **+ Add officer**, then name, role, appointment date,
nationality, date of birth, address and tax details.

**Removing one:** you do not remove them. Click **Resign** and give the
resignation date. They stay on the register, marked resigned.

> **Why.** Who was a director on a given date is a matter of record — for
> filings, for liability, and for any later question about who authorised what.
> A register that only shows current officers cannot answer it.

**The 30-day flag.** An appointment or resignation more than 30 days old with
no filing recorded is flagged. Most registries require notification within a
month, and a change nobody filed is the commonest statutory breach in
corporate services.

#### Shareholders

The share register.

**Adding one:** name, share class, number of shares, percentage, and the date
held from.

**Reading it:** percentages should total 100%. Core shows the total so you can
see at a glance whether the register is complete.

#### UBOs

Beneficial owners.

**Adding one:** name, role, date of birth, nationality, ownership percentage,
nature of control, tax identification number and tax residence.

**The completeness check.** Core reports whether the register accounts for
100%, and if not, by how much. This appears both here and on the Statutory
registers screen.

> **Why the percentage matters so much.** A beneficial ownership register that
> does not account for 100% is incomplete, and in most of your jurisdictions
> that is a filing matter rather than a tidiness one. Core distinguishes "37%
> unaccounted for" from "12% over — recorded twice?", because those are
> different errors with different fixes.

#### Bank accounts

Accounts held by the entity: name, IBAN, currency, and which is the default.

This records that the account exists. It does not connect to the bank and does
not show a live balance.

#### Charges

Registered charges and security: holder, amount, date created, date registered
and satisfaction date.

#### Assets

Assets held by the entity, for entities where you maintain an asset register.

#### Dividends

Declared and paid dividends: declaration date, payment date, amount per share
and total.

#### Meetings

Board and shareholder meetings: date, type, attendees, and whether minutes
exist.

> **Why minutes matter here.** An entity with resolutions but no minutes on file
> is a gap that appears in an inspection, and the register is where it becomes
> visible.

#### Addresses

Registered office, business and correspondence addresses, with dates.

#### File notes

Free-text notes against the entity, with who wrote them and when. Used for
anything not covered by a structured field.

Core also writes file notes itself — for example, when an onboarding case goes
live, the verified CDD is carried onto the client record as a note.

#### Safe custody

Physical items held: certificates, deeds, seals. Records what is held, where,
and its movements in and out.

#### Services

Which services Affinity provides to this entity, and the fees. Feeds billing.

#### Structure chart

A generated diagram of the ownership structure, built from the shareholder and
UBO records. If it looks wrong, the underlying registers are wrong — the chart
is a view, not a separate record.

### Bulk handover — not yet available on screen

When someone leaves or a portfolio moves, you currently reassign entities **one
at a time** on each entity's Overview tab.

A bulk reassignment exists in the database and works, but has no button yet, so
it cannot be reached. It is on the list. Until then, be careful with large
handovers: the entity that gets missed is the one nobody administers.

> **Found while writing this guide.** This section originally described a
> "Reassign caseload" button, because the function was built and tested. It has
> no screen. Documenting the system honestly is a reasonable way to find that
> sort of gap, and it is better found here than by someone looking for a button
> that was never there.

### Closing an entity

**Close entity** sets the status to Closed. The records remain.

Core refuses to close an entity with **unbilled time** against it, because
closing writes that work off. Bill or write it off deliberately first.

---

*Part 2 continues with Documents, Timesheets, Reporting, CRM, Onboarding,
Jurisdictions, Compliance, and the accounting modules.*


---


**Client work: Documents, Timesheets, Reporting, Procedures, Statutory
registers, CRM, Onboarding.**

Continues from Part 1. Read the sections for the modules you use.

---

## 2.4 Documents

Core does not store documents. It records **what documents exist**, which entity
they belong to, who uploaded them, and when they can be destroyed. The files
themselves live in the DMS.

> **Why it is split this way.** A document management system does versioning,
> full-text search and access control properly. Duplicating that badly inside
> Core would mean two places to look and two answers to "is this the current
> engagement letter". Core holds the index; the DMS holds the file.

### What you see

Documents grouped by entity and category, showing filename, who uploaded it,
the date, and the **retention date**.

**+ New folder** creates a category.

### Retention

Every document record carries a retention date, derived from the jurisdiction's
rules and the document type. Core shows whether a document is **within
retention** — meaning it must not be destroyed.

There is also a view of documents **due for destruction**: past their retention
date and eligible to be disposed of.

> **Why retention is a date and not a rule.** The rule varies by jurisdiction,
> document type and sometimes by when the relationship ended. Storing the
> calculated date means the answer survives the rule changing, and a document
> filed in 2019 is judged by the rule that applied to it.

### Finding a document

Search by entity, category or filename. If you cannot find something, check the
office filter — a document on a Malta entity will not appear while the filter is
set to Isle of Man.

---

## 2.5 Timesheets

Recording time, approving it, and turning it into billable WIP.

### Tabs

| Tab | What it is for |
|---|---|
| **Time entry** | Recording your own time |
| **WIP by entity** | Unbilled time per client |
| **Utilisation** | Chargeable hours against target |
| **Missing timesheets** | Who has not submitted |
| **Approval queue** | Time waiting for a manager |
| **Reports** | Time analysis |

### Recording time

Two ways.

**The timer.** Start it when you begin, stop when you finish. Core converts the
seconds into hours to two decimals. Useful for calls and short pieces of work
that otherwise go unrecorded.

**Manual entry.** **+ Manual entry**, then:

| Field | Notes |
|---|---|
| Date | Defaults to today |
| Entity | The client. Type to search |
| Matter | What the work relates to |
| Type | Client work, admin, business development, training |
| Hours | Decimal — 1.5, not 1:30 |
| Billable | Whether it can be charged |
| Rate | Usually filled from your grade |
| Narrative | What you did |

> **The narrative matters more than it looks.** It appears on the client's
> invoice. "Various" or "Admin" invites a fee query; a specific narrative
> answers the question before it is asked. This is the single most common cause
> of a fee being written off.

### The three states time passes through

**Draft** → **Submitted** → **Approved** → **Billed**

This sequence is enforced, and it is worth understanding because it explains a
refusal you will meet.

**Draft** — yours, editable, not visible for approval.

**Submitted** — sent for approval. You can no longer edit it.

**Approved** — a manager has approved it. It now appears as billable WIP.

**Billed** — included on an invoice. Set by Core when the invoice is raised, not
by hand.

> **If you press Approve and Core refuses.** It will say: *"Nothing was approved.
> 3 entries selected, with status Draft. Only submitted time can be approved — a
> fee earner has to submit it first."*
>
> Until recently this did nothing at all and reported success. The fee earner's
> time sat in draft while everyone believed it had been approved. It now refuses
> and says why.

### Submitting your time

On **Time entry**, select the entries and submit for a date range. Everything in
Draft for that range moves to Submitted.

### Approving time (managers)

**Approval queue**, select entries, then **Save changes** to approve, or
**Return** to send them back. Returning requires a reason, which is added to the
narrative so the fee earner can see what to fix.

### WIP by entity

Approved, unbilled time per client. This is what Invoicing draws on. A large WIP
balance on a client is either work not yet billed or work that will not be
billed — worth knowing which.

### Missing timesheets

Who has not submitted for a period. **Send reminder** notifies them.

---

## 2.6 Reporting

Operational reports on entities, clients and portfolios.

Distinct from **Reports** (3.10), which covers financial reporting, and from
**Financial Reporting** (3.6), which produces statutory figures. Three
differently named things: this one is about entities and administration.

### What is here

Assets under administration, entities by jurisdiction and type, risk profile
across the portfolio, bank balances, safe custody holdings, and signatory lists.

### Exporting

Most tables export to CSV. The exported file is named with the entity reference
and the register name, so a folder of exports stays identifiable.

---

## 2.7 Procedures

Checklists for work that follows a defined sequence, and a record of who did
each step.

### Tabs

**Overview** — active and recent runs.
**Procedure library** — the defined procedures.
**Active runs** — in progress, with which step is outstanding.
**History** — completed, with who did what and when.

### Running a procedure

**+ Start procedure**, choose the procedure and the entity. Core creates a run
with every step listed. Complete each step as you do it; Core records who
completed it and when.

> **Why not just a task list.** A procedure records that the steps were done **in
> order, by named people**. For anything that has to be evidenced — a client
> take-on, a change of trustee — the evidence is the point, and it is very hard
> to reconstruct after the fact.

---

## 2.8 Statutory registers

Filings and registry work. Related to Entity Admin but organised by **deadline**
rather than by entity, which is how this work is actually done.

### Tabs

| Tab | What it covers |
|---|---|
| **Calendar** | Everything falling due, by date |
| **Returns** | Annual returns and their status |
| **BO** | Beneficial ownership submissions |
| **Officers** | Appointments and resignations needing filing |
| **COGS** | Register of directors and officers |
| **Dissolution** | Entities being wound up |

### Recording a filing

**+ Log filing** — entity, filing type, period, due date and reference.

Filings show as **overdue** in red once past the due date and not submitted.

### Chasing a registry

**Chase registry** records that you followed up, and increments a chase count on
the filing. The count is the useful part: three chases with no response is a
different conversation from one.

### Officer changes

**+ Record change** logs an appointment or resignation. The **Officers** tab
flags changes more than 30 days old with no filing recorded, because most
registries require notification within a month.

### Beneficial ownership

**+ Record BO submission** logs a filing to the BO register.

The tab also shows, per entity, whether the register **accounts for 100%** — and
where it does not, whether it is short or over. Short means someone is
unaccounted for; over usually means a holding recorded twice.

### Dissolutions

**+ Open dissolution** starts the process. **Advance stage** moves it on.

Core reports whether an entity **can be closed**, and if not, why: outstanding
filings, or unbilled time that closing would write off.

### Certificates

**+ Request certificate** records a request to the registry for a certificate of
good standing or similar.

---

## 2.9 CRM

The business development pipeline: prospects before they become clients.

### Tabs

**Pipeline** — prospects by stage.
**Performance** — conversion and pipeline value.
**Convert** — turning a won prospect into an onboarding case.

### The stages

    Enquiry → Proposal Sent → KYC Arriving → Fees Paid
                                          ↘ Lost

Validated against that list, so a typo cannot create a stage nothing reports on.

### Adding a prospect

**+ Add prospect**:

| Field | Notes |
|---|---|
| Contact name | First and last |
| Company / structure | Required |
| Entity type | Company, Trust, Yachting, Fund |
| Jurisdiction | Where it would be established |
| Office | Which Affinity office owns it |
| Source | Referral, existing client, trade show, direct |
| Stage | Defaults to Enquiry |
| BD owner | Who is running it |
| Annual fee, setup fee, admin fee | For pipeline value |
| Target date | Expected conversion |
| Risk rating | Early view, refined at onboarding |

### First-year value

Core calculates it as **annual fee + setup fee + (admin fee × 12)** — the sum
rather than the annual fee alone, because that is what a pipeline is actually
judged on.

### Logging contact

**+ Log interaction** — date, type (call, email, meeting), a note, and
optionally a next action with a due date.

**Going cold.** An open prospect with no contact for over 30 days is flagged.
That is the thing a pipeline review is for.

### Marking a prospect lost

Choose the **Lost** stage. Core **requires a reason**.

> **Why.** Why we lost it is the only useful part of a lost prospect. Fee,
> timing, a competitor, or the client changing their mind are four different
> problems, and only one of them is about price.

### Converting a won prospect

Move it to **Fees Paid**, then **Convert**. Core creates an onboarding case and
links the two, so the pipeline and the onboarding file are one story rather than
two records of the same client.

A prospect cannot be converted twice.

> **What conversion does not do.** It does not make the client live. CDD still
> has to be recorded and verified. Core says so in the confirmation message.

---

## 2.10 Onboarding

Taking a client on, from accepted proposal to live entity.

### Tabs

| Tab | What it covers |
|---|---|
| **Overview** | Cases by stage |
| **Active onboardings** | In progress |
| **Transfer-in** | Clients arriving from another provider |
| **Attrition** | Clients leaving |
| **Client portal** | Portal invitations |

### Starting a case

**+ New onboarding**, or convert a prospect from CRM.

| Field | Notes |
|---|---|
| Client name | The person or family |
| Entity name | The structure to be established |
| Office | Which office |
| Jurisdiction | Where |
| Entity type | Company, Trust, Foundation |
| Sector | The client's business |
| Source / introducer | How they came to us |
| Assigned to | Who is running it |
| Target date | |
| Fee quoted | |

### CDD

The substance of onboarding. Each item is recorded, then verified.

**Adding an item:** what is required, and of whom.

**Verifying an item:** what you saw — "Certified copy", "Original seen",
"Electronic verification".

Core tracks how many items exist, how many are verified, and how many are
outstanding.

### Going live

**Go live** creates the client entity and links it to the case.

Core refuses in two situations:

**No CDD recorded at all** — *"No CDD has been recorded for this case at all."*

**CDD recorded but not verified** — naming what is outstanding.

> **Why this gate is absolute.** Taking a client on without verified CDD is the
> breach that closes firms. Core will not produce a client entity from a case
> that has not passed it, and this is deliberately not overridable.

When it does go live, the verified CDD is carried onto the client record as a
file note, so the evidence sits with the client rather than only in the case.

### Transfer-in

Clients arriving from another provider. Records what has been received from the
outgoing provider and what is outstanding — the commonest problem in a transfer
is discovering months later that the statutory records were never sent.

### Attrition

Clients leaving. **+ Raise attrition form**:

| Field | Notes |
|---|---|
| Entity | Which client |
| Reason | Liquidation, transfer out, resignation, non-payment |
| Detail | The circumstances |
| Administrator | Who is handling it |
| Successor | Who is taking the client on, if a transfer |
| Target date | |

**Unbilled time is captured when the case opens**, because a departing client is
the hardest one to bill afterwards. It is also shown as it stands now, so work
done after notice is visible.

### The attrition approvals

Three stages, **in sequence**:

1. **Manager approval**
2. **MD approval**
3. **Group CEO or COO** — either satisfies it

Core refuses:

- **Out of sequence.** A CEO cannot sign before the manager has looked at it.
- **The wrong role for a stage.** *"Director cannot sign off Manager approval.
  That stage accepts: Manager."*
- **The same person twice.** Each stage needs a different person.

> **Why the final stage accepts either CEO or COO.** A rule requiring one named
> person stalls whenever they are away, and the realistic result is that someone
> works around it. An alternate keeps the control real.

### Escalating

**Escalate** flags a case that is stuck, and notifies the assigned manager.

### Client portal invitations

**+ Send portal invitation** invites a client to the portal. **Re-invite**
resends where the first was not taken up.

---

## 2.11 Jurisdictions

Regulatory reference by jurisdiction: the regulator, the legislation, licences
held, and the obligation schedule.

### What is here per jurisdiction

**Regulator** — read from the record, shown as its acronym.

**Legislation** — the acts and codes that apply.

**Licence held** — where Affinity holds one. Cyprus, for example, shows
"Licensed by CySEC as an Administrative Service Provider (corporate services)".

**Obligations** — the recurring deadlines.

### Reading the obligation schedule

Each obligation shows the area, what it is, when it is due, the frequency, the
owner, the legislation it comes from, and whether it is **confirmed**.

**Confirmed** means someone in Compliance has checked it against the source.
**Unconfirmed** means it is recorded but nobody has verified it.

> **Treat unconfirmed dates as a draft rather than a deadline.** Malta and Cayman
> were migrated from an earlier version of the system and show as unconfirmed
> for that reason: their dates came from a code constant, not from the
> legislation.

### Where a jurisdiction shows nothing

Isle of Man, Cyprus, UK and USA currently have **no obligations recorded**. Core
says so plainly and explains why they are not pre-filled:

> *"The tracker shows no deadlines for this jurisdiction, so nothing here will
> fall due or be chased. Deadlines are deliberately not pre-filled: a wrong date
> in a compliance tracker is worse than a visibly empty one."*

This is not a fault. Filling them in is Compliance's job, and Part 3 covers how.

### Adding an obligation

**+ Add an obligation**. Covered in Part 3, because it is reference data rather
than daily work.

---

## 2.12 Compliance

The firm's own compliance position, as opposed to any one client's.

### Tabs

| Tab | What it covers |
|---|---|
| **Overview** | Position by jurisdiction |
| **CSP licence** | Affinity's own licences |
| **AML/CFT framework** | Risk assessments, policies, procedures |
| **Regulatory reporting** | Returns to regulators |
| **Staff training** | CPD and AML training records |

### Periodic client reviews

Reviews appear here rather than in Entity Admin, because they are a compliance
function and are monitored across the portfolio.

**Every client appears in the list, reviewed or not.**

> **Why.** A client that has **never** been reviewed is the one that matters, and
> it would be invisible in a list of reviews. Core distinguishes three states:
> never reviewed, reviewed and due again, and reviewed with no interval recorded
> for its risk rating — the last being a gap in the compliance setup rather than
> in the client's file.

### Carrying out a review

Start a review on the client. Core captures the risk rating **at the time**,
because a review's scope is judged against the rating it was done under, not
today's.

You record what was actually done:

| Check | |
|---|---|
| CDD refreshed | |
| Source of wealth | |
| Sanctions screened | **Required** |
| PEP screened | **Required** |
| Structure confirmed | |
| Activity consistent | |

Then the **risk rating after the review**, findings, and actions.

Core refuses to complete a review if:

**Sanctions or PEP screening was not done.** *"If either could not be done, leave
the review in draft and record why in the findings."*

**Neither the CDD nor the source of wealth was refreshed.** A review that
refreshed neither has not reviewed anything.

**No risk conclusion was recorded**, even where the rating is unchanged.

> **Why refuse rather than record a partial review.** A partial review on file
> reads as a completed one. Six months later nobody can tell that the sanctions
> check was skipped, and the file says the client was reviewed.

### When it is complete

Core sets the **next due date** from the interval Compliance recorded for the
rating **after** the review — so a client moved to high risk is due again
sooner. The entity's risk rating and next review date update to match, so the
two cannot disagree.

Where no interval is recorded for that rating, no date can be calculated and
Core says so rather than inventing one.

### Approving a review

Separate, and **refused to whoever carried it out**. A review checked by the
person who did it is not independent.

### Breaches

**+ Log breach** records a compliance breach.

Client money breaches appear automatically — you do not log those by hand.
A breach open more than five days is escalated to critical, because a breach
identified today and one open a fortnight are different matters.

### Staff training

**+ Record training** logs CPD: staff member, activity, category, hours, date,
and whether it is verified.

The tab shows hours per person, verified against unverified, and the last entry
date.

---

*Part 3 covers the accounting modules.*


---


**Accounting: Bookkeeping, WIP, Invoicing, Transactions, Assets & Groups,
Financial Reporting, Accounting ops, Purchases & AR, Fiduciary reporting,
Reports, Planning, Consolidation.**

Continues from Part 2.

---

# Part 3 — The accounting modules

## Before you start: which accounting module do I want?

There are twelve, and the names do not make the split obvious. The distinction
that matters is **whose accounts**:

**Client structures** — the companies and trusts you administer.
Bookkeeping, Transactions, Fiduciary reporting.

**The Affinity group** — Affinity's own companies.
Accounting ops, Purchases & AR, Financial Reporting, Planning, Consolidation.

**Billing clients** — the money Affinity earns.
WIP, Invoicing.

**Reading rather than recording.**
Reports, Assets & Groups.

If you are unsure, the question to ask is: *am I doing the accounting for a
client, or for Affinity?*

---

## 3.1 Bookkeeping

Day-to-day double-entry accounting for client entities.

### Tabs

| Tab | What it is for |
|---|---|
| **Sales** | Money owed to the entity |
| **Purchases** | Money the entity owes |
| **Cashbook** | Money in and out |
| **Journals (adjustments)** | Manual double-entry |
| **Reports** | Trial balance and ledgers |

### The one rule

**Every journal must balance.** Core refuses an unbalanced journal, and this is
not overridable.

> **Why absolutely.** An unbalanced journal means the ledger no longer adds up,
> and once one exists the trial balance can never be trusted again. Finding
> which of ten thousand entries broke it, months later, is far worse than being
> refused now.

### Sales

**+ New sales invoice** — customer, date, currency, lines, and VAT treatment.

**+ Receive payment** — records money received and allocates it against
invoices. Allocation matters: an unallocated receipt leaves an invoice showing
as unpaid.

### Purchases

**+ New bill** — supplier, date, reference, due date, currency, lines.

**+ Pay bill** — records payment and allocates it.

### Cashbook

**+ Money in** and **+ Money out** for anything not tied to an invoice or bill:
bank charges, interest, transfers.

### Journals

**+ Post journal** — date, narrative, and the lines.

Each line takes an account, currency and amount. Positive is a debit, negative
a credit; the total must be nil.

> **On the narrative.** It is what someone reads in two years asking why this
> entry exists. "Adjustment" answers nothing. It is also the first thing an
> auditor samples.

### Adding an account

**Add account** extends the chart of accounts: code, name, type, and normal
balance.

Each entity can have its own chart, so a trust does not carry a company's
accounts.

### Journal approval

Journals post immediately. There is **no mandatory second approval** — that is
Affinity's policy, confirmed.

An approval mechanism exists and can be switched on per entity with a
threshold, so journals above a value require a second person. No thresholds are
currently set, so nothing requires approval.

> **Worth knowing.** This means journals reach the ledger without a second pair
> of eyes. An auditor may raise it. It is a deliberate decision rather than an
> oversight, and it can be changed per entity without a code change.

---

## 3.2 WIP

Approved, unbilled time by client. The bridge between Timesheets and Invoicing.

**What you see:** each client with unbilled time, the value, and the oldest
entry.

**Why the oldest entry matters:** WIP ages badly. Time recorded four months ago
is harder to bill and easier to query than time recorded last week.

**Billing it:** from Invoicing, which draws on WIP directly. When an invoice is
raised the time is marked Billed automatically.

---

## 3.3 Invoicing

Client fees.

### Tabs

| Tab | What it covers |
|---|---|
| **Ad-hoc invoicing** | One-off invoices |
| **Invoice ledger** | Every invoice raised |
| **By client** | Invoices per client |
| **Auto-bookkeeping** | Posting fees to the ledger |
| **Aged debt** | What is outstanding, by age |
| **Retainers** | Recurring fees |
| **Credit control** | Chasing |
| **Fee schedules** | Standard fees by service |

### Raising an invoice

**+ New invoice** — client, entity, date, currency.

**+ Add line item** for each line: description, amount, VAT treatment. Or draw
from WIP, which brings the time entries and their narratives across.

**Save draft** keeps it editable. A draft invoice is not in the ledger and does
not appear as a receivable.

### Aged debt

Outstanding invoices in buckets: current, 1–30, 31–60, 61–90, over 90 days.

**Ageing runs from the due date, not the invoice date.** An invoice on 60-day
terms is not overdue at 45 days, and bucketing from the invoice date would say
it was.

### Credit control

**Send reminder** records that you chased, and increments the count.

**Escalate** flags an account for attention.

> **The chase count is the useful part.** Three chases with no response is a
> different conversation from one.

### Retainers

Recurring fees that generate invoices on a schedule, rather than being raised
by hand each quarter.

---

## 3.4 Transactions

Transaction-level detail across client entities: bank lines, matched and
unmatched items, and reconciliation status.

Where you go when a figure looks wrong and you need to find the entry behind
it.

---

## 3.5 Assets & Groups

Fixed asset registers for client entities, and group structures for
consolidation.

**Assets:** cost, date acquired, depreciation method and rate, accumulated
depreciation, net book value.

**Groups:** which entities form a group and the ownership percentages. Feeds
Consolidation.

**Effective ownership compounds.** 80% of an 80% subsidiary is **64%**, not 80%.
Core calculates this down the chain, because reporting the direct percentage
would overstate the group's share of the lower tiers.

---

## 3.6 Financial Reporting

Statutory figures for client entities: trial balance, profit and loss, balance
sheet, and the statement assembly that turns them into formatted accounts.

For trusts and for the full statutory accounts workflow, see **Fiduciary
reporting** (3.9).

---

## 3.7 Accounting ops

Operational accounting for the Affinity group. Client money lives here, and it
is the most tightly controlled part of Core.

### Tabs

| Tab | What it covers |
|---|---|
| **Attention** | Anything needing action |
| **Client money** | Client funds held |
| **VAT returns** | Preparation and filing |
| **Bank reconciliation** | Bank against ledger |
| **Fixed assets** | Group assets |
| **Accruals & prepayments** | Deferrals |
| **Month-end close** | The monthly checklist |

### Client money — read this section

Client money is money that is not Affinity's. The controls reflect that.

#### The position

Per client: what is held, what has moved, and whether there is a shortfall.

> **Why per client and not just the total.** A pooled account showing £36,500
> looks healthy. If one client within it is at **minus £1,500**, that client's
> money has been used for something else — and it is completely invisible in the
> total. This is the single most important reason the position is shown per
> client.

#### Receiving client money

**+ Receipt** — client, account, date, amount, description.

#### Paying client money out

**+ Payment** — same fields.

Before you confirm, Core shows: the balance held, what the payment would leave,
and a warning if it would overdraw.

If it would overdraw, the panel turns red, states that it will be recorded as a
**client money breach**, warns that it must never be paid from another client's
balance, and the button changes to **"Record anyway — creates a breach"**.

**It is still permitted.** A client instruction may be unavoidable, and the
right response is to record the breach and remediate it, not to pretend it did
not happen.

#### Taking Affinity's fee from client money

This is treated **differently**, and it is worth understanding why.

Core **refuses** a fee transfer larger than the client holds:

> *"Cannot take 3,500.00 from Meridian Holdings — only 2,000.00 is held for that
> client. Taking more would be paying the firm out of another client's money.
> Bill the client and wait for funds, or transfer only the amount held."*

> **Why refused here but permitted for a client payment.** A client-instructed
> payment may be unavoidable. A fee transfer is entirely Affinity's own
> decision, and taking a fee from a client who does not have the money means the
> firm has used another client's money to pay itself. There is no urgency that
> justifies it: the bill can wait.

Core also shows, before you take anything, the **lower of what the client holds
and what has been billed** — because you cannot take more than either.

#### The reconciliation

Three-way: **bank** against **book** against **the sum of client ledgers**.

Three differences, never merged into one:

| Difference | What it means |
|---|---|
| **Internal** | Book against client ledgers — our own records disagreeing |
| **External** | Book against bank — our records against the bank's |
| **Shortfall** | Holding less than we owe. The reportable one |

> **Why not one "difference" figure.** Those are three distinct problems with
> three different fixes, and a single number would tell you something is wrong
> without telling you what.

#### Signing off a reconciliation

**Sign off**. Core refuses if:

**You prepared it.** *"You prepared this reconciliation — it must be signed off
by someone else."*

**A shortfall is unremedied.** Remediate first.

Any reconciliation signed off by its own preparer is flagged **self-signed** in
red. Those predate the control and need reviewing.

### VAT returns

**+ Prepare a return** — entity and period. Core assembles output VAT, input
VAT and the net position from the ledger.

### Bank reconciliation

Statements against the ledger, with matched and unmatched items.

Importing statements (MT940) is not yet available — see Part 5.

### Fixed assets

**+ Capitalise an asset** — description, cost, date, depreciation method and
rate.

**Run depreciation** posts the charge for a period.

### Accruals and prepayments

**+ Accrual** and **+ Prepayment** create deferral schedules that release over
time.

**Stalled schedules** — more than two months past their next posting date — are
flagged. An unreleased accrual is a misstatement, and it fails silently.

### Month-end close

Covered in Part 4.

---

## 3.8 Purchases & AR

Group payables and receivables.

### Tabs

**Attention** | **Payment runs** | **Expense claims** | **Purchase orders** |
**Credit control** | **Intercompany**

### Payment runs — segregation of duties

A payment run is assembled, then approved, then executed. **Three separate
acts.**

**Assembling.** Core adds open payables. If nothing was added it refuses and
says why — no open payables at all, or payables in a different currency from the
run. An empty run that looked assembled is one someone goes on to approve.

**Approving.** **Refused if you created the run.**

**Executing.** A separate third act from approval.

> **Why three.** The person who chooses who gets paid should not be the person
> who authorises it, nor the person who releases it. This is the control that
> stops a payment to an account nobody checked.

Historic self-approvals are **flagged, not hidden**.

### Expense claims

Approval is **refused on your own claim**.

### Purchase orders

Orders raised, their status, and matching against supplier invoices.

### Credit control

Group receivables, with accounts over their credit limit flagged.

### Intercompany

Balances between Affinity companies.

**The group total must be nil.** If it is not, something is posted on one side
and not the other, and consolidation will not eliminate it.

> **Why the total and not pair-by-pair.** Intercompany postings do not record a
> counterparty, so Core cannot reconcile Malta-against-Cayman specifically. It
> can prove the group total eliminates, which catches the same errors. Pair-level
> reconciliation needs a schema change and is on the list.

Also flagged: **group loans with no interest rate** (a tax authority will impute
one) and **transfer pricing policies with nil markup** (not what an independent
party would charge).

---

## 3.9 Fiduciary reporting

Trust accounting and statutory accounts.

### Tabs

**Trusts** | **Beneficiaries** | **Distributions** | **Statutory accounts** |
**Frameworks**

### Trust accounting — income and capital

The central principle: **income and capital are separate funds and are never
summed.**

> **Why this matters more than anything else in the module.** A life tenant is
> entitled to income; remaindermen are entitled to capital. Paying capital as
> income, or reporting a combined figure, is a breach of trust — not a
> presentation error. Core keeps them apart everywhere, including in the totals.

**Trusts** shows, per trust, income and capital in separate columns.

**Beneficiaries** shows what each has received, split by fund.

**Distributions** records payments, and each one must state which fund it comes
from.

Core flags:
- **Missing apportionment** — no income/capital split recorded for the trust
- **Unposted distributions** — records and books disagree
- **Over-distribution** — capital paid as income

**Fund checks are per fund.** "Is there enough in the income fund" is the
question, not "is there enough in the trust".

### Statutory accounts

The workflow is: **open a set → generate → submit for review → approve →
finalise**.

#### Opening a set

Entity, framework, period, and the comparative period.

Core refuses:

**A framework with no presentation format.** *"A set cannot be opened until one
is defined — statutory accounts need prescribed captions in a prescribed
order."*

**A framework the jurisdiction does not accept**, listing what it does accept.

**A period that has not finished yet.**

#### Generating

**Regenerate** builds the statements from the ledger.

#### Submit for review

A reviewer sees the set before a director is asked to sign it. Readiness is
**reported** here rather than enforced — part of a reviewer's job is to see what
is outstanding.

#### Approving

**Approve** requires **naming the director**, because they are signing that the
accounts give a true and fair view.

Core refuses if:

**Any readiness gate fails**, and lists **all** of them rather than the first.

**You prepared the set.**

> **Why every gate is checked at approval rather than at finalisation.** A
> director should not be asked to sign a set with outstanding disclosures.

#### Finalising

**Finalise** locks an approved set. Refused unless it is approved and the trial
balance balances.

#### Adjustments after approval

This one is worth reading carefully.

If you post an audit adjustment to an **approved** set, Core posts it,
regenerates the statements, and **withdraws the approval**, returning the set to
draft:

> *"The approval by R Sheeley has been withdrawn: it attached to figures this
> adjustment has changed. The adjusted accounts must be approved again."*

> **Why not simply refuse the adjustment.** Audit adjustments genuinely arise
> after approval, and preventing them would push the work outside the system.
> But the director signed particular figures. If those change, they have to see
> and approve the new ones — otherwise they signed one set of numbers and a
> different set gets filed.

The interface warns about this **before** you adjust an approved set.

### Frameworks

Where accountants author what each framework requires. Covered in Part 4.

**No framework currently has a verified disclosure checklist**, so no set can be
finalised yet. The tab shows what each one needs.

---

## 3.10 Reports

Read-only reporting. Nothing here writes.

### The reports

| Report | What it shows |
|---|---|
| **Aged debtors** | Receivables by age |
| **Aged creditors** | Payables by age |
| **Overdue interest** | What could be charged |
| **VAT by jurisdiction** | VAT position per jurisdiction |
| **Analysis by dimension** | P&L by office, service line, or any dimension |
| **Cash flow forecast** | Projected receipts and payments |
| **Intercompany check** | Group elimination |

### Reports do not run automatically

You set the parameters and press **Run report**.

> **Why.** Several need a date, a rate or a period. Figures produced from
> defaults nobody chose invite being believed.

### Two caveats shown before the figures

**Overdue interest** is what **could** be charged at the rate you enter — not
what is owed. Whether it is chargeable depends on the engagement terms and, in
some jurisdictions, on statute. Treat it as a calculation to check, not a
balance to collect.

**Cash flow forecast** is projected from expected receipts and payments, so it is
only as good as the dates behind them. An invoice with no due date will not
appear.

---

## 3.11 Planning

Budgeting and forecasting for the Affinity group.

### Tabs

**Budget input** | **Fees & sales** | **Staff** | **Balance sheet & cash** |
**Workflow** | **Scenarios** | **Variance & analysis**

### Building a budget

Enter by account and period. Staff costs are modelled per head with employer
social security and pension flowing from the rates.

### The rates are entered, not assumed

Payroll rates come from what Finance recorded per jurisdiction, effective-dated.

> **Why effective-dated.** One row per jurisdiction that gets updated would
> silently rewrite history: a budget approved on last year's rates would
> recalculate on this year's, and nobody could tell which rates produced the
> figures that were signed off. A rate has a date it applies from, and a
> calculation uses the rate that was in force.

**No rates are currently entered for any jurisdiction**, so staff costs will
compute on nothing until Finance enters them. Part 4 covers how.

### Locking and reopening

**Lock period** freezes a budget so it cannot shift under anyone.

**Reopen** requires a reason, which is kept on the record.

> **Why reopening is allowed at all.** Rates and assumptions do change mid-year.
> Refusing outright would push the work into spreadsheets, which is worse than a
> reopening that is recorded.

### Scenarios

**+ New scenario from approved budget** copies a budget so alternatives can be
modelled without touching the approved one.

### Variance

Budget against actual, with **+ Explain** to record why a variance arose. The
explanation is the useful part at a board meeting.

---

## 3.12 Consolidation

Group accounts across the Affinity companies.

### Tabs

**Cockpit** | **Data collection** | **Mapping** | **Intercompany** |
**Translation & NCI** | **Runs**

### Mapping

Each entity's accounts map to group accounts. Unmapped accounts with a balance
would be missing from the consolidated figures, so they are flagged.

### Intercompany

Balances between group companies, which must eliminate to nil.

### Translation & NCI

**CTA** — the cumulative translation adjustment. The movement arising purely
from retranslating a subsidiary's net assets at a different rate.

> **It is not a trading profit or loss.** Reading it as one would misstate
> performance. Core shows the opening and closing rates beside the figure so it
> can be checked.

**NCI** — non-controlling interests. The share of net assets not owned by the
group. Reporting a group figure without splitting out the minority share
overstates what belongs to the parent.

### Runs

A consolidation run and its result, with the trial balance and summary.

---

*Part 4 covers reference data and the periodic work.*


---


**The periodic work: reference data, month-end close, year-end.**

This part is for the people who own the data rather than the people who use it
daily. If you are an administrator recording client work, you do not need this
part.

---

# Part 4 — Reference data and periodic work

## 4.1 Reference data — who owns what

Core deliberately does not invent regulatory content. Several things must be
entered by the person who knows them, and until they are, Core says so rather
than showing a plausible-looking guess.

> **Why the system does not just fill these in.** A deadline, a disclosure
> requirement or a payroll rate that is nearly right is worse than an obvious
> gap. A visible blank gets filled in; a wrong date gets trusted, and someone
> misses a filing or a client's accounts get signed on the wrong basis. Every
> one of these is a judgement with a source behind it, and the source is part of
> the record.

| Data | Owner | Where in Core |
|---|---|---|
| Obligation schedules | Compliance | Jurisdictions |
| Periodic review intervals | Compliance | Compliance |
| Disclosure checklists | Accounts | Fiduciary reporting → Frameworks |
| Required document lists | Accounts | Fiduciary reporting → Frameworks |
| Presentation formats | Accounts | Fiduciary reporting → Frameworks |
| Payroll rates | Finance | Planning |
| Group allocation percentages | Finance | Planning |
| Journal approval thresholds | Finance | System admin |

**Start with the obligation schedules.** They are the only reference data that
affects whether something gets **missed**, rather than how a figure is
calculated.

---

## 4.2 Obligation schedules (Compliance)

### What an obligation is

A recurring regulatory deadline in a jurisdiction: an annual return, a CRS
filing, a risk assessment review, a beneficial ownership update.

### The ten areas

Structural, and the same in every jurisdiction:

| Area | Covers |
|---|---|
| **Licence / authorisation** | Affinity's own licence conditions and returns |
| **AML / CFT** | Risk assessments, policies review, MLRO report, training |
| **AEOI** | FATCA and CRS registration and returns, including nil returns |
| **Economic substance** | Notification and return, per in-scope entity |
| **BO register** | Filings on change, plus periodic confirmation |
| **Annual returns** | Company annual returns to the registry |
| **Accounts filing** | Where accounts must be filed, not just prepared |
| **Tax** | Corporate returns, VAT or GST, payroll filings |
| **Sector-specific** | Funds, insurance, gaming |
| **Internal control** | Client money reconciliations, reviews, CPD, monitoring |

### Recording one

**Jurisdictions** → choose the jurisdiction → **+ Add an obligation**.

| Field | Notes |
|---|---|
| Area | One of the ten |
| Obligation | What it is, e.g. "Annual return — Companies Registry" |
| **Deadline runs from** | See below. This is the important one |
| Trigger detail | e.g. "incorporation date" |
| Days after / Months after | One or the other, not both |
| Fixed month / Fixed day | For calendar deadlines |
| Frequency | Annual, quarterly, on change |
| Owner | Who does it |
| Legislation or rule | Required before it can be confirmed |
| How it is filed | Portal, form number, agent |
| Applies to | Which entities |

### The trigger is separate from the deadline, and required

Six options:

| Trigger | Meaning |
|---|---|
| **After the entity's year end** | Deadline runs from each entity's own year end |
| **After an anniversary** | From incorporation or another anniversary |
| **A fixed calendar date** | Same date every year for everyone |
| **After a reporting period end** | From a quarter or month end |
| **On change** | No fixed deadline; triggered by an event |
| **Ongoing** | A continuous obligation |

> **Why this is asked separately.** "30 days" recorded without saying 30 days
> from what is the commonest way a compliance date goes wrong. The same 30 days
> is a different date depending on whether it runs from a year end, an
> incorporation anniversary or a fixed calendar date — and for a portfolio with
> mixed year ends, wildly different. Core refuses a deadline with no trigger,
> and refuses days and months given together because they would conflict.

### Confirming an obligation

Recording is not the same as confirming. **Confirm** means someone checked it
against the source.

Core refuses to confirm without:

**A legislation or rule reference.** *"A confirmed deadline with no source
cannot be checked by anyone else."*

**A named owner.** *"An obligation nobody owns is one nobody does."*

Amending a confirmed obligation **withdraws the confirmation**, because whoever
confirmed it confirmed different terms.

### Where things currently stand

**Malta and Cayman** have 15 obligations between them, migrated from an earlier
version. They show as **unconfirmed** — their dates came from a code constant,
not from the legislation, so each needs checking and given a source and an
owner.

**Isle of Man, Cyprus, UK and USA** have nothing recorded.

### Removing an obligation

Requires a reason, and **deactivates rather than deletes**. A schedule that used
to include something is part of the compliance history.

---

## 4.3 Periodic review intervals (Compliance)

### Why these are entered rather than fixed

A review falls due based on **risk rating**. High risk annually and low risk
every three years is the common shape, but it varies by jurisdiction and it is a
compliance judgement.

**No intervals are currently recorded.** Until they are, a completed review has
no next-due date, and Core says so rather than inventing one.

### Recording an interval

Per risk rating, and either group-wide or for one jurisdiction. A
jurisdiction-specific interval overrides the group-wide one.

So you can set "High = 12 months" everywhere, and "High = 6 months in Cayman".

**Where a rating has no interval**, the review list shows that as a distinct
state — a gap in the compliance setup rather than in the client's file.

---

## 4.4 Framework authoring (Accounts)

**This is the work that unblocks statutory accounts.** No framework currently
has a verified disclosure checklist, so **no set of accounts can be finalised**.

### Why Core does not supply this content

> A caption set that looked like the Companies Act format but was subtly wrong,
> or a disclosure list that looked complete and had gaps, would end up in filed
> accounts that a director had signed. This is not content a system should
> guess at. It is entered by a qualified person, verified against a named
> edition, and the verification is part of the record.

### The Frameworks tab

Lists all eleven frameworks with the **single next step** for each, in the order
that unblocks the rest.

Opening one gives the caption table, the checklist state and the document list,
with forms for each.

### Step 1 — the presentation format

Four frameworks have none: **Cayman, FRS 105, IOM GAAP, US GAAP**. Until a
format exists, no set can be opened on them.

**+ Create the format** — a short code and a name.

**+ Add a caption** for each line of each statement:

| Field | Notes |
|---|---|
| Statement | BS, PL, IC (trusts), AL, CF, EQ |
| Code | What accounts map to. Must be given |
| Caption as printed | Exactly as it must appear |
| Order | Sequence within the statement |
| Note number | Optional |
| Is a subtotal | |
| Fund (trusts only) | Income or capital |

> **Why the code matters.** It is what accounts map to, and it stays stable when
> the caption wording is later edited. A caption with no code cannot be mapped
> to anything.

Core refuses:
- A caption with no code
- An unknown statement code — it would produce a statement nothing renders
- A caption on a framework that does not exist yet
- **Deleting a caption accounts still map to** — those balances would leave the
  accounts while the statements still balanced, which is the hardest kind of
  error to find

**A format with captions on only one statement is flagged**, because an empty
balance sheet is worse than refusing to open the set at all.

### Step 2 — the disclosure requirements

**+ Add a requirement**:

| Field | Notes |
|---|---|
| Reference in the standard | e.g. FRS 102 1AC.12. Required |
| Requirement | What must be disclosed |
| What must be disclosed | The detail |
| Applies when | e.g. only where fixed assets are held |
| Mandatory | |
| Order | |

> **Why the reference is required.** It is how the requirement is traced back,
> and how a reviewer checks the list is current.

### Step 3 — verify the checklist

**Verify the checklist** requires **naming the edition**.

> **Why the edition.** A verification with no edition means nothing once the
> standard is amended, and FRS 102 was materially amended in 2024. "Verified"
> against an unnamed edition tells a reviewer nothing.

**Adding or amending a requirement withdraws the verification**, because whoever
signed it off signed off a different list.

### Step 4 — required documents

**+ Add a document** — directors' report, statement of directors'
responsibilities, approval wording.

> **Why recorded rather than assumed.** Which documents a filed set needs varies
> by jurisdiction and entity size.

### Account mapping — one thing worth knowing

An account may map to **several captions** where they have **different fund
filters**. That is the trust income/capital apportionment and it is correct: one
expense account legitimately maps to both "Expenses chargeable to income" and
"Expenses chargeable to capital".

Two captions with the **same** fund treatment would double-count, and are
refused.

---

## 4.5 Payroll rates and allocations (Finance)

### Payroll rates

**No rates are recorded for any of the six jurisdictions.** Budgets compute
staff costs on nothing until they are entered.

Per jurisdiction, effective from a date:

| Field | Notes |
|---|---|
| Effective from | The date it applies from |
| Employer social security % | **As a percentage — 12.8, not 0.128** |
| Social threshold | Earnings below which nothing is due |
| Social cap | Above which nothing more is due. Blank = uncapped |
| Employer pension % | Also a percentage |
| Pension cap | |
| Per head annual | Anything charged per head rather than as a percentage |
| Currency | |
| Source | Where the figure came from |

> **The fraction trap.** The old hardcoded values were fractions — 0.128 for
> 12.8%. Enter a fraction and every payroll figure would be a hundred times too
> small **while still looking like money**. Core refuses any value between zero
> and one and says so. A genuine nil rate of 0 is accepted.

Core also refuses a **cap below the threshold** — nothing would ever be due.

### Agreeing and locking

**Draft** → **Agreed** → **Locked**.

**Agreeing** is a judgement that the figures are right. **Locking** is a
decision to stop them moving.

A locked rate cannot be amended. To change it, enter a **new rate effective from
a later date** — both are kept, and a calculation for any period uses the rate
that was in force.

> **Why not just edit it.** A budget approved on one set of rates must still
> produce those figures when re-run. Editing in place silently rewrites history.

**Reopening** a locked rate requires a reason, which is kept.

### Group allocations

What share of a central cost each entity bears, effective-dated for the same
reason.

**Must total 100% before it can be agreed.**

While you build it, Core reports the running total: *"40% is still unallocated —
that share of the cost would be borne by nobody."* Or over: *"5% over — that
share would be charged twice."*

> **Why enforced at agreement rather than on each line.** An allocation is built
> one entity at a time and would be unbuildable if every intermediate state had
> to total 100.

---

## 4.6 Month-end close

**Accounting ops → Month-end close.** Enter the entity and period, then **Run
checklist**.

### It is a checklist, not a dashboard

Each row is something that either has been done for the period or has not.
That is the question at month end — not how much of it there is.

### What blocks a close, and what does not

**Blocking:**

| Step | Why it blocks |
|---|---|
| **Period open** | You cannot post into a locked period |
| **FX rates loaded** | Without them a revaluation cannot run, and foreign currency balances would be stated at a stale rate |
| **No draft journals** | They cannot be posted once the period is locked |
| **Client money reconciled and signed off** | A regulatory requirement, not housekeeping |

**Advisory:**

Recurring journals posted, deferrals released, depreciation run, intercompany
eliminating to nil.

> **Why the distinction is drawn for you.** Everything looking equally urgent
> means nothing is. The four blocking items are ones where closing anyway
> produces a wrong or unfilable result.

### When everything is done

Core says so, and adds a caveat worth reading:

> *"Everything on the checklist is done. Note that this checks whether each step
> has been RUN, not whether its output is right — a reconciliation that balances
> is still worth reading."*

---

## 4.7 Year-end close

Closing a year rolls the result to reserves. It is **not reversible in the
ordinary way**, so the preconditions are checked first and reported together.

### The gates

**Hard — the override cannot bypass these:**

**Draft journals in the year.** They would be left out of the result rolled to
reserves.

**Client money shortfalls.** Must be remediated before the year closes.

**Advisory — can be overridden with confirmation:**

**All months closed.** Closing a year over an open month invites postings into a
closed year.

**Accounts approved for the year.** The year can still be closed, but the
figures rolled will not have been signed off.

> **Why two categories.** A year can legitimately be closed before the accounts
> are signed — that happens routinely. It cannot legitimately be closed with a
> client money shortfall outstanding. Treating those the same would either block
> normal work or permit something that should never happen.

### Before you close

**Take a recovery bundle.** Not last night's — immediately before. Year-end
close is the single least reversible thing in Core.

---

*Part 5 covers administration, and what does not work yet.*


---


**Administration, demo data, what does not work yet, and getting help.**

---

# Part 5 — Administration

## 5.1 System admin

Restricted to administrators.

### Tabs

| Tab | What it controls |
|---|---|
| **Users** | Who has access |
| **Roles** | What each role can do |
| **Matrix** | Role against permission |
| **Doc perms** | Document access by category |
| **Fields** | Custom fields |
| **Content** | Intranet and portal content |
| **Audit** | The audit trail |
| **Config** | System settings |

### Users

Accounts come from your Microsoft tenant. Core records the role and which
offices someone can see.

**Removing access:** disabling the Microsoft account removes Core access too.
That is the point of not having separate passwords — access is removed once, by
the person who already does that job.

### The audit trail

Every significant action: who, what, when, and the detail.

Some entries are deliberately loud, because they record a control being
weakened or a decision being reversed:

| Entry | What happened |
|---|---|
| `APPROVAL WITHDRAWN BY ADJUSTMENT` | Accounts were adjusted after a director approved them |
| `PAYROLL RATES REOPENED` | Locked rates were reopened, with the reason |
| `APPROVAL THRESHOLD RAISED` | Fewer journals now require approval |
| `CLIENT MONEY RECONCILIATION SIGNED OFF` | With who prepared and who signed |
| `FEE TAKEN FROM CLIENT MONEY` | With the amount and remaining balance |
| `ATTRITION FULLY APPROVED` | With all three approvers and their roles |
| `DEMO ENTITY REMOVED` | With what went |
| `YEAR END CLOSED` | And whether advisory gates were overridden |

> **Why some entries shout.** Raising an approval threshold means fewer journals
> get a second pair of eyes. That is a loosening of control, and it should look
> like one in the record rather than reading as routine configuration.

### Config

System settings including the journal approval thresholds.

**No thresholds are currently set**, so no journal requires approval — which is
Affinity's policy. Setting one per entity would mean journals above that value
need a second person.

Core refuses a negative or null threshold. Zero means every journal needs
approval; null would silently mean none do.

---

## 5.2 Demo data

**Every client entity currently in Core is sample data.** No real client records
have been migrated.

### How you can tell

**"DEMO DATA — NOT A REAL CLIENT"** as the **first** badge on the entity, before
the reference. Newly created demo entities also carry **`[DEMO]`** in the name.

> **Why it is badged so prominently.** These records read exactly like real
> clients — plausible names, real-looking registration numbers, real
> jurisdictions. That is what makes them useful for training and dangerous in a
> live register. The realistic failure is not confusing them in the abstract: it
> is filing a real return against a demo entity, recording real time against
> one, or telling a client a figure that came from sample data.
>
> The `[DEMO]` name prefix exists because a report or CSV export might not know
> about the flag. The badge covers the screen; the prefix covers everything else.

### Managing it

**Adding** a demo entity builds it through the same path a real one uses, so it
exercises the same duplicate and jurisdiction checks. A record created another
way would be a poor rehearsal.

**Removing** one is **refused unless it is flagged as demo**. If it is a real
client, Core says to close it rather than delete it — the records must survive
the relationship.

**Clearing all** of them requires the typed phrase **`REMOVE DEMO DATA`**, not a
tick box. This deletes a register, and a misplaced tick is easier than a
misplaced phrase.

**Flagging a real entity as demo is refused** where it has time, invoices or
posted journals against it — flagging is what makes something deletable.

**Posted journals are never deleted**, even on a demo entity. Deleting one would
unbalance the ledger.

---

## 5.3 What does not work yet, and why

Being straight about this saves everyone time. Roughly twenty buttons do not
work; each has a tooltip saying why. Hovering tells you whether it is a missing
feature or a missing integration.

### Needs a third party

Nothing can be done in Core alone.

| What | Needs |
|---|---|
| Bank statement import (MT940) | Bank feed or file upload |
| Payment execution | Payment provider integration |
| Regulator portal submission | Portal authentication per jurisdiction |
| Document upload | DMS integration |
| Email sending | Mail integration |

### Needs reference data first

Works, but has nothing to work with. Part 4 covers who supplies each.

| What | Blocked by |
|---|---|
| Finalising statutory accounts | No verified disclosure checklist for any framework |
| Accounts on Cayman, FRS 105, IOM GAAP, US GAAP | No presentation format |
| Obligation tracking for IOM, Cyprus, UK, USA | No schedule recorded |
| Review due dates | No intervals recorded per risk rating |
| Staff cost budgeting | No payroll rates recorded |

### Built but not reachable

Works in the database, no button yet.

| What | Note |
|---|---|
| Bulk caseload reassignment | Reassign one at a time meanwhile |
| Pair-by-pair intercompany reconciliation | Needs a counterparty column. The group total check catches the same errors |

### Deliberately not built

| What | Why |
|---|---|
| Mandatory second approval on journals | Affinity's policy. The mechanism exists if you change your mind |
| Editing a locked payroll rate | Supersede it from a later date instead |
| Deleting a real client entity | Close it. The records must survive |
| Deleting a posted journal | It would unbalance the ledger |

---

## 5.4 If something looks wrong

### Check these first

**Is the office filter set?** The commonest cause of "my entities have
disappeared".

**Does the badge say "Preview data"?** You are seeing bundled sample data, not
the database. Sign out and back in.

**Is the entity badged DEMO?** Then nothing on it is real, and an odd figure may
simply be odd sample data.

**Is a field empty that should have a value?** Core distinguishes "nothing
recorded" from "nothing applies" and usually says which. If it just says
nothing, that is worth reporting.

### Reporting it

**GitHub Issues**, using the feedback template. One issue per thing, even if you
found several at once — separate issues can be fixed and closed independently.

The template asks two questions that do more work than they look:

**"Could this cause a real problem if it went unnoticed?"** Be honest rather
than polite. A wrong figure on a client statement and a misaligned button are
not the same thing, and treating them the same means the important one waits
behind the trivial one.

**The steps you took.** "I clicked Save and nothing happened" is far more useful
than "saving is broken", because it can be reproduced. Most real bugs are found
by someone doing something, not by reading code.

### What happens next

Covered in `docs/CHANGE-PROCESS.md`. Briefly:

**During testing**, fixes go out within minutes of being made.

**Once operational**, changes go through a branch and a preview site so a change
can be seen working before anyone else is exposed to it, and releases are
weekly — except anything producing a wrong number, which goes out as soon as it
is fixed.

---

## 5.5 A note on trusting the system

Core checks a great deal and refuses a great deal, and it is easy to read that
as the system being authoritative. It is not, and two things are worth holding
onto.

**Core checks that a step was taken, not that it was right.** The month-end
checklist says so explicitly: a reconciliation that balances is still worth
reading. A review marked complete had its boxes ticked; whether the judgement
behind them was sound is not something software can assess.

**Where Core has no data it says so, and that is the honest state rather than a
fault.** An empty obligation schedule means nothing will fall due or be chased.
It does not mean there are no obligations. The gap is visible precisely so it
gets filled rather than trusted.

The refusals exist because certain mistakes are expensive: a fee taken from
another client's money, a director signing figures that then changed, accounts
finalised on a basis nobody established. Where a refusal seems wrong, it is
worth reporting — the reasoning behind it may be mistaken, and it is written
down in the code so it can be argued with.

---

## 5.6 Getting help

**Something broken or confusing** — GitHub Issues, feedback template.

**Reference data to enter** — GitHub Issues, reference-data template. These are
not software changes and should not queue behind them.

**Cannot sign in** — IT. If nobody in the firm can sign in, the Entra client
secret has likely expired.

**A question about what a figure means** — the module section in Parts 2 or 3.
Most figures have a "why it works this way" note explaining what they do and do
not represent.

---

*End of guide.*
