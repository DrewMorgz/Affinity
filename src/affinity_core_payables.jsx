import { useState, useEffect } from "react";
import * as OPS from "./affinity_accounting_ops_api";
import * as PAY from "./affinity_payables_api";
import * as FID from "./affinity_fiduciary_api";
import { isConfigured } from "./affinity_accounting_supabase";
import EntitySearch from "./affinity_entity_search";
import * as OW from "./affinity_ops_write_api";

// ─────────────────────────────────────────────────────────────────────────────
// PURCHASES AND RECEIVABLES
//
// Purchase orders, payment runs, expense claims and credit control. Like the
// accounting operations module, these had database functions from the start
// and no way to reach them.
//
// The thing this module is built around is the CONTROL, not the list. Building
// it surfaced that payment run and expense claim approval did not enforce
// segregation of duties at all — so the screens lead with who did what, and
// with anything already approved by the person who raised it.
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = "#001242", CYAN = "#00C4CC", MUT = "#5B6B7B", LINE = "#D9DEE5";
const RED = "#A32D2D", RED_BG = "#FCEBEB", AMB = "#7B4F1D", AMB_BG = "#FDF4DC",
      GRN = "#1F6F54", GRN_BG = "#E7F4EF";

const TABS = [
  { id: "overview",  label: "Attention" },
  { id: "runs",      label: "Payment runs" },
  { id: "claims",    label: "Expense claims" },
  { id: "orders",    label: "Purchase orders" },
  { id: "credit",    label: "Credit control" },
  { id: "interco",   label: "Intercompany" },
];

const money = (v, ccy) => v == null || v === "" ? "—"
  : (ccy ? ccy + " " : "") + Number(v).toLocaleString("en-GB",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d) => d ? String(d).split("-").reverse().join("/") : "—";


