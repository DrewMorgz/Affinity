// src/affinity_egaming_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });
export async function egLicences() { if (!isConfigured) return off(); return supabase.rpc("eg_licences", {}); }
export async function egLog()      { if (!isConfigured) return off(); return supabase.rpc("eg_log", {}); }
