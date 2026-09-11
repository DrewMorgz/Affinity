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
export async function bkEntities()  { if (!isConfigured) return off(); return supabase.rpc("bk_entities", {}); }
export async function bkTxnsAll()   { if (!isConfigured) return off(); return supabase.rpc("bk_txns_all", {}); }
export async function bkPnlAll()    { if (!isConfigured) return off(); return supabase.rpc("bk_pnl_all", {}); }
export async function bkBanksAll()  { if (!isConfigured) return off(); return supabase.rpc("bk_banks_all", {}); }
export async function getDatasets(prefix) { if (!isConfigured) return off(); return supabase.rpc("get_datasets", { p_prefix: prefix }); }
export async function appUsers() { if (!isConfigured) return off(); return supabase.rpc("app_users", {}); }

// ── Standing checks and management views ────────────────────────────────────

// SILENT NO-OP CANDIDATES. Functions that can return zero rows or a zero count
// without raising — the shape of a function that reports success and does
// nothing. Two of those were found in this build by hand: approving DRAFT time
// updated nothing and said "Approved", and adding payables to a run with none
// open did the same. This is the standing check so the next one is found by
// looking rather than by a user noticing a figure that never moved.
export const silentNoopCandidates = () => call("silent_noop_candidates", {});

// Who administers what, by role. A caseload that nobody has looked at is how
// an entity ends up with no administrator at all.
export const caseload = (role) => call("ea_caseload", { p_role: role || null });

// Obligation coverage per jurisdiction and area: how many are recorded, and
// how many of those are confirmed. Recorded is not the same as trustworthy.
export const obligationCoverage = () => call("obligation_coverage", {});
