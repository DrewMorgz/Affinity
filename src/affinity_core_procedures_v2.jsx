import { useState } from "react";
const CY = "#00C4CC";
const Badge = ({ label, colors }) => (<span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>);
const th = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", whiteSpace:"nowrap" };
const td = { padding:"8px 12px", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderBottom:"0.5px solid #e5e5e5" };

const PROCEDURES = [
  { id:"3.01", title:"New client onboarding — company",         category:"Onboarding",   office:"All",          owner:"Administrator",    steps:12, avgTime:"45 days", activeRuns:2 },
  { id:"3.02", title:"New client onboarding — trust",           category:"Onboarding",   office:"All",          owner:"Administrator",    steps:14, avgTime:"50 days", activeRuns:1 },
  { id:"3.03", title:"Transfer-in procedure",                   category:"Onboarding",   office:"All",          owner:"Administrator",    steps:10, avgTime:"30 days", activeRuns:1 },
  { id:"3.04", title:"Client attrition — voluntary resignation",category:"Offboarding",  office:"All",          owner:"Managing Director",steps:9,  avgTime:"30 days", activeRuns:1 },
  { id:"3.05", title:"Client attrition — transfer out",         category:"Offboarding",  office:"All",          owner:"Managing Director",steps:11, avgTime:"45 days", activeRuns:1 },
  { id:"3.06", title:"Client attrition — liquidation",          category:"Offboarding",  office:"All",          owner:"Managing Director",steps:8,  avgTime:"180 days",activeRuns:0 },
  { id:"3.07", title:"Periodic compliance review",              category:"Compliance",   office:"All",          owner:"CCO",              steps:8,  avgTime:"5 days",  activeRuns:3 },
  { id:"3.08", title:"New business AML / KYC assessment",       category:"Compliance",   office:"All",          owner:"CCO",              steps:7,  avgTime:"3 days",  activeRuns:2 },
  { id:"3.09", title:"Enhanced due diligence (EDD)",            category:"Compliance",   office:"All",          owner:"MLRO",             steps:9,  avgTime:"10 days", activeRuns:1 },
  { id:"3.10", title:"Suspicious activity — STR procedure",     category:"Compliance",   office:"All",          owner:"MLRO",             steps:6,  avgTime:"3 days",  activeRuns:0 },
  { id:"3.11", title:"Director appointment — IOM company",      category:"Statutory",    office:"Isle of Man",  owner:"Administrator",    steps:7,  avgTime:"2 days",  activeRuns:1 },
  { id:"3.12", title:"Director appointment — Malta company",    category:"Statutory",    office:"Malta",        owner:"Administrator",    steps:8,  avgTime:"5 days",  activeRuns:0 },
  { id:"3.13", title:"Director appointment — Cayman company",   category:"Statutory",    office:"Cayman Islands",owner:"Administrator",   steps:7,  avgTime:"3 days",  activeRuns:0 },
  { id:"3.14", title:"Share transfer — IOM company",            category:"Statutory",    office:"Isle of Man",  owner:"Administrator",    steps:9,  avgTime:"5 days",  activeRuns:0 },
  { id:"3.15", title:"Annual return filing — IOM",              category:"Statutory",    office:"Isle of Man",  owner:"Administrator",    steps:6,  avgTime:"2 days",  activeRuns:4 },
  { id:"3.16", title:"Annual return filing — Malta",            category:"Statutory",    office:"Malta",        owner:"Administrator",    steps:7,  avgTime:"3 days",  activeRuns:2 },
  { id:"3.17", title:"Annual return filing — Cayman",           category:"Statutory",    office:"Cayman Islands",owner:"Administrator",   steps:6,  avgTime:"2 days",  activeRuns:3 },
  { id:"3.18", title:"Registered office change",                category:"Statutory",    office:"All",          owner:"Administrator",    steps:5,  avgTime:"3 days",  activeRuns:0 },
  { id:"3.19", title:"Bank account opening",                    category:"Banking",      office:"All",          owner:"Administrator",    steps:8,  avgTime:"14 days", activeRuns:1 },
  { id:"3.20", title:"Invoice raising and credit control",      category:"Finance",      office:"All",          owner:"CFO",              steps:6,  avgTime:"Ongoing", activeRuns:0 },
  { id:"3.21", title:"Month end close procedure",               category:"Finance",      office:"All",          owner:"CFO",              steps:10, avgTime:"3 days",  activeRuns:0 },
  { id:"3.22", title:"New joiner — administrator setup",        category:"HR / System",  office:"All",          owner:"System Admin",     steps:8,  avgTime:"1 day",   activeRuns:0 },
  { id:"3.23", title:"Leaver — access revocation",              category:"HR / System",  office:"All",          owner:"System Admin",     steps:6,  avgTime:"1 day",   activeRuns:0 },
  { id:"3.24", title:"Data breach response",                    category:"Compliance",   office:"All",          owner:"MLRO",             steps:8,  avgTime:"72 hours",activeRuns:0 },
];

