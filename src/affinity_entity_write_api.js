// src/affinity_entity_write_api.js
// ─────────────────────────────────────────────────────────────────────────────
// ENTITY ADMIN — WRITE LAYER
//
// Wrappers for the register write functions in db/058_write_entity_registers.sql.
// The tables and read paths already existed; these are the calls that let the
// forms on screen actually save.
//
// Every call returns { ok, data, error, live }:
//   ok     the write succeeded
//   error  a message fit to show the user — the database validations return
//          plain English ("Resignation cannot precede appointment"), so they
//          are surfaced as-is rather than replaced with something vaguer
//   live   false when the database is not reachable, which is how the UI knows
//          to keep the form disabled rather than pretending to save
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, isConfigured } from "./affinity_accounting_supabase";

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in — changes cannot be saved yet." };
  }
  try {
    const { data, error } = await supabase.rpc(fn, args || {});
    if (error) {
      // Postgres RAISE EXCEPTION messages arrive in error.message and are
      // written to be read by the person who triggered them.
      return { ok: false, live: true, data: null, error: cleanMessage(error.message) };
    }
    return { ok: true, live: true, data, error: null };
  } catch (e) {
    return { ok: false, live: false, data: null, error: String((e && e.message) || e) };
  }
}

// Strip the Postgres framing so the user sees the sentence, not the plumbing.
function cleanMessage(msg) {
  if (!msg) return "That could not be saved.";
  return String(msg)
    .replace(/^ERROR:\s*/i, "")
    .replace(/\s*CONTEXT:[\s\S]*$/i, "")
    .replace(/^new row for relation .*/i, "That value is not allowed for this field.")
    .trim();
}

// ── Officers ────────────────────────────────────────────────────────────────
export const officerAdd = (entityId, o) => call("ea_officer_add", {
  p_entity: entityId, p_name: o.name, p_role: o.role, p_appointed: o.appointed || null,
  p_nationality: o.nationality || null, p_dob: o.dob || null, p_address: o.address || null,
});
export const officerResign = (id, resigned) =>
  call("ea_officer_resign", { p_id: id, p_resigned: resigned });
export const officerUpdate = (id, o) => call("ea_officer_update", {
  p_id: id, p_name: o.name, p_role: o.role, p_appointed: o.appointed || null,
  p_nationality: o.nationality || null, p_dob: o.dob || null, p_address: o.address || null,
});

// ── Shareholders ────────────────────────────────────────────────────────────
export const shareholderAdd = (entityId, s) => call("ea_shareholder_add", {
  p_entity: entityId, p_name: s.name, p_share_class: s.shareClass || "Ordinary",
  p_shares: s.shares ?? null, p_pct: s.pct ?? null, p_held_from: s.heldFrom || null,
});
export const shareholderRemove = (id, reason) =>
  call("ea_shareholder_remove", { p_id: id, p_reason: reason || null });

// ── Beneficial owners ───────────────────────────────────────────────────────
export const uboAdd = (entityId, u) => call("ea_ubo_add", {
  p_entity: entityId, p_name: u.name, p_role: u.role || null, p_dob: u.dob || null,
  p_nationality: u.nationality || null, p_ownership_pct: u.ownershipPct ?? null,
  p_nature_of_control: u.natureOfControl || null,
});
export const uboUpdate = (id, u) => call("ea_ubo_update", {
  p_id: id, p_name: u.name, p_role: u.role || null, p_dob: u.dob || null,
  p_nationality: u.nationality || null, p_ownership_pct: u.ownershipPct ?? null,
  p_nature_of_control: u.natureOfControl || null,
});
export const uboRemove = (id, reason) =>
  call("ea_ubo_remove", { p_id: id, p_reason: reason || null });

