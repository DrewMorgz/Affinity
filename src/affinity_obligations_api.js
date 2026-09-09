// src/affinity_obligations_api.js
// ─────────────────────────────────────────────────────────────────────────────
// OBLIGATION SCHEDULES
//
// These were hardcoded in affinity_core_jurisdiction_compliance.jsx, which
// meant Malta and Cayman's schedules could not be corrected and the other four
// jurisdictions could not be filled in at all. For a compliance tracker that
// is the wrong way round: deadlines change more often than the software.
//
// Malta and Cayman's entries were migrated as they stood but NOT marked
// confirmed — their dates came from a code constant and each needs checking
// against the legislation. Isle of Man, Cyprus, UK and USA are empty, because
// a wrong date in a compliance tracker is worse than a visibly empty one.
//
// Confirming an obligation requires a legislation reference and a named owner:
// a deadline nobody can check and nobody owns is one nobody does.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, isConfigured } from "./affinity_accounting_supabase";

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in — the database cannot be reached." };
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

export const obligationsList = (location, includeInactive) =>
  call("obligations_list", { p_location: location || null,
                             p_include_inactive: includeInactive === true });
export const obligationCoverage = () => call("obligation_coverage", {});
// Per jurisdiction, with the single next step.
export const obligationSummary = () => call("obligation_summary", {});

// The trigger is required and separate from the deadline, because "30 days"
// recorded without saying 30 days from what is the commonest way a compliance
// date goes wrong.
export const obligationAdd = (o) => call("obligation_add", {
  p_location: o.location, p_area: o.area, p_title: o.title,
  p_trigger_type: o.triggerType, p_trigger_detail: o.triggerDetail || null,
  p_due_days: o.dueDays ?? null, p_due_months: o.dueMonths ?? null,
  p_fixed_month: o.fixedMonth ?? null, p_fixed_day: o.fixedDay ?? null,
  p_frequency: o.frequency || null, p_applies_to: o.appliesTo || null,
  p_filing_route: o.filingRoute || null, p_legislation_ref: o.legislationRef || null,
  p_owner: o.owner || null, p_note: o.note || null,
});
// Amending a confirmed obligation withdraws the confirmation, because whoever
// confirmed it confirmed different terms.
export const obligationUpdate = (id, o) => call("obligation_update", {
  p_id: id, p_title: o.title || null, p_trigger_detail: o.triggerDetail || null,
  p_due_days: o.dueDays ?? null, p_due_months: o.dueMonths ?? null,
  p_frequency: o.frequency || null, p_applies_to: o.appliesTo || null,
  p_filing_route: o.filingRoute || null, p_legislation_ref: o.legislationRef || null,
  p_owner: o.owner || null, p_note: o.note || null,
});
// Per obligation, not per jurisdiction: they are researched one at a time and a
// blanket confirmation would cover ones nobody had checked.
export const obligationConfirm = (id) => call("obligation_confirm", { p_id: id });
// Deactivated rather than deleted — a schedule that used to include something
// is part of the compliance history.
export const obligationRemove = (id, reason) =>
  call("obligation_remove", { p_id: id, p_reason: reason });

export const TRIGGER_TYPES = [
  { id: "year_end",    label: "After the entity's year end" },
  { id: "anniversary", label: "After an anniversary (e.g. incorporation)" },
  { id: "fixed_date",  label: "A fixed calendar date each year" },
  { id: "period_end",  label: "After a reporting period end" },
  { id: "on_change",   label: "On change (no fixed deadline)" },
  { id: "ongoing",     label: "Ongoing obligation" },
];
export const AREAS = [
  { id: "LICENCE",   label: "Licence / authorisation" },
  { id: "AML",       label: "AML / CFT" },
  { id: "AEOI",      label: "Automatic exchange of information" },
  { id: "SUBSTANCE", label: "Economic substance" },
  { id: "BO",        label: "Beneficial ownership register" },
  { id: "ANNUAL",    label: "Annual returns" },
  { id: "ACCOUNTS",  label: "Accounts filing" },
  { id: "TAX",       label: "Tax" },
  { id: "SECTOR",    label: "Sector-specific" },
  { id: "INTERNAL",  label: "Internal control" },
];
export const canWrite = () => isConfigured;
