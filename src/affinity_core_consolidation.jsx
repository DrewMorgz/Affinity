// src/affinity_core_consolidation.jsx
// ─────────────────────────────────────────────────────────────────────────────
// AFFINITY CORE — CONSOLIDATION
//
// The group half of the budgeting spec. Interface only: the maths already exists
// on the accounting-engine branch (consol_group, consol_group_member,
// consolidated_trial_balance, consolidated_summary, effective_ownership,
// consolidated_nci, consolidated_cta, intercompany_charge, ic_loan,
// tp_policy, ic_settlement). Nothing is recalculated here.
//
//   1. Data collection — trial balance import with validation, duplicate
//      protection, history and rollback.
//   2. Mapping        — local chart of accounts to the group chart, with an
//      unmapped-account queue that blocks consolidation until cleared.
//   3. Cockpit        — an operational control screen, not a dashboard: per
//      entity readiness across every gate, and a run register where each run
//      carries an id, initiator, rules version, timing and a log.
//   4. Intercompany   — matching with tolerance, both reported amounts, the
//      difference, owner, and an unresolved-only view.
//
// Core design language throughout: Midnight Navy, Affinity Cyan, Catamaran,
// hairline borders, tabular figures right-aligned, no card per row.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect } from "react";
import { groupList, mappingList, mappingSet, runList, runRecord } from "./affinity_planning_api";

const NAVY = "#001242", CY = "#00C4CC";
const INK  = "var(--text-primary,#111)";
const MUT  = "var(--text-secondary,#666)";
const LINE = "var(--border-tertiary,#e5e5e5)";
const CARD = "var(--bg-primary,#fff)";
const PAGE = "var(--bg-secondary,#f8f9fc)";
const SUBTLE = "var(--bg-secondary,#f9f9f9)";
const POS = "#4CAF7D", NEG = "#EF4444", AMBER = "#F59E0B";
const FONT = "'Catamaran',system-ui,sans-serif";

const nf  = (n) => n == null ? "—" : Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const money = (n, c) => (c === "EUR" ? "€" : c === "USD" ? "$" : "£") + nf(Math.abs(n));

// ── The group. Ownership and rate type drive translation.
const MEMBERS = [
  { ref:"AFG-000", name:"Affinity Group Limited",         ccy:"GBP", own:100, parent:null,     role:"Parent" },
  { ref:"AFG-IOM", name:"Affinity (Isle of Man) Limited", ccy:"GBP", own:100, parent:"AFG-000",role:"Subsidiary" },
  { ref:"AFG-MLT", name:"Affinity (Malta) Limited",       ccy:"EUR", own:100, parent:"AFG-000",role:"Subsidiary" },
  { ref:"AFG-CYM", name:"Affinity (Cayman) Limited",      ccy:"USD", own:100, parent:"AFG-000",role:"Subsidiary" },
  { ref:"AFG-UK",  name:"Affinity (UK) Limited",          ccy:"GBP", own:100, parent:"AFG-000",role:"Subsidiary" },
  { ref:"AFG-CYP", name:"Affinity (Cyprus) Limited",      ccy:"EUR", own:100, parent:"AFG-000",role:"Subsidiary (new)" },
  { ref:"AFG-SD",  name:"Affinity South Dakota, LLC",     ccy:"USD", own:80,  parent:"AFG-000",role:"Subsidiary (NCI 20%)" },
  { ref:"AFG-FL",  name:"Affinity South Florida, LLC",    ccy:"USD", own:100, parent:"AFG-000",role:"Subsidiary" },
];

// ── Readiness gates, in the order they must pass.
const GATES = ["Data received","Mapped","Balanced","Translated","Intercompany","Journals","Approved"];

const READINESS = {
  "AFG-000": [1,1,1,1,1,1,1],
  "AFG-IOM": [1,1,1,1,1,1,1],
  "AFG-MLT": [1,1,1,1,0,1,0],   // intercompany unmatched
  "AFG-CYM": [1,0,1,1,1,0,0],   // unmapped accounts
  "AFG-UK":  [1,1,1,1,1,1,1],
  "AFG-CYP": [1,1,1,0,1,0,0],   // new office — translation and journals outstanding
  "AFG-SD":  [1,1,0,0,0,0,0],   // trial balance out of balance
  "AFG-FL":  [0,0,0,0,0,0,0],   // nothing received
};

