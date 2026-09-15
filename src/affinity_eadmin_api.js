// src/affinity_eadmin_api.js
// Wrappers over the entity-admin (CSP) read functions. Each returns { data, error }.
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

export async function eaEntitiesList() {
  if (!isConfigured) return off();
  return supabase.rpc("ea_entities_list", {});
}
export async function eaProfile(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_profile", { p_entity: entityId });
}
export async function eaOfficers(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_officers", { p_entity: entityId });
}
export async function eaShareholders(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_shareholders", { p_entity: entityId });
}
export async function eaCharges(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_charges", { p_entity: entityId });
}
export async function eaUbos(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_ubos", { p_entity: entityId });
}
export async function eaAddresses(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_addresses", { p_entity: entityId });
}
export async function eaMeetings(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_meetings", { p_entity: entityId });
}
export async function eaBanks(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_banks", { p_entity: entityId });
}
export async function eaAssets(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_assets", { p_entity: entityId });
}
export async function eaDividends(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_dividends", { p_entity: entityId });
}
export async function eaSafeItems(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_safe_items", { p_entity: entityId });
}
export async function eaFileNotes(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_file_notes", { p_entity: entityId });
}
export async function eaSafeMovements(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_safe_movements", { p_entity: entityId });
}
export async function eaSignatories(entityId) {
  if (!isConfigured) return off();
  return supabase.rpc("ea_signatories", { p_entity: entityId });
}
export async function repAum()          { if (!isConfigured) return off(); return supabase.rpc("rep_aum", {}); }
export async function repBankBalances() { if (!isConfigured) return off(); return supabase.rpc("rep_bank_balances", {}); }
export async function repSafeCustody(t) { if (!isConfigured) return off(); return supabase.rpc("rep_safe_custody", { p_type: t||null }); }
export async function repSignatories()  { if (!isConfigured) return off(); return supabase.rpc("rep_signatories", {}); }

// Which services Affinity provides to an entity. serviceSet could record one
// and nothing could read them back, so the list fed billing and could not be
// checked against what is actually being billed.
export const eaServices = (entityId) => call("ea_services", { p_entity: entityId });

// ── FATCA and CRS classification (db/101) ───────────────────────────────────
// The classifications were free text, so two administrators would write the
// same thing three ways and one of them would use the CRS term for a FATCA
// classification. These are the valid codes, what each means for reporting,
// and a setter that refuses anything not on the list.

export const classificationTypes = (regime) =>
  call("classification_types", { p_regime: regime || null });

// Refuses an unknown code, and refuses a classification that requires a GIIN
// without one — an entity classified as a Reporting FI is registered with the
// IRS, and the GIIN is what that registration is evidenced by.
export const entityClassificationSet = (entityId, fatca, crs, giin) =>
  call("entity_classification_set", { p_entity: entityId, p_fatca: fatca || null,
                                      p_crs: crs || null, p_giin: giin || null });

// What FOLLOWS from the classification, which is the useful question: does it
// report, are controlling persons looked through, and what is missing.
export const classificationStatus = (entityId) =>
  call("classification_status", { p_entity: entityId || null });

// ── Classification methodology and the reporting extract (db/102) ───────────
// The questions that arrive at a classification, and the record of the answers.
// The answers matter more than the conclusion: "Passive NFFE" written in a box
// tells a regulator nothing about whether anybody thought about it.
export const classificationQuestions = (regime) =>
  call("classification_questions", { p_regime: regime });

// Records the answers, the conclusion and why, and applies the classification
// through the validating setter. Refuses a conclusion with no answers.
export const classificationAssess = (entityId, regime, answers, concluded, rationale) =>
  call("classification_assess", { p_entity: entityId, p_regime: regime,
                                  p_answers: answers, p_concluded: concluded,
                                  p_rationale: rationale || null });

export const classificationHistory = (entityId) =>
  call("classification_history", { p_entity: entityId });

// One row per reportable account, with the holder and — where the holder is a
// passive NFE — one row per controlling person. This is the content of a FATCA
// or CRS return whatever file the portal wants. The file itself is a formatting
// step on top and differs by jurisdiction.
export const fatcaCrsExtract = (regime, periodEnd, jurisdiction) =>
  call("fatca_crs_extract", { p_regime: regime, p_period_end: periodEnd,
                              p_jurisdiction: jurisdiction || null });

// Whether the return could be filed at all, before anybody tries.
export const fatcaCrsReadiness = (regime, periodEnd) =>
  call("fatca_crs_readiness", { p_regime: regime, p_period_end: periodEnd });
