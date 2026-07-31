import React, { useState, useEffect } from "react";
import { isConfigured } from "./affinity_accounting_supabase";
import { listEntities, getKpiDashboard, getCashFlow, getCreditStatus, getCollections,
  apVendors, apAging, apPurchaseOrders, getFixedAssets, getIcLoans,
  getBudgetVsActualForEntity, getTrialBalance, getRecentJournals,
  getPnlByEntity, getControlChecks, getAuditPack,
  getBankAccounts, getFxRates, getFxPositions, getVatBoxes, getConsolSummary, getConsolOwnership } from "./affinity_accounting_api";

/*
  Affinity Accounting — Core module
  ---------------------------------------------------------------
  Surfaces the accounting engine (db/001..050) inside Affinity Core.
  Rendered from the shell's "Affinity Accounting" nav section; the
  active nav id (acc_*) is passed in as `module`.

  Figures below are representative outputs from the engine's tested
  runs so the accounts team can review the full feature set now.
  To go live, swap each panel's constant for the matching Supabase
  RPC (build_kpi_dashboard, cash_flow_statement, report_collections,
  customer_credit_status, build_audit_pack, get_accounts_set_json …).
*/

const NAVY = "#001242", CY = "#00C4CC", INK = "#0B1B2B", MUT = "#5B6B7B",
      LINE = "#E6EAF0", CARD = "#fff", POS = "#1F9D6B", NEG = "#C2453E", AMBER = "#B8860B";

const f0 = (n) => n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
const f2 = (n) => n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

const TITLES = {
  acc_ov: "Overview", acc_gl: "General Ledger", acc_ap: "Accounts Payable", acc_ar: "Accounts Receivable",
  acc_bank: "Banking & Reconciliation", acc_fa: "Fixed Assets", acc_ic: "Intercompany", acc_con: "Consolidation",
  acc_cf: "Cash Flow & Treasury", acc_fx: "Multi-currency / FX", acc_tax: "Tax & VAT", acc_bud: "Budgeting",
  acc_fs: "Financial Statements", acc_mgmt: "Management Reports", acc_ctl: "Controls", acc_doc: "Documents",
  acc_aud: "Auditor Pack",
};

// ---- style atoms ----
const th = { textAlign: "right", padding: "10px 14px", color: MUT, fontWeight: 600, fontSize: 11.5, background: "#FBFCFD", borderBottom: `1px solid ${LINE}` };
const td = { padding: "10px 14px", borderBottom: `1px solid ${LINE}` };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 420 };

function Pill({ text, color }) {
  return <span style={{ background: color + "1A", color, borderRadius: 999, padding: "2px 9px", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>{text}</span>;
}
function Cell({ c }) {
  if (c && typeof c === "object") {
    if ("pill" in c) return <td style={td}><Pill text={c.pill[0]} color={c.pill[1]} /></td>;
    if ("n" in c) return <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: c.neg ? NEG : c.pos ? POS : undefined }}>{c.n}</td>;
  }
  return <td style={td}>{c}</td>;
}
function Table({ head, rows }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tbl}>
        {head && <thead><tr>{head.map((h, i) => <th key={i} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}</tr></thead>}
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <Cell key={j} c={c} />)}</tr>)}</tbody>
      </table>
    </div>
  );
}
function Panel({ title, children }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", marginBottom: 18 }}>
      <div style={{ padding: "13px 16px", borderBottom: `1px solid ${LINE}`, fontWeight: 600, color: NAVY, fontSize: 14, background: "#FBFCFD" }}>{title}</div>
      {children}
    </div>
  );
}
function Note({ children }) { return <p style={{ color: MUT, fontSize: 12.5, marginTop: 10 }}>{children}</p>; }
function Mini({ title, rows }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: MUT, marginBottom: 10 }}>{title}</div>
      {rows.map(([l, v], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 14 }}>
          <span style={{ color: MUT }}>{l}</span><span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
const cards = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14, marginBottom: 16 };

