// src/lib/supabaseClient.js
// Single Supabase client for Affinity Core. Reads CRA env vars at build time.
// Set these in Netlify (Site settings > Environment) and in a local .env:
//   REACT_APP_SUPABASE_URL=https://<your-project>.supabase.co
//   REACT_APP_SUPABASE_ANON_KEY=<anon public key>
import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// true only when both env vars are present — screens use this to show a setup state
export const isConfigured = Boolean(url && anonKey);

// when not configured, export null so imports don't crash the build
export const supabase = isConfigured ? createClient(url, anonKey) : null;
