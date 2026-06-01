import { useState, useMemo } from "react";

const CY = "#00C4CC";

const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);

const severityColors = {
  Critical: { bg:"#FCEBEB", color:"#A32D2D", dot:"#EF4444" },
  High:     { bg:"#FAEEDA", color:"#633806", dot:"#F59E0B" },
  Medium:   { bg:"#E6F7FB", color:"#0077A8", dot:CY },
  Low:      { bg:"#F1EFE8", color:"#444441", dot:"#aaa" },
};

const categoryColors = {
  "Compliance":   { bg:"#FBEAF0", color:"#72243E" },
  "KYC":          { bg:"#FCEBEB", color:"#A32D2D" },
  "Invoicing":    { bg:"#EAF3DE", color:"#27500A" },
  "Timesheets":   { bg:"#E6F7FB", color:"#0077A8" },
  "Onboarding":   { bg:"#E6F1FB", color:"#0C447C" },
  "Documents":    { bg:"#F1EFE8", color:"#444441" },
  "System":       { bg:"#EEF0FB", color:"#3C3489" },
  "Entities":     { bg:"#FAEEDA", color:"#633806" },
};

const officeColors = {
  "Isle of Man":    { bg:"#E6F7FB", color:"#0077A8" },
  "Malta":          { bg:"#EEF0FB", color:"#3C3489" },
  "Cayman Islands": { bg:"#E6EEF7", color:"#0D4A7A" },
  "United Kingdom": { bg:"#F1EFE8", color:"#444441" },
  "Miami":          { bg:"#FBEAF0", color:"#72243E" },
  "Group":          { bg:"#00124222", color:"#001242" },
};

