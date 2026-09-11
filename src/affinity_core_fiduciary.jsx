import { useState, useEffect } from "react";
import * as FID from "./affinity_fiduciary_api";
import { isConfigured } from "./affinity_accounting_supabase";
import EntitySearch from "./affinity_entity_search";

// ─────────────────────────────────────────────────────────────────────────────
// FIDUCIARY REPORTING — trust accounting and statutory accounts
//
// Both had a complete database layer and no interface, which is the exact
// state the wiring audit exists to find.
//
// Two things drive the design:
//
//   TRUST: income and capital are shown side by side and NEVER summed. A
//   distribution from the wrong fund changes the beneficiary's entitlement and
//   the tax treatment, so the fund is the most prominent thing on the screen
//   and the distribution form asks the fund before the amount.
//
//   ACCOUNTS: a set cannot be finalised until a qualified person has authored
//   and verified the disclosure checklist for its framework. Rather than hide
//   that, the module leads with it — because a screen that produced
//   good-looking accounts on an unverified basis would be the most dangerous
//   thing in this system.
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = "#001242", CYAN = "#00C4CC", MUT = "#5B6B7B", LINE = "#D9DEE5";
const RED = "#A32D2D", RED_BG = "#FCEBEB", AMB = "#7B4F1D", AMB_BG = "#FDF4DC",
      GRN = "#1F6F54", GRN_BG = "#E7F4EF";

const TABS = [
  { id: "trusts",     label: "Trusts" },
  { id: "benef",      label: "Beneficiaries" },
  { id: "dists",      label: "Distributions" },
  { id: "accounts",   label: "Statutory accounts" },
  { id: "frameworks", label: "Frameworks" },
];

const money = (v, ccy) => v == null || v === "" ? "—"
  : (ccy ? ccy + " " : "") + Number(v).toLocaleString("en-GB",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d) => d ? String(d).split("-").reverse().join("/") : "—";

const th = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "#fff",
             background: NAVY, padding: "8px 10px", textTransform: "uppercase",
             letterSpacing: "0.4px", whiteSpace: "nowrap" };
const td = { padding: "8px 10px", fontSize: 12, borderBottom: "0.5px solid " + LINE,
             verticalAlign: "top" };
const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const card = { background: "#fff", border: "0.5px solid " + LINE, borderRadius: 10,
               padding: "14px 16px", marginBottom: 14 };
const btn = (primary) => ({
  padding: "5px 12px", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
  border: primary ? "none" : "0.5px solid " + LINE,
  background: primary ? CYAN : "transparent", color: primary ? "#fff" : "#333",
});
const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 600, padding: "2px 7px",
                            borderRadius: 20, background: bg, color: fg, whiteSpace: "nowrap" });

function Empty({ what, why }) {
  return (
    <div style={{ padding: "26px 18px", textAlign: "center", color: MUT, fontSize: 12.5,
                  lineHeight: 1.7 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "#333" }}>Nothing to show — {what}</div>
      {why && <div style={{ maxWidth: "36em", margin: "0 auto" }}>{why}</div>}
    </div>
  );
}

function Table({ cols, rows, render, empty }) {
  return rows && rows.length ? (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{cols.map((c) => <th key={c} style={th}>{c}</th>)}</tr></thead>
        <tbody>{rows.map(render)}</tbody>
      </table>
    </div>
  ) : empty;
}


// ─────────────────────────────────────────────────────────────────────────────
// TRUST TRANSACTIONS
//
// The trust tabs READ — position, beneficiaries, distributions, the overview —
// and nothing could be recorded. trustRecordIncome, trustRecordCapital,
// trustRecordExpense, trustDistribute and trustFundCheck were all wrapped and
// unreachable. So a trustee could see that the income fund held £40,000 and
// had no way to pay any of it to a life tenant.
//
// EVERY FORM HERE ASKS WHICH FUND, and it is never defaulted. Income belongs
// to the life tenant; capital belongs to the remaindermen. Paying capital as
// income is a breach of trust rather than a misposting, and a field that
// defaults is a field people stop reading.
// ─────────────────────────────────────────────────────────────────────────────
const TRUST_FORMS = {
  income: {
    title: "Record trust income",
    note: "Income belongs to the life tenant. Recording it as capital, or capital as income, is a breach of trust rather than a misposting — which is why the fund is asked rather than assumed.",
    cta: "Record the income",
    fields: [["trustId", "Trust entity id", true, ""], ["date", "Date", true, "YYYY-MM-DD"],
             ["bankId", "Bank account id", true, ""],
             ["incomeAcct", "Income account id", true, ""],
             ["amount", "Amount", true, ""], ["narrative", "Narrative", false, ""]],
  },
  capital: {
    title: "Record trust capital",
    note: "Capital belongs to the remaindermen. It is a separate fund and is never summed with income, including in the totals.",
    cta: "Record the capital",
    fields: [["trustId", "Trust entity id", true, ""], ["date", "Date", true, "YYYY-MM-DD"],
             ["bankId", "Bank account id", true, ""],
             ["capitalAcct", "Capital account id", true, ""],
             ["amount", "Amount", true, ""], ["narrative", "Narrative", false, ""]],
  },
  expense: {
    title: "Record a trust expense",
    note: "Which fund bears the expense is a trustee's decision with real consequences for the beneficiaries, so it is recorded explicitly rather than apportioned automatically.",
    cta: "Record the expense",
    fields: [["trustId", "Trust entity id", true, ""], ["date", "Date", true, "YYYY-MM-DD"],
             ["bankId", "Bank account id", true, ""],
             ["expenseAcct", "Expense account id", true, ""],
             ["fund", "Borne by which fund", true, "income / capital"],
             ["amount", "Amount", true, ""], ["narrative", "Narrative", false, ""]],
  },
  distribute: {
    title: "Distribute to a beneficiary",
    note: "The fund is required. Core checks there is enough in THAT fund — not enough in the trust — because a trust with ample capital and no income cannot pay an income distribution.",
    cta: "Record the distribution",
    fields: [["trustId", "Trust entity id", true, ""],
             ["beneficiaryId", "Beneficiary id", true, ""],
             ["date", "Date", true, "YYYY-MM-DD"],
             ["fund", "From which fund", true, "income / capital"],
             ["amount", "Amount", true, ""],
             ["bankId", "Bank account id", true, ""],
             ["narrative", "Narrative", false, ""]],
  },
};