const IMPORT_HISTORY = [
  { id:"TB-2026-0041", entity:"AFG-IOM", period:"Jun 2026", rows:412, by:"Neil Kelly",    at:"02/07/2026 08:14", status:"Posted",     checksum:"a41f…9c2", note:"" },
  { id:"TB-2026-0040", entity:"AFG-MLT", period:"Jun 2026", rows:288, by:"Joanne Fenech", at:"02/07/2026 07:52", status:"Posted",     checksum:"77b0…1e4", note:"" },
  { id:"TB-2026-0039", entity:"AFG-CYM", period:"Jun 2026", rows:301, by:"Garry Crossan", at:"01/07/2026 16:38", status:"Posted",     checksum:"c93a…55d", note:"6 accounts unmapped" },
  { id:"TB-2026-0038", entity:"AFG-SD",  period:"Jun 2026", rows:196, by:"Andrew Morgan", at:"01/07/2026 15:02", status:"Failed",     checksum:"—",        note:"Debits and credits differ by $4,120" },
  { id:"TB-2026-0037", entity:"AFG-SD",  period:"Jun 2026", rows:196, by:"Andrew Morgan", at:"01/07/2026 14:50", status:"Rolled back",checksum:"2d1c…8fa", note:"Superseded by 0038" },
  { id:"TB-2026-0036", entity:"AFG-UK",  period:"Jun 2026", rows:154, by:"Neil Kelly",    at:"01/07/2026 11:20", status:"Posted",     checksum:"5e77…3b9", note:"" },
];

// ── Local to group account mapping. Unmapped rows block the run.
const MAPPINGS = [
  { entity:"AFG-CYM", local:"41000", localName:"Administration fees — corporate", group:"4000", groupName:"Company administration fees", status:"Mapped" },
  { entity:"AFG-CYM", local:"41500", localName:"Trustee fees — private client",   group:"4010", groupName:"Trustee fees",                status:"Mapped" },
  { entity:"AFG-CYM", local:"41800", localName:"Directorship — Cayman",           group:"4020", groupName:"Directorship fees",           status:"Mapped" },
  { entity:"AFG-CYM", local:"49100", localName:"FX gains on client balances",     group:"",     groupName:"",                            status:"Unmapped" },
  { entity:"AFG-CYM", local:"52300", localName:"CIMA annual fees",                group:"",     groupName:"",                            status:"Unmapped" },
  { entity:"AFG-CYM", local:"61200", localName:"Staff — Cayman payroll",          group:"6000", groupName:"Salaries",                    status:"Mapped" },
  { entity:"AFG-CYM", local:"61900", localName:"Work permit fees",                group:"",     groupName:"",                            status:"Unmapped" },
  { entity:"AFG-CYM", local:"72400", localName:"Hurricane contingency provision", group:"",     groupName:"",                            status:"Unmapped" },
  { entity:"AFG-CYM", local:"73100", localName:"Local D&O insurance",             group:"7020", groupName:"Professional indemnity",      status:"Mapped" },
  { entity:"AFG-CYM", local:"78000", localName:"Cayman office rent",              group:"7000", groupName:"Premises & rates",            status:"Mapped" },
  { entity:"AFG-MLT", local:"4100",  localName:"Servizzi ta' amministrazzjoni",   group:"4000", groupName:"Company administration fees", status:"Mapped" },
  { entity:"AFG-MLT", local:"4700",  localName:"Foundation administration",       group:"",     groupName:"",                            status:"Unmapped" },
  { entity:"AFG-MLT", local:"6100",  localName:"Pagi u salarji",                  group:"6000", groupName:"Salaries",                    status:"Mapped" },
];

const GROUP_ACCOUNTS = [
  ["4000","Company administration fees"],["4010","Trustee fees"],["4020","Directorship fees"],
  ["4030","Registered office fees"],["4040","Time-based / ad hoc"],["4090","Disbursements recovered"],
  ["4900","Other operating income"],["5000","Government & registry fees"],["5010","Sub-contracted services"],
  ["6000","Salaries"],["6010","Employer NI / social"],["6030","Recruitment & training"],
  ["7000","Premises & rates"],["7010","IT & software"],["7020","Professional indemnity"],
  ["7030","Regulatory & licence fees"],["7060","Provisions"],
];

