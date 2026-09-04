// src/affinity_docs_onb_write_api.js
// ─────────────────────────────────────────────────────────────────────────────
// WRITE LAYER — DOCUMENTS, ONBOARDING AND BOOKKEEPING
//
// Wrappers for db/060 and db/061. Same { ok, data, error, live } contract as
// the other write modules.
//
// Two things worth knowing when calling these:
//
//   Document deletion is refused inside the retention period unless override
//   is passed. Do NOT set override by default — the whole point is that it is
//   a deliberate act, and it is recorded as RETENTION OVERRIDDEN in the audit
//   trail when used.
//
//   Journals take account CODES here; the database resolves them to ids.
//   Debits positive, credits negative, summing to zero.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, isConfigured } from "./affinity_accounting_supabase";

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in — changes cannot be saved yet." };
  }
  try {
    const { data, error } = await supabase.rpc(fn, args || {});
    if (error) return { ok: false, live: true, data: null, error: clean(error.message) };
    return { ok: true, live: true, data, error: null };
  } catch (e) {
    return { ok: false, live: false, data: null, error: String((e && e.message) || e) };
  }
}
const clean = (m) => !m ? "That could not be saved."
  : String(m).replace(/^ERROR:\s*/i, "").replace(/\s*CONTEXT:[\s\S]*$/i, "").trim();

// ── Documents ───────────────────────────────────────────────────────────────
export const docFile = (entityId, d) => call("doc_file", {
  p_entity: entityId, p_category: d.category, p_filename: d.filename,
  p_object_type: d.objectType || "entity", p_object_id: d.objectId ?? null,
  p_ref: d.ref || null,
});
export const docReclassify = (id, category, reason) =>
  call("doc_reclassify", { p_id: id, p_category: category, p_reason: reason || null });

// override defaults to false deliberately — see the note at the top
export const docDelete = (id, reason, overrideRetention = false) =>
  call("doc_delete", { p_id: id, p_reason: reason,
                       p_override_retention: !!overrideRetention });
export const docList = (entityId, category) =>
  call("doc_list", { p_entity: entityId, p_category: category ?? null });

// ── Onboarding ──────────────────────────────────────────────────────────────
export const ONBOARDING_STAGES =
  ["Enquiry", "CDD collection", "Risk rating", "Sign-off", "Live", "Declined"];

export const onbCaseAdd = (c) => call("onb_case_add", {
  p_client_name: c.clientName, p_entity_name: c.entityName || null,
  p_office: c.office || null, p_jurisdiction: c.jurisdiction || null,
  p_entity_type: c.entityType || null, p_sector: c.sector || null,
  p_source: c.source || null, p_introducer: c.introducer || null,
  p_assigned_to: c.assignedTo || null, p_target_date: c.targetDate || null,
  p_fee_quoted: c.feeQuoted ?? null, p_fee_ccy: c.feeCcy || "GBP",
});
export const onbCaseAdvance = (id, stage, riskRating, note) =>
  call("onb_case_advance", { p_id: id, p_stage: stage,
                             p_risk_rating: riskRating || null, p_note: note || null });
export const onbCaseList = (stage) => call("onb_case_list", { p_stage: stage || null });

export const cddItemAdd = (caseId, subject, itemType, notes) =>
  call("cdd_item_add", { p_case: caseId, p_subject: subject,
                         p_item_type: itemType, p_notes: notes || null });
export const cddItemVerify = (id, method, notes) =>
  call("cdd_item_verify", { p_id: id, p_method: method, p_notes: notes || null });
export const cddItemList = (caseId) => call("cdd_item_list", { p_case: caseId });

export const CDD_ITEM_TYPES =
  ["Identity", "Address", "Source of funds", "Source of wealth", "Structure chart",
   "Sanctions screening", "PEP screening", "Bank reference", "Professional reference"];
export const CDD_METHODS =
  ["Certified copy", "Original seen", "Electronic verification", "Notarised copy",
   "Apostilled document"];

// ── Bookkeeping and journals ────────────────────────────────────────────────
export const JOURNAL_TYPES =
  ["manual", "recurring", "reversing", "accrual", "system", "stat_adjustment"];

// lines: [{ accountCode, amount, ccy, memo }] — debits positive, credits negative
export const journalPost = (entityId, j) => call("bk_journal_post", {
  p_entity: entityId, p_journal_date: j.date, p_narrative: j.narrative,
  p_lines: (j.lines || []).map((l) => ({
    account_code: l.accountCode,
    txn_ccy: l.ccy || "GBP",
    txn_amount: Number(l.amount),
    memo: l.memo || null,
  })),
  p_journal_type: j.type || "manual", p_source: j.source || "Bookkeeping",
});
export const journalApprove = (id) => call("bk_journal_approve", { p_journal: id });
export const journalReject  = (id, reason) => call("bk_journal_reject", { p_journal: id, p_reason: reason });
export const journalReverse = (id, reason, date) =>
  call("bk_journal_reverse", { p_journal: id, p_reason: reason, p_date: date || null });
