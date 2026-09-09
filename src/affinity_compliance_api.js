// src/affinity_compliance_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });

export async function compReviews()        { if (!isConfigured) return off(); return supabase.rpc("comp_reviews", {}); }
export async function compRegObligations() { if (!isConfigured) return off(); return supabase.rpc("comp_reg_obligations", {}); }
export async function compBreaches()       { if (!isConfigured) return off(); return supabase.rpc("comp_breaches", {}); }
export async function compTraining()       { if (!isConfigured) return off(); return supabase.rpc("comp_training", {}); }

// Periodic client reviews: there is NO TABLE for this in the database, so there is nothing to
// read. The RPC "comp_reviews" was called here and did not exist — the call failed
// silently and the screen fell back to bundled demo data, which looked
// populated and correct.
//
// Returning an explicit not-built result instead, so the screen can say so.
// Showing sample data where a real store is missing is the more dangerous of
// the two, because someone acts on it.
export const NOT_BUILT_comp_reviews = {
  ok: false, live: false, notBuilt: true, data: [],
  error: "Periodic client reviews are not built yet — there is no store for them in the database, so nothing is being hidden or lost. Data entered elsewhere is unaffected.",
};
