# How a change gets made

How feedback becomes a released change in Affinity Core — during testing, and
once staff depend on it.

---

## The problem this solves

**Right now every push to `main` deploys straight to production.** There is no
review, no staging, and no gap between a mistake being made and staff seeing
it. The only way back is another commit.

That is acceptable during testing and genuinely useful — fast turnaround on
feedback is worth more than ceremony while nobody depends on the system. It
stops being acceptable the moment client work runs through Core.

There is also an asymmetry worth naming up front. **Code changes and database
changes are not equally safe.** Code is versioned, reviewable, and a bad one is
reverted with a click. Database changes have been SQL files run by hand against
production — no review, no staging, and no undo except restoring a backup. The
riskier half of the system currently has the weaker process.

---

## During testing

Keep it fast, but capture everything.

### Feedback goes in GitHub Issues, not Teams

One issue per item. The templates are in the repository, so a tester picks
**New issue** and gets prompted for what is actually needed.

Two fields matter more than they look:

**"Could this cause a real problem if it went unnoticed?"** A wrong figure on a
client statement and a misaligned button are not the same thing, and treating
them the same means the important one waits behind the trivial one.

**The steps.** "I clicked Save and nothing happened" is far more useful than
"saving is broken", because it can be reproduced. Most of the day's real bugs
were found by executing something, not by reading it.

Feedback in a Teams thread is feedback that gets lost. An issue survives being
forgotten for a fortnight.

### Fixes still go straight to main

While testing, a fix pushed to `main` deploys in about two minutes and the
tester can look again immediately. That is the right trade while the only
people affected are the ones who reported it.

**Except for database changes.** Even now, run the recovery bundle before
applying SQL to production. It takes a minute and it is the difference between
a mistake and a loss.

---

## Once staff depend on it

Three things change.

### 1. Changes go through a branch and a preview

Azure builds a preview site for every pull request automatically, at no extra
cost. The flow:

    branch → commit → pull request → Azure builds a preview URL
           → test the change on that URL → merge → deploys to production

The preview is the point. It is the same build, the same database, on a
throwaway address — so a change can be seen working before anyone else is
exposed to it. Merging is then a decision rather than a hope.

This is already configured. The workflow includes a `close_pull_request_job`
that tears the preview down when the pull request closes.

### 2. Database changes get a staging database first

This is the gap that matters most, and it needs a decision rather than a
script.

**Create a second Supabase project as staging.** Restore a copy of production
into it, run the SQL there, check it, then run the same file against
production. The cost is small; the alternative is discovering a broken
migration on live client records.

Rules worth holding to:

- **Every schema change is a numbered file in `db/`**, never a statement typed
  into the SQL editor. A change that exists only in the editor's history is
  invisible to everyone, cannot be reviewed, and cannot be replayed onto a
  restored database. The numbering is what makes the sequence reproducible —
  proven by building from empty, 37 files, no errors.
- **Run the recovery bundle immediately before any migration.** Not last
  night's — immediately before.
- **Never edit a file that has already been run in production.** Add a new one.
  An edited file means production and the repository disagree about what
  happened, and nobody can tell which is right.

### 3. Releases are deliberate, not continuous

Batch changes into a release rather than deploying each fix as it lands. A
weekly release that people expect is far less disruptive than eleven surprise
deployments, and it gives a natural point to check the whole thing still works
rather than just the bit that changed.

Exception: anything in the "could cause a real problem" category goes out as
soon as it is fixed and tested. A wrong figure on a client statement does not
wait for Friday.

---

## Who decides what gets built

Worth settling before feedback starts arriving, because it will arrive faster
than it can be actioned and something has to sequence it.

A rough order that reflects the actual risk:

1. **Anything producing a wrong number, or putting client data at risk.**
   Immediately.
2. **Anything blocking work** — a screen that will not save, a report that will
   not run.
3. **Reference data gaps.** Not software changes, but they block real use, and
   they need the person who owns the data rather than a developer.
4. **Confusing rather than broken.** Often a wording or layout fix, often the
   highest value per hour of work.
5. **Suggestions.** Genuinely useful, and genuinely last.

---

## What this does not cover

**Who can deploy.** Currently one person, and the same is true of every account
Core depends on. That is a single point of failure independent of any process,
and no amount of branching fixes it. A second administrator on GitHub, Supabase
and Azure is the first thing on this list that is not about software.

**Rollback.** A code change is reverted with a click. A database change is not,
and there is currently no tested rollback path — only restore-from-backup,
which loses anything entered since. If Core is going to hold client money
records, a quarterly restore test is not optional.
