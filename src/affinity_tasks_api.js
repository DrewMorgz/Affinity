// src/affinity_tasks_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
export async function tasksList() {
  if (!isConfigured) return { data: null, error: new Error("not configured") };
  return supabase.rpc("tasks_list", {});
}
