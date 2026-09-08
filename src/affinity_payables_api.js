// src/affinity_payables_api.js
// ─────────────────────────────────────────────────────────────────────────────
// PURCHASES AND RECEIVABLES — purchase orders, payment runs, expense claims,
// credit control.
//
// The approve functions here are WRAPPERS around the engine's, added in
// db/067 because the engine's own versions did not enforce segregation of
// duties: the same person could create a payment run and approve it, or
// approve their own expense claim. Always use these, never the engine's
// approve_payment_run or approve_expense_claim directly.
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

// ── Reads ───────────────────────────────────────────────────────────────────
export const payablesOverview  = (entityId) => call("payables_overview", { p_entity: entityId ?? null });
export const payRunsList       = (entityId) => call("pay_runs_list", { p_entity: entityId ?? null });
export const expenseClaimsList = (status)   => call("expense_claims_list", { p_status: status || null });
export const poList            = (entityId, status) =>
  call("po_list", { p_entity: entityId ?? null, p_status: status || null });
export const collectionsList   = (entityId) => call("collections_list", { p_entity: entityId ?? null });

// ── Approvals: use these, not the engine's ──────────────────────────────────
// Refused if the person acting created the item. The refusal message names the
// reason and should be shown to the user as it comes back.
export const payRunApprove = (runId) => call("pay_run_approve", { p_run_id: runId });
// A third act after approval, so an approved run can still be stopped before
// money moves.
export const payRunExecute = (runId) => call("pay_run_execute", { p_run_id: runId });
export const expenseClaimApprove = (claimId) =>
  call("expense_claim_approve", { p_claim_id: claimId });

// ── Writes ──────────────────────────────────────────────────────────────────
export const poCreate = (p) => call("create_purchase_order", {
  p_entity: p.entityId, p_supplier_id: p.supplierId, p_po_date: p.poDate,
  p_ccy: p.ccy || "GBP",
  // lines: [{ description, account_id, quantity, unit_price, vat_code }]
  p_lines: p.lines || [], p_created_by: p.createdBy || null,
});
export const goodsReceive = (poId, receiptDate, lines, receivedBy) =>
  call("receive_goods", { p_po_id: poId, p_receipt_date: receiptDate,
                          p_lines: lines, p_received_by: receivedBy || null });
export const payRunCreate = (p) => call("create_payment_run", {
  p_entity: p.entityId, p_run_date: p.runDate, p_ccy: p.ccy || "GBP",
  p_bank_account_id: p.bankAccountId, p_created_by: p.createdBy || null,
});
export const payRunAddPayables = (runId) =>
  call("add_open_payables_to_run", { p_run_id: runId });
export const expenseClaimSubmit = (c) => call("submit_expense_claim", {
  p_employee_id: c.employeeId, p_entity_id: c.entityId, p_claim_date: c.claimDate,
  p_ccy: c.ccy || "GBP",
  // lines: [{ expense_date, description, expense_account_id, net, vat_code }]
  p_lines: c.lines || [], p_created_by: c.createdBy || null,
});
export const expenseClaimReimburse = (claimId, payDate, bankAccountId, createdBy) =>
  call("reimburse_expense_claim", { p_claim_id: claimId, p_date: payDate,
                                    p_created_by: createdBy || null,
                                    p_bank_account_id: bankAccountId ?? null });
export const collectionActionLog = (a) => call("log_collection_action", {
  p_customer: a.customerId, p_invoice: a.invoiceId ?? null,
  p_date: a.actionDate, p_level: a.level, p_note: a.note || null,
  p_user: a.createdBy || null,
});

export const canWrite = () => isConfigured;

// ── Intercompany (db/073 read layer, db/076 writes) ────────────────────────
// The group total is the check that matters: intercompany balances must
// eliminate to nil. This cannot reconcile pair by pair because postings record
// no counterparty, which is a schema gap rather than a display choice.
export const icBalances = (asAt) => call("ic_balances", { p_as_at: asAt ?? null });
export const icLoansList = (entityId) => call("ic_loans_list", { p_entity: entityId ?? null });
export const tpPoliciesList = (entityId) => call("tp_policies_list", { p_entity: entityId ?? null });
export const icSettlementsList = (entityId, limit) =>
  call("ic_settlements_list", { p_entity: entityId ?? null, p_limit: limit || 100 });
export const tpUndocumentedCharges = (entityId) =>
  call("tp_undocumented_charges", { p_entity: entityId ?? null });
