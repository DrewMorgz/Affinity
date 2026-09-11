# Affinity Core

**User guide · September 2026**

---

## Before you start

This is written for people who already do the work. It does not explain what a
beneficial ownership register is, why trust income and capital are held apart,
or what a periodic review is for. You know. What it explains is where those
things live in Core, what Core will refuse to let you do, and why.

That last part is most of this guide, and it is the part worth reading. Core
refuses a great deal. It will not let you close an entity with unbilled time
against it, distribute income from a trust that has only capital, approve your
own payment run, finalise accounts against a framework with no presentation
format, or take a fee from client money the client does not hold. Each refusal
exists for a reason and says what the reason is. If a refusal ever seems wrong,
that is worth reporting — a control nobody can explain gets worked around.

**Everything in Core today is demo data.** All 14 client entities are marked as
such. Nothing you do during testing affects a real client, and the demo data can
be cleared and rebuilt. Enter real client records only when you are told the
move to Affinity's own environment is complete.

---

## Signing in

Core is at **core.affinityco.com**. Sign in with your Affinity Microsoft
account — the same one as your email. There is no separate password.

Your name appears top right. **If it says someone else's name, stop and report
it.** That was a real fault until recently and it should not come back.

If your role shows as *Administrator* and you expect something else, your email
does not match your staff record. Tell whoever is running the testing; it is a
two-minute fix and it affects what you can see.

---

## What is not ready yet

This matters more than anything else in the guide during testing, because most
of what looks broken is not broken. It is empty.

| What | State | Who fills it |
|---|---|---|
| Payroll rates | Empty for all six jurisdictions | Finance |
| Group allocation percentages | Empty | Finance |
| Obligation schedules | 15 recorded, **none confirmed** | Compliance |
| Obligation schedules for IOM, Cyprus, UK, USA | Nothing recorded at all | Compliance |
| Periodic review intervals | Empty | Compliance |
| Presentation formats | 4 of 11 frameworks have one | Accounts |
| Required document lists | Empty | Accounts |
| Bank matching rules | Empty | Finance |
| Functional roles (preparer, approver) | None granted | Whoever runs testing |

Two consequences you will meet immediately.

**Statutory accounts cannot be finalised** for seven of the eleven frameworks,
because a framework with no presentation format has no prescribed captions to
present. Core says so when you try.

**Every obligation shows as unconfirmed.** That is not a bug — confirming is a
deliberate act by Compliance, and an unconfirmed deadline is a draft. Until
someone confirms them, Core will not treat any deadline as reliable, and it is
right not to.

---

## How work moves through Core

Four sequences account for most of what the system does. Everything else hangs
off them.

**Taking on a client.** CRM records the prospect and the pipeline stage. When
they convert, Onboarding opens a case, CDD items are recorded and verified, and
the entity goes live. The go-live gate is in the database, not the screen: no
CDD means refused, unverified CDD means refused. You cannot talk your way past
it and neither can anyone else.

**Administering it.** Entity Admin holds the registers — officers, shareholders,
beneficial owners, charges, bank accounts, addresses, safe custody. Every one of
them can now be changed as well as added to, which was not true until recently.
Nothing is deleted: a resigned officer stays on the register with a resignation
date, a satisfied charge with a satisfaction date, a closed account with a
closing date. Who held what on a given date is the question that gets asked
later, and a register showing only the current position cannot answer it.

**Billing it.** Time is recorded against the entity, approved, and either billed
through a billing run from WIP or invoiced by hand. Disbursements are recorded
and recharged. Credit control chases what is outstanding and records the chase,
because three chases with no response is a different conversation from one.

**Reporting on it.** Bookkeeping and Accounting operations carry the ledger,
month-end and year-end. Fiduciary carries statutory accounts and the trust
funds. Consolidation carries the group.

---

## Entity Admin

The registers, and the largest module in Core.

**Adding.** Each register has an add form. Officers, shareholders, beneficial
owners, signatories, charges, bank accounts, addresses, meetings, assets, safe
custody items, file notes, dividends.

**Changing.** Resign an officer, correct their details, update or remove a
beneficial owner, remove a shareholder, end a signatory's authority, satisfy a
charge, close a bank account, revalue an asset, retrieve a safe custody item,
mark a dividend paid.

Removing a beneficial owner or a shareholder **requires a reason**. Removing
someone from the beneficial ownership register is a filing matter in most
jurisdictions, and a holding that simply disappears from a share register cannot
be explained afterwards.

**The entity itself.** Edit the details, set the FATCA and CRS classification,
record who is responsible, set which services Affinity provides, close it.

Closing is **refused while unbilled time stands against the entity**, because
closing writes that work off. Bill it or write it off deliberately first.

**Reassigning a caseload** moves every entity from one person to another in a
single step. Doing forty one at a time is how one gets missed, and the one
missed is the one nobody administers.

**What is not there.** Ownership percentages should account for 100% across the
beneficial ownership register; Core reports the total so an incomplete register
is visible, but it does not refuse an incomplete one — that judgement is yours.

---

## Compliance

