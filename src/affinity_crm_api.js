// src/affinity_crm_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });
// ── CRM pipeline (db/084) ───────────────────────────────────────────────────
// Prospects and their contact log had no table until db/084.
//
// Stages are validated against a list — Enquiry, Proposal Sent, KYC Arriving,
// Fees Paid, Lost — so a typo cannot create a stage nothing reports on.
export const crmProspects = (openOnly) =>
  call("crm_prospects", { p_open_only: openOnly !== false });
export const crmInteractions = (prospectId, limit) =>
  call("crm_interactions", { p_prospect: prospectId ?? null, p_limit: limit || 200 });
export const crmProspectAdd = (p) => call("crm_prospect_add", { p });
// Marking a prospect lost requires a reason — why we lost it is the useful
// part of a lost prospect.
export const crmStageSet = (id, stage, lostReason) =>
  call("crm_stage_set", { p_id: id, p_stage: stage, p_lost_reason: lostReason || null });
export const crmInteractionAdd = (i) => call("crm_interaction_add", {
  p_prospect: i.prospectId, p_date: i.date, p_type: i.type, p_note: i.note || null,
  p_next_action: i.nextAction || null, p_next_due: i.nextDue || null,
});
// Converts a won prospect into an onboarding case and links the two, so the
// pipeline and the onboarding file are one story rather than two records of
// the same client.
export const crmProspectConvert = (id) => call("crm_prospect_convert", { p_id: id });
