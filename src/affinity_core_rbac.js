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