function TrustForm({ kind, f, setF, msg, busy, onCancel, onSave }) {
  if (!kind) return null;
  const d = TRUST_FORMS[kind];
  if (!d) return null;
  return (
    <div onClick={(e) => e.target === e.currentTarget && onCancel()}
         style={{ position: "fixed", inset: 0, background: "rgba(0,18,66,0.45)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 1200, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "22px 24px",
                    width: "min(640px,100%)", maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#001242", marginBottom: 6 }}>
          {d.title}
        </div>
        <div style={{ fontSize: 11.5, color: "#5B6B7B", lineHeight: 1.7, marginBottom: 14 }}>
          {d.note}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
          {d.fields.map(([k, lab, req, ph]) => (
            <div key={k} style={{ gridColumn: k === "narrative" ? "1/-1" : "auto" }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600,
                              color: "#555", marginBottom: 4 }}>
                {lab}{req && <span style={{ color: "#A32D2D" }}> *</span>}
              </label>
              {k === "fund" ? (
                <select value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })}
                        style={{ width: "100%", height: 34, fontSize: 12.5, borderRadius: 6,
                                 border: "0.5px solid #ccc", padding: "0 8px" }}>
                  <option value="">— choose —</option>
                  <option value="income">Income</option>
                  <option value="capital">Capital</option>
                </select>
              ) : (
                <input value={f[k] || ""} placeholder={ph}
                       onChange={(e) => setF({ ...f, [k]: e.target.value })}
                       style={{ width: "100%", height: 34, fontSize: 12.5, borderRadius: 6,
                                border: "0.5px solid #ccc", padding: "0 8px" }} />
              )}
            </div>
          ))}
        </div>
        {msg && (
          <div style={{ marginTop: 14, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                        lineHeight: 1.6, background: "#FCEBEB", border: "0.5px solid #f0c9c9",
                        color: "#A32D2D", whiteSpace: "pre-wrap" }}>{msg}</div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button style={{ padding: "6px 13px", borderRadius: 6, fontSize: 11.5,
                           cursor: "pointer", border: "0.5px solid #D9DEE5",
                           background: "transparent" }} onClick={onCancel}>Cancel</button>
          <button style={{ padding: "6px 13px", borderRadius: 6, fontSize: 11.5,
                           cursor: "pointer", border: "none", background: "#00C4CC",
                           color: "#fff" }} onClick={onSave} disabled={busy}>{d.cta}</button>
        </div>
      </div>
    </div>
  );
}

