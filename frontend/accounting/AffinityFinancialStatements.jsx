import React, { useState, useMemo } from "react";

/*
  Affinity Core — Financial Statements viewer
  -------------------------------------------------------------
  Renders the structured accounts JSON emitted by the accounting engine:
      SELECT get_accounts_set_json(:set_id);
  shape: { entity, framework, period, statements[], notes_analysis[],
           notes_fixed_assets[], notes_related_party[], notes_narrative[] }

  To wire to Supabase, replace SAMPLE below with a fetch, e.g.

    const { data } = await supabase.rpc('get_accounts_set_json', { p_set_id });
    const wf      = await supabase.from('v_accounts_production_status')
                                  .select('*').eq('id', p_set_id).single();

  The figures below are the real, tested engine outputs for the demo entities.
*/

// ---- sample payloads (one finalised, one draft, one approved) -------------
const SAMPLE = {
  FRS102_1A: {
    entity: { company_code: "A00001", name: "Affinity (IOM) Limited", functional_ccy: "GBP" },
    framework: "FRS102_1A", frameworkName: "FRS 102 Section 1A",
    period: { end: "31 December 2026", prior: "31 December 2025", firstPeriod: true },
    workflow: { status: "finalised", prepared_by: "Roxy Sheeley", reviewed_by: "Roxy Sheeley",
                approved_by: "Garry Crossan", finalised_by: "Neil Kelly", finalised_at: "16 Jun 2026" },
    statements: [
      { statement: "BS", sort_order: 200, caption: "Debtors", note_no: 5, is_total: false, current_amount: 40606.0, prior_amount: 0 },
      { statement: "BS", sort_order: 210, caption: "Cash at bank and in hand", note_no: null, is_total: false, current_amount: 1741.0, prior_amount: 0 },
      { statement: "BS", sort_order: 9997, caption: "Total assets", note_no: null, is_total: true, current_amount: 42347.0, prior_amount: 0 },
      { statement: "BS", sort_order: 300, caption: "Creditors: amounts falling due within one year", note_no: 6, is_total: false, current_amount: 34802.34, prior_amount: 0 },
      { statement: "BS", sort_order: 9998, caption: "Total liabilities", note_no: null, is_total: true, current_amount: 34802.34, prior_amount: 0 },
      { statement: "BS", sort_order: 9999, caption: "Net assets", note_no: null, is_total: true, current_amount: 7544.66, prior_amount: 0 },
      { statement: "PL", sort_order: 1000, caption: "Turnover", note_no: 2, is_total: false, current_amount: 8524.66, prior_amount: 0 },
      { statement: "PL", sort_order: 1050, caption: "Other operating income", note_no: null, is_total: false, current_amount: 1270.0, prior_amount: 0 },
      { statement: "PL", sort_order: 1100, caption: "Administrative expenses", note_no: null, is_total: false, current_amount: -2250.0, prior_amount: 0 },
      { statement: "PL", sort_order: 9999, caption: "Profit for the financial year", note_no: null, is_total: true, current_amount: 7544.66, prior_amount: 0 },
    ],
    notes_analysis: [
      { note_no: 5, note_title: "Debtors", line_label: "Trade debtors", current_amount: 39606.0, prior_amount: 0 },
      { note_no: 5, note_title: "Debtors", line_label: "Amounts owed by group undertakings", current_amount: 1000.0, prior_amount: 0 },
      { note_no: 6, note_title: "Creditors: amounts falling due within one year", line_label: "Deferred income", current_amount: 30975.34, prior_amount: 0 },
      { note_no: 6, note_title: "Creditors: amounts falling due within one year", line_label: "Trade creditors and accruals", current_amount: 1320.0, prior_amount: 0 },
      { note_no: 6, note_title: "Creditors: amounts falling due within one year", line_label: "VAT payable", current_amount: 2507.0, prior_amount: 0 },
    ],
    notes_fixed_assets: [
      { line_label: "Fixtures & fittings", cost: 24000.0, depreciation: 4000.0, net_book_value: 20000.0 },
      { line_label: "Additions in the year", cost: 24000.0, depreciation: 0, net_book_value: 24000.0 },
    ],
    notes_related_party: [
      { kind: "Transaction", line_label: "Management fee recharged", counterparty: "Affinity Malta Ltd", amount: 1000.0 },
      { kind: "Balance", line_label: "Amounts owed by/(to) group undertakings", counterparty: "", amount: 1000.0 },
    ],
    notes_narrative: [
      { note_no: 1, title: "Accounting policies", sort_order: 1, body: "The financial statements have been prepared under the historical cost convention and in accordance with FRS 102 Section 1A, as revised by the FRC Periodic Review (effective for periods beginning on or after 1 January 2026). Revenue is recognised under the five-step model as performance obligations are satisfied. Leases are recognised on the balance sheet as right-of-use assets with corresponding lease liabilities, other than short-term and low-value leases. Monetary items in foreign currencies are translated at the rate ruling at the balance sheet date." },
      { note_no: 90, title: "Going concern", sort_order: 90, body: "The directors have assessed the company's ability to continue as a going concern and, having regard to its forecasts and available resources, consider it appropriate to prepare the financial statements on the going concern basis." },
      { note_no: 99, title: "Events after the reporting period", sort_order: 99, body: "There were no events after the reporting period requiring adjustment to, or disclosure in, the financial statements." },
    ],
  },

  IFRS: {
    entity: { company_code: "A00001", name: "Affinity (IOM) Limited", functional_ccy: "GBP" },
    framework: "IFRS", frameworkName: "IFRS",
    period: { end: "31 December 2026", prior: "31 December 2025", firstPeriod: true },
    workflow: { status: "draft", prepared_by: "Roxy Sheeley" },
    statements: [
      { statement: "BS", sort_order: 200, caption: "Trade and other receivables", note_no: null, is_total: false, current_amount: 40606.0, prior_amount: 0 },
      { statement: "BS", sort_order: 210, caption: "Cash and cash equivalents", note_no: null, is_total: false, current_amount: 1741.0, prior_amount: 0 },
      { statement: "BS", sort_order: 9997, caption: "Total assets", note_no: null, is_total: true, current_amount: 42347.0, prior_amount: 0 },
      { statement: "BS", sort_order: 300, caption: "Trade and other payables", note_no: null, is_total: false, current_amount: 34802.34, prior_amount: 0 },
      { statement: "BS", sort_order: 9998, caption: "Total liabilities", note_no: null, is_total: true, current_amount: 34802.34, prior_amount: 0 },
      { statement: "BS", sort_order: 9999, caption: "Net assets", note_no: null, is_total: true, current_amount: 7544.66, prior_amount: 0 },
      { statement: "PL", sort_order: 1000, caption: "Revenue", note_no: null, is_total: false, current_amount: 8524.66, prior_amount: 0 },
      { statement: "PL", sort_order: 1050, caption: "Other income", note_no: null, is_total: false, current_amount: 1270.0, prior_amount: 0 },
      { statement: "PL", sort_order: 1100, caption: "Operating expenses", note_no: null, is_total: false, current_amount: -2250.0, prior_amount: 0 },
      { statement: "PL", sort_order: 9999, caption: "Profit for the year", note_no: null, is_total: true, current_amount: 7544.66, prior_amount: 0 },
    ],
    notes_analysis: [], notes_fixed_assets: [], notes_related_party: [],
    notes_narrative: [
      { note_no: 1, title: "Material accounting policy information", sort_order: 1, body: "The financial statements have been prepared in accordance with IFRS. Revenue is recognised under IFRS 15 using the five-step model; leases are accounted for under IFRS 16, with right-of-use assets and lease liabilities recognised at commencement." },
    ],
  },

  TRUST: {
    entity: { company_code: "TR-SMITH", name: "Smith Family Trust", functional_ccy: "GBP" },
    framework: "TRUST", frameworkName: "Trust fiduciary accounts",
    period: { end: "31 December 2026", prior: "31 December 2025", firstPeriod: true },
    workflow: { status: "approved", prepared_by: "Joanne Fenech", reviewed_by: "Joanne Fenech", approved_by: "Garry Crossan" },
    statements: [
      { statement: "IC", sort_order: 100, caption: "Income arising", note_no: null, is_total: false, current_amount: 5000.0, prior_amount: 0 },
      { statement: "IC", sort_order: 110, caption: "Expenses chargeable to income", note_no: null, is_total: false, current_amount: -400.0, prior_amount: 0 },
      { statement: "IC", sort_order: 120, caption: "Distributions to income beneficiaries", note_no: null, is_total: false, current_amount: -3000.0, prior_amount: 0 },
      { statement: "IC", sort_order: 9998, caption: "Undistributed income carried forward", note_no: null, is_total: true, current_amount: 1600.0, prior_amount: 0 },
      { statement: "IC", sort_order: 200, caption: "Capital / settled property", note_no: null, is_total: false, current_amount: 100000.0, prior_amount: 0 },
      { statement: "IC", sort_order: 210, caption: "Expenses chargeable to capital", note_no: null, is_total: false, current_amount: -600.0, prior_amount: 0 },
      { statement: "IC", sort_order: 220, caption: "Capital distributions", note_no: null, is_total: false, current_amount: -10000.0, prior_amount: 0 },
      { statement: "IC", sort_order: 9999, caption: "Capital fund carried forward", note_no: null, is_total: true, current_amount: 89400.0, prior_amount: 0 },
      { statement: "AL", sort_order: 300, caption: "Cash at bank", note_no: null, is_total: false, current_amount: 91000.0, prior_amount: 0 },
      { statement: "AL", sort_order: 9999, caption: "Net assets of the trust", note_no: null, is_total: true, current_amount: 91000.0, prior_amount: 0 },
    ],
    notes_analysis: [], notes_fixed_assets: [], notes_related_party: [],
    notes_narrative: [
      { note_no: 1, title: "Basis of preparation", sort_order: 1, body: "These fiduciary accounts present the income and capital of the trust separately, in accordance with the trust deed. Expenses are apportioned between income and capital as required by the deed (40% income / 60% capital), and distributions are recorded against the relevant fund." },
    ],
  },
};