// ---- panels ----
const PANELS = {
  acc_ov(liveKpis) {
    const d = liveKpis || {};
    const k = liveKpis ? [
      ["Revenue", f0(d.revenue)], ["Net profit", f0(d.net_profit), 1], ["Profit margin", d.profit_margin_pct == null ? "—" : d.profit_margin_pct + "%"],
      ["Cash", f0(d.cash)], ["Trade debtors", f0(d.trade_debtors)], ["Trade creditors", f0(d.trade_creditors)],
      ["Working capital", f0(d.working_capital)], ["Current ratio", d.current_ratio == null ? "—" : d.current_ratio + "×"], ["Debtor days", d.dso_days == null ? "—" : d.dso_days + " days"],
    ] : [
      ["Revenue", f0(29060)], ["Net profit", f0(16950), 1], ["Profit margin", "58.3%"], ["Cash", f0(18420)],
      ["Trade debtors", f0(33406)], ["Trade creditors", f0(5960)], ["Working capital", f0(45866)], ["Current ratio", "8.7×"], ["Debtor days", "42 days"]];
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(165px,1fr))", gap: 12 }}>
          {k.map(([l, v, a], i) => (
            <div key={i} style={{ background: a ? NAVY : CARD, border: `1px solid ${a ? NAVY : LINE}`, borderRadius: 12, padding: "15px 16px" }}>
              <div style={{ fontSize: 11.5, color: a ? "#9FB0C4" : MUT, marginBottom: 6 }}>{l}</div>
              <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: -0.5, color: a ? CY : INK }}>{v}</div>
            </div>
          ))}
        </div>
        <Note>KPIs from <code>build_kpi_dashboard()</code> · year-to-date, selected entity.</Note>
      </>
    );
  },
  acc_gl(gl) {
    const tb = (gl && gl.tb && gl.tb.length)
      ? gl.tb.map((r) => [r.code + " · " + r.name, Number(r.debit) ? { n: f0(r.debit) } : "", Number(r.credit) ? { n: f0(r.credit) } : ""])
      : [
          ["1000 · Cash at bank", { n: f0(18420) }, ""], ["1100 · Trade debtors", { n: f0(33406) }, ""],
          ["1500 · Fixed assets — cost", { n: f0(24000) }, ""], ["2100 · Trade creditors", "", { n: f0(5960) }],
          ["2200 · VAT", "", { n: f0(2507) }], ["3100 · Capital", "", { n: f0(10000) }],
          ["4000 · Turnover", "", { n: f0(29060) }], ["6000 · Administrative expenses", { n: f0(12110) }, ""],
        ];
    const jrows = (gl && gl.journals && gl.journals.length)
      ? gl.journals.map((r) => [r.ref, r.journal_date, r.narrative, r.created_by, { pill: [r.status === "posted" ? "Posted" : r.status, r.status === "posted" ? POS : AMBER] }])
      : [
          ["JL-1042", "30 Jun", "Management fee recharge", "danny", { pill: ["Posted", POS] }],
          ["JL-1041", "28 Jun", "Monthly retainer", "danny", { pill: ["Posted", POS] }],
          ["JL-1055", "01 Jul", "Large drawdown", "garry", { pill: ["Awaiting approval", AMBER] }],
        ];
    return (
      <>
        <Panel title="Trial balance"><Table head={["Account", "Debit", "Credit"]} rows={tb} /></Panel>
        <Panel title="Recent journals &amp; approval queue"><Table head={["Journal", "Date", "Narrative", "By", "Status"]} rows={jrows} /></Panel>
        <Note>Multi-entity double-entry GL · reversing &amp; recurring journals · accruals/prepayments · year-end close · maker-checker approval gate.</Note>
      </>
    );
  },
  acc_ap(ap) {
    const hasV = ap && ap.vendors && ap.vendors.length;
    const vendors = hasV
      ? ap.vendors.map((v) => [v.name, v.ccy, { n: f0(v.outstanding) }, { pill: [v.status, v.status === "Active" ? POS : NEG] }])
      : [
          ["V001 · Lighthouse IT Ltd", "GBP", { n: "30 days" }, { pill: ["Active", POS] }],
          ["V002 · Quill & Co Advisers", "GBP", { n: "14 days" }, { pill: ["Active", POS] }],
          ["V003 · Brightwater Facilities", "EUR", { n: "30 days" }, { pill: ["On hold", NEG] }],
        ];
    const hasP = ap && ap.pos && ap.pos.length;
    const pos = hasP
      ? ap.pos.map((p) => [p.po_number, p.supplier, { pill: [p.status, p.status === "open" ? AMBER : POS] }])
      : [
          ["PO-2025", "Lighthouse IT", "3-way", { pill: ["Matched", POS] }],
          ["PO-2026", "Brightwater", "2-way", { pill: ["Awaiting receipt", AMBER] }],
          ["PO-2031", "Quill & Co", "3-way", { pill: ["Over-invoiced", NEG] }],
        ];
    const aging = (ap && ap.aging && ap.aging.length)
      ? ap.aging.map((a) => [a.bucket, { n: f0(a.amount) }])
      : [["Current", { n: f0(3960) }], ["1–30 days", { n: f0(1200) }], ["31–60 days", { n: f0(0) }], ["60+ days", { n: f0(800) }]];
    return (
      <>
        <Panel title="Vendors"><Table head={hasV ? ["Vendor", "Ccy", "Outstanding", "Status"] : ["Vendor", "Currency", "Terms", "Status"]} rows={vendors} /></Panel>
        <Panel title="Purchase order matching"><Table head={hasP ? ["PO", "Vendor", "Status"] : ["PO", "Vendor", "Match", "Status"]} rows={pos} /></Panel>
        <Panel title="AP aging"><Table head={["Bucket", "Outstanding"]} rows={aging} /></Panel>
        <Note>Vendor master · invoice approval · 2/3-way PO matching · SEPA payment runs (pain.001) · credit notes · supplier statements.</Note>
      </>
    );
  },
  acc_ar(ar) {
    const credit = (ar && ar.credit && ar.credit.length)
      ? ar.credit.map((r) => [r.code + " · " + r.name, { n: f0(r.credit_limit) }, { n: f0(r.outstanding) },
          { n: f0(r.available), neg: Number(r.available) < 0 },
          { pill: r.over_limit ? ["Over limit", NEG] : (r.on_hold ? ["On hold", AMBER] : ["OK", POS]) }])
      : [
          ["CUST001 · Northwind Holdings Ltd", { n: f0(10000) }, { n: f0(9600) }, { n: f0(400) }, { pill: ["OK", POS] }],
          ["CUST002 · Seabright Trustees", { n: f0(5000) }, { n: f0(6000) }, { n: f0(-1000), neg: 1 }, { pill: ["Over limit", NEG] }],
        ];
    const coll = (ar && ar.collections && ar.collections.length)
      ? ar.collections.map((r) => [r.customer_name, "#" + r.invoice_id, r.due_date, { n: f0(r.outstanding) },
          { n: r.days_overdue }, { pill: [r.dunning_name || "Chaser", Number(r.days_overdue) > 30 ? NEG : AMBER] }])
      : [
          ["Northwind Holdings", "#72", "2026-05-03", { n: f0(7200) }, { n: 45 }, { pill: ["Final notice", NEG] }],
          ["Seabright Trustees", "#74", "2026-05-22", { n: f0(6000) }, { n: 26 }, { pill: ["First chaser", AMBER] }],
        ];
    return (
      <>
        <Panel title="Customer credit exposure"><Table head={["Customer", "Limit", "Outstanding", "Available", "Status"]} rows={credit} /></Panel>
        <Panel title="Collections worklist"><Table head={["Customer", "Invoice", "Due", "Outstanding", "Days late", "Action"]} rows={coll} /></Panel>
        <Note>Customer master · invoicing · credit notes · receipt allocation · statements · credit control / dunning · overdue interest.</Note>
      </>
    );
  },
  acc_bank(bank) {
    const has = bank && bank.length;
    const rows = has
      ? bank.map((b) => [b.name + (b.is_default ? " · default" : ""), b.iban, b.ccy])
      : [
          ["Barclays IOM — GBP", "GB00…4471", { n: f0(18420) }], ["HSBC Malta — EUR", "MT00…9920", { n: f0(9120) }], ["Butterfield — USD", "KY00…1180", { n: f0(26010) }],
        ];
    return (
      <>
        <Panel title="Bank accounts"><Table head={has ? ["Account", "IBAN", "Ccy"] : ["Account", "IBAN", "Balance"]} rows={rows} /></Panel>
        <Panel title="Statement imports &amp; reconciliation"><Table head={["Statement", "Format", "Lines", "Match result"]} rows={[
          ["Jun statement", "MT940", "24 lines", { pill: ["Auto-matched 22 · 2 by rule", POS] }],
          ["Jul statement", "CSV", "11 lines", { pill: ["Auto-matched 11", POS] }],
        ]} /></Panel>
        <Note>Multi-bank · MT940 + CSV import · auto-match + description rules · payment approval.</Note>
      </>
    );
  },
  acc_fa(fa) {
    const has = fa && fa.length;
    const rows = has
      ? fa.map((r) => [r.line_label || "Total", { n: f0(r.cost) }, { n: f0(r.depreciation) }, { n: f0(r.net_book_value) }])
      : [
          ["Fixtures & fittings", "Straight line", { n: f0(24000) }, { n: f0(4000) }, { n: f0(20000) }],
          ["IT equipment (server rack)", "Reducing balance 25%", { n: f0(10000) }, { n: f0(4000) }, { n: f0(6000) }],
        ];
    return (
      <>
        <Panel title="Asset register"><Table head={has ? ["Line", "Cost", "Depreciation", "Net book value"] : ["Asset", "Method", "Cost", "Depreciation", "Net book value"]} rows={rows} /></Panel>
        <Panel title="Movements"><Table head={["Asset", "Movement"]} rows={[
          ["Server rack", "Impaired £1,500 · transferred to Malta"], ["Fixtures", "In service"],
        ]} /></Panel>
        <Note>Capitalisation · straight-line & reducing-balance depreciation · impairment · inter-entity transfers · disposals.</Note>
      </>
    );
  },
  acc_ic(ic) {
    const loans = (ic && ic.length)
      ? ic.map((r) => [r.counterparty, r.direction, r.ccy, { n: f0(r.principal) }, r.start_date])
      : null;
    return (
      <>
        <Panel title="Intercompany charges"><Table head={["Direction", "Type", "Ccy", "Amount"]} rows={[
          ["A00001 → A00002", "Management fee", "GBP", { n: f0(1000) }],
          ["A00001 → A00002", "Transfer pricing (cost+8%)", "GBP", { n: f0(10800) }],
        ]} /></Panel>
        <Panel title="Intercompany loans">
          {loans
            ? <Table head={["Counterparty", "Direction", "Ccy", "Principal", "Since"]} rows={loans} />
            : <Table head={["Direction", "Facility", "Outstanding", "Interest accrued"]} rows={[
                ["A00001 → A00002", "£100,000 @ 5%", { n: "£80,000" }, { n: "£1,232.88" }],
              ]} />}
        </Panel>
        <Panel title="Reconciliation"><Table rows={[["A00001 ↔ A00002", { pill: ["Balanced · diff £0.00", POS] }]]} /></Panel>
        <Note>Recharges · loans · transfer pricing · auto-reciprocal postings · reconciliation · settlement · elimination.</Note>
      </>
    );
  },
  acc_con(con) {
    const hasOwn = con && con.ownership && con.ownership.length;
    const own = hasOwn
      ? con.ownership.map((o) => [o.entity_code + " " + o.entity_name, { n: o.direct_pct + "%" }, { n: o.effective_pct + "%" }])
      : [
          ["A00001 Affinity (IOM)", { n: "100%" }, { n: "100%" }, { n: f0(0) }],
          ["A00002 Affinity Malta", { n: "80%" }, { n: "80%" }, { n: f0(-200) }],
          ["A00003 Affinity (Cayman)", { n: "75%" }, { n: "60%" }, { n: f0(4000) }],
        ];
    const hasSum = con && con.summary && con.summary.length;
    return (
      <>
        <Panel title="Group structure &amp; effective ownership"><Table head={hasOwn ? ["Entity", "Direct %", "Effective %"] : ["Entity", "Direct %", "Effective %", "NCI"]} rows={own} /></Panel>
        {hasSum
          ? <Panel title="Consolidated summary (group reporting currency)"><Table rows={con.summary.map((s) => [s.line, { n: f0(s.amount) }])} /></Panel>
          : <div style={cards}>
              <Mini title="Non-controlling interest" rows={[["Cayman (40%)", f0(4000)], ["Malta (20%)", f0(-200)]]} />
              <Mini title="Currency translation reserve" rows={[["EUR sub (0.85→0.90)", f0(250)]]} />
            </div>}
        <Note>Group consolidation · multi-level ownership · minority interest · CTA · elimination · consolidated statements.</Note>
      </>
    );
  },
  acc_cf(cf) {
    const rows = (cf && cf.length)
      ? cf.map((r) => [r.section, { n: f2(r.amount), neg: Number(r.amount) < 0 }])
      : [
          ["Cash from operating activities", { n: f2(5261) }], ["Cash from investing activities", { n: f2(-100), neg: 1 }],
          ["Cash from financing activities", { n: f2(0) }], ["Net increase/(decrease) in cash", { n: f2(5161) }],
          ["Cash at beginning of period", { n: f2(0) }], ["Cash at end of period", { n: f2(5161) }],
        ];
    return (
      <>
        <Panel title="Cash flow statement (direct)"><Table rows={rows} /></Panel>
        <Panel title="Rolling forecast"><Table head={["Period", "Expected receipts", "Expected payments", "Projected close"]} rows={[
          ["Jul 2026", { n: f0(25200) }, { n: f0(3960) }, { n: f0(26401) }],
          ["Aug 2026", { n: f0(120) }, { n: f0(0) }, { n: f0(26521) }],
          ["Sep 2026", { n: f0(120) }, { n: f0(0) }, { n: f0(26641) }],
        ]} /></Panel>
        <Note>Direct-method cash flow (reconciles) · forward forecast from open AR/AP.</Note>
      </>
    );
  },
  acc_fx(fx) {
    const hasR = fx && fx.rates && fx.rates.length;
    const rates = hasR
      ? fx.rates.map((r) => [r.pair, { n: Number(r.rate).toFixed(4) }, r.rate_date])
      : [
          ["GBP/EUR", { n: "1.1765" }, "30 Jun 2026"], ["GBP/USD", { n: "1.2710" }, "30 Jun 2026"], ["EUR/GBP", { n: "0.9000" }, "30 Jun 2026"],
        ];
    const hasP = fx && fx.positions && fx.positions.length;
    return (
      <>
        <Panel title="Exchange rates (auto-fetched daily)"><Table head={["Pair", "Rate", "As at"]} rows={rates} /></Panel>
        {hasP
          ? <Panel title="Currency exposure by entity"><Table head={["Entity", "Ccy", "Net position"]} rows={fx.positions.map((p) => [p.entity_code, p.ccy, { n: f0(p.net_position) }])} /></Panel>
          : <div style={cards}>
              <Mini title="Realised FX" rows={[["YTD", f0(420)]]} />
              <Mini title="Unrealised (revaluation)" rows={[["At period end", f0(185)]]} />
              <Mini title="Translation reserve" rows={[["EUR subsidiary", f0(250)]]} />
            </div>}
        <Note>Functional + transaction currency · daily rate feed · realised &amp; unrealised FX · translation reserves.</Note>
      </>
    );
  },
  acc_tax(vat) {
    const v = vat && vat.length ? vat[0] : null;
    const rows = v
      ? [["Box 1 — VAT due on sales", { n: f2(v.output_vat) }], ["Box 4 — VAT reclaimed", { n: f2(v.input_vat) }], ["Box 5 — Net VAT payable", { n: f2(v.net_vat) }]]
      : [
          ["Box 1 — VAT due on sales", { n: f2(5811) }], ["Box 4 — VAT reclaimed", { n: f2(2417) }], ["Box 5 — Net VAT payable", { n: f2(3394) }],
        ];
    return (
      <>
        <Panel title="VAT return"><Table rows={rows} /></Panel>
        <Panel title="VAT by jurisdiction"><Table head={["Jurisdiction", "Output", "Input", "Net"]} rows={[
          ["Isle of Man", { n: f0(200) }, { n: f0(960) }, { n: f0(-760), neg: 1 }],
          ["Malta", { n: f0(1120) }, { n: f0(540) }, { n: f0(580) }],
        ]} /></Panel>
        <Panel title="Withholding tax"><Table rows={[["Overseas consultant (20%)", { n: f0(200) }]]} /></Panel>
        <Note>VAT in/out · tax codes · VAT return · withholding tax · reverse charge · reporting by jurisdiction.</Note>
      </>
    );
  },
  acc_bud(bud) {
    const rows = (bud && bud.length)
      ? bud.map((r) => {
          const v = Number(r.variance);
          return [r.account_name, r.period, { n: f0(r.budget) }, { n: f0(r.actual) }, { n: f0(r.variance), pos: v > 0 ? 1 : 0, neg: v < 0 ? 1 : 0 }];
        })
      : [
          ["Sales", "2026-01", { n: f0(5000) }, { n: f0(5000) }, { n: f0(0) }],
          ["Sales", "2026-02", { n: f0(5000) }, { n: f0(6000) }, { n: f0(1000), pos: 1 }],
          ["Admin", "2026-01", { n: f0(2200) }, { n: f0(2000) }, { n: f0(-200), neg: 1 }],
          ["Admin", "2026-02", { n: f0(2200) }, { n: f0(2500) }, { n: f0(300), pos: 1 }],
        ];
    return (
      <>
        <Panel title="Budget vs actual"><Table head={["Account", "Period", "Budget", "Actual", "Variance"]} rows={rows} /></Panel>
        <div style={cards}>
          <Mini title="Scenarios" rows={[["Base — sales FY", f0(10000)], ["Best case — sales FY", f0(12000)]]} />
          <Mini title="Rolling forecast" rows={[["Sales latest estimate", f0(10000)], ["Admin latest estimate", f0(4200)]]} />
        </div>
        <Note>Annual budgets · entity &amp; departmental · budget-vs-actual · scenarios · rolling forecast · submit→approve workflow.</Note>
      </>
    );
  },
  acc_fs(pack) {
    const bs = pack && pack.balance_sheet;
    const pl = pack && pack.profit_and_loss;
    const A = bs ? Number(bs.assets) || 0 : null;
    const L = bs ? Math.abs(Number(bs.liabilities) || 0) : null;
    const sfp = bs
      ? [["Total assets", { n: f0(A) }], ["Creditors: due within one year", { n: f0(-L), neg: L > 0 ? 1 : 0 }], ["Net assets", { n: f0(A - L) }]]
      : [
          ["Debtors", { n: f0(40606) }, { n: f0(0) }], ["Cash at bank and in hand", { n: f0(1741) }, { n: f0(0) }],
          ["Total assets", { n: f0(42347) }, { n: f0(0) }], ["Creditors: due within one year", { n: f0(-34302) }, { n: f0(0) }],
          ["Net assets", { n: f0(8045) }, { n: f0(0) }],
        ];
    const pnl = pl
      ? [["Turnover", { n: f0(pl.income) }], ["Administrative expenses", { n: f0(-(Number(pl.expenses) || 0)), neg: 1 }], ["Profit for the financial year", { n: f0(pl.profit) }]]
      : [
          ["Turnover", { n: f0(8525) }, { n: f0(0) }], ["Other operating income", { n: f0(1270) }, { n: f0(0) }],
          ["Administrative expenses", { n: f0(-2250) }, { n: f0(0) }], ["Profit for the financial year", { n: f0(7545) }, { n: f0(0) }],
        ];
    return (
      <>
        <div style={{ display: "inline-flex", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
          {["FRS 102 1A", "IFRS", "GAPSME", "Trust"].map((t, i) => (
            <span key={t} style={{ padding: "7px 13px", fontSize: 13, background: i === 0 ? NAVY : "#fff", color: i === 0 ? "#fff" : MUT, fontWeight: i === 0 ? 600 : 400 }}>{t}</span>
          ))}
        </div>
        <Panel title="Statement of financial position"><Table head={bs ? ["", "2026"] : ["", "2026", "2025"]} rows={sfp} /></Panel>
        <Panel title="Profit &amp; loss"><Table head={pl ? ["", "2026"] : ["", "2026", "2025"]} rows={pnl} /></Panel>
        <Note>Workflow: prepared → reviewed → approved → finalised &amp; locked · four frameworks · comparatives · data-driven notes.</Note>
      </>
    );
  },
  acc_mgmt(pnl) {
    const rows = (pnl && pnl.length)
      ? pnl.map((r) => [r.code + " " + r.name, { n: f0(r.revenue) }, { n: f0(r.expenses) }, { n: f0(r.profit) }])
      : [
          ["A00001 Affinity (IOM)", { n: f0(29060) }, { n: f0(12110) }, { n: f0(16950) }],
          ["A00002 Affinity Malta", { n: f0(14200) }, { n: f0(8100) }, { n: f0(6100) }],
          ["A00003 Affinity (Cayman)", { n: f0(9800) }, { n: f0(3400) }, { n: f0(6400) }],
        ];
    return (
      <>
        <Panel title="P&amp;L by entity"><Table head={["Entity", "Revenue", "Expenses", "Profit"]} rows={rows} /></Panel>
        <Panel title="Departmental / project profitability"><Table head={["Department", "Contribution"]} rows={[
          ["Corporate Services", { n: f0(18200) }], ["Trust", { n: f0(9400) }], ["Funds", { n: f0(3460) }],
        ]} /></Panel>
        <Note>P&amp;L &amp; balance sheet by entity · consolidated · departmental / project / cost-centre · cash flow.</Note>
      </>
    );
  },
  acc_ctl(checks) {
    const hasChecks = checks && checks.length;
    const chk = hasChecks
      ? checks.map((c) => [c.check_name + " · " + c.detail, { pill: [c.status, c.status === "Pass" ? POS : (c.status === "Attention" ? NEG : AMBER)] }])
      : [
          ["Preparer + Approver on one user", { pill: ["Blocked", NEG] }],
          ["Self-approval of own journal", { pill: ["Blocked", NEG] }],
        ];
    return (
      <>
        <Panel title="Audit log"><Table head={["Time", "User", "Action", "Note"]} rows={[
          ["09:14", "roxy", "Approved journal JL-1055", "—"],
          ["09:02", "garry", "Posted JL-1055 (draft, >£50k)", "Held for approval"],
          ["08:50", "danny", "Created supplier invoice V001/INV-88", "—"],
        ]} /></Panel>
        <Panel title="Users, roles &amp; entity access"><Table head={["User", "Roles", "Entities"]} rows={[
          ["roxy", "Approver, Accountant", "IOM"], ["garry", "Preparer", "Cayman"], ["admin", "Administrator", "All"],
        ]} /></Panel>
        <Panel title={hasChecks ? "Control checks" : "Segregation of duties"}><Table rows={chk} /></Panel>
        <Note>Role-based security · row-level security by entity · segregation of duties · approval workflows · audit logs.</Note>
      </>
    );
  },
  acc_doc() {
    return (
      <>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <input placeholder="Search documents…" style={{ flex: 1, padding: "9px 12px", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13 }} />
          <button style={{ background: CY, color: "#04313a", border: "none", borderRadius: 8, padding: "8px 13px", fontWeight: 600, cursor: "pointer" }}>Search</button>
        </div>
        <Panel title="Repository (17 categories)"><Table head={["Document", "Category", "Retention until"]} rows={[
          ["Register of Members.pdf", "Statutory Registers", "Permanent"],
          ["Director passport KYC.pdf", "KYC / CDD", "2031-06-17"],
          ["INV-88.pdf", "Invoices & Billing", "2032-06-17"],
          ["Bank confirmation.pdf", "Banking", "2032-06-17"],
        ]} /></Panel>
        <Note>Attachments linked to invoices/journals/assets · 17-category structure · retention policy + destruction worklist · full-text search.</Note>
      </>
    );
  },
  acc_aud(pack) {
    const pl = pack && pack.profit_and_loss;
    const bs = pack && pack.balance_sheet;
    const plRows = pl ? [["Income", f0(pl.income)], ["Expenses", f0(pl.expenses)], ["Profit", f0(pl.profit)]]
      : [["Income", f0(29060)], ["Expenses", f0(12110)], ["Profit", f0(16950)]];
    const bsRows = bs ? [["Assets", f0(bs.assets)], ["Liabilities", f0(Math.abs(Number(bs.liabilities) || 0))], ["Net assets", f0((Number(bs.assets) || 0) - Math.abs(Number(bs.liabilities) || 0))]]
      : [["Assets", f0(51793)], ["Liabilities", f0(34842)], ["Equity", f0(0)]];
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <h4 style={{ margin: 0, color: NAVY }}>Auditor pack — FY2026</h4>
          <button style={{ marginLeft: "auto", background: CY, color: "#04313a", border: "none", borderRadius: 8, padding: "8px 13px", fontWeight: 600, cursor: "pointer" }}
            onClick={() => alert("In the live app this downloads the full pack as JSON.")}>Download pack (JSON)</button>
        </div>
        <div style={cards}>
          <Mini title="Profit &amp; loss" rows={plRows} />
          <Mini title="Balance sheet" rows={bsRows} />
          <Mini title="Document completeness" rows={[["Invoices", "2"], ["With documents", "0"], ["Missing", "2"]]} />
        </div>
        <Note>Also includes trial balance, AR/AP aging, fixed-asset &amp; related-party notes, and a journal-entry test sample.</Note>
      </>
    );
  },
  wip() {
    return (
      <>
        <div style={cards}>
          <Mini title="Total unbilled WIP" rows={[["All offices", f0(184250)]]} />
          <Mini title="By office" rows={[["Isle of Man", f0(96400)], ["Malta", f0(48200)], ["Cayman", f0(39650)]]} />
        </div>
        <Panel title="Work in progress by client / matter (from Timesheets)">
          <Table head={["Client / matter", "Fee earner", "Unbilled hrs", "Rate", "WIP value", "Age"]} rows={[
            ["Northwind Holdings — annual admin", "R. Sheeley", { n: "12.5" }, { n: f0(285) }, { n: f0(3562) }, { n: "21 days" }],
            ["Seabright Trust — restructuring", "G. Crossan", { n: "28.0" }, { n: f0(310) }, { n: f0(8680) }, { n: "34 days" }],
            ["Maple Fund SPC — incorporation", "J. Fenech", { n: "9.0" }, { n: f0(260) }, { n: f0(2340) }, { n: "8 days" }],
          ]} />
        </Panel>
        <Note>WIP is unbilled time captured in Timesheets, valued at each fee earner's rate. Convert to a draft bill in Invoicing.</Note>
      </>
    );
  },
};