const notificationsData = [
  { id:1,  title:"Harrington Family Trust — periodic review overdue",      category:"Compliance", severity:"Critical", office:"Isle of Man",    assignee:"Roxy Sheeley",   entity:"Harrington Family Trust",    date:"01/07/2025", read:false, escalated:true,  actionUrl:"Compliance",  action:"Start review",   detail:"Periodic review was due 05/01/2025. Now 190+ days overdue. High risk entity. EDD documentation outstanding. Immediate action required." },
  { id:2,  title:"Apex Growth Fund — sanctions match open",                 category:"Compliance", severity:"Critical", office:"Cayman Islands", assignee:"Gary Harrison",  entity:"Apex Growth Fund Ltd",       date:"12/07/2025", read:false, escalated:true,  actionUrl:"Compliance",  action:"Review match",   detail:"Worldcheck screening returned a potential match on entity name. MLRO review required. Payment processing suspended pending clearance." },
  { id:3,  title:"North Star Holdings — review overdue",                   category:"Compliance", severity:"Critical", office:"Isle of Man",    assignee:"Gary Harrison",  entity:"North Star Holdings Ltd",    date:"01/04/2025", read:false, escalated:true,  actionUrl:"Compliance",  action:"Start review",   detail:"Periodic review 90+ days overdue. Entity is in liquidation. Closure compliance review required before file can be closed." },
  { id:4,  title:"Emma Harrington — KYC expired (ID document)",            category:"KYC",        severity:"Critical", office:"Isle of Man",    assignee:"Roxy Sheeley",   entity:"Harrington Family Trust",    date:"22/04/2024", read:false, escalated:false, actionUrl:"Compliance",  action:"Request docs",   detail:"Driving licence expired April 2024. Replacement requested — no response received. Compliance case CC-001 open." },
  { id:5,  title:"Sophie Laurent — KYC expired (passport)",                category:"KYC",        severity:"Critical", office:"Cayman Islands", assignee:"Garry Crossan",  entity:"Apex Growth Fund Ltd",       date:"28/02/2025", read:false, escalated:false, actionUrl:"Compliance",  action:"Request docs",   detail:"Passport expired February 2025. Entity is Very High risk. Replacement required urgently. EDD review also outstanding." },
  { id:6,  title:"Pacific Wealth Trust — review overdue",                  category:"Compliance", severity:"High",     office:"Cayman Islands", assignee:"Garry Crossan",  entity:"Pacific Wealth Trust",       date:"18/02/2025", read:false, escalated:false, actionUrl:"Compliance",  action:"Start review",   detail:"High risk entity. Review overdue since 18/02/2025. PEP connection identified. EDD documentation required before review can be completed." },
  { id:7,  title:"Meridian Holdings — periodic review due this month",     category:"Compliance", severity:"High",     office:"Isle of Man",    assignee:"Roxy Sheeley",   entity:"Meridian Holdings Ltd",      date:"14/09/2025", read:true,  escalated:false, actionUrl:"Compliance",  action:"Start review",   detail:"Review due 14/09/2025. Medium risk entity. Last review completed 14/03/2024. Documents appear current." },
  { id:8,  title:"Apex Growth Fund — review due this month",               category:"Compliance", severity:"High",     office:"Cayman Islands", assignee:"Garry Crossan",  entity:"Apex Growth Fund Ltd",       date:"12/07/2025", read:false, escalated:false, actionUrl:"Compliance",  action:"Start review",   detail:"Very High risk entity — 6 month review cycle. Review due 12/07/2025. Worldcheck rescreening also due." },
  { id:9,  title:"Harrington Family Trust — invoice overdue 60+ days",    category:"Invoicing",  severity:"High",     office:"Isle of Man",    assignee:"Neil Kelly",     entity:"Harrington Family Trust",    date:"15/07/2025", read:true,  escalated:false, actionUrl:"Invoicing",   action:"Send reminder",  detail:"INV-IOM-2025-038 for £1,250 is 60+ days overdue. 3rd reminder sent 10/07/2025. No response. Escalation recommended." },
  { id:10, title:"North Star Holdings — invoice overdue 90+ days",        category:"Invoicing",  severity:"High",     office:"Isle of Man",    assignee:"Neil Kelly",     entity:"North Star Holdings Ltd",    date:"20/06/2025", read:true,  escalated:false, actionUrl:"Invoicing",   action:"Review",         detail:"INV-IOM-2025-035 for £600 overdue 90+ days. Entity in liquidation. Recovery uncertain. CFO review recommended." },
  { id:11, title:"Sarah Cole — timesheet missing (W/C 14 Jul)",           category:"Timesheets", severity:"High",     office:"Isle of Man",    assignee:"Roxy Sheeley",   entity:"—",                          date:"15/07/2025", read:false, escalated:false, actionUrl:"Timesheets",  action:"Send reminder",  detail:"Sarah Cole has not submitted her timesheet for week commencing 14 July 2025. Reminder sent automatically. Manager follow-up required." },
  { id:12, title:"Maria Borg — timesheet missing (W/C 07 Jul)",           category:"Timesheets", severity:"High",     office:"Malta",          assignee:"Joanne Fenech",  entity:"—",                          date:"08/07/2025", read:false, escalated:false, actionUrl:"Timesheets",  action:"Send reminder",  detail:"Maria Borg did not submit timesheet for week commencing 7 July 2025. Second reminder sent. Manager action required." },
  { id:13, title:"Sarah Cole — KYC expiring in 45 days (ID)",             category:"KYC",        severity:"Medium",   office:"Isle of Man",    assignee:"Roxy Sheeley",   entity:"Meridian Holdings Ltd",      date:"30/11/2025", read:true,  escalated:false, actionUrl:"Compliance",  action:"Request renewal",detail:"Passport expires 30/11/2025. Renewal request should be sent now to ensure updated document received before expiry." },
  { id:14, title:"Carlo Rizzo — address document expiring soon",          category:"KYC",        severity:"Medium",   office:"Malta",          assignee:"Joanne Fenech",  entity:"Azure Mediterranean Foundation",date:"20/07/2025",read:false, escalated:false, actionUrl:"Compliance",  action:"Request renewal",detail:"Address evidence (mortgage statement) due to expire 20/07/2025. Renewal requested — awaiting response." },
  { id:15, title:"Solaris Family Trust — onboarding overdue",             category:"Onboarding", severity:"High",     office:"Cayman Islands", assignee:"Garry Crossan",  entity:"Solaris Family Trust",       date:"30/07/2025", read:false, escalated:false, actionUrl:"Onboarding",  action:"Review",         detail:"Onboarding target date was 30/07/2025. Compliance review stage stalled — EDD package incomplete. MLRO sign-off outstanding." },
  { id:16, title:"Pinnacle Trading — awaiting client KYC documents",      category:"Onboarding", severity:"Medium",   office:"Isle of Man",    assignee:"Roxy Sheeley",   entity:"Pinnacle Trading Ltd",       date:"15/08/2025", read:true,  escalated:false, actionUrl:"Onboarding",  action:"Chase client",   detail:"Portal invitation sent. UBO address evidence and director 2 KYC outstanding. Client not responded to follow-up." },
  { id:17, title:"Stonebridge Capital — resolution awaiting approval",    category:"Documents",  severity:"Medium",   office:"Malta",          assignee:"Neil Kelly",     entity:"Stonebridge Capital Ltd",    date:"01/07/2025", read:true,  escalated:false, actionUrl:"Documents",   action:"Review & approve",detail:"Director appointment resolution submitted by Joanne Fenech on 01/07/2025. Awaiting CFO sign-off before execution." },
  { id:18, title:"Rosewood Legacy Trust — invoice draft unsent",          category:"Invoicing",  severity:"Medium",   office:"Isle of Man",    assignee:"Neil Kelly",     entity:"Rosewood Legacy Trust",      date:"01/07/2025", read:true,  escalated:false, actionUrl:"Invoicing",   action:"Review & send",  detail:"Q3 2025 retainer invoice (£2,400) has been drafted but not yet sent. Review and send to client." },
  { id:19, title:"Andy Morgan — utilisation below target (56%)",          category:"Timesheets", severity:"Medium",   office:"Group",          assignee:"Andy Morgan",    entity:"—",                          date:"14/07/2025", read:true,  escalated:false, actionUrl:"Timesheets",  action:"Review",         detail:"Andy Morgan's billable utilisation for the current week is 56% against a 75% target. 14 hours non-billable recorded." },
  { id:20, title:"Garry Crossan — MFA not enabled",                      category:"System",     severity:"Medium",   office:"Cayman Islands", assignee:"Andy Morgan",    entity:"—",                          date:"14/07/2025", read:false, escalated:false, actionUrl:"System",      action:"Enforce MFA",    detail:"Garry Crossan does not have MFA enabled on his account. System policy requires MFA for all Director-level and above. Action required." },
  { id:21, title:"North Star Holdings — attrition approval pending",      category:"Entities",   severity:"Low",      office:"Isle of Man",    assignee:"Neil Kelly",     entity:"North Star Holdings Ltd",    date:"15/01/2025", read:true,  escalated:false, actionUrl:"Onboarding",  action:"Approve",        detail:"Attrition form ATR-2025-001 is awaiting CFO sign-off (Neil Kelly). All other approvals received." },
  { id:22, title:"Q3 retainer invoices due for generation",              category:"Invoicing",  severity:"Low",      office:"Group",          assignee:"Neil Kelly",     entity:"—",                          date:"01/10/2025", read:true,  escalated:false, actionUrl:"Invoicing",   action:"Generate invoices",detail:"7 retainer invoices are due for Q3 2025 on 01/10/2025. Auto-generation is disabled. Manual review and send required." },
  { id:23, title:"Osprey Aviation — onboarding approval pending",        category:"Onboarding", severity:"Low",      office:"Cayman Islands", assignee:"Andy Morgan",    entity:"Osprey Aviation Partners Ltd",date:"01/09/2025",read:true,  escalated:false, actionUrl:"Onboarding",  action:"Review",         detail:"New business snapshot submitted by Garry Crossan. Approval-in-principle required from 2 directors before KYC collection begins." },
];

