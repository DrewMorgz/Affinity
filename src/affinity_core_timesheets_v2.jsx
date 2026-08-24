import { useState, useMemo, useEffect } from "react";
import EntitySearch from "./affinity_entity_search";
const ENTITY_NAMES = ["Meridian Holdings Ltd","Harrington Family Trust","Pacific Wealth Trust","Caledonian Ventures Ltd","North Star Holdings Ltd","Azure Mediterranean Foundation","Apex Growth Fund Ltd","Stonebridge Capital Ltd","Thornbury Asset Co Ltd","Bluewater Family Trust","Phoenix eGaming Ltd","Meridian Digital Ltd","Suncoast Ventures LLC"];
import { tsEntries, isConfigured } from "./affinity_ops_api";
const CY = "#00C4CC";
const Badge = ({ label, colors }) => (<span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>);
const fmt = (n,s="£") => s+Math.abs(Number(n||0)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const th = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", whiteSpace:"nowrap" };
const td = { padding:"8px 12px", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderBottom:"0.5px solid #e5e5e5" };

const STAFF = [
  { id:1, name:"Andrew Morgan", role:"CEO — Super Admin", office:"USA", flag:"🇺🇸", rate:350, target:37.5 },
  { id:2, name:"Michael Barlow", role:"Compliance Manager (IOM)", office:"Isle of Man", flag:"🇮🇲", rate:200, target:37.5 },
  { id:3, name:"Joanne Fenech", role:"Managing Director (IOM)", office:"Malta", flag:"🇲🇹", rate:300, target:37.5 },
  { id:4, name:"Krista Fenech", role:"Client Administrator", office:"Malta", flag:"🇲🇹", rate:150, target:37.5 },
  { id:5, name:"Alexandra Gardner", role:"COO — Super Admin", office:"USA", flag:"🇺🇸", rate:350, target:37.5 },
  { id:6, name:"Debbie Gooding", role:"Manager", office:"Isle of Man", flag:"🇮🇲", rate:200, target:37.5 },
  { id:7, name:"Natalie Johnson", role:"Assistant Compliance Administrator", office:"USA", flag:"🇺🇸", rate:150, target:37.5 },
  { id:8, name:"Neil Kelly", role:"CFO", office:"USA", flag:"🇺🇸", rate:350, target:37.5 },
  { id:9, name:"Elena Pace", role:"Manager", office:"Isle of Man", flag:"🇮🇲", rate:200, target:37.5 },
  { id:10, name:"Shanya Pickett", role:"Assistant Manager", office:"Isle of Man", flag:"🇮🇲", rate:150, target:37.5 },
  { id:11, name:"Mattei Pisani", role:"Director (Malta)", office:"Isle of Man", flag:"🇮🇲", rate:300, target:37.5 },
  { id:12, name:"Colin Quayle", role:"Director and Company Secretary (IOM)", office:"Isle of Man", flag:"🇮🇲", rate:300, target:37.5 },
  { id:13, name:"Kate Shaw", role:"Manager", office:"Isle of Man", flag:"🇮🇲", rate:200, target:37.5 },
  { id:14, name:"Roxy Sheeley", role:"Managing Director (IOM)", office:"Isle of Man", flag:"🇮🇲", rate:300, target:37.5 },
  { id:15, name:"Gilbert Spiteri Spadaro", role:"Compliance Officer (Malta)", office:"Malta", flag:"🇲🇹", rate:150, target:37.5 },
  { id:16, name:"Colette Grisdale", role:"COO", office:"Isle of Man", flag:"🇮🇲", rate:350, target:37.5 },
];

const ENTRIES = [
  { id:1,  staffId:1, date:"14/07/2025", entity:"Harrington Family Trust",    matter:"Compliance review",       type:"Client — compliance",    units:6,  hours:1.0,  billable:true,  rate:250, value:250,   status:"Submitted", narrative:"Reviewed outstanding KYC requirements. Chased Emma Harrington for updated passport." },
  { id:2,  staffId:1, date:"14/07/2025", entity:"Meridian Holdings Ltd",      matter:"Company administration",  type:"Client — admin",         units:3,  hours:0.5,  billable:true,  rate:250, value:125,   status:"Submitted", narrative:"Updated director register following board meeting confirmation." },
  { id:3,  staffId:1, date:"14/07/2025", entity:"Rosewood Legacy Trust",      matter:"Trustee services",        type:"Client — trust",         units:4,  hours:0.67, billable:true,  rate:250, value:167.50,status:"Submitted", narrative:"Q2 trust distribution — reviewed resolution and payment instruction." },
  { id:4,  staffId:1, date:"11/07/2025", entity:"North Star Holdings Ltd",    matter:"Liquidation admin",       type:"Client — admin",         units:5,  hours:0.83, billable:true,  rate:250, value:208.33,status:"Approved",  narrative:"Coordinated with liquidator re outstanding documents." },
  { id:5,  staffId:1, date:"11/07/2025", entity:"Internal",                   matter:"Team meeting",            type:"Non-billable — internal", units:6,  hours:1.0,  billable:false, rate:0,   value:0,     status:"Approved",  narrative:"Weekly administration team meeting." },
  { id:6,  staffId:2, date:"14/07/2025", entity:"Apex Growth Fund Ltd",       matter:"Compliance — sanctions",  type:"Client — compliance",    units:12, hours:2.0,  billable:true,  rate:250, value:500,   status:"Submitted", narrative:"Worldcheck match review — gathered evidence for MLRO. Prepared case summary." },
  { id:7,  staffId:2, date:"14/07/2025", entity:"Pacific Wealth Trust",       matter:"Periodic review",         type:"Client — compliance",    units:9,  hours:1.5,  billable:true,  rate:250, value:375,   status:"Submitted", narrative:"Started CPR — EDD documentation review." },
  { id:8,  staffId:2, date:"12/07/2025", entity:"Caledonian Ventures Ltd",    matter:"Company administration",  type:"Client — admin",         units:6,  hours:1.0,  billable:true,  rate:250, value:250,   status:"Approved",  narrative:"Annual return preparation — reviewed register of members." },
  { id:9,  staffId:3, date:"14/07/2025", entity:"Stonebridge Capital Ltd",    matter:"Director appointment",    type:"Client — corporate",     units:8,  hours:1.33, billable:true,  rate:250, value:333.33,status:"Submitted", narrative:"Prepared board resolution for Anna Vella appointment. Liaised with client." },
  { id:10, staffId:3, date:"14/07/2025", entity:"Azure Mediterranean Foundation",matter:"Foundation admin",    type:"Client — admin",         units:4,  hours:0.67, billable:true,  rate:250, value:167.50,status:"Submitted", narrative:"Updated council member register." },
  { id:11, staffId:4, date:"14/07/2025", entity:"All entities",               matter:"Invoice review",          type:"Client — finance",       units:12, hours:2.0,  billable:true,  rate:300, value:600,   status:"Submitted", narrative:"Q3 retainer invoice batch review — 7 invoices prepared for approval." },
  { id:12, staffId:4, date:"14/07/2025", entity:"North Star Holdings Ltd",    matter:"Write-off assessment",    type:"Client — finance",       units:6,  hours:1.0,  billable:false, rate:0,   value:0,     status:"Submitted", narrative:"Assessed outstanding invoice for write-off — entity in liquidation." },
  { id:13, staffId:5, date:"14/07/2025", entity:"Apex Growth Fund Ltd",       matter:"MLRO review — sanctions", type:"Client — compliance",    units:18, hours:3.0,  billable:true,  rate:300, value:900,   status:"Submitted", narrative:"Full MLRO review of Worldcheck match. Decision: cannot discount — case remains open." },
  { id:14, staffId:6, date:"14/07/2025", entity:"Pinnacle Trading Ltd",       matter:"Onboarding — KYC",        type:"Client — onboarding",    units:6,  hours:1.0,  billable:true,  rate:150, value:150,   status:"Submitted", narrative:"Chased client re outstanding address evidence. Portal invitation re-sent." },
  { id:15, staffId:7, date:"14/07/2025", entity:"Bluewater Family Trust",     matter:"Trust administration",    type:"Client — trust",         units:4,  hours:0.67, billable:true,  rate:150, value:100,   status:"Submitted", narrative:"Updated beneficiary records." },
  { id:16, staffId:8, date:"14/07/2025", entity:"Stonebridge Capital Ltd",    matter:"Company administration",  type:"Client — admin",         units:5,  hours:0.83, billable:true,  rate:150, value:125,   status:"Submitted", narrative:"Filed executed board resolution in DMS." },
];

const VIEWS = ["entry","wip","utilisation","missing","approval","reports"];
const VLABELS = ["Time entry","WIP by entity","Utilisation","Missing timesheets","Approval queue","Reports"];

export default function AffinityTimesheets({ onNav }) {
  const [entitySearch, setEntitySearch] = useState("");
  const [liveEntries,setLiveEntries]=useState(null);
  useEffect(()=>{ if(!isConfigured) return; let ok=true; tsEntries().then(({data})=>{ if(ok&&data&&data.length) setLiveEntries(data); }).catch(()=>{}); return ()=>{ok=false;}; },[]);
  const entries = liveEntries || ENTRIES;
  const [view, setView] = useState("entry");
  const [staffF, setStaffF] = useState("1");
  const [weekF] = useState("W/C 14 Jul 2025");
  const [modal, setModal] = useState(null);
  const [newEntry, setNewEntry] = useState({ entity:"", matter:"", type:"Client — admin", units:6, narrative:"" });

  // Timer state + helpers (these were referenced in the JSX below but never declared,
  // which crashed the whole module — unmounting the app and dumping the user out).
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerEntity, setTimerEntity] = useState("");
  const [timerMatter, setTimerMatter] = useState("");
  const [timerType, setTimerType]     = useState("Administration");
  const [timerRef, setTimerRef]       = useState(null);
  const [editEntry, setEditEntry]     = useState(null);

  const fmtTimer = (s) => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };
  const startTimer = () => {
    if (timerRunning) {
      if (timerRef) clearInterval(timerRef);
      setTimerRef(null);
      setTimerRunning(false);
    } else {
      const ref = setInterval(()=>setTimerSeconds(s=>s+1), 1000);
      setTimerRef(ref);
      setTimerRunning(true);
    }
  };
  const stopAndLog = () => {
    if (timerRef) clearInterval(timerRef);
    setTimerRef(null);
    setTimerRunning(false);
    // Stub: in production this would push a new entry to ENTRIES
    setTimerSeconds(0);
    setTimerEntity(""); setTimerMatter("");
  };

  const [staffSrch, setStaffSrch] = useState(null);
  const staffEntries = useMemo(()=>entries.filter(e=>e.staffId===parseInt(staffF)),[staffF,entries]);
  const staff = STAFF.find(s=>s.id===parseInt(staffF));
  const totalUnits = staffEntries.reduce((s,e)=>s+e.units,0);
  const billableValue = staffEntries.filter(e=>e.billable).reduce((s,e)=>s+e.value,0);
  const billableHours = staffEntries.filter(e=>e.billable).reduce((s,e)=>s+e.hours,0);
  const totalHours = staffEntries.reduce((s,e)=>s+e.hours,0);

  // WIP by entity
  const wipByEntity = useMemo(()=>{
    const map = {};
    entries.filter(e=>e.billable&&e.status!=="Written off").forEach(e=>{
      if(!map[e.entity]) map[e.entity]={ entity:e.entity, units:0, hours:0, value:0, entries:0 };
      map[e.entity].units += e.units;
      map[e.entity].hours += e.hours;
      map[e.entity].value += e.value;
      map[e.entity].entries++;
    });
    return Object.values(map).sort((a,b)=>b.value-a.value);
  },[entries]);

  // Missing timesheets
  const missing = STAFF.filter(s=>[6].includes(s.id)); // Sarah Cole missing

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };
  const sel = { height:30, padding:"0 8px", fontSize:11, borderRadius:5, border:"0.5px solid #ccc", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", cursor:"pointer" };
  const sc  = { background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 12px" };

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
        <div style={{ fontSize:18, fontWeight:500, color:"#001242" }}>Timesheets</div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entities","Compliance","Invoicing","Reporting"].map(n=><button key={n} style={nb} onClick={()=>onNav&&onNav({Entities:"entities",Compliance:"compliance",Timesheets:"timesheets",Invoicing:"invoicing",Reporting:"reporting",Documents:"documents",Bookkeeping:"bookkeeping"}[n])}>{n}</button>)}
          <button style={nba}>Timesheets</button>
        </div>
      </div>
      {/* Entity search — same component on every page showing client data */}
      <div style={{ padding:"10px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-primary,#fff)" }}>
        <EntitySearch value={entitySearch} compact onChange={(v)=>{ setEntitySearch(v); setTimerEntity(v); }} />
      </div>


      <div style={{ display:"flex", gap:4, padding:"8px 20px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", flexWrap:"wrap" }}>
        {VIEWS.map((v,i)=><button key={v} style={{ padding:"4px 12px", fontSize:11, borderRadius:20, border:`0.5px solid ${view===v?"#ccc":"#e5e5e5"}`, background:view===v?"var(--bg-primary,#fff)":"transparent", color:view===v?"var(--text-primary,#111)":"#666", cursor:"pointer", fontWeight:view===v?500:400 }} onClick={()=>setView(v)}>{VLABELS[i]}</button>)}
        {missing.length>0&&<Badge label={`${missing.length} missing timesheet`} colors={{ bg:"#FCEBEB", color:"#A32D2D" }} />}
      </div>

      {/* TIME ENTRY */}
      {view==="entry"&&(<>
        <div style={{ display:"flex", gap:8, padding:"10px 20px", borderBottom:"0.5px solid #e5e5e5", flexWrap:"wrap", alignItems:"center" }}>
          {/* Person search — type a name rather than scrolling 58 staff */}
          <input list="ts-staff-list" placeholder="Search person…"
            value={staffSrch===null ? ((STAFF.find(x=>String(x.id)===String(staffF))||{}).name || "") : staffSrch}
            onChange={e=>{
              const v=e.target.value; setStaffSrch(v);
              const m=STAFF.find(x=>x.name===v);
              if(m){ setStaffF(String(m.id)); setStaffSrch(null); }
            }}
            onFocus={()=>setStaffSrch("")}
            onBlur={()=>setStaffSrch(null)}
            style={{ ...sel, minWidth:190, boxSizing:"border-box" }} />
          <datalist id="ts-staff-list">{STAFF.map(x=><option key={x.id} value={x.name}/>)}</datalist>
          <select style={sel}><option>{weekF}</option><option>W/C 07 Jul 2025</option><option>W/C 30 Jun 2025</option></select>
          <button style={{ ...nb, marginLeft:"auto" }} onClick={()=>setModal("entry")}>＋ Manual entry</button>
          <button style={nba}>Submit timesheet ↗</button>
        </div>

        {/* Live timer bar */}
        <div style={{ padding:"10px 20px", background:timerRunning?"#f0fff8":"#f9f9f9", borderBottom:"0.5px solid #e5e5e5", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div style={{ fontSize:28, fontWeight:700, color:timerRunning?CY:"#ccc", fontVariantNumeric:"tabular-nums", minWidth:110 }}>
            {fmtTimer(timerSeconds)}
          </div>
          <div style={{ display:"flex", gap:6, flex:1, flexWrap:"wrap" }}>
            <span title="Set by the entity search above" style={{ height:30, display:"flex", alignItems:"center", padding:"0 10px", border:"0.5px solid #e5e5e5", borderRadius:5, fontSize:11.5, background:"#f7f7f9", color:timerEntity?"#111":"#999", minWidth:180 }}>{timerEntity || "No entity selected"}</span>
            <datalist id="ts-timer-entities">{["Meridian Holdings Ltd","Harrington Family Trust","Pacific Wealth Trust","Caledonian Ventures Ltd","Azure Mediterranean Fdn","North Star Holdings Ltd"].map(e=><option key={e} value={e}/>)}</datalist>
            <input value={timerMatter} onChange={e=>setTimerMatter(e.target.value)} placeholder="Matter description…" style={{ height:30, padding:"0 10px", border:"0.5px solid #e5e5e5", borderRadius:5, fontSize:11, minWidth:160, outline:"none" }}/>
            <select value={timerType} onChange={e=>setTimerType(e.target.value)} style={{ height:30, padding:"0 8px", border:"0.5px solid #e5e5e5", borderRadius:5, fontSize:11 }}>
              {["Administration","Compliance","Legal","Accounts","Meetings","Client liaison","New Business — non-billable","Client — non-billable"].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
            <button onClick={startTimer} style={{ padding:"6px 16px", borderRadius:6, border:"none", background:timerRunning?"#F59E0B":CY, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {timerRunning?"⏸ Pause":"▶ Start timer"}
            </button>
            {timerSeconds > 0 && !timerRunning && (
              <button onClick={stopAndLog} style={{ padding:"6px 16px", borderRadius:6, border:"none", background:"#4CAF7D", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                ✓ Log time
              </button>
            )}
            {timerSeconds > 0 && (
              <button onClick={()=>{ if(timerRef)clearInterval(timerRef); setTimerSeconds(0); setTimerRunning(false); }} style={{ padding:"6px 10px", borderRadius:6, border:"0.5px solid #e5e5e5", background:"transparent", color:"#aaa", fontSize:12, cursor:"pointer" }}>
                ✕
              </button>
            )}
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
          {[
            { l:"Total units",     v:totalUnits+"u",                              c:null },
            { l:"Total hours",     v:totalHours.toFixed(1)+"h",                   c:null },
            { l:"Billable hours",  v:billableHours.toFixed(1)+"h",                c:CY },
            { l:"Billable value",  v:fmt(billableValue),                          c:CY },
            { l:"Submitted",       v:staffEntries.some(e=>e.status==="Submitted")?"Pending":"Not submitted", c:staffEntries.some(e=>e.status==="Submitted")?"#F59E0B":"#EF4444" },
          ].map(k=>(
            <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:18, fontWeight:500, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
          ))}
        </div>

        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"10%" }}>Date</th>
              <th style={{ ...th, width:"20%" }}>Entity</th>
              <th style={{ ...th, width:"16%" }}>Matter</th>
              <th style={{ ...th, width:"14%" }}>Type</th>
              <th style={{ ...th, width:"6%" }}>Units</th>
              <th style={{ ...th, width:"6%" }}>Hours</th>
              <th style={{ ...th, width:"9%" }}>Value</th>
              <th style={{ ...th, width:"10%" }}>Status</th>
              <th style={{ ...th, width:"9%" }}>Action</th>
            </tr></thead>
            <tbody>
              {staffEntries.map(e=>(
                <tr key={e.id} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{ ...td, color:"#666" }}>{e.date}</td>
                  <td style={{ ...td, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis" }}>{e.entity}</td>
                  <td style={{ ...td, color:"#666" }}>{e.matter}</td>
                  <td style={td}><Badge label={e.billable?"Billable":"Non-billable"} colors={e.billable?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#F1EFE8",color:"#888"}} /></td>
                  <td style={{ ...td, textAlign:"center", fontWeight:500 }}>{e.units}</td>
                  <td style={{ ...td, textAlign:"center", color:"#666" }}>{e.hours.toFixed(1)}</td>
                  <td style={{ ...td, textAlign:"right", fontWeight:500, color:e.billable?CY:"#aaa" }}>{e.billable?fmt(e.value):"—"}</td>
                  <td style={td}><Badge label={e.status} colors={{ Submitted:{bg:"#FAEEDA",color:"#633806"}, Approved:{bg:"#EAF3DE",color:"#27500A"}, Locked:{bg:"#F1EFE8",color:"#888"} }[e.status]||{bg:"#eee",color:"#666"}} /></td>
                  <td style={td}><button style={{ ...nb, padding:"2px 8px", fontSize:10 }} onClick={()=>{ setEditEntry(e); setModal("editEntry"); }}>Edit ✏️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:"8px 20px", fontSize:11, color:"#999" }}>
          Time is recorded in units of 10 minutes. 1 unit = 10 minutes. All units must be submitted by 10am Monday.
        </div>
      </>)}

      {/* WIP */}
      {view==="wip"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
            {[
              { l:"Total WIP",        v:fmt(entries.filter(e=>e.billable).reduce((s,e)=>s+e.value,0)), c:CY },
              { l:"Entities with WIP",v:wipByEntity.length,                                             c:null },
              { l:"Unbilled entries", v:entries.filter(e=>e.billable&&e.status!=="Locked").length,     c:null },
              { l:"WIP > 60 days",    v:"£8,200",                                                       c:"#F59E0B" },
            ].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:18, fontWeight:500, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
            ))}
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"32%" }}>Entity</th>
              <th style={{ ...th, width:"10%", textAlign:"right" }}>Units</th>
              <th style={{ ...th, width:"10%", textAlign:"right" }}>Hours</th>
              <th style={{ ...th, width:"14%", textAlign:"right" }}>WIP value</th>
              <th style={{ ...th, width:"10%" }}>Entries</th>
              <th style={{ ...th, width:"12%" }}>Action</th>
            </tr></thead>
            <tbody>
              {wipByEntity.map((w,i)=>(
                <tr key={i} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{ ...td, fontWeight:500 }}>{w.entity}</td>
                  <td style={{ ...td, textAlign:"right" }}>{w.units}</td>
                  <td style={{ ...td, textAlign:"right", color:"#666" }}>{w.hours.toFixed(1)}</td>
                  <td style={{ ...td, textAlign:"right", fontWeight:600, color:CY }}>{fmt(w.value)}</td>
                  <td style={{ ...td, textAlign:"center" }}>{w.entries}</td>
                  <td style={td}><button style={{ ...nb, fontSize:10, padding:"2px 8px" }}>Bill ↗</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* UTILISATION */}
      {view==="utilisation"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ marginBottom:16, fontSize:13, fontWeight:500 }}>Team utilisation — week ending 14 Jul 2025</div>
          {[
            { name:"Garry Crossan",  hrs:38, billable:35, target:37.5, util:82 },
            { name:"Colette Grisdale",  hrs:38, billable:32, target:37.5, util:77 },
            { name:"Roxy Sheeley",   hrs:36, billable:28, target:37.5, util:76 },
            { name:"Neil Kelly",     hrs:37, billable:30, target:37.5, util:75 },
            { name:"Patrick Walsh",  hrs:36, billable:28, target:37.5, util:74 },
            { name:"Maria Borg",     hrs:35, billable:26, target:37.5, util:74 },
            { name:"Joanne Fenech",  hrs:35, billable:26, target:37.5, util:74 },
            { name:"Andy Morgan",    hrs:24, billable:12, target:37.5, util:56 },
            { name:"Sarah Cole",     hrs:0,  billable:0,  target:37.5, util:0,  missing:true },
          ].map((u,i)=>(
            <div key={i} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                <span style={{ fontWeight:500 }}>{u.name}{u.missing&&<Badge label="Missing" colors={{ bg:"#FCEBEB", color:"#A32D2D" }} />}</span>
                <span style={{ fontWeight:600, color:u.util<50?"#EF4444":u.util<75?"#F59E0B":"#4CAF7D" }}>{u.util}%</span>
              </div>
              <div style={{ display:"flex", gap:8, fontSize:11, color:"#999", marginBottom:4 }}>
                <span>{u.hrs}h total</span><span>{u.billable}h billable</span><span>Target {u.target}h</span>
              </div>
              <div style={{ height:6, background:"#eee", borderRadius:3, position:"relative" }}>
                <div style={{ position:"absolute", left:`${(u.target/40)*100}%`, top:0, bottom:0, width:1.5, background:"#ccc" }} />
                <div style={{ height:"100%", width:`${Math.min(u.util,100)}%`, background:u.util<50?"#EF4444":u.util<75?"#F59E0B":CY, borderRadius:3 }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize:10, color:"#aaa", marginTop:8 }}>Target: 75% · Grey line = target</div>
        </div>
      )}

      {/* MISSING */}
      {view==="missing"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Missing timesheets — week ending 14 Jul 2025</div>
          {missing.length>0?(missing.map((s,i)=>(
            <div key={i} style={{ background:"#FCEBEB22", border:"0.5px solid #EF4444", borderRadius:8, padding:"12px 16px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontWeight:600, fontSize:13 }}>{s.name}</div>
                <div style={{ fontSize:11, color:"#A32D2D", marginTop:2 }}>No timesheet submitted for W/C 14 Jul 2025 · {s.office}</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ ...nb, fontSize:11 }}>Send reminder</button>
                <button style={{ color:"#EF4444", border:"0.5px solid #EF4444", padding:"5px 12px", borderRadius:5, background:"transparent", fontSize:11, cursor:"pointer" }}>Escalate ↗</button>
              </div>
            </div>
          ))):(<div style={{ fontSize:12, color:"#4CAF7D", padding:"20px 0", textAlign:"center" }}>✓ All timesheets submitted for this week</div>)}
        </div>
      )}

      {/* APPROVAL */}
      {view==="approval"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Approval queue — submitted timesheets</div>
          {entries.filter(e=>e.status==="Submitted").slice(0,8).map((e,i)=>{
            const st = STAFF.find(s=>s.id===e.staffId);
            return (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:"0.5px solid #e5e5e5" }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:500 }}>{st?.name} — {e.entity}</div>
                  <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{e.matter} · {e.units} units · {e.date}</div>
                  <div style={{ fontSize:11, color:"#666", marginTop:2, fontStyle:"italic" }}>{e.narrative}</div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0, marginLeft:12 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:e.billable?CY:"#aaa", marginRight:8 }}>{e.billable?fmt(e.value):"Non-billable"}</span>
                  <button style={{ ...nb, fontSize:10 }}>Return</button>
                  <button style={nba}>Approve ✓</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* REPORTS */}
      {view==="reports"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Timesheet reports</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {[
              { title:"WIP report",              desc:"Work in progress by client, entity, matter, employee, team. Filter by date range and billing status." },
              { title:"Utilisation report",       desc:"Billable vs total hours by individual and team. Weekly, monthly, or custom period." },
              { title:"Recovery report",          desc:"Billed value vs recorded value after write-ups and write-downs. Recovery rate by employee and entity." },
              { title:"Missing time report",      desc:"Employees with incomplete timesheets for a given period. Submission compliance for staff appraisals." },
              { title:"PRFTINS1 — all matters",  desc:"Profitability report comparing recorded WIP against agreed fixed fees. Flags under-recovery above 50%." },
              { title:"PRFTINS2 — selected services",desc:"Profitability report for selected service lines. Used for fee review and billing analysis." },
            ].map(r=>(
              <div key={r.title} style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:8, padding:"12px 14px" }}>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>{r.title}</div>
                <div style={{ fontSize:11, color:"#666", lineHeight:1.5, marginBottom:10 }}>{r.desc}</div>
                <div style={{ display:"flex", gap:6 }}>
                  <select style={{ height:28, padding:"0 6px", fontSize:11, borderRadius:5, border:"0.5px solid #ccc", background:"var(--bg-primary,#fff)", cursor:"pointer" }}>
                    <option>This week</option><option>This month</option><option>YTD</option><option>Custom</option>
                  </select>
                  <button style={nba}>Generate ↗</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal==="logTimer"&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"#fff",borderRadius:12,padding:24,width:460,maxWidth:"95vw" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
              <h3 style={{ margin:0,fontSize:15,fontWeight:600 }}>Log timed entry</h3>
              <button onClick={()=>setModal(null)} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888" }}>×</button>
            </div>
            <div style={{ background:"#f0fff8",border:"0.5px solid #4CAF7D",borderRadius:8,padding:"10px 14px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <span style={{ fontSize:13,fontWeight:600,color:"#27500A" }}>⏱ {fmtTimer(timerSeconds)}</span>
              <span style={{ fontSize:12,color:"#27500A" }}>{Math.ceil(timerSeconds/600)} units · {(timerSeconds/3600).toFixed(2)} hours</span>
            </div>
            {[["Entity","select",["Meridian Holdings Ltd","Harrington Family Trust","Pacific Wealth Trust","Caledonian Ventures Ltd","North Star Holdings Ltd"]],["Matter","text","e.g. Annual review preparation"],["Work type","select",["Administration","Compliance","Legal","Accounts","Meetings","Client liaison","New Business — non-billable","Client — non-billable"]]].map(([l,t,opts])=>(
              <div key={l} style={{ marginBottom:12 }}>
                <label style={{ display:"block",fontSize:11,fontWeight:600,color:"#555",marginBottom:4 }}>{l}</label>
                {l==="Entity"?<><input list="ts-timer-entity" defaultValue={timerEntity} placeholder="Search entity…" style={{ width:"100%",padding:"8px 10px",border:"1.5px solid #e0e0e0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box" }} /><datalist id="ts-timer-entity">{(Array.isArray(opts)?opts:[]).map(o=><option key={o} value={o}/>)}</datalist></>
                :t==="select"?<select defaultValue={l==="Work type"?timerType:""} style={{ width:"100%",padding:"8px 10px",border:"1.5px solid #e0e0e0",borderRadius:6,fontSize:12,outline:"none" }}>{(Array.isArray(opts)?opts:[]).map(o=><option key={o}>{o}</option>)}</select>
                :<input defaultValue={timerMatter} style={{ width:"100%",padding:"8px 10px",border:"1.5px solid #e0e0e0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box" }} placeholder={typeof opts==="string"?opts:""} />}
              </div>
            ))}
            <button onClick={()=>{ setModal(null); setTimerSeconds(0); }} style={{ width:"100%",background:"#4CAF7D",color:"#fff",border:"none",borderRadius:8,padding:10,fontSize:13,fontWeight:600,cursor:"pointer" }}>Save time entry</button>
          </div>
        </div>
      )}

      {modal==="editEntry"&&editEntry&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"#fff",borderRadius:12,padding:24,width:460,maxWidth:"95vw" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
              <h3 style={{ margin:0,fontSize:15,fontWeight:600 }}>Edit time entry</h3>
              <button onClick={()=>setModal(null)} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888" }}>×</button>
            </div>
            {[["Date","text",editEntry.date],["Entity","select"],["Matter","text",editEntry.matter],["Units","number",editEntry.units],["Work type","select"]].map(([l,t,def])=>(
              <div key={l} style={{ marginBottom:12 }}>
                <label style={{ display:"block",fontSize:11,fontWeight:600,color:"#555",marginBottom:4 }}>{l}</label>
                {l==="Entity"?<><input list="ts-edit-entity" defaultValue={editEntry.entity} placeholder="Search entity…" style={{ width:"100%",padding:"8px 10px",border:"1.5px solid #e0e0e0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box" }} /><datalist id="ts-edit-entity">{["Meridian Holdings Ltd","Harrington Family Trust","Pacific Wealth Trust","Caledonian Ventures Ltd","North Star Holdings Ltd"].map(o=><option key={o} value={o}/>)}</datalist></>
                :t==="select"?<select defaultValue={editEntry.type} style={{ width:"100%",padding:"8px 10px",border:"1.5px solid #e0e0e0",borderRadius:6,fontSize:12,outline:"none" }}>
                  {["Administration","Compliance","Legal","Accounts","Meetings","Client liaison","New Business — non-billable","Client — non-billable"].map(o=><option key={o}>{o}</option>)}
                </select>
                :<input type={t} defaultValue={def} style={{ width:"100%",padding:"8px 10px",border:"1.5px solid #e0e0e0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box" }} />}
              </div>
            ))}
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={()=>setModal(null)} style={{ flex:1,background:"#f5f5f5",color:"#333",border:"none",borderRadius:8,padding:10,fontSize:13,fontWeight:600,cursor:"pointer" }}>Cancel</button>
              <button onClick={()=>setModal(null)} style={{ flex:2,background:CY,color:"#fff",border:"none",borderRadius:8,padding:10,fontSize:13,fontWeight:600,cursor:"pointer" }}>Save changes</button>
            </div>
          </div>
        </div>
      )}

      {modal==="entry"&&(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(13,27,42,0.45)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:40, zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"var(--bg-primary,#fff)", borderRadius:10, border:"0.5px solid #e5e5e5", padding:22, width:500, maxWidth:"96vw" }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:16 }}>Add time entry</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                ["Date","text","DD/MM/YYYY",false],["Entity","text","Entity name",false],
                ["Matter / service","text","e.g. Company administration",false],
                ["Work type","select","",false,["Client — admin","Client — compliance","Client — trust","Client — finance","Client — onboarding","Client — corporate","Client — non-billable","Non-billable — new business","Non-billable — internal","Non-billable — leave"]],
                ["Units (10 min)","number","e.g. 6 = 1 hour",false],
              ].map(([l,t,ph,full,opts])=>(
                <div key={l} style={{ display:"flex", flexDirection:"column", gap:3, gridColumn:full?"1/-1":"auto" }}>
                  <label style={{ fontSize:11, color:"#666" }}>{l}</label>
                  {(l==="Entity"||l==="Client")
                    ?<><input list="tse-ent" placeholder={"Search "+l.toLowerCase()+"…"} style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", background:"var(--bg-primary,#fff)", padding:"0 8px", height:32, outline:"none" , boxSizing:"border-box" }} /><datalist id="tse-ent">{ENTITY_NAMES.map(o=><option key={o} value={o}/>)}</datalist></>
                    :t==="select"
                    ?<select style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", background:"var(--bg-primary,#fff)", padding:"0 8px", height:32, outline:"none" }}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>
                    :<input type={t} style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)" }} placeholder={ph} />
                  }
                </div>
              ))}
              <div style={{ display:"flex", flexDirection:"column", gap:3, gridColumn:"1/-1" }}>
                <label style={{ fontSize:11, color:"#666" }}>Narrative</label>
                <textarea style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"6px 8px", height:60, outline:"none", resize:"none" }} placeholder="Brief description of work done" />
              </div>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:14 }}>
              <button style={nb} onClick={()=>setModal(null)}>Cancel</button>
              <button style={nba} onClick={()=>setModal(null)}>Save entry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
