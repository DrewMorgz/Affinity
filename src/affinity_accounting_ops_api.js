// src/affinity_accounting_ops_api.js
// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTING OPERATIONS — client money, VAT, bank reconciliation, fixed
// assets, accruals and prepayments.
//
// These areas had write functions in the database from the start but no read
// functions and no interface, so nothing could reach them. db/066 added the
// read layer; this exposes both halves to the application.
//
// Same { ok, data, error, live } contract as the other write modules.
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

// ── Client money ────────────────────────────────────────────────────────────
// The regulated one. A pooled account can balance in total while an individual
// client is short — that is the breach, and it is what cmShortfalls finds.
export const cmPosition   = (entityId) => call("cm_position", { p_entity: entityId ?? null });
export const cmMovements  = (cmClientId, from, limit) =>
  call("cm_movements", { p_cm_client: cmClientId ?? null, p_from: from || null,
                         p_limit: limit || 200 });
export const cmShortfalls = (entityId) => call("cm_shortfalls", { p_entity: entityId ?? null });
export const cmBreaches   = (openOnly) => call("cm_breaches", { p_open_only: openOnly !== false });

export const cmReceive = (r) => call("receive_client_money", {
  p_cm_client: r.cmClientId, p_cm_account: r.accountId, p_date: r.date,
  p_amount: r.amount, p_created_by: r.createdBy || null,
});
export const cmPay = (p) => call("pay_client_money", {
  p_cm_client: p.cmClientId, p_cm_account: p.accountId, p_date: p.date,
  p_amount: p.amount, p_desc: p.description || null, p_created_by: p.createdBy || null,
});
// Making good a shortfall from the firm's own money. This is the remedy a
// regulator expects to see, and it must come from the firm's account, not
// from another client's balance.
export const cmRemediate = (r) => call("remediate_client_money_shortfall", {
  p_recon_id: r.reconId, p_firm_entity: r.firmEntityId, p_firm_bank: r.firmBankId,
  p_date: r.date, p_created_by: r.createdBy || null,
});

// ── VAT returns ─────────────────────────────────────────────────────────────
export const vatReturnsList = (entityId, status) =>
  call("vat_returns_list", { p_entity: entityId ?? null, p_status: status || null });
// Prepares from the ledger for the period — it does not post anything.
export const vatPrepare = (entityId, start, end) =>
  call("prepare_vat_return", { p_entity_id: entityId, p_start: start, p_end: end });
// Posting is separate, and is what commits the liability to the ledger.
export const vatPost = (returnId, postDate, createdBy) =>
  call("post_vat_return", { p_return_id: returnId, p_post_date: postDate,
                            p_created_by: createdBy || null });

// ── Bank reconciliation ─────────────────────────────────────────────────────
export const bankStatementsList = (entityId) =>
  call("bank_statements_list", { p_entity: entityId ?? null });
export const bankUnmatched = (statementId) =>
  call("bank_unmatched", { p_statement: statementId });
// Auto-match proposes; it does not decide. Review the result before relying
// on the reconciliation.
export const bankAutoMatch = (statementId) =>
  call("auto_match_statement", { p_statement_id: statementId });
export const bankAutoMatchByRules = (statementId, createdBy) =>
  call("auto_match_by_rules", { p_statement_id: statementId, p_created_by: createdBy || null });
export const bankReconcile = (statementId) =>
  call("bank_reconciliation", { p_statement_id: statementId });
export const bankAddReconItem = (reconId, itemDate, description, amount) =>
  call("add_recon_item", { p_recon_id: reconId, p_item_date: itemDate,
                           p_description: description, p_amount: amount });

// ── Fixed assets ────────────────────────────────────────────────────────────
export const fixedAssetsList = (entityId, includeDisposed) =>
  call("fixed_assets_list", { p_entity: entityId ?? null,
                              p_include_disposed: !!includeDisposed });
export const assetCapitalise = (a) => call("capitalise_asset", {
  p_entity_id: a.entityId, p_description: a.description, p_category: a.category,
  p_cost: a.cost, p_acquisition_date: a.acquisitionDate,
  p_in_service_date: a.inServiceDate || a.acquisitionDate,
  p_useful_life_months: a.usefulLifeMonths, p_created_by: a.createdBy || null,
});
export const assetDepreciation = (entityId, period) =>
  call("run_depreciation", { p_entity_id: entityId, p_period: period });
export const assetDispose = (assetId, disposalDate, proceeds, createdBy) =>
  call("dispose_asset", { p_asset_id: assetId, p_disposal_date: disposalDate,
                          p_proceeds: proceeds, p_created_by: createdBy || null });

// ── Accruals, prepayments, deferred income ──────────────────────────────────
export const deferralsList = (entityId, kind) =>
  call("deferrals_list", { p_entity: entityId ?? null, p_kind: kind || null });
export const createAccrual = (a) => call("create_accrual", {
  p_entity: a.entityId, p_date: a.date, p_per_period: a.perPeriod,
  p_expense_account: a.expenseAccountId, p_periods: a.periods,
  p_created_by: a.createdBy || null,
});
export const createPrepayment = (p) => call("create_prepayment", {
  p_entity: p.entityId, p_date: p.date, p_total: p.total,
  p_expense_account: p.expenseAccountId, p_periods: p.periods,
  p_created_by: p.createdBy || null,
});
export const runDeferredIncome = (entityId, period) =>
  call("run_deferred_income", { p_entity_id: entityId, p_period: period });

