# Affinity Accounting Engine — database

Multi-entity, multi-currency double-entry accounting engine for Affinity.
PostgreSQL (Supabase). The React app calls these via Supabase RPC / views.

## Apply order (run once each, in sequence)
001_ledger_core         — ledger, dimensions, period control, audit, balance invariant
002_posting_engine      — post_journal() / reverse_journal() gatekeeper
003_billing             — proposals, signoff, invoices, disbursement pass-through
004_deferred_income     — month-end deferred income release
005_reporting           — trial balance, P&L, balance sheet, drill-down (reversed-safe)
006_accounts_payable    — supplier master, purchase ledger, payment run
007_accounts_receivable — customer receipts / cash application
008_fx_revaluation      — period-end unrealised FX revaluation
009_multicurrency_ar    — foreign invoicing + realised FX on receipt
010_multicurrency_ap    — foreign supplier invoices/payments + realised FX
011_recurring_billing   — billing run by frequency (catch-up, idempotent)
012_disbursement_vat    — true disbursement vs VATable recharge (+ markup)
013_fx_rate_upload      — bulk idempotent rate ingest (CSV/API), auto-reciprocal
014_fixed_assets        — register, capitalise, depreciate, dispose

## Before go-live
- Mark mutating functions SECURITY DEFINER behind an authenticated role.
- Posted journals are immutable; correct only via reverse_journal().
- Balances include everything except 'draft' journals (reversed entries stay,
  their reversal cancels them).

## Still to come (engine)
expense management, bank reconciliation, intercompany, consolidation, VAT return.

## Front-end / integration (separate stream)
invoice templates + Entity Admin pull + SEPA, rate-fetch function, screens.
