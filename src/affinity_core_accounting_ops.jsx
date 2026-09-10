import { useState, useEffect } from "react";
import * as OPS from "./affinity_accounting_ops_api";
import * as ME from "./affinity_monthend_api";
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
  { id: "monthend",  label: "Month-end close" },
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

// ── Taking Affinity's fee from client money ───────────────────────────────
// cm_fee_transfer and cm_fee_available were built in db/076 and had no
// screen. So the control that refuses a fee larger than the client holds
// existed and could not be reached, and the fee would have been taken some
// other way — which is the situation the control was written to prevent.
// AT MODULE LEVEL, deliberately. Defined inside the parent component this was
// a new function on every render, so React unmounted and remounted it on each
// keystroke: the DOM value changed, onChange never reached the parent's state,
// and the submit button stayed disabled. The same fault was fixed earlier in
// this build for FormModal and reintroduced here.
function FeeTransfer({ feeForm, setFeeForm, fee, setFee, feeAvail, setFeeAvail,
                     feeMsg, setFeeMsg, setMsg, load, ME, money,
                     NAVY, MUT, RED, RED_BG, GRN, GRN_BG, btn }) {
  if (!feeForm) return null;
  const short = feeAvail && Number(fee.amount || 0) > Number(feeAvail.available_to_take || 0);
  return (
    <div onClick={(e) => e.target === e.currentTarget && (setFeeForm(false), setFee({}), setFeeAvail(null), setFeeMsg(""))}
         style={{ position: "fixed", inset: 0, background: "rgba(0,18,66,0.45)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 1000, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "22px 24px",
                    width: "min(620px,100%)", maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
          Take a fee from client money
        </div>
        <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.7, marginBottom: 14 }}>
          This is treated differently from a payment the client instructed. A fee transfer
          is entirely Affinity's own decision, and taking a fee from a client who does not
          have the money means the firm has used <strong>another client's money to pay
          itself</strong>. It is refused rather than recorded as a breach — the bill can wait.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
          {[["cmClientId", "Client money client id", true],
            ["accountId", "Client money account id", true],
            ["invoiceId", "Invoice id", true],
            ["firmEntityId", "Firm entity id", true],
            ["firmBankId", "Firm bank account id", true],
            ["date", "Date", false],
            ["amount", "Fee to take", true]].map(([k, lab, req]) => (
            <div key={k}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600,
                              color: "#555", marginBottom: 4 }}>
                {lab}{req && <span style={{ color: RED }}> *</span>}
              </label>
              <input value={fee[k] || ""}
                     onChange={(e) => setFee({ ...fee, [k]: e.target.value })}
                     style={{ width: "100%", height: 34, fontSize: 12.5, borderRadius: 6,
                              border: "0.5px solid #ccc", padding: "0 8px" }} />
            </div>
          ))}
        </div>

        <button style={{ ...btn(false), marginTop: 12 }}
                disabled={!fee.cmClientId || !fee.invoiceId}
                onClick={async () => {
                  setFeeMsg("");
                  // No defensive ternary here. `await X ? await X(...) : ...`
                  // is a precedence trap — it awaits the function reference,
                  // which is always truthy, so the guard never fires and only
                  // obscures a real failure.
                  const r = await ME.cmFeeAvailable(Number(fee.cmClientId),
                                                    Number(fee.invoiceId));
                  if (!r.live) { setFeeMsg("Not signed in — this cannot be checked."); return; }
                  const row = Array.isArray(r.data) ? r.data[0] : r.data;
                  setFeeAvail(row || null);
                  if (!r.ok) setFeeMsg(r.error);
                }}>
          Check what may be taken
        </button>

        {feeAvail && (
          <div style={{ marginTop: 12, padding: "11px 14px", borderRadius: 8,
                        fontSize: 11.5, lineHeight: 1.8,
                        background: short ? RED_BG : GRN_BG,
                        border: "0.5px solid " + (short ? "#f0c9c9" : "#bfe0d2"),
                        color: short ? RED : GRN }}>
            <div><strong>{feeAvail.client_name}</strong></div>
            <div>Held for that client: {money(feeAvail.held)}</div>
            <div>Invoice outstanding: {money(feeAvail.invoice_outstanding)}</div>
            <div><strong>May be taken: {money(feeAvail.available_to_take)}</strong> — the
              lower of the two, because you cannot take more than the client holds nor more
              than has been billed.</div>
            {short && (
              <div style={{ marginTop: 6 }}>
                <strong>This would take more than is held and will be refused.</strong> Bill
                the client and wait for funds, or transfer only the amount held.
              </div>
            )}
          </div>
        )}

        {feeMsg && (
          <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                        lineHeight: 1.6, background: RED_BG,
                        border: "0.5px solid #f0c9c9", color: RED, whiteSpace: "pre-wrap" }}>
            {feeMsg}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button style={btn(false)}
                  onClick={() => { setFeeForm(false); setFee({}); setFeeAvail(null); setFeeMsg(""); }}>
            Cancel
          </button>
          <button style={btn(true)}
                  onClick={async () => {
                    setFeeMsg("");
                    const r = await ME.cmFeeTransfer({
                      cmClientId: Number(fee.cmClientId), accountId: Number(fee.accountId),
                      firmEntityId: Number(fee.firmEntityId), firmBankId: Number(fee.firmBankId),
                      invoiceId: Number(fee.invoiceId),
                      date: fee.date || new Date().toISOString().slice(0, 10),
                      amount: Number(fee.amount),
                    });
                    if (r && r.ok) {
                      setFeeForm(false); setFee({}); setFeeAvail(null);
                      setMsg("Fee taken from client money and recorded in the audit trail.");
                      load();
                      return;
                    }
                    if (r && r.live === false) { setFeeMsg("Not signed in."); return; }
                    setFeeMsg((r && r.error) || "That could not be completed.");
                  }}>
            Take the fee
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
  const [checklist, setChecklist] = useState([]);
  const [recons, setRecons]       = useState([]);
  const [meEntity, setMeEntity]   = useState("");
  const [mePeriod, setMePeriod]   = useState(new Date().toISOString().slice(0, 7));
  const [meMsg, setMeMsg]         = useState("");
  const [feeForm, setFeeForm]     = useState(false);
  const [fee, setFee]             = useState({});
  const [feeAvail, setFeeAvail]   = useState(null);
  const [feeMsg, setFeeMsg]       = useState("");

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

  const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 600, padding: "2px 7px",
                              borderRadius: 20, background: bg, color: fg,
                              whiteSpace: "nowrap" });

  // ── Month-end close ───────────────────────────────────────────────────────
  // A checklist, not a dashboard. At month end the question is what has been
  // done and what has not, and which of the outstanding items actually stops
  // the period being closed.
  const MonthEnd = () => {
    const blocking = checklist.filter((c) => c.blocking && !c.done);
    const todo     = checklist.filter((c) => !c.blocking && !c.done);
    const selfSigned = recons.filter((r) => r.self_signed);

    const loadMe = async () => {
      if (!meEntity) { setMeMsg("Enter an entity id to run the checklist."); return; }
      setMeMsg("");
      const [cl, rc] = await Promise.all([
        ME.monthEndChecklist(Number(meEntity), mePeriod),
        ME.cmReconsList(null, 20),
      ]);
      if (!cl.live) {
        setMeMsg("Not signed in — the checklist reads from the database and cannot be produced yet.");
        return;
      }
      setChecklist(cl.data || []);
      setRecons(rc.data || []);
      if (!cl.ok) setMeMsg(cl.error);
    };

    return (
      <div>
        <div style={card}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                              color: "#555", marginBottom: 3 }}>Entity id</label>
              <input value={meEntity} onChange={(e) => setMeEntity(e.target.value)}
                     placeholder="e.g. 16"
                     style={{ height: 32, width: 110, fontSize: 12, borderRadius: 6,
                              border: "0.5px solid #ccc", padding: "0 8px" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                              color: "#555", marginBottom: 3 }}>Period</label>
              <input type="month" value={mePeriod} onChange={(e) => setMePeriod(e.target.value)}
                     style={{ height: 32, fontSize: 12, borderRadius: 6,
                              border: "0.5px solid #ccc", padding: "0 8px" }} />
            </div>
            <button style={btn(true)} onClick={loadMe}>Run checklist</button>
            <button style={btn(false)}
                    title="Reopening a closed period needs a reason, because anything already reported on it may change"
                    onClick={async () => {
                      if (!meEntity) { setMeMsg("Enter an entity id first."); return; }
                      const why = window.prompt(
                        "Why is " + mePeriod + " being reopened?\n\n" +
                        "Anything already reported on this period may change, so the reason " +
                        "is kept on the record rather than being a formality.");
                      if (!why) return;
                      setMeMsg("");
                      const r = await ME.periodReopen(Number(meEntity), mePeriod, why);
                      if (r && r.ok) { setMeMsg("Period reopened."); loadMe(); return; }
                      if (r && r.live === false) { setMeMsg("Not signed in."); return; }
                      setMeMsg((r && r.error) || "The period could not be reopened.");
                    }}>
              Reopen the period
            </button>
          </div>
          {meMsg && (
            <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                          background: AMB_BG, border: "0.5px solid #E5CE9A", color: AMB }}>
              {meMsg}
            </div>
          )}
        </div>

        {blocking.length > 0 && (
          <div style={{ ...card, background: RED_BG, borderColor: "#f0c9c9" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 8 }}>
              THESE STOP THE PERIOD BEING CLOSED
            </div>
            {blocking.map((c, i) => (
              <div key={i} style={{ fontSize: 12, color: RED, padding: "4px 0", lineHeight: 1.6 }}>
                <strong>{c.step}</strong> — {c.detail}
              </div>
            ))}
          </div>
        )}

        {selfSigned.length > 0 && (
          <div style={{ ...card, background: RED_BG, borderColor: "#f0c9c9" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 6 }}>
              {selfSigned.length} CLIENT MONEY RECONCILIATION(S) SIGNED OFF BY THEIR PREPARER
            </div>
            <div style={{ fontSize: 11.5, color: RED, lineHeight: 1.7 }}>
              A reconciliation prepared and signed by the same person is the control a
              regulator asks for evidence of. These predate the check now in place and need
              reviewing.
            </div>
          </div>
        )}

        {checklist.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                          textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Checklist for {mePeriod}
            </div>
            <Table
              cols={["", "Step", "Detail", "Outstanding", ""]}
              rows={checklist}
              render={(c, i) => {
                // Each step that CAN be run gets a button. Previously the
                // checklist reported what was outstanding and offered no way
                // to do any of it — a checklist you can read and not act on.
                const runners = {
                  "Period open": {
                    label: "Open the period",
                    fn: () => ME.periodOpen(Number(meEntity), mePeriod),
                    ok: "Period opened.",
                  },
                  "FX rates loaded": {
                    label: "Revalue at period end",
                    fn: () => ME.runFxRevaluation(Number(meEntity), mePeriod),
                    ok: "FX revaluation posted.",
                    note: "Needs rates at the period end date first.",
                  },
                  "Recurring journals posted": {
                    label: "Post them",
                    fn: () => ME.runRecurringJournals(mePeriod + "-01"),
                    ok: "Recurring journals posted.",
                  },
                  "Deferrals released": {
                    label: "Release them",
                    fn: () => ME.runDeferrals(Number(meEntity), mePeriod + "-01"),
                    ok: "Deferrals released.",
                  },
                };
                const r = runners[c.step];
                return (
                  <tr key={i} style={c.blocking && !c.done ? { background: RED_BG } : undefined}>
                    <td style={td}>
                      <span style={pill(c.done ? GRN_BG : c.blocking ? RED_BG : AMB_BG,
                                        c.done ? GRN : c.blocking ? RED : AMB)}>
                        {c.done ? "done" : c.blocking ? "blocks close" : "to do"}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{c.step}</td>
                    <td style={{ ...td, color: MUT, lineHeight: 1.5 }}>{c.detail}</td>
                    <td style={num}>{c.due_count > 0 ? c.due_count : "—"}</td>
                    <td style={td}>
                      {r && !c.done && (
                        <button style={btn(c.blocking)} title={r.note || ""}
                                onClick={async () => {
                                  setMeMsg("");
                                  const res = await r.fn();
                                  if (res && res.ok) { setMeMsg(r.ok); loadMe(); return; }
                                  if (res && res.live === false) {
                                    setMeMsg("Not signed in — that cannot be run."); return;
                                  }
                                  setMeMsg((res && res.error) || "That could not be run.");
                                }}>
                          {r.label}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              }}
            />
            {todo.length === 0 && blocking.length === 0 && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: GRN, lineHeight: 1.7 }}>
                Everything on the checklist is done. Note that this checks whether each step
                has been RUN, not whether its output is right — a reconciliation that balances
                is still worth reading.
              </div>
            )}
          </div>
        )}

        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 4,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Client money reconciliations
          </div>
          <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.7 }}>
            Three differences, never merged into one. Internal is our book against the client
            ledgers — our own records disagreeing. External is our book against the bank. A
            shortfall means holding less than we owe, and is the reportable one. Sign-off is
            refused to whoever prepared it, and refused outright while a shortfall stands.
          </div>
          <Table
            cols={["Date", "Account", "Bank", "Book", "Client ledgers", "Internal diff",
                   "External diff", "Shortfall", "Status", ""]}
            rows={recons}
            render={(r) => (
              <tr key={r.id} style={Number(r.shortfall) > 0 ? { background: RED_BG }
                                  : r.self_signed ? { background: AMB_BG } : undefined}>
                <td style={td}>{fmtD(r.recon_date)}</td>
                <td style={td}>{r.account_name || "—"}</td>
                <td style={num}>{money(r.bank_balance)}</td>
                <td style={num}>{money(r.book_balance)}</td>
                <td style={num}>{money(r.client_ledger_total)}</td>
                <td style={{ ...num, color: Number(r.internal_diff) !== 0 ? AMB : "#111" }}>
                  {money(r.internal_diff)}
                </td>
                <td style={{ ...num, color: Number(r.external_diff) !== 0 ? AMB : "#111" }}>
                  {money(r.external_diff)}
                </td>
                <td style={{ ...num, fontWeight: 700,
                             color: Number(r.shortfall) > 0 ? RED : "#111" }}>
                  {money(r.shortfall)}
                </td>
                <td style={td}>
                  <span style={pill(r.status === "signed_off" ? GRN_BG : AMB_BG,
                                    r.status === "signed_off" ? GRN : AMB)}>
                    {r.status || "open"}
                  </span>
                  {r.self_signed && (
                    <div style={{ ...pill(RED_BG, RED), marginTop: 3, display: "inline-block" }}>
                      self-signed
                    </div>
                  )}
                </td>
                <td style={td}>
                  {r.status !== "signed_off" && (
                    <button style={btn(true)}
                            title="Refused if you prepared it, or if a shortfall stands"
                            onClick={async () => {
                              const res = await ME.cmReconSignOff(r.id);
                              if (res && res.ok) { loadMe(); return; }
                              setMeMsg((res && res.error) || "That could not be signed off.");
                            }}>
                      Sign off
                    </button>
                  )}
                </td>
              </tr>
            )}
            empty={<Empty what="no client money reconciliations exist"
                          why="A reconciliation compares the bank statement balance against the book balance and the sum of client ledgers." />}
          />
        </div>
      </div>
    );
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
            <button style={btn(false)}
                    title="Refused if the client does not hold the money — a fee transfer is the firm helping itself, not a client instruction"
                    onClick={() => { setFeeForm(true); setFee({}); setFeeAvail(null); setFeeMsg(""); }}>
              Take a fee
            </button>
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
        {tab === "monthend"    && <MonthEnd />}
      </div>

      <FeeTransfer feeForm={feeForm} setFeeForm={setFeeForm} fee={fee} setFee={setFee}
                   feeAvail={feeAvail} setFeeAvail={setFeeAvail}
                   feeMsg={feeMsg} setFeeMsg={setFeeMsg} setMsg={setMsg}
                   load={load} ME={ME} money={money}
                   NAVY={NAVY} MUT={MUT} RED={RED} RED_BG={RED_BG}
                   GRN={GRN} GRN_BG={GRN_BG} btn={btn} />

      <FormModal form={form} FORMS={FORMS} fv={fv} setF={setF} positions={positions}
                 formErr={formErr} saving={saving} onCancel={closeForm} onSubmit={submitForm}
                 wouldOverdraw={wouldOverdraw()} clientBalance={clientBalance}
                 numOf={numOf} money={money} btn={btn}
                 NAVY={NAVY} RED={RED} RED_BG={RED_BG} GRN={GRN} GRN_BG={GRN_BG}
                 AMB={AMB} AMB_BG={AMB_BG} />
    </div>
  );
}
