// src/affinity_ops_api.js — shared wrappers for ops modules
import { supabase, isConfigured } from "./affinity_accounting_supabase";

// ─────────────────────────────────────────────────────────────────────────────
// THE CALL HELPER. This file used call() throughout and never defined it, so
// every function in it threw "call is not defined" the moment it ran. Reported
// as "CRM & Onboarding are not working" with exactly that message in the stack.
//
// It compiled, because an undefined identifier in JavaScript is only an error
// when it is reached. It rendered, because the module renders before it loads.
// It failed the first time anybody opened the screen.
//
// Five API files were in this state. The working ones each define their own
// helper; these five were written expecting one and never got it.
// ─────────────────────────────────────────────────────────────────────────────
const clean = (m) => String(m || "").replace(/^[A-Z0-9]{5}:\s*/, "");

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in — this is read from the database." };
  }
  try {
    const { data, error } = await supabase.rpc(fn, args || {});
    if (error) return { ok: false, live: true, data: null, error: clean(error.message) };
    return { ok: true, live: true, data, error: null };
  } catch (e) {
    return { ok: false, live: false, data: null, error: String((e && e.message) || e) };
  }
}

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
