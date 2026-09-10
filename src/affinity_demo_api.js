// src/affinity_demo_api.js
// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATA MANAGEMENT
//
// Built in db/078 after Andy asked to keep the sample entities visible but be
// able to add and remove them. The functions and the flag were built; there
// was no screen, so the one thing he actually asked for could not be done.
//
// The safety property that matters: demo_entity_remove REFUSES anything not
// flagged as demo. A function that deletes client entities is only safe if it
// cannot reach a real one, and it checks the flag rather than the name.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, isConfigured } from "./affinity_accounting_supabase";

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in — the register cannot be reached." };
  }
  try {
    const { data, error } = await supabase.rpc(fn, args || {});
    if (error) return { ok: false, live: true, data: null, error: clean(error.message) };
    return { ok: true, live: true, data, error: null };
  } catch (e) {
    return { ok: false, live: false, data: null, error: String((e && e.message) || e) };
  }
}
const clean = (m) => !m ? "That could not be completed."
  : String(m).replace(/^ERROR:\s*/i, "").replace(/\s*CONTEXT:[\s\S]*$/i, "").trim();

// Demo against real, per category, plus whether anything real has been
// recorded against a demo entity — time, invoices or filings. That last part
// is the point: a filing recorded against a demo entity is the error worth
// catching.
export const demoDataSummary = () => call("demo_data_summary", {});

// Built through ea_entity_create, so a demo entity exercises the same
// duplicate and jurisdiction checks a real one does. The name is prefixed
// "[DEMO]" because a report or export may not know about the flag.
export const demoEntityAdd = (d) => call("demo_entity_add", {
  p_name: d.name, p_jurisdiction: d.jurisdiction || "IOM",
  p_entity_type: d.entityType || "COMPANY",
  p_risk_rating: d.riskRating || "Medium",
  p_administrator: d.administrator || null,
});

// Refuses anything not flagged as demo, and says to CLOSE a real client rather
// than delete it — the records must survive the relationship.
export const demoEntityRemove = (entityId) =>
  call("demo_entity_remove", { p_entity: entityId });

// Requires the exact phrase, not a tick box. This deletes a register, and a
// misplaced tick is easier than a misplaced phrase.
export const demoDataClear = (confirmation) =>
  call("demo_data_clear", { p_confirm: confirmation });

// Flagging a REAL entity as demo is the dangerous direction, because it makes
// it deletable. Refused where there is time, invoices or posted journals
// against it.
export const demoFlagSet = (entityId, isDemo) =>
  call("demo_flag_set", { p_entity: entityId, p_is_demo: isDemo });

export const CLEAR_PHRASE = "REMOVE DEMO DATA";
export const canWrite = () => isConfigured;
