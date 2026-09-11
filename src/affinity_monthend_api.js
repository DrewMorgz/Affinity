// src/affinity_monthend_api.js
// ─────────────────────────────────────────────────────────────────────────────
// MONTH-END CLOSE
//
// The month-end routines all existed in the engine and none was reachable.
//
// The one that carries regulatory weight is the client money reconciliation —
// a three-way check of bank against book against the sum of client ledgers.
// cmReconSignOff is a GUARDED wrapper: db/075 added the control the engine's
// sign_off_reconciliation lacked, which is that the person who prepared a
// reconciliation cannot sign it off. Always use the wrapper.
//
// The three differences mean different things and are never merged:
//   internal — book against client ledgers: our own records disagreeing
//   external — book against bank: our records against the bank's
//   shortfall — holding less than we owe, which is the reportable one
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, isConfigured } from "./affinity_accounting_supabase";

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in — the database cannot be reached." };
  }
  try {
    const { data, error } = await supabase.rpc(fn, args || {});
    if (error) return { ok: false, live: true, data: null, error: clean(error.message) };
    return { ok: true, live: true, data, error: null };
  } catch (e) {
    return { ok: false, live: false, data: null, error: String((e && e.message) || e) };
  }
}
const clean = (m) => !m ? "That could not be completed."
  : String(m).replace(/^ERROR:\s*/i, "").replace(/\s*CONTEXT:[\s\S]*$/i, "").trim();

// ── The checklist ───────────────────────────────────────────────────────────
export const monthEndChecklist = (entityId, period) =>
  call("month_end_checklist", { p_entity: entityId, p_period: period });

// ── The routines ────────────────────────────────────────────────────────────
export const runRecurringJournals = (asOf) =>
  call("run_recurring_journals", { p_as_of: asOf, p_created_by: null });
export const runDeferrals = (entityId, asOf) =>
  call("run_deferrals", { p_entity: entityId, p_as_of: asOf, p_created_by: null });
export const runFxRevaluation = (entityId, period) =>
  call("run_fx_revaluation", { p_entity_id: entityId, p_period: period,
                               p_created_by: null });
export const postDepreciation = (assetId, date, months) =>
  call("post_depreciation", { p_asset: assetId, p_date: date, p_months: months || 1,
                              p_created_by: null });

// Rates as [{ from_ccy, to_ccy, rate_date, rate }]. with_inverse also stores
// the reciprocal, so a GBP/EUR rate gives EUR/GBP without a second entry.
export const upsertFxRates = (rates, source, withInverse) =>
  call("upsert_fx_rates", { p_rates: rates, p_source: source || "manual",
                            p_with_inverse: withInverse !== false });

// ── Client money reconciliation ─────────────────────────────────────────────
// The bank balance is a parameter because it comes from the statement, not
// from our own books — that is what makes it a reconciliation rather than a
// restatement.
export const runClientMoneyRecon = (accountId, reconDate, bankBalance) =>
  call("run_client_money_reconciliation", { p_cm_account: accountId,
                                            p_recon_date: reconDate,
                                            p_bank_balance: bankBalance,
                                            p_created_by: null });
export const cmReconsList = (accountId, limit) =>
  call("cm_recons_list", { p_account: accountId ?? null, p_limit: limit || 50 });
// Guarded: refused to the preparer, and refused with an unremedied shortfall.
export const cmReconSignOff = (reconId) =>
  call("cm_recon_sign_off", { p_recon_id: reconId });

export const canWrite = () => isConfigured;

// ── Fee transfers from client money (db/076) ────────────────────────────────
// These wrappers also exist in affinity_fiduciary_api, which is where they
// were first written. The Accounting ops module imports from this file, so
// they are here too rather than adding a second import to the module for two
// functions.
//
// The control they carry is the reason this matters: a fee transfer larger
// than the client holds is REFUSED, not recorded as a breach. Unlike a payment
// the client instructed, a fee transfer is entirely the firm's own decision,
// and taking more than is held means paying the firm out of another client's
// money. The bill can wait.

// What may be taken, before taking it: the lower of what the client holds and
// what has been billed.
export const cmFeeAvailable = (cmClientId, invoiceId) =>
  call("cm_fee_available", { p_cm_client: cmClientId, p_invoice: invoiceId });

export const cmFeeTransfer = (t) => call("cm_fee_transfer", {
  p_cm_client: t.cmClientId, p_cm_account: t.accountId,
  p_firm_entity: t.firmEntityId, p_firm_bank: t.firmBankId,
  p_invoice_id: t.invoiceId, p_date: t.date, p_amount: t.amount,
});

// ── Period control and the remaining month-end routines ─────────────────────
// The checklist showed what was outstanding and gave no way to run any of it,
// which is a checklist you can read and not act on. These were all built and
// unreachable.

// A locked period cannot be posted into, so opening one is the first blocking
// item on the checklist.
export const periodOpen = (entityId, period) =>
  call("period_open", { p_entity: entityId, p_period: period });

// Reopening a closed period needs a reason. Anything already reported on that
// period may change, so the reason is part of the record rather than a
// formality.
export const periodReopen = (entityId, period, reason) =>
  call("period_reopen", { p_entity: entityId, p_period: period, p_reason: reason });

export const periodStatus = (entityId, date) =>
  call("period_status", { p_entity: entityId, p_date: date });

// Deferred income released for the period. An unreleased deferral is a
// misstatement, and it fails quietly — the figures simply stay wrong.
export const runDeferredIncome = (entityId, period) =>
  call("run_deferred_income", { p_entity_id: entityId, p_period: period,
                                p_created_by: null });

// Posting a prepared VAT return to the ledger. Preparing and posting are
// separate: a prepared return can be checked before it hits the accounts.
export const postVatReturn = (returnId, postDate) =>
  call("post_vat_return", { p_return_id: returnId, p_post_date: postDate,
                            p_created_by: null });

// ── Closing a period ────────────────────────────────────────────────────────
// The month-end checklist reports what is outstanding, the steps can now be
// run, and the period could not actually be CLOSED. So the whole exercise
// finished with everything ticked and nothing shut.

// Closing prevents further posting into the period. A reason is recorded,
// because closing with items outstanding is a judgement someone made.
export const periodClose = (entityId, period, reason) =>
  call("period_close", { p_entity: entityId, p_period: period, p_reason: reason });

// The final lock is separate from closing, and stronger: a closed period can
// be reopened with a reason, a finally-locked one is meant to stay shut. Two
// steps because they are two different decisions.
export const periodLockFinal = (entityId, period, reason) =>
  call("period_lock_final", { p_entity: entityId, p_period: period, p_reason: reason });
