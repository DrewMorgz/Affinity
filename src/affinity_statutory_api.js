// src/affinity_statutory_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });

export async function statAnnualReturns() { if (!isConfigured) return off(); return supabase.rpc("stat_annual_returns", {}); }
export async function statBoRegisters()  { if (!isConfigured) return off(); return supabase.rpc("stat_bo_registers", {}); }
export async function statCogs()         { if (!isConfigured) return off(); return supabase.rpc("stat_cogs_list", {}); }
export async function statOfficerChanges(){ if (!isConfigured) return off(); return supabase.rpc("stat_officer_changes", {}); }
export async function statDissolutions() { if (!isConfigured) return off(); return supabase.rpc("stat_dissolutions", {}); }
