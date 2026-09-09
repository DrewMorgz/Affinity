// src/affinity_onboarding_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });
export async function onboardingCases() { if (!isConfigured) return off(); return supabase.rpc("onboarding_cases", {}); }
export async function attritionCases()  { if (!isConfigured) return off(); return supabase.rpc("attrition_cases", {}); }

// Client attrition cases: there is NO TABLE for this in the database, so there is nothing to
// read. The RPC "attrition_cases" was called here and did not exist — the call failed
// silently and the screen fell back to bundled demo data, which looked
// populated and correct.
//
// Returning an explicit not-built result instead, so the screen can say so.
// Showing sample data where a real store is missing is the more dangerous of
// the two, because someone acts on it.
export const NOT_BUILT_attrition_cases = {
  ok: false, live: false, notBuilt: true, data: [],
  error: "Client attrition cases are not built yet — there is no store for them in the database, so nothing is being hidden or lost. Data entered elsewhere is unaffected.",
};