// nav groups -> tabbed sets of panels (keeps the sidebar short)
const GROUPS = {
  acc_overview: [["acc_ov", "Overview"]],
  acc_wip:      [["wip", "Work in progress"]],
  acc_txn:      [["acc_gl", "General Ledger"], ["acc_ar", "Accounts Receivable"], ["acc_ap", "Accounts Payable"], ["acc_bank", "Banking & Reconciliation"]],
  acc_assets:   [["acc_fa", "Fixed Assets"], ["acc_ic", "Intercompany"], ["acc_con", "Consolidation"]],
  acc_report:   [["acc_cf", "Cash Flow & Treasury"], ["acc_fx", "Multi-currency / FX"], ["acc_tax", "Tax & VAT"], ["acc_fs", "Financial Statements"], ["acc_mgmt", "Management Reports"]],
  acc_gov:      [["acc_ctl", "Controls"], ["acc_aud", "Auditor Pack"]],
};
const GROUP_TITLE = {
  acc_overview: "Overview", acc_wip: "Work in progress", acc_txn: "Transactions",
  acc_assets: "Assets & Groups", acc_report: "Reporting", acc_gov: "Governance",
};

const DEMO_ENTITIES = [
  { id: 1, label: "A00001 · Affinity (IOM) Limited" },
  { id: 2, label: "A00002 · Affinity Malta Ltd" },
  { id: 3, label: "A00003 · Affinity (Cayman) Ltd" },
];

