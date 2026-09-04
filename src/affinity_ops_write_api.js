// src/affinity_ops_write_api.js
// ─────────────────────────────────────────────────────────────────────────────
// WRITE LAYER — TIME, TASKS AND PROCEDURES
//
// Wrappers for db/059_write_time_tasks_procedures.sql: the things staff do
// daily rather than the entity registers covered by affinity_entity_write_api.
//
// Same contract as the entity writes — { ok, data, error, live } — so callers
// handle both the same way. Database validation messages are written to be
// read by the person who triggered them and are passed through unchanged.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, isConfigured } from "./affinity_accounting_supabase";

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in — changes cannot be saved yet." };
  }
  try {
    const { data, error } = await supabase.rpc(fn, args || {});
    if (error) return { ok: false, live: true, data: null, error: clean(error.message) };
    return { ok: true, live: true, data, error: null };
  } catch (e) {
    return { ok: false, live: false, data: null, error: String((e && e.message) || e) };
  }
}
const clean = (m) => !m ? "That could not be saved."
  : String(m).replace(/^ERROR:\s*/i, "").replace(/\s*CONTEXT:[\s\S]*$/i, "").trim();

// ── Timesheets ──────────────────────────────────────────────────────────────
export const timeAdd = (staffId, e) => call("ts_entry_add", {
  p_staff_id: staffId, p_entry_date: e.date, p_entity_label: e.entity,
  p_matter: e.matter || null, p_entry_type: e.workType || null,
  p_hours: e.hours, p_billable: e.billable !== false,
  p_rate: e.rate ?? null, p_narrative: e.narrative || null,
});
export const timeUpdate = (id, e) => call("ts_entry_update", {
  p_id: id, p_hours: e.hours ?? null, p_matter: e.matter || null,
  p_narrative: e.narrative || null, p_billable: e.billable ?? null,
});
export const timeSubmit = (staffId, from, to) =>
  call("ts_entry_submit", { p_staff_id: staffId, p_from: from, p_to: to });
export const timeApprove = (ids, approve, reason) =>
  call("ts_entry_approve", { p_ids: ids, p_approve: !!approve, p_reason: reason || null });

// Converts a running timer into a recorded entry. Seconds become hours to two
// decimals, which is how the timesheet stores them.
export const timerToEntry = (staffId, e, seconds) =>
  timeAdd(staffId, { ...e, hours: Math.max(0.01, Math.round((seconds / 3600) * 100) / 100) });

// ── Tasks ───────────────────────────────────────────────────────────────────
export const taskAdd = (t) => call("task_add", {
  p_title: t.title, p_category: t.category || null, p_entity_label: t.entity || null,
  p_entity_id: t.entityId ?? null, p_assignee: t.assignee || null,
  p_due_date: t.dueDate || null, p_priority: t.priority || "Normal", p_notes: t.notes || null,
});
export const taskSetStatus = (id, status, notes) =>
  call("task_set_status", { p_id: id, p_status: status, p_notes: notes || null });
export const taskReassign = (id, assignee) =>
  call("task_reassign", { p_id: id, p_assignee: assignee });
export const taskList = (assignee, status) =>
  call("task_list", { p_assignee: assignee || null, p_status: status || null });

// Raising a task from an Activity item. The note records where it came from,
// which is the point of the button — otherwise the context is lost.
export const taskFromActivity = (item, assignee) => taskAdd({
  title: item.title,
  category: item.category || item.mod || "Follow-up",
  entity: item.entity || null,
  assignee: assignee || null,
  notes: "Raised from " + (item.mod || "Activity")
       + (item.who ? " · " + item.who : "")
       + (item.t ? " · " + item.t : ""),
});

// ── Notifications ───────────────────────────────────────────────────────────
export const notificationAdd = (n) => call("notification_add", {
  p_ntype: n.type || "info", p_title: n.title, p_body: n.body || null,
  p_who: n.who || null, p_mod: n.mod || null,
});

// ── Procedure runs ──────────────────────────────────────────────────────────
export const procStart = (p) => call("proc_run_start", {
  p_proc: p.proc, p_title: p.title || null, p_entity_label: p.entity || null,
  p_total: p.totalSteps || 1, p_assignee: p.assignee || null,
});
export const procAdvance = (id, step) =>
  call("proc_run_advance", { p_id: id, p_step: step ?? null });
export const procComplete = (id, result) =>
  call("proc_run_complete", { p_id: id, p_result: result || "Completed" });
export const procAbandon = (id, reason) =>
  call("proc_run_abandon", { p_id: id, p_reason: reason });

export const canWrite = () => isConfigured;
