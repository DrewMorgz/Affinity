// src/affinity_onboarding_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });
export async function onboardingCases() { if (!isConfigured) return off(); return supabase.rpc("onboarding_cases", {}); }
export async function attritionCases()  { if (!isConfigured) return off(); return supabase.rpc("attrition_cases", {}); }
