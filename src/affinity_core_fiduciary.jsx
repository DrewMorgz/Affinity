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

export default function AffinityFiduciary({ onNav }) {
  const [tab, setTab]       = useState("trusts");
  const [entity, setEntity] = useState("");
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState("");
  const [live, setLive]     = useState(false);

  const [trusts, setTrusts]   = useState([]);
  const [benef, setBenef]     = useState([]);
  const [dists, setDists]     = useState([]);
  const [tOver, setTOver]     = useState([]);
  const [sets, setSets]       = useState([]);
  const [frameworks, setFrameworks] = useState([]);
  const [selSet, setSelSet]   = useState(null);
  const [readiness, setReadiness]   = useState([]);
  const [statements, setStatements] = useState({});

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
                  </>
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
        <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                      textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Accounts sets
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
  const Frameworks = () => {
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
    </div>
  );
}
