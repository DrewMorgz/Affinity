// src/affinity_reports_api.js
// ─────────────────────────────────────────────────────────────────────────────
// REPORTS
//
// Ten reporting functions that existed in the engine with no interface. All
// read-only — nothing here writes, and nothing is recalculated in the front
// end.
//
// Two of these carry a caveat worth stating in the interface rather than
// burying:
//
//   report_ar_overdue_interest takes an ANNUAL RATE as a parameter and
//   computes what could be charged. It is a calculation, not a decision:
//   whether interest is actually chargeable depends on the engagement terms
//   and, in some jurisdictions, on statute. Presenting the figure as
//   "interest due" would be wrong.
//
//   cash_flow_forecast projects from expected receipts and payments. It is a
//   forecast and will be wrong to the extent the underlying dates are, so the
//   interface says what it is built from.
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
const clean = (m) => !m ? "That report could not be produced."
  : String(m).replace(/^ERROR:\s*/i, "").replace(/\s*CONTEXT:[\s\S]*$/i, "").trim();

const today = () => new Date().toISOString().slice(0, 10);

// ── Aged debt and aged creditors ────────────────────────────────────────────
export const arAging = (asAt) => call("report_ar_aging", { p_as_at: asAt || today() });
export const apAging = (asAt) => call("report_ap_aging", { p_as_at: asAt || today() });

// A calculation of what COULD be charged at the given rate, not a statement of
// what is owed. Whether interest is chargeable depends on the engagement terms.
export const arOverdueInterest = (annualRatePct, asAt) =>
  call("report_ar_overdue_interest", { p_annual_rate_pct: annualRatePct,
                                       p_as_at: asAt || today() });

// ── Statements ──────────────────────────────────────────────────────────────
export const customerStatement = (customerId, asAt) =>
  call("customer_statement_for", { p_customer: customerId, p_as_at: asAt || today() });
export const supplierStatement = (supplierId, asAt) =>
  call("supplier_statement", { p_supplier: supplierId, p_as_at: asAt || today() });

// ── Tax ─────────────────────────────────────────────────────────────────────
// Grouped by jurisdiction, which is the view that matters for a group filing
// in six of them.
export const vatByJurisdiction = (start, end) =>
  call("report_vat_by_jurisdiction", { p_start: start, p_end: end });

// ── Analysis ────────────────────────────────────────────────────────────────
export const dimensionPnl = (entityId, dimType, start, end) =>
  call("report_dimension_pnl", { p_entity: entityId, p_dim_type: dimType,
                                 p_start: start, p_end: end });

// ── Forecasts ───────────────────────────────────────────────────────────────
// A forecast built from expected receipts and payments, so it is only as good
// as the dates behind it.
export const cashFlowForecast = (entityId, from, buckets, bucketDays) =>
  call("cash_flow_forecast", { p_entity: entityId, p_from: from || today(),
                               p_buckets: buckets || 6, p_bucket_days: bucketDays || 30 });
export const rollingForecast = (budgetId, asOf) =>
  call("rolling_forecast_summary", { p_budget: budgetId, p_as_of: asOf });

// ── Intercompany overview ───────────────────────────────────────────────────
// Built in db/073 and left with no caller — my own orphan, which is the exact
// fault the wiring audit exists to find.
export const icOverview = (entityId) =>
  call("ic_overview", { p_entity: entityId ?? null });

export const AGING_BUCKETS = [
  { key: "current_amt", label: "Current" },
  { key: "d1_30",       label: "1–30 days" },
  { key: "d31_60",      label: "31–60 days" },
  { key: "d61_90",      label: "61–90 days" },
  { key: "d90_plus",    label: "Over 90 days" },
];

export const canRead = () => isConfigured;
