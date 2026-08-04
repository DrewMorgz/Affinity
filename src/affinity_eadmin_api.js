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