Risk assessments, screening, periodic reviews, registers of breaches and
declarations.

**Periodic reviews.** Start a review, complete it, approve it, and set the review
frequency by risk rating. The frequencies are empty, so no next-due date can be
calculated for anybody — 14 clients currently show as needing a review and none
has an interval set. That is Compliance's first job.

A review cannot be approved by whoever completed it.

**Jurisdiction obligations.** Recorded per jurisdiction and area, with the
legislation reference and a named owner. Confirming requires both: a confirmed
deadline nobody can trace cannot be checked by anyone else. Amending a confirmed
obligation **withdraws the confirmation**, because whoever confirmed it confirmed
different terms.

**Coverage across all jurisdictions** answers the question this screen otherwise
cannot, because it shows one jurisdiction at a time: which combinations have
nothing recorded anywhere, and which have obligations recorded but none
confirmed. Those need different work from different people.

---

## Onboarding

Cases, CDD items, and attrition.

**Going live is gated in the database.** No CDD recorded means refused.
Unverified CDD means refused. The screen says so before you try.

**Attrition** — a client leaving — runs Manager, then MD, then Group CEO or COO,
in that order. One person cannot satisfy two stages, and the sequence is
enforced rather than suggested.

---

## Bookkeeping

The ledger.

**Journals post immediately.** No journal requires a second pair of eyes. That
is Affinity's policy and it is a deliberate choice, not an absence — an approval
threshold can be set per entity in System admin, and journals at or above it are
then held as draft until somebody else approves them.

**Reversing is not deleting.** A posted journal is never removed. A reversing
entry is posted against it, dated, with a reason. Deleting one would unbalance
the ledger and leave nothing to explain why the figures changed.

A journal needs a narrative — it is what the auditor reads — at least two lines,
an open period, and it must balance. Core reports an imbalance as *debits and
credits differ by 250.00* rather than as a constraint violation.

**Querying a transaction** marks it as seen and unresolved, which is a different
state from one nobody has looked at.

**Trial balance imports can be rolled back** as one act. An import of the wrong
file, or the right file against the wrong entity, would otherwise have to be
unpicked journal by journal.

---

## Accounting operations

Month-end, year-end, client money, bank reconciliation, VAT, fixed assets.

**Month-end** reports what is outstanding and each item is actionable: open the
period, revalue FX, post recurring journals, release deferred income, reopen a
period, close it, lock it finally.

Closing prevents further posting. The final lock is stronger and separate,
because a closed period can be reopened with a reason and a finally-locked one
is meant to stay shut. Two steps because they are two decisions.

**Year-end** rolls the result to reserves and is the least reversible thing in
Core. Its gates are of two kinds and Core distinguishes them: draft journals in
the year and a client money shortfall are **hard** and cannot be overridden;
months still open and accounts not yet approved are **advisory** and can be, but
only after a refusal tells you which failed.

**Client money.** The three-way reconciliation — bank against book against the
sum of the client ledgers — is a regulatory requirement rather than housekeeping,
and must be signed off by someone other than whoever prepared it.

A shortfall means the firm holds less than it owes. Remediation is the firm
paying its own money in, which is why it asks for Affinity's entity and bank
account: **a shortfall is never fixed from another client's balance.**

Taking a fee from client money shows what is available first — the lower of what
is held and what is billed — and refuses anything above it.

**Overdrawing a client is allowed and named.** Where a movement would take a
client's balance below nil, the button changes to *Record anyway — creates a
breach* and turns red. Core does not stop you, because occasionally the
movement has genuinely happened and the records must reflect it. What it will
not do is let it pass quietly: the wording is the warning, and the breach is
recorded as one.

**Bank reconciliation.** Match against posted journals, or by configured rules
once rules exist. Add reconciling items for what is on one side and not the
other; without them a reconciliation that is genuinely correct still looks wrong.
The reconciliation view says plainly whether it balances.

**VAT.** Preparing and posting are separate so a return can be checked before it
reaches the accounts. The reverse charge posts both sides — the net effect is
nil, which is exactly why omitting it is easy to miss, and a return that nets to
the right figure from two wrong ones is still wrong.

**Fixed assets.** Capitalise, depreciate, dispose, impair, transfer between group
entities. Disposal asks for the proceeds because it calculates profit or loss
against the written-down value. Impairment is a write-down that is **not**
depreciation: a fall in value rather than the passage of time, and conflating
them misstates both. A transfer is not a disposal — the group still owns it.

---

## Fiduciary

Statutory accounts and trust accounting.

**Trust funds are never summed.** Income belongs to the life tenant, capital to
the remaindermen. Every entry asks which fund and none of them defaults it,
which is deliberate friction in the one place friction is worth having — paying
capital as income is a breach of trust rather than a misposting, and a field
that defaults is a field people stop reading.

Distributing checks there is enough in **that fund**, not in the trust. A trust
with ample capital and no income cannot pay an income distribution.

**Check the funds** before attempting a distribution rather than after being
refused.

