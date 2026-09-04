// src/affinity_documents_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";

export async function documentList() {
  if (!isConfigured) return { data: null, error: new Error("not configured") };
  return supabase.rpc("document_list", {});
}

// Filing a document needs an entity id and a folder category code, but the
// module works in names — which is right for the user and wrong for the
// database. These two lookups bridge that, loaded once.
export async function entityLookup() {
  if (!isConfigured) return { data: null, error: new Error("not configured") };
  return supabase.rpc("ea_entities_list", {});
}

export async function categoryLookup() {
  if (!isConfigured) return { data: null, error: new Error("not configured") };
  // dms_category is a small reference table; read it directly rather than
  // adding a function for it.
  return supabase.from("dms_category").select("code,name").order("code");
}