const FRAMEWORKS = [
  { code: "FRS102_1A", short: "FRS 102 1A" },
  { code: "IFRS", short: "IFRS" },
  { code: "GAPSME", short: "Malta GAPSME" },
  { code: "TRUST", short: "Trust" },
];

const STATEMENT_TITLES = {
  BS: "Statement of financial position",
  PL: "Income statement",
  IC: "Income & capital account",
  AL: "Statement of assets & liabilities",
  EQ: "Statement of changes in equity",
};

const STATUS_STYLE = {
  draft:      { label: "Draft",      fg: "#5A6B86", bg: "#EEF1F6", dot: "#8C9BB5" },
  in_review:  { label: "In review",  fg: "#9A6B12", bg: "#FBF1DD", dot: "#C9912E" },
  approved:   { label: "Approved",   fg: "#0E7A6B", bg: "#DBF3EE", dot: "#19B9B0" },
  finalised:  { label: "Finalised",  fg: "#137A52", bg: "#DBF1E5", dot: "#1F9D6B" },
};

const CCY = { GBP: "\u00A3", EUR: "\u20AC", USD: "$" };

const C = {
  navy: "#001242", panel: "#0A1E54", teal: "#19B9B0", pink: "#FF2D78",
  ink: "#14233B", slate: "#5A6B86", hair: "#DCE2EC", paperTint: "#F7F8FA",
};

