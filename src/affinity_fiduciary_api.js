// src/affinity_fiduciary_api.js
// ─────────────────────────────────────────────────────────────────────────────
// TRUST ACCOUNTING AND STATUTORY ACCOUNTS
//
// Two areas whose database layer is complete and which had no interface —
// exactly the state the wiring audit exists to catch.
//
// Two things about these APIs are worth knowing before using them:
//
//   TRUST: the income fund and the capital fund are separate and are never
//   summed. A distribution from the wrong fund changes the beneficiary's
//   entitlement and the tax treatment, so trustFundCheck answers "is there
//   enough in THAT fund" rather than "is there enough".
//
//   STATUTORY ACCOUNTS: a set cannot be finalised unless a qualified person
//   has authored and verified the disclosure checklist for its framework.
//   That is deliberate. Seven of eleven frameworks have a presentation format;
//   none yet has a verified checklist. frameworkFormatStatus reports both.
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

// ── Trust accounting ────────────────────────────────────────────────────────
export const trustPosition      = (trustId) => call("trust_position", { p_trust: trustId ?? null });
export const trustBeneficiaries = (trustId) => call("trust_beneficiaries", { p_trust: trustId ?? null });
export const trustDistributions = (trustId, from, limit) =>
  call("trust_distributions", { p_trust: trustId ?? null, p_from: from || null,
                                p_limit: limit || 200 });
export const trustOverview      = (trustId) => call("trust_overview", { p_trust: trustId ?? null });
// Per fund, deliberately. Ask this before distributing, not after.
export const trustFundCheck     = (trustId) => call("trust_fund_check", { p_trust: trustId });

export const trustRecordIncome = (t) => call("record_trust_income", {
  p_trust: t.trustId, p_date: t.date, p_bank: t.bankAccountId,
  p_income_acct: t.incomeAccountId, p_amount: t.amount,
  p_desc: t.description || null, p_created_by: t.createdBy || null,
});
export const trustRecordCapital = (t) => call("record_trust_capital_receipt", {
  p_trust: t.trustId, p_date: t.date, p_bank: t.bankAccountId,
  p_capital_acct: t.capitalAccountId, p_amount: t.amount,
  p_desc: t.description || null, p_created_by: t.createdBy || null,
});
// p_apportion splits the expense between the funds on the trust's recorded
// percentages. Charging a shared expense wholly to one fund shifts value
// between beneficiaries, so the choice is explicit rather than defaulted.
export const trustRecordExpense = (t) => call("record_trust_expense", {
  p_trust: t.trustId, p_date: t.date, p_expense_acct: t.expenseAccountId,
  p_bank: t.bankAccountId, p_amount: t.amount,
  p_apportion: t.apportion === true, p_fund: t.fund || null,
  p_desc: t.description || null, p_created_by: t.createdBy || null,
});
export const trustDistribute = (t) => call("distribute_to_beneficiary", {
  p_trust: t.trustId, p_beneficiary: t.beneficiaryId, p_date: t.date,
  p_fund: t.fund, p_amount: t.amount, p_dist_acct: t.distributionAccountId,
  p_bank: t.bankAccountId, p_created_by: t.createdBy || null,
});

export const TRUST_FUNDS = ["income", "capital"];

// ── Statutory accounts ──────────────────────────────────────────────────────
export const frameworksForEntity   = (entityId) => call("frameworks_for_entity", { p_entity: entityId });
export const frameworkFormatStatus = () => call("framework_format_status", {});
export const accountsSetsList      = (entityId) => call("accounts_sets_list", { p_entity: entityId ?? null });
export const accountsStatement     = (setId, statement) =>
  call("accounts_statement", { p_set: setId, p_statement: statement });
export const accountsDisclosures   = (setId) => call("accounts_disclosures", { p_set: setId });
// Everything in one call: disclosure, presentation and documents.
export const accountsReadiness     = (setId) => call("accounts_set_readiness_full", { p_set: setId });
export const accountMappingGaps    = (fsFramework, entityId) =>
  call("account_mapping_gaps", { p_fs_framework: fsFramework, p_entity: entityId ?? null });

