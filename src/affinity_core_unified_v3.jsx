import { useState } from "react";
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
import Notifications from "./affinity_core_notifications";
import SystemAdmin   from "./affinity_core_system_admin";
import Chatbot      from "./affinity_core_chatbot";
import Intranet     from "./affinity_core_intranet";
import Compliance   from "./affinity_core_compliance";
import EGaming      from "./affinity_core_egaming";
import JurCompliance from "./affinity_core_jurisdiction_compliance";
import Statutory    from "./affinity_core_statutory_registers";
import GenerateDoc  from "./affinity_core_generate_document";

const CY = "#00B4D8";
const NAVY = "#0D1B2A";

const USERS = [
  {id:1,name:"Andy Morgan",  role:"Super Admin",      office:"Group",         av:"AM",c:"#00B4D8"},
  {id:2,name:"Roxy Sheeley", role:"Managing Director",office:"Isle of Man",   av:"RS",c:"#7C5CBF"},
  {id:3,name:"Garry Crossan",role:"Director",         office:"Cayman Islands",av:"GC",c:"#1A7FBF"},
  {id:4,name:"Joanne Fenech",role:"Director",         office:"Malta",         av:"JF",c:"#4A7C6F"},
  {id:5,name:"Neil Kelly",   role:"CFO",              office:"Group",         av:"NK",c:"#BF5C7A"},
  {id:6,name:"Gary Harrison",role:"CCO",              office:"Group",         av:"GH",c:"#7B4F1D"},
];

const offC = {
  "Isle of Man":    {bg:"#E6F7FB",color:"#0077A8"},
  "Malta":          {bg:"#EEF0FB",color:"#3C3489"},
  "Cayman Islands": {bg:"#E6EEF7",color:"#0D4A7A"},
  "Group":          {bg:"rgba(13,27,42,0.08)",color:NAVY},
};

const ALERTS = [
  {id:1,sev:"Critical",cat:"Compliance",title:"Harrington Family Trust — review overdue",  ass:"Roxy Sheeley"},
  {id:2,sev:"Critical",cat:"Compliance",title:"Apex Growth Fund — sanctions match open",  ass:"Gary Harrison"},
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
    {id:"crm",          label:"CRM",           icon:"\uD83E\uDD1D",b:null},
    {id:"documents",    label:"Documents",     icon:"\uD83D\uDCC1",b:2},
    {id:"onboarding",   label:"Onboarding",    icon:"\u2705",b:1},
  ]},
  {s:"Accounts",   items:[
    {id:"timesheets",   label:"Timesheets",    icon:"\u23F1",b:1},
    {id:"invoicing",    label:"Invoicing",     icon:"\uD83D\uDCB7",b:null},
    {id:"bookkeeping",  label:"Bookkeeping",   icon:"\uD83D\uDCCA",b:null},
    {id:"budgeting",    label:"Budgeting",     icon:"\uD83D\uDCB0",b:null},
  ]},
  {s:"Insights",   items:[
    {id:"reporting",    label:"Reporting",     icon:"\uD83D\uDCC8",b:null},
  ]},
  {s:"Governance", items:[
    {id:"compliance",   label:"Compliance",    icon:"\u2713",b:null},
    {id:"statutory",    label:"Statutory",     icon:"\uD83D\uDCCB",b:null},
    {id:"procedures",   label:"Procedures",    icon:"\u2699",b:null},
    {id:"generate",     label:"Generate doc",  icon:"\uD83D\uDCC4",b:null},
    {id:"egaming",      label:"eGaming / OGRA", icon:"\uD83C\uDFB0",b:null},
    {id:"jurcompliance",label:"Jur. compliance", icon:"\uD83C\uDF0D",b:null},
  ]},
  {s:"People", items:[
    {id:"intranet",     label:"Intranet",      icon:"\uD83C\uDFE0",b:null},
    {id:"chatbot",      label:"Assistant",     icon:"\uD83E\uDD16",b:null},
  ]},
  {s:"System",     items:[
    {id:"notifications",label:"Notifications", icon:"\uD83D\uDD14",b:8},
    {id:"system",       label:"System admin",  icon:"\uD83D\uDD27",b:null},
  ]},
];

