import React, { useState, useEffect } from "react";
import AffinityLoginPage from "./affinity_login_page";
import Dashboard     from "./affinity_core_dashboard";
import EntityAdmin   from "./affinity_core_entity_admin";
import CRM          from "./affinity_core_crm";
import Documents     from "./affinity_core_documents_v2";
import Onboarding    from "./affinity_core_onboarding_v2";
import Timesheets    from "./affinity_core_timesheets_v2";
import Invoicing     from "./affinity_core_invoicing_v2";
import Bookkeeping   from "./affinity_core_bookkeeping_v2";
import Budgeting     from "./affinity_core_budgeting";
import Reporting     from "./affinity_core_reporting_v2";
import Procedures    from "./affinity_core_procedures_v2";
import SystemAdmin   from "./affinity_core_system_admin";
import Chatbot      from "./affinity_core_chatbot";
import Intranet     from "./affinity_core_intranet";
import EGaming      from "./affinity_core_egaming";
import Compliance   from "./affinity_core_compliance";
import Statutory    from "./affinity_core_statutory_registers";
import GenerateDoc  from "./affinity_core_generate_document";
import Feedback     from "./affinity_core_feedback";
import AuditLog     from "./affinity_core_audit_log";
import { NotificationsPanel, NOTIFICATIONS_DATA } from "./affinity_core_notifications";
import ClientPortal from "./affinity_core_client_portal";
import Accounting   from "./affinity_core_accounting";
import { canAccessModule, deriveRbacRole } from "./affinity_core_rbac";

const NAVY = "#001242";
const AFFINITY_LOGO = "https://cdn.prod.website-files.com/680f471059835ea8d579b7e8/680f87c089dc0cf0630d7c8d_Affinity%20grad.svg";

const CY = "#00C4CC";

const USERS = [
  {id:1,name:"Andrew Morgan",firstName:"Andrew",lastName:"Morgan",office:"USA",flag:"🇺🇸",role:"CEO — Super Admin",av:"AM",c:"#00C4CC",pass:"affinity1"},
  {id:2,name:"Michael Barlow",firstName:"Michael",lastName:"Barlow",office:"Isle of Man",flag:"🇮🇲",role:"Compliance Manager (IOM)",av:"MB",c:"#7C5CBF",pass:"affinity2"},
  {id:3,name:"Joanne Fenech",firstName:"Joanne",lastName:"Fenech",office:"Malta",flag:"🇲🇹",role:"Managing Director (IOM)",av:"JF",c:"#4A7C6F",pass:"affinity3"},
  {id:4,name:"Krista Fenech",firstName:"Krista",lastName:"Fenech",office:"Malta",flag:"🇲🇹",role:"Client Administrator",av:"KF",c:"#5C8E3C",pass:"affinity4"},
  {id:5,name:"Alexandra Gardner",firstName:"Alexandra",lastName:"Gardner",office:"USA",flag:"🇺🇸",role:"COO — Super Admin",av:"AG",c:"#BF5C7A",pass:"affinity5"},
  {id:6,name:"Debbie Gooding",firstName:"Debbie",lastName:"Gooding",office:"Isle of Man",flag:"🇮🇲",role:"Manager",av:"DG",c:"#1A7FBF",pass:"affinity6"},
  {id:7,name:"Natalie Johnson",firstName:"Natalie",lastName:"Johnson",office:"USA",flag:"🇺🇸",role:"Assistant Compliance Administrator",av:"NJ",c:"#2E7A8A",pass:"affinity7"},
  {id:8,name:"Neil Kelly",firstName:"Neil",lastName:"Kelly",office:"USA",flag:"🇺🇸",role:"CFO",av:"NK",c:"#BF7A5C",pass:"affinity8"},
  {id:9,name:"Elena Pace",firstName:"Elena",lastName:"Pace",office:"Isle of Man",flag:"🇮🇲",role:"Manager",av:"EP",c:"#7B4F1D",pass:"affinity9"},
  {id:10,name:"Shanya Pickett",firstName:"Shanya",lastName:"Pickett",office:"Isle of Man",flag:"🇮🇲",role:"Assistant Manager",av:"SP",c:"#5C7A8E",pass:"affinity10"},
  {id:11,name:"Mattei Pisani",firstName:"Mattei",lastName:"Pisani",office:"Isle of Man",flag:"🇮🇲",role:"Director (Malta)",av:"MP",c:"#8A4A6E",pass:"affinity11"},
  {id:12,name:"Colin Quayle",firstName:"Colin",lastName:"Quayle",office:"Isle of Man",flag:"🇮🇲",role:"Director and Company Secretary (IOM)",av:"CQ",c:"#4A8E7C",pass:"affinity12"},
  {id:13,name:"Kate Shaw",firstName:"Kate",lastName:"Shaw",office:"Isle of Man",flag:"🇮🇲",role:"Manager",av:"KS",c:"#A0623E",pass:"affinity13"},
  {id:14,name:"Roxy Sheeley",firstName:"Roxy",lastName:"Sheeley",office:"Isle of Man",flag:"🇮🇲",role:"Managing Director (IOM)",av:"RS",c:"#3C5CBF",pass:"affinity14"},
  {id:15,name:"Gilbert Spiteri Spadaro",firstName:"Gilbert",lastName:"Spiteri Spadaro",office:"Malta",flag:"🇲🇹",role:"Compliance Officer (Malta)",av:"GS",c:"#3A6E4A",pass:"affinity15"},
  {id:16,name:"Colette Grisdale",firstName:"Gary",lastName:"Harrison",office:"Isle of Man",flag:"🇮🇲",role:"COO",av:"GH",c:"#0D6E8E",pass:"affinity16"},
];

