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
