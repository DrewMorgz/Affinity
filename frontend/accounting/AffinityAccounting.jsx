import React, { useEffect, useMemo, useState } from "react";
import { isConfigured } from "./lib/supabaseClient";
import {
  listEntities, getKpiDashboard, getCashFlow,
  getCollections, getCreditStatus, getAuditPack,
} from "./lib/accountingApi";

/*
  Affinity Core — Accounting module
  Binds the accounting engine (db/001..050) to the app. The Overview tab is the
  hero: live finance KPIs for the selected entity. Receivables, Cash flow and the
  Auditor pack read the engine RPCs directly. The Financial Statements viewer
  (AffinityFinancialStatements.jsx) and Invoice (AffinityInvoice.jsx) are separate
  screens fed by get_accounts_set_json / get_invoice_json.
*/

// ---- identity ----
const NAVY = "#001242", TEAL = "#2BB6A3", PAPER = "#F7F8FA", CARD = "#FFFFFF";
const INK = "#0B1B2B", MUTED = "#5B6B7B", LINE = "#E6EAF0";
const POS = "#1F9D6B", NEG = "#C2453E";

const gbp = (n, ccy = "GBP") =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n);
const money2 = (n, ccy = "GBP") =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy }).format(n);
const TABS = ["Overview", "Receivables", "Cash flow", "Auditor pack"];

export default function AffinityAccounting() {
  const today = new Date();
  const fy = today.getFullYear();
  const [entities, setEntities] = useState([]);
  const [entityId, setEntityId] = useState(null);
  const [start] = useState(`${fy}-01-01`);
  const [end] = useState(`${fy}-12-31`);
  const [tab, setTab] = useState("Overview");

  useEffect(() => {
    if (!isConfigured) return;
    listEntities().then(({ data }) => {
      if (data && data.length) { setEntities(data); setEntityId((p) => p ?? data[0].id); }
    });
  }, []);

  const entity = useMemo(() => entities.find((e) => e.id === entityId), [entities, entityId]);
  const ccy = entity?.functional_ccy || "GBP";

  return (
    <div style={{ background: PAPER, minHeight: "100%", color: INK, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      <header style={{ background: NAVY, color: "#fff", padding: "22px 28px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Affinity</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: TEAL, letterSpacing: -0.4 }}>Accounting</span>
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#9FB0C4" }}>
            Financial year {fy}
          </span>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "#9FB0C4" }}>Entity</label>
          <select
            value={entityId ?? ""}
            onChange={(e) => setEntityId(Number(e.target.value))}
            style={{ background: "#0A2350", color: "#fff", border: `1px solid #1C3A6E`, borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          >
            {entities.length === 0 && <option>—</option>}
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.company_code} · {e.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* tabs */}
      <nav style={{ display: "flex", gap: 4, padding: "0 28px", borderBottom: `1px solid ${LINE}`, background: CARD }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              border: "none", background: "none", cursor: "pointer", padding: "14px 12px",
              fontSize: 14, fontWeight: tab === t ? 700 : 500, color: tab === t ? NAVY : MUTED,
              borderBottom: tab === t ? `2px solid ${TEAL}` : "2px solid transparent",
            }}>{t}</button>
        ))}
      </nav>

      <main style={{ padding: 28 }}>
        {!isConfigured && <SetupState />}
        {isConfigured && tab === "Overview" && <Overview entityId={entityId} start={start} end={end} ccy={ccy} />}
        {isConfigured && tab === "Receivables" && <Receivables entityId={entityId} ccy={ccy} />}
        {isConfigured && tab === "Cash flow" && <CashFlow entityId={entityId} start={start} end={end} ccy={ccy} />}
        {isConfigured && tab === "Auditor pack" && <AuditorPack entityId={entityId} start={start} end={end} ccy={ccy} />}
      </main>
    </div>
  );
}

// ---- shared states ----
function SetupState() {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 28, maxWidth: 640 }}>
      <h3 style={{ margin: "0 0 8px", color: NAVY }}>Connect the database to see your numbers</h3>
      <p style={{ color: MUTED, lineHeight: 1.6, margin: 0 }}>
        The accounting engine is built but this screen has no data source yet. Add your Supabase
        URL and anon key as <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_ANON_KEY</code>,
        run the engine migrations (db/001 to db/050) in the Supabase SQL editor, then redeploy.
      </p>
    </div>
  );
}
const Loading = () => <p style={{ color: MUTED }}>Loading…</p>;
const ErrorBox = ({ msg }) => (
  <div style={{ background: "#FDF2F1", border: `1px solid #F3C9C5`, color: NEG, borderRadius: 10, padding: 14 }}>
    Couldn’t load this. {msg}
  </div>
);
const Empty = ({ children }) => <p style={{ color: MUTED }}>{children}</p>;

