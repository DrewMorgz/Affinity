import { useState, useEffect } from "react";
import * as R from "./affinity_rates_api";
import { isConfigured } from "./affinity_accounting_supabase";

// ─────────────────────────────────────────────────────────────────────────────
// RATES AND ALLOCATIONS
//
// The reference data Andy asked to be manually enterable, then fixed, then
// reopenable whenever needed. db/079 built the tables, the effective dating,
// the lock and reopen, and the validation — and there was no screen. So
// budgets compute staff costs on nothing and nobody can enter the figures.
//
// The screen is built around the two things that are easy to lose:
//
// RATES ARE NEVER EDITED IN PLACE. A locked rate is superseded from a later
// date. Both are kept, and a calculation for any period uses the rate that was
// in force — so a budget approved on one set of rates still produces those
// figures when re-run.
//
// AN ALLOCATION MUST TOTAL 100%. Short and cost is borne by nobody; over and
// it is charged twice. The running total is shown while building and enforced
// at agreement.
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = "#001242", CY = "#00C4CC", MUT = "#5B6B7B", LINE = "#D9DEE5";
const RED = "#A32D2D", RED_BG = "#FCEBEB", AMB = "#7B4F1D", AMB_BG = "#FDF4DC",
      GRN = "#1F6F54", GRN_BG = "#E7F4EF";

const fmtD = (d) => d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—";
const pct = (v) => v == null ? "—" : Number(v).toFixed(2) + "%";
const money = (v) => v == null ? "—"
  : Number(v).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const card = { background: "#fff", border: "0.5px solid " + LINE, borderRadius: 10,
               padding: "14px 16px", marginBottom: 14 };
const th = (r) => ({ textAlign: r ? "right" : "left", fontSize: 10, fontWeight: 600,
                     color: "#fff", background: NAVY, padding: "8px 10px",
                     textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap" });
const td = { padding: "8px 10px", fontSize: 12, borderBottom: "0.5px solid " + LINE };
const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const btn = (p) => ({ padding: "6px 13px", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
                      border: p ? "none" : "0.5px solid " + LINE,
                      background: p ? CY : "transparent", color: p ? "#fff" : "#333" });
const inp = { height: 34, fontSize: 12.5, borderRadius: 6, border: "0.5px solid #ccc",
              padding: "0 8px", width: "100%" };
const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 600, padding: "2px 7px",
                            borderRadius: 20, background: bg, color: fg, whiteSpace: "nowrap" });

const STATUS_COLOURS = {
  draft:  [AMB_BG, AMB],
  agreed: [GRN_BG, GRN],
  locked: ["#EAF0FB", "#274690"],
};

