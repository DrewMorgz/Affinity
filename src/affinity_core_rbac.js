// src/affinity_core_rbac.js
// Front-end role-based access control for Affinity Core.
//
// IMPORTANT: this is UI-layer enforcement only — it hides/disables what a role
// shouldn't see or do. It is NOT a security boundary on its own. Real security
// comes when the data backend (Supabase) enforces the same rules per request,
// keyed off the authenticated identity (auth.uid()). Until then, treat this as
// usability + intent, not protection.
//
// Roles come from a single claim on the logged-in user (user.role). Today that
// is set at login; when Supabase Auth / Entra is wired in, the same claim is
// read from the token and nothing downstream changes.

export const ROLES = ["system_admin", "director", "manager", "admin"];
export const ROLE_LABELS = {
  system_admin: "System Admin",
  director: "Director",
  manager: "Manager",
  admin: "Admin",
};

// Actions: V=View  C=Create  E=Edit  D=Delete  A=Approve
const ALL = ["V", "C", "E", "D", "A"];

// Baseline permission set per role, applied to every module unless overridden.
const BASELINE = {
  system_admin: ALL,
  director:     ["V", "C", "E", "A"],
  manager:      ["V", "C", "E"],
  admin:        ["V", "C", "E"],
};

// Per-module overrides enforce the security document's hard rules:
//  - User management / System admin: System Admin only
//  - Document deletion: System Admin + Director only
//  - Audit log: System Admin + Director (view), no one else
//  - Approvals concentrated with Director and above
// An explicit [] means "no access". A role absent from an override falls back
// to BASELINE.
const OVERRIDES = {
  // System administration & user management — System Admin only
  system:        { director: [], manager: [], admin: [] },

  // Audit log — System Admin (full) + Director (view); hidden from others
  audit:         { director: ["V"], manager: [], admin: [] },

  // Documents — deletion limited to System Admin + Director
  documents:     { director: ["V", "C", "E", "D", "A"] /* others = baseline (no D) */ },

  // Client portal administration — Director can view, Manager/Admin view only
  client_portal: { director: ["V", "C", "E", "A"], manager: ["V"], admin: ["V"] },

  // Reporting / insights — Admin is view-only on cross-firm reporting
  reporting:     { admin: ["V"] },
  acc_report:    { admin: ["V"] },

  // Governance / procedures — Director approves; Admin can view/create only
  procedures:    { admin: ["V", "C"] },
  generate:      { admin: ["V", "C"] },
};

// Modules that exist but are low-stakes / everyone-access (kept explicit so the
// nav never hides them unexpectedly).
const OPEN = ["dashboard", "tasks", "notifications", "feedback", "intranet", "chatbot"];

export function permsFor(role, moduleId) {
  if (OPEN.includes(moduleId)) return ["V", "C", "E"]; // basic interaction for all roles
  const o = OVERRIDES[moduleId];
  if (o && Object.prototype.hasOwnProperty.call(o, role)) return o[role];
  return BASELINE[role] || [];
}

// Can this role perform a specific action on a module?  can('director','documents','D')
export function can(role, moduleId, action) {
  return permsFor(role, moduleId).includes(action);
}

// Can this role open a module at all? (used to filter the nav)
export function canAccessModule(role, moduleId) {
  return permsFor(role, moduleId).length > 0;
}

// Convenience flags for common gates
export const isSystemAdmin = (role) => role === "system_admin";
export const canDelete  = (role, moduleId) => can(role, moduleId, "D");
export const canApprove = (role, moduleId) => can(role, moduleId, "A");

// Map a person's job-title (USERS[].role) to one of the four RBAC roles.
// Interim until Entra app roles drive this directly. Order matters: check
// "super admin" before the director/officer keywords.
export function deriveRbacRole(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("super admin")) return "system_admin";
  if (t.includes("director") || t.includes("cfo") || t.includes("coo") || t.includes("ceo")) return "director";
  if (t.includes("manager")) return "manager";
  return "admin";
}

// ──────────────────────────────────────────────────────────────────────────
// INTERNAL COMPANY ACCESS — Affinity's own group companies
//
// Affinity's group companies hold the firm's own statutory records, accounts,
// bank mandates and payroll. They are segregated from the client portfolio and
// from each other: access is granted per company, not as a single "internal"
// switch. A Malta administrator may need Affinity (Malta) Limited without
// seeing Affinity Group Limited's consolidated position.
//
// Granted by role, then overridden per user where an individual needs more or
// less than their role implies. A user's override replaces the role default.
//
// UI-layer intent only until Entra + row-level security enforce it server-side.
// ──────────────────────────────────────────────────────────────────────────

export const INTERNAL_ENTITIES = [
  { ref:"AFG-000", name:"Affinity Group Limited",         jur:"Isle of Man",    note:"Group holding / consolidated position" },
  { ref:"AFG-IOM", name:"Affinity (Isle of Man) Limited", jur:"Isle of Man",    note:"Licensed CSP" },
  { ref:"AFG-MLT", name:"Affinity (Malta) Limited",       jur:"Malta",          note:"Corporate services" },
  { ref:"AFG-CYM", name:"Affinity (Cayman) Limited",      jur:"Cayman Islands", note:"Corporate services" },
  { ref:"AFG-UK",  name:"Affinity (UK) Limited",          jur:"United Kingdom", note:"Corporate services" },
  { ref:"AFG-CYP", name:"Affinity (Cyprus) Limited",      jur:"Cyprus",         note:"Corporate services" },
  { ref:"AFG-SD",  name:"Affinity South Dakota, LLC",     jur:"United States",  note:"US trust services" },
  { ref:"AFG-FL",  name:"Affinity South Florida, LLC",    jur:"United States",  note:"US corporate services" },
];
export const INTERNAL_REFS = INTERNAL_ENTITIES.map((e) => e.ref);

// Role defaults. Deliberately restrictive: only Super Admin sees everything by
// default. Everyone else is granted specific companies by an administrator.
export const INTERNAL_ACCESS = {
  system_admin: INTERNAL_ENTITIES.map((e) => e.ref),
  director:     ["AFG-000", "AFG-IOM"],
  manager:      [],
  admin:        [],
};

// Which internal companies may this role/user see? userRefs (if present) wins.
export function internalRefsFor(role, userRefs) {
  if (Array.isArray(userRefs)) return userRefs;
  return INTERNAL_ACCESS[role] || [];
}

export function canAccessInternalEntity(role, ref, userRefs) {
  return internalRefsFor(role, userRefs).indexOf(ref) > -1;
}

// Filter a portfolio: client entities always pass, internal ones are checked
// individually. An entity with no class set is treated as a client entity.
export function filterEntitiesByAccess(entities, role, userRefs) {
  const allowed = internalRefsFor(role, userRefs);
  return (entities || []).filter((e) => {
    if (!e) return false;
    const cls = e.entityClass || e.entity_class;
    if (cls !== "group") return true;
    return allowed.indexOf(e.ref) > -1;
  });
}

// ──────────────────────────────────────────────────────────────────────────
// REPORTING SCOPE
// Reporting on the client portfolio is open to staff at all levels. Reporting
// that includes Affinity's own companies follows the same per-company grants
// above, so segregation cannot be sidestepped by running a report.
// ──────────────────────────────────────────────────────────────────────────
export function reportingInternalRefs(role, userRefs) {
  return internalRefsFor(role, userRefs);
}