// ---- Overview (KPI hero) ----
function Overview({ entityId, start, end, ccy }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    if (!entityId) return;
    setState({ loading: true });
    getKpiDashboard(entityId, start, end).then(({ data, error }) =>
      setState({ loading: false, error, kpis: data?.kpis })
    );
  }, [entityId, start, end]);

  if (state.loading) return <Loading />;
  if (state.error) return <ErrorBox msg={state.error.message} />;
  const k = state.kpis || {};

  const cards = [
    { label: "Revenue", value: gbp(k.revenue, ccy) },
    { label: "Net profit", value: gbp(k.net_profit, ccy), accent: true },
    { label: "Profit margin", value: k.profit_margin_pct == null ? "—" : `${k.profit_margin_pct}%` },
    { label: "Cash", value: gbp(k.cash, ccy), tone: k.cash < 0 ? NEG : null },
    { label: "Trade debtors", value: gbp(k.trade_debtors, ccy) },
    { label: "Trade creditors", value: gbp(k.trade_creditors, ccy) },
    { label: "Working capital", value: gbp(k.working_capital, ccy), tone: k.working_capital < 0 ? NEG : null },
    { label: "Current ratio", value: k.current_ratio == null ? "—" : `${k.current_ratio}×` },
    { label: "Debtor days (DSO)", value: k.dso_days == null ? "—" : `${k.dso_days} days` },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
      {cards.map((c) => (
        <div key={c.label}
          style={{
            background: c.accent ? NAVY : CARD, color: c.accent ? "#fff" : INK,
            border: `1px solid ${c.accent ? NAVY : LINE}`, borderRadius: 12, padding: "16px 18px",
          }}>
          <div style={{ fontSize: 12, color: c.accent ? "#9FB0C4" : MUTED, marginBottom: 6 }}>{c.label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: c.tone || (c.accent ? TEAL : INK) }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Receivables (credit + collections) ----
function Receivables({ entityId, ccy }) {
  const [credit, setCredit] = useState({ loading: true });
  const [coll, setColl] = useState({ loading: true });
  const asAt = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    if (!entityId) return;
    getCreditStatus(entityId).then(({ data, error }) => setCredit({ loading: false, error, rows: data || [] }));
    getCollections(entityId, asAt).then(({ data, error }) => setColl({ loading: false, error, rows: data || [] }));
  }, [entityId]); // eslint-disable-line

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <Section title="Credit exposure">
        {credit.loading ? <Loading /> : credit.error ? <ErrorBox msg={credit.error.message} /> :
          credit.rows.length === 0 ? <Empty>No customers on file yet.</Empty> :
          <Table head={["Customer", "Limit", "Outstanding", "Available", "Status"]}>
            {credit.rows.map((r) => (
              <tr key={r.customer_id}>
                <Td>{r.code} · {r.name}</Td>
                <Td num>{gbp(r.credit_limit, ccy)}</Td>
                <Td num>{gbp(r.outstanding, ccy)}</Td>
                <Td num tone={r.available < 0 ? NEG : null}>{gbp(r.available, ccy)}</Td>
                <Td>{r.over_limit ? <Pill tone={NEG}>Over limit</Pill> : r.on_hold ? <Pill tone={NEG}>On hold</Pill> : <Pill tone={POS}>OK</Pill>}</Td>
              </tr>
            ))}
          </Table>}
      </Section>

      <Section title="Collections worklist">
        {coll.loading ? <Loading /> : coll.error ? <ErrorBox msg={coll.error.message} /> :
          coll.rows.length === 0 ? <Empty>Nothing overdue. Nice.</Empty> :
          <Table head={["Customer", "Invoice", "Due", "Outstanding", "Days late", "Action"]}>
            {coll.rows.map((r) => (
              <tr key={r.invoice_id}>
                <Td>{r.customer_code} · {r.customer_name}</Td>
                <Td>#{r.invoice_id}</Td>
                <Td>{r.due_date}</Td>
                <Td num>{gbp(r.outstanding, ccy)}</Td>
                <Td num>{r.days_overdue}</Td>
                <Td><Pill tone={r.suggested_level >= 3 ? NEG : "#B8860B"}>{r.dunning_name}</Pill></Td>
              </tr>
            ))}
          </Table>}
      </Section>
    </div>
  );
}

// ---- Cash flow ----
function CashFlow({ entityId, start, end, ccy }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    if (!entityId) return;
    setState({ loading: true });
    getCashFlow(entityId, start, end).then(({ data, error }) => setState({ loading: false, error, rows: data || [] }));
  }, [entityId, start, end]);

  if (state.loading) return <Loading />;
  if (state.error) return <ErrorBox msg={state.error.message} />;
  return (
    <Section title="Cash flow statement">
      <Table head={["", ""]} hideHead>
        {state.rows.map((r, i) => {
          const total = r.section?.startsWith("Net") || r.section?.startsWith("Cash at");
          return (
            <tr key={i} style={{ fontWeight: total ? 700 : 500, borderTop: total ? `1px solid ${LINE}` : "none" }}>
              <Td>{r.section}</Td>
              <Td num tone={r.amount < 0 ? NEG : null}>{money2(r.amount, ccy)}</Td>
            </tr>
          );
        })}
      </Table>
    </Section>
  );
}

