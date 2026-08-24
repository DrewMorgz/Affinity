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
// Matching is on work email. Entra group-to-role mapping comes next: until the
// groups exist, everyone lands on the least-privileged role rather than the
// most, so a mapping gap cannot hand out System Admin by accident.
export function identityFromSession(session, staff) {
  if (!session || !session.user) return null;
  const u = session.user;
  const email = (u.email || "").toLowerCase();
  const claims = u.user_metadata || {};
  const displayName = claims.full_name || claims.name || u.email || "Unknown user";

  const match = (staff || []).find(
    (s) => (s.email || "").toLowerCase() === email
  ) || (staff || []).find(
    (s) => email.startsWith((s.firstName || "").toLowerCase() + ".")
  );

  return {
    id: match ? match.id : null,
    name: match ? match.name : displayName,
    email,
    role: match ? match.role : "Administrator",   // least privilege on no match
    matched: !!match,
  };
}
