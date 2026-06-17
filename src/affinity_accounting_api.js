// src/affinity_accounting_api.js
// Thin wrappers over the accounting-engine RPCs (db/001..050). Each returns
// { data, error }. Param names match the SQL function argument names exactly.
import { supabase, isConfigured } from "./affinity_accounting_supabase";

const off = () => ({ data: null, error: new Error("not configured") });

export async function listEntities() {
  if (!isConfigured) return off();
  return supabase.from("entity").select("id, company_code, name, functional_ccy").order("company_code");
}
export async function getKpiDashboard(entityId, start, end) {
  if (!isConfigured) return off();
  return supabase.rpc("build_kpi_dashboard", { p_entity: entityId, p_start: start, p_end: end });
}
export async function getCashFlow(entityId, start, end) {
  if (!isConfigured) return off();
  return supabase.rpc("cash_flow_statement", { p_entity: entityId, p_start: start, p_end: end });
}
export async function getCollections(entityId, asAt) {
  if (!isConfigured) return off();
  return supabase.rpc("report_collections", { p_owner_entity: entityId, p_as_at: asAt });
}
export async function getCreditStatus(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("customer_credit_status", { p_owner_entity: entityId });
}
export async function getAuditPack(entityId, start, end) {
  if (!isConfigured) return off();
  return supabase.rpc("build_audit_pack", { p_entity: entityId, p_start: start, p_end: end });
}
export async function getAccountsSet(setId) {
  if (!isConfigured) return off();
  return supabase.rpc("get_accounts_set_json", { p_set_id: setId });
}
export async function getBudgetVsActual(budgetId) {
  if (!isConfigured) return off();
  return supabase.rpc("report_budget_vs_actual", { p_budget: budgetId });
}