// Tasks module (inline)
const TASKS_DATA = [
  {id:1,title:"Harrington Trust — CPR overdue",           entity:"Harrington Family Trust",   assignee:"Roxy Sheeley",  due:"Today",      priority:"Critical",cat:"Compliance",  status:"Open"},
  {id:2,title:"Apex Growth Fund — sanctions MLRO review", entity:"Apex Growth Fund Ltd",      assignee:"Gary Harrison", due:"Today",      priority:"Critical",cat:"Compliance",  status:"Open"},
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
  const filtered=tasks.filter(t=>(filter==="All"||t.priority===filter||t.status===filter)&&(!ass||t.assignee===ass));
  const selT=sel?tasks.find(t=>t.id===sel):null;
  const done=id=>setTasks(p=>p.map(t=>t.id===id?{...t,status:"Complete"}:t));
  const th={padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.4px",borderBottom:"0.5px solid #e5e5e5",background:"#f9f9f9",whiteSpace:"nowrap"};
  const td={padding:"9px 12px",fontSize:11,borderBottom:"0.5px solid #e5e5e5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};
  return <div style={{padding:18}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Total open",v:tasks.filter(t=>t.status!=="Complete").length,c:CY},{l:"Critical",v:tasks.filter(t=>t.priority==="Critical"&&t.status!=="Complete").length,c:"#EF4444"},{l:"High",v:tasks.filter(t=>t.priority==="High"&&t.status!=="Complete").length,c:"#F59E0B"},{l:"In progress",v:tasks.filter(t=>t.status==="In progress").length,c:CY},{l:"Completed",v:tasks.filter(t=>t.status==="Complete").length,c:"#4CAF7D"}].map(k=><div key={k.l} style={{background:"#f9f9f9",borderRadius:6,padding:"10px 14px"}}><div style={{fontSize:10,color:"#666",marginBottom:3}}>{k.l}</div><div style={{fontSize:20,fontWeight:600,color:k.c||"#111"}}>{k.v}</div></div>)}
    </div>
    <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
        {["All","Critical","High","Medium","Low","Open","In progress","Complete"].map(f=><button key={f} style={{padding:"4px 10px",fontSize:11,borderRadius:20,border:`0.5px solid ${filter===f?"#ccc":"#e5e5e5"}`,background:filter===f?"#fff":"transparent",color:filter===f?"#111":"#666",cursor:"pointer",fontWeight:filter===f?500:400}} onClick={()=>setFilter(f)}>{f}</button>)}
      </div>
      <select style={{height:30,padding:"0 8px",fontSize:11,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",color:"#111",marginLeft:"auto"}} value={ass} onChange={e=>setAss(e.target.value)}>
        <option value="">All team members</option>
        {[...new Set(TASKS_DATA.map(t=>t.assignee))].map(a=><option key={a}>{a}</option>)}
      </select>
      <button onClick={()=>setModal(true)} style={{padding:"5px 14px",borderRadius:5,border:"none",background:CY,color:"#fff",fontSize:11,cursor:"pointer",fontWeight:500}}>&#43; New task</button>
    </div>
    <div style={{display:"flex"}}>
      <table style={{flex:1,borderCollapse:"collapse",tableLayout:"fixed"}}>
        <thead><tr>
          <th style={{...th,width:"4%"}}></th>
          <th style={{...th,width:"28%"}}>Task</th>
          <th style={{...th,width:"18%"}}>Entity</th>
          <th style={{...th,width:"11%"}}>Assignee</th>
          <th style={{...th,width:"10%"}}>Due</th>
          <th style={{...th,width:"9%"}}>Priority</th>
          <th style={{...th,width:"9%"}}>Category</th>
          <th style={{...th,width:"9%"}}>Status</th>
        </tr></thead>
        <tbody>
          {filtered.map(t=><tr key={t.id} onClick={()=>setSel(sel===t.id?null:t.id)} style={{cursor:"pointer",borderBottom:"0.5px solid #e5e5e5",background:sel===t.id?"#f9f9f9":"transparent",opacity:t.status==="Complete"?0.55:1}}>
            <td style={{...td,textAlign:"center"}}><input type="checkbox" checked={t.status==="Complete"} onChange={()=>done(t.id)} onClick={e=>e.stopPropagation()} style={{cursor:"pointer",width:14,height:14}}/></td>
            <td style={{...td,fontWeight:t.status==="Complete"?400:500,textDecoration:t.status==="Complete"?"line-through":"none"}}>{t.title}</td>
            <td style={{...td,color:"#666"}}>{t.entity}</td>
            <td style={{...td,color:"#666"}}>{t.assignee.split(" ").map((w,i)=>i===0?w:w[0]+".").join(" ")}</td>
            <td style={{...td,color:t.due==="Overdue"||t.due==="Today"?"#EF4444":"#666",fontWeight:t.due==="Overdue"||t.due==="Today"?600:400}}>{t.due}</td>
            <td style={td}><Bx label={t.priority} colors={pC[t.priority]}/></td>
            <td style={td}><Bx label={t.cat} colors={cC[t.cat]||{bg:"#eee",color:"#666"}}/></td>
            <td style={td}><Bx label={t.status} colors={sC[t.status]}/></td>
          </tr>)}
          {filtered.length===0&&<tr><td colSpan={8} style={{...td,textAlign:"center",color:"#aaa",padding:30}}>No tasks match this filter</td></tr>}
        </tbody>
      </table>
      {selT&&<div style={{width:260,minWidth:260,borderLeft:"0.5px solid #e5e5e5",padding:14,overflowY:"auto"}}>
        <button onClick={()=>setSel(null)} style={{float:"right",background:"none",border:"none",cursor:"pointer",color:"#aaa",fontSize:14}}>&#x2715;</button>
        <div style={{fontSize:13,fontWeight:600,lineHeight:1.4,marginBottom:10}}>{selT.title}</div>
        {[["Entity",selT.entity],["Assignee",selT.assignee],["Due",selT.due],["Priority",selT.priority],["Category",selT.cat],["Status",selT.status]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}><span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500}}>{v}</span></div>)}
        <div style={{marginTop:12}}><div style={{fontSize:10,color:"#aaa",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.4px"}}>Notes</div><textarea style={{width:"100%",height:80,fontSize:11,borderRadius:5,border:"0.5px solid #ccc",padding:"6px 8px",resize:"none",background:"#f9f9f9",color:"#111"}} placeholder="Add notes..."/></div>
        <div style={{display:"flex",gap:6,marginTop:10}}>
          {selT.status!=="Complete"&&<button onClick={()=>{done(selT.id);setSel(null);}} style={{flex:1,padding:"6px",borderRadius:5,border:"none",background:"#4CAF7D",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:500}}>Mark complete &#10003;</button>}
          <button style={{flex:1,padding:"6px",borderRadius:5,border:"0.5px solid #ccc",background:"transparent",color:"#111",fontSize:11,cursor:"pointer"}}>Edit</button>
        </div>
      </div>}
    </div>
    {modal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(13,27,42,0.5)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:40,zIndex:200}} onClick={e=>e.target===e.currentTarget&&setModal(false)}>
      <div style={{background:"#fff",borderRadius:10,border:"0.5px solid #e5e5e5",padding:22,width:500,maxWidth:"96vw"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><div style={{fontSize:14,fontWeight:600}}>New task</div><button onClick={()=>setModal(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#aaa"}}>&#x2715;</button></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[["Task title","text","Description of task",true],["Entity","text","Entity name or —"],["Assignee","select","",false,["Andy Morgan","Roxy Sheeley","Garry Crossan","Joanne Fenech","Neil Kelly","Gary Harrison","Sarah Cole"]],["Due date","text","DD/MM/YYYY"],["Priority","select","",false,["Critical","High","Medium","Low"]],["Category","select","",false,["Compliance","KYC","Invoicing","Timesheets","Onboarding","Corporate","Statutory","System","Accounts","Other"]],["Status","select","",false,["Open","In progress"]]].map(([l,t,ph,full,opts])=><div key={l} style={{display:"flex",flexDirection:"column",gap:3,gridColumn:full?"1/-1":"auto"}}>
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

export default function AffinityCore(){
  const [mod,setMod]=useState("dashboard");
  const [uid,setUid]=useState(1);
  const [nOpen,setN]=useState(false);
  const [uOpen,setU]=useState(false);
  const [mobile,setMobile]=useState(window.innerWidth<768);
  const user=USERS.find(u=>u.id===uid);
  const navLabel=NAV.flatMap(s=>s.items).find(i=>i.id===mod)?.label||mod;

  // Track screen size
  useState(()=>{
    const handleResize=()=>setMobile(window.innerWidth<768);
    window.addEventListener("resize",handleResize);
    return ()=>window.removeEventListener("resize",handleResize);
  });

  const content=()=>{
    switch(mod){
      case "dashboard":    return <Dashboard userId={uid} onNav={setMod}/>;
      case "tasks":        return <Tasks/>;
      case "entities":     return <EntityAdmin/>;
      case "crm":          return <CRM/>;
      case "documents":    return <Documents/>;
      case "onboarding":   return <Onboarding/>;
      case "timesheets":   return <Timesheets/>;
      case "invoicing":    return <Invoicing/>;
      case "bookkeeping":  return <Bookkeeping/>;
      case "budgeting":    return <Budgeting/>;
      case "reporting":    return <Reporting/>;
      case "procedures":   return <Procedures/>;
      case "notifications":return <Notifications/>;
      case "chatbot":      return <Chatbot/>;
      case "intranet":     return <Intranet/>;
      case "system":       return <SystemAdmin/>;
      case "compliance":   return <Compliance/>;
      case "statutory":    return <Statutory/>;
      case "generate":     return <GenerateDoc/>;
      case "egaming":      return <EGaming/>;
      case "jurcompliance": return <JurCompliance/>;
      default:             return <Dashboard userId={uid} onNav={setMod}/>;
    }
  };

  const [sideOpen, setSideOpen] = useState(false);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const navTo = (id) => { setMod(id); setSideOpen(false); };

  return <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',system-ui,sans-serif",overflow:"hidden",position:"relative"}} onClick={()=>{if(nOpen)setN(false);if(uOpen)setU(false);}}>

    {/* Mobile overlay */}
    {sideOpen && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:40}} onClick={()=>setSideOpen(false)}/>}
    <div style={{width:208,minWidth:208,background:NAVY,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0,position:"fixed",top:0,left:0,bottom:0,zIndex:50,transform:mobile?(sideOpen?"translateX(0)":"translateX(-100%)"):"translateX(0)",transition:"transform 0.25s ease"}}>
      <div style={{padding:"14px 14px 10px",borderBottom:"0.5px solid rgba(255,255,255,0.08)"}}>
        <div style={{fontSize:18,fontWeight:500,color:CY}}>Affinity <span style={{color:"#fff",fontWeight:300}}>Core</span></div>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:"1px",marginTop:2}}>Corporate & Trust Services</div>
      </div>
      <div style={{flex:1,overflowY:"auto",paddingBottom:6}}>
        {NAV.map(sec=><div key={sec.s}>
          <div style={{fontSize:9,fontWeight:500,color:"rgba(255,255,255,0.28)",textTransform:"uppercase",letterSpacing:"1px",padding:"10px 14px 4px"}}>{sec.s}</div>
          {sec.items.map(item=><div key={item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",cursor:"pointer",borderRadius:5,margin:"1px 6px",background:mod===item.id?"rgba(0,180,216,0.18)":"transparent",color:mod===item.id?"#fff":"rgba(255,255,255,0.52)",fontSize:12,fontWeight:mod===item.id?500:400}} onClick={()=>navTo(item.id)}>
            <span style={{fontSize:13}}>{item.icon}</span>
            <span>{item.label}</span>
            {item.b&&<span style={{background:"#EF4444",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700,marginLeft:"auto"}}>{item.b}</span>}
          </div>)}
        </div>)}
      </div>
      <div style={{padding:"10px 14px",borderTop:"0.5px solid rgba(255,255,255,0.08)",position:"relative"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={e=>{e.stopPropagation();setU(!uOpen);}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:user.c,color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{user.av}</div>
          <div><div style={{fontSize:11,fontWeight:500,color:"#fff"}}>{user.name}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.38)"}}>{user.role}</div></div>
          <span style={{marginLeft:"auto",color:"rgba(255,255,255,0.3)",fontSize:10}}>&#9650;</span>
        </div>
        {uOpen&&<div style={{position:"absolute",bottom:58,left:8,right:8,background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,zIndex:100,overflow:"hidden",padding:"4px 0",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}} onClick={e=>e.stopPropagation()}>
          <div style={{padding:"6px 12px",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"0.5px solid #e5e5e5"}}>Switch user</div>
          {USERS.map(u=><div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",background:uid===u.id?"#f5f5f5":"transparent"}} onClick={()=>{setUid(u.id);setU(false);}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:u.c,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{u.av}</div>
            <div><div style={{fontSize:12,fontWeight:uid===u.id?600:400}}>{u.name}</div><div style={{fontSize:10,color:"#999"}}>{u.role}</div></div>
            {uid===u.id&&<span style={{marginLeft:"auto",color:CY,fontWeight:700}}>&#10003;</span>}
          </div>)}
        </div>}
      </div>
    </div>
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",marginLeft:mobile?0:208,transition:"margin 0.25s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:48,borderBottom:"0.5px solid #e5e5e5",flexShrink:0,background:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* Hamburger — mobile only */}
          <button onClick={e=>{e.stopPropagation();setSideOpen(!sideOpen);}} style={{display:mobile?"flex":"none",alignItems:"center",justifyContent:"center",width:36,height:36,borderRadius:6,border:"0.5px solid #e5e5e5",background:"transparent",cursor:"pointer",fontSize:18,flexShrink:0}}>&#9776;</button>
          <div style={{fontSize:14,fontWeight:500}}>{navLabel}</div>
          <span style={{display:mobile?"none":"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:offC[user.office]?.bg||"#eee",color:offC[user.office]?.color||"#666"}}>{user.office}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          <span style={{display:mobile?"none":"inline",fontSize:11,color:"#999"}}>14 Jul 2025</span>
          <button onClick={e=>{e.stopPropagation();setN(!nOpen);}} style={{position:"relative",width:32,height:32,borderRadius:6,border:"0.5px solid #e5e5e5",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>
            &#128276;<div style={{position:"absolute",top:6,right:6,width:7,height:7,borderRadius:"50%",background:"#EF4444"}}/>
          </button>
          {nOpen&&<div style={{position:"absolute",top:38,right:0,width:300,background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,zIndex:100,overflow:"hidden",boxShadow:"0 4px 16px rgba(0,0,0,0.08)"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"10px 14px",borderBottom:"0.5px solid #e5e5e5",display:"flex",justifyContent:"space-between"}}>
              <span style={{fontWeight:600,fontSize:12}}>Notifications</span>
              <span style={{fontSize:11,color:CY,cursor:"pointer"}} onClick={()=>{setMod("notifications");setN(false);}}>View all &#8599;</span>
            </div>
            {ALERTS.slice(0,5).map(a=><div key={a.id} style={{padding:"9px 14px",borderBottom:"0.5px solid #e5e5e5",cursor:"pointer"}} onClick={()=>{setMod("notifications");setN(false);}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:a.sev==="Critical"?"#EF4444":"#F59E0B"}}/><span style={{fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</span></div>
              <div style={{fontSize:10,color:"#999",marginTop:2,paddingLeft:12}}>{a.ass}</div>
            </div>)}
          </div>}
          <div style={{width:30,height:30,borderRadius:"50%",background:user.c,color:"#fff",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{user.av}</div>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",background:"#fff"}}>{content()}</div>
    </div>
  </div>;
}