const PROCEDURE_STEPS = {
  "3.07":[
    { step:1, title:"Select entity and confirm review type",    owner:"Administrator",   desc:"Open entity in Entity Admin. Confirm risk rating, last review date, and review type (standard / enhanced). Note any open compliance cases.",   required:["Entity record open in system","Confirm risk rating"], auto:false },
    { step:2, title:"Run Worldcheck screening",                 owner:"Administrator",   desc:"Run fresh Worldcheck search on all principals, beneficial owners, and the entity itself. Document results. If match — escalate to MLRO immediately.", required:["Worldcheck access","List of principals from entity record"], auto:false },
    { step:3, title:"Review KYC — all parties",                owner:"Administrator",   desc:"Check all KYC documents in DMS. Confirm currency, flag expired items, request renewals as required. Record in compliance register.", required:["DMS access","KYC checklist"], auto:false },
    { step:4, title:"Confirm source of funds / wealth",         owner:"Administrator",   desc:"Review SOF/SOW documentation. Confirm it remains adequate for risk rating. If VH risk — obtain updated SOW confirmation.", required:["SOF documentation in DMS"], auto:false },
    { step:5, title:"Review entity activity and transactions",  owner:"Administrator",   desc:"Review any significant transactions or activity since last review. Cross-reference against stated business purpose. Flag anomalies.", required:["Bank statements if available","Correspondence file"], auto:false },
    { step:6, title:"Update risk rating if required",           owner:"CCO",             desc:"Based on review findings, confirm or amend risk rating. Any upgrade to High or Very High must be approved by MLRO. Record reason for change.", required:["Compliance review notes","CCO approval"], auto:false },
    { step:7, title:"Complete CPR form and file in DMS",        owner:"Administrator",   desc:"Complete the Comprehensive Periodic Review form. File signed copy in DMS under entity compliance folder. Update review date in system.", required:["Signed CPR form"], auto:true, autoNote:"System updates next review date automatically" },
    { step:8, title:"Notify relationship manager",              owner:"CCO",             desc:"Email relationship manager with outcome summary. If any issues outstanding — raise compliance case and assign. Close review in system.", required:["Review outcome confirmed"], auto:true, autoNote:"System sends notification to admin and manager" },
  ],
  "3.11":[
    { step:1, title:"Receive instruction from client",          owner:"Administrator",   desc:"Receive signed instruction from authorised officer. Confirm new director details — full legal name, DOB, address, nationality, ID documents.", required:["Signed instruction letter","New director ID"], auto:false },
    { step:2, title:"Run Worldcheck on incoming director",      owner:"Administrator",   desc:"Run fresh screening on proposed new director. Document result. If match — do not proceed without MLRO clearance.", required:["Worldcheck access"], auto:false },
    { step:3, title:"Obtain KYC for new director",             owner:"Administrator",   desc:"Request and verify passport, proof of address. File in DMS. Update Relations record — check if relation already exists in system.", required:["Passport","Address evidence"], auto:false },
    { step:4, title:"Prepare board resolution",                owner:"Administrator",   desc:"Generate board resolution from template in Documents module. Populate with entity name, date, incoming director, and board composition post-appointment.", required:["Document generator access"], auto:true, autoNote:"Resolution generated from system template" },
    { step:5, title:"Execute resolution and file",             owner:"Administrator",   desc:"Obtain execution from existing directors. File executed resolution in DMS. Update statutory register in Entity Admin — Officers tab.", required:["Executed resolution"], auto:false },
    { step:6, title:"File with Companies Registry",            owner:"Administrator",   desc:"File Form 22 (or equivalent) with IOM Companies Registry within 14 days. Record filing reference and date.", required:["Completed statutory form","Registry access"], auto:false },
    { step:7, title:"Update entity record and notify",         owner:"Administrator",   desc:"Confirm director update in Entity Admin. Update all relevant registers. Send confirmation to client. Close procedure.", required:["Updated entity record"], auto:true, autoNote:"System updates director register and notifies" },
  ],
  "3.15":[
    { step:1, title:"Pull annual return data from system",     owner:"Administrator",   desc:"Open entity in Entity Admin. Export register of directors, shareholders, and registered office. Confirm all records are current.", required:["Entity Admin access"], auto:true, autoNote:"System pre-populates AR form from live data" },
    { step:2, title:"Confirm year end accounts status",        owner:"Administrator",   desc:"Confirm whether accounts are due alongside return. If yes — ensure accounts are prepared and approved before filing.", required:["Accounts confirmation"], auto:false },
    { step:3, title:"Review and confirm with client",          owner:"Administrator",   desc:"Send draft return to client for confirmation. Obtain sign-off within 5 working days.", required:["Client email confirmation"], auto:false },
    { step:4, title:"File annual return with Companies Registry", owner:"Administrator",desc:"Submit annual return via IOM Companies Registry online portal. Pay filing fee. Download confirmation.", required:["Registry portal access","Payment method"], auto:false },
    { step:5, title:"File confirmation and update system",     owner:"Administrator",   desc:"Upload filing confirmation to DMS. Update next annual return date in Entity Admin — Statutory data tab.", required:["Filing confirmation document"], auto:true, autoNote:"System updates next return date and closes task" },
    { step:6, title:"Invoice for annual return service",       owner:"Administrator",   desc:"Raise invoice for annual return service if not covered by retainer. Use Invoicing module — auto-bookkeeping will post.", required:["Fee schedule"], auto:true, autoNote:"Invoice posted, auto-bookkeeping triggered" },
  ],
};

