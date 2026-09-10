// src/affinity_dms_api.js
// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT MANAGEMENT
//
// Core IS the document management system. It holds the filing structure — 17
// categories from Incorporation through to Archive — the retention policy per
// category, and retention rules that vary by data class and jurisdiction.
//
// This file existed as nothing. The functions below were all built in the
// database and had either no API wrapper or no screen calling one, so filing a
// document worked and nothing else did: no search, no reclassify, no delete
// with a retention check, no folder management, and no way to see the documents
// attached to an invoice or a filing.
//
// That was found because the user guide claimed Core was not a DMS, which was
// wrong, and checking the claim exposed the gap.
//
// WHAT IS STILL MISSING, and it is not this layer: there is nowhere for the file
// itself — no upload, no storage. document_link records the filename and a reference; the bytes
// need storage. That is a decision about where — and given client data must
// stay in Affinity's environment, Azure Blob in Affinity's own subscription is
// the answer rather than a third party.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, isConfigured } from "./affinity_accounting_supabase";

async function call(fn, args) {
  if (!isConfigured) {
    return { ok: false, live: false, data: null,
             error: "Not signed in — the document register cannot be reached." };
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

// ── Reading ─────────────────────────────────────────────────────────────────
// doc_list is NOT wrapped here. It duplicates document_list, which resolves the
// category name and the retention state as well, so the screen uses that one.
// An unused wrapper is exactly how the problem this file fixes began: a
// function with an API wrapper and no caller looks wired and is not.
//
// Across everything, with the category name resolved and retention shown.
export const documentList = (entityId, category) =>
  call("document_list", { p_entity: entityId ?? null, p_category: category ?? null });

// Documents attached to a specific thing — an invoice, a filing, a meeting.
// Without this, a document filed against an invoice can be recorded and never
// retrieved from the invoice.
export const objectDocuments = (objectType, objectId) =>
  call("get_object_documents", { p_object_type: objectType, p_object_id: objectId });

// Free-text search within an entity's documents.
export const searchDocuments = (entityId, query) =>
  call("search_documents", { p_entity: entityId ?? null, p_query: query });

// ── Filing ──────────────────────────────────────────────────────────────────
// Refused without a folder: "an unfiled document cannot be found again".
// The retention date is derived from the category's policy, so it is not asked
// for — it is a consequence of where the document is filed.
export const docFile = (d) => call("doc_file", {
  p_entity: d.entityId, p_category: d.category, p_filename: d.filename,
  p_object_type: d.objectType || "entity", p_object_id: d.objectId ?? d.entityId,
  p_ref: d.ref || null,
});

// Moving a document between folders. Requires a reason, because the folder
// determines the retention period — reclassifying changes how long the
// document must be kept.
export const docReclassify = (id, category, reason) =>
  call("doc_reclassify", { p_id: id, p_category: category, p_reason: reason });

// Deleting. Requires a reason. Refused while the document is within its
// retention period unless the override is passed deliberately.
export const docDelete = (id, reason, overrideRetention) =>
  call("doc_delete", { p_id: id, p_reason: reason,
                       p_override_retention: overrideRetention === true });

// ── Folders ─────────────────────────────────────────────────────────────────
// A new folder needs its retention period and the basis for it. A folder with
// no retention policy produces documents nobody knows when to destroy.
export const dmsCategoryAdd = (name, retainYears, basis) =>
  call("dms_category_add", { p_name: name, p_retain_years: retainYears,
                             p_basis: basis });

export const OBJECT_TYPES = [
  { id: "entity",            label: "The entity itself" },
  { id: "invoice",           label: "An invoice" },
  { id: "statutory_filing",  label: "A statutory filing" },
  { id: "entity_meeting",    label: "A meeting" },
  { id: "onboarding_case",   label: "An onboarding case" },
  { id: "periodic_review",   label: "A periodic review" },
  { id: "cdd_item",          label: "A CDD item" },
];

export const canWrite = () => isConfigured;