const rulesData = [
  { id:1,  trigger:"Periodic review overdue",          severity:"Critical", recipients:"Assigned admin + MD + CCO",  timing:"Day 1 overdue, then weekly",       active:true },
  { id:2,  trigger:"KYC document expired",             severity:"Critical", recipients:"Assigned admin + Compliance", timing:"Day of expiry, then weekly",       active:true },
  { id:3,  trigger:"Sanctions match — open",           severity:"Critical", recipients:"MLRO + MD + Super Admin",     timing:"Immediate",                        active:true },
  { id:4,  trigger:"Periodic review due in 30 days",   severity:"High",     recipients:"Assigned admin",              timing:"30 days before due date",          active:true },
  { id:5,  trigger:"KYC document expiring in 90 days", severity:"High",     recipients:"Assigned admin",              timing:"90, 60, 30 days before expiry",    active:true },
  { id:6,  trigger:"Invoice overdue 30+ days",         severity:"High",     recipients:"Assigned admin + CFO",        timing:"Day 30, day 60, day 90",           active:true },
  { id:7,  trigger:"Timesheet not submitted by Monday 10am",severity:"High",recipients:"Employee + Manager",          timing:"Monday 10am",                      active:true },
  { id:8,  trigger:"Onboarding target date missed",    severity:"High",     recipients:"Assigned admin + MD",         timing:"Day of target date",               active:true },
  { id:9,  trigger:"Document awaiting approval 3+ days",severity:"Medium",  recipients:"Approver",                    timing:"After 3 days unactioned",          active:true },
  { id:10, trigger:"WIP aged 60+ days",                severity:"Medium",   recipients:"Assigned admin + CFO",        timing:"At 60 days, then monthly",         active:true },
  { id:11, trigger:"User without MFA",                 severity:"Medium",   recipients:"Super Admin",                 timing:"Daily until resolved",             active:true },
  { id:12, trigger:"Utilisation below 70% for week",   severity:"Medium",   recipients:"Employee + Manager",          timing:"End of week",                      active:false },
  { id:13, trigger:"Retainer invoice due in 7 days",   severity:"Low",      recipients:"CFO",                         timing:"7 days before due",                active:true },
  { id:14, trigger:"Attrition approval pending 7+ days",severity:"Low",    recipients:"Pending approver",            timing:"After 7 days unactioned",          active:true },
];

// Notifications: acts as an audit trail and rule engine for all system alerts.
// Different from dashboard (which shows today's actions) — this is the full history,
// preferences, and automated rule configuration for compliance-driven alerts.
const VIEWS = ["inbox","all","rules","digest","history"];
const VIEW_LABELS = ["Inbox","All notifications","Alert rules","Daily digest","History"];

