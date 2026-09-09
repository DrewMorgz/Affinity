// src/affinity_onboarding_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });
export async function onboardingCases() { if (!isConfigured) return off(); return supabase.rpc("onboarding_cases", {}); }
// ── Attrition (db/084) ──────────────────────────────────────────────────────
// A client leaving had no table until db/084.
//
// Sign-off is Manager, then MD, then Group CEO OR Group COO. The final stage
// has an alternate, and either satisfies it: a rule requiring one named person
// stalls whenever they are away, and the realistic result is a workaround.
//
// Approvals run in sequence, and one person cannot satisfy two stages.
export const attritionCases = (openOnly) =>
  call("attrition_cases", { p_open_only: openOnly === true });
// Unbilled time is captured at opening, because a departing client is the
// hardest one to bill afterwards.
export const attritionOpen = (a) => call("attrition_open", {
  p_entity: a.entityId, p_reason: a.reason, p_detail: a.detail || null,
  p_administrator: a.administrator || null, p_successor: a.successor || null,
  p_target_date: a.targetDate || null,
});
export const attritionApprove = (caseId, stage, role, note) =>
  call("attrition_approve", { p_case: caseId, p_stage: stage, p_role: role,
                              p_note: note || null });
export const ATTRITION_STAGES = [
  { code: "MANAGER", label: "Manager approval",  roles: ["Manager"] },
  { code: "MD",      label: "MD approval",       roles: ["MD", "Managing Director"] },
  { code: "GROUP",   label: "Group CEO or COO",  roles: ["Group CEO", "Group COO"] },
];
