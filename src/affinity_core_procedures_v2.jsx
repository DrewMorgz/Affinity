import { useState, useEffect } from "react";
import * as OW from "./affinity_ops_write_api";
import { proceduresList, procedureRuns, procedureHist, isConfigured } from "./affinity_ops_api";
const CY = "#00C4CC";
const NAVY = "#001242";

const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);

const PROCEDURES = [
  { id:"3.01", title:"New client onboarding — company",          category:"Onboarding",   office:"All",          owner:"Administrator",     steps:12, avgTime:"10 days",  activeRuns:2 },
  { id:"3.02", title:"New client onboarding — trust",            category:"Onboarding",   office:"All",          owner:"Administrator",     steps:14, avgTime:"14 days",  activeRuns:1 },
  { id:"3.03", title:"New client onboarding — foundation",       category:"Onboarding",   office:"Malta",        owner:"Administrator",     steps:11, avgTime:"12 days",  activeRuns:0 },
  { id:"3.04", title:"Client attrition — company",               category:"Onboarding",   office:"All",          owner:"Administrator",     steps:8,  avgTime:"5 days",   activeRuns:1 },
  { id:"3.05", title:"New director appointment",                  category:"Statutory",    office:"All",          owner:"Administrator",     steps:7,  avgTime:"3 days",   activeRuns:1 },
  { id:"3.06", title:"Director resignation",                      category:"Statutory",    office:"All",          owner:"Administrator",     steps:6,  avgTime:"2 days",   activeRuns:0 },
  { id:"3.07", title:"Periodic compliance review",                category:"Compliance",   office:"All",          owner:"Administrator",     steps:9,  avgTime:"3 days",   activeRuns:3 },
  { id:"3.08", title:"New business KYC assessment",               category:"Compliance",   office:"All",          owner:"Compliance",        steps:8,  avgTime:"5 days",   activeRuns:2 },
  { id:"3.09", title:"Enhanced due diligence (EDD)",              category:"Compliance",   office:"All",          owner:"MLRO",              steps:10, avgTime:"7 days",   activeRuns:1 },
  { id:"3.10", title:"Payments — domestic",                       category:"Finance",      office:"All",          owner:"Senior Admin",      steps:5,  avgTime:"1 day",    activeRuns:0 },
  { id:"3.11", title:"Payments — international",                  category:"Finance",      office:"All",          owner:"Senior Admin",      steps:6,  avgTime:"1 day",    activeRuns:0 },
  { id:"3.12", title:"Foreign exchange transaction",              category:"Finance",      office:"All",          owner:"Senior Admin",      steps:5,  avgTime:"1 day",    activeRuns:0 },
  { id:"3.13", title:"Client invoicing — retainer",               category:"Finance",      office:"All",          owner:"Administrator",     steps:4,  avgTime:"1 day",    activeRuns:0 },
  { id:"3.14", title:"Annual return filing — IOM",                category:"Statutory",    office:"Isle of Man",  owner:"Administrator",     steps:5,  avgTime:"2 days",   activeRuns:1 },
  { id:"3.15", title:"Annual return filing — Cayman",             category:"Statutory",    office:"Cayman Islands",owner:"Administrator",    steps:5,  avgTime:"2 days",   activeRuns:1 },
  { id:"3.16", title:"Annual return filing — Malta",              category:"Statutory",    office:"Malta",        owner:"Administrator",     steps:5,  avgTime:"2 days",   activeRuns:0 },
  { id:"3.17", title:"Beneficial ownership register update",      category:"Statutory",    office:"All",          owner:"Administrator",     steps:4,  avgTime:"1 day",    activeRuns:0 },
  { id:"3.18", title:"Substance assessment",                      category:"Statutory",    office:"All",          owner:"Compliance",        steps:6,  avgTime:"2 days",   activeRuns:0 },
  { id:"3.19", title:"Bank account opening",                      category:"Finance",      office:"All",          owner:"Administrator",     steps:8,  avgTime:"10 days",  activeRuns:1 },
  { id:"3.20", title:"SAR internal disclosure",                   category:"Compliance",   office:"All",          owner:"MLRO",              steps:5,  avgTime:"1 day",    activeRuns:0 },
  { id:"3.21", title:"Document signing procedure",                category:"Operations",   office:"All",          owner:"Administrator",     steps:6,  avgTime:"2 days",   activeRuns:2 },
  { id:"3.22", title:"eGaming licence application — IOM",         category:"Statutory",    office:"Isle of Man",  owner:"Administrator",     steps:10, avgTime:"30 days",  activeRuns:1 },
];

