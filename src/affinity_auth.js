// src/affinity_auth.js
// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION — Microsoft Entra ID via Supabase
//
// Replaces the first-name-and-password check, whose credentials were compiled
// into the public JavaScript bundle and readable by anyone who viewed source.
//
// Staff sign in with the Microsoft 365 account they already have. Entra
// handles MFA and conditional access, and removing a leaver in Entra removes
// their access here immediately.
//
// WHAT IT NEEDS TO GO LIVE (IT, once):
//   1. Register an application in Entra ID.
//   2. Add the Supabase callback as a redirect URI:
//        https://<project>.supabase.co/auth/v1/callback
//   3. In Supabase → Authentication → Providers → Azure, enable it and paste
//      the Application (client) ID, client secret and tenant ID.
// No code change is needed at that point — isAuthConfigured() starts returning
// true and the Microsoft button starts working.
//
// Until then the app runs unauthenticated: modules show preview data and the
// database stays locked, which is the safe state.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, isConfigured } from "./affinity_accounting_supabase";

export const isAuthConfigured = () => isConfigured;

// Start the Microsoft sign-in. Supabase redirects to Entra and back.
export async function signInWithMicrosoft() {
  if (!isConfigured) {
    return { error: { message: "Sign-in is not configured yet. Ask IT to enable the Azure provider in Supabase." } };
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      scopes: "openid profile email offline_access",
      redirectTo: window.location.origin,
    },
  });
  return { data, error };
}

export async function signOut() {
  if (!isConfigured) return { error: null };
  return supabase.auth.signOut();
}

// Current session, or null. Used on load to decide whether to show the app.
export async function getSession() {
  if (!isConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data ? data.session : null;
  } catch (e) { return null; }
}

export function onAuthChange(cb) {
  if (!isConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session));
  return () => { if (data && data.subscription) data.subscription.unsubscribe(); };
}

// Map the signed-in Entra identity onto a Core staff record.
//
// Matching is on work email, but the two do not always agree. Staff records
// hold firstname.surname@affinityco.com while real Entra accounts may be
// shorter or use a known-as name — andy@affinityco.com against a record for
// andrew.morgan@affinityco.com, for instance. So matching tries, in order:
//   1. the email exactly
//   2. the local part against the record's local part
//   3. firstname. prefix (andrew.morgan@ for a record named Andrew)
//   4. the display name from Entra against the record's name
//
// If none match, the user still gets in but on the LEAST privileged role, so a
// matching gap can never hand out System Admin by accident. It is logged so
// the mismatch can be corrected rather than silently tolerated.
export function identityFromSession(session, staff) {
  if (!session || !session.user) return null;
  const u = session.user;
  const email = (u.email || "").toLowerCase();
  const claims = u.user_metadata || {};
  const displayName = claims.full_name || claims.name || u.email || "Unknown user";

  const list  = staff || [];
  const local = email.split("@")[0];
  const norm  = (v) => String(v || "").toLowerCase().replace(/[^a-z]/g, "");

  const match =
    // 1. exact email
    list.find((s) => (s.email || "").toLowerCase() === email) ||
    // 2. same local part
    list.find((s) => (s.email || "").toLowerCase().split("@")[0] === local) ||
    // 3. firstname. prefix
    list.find((s) => (s.firstName || "") &&
                     local === String(s.firstName).toLowerCase()) ||
    list.find((s) => (s.firstName || "") &&
                     local.startsWith(String(s.firstName).toLowerCase() + ".")) ||
    // 4. the Entra display name against the record name, ignoring punctuation
    list.find((s) => norm(s.name) && norm(s.name) === norm(displayName)) ||
    // 5. surname in the local part with a matching first initial — catches
    //    a.morgan@ and andy.morgan@ against a record for Andrew Morgan
    list.find((s) => {
      const parts = String(s.name || "").toLowerCase().split(/\s+/);
      if (parts.length < 2) return false;
      const surname = parts[parts.length - 1];
      const initial = parts[0][0];
      return surname.length > 2 && local.includes(surname) && local[0] === initial;
    });

  if (!match && typeof console !== "undefined" && console.warn) {
    // Worth surfacing: the person is in, but on the least privileged role,
    // which will look like missing permissions rather than a bad match.
    console.warn("Signed in as " + email + " but no Core staff record matched. "
      + "Role defaulted to Administrator — add the email to the staff record in System admin.");
  }

  return {
    id: match ? match.id : null,
    name: match ? match.name : displayName,
    email,
    role: match ? match.role : "Administrator",   // least privilege on no match
    matched: !!match,
  };
}
