// src/affinity_ops_api.js — shared wrappers for ops modules
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });
export async function tsEntries()       { if (!isConfigured) return off(); return supabase.rpc("ts_entries", {}); }
export async function notificationsList(){ if (!isConfigured) return off(); return supabase.rpc("notifications_list", {}); }
export async function auditEvents()     { if (!isConfigured) return off(); return supabase.rpc("audit_events", {}); }
export async function proceduresList()  { if (!isConfigured) return off(); return supabase.rpc("procedures_list", {}); }
export async function procedureRuns()   { if (!isConfigured) return off(); return supabase.rpc("procedure_runs", {}); }
export async function procedureHist()   { if (!isConfigured) return off(); return supabase.rpc("procedure_hist", {}); }
export { isConfigured };
