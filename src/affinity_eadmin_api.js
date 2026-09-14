// src/affinity_eadmin_api.js
// Wrappers over the entity-admin (CSP) read functions. Each returns { data, error }.
import { supabase, isConfigured } from "./affinity_accounting_supabase";

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
