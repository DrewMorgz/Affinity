// src/affinity_documents_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
export async function documentList() {
  if (!isConfigured) return { data: null, error: new Error("not configured") };
  return supabase.rpc("document_list", {});
}
