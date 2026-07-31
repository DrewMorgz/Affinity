// src/affinity_compliance_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });

export async function compReviews()        { if (!isConfigured) return off(); return supabase.rpc("comp_reviews", {}); }
export async function compRegObligations() { if (!isConfigured) return off(); return supabase.rpc("comp_reg_obligations", {}); }
export async function compBreaches()       { if (!isConfigured) return off(); return supabase.rpc("comp_breaches", {}); }
export async function compTraining()       { if (!isConfigured) return off(); return supabase.rpc("comp_training", {}); }