// ── Login screen ─────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [pass, setPass]         = useState("");
  const [error, setError]       = useState("");
  const [showPass, setShow]     = useState(false);
  const [selUser, setSelUser]   = useState(null);

  const handleLogin = () => {
    // Temporary single login
    if (username.trim().toLowerCase() === "admin" && pass === "madebyAffinity") {
      onLogin(1); return;
    }
    // Per-user login
    const found = USERS.find(u => u.pass === pass && (
      username.toLowerCase() === u.name.split(" ")[0].toLowerCase() ||
      username.toLowerCase() === u.name.toLowerCase()
    ));
    if (found) { onLogin(found.id); return; }
    setError("Incorrect username or password. Try again.");
  };

  return (
    <div style={{ minHeight:"100vh", background:NAVY, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Catamaran',system-ui,sans-serif", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        {/* Logo + banner */}
        <div style={{ background:`linear-gradient(135deg, ${CY} 0%, #00929A 50%, ${NAVY} 100%)`, borderRadius:14, padding:"30px 26px", marginBottom:28, textAlign:"center", boxShadow:"0 8px 32px rgba(0,180,216,0.18)" }}>
          <div style={{ marginBottom:18, display:"flex", justifyContent:"center" }}>
            <div style={{ background:"#fff", borderRadius:60, padding:"14px 28px", boxShadow:"0 4px 16px rgba(0,0,0,0.15)", display:"inline-flex", alignItems:"center", justifyContent:"center", minHeight:48, minWidth:140 }}>
              <img
                src="https://cdn.prod.website-files.com/680f471059835ea8d579b7e8/680f87c089dc0cf0630d7c8d_Affinity%20grad.svg"
                alt="Affinity"
                style={{ height:36, display:"block", maxWidth:200 }}
                onError={(e) => {
                  // SVG didn't load — replace with text fallback inside the pill
                  e.target.style.display = "none";
                  const fallback = document.createElement("div");
                  fallback.textContent = "AFFINITY";
                  fallback.style.cssText = "font-size:22px;font-weight:700;letter-spacing:2px;background:linear-gradient(135deg,#00C4CC,#001242);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#001242;";
                  e.target.parentNode.appendChild(fallback);
                }}
              />
            </div>
          </div>
          <div style={{ fontSize:48, fontWeight:700, color:"#fff", letterSpacing:"-1px", lineHeight:1, marginTop:8 }}>
            Affinity <span style={{ fontWeight:200, opacity:0.95, fontStyle:"italic" }}>Core</span>
          </div>
          <div style={{ fontSize:11, color:"#fff", marginTop:10, textTransform:"uppercase", letterSpacing:"3px", opacity:0.9 }}>
            Corporate &middot; Trust &middot; Compliance
          </div>
          <div style={{ fontSize:10, color:"#fff", marginTop:6, opacity:0.7 }}>
            Isle of Man · Malta · Cayman · USA · UK · Cyprus
          </div>
        </div>

        <div style={{ background:"rgba(255,255,255,0.05)", borderRadius:16, padding:32, border:"0.5px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize:18, fontWeight:600, color:"#fff", marginBottom:6 }}>Sign in</div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:28 }}>Enter your first name and password</div>

          {/* Username */}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:8 }}>First name</label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(""); }}
              onKeyDown={e => e.key==="Enter" && handleLogin()}
              placeholder="Your first name"
              autoFocus
              style={{ width:"100%", padding:"12px 14px", background:"rgba(255,255,255,0.07)", border:`1.5px solid ${error?"#EF4444":"rgba(255,255,255,0.15)"}`, borderRadius:8, color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:8 }}>Password</label>
            <div style={{ position:"relative" }}>
              <input
                type={showPass?"text":"password"}
                value={pass}
                onChange={e => { setPass(e.target.value); setError(""); }}
                onKeyDown={e => e.key==="Enter" && handleLogin()}
                placeholder="Enter your password"
                style={{ width:"100%", padding:"12px 44px 12px 14px", background:"rgba(255,255,255,0.07)", border:`1.5px solid ${error?"#EF4444":"rgba(255,255,255,0.15)"}`, borderRadius:8, color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
              />
              <button onClick={() => setShow(p=>!p)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.4)", fontSize:16 }}>
                {showPass?"🙈":"👁"}
              </button>
            </div>
            {error && <div style={{ fontSize:12, color:"#EF4444", marginTop:6 }}>{error}</div>}
          </div>

          <button onClick={handleLogin}
            style={{ width:"100%", padding:"13px", background:CY, color:"#fff", border:"none", borderRadius:8, fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            Sign in →
          </button>
        </div>

        <div style={{ textAlign:"center", marginTop:24, fontSize:11, color:"rgba(255,255,255,0.2)" }}>
          Made by Affinity, for Affinity · Internal use only
        </div>
      </div>
    </div>
  );
}

const offC = {
  "Isle of Man":    {bg:"#E6F7FB",color:"#0077A8"},
  "Malta":          {bg:"#EEF0FB",color:"#3C3489"},
  "Cayman Islands": {bg:"#E6EEF7",color:"#0D4A7A"},
  "Group":          {bg:"rgba(13,27,42,0.08)",color:NAVY},
};

const ALERTS = [
  {id:1,sev:"Critical",cat:"Compliance",title:"Harrington Family Trust — review overdue",  ass:"Roxy Sheeley"},
  {id:2,sev:"Critical",cat:"Compliance",title:"Apex Growth Fund — sanctions match open",  ass:"Colette Grisdale"},
  {id:3,sev:"Critical",cat:"KYC",       title:"Emma Harrington — KYC expired",            ass:"Roxy Sheeley"},
  {id:4,sev:"High",    cat:"Compliance",title:"Pacific Wealth Trust — review overdue",    ass:"Garry Crossan"},
  {id:5,sev:"High",    cat:"Invoicing", title:"Harrington Trust — invoice 60d+ overdue",  ass:"Neil Kelly"},
  {id:6,sev:"High",    cat:"Timesheets",title:"Sarah Cole — timesheet missing",           ass:"Roxy Sheeley"},
  {id:7,sev:"Medium",  cat:"KYC",       title:"Sarah Cole — ID expiring in 45 days",      ass:"Roxy Sheeley"},
  {id:8,sev:"Medium",  cat:"System",    title:"Garry Crossan — MFA not enabled",          ass:"Andy Morgan"},
];

const NAV = [
  {s:"Overview",   items:[
    {id:"dashboard",    label:"Dashboard",     icon:"\u229E",b:null},
    {id:"tasks",        label:"Tasks",          icon:"\u2713",b:3},
  ]},
  {s:"Core",       items:[
    {id:"entities",     label:"Entity Admin",  icon:"\uD83C\uDFE2",b:null},
    {id:"documents",    label:"Documents",     icon:"\uD83D\uDCC1",b:2},
    {id:"timesheets",   label:"Timesheets",    icon:"\u23F1",b:1},
    {id:"reporting",    label:"Reporting",     icon:"\uD83D\uDCC8",b:null},
    {id:"procedures",   label:"Procedures",    icon:"\u2699",b:null},
    {id:"generate",     label:"Generate doc",  icon:"\uD83D\uDCC4",b:null},
    {id:"client_portal",label:"Client portal", icon:"\uD83D\uDC64",b:null},
  ]},
  {s:"Compliance", items:[
    {id:"compliance",   label:"Compliance",     icon:"\uD83D\uDEE1",b:null},
    {id:"crm",          label:"CRM",           icon:"\uD83E\uDD1D",b:null},
  ]},
  {s:"Onboarding", items:[
    {id:"onboarding",   label:"Onboarding",    icon:"\u2705",b:1},
  ]},
  {s:"Internal Accounts", items:[
    {id:"acc_wip",   label:"WIP",            icon:"\u23F3",b:null},
    {id:"invoicing", label:"Invoicing",      icon:"\uD83D\uDCB7",b:null},
    {id:"budgeting", label:"Budgets",        icon:"\uD83D\uDCB0",b:null},
  ]},
  {s:"Affinity Accounting", items:[
    {id:"bookkeeping",  label:"Bookkeeping",     icon:"\uD83D\uDCCA",b:null},
    {id:"acc_txn",      label:"Transactions",    icon:"\uD83D\uDCD2",b:null},
    {id:"acc_assets",   label:"Assets & Groups", icon:"\uD83C\uDFE2",b:null},
    {id:"acc_report",   label:"Financial Reporting", icon:"\uD83D\uDCC8",b:null},
    {id:"acc_admin",    label:"Accounting admin",icon:"\u2699",b:null},
  ]},
  {s:"People", items:[
    {id:"intranet",     label:"Intranet",      icon:"\uD83C\uDFE0",b:null},
    {id:"chatbot",      label:"Assistant",     icon:"\uD83E\uDD16",b:null},
  ]},
  {s:"System",     items:[
    {id:"system",       label:"System admin",  icon:"\uD83D\uDD27",b:null},
  ]},
];

// Tasks module (inline)
const TASKS_DATA = [
  {id:1,title:"Harrington Trust — CPR overdue",           entity:"Harrington Family Trust",   assignee:"Roxy Sheeley",  due:"Today",      priority:"Critical",cat:"Compliance",  status:"Open"},
  {id:2,title:"Apex Growth Fund — sanctions MLRO review", entity:"Apex Growth Fund Ltd",      assignee:"Colette Grisdale", due:"Today",      priority:"Critical",cat:"Compliance",  status:"Open"},
  {id:3,title:"Emma Harrington — KYC expired",            entity:"Harrington Family Trust",   assignee:"Roxy Sheeley",  due:"Overdue",    priority:"Critical",cat:"KYC",         status:"Open"},
  {id:4,title:"Q3 retainer invoices — approve batch",     entity:"All entities",              assignee:"Neil Kelly",    due:"15/07/2025", priority:"High",    cat:"Invoicing",   status:"Open"},
  {id:5,title:"Sarah Cole — missing timesheet",           entity:"—",                         assignee:"Roxy Sheeley",  due:"Today",      priority:"High",    cat:"Timesheets",  status:"Open"},
  {id:6,title:"North Star — sign off attrition form",     entity:"North Star Holdings Ltd",   assignee:"Andy Morgan",   due:"15/07/2025", priority:"High",    cat:"Onboarding",  status:"Open"},
  {id:7,title:"Pacific Wealth Trust — EDD outstanding",   entity:"Pacific Wealth Trust",      assignee:"Garry Crossan", due:"18/07/2025", priority:"High",    cat:"Compliance",  status:"In progress"},
  {id:8,title:"Meridian Holdings — annual return prep",   entity:"Meridian Holdings Ltd",     assignee:"Roxy Sheeley",  due:"12/09/2025", priority:"Medium",  cat:"Statutory",   status:"Open"},
  {id:9,title:"Stonebridge — director appointment res",   entity:"Stonebridge Capital Ltd",   assignee:"Joanne Fenech", due:"18/07/2025", priority:"Medium",  cat:"Corporate",   status:"In progress"},
  {id:10,title:"Garry Crossan — enforce MFA",             entity:"—",                         assignee:"Andy Morgan",   due:"14/07/2025", priority:"Medium",  cat:"System",      status:"Open"},
  {id:11,title:"Azure Mediterranean — Q2 accounts",       entity:"Azure Mediterranean Fdn",   assignee:"Joanne Fenech", due:"30/09/2025", priority:"Low",     cat:"Accounts",    status:"Open"},
  {id:12,title:"Bluewater Family Trust — CPR due Q3",     entity:"Bluewater Family Trust",    assignee:"Garry Crossan", due:"19/09/2025", priority:"Low",     cat:"Compliance",  status:"Open"},
];

const pC={Critical:{bg:"#FCEBEB",color:"#A32D2D"},High:{bg:"#FAEEDA",color:"#633806"},Medium:{bg:"#E6F7FB",color:"#0077A8"},Low:{bg:"#F1EFE8",color:"#888"}};
const sC={Open:{bg:"#E6F7FB",color:"#0077A8"},"In progress":{bg:"#FAEEDA",color:"#633806"},Complete:{bg:"#EAF3DE",color:"#27500A"}};
const cC={Compliance:{bg:"#FBEAF0",color:"#72243E"},KYC:{bg:"#FCEBEB",color:"#A32D2D"},Invoicing:{bg:"#EAF3DE",color:"#27500A"},Timesheets:{bg:"#E6F7FB",color:"#0077A8"},Onboarding:{bg:"#E6F1FB",color:"#0C447C"},Corporate:{bg:"#EEF0FB",color:"#3C3489"},Statutory:{bg:"#FAEEDA",color:"#633806"},System:{bg:"#F1EFE8",color:"#888"},Accounts:{bg:"#EAF3DE",color:"#27500A"}};
const Bx = ({label,colors}) => <span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:colors?.bg||"#eee",color:colors?.color||"#333",whiteSpace:"nowrap"}}>{label}</span>;

function Tasks(){
  const [tasks,setTasks]=useState(TASKS_DATA);
  const [filter,setFilter]=useState("All");
  const [ass,setAss]=useState("");
  const [modal,setModal]=useState(false);
  const [sel,setSel]=useState(null);
  const filtered=tasks.filter(t=>(filter==="All"||t.status===filter)&&(!ass||t.assignee===ass));
  const selT=sel?tasks.find(t=>t.id===sel):null;
  const done=id=>setTasks(p=>p.map(t=>t.id===id?{...t,status:"Complete"}:t));
  const th={padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.4px",borderBottom:"0.5px solid #e5e5e5",background:"#f9f9f9",whiteSpace:"nowrap"};
  const td={padding:"9px 12px",fontSize:11,borderBottom:"0.5px solid #e5e5e5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};
  return <div style={{padding:18}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Total open",v:tasks.filter(t=>t.status!=="Complete").length,c:CY},{l:"In progress",v:tasks.filter(t=>t.status==="In progress").length,c:CY},{l:"Completed",v:tasks.filter(t=>t.status==="Complete").length,c:"#4CAF7D"}].map(k=><div key={k.l} style={{background:"#f9f9f9",borderRadius:6,padding:"10px 14px"}}><div style={{fontSize:10,color:"#666",marginBottom:3}}>{k.l}</div><div style={{fontSize:20,fontWeight:600,color:k.c||"#111"}}>{k.v}</div></div>)}
    </div>
    <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
        {["All","Open","In progress","Complete"].map(f=><button key={f} style={{padding:"4px 10px",fontSize:11,borderRadius:20,border:`0.5px solid ${filter===f?"#ccc":"#e5e5e5"}`,background:filter===f?"#fff":"transparent",color:filter===f?"#111":"#666",cursor:"pointer",fontWeight:filter===f?500:400}} onClick={()=>setFilter(f)}>{f}</button>)}
      </div>
      <select style={{height:30,padding:"0 8px",fontSize:11,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",color:"#111",marginLeft:"auto"}} value={ass} onChange={e=>setAss(e.target.value)}>
        <option value="">All team members</option>
        {[...new Set(TASKS_DATA.map(t=>t.assignee))].map(a=><option key={a}>{a}</option>)}
      </select>
      <button onClick={()=>setModal(true)} style={{padding:"5px 14px",borderRadius:5,border:"none",background:CY,color:"#fff",fontSize:11,cursor:"pointer",fontWeight:500}}>+ New task</button>
    </div>
    <div style={{display:"flex"}}>
      <table style={{flex:1,borderCollapse:"collapse",tableLayout:"fixed"}}>
        <thead><tr>
          <th style={{...th,width:"4%"}}></th>
          <th style={{...th,width:"32%"}}>Task</th>
          <th style={{...th,width:"20%"}}>Entity</th>
          <th style={{...th,width:"12%"}}>Assignee</th>
          <th style={{...th,width:"11%"}}>Due</th>
          <th style={{...th,width:"11%"}}>Category</th>
          <th style={{...th,width:"10%"}}>Status</th>
        </tr></thead>
        <tbody>
          {filtered.map(t=><tr key={t.id} onClick={()=>setSel(sel===t.id?null:t.id)} style={{cursor:"pointer",borderBottom:"0.5px solid #e5e5e5",background:sel===t.id?"#f9f9f9":"transparent",opacity:t.status==="Complete"?0.55:1}}>
            <td style={{...td,textAlign:"center"}}><input type="checkbox" checked={t.status==="Complete"} onChange={()=>done(t.id)} onClick={e=>e.stopPropagation()} style={{cursor:"pointer",width:14,height:14}}/></td>
            <td style={{...td,fontWeight:t.status==="Complete"?400:500,textDecoration:t.status==="Complete"?"line-through":"none"}}>{t.title}</td>
            <td style={{...td,color:"#666"}}>{t.entity}</td>
            <td style={{...td,color:"#666"}}>{t.assignee.split(" ").map((w,i)=>i===0?w:w[0]+".").join(" ")}</td>
            <td style={{...td,color:t.due==="Overdue"||t.due==="Today"?"#EF4444":"#666",fontWeight:t.due==="Overdue"||t.due==="Today"?600:400}}>{t.due}</td>
            <td style={td}><Bx label={t.cat} colors={cC[t.cat]||{bg:"#eee",color:"#666"}}/></td>
            <td style={td}><Bx label={t.status} colors={sC[t.status]}/></td>
          </tr>)}
          {filtered.length===0&&<tr><td colSpan={7} style={{...td,textAlign:"center",color:"#aaa",padding:30}}>No tasks match this filter</td></tr>}
        </tbody>
      </table>
      {selT&&<div style={{width:260,minWidth:260,borderLeft:"0.5px solid #e5e5e5",padding:14,overflowY:"auto"}}>
        <button onClick={()=>setSel(null)} style={{float:"right",background:"none",border:"none",cursor:"pointer",color:"#aaa",fontSize:14}}>✕</button>
        <div style={{fontSize:13,fontWeight:600,lineHeight:1.4,marginBottom:10}}>{selT.title}</div>
        {[["Entity",selT.entity],["Assignee",selT.assignee],["Due",selT.due],["Category",selT.cat],["Status",selT.status]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}><span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500}}>{v}</span></div>)}
        <div style={{marginTop:12}}><div style={{fontSize:10,color:"#aaa",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.4px"}}>Notes</div><textarea style={{width:"100%",height:80,fontSize:11,borderRadius:5,border:"0.5px solid #ccc",padding:"6px 8px",resize:"none",background:"#f9f9f9",color:"#111"}} placeholder="Add notes..."/></div>
        <div style={{display:"flex",gap:6,marginTop:10}}>
          {selT.status!=="Complete"&&<button onClick={()=>{done(selT.id);setSel(null);}} style={{flex:1,padding:"6px",borderRadius:5,border:"none",background:"#4CAF7D",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:500}}>Mark complete ✓</button>}
          <button style={{flex:1,padding:"6px",borderRadius:5,border:"0.5px solid #ccc",background:"transparent",color:"#111",fontSize:11,cursor:"pointer"}}>Edit</button>
        </div>
      </div>}
    </div>
    {modal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(13,27,42,0.5)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:40,zIndex:200}} onClick={e=>e.target===e.currentTarget&&setModal(false)}>
      <div style={{background:"#fff",borderRadius:10,border:"0.5px solid #e5e5e5",padding:22,width:500,maxWidth:"96vw"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><div style={{fontSize:14,fontWeight:600}}>New task</div><button onClick={()=>setModal(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#aaa"}}>✕</button></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[["Task title","text","Description of task",true],["Entity","text","Entity name or —"],["Assignee","select","",false,["Andy Morgan","Roxy Sheeley","Garry Crossan","Joanne Fenech","Neil Kelly","Colette Grisdale","Sarah Cole"]],["Due date","text","DD/MM/YYYY"],["Category","select","",false,["Compliance","KYC","Invoicing","Timesheets","Onboarding","Corporate","Statutory","System","Accounts","Other"]],["Status","select","",false,["Open","In progress"]]].map(([l,t,ph,full,opts])=><div key={l} style={{display:"flex",flexDirection:"column",gap:3,gridColumn:full?"1/-1":"auto"}}>
            <label style={{fontSize:11,color:"#666"}}>{l}</label>
            {t==="select"?<select style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",padding:"0 8px",height:32,color:"#111"}}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>:<input type={t} style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",padding:"0 8px",height:32,background:"#fff",color:"#111"}} placeholder={ph}/>}
          </div>)}
          <div style={{display:"flex",flexDirection:"column",gap:3,gridColumn:"1/-1"}}><label style={{fontSize:11,color:"#666"}}>Notes</label><textarea style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",padding:"6px 8px",height:52,resize:"none",background:"#fff"}} placeholder="Additional context"/></div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
          <button onClick={()=>setModal(false)} style={{padding:"5px 14px",borderRadius:5,border:"0.5px solid #ccc",background:"transparent",color:"#111",fontSize:11,cursor:"pointer"}}>Cancel</button>
          <button onClick={()=>setModal(false)} style={{padding:"5px 14px",borderRadius:5,border:"none",background:CY,color:"#fff",fontSize:11,cursor:"pointer",fontWeight:500}}>Create task</button>
        </div>
      </div>
    </div>}
  </div>;
}

function SplashScreen({ onDone }) {
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setFade(true), 3200);
    const t2 = setTimeout(() => onDone(), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div style={{
      position:"fixed", inset:0, background:NAVY,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      zIndex:999, opacity:fade?0:1, transition:"opacity 0.6s ease", fontFamily:"'Catamaran',system-ui,sans-serif"
    }}>
      {/* Logo */}
      <div style={{ marginBottom:32, textAlign:"center" }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:"0.35em", justifyContent:"center", width:"100%" }}>
          <img src={AFFINITY_LOGO} alt="Affinity" style={{ height:"clamp(56px, 11vw, 96px)", display:"block" }} />
          <span style={{ fontFamily:"'Catamaran', system-ui, sans-serif", fontSize:"clamp(48px, 9.5vw, 84px)", fontWeight:300, color:"#fff", letterSpacing:"-1px", lineHeight:1 }}>Core</span>
        </div>
        <div style={{ fontSize:12, color:"#fff", textTransform:"uppercase", letterSpacing:"3px", marginTop:20 }}>
          Made by Affinity, for Affinity
        </div>
      </div>

      {/* Divider */}
      <div style={{ width:48, height:1, background:"rgba(0,180,216,0.4)", marginBottom:32 }} />

      {/* Jurisdictions */}
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center", maxWidth:420, marginBottom:40 }}>
        {[
          { flag:"🇮🇲", name:"Isle of Man" },
          { flag:"🇲🇹", name:"Malta" },
          { flag:"🇰🇾", name:"Cayman Islands" },
          { flag:"🇬🇧", name:"United Kingdom" },
          { flag:"🇺🇸", name:"Miami" },
          { flag:"🇨🇾", name:"Cyprus" },
        ].map(j => (
          <div key={j.name} style={{
            display:"flex", alignItems:"center", gap:7,
            background:"rgba(255,255,255,0.06)", border:"0.5px solid rgba(255,255,255,0.1)",
            borderRadius:30, padding:"7px 14px"
          }}>
            <span style={{ fontSize:16 }}>{j.flag}</span>
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.7)", fontWeight:400 }}>{j.name}</span>
          </div>
        ))}
      </div>

      {/* Tagline */}
      <div style={{ fontSize:11, color:"rgba(255,255,255,0.2)", letterSpacing:"1px", textTransform:"uppercase" }}>
        Corporate &amp; Trust Services
      </div>

      {/* Loading bar */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, background:"rgba(255,255,255,0.05)" }}>
        <div style={{ height:"100%", background:CY, width:"100%", transformOrigin:"left", animation:"grow 3.2s ease forwards" }} />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Catamaran:wght@300;400;500;600;700&display=swap');
        * { font-family: 'Catamaran', system-ui, sans-serif !important; }
        @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          [data-sidebar] { display: none !important; }
          [data-topbar] { display: none !important; }
          [data-content] { margin: 0 !important; padding: 20px !important; }
        }
      `}</style>
    </div>
  );
}

// ── Global search index ───────────────────────────────────────
const SEARCH_INDEX = [
  // ─── Entities ─────────────────────────────────────────────
  {type:"Entity",  label:"Meridian Holdings Ltd",          sub:"IOM · Company · Medium risk",     mod:"entities"},
  {type:"Entity",  label:"Harrington Family Trust",        sub:"IOM · Trust · High risk",         mod:"entities"},
  {type:"Entity",  label:"Caledonian Ventures Ltd",        sub:"Cayman · Company · Medium risk",  mod:"entities"},
  {type:"Entity",  label:"Apex Growth Fund Ltd",           sub:"Cayman · Fund · Very High risk",  mod:"entities"},
  {type:"Entity",  label:"Pacific Wealth Trust",           sub:"Cayman · Trust · High risk",      mod:"entities"},
  {type:"Entity",  label:"Stonebridge Capital Ltd",        sub:"Malta · Company · Low risk",      mod:"entities"},
  {type:"Entity",  label:"Azure Mediterranean Foundation", sub:"Malta · Foundation · Low risk",   mod:"entities"},
  {type:"Entity",  label:"Rosewood Legacy Trust",          sub:"IOM · Trust · Medium risk",       mod:"entities"},
  {type:"Entity",  label:"North Star Holdings Ltd",        sub:"IOM · Company · High risk",       mod:"entities"},
  {type:"Entity",  label:"Verona Digital Holdings Ltd",    sub:"Malta · Company · Medium risk",   mod:"entities"},
  {type:"Entity",  label:"Silverstone Capital Fund",       sub:"Cayman · Fund · High risk",       mod:"entities"},
  {type:"Entity",  label:"Adriatic Holdings Ltd",          sub:"Malta · Company · Low risk",      mod:"entities"},
  {type:"Entity",  label:"Bluewater Family Trust",         sub:"USA · Trust · Medium risk",       mod:"entities"},
  {type:"Entity",  label:"Thornbury Asset Co Ltd",         sub:"UK · Company · Low risk",         mod:"entities"},

  // ─── Prospects (CRM) ──────────────────────────────────────
  {type:"Prospect",label:"Emma Harrington",                sub:"Initial Call · IOM · £18k/yr",    mod:"crm"},
  {type:"Prospect",label:"David Silver — Silverstone",     sub:"Proposal Sent · Cayman · £24k/yr",mod:"crm"},
  {type:"Prospect",label:"Sofia Adriatic",                 sub:"KYC Approved · Malta · £14k/yr",  mod:"crm"},
  {type:"Prospect",label:"Andrew Thornbury",               sub:"Fees Paid · UK · £9k/yr",         mod:"crm"},
  {type:"Prospect",label:"Kostas Papadopoulos",            sub:"Initial Call · Cayman · £22k/yr", mod:"crm"},
  {type:"Prospect",label:"Verona Digital — MFSA",          sub:"KYC Arriving · Malta · £30k/yr",  mod:"crm"},
  {type:"Prospect",label:"Apex Growth — Mike Apex",        sub:"Proposal Accepted · Cayman · £40k/yr", mod:"crm"},
  {type:"Prospect",label:"Bluewater — Lisa Reston",        sub:"Initial Call · USA · £16k/yr",    mod:"crm"},

  // ─── People (staff) ───────────────────────────────────────
  {type:"Person",  label:"Andrew Morgan",                  sub:"CEO · USA · Super Admin",         mod:"intranet"},
  {type:"Person",  label:"Alexandra Gardner",              sub:"COO · USA · Super Admin",         mod:"intranet"},
  {type:"Person",  label:"Colette Grisdale",                  sub:"COO · Isle of Man",               mod:"intranet"},
  {type:"Person",  label:"Roxy Sheeley",                   sub:"Managing Director · IOM",         mod:"intranet"},
  {type:"Person",  label:"Joanne Fenech",                  sub:"Managing Director · Malta",       mod:"intranet"},
  {type:"Person",  label:"Michael Barlow",                 sub:"Compliance Manager · IOM",        mod:"intranet"},
  {type:"Person",  label:"Colin Quayle",                   sub:"Director & Company Sec · IOM",    mod:"intranet"},
  {type:"Person",  label:"Mattei Pisani",                  sub:"Director (Malta) · IOM",          mod:"intranet"},
  {type:"Person",  label:"Neil Kelly",                     sub:"CFO · USA",                       mod:"intranet"},
  {type:"Person",  label:"Natalie Johnson",                sub:"Asst Compliance Admin · USA",     mod:"intranet"},
  {type:"Person",  label:"Elena Pace",                     sub:"Manager · IOM",                   mod:"intranet"},
  {type:"Person",  label:"Kate Shaw",                      sub:"Manager · IOM",                   mod:"intranet"},
  {type:"Person",  label:"Debbie Gooding",                 sub:"Manager · IOM",                   mod:"intranet"},
  {type:"Person",  label:"Shanya Pickett",                 sub:"Assistant Manager · IOM",         mod:"intranet"},
  {type:"Person",  label:"Krista Fenech",                  sub:"Client Administrator · Malta",    mod:"intranet"},
  {type:"Person",  label:"Gilbert Spiteri Spadaro",        sub:"Compliance Officer · Malta",      mod:"intranet"},

  // ─── Tasks / actions ──────────────────────────────────────
  {type:"Task",    label:"My open tasks",                  sub:"View tasks assigned to you",      mod:"tasks"},
  {type:"Task",    label:"Tasks awaiting approval",        sub:"Items needing super-admin sign-off", mod:"tasks"},
  {type:"Task",    label:"Annual returns due",             sub:"Filings due in the next 30 days", mod:"compliance"},
  {type:"Task",    label:"KYC reviews due",                sub:"Periodic CDD refresh required",   mod:"compliance"},
  {type:"Task",    label:"Director resolutions to sign",   sub:"Pending board approvals",         mod:"tasks"},
  {type:"Task",    label:"Pending invoices",               sub:"Drafted but not yet sent",        mod:"invoicing"},

  // ─── Documents / templates ────────────────────────────────
  {type:"Document",label:"Recently filed emails",          sub:"Email correspondence",            mod:"documents"},
  {type:"Document",label:"Expiring / expired documents",   sub:"Action required",                 mod:"documents"},
  {type:"Document",label:"Pending approvals",              sub:"Docs waiting on sign-off",        mod:"documents"},
  {type:"Document",label:"Generate AGM minutes",           sub:"Template",                        mod:"generate"},
  {type:"Document",label:"Generate director resolution",   sub:"Template",                        mod:"generate"},
  {type:"Document",label:"Generate engagement letter",     sub:"Template",                        mod:"generate"},
  {type:"Document",label:"Generate FATCA / CRS form",      sub:"Template",                        mod:"generate"},

  // ─── Compliance / regulatory ──────────────────────────────
  {type:"Section", label:"FATCA register",                 sub:"Reportable accounts",             mod:"entities"},
  {type:"Section", label:"CRS register",                   sub:"Common Reporting Standard",       mod:"entities"},
  {type:"Section", label:"Substance returns",              sub:"Economic substance filings",      mod:"entities"},
  {type:"Section", label:"eGaming / GSC register",        sub:"Gaming licence holders",          mod:"entities"},
  {type:"Section", label:"Compliance dashboard",           sub:"Firm-wide compliance KPIs",       mod:"compliance"},
  {type:"Section", label:"Statutory registers",            sub:"Generate registers PDF",          mod:"statutory_registers"},

  // ─── Modules ──────────────────────────────────────────────
  {type:"Module",  label:"Dashboard",                      sub:"Overview & tasks",                mod:"dashboard"},
  {type:"Module",  label:"Tasks",                          sub:"Action items",                    mod:"tasks"},
  {type:"Module",  label:"Notifications",                  sub:"Activity feed — inside Tasks",    mod:"notifications"},
  {type:"Module",  label:"Client portal",                  sub:"Preview client-facing portal",    mod:"client_portal"},
  {type:"Module",  label:"Audit log",                      sub:"Activity & compliance trail",     mod:"audit"},
  {type:"Module",  label:"Entity Admin",                   sub:"Manage entity records",           mod:"entities"},
  {type:"Module",  label:"CRM",                            sub:"Pipeline & prospects",            mod:"crm"},
  {type:"Module",  label:"Documents",                      sub:"DMS & file management",           mod:"documents"},
  {type:"Module",  label:"Onboarding",                     sub:"New business & KYC",              mod:"onboarding"},
  {type:"Module",  label:"Timesheets",                     sub:"Time recording",                  mod:"timesheets"},
  {type:"Module",  label:"Invoicing",                      sub:"Billing & debtors",               mod:"invoicing"},
  {type:"Module",  label:"Bookkeeping",                    sub:"Ledger & accounts",               mod:"bookkeeping"},
  {type:"Module",  label:"Budgets",                         sub:"Budgets & scenarios",             mod:"budgeting"},
  {type:"Module",  label:"Reporting",                       sub:"MI & financial statements",       mod:"reporting"},
  {type:"Module",  label:"Procedures",                     sub:"Process library",                 mod:"procedures"},
  {type:"Module",  label:"Generate Document",              sub:"Templates & statutory forms",     mod:"generate"},
  {type:"Module",  label:"Compliance",                     sub:"Compliance register",             mod:"compliance"},
  {type:"Module",  label:"Intranet",                       sub:"Team, news & resources",          mod:"intranet"},
  {type:"Module",  label:"System Admin",                   sub:"Users, roles & settings",         mod:"system_admin"},
];

const SHORTCUTS = [
  {key:"d", label:"Dashboard",  mod:"dashboard"},
  {key:"e", label:"Entities",   mod:"entities"},
  {key:"t", label:"Timesheets", mod:"timesheets"},
  {key:"i", label:"Invoicing",  mod:"invoicing"},
  {key:"r", label:"Reporting", mod:"reporting"},
  {key:"s", label:"Search",     mod:null},
];

class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={err:null,info:null}; }
  static getDerivedStateFromError(err){ return {err}; }
  componentDidCatch(err, info){ this.setState({info}); console.error("Affinity Core error boundary:", err, info); }
  render(){
    if (this.state.err) {
      return (
        <div style={{padding:24,fontFamily:"system-ui,sans-serif"}}>
          <div style={{background:"#FCEBEB",border:"1px solid #A32D2D",borderRadius:8,padding:18,marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700,color:"#A32D2D",marginBottom:6}}>Something went wrong rendering this page</div>
            <div style={{fontSize:12,color:"#666",lineHeight:1.6}}>This is a beta build — please screenshot this message and send it to Andy / Alex. Click 'Try again' or refresh.</div>
          </div>
          <div style={{background:"#fafafa",border:"0.5px solid #e5e5e5",borderRadius:6,padding:12,fontSize:11,fontFamily:"ui-monospace,monospace",whiteSpace:"pre-wrap",color:"#333",maxHeight:300,overflow:"auto"}}>
            {String(this.state.err && this.state.err.message ? this.state.err.message : this.state.err)}
            {this.state.info && this.state.info.componentStack ? "\n\n" + this.state.info.componentStack.slice(0,600) : ""}
          </div>
          <button onClick={()=>this.setState({err:null,info:null})} style={{marginTop:12,padding:"8px 14px",border:"none",borderRadius:6,background:"#00C4CC",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AffinityCore(){
  const [loggedIn, setLoggedIn] = useState(false);
  const [splash, setSplash] = useState(true);
  const [mod,setMod]=useState("dashboard");
  const [uid,setUid]=useState(1);
  const [uOpen,setU]=useState(false);
  const [mobile,setMobile]=useState(window.innerWidth<768);
  const [dark,setDark]=useState(false);
  const [officeFilter,setOfficeFilter]=useState("All");
  const [searchOpen,setSearchOpen]=useState(false);
  const [notifOpen,setNotifOpen]=useState(false);
  const [notifReadIds,setNotifReadIds]=useState({});
  // Load notification read state from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("affinity-core-notifications-read");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setNotifReadIds(parsed);
      }
    } catch (e) {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("affinity-core-notifications-read", JSON.stringify(notifReadIds)); } catch (e) {}
  }, [notifReadIds]);
  const unreadNotifs = NOTIFICATIONS_DATA.filter(n => !notifReadIds[n.id]).length;
  const [searchQ,setSearchQ]=useState("");
  const [shortcutsOpen,setShortcutsOpen]=useState(false);
  const [officeOpen,setOfficeOpen]=useState(false);
  const user=USERS.find(u=>u.id===uid)||USERS[0];
  const rbacRole=deriveRbacRole(user.role);
  const navLabel=NAV.flatMap(s=>s.items).find(i=>i.id===mod)?.label||mod;

  const searchResults = searchQ.length > 1
    ? SEARCH_INDEX.filter(r =>
        r.label.toLowerCase().includes(searchQ.toLowerCase()) ||
        r.sub.toLowerCase().includes(searchQ.toLowerCase())
      ).slice(0, 8)
    : SEARCH_INDEX.filter(r => r.type === "Module").slice(0, 6);

  // Track screen size
  useState(()=>{
    const handleResize=()=>setMobile(window.innerWidth<768);
    window.addEventListener("resize",handleResize);
    return ()=>window.removeEventListener("resize",handleResize);
  });

  // Keyboard shortcuts — G+key
  useState(()=>{
    let gPressed = false;
    let timer = null;
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "Escape") { setSearchOpen(false); setShortcutsOpen(false); setNotifOpen(false); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); return; }
      if (e.key === "g" || e.key === "G") { gPressed = true; timer = setTimeout(() => { gPressed = false; }, 1000); return; }
      if (gPressed) {
        const sc = SHORTCUTS.find(s => s.key === e.key.toLowerCase());
        if (sc) {
          if (sc.mod === null) { setSearchOpen(true); }
          else { setMod(sc.mod); setSideOpen(false); }
          gPressed = false;
          clearTimeout(timer);
        }
        if (e.key === "?") { setShortcutsOpen(p => !p); gPressed = false; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Dark mode CSS vars (kept for future)
  const dm = {};

  // Office filter — badge colors
  const officeColors = {
    "All":            { bg:"#E8E8F0", color:"#333" },
    "Isle of Man":    { bg:"#E6F7FB", color:"#0077A8" },
    "Malta":          { bg:"#EEF0FB", color:"#3C3489" },
    "Cayman Islands": { bg:"#E6EEF7", color:"#0D4A7A" },
    "United Kingdom": { bg:"#EAF3DE", color:"#27500A" },
    "Miami":          { bg:"#FBEAF0", color:"#72243E" },
    "Cyprus":         { bg:"#F3E5F5", color:"#6A1B9A" },
  };
  const offC2 = officeColors[officeFilter] || officeColors["All"];

  const content=()=>{
    if (mod && !canAccessModule(rbacRole, mod)) return <div style={{padding:28,color:"#5B6B7B",fontSize:14}}>You don’t have access to this module. Contact a System Admin if you need it.</div>;
    if (mod && mod.slice(0,4) === "acc_") return <Accounting module={mod}/>;
    switch(mod){
      case "dashboard":    return <Dashboard userId={uid} onNav={setMod} officeFilter={officeFilter} userName={user?.name||""}/>;
      case "tasks":        return <Tasks onNav={setMod}/>;
      case "feedback":     return <Feedback userName={user?.name||""} isSuperAdmin={!!(user&&user.role&&user.role.indexOf("Super Admin")>-1)}/>;
      case "audit":        return <AuditLog userName={user?.name||""} isSuperAdmin={!!(user&&user.role&&user.role.indexOf("Super Admin")>-1)}/>;
      case "notifications":return <Tasks onNav={setMod} initialView="activity"/>;  // merged into Tasks
      case "client_portal": return <ClientPortal/>;
      case "entities":     return <EntityAdmin officeFilter={officeFilter} onNav={setMod}/>;
      case "compliance":   return <Compliance/>;
      case "statutory":    return <Statutory/>;
      case "crm":          return <CRM/>;
      case "documents":    return <Documents/>;
      case "onboarding":   return <Onboarding onNav={setMod}/>;
      case "attrition":    return <Onboarding initialView="attrition" onNav={setMod}/>;
      case "timesheets":   return <Timesheets officeFilter={officeFilter} onNav={setMod}/>;
      case "invoicing":    return <Invoicing onNav={setMod}/>;
      case "bookkeeping":  return <Bookkeeping onNav={setMod}/>;
      case "budgeting":    return <Budgeting/>;
      case "reporting":    return <Reporting onNav={setMod}/>;
      case "procedures":   return <Procedures/>;
      case "chatbot":      return <Chatbot/>;
      case "intranet":     return <Intranet/>;
      case "system":       return <SystemAdmin onNav={setMod}/>;
      case "generate":     return <GenerateDoc/>;
      case "egaming":      return <EGaming/>;
      default:             return <Dashboard userId={uid} onNav={setMod} userName={user?.name||""}/>;
    }
  };

  const [sideOpen, setSideOpen] = useState(false);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const navTo = (id) => { setMod(id); setSideOpen(false); };

  if (!loggedIn) return <AffinityLoginPage onLogin={(id)=>{ setUid(id); setLoggedIn(true); setSplash(false); }}/>;
  if (splash) return <SplashScreen onDone={() => setSplash(false)} />;

  return <div style={{display:"flex",height:"100vh",fontFamily:"'Catamaran',system-ui,sans-serif",overflow:"hidden",position:"relative",background:dark?"#1a1a2e":"#fff",...dm}} onClick={()=>{if(uOpen)setU(false);setSearchOpen(false);setNotifOpen(false);}}>

    {/* Mobile overlay */}
    {sideOpen && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:40}} onClick={()=>setSideOpen(false)}/>}
    <div data-sidebar style={{width:208,minWidth:208,background:NAVY,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0,position:"fixed",top:0,left:0,bottom:0,zIndex:50,transform:mobile?(sideOpen?"translateX(0)":"translateX(-100%)"):"translateX(0)",transition:"transform 0.25s ease"}}>
      <div style={{padding:"14px 14px 10px",borderBottom:"0.5px solid rgba(255,255,255,0.08)"}}>
        <div style={{fontSize:18,fontWeight:500,color:CY}}>Affinity <span style={{color:"#fff",fontWeight:300}}>Core</span></div>
        <div style={{fontSize:9,color:"#fff",textTransform:"uppercase",letterSpacing:"1px",marginTop:2,opacity:0.8}}>Made by Affinity, for Affinity</div>
      </div>
      <div style={{flex:1,overflowY:"auto",paddingBottom:6}}>
        {NAV.map(sec=>{
          const items=sec.items.filter(item=>canAccessModule(rbacRole,item.id));
          if(items.length===0) return null;
          return <div key={sec.s}>
          <div style={{fontSize:9,fontWeight:500,color:"#fff",opacity:0.7,textTransform:"uppercase",letterSpacing:"1px",padding:"10px 14px 4px"}}>{sec.s}</div>
          {items.map(item=><div key={item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",cursor:"pointer",borderRadius:5,margin:"1px 6px",background:mod===item.id?"rgba(0,180,216,0.18)":"transparent",color:"#fff",opacity:mod===item.id?1:0.85,fontSize:12,fontWeight:mod===item.id?500:400}} onClick={()=>navTo(item.id)}>
            <span style={{fontSize:13}}>{item.icon}</span>
            <span>{item.label}</span>
            {item.b&&<span style={{background:"#EF4444",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700,marginLeft:"auto"}}>{item.b}</span>}
          </div>)}
        </div>;})}
      </div>
      <div style={{padding:"10px 14px",borderTop:"0.5px solid rgba(255,255,255,0.08)",position:"relative"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={e=>{e.stopPropagation();setU(!uOpen);}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:user.c,color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{user.av}</div>
          <div><div style={{fontSize:11,fontWeight:500,color:"#fff",display:"flex",alignItems:"center",gap:5}}>{user.name}<span style={{fontSize:13}}>{user.flag}</span></div><div style={{fontSize:10,color:"#fff",opacity:0.75}}>{user.role}</div></div>
          <span style={{marginLeft:"auto",color:"#fff",opacity:0.6,fontSize:10}}>▲</span>
        </div>
        {uOpen&&<div style={{position:"absolute",bottom:58,left:8,right:8,background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,zIndex:100,overflow:"hidden",boxShadow:"0 4px 16px rgba(0,0,0,0.15)",maxHeight:"70vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
          <div style={{padding:"8px 12px",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"0.5px solid #e5e5e5",flexShrink:0}}>Switch user</div>
          <div style={{overflowY:"auto",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",padding:"4px 0"}} onTouchMove={e=>e.stopPropagation()}>
            {USERS.map(u=><div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",cursor:"pointer",background:uid===u.id?"#f5f5f5":"transparent",minWidth:0}} onClick={()=>{setUid(u.id);setU(false);}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:u.c,color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{u.av}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:uid===u.id?600:500,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.name}<span style={{fontSize:13,flexShrink:0}}>{u.flag}</span></div>
                <div style={{fontSize:10,color:"#999",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.role}</div>
              </div>
              {uid===u.id&&<span style={{color:CY,fontWeight:700,flexShrink:0}}>✓</span>}
            </div>)}
          </div>
        </div>}
      </div>
    </div>
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",marginLeft:mobile?0:208,transition:"margin 0.25s ease"}}>
      <div data-topbar style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:48,borderBottom:"0.5px solid #e5e5e5",flexShrink:0,background:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* Hamburger — mobile only */}
          <button onClick={e=>{e.stopPropagation();setSideOpen(!sideOpen);}} style={{display:mobile?"flex":"none",alignItems:"center",justifyContent:"center",width:36,height:36,borderRadius:6,border:"0.5px solid #e5e5e5",background:"transparent",cursor:"pointer",fontSize:18,flexShrink:0}}>☰</button>
          {mobile&&<div style={{fontSize:16,fontWeight:500,color:CY}}>Affinity <span style={{color:"#111",fontWeight:300}}>Core</span></div>}
          {!mobile&&<div style={{fontSize:14,fontWeight:500}}>{navLabel}</div>}
          <span style={{display:mobile?"none":"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:offC[user.office]?.bg||"#eee",color:offC[user.office]?.color||"#666"}}>{user.office}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,position:"relative"}}>
          {/* Notifications bell */}
          <div style={{position:"relative"}}>
            <button onClick={e=>{e.stopPropagation();setNotifOpen(o=>!o);setSearchOpen(false);}}
              style={{display:"flex",alignItems:"center",justifyContent:"center",height:32,width:32,borderRadius:6,border:"0.5px solid #e5e5e5",background:dark?"#252540":"#f9f9f9",cursor:"pointer",position:"relative"}}
              title="Notifications">
              <span style={{fontSize:14,color:dark?"#e8e8f0":"#666"}}>🔔</span>
              {unreadNotifs>0&&<span style={{position:"absolute",top:-3,right:-3,minWidth:16,height:16,borderRadius:8,background:"#A32D2D",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",border:"1.5px solid #fff"}}>{unreadNotifs>9?"9+":unreadNotifs}</span>}
            </button>
            {notifOpen && <NotificationsPanel
              readIds={notifReadIds}
              setReadIds={setNotifReadIds}
              onNavigate={(id)=>{setMod(id);setSideOpen(false);}}
              onClose={()=>setNotifOpen(false)} />}
          </div>
          {/* Search bar / button */}
          <button onClick={e=>{e.stopPropagation();setSearchOpen(true);}} style={{display:"flex",alignItems:"center",gap:8,height:32,padding:"0 12px",borderRadius:6,border:"0.5px solid #e5e5e5",background:dark?"#252540":"#f9f9f9",cursor:"pointer",color:"#999",fontSize:11,whiteSpace:"nowrap"}}>
            🔍 {!mobile&&<span>Search <span style={{color:"#ccc",fontSize:10}}>⌘K</span></span>}
          </button>
          {/* Office filter dropdown — top right */}
          {!mobile&&<div style={{position:"relative"}}>
            <button onClick={e=>{e.stopPropagation();setOfficeOpen(o=>!o);}}
              style={{display:"flex",alignItems:"center",gap:6,height:32,padding:"0 10px",borderRadius:6,border:`1px solid ${officeFilter==="All"?"#e5e5e5":(officeColors[officeFilter]?.color||CY)}`,background:officeFilter==="All"?"#fff":(officeColors[officeFilter]?.bg||"rgba(0,180,216,0.1)"),fontSize:11,fontWeight:600,color:officeFilter==="All"?"#666":(officeColors[officeFilter]?.color||CY),cursor:"pointer",whiteSpace:"nowrap"}}>
              <span style={{fontSize:13}}>{({"Isle of Man":"🇮🇲","Malta":"🇲🇹","Cayman Islands":"🇰🇾","United Kingdom":"🇬🇧","Miami":"🇺🇸","Cyprus":"🇨🇾","All":"🌍"})[officeFilter]}</span>
              <span>{officeFilter==="All"?"All offices":officeFilter}</span>
              <span style={{opacity:0.5,fontSize:9,marginLeft:2}}>▼</span>
            </button>
            {officeOpen&&<div style={{position:"absolute",top:38,right:0,minWidth:200,background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,zIndex:100,overflow:"hidden",padding:"4px 0",boxShadow:"0 4px 16px rgba(0,0,0,0.08)"}} onClick={e=>e.stopPropagation()}>
              {["All","Isle of Man","Malta","Cayman Islands","United Kingdom","Miami","Cyprus"].map(o=>{
                const flags={"Isle of Man":"🇮🇲","Malta":"🇲🇹","Cayman Islands":"🇰🇾","United Kingdom":"🇬🇧","Miami":"🇺🇸","Cyprus":"🇨🇾","All":"🌍"};
                const oc=officeColors[o];
                const active=officeFilter===o;
                return <div key={o} onClick={()=>{setOfficeFilter(o);setOfficeOpen(false);}}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",background:active?"#f5f5f5":"transparent",fontSize:12,fontWeight:active?600:400,color:active?(oc?.color||CY):"#333"}}>
                  <span style={{fontSize:14}}>{flags[o]}</span>
                  <span>{o==="All"?"All offices":o}</span>
                  {active&&<span style={{marginLeft:"auto",color:oc?.color||CY,fontWeight:700}}>✓</span>}
                </div>;
              })}
            </div>}
          </div>}
          {/* Shortcuts help */}
          {!mobile&&<button onClick={e=>{e.stopPropagation();setShortcutsOpen(p=>!p);}} title="Keyboard shortcuts" style={{width:32,height:32,borderRadius:6,border:"0.5px solid #e5e5e5",background:"transparent",cursor:"pointer",fontSize:13,color:"#999",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600}}>?</button>}
          <span style={{display:mobile?"none":"inline",fontSize:11,color:"#999"}}>14 Jul 2025</span>
          {/* PDF export */}
          {!mobile&&<button onClick={e=>{e.stopPropagation();window.print();}} title="Export current view as PDF" style={{width:32,height:32,borderRadius:6,border:"0.5px solid #e5e5e5",background:"transparent",cursor:"pointer",fontSize:13,color:"#999",display:"flex",alignItems:"center",justifyContent:"center"}}>⬇️</button>}
          <div style={{width:30,height:30,borderRadius:"50%",background:user.c,color:"#fff",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{user.av}</div>
        </div>
      </div>
      {officeFilter!=="All"&&<div style={{padding:"6px 16px",background:offC2.bg,borderBottom:`1px solid ${offC2.color}22`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:offC2.color,fontWeight:500}}>
          <span>{{"Isle of Man":"🇮🇲","Malta":"🇲🇹","Cayman Islands":"🇰🇾","United Kingdom":"🇬🇧","Miami":"🇺🇸","Cyprus":"🇨🇾"}[officeFilter]}</span>
          <span>Showing data for <strong>{officeFilter}</strong> only</span>
        </div>
        <button onClick={()=>setOfficeFilter("All")} style={{fontSize:10,color:offC2.color,background:"transparent",border:`0.5px solid ${offC2.color}66`,borderRadius:4,padding:"2px 8px",cursor:"pointer"}}>Clear ×</button>
      </div>}
      <div style={{flex:1,overflowY:"auto",background:"#fff"}}><ErrorBoundary key={mod}>{content()}</ErrorBoundary></div>
    </div>

    {/* ── GLOBAL SEARCH MODAL ──────────────────────────────── */}
    {searchOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:80}} onClick={()=>setSearchOpen(false)}>
      <div style={{width:560,maxWidth:"95vw",background:dark?"#1a1a2e":"#fff",borderRadius:12,border:"0.5px solid #e5e5e5",overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"0.5px solid #e5e5e5"}}>
          <span style={{fontSize:16}}>🔍</span>
          <input autoFocus value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search entities, modules, people…"
            style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",color:dark?"#e8e8f0":"#111"}} />
          {searchQ&&<button onClick={()=>setSearchQ("")} style={{background:"none",border:"none",cursor:"pointer",color:"#aaa",fontSize:16}}>×</button>}
          <kbd style={{padding:"2px 6px",borderRadius:4,border:"0.5px solid #ccc",fontSize:10,color:"#666",background:"#f5f5f5"}}>ESC</kbd>
        </div>
        <div style={{maxHeight:440,overflowY:"auto"}}>
          {searchQ.length===0&&<div style={{padding:"8px 16px 4px",fontSize:10,fontWeight:600,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.5px"}}>Quick access</div>}
          {(()=>{
            const typeIcons = {Entity:"🏢",Person:"👤",Prospect:"💼",Task:"✓",Document:"📄",Section:"⊞",Module:"▦"};
            const typeBg = {Entity:"#E6F7FB",Person:"#EAF3DE",Prospect:"#FAEEDA",Task:"#FCEBEB",Document:"#EEF0FB",Section:"#F0F0F5",Module:"#F5F5F5"};
            const typeOrder = ["Entity","Prospect","Person","Task","Document","Section","Module"];
            // Group results by type
            const grouped = {};
            searchResults.forEach(r => { (grouped[r.type] ||= []).push(r); });
            const orderedTypes = typeOrder.filter(t => grouped[t] && grouped[t].length);
            // Highlight the search term in the label
            const highlight = (text) => {
              if (!searchQ || searchQ.length < 2) return text;
              const idx = text.toLowerCase().indexOf(searchQ.toLowerCase());
              if (idx === -1) return text;
              return (<>
                {text.slice(0, idx)}
                <span style={{background:"rgba(0,196,204,0.25)",fontWeight:600,padding:"0 1px",borderRadius:2}}>{text.slice(idx, idx+searchQ.length)}</span>
                {text.slice(idx+searchQ.length)}
              </>);
            };
            return orderedTypes.map(typeName => (
              <div key={typeName}>
                <div style={{padding:"10px 16px 4px",fontSize:9,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.6px",background:dark?"#15152a":"#fafbfc",borderTop:"0.5px solid #f0f0f0"}}>
                  {typeName === "Module" ? "Navigate to module" : typeName + "s"} <span style={{color:"#ccc",fontWeight:500,marginLeft:4}}>{grouped[typeName].length}</span>
                </div>
                {grouped[typeName].map((r,i)=>(
                  <div key={typeName+"-"+i} onClick={()=>{setMod(r.mod);setSearchOpen(false);setSearchQ("");setSideOpen(false);}}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",cursor:"pointer",background:"transparent",transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=dark?"#252540":"#f0f9fa"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{width:32,height:32,borderRadius:8,background:typeBg[r.type]||"#eee",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
                      {typeIcons[r.type]||"·"}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,color:dark?"#e8e8f0":"#111"}}>{highlight(r.label)}</div>
                      <div style={{fontSize:11,color:"#888",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.sub}</div>
                    </div>
                    <span style={{fontSize:10,color:"#ccc",flexShrink:0}}>↵</span>
                  </div>
                ))}
              </div>
            ));
          })()}
        </div>
        {/* Footer with shortcut hints */}
        <div style={{padding:"8px 14px",borderTop:"0.5px solid #e5e5e5",fontSize:10,color:"#999",display:"flex",justifyContent:"space-between",alignItems:"center",background:dark?"#15152a":"#fafbfc"}}>
          <div style={{display:"flex",gap:10}}>
            <span><kbd style={{padding:"1px 5px",border:"0.5px solid #ccc",borderRadius:3,fontSize:9,background:"#fff",color:"#666"}}>↵</kbd> open</span>
            <span><kbd style={{padding:"1px 5px",border:"0.5px solid #ccc",borderRadius:3,fontSize:9,background:"#fff",color:"#666"}}>esc</kbd> close</span>
          </div>
          <div>{searchQ.length>1?searchResults.length+" results":"Cmd+K to open anytime"}</div>
        </div>
        <div style={{display:"none"}}>
          {searchQ.length>1&&searchResults.length===0&&(
            <div style={{padding:24,textAlign:"center",color:"#aaa",fontSize:13}}>No results for "{searchQ}"</div>
          )}
        </div>
        <div style={{padding:"8px 16px",borderTop:"0.5px solid #f0f0f0",display:"flex",gap:16,fontSize:10,color:"#aaa"}}>
          <span>↑↓ navigate</span><span>↵ open</span><span>ESC close</span><span style={{marginLeft:"auto"}}>G+? for shortcuts</span>
        </div>
      </div>
    </div>}

    {/* ── KEYBOARD SHORTCUTS PANEL ─────────────────────────── */}
    {shortcutsOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShortcutsOpen(false)}>
      <div style={{background:dark?"#1a1a2e":"#fff",borderRadius:12,padding:24,width:400,maxWidth:"95vw",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,fontSize:15,fontWeight:600,color:dark?"#e8e8f0":"#111"}}>Keyboard shortcuts</h3>
          <button onClick={()=>setShortcutsOpen(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#aaa"}}>×</button>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:600,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Navigation — press G then key</div>
          {SHORTCUTS.filter(s=>s.mod!==null).map(s=>(
            <div key={s.key} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid #f5f5f5",fontSize:12}}>
              <span style={{color:dark?"#ccc":"#666"}}>{s.label}</span>
              <div style={{display:"flex",gap:4}}>
                <kbd style={{padding:"1px 6px",borderRadius:4,border:"0.5px solid #ccc",fontSize:11,background:"#f5f5f5",color:"#333"}}>G</kbd>
                <kbd style={{padding:"1px 6px",borderRadius:4,border:"0.5px solid #ccc",fontSize:11,background:"#f5f5f5",color:"#333"}}>{s.key.toUpperCase()}</kbd>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:600,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Global</div>
          {[["Open search","⌘ K"],["Toggle shortcuts","G ?"],["Close / cancel","ESC"]].map(([l,k])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid #f5f5f5",fontSize:12}}>
              <span style={{color:dark?"#ccc":"#666"}}>{l}</span>
              <kbd style={{padding:"1px 8px",borderRadius:4,border:"0.5px solid #ccc",fontSize:11,background:"#f5f5f5",color:"#333"}}>{k}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>}

  </div>;
}
