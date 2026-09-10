// src/affinity_rates_api.js
// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL RATES AND GROUP ALLOCATIONS
//
// The reference data Andy asked to be manually enterable, then fixed, then
// reopenable. db/079 built all of it and there was no screen — so budgets
// compute staff costs on nothing and nobody can enter the figures.
//
// TWO THINGS THIS LAYER CARRIES that are easy to lose:
//
// Rates are EFFECTIVE-DATED and never edited in place. A locked rate is
// superseded from a later date rather than changed, so a budget approved on
// one set of rates still produces those figures when re-run. Editing in place
// silently rewrites history.
//
// Percentages are percentages, not fractions. The old hardcoded values were
// fractions — 0.128 for 12.8% — so anyone copying them across would make every
// payroll figure a hundred times too small while it still looked like money.
// The database refuses any value strictly between zero and one.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, isConfigured } from "./affinity_accounting_supabase";

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in — rates are read from the database." };
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

// ── Payroll rates ───────────────────────────────────────────────────────────
export const payrollRatesList = (location) =>
  call("payroll_rates_list", { p_location: location ?? null });

// Which jurisdictions have no rates at all. A budget for one of those is
// running on nothing, and a blank is easy to miss.
export const payrollRateGaps = () => call("payroll_rate_gaps", {});

// The rate that WAS in force at a date — the point of effective dating.
export const payrollRateAt = (location, at) =>
  call("payroll_rate_at", { p_location: location, p_at: at });

export const payrollRateSet = (r) => call("payroll_rate_set", {
  p_location: r.location, p_effective_from: r.effectiveFrom,
  p_social_pct: r.socialPct ?? null, p_social_threshold: r.socialThreshold ?? null,
  p_social_cap: r.socialCap ?? null, p_pension_pct: r.pensionPct ?? null,
  p_pension_cap: r.pensionCap ?? null, p_per_head_annual: r.perHeadAnnual ?? null,
  p_per_head_note: r.perHeadNote || null, p_ccy: r.ccy || null,
  p_source: r.source || null, p_note: r.note || null,
});

// Agreeing is a judgement that the figures are right; locking is a decision to
// stop them moving. Two steps rather than one.
export const payrollRateAgree = (id) => call("payroll_rate_agree", { p_id: id });
export const payrollRateLock  = (id) => call("payroll_rate_lock",  { p_id: id });

// Reopening needs a reason, which is kept on the record. Rates do change
// mid-year, and refusing outright would push the work into spreadsheets.
export const payrollRateReopen = (id, reason) =>
  call("payroll_rate_reopen", { p_id: id, p_reason: reason });

// ── Group allocations ───────────────────────────────────────────────────────
export const allocationsList = () => call("allocations_list", {});
export const allocationLines = (setId) => call("allocation_lines", { p_set: setId });

export const allocationSetCreate = (a) => call("allocation_set_create", {
  p_name: a.name, p_effective_from: a.effectiveFrom,
  p_basis: a.basis || null, p_note: a.note || null,
});

// Reports the running total as you build. Not enforced per line, because an
// allocation is built one entity at a time and would be unbuildable if every
// intermediate state had to total 100.
export const allocationLineSet = (setId, entityId, pct, note) =>
  call("allocation_line_set", { p_set: setId, p_entity: entityId,
                                p_pct: pct, p_note: note || null });

// Enforced HERE. An allocation that does not total 100 either loses cost or
// duplicates it, and the resulting figures do not show which.
export const allocationSetAgree  = (setId) => call("allocation_set_agree",  { p_set: setId });
export const allocationSetLock   = (setId) => call("allocation_set_lock",   { p_set: setId });
export const allocationSetReopen = (setId, reason) =>
  call("allocation_set_reopen", { p_set: setId, p_reason: reason });

export const canWrite = () => isConfigured;