export default function AffinityFiduciary({ onNav }) {
  const [tab, setTab]       = useState("trusts");
  const [entity, setEntity] = useState("");
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState("");
  const [live, setLive]     = useState(false);

  // Recording trust transactions. The tabs read and nothing could be written,
  // so a trustee could see the income fund held money and had no way to pay
  // any of it to a life tenant.
  const [tForm, setTForm] = useState(null);
  const [tF, setTF]       = useState({});
  const [tMsg, setTMsg]   = useState("");
  const [tBusy, setTBusy] = useState(false);

  const runTForm = async () => {
    setTBusy(true); setTMsg("");
    const v = tF;
    const n = (x) => (x === "" || x == null ? null : Number(x));
    let r;
    try {
      if (tForm === "income")
        r = await FID.trustRecordIncome({ trustId: n(v.trustId), date: v.date,
              bankAccountId: n(v.bankId), incomeAccountId: n(v.incomeAcct),
              amount: n(v.amount), description: v.narrative });
      if (tForm === "capital")
        r = await FID.trustRecordCapital({ trustId: n(v.trustId), date: v.date,
              bankAccountId: n(v.bankId), capitalAccountId: n(v.capitalAcct),
              amount: n(v.amount), description: v.narrative });
      if (tForm === "expense")
        r = await FID.trustRecordExpense({ trustId: n(v.trustId), date: v.date,
              bankAccountId: n(v.bankId), expenseAccountId: n(v.expenseAcct),
              amount: n(v.amount), fund: v.fund, apportion: false,
              description: v.narrative });
      if (tForm === "distribute")
        r = await FID.trustDistribute({ trustId: n(v.trustId),
              beneficiaryId: n(v.beneficiaryId), date: v.date, fund: v.fund,
              amount: n(v.amount), bankAccountId: n(v.bankId),
              description: v.narrative });
    } catch (e) {
      r = { ok: false, live: true, error: String((e && e.message) || e) };
    }
    setTBusy(false);
    if (r && r.ok) { setTForm(null); setTF({}); setTMsg(""); load(); return; }
    if (r && r.live === false) { setTMsg("Not signed in — that cannot be recorded."); return; }
    setTMsg((r && r.error) || "That could not be recorded.");
  };

  const [trusts, setTrusts]   = useState([]);
  const [benef, setBenef]     = useState([]);
  const [dists, setDists]     = useState([]);
  const [tOver, setTOver]     = useState([]);
  const [sets, setSets]       = useState([]);
  const [frameworks, setFrameworks] = useState([]);
  const [selSet, setSelSet]   = useState(null);
  const [readiness, setReadiness]   = useState([]);
  const [statements, setStatements] = useState({});
  // Authoring: the outstanding list, plus whichever framework is being worked on
  const [authoring, setAuthoring] = useState([]);
  const [authFw, setAuthFw]       = useState(null);
  const [captions, setCaptions]   = useState([]);
  const [fmtReady, setFmtReady]   = useState([]);
  const [discl, setDiscl]         = useState([]);
  const [authForm, setAuthForm]   = useState(null);
  const [af, setAf]               = useState({});
  const [authMsg, setAuthMsg]     = useState("");

  const load = async () => {
    setBusy(true); setMsg("");
    const res = await Promise.all([
      FID.trustPosition(null), FID.trustBeneficiaries(null),
      FID.trustDistributions(null, null, 200), FID.trustOverview(null),
      FID.accountsSetsList(null), FID.frameworkFormatStatus(),
    ]);
    setBusy(false);
    const anyLive = res.some((r) => r && r.live);
    setLive(anyLive);
    if (!anyLive) {
      setMsg("Not signed in — these figures come from the database and cannot be read yet.");
      return;
    }
    const [tp, tb, tdist, to, as, ff] = res;
    setTrusts(tp.data || []);  setBenef(tb.data || []);
    setDists(tdist.data || []); setTOver(to.data || []);
    setSets(as.data || []);    setFrameworks(ff.data || []);
    const failed = res.filter((r) => r && r.live && !r.ok);
    if (failed.length) setMsg(failed[0].error);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === "frameworks") loadAuthoring(); }, [tab]);

  const loadAuthoring = async () => {
    const r = await FID.authoringOutstanding();
    if (!r.live) { setAuthMsg("Not signed in — this reads from the database."); return; }
    setAuthoring(r.data || []);
    if (!r.ok) setAuthMsg(r.error);
  };

  const openFramework = async (f) => {
    setAuthFw(f); setAuthMsg(""); setCaptions([]); setFmtReady([]); setDiscl([]);
    const calls = [FID.accountsDisclosures ? Promise.resolve({ ok: true, live: true, data: [] })
                                           : Promise.resolve({ ok: true, live: true, data: [] })];
    if (f.has_format || f.captions > 0) {
      const [c, rd] = await Promise.all([
        FID.fsCaptionsList(f.fs_framework_code || f.framework),
        FID.fsFormatReadiness(f.fs_framework_code || f.framework),
      ]);
      setCaptions(c.data || []); setFmtReady(rd.data || []);
    }
    await calls[0];
  };

  const authAct = async (fn, okMsg) => {
    setAuthMsg("");
    const res = await fn();
    if (res && res.ok) {
      setAuthMsg(okMsg || "Saved.");
      setAuthForm(null); setAf({});
      await loadAuthoring();
      if (authFw) await openFramework(authFw);
      return;
    }
    if (res && res.live === false) { setAuthMsg("Not signed in — this cannot be saved yet."); return; }
    setAuthMsg((res && res.error) || "That could not be saved.");
  };

  const openSet = async (s) => {
    setSelSet(s); setBusy(true);
    const [rd, is, bs, eq, cf] = await Promise.all([
      FID.accountsReadiness(s.id),
      FID.accountsStatement(s.id, "income_statement"),
      FID.accountsStatement(s.id, "balance_sheet"),
      FID.accountsStatement(s.id, "equity"),
      FID.accountsStatement(s.id, "cash_flow"),
    ]);
    setBusy(false);
    setReadiness(rd.data || []);
    setStatements({ income_statement: is.data || [], balance_sheet: bs.data || [],
                    equity: eq.data || [], cash_flow: cf.data || [] });
  };

  const act = async (fn, ok) => {
    setBusy(true); setMsg("");
    const res = await fn();
    setBusy(false);
    if (res && res.ok) { setMsg(ok || "Done."); load(); if (selSet) openSet(selSet); return; }
    if (res && res.live === false) { setMsg("Not signed in — this cannot be done yet."); return; }
    setMsg((res && res.error) || "That could not be completed.");
  };

  const critical = tOver.filter((r) => r.severity === "critical" && Number(r.count_value) > 0);

  // ── Trusts ────────────────────────────────────────────────────────────────
  const Trusts = () => (
    <div>
      <div style={{ ...card, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ fontSize:11, color:MUT, lineHeight:1.7, flex:1, minWidth:240 }}>
          Income and capital are separate funds and are never summed. Every entry asks which
          fund, and it is not defaulted — paying capital as income is a breach of trust
          rather than a misposting.
        </div>
        <button style={btn(true)} onClick={()=>{ setTForm("income"); setTF({}); setTMsg(""); }}>
          ＋ Income
        </button>
        <button style={btn(true)} onClick={()=>{ setTForm("capital"); setTF({}); setTMsg(""); }}>
          ＋ Capital
        </button>
        <button style={btn(false)} onClick={()=>{ setTForm("expense"); setTF({}); setTMsg(""); }}>
          ＋ Expense
        </button>
        <button style={btn(false)} title="Core checks there is enough in that fund, not in the trust"
                onClick={()=>{ setTForm("distribute"); setTF({}); setTMsg(""); }}>
          ＋ Distribution
        </button>
      </div>
      {critical.length > 0 && (
        <div style={{ ...card, background: RED_BG, borderColor: "#f0c9c9" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 8 }}>
            NEEDS A TRUSTEE'S ATTENTION
          </div>
          {critical.map((r, i) => (
            <div key={i} style={{ fontSize: 12.5, color: RED, padding: "3px 0" }}>
              <strong>{r.count_value}</strong> {r.headline} — {r.area}
              {r.amount_value != null && <span> ({money(r.amount_value)})</span>}
            </div>
          ))}
          <div style={{ fontSize: 11, color: RED, marginTop: 8, lineHeight: 1.7 }}>
            A distribution recorded but not posted means the trust's records and its books
            disagree. A fund distributed beyond what it received means capital has been paid
            out as income, which changes what each beneficiary is entitled to.
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 4,
                      textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Trusts — income and capital shown separately
        </div>
        <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.7 }}>
          The two funds are never combined. A single balance would hide the distinction that
          determines each beneficiary's entitlement and the tax treatment of what they
          receive.
        </div>
        <Table
          cols={["Trust", "Apportionment", "Income distributed", "Capital distributed",
                 "Beneficiaries", "Last distribution"]}
          rows={trusts}
          render={(t, i) => (
            <tr key={i}>
              <td style={{ ...td, fontWeight: 600 }}>{t.trust_name}</td>
              <td style={td}>
                {t.income_pct == null ? (
                  <span style={pill(AMB_BG, AMB)}>not set</span>
                ) : (
                  <span style={{ fontSize: 11.5 }}>
                    income {Number(t.income_pct).toFixed(0)}% / capital {Number(t.capital_pct).toFixed(0)}%
                  </span>
                )}
              </td>
              <td style={num}>{money(t.income_distributed, t.ccy)}</td>
              <td style={num}>{money(t.capital_distributed, t.ccy)}</td>
              <td style={num}>{t.beneficiaries}</td>
              <td style={td}>{fmtD(t.last_distribution)}</td>
            </tr>
          )}
          empty={<Empty what="no trusts are recorded"
                        why="A trust appears here once it has beneficiaries or is flagged as a trust entity." />}
        />
      </div>
    </div>
  );

  // ── Beneficiaries ─────────────────────────────────────────────────────────
  const Beneficiaries = () => (
    <div style={card}>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 4,
                    textTransform: "uppercase", letterSpacing: "0.4px" }}>
        Beneficiaries
      </div>
      <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.7 }}>
        What each beneficiary has received, split by fund. A life tenant is normally entitled
        to income and a remainderman to capital, so the split matters more than the total.
      </div>
      <Table
        cols={["Trust", "Beneficiary", "Type", "Income received", "Capital received",
               "Distributions", "Last"]}
        rows={benef}
        render={(b) => (
          <tr key={b.id} style={b.is_active ? undefined : { opacity: 0.55 }}>
            <td style={td}>{b.trust_name}</td>
            <td style={{ ...td, fontWeight: 600 }}>
              {b.name}
              {!b.is_active && <span style={{ ...pill("#F1F3F7", MUT), marginLeft: 6 }}>inactive</span>}
            </td>
            <td style={{ ...td, color: MUT }}>{b.beneficiary_type || "—"}</td>
            <td style={num}>{money(b.income_received)}</td>
            <td style={num}>{money(b.capital_received)}</td>
            <td style={num}>{b.distributions}</td>
            <td style={td}>{fmtD(b.last_distribution)}</td>
          </tr>
        )}
        empty={<Empty what="no beneficiaries are recorded"
                      why="Beneficiaries are recorded against a trust and drive who may receive a distribution." />}
      />
    </div>
  );

  // ── Distributions ─────────────────────────────────────────────────────────
  const Distributions = () => (
    <div style={card}>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 4,
                    textTransform: "uppercase", letterSpacing: "0.4px" }}>
        Distributions
      </div>
      <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.7 }}>
        The fund is the column that matters: two distributions of the same amount to the same
        beneficiary mean different things depending on which fund they came from.
      </div>
      <Table
        cols={["Date", "Trust", "Beneficiary", "Fund", "Amount", "Posted"]}
        rows={dists}
        render={(d) => (
          <tr key={d.id} style={d.posted ? undefined : { background: RED_BG }}>
            <td style={td}>{fmtD(d.dist_date)}</td>
            <td style={td}>{d.trust_name}</td>
            <td style={{ ...td, fontWeight: 600 }}>{d.beneficiary_name || "—"}</td>
            <td style={td}>
              <span style={pill(d.fund === "income" ? GRN_BG : AMB_BG,
                                d.fund === "income" ? GRN : AMB)}>
                {d.fund}
              </span>
            </td>
            <td style={{ ...num, fontWeight: 600 }}>{money(d.amount)}</td>
            <td style={td}>
              {d.posted ? <span style={pill(GRN_BG, GRN)}>posted</span>
                        : <span style={pill(RED_BG, RED)}>not posted to the ledger</span>}
            </td>
          </tr>
        )}
        empty={<Empty what="no distributions are recorded" />}
      />
    </div>
  );

  // ── Statutory accounts ────────────────────────────────────────────────────
  const Accounts = () => {
    if (selSet) {
      const failed = readiness.filter((g) => !g.passed);
      const byCat = {};
      readiness.forEach((g) => { (byCat[g.category] = byCat[g.category] || []).push(g); });
      return (
        <div>
          <button style={{ ...btn(false), marginBottom: 12 }} onClick={() => setSelSet(null)}>
            ← All accounts sets
          </button>

          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: NAVY }}>
                  {selSet.entity_name}
                </div>
                <div style={{ fontSize: 12, color: MUT, marginTop: 3 }}>
                  {selSet.framework_name} · {fmtD(selSet.period_start)} to {fmtD(selSet.period_end)}
                  {!selSet.has_comparatives && " · no comparatives"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={pill(selSet.status === "approved" ? GRN_BG
                                : selSet.status === "finalised" ? AMB_BG : "#F1F3F7",
                                selSet.status === "approved" ? GRN
                                : selSet.status === "finalised" ? AMB : MUT)}>
                  {selSet.status}
                </span>
                {/* The order is draft -> approved -> finalised. The directors
                    approve; finalisation locks afterwards. Every readiness gate
                    is checked at APPROVAL, because a director should not be
                    asked to sign a set with outstanding disclosures. */}
                {selSet.status === "draft" && (
                  <>
                    <button style={btn(false)} disabled={busy}
                            onClick={() => act(() => FID.accountsGenerateAll(selSet.id),
                                               "Statements regenerated.")}>
                      Regenerate
                    </button>
                    <button style={btn(true)} disabled={busy}
                            title="Refused unless every gate passes, and refused if you prepared the set"
                            onClick={() => {
                              const d = window.prompt(
                                "Which director is approving these accounts?\n\nThey are signing that the accounts give a true and fair view.");
                              if (d) act(() => FID.accountsApprove(selSet.id, d), "Approved.");
                            }}>
                      Approve
                    </button>
                    <button style={btn(false)} disabled={busy}
                            title="Posting to an approved set withdraws the approval — the director signed particular figures"
                            onClick={() => {
                              if (selSet.status === "approved" &&
                                  !window.confirm(
                                    "This set has been APPROVED.\n\n" +
                                    "Posting an adjustment will withdraw that approval and return the set to draft, because the director signed particular figures and this changes them. They will have to approve the adjusted accounts.\n\n" +
                                    "Continue?")) return;
                              const narr = window.prompt("Narrative for the adjustment?");
                              if (!narr) return;
                              const date = window.prompt("Date (YYYY-MM-DD)?");
                              if (!date) return;
                              const lines = window.prompt(
                                'Lines as JSON, e.g.\n[{"account_id":410,"amount":-2500},{"account_id":720,"amount":2500}]');
                              if (!lines) return;
                              let parsed;
                              try { parsed = JSON.parse(lines); }
                              catch (e) { setMsg("The lines were not valid JSON, so nothing was posted."); return; }
                              act(() => FID.accountsAdjust(selSet.id, date, narr, parsed),
                                  "Adjustment posted and the statements regenerated.");
                            }}>
                      Post an adjustment
                    </button>
                    <button style={btn(false)} disabled={busy}
                            title="A note in the accounts — numbered and ordered as the framework requires"
                            onClick={() => {
                              const title = window.prompt("Note title?");
                              if (!title) return;
                              const body = window.prompt("Note text?");
                              if (!body) return;
                              const numb = window.prompt("Note number (optional)?");
                              act(() => FID.accountsNoteAdd({
                                    setId: selSet.id, title, body,
                                    noteNumber: numb || null }),
                                  "Note added.");
                            }}>
                      Add a note
                    </button>
                  </>
                )}
                {selSet.status === "draft" && (
                  <button style={btn(false)} disabled={busy}
                          title="A reviewer sees the set before a director is asked to sign it"
                          onClick={() => act(() => FID.accountsSubmitForReview(selSet.id),
                                             "Submitted for review.")}>
                    Submit for review
                  </button>
                )}
                {selSet.status === "approved" && (
                  <button style={btn(true)} disabled={busy}
                          title="Locks the approved accounts"
                          onClick={() => act(() => FID.accountsFinalise(selSet.id),
                                             "Finalised and locked.")}>
                    Finalise
                  </button>
                )}
              </div>
            </div>
          </div>

          {selSet.status === "approved" && (
            <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
              <div style={{ fontSize: 11.5, color: AMB, lineHeight: 1.7 }}>
                <strong>Approved by {selSet.approved_by}.</strong> An audit adjustment posted
                from here will withdraw that approval and return the set to draft — the
                approval attaches to these figures, so changed figures need approving again.
              </div>
            </div>
          )}

          {failed.length > 0 && (
            <div style={{ ...card, background: RED_BG, borderColor: "#f0c9c9" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 8 }}>
                NOT READY TO FILE — {failed.length} outstanding
              </div>
              {failed.map((g, i) => (
                <div key={i} style={{ fontSize: 11.5, color: RED, padding: "4px 0",
                                      lineHeight: 1.6 }}>
                  <strong>[{g.category}] {g.gate}</strong> — {g.detail}
                </div>
              ))}
            </div>
          )}

          {Object.keys(byCat).map((cat) => (
            <div key={cat} style={card}>
              <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 8,
                            textTransform: "uppercase", letterSpacing: "0.4px" }}>
                {cat}
              </div>
              {byCat[cat].map((g, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start",
                                      padding: "5px 0", fontSize: 12 }}>
                  <span style={pill(g.passed ? GRN_BG : RED_BG, g.passed ? GRN : RED)}>
                    {g.passed ? "pass" : "fail"}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{g.gate}</div>
                    <div style={{ color: MUT, fontSize: 11, lineHeight: 1.6 }}>{g.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {FID.STATEMENTS.map((st) => (
            (statements[st.id] || []).length > 0 && (
              <div key={st.id} style={card}>
                <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                              textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  {st.label}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={th}>&nbsp;</th><th style={th}>Note</th>
                    <th style={{ ...th, textAlign: "right" }}>Current</th>
                    <th style={{ ...th, textAlign: "right" }}>Prior</th>
                  </tr></thead>
                  <tbody>
                    {statements[st.id].map((l, i) => (
                      <tr key={i}>
                        <td style={{ ...td,
                                     fontWeight: l.is_total || l.is_subtotal ? 700 : 400,
                                     borderTop: l.is_total ? "1px solid #333" : undefined }}>
                          {l.caption}
                        </td>
                        <td style={{ ...td, color: MUT }}>{l.note_ref || ""}</td>
                        <td style={{ ...num,
                                     fontWeight: l.is_total || l.is_subtotal ? 700 : 400 }}>
                          {money(l.current_amount)}
                        </td>
                        <td style={{ ...num, color: MUT }}>{money(l.prior_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ))}
        </div>
      );
    }

    return (
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"center", marginBottom:10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Accounts sets
          </div>
          <button style={btn(true)}
                  title="Refused if the framework has no presentation format, if the jurisdiction does not accept it, or if the period has not finished"
                  onClick={async()=>{
                    const e = window.prompt("Entity id?");
                    if (!e) return;
                    const fw = window.prompt(
                      "Framework code?\n\nRefused if the framework has no presentation format — statutory accounts need prescribed captions in a prescribed order.");
                    if (!fw) return;
                    const ps = window.prompt("Period start (YYYY-MM-DD)?");
                    if (!ps) return;
                    const pe = window.prompt("Period end (YYYY-MM-DD)?");
                    if (!pe) return;
                    const qs = window.prompt("Comparative period start (optional)?");
                    const qe = window.prompt("Comparative period end (optional)?");
                    await act(() => FID.accountsSetOpen({
                      entityId:Number(e), framework:fw, periodStart:ps, periodEnd:pe,
                      priorStart:qs || null, priorEnd:qe || null }),
                      "Accounts set opened.");
                  }}>
            ＋ Open a set
          </button>
        </div>
        <Table
          cols={["Entity", "Framework", "Period", "Status", "Prepared by", "Lines",
                 "Disclosures outstanding", "Gates failed", ""]}
          rows={sets}
          render={(s) => (
            <tr key={s.id} style={Number(s.gates_failed) > 0 ? { background: AMB_BG } : undefined}>
              <td style={{ ...td, fontWeight: 600 }}>{s.entity_name}</td>
              <td style={td}>{s.framework_code}</td>
              <td style={td}>{fmtD(s.period_start)} – {fmtD(s.period_end)}</td>
              <td style={td}><span style={pill("#F1F3F7", MUT)}>{s.status}</span></td>
              <td style={{ ...td, color: MUT }}>{s.prepared_by}</td>
              <td style={num}>{s.lines}</td>
              <td style={num}>{s.disclosures_outstanding}</td>
              <td style={{ ...num, color: Number(s.gates_failed) > 0 ? RED : GRN,
                           fontWeight: 700 }}>
                {s.gates_failed}
              </td>
              <td style={td}>
                <button style={btn(false)} onClick={() => openSet(s)}>Open</button>
              </td>
            </tr>
          )}
          empty={<Empty what="no accounts sets exist"
                        why="A set is created for an entity, a framework and a period, then generated from the ledger." />}
        />
      </div>
    );
  };

  // ── Frameworks ────────────────────────────────────────────────────────────
  // ── The authoring forms ───────────────────────────────────────────────────
  // Declared at module level would be cleaner, but these need the framework in
  // scope. Each field is controlled and every refusal from the database is
  // shown verbatim, because the refusals say exactly what is wrong.
  const AUTH_FORMS = {
    newFormat: { title: "Create a presentation format", cta: "Create",
      note: "A format holds the captions the accounts print. Give it a short code — it is referenced by the account mapping.",
      fields: [
        { k: "code", label: "Format code", ph: "e.g. FRS105", required: true },
        { k: "name", label: "Name", ph: "FRS 105 Micro-entities", full: true, required: true },
      ],
      save: () => authAct(async () => {
        const a = await FID.fsFrameworkAdd(af.code, af.name);
        if (!a.ok) return a;
        return FID.frameworkFormatLink(authFw.framework, (af.code || "").toUpperCase());
      }, "Format created and linked.") },

    newCaption: { title: "Add a caption", cta: "Add",
      note: "Enter the caption exactly as it must appear in the accounts. The code is what accounts map to and stays stable if the wording changes later.",
      fields: [
        { k: "statement", label: "Statement", type: "select",
          opts: FID.STATEMENT_CODES.map((x) => x.id + " — " + x.label), required: true },
        { k: "code", label: "Code", ph: "TANG_FA", required: true },
        { k: "caption", label: "Caption as printed", ph: "Tangible fixed assets",
          full: true, required: true },
        { k: "sortOrder", label: "Order", ph: "10", required: true },
        { k: "noteNo", label: "Note number", ph: "optional" },
        { k: "isSubtotal", label: "Is a subtotal", type: "select", opts: ["no", "yes"] },
        { k: "fundFilter", label: "Fund (trusts only)", type: "select",
          opts: ["", "INC — income", "CAP — capital"] },
      ],
      save: () => authAct(() => FID.fsCaptionAdd({
        framework: authFw.fs_framework_code,
        statement: (af.statement || "").split(" ")[0],
        code: af.code, caption: af.caption,
        sortOrder: Number(af.sortOrder) || 0,
        isSubtotal: af.isSubtotal === "yes",
        noteNo: af.noteNo ? Number(af.noteNo) : null,
        fundFilter: af.fundFilter ? af.fundFilter.split(" ")[0] : null,
      }), "Caption added.") },

    newDisclosure: { title: "Add a disclosure requirement", cta: "Add",
      note: "The reference in the standard matters: it is how the requirement is traced back, and how a reviewer checks the list is current.",
      fields: [
        { k: "ref", label: "Reference in the standard", ph: "FRS 102 1AC.12", required: true },
        { k: "title", label: "Requirement", full: true, required: true },
        { k: "detail", label: "What must be disclosed", full: true },
        { k: "appliesWhen", label: "Applies when", ph: "e.g. only where fixed assets are held", full: true },
        { k: "mandatory", label: "Mandatory", type: "select", opts: ["yes", "no"] },
        { k: "sortOrder", label: "Order", ph: "10" },
      ],
      save: () => authAct(() => FID.disclosureRequirementAdd({
        framework: authFw.framework, ref: af.ref, title: af.title,
        detail: af.detail, appliesWhen: af.appliesWhen,
        mandatory: af.mandatory !== "no", sortOrder: Number(af.sortOrder) || 0,
      }), "Requirement added. The checklist verification has been withdrawn — re-verify when the list is complete.") },

    verify: { title: "Verify the disclosure checklist", cta: "Verify",
      note: "Name the edition. A verification with no edition means nothing once the standard is amended, and FRS 102 was materially amended in 2024.",
      fields: [
        { k: "edition", label: "Edition verified",
          ph: "FRS 102 (2024 amendments)", full: true, required: true },
      ],
      save: () => authAct(() => FID.frameworkChecklistVerify(authFw.framework, af.edition),
                          "Checklist verified.") },

    newDocument: { title: "Add a required document", cta: "Add",
      note: "Which documents a filed set needs varies by jurisdiction and entity size, so it is recorded rather than assumed.",
      fields: [
        { k: "docKind", label: "Kind", type: "select",
          opts: ["directors_report", "other"], required: true },
        { k: "title", label: "Document", ph: "Directors report", full: true, required: true },
        { k: "guidance", label: "Guidance", full: true },
        { k: "mandatory", label: "Mandatory", type: "select", opts: ["yes", "no"] },
        { k: "sortOrder", label: "Order", ph: "10" },
      ],
      save: () => authAct(() => FID.requiredDocumentAdd({
        framework: authFw.framework, docKind: af.docKind, title: af.title,
        guidance: af.guidance, mandatory: af.mandatory !== "no",
        sortOrder: Number(af.sortOrder) || 0,
      }), "Document recorded.") },
  };

  const AuthForm = () => {
    if (!authForm || !AUTH_FORMS[authForm]) return null;
    const d = AUTH_FORMS[authForm];
    return (
      <div onClick={(e) => e.target === e.currentTarget && (setAuthForm(null), setAf({}))}
           style={{ position: "fixed", inset: 0, background: "rgba(0,18,66,0.45)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 1000, padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: "22px 24px",
                      width: "min(620px, 100%)", maxHeight: "86vh", overflowY: "auto" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
            {d.title}
          </div>
          {d.note && (
            <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.7, marginBottom: 14 }}>
              {d.note}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
            {d.fields.map((f) => (
              <div key={f.k} style={{ gridColumn: f.full ? "1/-1" : "auto" }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600,
                                color: "#555", marginBottom: 4 }}>
                  {f.label}{f.required && <span style={{ color: RED }}> *</span>}
                </label>
                {f.type === "select" ? (
                  <select value={af[f.k] || ""}
                          onChange={(e) => setAf({ ...af, [f.k]: e.target.value })}
                          style={{ width: "100%", height: 34, fontSize: 12.5, borderRadius: 6,
                                   border: "0.5px solid #ccc", padding: "0 8px" }}>
                    <option value="">—</option>
                    {f.opts.map((o) => <option key={o} value={o}>{o || "(none)"}</option>)}
                  </select>
                ) : (
                  <input value={af[f.k] || ""} placeholder={f.ph || ""}
                         onChange={(e) => setAf({ ...af, [f.k]: e.target.value })}
                         style={{ width: "100%", height: 34, fontSize: 12.5, borderRadius: 6,
                                  border: "0.5px solid #ccc", padding: "0 8px" }} />
                )}
              </div>
            ))}
          </div>
          {authMsg && (
            <div style={{ marginTop: 14, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                          lineHeight: 1.6, background: RED_BG,
                          border: "0.5px solid #f0c9c9", color: RED }}>
              {authMsg}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
            <button style={btn(false)} onClick={() => { setAuthForm(null); setAf({}); }}>
              Cancel
            </button>
            <button style={btn(true)} onClick={d.save}>{d.cta}</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Frameworks: the authoring workspace ───────────────────────────────────
  // Points 7, 8 and 9. The disclosure requirements, required documents and
  // presentation formats are entered here by accountants.
  //
  // Nothing in this content is authored by the system. A caption set that
  // looked like the Companies Act format but was subtly wrong, or a disclosure
  // list that looked complete and had gaps, would end up in filed accounts.
  const Frameworks = () => {
    if (authFw) {
      const failed = fmtReady.filter((g) => !g.passed);
      return (
        <div>
          <button style={{ ...btn(false), marginBottom: 12 }} onClick={() => setAuthFw(null)}>
            ← All frameworks
          </button>

          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, color: NAVY }}>
              {authFw.framework_name}
            </div>
            <div style={{ fontSize: 12, color: MUT, marginTop: 3 }}>
              {authFw.framework}
              {authFw.jurisdictions && " · accepted in " + authFw.jurisdictions}
            </div>
            <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                          lineHeight: 1.7,
                          background: authFw.ready ? GRN_BG : AMB_BG,
                          border: "0.5px solid " + (authFw.ready ? "#bfe0d2" : "#E5CE9A"),
                          color: authFw.ready ? GRN : AMB }}>
              <strong>Next:</strong> {authFw.next_step}
            </div>
          </div>

          {/* 9 — presentation format */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                            textTransform: "uppercase", letterSpacing: "0.4px" }}>
                Presentation format — the captions the accounts print
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {!authFw.fs_framework_code && (
                  <button style={btn(true)} onClick={() => { setAuthForm("newFormat"); setAf({}); }}>
                    ＋ Create the format
                  </button>
                )}
                {authFw.fs_framework_code && (
                  <button style={btn(true)} onClick={() => { setAuthForm("newCaption"); setAf({}); }}>
                    ＋ Add a caption
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.7 }}>
              Statutory accounts use prescribed captions in a prescribed order. Enter them as
              they must appear. The short code is what accounts map to and stays stable if the
              caption text is later edited.
            </div>

            {failed.length > 0 && (
              <div style={{ padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                            marginBottom: 10, background: AMB_BG,
                            border: "0.5px solid #E5CE9A", color: AMB, lineHeight: 1.7 }}>
                {failed.map((g, i) => (
                  <div key={i}><strong>{g.gate}</strong> — {g.detail}</div>
                ))}
              </div>
            )}

            <Table
              cols={["Statement", "Code", "Caption", "Order", "Note", "Accounts mapped", ""]}
              rows={captions}
              render={(c) => (
                <tr key={c.id} style={c.is_subtotal ? { fontWeight: 600 } : undefined}>
                  <td style={td}>{c.statement}</td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{c.code}</td>
                  <td style={td}>
                    {c.caption}
                    {c.is_subtotal && (
                      <span style={{ ...pill("#F1F3F7", MUT), marginLeft: 6 }}>subtotal</span>
                    )}
                  </td>
                  <td style={num}>{c.sort_order}</td>
                  <td style={num}>{c.note_no ?? "—"}</td>
                  <td style={num}>{c.accounts_mapped}</td>
                  <td style={td}>
                    <button style={btn(false)}
                            title={Number(c.accounts_mapped) > 0
                              ? "Refused while accounts map to it — those balances would leave the accounts"
                              : "Remove this caption"}
                            onClick={() => authAct(
                              () => FID.fsCaptionRemove(authFw.fs_framework_code, c.code),
                              "Caption removed.")}>
                      Remove
                    </button>
                  </td>
                </tr>
              )}
              empty={<Empty what="no captions defined"
                            why="Until captions exist, a set opened on this framework would print an empty balance sheet." />}
            />
          </div>

          {/* 7 — disclosure checklist */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                            textTransform: "uppercase", letterSpacing: "0.4px" }}>
                Disclosure checklist — {authFw.disclosures} requirement(s)
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={btn(true)} onClick={() => { setAuthForm("newDisclosure"); setAf({}); }}>
                  ＋ Add a requirement
                </button>
                <button style={btn(false)}
                        title="Requires naming the edition — a verification with no edition means nothing once the standard changes"
                        onClick={() => { setAuthForm("verify"); setAf({}); }}>
                  Verify the checklist
                </button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: MUT, lineHeight: 1.7 }}>
              {authFw.checklist_verified ? (
                <span style={{ color: GRN }}>
                  Verified against <strong>{authFw.checklist_edition}</strong>. Adding or
                  amending a requirement withdraws that verification, because whoever signed
                  it off signed off a different list.
                </span>
              ) : (
                <>Accounts cannot be finalised on this framework until the requirements are
                entered and verified against a named edition. Each requirement needs its
                reference in the standard, so it can be traced.</>
              )}
            </div>
          </div>

          {/* 8 — required documents */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                            textTransform: "uppercase", letterSpacing: "0.4px" }}>
                Required documents — {authFw.documents} recorded
              </div>
              <button style={btn(true)} onClick={() => { setAuthForm("newDocument"); setAf({}); }}>
                ＋ Add a document
              </button>
            </div>
            <div style={{ fontSize: 11, color: MUT, lineHeight: 1.7 }}>
              Filed accounts are not only the statements. A directors report, a statement of
              directors responsibilities and the approval wording are usually required, and
              which apply varies by jurisdiction and entity size.
            </div>
          </div>
        </div>
      );
    }

    const notReady = authoring.filter((f) => !f.ready);
    return (
      <div>
        <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: AMB, marginBottom: 8 }}>
            {notReady.length} OF {authoring.length} FRAMEWORKS ARE NOT YET READY FOR FILING
          </div>
          <div style={{ fontSize: 11.5, color: AMB, lineHeight: 1.8 }}>
            A framework is ready when it has a presentation format, a verified disclosure
            checklist and a recorded document list. Accounts cannot be finalised on one that
            is not.
            <div style={{ marginTop: 6 }}>
              None of this content is written by the system, deliberately. A caption set that
              looked like the statutory format but was subtly wrong, or a disclosure list
              that looked complete and had gaps, would end up in filed accounts that a
              director had signed.
            </div>
          </div>
        </div>

        {authMsg && (
          <div style={{ padding: "9px 12px", borderRadius: 7, fontSize: 11.5, marginBottom: 14,
                        background: AMB_BG, border: "0.5px solid #E5CE9A", color: AMB,
                        whiteSpace: "pre-wrap" }}>
            {authMsg}
          </div>
        )}

        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Frameworks, and the next step for each
          </div>
          <Table
            cols={["Framework", "Jurisdictions", "Captions", "Disclosures", "Checklist",
                   "Documents", "Next step", ""]}
            rows={authoring}
            render={(f, i) => (
              <tr key={i} style={f.ready ? { background: GRN_BG } : undefined}>
                <td style={{ ...td, fontWeight: 600 }}>
                  {f.framework_name}
                  <div style={{ fontSize: 10.5, color: MUT }}>{f.framework}</div>
                </td>
                <td style={{ ...td, color: MUT, fontSize: 11 }}>{f.jurisdictions || "—"}</td>
                <td style={{ ...num, color: f.has_format ? GRN : RED, fontWeight: 600 }}>
                  {f.captions}
                </td>
                <td style={num}>{f.disclosures}</td>
                <td style={td}>
                  {f.checklist_verified
                    ? <span style={pill(GRN_BG, GRN)}>{f.checklist_edition}</span>
                    : <span style={pill(AMB_BG, AMB)}>not verified</span>}
                </td>
                <td style={num}>{f.documents}</td>
                <td style={{ ...td, fontSize: 11, lineHeight: 1.5,
                             color: f.ready ? GRN : AMB }}>
                  {f.next_step}
                </td>
                <td style={td}>
                  <button style={btn(false)} onClick={() => openFramework(f)}>Open</button>
                </td>
              </tr>
            )}
            empty={<Empty what="no frameworks are registered" />}
          />
        </div>
      </div>
    );
  };

  const Frameworks_old = () => {
    const noFormat = frameworks.filter((f) => !f.has_format);
    const unverified = frameworks.filter((f) => !f.checklist_verified);
    return (
      <div>
        <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: AMB, marginBottom: 8 }}>
            BEFORE ACCOUNTS CAN BE FILED ON ANY BASIS
          </div>
          <div style={{ fontSize: 11.5, color: AMB, lineHeight: 1.8 }}>
            {unverified.length} of {frameworks.length} frameworks have no verified disclosure
            checklist, and {noFormat.length} have no presentation format. A set cannot be
            finalised on a framework whose checklist has not been authored and verified by a
            qualified person against a named edition.
            <div style={{ marginTop: 6 }}>
              This is deliberate. Filed accounts carry legal weight — directors sign that they
              give a true and fair view. Core will not produce a set that looks complete on a
              basis nobody has established.
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Reporting frameworks
          </div>
          <Table
            cols={["Framework", "Presentation format", "Captions", "Disclosure checklist"]}
            rows={frameworks}
            render={(f, i) => (
              <tr key={i}>
                <td style={{ ...td, fontWeight: 600 }}>
                  {f.name}
                  <div style={{ fontSize: 10.5, color: MUT }}>{f.code}</div>
                </td>
                <td style={td}>
                  {f.has_format
                    ? <span style={pill(GRN_BG, GRN)}>{f.fs_framework_code}</span>
                    : <span style={pill(RED_BG, RED)}>none — not filable</span>}
                </td>
                <td style={num}>{f.captions}</td>
                <td style={td}>
                  {f.checklist_verified
                    ? <span style={pill(GRN_BG, GRN)}>verified</span>
                    : <span style={pill(AMB_BG, AMB)}>not authored or not verified</span>}
                </td>
              </tr>
            )}
            empty={<Empty what="no frameworks are registered" />}
          />
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "Catamaran, system-ui, sans-serif",
                  background: "var(--bg-secondary,#F6F8FB)", minHeight: 600 }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 20px", borderBottom: "0.5px solid #e5e5e5", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: NAVY }}>Fiduciary reporting</div>
          <span title={live ? "Reading live records from the database"
                            : "Not signed in — the database cannot be read"}
                style={{ ...pill(live ? GRN_BG : AMB_BG, live ? GRN : AMB),
                         fontSize: 10, padding: "3px 9px",
                         border: "0.5px solid " + (live ? "#bfe0d2" : "#E5CE9A") }}>
            ● {live ? "Live data" : isConfigured ? "No records returned" : "Not signed in"}
          </span>
          {critical.length > 0 && (
            <span style={{ ...pill(RED_BG, RED), fontSize: 10, padding: "3px 9px" }}>
              trustee attention needed
            </span>
          )}
        </div>
        <button style={btn(false)} onClick={load} disabled={busy}>
          {busy ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      <div style={{ padding: "10px 20px 0", background: "#fff" }}>
        <EntitySearch value={entity} compact onChange={setEntity} />
      </div>

      <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", background: "#fff",
                    borderBottom: "0.5px solid #e5e5e5", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelSet(null); }}
            style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer", border: "none",
                     background: "transparent",
                     color: tab === t.id ? NAVY : MUT,
                     fontWeight: tab === t.id ? 600 : 400,
                     borderBottom: tab === t.id ? "2px solid " + CYAN : "2px solid transparent" }}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ margin: "12px 20px 0", padding: "9px 12px", borderRadius: 7,
                      fontSize: 11.5, lineHeight: 1.6,
                      background: /not ready|must be|cannot/i.test(msg) ? RED_BG : AMB_BG,
                      border: "0.5px solid " + (/not ready|must be|cannot/i.test(msg) ? "#f0c9c9" : "#E5CE9A"),
                      color: /not ready|must be|cannot/i.test(msg) ? RED : AMB,
                      whiteSpace: "pre-wrap" }}>
          {msg}
        </div>
      )}

      <div style={{ padding: "16px 20px 24px" }}>
        {tab === "trusts"     && <Trusts />}
        {tab === "benef"      && <Beneficiaries />}
        {tab === "dists"      && <Distributions />}
        {tab === "accounts"   && <Accounts />}
        {tab === "frameworks" && <Frameworks />}
      </div>

      <AuthForm />
      <TrustForm kind={tForm} f={tF} setF={setTF} msg={tMsg} busy={tBusy}
                 onCancel={()=>{ setTForm(null); setTF({}); setTMsg(""); }}
                 onSave={runTForm} />

    </div>
  );
}
