import { useState, useEffect } from "react";
import * as CRM from "./affinity_crm_api";
import { isConfigured } from "./affinity_accounting_supabase";

// ─────────────────────────────────────────────────────────────────────────────
// CRM
//
// The previous module imported affinity_crm_api and called none of it, running
// on constants instead. So a prospect could be typed in, appear in the
// pipeline, and be gone on reload — and the user guide described the whole
// thing as working.
//
// Third module found in this state, after Documents and Onboarding. The common
// cause: an audit that traced database -> API and stopped, so a wrapper with
// no caller counted as wired.
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

const STAGE_ORDER = ["Enquiry", "Proposal Sent", "KYC Arriving", "Fees Paid", "Lost"];
const TABS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "contact",  label: "Contact log" },
  { id: "closed",   label: "Won and lost" },
];

export default function AffinityCRM({ onNav }) {
  const [tab, setTab]   = useState("pipeline");
  const [rows, setRows] = useState([]);
  const [ints, setInts] = useState([]);
  const [sel, setSel]   = useState(null);
  const [msg, setMsg]   = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [f, setF]       = useState({});

  const load = async () => {
    setBusy(true); setMsg("");
    const [p, i] = await Promise.all([CRM.crmProspects(false), CRM.crmInteractions(null, 200)]);
    setBusy(false);
    if (!p.live && !i.live) {
      setMsg("Not signed in — the pipeline is read from the database.");
      return;
    }
    setRows(p.data || []);
    setInts(i.data || []);
    if (!p.ok) setMsg(p.error);
  };
  useEffect(() => { load(); }, []);   // eslint-disable-line

  const act = async (fn, okMsg) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r && r.ok) { setMsg(okMsg); setForm(null); setF({}); load(); return; }
    if (r && r.live === false) { setMsg("Not signed in — that cannot be saved."); return; }
    setMsg((r && r.error) || "That could not be saved.");
  };

  const open   = rows.filter((r) => r.is_open);
  const stale  = open.filter((r) => r.stale);
  const won    = rows.filter((r) => r.stage === "Fees Paid");
  const lost   = rows.filter((r) => r.stage === "Lost");
  const value  = open.reduce((a, r) => a + Number(r.total_first_year || 0), 0);

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const Pipeline = () => (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {[
          { n: open.length, label: "Open prospects", bg: "#fff", fg: NAVY },
          { n: money(value, "GBP"), label: "First-year value of the pipeline",
            bg: "#fff", fg: NAVY, wide: true },
          { n: stale.length, label: "Going cold — no contact for 30 days",
            bg: stale.length ? AMB_BG : "#fff", fg: stale.length ? AMB : MUT },
        ].map((s) => (
          <div key={s.label} style={{ flex: s.wide ? 1.4 : 1, minWidth: 170, background: s.bg,
                                      border: "0.5px solid " + LINE, borderRadius: 10,
                                      padding: "12px 14px" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.fg }}>{s.n}</div>
            <div style={{ fontSize: 11, color: MUT, lineHeight: 1.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: MUT, lineHeight: 1.7, maxWidth: "70%" }}>
            First-year value is the annual fee plus the setup fee plus twelve months of the
            admin fee — the sum rather than the annual fee alone, because that is what a
            pipeline is judged on.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={btn(false)} onClick={load} disabled={busy}>
              {busy ? "Loading…" : "Refresh"}
            </button>
            <button style={btn(true)} onClick={() => { setForm("newProspect"); setF({}); }}>
              ＋ Add prospect
            </button>
          </div>
        </div>
      </div>

      {stale.length > 0 && (
        <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: AMB, marginBottom: 6 }}>
            {stale.length} PROSPECT(S) GOING COLD
          </div>
          <div style={{ fontSize: 11.5, color: AMB, lineHeight: 1.7 }}>
            Open, and no contact recorded for more than 30 days. This is the thing a pipeline
            review is for — a prospect nobody has spoken to is not in the pipeline in any
            meaningful sense.
          </div>
        </div>
      )}

      {STAGE_ORDER.filter((st) => st !== "Lost").map((st) => {
        const inStage = open.filter((r) => r.stage === st);
        if (!inStage.length) return null;
        return (
          <div key={st} style={{ ...card, overflowX: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                          textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {st} — {inStage.length}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {["Company", "Contact", "Jurisdiction", "Owner", "First-year value",
                  "Last contact", "Next action", ""].map((h) =>
                  <th key={h} style={th(false)}>{h}</th>)}
              </tr></thead>
              <tbody>
                {inStage.map((r) => (
                  <tr key={r.id} style={r.stale ? { background: AMB_BG } : undefined}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.company}</td>
                    <td style={td}>{r.contact || "—"}</td>
                    <td style={{ ...td, color: MUT }}>{r.jurisdiction || "—"}</td>
                    <td style={{ ...td, color: MUT }}>{r.bd_owner || "—"}</td>
                    <td style={num}>{money(r.total_first_year, r.fee_ccy)}</td>
                    <td style={td}>
                      {fmtD(r.last_contact)}
                      {r.stale && (
                        <div style={{ ...pill(AMB_BG, AMB), marginTop: 3,
                                      display: "inline-block" }}>
                          {r.days_since_contact} days
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: MUT }}>
                      {r.next_action || "—"}
                      {r.next_action_due && new Date(r.next_action_due) < new Date() && (
                        <div style={{ ...pill(RED_BG, RED), marginTop: 3,
                                      display: "inline-block" }}>overdue</div>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button style={{ ...btn(false), marginRight: 4 }}
                              onClick={() => { setForm("logContact"); setF({ id: r.id, company: r.company }); }}>
                        Log contact
                      </button>
                      <button style={{ ...btn(false), marginRight: 4 }}
                              onClick={() => { setForm("moveStage"); setF({ id: r.id, company: r.company, stage: r.stage }); }}>
                        Move
                      </button>
                      {r.stage === "Fees Paid" && !r.converted && (
                        <button style={btn(true)}
                                onClick={() => { setForm("convert"); setF({ id: r.id, company: r.company }); }}>
                          Convert
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {!open.length && !busy && (
        <div style={{ ...card, textAlign: "center", padding: "28px 18px", color: MUT,
                      fontSize: 12.5, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}>
            No open prospects
          </div>
          The stages are Enquiry, Proposal Sent, KYC Arriving, Fees Paid, and Lost. They are
          validated against that list, so a typo cannot create a stage nothing reports on.
        </div>
      )}
    </div>
  );

  // ── Contact log ───────────────────────────────────────────────────────────
  const Contact = () => {
    const overdue = ints.filter((i) => i.action_overdue);
    return (
      <div>
        {overdue.length > 0 && (
          <div style={{ ...card, background: RED_BG, borderColor: "#f0c9c9" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 6 }}>
              {overdue.length} NEXT ACTION(S) OVERDUE
            </div>
            <div style={{ fontSize: 11.5, color: RED, lineHeight: 1.7 }}>
              An agreed next step with a date that has passed. Recorded and not done is worse
              than not recorded at all — the prospect is expecting it.
            </div>
          </div>
        )}

        <div style={{ ...card, overflowX: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {ints.length} interaction{ints.length === 1 ? "" : "s"}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Date", "Company", "Type", "By", "Note", "Next action", "Due"].map((h) =>
                <th key={h} style={th(false)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {ints.map((i) => (
                <tr key={i.id} style={i.action_overdue ? { background: RED_BG } : undefined}>
                  <td style={td}>{fmtD(i.interaction_date)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{i.company || "—"}</td>
                  <td style={td}>{i.interaction_type}</td>
                  <td style={{ ...td, color: MUT }}>{i.by_whom || "—"}</td>
                  <td style={{ ...td, color: MUT, lineHeight: 1.5 }}>{i.note || "—"}</td>
                  <td style={td}>{i.next_action || "—"}</td>
                  <td style={td}>
                    {fmtD(i.next_action_due)}
                    {i.action_overdue && (
                      <div style={{ ...pill(RED_BG, RED), marginTop: 3,
                                    display: "inline-block" }}>overdue</div>
                    )}
                  </td>
                </tr>
              ))}
              {!ints.length && (
                <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: MUT,
                                             padding: "26px 10px" }}>
                  No contact recorded yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Won and lost ──────────────────────────────────────────────────────────
  const Closed = () => (
    <div>
      <div style={card}>
        <div style={{ fontSize: 11, color: MUT, lineHeight: 1.7 }}>
          Why we lost a prospect is the only useful part of a lost prospect, which is why
          Core requires a reason. Fee, timing, a competitor and the client changing their
          mind are four different problems and only one of them is about price.
        </div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                      textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Won — {won.length}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {["Company", "Jurisdiction", "Owner", "First-year value", "Converted"]
              .map((h) => <th key={h} style={th(false)}>{h}</th>)}
          </tr></thead>
          <tbody>
            {won.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, fontWeight: 600 }}>{r.company}</td>
                <td style={{ ...td, color: MUT }}>{r.jurisdiction || "—"}</td>
                <td style={{ ...td, color: MUT }}>{r.bd_owner || "—"}</td>
                <td style={num}>{money(r.total_first_year, r.fee_ccy)}</td>
                <td style={td}>
                  {r.converted
                    ? <span style={pill(GRN_BG, GRN)}>onboarding case created</span>
                    : <span style={pill(AMB_BG, AMB)}>not yet converted</span>}
                </td>
              </tr>
            ))}
            {!won.length && (
              <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: MUT,
                                           padding: "20px 10px" }}>None yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                      textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Lost — {lost.length}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {["Company", "Jurisdiction", "Owner", "Value that went", "Reason"]
              .map((h) => <th key={h} style={th(false)}>{h}</th>)}
          </tr></thead>
          <tbody>
            {lost.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, fontWeight: 600 }}>{r.company}</td>
                <td style={{ ...td, color: MUT }}>{r.jurisdiction || "—"}</td>
                <td style={{ ...td, color: MUT }}>{r.bd_owner || "—"}</td>
                <td style={num}>{money(r.total_first_year, r.fee_ccy)}</td>
                <td style={{ ...td, color: MUT, lineHeight: 1.5 }}>{r.notes || "—"}</td>
              </tr>
            ))}
            {!lost.length && (
              <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: MUT,
                                           padding: "20px 10px" }}>None yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Forms ─────────────────────────────────────────────────────────────────
  const FORMS = {
    newProspect: {
      title: "Add a prospect", cta: "Add to the pipeline",
      note: "Fees are recorded separately because first-year value is the sum of all three, and that is what the pipeline is judged on.",
      fields: [
        { k: "first_name", label: "First name" },
        { k: "last_name", label: "Last name" },
        { k: "company", label: "Company or structure", full: true, required: true },
        { k: "entity_type", label: "Entity type", ph: "Company, Trust, Yachting, Fund" },
        { k: "jurisdiction", label: "Jurisdiction" },
        { k: "office", label: "Office" },
        { k: "source", label: "Source", ph: "Referral, existing client, trade show" },
        { k: "bd_owner", label: "BD owner" },
        { k: "stage", label: "Stage", type: "select", opts: STAGE_ORDER.slice(0, 4) },
        { k: "risk_rating", label: "Risk rating", ph: "early view" },
        { k: "annual_fee", label: "Annual fee" },
        { k: "setup_fee", label: "Setup fee" },
        { k: "admin_fee", label: "Admin fee (monthly)" },
        { k: "fee_ccy", label: "Currency", ph: "GBP" },
        { k: "target_date", label: "Target date", ph: "YYYY-MM-DD" },
        { k: "notes", label: "Notes", full: true },
      ],
      save: () => act(() => CRM.crmProspectAdd({
        first_name: f.first_name, last_name: f.last_name, company: f.company,
        entity_type: f.entity_type, jurisdiction: f.jurisdiction, office: f.office,
        source: f.source, bd_owner: f.bd_owner, stage: f.stage || "Enquiry",
        risk_rating: f.risk_rating, notes: f.notes,
        annual_fee: f.annual_fee ? Number(f.annual_fee) : null,
        setup_fee: f.setup_fee ? Number(f.setup_fee) : null,
        admin_fee: f.admin_fee ? Number(f.admin_fee) : null,
        fee_ccy: f.fee_ccy || "GBP",
        target_date: f.target_date || null,
      }), "Prospect added."),
    },
    logContact: {
      title: "Log contact", cta: "Record the contact",
      note: "A next action with a date is what stops a prospect going quiet. It appears as overdue once the date passes.",
      fields: [
        { k: "date", label: "Date", required: true, ph: "YYYY-MM-DD" },
        { k: "type", label: "Type", type: "select", required: true,
          opts: ["Call", "Email", "Meeting", "Proposal sent", "Other"] },
        { k: "note", label: "What was discussed", full: true },
        { k: "nextAction", label: "Next action", full: true },
        { k: "nextDue", label: "Next action due", ph: "YYYY-MM-DD" },
      ],
      save: () => act(() => CRM.crmInteractionAdd({
        prospectId: f.id, date: f.date, type: f.type, note: f.note,
        nextAction: f.nextAction, nextDue: f.nextDue || null,
      }), "Contact recorded."),
    },
    moveStage: {
      title: "Move to another stage", cta: "Move",
      note: "Marking a prospect lost requires a reason — why we lost it is the useful part.",
      fields: [
        { k: "newStage", label: "New stage", type: "select", required: true,
          opts: STAGE_ORDER },
        { k: "lostReason", label: "Reason, if lost", full: true },
      ],
      save: () => act(() => CRM.crmStageSet(f.id, f.newStage, f.lostReason),
                      "Stage changed."),
    },
    convert: {
      title: "Convert to an onboarding case", cta: "Create the onboarding case",
      note: "This creates an onboarding case and links the two, so the pipeline and the onboarding file are one story rather than two records of the same client. It does NOT make the client live — CDD still has to be recorded and verified.",
      fields: [],
      save: () => act(() => CRM.crmProspectConvert(f.id),
                      "Onboarding case created and linked."),
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
                      width: "min(660px,100%)", maxHeight: "86vh", overflowY: "auto" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
            {d.title}
          </div>
          {f.company && (
            <div style={{ fontSize: 12, color: MUT, marginBottom: 8 }}>{f.company}</div>
          )}
          <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.7, marginBottom: 14 }}>
            {d.note}
          </div>
          {d.fields.length > 0 && (
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
          )}
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
          <div style={{ fontSize: 18, fontWeight: 500, color: NAVY }}>CRM</div>
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
        {tab === "pipeline" && <Pipeline />}
        {tab === "contact"  && <Contact />}
        {tab === "closed"   && <Closed />}
      </div>

      <Form />
    </div>
  );
}