export const journalList = (entityId, status, limit) =>
  call("bk_journal_list", { p_entity: entityId ?? null, p_status: status || null,
                            p_limit: limit || 200 });

export const txnAdd = (entityId, t) => call("bk_txn_add", {
  p_entity: entityId, p_txn_date: t.date, p_descr: t.description,
  p_txn_type: t.type || null, p_dr: t.debit ?? null, p_cr: t.credit ?? null,
  p_ref: t.ref || null, p_account: t.account || null,
});
export const txnSetStatus = (id, status) =>
  call("bk_txn_set_status", { p_id: id, p_status: status });

// ── Periods ─────────────────────────────────────────────────────────────────
export const periodOpen   = (entityId, period) => call("period_open", { p_entity: entityId, p_period: period });
export const periodClose  = (entityId, period, reason) =>
  call("period_close", { p_entity: entityId, p_period: period, p_reason: reason || null });
export const periodReopen = (entityId, period, reason) =>
  call("period_reopen", { p_entity: entityId, p_period: period, p_reason: reason });
// Locking is stronger than closing and cannot be undone here — use it once a
// year is signed off, not for a routine month end.
export const periodLockFinal = (entityId, period, reason) =>
  call("period_lock_final", { p_entity: entityId, p_period: period, p_reason: reason });
export const periodStatus = (entityId, date) =>
  call("period_status", { p_entity: entityId, p_date: date });

