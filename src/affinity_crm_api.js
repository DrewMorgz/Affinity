// src/affinity_crm_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });
export async function crmProspects() { if (!isConfigured) return off(); return supabase.rpc("crm_prospects", {}); }
export async function crmInteractions(pid) { if (!isConfigured) return off(); return supabase.rpc("crm_interactions", { p_prospect: pid }); }

// CRM prospects: there is NO TABLE for this in the database, so there is nothing to
// read. The RPC "crm_prospects" was called here and did not exist — the call failed
// silently and the screen fell back to bundled demo data, which looked
// populated and correct.
//
// Returning an explicit not-built result instead, so the screen can say so.
// Showing sample data where a real store is missing is the more dangerous of
// the two, because someone acts on it.
export const NOT_BUILT_crm_prospects = {
  ok: false, live: false, notBuilt: true, data: [],
  error: "CRM prospects are not built yet — there is no store for them in the database, so nothing is being hidden or lost. Data entered elsewhere is unaffected.",
};

// CRM interactions: there is NO TABLE for this in the database, so there is nothing to
// read. The RPC "crm_interactions" was called here and did not exist — the call failed
// silently and the screen fell back to bundled demo data, which looked
// populated and correct.
//
// Returning an explicit not-built result instead, so the screen can say so.
// Showing sample data where a real store is missing is the more dangerous of
// the two, because someone acts on it.
export const NOT_BUILT_crm_interactions = {
  ok: false, live: false, notBuilt: true, data: [],
  error: "CRM interactions are not built yet — there is no store for them in the database, so nothing is being hidden or lost. Data entered elsewhere is unaffected.",
};
