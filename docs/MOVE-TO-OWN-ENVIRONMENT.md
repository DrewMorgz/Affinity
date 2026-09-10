# Moving Core's data into Affinity's own environment

**Requirement:** no client data outside Affinity's control. Currently the
database sits with Supabase, a third-party processor, on AWS infrastructure.

This is the plan to change that.

---

## What has to move, and what does not

Core has four pieces. Only one is the problem.

| Piece | Now | After |
|---|---|---|
| **The database** | **Supabase (AWS)** | **Azure Database for PostgreSQL, your subscription** |
| The REST API | Supabase | Azure Container Apps, your subscription |
| Sign-in | Supabase brokering your Entra | Same, self-hosted |
| The website | Azure Static Web Apps, your subscription | Unchanged |

The website already runs in your tenant and holds no data. The identity is
already yours. So this is a database and API move, not a rebuild.

**The application code does not change.** It talks to a REST API; after the
move it talks to yours at a different address. That is two environment
variables, not a rewrite. This was the point of keeping the schema to standard
PostgreSQL with no vendor-specific extensions — 84 SQL files, all portable.

---

## What you end up with

    Browser  ──►  core.affinityco.com          (Azure Static Web Apps, yours)
                        │
                        ▼
                  api.affinityco.com            (Azure Container Apps, yours)
                  Kong + PostgREST + GoTrue
                        │
                        ▼  private network only
                  PostgreSQL                    (Azure Database, yours)
                  no public endpoint

**The database has no public address at all.** It is reachable only from the
container app on a private network. That is stronger than any IP restriction:
there is nothing to restrict because there is nothing exposed.

And at that point IP restriction on the front end becomes worth doing, because
it would be the only route in rather than one of two.

---

## What is already built and tested

From earlier work, verified end to end:

- **`01_export_from_supabase.sh`** — full schema and data export
- **`03_restore_and_verify.sh`** — restore and check. Tested: 128 tables, 284
  functions, all data, zero mismatches, journals balancing, grants intact, and
  the anonymous role correctly locked out
- **`docker-compose.yml`** — Kong, PostgREST and GoTrue. Deliberately no
  PostgreSQL container, because the database should be Azure's managed service
  rather than a container nobody backs up
- **`recovery_bundle.sh`** — the cold-storage archive

**No service_role key exists in the stack.** Nothing needs one, and not
creating it is simpler than protecting it.

---

## What Carolyne needs to create

Four things in your subscription. All standard Azure resources.

| Resource | Why | Notes |
|---|---|---|
| **Azure Database for PostgreSQL — Flexible Server** | The data | Version 15 or later. **Private access (VNet), not public** |
| **Virtual network** | So the database has no public endpoint | One VNet, two subnets |
| **Azure Container Apps environment** | Runs the API | VNet-integrated |
| **DNS record** | `api.affinityco.com` | CNAME to the container app |

### The region decision — worth thinking about

There is no Azure region in the Isle of Man. The realistic choices:

**UK South (London)** — UK data protection regime, closest to the Isle of Man,
and the UK has adequacy with the EU. Probably the right answer for a Manx firm.

**West Europe (Netherlands)** — where the website already runs, inside the EU.

This is a decision for Colette rather than for me: it determines which
jurisdiction's data protection law governs the client records. Worth settling
before the server is created, because moving a database between regions later
is another migration.

### Sizing

Start small. **Burstable B2s, 32 GB storage** is ample — the whole database is
a few hundred megabytes and will stay small for years. It scales up without
downtime if needed. Roughly £25–35 a month.

---

## The sequence

Each step is verifiable before the next, and nothing is switched over until the
new stack is proven.

**1. Create the resources** (Carolyne). Nothing touches Core.

**2. Export from Supabase.** `01_export_from_supabase.sh`. Read-only; the live
system carries on.

**3. Restore into Azure PostgreSQL.** `03_restore_and_verify.sh` reports the
inventory: tables, functions, row counts, and whether the journals balance. A
restore that completes but produces the wrong count is caught here rather than
by someone noticing a register is empty.

**4. Generate new JWT secrets.** The anon key is a token signed with a secret.
Yours will be new and Supabase's will be worthless. This is a good thing: the
key currently in your bundle stops being able to reach anything.

**5. Deploy the API.** Kong, PostgREST and GoTrue into Container Apps, on the
private network with the database.

**6. Point GoTrue at your Entra tenant.** The trickiest step, and the one most
likely to need a second attempt. Same Entra app registration, different
callback address.

**7. Test against the new stack** on a preview URL, with the current Supabase
still live. Sign in, read, write, check the audit trail.

**8. Switch over.** Two GitHub secrets change to the new URL and key. One
deploy.

**9. Verify, then delete the Supabase project.** Not before — it is the
fallback until the new stack is proven. Once deleted, take a recovery bundle
from the new database immediately.

---

## Honest assessment

**This is a day's work, not an afternoon**, and most of it is Carolyne's rather
than mine. Steps 1 and 6 are where it will stall: VNet configuration is fiddly,
and self-hosted GoTrue talking to Entra is the part I would expect to fail once
before it works.

**Nothing is irreversible until step 9.** Supabase stays live throughout, so a
failed attempt costs time rather than data.

**The risk worth naming:** self-hosting means you own the backups, the patching
and the uptime. Supabase does that now. Azure's managed PostgreSQL does most of
it — automated backups, point-in-time restore, patching — which is why the plan
uses the managed service rather than a PostgreSQL container. But it becomes
Affinity's responsibility to check it is working. The quarterly restore test
stops being good practice and becomes necessary.

---

## Until it is done

**Test with demo data only.** Every client entity in Core is currently
fictional, so testing can proceed at full speed with no client data leaving
your control. That is not a compromise — it is the same testing you would do
anyway.

**The line is clear:** no real client record — no officer, no beneficial owner,
no CDD note — until the database is in your environment. That includes a
migration of existing records from spreadsheets.

If anyone needs to enter something real before the move, the answer is not yet.

---

## What I need from you to proceed

1. **The region decision**, ideally with Colette's view
2. **Carolyne to create the four resources**, or confirmation that she will
3. Whether you want `api.affinityco.com` or another name for the API

I can prepare everything else now: the deployment configuration for Container
Apps, the GoTrue settings for your Entra tenant, and the switchover steps as
something Carolyne can follow rather than something requiring me at each stage.
