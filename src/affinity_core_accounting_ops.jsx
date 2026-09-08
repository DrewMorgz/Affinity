import { useState, useEffect } from "react";
import * as OPS from "./affinity_accounting_ops_api";
import { isConfigured } from "./affinity_accounting_supabase";
import EntitySearch from "./affinity_entity_search";

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTING OPERATIONS
//
// The areas the wiring audit found unreachable: client money, VAT returns,
// bank reconciliation, fixed assets, and accruals and prepayments. All had
// database functions from the start and no way to get to them.
//
// The module opens on ATTENTION rather than a menu, because in each of these
// areas the useful question is "what needs doing" and not "what exists". A
// client money shortfall is the clearest case: it is one row among thousands
// and it is the only one that matters.
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = "#001242", CYAN = "#00C4CC", MUT = "#5B6B7B", LINE = "#D9DEE5";
const RED = "#A32D2D", RED_BG = "#FCEBEB", AMB = "#7B4F1D", AMB_BG = "#FDF4DC",
      GRN = "#1F6F54", GRN_BG = "#E7F4EF";

const TABS = [
  { id: "overview",  label: "Attention" },
  { id: "clientmoney", label: "Client money" },
  { id: "vat",       label: "VAT returns" },
  { id: "bank",      label: "Bank reconciliation" },
  { id: "assets",    label: "Fixed assets" },
  { id: "deferrals", label: "Accruals & prepayments" },
];

const money = (v, ccy) => v == null || v === "" ? "—"
  : (ccy ? ccy + " " : "") + Number(v).toLocaleString("en-GB",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d) => d ? String(d).split("-").reverse().join("/") : "—";

  // The form. One component for all of them, so every field is controlled and
  // every refusal is surfaced the same way.
