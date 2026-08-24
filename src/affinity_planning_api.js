// src/affinity_planning_api.js
// Planning and Consolidation data access.
//
// Every call returns { data, live }. `live` is false when Supabase is not
// configured or the RPC is not there yet, which lets the modules fall back to
// preview figures and — importantly — say so in the UI rather than showing
// preview numbers as if they were real.
//
// Backed by db/043, db/047, db/018, db/017 plus db/052_planning_grants.sql,
// which supplies the grants and the list/write functions the engine lacks.
import { supabase, isConfigured } from "./affinity_accounting_supabase";

async function rpc(fn, args) {
  if (!isConfigured) return { data: null, live: false, error: null };
  try {
    const { data, error } = await supabase.rpc(fn, args || {});
    if (error) return { data: null, live: false, error };
    return { data, live: true, error: null };
  } catch (e) {
    return { data: null, live: false, error: e };
  }
}

// ── Planning ────────────────────────────────────────────────────────────────
export const budgetList   = ()                 => rpc("planning_budget_list");
export const budgetGrid   = (budgetId)         => rpc("planning_budget_grid", { p_budget: budgetId });
export const budgetSummary= (budgetId)         => rpc("report_budget_summary", { p_budget: budgetId });
export const budgetVsActual = (budgetId)       => rpc("report_budget_vs_actual", { p_budget: budgetId });
export const compareScenarios = (a, b)         => rpc("compare_budget_scenarios", { p_budget_a: a, p_budget_b: b });

export const setBudgetCell = (budgetId, accountCode, period, amount) =>
  rpc("planning_budget_set", { p_budget: budgetId, p_account_code: accountCode, p_period: period, p_amount: amount });

export const submitBudget  = (budgetId, user)  => rpc("submit_budget",  { p_budget: budgetId, p_user: user });
export const approveBudget = (budgetId, who)   => rpc("approve_budget", { p_budget: budgetId, p_approver: who });

// ── Consolidation ───────────────────────────────────────────────────────────
export const groupList     = ()                => rpc("consol_group_list");
export const consolTrialBalance = (groupId, rateDate) =>
  rpc("consolidated_trial_balance", { p_group_id: groupId, p_rate_date: rateDate });
export const consolSummary = (groupId, rateDate) =>
  rpc("consolidated_summary", { p_group_id: groupId, p_rate_date: rateDate });

export const mappingList   = (entityId)        => rpc("account_map_list", { p_entity: entityId });
export const mappingSet    = (id, groupCode)   => rpc("account_map_set", { p_id: id, p_group_code: groupCode });

export const runList       = (groupId)         => rpc("consol_run_list", { p_group: groupId ?? null });
export const runRecord     = (r) => rpc("consol_run_record", {
  p_run_ref: r.ref, p_group: r.groupId ?? null, p_period: r.period, p_rules: r.rules,
  p_status: r.status, p_members: r.members, p_note: r.note || null, p_log: r.log || null,
});

// Pivot budget_line rows (account, period, amount) into the grid's shape:
// { "4000:0": 18000, ... } keyed by account code and zero-based month index.
export function pivotToGrid(rows, yearStart) {
  const out = {};
  (rows || []).forEach((r) => {
    const month = Number(String(r.period).slice(5, 7));       // "2026-04" -> 4
    const idx = yearStart ? ((month - yearStart + 12) % 12) : month - 1;
    out[r.account_code + ":" + idx] = Number(r.amount);
  });
  return out;
}