// Balance a set of journal lines client-side so the user sees the imbalance
// before submitting, rather than being told after.
export function journalImbalance(lines) {
  const total = (lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  return Math.round(total * 100) / 100;
}

export const canWrite = () => isConfigured;

// ── Batch 5: invoicing, statutory filings, users, gaming, folders, events ───
// Wrappers for db/062_write_remaining_gaps.sql.

export const invDraftCreate = (entityId, invoiceDate, ccy, bankAccountId) =>
  call("inv_draft_create", { p_entity: entityId, p_invoice_date: invoiceDate,
                             p_ccy: ccy || "GBP", p_bank_account_id: bankAccountId ?? null });
export const invLineAdd = (invoiceId, description, net, vat, serviceId) =>
  call("inv_line_add", { p_invoice: invoiceId, p_description: description,
                         p_net: net, p_vat: vat ?? 0, p_service_id: serviceId ?? null });
export const invLineRemove = (lineId) => call("inv_line_remove", { p_line: lineId });
// Issuing posts the invoice. There is no separate "issued" state — the engine
// allows only draft or posted, so posting IS issuing, and it cannot be amended
// afterwards. Correct an issued invoice with a credit note.
export const invIssue = (invoiceId) => call("inv_issue", { p_invoice: invoiceId });
export const invCreditNote = (invoiceId, reason) =>
  call("inv_credit_note", { p_invoice: invoiceId, p_reason: reason });
export const invList = (entityId, status) =>
  call("inv_list", { p_entity: entityId ?? null, p_status: status || null });

export const statFilingAdd = (entityId, f) => call("stat_filing_add", {
  p_entity: entityId, p_filing_type: f.filingType, p_due_date: f.dueDate,
  p_period: f.period || null, p_notes: f.notes || null,
});
export const statFilingPrepare = (id, reference) =>
  call("stat_filing_prepare", { p_id: id, p_reference: reference || null });
// Refused unless the filing has been prepared — a separate act by a separate
// person, the same control as journal approval.
export const statFilingSubmit = (id, reference) =>
  call("stat_filing_submit", { p_id: id, p_reference: reference || null });
export const statFilingChase = (id, note) =>
  call("stat_filing_chase", { p_id: id, p_note: note || null });
export const statFilingList = (entityId, status) =>
  call("stat_filing_list", { p_entity: entityId ?? null, p_status: status || null });

export const gamingRecordUpdate = (entityId, g) => call("gaming_record_update", {
  p_entity: entityId, p_regulator: g.regulator || null, p_licence_no: g.licenceNo || null,
  p_licence_status: g.licenceStatus || null, p_licence_from: g.licenceFrom || null,
  p_licence_to: g.licenceTo || null, p_categories: g.categories || null,
  p_notes: g.notes || null,
});

// Suspending removes access within Core only. It does NOT disable the person's
// Microsoft account, so it is not the leaver process on its own.
export const sysUserSuspend = (id, reason) =>
  call("sys_user_suspend", { p_id: id, p_reason: reason });
export const sysUserReinstate = (id, reason) =>
  call("sys_user_reinstate", { p_id: id, p_reason: reason });
export const sysUserSetRole = (id, role) =>
  call("sys_user_set_role", { p_id: id, p_role: role });

// Creating a folder takes its retention policy at the same time — a folder
// with no policy leaves its documents with no expiry.
export const dmsCategoryAdd = (name, retainYears, basis) =>
  call("dms_category_add", { p_name: name, p_retain_years: retainYears ?? null,
                             p_basis: basis || null });

export const intranetEventAdd = (e) => call("intranet_event_add", {
  p_title: e.title, p_event_date: e.eventDate, p_office: e.office || null,
  p_category: e.category || null, p_detail: e.detail || null,
});
export const intranetEventList = (from) =>
  call("intranet_event_list", { p_from: from || null });

export const eaProfileUpdate = (entityId, p) => call("ea_profile_update", {
  p_entity: entityId, p_reg_no: p.regNo || null, p_year_end: p.yearEnd || null,
  p_business_activity: p.businessActivity || null, p_admin_status: p.adminStatus || null,
  p_risk_rating: p.riskRating || null, p_next_review_date: p.nextReviewDate || null,
  p_tax_status: p.taxStatus || null,
});
export const eaClassificationUpdate = (entityId, c) => call("ea_classification_update", {
  p_entity: entityId, p_fatca_class: c.fatcaClass || null,
  p_crs_class: c.crsClass || null, p_giin: c.giin || null,
});

export const planningScenarioCreate = (sourceBudgetId, name, scenario) =>
  call("planning_scenario_create", { p_source_budget: sourceBudgetId, p_name: name,
                                     p_scenario: scenario || "scenario" });

// ── Batch 6: billing WIP, escalation, imports ──────────────────────────────
// Wrappers for db/063_write_billing_escalation.sql.

// Turns approved billable time into a draft invoice, one line per matter, and
// marks the time billed. Atomic in the database: half-billed WIP would mean
// either work never invoiced or a client billed twice.
export const billWipToInvoice = (entityId, entityLabel, invoiceDate, ccy) =>
  call("bill_wip_to_invoice", { p_entity: entityId, p_entity_label: entityLabel || null,
                                p_invoice_date: invoiceDate || null, p_ccy: ccy || "GBP" });
export const wipAvailable = (entityLabel) =>
  call("wip_available", { p_entity_label: entityLabel || null });

// There is no escalation policy recorded, so this gives the mechanism rather
// than guessing the routing: a high-priority task, due in two days, carrying
// where it came from and why.
export const escalate = (e) => call("escalate", {
  p_what: e.what, p_source_module: e.module || null,
  p_entity_label: e.entityLabel || null, p_entity_id: e.entityId ?? null,
  p_assignee: e.assignee || null, p_reason: e.reason,
});

export const statFilingAdvance = (id, reference) =>
  call("stat_filing_advance", { p_id: id, p_reference: reference || null });

export const tbImportRecord = (entityId, period, rows, checksum, note) =>
  call("tb_import_record", { p_entity: entityId, p_period: period, p_rows: rows,
                             p_checksum: checksum || null, p_note: note || null });
// Rolling back restores whichever import it superseded, so the period is never
// left with nothing.
export const tbImportRollback = (id, reason) =>
  call("tb_import_rollback", { p_id: id, p_reason: reason });
export const tbImportList = (entityId) =>
  call("tb_import_list", { p_entity: entityId ?? null });

// ── Entity responsibilities (db/064) ───────────────────────────────────────
// Administrator, manager, lead director, accountant and office had no columns
// until 064 — they existed only in the demonstration dataset, so live records
// showed them blank.
export const eaResponsibilitiesSet = (entityId, r) => call("ea_responsibilities_set", {
  p_entity: entityId, p_administrator: r.administrator || null,
  p_manager: r.manager || null, p_lead_director: r.leadDirector || null,
  p_accountant: r.accountant || null, p_office: r.office || null,
  p_mlro: r.mlro || null,
});
// Moves a whole caseload at once, for a joiner, leaver or handover. Doing this
// one entity at a time is how entities get missed.
export const eaReassignCaseload = (from, to, role) =>
  call("ea_reassign_caseload", { p_from: from, p_to: to, p_role: role || "administrator" });
export const eaCaseload = (role) => call("ea_caseload", { p_role: role || "administrator" });