// AT MODULE LEVEL. A modal defined inside the parent is a new function on every
// render, so React remounts it on each keystroke and the state never updates —
// the form appears frozen. That bug has already been made twice in this build.
function RateForm({ open, kind, f, setF, msg, busy, onCancel, onSave }) {
  if (!open) return null;
  const SPECS = {
    rate: {
      title: "Enter payroll rates",
      note: "Percentages are percentages, not fractions — 12.8 for 12.8%, not 0.128. The old hardcoded values were fractions, so a copied value would make every payroll figure a hundred times too small while still looking like money. The database refuses anything between zero and one.",
      cta: "Record the rates",
      fields: [
        ["location", "Jurisdiction code", true, "IOM"],
        ["effectiveFrom", "Effective from", true, "YYYY-MM-DD"],
        ["socialPct", "Employer social security %", false, "12.8"],
        ["socialThreshold", "Threshold — below this, nothing due", false, ""],
        ["socialCap", "Cap — above this, nothing more", false, "blank = uncapped"],
        ["pensionPct", "Employer pension %", false, "5"],
        ["pensionCap", "Pension cap", false, ""],
        ["perHeadAnnual", "Per head, annual", false, "anything not a percentage"],
        ["ccy", "Currency", false, "GBP"],
        ["source", "Source of the figures", true, "IOM Treasury 2026 rates"],
      ],
    },
    reopenRate: {
      title: "Reopen locked rates",
      note: "A reason is required and is kept on the record, because anything already budgeted on these rates may change. Rates do change mid-year, and refusing outright would push the work into spreadsheets — which is worse than a reopening that is recorded.",
      cta: "Reopen",
      fields: [["reason", "Reason", true, ""]],
    },
    alloc: {
      title: "New allocation",
      note: "What share of a central cost each entity bears. Effective-dated for the same reason as the rates: an allocation approved for one period must still produce those figures later.",
      cta: "Create",
      fields: [
        ["name", "Name", true, "Central overhead"],
        ["effectiveFrom", "Effective from", true, "YYYY-MM-DD"],
        ["basis", "Basis", false, "headcount / revenue / fee income / agreed"],
        ["note", "Note", false, ""],
      ],
    },
    line: {
      title: "Set an entity's share",
      note: "The running total is reported as you build. It is not enforced per line, because an allocation is built one entity at a time and would be unbuildable if every intermediate state had to total 100. It is enforced when you agree it.",
      cta: "Set the share",
      fields: [
        ["entityId", "Entity id", true, ""],
        ["pctValue", "Share %", true, "60"],
        ["note", "Note", false, ""],
      ],
    },
    reopenAlloc: {
      title: "Reopen a locked allocation",
      note: "A reason is required and is kept, because anything already budgeted on this allocation may change.",
      cta: "Reopen",
      fields: [["reason", "Reason", true, ""]],
    },
  };
  const d = SPECS[kind];
  if (!d) return null;
  return (
    <div onClick={(e) => e.target === e.currentTarget && onCancel()}
         style={{ position: "fixed", inset: 0, background: "rgba(0,18,66,0.45)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 1000, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "22px 24px",
                    width: "min(640px,100%)", maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
          {d.title}
        </div>
        {f.subject && (
          <div style={{ fontSize: 12, color: MUT, marginBottom: 8 }}>{f.subject}</div>
        )}
        <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.7, marginBottom: 14 }}>
          {d.note}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
          {d.fields.map(([k, lab, req, ph]) => (
            <div key={k} style={{ gridColumn: (k === "reason" || k === "note" || k === "source")
                                              ? "1/-1" : "auto" }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600,
                              color: "#555", marginBottom: 4 }}>
                {lab}{req && <span style={{ color: RED }}> *</span>}
              </label>
              <input value={f[k] || ""} placeholder={ph}
                     onChange={(e) => setF({ ...f, [k]: e.target.value })}
                     style={inp} />
            </div>
          ))}
        </div>
        {msg && (
          <div style={{ marginTop: 14, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                        lineHeight: 1.6, background: RED_BG, border: "0.5px solid #f0c9c9",
                        color: RED, whiteSpace: "pre-wrap" }}>{msg}</div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button style={btn(false)} onClick={onCancel}>Cancel</button>
          <button style={btn(true)} onClick={onSave} disabled={busy}>{d.cta}</button>
        </div>
      </div>
    </div>
  );
}

export default function AffinityRates({ onNav }) {
  const [tab, setTab]     = useState("rates");
  const [rates, setRates] = useState([]);
  const [gaps, setGaps]   = useState([]);
  const [allocs, setAllocs] = useState([]);
  const [lines, setLines] = useState([]);
  const [selAlloc, setSelAlloc] = useState(null);
  const [msg, setMsg]     = useState("");
  const [busy, setBusy]   = useState(false);
  const [form, setForm]   = useState(null);
  const [f, setF]         = useState({});
  const [fMsg, setFMsg]   = useState("");

  const load = async () => {
    setBusy(true); setMsg("");
    const [rl, gp, al] = await Promise.all([
      R.payrollRatesList(null), R.payrollRateGaps(), R.allocationsList(),
    ]);
    setBusy(false);
    if (!rl.live && !gp.live && !al.live) {
      setMsg("Not signed in — rates and allocations are read from the database.");
      return;
    }
    setRates(rl.data || []);
    setGaps(gp.data || []);
    setAllocs(al.data || []);
    if (!rl.ok) setMsg(rl.error);
  };
  useEffect(() => { load(); }, []);   // eslint-disable-line

  const openAlloc = async (a) => {
    setSelAlloc(a); setLines([]);
    const r = await R.allocationLines(a.id);
    if (r.live) setLines(r.data || []);
  };

  const act = async (fn, okMsg) => {
    setBusy(true); setFMsg("");
    const r = await fn();
    setBusy(false);
    if (r && r.ok) {
      setMsg(okMsg); setForm(null); setF({});
      await load();
      if (selAlloc) await openAlloc(selAlloc);
      return;
    }
    // The error has to go where the user is looking. fMsg renders only inside
    // the modal, so a failure from a ROW button — Agree, Lock — showed
    // nowhere and the action appeared to do nothing. Route it to whichever is
    // on screen.
    const show = form ? setFMsg : setMsg;
    if (r && r.live === false) { show("Not signed in — that cannot be saved."); return; }
    show((r && r.error) || "That could not be saved.");
  };

  const noRates = gaps.filter((g) => !g.has_rates);

  const save = () => {
    if (form === "rate") {
      const numOrNull = (v) => (v === undefined || v === "" ? null : Number(v));
      return act(() => R.payrollRateSet({
        location: f.location, effectiveFrom: f.effectiveFrom,
        socialPct: numOrNull(f.socialPct), socialThreshold: numOrNull(f.socialThreshold),
        socialCap: numOrNull(f.socialCap), pensionPct: numOrNull(f.pensionPct),
        pensionCap: numOrNull(f.pensionCap), perHeadAnnual: numOrNull(f.perHeadAnnual),
        ccy: f.ccy, source: f.source, note: f.note,
      }), "Rates recorded as draft. Agree them, then lock them.");
    }
    if (form === "reopenRate")
      return act(() => R.payrollRateReopen(f.id, f.reason), "Rates reopened.");
    if (form === "alloc")
      return act(() => R.allocationSetCreate({
        name: f.name, effectiveFrom: f.effectiveFrom, basis: f.basis, note: f.note,
      }), "Allocation created.");
    if (form === "line")
      return act(() => R.allocationLineSet(selAlloc.id, Number(f.entityId),
                                           Number(f.pctValue), f.note),
                 "Share set.");
    if (form === "reopenAlloc")
      return act(() => R.allocationSetReopen(f.id, f.reason), "Allocation reopened.");
  };

  // ── Rates ─────────────────────────────────────────────────────────────────
  const Rates = () => (
    <div>
      {noRates.length > 0 && (
        <div style={{ ...card, background: RED_BG, borderColor: "#f0c9c9" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 6 }}>
            {noRates.length} JURISDICTION(S) WITH NO PAYROLL RATES AT ALL
          </div>
          <div style={{ fontSize: 11.5, color: RED, lineHeight: 1.7 }}>
            {noRates.map((g) => g.location_name).join(", ")}. A budget for one of these
            computes staff costs on nothing, and a blank is easy to miss in a set of figures
            that otherwise looks complete.
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: MUT, lineHeight: 1.7, maxWidth: "68%" }}>
            Rates are effective-dated and never edited in place. A locked rate is
            superseded from a later date — both are kept, and a calculation for any period
            uses the rate that was in force. Editing in place would silently rewrite history.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={btn(false)} onClick={load} disabled={busy}>
              {busy ? "Loading…" : "Refresh"}
            </button>
            <button style={btn(true)}
                    onClick={() => { setForm("rate"); setF({}); setFMsg(""); }}>
              ＋ Enter rates
            </button>
          </div>
        </div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {["Jurisdiction", "From", "Superseded", "Social %", "Threshold", "Cap",
              "Pension %", "Per head", "Ccy", "Status", "Source", ""].map((h) =>
              <th key={h} style={th(false)}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rates.map((r) => {
              const [bg, fg] = STATUS_COLOURS[r.status] || ["#eee", MUT];
              return (
                <tr key={r.id} style={r.in_force ? { background: "#F7FBFC" } : undefined}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {r.location_name}
                    {r.in_force && (
                      <div style={{ ...pill(GRN_BG, GRN), marginTop: 3,
                                    display: "inline-block" }}>in force</div>
                    )}
                  </td>
                  <td style={td}>{fmtD(r.effective_from)}</td>
                  <td style={{ ...td, color: MUT }}>
                    {r.superseded_from ? fmtD(r.superseded_from) : "—"}
                  </td>
                  <td style={num}>{pct(r.social_pct)}</td>
                  <td style={num}>{money(r.social_threshold)}</td>
                  <td style={num}>{r.social_cap == null ? "uncapped" : money(r.social_cap)}</td>
                  <td style={num}>{pct(r.pension_pct)}</td>
                  <td style={num}>{money(r.per_head_annual)}</td>
                  <td style={td}>{r.ccy || "—"}</td>
                  <td style={td}><span style={pill(bg, fg)}>{r.status}</span></td>
                  <td style={{ ...td, color: MUT, fontSize: 11 }}>{r.source || "—"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {r.status === "draft" && (
                      <button style={{ ...btn(false), marginRight: 4 }} disabled={busy}
                              onClick={() => act(() => R.payrollRateAgree(r.id),
                                                 "Rates agreed. Lock them to stop them moving.")}>
                        Agree
                      </button>
                    )}
                    {r.status === "agreed" && (
                      <button style={{ ...btn(true), marginRight: 4 }} disabled={busy}
                              title="Locks the rates so a budget cannot shift under anyone"
                              onClick={() => act(() => R.payrollRateLock(r.id), "Rates locked.")}>
                        Lock
                      </button>
                    )}
                    {r.status === "locked" && (
                      <button style={btn(false)}
                              onClick={() => { setForm("reopenRate");
                                               setF({ id: r.id, subject: r.location_name + " from " + fmtD(r.effective_from) });
                                               setFMsg(""); }}>
                        Reopen
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rates.length && (
              <tr><td colSpan={12} style={{ ...td, textAlign: "center", color: MUT,
                                            padding: "26px 10px", lineHeight: 1.7 }}>
                No rates recorded for any jurisdiction. Until they are entered, budgets
                compute staff costs on nothing.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Allocations ───────────────────────────────────────────────────────────
  const Allocations = () => {
    const unbalanced = allocs.filter((a) => !a.balanced && a.status !== "locked");
    return (
      <div>
        {unbalanced.length > 0 && (
          <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: AMB, marginBottom: 6 }}>
              {unbalanced.length} ALLOCATION(S) DO NOT TOTAL 100%
            </div>
            <div style={{ fontSize: 11.5, color: AMB, lineHeight: 1.7 }}>
              Short and that share of the cost is borne by nobody. Over and it is charged
              twice. Neither shows in the resulting figures, which is why agreement is
              refused until it balances.
            </div>
          </div>
        )}

        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: MUT, lineHeight: 1.7, maxWidth: "70%" }}>
              What share of a central cost each entity bears, effective-dated like the rates.
            </div>
            <button style={btn(true)}
                    onClick={() => { setForm("alloc"); setF({}); setFMsg(""); }}>
              ＋ New allocation
            </button>
          </div>
        </div>

        <div style={{ ...card, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Name", "Basis", "From", "Entities", "Total", "Status", "Agreed by", ""]
                .map((h) => <th key={h} style={th(false)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {allocs.map((a) => {
                const [bg, fg] = STATUS_COLOURS[a.status] || ["#eee", MUT];
                return (
                  <tr key={a.id} style={selAlloc && selAlloc.id === a.id
                                        ? { background: "#F1F4F8" } : undefined}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {a.name}
                      {a.in_force && (
                        <div style={{ ...pill(GRN_BG, GRN), marginTop: 3,
                                      display: "inline-block" }}>in force</div>
                      )}
                    </td>
                    <td style={{ ...td, color: MUT }}>{a.basis || "—"}</td>
                    <td style={td}>{fmtD(a.effective_from)}</td>
                    <td style={num}>{a.entities}</td>
                    <td style={{ ...num, fontWeight: 700,
                                 color: a.balanced ? GRN : AMB }}>
                      {Number(a.total_pct || 0).toFixed(2)}%
                    </td>
                    <td style={td}><span style={pill(bg, fg)}>{a.status}</span></td>
                    <td style={{ ...td, color: MUT }}>{a.agreed_by || "—"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button style={{ ...btn(false), marginRight: 4 }}
                              onClick={() => openAlloc(a)}>Open</button>
                      {a.status === "draft" && (
                        <button style={{ ...btn(false), marginRight: 4 }} disabled={busy}
                                title="Refused unless the shares total 100%"
                                onClick={() => act(() => R.allocationSetAgree(a.id),
                                                   "Allocation agreed.")}>
                          Agree
                        </button>
                      )}
                      {a.status === "agreed" && (
                        <button style={{ ...btn(true), marginRight: 4 }} disabled={busy}
                                onClick={() => act(() => R.allocationSetLock(a.id),
                                                   "Allocation locked.")}>
                          Lock
                        </button>
                      )}
                      {a.status === "locked" && (
                        <button style={btn(false)}
                                onClick={() => { setForm("reopenAlloc");
                                                 setF({ id: a.id, subject: a.name });
                                                 setFMsg(""); }}>
                          Reopen
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!allocs.length && (
                <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: MUT,
                                             padding: "26px 10px" }}>
                  No allocations recorded.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selAlloc && (
          <div style={{ ...card, overflowX: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                            textTransform: "uppercase", letterSpacing: "0.4px" }}>
                {selAlloc.name} — shares
              </div>
              {selAlloc.status !== "locked" && (
                <button style={btn(false)}
                        onClick={() => { setForm("line"); setF({}); setFMsg(""); }}>
                  ＋ Set an entity's share
                </button>
              )}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {["Entity", "Code", "Share", "Note"].map((h) =>
                  <th key={h} style={th(h === "Share")}>{h}</th>)}
              </tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.entity_id}>
                    <td style={{ ...td, fontWeight: 600 }}>{l.entity_name}</td>
                    <td style={{ ...td, color: MUT }}>{l.company_code || "—"}</td>
                    <td style={num}>{Number(l.pct).toFixed(2)}%</td>
                    <td style={{ ...td, color: MUT }}>{l.note || "—"}</td>
                  </tr>
                ))}
                {!lines.length && (
                  <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: MUT,
                                               padding: "20px 10px" }}>
                    No shares set yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "Catamaran, system-ui, sans-serif",
                  background: "var(--bg-secondary,#F6F8FB)", minHeight: 600 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 20px", borderBottom: "0.5px solid #e5e5e5",
                    background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: NAVY }}>
            Rates &amp; allocations
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                         background: isConfigured ? GRN_BG : AMB_BG,
                         color: isConfigured ? GRN : AMB,
                         border: "0.5px solid " + (isConfigured ? "#bfe0d2" : "#E5CE9A") }}>
            ● {isConfigured ? "Live data" : "Not signed in"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", background: "#fff",
                    borderBottom: "0.5px solid #e5e5e5" }}>
        {[["rates", "Payroll rates"], ["allocations", "Group allocations"]].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setMsg(""); }}
                  style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer",
                           border: "none", background: "transparent",
                           color: tab === id ? NAVY : MUT,
                           fontWeight: tab === id ? 600 : 400,
                           borderBottom: tab === id ? "2px solid " + CY
                                                    : "2px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px 24px" }}>
        {msg && !form && (
          <div style={{ padding: "9px 12px", borderRadius: 7, fontSize: 11.5, marginBottom: 14,
                        background: AMB_BG, border: "0.5px solid #E5CE9A", color: AMB,
                        whiteSpace: "pre-wrap" }}>{msg}</div>
        )}
        {tab === "rates"       && <Rates />}
        {tab === "allocations" && <Allocations />}
      </div>

      <RateForm open={!!form} kind={form} f={f} setF={setF} msg={fMsg} busy={busy}
                onCancel={() => { setForm(null); setF({}); setFMsg(""); }}
                onSave={save} />
    </div>
  );
}
