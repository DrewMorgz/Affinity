// src/affinity_consolidation_fx_api.js
// ─────────────────────────────────────────────────────────────────────────────
// TRANSLATION AND NON-CONTROLLING INTERESTS
//
// consolidated_cta and consolidated_nci already existed in the consolidation
// engine. The consolidation module's own header says it covers them; the code
// never called them, so they were unreachable.
//
// Both matter for a group like this one — eight companies across six
// jurisdictions and currencies:
//
//   CTA is the cumulative translation adjustment: the movement arising purely
//   from retranslating a subsidiary's net assets at a different rate. It is
//   not a profit or a loss on trading and must not be read as one, which is
//   why the interface shows the opening and closing rates alongside it.
//
//   NCI is the share of net assets not owned by the group. Reporting a group
//   figure without splitting out the minority share overstates what belongs
//   to the parent.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, isConfigured } from "./affinity_accounting_supabase";

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in \u2014 the database cannot be reached." };
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

// Opening and closing dates, because CTA is a movement between two rates
// rather than a position at one.
export const consolidatedCta = (groupId, openingDate, closingDate) =>
  call("consolidated_cta", { p_group: groupId, p_opening_date: openingDate,
                             p_closing_date: closingDate });

export const consolidatedNci = (groupId, rateDate) =>
  call("consolidated_nci", { p_group: groupId, p_rate_date: rateDate });

export const consolidatedSummary = (groupId, rateDate) =>
  call("consolidated_summary", { p_group_id: groupId, p_rate_date: rateDate });

export const canRead = () => isConfigured;