const ACTIVE_RUNS = [
  { procId:"3.07", entity:"Harrington Family Trust",    step:2, total:8, started:"01/07/2025", owner:"Roxy Sheeley",  status:"In progress", overdue:true  },
  { procId:"3.07", entity:"Pacific Wealth Trust",       step:3, total:8, started:"10/07/2025", owner:"Garry Crossan", status:"In progress", overdue:false },
  { procId:"3.07", entity:"Apex Growth Fund Ltd",       step:2, total:8, started:"12/07/2025", owner:"Garry Crossan", status:"Blocked",     overdue:false },
  { procId:"3.11", entity:"Stonebridge Capital Ltd",    step:4, total:7, started:"01/07/2025", owner:"Joanne Fenech", status:"In progress", overdue:false },
  { procId:"3.15", entity:"Meridian Holdings Ltd",      step:3, total:6, started:"07/07/2025", owner:"Roxy Sheeley",  status:"In progress", overdue:false },
  { procId:"3.15", entity:"North Star Holdings Ltd",    step:1, total:6, started:"14/07/2025", owner:"Roxy Sheeley",  status:"In progress", overdue:false },
  { procId:"3.01", entity:"Pinnacle Trading Ltd",       step:4, total:12,started:"01/07/2025", owner:"Sarah Cole",    status:"In progress", overdue:false },
  { procId:"3.01", entity:"Osprey Aviation Partners",   step:1, total:12,started:"10/07/2025", owner:"Andy Morgan",   status:"In progress", overdue:false },
];