// db/074 consolidated two parallel accounts-production models onto
// fs_accounts_set. These call the surviving functions; accounts_set_create,
// accounts_set_finalise and accounts_set_approve were retired with the
// duplicate table.
//
// THE WORKFLOW ORDER IS draft -> approved -> finalised. The directors approve
// the accounts and finalisation locks them afterwards. Every readiness gate is
// checked at APPROVAL, because a director should not be asked to sign a set
// with outstanding disclosures.
export const accountsSetOpen = (s) => call("accounts_set_open", {
  p_entity: s.entityId, p_framework: s.framework,
  p_period_start: s.periodStart, p_period_end: s.periodEnd,
  p_prior_start: s.priorStart || null, p_prior_end: s.priorEnd || null,
});
export const accountsGenerateAll = (setId) => call("accounts_set_generate_all", { p_set: setId });
// Refused on any failed gate, and the message lists them all rather than the
// first, so the remaining work can be planned. Refused to the person who
// prepared the set, and requires naming the director, because they are signing
// that the accounts give a true and fair view.
export const accountsApprove  = (setId, director) =>
  call("accounts_approve", { p_set: setId, p_director: director });
// Locks an approved set. Refused unless the set is approved and the trial
// balance balances.
export const accountsFinalise = (setId) => call("accounts_finalise", { p_set: setId });
export const accountsNoteAdd = (n) => call("accounts_note_add", {
  p_set: n.setId, p_title: n.title, p_body: n.body || null,
  p_kind: n.kind || "note", p_note_number: n.noteNumber || null,
  p_sort_order: n.sortOrder || 0,
});
export const accountsDisclosureAddress = (disclosureId, noteId, notApplicableReason) =>
  call("accounts_disclosure_address", { p_disclosure: disclosureId,
                                        p_note_id: noteId ?? null,
                                        p_not_applicable_reason: notApplicableReason || null });

// ── Authoring the checklists ────────────────────────────────────────────────
// For a qualified person. Verification requires naming the edition, and
// amending a verified checklist invalidates the verification, because the
// person who signed it off signed off a different list.
export const disclosureRequirementAdd = (r) => call("disclosure_requirement_add", {
  p_framework: r.framework, p_ref: r.ref, p_title: r.title,
  p_detail: r.detail || null, p_applies_when: r.appliesWhen || null,
  p_mandatory: r.mandatory !== false, p_statement: r.statement || null,
  p_sort_order: r.sortOrder || 0,
});
export const frameworkChecklistVerify = (framework, edition) =>
  call("framework_checklist_verify", { p_framework: framework, p_edition: edition });
export const requiredDocumentAdd = (d) => call("accounts_required_document_add", {
  p_framework: d.framework, p_doc_kind: d.docKind, p_title: d.title,
  p_guidance: d.guidance || null, p_mandatory: d.mandatory !== false,
  p_sort_order: d.sortOrder || 0,
});

export const STATEMENTS = [
  { id: "income_statement", label: "Income statement" },
  { id: "balance_sheet",    label: "Balance sheet" },
  { id: "equity",           label: "Changes in equity" },
  { id: "cash_flow",        label: "Cash flow" },
];
export const NOTE_KINDS = [
  { id: "policy",           label: "Accounting policy" },
  { id: "note",             label: "Note to the accounts" },
  { id: "directors_report", label: "Directors report" },
  { id: "other",            label: "Other document" },
];

export const canWrite = () => isConfigured;


// ── Intercompany and transfer pricing writes (db/076) ───────────────────────
// Guarded wrappers. Each adds a check the engine's function lacks, and the
// reason is in the refusal message rather than only in the code.
export const icLoanDraw = (loanId, date, amount) =>
  call("ic_loan_draw", { p_loan: loanId, p_date: date, p_amount: amount });
