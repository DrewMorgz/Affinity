// src/affinity_invoicing_api.js
import { supabase, isConfigured } from "./affinity_accounting_supabase";
export async function feeInvoices() {
  if (!isConfigured) return { data: null, error: new Error("not configured") };
  return supabase.rpc("fee_invoices", {});
}