**Statutory accounts** run: open a set, generate the statements, submit for
review, approve, finalise. Opening is refused on a framework with no
presentation format, one the jurisdiction does not accept, or a period that has
not finished. **Which frameworks apply** answers that before you try.

Approval is refused if you prepared the set, and refused unless every readiness
gate passes. The director approving is signing that the accounts give a true and
fair view.

**Posting an adjustment to an approved set withdraws the approval** and returns
it to draft. The director signed particular figures; this changes them, and they
will have to approve the adjusted accounts. Core warns before posting rather
than reporting afterwards.

**Disclosures** must be addressed — by a note, or marked not applicable with a
reason — before a set can be finalised. A disclosure dismissed without a reason
is indistinguishable from one nobody looked at.

**Account mapping.** An account with a balance and no caption is missing from the
statements entirely, and **the statements still balance without it**. That is the
quietest failure in the system, which is why the mapping view highlights the
unmapped accounts rather than listing the mapped ones.

---

## Payables and purchasing

**Assembling, approving and executing a payment run are three separate acts.**
The person who chooses who gets paid should not authorise it, nor release it.
That is the control that stops a payment to an account nobody checked.

Adding open payables to a run is refused if nothing was added, and says why —
no open payables, or payables in a different currency from the run. A run that
looked assembled is one somebody goes on to approve.

**Paying everything due up to a date** has no approval step in front of it. It is
for payables that are not contentious, where the sequence above is more process
than the payment warrants. Anything that should be approved by a second person
should go through a payment run instead.

**Three-way matching** is the order, the goods received, and the invoice. The
tolerance is explicit because an exact match almost never happens, and a system
demanding one gets overridden into uselessness.

**Expense claims.** Submit, approve, reject, reimburse. Approval is refused on
your own claim. Rejecting requires a reason — a claim returned without one gets
resubmitted unchanged.

**Credit notes** are their own documents raised against an invoice. Reversing an
invoice by editing it destroys the audit trail and leaves the client's account
showing a figure that never existed.

**Intercompany.** Draw, repay, accrue and settle group loans. The group total
must eliminate to nil; a balance that sits unsettled is one consolidation has to
keep eliminating, and the longer it sits the harder it is to establish what it
was for. A loan with no interest rate is flagged, because a tax authority will
impute one.

---

## Timesheets and billing

Record time, submit it, approve it, correct it before submission.

**The narrative appears on the client's invoice.** A specific one answers a fee
query before it is asked; "Various" is the commonest cause of a fee being
written off.

**Available WIP** shows what a billing run would actually pick up for a client.
**Run billing from WIP** turns approved unbilled time into invoices up to a date,
which is the bridge between the time recorded and the fee charged.

---

## Documents

Seventeen folder categories, each with its own retention policy per
jurisdiction. **Retention is a consequence of the folder, not a field you type** —
filing something in the right place is what sets how long it is kept.

Documents can be attached to a record, searched, reclassified and deleted.

**File storage is not yet connected.** The register of documents works; the bytes
themselves need Azure Blob storage, which is part of the move to Affinity's own
environment.

---

## System admin

Users, roles, thresholds, demo data, and the standing checks.

**Two kinds of role.** A job title on the staff record, and a functional role —
preparer, approver — granted separately. The functional role is where
segregation of duties lives: **preparer and approver cannot be held by the same
person**, and Core refuses the second grant.

That is the other half of the two-person rules. Those refuse at the moment of the
act — you cannot approve your own payment run. This stops the roles accumulating
in the first place.

**The journal approval threshold** is per entity. Zero means every journal needs
approval; leaving it unset means none does, which is the current position and one
an auditor may raise.

**Demo data.** Add and remove demo entities, and clear all of it, which requires
typing a phrase in full. Flagging a **real** entity as demo is the dangerous
direction, because it is what makes it deletable — Core refuses where there is
time, invoices or posted journals against it.

**Standing checks.** *Find silent no-ops* lists functions that can report success
and do nothing. Two were found in this build by hand: approving time that was
still in draft, and adding open payables to a run with none open. Both said
"done". This finds the shape of that fault rather than waiting for somebody to
notice a figure that never moved.

---

## What needs something outside Core

Five things are built and wait on a third party, not on development.

| | |
|---|---|
| Bank statement import (MT940) | A feed or file from the banks |
| Payment files (SEPA pain.001) | Bank connectivity |
| FX rates | A rate feed |
| Document storage | Azure Blob, part of the environment move |
| Trial balance import | The file format from the source system |

---

## When something is wrong

**If Core refuses something and the refusal seems wrong, report it.** Not because
the refusal is necessarily a bug — most are deliberate — but because a control
nobody can explain is a control that gets worked around, and that is worse than
not having it.

**If a screen shows a list that looks like sample data, it probably is.** Several
modules display worked examples by default and read the real records on demand:
look for *Show recorded filings*, *Show recorded invoices*, *Show posted
journals*, *Show recorded tasks*. This is being tidied.

Raise anything through the change process at `docs/CHANGE-PROCESS.md`, or the
issue templates in the repository. Say what you did, what you expected, and what
happened. A screenshot of a refusal is worth more than a description of it.