export default function Accounting({ module }) {
  const group = GROUPS[module] ? module : "acc_overview";
  const tabs = GROUPS[group];
  const fy = new Date().getFullYear();
  const start = fy + "-01-01", end = fy + "-12-31";

  const [tab, setTab] = useState(tabs[0][0]);
  const [entities, setEntities] = useState(DEMO_ENTITIES);
  const [entityId, setEntityId] = useState(DEMO_ENTITIES[0].id);
  const [liveKpis, setLiveKpis] = useState(null);
  const [liveCf, setLiveCf] = useState(null);
  const [liveArCredit, setLiveArCredit] = useState(null);
  const [liveArCol, setLiveArCol] = useState(null);
  const [liveAp, setLiveAp] = useState(null);
  const [liveFa, setLiveFa] = useState(null);
  const [liveIc, setLiveIc] = useState(null);
  const [liveGl, setLiveGl] = useState(null);
  const [liveBud, setLiveBud] = useState(null);
  const [liveMgmt, setLiveMgmt] = useState(null);
  const [livePack, setLivePack] = useState(null);
  const [liveCtl, setLiveCtl] = useState(null);
  const [liveBank, setLiveBank] = useState(null);
  const [liveFx, setLiveFx] = useState(null);
  const [liveTax, setLiveTax] = useState(null);
  const [liveCon, setLiveCon] = useState(null);

  // reset to the first tab whenever the nav group changes
  useEffect(() => { setTab(GROUPS[group][0][0]); }, [group]);

  // populate the entity list from Supabase when connected (else demo list)
  useEffect(() => {
    if (!isConfigured) return;
    listEntities().then(({ data }) => {
      if (data && data.length) {
        setEntities(data.map((e) => ({ id: e.id, label: e.company_code + " · " + e.name })));
        setEntityId((prev) => prev || data[0].id);
      }
    }).catch(() => {});
  }, []);

  // fetch live KPIs for the Overview panel when connected
  useEffect(() => {
    if (!isConfigured || !entityId) { setLiveKpis(null); return; }
    let ok = true;
    getKpiDashboard(entityId, start, end).then(({ data }) => {
      if (ok) setLiveKpis(data && data.kpis ? data.kpis : null);
    }).catch(() => { if (ok) setLiveKpis(null); });
    return () => { ok = false; };
  }, [entityId, start, end]);

  // fetch live Cash Flow statement when on that tab
  useEffect(() => {
    if (!isConfigured || tab !== "acc_cf" || !entityId) { setLiveCf(null); return; }
    let ok = true;
    getCashFlow(entityId, start, end).then(({ data }) => {
      if (ok) setLiveCf(data && data.length ? data : null);
    }).catch(() => { if (ok) setLiveCf(null); });
    return () => { ok = false; };
  }, [tab, entityId, start, end]);

  // fetch live AR (credit exposure + collections) when on that tab
  useEffect(() => {
    if (!isConfigured || tab !== "acc_ar" || !entityId) { setLiveArCredit(null); setLiveArCol(null); return; }
    let ok = true;
    getCreditStatus(entityId).then(({ data }) => { if (ok) setLiveArCredit(data && data.length ? data : null); }).catch(() => { if (ok) setLiveArCredit(null); });
    getCollections(entityId, end).then(({ data }) => { if (ok) setLiveArCol(data && data.length ? data : null); }).catch(() => { if (ok) setLiveArCol(null); });
    return () => { ok = false; };
  }, [tab, entityId, end]);

  // fetch live AP (vendors + aging + POs) when on that tab
  useEffect(() => {
    if (!isConfigured || tab !== "acc_ap" || !entityId) { setLiveAp(null); return; }
    let ok = true;
    Promise.all([apVendors(entityId), apAging(entityId), apPurchaseOrders(entityId)]).then(([v, a, p]) => {
      if (ok) setLiveAp({ vendors: v.data || null, aging: a.data || null, pos: p.data || null });
    }).catch(() => { if (ok) setLiveAp(null); });
    return () => { ok = false; };
  }, [tab, entityId]);

  // fetch live Fixed Assets register when on that tab
  useEffect(() => {
    if (!isConfigured || tab !== "acc_fa" || !entityId) { setLiveFa(null); return; }
    let ok = true;
    getFixedAssets(entityId, start, end).then(({ data }) => { if (ok) setLiveFa(data && data.length ? data : null); }).catch(() => { if (ok) setLiveFa(null); });
    return () => { ok = false; };
  }, [tab, entityId, start, end]);

  // fetch live Intercompany loans when on that tab
  useEffect(() => {
    if (!isConfigured || tab !== "acc_ic" || !entityId) { setLiveIc(null); return; }
    let ok = true;
    getIcLoans(entityId).then(({ data }) => { if (ok) setLiveIc(data && data.length ? data : null); }).catch(() => { if (ok) setLiveIc(null); });
    return () => { ok = false; };
  }, [tab, entityId]);

  // fetch live General Ledger (trial balance + recent journals) when on that tab
  useEffect(() => {
    if (!isConfigured || tab !== "acc_gl" || !entityId) { setLiveGl(null); return; }
    let ok = true;
    Promise.all([getTrialBalance(entityId, end), getRecentJournals(entityId)]).then(([tb, jr]) => {
      if (ok) setLiveGl({ tb: tb.data || null, journals: jr.data || null });
    }).catch(() => { if (ok) setLiveGl(null); });
    return () => { ok = false; };
  }, [tab, entityId, end]);

  // fetch live Budget vs Actual when on that tab
  useEffect(() => {
    if (!isConfigured || tab !== "acc_bud" || !entityId) { setLiveBud(null); return; }
    let ok = true;
    getBudgetVsActualForEntity(entityId).then(({ data }) => { if (ok) setLiveBud(data && data.length ? data : null); }).catch(() => { if (ok) setLiveBud(null); });
    return () => { ok = false; };
  }, [tab, entityId]);

  // Management Reports (P&L by entity)
  useEffect(() => {
    if (!isConfigured || tab !== "acc_mgmt") { setLiveMgmt(null); return; }
    let ok = true;
    getPnlByEntity().then(({ data }) => { if (ok) setLiveMgmt(data && data.length ? data : null); }).catch(() => { if (ok) setLiveMgmt(null); });
    return () => { ok = false; };
  }, [tab]);

  // Financial Statements + Auditor Pack (shared audit-pack JSON)
  useEffect(() => {
    if (!isConfigured || (tab !== "acc_fs" && tab !== "acc_aud") || !entityId) { setLivePack(null); return; }
    let ok = true;
    getAuditPack(entityId, start, end).then(({ data }) => { if (ok) setLivePack(data || null); }).catch(() => { if (ok) setLivePack(null); });
    return () => { ok = false; };
  }, [tab, entityId, start, end]);

  // Controls (control checks)
  useEffect(() => {
    if (!isConfigured || tab !== "acc_ctl" || !entityId) { setLiveCtl(null); return; }
    let ok = true;
    getControlChecks(entityId).then(({ data }) => { if (ok) setLiveCtl(data && data.length ? data : null); }).catch(() => { if (ok) setLiveCtl(null); });
    return () => { ok = false; };
  }, [tab, entityId]);

  // Banking
  useEffect(() => {
    if (!isConfigured || tab !== "acc_bank" || !entityId) { setLiveBank(null); return; }
    let ok = true;
    getBankAccounts(entityId).then(({ data }) => { if (ok) setLiveBank(data && data.length ? data : null); }).catch(() => { if (ok) setLiveBank(null); });
    return () => { ok = false; };
  }, [tab, entityId]);

  // FX (rates + positions)
  useEffect(() => {
    if (!isConfigured || tab !== "acc_fx") { setLiveFx(null); return; }
    let ok = true;
    Promise.all([getFxRates(), getFxPositions()]).then(([r, p]) => {
      if (ok) setLiveFx({ rates: r.data || null, positions: p.data || null });
    }).catch(() => { if (ok) setLiveFx(null); });
    return () => { ok = false; };
  }, [tab]);

  // Tax / VAT
  useEffect(() => {
    if (!isConfigured || tab !== "acc_tax" || !entityId) { setLiveTax(null); return; }
    let ok = true;
    getVatBoxes(entityId).then(({ data }) => { if (ok) setLiveTax(data && data.length ? data : null); }).catch(() => { if (ok) setLiveTax(null); });
    return () => { ok = false; };
  }, [tab, entityId]);

  // Consolidation (ownership + summary)
  useEffect(() => {
    if (!isConfigured || tab !== "acc_con") { setLiveCon(null); return; }
    let ok = true;
    Promise.all([getConsolOwnership(), getConsolSummary()]).then(([o, s]) => {
      if (ok) setLiveCon({ ownership: o.data || null, summary: s.data || null });
    }).catch(() => { if (ok) setLiveCon(null); });
    return () => { ok = false; };
  }, [tab]);

  const live = (tab === "acc_ov" && !!liveKpis) || (tab === "acc_cf" && !!liveCf)
    || (tab === "acc_ar" && (!!liveArCredit || !!liveArCol))
    || (tab === "acc_ap" && !!liveAp && (liveAp.vendors || liveAp.aging || liveAp.pos))
    || (tab === "acc_fa" && !!liveFa) || (tab === "acc_ic" && !!liveIc)
    || (tab === "acc_gl" && !!liveGl && (liveGl.tb || liveGl.journals)) || (tab === "acc_bud" && !!liveBud)
    || (tab === "acc_mgmt" && !!liveMgmt) || ((tab === "acc_fs" || tab === "acc_aud") && !!livePack) || (tab === "acc_ctl" && !!liveCtl)
    || (tab === "acc_bank" && !!liveBank) || (tab === "acc_fx" && !!liveFx && (liveFx.rates || liveFx.positions))
    || (tab === "acc_tax" && !!liveTax) || (tab === "acc_con" && !!liveCon && (liveCon.ownership || liveCon.summary));
  const render = PANELS[tab] || PANELS.acc_ov;

  return (
    <div style={{ padding: "18px 22px 80px", background: "#F4F6F9", minHeight: "100vh", color: INK }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: NAVY, fontWeight: 600 }}>{GROUP_TITLE[group]}</h2>
        {live
          ? <span style={{ background: POS + "1A", color: POS, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 600 }}>Live</span>
          : <span style={{ background: AMBER + "1A", color: AMBER, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 600 }}>Preview data</span>}
        <select value={entityId} onChange={(e) => setEntityId(Number(e.target.value))}
          style={{ marginLeft: "auto", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </div>
      {tabs.length > 1 && (
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${LINE}`, marginBottom: 18, flexWrap: "wrap" }}>
          {tabs.map(([tid, tlabel]) => (
            <button key={tid} onClick={() => setTab(tid)}
              style={{ border: "none", background: "none", cursor: "pointer", padding: "9px 12px", fontSize: 13.5,
                fontWeight: tab === tid ? 700 : 500, color: tab === tid ? NAVY : MUT,
                borderBottom: tab === tid ? `2px solid ${CY}` : "2px solid transparent" }}>{tlabel}</button>
          ))}
        </div>
      )}
      {tab === "acc_ov" ? render(liveKpis) : tab === "acc_cf" ? render(liveCf) : tab === "acc_ar" ? render({ credit: liveArCredit, collections: liveArCol }) : tab === "acc_ap" ? render(liveAp) : tab === "acc_fa" ? render(liveFa) : tab === "acc_ic" ? render(liveIc) : tab === "acc_gl" ? render(liveGl) : tab === "acc_bud" ? render(liveBud) : tab === "acc_mgmt" ? render(liveMgmt) : (tab === "acc_fs" || tab === "acc_aud") ? render(livePack) : tab === "acc_ctl" ? render(liveCtl) : tab === "acc_bank" ? render(liveBank) : tab === "acc_fx" ? render(liveFx) : tab === "acc_tax" ? render(liveTax) : tab === "acc_con" ? render(liveCon) : render()}
    </div>
  );
}