function money(n, sym) {
  if (n === 0 || n === null || n === undefined) return "\u2013"; // en dash for nil
  const neg = n < 0;
  const s = Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return neg ? `(${sym}${s})` : `${sym}${s}`;
}

function Figure({ value, sym, bold }) {
  const neg = value < 0;
  return (
    <span style={{
      fontVariantNumeric: "tabular-nums lining-nums",
      fontFeatureSettings: '"tnum" 1, "lnum" 1',
      color: neg ? C.pink : C.ink,
      fontWeight: bold ? 600 : 400,
      whiteSpace: "nowrap",
    }}>{money(value, sym)}</span>
  );
}

function StatementBlock({ code, rows, sym, periodEnd, periodPrior }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h3 style={{
        margin: "0 0 2px", fontFamily: "var(--serif)", fontSize: 17, fontWeight: 600,
        color: C.navy, letterSpacing: 0.2,
      }}>{STATEMENT_TITLES[code] || code}</h3>
      <div style={{ height: 2, background: C.teal, width: 48, marginBottom: 12 }} />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: C.slate, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>
            <th style={{ textAlign: "left", fontWeight: 600, padding: "0 0 8px" }}></th>
            <th style={{ textAlign: "center", fontWeight: 600, padding: "0 0 8px", width: 44 }}>Note</th>
            <th style={{ textAlign: "right", fontWeight: 600, padding: "0 0 8px", width: 130 }}>{periodEnd}</th>
            <th style={{ textAlign: "right", fontWeight: 600, padding: "0 0 8px", width: 130 }}>{periodPrior}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const grand = r.is_total && r.sort_order === 9999;
            const sub = r.is_total && r.sort_order !== 9999;
            return (
              <tr key={i}>
                <td style={{
                  padding: grand ? "12px 0 4px" : "5px 0", color: C.ink,
                  fontFamily: "var(--serif)", fontSize: 14.5,
                  fontWeight: r.is_total ? 600 : 400,
                }}>{r.caption}</td>
                <td style={{ textAlign: "center", color: C.slate, fontSize: 12.5 }}>
                  {r.note_no || ""}
                </td>
                {["current_amount", "prior_amount"].map((k) => (
                  <td key={k} style={{
                    textAlign: "right", fontSize: 14.5, padding: grand ? "12px 0 4px" : "5px 0",
                    borderTop: sub ? `1px solid ${C.hair}` : grand ? `1.5px solid ${C.navy}` : "none",
                    boxShadow: grand ? `0 4px 0 -2.5px ${C.navy}` : "none", // double-rule under grand total
                  }}>
                    <Figure value={r[k]} sym={sym} bold={r.is_total} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function NoteTable({ title, no, rows, sym, periodEnd, periodPrior }) {
  const total = rows.reduce((a, r) => a + r.current_amount, 0);
  const totalP = rows.reduce((a, r) => a + r.prior_amount, 0);
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontFamily: "var(--serif)", fontWeight: 600, color: C.navy, fontSize: 14.5, marginBottom: 6 }}>
        <span style={{ color: C.teal, marginRight: 8 }}>{no}.</span>{title}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ padding: "3px 0", color: C.ink, fontSize: 13.5 }}>{r.line_label}</td>
              <td style={{ textAlign: "right", width: 130, fontSize: 13.5 }}><Figure value={r.current_amount} sym={sym} /></td>
              <td style={{ textAlign: "right", width: 130, fontSize: 13.5 }}><Figure value={r.prior_amount} sym={sym} /></td>
            </tr>
          ))}
          <tr>
            <td style={{ padding: "6px 0 0", fontSize: 13.5, fontWeight: 600, color: C.ink }}></td>
            <td style={{ textAlign: "right", borderTop: `1px solid ${C.navy}`, padding: "6px 0 0" }}><Figure value={total} sym={sym} bold /></td>
            <td style={{ textAlign: "right", borderTop: `1px solid ${C.navy}`, padding: "6px 0 0" }}><Figure value={totalP} sym={sym} bold /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SignOff({ wf }) {
  const steps = [
    { key: "prepared", label: "Prepared", who: wf.prepared_by },
    { key: "reviewed", label: "Reviewed", who: wf.reviewed_by },
    { key: "approved", label: "Approved", who: wf.approved_by },
    { key: "finalised", label: "Finalised", who: wf.finalised_by },
  ];
  const order = ["draft", "in_review", "approved", "finalised"];
  const reached = (key) => {
    const s = order.indexOf(wf.status);
    return { prepared: s >= 0, reviewed: s >= 1, approved: s >= 2, finalised: s >= 3 }[key];
  };
  return (
    <div>
      {steps.map((st, i) => {
        const done = reached(st.key) && st.who;
        return (
          <div key={st.key} style={{ display: "flex", gap: 12, position: "relative", paddingBottom: i < 3 ? 18 : 0 }}>
            {i < 3 && <div style={{ position: "absolute", left: 6, top: 16, bottom: 0, width: 2, background: done ? C.teal : "rgba(255,255,255,0.15)" }} />}
            <div style={{
              width: 14, height: 14, borderRadius: "50%", marginTop: 2, flexShrink: 0,
              background: done ? C.teal : "transparent",
              border: done ? `none` : `2px solid rgba(255,255,255,0.25)`,
              boxShadow: done ? `0 0 0 3px rgba(25,185,176,0.18)` : "none",
            }} />
            <div>
              <div style={{ color: done ? "#fff" : "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: 600 }}>{st.label}</div>
              <div style={{ color: done ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.3)", fontSize: 12 }}>
                {done ? st.who : "\u2014"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AffinityAccounts() {
  const [fw, setFw] = useState("FRS102_1A");
  const data = SAMPLE[fw];
  const available = !!data;
  const sym = data ? CCY[data.entity.functional_ccy] || data.entity.functional_ccy + " " : "\u00A3";

  const grouped = useMemo(() => {
    if (!data) return [];
    const order = ["BS", "PL", "EQ", "IC", "AL"];
    const map = {};
    data.statements.forEach((s) => { (map[s.statement] = map[s.statement] || []).push(s); });
    return order.filter((k) => map[k]).map((k) => ({ code: k, rows: map[k].sort((a, b) => a.sort_order - b.sort_order) }));
  }, [data]);

  const analysisNotes = useMemo(() => {
    if (!data) return [];
    const m = {};
    data.notes_analysis.forEach((n) => { (m[n.note_no] = m[n.note_no] || { no: n.note_no, title: n.note_title, rows: [] }).rows.push(n); });
    return Object.values(m).sort((a, b) => a.no - b.no);
  }, [data]);

  const st = data ? STATUS_STYLE[data.workflow.status] : null;

  return (
    <div style={{ "--serif": "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif",
                  fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
                  background: "#EAEDF3", minHeight: "100vh", color: C.ink }}>
      <style>{`
        @media (prefers-reduced-motion: no-preference){ .fade-key{ animation: fk .28s ease both } }
        @keyframes fk { from{ opacity:0; transform: translateY(4px) } to{ opacity:1; transform:none } }
        .fw-btn:hover{ background: rgba(255,255,255,0.10) !important }
      `}</style>

      {/* top bar */}
      <header style={{ background: C.navy, padding: "16px 26px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ color: C.teal, fontWeight: 800, letterSpacing: 3, fontSize: 20 }}>AFFINITY</span>
          <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 300, letterSpacing: 2, fontSize: 14 }}>CORE · ACCOUNTS</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#fff", fontFamily: "var(--serif)", fontSize: 15 }}>{data ? data.entity.name : "\u2014"}</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{data ? `${data.entity.company_code} · year ended ${data.period.end}` : ""}</div>
        </div>
      </header>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, maxWidth: 1180, margin: "0 auto" }}>
        {/* left rail */}
        <aside style={{ width: 252, background: C.panel, color: "#fff", minHeight: "calc(100vh - 64px)", padding: "22px 20px", flexShrink: 0 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Framework</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 28 }}>
            {FRAMEWORKS.map((f) => {
              const active = f.code === fw;
              const exists = !!SAMPLE[f.code];
              return (
                <button key={f.code} className="fw-btn" onClick={() => setFw(f.code)} style={{
                  textAlign: "left", border: "none", cursor: "pointer", borderRadius: 7,
                  padding: "9px 12px", fontSize: 13.5, fontWeight: active ? 700 : 500,
                  color: active ? "#fff" : "rgba(255,255,255,0.7)",
                  background: active ? "rgba(255,45,120,0.16)" : "transparent",
                  borderLeft: active ? `3px solid ${C.pink}` : "3px solid transparent",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span>{f.short}</span>
                  {!exists && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>n/a</span>}
                </button>
              );
            })}
          </div>

          {data && (
            <>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Status</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "6px 12px", marginBottom: 26 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: st.dot }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{st.label}</span>
              </div>

              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>Sign-off</div>
              <SignOff wf={data.workflow} />
            </>
          )}
        </aside>

        {/* document */}
        <main key={fw} className="fade-key" style={{ flex: 1, padding: "30px 40px 60px", background: "#fff", minHeight: "calc(100vh - 64px)" }}>
          {!available ? (
            <div style={{ color: C.slate, fontSize: 15, padding: "60px 0", textAlign: "center" }}>
              No accounts set for this framework yet.<br />
              <span style={{ fontSize: 13 }}>Map the chart of accounts under {fw} in the FS taxonomy, then assemble.</span>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600, color: C.navy }}>{data.entity.name}</div>
                <div style={{ color: C.slate, fontSize: 14 }}>Financial statements · {data.frameworkName} · year ended {data.period.end}</div>
                {data.period.firstPeriod && (
                  <div style={{ color: C.slate, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                    First reporting period — prior-year comparatives shown as nil.
                  </div>
                )}
              </div>

              {grouped.map((g) => (
                <StatementBlock key={g.code} code={g.code} rows={g.rows} sym={sym}
                  periodEnd={data.period.end.replace(/ \d{4}$/, (m) => m)} periodPrior={data.period.prior} />
              ))}

              {/* notes */}
              {(analysisNotes.length || data.notes_fixed_assets.length || data.notes_related_party.length || data.notes_narrative.length) > 0 && (
                <section style={{ marginTop: 10 }}>
                  <h3 style={{ margin: "0 0 2px", fontFamily: "var(--serif)", fontSize: 17, fontWeight: 600, color: C.navy }}>
                    Notes to the financial statements
                  </h3>
                  <div style={{ height: 2, background: C.teal, width: 48, marginBottom: 16 }} />

                  {data.notes_narrative.filter((n) => n.sort_order <= 1).map((n) => (
                    <div key={n.note_no} style={{ marginBottom: 18 }}>
                      <div style={{ fontFamily: "var(--serif)", fontWeight: 600, color: C.navy, fontSize: 14.5, marginBottom: 4 }}>
                        <span style={{ color: C.teal, marginRight: 8 }}>{n.note_no}.</span>{n.title}
                      </div>
                      <p style={{ margin: 0, color: C.ink, fontSize: 13.5, lineHeight: 1.62, maxWidth: 720 }}>{n.body}</p>
                    </div>
                  ))}

                  {analysisNotes.map((n) => (
                    <NoteTable key={n.no} no={n.no} title={n.title} rows={n.rows} sym={sym} />
                  ))}

                  {data.notes_fixed_assets.length > 0 && (
                    <div style={{ marginBottom: 22 }}>
                      <div style={{ fontFamily: "var(--serif)", fontWeight: 600, color: C.navy, fontSize: 14.5, marginBottom: 6 }}>
                        <span style={{ color: C.teal, marginRight: 8 }}>3.</span>Tangible fixed assets
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ color: C.slate, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>
                            <th style={{ textAlign: "left", padding: "0 0 6px" }}></th>
                            <th style={{ textAlign: "right", padding: "0 0 6px", width: 120 }}>Cost</th>
                            <th style={{ textAlign: "right", padding: "0 0 6px", width: 120 }}>Depreciation</th>
                            <th style={{ textAlign: "right", padding: "0 0 6px", width: 120 }}>Net book value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.notes_fixed_assets.map((fa, i) => (
                            <tr key={i}>
                              <td style={{ padding: "3px 0", fontSize: 13.5, color: C.ink, fontStyle: fa.line_label.startsWith("Additions") ? "italic" : "normal" }}>{fa.line_label}</td>
                              <td style={{ textAlign: "right", fontSize: 13.5 }}><Figure value={fa.cost} sym={sym} /></td>
                              <td style={{ textAlign: "right", fontSize: 13.5 }}><Figure value={fa.depreciation} sym={sym} /></td>
                              <td style={{ textAlign: "right", fontSize: 13.5 }}><Figure value={fa.net_book_value} sym={sym} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {data.notes_related_party.length > 0 && (
                    <div style={{ marginBottom: 22 }}>
                      <div style={{ fontFamily: "var(--serif)", fontWeight: 600, color: C.navy, fontSize: 14.5, marginBottom: 6 }}>
                        <span style={{ color: C.teal, marginRight: 8 }}>9.</span>Related party transactions
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <tbody>
                          {data.notes_related_party.map((rp, i) => (
                            <tr key={i}>
                              <td style={{ padding: "3px 0", fontSize: 13.5, color: C.slate, width: 92 }}>{rp.kind}</td>
                              <td style={{ padding: "3px 0", fontSize: 13.5, color: C.ink }}>{rp.line_label}{rp.counterparty ? ` — ${rp.counterparty}` : ""}</td>
                              <td style={{ textAlign: "right", fontSize: 13.5, width: 120 }}><Figure value={rp.amount} sym={sym} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {data.notes_narrative.filter((n) => n.sort_order > 1).map((n) => (
                    <div key={n.note_no} style={{ marginBottom: 18 }}>
                      <div style={{ fontFamily: "var(--serif)", fontWeight: 600, color: C.navy, fontSize: 14.5, marginBottom: 4 }}>
                        <span style={{ color: C.teal, marginRight: 8 }}>{n.note_no}.</span>{n.title}
                      </div>
                      <p style={{ margin: 0, color: C.ink, fontSize: 13.5, lineHeight: 1.62, maxWidth: 720 }}>{n.body}</p>
                    </div>
                  ))}
                </section>
              )}

              <footer style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${C.hair}`, color: C.slate, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                <span>Generated by Affinity Core accounting engine</span>
                <span>{data.workflow.status === "finalised" ? `Finalised by ${data.workflow.finalised_by} · ${data.workflow.finalised_at}` : "Draft — not yet finalised"}</span>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
