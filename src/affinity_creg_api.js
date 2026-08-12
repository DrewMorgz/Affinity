import { supabase, isConfigured } from "./affinity_accounting_supabase";

const off = () => ({ data: null, error: null });

export async function cregList(register) {
  if (!isConfigured) return off();
  return supabase.rpc("creg_list", { p_register: register });
}

// WRITE: add a compliance-register entry (data keyed by the register's columns)
export async function cregAdd({ register, jurisdiction, data, by }) {
  if (!isConfigured) return off();
  return supabase.rpc("creg_add", {
    p_register: register,
    p_jurisdiction: jurisdiction || "",
    p_data: data || {},
    p_by: by || "",
  });
}