// ── The overview ────────────────────────────────────────────────────────────
// What needs attention across every area, so the module opens on the work
// rather than on a menu.
export const accOpsOverview = (entityId) =>
  call("acc_ops_overview", { p_entity: entityId ?? null });

// Reference data the forms need.
export const cmClients = () => call("cm_position", { p_entity: null });

export const ASSET_CATEGORIES =
  ["Office equipment", "Computer equipment", "Furniture and fittings",
   "Leasehold improvements", "Motor vehicles", "Software"];
export const DEFERRAL_KINDS = ["accrual", "prepayment", "deferred_income"];
export const canWrite = () => isConfigured;

// ── Fixed asset events after capitalisation ─────────────────────────────────
// An asset could be capitalised and depreciation run, and nothing else. It
// could not be disposed of, revalued or impaired — so an asset sold years ago
// stayed on the register at its written-down value, and the balance sheet
// carried something the firm no longer owned.

// assetDispose already exists above — it was wrapped and had no button, which
// is the same fault as everything else here rather than a missing wrapper.

// Impairment is a write-down that is not depreciation: it reflects a fall in
// value rather than the passage of time, and conflating them misstates both.
export const assetImpair = (assetId, date, impairment) =>
  call("impair_asset", { p_asset: assetId, p_date: date,
                         p_impairment: impairment, p_created_by: null });

// Depreciation for a specific asset over a number of months, as distinct from
// the period run that does every asset at once.
export const assetDepreciate = (assetId, date, months) =>
  call("post_depreciation", { p_asset: assetId, p_date: date, p_months: months,
                              p_created_by: null });

// ── Bank and client money reconciliation ────────────────────────────────────
// The bank tab listed statements and showed matched against unmatched, and
// nothing could be matched or added. run_client_money_reconciliation — the
// three-way check that is a regulatory requirement rather than housekeeping —
// had no button either, so the reconciliation the month-end checklist demands
// could not be produced from the screen that demands it.

// bankAutoMatch, bankAutoMatchByRules and bankAddReconItem already exist above.
// They were wrapped and had no button, which is a missing screen rather than a
// missing wrapper — worth distinguishing, because I nearly added a second copy
// of each.

// The three-way client money reconciliation: bank against book against the sum
// of the client ledgers. Signing it off is refused to whoever prepared it.
export const clientMoneyReconcile = (cmAccountId, reconDate, bankBalance) =>
  call("run_client_money_reconciliation", { p_cm_account: cmAccountId,
                                            p_recon_date: reconDate,
                                            p_bank_balance: bankBalance,
                                            p_created_by: null });

// ── Remediating a client money shortfall ────────────────────────────────────
// A shortfall means the firm is holding less client money than it owes. The
// reconciliation reports it, month-end and year-end both block on it, and
// there was no way to put it right — so the one thing the system insisted on
// could not be done in the system.
//
// Remediation is the firm paying its own money in. That is why it takes the
// firm's entity and bank account rather than moving anything between clients:
// a shortfall is never fixed from another client's balance.
export const clientMoneyRemediate = (reconId, firmEntityId, firmBankId, date) =>
  call("remediate_client_money_shortfall", { p_recon_id: reconId,
                                             p_firm_entity: firmEntityId,
                                             p_firm_bank: firmBankId,
                                             p_date: date, p_created_by: null });

// ── Moving an asset between group entities ──────────────────────────────────
// A transfer is not a disposal: the group still owns the asset, so it leaves
// one entity's register at a transfer value and joins another's. Recording it
// as a disposal and a fresh purchase would lose the link and misstate the
// group position on consolidation.
export const assetTransfer = (assetId, toEntityId, date, transferValue) =>
  call("transfer_asset", { p_asset: assetId, p_to_entity: toEntityId,
                           p_date: date, p_transfer_value: transferValue,
                           p_created_by: null });

// ── VAT, reverse charge and deferred income ─────────────────────────────────
// A VAT return could be PREPARED and not posted. Preparing and posting are
// deliberately separate so a return can be checked before it hits the
// accounts, and with no way to post one the separation just meant it never
// reached them.
export const vatReturnPost = (returnId, postDate) =>
  call("post_vat_return", { p_return_id: returnId, p_post_date: postDate,
                            p_created_by: null });

// The reverse charge: VAT accounted for by the buyer rather than the supplier,
// on cross-border services. Both sides are posted, so the net VAT effect is
// nil — but omitting it understates both the input and the output VAT, and a
// return that nets to the right figure from two wrong ones is still wrong.
export const reverseChargeRecord = (r) => call("record_reverse_charge", {
  p_entity: r.entityId, p_date: r.date, p_net: r.net, p_vat_rate: r.vatRate,
  p_expense_account: r.expenseAccountId, p_supplier: r.supplier,
  p_created_by: null,
});

// Withholding tax deducted at source. The gross cost and the tax withheld are
// separate figures, and recording only the net loses the tax the firm may be
// able to reclaim or credit.
export const withholdingTaxApply = (w) => call("apply_withholding_tax", {
  p_entity: w.entityId, p_date: w.date, p_base_net: w.baseNet,
  p_wht_rate: w.rate, p_supplier: w.supplier, p_created_by: null,
});

// Deferred income released for a period. An unreleased deferral is a
// misstatement that fails quietly — the figures simply stay wrong.
export const deferredIncomeRun = (entityId, period) =>
  call("run_deferred_income", { p_entity_id: entityId, p_period: period,
                                p_created_by: null });
