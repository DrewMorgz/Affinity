import { useState } from "react";
import * as RPT from "./affinity_reports_api";
import { isConfigured } from "./affinity_accounting_supabase";
import EntitySearch from "./affinity_entity_search";

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS
//
// Ten reporting functions that existed in the engine with nothing calling
// them. All read-only.
//
// Reports are run on demand rather than loaded on mount, because several take
// parameters — a date, a rate, a period — and running them all against
// defaults would produce numbers nobody asked for and invite them to be
// believed.
//
// Two carry caveats that are shown next to the figures rather than left
// implicit: overdue interest is what COULD be charged at a chosen rate, not
// what is owed; and the cash flow forecast is only as good as the dates behind
// the receipts and payments it projects from.
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = "#001242", CYAN = "#00C4CC", MUT = "#5B6B7B", LINE = "#D9DEE5";
const RED = "#A32D2D", AMB = "#7B4F1D", AMB_BG = "#FDF4DC", GRN = "#1F6F54",
      GRN_BG = "#E7F4EF";

const money = (v) => v == null || v === "" ? "—"
  : Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d) => d ? String(d).split("-").reverse().join("/") : "—";
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => new Date().toISOString().slice(0, 4) + "-01-01";

const th = (right) => ({ textAlign: right ? "right" : "left", fontSize: 10, fontWeight: 600,
                         color: "#fff", background: NAVY, padding: "8px 10px",
                         textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap" });
const td = { padding: "8px 10px", fontSize: 12, borderBottom: "0.5px solid " + LINE };
const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const card = { background: "#fff", border: "0.5px solid " + LINE, borderRadius: 10,
               padding: "14px 16px", marginBottom: 14 };
const btn = (primary) => ({ padding: "6px 13px", borderRadius: 6, fontSize: 11.5,
                            cursor: "pointer", border: primary ? "none" : "0.5px solid " + LINE,
                            background: primary ? CYAN : "transparent",
                            color: primary ? "#fff" : "#333" });
const inp = { height: 32, fontSize: 12, borderRadius: 6, border: "0.5px solid #ccc",
              padding: "0 8px" };

const REPORTS = [
  { id: "ar",     label: "Aged debtors",        needs: ["asAt"] },
  { id: "ap",     label: "Aged creditors",      needs: ["asAt"] },
  { id: "int",    label: "Overdue interest",    needs: ["asAt", "rate"] },
  { id: "vat",    label: "VAT by jurisdiction", needs: ["period"] },
  { id: "dim",    label: "Analysis by dimension", needs: ["entity", "dim", "period"] },
  { id: "cf",     label: "Cash flow forecast",  needs: ["entity", "asAt", "buckets"] },
  { id: "ic",     label: "Intercompany check",  needs: [] },
  // A statement is what you send when someone asks what they owe or are owed.
  // Aged debt in aggregate answers how much; only the statement answers
  // which invoices, which is what a query is actually about.
  { id: "cust",   label: "Customer statement",  needs: ["entity", "asAt"] },
  { id: "supp",   label: "Supplier statement",  needs: ["entity", "asAt"] },
  // Actuals to date plus budget for the rest of the year, which is a different
  // question from the budget as set — and the one asked in the second half of
  // a year when the budget has stopped resembling what is happening.
  { id: "roll",   label: "Rolling forecast",    needs: ["budget", "period"] },
];

export default function AffinityReports({ onNav }) {
  const [rpt, setRpt]     = useState("ar");
  const [rows, setRows]   = useState([]);
  const [cols, setCols]   = useState([]);
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState("");
  const [ranAt, setRanAt] = useState(null);
  const [entity, setEntity] = useState("");

  const [asAt, setAsAt]       = useState(today());
  const [from, setFrom]       = useState(yearStart());
  const [to, setTo]           = useState(today());
  const [rate, setRate]       = useState("8");
  const [entityId, setEntityId] = useState("");
  const [budgetId, setBudgetId] = useState("");
  const [dimType, setDimType] = useState("office");
  const [buckets, setBuckets] = useState("6");

  const def = REPORTS.find((r) => r.id === rpt);

  const run = async () => {
    setBusy(true); setMsg(""); setRows([]); setRanAt(null);
    let res;
    if (rpt === "ar")  res = await RPT.arAging(asAt);
    if (rpt === "ap")  res = await RPT.apAging(asAt);
    if (rpt === "int") res = await RPT.arOverdueInterest(Number(rate) || 0, asAt);
    if (rpt === "vat") res = await RPT.vatByJurisdiction(from, to);
    if (rpt === "dim") res = await RPT.dimensionPnl(Number(entityId) || null, dimType, from, to);
    if (rpt === "cf")  res = await RPT.cashFlowForecast(Number(entityId) || null, asAt,
                                                        Number(buckets) || 6, 30);
    if (rpt === "roll") res = await RPT.rollingForecast(Number(budgetId), period);
    if (rpt === "cust") res = await RPT.customerStatement(Number(ent), asAt);
    if (rpt === "supp") res = await RPT.supplierStatement(Number(ent), asAt);
    if (rpt === "ic")  res = await RPT.icOverview(null);
    setBusy(false);

    if (!res) { setMsg("That report is not wired up."); return; }
    if (res.live === false) {
      setMsg("Not signed in — reports read from the database and cannot be produced yet.");
      return;
    }
    if (!res.ok) { setMsg(res.error); return; }

    const data = res.data || [];
    setRows(data);
    setCols(data.length ? Object.keys(data[0]) : []);
    setRanAt(new Date().toLocaleTimeString("en-GB"));
    if (!data.length) setMsg("The report ran and returned no rows.");
  };

  // Detected from the VALUE, not from a list of column-name keywords. A first
  // version used a keyword list and rendered a column called "total" as 8200
  // rather than 8,200.00, because "total" was not on the list. Any list would
  // have the same failure for the next column nobody thought of.
  //
  // Ids and years are numbers but not money, so they are excluded by name —
  // formatting an entity id as "16.00" would be worse than leaving it plain.
  const numeric = (k) => {
    if (/_id$|^id$|_pct$|year|count|periods|days/i.test(k)) return false;
    const sample = rows.find((r) => r[k] != null);
    return sample != null && typeof sample[k] === "number";
  };
  const label = (k) => k.replace(/_/g, " ").replace(/\b(amt|pct|vat|ic|ar|ap)\b/gi, (m) => m.toUpperCase())
                        .replace(/^./, (c) => c.toUpperCase());

  return (
    <div style={{ fontFamily: "Catamaran, system-ui, sans-serif",
                  background: "var(--bg-secondary,#F6F8FB)", minHeight: 600 }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 20px", borderBottom: "0.5px solid #e5e5e5", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: NAVY }}>Reports</div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                         background: isConfigured ? GRN_BG : AMB_BG,
                         color: isConfigured ? GRN : AMB,
                         border: "0.5px solid " + (isConfigured ? "#bfe0d2" : "#E5CE9A") }}>
            ● {isConfigured ? "Reads live data" : "Not signed in"}
          </span>
        </div>
        {ranAt && (
          <span style={{ fontSize: 11, color: MUT }}>
            Run at {ranAt} · {rows.length} row{rows.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", background: "#fff",
                    borderBottom: "0.5px solid #e5e5e5", flexWrap: "wrap" }}>
        {REPORTS.map((r) => (
          <button key={r.id}
            onClick={() => { setRpt(r.id); setRows([]); setMsg(""); setRanAt(null); }}
            style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer", border: "none",
                     background: "transparent",
                     color: rpt === r.id ? NAVY : MUT,
                     fontWeight: rpt === r.id ? 600 : 400,
                     borderBottom: rpt === r.id ? "2px solid " + CYAN : "2px solid transparent" }}>
            {r.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px 24px" }}>
        <div style={card}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            {def.needs.includes("budget") && (
              <div>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                                color: "#555", marginBottom: 3 }}>Budget id</label>
                <input style={{ ...inp, width: 110 }} value={budgetId}
                       onChange={(e) => setBudgetId(e.target.value)} placeholder="e.g. 3" />
              </div>
            )}
            {def.needs.includes("entity") && (
              <div>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                                color: "#555", marginBottom: 3 }}>Entity id</label>
                <input style={{ ...inp, width: 110 }} value={entityId}
                       onChange={(e) => setEntityId(e.target.value)} placeholder="e.g. 16" />
              </div>
            )}
            {def.needs.includes("asAt") && (
              <div>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                                color: "#555", marginBottom: 3 }}>
                  {rpt === "cf" ? "From" : "As at"}
                </label>
                <input type="date" style={inp} value={asAt}
                       onChange={(e) => setAsAt(e.target.value)} />
              </div>
            )}
            {def.needs.includes("period") && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                                  color: "#555", marginBottom: 3 }}>From</label>
                  <input type="date" style={inp} value={from}
                         onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                                  color: "#555", marginBottom: 3 }}>To</label>
                  <input type="date" style={inp} value={to}
                         onChange={(e) => setTo(e.target.value)} />
                </div>
              </>
            )}
            {def.needs.includes("rate") && (
              <div>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                                color: "#555", marginBottom: 3 }}>Annual rate %</label>
                <input style={{ ...inp, width: 90 }} value={rate}
                       onChange={(e) => setRate(e.target.value)} />
              </div>
            )}
            {def.needs.includes("dim") && (
              <div>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                                color: "#555", marginBottom: 3 }}>Dimension</label>
                <input style={{ ...inp, width: 130 }} value={dimType}
                       onChange={(e) => setDimType(e.target.value)} />
              </div>
            )}
            {def.needs.includes("buckets") && (
              <div>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                                color: "#555", marginBottom: 3 }}>Periods (30 days)</label>
                <input style={{ ...inp, width: 90 }} value={buckets}
                       onChange={(e) => setBuckets(e.target.value)} />
              </div>
            )}
            <button style={btn(true)} onClick={run} disabled={busy}>
              {busy ? "Running…" : "Run report"}
            </button>
          </div>

          {/* Caveats sit beside the parameters, before the figures are produced,
              rather than under a table where they would be read too late. */}
          {rpt === "int" && (
            <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                          lineHeight: 1.7, background: AMB_BG, border: "0.5px solid #E5CE9A",
                          color: AMB }}>
              This is what <strong>could</strong> be charged at the rate entered, not what is
              owed. Whether interest is chargeable depends on the engagement terms and, in
              some jurisdictions, on statute — so treat the figure as a calculation to check
              rather than a balance to collect.
            </div>
          )}
          {rpt === "cf" && (
            <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                          lineHeight: 1.7, background: AMB_BG, border: "0.5px solid #E5CE9A",
                          color: AMB }}>
              Projected from expected receipts and payments, so it is only as good as the
              dates behind them. An invoice with no due date, or a payment run not yet
              assembled, will not appear.
            </div>
          )}
          {rpt === "ic" && (
            <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                          lineHeight: 1.7, background: AMB_BG, border: "0.5px solid #E5CE9A",
                          color: AMB }}>
              Intercompany balances must eliminate to nil across the group. This cannot
              reconcile pair by pair, because postings do not record a counterparty — a
              non-nil total means something is posted on one side only.
            </div>
          )}
        </div>

        {msg && (
          <div style={{ padding: "9px 12px", borderRadius: 7, fontSize: 11.5, marginBottom: 14,
                        background: AMB_BG, border: "0.5px solid #E5CE9A", color: AMB }}>
            {msg}
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {cols.map((c) => <th key={c} style={th(numeric(c))}>{label(c)}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c} style={numeric(c) ? num : td}>
                        {r[c] == null ? "—"
                          : numeric(c) ? money(r[c])
                          : /date/i.test(c) ? fmtD(r[c])
                          : typeof r[c] === "boolean" ? (r[c] ? "yes" : "no")
                          : String(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!rows.length && !msg && (
          <div style={{ ...card, textAlign: "center", padding: "28px 18px", color: MUT,
                        fontSize: 12.5, lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}>
              Nothing run yet
            </div>
            Set the parameters above and press Run report. Reports are not run automatically,
            because several need a date, a rate or a period, and figures produced from
            defaults nobody chose invite being believed.
          </div>
        )}
      </div>
    </div>
  );
}
