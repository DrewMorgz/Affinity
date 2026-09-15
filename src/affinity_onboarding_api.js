// src/affinity_onboarding_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";

// ─────────────────────────────────────────────────────────────────────────────
// THE CALL HELPER. This file used call() throughout and never defined it, so
// every function in it threw "call is not defined" the moment it ran. Reported
// as "CRM & Onboarding are not working" with exactly that message in the stack.
//
// It compiled, because an undefined identifier in JavaScript is only an error
// when it is reached. It rendered, because the module renders before it loads.
// It failed the first time anybody opened the screen.
//
// Five API files were in this state. The working ones each define their own
// helper; these five were written expecting one and never got it.
// ─────────────────────────────────────────────────────────────────────────────
const clean = (m) => String(m || "").replace(/^[A-Z0-9]{5}:\s*/, "");

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in — this is read from the database." };
  }
  try {
    const { data, error } = await supabase.rpc(fn, args || {});
    if (error) return { ok: false, live: true, data: null, error: clean(error.message) };
    return { ok: true, live: true, data, error: null };
  } catch (e) {
    return { ok: false, live: false, data: null, error: String((e && e.message) || e) };
  }
}

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