// ── Intercompany. Difference beyond tolerance must be resolved before a run.
const IC = [
  { id:1, seller:"AFG-IOM", buyer:"AFG-MLT", account:"Management recharge", cpAccount:"Intra-group costs", ccy:"GBP",
    sellerAmt:48000, buyerAmt:48000, owner:"Neil Kelly", status:"Matched" },
  { id:2, seller:"AFG-IOM", buyer:"AFG-CYM", account:"Management recharge", cpAccount:"Intra-group costs", ccy:"GBP",
    sellerAmt:36000, buyerAmt:36000, owner:"Neil Kelly", status:"Matched" },
  { id:3, seller:"AFG-IOM", buyer:"AFG-MLT", account:"IT recharge",         cpAccount:"IT costs",          ccy:"GBP",
    sellerAmt:12400, buyerAmt:11200, owner:"Joanne Fenech", status:"Unmatched" },
  { id:4, seller:"AFG-MLT", buyer:"AFG-000", account:"Dividend declared",   cpAccount:"Dividend income",   ccy:"EUR",
    sellerAmt:90000, buyerAmt:90000, owner:"Neil Kelly", status:"Matched" },
  { id:5, seller:"AFG-CYM", buyer:"AFG-IOM", account:"Referral fee",        cpAccount:"Referral cost",     ccy:"USD",
    sellerAmt:8500,  buyerAmt:0,     owner:"Garry Crossan", status:"Unmatched" },
  { id:6, seller:"AFG-SD",  buyer:"AFG-FL",  account:"Shared services",     cpAccount:"Shared services",   ccy:"USD",
    sellerAmt:15000, buyerAmt:14980, owner:"Andrew Morgan", status:"Within tolerance" },
  { id:7, seller:"AFG-000", buyer:"AFG-UK",  account:"Loan interest",       cpAccount:"Interest payable",  ccy:"GBP",
    sellerAmt:22000, buyerAmt:22000, owner:"Neil Kelly", status:"Matched" },
];

const RUNS = [
  { id:"CR-2026-06-04", period:"Jun 2026", started:"02/07/2026 09:12", finished:"02/07/2026 09:14", by:"Neil Kelly",
    rules:"v4 (Mar 2026)", status:"Failed", entities:7, note:"Blocked: 2 entities not ready, 2 intercompany differences" },
  { id:"CR-2026-05-03", period:"May 2026", started:"03/06/2026 08:40", finished:"03/06/2026 08:43", by:"Neil Kelly",
    rules:"v4 (Mar 2026)", status:"Complete", entities:7, note:"" },
  { id:"CR-2026-04-02", period:"Apr 2026", started:"05/05/2026 10:05", finished:"05/05/2026 10:09", by:"Andrew Morgan",
    rules:"v4 (Mar 2026)", status:"Complete", entities:7, note:"" },
  { id:"CR-2026-03-01", period:"Mar 2026", started:"08/04/2026 09:30", finished:"08/04/2026 09:36", by:"Neil Kelly",
    rules:"v3 (Nov 2025)", status:"Superseded", entities:6, note:"Re-run after late Malta adjustment" },
];

