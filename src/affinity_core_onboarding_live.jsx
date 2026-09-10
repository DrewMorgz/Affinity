import { useState, useEffect } from "react";
import * as OW from "./affinity_docs_onb_write_api";
import * as ONB from "./affinity_onboarding_api";
import { isConfigured } from "./affinity_accounting_supabase";

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING
//
// The previous version of this module imported the API layer and called none
// of it. It ran entirely on two constants, CASES and ATTRITION, so every
// screen looked populated and nothing an administrator did was recorded.
//
// It was found by a reachability audit that traced database -> API -> SCREEN.
// The earlier audit had checked database -> API only, so functions with a
// wrapper counted as wired even where no screen touched them. cdd_item_add,
// cdd_item_verify, onb_case_go_live, attrition_open and attrition_approve were
// all in that state — described in detail in the user guide, and unreachable.
//
// THE PART THAT MATTERS MOST: going live is gated on verified CDD, and that
// gate is in the database rather than here. This screen surfaces it; it does
// not enforce it. A screen-level check can be bypassed by a screen; a database
// refusal cannot.
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = "#001242", CY = "#00C4CC", MUT = "#5B6B7B", LINE = "#D9DEE5";
const RED = "#A32D2D", RED_BG = "#FCEBEB", AMB = "#7B4F1D", AMB_BG = "#FDF4DC",
      GRN = "#1F6F54", GRN_BG = "#E7F4EF";

const fmtD = (d) => d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—";
const money = (v, c) => v == null ? "—"
  : (c ? c + " " : "") + Number(v).toLocaleString("en-GB",
      { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
const inp = { height: 32, fontSize: 12, borderRadius: 6, border: "0.5px solid #ccc",
              padding: "0 8px", width: "100%" };
const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 600, padding: "2px 7px",
                            borderRadius: 20, background: bg, color: fg, whiteSpace: "nowrap" });

const TABS = [
  { id: "cases",     label: "Onboarding cases" },
  { id: "cdd",       label: "CDD" },
  { id: "attrition", label: "Attrition" },
];

