# Moving Affinity Core off Supabase, into Affinity's Azure tenant

The goal is that client data sits on infrastructure Affinity controls, under
Affinity's own backup and retention policy, rather than with a third party.

This has been tested end to end against a copy of the database. The results of
that trial are in "What the trial run found" below, including two problems it
surfaced that would otherwise have appeared on the day.

---

## What actually moves

Supabase provides three things. Only the first moves by itself.

| Component | Replacement |
|---|---|
| PostgreSQL database | Azure Database for PostgreSQL — Flexible Server |
| PostgREST (turns `rpc()` calls into HTTP) | The same PostgREST, in a container |
| Auth (Entra sign-in, JWTs, sessions) | GoTrue, in a container |

The application makes **81 calls to 94 database functions across 31 files**,
all through PostgREST. That is why bare Azure PostgreSQL is not sufficient on
its own — there would be no API for the app to call.

**What changes in the application: one environment variable.** Point
`REACT_APP_SUPABASE_URL` at the new gateway. No code changes.

---

## Use managed PostgreSQL, not a container

`docker-compose.yml` deliberately does **not** include a Postgres container.
Use Azure Database for PostgreSQL, so Microsoft handles backups, patching,
failover and point-in-time restore.

Running Postgres yourself means owning all of that. It is the part most likely
to be neglected until the day it matters, and "we have backups" is not the same
as "we have tested a restore".

---

## The sequence

Nothing here is irreversible until step 7, and Supabase stays running
throughout.

**1. Provision.** Azure Database for PostgreSQL — Flexible Server. Choose the
region deliberately; it is the answer to "where is our client data held".
Enable point-in-time restore.

**2. Export.** `./01_export_from_supabase.sh` — needs the database connection
string from Supabase → Settings → Database, not the API URL.

**3. Check the export.** Confirm `manifest.txt` lists the row counts you
expect. If the entity count looks wrong here, stop.

**4. Restore.** `./03_restore_and_verify.sh export-<timestamp>` — this refuses
to run against a database that already has tables, so it cannot be pointed at
the wrong server or run twice by accident.

**5. Read the verification output.** It compares the target against the export
manifest and checks that journals still balance, the write layer is present,
grants survived, and `anon` gained nothing. It will not report success on any
mismatch.

**6. Stand up the stack.** Deploy `docker-compose.yml` to Azure Container Apps.
Generate the JWT secret and anon key (see below). Add this stack's callback to
the existing Entra app registration — the same registration, one extra
redirect URI.

**7. Cut over.** Change the two GitHub secrets to the new URL and key. Push.
Sign in and confirm Entity Admin shows **"Live data"** with the right entity
count.

**8. Leave Supabase running for two weeks.** Cheap insurance. Roll back by
changing the two secrets back.

---

## Generating the keys

```bash
# JWT secret — everything signs with this
openssl rand -base64 48

# The anon key, a JWT signed with the above.
# Use https://jwt.io or a script; the payload is:
#   { "role": "anon", "iss": "supabase", "iat": <now>, "exp": <now + 10 years> }
```

There is deliberately **no service_role key** in this stack. Supabase issues
one that bypasses all row-level security; nothing in Affinity Core needs it,
and its existence is a standing risk. Not creating it is simpler than
protecting it.

---

## What the trial run found

The whole cycle was run against a copy: 128 tables, 284 functions, all data.
**Zero mismatches**, journals balanced, grants intact, `anon` locked out.

Two problems surfaced that would otherwise have appeared mid-migration:

**A missing role.** The restore failed 15 times with
`role "affinity_app" does not exist`. That role is created inside `db/044` and
granted to in three files, and `pg_dumpall`'s filtered output dropped it. The
export now derives the role list **from the database** rather than a
hand-maintained list, so a role added later cannot be forgotten. Errors went
from 16 to 1.

**The remaining error is harmless** — `schema "public" already exists`, true of
every fresh database.

The lesson worth keeping: a restore that "completes" is not a restore that
worked. Only counting proves it.

---

## Backup and retention

Supabase currently does this invisibly. Once it is yours, it is yours.

| What | Setting | Why |
|---|---|---|
| Automated backups | Azure PITR, 35 days | The maximum, and it costs little |
| Long-term retention | Monthly to Azure Backup Vault, 7 years | Statutory record retention across the six jurisdictions |
| Geo-redundancy | Enabled | The region holding client data should not be a single point of failure |
| **Restore test** | **Quarterly, to a scratch server** | The only thing that distinguishes a backup from a hope |

That last row is the one that gets skipped. Put it in the compliance calendar
alongside the CPD and review dates, with a named owner, so it is evidenced
rather than intended. It is also what an ISO 27001 auditor will ask to see.

---

## What Affinity takes on

Being straight about the cost, because it is ongoing rather than one-off:

- Patching the three containers when images are updated
- Certificate renewal, if not using Container Apps' managed certificates
- Monitoring, and being the one who investigates when Cayman cannot sign in
- Quarterly restore tests
- The Entra client secret expiry, which stops sign-in firm-wide with no warning

For a firm of this size that is real work. It is the honest price of the data
being yours, and it is usually underestimated. If nobody is going to own it,
self-hosting is a liability rather than an improvement — and Supabase with a
data processing agreement and a chosen region may satisfy the actual concern
at a fraction of the effort.

---

## Files

| File | Purpose |
|---|---|
| `01_export_from_supabase.sh` | Roles, schema, data, auth, and a manifest |
| `03_restore_and_verify.sh` | Restores, then proves it worked |
| `docker-compose.yml` | PostgREST, GoTrue and Kong |
| `kong.yml` | Gateway routing |

`02` is deliberately absent: checking the export is a human reading
`manifest.txt` and deciding the numbers look right. That judgement should not
be automated away.
