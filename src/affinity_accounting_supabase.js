// src/affinity_accounting_supabase.js
// Env-guarded Supabase client for the accounting module. Safe when unset:
// if the env vars are absent, isConfigured is false and the module falls back
// to preview data instead of crashing. Set in Netlify + local .env:
//   REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY
import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);
export const supabase = isConfigured ? createClient(url, key) : null;