export const icLoanRepay = (loanId, date, amount) =>
  call("ic_loan_repay", { p_loan: loanId, p_date: date, p_amount: amount });
// Refused on a nil-rate loan: a group loan at 0% is a transfer pricing
// exposure, and accruing nothing on it silently keeps it invisible.
export const icLoanAccrue = (loanId, date, days) =>
  call("ic_loan_accrue", { p_loan: loanId, p_date: date, p_days: days });
export const icSettle = (creditorId, debtorId, date, ccy, amount) =>
  call("ic_settle", { p_creditor: creditorId, p_debtor: debtorId, p_date: date,
                      p_ccy: ccy, p_amount: amount });
// Refused where no policy records the markup — a charge with no documented
// basis is the first thing asked for on a transfer pricing enquiry.
export const tpChargePost = (fromId, toId, date, ccy, costBase, serviceType) =>
  call("tp_charge_post", { p_from: fromId, p_to: toId, p_date: date, p_ccy: ccy,
                           p_cost_base: costBase, p_service_type: serviceType });

// ── Fee transfers from client money (db/076) ────────────────────────────────
// What may be taken, before taking it: the lower of what the client holds and
// what has been billed.
export const cmFeeAvailable = (cmClientId, invoiceId) =>
  call("cm_fee_available", { p_cm_client: cmClientId, p_invoice: invoiceId });
// REFUSED, not merely recorded, where the client does not hold the money.
// Unlike a payment the client instructed, a fee transfer is the firm helping
// itself — taking more than is held means paying the firm out of another
// client's money, and the bill can wait.
export const cmFeeTransfer = (t) => call("cm_fee_transfer", {
  p_cm_client: t.cmClientId, p_cm_account: t.accountId,
  p_firm_entity: t.firmEntityId, p_firm_bank: t.firmBankId,
  p_invoice_id: t.invoiceId, p_date: t.date, p_amount: t.amount,
});

// ── Accounts workflow, adjustments and year end (db/077) ────────────────────

// The step between preparing and approving. Readiness is REPORTED here rather
// than enforced — a reviewer's job is partly to see what is outstanding.
export const accountsSubmitForReview = (setId) =>
  call("accounts_submit_for_review", { p_set: setId });

// An audit adjustment. post_statutory_adjustment blocked a finalised set but
// NOT an approved one, so a director could sign one set of figures and have
// different ones filed.
//
// This does not refuse the adjustment — audit adjustments genuinely arise
// after approval. It posts it, regenerates the statements, and WITHDRAWS THE
// APPROVAL, so the director must see the adjusted accounts and approve those.
// The returned note says so, and it is worth showing to the user verbatim.
export const accountsAdjust = (setId, date, narrative, lines) =>
  call("accounts_adjust", { p_set: setId, p_date: date, p_narrative: narrative,
                            p_lines: lines });

// ── Year end ────────────────────────────────────────────────────────────────
export const yearEndReadiness = (entityId, fyStart, fyEnd) =>
  call("year_end_readiness", { p_entity: entityId, p_fy_start: fyStart, p_fy_end: fyEnd });
// Two gates are hard and the override cannot bypass them: draft journals in
// the year, and client money shortfalls. The rest are advisory, because a year
// can legitimately be closed before the accounts are signed.
export const yearEndClose = (entityId, fyStart, fyEnd, override) =>
  call("year_end_close", { p_entity: entityId, p_fy_start: fyStart, p_fy_end: fyEnd,
                           p_override: override === true });

// ── Journal approval thresholds ─────────────────────────────────────────────
// An entity with no threshold recorded has no journal requiring approval at
// all, which is why noneSet is surfaced rather than shown as a blank.
export const approvalThresholdsList = () => call("approval_thresholds_list", {});
// Refuses a negative or null threshold. Raising one is audited as a loosening
// of control, because that is what it is.
export const approvalThresholdSet = (entityId, threshold) =>
  call("approval_threshold_set", { p_entity: entityId, p_threshold: threshold });
