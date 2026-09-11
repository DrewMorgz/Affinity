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

// ── The rest of the purchase and expense cycle ──────────────────────────────
// poCreate, goodsReceive, payRunCreate, payRunAddPayables, expenseClaimSubmit
// and expenseClaimReimburse were wrapped and had no button, so the screen
// could approve a payment run it could not assemble and approve a claim
// nobody could submit. These five had no wrapper at all.

// Rejecting a claim needs a reason. A claim that comes back with no reason
// gets resubmitted unchanged, which wastes everyone's time twice.
export const expenseClaimReject = (claimId, approver, reason) =>
  call("reject_expense_claim", { p_claim_id: claimId, p_approver: approver,
                                 p_reason: reason });

// Recording a supplier invoice against the entity. Separate from matching it
// to a purchase order, because an invoice can arrive without one.
export const supplierInvoiceRecord = (i) => call("record_supplier_invoice", {
  p_entity_id: i.entityId, p_supplier: i.supplier, p_reference: i.reference,
  p_invoice_date: i.invoiceDate, p_due_date: i.dueDate || null,
  p_net: i.net, p_vat_code: i.vatCode ?? null, p_ccy: i.ccy,
  p_expense_account_id: i.expenseAccountId ?? null, p_created_by: null,
});

// Three-way matching: the order, the goods received, and the invoice. The
// tolerance is explicit because an exact match almost never happens and a
// system that demands one gets overridden into uselessness.
export const invoiceMatchToPo = (siId, poId, matchType, tolerancePct) =>
  call("match_invoice_to_po", { p_si_id: siId, p_po_id: poId,
                                p_match_type: matchType,
                                p_tolerance_pct: tolerancePct, p_by: null });

// Credit notes. A credit note is not a negative invoice — it is its own
// document with its own number, and reversing an invoice by editing it
// destroys the audit trail.
export const arCreditNote = (c) => call("raise_ar_credit_note", {
  p_entity: c.entityId, p_date: c.date, p_ccy: c.ccy, p_lines: c.lines,
  p_related_invoice_id: c.relatedInvoiceId || null, p_party: c.party || null,
  p_reason: c.reason, p_created_by: null,
});
export const apCreditNote = (c) => call("raise_ap_credit_note", {
  p_entity: c.entityId, p_date: c.date, p_ccy: c.ccy, p_lines: c.lines,
  p_supplier: c.supplier, p_reason: c.reason, p_created_by: null,
});

// Disbursements paid on a client's behalf, and recharging them. An
// unrecharged disbursement is money the firm has spent and not recovered, and
// it is invisible until someone looks.
export const disbursementRecord = (d) => call("record_disbursement", {
  p_entity_id: d.entityId, p_supplier: d.supplier, p_amount: d.amount,
  p_ccy: d.ccy, p_date: d.date, p_created_by: null,
});
export const disbursementsRecharge = (entityId, date) =>
  call("recharge_disbursements", { p_entity_id: entityId, p_date: date,
                                   p_created_by: null });
