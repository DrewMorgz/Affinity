// src/affinity_saved_reports_api.js
// Saved reports. Persists to Supabase when configured; otherwise falls back to
// localStorage so saving still works in preview and nothing is silently lost.
// Backed by db_ops/008_saved_reports.sql.
import { supabase, isConfigured } from "./affinity_accounting_supabase";

const LS_KEY = "affinity-core-saved-reports";

function lsRead() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}
function lsWrite(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (e) {}
}

export async function savedReportList(owner) {
  if (isConfigured) {
    const { data, error } = await supabase.rpc("saved_report_list", { p_owner: owner || null });
    if (!error && data) return { data, error: null, local: false };
  }
  return { data: lsRead(), error: null, local: true };
}

export async function savedReportSave(name, definition, owner, shared) {
  if (isConfigured) {
    const { data, error } = await supabase.rpc("saved_report_upsert", {
      p_name: name, p_definition: definition, p_owner: owner || null, p_shared: !!shared,
    });
    if (!error) return { data, error: null, local: false };
  }
  const list = lsRead();
  const i = list.findIndex((r) => r.name === name && r.owner === (owner || null));
  const row = {
    id: i > -1 ? list[i].id : Date.now(),
    name, definition, owner: owner || null, shared: !!shared,
    run_count: i > -1 ? list[i].run_count : 0,
    last_run_at: i > -1 ? list[i].last_run_at : null,
    updated_at: new Date().toISOString(),
  };
  if (i > -1) list[i] = row; else list.unshift(row);
  lsWrite(list);
  return { data: row, error: null, local: true };
}

export async function savedReportTouch(id) {
  if (isConfigured) {
    const { error } = await supabase.rpc("saved_report_touch", { p_id: id });
    if (!error) return { error: null };
  }
  const list = lsRead();
  const i = list.findIndex((r) => String(r.id) === String(id));
  if (i > -1) {
    list[i].run_count = (list[i].run_count || 0) + 1;
    list[i].last_run_at = new Date().toISOString();
    lsWrite(list);
  }
  return { error: null };
}

export async function savedReportDelete(id) {
  if (isConfigured) {
    const { error } = await supabase.rpc("saved_report_delete", { p_id: id });
    if (!error) return { error: null };
  }
  lsWrite(lsRead().filter((r) => String(r.id) !== String(id)));
  return { error: null };
}
