// src/affinity_core_reporting_v2.jsx
// ─────────────────────────────────────────────────────────────────────────────
// AFFINITY CORE — REPORTING
//
// Reporting is the report builder. Nothing else.
//
// This module previously carried a set of pre-built views — executive overview,
// report library, compliance, entity portfolio, operations, KPIs. They have been
// removed deliberately: if reporting is fully customisable there is no reason to
// guess at what a "typical" report looks like and take up the contents page with
// it. People build what they need, name it, and re-run it.
//
// Accounts reporting (revenue, WIP, aged debt, P&L, budgets) lives in
// Affinity Accounting → Financial Reporting, reported off the ledger.
// ─────────────────────────────────────────────────────────────────────────────
import ReportBuilder from "./affinity_core_report_builder";

export default function AffinityReporting({ onNav, role = "system_admin", userName = "" }) {
  return (
    <ReportBuilder
      isAdmin={role === "system_admin"}
      role={role}
      userName={userName}
      onNav={onNav}
    />
  );
}