// ---- Auditor pack ----
function AuditorPack({ entityId, start, end, ccy }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    if (!entityId) return;
    setState({ loading: true });
    getAuditPack(entityId, start, end).then(({ data, error }) => setState({ loading: false, error, pack: data }));
  }, [entityId, start, end]);

  if (state.loading) return <Loading />;
  if (state.error) return <ErrorBox msg={state.error.message} />;
  const p = state.pack || {};
  const pl = p.profit_and_loss || {}, bs = p.balance_sheet || {}, dc = p.document_completeness || {};

  const download = () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audit-pack-${p?.entity?.code || "entity"}-${start}_${end}.json`;
    a.click();
  };

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <h3 style={{ margin: 0, color: NAVY }}>Auditor pack</h3>
        <button onClick={download}
          style={{ marginLeft: "auto", background: TEAL, color: "#04261F", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer" }}>
          Download pack (JSON)
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
        <MiniCard title="Profit & loss" rows={[
          ["Income", gbp(pl.income, ccy)], ["Expenses", gbp(pl.expenses, ccy)], ["Profit", gbp(pl.profit, ccy)],
        ]} />
        <MiniCard title="Balance sheet" rows={[
          ["Assets", gbp(bs.assets, ccy)], ["Liabilities", gbp(bs.liabilities, ccy)], ["Equity", gbp(bs.equity, ccy)],
        ]} />
        <MiniCard title="Document completeness" rows={[
          ["Invoices", dc.invoices_total ?? "—"],
          ["With documents", dc.invoices_with_documents ?? "—"],
          ["Missing", dc.invoices_missing_documents ?? "—"],
        ]} />
      </div>
      <p style={{ color: MUTED, fontSize: 13 }}>
        The pack also contains trial balance, AR/AP aging, fixed-asset and related-party notes, and a
        journal-entry test sample. Download to share the full set with the auditor.
      </p>
    </div>
  );
}

// ---- small UI atoms ----
const Section = ({ title, children }) => (
  <section>
    <h3 style={{ margin: "0 0 12px", color: NAVY, fontSize: 16 }}>{title}</h3>
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>{children}</div>
  </section>
);
const Table = ({ head, hideHead, children }) => (
  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
    {!hideHead && (
      <thead>
        <tr>{head.map((h, i) => (
          <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: "11px 14px", color: MUTED, fontWeight: 600, fontSize: 12, background: "#FBFCFD", borderBottom: `1px solid ${LINE}` }}>{h}</th>
        ))}</tr>
      </thead>
    )}
    <tbody>{children}</tbody>
  </table>
);
const Td = ({ children, num, tone }) => (
  <td style={{ padding: "11px 14px", textAlign: num ? "right" : "left", fontVariantNumeric: num ? "tabular-nums" : "normal", color: tone || "inherit", borderBottom: `1px solid ${LINE}` }}>{children}</td>
);
const Pill = ({ tone, children }) => (
  <span style={{ background: `${tone}1A`, color: tone, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>{children}</span>
);
const MiniCard = ({ title, rows }) => (
  <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
    <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>{title}</div>
    {rows.map(([l, v]) => (
      <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 14 }}>
        <span style={{ color: MUTED }}>{l}</span><span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</span>
      </div>
    ))}
  </div>
);
