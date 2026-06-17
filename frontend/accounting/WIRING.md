# Wiring the accounting engine into Affinity Core

This connects the tested engine (`db/001..050`) to the live app. Three parts:
**(A)** run the database, **(B)** drop in the files, **(C)** add the screen to the shell.

---

## A. Run the database in Supabase (one time)

The engine is SQL — pushing to GitHub does **not** create it. In the Supabase
**SQL editor**, run the migrations **in numeric order**:

```
db/001_ledger_core.sql
db/002_posting_engine.sql
…
db/050_kpis.sql
```

Paste each file’s contents and run, 001 → 050, in sequence (later files depend on
earlier ones). Then:

1. **Seed an entity** (or import yours) so the entity picker has something to show.
2. **Wire identity:** in `db/044`, `current_app_user()` reads a session GUC — for
   Supabase, change its body to return `auth.uid()::text` (or your JWT claim) so
   row-level security keys off the logged-in user.
3. **Ownership of SECURITY DEFINER functions:** make sure they’re owned by a
   non-superuser role with exactly the rights you intend (not the postgres superuser).

> Deferred on purpose: iXBRL tagging for electronic filing.

---

## B. Add the files and dependency

Copy these into the app (paths relative to `src/`):

```
src/accounting/AffinityAccounting.jsx
src/accounting/lib/supabaseClient.js
src/accounting/lib/accountingApi.js
```

Install the client:

```
npm install @supabase/supabase-js
```

Set environment variables — locally in `.env`, and in **Netlify → Site settings →
Environment variables**:

```
REACT_APP_SUPABASE_URL=https://<your-project>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon public key>
```

If these are missing the screen still builds — it shows a “Connect the database”
setup state instead of crashing.

---

## C. Add the screen to the unified shell

In `affinity_core_unified_v3.jsx`:

```jsx
// 1) import near the other module imports
import AffinityAccounting from "./accounting/AffinityAccounting";

// 2) add a nav entry wherever the module list/menu is defined, e.g.
//    { key: "accounting", label: "Accounting", icon: <SomeIcon/> }

// 3) render it when that nav key is active, e.g. in the main switch:
{activeModule === "accounting" && <AffinityAccounting />}
```

Match whatever pattern the shell already uses for its other modules (it may be a
`switch`, a route table, or a map). The component is self-contained and needs no props.

Commit to `main` → Netlify rebuilds → **Accounting** appears in the app.

---

## What each screen reads (all live RPCs)

| Tab | Engine RPC |
|-----|------------|
| Overview (KPIs) | `build_kpi_dashboard(p_entity, p_start, p_end)` |
| Receivables | `customer_credit_status`, `report_collections` |
| Cash flow | `cash_flow_statement(p_entity, p_start, p_end)` |
| Auditor pack | `build_audit_pack(p_entity, p_start, p_end)` |

Separate existing screens (already on the branch) cover the rest:
- **Financial statements** → `AffinityFinancialStatements.jsx` ← `get_accounts_set_json(p_set_id)`
- **Invoice** → `AffinityInvoice.jsx` ← `get_invoice_json(p_invoice_id)`

---

## Note on the existing deploy issue

There’s a known, separate problem where changes to `main` don’t always show on the
live Netlify site (the old splash/login cards). If that’s still unresolved, fix it
**before** wiring these screens, or they may hit the same wall. The agreed
diagnostic was: clone the repo, `npm start`, check `localhost:3000` — if local is
correct but Netlify isn’t, it’s a Netlify-side issue; if local is also wrong, the
built files differ from GitHub (branch/uncommitted mismatch).