// Declared at module level, NOT inside the component. Defined inside, every
// keystroke created a new component type and React remounted the whole modal
// subtree — the inputs appeared to work and the derived warning never updated.
function FormModal({ form, FORMS, fv, setF, positions, formErr, saving,
                   onCancel, onSubmit, wouldOverdraw, clientBalance, numOf, money,
                   btn, NAVY, RED, RED_BG, GRN, GRN_BG, AMB, AMB_BG }) {
  if (!form || !FORMS[form]) return null;
  const def = FORMS[form];
  const cmClients = positions.filter((p) => p.client_name);
  const accounts  = positions.filter((p) => p.account_name)
    .filter((p, i, a) => a.findIndex((x) => x.account_id === p.account_id) === i);
  const overdraw = wouldOverdraw;
  const bal = form === "cmPay" ? clientBalance(fv.cmClientId) : null;

  return (
    <div onClick={(e) => e.target === e.currentTarget && onCancel()}
         style={{ position: "fixed", inset: 0, background: "rgba(0,18,66,0.45)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 1000, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "22px 24px",
                    width: "min(560px, 100%)", maxHeight: "86vh", overflowY: "auto",
                    boxShadow: "0 30px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 16 }}>
          {def.title}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
          {def.fields.map((f) => (
            <div key={f.k} style={{ gridColumn: f.full ? "1/-1" : "auto" }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600,
                              color: "#555", marginBottom: 4 }}>
                {f.label}{f.required && <span style={{ color: RED }}> *</span>}
              </label>
              {f.type === "client" ? (
                <select value={fv[f.k] || ""} onChange={(e) => setF(f.k, e.target.value)}
                        style={{ width: "100%", height: 34, fontSize: 12.5, borderRadius: 6,
                                 border: "0.5px solid #ccc", padding: "0 8px" }}>
                  <option value="">Choose a client…</option>
                  {cmClients.map((c) => (
                    <option key={c.cm_client_id} value={c.cm_client_id}>
                      {c.client_name} ({money(c.held, c.ccy)} held)
                    </option>
                  ))}
                </select>
              ) : f.type === "account" ? (
                <select value={fv[f.k] || ""} onChange={(e) => setF(f.k, e.target.value)}
                        style={{ width: "100%", height: 34, fontSize: 12.5, borderRadius: 6,
                                 border: "0.5px solid #ccc", padding: "0 8px" }}>
                  <option value="">Choose an account…</option>
                  {accounts.map((a) => (
                    <option key={a.account_id} value={a.account_id}>
                      {a.account_name} ({a.ccy})
                    </option>
                  ))}
                </select>
              ) : f.type === "select" ? (
                <select value={fv[f.k] || ""} onChange={(e) => setF(f.k, e.target.value)}
                        style={{ width: "100%", height: 34, fontSize: 12.5, borderRadius: 6,
                                 border: "0.5px solid #ccc", padding: "0 8px" }}>
                  <option value="">—</option>
                  {(f.opts || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type === "date" ? "date" : "text"}
                       value={fv[f.k] || ""} onChange={(e) => setF(f.k, e.target.value)}
                       style={{ width: "100%", height: 34, fontSize: 12.5, borderRadius: 6,
                                border: "0.5px solid #ccc", padding: "0 8px" }} />
              )}
            </div>
          ))}
        </div>

        {/* The balance this payment would leave. Overdrawing is allowed by
            design and records a breach automatically — so the consequence is
            stated BEFORE the payment, not discovered after it. */}
        {form === "cmPay" && fv.cmClientId && (
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 7, fontSize: 11.5,
                        lineHeight: 1.7,
                        background: overdraw ? RED_BG : GRN_BG,
                        border: "0.5px solid " + (overdraw ? "#f0c9c9" : "#bfe0d2"),
                        color: overdraw ? RED : GRN }}>
            {bal != null && (
              <div>Currently held for this client: <strong>{money(bal)}</strong></div>
            )}
            {overdraw ? (
              <div style={{ marginTop: 5 }}>
                <strong>This payment exceeds what is held for this client.</strong> It will
                be recorded as a client money breach and will need remediating from the
                firm's own money — not from another client's balance. Check you have the
                right client before continuing.
              </div>
            ) : numOf(fv.amount) != null && (
              <div style={{ marginTop: 5 }}>
                Would leave <strong>{money(bal - numOf(fv.amount))}</strong> held.
              </div>
            )}
          </div>
        )}

        {form === "vatPrepare" && (
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 7, fontSize: 11.5,
                        lineHeight: 1.7, background: AMB_BG, border: "0.5px solid #E5CE9A",
                        color: AMB }}>
            Preparing reads the ledger for the period and posts nothing. The return then has
            to be posted separately, which is what commits the liability.
          </div>
        )}

        {formErr && (
          <div style={{ marginTop: 14, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                        lineHeight: 1.6, background: RED_BG, border: "0.5px solid #f0c9c9",
                        color: RED }}>
            {formErr}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button style={btn(false)} onClick={onCancel} disabled={saving}>Cancel</button>
          <button style={{ ...btn(true), background: overdraw ? RED : CYAN }}
                  onClick={onSubmit} disabled={saving}>
            {saving ? "Saving…" : overdraw ? "Record anyway — creates a breach" : def.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AffinityAccountingOps({ onNav }) {
  const [tab, setTab]       = useState("overview");
  const [entity, setEntity] = useState("");
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState("");
  const [live, setLive]     = useState(false);

  const [overview, setOverview]   = useState([]);
  const [positions, setPositions] = useState([]);
  const [shortfalls, setShortfalls] = useState([]);
  const [breaches, setBreaches]   = useState([]);
  const [vat, setVat]             = useState([]);
  const [statements, setStatements] = useState([]);
  const [assets, setAssets]       = useState([]);
  const [deferrals, setDeferrals] = useState([]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setBusy(true); setMsg("");
    const res = await Promise.all([
      OPS.accOpsOverview(null), OPS.cmPosition(null), OPS.cmShortfalls(null),
      OPS.cmBreaches(true), OPS.vatReturnsList(null, null),
      OPS.bankStatementsList(null), OPS.fixedAssetsList(null, false),
      OPS.deferralsList(null, null),
    ]);
    setBusy(false);
    const anyLive = res.some((r) => r && r.live);
    setLive(anyLive);
    if (!anyLive) {
      setMsg("Not signed in — these figures come from the database and cannot be read yet.");
      return;
    }
    const [ov, pos, sf, br, v, st, as, df] = res;
    setOverview(ov.data || []);   setPositions(pos.data || []);
    setShortfalls(sf.data || []); setBreaches(br.data || []);
    setVat(v.data || []);         setStatements(st.data || []);
    setAssets(as.data || []);     setDeferrals(df.data || []);
    const failed = res.filter((r) => r && r.live && !r.ok);
    if (failed.length) setMsg(failed[0].error);
  };

  // Loads once on mount. load() is intentionally not a dependency — it is
  // recreated each render and would loop.
  useEffect(() => { load(); }, []);

  // ── Entry forms ───────────────────────────────────────────────────────────
  const [form, setForm]     = useState(null);   // which form is open
  const [fv, setFv]         = useState({});     // its values
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const setF = (k, v) => setFv((p) => ({ ...p, [k]: v }));

  const openForm = (id) => { setForm(id); setFv({}); setFormErr(""); };
  const closeForm = () => { setForm(null); setFv({}); setFormErr(""); };

  const today = () => new Date().toISOString().slice(0, 10);
  const numOf = (v) => (v === "" || v == null ? null
    : Number(String(v).replace(/[^0-9.\-]/g, "")) || null);

  // The balance a client money payment would leave behind. Shown before the
  // payment is made, because a payment that overdraws is allowed by design and
  // records a breach — the person should know that before committing, not
  // after.
  const clientBalance = (cmClientId) => {
    const p = positions.find((x) => String(x.cm_client_id) === String(cmClientId));
    return p ? Number(p.held) : null;
  };
  const wouldOverdraw = () => {
    if (form !== "cmPay") return false;
    const bal = clientBalance(fv.cmClientId);
    const amt = numOf(fv.amount);
    return bal != null && amt != null && amt > bal;
  };

  const submitForm = async () => {
    setSaving(true); setFormErr("");
    let res;
    try {
      if (form === "cmReceive") {
        res = await OPS.cmReceive({
          cmClientId: fv.cmClientId, accountId: fv.accountId,
          date: fv.date || today(), amount: numOf(fv.amount),
        });
      } else if (form === "cmPay") {
        res = await OPS.cmPay({
          cmClientId: fv.cmClientId, accountId: fv.accountId,
          date: fv.date || today(), amount: numOf(fv.amount),
          description: fv.description,
        });
      } else if (form === "assetCapitalise") {
        res = await OPS.assetCapitalise({
          entityId: numOf(fv.entityId), description: fv.description,
          category: fv.category, cost: numOf(fv.cost),
          acquisitionDate: fv.acquisitionDate || today(),
          inServiceDate: fv.inServiceDate || fv.acquisitionDate || today(),
          usefulLifeMonths: numOf(fv.usefulLifeMonths),
        });
      } else if (form === "assetDepreciation") {
        res = await OPS.assetDepreciation(numOf(fv.entityId), fv.period);
      } else if (form === "vatPrepare") {
        res = await OPS.vatPrepare(numOf(fv.entityId), fv.periodStart, fv.periodEnd);
      } else if (form === "accrual") {
        res = await OPS.createAccrual({
          entityId: numOf(fv.entityId), date: fv.date || today(),
          perPeriod: numOf(fv.perPeriod), expenseAccountId: numOf(fv.expenseAccountId),
          periods: numOf(fv.periods),
        });
      } else if (form === "prepayment") {
        res = await OPS.createPrepayment({
          entityId: numOf(fv.entityId), date: fv.date || today(),
          total: numOf(fv.total), expenseAccountId: numOf(fv.expenseAccountId),
          periods: numOf(fv.periods),
        });
      }
    } catch (e) {
      res = { ok: false, live: true, error: String((e && e.message) || e) };
    }
    setSaving(false);
    if (res && res.ok) { closeForm(); load(); return; }
    if (res && res.live === false) {
      setFormErr("Not signed in — this cannot be saved yet.");
      return;
    }
    setFormErr((res && res.error) || "That could not be saved.");
  };

  // Field definitions per form. Kept as data so every form gets the same
  // controlled inputs and the same refusal handling.
  const FORMS = {
    cmReceive: { title: "Record a client money receipt", cta: "Record receipt",
      fields: [
        { k: "cmClientId", label: "Client", type: "client", required: true },
        { k: "accountId",  label: "Client money account", type: "account", required: true },
        { k: "date",       label: "Date received", type: "date" },
        { k: "amount",     label: "Amount", required: true },
      ]},
    cmPay: { title: "Record a client money payment", cta: "Record payment",
      fields: [
        { k: "cmClientId",  label: "Client", type: "client", required: true },
        { k: "accountId",   label: "Client money account", type: "account", required: true },
        { k: "date",        label: "Date paid", type: "date" },
        { k: "amount",      label: "Amount", required: true },
        { k: "description", label: "What the payment is for", full: true, required: true },
      ]},
    assetCapitalise: { title: "Capitalise an asset", cta: "Capitalise",
      fields: [
        { k: "entityId",         label: "Entity id", required: true },
        { k: "description",      label: "Description", full: true, required: true },
        { k: "category",         label: "Category", type: "select", opts: OPS.ASSET_CATEGORIES },
        { k: "cost",             label: "Cost", required: true },
        { k: "acquisitionDate",  label: "Date acquired", type: "date" },
        { k: "inServiceDate",    label: "In service from", type: "date" },
        { k: "usefulLifeMonths", label: "Useful life (months)", required: true },
      ]},
    assetDepreciation: { title: "Run depreciation", cta: "Run",
      fields: [
        { k: "entityId", label: "Entity id", required: true },
        { k: "period",   label: "Period (YYYY-MM)", required: true },
      ]},
    vatPrepare: { title: "Prepare a VAT return", cta: "Prepare",
      fields: [
        { k: "entityId",    label: "Entity id", required: true },
        { k: "periodStart", label: "Period from", type: "date", required: true },
        { k: "periodEnd",   label: "Period to", type: "date", required: true },
      ]},
    accrual: { title: "Create an accrual", cta: "Create",
      fields: [
        { k: "entityId",         label: "Entity id", required: true },
        { k: "date",             label: "Start date", type: "date" },
        { k: "perPeriod",        label: "Amount per period", required: true },
        { k: "periods",          label: "Number of periods", required: true },
        { k: "expenseAccountId", label: "Expense account id", required: true },
      ]},
    prepayment: { title: "Create a prepayment", cta: "Create",
      fields: [
        { k: "entityId",         label: "Entity id", required: true },
        { k: "date",             label: "Start date", type: "date" },
        { k: "total",            label: "Total amount", required: true },
        { k: "periods",          label: "Release over (periods)", required: true },
        { k: "expenseAccountId", label: "Expense account id", required: true },
      ]},
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const th = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "#fff",
               background: NAVY, padding: "8px 10px", textTransform: "uppercase",
               letterSpacing: "0.4px", whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", fontSize: 12, borderBottom: "0.5px solid " + LINE,
               verticalAlign: "top" };
  const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const card = { background: "#fff", border: "0.5px solid " + LINE, borderRadius: 10,
                 padding: "14px 16px", marginBottom: 14 };
  const btn = (primary) => ({
    padding: "6px 13px", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
    border: primary ? "none" : "0.5px solid " + LINE,
    background: primary ? CYAN : "transparent", color: primary ? "#fff" : "#333",
  });

  const Empty = ({ what, why }) => (
    <div style={{ padding: "26px 18px", textAlign: "center", color: MUT, fontSize: 12.5,
                  lineHeight: 1.7 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "#333" }}>Nothing to show — {what}</div>
      {why && <div style={{ maxWidth: "34em", margin: "0 auto" }}>{why}</div>}
    </div>
  );

  const Table = ({ cols, rows, render, empty }) => (
    rows && rows.length ? (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{cols.map((c) => <th key={c} style={th}>{c}</th>)}</tr></thead>
          <tbody>{rows.map(render)}</tbody>
        </table>
      </div>
    ) : empty
  );

  // ── Attention ─────────────────────────────────────────────────────────────
  const Overview = () => {
    const bySeverity = { critical: [], attention: [], ok: [] };
    (overview || []).forEach((r) => (bySeverity[r.severity] || bySeverity.ok).push(r));
    const nothing = !overview.length ||
      overview.every((r) => r.severity === "ok" && !Number(r.count_value));

    return (
      <div>
        {bySeverity.critical.length > 0 && (
          <div style={{ ...card, background: RED_BG, borderColor: "#f0c9c9" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 8 }}>
              NEEDS ATTENTION NOW
            </div>
            {bySeverity.critical.map((r, i) => (
              <div key={i} style={{ fontSize: 13, color: RED, padding: "3px 0" }}>
                <strong>{r.count_value}</strong> {r.headline} — {r.area}
                {r.amount_value != null && <span> ({money(r.amount_value)})</span>}
              </div>
            ))}
            <div style={{ fontSize: 11, color: RED, marginTop: 8, lineHeight: 1.6 }}>
              A client money shortfall means the firm is holding less than it owes that
              client. It is reportable, and remediation comes from the firm's own money —
              never from another client's balance.
            </div>
          </div>
        )}

        {bySeverity.attention.length > 0 && (
          <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: AMB, marginBottom: 8 }}>
              OUTSTANDING
            </div>
            {bySeverity.attention.map((r, i) => (
              <div key={i} style={{ fontSize: 12.5, color: AMB, padding: "3px 0" }}>
                <strong>{r.count_value}</strong> {r.headline} — {r.area}
                {r.amount_value != null && <span> ({money(r.amount_value)})</span>}
              </div>
            ))}
          </div>
        )}

        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            All areas
          </div>
          <Table
            cols={["Area", "Measure", "Count", "Amount", ""]}
            rows={overview}
            render={(r, i) => (
              <tr key={i}>
                <td style={td}>{r.area}</td>
                <td style={{ ...td, color: MUT }}>{r.headline}</td>
                <td style={num}>{r.count_value}</td>
                <td style={num}>{r.amount_value == null ? "—" : money(r.amount_value)}</td>
                <td style={td}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px",
                                 borderRadius: 20,
                                 background: r.severity === "critical" ? RED_BG
                                           : r.severity === "attention" ? AMB_BG : GRN_BG,
                                 color: r.severity === "critical" ? RED
                                      : r.severity === "attention" ? AMB : GRN }}>
                    {r.severity === "ok" ? "clear" : r.severity}
                  </span>
                </td>
              </tr>
            )}
            empty={<Empty what="the overview has not loaded"
                          why="Sign in and reload. These figures are calculated from the ledger." />}
          />
        </div>

        {nothing && live && (
          <div style={{ fontSize: 12, color: MUT, lineHeight: 1.7, padding: "0 2px" }}>
            Everything is clear — but note that these areas are newly reachable and contain
            no data yet. An empty client money ledger is not the same as a reconciled one.
          </div>
        )}
      </div>
    );
  };

  // ── Client money ──────────────────────────────────────────────────────────
  const ClientMoney = () => (
    <div>
      {shortfalls.length > 0 && (
        <div style={{ ...card, background: RED_BG, borderColor: "#f0c9c9" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 8 }}>
            SHORTFALLS — {shortfalls.length} client{shortfalls.length === 1 ? "" : "s"}
          </div>
          <Table
            cols={["Client", "Held", "Last movement", "Days"]}
            rows={shortfalls}
            render={(r, i) => (
              <tr key={i}>
                <td style={{ ...td, fontWeight: 600 }}>{r.client_name}</td>
                <td style={{ ...num, color: RED, fontWeight: 700 }}>{money(r.held, r.ccy)}</td>
                <td style={td}>{fmtD(r.last_movement)}</td>
                <td style={num}>{r.days_open}</td>
              </tr>
            )}
          />
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Position by client
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={btn(true)} onClick={() => openForm("cmReceive")}>＋ Receipt</button>
            <button style={btn(false)} onClick={() => openForm("cmPay")}>＋ Payment</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.6 }}>
          Per client, not per account. A pooled account can balance in total while an
          individual client is short — that is the case that matters.
        </div>
        <Table
          cols={["Client", "Account", "Held", "Movements", "Last movement"]}
          rows={positions.filter((p) => p.client_name)}
          render={(r, i) => (
            <tr key={i}>
              <td style={{ ...td, fontWeight: 600 }}>{r.client_name}</td>
              <td style={{ ...td, color: MUT }}>{r.account_name || "—"}</td>
              <td style={{ ...num, color: Number(r.held) < 0 ? RED : "#111",
                           fontWeight: Number(r.held) < 0 ? 700 : 400 }}>
                {money(r.held, r.ccy)}
              </td>
              <td style={num}>{r.movements}</td>
              <td style={td}>{fmtD(r.last_movement)}</td>
            </tr>
          )}
          empty={<Empty what="no client money is recorded"
                        why="Client money movements are posted through the receipts and payments functions. Nothing has been recorded yet." />}
        />
      </div>

      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                      textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Breaches not remediated
        </div>
        <Table
          cols={["Identified", "Client", "Type", "Amount", "Status", "Days open"]}
          rows={breaches}
          render={(r, i) => (
            <tr key={i}>
              <td style={td}>{fmtD(r.breach_date)}</td>
              <td style={{ ...td, fontWeight: 600 }}>{r.client_name || "—"}</td>
              <td style={td}>{r.breach_type || "—"}</td>
              <td style={num}>{money(r.amount)}</td>
              <td style={td}>{r.status || "Open"}</td>
              <td style={{ ...num, color: r.days_open > 5 ? RED : "#111" }}>{r.days_open}</td>
            </tr>
          )}
          empty={<Empty what="no unremediated breaches"
                        why="A breach is recorded when a client's balance goes into debit. None are outstanding." />}
        />
      </div>
    </div>
  );

  // ── VAT ───────────────────────────────────────────────────────────────────
  const Vat = () => (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                      textTransform: "uppercase", letterSpacing: "0.4px" }}>
          VAT returns
        </div>
        <button style={btn(true)} onClick={() => openForm("vatPrepare")}>
          ＋ Prepare a return
        </button>
      </div>
      <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.6 }}>
        Preparing reads the ledger for the period and posts nothing. Posting is a separate
        act and is what commits the liability.
      </div>
      <Table
        cols={["Entity", "Period", "Output VAT", "Input VAT", "Net", "Status"]}
        rows={vat}
        render={(r, i) => (
          <tr key={i}>
            <td style={td}>{r.entity_name || "—"}</td>
            <td style={td}>{fmtD(r.period_start)} – {fmtD(r.period_end)}</td>
            <td style={num}>{money(r.output_vat)}</td>
            <td style={num}>{money(r.input_vat)}</td>
            <td style={{ ...num, fontWeight: 600 }}>{money(r.net_vat)}</td>
            <td style={td}>{r.status || "draft"}</td>
          </tr>
        )}
        empty={<Empty what="no VAT returns have been prepared"
                      why="Returns are prepared from the ledger for a period. None exist yet." />}
      />
    </div>
  );

  // ── Bank reconciliation ───────────────────────────────────────────────────
  const Bank = () => (
    <div style={card}>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 4,
                    textTransform: "uppercase", letterSpacing: "0.4px" }}>
        Bank statements
      </div>
      <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.6 }}>
        The unmatched count is the work. Auto-matching proposes matches on amount and date;
        it does not decide, and the result should be reviewed before the reconciliation is
        relied on.
      </div>
      <Table
        cols={["Entity", "Statement date", "Opening", "Closing", "Lines", "Matched", "Unmatched"]}
        rows={statements}
        render={(r, i) => (
          <tr key={i}>
            <td style={td}>{r.entity_name || "—"}</td>
            <td style={td}>{fmtD(r.statement_date)}</td>
            <td style={num}>{money(r.opening_balance, r.ccy)}</td>
            <td style={num}>{money(r.closing_balance, r.ccy)}</td>
            <td style={num}>{r.lines}</td>
            <td style={num}>{r.matched}</td>
            <td style={{ ...num, color: Number(r.unmatched) > 0 ? AMB : GRN,
                         fontWeight: Number(r.unmatched) > 0 ? 700 : 400 }}>
              {r.unmatched}
            </td>
          </tr>
        )}
        empty={<Empty what="no bank statements have been imported"
                      why="Reconciliation works from an imported statement. Importing needs a file upload, which is not built yet." />}
      />
    </div>
  );

  // ── Fixed assets ──────────────────────────────────────────────────────────
  const Assets = () => (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                      textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Fixed asset register
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={btn(true)} onClick={() => openForm("assetCapitalise")}>
            ＋ Capitalise an asset
          </button>
          <button style={btn(false)} onClick={() => openForm("assetDepreciation")}>
            Run depreciation
          </button>
        </div>
      </div>
      <Table
        cols={["Entity", "Description", "Category", "Cost", "Depreciation", "Net book value",
               "Months left", "Status"]}
        rows={assets}
        render={(r, i) => (
          <tr key={i}>
            <td style={td}>{r.entity_name || "—"}</td>
            <td style={{ ...td, fontWeight: 600 }}>{r.description}</td>
            <td style={{ ...td, color: MUT }}>{r.category || "—"}</td>
            <td style={num}>{money(r.cost)}</td>
            <td style={num}>{money(r.accumulated_dep)}</td>
            <td style={{ ...num, fontWeight: 600 }}>{money(r.net_book_value)}</td>
            <td style={num}>{r.months_remaining}</td>
            <td style={td}>{r.status || "—"}</td>
          </tr>
        )}
        empty={<Empty what="the asset register is empty"
                      why="Assets appear here once capitalised. Depreciation is then run per period." />}
      />
    </div>
  );

  // ── Deferrals ─────────────────────────────────────────────────────────────
  const Deferrals = () => {
    const stalled = deferrals.filter((d) => d.stalled);
    return (
      <div>
        {stalled.length > 0 && (
          <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: AMB, marginBottom: 6 }}>
              {stalled.length} SCHEDULE{stalled.length === 1 ? "" : "S"} HAVE STALLED
            </div>
            <div style={{ fontSize: 11.5, color: AMB, lineHeight: 1.7 }}>
              These still have periods to run but the next posting date is more than two
              months past. A schedule that stops releasing is a misstatement that nobody
              notices until the audit.
            </div>
          </div>
        )}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                          textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Accruals, prepayments and deferred income
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={btn(true)} onClick={() => openForm("accrual")}>＋ Accrual</button>
              <button style={btn(false)} onClick={() => openForm("prepayment")}>＋ Prepayment</button>
            </div>
          </div>
          <Table
            cols={["Entity", "Kind", "Description", "Total", "Per period", "Released",
                   "Remaining", "Next posting", ""]}
            rows={deferrals}
            render={(r, i) => (
              <tr key={i} style={r.stalled ? { background: AMB_BG } : undefined}>
                <td style={td}>{r.entity_name || "—"}</td>
                <td style={td}>{r.kind}</td>
                <td style={{ ...td, color: MUT }}>{r.description || "—"}</td>
                <td style={num}>{money(r.total_amount, r.ccy)}</td>
                <td style={num}>{money(r.per_period)}</td>
                <td style={num}>{r.periods_posted} / {r.periods_total}</td>
                <td style={{ ...num, fontWeight: 600 }}>{money(r.remaining)}</td>
                <td style={td}>{fmtD(r.next_post_date)}</td>
                <td style={td}>
                  {r.stalled && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: AMB }}>stalled</span>
                  )}
                </td>
              </tr>
            )}
            empty={<Empty what="no schedules exist"
                          why="Accruals and prepayments create a schedule that releases over a number of periods." />}
          />
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "Catamaran, system-ui, sans-serif",
                  background: "var(--bg-secondary,#F6F8FB)", minHeight: 600 }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 20px", borderBottom: "0.5px solid #e5e5e5",
                    background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: NAVY }}>Accounting operations</div>
          <span title={live ? "Reading live records from the database"
                            : "Not signed in — the database cannot be read"}
                style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                         background: live ? GRN_BG : AMB_BG,
                         color: live ? GRN : AMB,
                         border: "0.5px solid " + (live ? "#bfe0d2" : "#E5CE9A") }}>
            ● {live ? "Live data" : isConfigured ? "No records returned" : "Not signed in"}
          </span>
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
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer",
                     border: "none", background: "transparent",
                     color: tab === t.id ? NAVY : MUT,
                     fontWeight: tab === t.id ? 600 : 400,
                     borderBottom: tab === t.id ? "2px solid " + CYAN : "2px solid transparent" }}>
            {t.label}
            {t.id === "clientmoney" && shortfalls.length > 0 && (
              <span style={{ marginLeft: 6, background: RED, color: "#fff", borderRadius: 10,
                             padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>
                {shortfalls.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ margin: "12px 20px 0", padding: "9px 12px", borderRadius: 7,
                      fontSize: 11.5, lineHeight: 1.6, background: AMB_BG,
                      border: "0.5px solid #E5CE9A", color: AMB }}>
          {msg}
        </div>
      )}

      <div style={{ padding: "16px 20px 24px" }}>
        {tab === "overview"    && <Overview />}
        {tab === "clientmoney" && <ClientMoney />}
        {tab === "vat"         && <Vat />}
        {tab === "bank"        && <Bank />}
        {tab === "assets"      && <Assets />}
        {tab === "deferrals"   && <Deferrals />}
      </div>

      <FormModal form={form} FORMS={FORMS} fv={fv} setF={setF} positions={positions}
                 formErr={formErr} saving={saving} onCancel={closeForm} onSubmit={submitForm}
                 wouldOverdraw={wouldOverdraw()} clientBalance={clientBalance}
                 numOf={numOf} money={money} btn={btn}
                 NAVY={NAVY} RED={RED} RED_BG={RED_BG} GRN={GRN} GRN_BG={GRN_BG}
                 AMB={AMB} AMB_BG={AMB_BG} />
    </div>
  );
}