const RUNS = [
  { id:1, proc:"3.07", title:"Periodic compliance review",      entity:"Harrington Family Trust",   started:"01/07/2025", step:4, total:9,  assignee:"Roxy Sheeley",  status:"In progress" },
  { id:2, proc:"3.05", title:"New director appointment",         entity:"Stonebridge Capital Ltd",   started:"10/07/2025", step:2, total:7,  assignee:"Joanne Fenech", status:"In progress" },
  { id:3, proc:"3.07", title:"Periodic compliance review",      entity:"Pacific Wealth Trust",       started:"08/07/2025", step:6, total:9,  assignee:"Garry Crossan", status:"In progress" },
  { id:4, proc:"3.01", title:"New client onboarding — company", entity:"Caledonian Futures Ltd",    started:"01/07/2025", step:8, total:12, assignee:"Garry Crossan", status:"In progress" },
  { id:5, proc:"3.08", title:"New business KYC assessment",     entity:"Westbridge Holdings Trust", started:"12/07/2025", step:2, total:8,  assignee:"Andy Morgan",   status:"In progress" },
];

const HISTORY = [
  { proc:"3.07", title:"Periodic compliance review",      entity:"Stonebridge Capital Ltd",  date:"07/07/2025", dur:"2 days",  by:"Joanne Fenech", result:"Complete" },
  { proc:"3.14", title:"Annual return filing — IOM",      entity:"Rosewood Legacy Trust",    date:"04/07/2025", dur:"1 day",   by:"Roxy Sheeley",  result:"Complete" },
  { proc:"3.05", title:"New director appointment",        entity:"Meridian Holdings Ltd",    date:"02/07/2025", dur:"3 days",  by:"Roxy Sheeley",  result:"Complete" },
  { proc:"3.07", title:"Periodic compliance review",      entity:"Caledonian Ventures Ltd",  date:"30/06/2025", dur:"3 days",  by:"Garry Crossan", result:"Complete" },
  { proc:"3.15", title:"Annual return — Cayman",          entity:"Bluewater Family Trust",   date:"28/06/2025", dur:"2 days",  by:"Garry Crossan", result:"Complete" },
];

const catColors = {
  Onboarding:  { bg:"#E6F7FB", color:"#0077A8" },
  Compliance:  { bg:"#FCEBEB", color:"#A32D2D" },
  Statutory:   { bg:"#FAEEDA", color:"#633806" },
  Finance:     { bg:"#EAF3DE", color:"#27500A" },
  Operations:  { bg:"#EEF0FB", color:"#3C3489" },
};

const VIEWS = ["overview","library","active","history"];
const VLABELS = ["Overview","Procedure library","Active runs","History"];
const CATS = ["Onboarding","Compliance","Statutory","Finance","Operations"];