const s = {
  wrap:{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 },
  header:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" },
  logo:{ fontSize:18, fontWeight:500, color:CY },
  subnav:{ display:"flex", gap:4, padding:"10px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-secondary,#f9f9f9)", flexWrap:"wrap", alignItems:"center" },
  snb:(a)=>({ padding:"5px 14px", fontSize:12, borderRadius:20, border:`0.5px solid ${a?"var(--border-secondary,#ccc)":"var(--border-tertiary,#e5e5e5)"}`, background:a?"var(--bg-primary,#fff)":"transparent", color:a?"var(--text-primary,#111)":"var(--text-secondary,#666)", cursor:"pointer", fontWeight:a?600:400, whiteSpace:"nowrap" }),
  toolbar:{ display:"flex", alignItems:"center", gap:8, padding:"12px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", flexWrap:"wrap" },
  sw:{ display:"flex", alignItems:"center", gap:8, background:"var(--bg-primary,#fff)", border:"0.5px solid var(--border-secondary,#ccc)", borderRadius:6, padding:"0 12px", flex:1, minWidth:160 },
  swInput:{ border:"none", background:"transparent", fontSize:13, color:"var(--text-primary,#111)", outline:"none", width:"100%", height:32 },
  sel:{ height:32, padding:"0 8px", fontSize:12, borderRadius:6, border:"0.5px solid var(--border-secondary,#ccc)", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", cursor:"pointer" },
  addBtn:{ display:"flex", alignItems:"center", gap:5, padding:"0 14px", height:32, background:CY, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", marginLeft:"auto" },
  stats:{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, padding:"14px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" },
  sc:{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 14px" },
  scL:{ fontSize:11, color:"var(--text-secondary,#666)", marginBottom:3 },
  scV:(c)=>({ fontSize:20, fontWeight:700, color:c||"var(--text-primary,#111)" }),
  main:{ display:"flex" },
  list:{ flex:1 },
  detail:{ borderLeft:"0.5px solid var(--border-tertiary,#e5e5e5)", width:290, minWidth:290, background:"var(--bg-primary,#fff)", padding:16, overflowY:"auto", maxHeight:680 },
  dName:{ fontSize:13, fontWeight:700, marginBottom:4, lineHeight:1.4 },
  dRef:{ fontSize:11, color:"#999", marginBottom:12 },
  dSec:{ marginBottom:14 },
  dSecT:{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.5px", color:"#aaa", marginBottom:6 },
  dRow:{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", fontSize:12 },
  dKey:{ color:"var(--text-secondary,#666)" },
  dVal:{ fontWeight:600, textAlign:"right" },
  closeX:{ float:"right", background:"none", border:"none", cursor:"pointer", color:"#aaa", fontSize:16 },
  actRow:{ display:"flex", gap:6, marginTop:12, flexWrap:"wrap" },
  actBtn:(p)=>({ flex:1, padding:"6px 8px", fontSize:11, borderRadius:6, border:p?"none":"0.5px solid var(--border-secondary,#ccc)", background:p?CY:"transparent", color:p?"#fff":"var(--text-primary,#111)", cursor:"pointer", textAlign:"center", minWidth:60 }),
  pad:{ padding:"16px 20px" },
  card:{ background:"var(--bg-primary,#fff)", border:"0.5px solid var(--border-tertiary,#e5e5e5)", borderRadius:10, padding:16, marginBottom:12 },
  cardT:{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12 },
  nb:{ padding:"5px 12px", fontSize:12, borderRadius:6, border:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"transparent", color:"var(--text-secondary,#666)", cursor:"pointer" },
  nbActive:{ padding:"5px 12px", fontSize:12, borderRadius:6, border:`0.5px solid ${CY}`, background:CY, color:"#fff", cursor:"pointer", fontWeight:700 },
  modal:{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(13,27,42,0.45)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:40, zIndex:100 },
  modalBox:{ background:"var(--bg-primary,#fff)", borderRadius:10, border:"0.5px solid var(--border-tertiary,#e5e5e5)", padding:22, width:500, maxWidth:"96vw", maxHeight:"90vh", overflowY:"auto" },
  modalTitle:{ fontSize:15, fontWeight:700, marginBottom:18 },
  fg:{ display:"flex", flexDirection:"column", gap:3, marginBottom:12 },
  fgl:{ fontSize:11, color:"var(--text-secondary,#666)" },
  fgi:{ fontSize:13, borderRadius:6, border:"0.5px solid var(--border-secondary,#ccc)", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", padding:"0 10px", height:34, outline:"none" },
  fgGrid:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  mActions:{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 },
  btnC:{ background:"transparent", border:"0.5px solid var(--border-secondary,#ccc)", color:"var(--text-primary,#111)", padding:"7px 18px", borderRadius:6, fontSize:12, cursor:"pointer" },
  btnS:{ background:CY, color:"#fff", border:"none", padding:"7px 18px", borderRadius:6, fontSize:12, fontWeight:700, cursor:"pointer" },
  toggle:(on)=>({ width:36, height:20, borderRadius:10, background:on?CY:"#ccc", border:"none", cursor:"pointer", position:"relative", flexShrink:0, transition:"background 0.15s" }),
};

export default function AffinityCoreNotifications() {
  const [view, setView] = useState("inbox");
  const [sel, setSel] = useState(null);
  const [search, setSearch] = useState("");
  const [catF, setCatF] = useState("");
  const [sevF, setSevF] = useState("");
  const [offF, setOffF] = useState("");
  const [modal, setModal] = useState(null);
  const [read, setRead] = useState(new Set(notificationsData.filter(n=>n.read).map(n=>n.id)));
  const [rules, setRules] = useState(rulesData);

  const inbox = notificationsData.filter(n => !read.has(n.id));
  
  const filtered = useMemo(() => {
    const base = view === "inbox" ? notificationsData.filter(n=>!read.has(n.id)) : notificationsData;
    return base.filter(n =>
      (!search || n.title.toLowerCase().includes(search.toLowerCase()) || n.entity.toLowerCase().includes(search.toLowerCase())) &&
      (!catF || n.category === catF) &&
      (!sevF || n.severity === sevF) &&
      (!offF || n.office === offF)
    );
  }, [view, search, catF, sevF, offF, read]);

  const selNotif = sel ? notificationsData.find(n=>n.id===sel) : null;
  const unread = notificationsData.filter(n=>!read.has(n.id)).length;
  const critical = notificationsData.filter(n=>n.severity==="Critical"&&!read.has(n.id)).length;

  const markRead = (id) => setRead(p => { const s=new Set(p); s.add(id); return s; });
  const markAllRead = () => setRead(new Set(notificationsData.map(n=>n.id)));
  const toggleRule = (id) => setRules(p=>p.map(r=>r.id===id?{...r,active:!r.active}:r));

  const NotifRow = ({ n }) => {
    const sev = severityColors[n.severity];
    const isRead = read.has(n.id);
    return (
      <div onClick={()=>{ setSel(sel===n.id?null:n.id); markRead(n.id); }}
        style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", cursor:"pointer", background:sel===n.id?"var(--bg-secondary,#f9f9f9)":isRead?"transparent":"rgba(0,180,216,0.03)", transition:"background 0.1s" }}>
        <div style={{ marginTop:4, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:isRead?"transparent":sev.dot, border:isRead?`1.5px solid #ddd`:"none", flexShrink:0 }} />
          {n.escalated && <span style={{ fontSize:9, color:"#EF4444", fontWeight:700 }}>ESC</span>}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
            <span style={{ fontSize:12, fontWeight:isRead?400:700, color:"var(--text-primary,#111)", lineHeight:1.3 }}>{n.title}</span>
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:4 }}>
            <Badge label={n.severity} colors={sev} />
            <Badge label={n.category} colors={categoryColors[n.category]} />
            <Badge label={n.office==="Isle of Man"?"IOM":n.office==="Cayman Islands"?"CYM":n.office==="United Kingdom"?"UK":n.office} colors={officeColors[n.office]} />
          </div>
          <div style={{ fontSize:11, color:"#aaa" }}>{n.assignee} · {n.date}</div>
        </div>
        <button onClick={e=>{ e.stopPropagation(); markRead(n.id); setSel(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#ccc", fontSize:14, flexShrink:0, padding:2 }}>✕</button>
      </div>
    );
  };

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>Affinity <span style={{ color:"var(--text-primary,#111)", fontWeight:400 }}>Core</span>
          <small style={{ fontSize:11, color:"#999", fontWeight:400, marginLeft:8 }}>Notifications</small>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entities","Compliance","Documents","Timesheets","Invoicing","Reporting"].map(n=>(
            <button key={n} style={s.nb}>{n}</button>
          ))}
          <button style={s.nbActive}>Notifications {unread>0&&<span style={{ marginLeft:4, background:"#EF4444", borderRadius:10, padding:"1px 5px", fontSize:10 }}>{unread}</span>}</button>
        </div>
      </div>

      {/* Sub nav */}
      <div style={s.subnav}>
        {VIEWS.map((v,i)=>(
          <button key={v} style={s.snb(view===v)} onClick={()=>{ setView(v); setSel(null); }}>
            {VIEW_LABELS[i]}
            {v==="inbox"&&unread>0&&<span style={{ marginLeft:5, background:CY, color:"#fff", borderRadius:10, padding:"0 5px", fontSize:10, fontWeight:700 }}>{unread}</span>}
          </button>
        ))}
        {(view==="inbox"||view==="all") && unread > 0 && (
          <button style={{ ...s.nb, fontSize:11, marginLeft:"auto" }} onClick={markAllRead}>Mark all read</button>
        )}
      </div>

      {/* INBOX + ALL */}
      {(view==="inbox"||view==="all") && (<>
        <div style={s.toolbar}>
          <div style={s.sw}><span style={{ color:"#aaa" }}>🔍</span><input style={s.swInput} placeholder="Search notifications..." value={search} onChange={e=>setSearch(e.target.value)} /></div>
          <select style={s.sel} value={catF} onChange={e=>setCatF(e.target.value)}>
            <option value="">All categories</option>
            {Object.keys(categoryColors).map(c=><option key={c}>{c}</option>)}
          </select>
          <select style={s.sel} value={sevF} onChange={e=>setSevF(e.target.value)}>
            <option value="">All severities</option>
            {["Critical","High","Medium","Low"].map(s=><option key={s}>{s}</option>)}
          </select>
          <select style={s.sel} value={offF} onChange={e=>setOffF(e.target.value)}>
            <option value="">All offices</option>
            {["Isle of Man","Malta","Cayman Islands","United Kingdom","Miami","Group"].map(o=><option key={o}>{o}</option>)}
          </select>
          <button style={s.addBtn} onClick={()=>setModal("newAlert")}>＋ Create alert</button>
        </div>

        <div style={s.stats}>
          {[
            { label:"Unread", val:unread, color:CY },
            { label:"Critical", val:critical, color:"#EF4444" },
            { label:"High", val:notificationsData.filter(n=>n.severity==="High"&&!read.has(n.id)).length, color:"#F59E0B" },
            { label:"Escalated", val:notificationsData.filter(n=>n.escalated).length, color:"#EF4444" },
            { label:"Total", val:notificationsData.length, color:null },
          ].map(c=>(
            <div key={c.label} style={s.sc}><div style={s.scL}>{c.label}</div><div style={s.scV(c.color)}>{c.val}</div></div>
          ))}
        </div>

        <div style={s.main}>
          <div style={s.list}>
            {/* Group by severity */}
            {["Critical","High","Medium","Low"].map(sev=>{
              const group = filtered.filter(n=>n.severity===sev);
              if(!group.length) return null;
              return (
                <div key={sev}>
                  <div style={{ padding:"8px 20px", background:"var(--bg-secondary,#f9f9f9)", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:severityColors[sev].dot }} />
                    <span style={{ fontSize:11, fontWeight:700, color:"var(--text-secondary,#666)", textTransform:"uppercase", letterSpacing:"0.4px" }}>{sev}</span>
                    <span style={{ fontSize:11, color:"#aaa" }}>— {group.length} alert{group.length!==1?"s":""}</span>
                  </div>
                  {group.map(n=><NotifRow key={n.id} n={n} />)}
                </div>
              );
            })}
            {filtered.length===0 && (
              <div style={{ padding:"40px 20px", textAlign:"center", color:"#aaa", fontSize:13 }}>
                {view==="inbox"?"🎉 All caught up — no unread notifications":"No notifications match your filters"}
              </div>
            )}
          </div>

          {selNotif && (
            <div style={s.detail}>
              <button style={s.closeX} onClick={()=>setSel(null)}>✕</button>
              <div style={{ marginBottom:10 }}>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                  <Badge label={selNotif.severity} colors={severityColors[selNotif.severity]} />
                  <Badge label={selNotif.category} colors={categoryColors[selNotif.category]} />
                  {selNotif.escalated && <Badge label="Escalated" colors={{ bg:"#FCEBEB", color:"#A32D2D" }} />}
                </div>
                <div style={s.dName}>{selNotif.title}</div>
              </div>
              <div style={s.dSec}>
                <div style={s.dSecT}>Details</div>
                <div style={s.dRow}><span style={s.dKey}>Entity</span><span style={{ ...s.dVal, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selNotif.entity}</span></div>
                <div style={s.dRow}><span style={s.dKey}>Office</span><span style={s.dVal}>{selNotif.office}</span></div>
                <div style={s.dRow}><span style={s.dKey}>Assigned to</span><span style={s.dVal}>{selNotif.assignee}</span></div>
                <div style={s.dRow}><span style={s.dKey}>Date</span><span style={s.dVal}>{selNotif.date}</span></div>
              </div>
              <div style={s.dSec}>
                <div style={s.dSecT}>Description</div>
                <div style={{ fontSize:12, color:"var(--text-secondary,#666)", lineHeight:1.6 }}>{selNotif.detail}</div>
              </div>
              <div style={s.actRow}>
                <button style={s.actBtn(true)} onClick={()=>markRead(selNotif.id)}>{selNotif.action} ↗</button>
                <button style={s.actBtn(false)}>Reassign ↗</button>
                {!selNotif.escalated && <button style={{ ...s.actBtn(false), color:"#EF4444", borderColor:"#EF4444" }}>Escalate ↗</button>}
              </div>
            </div>
          )}
        </div>
      </>)}

      {/* RULES */}
      {view==="rules" && (
        <>
          <div style={s.toolbar}>
            <div style={s.sw}><span style={{ color:"#aaa" }}>🔍</span><input style={s.swInput} placeholder="Search rules..." /></div>
            <select style={s.sel}><option value="">All severities</option>{["Critical","High","Medium","Low"].map(s=><option key={s}>{s}</option>)}</select>
            <button style={s.addBtn} onClick={()=>setModal("newRule")}>＋ New rule</button>
          </div>
          <div style={{ padding:"14px 20px 0", fontSize:12, color:"var(--text-secondary,#666)", background:"var(--bg-secondary,#f9f9f9)", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", paddingBottom:14 }}>
            ℹ️ Alert rules define when notifications are generated and who receives them. Critical rules cannot be disabled.
          </div>
          <div style={s.pad}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Trigger","Severity","Recipients","Timing","Active"].map(h=>(
                  <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--text-secondary,#666)", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-secondary,#f9f9f9)", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rules.map(r=>(
                  <tr key={r.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                    <td style={{ padding:"10px 14px", fontSize:12, fontWeight:500 }}>{r.trigger}</td>
                    <td style={{ padding:"10px 14px" }}><Badge label={r.severity} colors={severityColors[r.severity]} /></td>
                    <td style={{ padding:"10px 14px", fontSize:11, color:"var(--text-secondary,#666)" }}>{r.recipients}</td>
                    <td style={{ padding:"10px 14px", fontSize:11, color:"var(--text-secondary,#666)" }}>{r.timing}</td>
                    <td style={{ padding:"10px 14px" }}>
                      {r.severity==="Critical"
                        ? <span style={{ fontSize:11, color:"#aaa" }}>Always on</span>
                        : <button style={s.toggle(r.active)} onClick={()=>toggleRule(r.id)}>
                            <div style={{ width:16, height:16, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:r.active?18:2, transition:"left 0.15s" }} />
                          </button>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* DAILY DIGEST */}
      {view==="digest" && (
        <div style={s.pad}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700 }}>Daily digest — 14 July 2025</div>
              <div style={{ fontSize:12, color:"#aaa", marginTop:2 }}>Sent 07:00 each morning to all active users (filtered by office and role)</div>
            </div>
            <button style={s.addBtn}>📤 Send digest now</button>
          </div>

          {[
            { title:"🔴 Critical — immediate action required", items: notificationsData.filter(n=>n.severity==="Critical") },
            { title:"🟠 High priority", items: notificationsData.filter(n=>n.severity==="High") },
            { title:"🔵 Medium priority", items: notificationsData.filter(n=>n.severity==="Medium") },
          ].map(group=>(
            <div key={group.title} style={s.card}>
              <div style={s.cardT}>{group.title} — {group.items.length} item{group.items.length!==1?"s":""}</div>
              {group.items.map(n=>(
                <div key={n.id} style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"7px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", fontSize:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, marginBottom:2 }}>{n.title}</div>
                    <div style={{ fontSize:11, color:"#aaa" }}>{n.assignee} · {n.office} · {n.entity!=="—"?n.entity:""}</div>
                  </div>
                  <Badge label={n.category} colors={categoryColors[n.category]} />
                </div>
              ))}
            </div>
          ))}

          <div style={s.card}>
            <div style={s.cardT}>Digest settings</div>
            {[
              ["Send time", "07:00 daily"],
              ["Recipients", "All active users (filtered by office)"],
              ["Minimum severity", "Medium and above"],
              ["Format", "Email + in-app"],
              ["Include resolved", "No"],
            ].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", fontSize:12 }}>
                <span style={{ color:"var(--text-secondary,#666)" }}>{k}</span>
                <span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
            <button style={{ ...s.nb, marginTop:12, fontSize:11 }} onClick={()=>setModal("digestConfig")}>Configure digest settings ↗</button>
          </div>
        </div>
      )}

      {/* HISTORY */}
      {view==="history" && (
        <>
          <div style={s.toolbar}>
            <div style={s.sw}><span style={{ color:"#aaa" }}>🔍</span><input style={s.swInput} placeholder="Search history..." /></div>
            <select style={s.sel}><option>Last 30 days</option><option>Last 90 days</option><option>Last 6 months</option></select>
            <select style={s.sel}><option value="">All categories</option>{Object.keys(categoryColors).map(c=><option key={c}>{c}</option>)}</select>
          </div>
          <div style={s.pad}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Notification","Category","Severity","Assignee","Date","Resolved"].map(h=>(
                  <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--text-secondary,#666)", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-secondary,#f9f9f9)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {notificationsData.map(n=>(
                  <tr key={n.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                    <td style={{ padding:"9px 14px", fontSize:12, fontWeight:500, maxWidth:280, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n.title}</td>
                    <td style={{ padding:"9px 14px" }}><Badge label={n.category} colors={categoryColors[n.category]} /></td>
                    <td style={{ padding:"9px 14px" }}><Badge label={n.severity} colors={severityColors[n.severity]} /></td>
                    <td style={{ padding:"9px 14px", fontSize:12, color:"var(--text-secondary,#666)" }}>{n.assignee}</td>
                    <td style={{ padding:"9px 14px", fontSize:11, color:"var(--text-secondary,#666)" }}>{n.date}</td>
                    <td style={{ padding:"9px 14px" }}><Badge label={read.has(n.id)?"Actioned":"Open"} colors={read.has(n.id)?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#FCEBEB",color:"#A32D2D"}} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* MODALS */}
      {modal && (
        <div style={s.modal} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={s.modalBox}>
            {modal==="newRule" && (<>
              <div style={s.modalTitle}>New alert rule</div>
              <div style={s.fgGrid}>
                <div style={{ ...s.fg, gridColumn:"1/-1" }}><label style={s.fgl}>Trigger event</label><input style={s.fgi} placeholder="e.g. Invoice overdue 30 days" /></div>
                <div style={s.fg}><label style={s.fgl}>Severity</label><select style={s.fgi}><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></div>
                <div style={s.fg}><label style={s.fgl}>Module</label><select style={s.fgi}>{["Compliance","KYC","Invoicing","Timesheets","Onboarding","Documents","System","Entities"].map(m=><option key={m}>{m}</option>)}</select></div>
                <div style={{ ...s.fg, gridColumn:"1/-1" }}><label style={s.fgl}>Recipients</label><input style={s.fgi} placeholder="e.g. Assigned admin + MD" /></div>
                <div style={{ ...s.fg, gridColumn:"1/-1" }}><label style={s.fgl}>Timing / schedule</label><input style={s.fgi} placeholder="e.g. Immediately, or 30 days before" /></div>
                <div style={s.fg}><label style={s.fgl}>Applies to office</label><select style={s.fgi}><option>All offices</option><option>Isle of Man</option><option>Malta</option><option>Cayman Islands</option></select></div>
                <div style={s.fg}><label style={s.fgl}>Active</label><select style={s.fgi}><option>Yes</option><option>No</option></select></div>
              </div>
              <div style={s.mActions}><button style={s.btnC} onClick={()=>setModal(null)}>Cancel</button><button style={s.btnS} onClick={()=>setModal(null)}>Save rule</button></div>
            </>)}
            {modal==="newAlert" && (<>
              <div style={s.modalTitle}>Create manual alert</div>
              <div style={s.fgGrid}>
                <div style={{ ...s.fg, gridColumn:"1/-1" }}><label style={s.fgl}>Title</label><input style={s.fgi} placeholder="Alert title" /></div>
                <div style={s.fg}><label style={s.fgl}>Category</label><select style={s.fgi}>{Object.keys(categoryColors).map(c=><option key={c}>{c}</option>)}</select></div>
                <div style={s.fg}><label style={s.fgl}>Severity</label><select style={s.fgi}><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></div>
                <div style={{ ...s.fg, gridColumn:"1/-1" }}><label style={s.fgl}>Entity (if applicable)</label><input style={s.fgi} placeholder="Entity name" /></div>
                <div style={s.fg}><label style={s.fgl}>Office</label><select style={s.fgi}><option>Isle of Man</option><option>Malta</option><option>Cayman Islands</option><option>United Kingdom</option><option>Miami</option><option>Group</option></select></div>
                <div style={s.fg}><label style={s.fgl}>Assign to</label><input style={s.fgi} placeholder="Name" /></div>
                <div style={{ ...s.fg, gridColumn:"1/-1" }}><label style={s.fgl}>Description</label><textarea style={{ ...s.fgi, height:70, padding:"8px 10px" }} placeholder="Detail..." /></div>
              </div>
              <div style={s.mActions}><button style={s.btnC} onClick={()=>setModal(null)}>Cancel</button><button style={s.btnS} onClick={()=>setModal(null)}>Create alert</button></div>
            </>)}
            {modal==="digestConfig" && (<>
              <div style={s.modalTitle}>Digest settings</div>
              <div style={s.fg}><label style={s.fgl}>Send time</label><input style={s.fgi} defaultValue="07:00" /></div>
              <div style={s.fg}><label style={s.fgl}>Minimum severity</label><select style={s.fgi}><option>Medium and above</option><option>High and above</option><option>Critical only</option><option>All</option></select></div>
              <div style={s.fg}><label style={s.fgl}>Format</label><select style={s.fgi}><option>Email + in-app</option><option>Email only</option><option>In-app only</option></select></div>
              <div style={s.mActions}><button style={s.btnC} onClick={()=>setModal(null)}>Cancel</button><button style={s.btnS} onClick={()=>setModal(null)}>Save settings</button></div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