// ─────────────────────────────────────────────────────────────────────────────
// The purchase and expense cycle could APPROVE and not ASSEMBLE. The screen
// could approve a payment run nobody could create, approve an expense claim
// nobody could submit, and list purchase orders nobody could raise. poCreate,
// goodsReceive, payRunCreate, payRunAddPayables, expenseClaimSubmit and
// expenseClaimReimburse were all wrapped and had no button; rejecting a claim,
// credit notes and disbursements had no wrapper at all.
//
// AT MODULE LEVEL — a modal declared inside the component remounts on every
// keystroke and the form appears frozen.
// ─────────────────────────────────────────────────────────────────────────────
const PAY_FORMS = {
  payRun: {
    title: "Create a payment run",
    note: "Assembling, approving and executing are three separate acts. The person who chooses who gets paid should not be the one who authorises it, nor the one who releases it — that is the control that stops a payment to an account nobody checked.",
    cta: "Create the run",
    fields: [["entityId", "Entity id", true, ""], ["runDate", "Run date", true, "YYYY-MM-DD"],
             ["ccy", "Currency", true, "GBP"]],
  },
  addPayables: {
    title: "Add open payables to the run",
    note: "Core refuses if nothing was added and says why — no open payables at all, or payables in a different currency from the run. An empty run that looked assembled is one someone goes on to approve.",
    cta: "Add them",
    fields: [["runId", "Run id", true, ""]],
  },
  po: {
    title: "Raise a purchase order",
    note: "Lines are entered as JSON for now: [{\"description\":\"…\",\"qty\":1,\"unit_price\":100}]",
    cta: "Raise the order",
    fields: [["entityId", "Entity id", true, ""], ["supplierId", "Supplier id", true, ""],
             ["poDate", "Date", true, "YYYY-MM-DD"], ["ccy", "Currency", true, "GBP"],
             ["lines", "Lines (JSON)", true, ""]],
  },
  goods: {
    title: "Record goods received",
    note: "The middle leg of three-way matching: the order, the goods, and the invoice. Without it an invoice can be paid for something nobody confirmed arrived.",
    cta: "Record receipt",
    fields: [["poId", "Purchase order id", true, ""],
             ["receiptDate", "Date received", true, "YYYY-MM-DD"],
             ["lines", "Lines (JSON)", true, ""]],
  },
  claim: {
    title: "Submit an expense claim",
    note: "Approval is refused on your own claim.",
    cta: "Submit the claim",
    fields: [["employeeId", "Employee id", true, ""], ["entityId", "Entity id", true, ""],
             ["claimDate", "Date", true, "YYYY-MM-DD"], ["ccy", "Currency", true, "GBP"],
             ["lines", "Lines (JSON)", true, ""]],
  },
  reject: {
    title: "Reject an expense claim",
    note: "A reason is required. A claim that comes back with no reason gets resubmitted unchanged, which wastes everyone's time twice.",
    cta: "Reject the claim",
    fields: [["approver", "Your name", true, ""], ["reason", "Reason", true, ""]],
  },
  reimburse: {
    title: "Reimburse an approved claim",
    cta: "Record the reimbursement",
    fields: [["date", "Date", true, "YYYY-MM-DD"],
             ["bankAccountId", "Bank account id", true, ""]],
  },
  icLoan: {
    title: "Move a group loan",
    note: "A group loan that is listed and never drawn, repaid or accrued is a balance consolidation has to keep eliminating. Accruing nothing is not the same as there being nothing to accrue — a loan with no interest rate is flagged separately, because a tax authority will impute one.",
    cta: "Record the movement",
    fields: [["loanId", "Loan id", true, ""],
             ["action", "Draw, repay or accrue", true, "draw / repay / accrue"],
             ["date", "Date", true, "YYYY-MM-DD"],
             ["amount", "Amount (draw or repay)", false, ""],
             ["days", "Days (accrue)", false, ""]],
  },
  icSettle: {
    title: "Settle an intercompany balance",
    note: "The group total must eliminate to nil. A balance that sits unsettled is one consolidation has to keep eliminating, and the longer it sits the harder it is to establish what it was for.",
    cta: "Settle",
    fields: [["creditorId", "Creditor entity id", true, ""],
             ["debtorId", "Debtor entity id", true, ""],
             ["date", "Date", true, "YYYY-MM-DD"],
             ["ccy", "Currency", true, "GBP"], ["amount", "Amount", true, ""]],
  },
  creditNote: {
    title: "Raise a credit note",
    note: "A credit note is not a negative invoice. It is its own document with its own number, because reversing an invoice by editing it destroys the audit trail.",
    cta: "Raise the credit note",
    fields: [["side", "AR or AP", true, "AR"], ["entityId", "Entity id", true, ""],
             ["date", "Date", true, "YYYY-MM-DD"], ["ccy", "Currency", true, "GBP"],
             ["party", "Customer or supplier", true, ""],
             ["reason", "Reason", true, ""], ["lines", "Lines (JSON)", true, ""]],
  },
};

