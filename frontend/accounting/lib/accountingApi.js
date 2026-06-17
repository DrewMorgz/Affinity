// src/lib/accountingApi.js
// Thin wrappers over the Affinity accounting-engine RPCs (db/001..050).
// Every call returns { data, error } so screens render loading / data / error
// states uniformly. Named params MUST match the SQL function argument names.
import { supabase, isConfigured } from "./supabaseClient";

function notConfigured() {
  return { data: null, error: new Error("Supabase is not connected yet.") };
}

// list entities for the entity picker
export async function listEntities() {
  if (!isConfigured) return notConfigured();
  return supabase
    .from("entity")
    .select("id, company_code, name, functional_ccy")
    .order("company_code");
}

// KPI bundle for the overview dashboard  -> build_kpi_dashboard(p_entity,p_start,p_end)
export async function getKpiDashboard(entityId, start, end) {
  if (!isConfigured) return notConfigured();
  return supabase.rpc("build_kpi_dashboard", { p_entity: entityId, p_start: start, p_end: end });
}

// direct-method cash flow  -> cash_flow_statement(p_entity,p_start,p_end) [returns rows]
export async function getCashFlow(entityId, start, end) {
  if (!isConfigured) return notConfigured();
  return supabase.rpc("cash_flow_statement", { p_entity: entityId, p_start: start, p_end: end });
}

// AR collections worklist  -> report_collections(p_owner_entity,p_as_at)
export async function getCollections(entityId, asAt) {
  if (!isConfigured) return notConfigured();
  return supabase.rpc("report_collections", { p_owner_entity: entityId, p_as_at: asAt });
}

// customer credit exposure  -> customer_credit_status(p_owner_entity)
export async function getCreditStatus(entityId) {
  if (!isConfigured) return notConfigured();
  return supabase.rpc("customer_credit_status", { p_owner_entity: entityId });
}

// external auditor pack (JSON)  -> build_audit_pack(p_entity,p_start,p_end)
export async function getAuditPack(entityId, start, end) {
  if (!isConfigured) return notConfigured();
  return supabase.rpc("build_audit_pack", { p_entity: entityId, p_start: start, p_end: end });
}

// finalised/draft statutory accounts JSON  -> get_accounts_set_json(p_set_id)
export async function getAccountsSet(setId) {
  if (!isConfigured) return notConfigured();
  return supabase.rpc("get_accounts_set_json", { p_set_id: setId });
}

// budget vs actual  -> report_budget_vs_actual(p_budget)
export async function getBudgetVsActual(budgetId) {
  if (!isConfigured) return notConfigured();
  return supabase.rpc("report_budget_vs_actual", { p_budget: budgetId });
}