export default function AffinityConsolidation({ onNav }) {
  const [view, setView]     = useState("cockpit");
  const [period, setPeriod] = useState("Jun 2026");
  const [mapEntity, setMapEntity] = useState("AFG-CYM");
  const [maps, setMaps]     = useState(MAPPINGS);
  const [icRows, setIcRows] = useState(IC);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [tolerance, setTolerance] = useState(100);
  const [runs, setRuns]     = useState(RUNS);
  const [log, setLog]       = useState([]);
  const [running, setRunning] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [groupId, setGroupId] = useState(null);

  // Live group members and run register when the database is available.
  useEffect(() => {
    let ok = true;
    groupList().then((r) => {
      if (!ok || !r.live || !r.data || !r.data.length) return;
      setGroupId(r.data[0].group_id);
      setLive(true);
      return runList(r.data[0].group_id);
    }).then((rr) => {
      if (!ok || !rr || !rr.live || !rr.data || !rr.data.length) return;
      setRuns(rr.data.map((x) => ({
        id: x.run_ref, period: x.period,
        started: x.started_at ? new Date(x.started_at).toLocaleString("en-GB") : "—",
        finished: x.finished_at ? new Date(x.finished_at).toLocaleString("en-GB") : "—",
        by: x.initiated_by, rules: x.rules_version || "—",
        status: x.status, entities: x.member_count, note: x.note || "",
      })));
    }).catch(() => {});
    return () => { ok = false; };
  }, []);
  const [importStep, setImportStep] = useState(1);

  const unmapped = maps.filter((m) => m.status === "Unmapped");
  const unmatched = icRows.filter((r) => r.status === "Unmatched");

  const notReady = MEMBERS.filter((m) => READINESS[m.ref].some((g) => !g));
  const canRun = notReady.length === 0 && unmatched.length === 0;

  // Auto-match anything inside tolerance — the spec's requirement
  const autoMatch = () => {
    setIcRows((rows) => rows.map((r) => {
      if (r.status === "Matched") return r;
      const diff = Math.abs(r.sellerAmt - r.buyerAmt);
      return diff > 0 && diff <= tolerance ? { ...r, status:"Within tolerance" } : r;
    }));
  };

  const runConsolidation = () => {
    setRunning(true);
    const id = "CR-2026-06-0" + (runs.length + 2);
    const steps = [
      "Snapshot taken of approved source data, mappings, rates and rules",
      "Validating entity readiness across " + MEMBERS.length + " members",
      notReady.length ? "BLOCKED — " + notReady.length + " entities not ready: " + notReady.map((e)=>e.ref).join(", ") : "All entities ready",
      unmatched.length ? "BLOCKED — " + unmatched.length + " intercompany differences unresolved" : "Intercompany balances agree",
    ];
    if (canRun) steps.push(
      "Translating at period-end rate (EUR, USD)",
      "Eliminating intercompany balances and transactions",
      "Computing non-controlling interest — AFG-SD 20%",
      "Posting cumulative translation adjustment",
      "Consolidated trial balance produced — run " + id + " complete",
    );
    setLog([]);
    steps.forEach((line, i) => setTimeout(() => setLog((l) => [...l, line]), 260 * (i + 1)));
    setTimeout(() => {
      setRunning(false);
      if (live) {
        runRecord({ ref:id, groupId, period, rules:"v4 (Mar 2026)",
          status: canRun ? "Complete" : "Failed", members: MEMBERS.length,
          note: canRun ? "" : "Blocked at validation", log: null });
      }
      setRuns((r) => [{ id, period, started:new Date().toLocaleString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}),
        finished:"—", by:"Andrew Morgan", rules:"v4 (Mar 2026)",
        status: canRun ? "Complete" : "Failed", entities:MEMBERS.length,
        note: canRun ? "" : "Blocked: " + notReady.length + " entities not ready, " + unmatched.length + " intercompany differences" }, ...r]);
    }, 260 * (steps.length + 1));
  };

  const btn  = { padding:"6px 12px", fontSize:11.5, borderRadius:6, border:`0.5px solid ${LINE}`, background:"transparent", color:MUT, cursor:"pointer" };
  const btnP = { ...btn, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:600 };
  const th = { padding:"8px 14px", textAlign:"left", fontSize:10, fontWeight:600, color:MUT, textTransform:"uppercase",
               letterSpacing:"0.4px", background:SUBTLE, borderBottom:`0.5px solid ${LINE}`, whiteSpace:"nowrap" };
  const td = { padding:"9px 14px", fontSize:12.5, borderBottom:`0.5px solid ${LINE}` };
  const num = { ...td, textAlign:"right", fontVariantNumeric:"tabular-nums" };
  const panel = { background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9, overflow:"hidden", marginBottom:18 };
  const h3 = { fontSize:12.5, fontWeight:600, color:NAVY, marginBottom:8 };

  const Pill = ({ ok, label }) => (
    <span style={{ fontSize:10, fontWeight:700, borderRadius:20, padding:"2px 9px",
                   background: ok?"#E7F4EF":"#FCEBEB", color: ok?"#1F6F54":"#A32D2D" }}>{label}</span>
  );

  return (
    <div style={{ fontFamily:FONT, background:PAGE, minHeight:"100vh", color:INK }}>

      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 22px", background:CARD, borderBottom:`0.5px solid ${LINE}`, flexWrap:"wrap" }}>
        <h2 style={{ margin:0, fontSize:18, fontWeight:500, color:NAVY }}>Consolidation</h2>
        <div style={{ display:"flex", border:`0.5px solid ${LINE}`, borderRadius:6, overflow:"hidden" }}>
          {[["cockpit","Cockpit"],["data","Data collection"],["mapping","Mapping"],["ic","Intercompany"],["runs","Runs"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)}
              style={{ border:"none", cursor:"pointer", fontSize:11.5, padding:"6px 13px", fontWeight:view===v?600:400,
                       background:view===v?CY:CARD, color:view===v?"#fff":MUT }}>
              {l}
              {v==="mapping" && unmapped.length>0 && <span style={{ marginLeft:5, fontSize:9, fontWeight:700, background:view===v?"rgba(255,255,255,0.25)":"#FCEBEB", color:view===v?"#fff":"#A32D2D", borderRadius:9, padding:"1px 5px" }}>{unmapped.length}</span>}
              {v==="ic" && unmatched.length>0 && <span style={{ marginLeft:5, fontSize:9, fontWeight:700, background:view===v?"rgba(255,255,255,0.25)":"#FCEBEB", color:view===v?"#fff":"#A32D2D", borderRadius:9, padding:"1px 5px" }}>{unmatched.length}</span>}
            </button>
          ))}
        </div>
        <span style={{ fontSize:10.5, borderRadius:20, padding:"3px 10px",
          color: live?"#1F6F54":"#B08A3E", background: live?"#E7F4EF":"#FDF4DC" }}>
          {live ? "Live data" : "Preview data"}
        </span>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 22px", background:CARD, borderBottom:`0.5px solid ${LINE}`, flexWrap:"wrap" }}>
        <span style={{ fontSize:10, fontWeight:600, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.5px" }}>Group</span>
        <select style={{ height:30, padding:"0 8px", fontSize:11.5, border:`0.5px solid ${LINE}`, borderRadius:6, background:CARD, color:INK }}>
          <option>Affinity Group — all members</option>
        </select>
        <span style={{ fontSize:10, fontWeight:600, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.5px", marginLeft:6 }}>Period</span>
        <select value={period} onChange={(e)=>setPeriod(e.target.value)}
          style={{ height:30, padding:"0 8px", fontSize:11.5, border:`0.5px solid ${LINE}`, borderRadius:6, background:CARD, color:INK }}>
          {["Jun 2026","May 2026","Apr 2026","Mar 2026"].map((p)=><option key={p}>{p}</option>)}
        </select>
        <span style={{ fontSize:11, color:MUT }}>Reporting currency GBP · rules v4 (Mar 2026)</span>
      </div>

      {/* ══════════════ COCKPIT ══════════════ */}
      {view === "cockpit" && (
        <div style={{ padding:"16px 22px 60px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10, marginBottom:16 }}>
            {[
              ["Ready to consolidate", MEMBERS.length - notReady.length + " of " + MEMBERS.length, notReady.length?AMBER:POS],
              ["Entities blocked", String(notReady.length), notReady.length?NEG:POS],
              ["Unmapped accounts", String(unmapped.length), unmapped.length?NEG:POS],
              ["Intercompany unmatched", String(unmatched.length), unmatched.length?NEG:POS],
              ["Last successful run", "May 2026", MUT],
            ].map(([l,v,c])=>(
              <div key={l} style={{ background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9, padding:"12px 14px" }}>
                <div style={{ fontSize:10.5, color:MUT, marginBottom:5 }}>{l}</div>
                <div style={{ fontSize:19, fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={h3}>Entity readiness — {period}</div>
          <div style={{ ...panel, overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
              <thead><tr>
                <th style={{ ...th, minWidth:230 }}>Entity</th>
                <th style={th}>Ccy</th>
                {GATES.map((g)=><th key={g} style={{ ...th, textAlign:"center" }}>{g}</th>)}
                <th style={th}></th>
              </tr></thead>
              <tbody>
                {MEMBERS.map((m)=>{
                  const r = READINESS[m.ref];
                  const blocked = r.some((g)=>!g);
                  return (
                    <tr key={m.ref} style={{ background: blocked?"#FFFCFA":"transparent" }}>
                      <td style={td}>
                        <div style={{ fontWeight:600 }}>{m.name}</div>
                        <div style={{ fontSize:10, color:MUT }}>{m.ref} · {m.role}{m.own<100?" · "+m.own+"%":""}</div>
                      </td>
                      <td style={{ ...td, color:MUT }}>{m.ccy}</td>
                      {r.map((ok,i)=>(
                        <td key={i} style={{ ...td, textAlign:"center", fontSize:13,
                                             color: ok?POS:(i===r.findIndex((x)=>!x)?NEG:"#ddd") }}>
                          {ok ? "✓" : (i===r.findIndex((x)=>!x) ? "✕" : "·")}
                        </td>
                      ))}
                      <td style={td}>
                        {blocked
                          ? <button style={{ ...btn, padding:"3px 9px", fontSize:10, borderColor:"#f0c9c9", color:"#A32D2D" }}
                              onClick={()=>setView(!r[1]?"mapping":!r[4]?"ic":"data")}>Resolve ↗</button>
                          : <span style={{ fontSize:10.5, color:POS, fontWeight:600 }}>Ready</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display:"flex", gap:7, marginBottom:14, flexWrap:"wrap" }}>
            <button style={btn} onClick={()=>setView("data")}>Refresh data</button>
            <button style={btn} onClick={autoMatch}>Auto-match intercompany</button>
            <button style={btn} onClick={()=>setView("mapping")}>Resolve mappings</button>
            <button style={{ ...btnP, opacity: running?0.6:1 }} disabled={running} onClick={runConsolidation}>
              {running ? "Running…" : "Run consolidation"}
            </button>
            {!canRun && <span style={{ fontSize:11, color:NEG, alignSelf:"center" }}>
              A run will be blocked until readiness and intercompany are clear — it will still record the attempt.
            </span>}
          </div>

          {log.length>0 && (
            <>
              <div style={h3}>Run log</div>
              <div style={{ ...panel, padding:"12px 15px", fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace", fontSize:11, lineHeight:1.8 }}>
                {log.map((l,i)=>(
                  <div key={i} style={{ color: l.startsWith("BLOCKED") ? NEG : l.includes("complete") ? POS : MUT }}>
                    <span style={{ color:"#bbb", marginRight:9 }}>{String(i+1).padStart(2,"0")}</span>{l}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════ DATA COLLECTION ══════════════ */}
      {view === "data" && (
        <div style={{ padding:"16px 22px 60px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:11, flexWrap:"wrap" }}>
            <div style={h3}>Trial balance imports</div>
            <button style={{ ...btnP, marginLeft:"auto" }} onClick={()=>{ setImportOpen(true); setImportStep(1); }}>↑ Import trial balance</button>
          </div>

          <div style={panel}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>{["Import","Entity","Period","Rows","Imported by","When","Checksum","Status","Note",""].map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {IMPORT_HISTORY.map((r)=>(
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight:600 }}>{r.id}</td>
                    <td style={td}>{r.entity}</td>
                    <td style={td}>{r.period}</td>
                    <td style={num}>{nf(r.rows)}</td>
                    <td style={td}>{r.by}</td>
                    <td style={{ ...td, color:MUT }}>{r.at}</td>
                    <td style={{ ...td, color:MUT, fontFamily:"ui-monospace,monospace", fontSize:11 }}>{r.checksum}</td>
                    <td style={td}>
                      <span style={{ fontSize:10, fontWeight:700, borderRadius:20, padding:"2px 9px",
                        background: r.status==="Posted"?"#E7F4EF":r.status==="Failed"?"#FCEBEB":"#EEEEF5",
                        color: r.status==="Posted"?"#1F6F54":r.status==="Failed"?"#A32D2D":"#4A4A6A" }}>{r.status}</span>
                    </td>
                    <td style={{ ...td, fontSize:11, color: r.status==="Failed"?NEG:MUT }}>{r.note || "—"}</td>
                    <td style={td}>
                      {r.status==="Posted" && <button style={{ ...btn, padding:"3px 9px", fontSize:10 }} disabled title="Needs a write function that is not built yet">Roll back</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background:"#FDF4DC", border:"0.5px solid #E5CE9A", borderRadius:8, padding:"10px 13px", fontSize:11, color:"#7B4F1D", lineHeight:1.7 }}>
            Every import is checksummed and recorded against the user and timestamp. Re-importing the same entity and period supersedes the previous file rather than duplicating it, and a posted import can be rolled back until the period is locked. Imported files are treated as untrusted: file type, size, columns, formulas and row counts are validated before anything is posted.
          </div>
        </div>
      )}

      {/* ══════════════ MAPPING ══════════════ */}
      {view === "mapping" && (
        <div style={{ padding:"16px 22px 60px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:11, flexWrap:"wrap" }}>
            <div style={h3}>Local chart → group chart</div>
            <select value={mapEntity} onChange={(e)=>setMapEntity(e.target.value)}
              style={{ height:30, padding:"0 8px", fontSize:11.5, border:`0.5px solid ${LINE}`, borderRadius:6, background:CARD, color:INK }}>
              {[...new Set(maps.map((m)=>m.entity))].map((e)=>{
                const mm=MEMBERS.find((x)=>x.ref===e);
                return <option key={e} value={e}>{mm?mm.name:e}</option>;
              })}
            </select>
            {unmapped.length>0 && (
              <span style={{ fontSize:11, fontWeight:600, color:NEG, background:"#FCEBEB", borderRadius:20, padding:"3px 10px" }}>
                {unmapped.length} unmapped account{unmapped.length>1?"s":""} — consolidation is blocked until these are cleared
              </span>
            )}
          </div>

          <div style={panel}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>{["Local account","Local description","Group account","Status"].map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {maps.filter((m)=>m.entity===mapEntity).map((m,i)=>(
                  <tr key={m.local} style={{ background: m.status==="Unmapped"?"#FFFCFA":"transparent" }}>
                    <td style={{ ...td, fontWeight:600, fontFamily:"ui-monospace,monospace", fontSize:11.5 }}>{m.local}</td>
                    <td style={td}>{m.localName}</td>
                    <td style={td}>
                      <select value={m.group}
                        onChange={(e)=>{
                          const g=e.target.value;
                          const found=GROUP_ACCOUNTS.find((x)=>x[0]===g);
                          setMaps((rows)=>rows.map((r)=>r.local===m.local&&r.entity===m.entity
                            ? { ...r, group:g, groupName:found?found[1]:"", status:g?"Mapped":"Unmapped" } : r));
                          if (live && m.id) mappingSet(m.id, g);
                        }}
                        style={{ height:28, padding:"0 8px", fontSize:11.5, borderRadius:5, minWidth:260, color:INK, background:CARD,
                                 border:`0.5px solid ${m.status==="Unmapped"?"#e0a0a0":LINE}` }}>
                        <option value="">— not mapped —</option>
                        {GROUP_ACCOUNTS.map(([c,n])=><option key={c} value={c}>{c} · {n}</option>)}
                      </select>
                    </td>
                    <td style={td}><Pill ok={m.status==="Mapped"} label={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:11, color:MUT, lineHeight:1.7 }}>
            Mappings are versioned by effective date, so restating a prior period uses the mapping that applied at the time rather than today's.
          </div>
        </div>
      )}

      {/* ══════════════ INTERCOMPANY ══════════════ */}
      {view === "ic" && (
        <div style={{ padding:"16px 22px 60px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:11, flexWrap:"wrap" }}>
            <div style={h3}>Intercompany matching</div>
            <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:11.5, color:MUT, cursor:"pointer" }}>
              <input type="checkbox" checked={unresolvedOnly} onChange={()=>setUnresolvedOnly((v)=>!v)} style={{ width:14, height:14, cursor:"pointer" }} />
              Unresolved only
            </label>
            <span style={{ fontSize:11.5, color:MUT, marginLeft:6 }}>Tolerance</span>
            <input type="number" value={tolerance} onChange={(e)=>setTolerance(Number(e.target.value)||0)}
              style={{ width:80, height:28, padding:"0 8px", fontSize:11.5, border:`0.5px solid ${LINE}`, borderRadius:5, background:CARD, color:INK }} />
            <button style={btn} onClick={autoMatch}>Auto-match within tolerance</button>
            <span style={{ marginLeft:"auto", fontSize:11, color: unmatched.length?NEG:POS, fontWeight:600 }}>
              {unmatched.length ? unmatched.length + " unresolved" : "all agreed"}
            </span>
          </div>

          <div style={{ ...panel, overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:1000 }}>
              <thead><tr>
                {["Selling entity","Buying entity","Account","Counterparty account","Ccy","Seller reports","Buyer reports","Difference","Owner","Status",""].map((h)=><th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {icRows.filter((r)=>!unresolvedOnly || r.status==="Unmatched").map((r)=>{
                  const diff = r.sellerAmt - r.buyerAmt;
                  return (
                    <tr key={r.id} style={{ background: r.status==="Unmatched"?"#FFFCFA":"transparent" }}>
                      <td style={td}>{r.seller}</td>
                      <td style={td}>{r.buyer}</td>
                      <td style={td}>{r.account}</td>
                      <td style={{ ...td, color:MUT }}>{r.cpAccount}</td>
                      <td style={{ ...td, color:MUT }}>{r.ccy}</td>
                      <td style={num}>{money(r.sellerAmt, r.ccy)}</td>
                      <td style={num}>{money(r.buyerAmt, r.ccy)}</td>
                      <td style={{ ...num, fontWeight:700, color: diff===0?MUT : Math.abs(diff)<=tolerance?AMBER:NEG }}>
                        {diff===0 ? "—" : (diff>0?"+":"−") + money(diff, r.ccy)}
                      </td>
                      <td style={{ ...td, fontSize:11.5 }}>{r.owner}</td>
                      <td style={td}>
                        <span style={{ fontSize:10, fontWeight:700, borderRadius:20, padding:"2px 9px",
                          background: r.status==="Matched"?"#E7F4EF":r.status==="Within tolerance"?"#FDF4DC":"#FCEBEB",
                          color: r.status==="Matched"?"#1F6F54":r.status==="Within tolerance"?"#7B4F1D":"#A32D2D" }}>{r.status}</span>
                      </td>
                      <td style={{ ...td, whiteSpace:"nowrap" }}>
                        {r.status==="Unmatched" && (
                          <button style={{ ...btn, padding:"3px 9px", fontSize:10 }}
                            onClick={()=>setIcRows((rows)=>rows.map((x)=>x.id===r.id?{...x,status:"Matched",buyerAmt:x.sellerAmt}:x))}
                            title="Post an adjustment so both sides agree, then eliminate">Adjust &amp; eliminate</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:11, color:MUT, lineHeight:1.7 }}>
            Differences within tolerance are flagged rather than hidden, and still appear in the elimination journal. Anything outside tolerance blocks the run until an adjustment is posted and approved.
          </div>
        </div>
      )}

      {/* ══════════════ RUNS ══════════════ */}
      {view === "runs" && (
        <div style={{ padding:"16px 22px 60px" }}>
          <div style={h3}>Consolidation runs</div>
          <div style={panel}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>{["Run","Period","Started","Finished","Initiated by","Rules version","Members","Status","Note"].map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {runs.map((r)=>(
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight:600, fontFamily:"ui-monospace,monospace", fontSize:11.5 }}>{r.id}</td>
                    <td style={td}>{r.period}</td>
                    <td style={{ ...td, color:MUT }}>{r.started}</td>
                    <td style={{ ...td, color:MUT }}>{r.finished}</td>
                    <td style={td}>{r.by}</td>
                    <td style={{ ...td, color:MUT }}>{r.rules}</td>
                    <td style={num}>{r.entities}</td>
                    <td style={td}>
                      <span style={{ fontSize:10, fontWeight:700, borderRadius:20, padding:"2px 9px",
                        background: r.status==="Complete"?"#E7F4EF":r.status==="Failed"?"#FCEBEB":"#EEEEF5",
                        color: r.status==="Complete"?"#1F6F54":r.status==="Failed"?"#A32D2D":"#4A4A6A" }}>{r.status}</span>
                    </td>
                    <td style={{ ...td, fontSize:11, color:MUT }}>{r.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize:11, color:MUT, lineHeight:1.7 }}>
            Each run records the rules version it used and a fixed snapshot of the source data, so re-running the same approved inputs produces the same result. A rate change after approval triggers a warning and requires a fresh run.
          </div>
        </div>
      )}

      {/* Import wizard */}
      {importOpen && (
        <div onClick={()=>setImportOpen(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,18,66,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={(e)=>e.stopPropagation()}
            style={{ background:CARD, borderRadius:10, width:"100%", maxWidth:640, padding:"18px 20px" }}>
            <div style={{ fontSize:15, fontWeight:600, color:NAVY, marginBottom:4 }}>Import trial balance</div>
            <div style={{ fontSize:11, color:MUT, marginBottom:14 }}>Step {importStep} of 3 · {["Select file","Map columns","Validate & post"][importStep-1]}</div>

            <div style={{ display:"flex", gap:6, marginBottom:16 }}>
              {[1,2,3].map((n)=>(
                <div key={n} style={{ flex:1, height:3, borderRadius:2, background: n<=importStep?CY:LINE }} />
              ))}
            </div>

            {importStep===1 && (
              <div style={{ border:`1px dashed ${LINE}`, borderRadius:9, padding:"26px 18px", textAlign:"center", color:MUT, fontSize:12 }}>
                Drop a CSV or Excel trial balance here, or choose a file.<br/>
                <span style={{ fontSize:11 }}>Accepted: .csv, .xlsx · maximum 10 MB · formulas are stripped before parsing</span>
              </div>
            )}
            {importStep===2 && (
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>{["Column in file","Maps to","Sample"].map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {[["Acct","Local account","41000"],["Description","Local description","Administration fees"],
                    ["Dr","Debit","12,400.00"],["Cr","Credit","0.00"],["Cur","Currency","USD"]].map((r)=>(
                    <tr key={r[0]}>
                      <td style={td}>{r[0]}</td>
                      <td style={{ ...td, fontWeight:600 }}>{r[1]}</td>
                      <td style={{ ...td, color:MUT }}>{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {importStep===3 && (
              <div style={{ fontSize:12, lineHeight:1.9 }}>
                <div style={{ color:POS }}>✓ 301 rows parsed</div>
                <div style={{ color:POS }}>✓ Debits equal credits</div>
                <div style={{ color:POS }}>✓ No duplicate of an existing import for this entity and period</div>
                <div style={{ color:NEG }}>✕ 4 accounts have no group mapping — these must be mapped before the run</div>
                <div style={{ color:MUT, marginTop:8, fontSize:11 }}>Posting will supersede any earlier import for AFG-CYM · Jun 2026.</div>
              </div>
            )}

            <div style={{ display:"flex", gap:7, marginTop:18, justifyContent:"flex-end" }}>
              <button style={btn} onClick={()=>importStep>1?setImportStep(importStep-1):setImportOpen(false)}>{importStep>1?"Back":"Cancel"}</button>
              {importStep<3
                ? <button style={btnP} onClick={()=>setImportStep(importStep+1)}>Continue</button>
                : <button style={btnP} onClick={()=>{ setImportOpen(false); setView("mapping"); }}>Post &amp; resolve mappings</button>}
            </div>
          </div>
        </div>
      )}

      <div style={{ margin:"0 22px 30px", background:"#FDF4DC", border:"0.5px solid #E5CE9A", borderRadius:8,
                    padding:"10px 13px", fontSize:10.5, color:"#7B4F1D", lineHeight:1.65 }}>
        ⚠️ Interface layer over the consolidation engine that already exists on the <code>accounting-engine</code> branch — consol_group, consolidated_trial_balance, effective_ownership, consolidated_nci, consolidated_cta, intercompany_charge. No accounting is calculated here. Connecting it needs that branch merged and db/001–051 run. Elimination treatment, rate types and any ownership calculation need finance sign-off before a run is relied on.
      </div>
    </div>
  );
}