function PayForm({ kind, f, setF, msg, busy, onCancel, onSave }) {
  if (!kind) return null;
  const d = PAY_FORMS[kind];
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
        {d.note && (
          <div style={{ fontSize: 11.5, color: "#5B6B7B", lineHeight: 1.7, marginBottom: 14 }}>
            {d.note}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
          {d.fields.map(([k, lab, req, ph]) => (
            <div key={k} style={{ gridColumn: (k === "lines" || k === "reason") ? "1/-1" : "auto" }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600,
                              color: "#555", marginBottom: 4 }}>
                {lab}{req && <span style={{ color: "#A32D2D" }}> *</span>}
              </label>
              <input value={f[k] || ""} placeholder={ph}
                     onChange={(e) => setF({ ...f, [k]: e.target.value })}
                     style={{ width: "100%", height: 34, fontSize: 12.5, borderRadius: 6,
                              border: "0.5px solid #ccc", padding: "0 8px" }} />
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

export default function AffinityPayables({ onNav }) {
  const [tab, setTab]       = useState("overview");
  const [entity, setEntity] = useState("");
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState("");
  const [live, setLive]     = useState(false);
  const [acting, setActing] = useState(null);
  // The actions that need input. Assembling a run, raising an order, recording
  // goods, submitting or rejecting a claim, reimbursing one, raising a credit
  // note — all previously unreachable.
  const [pForm, setPForm] = useState(null);
  const [pF, setPF]       = useState({});
  const [pId, setPId]     = useState(null);
  const [pMsg, setPMsg]   = useState("");
  const [pBusy, setPBusy] = useState(false);

  const jsonOr = (v, fallback) => {
    try { return JSON.parse(v); } catch (e) { return fallback; }
  };

  const runPForm = async () => {
    setPBusy(true); setPMsg("");
    const v = pF;
    let r;
    try {
      if (pForm === "payRun")
        r = await PAY.payRunCreate(Number(v.entityId), v.runDate, v.ccy);
      if (pForm === "addPayables")
        r = await PAY.payRunAddPayables(Number(v.runId || pId));
      if (pForm === "po")
        r = await PAY.poCreate({ entityId: Number(v.entityId),
                                 supplierId: Number(v.supplierId),
                                 poDate: v.poDate, ccy: v.ccy,
                                 lines: jsonOr(v.lines, null) });
      if (pForm === "goods")
        r = await PAY.goodsReceive(Number(v.poId || pId), v.receiptDate,
                                   jsonOr(v.lines, null));
      if (pForm === "claim")
        r = await PAY.expenseClaimSubmit({ employeeId: Number(v.employeeId),
                                           entityId: Number(v.entityId),
                                           claimDate: v.claimDate, ccy: v.ccy,
                                           lines: jsonOr(v.lines, null) });
      if (pForm === "reject")
        r = await PAY.expenseClaimReject(Number(pId), v.approver, v.reason);
      if (pForm === "reimburse")
        r = await PAY.expenseClaimReimburse(Number(pId), v.date,
                                            Number(v.bankAccountId));
      if (pForm === "icLoan") {
        const a = (v.action || "").toLowerCase();
        if (a === "draw")   r = await PAY.icLoanDraw(Number(v.loanId), v.date, Number(v.amount));
        if (a === "repay")  r = await PAY.icLoanRepay(Number(v.loanId), v.date, Number(v.amount));
        if (a === "accrue") r = await PAY.icLoanAccrue(Number(v.loanId), v.date, Number(v.days));
        if (!r) r = { ok: false, live: true,
                      error: "Choose draw, repay or accrue." };
      }
      if (pForm === "icSettle")
        r = await PAY.icSettle(Number(v.creditorId), Number(v.debtorId), v.date,
                               v.ccy, Number(v.amount));
      if (pForm === "creditNote") {
        const common = { entityId: Number(v.entityId), date: v.date, ccy: v.ccy,
                         lines: jsonOr(v.lines, null), reason: v.reason };
        r = (v.side || "AR").toUpperCase() === "AP"
          ? await PAY.apCreditNote({ ...common, supplier: v.party })
          : await PAY.arCreditNote({ ...common, party: v.party });
      }
    } catch (e) {
      r = { ok: false, live: true, error: String((e && e.message) || e) };
    }
    setPBusy(false);
    if (r && r.ok) { setPForm(null); setPF({}); setPMsg(""); load(); return; }
    if (r && r.live === false) { setPMsg("Not signed in — that cannot be saved."); return; }
    setPMsg((r && r.error) || "That could not be completed.");
  };

  const openPForm = (kind, id, seed) => {
    setPForm(kind); setPId(id ?? null); setPF(seed || {}); setPMsg("");
  };   // id being approved/executed

  const [overview, setOverview] = useState([]);
  const [runs, setRuns]         = useState([]);
  const [claims, setClaims]     = useState([]);
  const [orders, setOrders]     = useState([]);
  const [credit, setCredit]     = useState([]);
  const [icBal, setIcBal]       = useState([]);
  const [icLoans, setIcLoans]   = useState([]);
  const [tpPol, setTpPol]       = useState([]);
  const [icMsg, setIcMsg]       = useState("");

  const load = async () => {
    setBusy(true); setMsg("");
    const res = await Promise.all([
      PAY.payablesOverview(null), PAY.payRunsList(null),
      PAY.expenseClaimsList(null), PAY.poList(null, null),
      PAY.collectionsList(null),
    ]);
    setBusy(false);
    const anyLive = res.some((r) => r && r.live);
    setLive(anyLive);
    if (!anyLive) {
      setMsg("Not signed in — these figures come from the database and cannot be read yet.");
      return;
    }
    const [ov, r, c, o, cr] = res;
    setOverview(ov.data || []); setRuns(r.data || []);
    setClaims(c.data || []);    setOrders(o.data || []);
    setCredit(cr.data || []);
    const failed = res.filter((x) => x && x.live && !x.ok);
    if (failed.length) setMsg(failed[0].error);
  };

  useEffect(() => { load(); }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  // Each of these is refused by the database if the person acting is the person
  // who raised it. The refusal message is shown as it comes back, because it
  // says exactly what is wrong.
  const act = async (id, fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setActing(id); setMsg("");
    const res = await fn();
    setActing(null);
    if (res && res.ok) { load(); return; }
    if (res && res.live === false) { setMsg("Not signed in — this cannot be done yet."); return; }
    setMsg((res && res.error) || "That could not be completed.");
  };

  const th = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "#fff",
               background: NAVY, padding: "8px 10px", textTransform: "uppercase",
               letterSpacing: "0.4px", whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", fontSize: 12, borderBottom: "0.5px solid " + LINE,
               verticalAlign: "top" };
  const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const card = { background: "#fff", border: "0.5px solid " + LINE, borderRadius: 10,
                 padding: "14px 16px", marginBottom: 14 };
  const btn = (primary, danger) => ({
    padding: "5px 11px", borderRadius: 6, fontSize: 11, cursor: "pointer",
    border: primary || danger ? "none" : "0.5px solid " + LINE,
    background: danger ? RED : primary ? CYAN : "transparent",
    color: primary || danger ? "#fff" : "#333",
  });
  const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 600, padding: "2px 7px",
                              borderRadius: 20, background: bg, color: fg,
                              whiteSpace: "nowrap" });

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

  const selfApproved = [...runs, ...claims].filter((x) => x.self_approved);

  // ── Intercompany ──────────────────────────────────────────────────────────
  // The read layer was added in db/073 and the writes in db/076. The check
  // that matters is the group total: intercompany balances must eliminate to
  // nil, and a non-nil total means something is posted on one side only.
  // This cannot reconcile pair by pair, because postings record no
  // counterparty — that is a schema gap, not a display choice.
  const Intercompany = () => {
    const total = icBal.find((b) => b.is_group_total);
    const nilRate = icLoans.filter((l) => l.no_interest_rate);
    const noMarkup = tpPol.filter((p) => p.no_markup);

    const loadIc = async () => {
      setIcMsg("");
      // No defensive guards on these calls. A missing function would make the
      // feature silently inert, which is harder to notice than an error.
      const [b, l, p] = await Promise.all([
        PAY.icBalances(null), PAY.icLoansList(null), PAY.tpPoliciesList(null),
      ]);
      if (!b.live && !l.live && !p.live) {
        setIcMsg("Not signed in — these figures come from the database and cannot be read yet.");
        return;
      }
      setIcBal(b.data || []); setIcLoans(l.data || []); setTpPol(p.data || []);
    };

    return (
      <div>
        <div style={card}>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <button style={btn(true)} onClick={loadIc}>Load intercompany position</button>
            <button style={btn(false)} onClick={()=>openPForm("icLoan")}>
              Move a group loan
            </button>
            <button style={btn(false)} title="The group total must eliminate to nil"
                    onClick={()=>openPForm("icSettle")}>
              Settle a balance
            </button>
          </div>
          {icMsg && (
            <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                          background: AMB_BG, border: "0.5px solid #E5CE9A", color: AMB }}>
              {icMsg}
            </div>
          )}
        </div>

        {total && (
          <div style={{ ...card,
                        background: Number(total.ic_balance) === 0 ? GRN_BG : RED_BG,
                        borderColor: Number(total.ic_balance) === 0 ? "#bfe0d2" : "#f0c9c9" }}>
            <div style={{ fontSize: 12, fontWeight: 700,
                          color: Number(total.ic_balance) === 0 ? GRN : RED, marginBottom: 6 }}>
              GROUP INTERCOMPANY TOTAL: {money(total.ic_balance)}
            </div>
            <div style={{ fontSize: 11.5, lineHeight: 1.7,
                          color: Number(total.ic_balance) === 0 ? GRN : RED }}>
              {Number(total.ic_balance) === 0
                ? "Balances eliminate to nil, as they must."
                : "This must be nil. A non-nil total means something is posted on one side and not the other, and consolidation will not eliminate it."}
            </div>
          </div>
        )}

        {(nilRate.length > 0 || noMarkup.length > 0) && (
          <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: AMB, marginBottom: 6 }}>
              TRANSFER PRICING EXPOSURE
            </div>
            <div style={{ fontSize: 11.5, color: AMB, lineHeight: 1.8 }}>
              {nilRate.length > 0 && (
                <div>{nilRate.length} group loan(s) carry no interest rate — a tax authority
                will impute one.</div>
              )}
              {noMarkup.length > 0 && (
                <div>{noMarkup.length} policy(ies) apply no markup, which is not what an
                independent party would charge.</div>
              )}
            </div>
          </div>
        )}

        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Balances by entity
          </div>
          <Table
            cols={["Entity", "Intercompany balance", "Postings"]}
            rows={icBal.filter((b) => !b.is_group_total)}
            render={(b, i) => (
              <tr key={i}>
                <td style={{ ...td, fontWeight: 600 }}>{b.entity_name}</td>
                <td style={num}>{money(b.ic_balance, b.ccy)}</td>
                <td style={num}>{b.postings}</td>
              </tr>
            )}
            empty={<Empty what="nothing loaded yet"
                          why="Press Load to read the intercompany position from the ledger." />}
          />
        </div>

        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Intercompany loans
          </div>
          <Table
            cols={["Lender", "Borrower", "Facility", "Drawn", "Headroom", "Rate", "Interest accrued"]}
            rows={icLoans}
            render={(l) => (
              <tr key={l.id} style={l.no_interest_rate ? { background: AMB_BG } : undefined}>
                <td style={td}>{l.lender}</td>
                <td style={td}>{l.borrower}</td>
                <td style={num}>{money(l.facility, l.ccy)}</td>
                <td style={num}>{money(l.drawn)}</td>
                <td style={num}>{money(l.headroom)}</td>
                <td style={num}>
                  {l.no_interest_rate
                    ? <span style={pill(AMB_BG, AMB)}>no rate</span>
                    : Number(l.interest_rate).toFixed(2) + "%"}
                </td>
                <td style={num}>{money(l.interest_accrued)}</td>
              </tr>
            )}
            empty={<Empty what="no intercompany loans exist" />}
          />
        </div>
      </div>
    );
  };

  // ── Attention ─────────────────────────────────────────────────────────────
  const Overview = () => {
    const crit = overview.filter((r) => r.severity === "critical" && Number(r.count_value) > 0);
    const attn = overview.filter((r) => r.severity === "attention" && Number(r.count_value) > 0);
    return (
      <div>
        {crit.length > 0 && (
          <div style={{ ...card, background: RED_BG, borderColor: "#f0c9c9" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 8 }}>
              CONTROL FAILURES TO REVIEW
            </div>
            {crit.map((r, i) => (
              <div key={i} style={{ fontSize: 13, color: RED, padding: "3px 0" }}>
                <strong>{r.count_value}</strong> {r.headline} — {r.area}
                {r.amount_value != null && <span> ({money(r.amount_value)})</span>}
              </div>
            ))}
            <div style={{ fontSize: 11, color: RED, marginTop: 8, lineHeight: 1.7 }}>
              Approval by the person who raised the item is now refused, but anything already
              approved that way went through before the control existed. Closing the gate is
              not the same as knowing what passed through it — these need looking at.
            </div>
          </div>
        )}

        {attn.length > 0 && (
          <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: AMB, marginBottom: 8 }}>
              OUTSTANDING
            </div>
            {attn.map((r, i) => (
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
                  <span style={pill(
                    r.severity === "critical" ? RED_BG : r.severity === "attention" ? AMB_BG : GRN_BG,
                    r.severity === "critical" ? RED : r.severity === "attention" ? AMB : GRN)}>
                    {r.severity === "ok" ? "clear" : r.severity}
                  </span>
                </td>
              </tr>
            )}
            empty={<Empty what="the overview has not loaded"
                          why="Sign in and reload." />}
          />
        </div>
      </div>
    );
  };

  // ── Payment runs ──────────────────────────────────────────────────────────
  const Runs = () => (
    <div style={card}>
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        <button style={btn(true)} onClick={()=>openPForm("payRun")}>
          ＋ Create a payment run
        </button>
        <button style={btn(false)} title="Refused if nothing was added, and says why"
                onClick={()=>openPForm("addPayables")}>
          Add open payables
        </button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 4,
                    textTransform: "uppercase", letterSpacing: "0.4px" }}>
        Payment runs
      </div>
      <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.7 }}>
        Three separate acts: assembling a run, approving it, then executing it. The person who
        created a run cannot approve it, and an approved run can still be stopped before
        execution — which is the point of keeping them apart.
      </div>
      <Table
        cols={["Entity", "Run date", "Items", "Total", "Status", "Created by", "Approved by", ""]}
        rows={runs}
        render={(r) => (
          <tr key={r.id} style={r.self_approved ? { background: RED_BG } : undefined}>
            <td style={td}>{r.entity_name || "—"}</td>
            <td style={td}>{fmtD(r.run_date)}</td>
            <td style={num}>{r.items}</td>
            <td style={{ ...num, fontWeight: 600 }}>{money(r.total, r.ccy)}</td>
            <td style={td}>
              <span style={pill(
                r.status === "executed" ? GRN_BG : r.status === "approved" ? AMB_BG : "#F1F3F7",
                r.status === "executed" ? GRN : r.status === "approved" ? AMB : MUT)}>
                {r.status || "draft"}
              </span>
            </td>
            <td style={{ ...td, color: MUT }}>{r.created_by || "—"}</td>
            <td style={td}>
              {r.approved_by || "—"}
              {r.self_approved && (
                <div style={{ ...pill(RED_BG, RED), marginTop: 3, display: "inline-block" }}>
                  self-approved — review
                </div>
              )}
            </td>
            <td style={td}>
              <div style={{ display: "flex", gap: 5 }}>
                {r.status === "draft" && (
                  <button style={btn(true)} disabled={acting === r.id}
                          title="Refused if you created this run"
                          onClick={() => act(r.id, () => PAY.payRunApprove(r.id))}>
                    {acting === r.id ? "…" : "Approve"}
                  </button>
                )}
                {r.status === "approved" && (
                  <button style={btn(false, true)} disabled={acting === r.id}
                          onClick={() => act(r.id, () => PAY.payRunExecute(r.id),
                            "Execute this payment run? This pays " + money(r.total, r.ccy) +
                            " across " + r.items + " item(s) and cannot be undone.")}>
                    {acting === r.id ? "…" : "Execute"}
                  </button>
                )}
              </div>
            </td>
          </tr>
        )}
        empty={<Empty what="no payment runs exist"
                      why="A run is assembled from open payables, then approved by someone else, then executed." />}
      />
    </div>
  );

  // ── Expense claims ────────────────────────────────────────────────────────
  const Claims = () => (
    <div style={card}>
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        <button style={btn(true)} onClick={()=>openPForm("claim")}>
          ＋ Submit a claim
        </button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 4,
                    textTransform: "uppercase", letterSpacing: "0.4px" }}>
        Expense claims
      </div>
      <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.7 }}>
        A claim cannot be approved by the person who made it.
      </div>
      <Table
        cols={["Claim date", "Employee", "Lines", "Total", "Status", "Approved by", ""]}
        rows={claims}
        render={(c) => (
          <tr key={c.id} style={c.self_approved ? { background: RED_BG } : undefined}>
            <td style={td}>{fmtD(c.claim_date)}</td>
            <td style={{ ...td, fontWeight: 600 }}>{c.employee_name || "—"}</td>
            <td style={num}>{c.lines}</td>
            <td style={{ ...num, fontWeight: 600 }}>{money(c.total, c.ccy)}</td>
            <td style={td}>
              <span style={pill(
                c.status === "reimbursed" ? GRN_BG : c.status === "approved" ? AMB_BG : "#F1F3F7",
                c.status === "reimbursed" ? GRN : c.status === "approved" ? AMB : MUT)}>
                {c.status || "draft"}
              </span>
            </td>
            <td style={td}>
              {c.approved_by || "—"}
              {c.self_approved && (
                <div style={{ ...pill(RED_BG, RED), marginTop: 3, display: "inline-block" }}>
                  approved by the claimant — review
                </div>
              )}
            </td>
            <td style={td}>
              {c.status === "submitted" && (
                <button style={btn(true)} disabled={acting === "c" + c.id}
                        title="Refused if this is your own claim"
                        onClick={() => act("c" + c.id, () => PAY.expenseClaimApprove(c.id))}>
                  {acting === "c" + c.id ? "…" : "Approve"}
                </button>
              )}
            </td>
          </tr>
        )}
        empty={<Empty what="no expense claims exist"
                      why="Claims are submitted by staff, then approved by someone else, then reimbursed." />}
      />
    </div>
  );

  // ── Purchase orders ───────────────────────────────────────────────────────
  const Orders = () => (
    <div style={card}>
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        <button style={btn(true)} onClick={()=>openPForm("po")}>
          ＋ Raise a purchase order
        </button>
        <button style={btn(false)} title="The middle leg of three-way matching"
                onClick={()=>openPForm("goods")}>
          Record goods received
        </button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                    textTransform: "uppercase", letterSpacing: "0.4px" }}>
        Purchase orders
      </div>
      <Table
        cols={["Entity", "PO number", "Date", "Net", "Gross", "Lines", "Received", "Outstanding", "Status"]}
        rows={orders}
        render={(p) => (
          <tr key={p.id}>
            <td style={td}>{p.entity_name || "—"}</td>
            <td style={{ ...td, fontWeight: 600 }}>{p.po_number || p.id}</td>
            <td style={td}>{fmtD(p.po_date)}</td>
            <td style={num}>{money(p.net_total, p.ccy)}</td>
            <td style={num}>{money(p.gross_total, p.ccy)}</td>
            <td style={num}>{p.lines}</td>
            <td style={num}>{p.received}</td>
            <td style={{ ...num, color: Number(p.outstanding) > 0 ? AMB : GRN,
                         fontWeight: Number(p.outstanding) > 0 ? 700 : 400 }}>
              {p.outstanding}
            </td>
            <td style={td}>{p.status || "—"}</td>
          </tr>
        )}
        empty={<Empty what="no purchase orders exist"
                      why="Orders are raised against a supplier, then goods receipted against them." />}
      />
    </div>
  );

  // ── Credit control ────────────────────────────────────────────────────────
  const Credit = () => (
    <div style={card}>
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        <button style={btn(true)} onClick={()=>openPForm("creditNote")}>
          ＋ Raise a credit note
        </button>
        <button style={btn(false)}
                title="Money the firm spends on a client's behalf — unrecharged, it is money spent and not recovered, and invisible until someone looks"
                onClick={async()=>{
                  const e = window.prompt("Entity id?");
                  if (!e) return;
                  const sup = window.prompt("Supplier?");
                  if (!sup) return;
                  const amt = window.prompt("Amount?");
                  if (!amt) return;
                  const ccy = window.prompt("Currency?", "GBP");
                  if (!ccy) return;
                  const d = window.prompt("Date (YYYY-MM-DD)?");
                  if (!d) return;
                  const r = await PAY.disbursementRecord({
                    entityId:Number(e), supplier:sup, amount:Number(amt), ccy, date:d });
                  window.alert(r && r.ok ? "Disbursement recorded."
                    : (r && r.error) || "That could not be recorded.");
                  load();
                }}>
          Record a disbursement
        </button>
        <button style={btn(false)}
                title="The chase count is the useful part — three chases with no response is a different conversation from one"
                onClick={async()=>{
                  const cust = window.prompt("Customer?");
                  if (!cust) return;
                  const inv = window.prompt("Invoice id (optional)?");
                  const d = window.prompt("Date (YYYY-MM-DD)?");
                  if (!d) return;
                  const lvl = window.prompt("Level? e.g. reminder, first chase, final notice");
                  if (!lvl) return;
                  const note = window.prompt("Note?");
                  const r = await OW.collectionActionLog({
                    customer: cust, invoiceId: inv ? Number(inv) : null,
                    date: d, level: lvl, note });
                  window.alert(r && r.ok ? "Chase recorded."
                    : (r && r.error) || "That could not be recorded.");
                  load();
                }}>
          Log a chase
        </button>
        <button style={btn(false)}
                title="Recharges outstanding disbursements to the clients they were incurred for"
                onClick={async()=>{
                  const e = window.prompt("Entity id?");
                  if (!e) return;
                  const d = window.prompt("Date (YYYY-MM-DD)?");
                  if (!d) return;
                  const r = await PAY.disbursementsRecharge(Number(e), d);
                  window.alert(r && r.ok ? "Disbursements recharged."
                    : (r && r.error) || "That could not be run.");
                  load();
                }}>
          Recharge disbursements
        </button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 4,
                    textTransform: "uppercase", letterSpacing: "0.4px" }}>
        Credit control
      </div>
      <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.7 }}>
        Continuing to work for a client already past their credit limit should be a decision
        rather than an oversight, so the limit is shown alongside the debt.
      </div>
      <Table
        cols={["Customer", "Outstanding", "Credit limit", "Oldest", "Terms", "Actions",
               "Last chased", ""]}
        rows={credit}
        render={(c) => (
          <tr key={c.customer_id} style={c.over_limit ? { background: AMB_BG } : undefined}>
            <td style={{ ...td, fontWeight: 600 }}>{c.customer_name}</td>
            <td style={{ ...num, fontWeight: 600 }}>{money(c.outstanding, c.ccy)}</td>
            <td style={num}>{c.credit_limit ? money(c.credit_limit, c.ccy) : "—"}</td>
            <td style={{ ...num, color: c.oldest_days > 90 ? RED : c.oldest_days > 60 ? AMB : "#111" }}>
              {c.oldest_days == null ? "—" : c.oldest_days + " days"}
            </td>
            <td style={num}>{c.payment_terms_days == null ? "—" : c.payment_terms_days + " days"}</td>
            <td style={num}>{c.actions}</td>
            <td style={td}>
              {fmtD(c.last_action)}
              {c.last_level && <div style={{ fontSize: 10, color: MUT }}>level {c.last_level}</div>}
            </td>
            <td style={td}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {c.over_limit && <span style={pill(AMB_BG, AMB)}>over limit</span>}
                {c.on_hold && <span style={pill(RED_BG, RED)}>on hold</span>}
              </div>
            </td>
          </tr>
        )}
        empty={<Empty what="nothing is outstanding"
                      why="Customers appear here once they have posted invoices unpaid." />}
      />
    </div>
  );

  return (
    <div style={{ fontFamily: "Catamaran, system-ui, sans-serif",
                  background: "var(--bg-secondary,#F6F8FB)", minHeight: 600 }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 20px", borderBottom: "0.5px solid #e5e5e5",
                    background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: NAVY }}>
            Purchases &amp; receivables
          </div>
          <span title={live ? "Reading live records from the database"
                            : "Not signed in — the database cannot be read"}
                style={{ ...pill(live ? GRN_BG : AMB_BG, live ? GRN : AMB),
                         border: "0.5px solid " + (live ? "#bfe0d2" : "#E5CE9A"),
                         fontSize: 10, padding: "3px 9px" }}>
            ● {live ? "Live data" : isConfigured ? "No records returned" : "Not signed in"}
          </span>
          {selfApproved.length > 0 && (
            <span style={{ ...pill(RED_BG, RED), fontSize: 10, padding: "3px 9px" }}>
              {selfApproved.length} self-approved to review
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
          <button key={t.id} onClick={() => setTab(t.id)}
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
                      background: /must be approved by someone else|your own/.test(msg) ? RED_BG : AMB_BG,
                      border: "0.5px solid " + (/must be approved|your own/.test(msg) ? "#f0c9c9" : "#E5CE9A"),
                      color: /must be approved|your own/.test(msg) ? RED : AMB }}>
          {msg}
        </div>
      )}

      <div style={{ padding: "16px 20px 24px" }}>
        {tab === "overview" && <Overview />}
        {tab === "runs"     && <Runs />}
        {tab === "claims"   && <Claims />}
        {tab === "orders"   && <Orders />}
        {tab === "credit"   && <Credit />}
        {tab === "interco" && <Intercompany />}
      </div>

      <PayForm kind={pForm} f={pF} setF={setPF} msg={pMsg} busy={pBusy}
               onCancel={()=>{ setPForm(null); setPF({}); setPMsg(""); }}
               onSave={runPForm} />
    </div>
  );
}
