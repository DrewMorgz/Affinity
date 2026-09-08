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