// ── Bank accounts and signatories ───────────────────────────────────────────
export const bankAdd = (entityId, b) => call("ea_bank_add", {
  p_entity: entityId, p_bank: b.bank, p_account_name: b.accountName || null,
  p_number: b.number || null, p_ccy: b.ccy || "GBP",
  p_signatories: b.signatories || null, p_resolution_date: b.resolutionDate || null,
});
export const bankClose = (id, closedDate) =>
  call("ea_bank_close", { p_id: id, p_closed_date: closedDate });
export const signatoryAdd = (entityId, s) => call("ea_signatory_add", {
  p_entity: entityId, p_bank_id: s.bankId || null, p_name: s.name,
  p_category: s.category || null, p_class: s.class || null, p_from_date: s.fromDate || null,
});
export const signatoryRemove = (id, toDate) =>
  call("ea_signatory_remove", { p_id: id, p_to_date: toDate });

// ── Charges ─────────────────────────────────────────────────────────────────
export const chargeAdd = (entityId, c) => call("ea_charge_add", {
  p_entity: entityId, p_chargee: c.chargee, p_charge_type: c.chargeType || null,
  p_amount: c.amount ?? null, p_ccy: c.ccy || "GBP", p_registered_date: c.registeredDate || null,
});
export const chargeSatisfy = (id, satisfiedDate) =>
  call("ea_charge_satisfy", { p_id: id, p_satisfied_date: satisfiedDate });

// ── Assets ──────────────────────────────────────────────────────────────────
export const assetAdd = (entityId, a) => call("ea_asset_add", {
  p_entity: entityId, p_description: a.description, p_acquired_date: a.acquiredDate || null,
  p_value: a.value ?? null, p_ccy: a.ccy || "GBP", p_notes: a.notes || null,
});
export const assetRevalue = (id, value, valuationDate) =>
  call("ea_asset_revalue", { p_id: id, p_value: value, p_valuation_date: valuationDate || null });

// ── Dividends ───────────────────────────────────────────────────────────────
export const dividendAdd = (entityId, d) => call("ea_dividend_add", {
  p_entity: entityId, p_share_class: d.shareClass || "Ordinary", p_name: d.name || null,
  p_requested_date: d.requestedDate || null, p_per_share: d.perShare ?? null,
  p_notes: d.notes || null,
});
export const dividendPay = (id, paidDate) =>
  call("ea_dividend_pay", { p_id: id, p_paid_date: paidDate });

// ── Meetings, addresses, notes, safe custody, services ──────────────────────
export const meetingAdd = (entityId, m) => call("ea_meeting_add", {
  p_entity: entityId, p_meeting_type: m.meetingType || "Board meeting",
  p_meeting_date: m.meetingDate, p_notes: m.notes || null,
});
export const addressAdd = (entityId, a) => call("ea_address_add", {
  p_entity: entityId, p_address_type: a.addressType, p_address: a.address,
  p_from_date: a.fromDate || null,
});
export const fileNoteAdd = (entityId, note, noteDate) =>
  call("ea_file_note_add", { p_entity: entityId, p_note: note, p_note_date: noteDate || null });
export const safeItemAdd = (entityId, s) => call("ea_safe_item_add", {
  p_entity: entityId, p_item: s.item, p_deposited_date: s.depositedDate || null,
  p_authorised_by: s.authorisedBy || null,
});
export const safeItemRetrieve = (id, retrievedDate, authorisedBy) =>
  call("ea_safe_item_retrieve", { p_id: id, p_retrieved_date: retrievedDate,
                                  p_authorised_by: authorisedBy || null });
export const serviceSet = (entityId, service, active) =>
  call("ea_service_set", { p_entity: entityId, p_service: service, p_active: !!active });

// Which registers can be written to. The UI uses this to decide whether a form
// is offered at all, so a button is never shown that cannot work.
export const WRITABLE_REGISTERS = [
  "officers", "shareholders", "ubos", "bank", "signatories", "charges",
  "assets", "dividends", "meetings", "addresses", "notes", "safe", "services",
];
export const canWrite = (register) => isConfigured && WRITABLE_REGISTERS.includes(register);
