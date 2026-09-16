import { supabase, isConfigured } from "./affinity_accounting_supabase";

const off = () => ({ data: null, error: null });

export async function cpdList() {
  if (!isConfigured) return off();
  return supabase.rpc("cpd_list", {});
}

// WRITE: log a CPD entry
export async function cpdAdd({ staff, activity, category, hours, date, note }) {
  if (!isConfigured) return off();
  return supabase.rpc("cpd_add", {
    p_staff: staff || "",
    p_activity: activity,
    p_category: category || "",
    p_hours: hours === "" || hours == null ? null : Number(hours),
    p_date: date || null,
    p_note: note || null,
  });
}

// A person's own log, and the split a CPD return actually asks for: structured
// hours against general. Requested — "the individual staff member should also
// be able to review their own CPD log."
export async function cpdMyLog(staff) {
  if (!isConfigured) return off();
  return supabase.rpc("cpd_my_log", { p_staff: staff || null });
}

export async function cpdMySummary(staff, year) {
  if (!isConfigured) return off();
  return supabase.rpc("cpd_my_summary", { p_staff: staff || null, p_year: year || null });
}
