// src/affinity_crm_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });
export async function crmProspects() { if (!isConfigured) return off(); return supabase.rpc("crm_prospects", {}); }
export async function crmInteractions(pid) { if (!isConfigured) return off(); return supabase.rpc("crm_interactions", { p_prospect: pid }); }
