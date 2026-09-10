// src/affinity_compliance_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
const off = () => ({ data: null, error: new Error("not configured") });

export async function compReviews()        { if (!isConfigured) return off(); return supabase.rpc("comp_reviews", {}); }
export async function compRegObligations() { if (!isConfigured) return off(); return supabase.rpc("comp_reg_obligations", {}); }
export async function compBreaches()       { if (!isConfigured) return off(); return supabase.rpc("comp_breaches", {}); }
export async function compTraining()       { if (!isConfigured) return off(); return supabase.rpc("comp_training", {}); }


// ── Periodic client reviews (db/084) ────────────────────────────────────────
// These had no table at all until db/084; the RPC was called, failed, and the
// screen fell back to demo data. The store now exists.
//
// Every client appears in comp_reviews, whether reviewed or not — a client
// that has NEVER been reviewed is the one that matters, and it would be
// invisible in a list of reviews.
//
// The review interval comes from what Compliance recorded per risk rating, not
// a hardcoded period. Where no interval is recorded, no due date can be
// calculated and the row says so rather than showing a made-up date.
export const reviewFrequencySet = (risk, months, location, note) =>
  call("review_frequency_set", { p_risk: risk, p_months: months,
                                 p_location: location || null, p_note: note || null });
export const reviewStart = (entityId, reviewDate) =>
  call("review_start", { p_entity: entityId, p_review_date: reviewDate || null });
// Sanctions and PEP screening are both required, and a review that refreshed
// neither the CDD nor the source of wealth is refused — a partial review on
// file reads as a completed one.
export const reviewComplete = (r) => call("review_complete", {
  p_id: r.id, p_cdd: !!r.cdd, p_sow: !!r.sourceOfWealth,
  p_sanctions: !!r.sanctions, p_pep: !!r.pep,
  p_structure: !!r.structure, p_activity: !!r.activity,
  p_risk_after: r.riskAfter, p_findings: r.findings || null,
  p_actions: r.actions || null,
});
// Refused to whoever carried out the review.
export const reviewApprove = (id) => call("review_approve", { p_id: id });


// The wrappers above already existed from db/084 and were simply unreachable —
// no screen called them. Only this constant is new: the checks a review must
// record, with the two that are mandatory marked, so the screen and the
// database agree about which they are.
export const REVIEW_CHECKS = [
  { k: "cdd",           label: "CDD refreshed" },
  { k: "sourceOfWealth", label: "Source of wealth revisited" },
  { k: "sanctions",     label: "Sanctions screened", required: true },
  { k: "pep",           label: "PEP screened", required: true },
  { k: "structure",     label: "Structure confirmed" },
  { k: "activity",      label: "Activity consistent with expectations" },
];