const CATEGORIES = [...new Set(PROCEDURES.map(p=>p.category))];

const catColors = {
  Onboarding:   { bg:"#E6F1FB", color:"#0C447C" },
  Offboarding:  { bg:"#FBEAF0", color:"#72243E" },
  Compliance:   { bg:"#FAEEDA", color:"#633806" },
  Corporate:    { bg:"#E6F7FB", color:"#0077A8" },
  Statutory:    { bg:"#EEF0FB", color:"#3C3489" },
  Banking:      { bg:"#EAF3DE", color:"#27500A" },
  Finance:      { bg:"#F1EFE8", color:"#444441" },
  "HR / System":{ bg:"#F1EFE8", color:"#888" },
};

const VIEWS = ["library","active","history"];
const VLABELS = ["Procedure library","Active runs","History"];

export default function AffinityProcedures() {
  const [view, setView]       = useState("library");
  const [catF, setCatF]       = useState("");
  const [sel, setSel]         = useState(null);
  const [runProc, setRunProc] = useState(null);
  const [runStep, setRunStep] = useState(null);
  const [modal, setModal]     = useState(null);

  const selProc = sel ? PROCEDURES.find(p=>p.id===sel) : null;
  const selSteps = sel ? (PROCEDURE_STEPS[sel]||[]) : [];
  const filteredProcs = PROCEDURES.filter(p=>!catF||p.category===catF);

  const activeRun = runProc ? ACTIVE_RUNS.find(r=>r.procId===runProc) : null;
  const runSteps  = runProc ? (PROCEDURE_STEPS[runProc]||[]) : [];

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };
  const sc  = { background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 12px" };

  // Step-by-step runner
  if(runProc&&runSteps.length>0) {
    const currentStep = runStep||1;
    const step = runSteps.find(s=>s.step===currentStep);
    const proc = PROCEDURES.find(p=>p.id===runProc);
    return (
      <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
          <div style={{ fontSize:16, fontWeight:500, color:CY }}>Affinity <span style={{ color:"var(--text-primary,#111)", fontWeight:300 }}>Core</span><small style={{ fontSize:11, color:"#999", fontWeight:300, marginLeft:8 }}>Procedure runner</small></div>
          <button style={nb} onClick={()=>{ setRunProc(null); setRunStep(null); }}>← Back to procedures</button>
        </div>
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>{proc?.id} — {proc?.title}</div>
          <div style={{ fontSize:11, color:"#999", marginBottom:16 }}>Running for: Harrington Family Trust · Step {currentStep} of {runSteps.length}</div>
          {/* Progress bar */}
          <div style={{ display:"flex", gap:4, marginBottom:20, flexWrap:"wrap" }}>
            {runSteps.map(s=>(
              <div key={s.step} onClick={()=>setRunStep(s.step)} style={{ display:"flex", alignItems:"center", gap:4, cursor:"pointer" }}>
                <div style={{ width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, background:s.step<currentStep?"#4CAF7D":s.step===currentStep?CY:"var(--bg-secondary,#f9f9f9)", color:s.step<=currentStep?"#fff":"#aaa", border:s.step===currentStep?`2px solid ${CY}`:"2px solid transparent", flexShrink:0 }}>{s.step<currentStep?"✓":s.step}</div>
                {s.step<runSteps.length&&<div style={{ width:20, height:2, background:s.step<currentStep?"#4CAF7D":"#e5e5e5" }} />}
              </div>
            ))}
          </div>
          {step&&(
            <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:20 }}>
              <div>
                <div style={{ background:"var(--bg-primary,#fff)", border:`2px solid ${CY}`, borderRadius:10, padding:20, marginBottom:14 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:CY, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, flexShrink:0 }}>{step.step}</div>
                    <div>
                      <div style={{ fontSize:15, fontWeight:600 }}>{step.title}</div>
                      <div style={{ fontSize:11, color:"#999", marginTop:2 }}>Owner: {step.owner}</div>
                    </div>
                    {step.auto&&<Badge label="Auto-action" colors={{ bg:"#EAF3DE", color:"#27500A" }} />}
                  </div>
                  <div style={{ fontSize:13, lineHeight:1.7, color:"var(--text-primary,#111)", marginBottom:14 }}>{step.desc}</div>
                  {step.autoNote&&(
                    <div style={{ background:"#EAF3DE", borderRadius:6, padding:"8px 12px", fontSize:11, color:"#27500A", marginBottom:14 }}>
                      ✓ System action: {step.autoNote}
                    </div>
                  )}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.4px", color:"#aaa", marginBottom:8 }}>Required before completing this step</div>
                    {step.required.map((r,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", fontSize:12 }}>
                        <input type="checkbox" style={{ width:14, height:14, cursor:"pointer" }} />
                        <span style={{ color:"#666" }}>{r}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    {currentStep>1&&<button style={nb} onClick={()=>setRunStep(currentStep-1)}>← Previous step</button>}
                    <button style={nba} onClick={()=>currentStep<runSteps.length?setRunStep(currentStep+1):setRunProc(null)}>
                      {currentStep<runSteps.length?"Mark complete & next step →":"Complete procedure ✓"}
                    </button>
                    <button style={{ ...nb, color:"#EF4444", borderColor:"#EF4444" }}>Flag issue</button>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:8, padding:14, marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#aaa", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.4px" }}>All steps</div>
                  {runSteps.map(s=>(
                    <div key={s.step} onClick={()=>setRunStep(s.step)} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 8px", borderRadius:5, cursor:"pointer", background:s.step===currentStep?"var(--bg-primary,#fff)":"transparent", marginBottom:2 }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:600, flexShrink:0, background:s.step<currentStep?"#4CAF7D":s.step===currentStep?CY:"#e5e5e5", color:s.step<=currentStep?"#fff":"#999" }}>{s.step<currentStep?"✓":s.step}</div>
                      <span style={{ fontSize:11, color:s.step===currentStep?"var(--text-primary,#111)":"#666", fontWeight:s.step===currentStep?500:400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</span>
                      {s.auto&&<span style={{ color:"#4CAF7D", fontSize:10, flexShrink:0 }}>⚡</span>}
                    </div>
                  ))}
                </div>
                <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:8, padding:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#aaa", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.4px" }}>Quick links</div>
                  {["Entity Admin — Harrington Trust","Compliance module","Documents — CPR folder","Worldcheck"].map(l=>(
                    <button key={l} style={{ display:"block", width:"100%", textAlign:"left", padding:"5px 8px", background:"none", border:"none", color:CY, fontSize:11, cursor:"pointer", marginBottom:2 }}>↗ {l}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
        <div style={{ fontSize:18, fontWeight:500, color:CY }}>Affinity <span style={{ color:"var(--text-primary,#111)", fontWeight:300 }}>Core</span><small style={{ fontSize:11, color:"#999", fontWeight:300, marginLeft:8 }}>Procedure Automation</small></div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entities","Compliance","Documents","Onboarding"].map(n=><button key={n} style={nb}>{n}</button>)}
          <button style={nba}>Procedures</button>
        </div>
      </div>
      <div style={{ display:"flex", gap:4, padding:"8px 20px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", flexWrap:"wrap" }}>
        {VIEWS.map((v,i)=>(
          <button key={v} style={{ padding:"4px 12px", fontSize:11, borderRadius:20, border:`0.5px solid ${view===v?"#ccc":"#e5e5e5"}`, background:view===v?"var(--bg-primary,#fff)":"transparent", color:view===v?"var(--text-primary,#111)":"#666", cursor:"pointer", fontWeight:view===v?500:400 }} onClick={()=>{ setView(v); setSel(null); }}>{VLABELS[i]}
            {v==="active"&&<span style={{ marginLeft:4, background:"#E6F7FB", color:CY, borderRadius:10, padding:"1px 6px", fontSize:9, fontWeight:700 }}>{ACTIVE_RUNS.length}</span>}
          </button>
        ))}
      </div>

      {/* PROCEDURE LIBRARY */}
      {view==="library"&&(
        <div style={{ display:"flex" }}>
          <div style={{ flex:1 }}>
            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
              {[{l:"Total procedures",v:24,c:CY},{l:"Active runs",v:ACTIVE_RUNS.length,c:null},{l:"Overdue",v:ACTIVE_RUNS.filter(r=>r.overdue).length,c:"#EF4444"},{l:"Auto-action steps",v:"38%",c:"#4CAF7D"}].map(k=>(
                <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:18, fontWeight:500, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
              ))}
            </div>
            {/* Category filter */}
            <div style={{ display:"flex", gap:6, padding:"10px 20px", borderBottom:"0.5px solid #e5e5e5", flexWrap:"wrap" }}>
              <button style={{ padding:"3px 10px", fontSize:11, borderRadius:20, border:`0.5px solid ${!catF?"#ccc":"#e5e5e5"}`, background:!catF?"var(--bg-primary,#fff)":"transparent", cursor:"pointer", color:!catF?"var(--text-primary,#111)":"#666" }} onClick={()=>setCatF("")}>All ({PROCEDURES.length})</button>
              {CATEGORIES.map(c=>(
                <button key={c} style={{ padding:"3px 10px", fontSize:11, borderRadius:20, border:`0.5px solid ${catF===c?"#ccc":"#e5e5e5"}`, background:catF===c?"var(--bg-primary,#fff)":"transparent", cursor:"pointer", color:catF===c?"var(--text-primary,#111)":"#666" }} onClick={()=>setCatF(catF===c?"":c)}>
                  {c} ({PROCEDURES.filter(p=>p.category===c).length})
                </button>
              ))}
            </div>
            {/* Procedure list */}
            <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
              <thead><tr>
                <th style={{ ...th, width:"8%" }}>Ref</th>
                <th style={{ ...th, width:"30%" }}>Procedure</th>
                <th style={{ ...th, width:"13%" }}>Category</th>
                <th style={{ ...th, width:"12%" }}>Office</th>
                <th style={{ ...th, width:"10%" }}>Owner</th>
                <th style={{ ...th, width:"7%", textAlign:"center" }}>Steps</th>
                <th style={{ ...th, width:"10%", textAlign:"center" }}>Active runs</th>
                <th style={{ ...th, width:"10%" }}>Action</th>
              </tr></thead>
              <tbody>
                {filteredProcs.map(p=>(
                  <tr key={p.id} style={{ borderBottom:"0.5px solid #e5e5e5", background:sel===p.id?"var(--bg-secondary,#f9f9f9)":undefined, cursor:"pointer" }} onClick={()=>setSel(sel===p.id?null:p.id)}>
                    <td style={{ ...td, fontWeight:600, color:CY }}>{p.id}</td>
                    <td style={{ ...td, fontWeight:500 }}>{p.title}</td>
                    <td style={td}><Badge label={p.category} colors={catColors[p.category]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...td, fontSize:10, color:"#666" }}>{p.office}</td>
                    <td style={{ ...td, fontSize:10, color:"#666" }}>{p.owner}</td>
                    <td style={{ ...td, textAlign:"center" }}>{p.steps}</td>
                    <td style={{ ...td, textAlign:"center" }}>
                      {p.activeRuns>0?<span style={{ fontWeight:600, color:CY }}>{p.activeRuns}</span>:<span style={{ color:"#aaa" }}>—</span>}
                    </td>
                    <td style={td}>
                      <button style={{ ...nba, fontSize:10, padding:"3px 8px" }} onClick={e=>{ e.stopPropagation(); setRunProc(p.id); setRunStep(1); }}>Run ↗</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          {selProc&&(
            <div style={{ width:280, minWidth:280, borderLeft:"0.5px solid #e5e5e5", padding:14, overflowY:"auto", maxHeight:680 }}>
              <button onClick={()=>setSel(null)} style={{ float:"right", background:"none", border:"none", cursor:"pointer", color:"#aaa", fontSize:14 }}>✕</button>
              <div style={{ fontSize:13, fontWeight:700, color:CY, marginBottom:2 }}>{selProc.id}</div>
              <div style={{ fontSize:13, fontWeight:600, lineHeight:1.4, marginBottom:12 }}>{selProc.title}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                {[["Category",selProc.category],["Office",selProc.office],["Owner",selProc.owner],["Steps",selProc.steps],["Avg time",selProc.avgTime],["Active runs",selProc.activeRuns||"—"]].map(([k,v])=>(
                  <div key={k} style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:5, padding:"6px 8px" }}>
                    <div style={{ fontSize:9, color:"#aaa", marginBottom:2, textTransform:"uppercase" }}>{k}</div>
                    <div style={{ fontSize:11, fontWeight:500 }}>{v}</div>
                  </div>
                ))}
              </div>
              {selSteps.length>0&&(
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.4px", color:"#aaa", marginBottom:8 }}>Steps overview</div>
                  {selSteps.map(s=>(
                    <div key={s.step} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:"0.5px solid #e5e5e5" }}>
                      <div style={{ width:18, height:18, borderRadius:"50%", background:CY, color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{s.step}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:500 }}>{s.title}</div>
                        <div style={{ fontSize:10, color:"#999" }}>{s.owner}{s.auto&&" · ⚡ Auto"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selSteps.length===0&&(
                <div style={{ fontSize:11, color:"#aaa", marginBottom:12 }}>Full step-by-step guidance available when you run this procedure.</div>
              )}
              <button style={{ ...nba, width:"100%", justifyContent:"center" }} onClick={()=>{ setRunProc(selProc.id); setRunStep(1); }}>Run this procedure ↗</button>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE RUNS */}
      {view==="active"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>{ACTIVE_RUNS.length} active procedure runs</div>
          {ACTIVE_RUNS.map((r,i)=>{
            const proc = PROCEDURES.find(p=>p.id===r.procId);
            return (
              <div key={i} style={{ background:"var(--bg-primary,#fff)", border:`0.5px solid ${r.overdue?"#EF4444":r.status==="Blocked"?"#F59E0B":"#e5e5e5"}`, borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{proc?.id} — {proc?.title}</div>
                    <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{r.entity} · {r.owner} · Started {r.started}</div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <Badge label={r.status} colors={{ "In progress":{bg:"#E6F7FB",color:"#0077A8"}, Blocked:{bg:"#FAEEDA",color:"#633806"} }[r.status]||{bg:"#eee",color:"#666"}} />
                    {r.overdue&&<Badge label="Overdue" colors={{ bg:"#FCEBEB", color:"#A32D2D" }} />}
                  </div>
                </div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                    <span style={{ color:"#666" }}>Step {r.step} of {r.total}</span>
                    <span style={{ color:"#666" }}>{Math.round((r.step-1)/r.total*100)}% complete</span>
                  </div>
                  <div style={{ height:6, background:"#eee", borderRadius:3 }}>
                    <div style={{ height:"100%", width:`${((r.step-1)/r.total)*100}%`, background:r.overdue?"#EF4444":r.status==="Blocked"?"#F59E0B":CY, borderRadius:3 }} />
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button style={nb} onClick={()=>{ setRunProc(r.procId); setRunStep(r.step); setView("library"); }}>Continue ↗</button>
                  {r.status==="Blocked"&&<button style={{ ...nb, color:"#EF4444", borderColor:"#EF4444" }}>Resolve block</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* HISTORY */}
      {view==="history"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Completed procedure runs — last 30 days</div>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"10%" }}>Ref</th>
              <th style={{ ...th, width:"28%" }}>Procedure</th>
              <th style={{ ...th, width:"20%" }}>Entity</th>
              <th style={{ ...th, width:"12%" }}>Completed</th>
              <th style={{ ...th, width:"12%" }}>Duration</th>
              <th style={{ ...th, width:"10%" }}>By</th>
              <th style={{ ...th, width:"8%" }}>Result</th>
            </tr></thead>
            <tbody>
              {[
                ["3.07","Periodic compliance review",      "Stonebridge Capital Ltd",       "07/07/2025","2 days",   "Joanne Fenech","Complete"],
                ["3.15","Annual return filing — IOM",      "Rosewood Legacy Trust",          "04/07/2025","1 day",   "Roxy Sheeley", "Complete"],
                ["3.11","Director appointment — IOM",      "Meridian Holdings Ltd",          "02/07/2025","3 days",  "Roxy Sheeley", "Complete"],
                ["3.07","Periodic compliance review",      "Caledonian Ventures Ltd",        "30/06/2025","3 days",  "Garry Crossan","Complete"],
                ["3.17","Annual return — Cayman",          "Bluewater Family Trust",         "28/06/2025","2 days",  "Garry Crossan","Complete"],
                ["3.08","New business KYC assessment",     "Verona Digital Holdings Ltd",    "25/06/2025","3 days",  "Joanne Fenech","Complete"],
                ["3.01","New client onboarding — company", "Beaumont Wealth Structures",     "20/06/2025","38 days", "Garry Crossan","Complete"],
                ["3.19","Bank account opening",            "Apex Growth Fund Ltd",           "18/06/2025","12 days", "Garry Crossan","Complete"],
              ].map(([id,title,entity,date,dur,by,res])=>(
                <tr key={entity+date} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{ ...td, fontWeight:600, color:CY }}>{id}</td>
                  <td style={{ ...td, overflow:"hidden", textOverflow:"ellipsis" }}>{title}</td>
                  <td style={{ ...td, color:"#666", overflow:"hidden", textOverflow:"ellipsis" }}>{entity}</td>
                  <td style={{ ...td, color:"#666" }}>{date}</td>
                  <td style={{ ...td, color:"#666" }}>{dur}</td>
                  <td style={{ ...td, color:"#666", overflow:"hidden", textOverflow:"ellipsis" }}>{by}</td>
                  <td style={td}><Badge label={res} colors={{ Complete:{bg:"#EAF3DE",color:"#27500A"} }[res]||{bg:"#eee",color:"#666"}} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    {/* Create task from procedure modal */}
      {taskModal&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"#fff", borderRadius:12, padding:24, width:460, maxWidth:"95vw" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15, fontWeight:600 }}>Create task from procedure</h3>
              <button onClick={()=>setModal(null)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
            </div>
            <div style={{ background:"#f0f8fb", borderRadius:6, padding:"8px 12px", marginBottom:14, fontSize:11, color:"#0077A8" }}>
              📋 Linked procedure: <strong>{taskModal.ref} — {taskModal.title}</strong>
            </div>
            {[["Task title","text",taskModal.title],["Entity","text",""],["Assign to","select",""],["Due date","text","DD/MM/YYYY"],["Notes","text",""]].map(([l,t,def],i)=>(
              <div key={l} style={{ marginBottom:10 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#555", marginBottom:3 }}>{l}</label>
                {l==="Assign to"
                  ?<select style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none" }}>
                    {["Andy Morgan","Roxy Sheeley","Garry Crossan","Joanne Fenech","Neil Kelly","Gary Harrison","Sarah Cole","Maria Borg"].map(s=><option key={s}>{s}</option>)}
                  </select>
                  :<input defaultValue={def} style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none", boxSizing:"border-box" }} />
                }
              </div>
            ))}
            <button onClick={()=>setModal(null)} style={{ width:"100%", background:"#00C4CC", color:"#fff", border:"none", borderRadius:8, padding:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>
              Create task ↗
            </button>
          </div>
        </div>
      )}
    </>
  );
}