export default function AffinityProcedures() {
  // ── Write layer plumbing ──────────────────────────────────────────────────
  const [wBusy, setWBusy] = useState(false);
  const [wMsg, setWMsg]   = useState("");
  const wRun = async (fn, okText) => {
    setWBusy(true); setWMsg("");
    try {
      const res = await fn();
      setWBusy(false);
      if (res && res.ok) { setWMsg(okText || "Saved."); return true; }
      if (res && res.live === false) { setWMsg("Not signed in — this cannot be saved yet."); return false; }
      setWMsg((res && res.error) || "That could not be saved.");
      return false;
    } catch (e) {
      setWBusy(false);
      setWMsg(String((e && e.message) || e));
      return false;
    }
  };

  // Starting a procedure run against an entity.
  const startProcedure = async (proc) => {
    const p = proc || (typeof selProc !== "undefined" ? selProc : null);
    if (!p) { setWMsg("Choose a procedure from the library first."); return; }
    const entityLabel = window.prompt("Which entity is this procedure for?") || null;
    await wRun(() => OW.procStart({
      proc: p.id || p.code || String(p),
      title: p.title || null,
      entity: entityLabel,
      totalSteps: p.steps || 1,
    }), "Procedure started.");
  };

  const [pL,setPL]=useState(null),[pR,setPR]=useState(null),[pH,setPH]=useState(null);
  useEffect(()=>{ if(!isConfigured) return; let ok=true; proceduresList().then(({data})=>{if(ok&&data&&data.length)setPL(data);}).catch(()=>{}); procedureRuns().then(({data})=>{if(ok&&data)setPR(data);}).catch(()=>{}); procedureHist().then(({data})=>{if(ok&&data)setPH(data);}).catch(()=>{}); return ()=>{ok=false;}; },[]);
  const proceduresLive=pL||PROCEDURES, runsLive=pR||RUNS, histLive=pH||HISTORY;
  const [view, setView]   = useState("overview");
  const [search, setSrch] = useState("");
  const [catF, setCatF]   = useState("");
  const [selRun, setRun]  = useState(null);

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };
  const th  = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"#f9f9f9", whiteSpace:"nowrap" };
  const td  = { padding:"9px 12px", fontSize:11, borderBottom:"0.5px solid #f0f0f0" };

  const filtered = proceduresLive.filter(p =>
    (!catF || p.category === catF) &&
    (!search || p.title.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search))
  );

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"#f8f9fc", color:"#111", minHeight:"100vh" }}>
      {wMsg && (
        <div style={{ margin:"0 20px 10px", padding:"9px 12px", borderRadius:7, fontSize:11.5,
                      lineHeight:1.6, border:"0.5px solid",
                      background: /Saved|Submitted|Approved|Returned|Posted|Issued|Created|Prepared|Chased|Suspended|Started|Added/.test(wMsg) ? "#E7F4EF" : "#FCEBEB",
                      borderColor: /Saved|Submitted|Approved|Returned|Posted|Issued|Created|Prepared|Chased|Suspended|Started|Added/.test(wMsg) ? "#bfe0d2" : "#f0c9c9",
                      color: /Saved|Submitted|Approved|Returned|Posted|Issued|Created|Prepared|Chased|Suspended|Started|Added/.test(wMsg) ? "#1F6F54" : "#A32D2D" }}>
          {wMsg}
        </div>
      )}

      <div style={{ background:NAVY, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ color:"#fff", fontWeight:700, fontSize:17 }}>Affinity <span style={{ fontWeight:300 }}>Core</span></span>
          <span style={{ color:"#8892b0", fontSize:13 }}>Procedures</span>
        </div>
        <button style={nba} onClick={()=>startProcedure(null)}>＋ Start procedure</button>
      </div>

      <div style={{ background:"#fff", borderBottom:"0.5px solid #e5e5e5", padding:"0 24px", display:"flex", gap:2 }}>
        {VIEWS.map((v,i) => (
          <button key={v} onClick={()=>setView(v)} style={{ padding:"10px 14px", fontSize:12, border:"none", borderBottom:`2px solid ${view===v?CY:"transparent"}`, background:"transparent", color:view===v?CY:"#666", cursor:"pointer", fontWeight:view===v?600:400 }}>
            {VLABELS[i]}
            {v==="active"&&runsLive.length>0&&<span style={{ marginLeft:4, background:CY, color:"#fff", borderRadius:10, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{runsLive.length}</span>}
          </button>
        ))}
      </div>

      <div style={{ padding:"16px 24px" }}>

        {view==="overview"&&(
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
              {[
                { l:"Active runs",      v:runsLive.length,                                          c:CY },
                { l:"Total procedures", v:proceduresLive.length,                                    c:"#111" },
                { l:"Completed this month", v:histLive.length,                                   c:"#4CAF7D" },
                { l:"Overdue",          v:0,                                                     c:"#EF4444" },
              ].map(k => (
                <div key={k.l} style={{ background:"#f9f9f9", borderRadius:8, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:"#666", marginBottom:4 }}>{k.l}</div>
                  <div style={{ fontSize:22, fontWeight:700, color:k.c }}>{k.v}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>Active runs</div>
                {runsLive.slice(0,4).map(r => (
                  <div key={r.id} style={{ padding:"8px 0", borderBottom:"0.5px solid #f5f5f5" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                      <div style={{ fontSize:12, fontWeight:500 }}>{r.entity}</div>
                      <span style={{ fontSize:10, color:"#aaa" }}>{r.assignee.split(" ")[0]}</span>
                    </div>
                    <div style={{ fontSize:11, color:"#666", marginBottom:5 }}>{r.title}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ flex:1, height:4, background:"#f0f0f0", borderRadius:2 }}>
                        <div style={{ width:`${(r.step/r.total)*100}%`, height:"100%", background:CY, borderRadius:2 }} />
                      </div>
                      <span style={{ fontSize:10, color:"#aaa" }}>Step {r.step}/{r.total}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>Recently completed</div>
                {histLive.slice(0,5).map((h,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"0.5px solid #f5f5f5" }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:500 }}>{h.entity}</div>
                      <div style={{ fontSize:10, color:"#aaa" }}>{h.title} · {h.by}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:10, color:"#4CAF7D", fontWeight:600 }}>✓ {h.result}</div>
                      <div style={{ fontSize:10, color:"#aaa" }}>{h.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view==="library"&&(
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <input placeholder="Search procedures by title or reference…" value={search} onChange={e=>setSrch(e.target.value)}
                style={{ flex:1, height:32, padding:"0 12px", border:"0.5px solid #e5e5e5", borderRadius:5, fontSize:12, outline:"none" }} />
              <select value={catF} onChange={e=>setCatF(e.target.value)} style={{ height:32, padding:"0 10px", border:"0.5px solid #e5e5e5", borderRadius:5, fontSize:12 }}>
                <option value="">All categories</option>
                {CATS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff", borderRadius:10, overflow:"hidden" }}>
              <thead><tr>
                {["Ref","Title","Category","Office","Owner","Steps","Avg time","Active","Action"].map(h=><th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ borderBottom:"0.5px solid #f0f0f0" }}>
                    <td style={{ ...td, fontWeight:600, color:CY }}>{p.id}</td>
                    <td style={{ ...td, fontWeight:500 }}>{p.title}</td>
                    <td style={td}><Badge label={p.category} colors={catColors[p.category]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...td, color:"#666", fontSize:10 }}>{p.office}</td>
                    <td style={{ ...td, color:"#666" }}>{p.owner}</td>
                    <td style={{ ...td, color:"#666", textAlign:"center" }}>{p.steps}</td>
                    <td style={{ ...td, color:"#666" }}>{p.avgTime}</td>
                    <td style={{ ...td, textAlign:"center" }}>
                      {p.activeRuns>0 ? <span style={{ background:CY, color:"#fff", borderRadius:10, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{p.activeRuns}</span> : <span style={{ color:"#ddd" }}>—</span>}
                    </td>
                    <td style={td}>
                      <button style={{ ...nba, fontSize:10, padding:"3px 10px" }} onClick={()=>startProcedure(null)}>Start ↗</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop:10, fontSize:11, color:"#aaa" }}>Showing {filtered.length} of {proceduresLive.length} procedures · Authoritative versions stored in SharePoint</div>
          </div>
        )}

        {view==="active"&&(
          <div>
            <div style={{ fontSize:12, fontWeight:500, marginBottom:14 }}>Active procedure runs ({runsLive.length})</div>
            {runsLive.map(r => (
              <div key={r.id} style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:16, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{r.entity}</div>
                    <div style={{ fontSize:11, color:"#666", marginTop:2 }}>{r.title} · {r.proc} · Started {r.started}</div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:11, color:"#aaa" }}>{r.assignee}</span>
                    <button style={{ ...nba, fontSize:10 }} disabled title="Not routed yet — open the record from its own module">Open ↗</button>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ flex:1, height:8, background:"#f0f0f0", borderRadius:4 }}>
                    <div style={{ width:`${(r.step/r.total)*100}%`, height:"100%", background:CY, borderRadius:4, transition:"width 0.3s" }} />
                  </div>
                  <span style={{ fontSize:11, color:"#666", flexShrink:0 }}>Step {r.step} of {r.total}</span>
                  <span style={{ fontSize:11, color:"#4CAF7D", fontWeight:600 }}>{Math.round((r.step/r.total)*100)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {view==="history"&&(
          <div>
            <div style={{ fontSize:12, fontWeight:500, marginBottom:14 }}>Completed procedures — last 30 days</div>
            <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff" }}>
              <thead><tr>
                {["Ref","Title","Entity","Date","Duration","Completed by","Result"].map(h=><th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {histLive.map((h,i) => (
                  <tr key={i} style={{ borderBottom:"0.5px solid #f0f0f0" }}>
                    <td style={{ ...td, fontWeight:600, color:CY }}>{h.proc}</td>
                    <td style={{ ...td, fontWeight:500 }}>{h.title}</td>
                    <td style={{ ...td, color:"#666" }}>{h.entity}</td>
                    <td style={{ ...td, color:"#666" }}>{h.date}</td>
                    <td style={{ ...td, color:"#666" }}>{h.dur}</td>
                    <td style={{ ...td, color:"#666" }}>{h.by}</td>
                    <td style={td}><Badge label={h.result} colors={{ Complete:{ bg:"#EAF3DE", color:"#27500A" } }[h.result]||{bg:"#eee",color:"#666"}} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
