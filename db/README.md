# Affinity Accounting Engine — database

Backend ledger for the Affinity accounting platform. Runs on PostgreSQL (Supabase).
These files are the source of truth; the React app calls them via Supabase RPC.

## Apply order
1. `001_ledger_core.sql`     — multi-entity, multi-currency double-entry ledger, dimensions, period control, audit, balance invariant
2. `002_posting_engine.sql`  — `post_journal()` and `reverse_journal()` (the only way to write to the ledger)

Run in the Supabase SQL editor (or as migrations) in the order above.

## Before go-live
- Mark `post_journal()` / `reverse_journal()` as `SECURITY DEFINER` behind an authenticated role
  so only the app can post, not raw SQL.
- Posted journals are immutable — corrections are made only via `reverse_journal()`.

## Build order from here
Phase 1: posting engine [done] → AR/AP control sub-ledgers → billing-from-proposals → disbursements pass-through → deferred-income month-end → FX revaluation
Phase 2: client/entity bookkeeping (run parallel to Quantios, reconcile)
Phase 3: client money, statutory accounts (multi-GAAP, iXBRL), consolidation