export default function AffinityOnboarding({ onNav }) {
  const [tab, setTab]     = useState("cases");
  const [cases, setCases] = useState([]);
  const [attr, setAttr]   = useState([]);
  const [sel, setSel]     = useState(null);
  const [cdd, setCdd]     = useState([]);
  const [msg, setMsg]     = useState("");
  const [busy, setBusy]   = useState(false);
  const [form, setForm]   = useState(null);
  const [f, setF]         = useState({});

  const load = async () => {
    setBusy(true); setMsg("");
    const [c, a] = await Promise.all([OW.onbCaseList(null), ONB.attritionCases(false)]);
    setBusy(false);
    if (!c.live && !a.live) {
      setMsg("Not signed in — onboarding cases are read from the database.");
      return;
    }
    setCases(c.data || []);
    setAttr(a.data || []);
    if (!c.ok) setMsg(c.error);
  };
  useEffect(() => { load(); }, []);   // eslint-disable-line

  const openCase = async (c) => {
    setSel(c); setMsg(""); setCdd([]);
    const r = await OW.cddItemList(c.id);
    if (r.live) setCdd(r.data || []);
    if (r.live && !r.ok) setMsg(r.error);
  };

  const act = async (fn, okMsg) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r && r.ok) {
      setMsg(okMsg); setForm(null); setF({});
      await load();
      if (sel) await openCase(sel);
      return;
    }
    if (r && r.live === false) { setMsg("Not signed in — that cannot be saved."); return; }
    setMsg((r && r.error) || "That could not be completed.");
  };

  // ── Onboarding cases ──────────────────────────────────────────────────────
  const Cases = () => (
    <div>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {cases.length} case{cases.length === 1 ? "" : "s"}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={btn(false)} onClick={load} disabled={busy}>
              {busy ? "Loading…" : "Refresh"}
            </button>
            <button style={btn(true)} onClick={() => { setForm("newCase"); setF({}); }}>
              ＋ New onboarding
            </button>
          </div>
        </div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {["Client", "Structure", "Office", "Jurisdiction", "Stage", "Risk",
              "Assigned", "Fee", "Live", ""].map((h) => <th key={h} style={th(false)}>{h}</th>)}
          </tr></thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} style={sel && sel.id === c.id ? { background: "#F1F4F8" } : undefined}>
                <td style={{ ...td, fontWeight: 600 }}>{c.client_name}</td>
                <td style={td}>{c.entity_name || "—"}</td>
                <td style={{ ...td, color: MUT }}>{c.office || "—"}</td>
                <td style={{ ...td, color: MUT }}>{c.jurisdiction || "—"}</td>
                <td style={td}><span style={pill("#F1F4F8", NAVY)}>{c.stage || "—"}</span></td>
                <td style={td}>{c.risk_rating || "—"}</td>
                <td style={{ ...td, color: MUT }}>{c.assigned_to || "—"}</td>
                <td style={num}>{money(c.fee_quoted, c.fee_ccy)}</td>
                <td style={td}>
                  {c.entity_id
                    ? <span style={pill(GRN_BG, GRN)}>live</span>
                    : <span style={pill(AMB_BG, AMB)}>not live</span>}
                </td>
                <td style={td}>
                  <button style={btn(false)} onClick={() => { openCase(c); setTab("cdd"); }}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {!cases.length && (
              <tr><td colSpan={10} style={{ ...td, textAlign: "center", color: MUT,
                                            padding: "26px 10px", lineHeight: 1.7 }}>
                No onboarding cases. A case can be created here, or converted from a won
                prospect in CRM — converting links the two so the pipeline and the
                onboarding file are one story.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── CDD ───────────────────────────────────────────────────────────────────
  const Cdd = () => {
    if (!sel) {
      return (
        <div style={{ ...card, textAlign: "center", padding: "28px 18px", color: MUT,
                      fontSize: 12.5, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}>
            Choose a case
          </div>
          Open a case from the Onboarding cases tab to record and verify its CDD.
        </div>
      );
    }
    const verified = cdd.filter((i) => i.status === "Verified");
    const outstanding = cdd.filter((i) => i.status !== "Verified");
    const canGoLive = cdd.length > 0 && outstanding.length === 0 && !sel.entity_id;

    return (
      <div>
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 600, color: NAVY }}>{sel.client_name}</div>
          <div style={{ fontSize: 12, color: MUT, marginTop: 3 }}>
            {sel.entity_name} · {sel.jurisdiction} · {sel.stage}
            {sel.entity_id && (
              <span style={{ ...pill(GRN_BG, GRN), marginLeft: 8 }}>
                live as entity {sel.entity_id}
              </span>
            )}
          </div>
        </div>

        {/* The gate. Stated before the button, not after a refusal. */}
        <div style={{ ...card,
                      background: canGoLive ? GRN_BG : AMB_BG,
                      borderColor: canGoLive ? "#bfe0d2" : "#E5CE9A" }}>
          <div style={{ fontSize: 12, fontWeight: 700,
                        color: canGoLive ? GRN : AMB, marginBottom: 6 }}>
            {sel.entity_id ? "THIS CASE IS LIVE"
              : cdd.length === 0 ? "NO CDD RECORDED — CANNOT GO LIVE"
              : outstanding.length > 0
                ? `${outstanding.length} CDD ITEM(S) NOT VERIFIED — CANNOT GO LIVE`
                : "CDD COMPLETE — READY TO GO LIVE"}
          </div>
          <div style={{ fontSize: 11.5, lineHeight: 1.7,
                        color: canGoLive ? GRN : AMB }}>
            {sel.entity_id
              ? "The client entity exists and the verified CDD has been carried onto its record as a file note, so the evidence sits with the client rather than only in this case."
              : "Taking a client on without verified CDD is the breach that closes firms. This gate is enforced in the database, not on this screen — so it holds however the case is reached."}
          </div>
        </div>

        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                          textTransform: "uppercase", letterSpacing: "0.4px" }}>
              CDD — {verified.length} of {cdd.length} verified
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={btn(false)} onClick={() => { setForm("newCdd"); setF({}); }}>
                ＋ Add a CDD item
              </button>
              {!sel.entity_id && (
                <button style={btn(true)} disabled={busy}
                        title="Refused by the database unless every CDD item is verified"
                        onClick={() => { setForm("goLive"); setF({}); }}>
                  Go live
                </button>
              )}
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Subject", "Type", "Status", "Method", "Verified by", "Verified", ""]
                .map((h) => <th key={h} style={th(false)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {cdd.map((i) => (
                <tr key={i.id} style={i.status !== "Verified" ? { background: AMB_BG } : undefined}>
                  <td style={{ ...td, fontWeight: 600 }}>{i.subject}</td>
                  <td style={td}>{i.item_type}</td>
                  <td style={td}>
                    <span style={pill(i.status === "Verified" ? GRN_BG : AMB_BG,
                                      i.status === "Verified" ? GRN : AMB)}>
                      {i.status || "outstanding"}
                    </span>
                  </td>
                  <td style={{ ...td, color: MUT }}>{i.method || "—"}</td>
                  <td style={{ ...td, color: MUT }}>{i.verified_by || "—"}</td>
                  <td style={td}>{fmtD(i.verified_at)}</td>
                  <td style={td}>
                    {i.status !== "Verified" && (
                      <button style={btn(false)}
                              onClick={() => { setForm("verify"); setF({ id: i.id, subject: i.subject }); }}>
                        Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!cdd.length && (
                <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: MUT,
                                             padding: "26px 10px", lineHeight: 1.7 }}>
                  Nothing recorded. Each item is what is required and of whom — identity,
                  address, source of wealth — then verified with what was actually seen.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Attrition ─────────────────────────────────────────────────────────────
  const Attrition = () => {
    const blocked = attr.filter((a) => a.blocked_by_fees && a.status === "open");
    return (
      <div>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                          textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {attr.length} case{attr.length === 1 ? "" : "s"}
            </div>
            <button style={btn(true)} onClick={() => { setForm("newAttrition"); setF({}); }}>
              ＋ Raise attrition
            </button>
          </div>
          <div style={{ fontSize: 11, color: MUT, lineHeight: 1.7 }}>
            Sign-off is Manager, then MD, then Group CEO <strong>or</strong> Group COO —
            either satisfies the final stage. Approvals run in sequence and one person
            cannot satisfy two stages.
          </div>
        </div>

        {blocked.length > 0 && (
          <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: AMB, marginBottom: 6 }}>
              {blocked.length} CASE(S) WITH UNBILLED TIME OUTSTANDING
            </div>
            <div style={{ fontSize: 11.5, color: AMB, lineHeight: 1.7 }}>
              Letting a client go with unbilled time on the clock writes it off. A departing
              client is the hardest one to bill afterwards, which is why the figure is
              captured when the case opens as well as shown as it stands now.
            </div>
          </div>
        )}

        <div style={{ ...card, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Entity", "Reason", "Successor", "Opened", "Status", "Approvals",
                "Unbilled at open", "Unbilled now", "Next stage", ""]
                .map((h) => <th key={h} style={th(false)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {attr.map((a) => (
                <tr key={a.id} style={a.blocked_by_fees ? { background: AMB_BG } : undefined}>
                  <td style={{ ...td, fontWeight: 600 }}>{a.entity_name}</td>
                  <td style={td}>{a.reason}</td>
                  <td style={{ ...td, color: MUT }}>{a.successor || "—"}</td>
                  <td style={td}>{fmtD(a.started)}</td>
                  <td style={td}>
                    <span style={pill(a.fully_approved ? GRN_BG : AMB_BG,
                                      a.fully_approved ? GRN : AMB)}>
                      {a.status}
                    </span>
                  </td>
                  <td style={num}>{a.stages_done} / {a.stages_total}</td>
                  <td style={num}>{money(a.outstanding_fees)}</td>
                  <td style={{ ...num, fontWeight: Number(a.unbilled_now) > 0 ? 700 : 400,
                               color: Number(a.unbilled_now) > 0 ? AMB : "#111" }}>
                    {money(a.unbilled_now)}
                  </td>
                  <td style={{ ...td, fontSize: 11, color: MUT }}>{a.next_stage || "—"}</td>
                  <td style={td}>
                    {!a.fully_approved && a.status === "open" && (
                      <button style={btn(true)}
                              onClick={() => { setForm("approve"); setF({ id: a.id, entity: a.entity_name, next: a.next_stage }); }}>
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!attr.length && (
                <tr><td colSpan={10} style={{ ...td, textAlign: "center", color: MUT,
                                              padding: "26px 10px" }}>
                  No attrition cases.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Forms ─────────────────────────────────────────────────────────────────
  const FORMS = {
    newCase: {
      title: "New onboarding case", cta: "Create",
      note: "A case is the file for taking a client on. Nothing goes live until its CDD is recorded and verified.",
      fields: [
        { k: "clientName", label: "Client name", required: true },
        { k: "entityName", label: "Structure to be established", required: true },
        { k: "office", label: "Office", required: true },
        { k: "jurisdiction", label: "Jurisdiction", required: true },
        { k: "entityType", label: "Entity type", ph: "Company, Trust, Foundation" },
        { k: "sector", label: "Sector" },
      ],
      save: () => act(() => OW.onbCaseAdd({
        clientName: f.clientName, entityName: f.entityName, office: f.office,
        jurisdiction: f.jurisdiction, entityType: f.entityType, sector: f.sector,
      }), "Case created."),
    },
    newCdd: {
      title: "Add a CDD item", cta: "Add",
      note: "What is required, and of whom. Verifying it separately records what was actually seen — which is the evidence, not the request.",
      fields: [
        { k: "subject", label: "Of whom", required: true, ph: "e.g. James Harrington" },
        { k: "itemType", label: "What is required", required: true,
          ph: "identity, address, source of wealth" },
        { k: "notes", label: "Notes", full: true },
      ],
      save: () => act(() => OW.cddItemAdd(sel.id, f.subject, f.itemType, f.notes),
                      "CDD item added."),
    },
    verify: {
      title: "Verify a CDD item", cta: "Record the verification",
      note: "Record what was actually seen. 'Certified copy' and 'Original seen' are different evidence, and the difference matters in an inspection.",
      fields: [
        { k: "method", label: "What was seen", required: true, full: true,
          ph: "Certified copy / Original seen / Electronic verification" },
        { k: "notes", label: "Notes", full: true },
      ],
      save: () => act(() => OW.cddItemVerify(f.id, f.method, f.notes), "CDD item verified."),
    },
    goLive: {
      title: "Take this client on", cta: "Create the client entity",
      note: "This creates the client entity and links it to the case. The database refuses it unless every CDD item is verified — that gate is not on this screen and cannot be bypassed from it.",
      fields: [
        { k: "ref", label: "Entity reference", full: true,
          ph: "leave blank to generate one" },
      ],
      save: () => act(() => OW.onbCaseGoLive(sel.id, f.ref || null),
                      "Client entity created and linked to the case."),
    },
    newAttrition: {
      title: "Raise an attrition case", cta: "Raise",
      note: "Unbilled time is captured now, because a departing client is the hardest one to bill afterwards.",
      fields: [
        { k: "entityId", label: "Entity id", required: true },
        { k: "reason", label: "Reason", required: true,
          ph: "Liquidation / Transfer out / Resignation / Non-payment" },
        { k: "detail", label: "Circumstances", full: true },
        { k: "administrator", label: "Handled by" },
        { k: "successor", label: "Successor provider", ph: "if a transfer out" },
        { k: "targetDate", label: "Target date", ph: "YYYY-MM-DD" },
      ],
      save: () => act(() => ONB.attritionOpen({
        entityId: Number(f.entityId), reason: f.reason, detail: f.detail,
        administrator: f.administrator, successor: f.successor,
        targetDate: f.targetDate || null,
      }), "Attrition case raised."),
    },
    approve: {
      title: "Approve an attrition case", cta: "Record the approval",
      note: "Approvals run in sequence, the role must be one the stage accepts, and one person cannot satisfy two stages. The final stage accepts either Group CEO or Group COO.",
      fields: [
        { k: "stage", label: "Stage", type: "select", required: true,
          opts: ONB.ATTRITION_STAGES.map((s) => s.code + " — " + s.label) },
        { k: "role", label: "Your role", type: "select", required: true,
          opts: ["Manager", "MD", "Managing Director", "Group CEO", "CEO",
                 "Group COO", "COO"] },
        { k: "note", label: "Note", full: true },
      ],
      save: () => act(() => ONB.attritionApprove(f.id, (f.stage || "").split(" ")[0],
                                                 f.role, f.note),
                      "Stage approved."),
    },
  };

  const Form = () => {
    if (!form || !FORMS[form]) return null;
    const d = FORMS[form];
    return (
      <div onClick={(e) => e.target === e.currentTarget && (setForm(null), setF({}), setMsg(""))}
           style={{ position: "fixed", inset: 0, background: "rgba(0,18,66,0.45)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 1000, padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: "22px 24px",
                      width: "min(620px,100%)", maxHeight: "86vh", overflowY: "auto" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
            {d.title}
          </div>
          {(f.subject || f.entity) && (
            <div style={{ fontSize: 12, color: MUT, marginBottom: 8 }}>
              {f.subject || f.entity}{f.next ? ` · next stage: ${f.next}` : ""}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.7, marginBottom: 14 }}>
            {d.note}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
            {d.fields.map((fl) => (
              <div key={fl.k} style={{ gridColumn: fl.full ? "1/-1" : "auto" }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600,
                                color: "#555", marginBottom: 4 }}>
                  {fl.label}{fl.required && <span style={{ color: RED }}> *</span>}
                </label>
                {fl.type === "select" ? (
                  <select value={f[fl.k] || ""}
                          onChange={(e) => setF({ ...f, [fl.k]: e.target.value })}
                          style={{ ...inp, height: 34 }}>
                    <option value="">—</option>
                    {fl.opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input value={f[fl.k] || ""} placeholder={fl.ph || ""}
                         onChange={(e) => setF({ ...f, [fl.k]: e.target.value })}
                         style={{ ...inp, height: 34 }} />
                )}
              </div>
            ))}
          </div>
          {msg && (
            <div style={{ marginTop: 14, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                          lineHeight: 1.6, background: RED_BG,
                          border: "0.5px solid #f0c9c9", color: RED, whiteSpace: "pre-wrap" }}>
              {msg}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
            <button style={btn(false)}
                    onClick={() => { setForm(null); setF({}); setMsg(""); }}>Cancel</button>
            <button style={btn(true)} onClick={d.save} disabled={busy}>{d.cta}</button>
          </div>
        </div>
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
          <div style={{ fontSize: 18, fontWeight: 500, color: NAVY }}>Onboarding</div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                         background: isConfigured ? GRN_BG : AMB_BG,
                         color: isConfigured ? GRN : AMB,
                         border: "0.5px solid " + (isConfigured ? "#bfe0d2" : "#E5CE9A") }}>
            ● {isConfigured ? "Live data" : "Not signed in"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", background: "#fff",
                    borderBottom: "0.5px solid #e5e5e5", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setMsg(""); }}
                  style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer",
                           border: "none", background: "transparent",
                           color: tab === t.id ? NAVY : MUT,
                           fontWeight: tab === t.id ? 600 : 400,
                           borderBottom: tab === t.id ? "2px solid " + CY
                                                      : "2px solid transparent" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px 24px" }}>
        {msg && !form && (
          <div style={{ padding: "9px 12px", borderRadius: 7, fontSize: 11.5, marginBottom: 14,
                        background: AMB_BG, border: "0.5px solid #E5CE9A", color: AMB,
                        whiteSpace: "pre-wrap" }}>
            {msg}
          </div>
        )}
        {tab === "cases"     && <Cases />}
        {tab === "cdd"       && <Cdd />}
        {tab === "attrition" && <Attrition />}
      </div>

      <Form />
    </div>
  );
}
