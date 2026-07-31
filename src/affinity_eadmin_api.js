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
