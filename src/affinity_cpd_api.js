import { supabase, isConfigured } from "./affinity_accounting_supabase";

const off = () => ({ data: null, error: null });

export async function cpdList() {
  if (!isConfigured) return off();
  return supabase.rpc("cpd_list", {});
}

// WRITE: log a CPD entry
export async function cpdAdd({ staff, activity, category, hours, date }) {
  if (!isConfigured) return off();
  return supabase.rpc("cpd_add", {
    p_staff: staff || "",
    p_activity: activity,
    p_category: category || "",
    p_hours: hours === "" || hours == null ? null : Number(hours),
    p_date: date || null,
  });
}
