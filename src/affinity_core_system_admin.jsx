import { useState } from "react";
import { ROLES, ROLE_LABELS, permsFor } from "./affinity_core_rbac";

const CY = "#00C4CC";

const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);

const roleColors = {
  "Super Admin":    { bg:"#001242", color:"#fff" },
  "Group Director": { bg:"#E6F7FB", color:"#0077A8" },
  "Managing Director":{ bg:"#E6F1FB", color:"#0C447C" },
  "Director":       { bg:"#EEF0FB", color:"#3C3489" },
  "MLRO":           { bg:"#FBEAF0", color:"#72243E" },
  "CFO":            { bg:"#EAF3DE", color:"#27500A" },
  "CCO":            { bg:"#FAEEDA", color:"#633806" },
  "Manager":        { bg:"#F1EFE8", color:"#444441" },
  "Administrator":  { bg:"#E6F7FB", color:"#0077A8" },
  "Read only":      { bg:"#F5F5F5", color:"#888" },
};

const officeColors = {
  "Isle of Man":    { bg:"#E6F7FB", color:"#0077A8" },
  "Malta":          { bg:"#EEF0FB", color:"#3C3489" },
  "Cayman Islands": { bg:"#E6EEF7", color:"#0D4A7A" },
  "United Kingdom": { bg:"#F1EFE8", color:"#444441" },
  "Miami":          { bg:"#FBEAF0", color:"#72243E" },
  "Group":          { bg:"#00124226", color:"#001242" },
};

const usersData = [
  { id:1, name:"Andrew Morgan", email:"andrew.morgan@affinityco.com", role:"CEO — Super Admin", office:"USA", flag:"🇺🇸", status:"Active", lastLogin:"Today 09:14", mfa:true, modules:["All"] },
  { id:2, name:"Michael Barlow", email:"michael.barlow@affinityco.com", role:"Compliance Manager (IOM)", office:"Isle of Man", flag:"🇮🇲", status:"Active", lastLogin:"Today 08:52", mfa:true, modules:["Compliance","Entities","Reporting"] },
  { id:3, name:"Joanne Fenech", email:"joanne.fenech@affinityco.com", role:"Managing Director (IOM)", office:"Malta", flag:"🇲🇹", status:"Active", lastLogin:"Yesterday", mfa:true, modules:["All — Malta"] },
  { id:4, name:"Krista Fenech", email:"krista.fenech@affinityco.com", role:"Client Administrator", office:"Malta", flag:"🇲🇹", status:"Active", lastLogin:"Today 07:38", mfa:false, modules:["Entities","Documents","Timesheets"] },
  { id:5, name:"Alexandra Gardner", email:"alexandra.gardner@affinityco.com", role:"COO — Super Admin", office:"USA", flag:"🇺🇸", status:"Active", lastLogin:"Today 09:01", mfa:true, modules:["All"] },
  { id:6, name:"Debbie Gooding", email:"debbie.gooding@affinityco.com", role:"Manager", office:"Isle of Man", flag:"🇮🇲", status:"Active", lastLogin:"Today 08:45", mfa:true, modules:["Entities","Documents","Timesheets","Onboarding"] },
  { id:7, name:"Natalie Johnson", email:"natalie.johnson@affinityco.com", role:"Assistant Compliance Administrator", office:"USA", flag:"🇺🇸", status:"Active", lastLogin:"Today 08:21", mfa:true, modules:["Compliance","Entities","Reporting"] },
  { id:8, name:"Neil Kelly", email:"neil.kelly@affinityco.com", role:"CFO", office:"USA", flag:"🇺🇸", status:"Active", lastLogin:"2d ago", mfa:false, modules:["Reporting","Invoicing","Timesheets","Entities"] },
  { id:9, name:"Elena Pace", email:"elena.pace@affinityco.com", role:"Manager", office:"Isle of Man", flag:"🇮🇲", status:"Active", lastLogin:"Yesterday", mfa:true, modules:["Entities","Documents","Timesheets","Onboarding"] },
  { id:10, name:"Shanya Pickett", email:"shanya.pickett@affinityco.com", role:"Assistant Manager", office:"Isle of Man", flag:"🇮🇲", status:"Active", lastLogin:"Today 10:02", mfa:true, modules:["Entities","Documents","Timesheets"] },
  { id:11, name:"Mattei Pisani", email:"mattei.pisani@affinityco.com", role:"Director (Malta)", office:"Isle of Man", flag:"🇮🇲", status:"Active", lastLogin:"3d ago", mfa:true, modules:["Entities","Documents","Timesheets"] },
  { id:12, name:"Colin Quayle", email:"colin.quayle@affinityco.com", role:"Director and Company Secretary (IOM)", office:"Isle of Man", flag:"🇮🇲", status:"Active", lastLogin:"Today 08:30", mfa:false, modules:["Entities","Documents","Timesheets"] },
  { id:13, name:"Kate Shaw", email:"kate.shaw@affinityco.com", role:"Manager", office:"Isle of Man", flag:"🇮🇲", status:"Active", lastLogin:"4d ago", mfa:true, modules:["Entities","Documents","Timesheets","Onboarding"] },
  { id:14, name:"Roxy Sheeley", email:"roxy.sheeley@affinityco.com", role:"Managing Director (IOM)", office:"Isle of Man", flag:"🇮🇲", status:"Active", lastLogin:"Today 09:25", mfa:true, modules:["All — Isle of Man"] },
  { id:15, name:"Gilbert Spiteri Spadaro", email:"gilbert.spiterispadaro@affinityco.com", role:"Compliance Officer (Malta)", office:"Malta", flag:"🇲🇹", status:"Active", lastLogin:"Today 08:55", mfa:true, modules:["Compliance","Entities","Reporting"] },
  { id:16, name:"Gary Harrison", email:"gary.harrison@affinityco.com", role:"COO", office:"Isle of Man", flag:"🇮🇲", status:"Active", lastLogin:"Today 09:30", mfa:true, modules:["All — Isle of Man"] },
];

const rolesData = [
  { role:"Super Admin",     users:2,  desc:"Full system access including System Admin. Group level only.",          permissions:["All modules","User management","System config","Audit log","All offices"] },
  { role:"Group Director",  users:1,  desc:"Full access across all offices. Cannot access System Admin.",           permissions:["All modules","All offices","Reporting"] },
  { role:"Managing Director",users:2, desc:"Full access within assigned office. Cross-office reporting view.",      permissions:["All modules — assigned office","Reporting (own office)","Onboarding approval"] },
  { role:"Director",        users:2,  desc:"Operational director. Full entity and compliance access in office.",    permissions:["Entities","Compliance","DMS","Onboarding","Invoicing","Timesheets"] },
  { role:"MLRO",            users:1,  desc:"Compliance-only access. Sanctions, cases, PEP register, risk ratings.", permissions:["Compliance (full)","Reporting (compliance)","Read-only entities"] },
  { role:"CFO",             users:1,  desc:"Finance and reporting access.",                                         permissions:["Invoicing","Reporting","Timesheets (approve)","Read-only entities"] },
  { role:"CCO",             users:1,  desc:"Group compliance oversight. Cannot edit entities or invoices.",         permissions:["Compliance (full — all offices)","Reporting","Read-only entities"] },
  { role:"Manager",         users:0,  desc:"Team leader. Can approve timesheets and onboardings in own office.",    permissions:["Entities","DMS","Timesheets (approve)","Onboarding (approve)"] },
  { role:"Administrator",   users:4,  desc:"Day-to-day admin. Entity, document and timesheet access.",             permissions:["Entities","DMS","Timesheets","Onboarding (create)","Compliance (read)"] },
  { role:"Read only",       users:1,  desc:"View-only across permitted modules. Cannot create or edit.",            permissions:["Assigned modules — read only"] },
];

const officesData = [
  { office:"Isle of Man", code:"IOM", reg:"Affinity Group Ltd", regNo:"117843C", address:"Second Floor, 14 Athol Street, Douglas, Isle of Man, IM1 1JA", regulator:"Isle of Man FSA", licence:"CSP licence no. XXXXXX", currency:"GBP", md:"Roxy Sheeley", users:3, entities:114, active:true },
  { office:"Malta",       code:"MLT", reg:"Affinity Malta Ltd", regNo:"C-88221",  address:"Level 3, Spinola Park, St Julian's, Malta",                       regulator:"MFSA",          licence:"Category 4B CSP",          currency:"EUR", md:"Joanne Fenech", users:2, entities:52,  active:true },
  { office:"Cayman Islands",code:"CYM",reg:"Affinity Cayman Ltd",regNo:"CY-12344",address:"Harbour Place, 103 South Church Street, George Town, Cayman Islands",regulator:"CIMA",        licence:"CIMA CSP licence",          currency:"USD", md:"Garry Crossan",users:2, entities:87,  active:true },
  { office:"United Kingdom",code:"UK", reg:"Affinity UK Ltd",   regNo:"14421876", address:"1 Canada Square, Canary Wharf, London, E14 5AB",                   regulator:"HMRC / FCA",    licence:"MLR registration",          currency:"GBP", md:"Andy Morgan",  users:1, entities:31,  active:true },
  { office:"Miami",       code:"MIA", reg:"Affinity Miami LLC", regNo:"FL-2022-881",address:"1221 Brickell Avenue, Suite 900, Miami, FL 33131",               regulator:"FinCEN",        licence:"BSA registration",          currency:"USD", md:"Andy Morgan",  users:1, entities:16,  active:true },
];

const auditLog = [
  { id:1,  ts:"14/07/2025 09:14", user:"Andy Morgan",   action:"User login",                   module:"System",    entity:"—",                      ip:"89.101.xx.xx" },
  { id:2,  ts:"14/07/2025 09:01", user:"Roxy Sheeley",  action:"Document uploaded",            module:"DMS",       entity:"Meridian Holdings Ltd",  ip:"89.101.xx.xx" },
  { id:3,  ts:"14/07/2025 08:52", user:"Alex Gardner",  action:"User login",                   module:"System",    entity:"—",                      ip:"91.214.xx.xx" },
  { id:4,  ts:"14/07/2025 08:45", user:"Joanne Fenech", action:"KYC record updated",           module:"Compliance",entity:"Stonebridge Capital Ltd", ip:"85.25.xx.xx"  },
  { id:5,  ts:"14/07/2025 08:21", user:"Garry Crossan", action:"Invoice sent to client",       module:"Invoicing", entity:"Pacific Wealth Trust",   ip:"76.185.xx.xx" },
  { id:6,  ts:"14/07/2025 07:38", user:"Gary Harrison", action:"Compliance case raised",       module:"Compliance",entity:"Apex Growth Fund Ltd",    ip:"89.101.xx.xx" },
  { id:7,  ts:"13/07/2025 17:45", user:"Joanne Fenech", action:"Timesheet submitted",          module:"Timesheets",entity:"—",                       ip:"85.25.xx.xx"  },
  { id:8,  ts:"13/07/2025 17:30", user:"Garry Crossan", action:"Timesheet submitted",          module:"Timesheets",entity:"—",                       ip:"76.185.xx.xx" },
  { id:9,  ts:"13/07/2025 16:22", user:"Roxy Sheeley",  action:"Entity record edited",         module:"Entities",  entity:"North Star Holdings Ltd", ip:"89.101.xx.xx" },
  { id:10, ts:"13/07/2025 15:10", user:"Neil Kelly",    action:"Invoice approved",             module:"Invoicing", entity:"Rosewood Legacy Trust",   ip:"89.101.xx.xx" },
  { id:11, ts:"13/07/2025 14:05", user:"Gary Harrison", action:"Risk rating changed High→VHigh",module:"Compliance",entity:"Apex Growth Fund Ltd",   ip:"89.101.xx.xx" },
  { id:12, ts:"13/07/2025 11:30", user:"Andy Morgan",   action:"New user created",             module:"System",    entity:"Tom Reyes",               ip:"89.101.xx.xx" },
  { id:13, ts:"13/07/2025 10:15", user:"Roxy Sheeley",  action:"Onboarding stage advanced",   module:"Onboarding",entity:"Pinnacle Trading Ltd",     ip:"89.101.xx.xx" },
  { id:14, ts:"12/07/2025 16:44", user:"Gary Harrison", action:"Sanction match flagged — open",module:"Compliance",entity:"Apex Growth Fund Ltd",    ip:"89.101.xx.xx" },
  { id:15, ts:"12/07/2025 14:20", user:"Neil Kelly",    action:"Credit note raised",           module:"Invoicing", entity:"Thornbury Asset Co Ltd",  ip:"89.101.xx.xx" },
];

const feeSchedules = [
  { office:"Isle of Man",    type:"Company admin",     fee:"£2,000",  freq:"Per annum",  currency:"GBP" },
  { office:"Isle of Man",    type:"Trustee fee",       fee:"£2,400",  freq:"Per annum",  currency:"GBP" },
  { office:"Isle of Man",    type:"Directorship",      fee:"£1,500",  freq:"Per annum",  currency:"GBP" },
  { office:"Isle of Man",    type:"Registered office", fee:"£500",    freq:"Per annum",  currency:"GBP" },
  { office:"Malta",          type:"Company admin",     fee:"€1,800",  freq:"Per annum",  currency:"EUR" },
  { office:"Malta",          type:"Foundation admin",  fee:"€2,200",  freq:"Per annum",  currency:"EUR" },
  { office:"Malta",          type:"Directorship",      fee:"€1,200",  freq:"Per annum",  currency:"EUR" },
  { office:"Cayman Islands", type:"Company admin",     fee:"$3,600",  freq:"Per annum",  currency:"USD" },
  { office:"Cayman Islands", type:"Trustee fee",       fee:"$3,000",  freq:"Per annum",  currency:"USD" },
  { office:"Cayman Islands", type:"Directorship",      fee:"$2,000",  freq:"Per annum",  currency:"USD" },
  { office:"United Kingdom", type:"Company admin",     fee:"£1,800",  freq:"Per annum",  currency:"GBP" },
  { office:"Miami",          type:"Company admin",     fee:"$2,400",  freq:"Per annum",  currency:"USD" },
];

const VIEWS = ["users","roles","matrix","offices","fees","audit","config","checklist"];
const VIEW_LABELS = ["Users","Roles & permissions","Permission matrix","Offices","Fee schedules","Audit log","System config","Implementation checklist"];
const MATRIX_MODULES = [
  ["Entity Admin","entities"],["CRM","crm"],["Documents","documents"],["Onboarding","onboarding"],["Timesheets","timesheets"],
  ["WIP","acc_wip"],["Invoicing","invoicing"],["Bookkeeping","bookkeeping"],
  ["Accounting · Transactions","acc_txn"],["Accounting · Assets & Groups","acc_assets"],["Accounting · Reporting","acc_report"],["Accounting · Governance","acc_gov"],
  ["Budgeting","budgeting"],["Reporting","reporting"],["Procedures","procedures"],["Generate doc","generate"],
  ["Audit log","audit"],["Client portal","client_portal"],["System admin","system"],
];

const s = {
  wrap:{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 },
  header:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" },
  logo:{ fontSize:18, fontWeight:500, color:CY },
  subnav:{ display:"flex", gap:4, padding:"10px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-secondary,#f9f9f9)", flexWrap:"wrap" },
  snb:(a)=>({ padding:"5px 14px", fontSize:12, borderRadius:20, border:`0.5px solid ${a?"var(--border-secondary,#ccc)":"var(--border-tertiary,#e5e5e5)"}`, background:a?"var(--bg-primary,#fff)":"transparent", color:a?"var(--text-primary,#111)":"var(--text-secondary,#666)", cursor:"pointer", fontWeight:a?600:400, whiteSpace:"nowrap" }),
  toolbar:{ display:"flex", alignItems:"center", gap:8, padding:"12px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", flexWrap:"wrap" },
  sw:{ display:"flex", alignItems:"center", gap:8, background:"var(--bg-primary,#fff)", border:"0.5px solid var(--border-secondary,#ccc)", borderRadius:6, padding:"0 12px", flex:1, minWidth:160 },
  swInput:{ border:"none", background:"transparent", fontSize:13, color:"var(--text-primary,#111)", outline:"none", width:"100%", height:32 },
  sel:{ height:32, padding:"0 8px", fontSize:12, borderRadius:6, border:"0.5px solid var(--border-secondary,#ccc)", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", cursor:"pointer" },
  addBtn:{ display:"flex", alignItems:"center", gap:5, padding:"0 14px", height:32, background:CY, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", marginLeft:"auto" },
  stats:{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, padding:"14px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" },
  sc:{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 14px" },
  scL:{ fontSize:11, color:"var(--text-secondary,#666)", marginBottom:3 },
  scV:(c)=>({ fontSize:20, fontWeight:700, color:c||"var(--text-primary,#111)" }),
  main:{ display:"flex" },
  tarea:{ flex:1, overflowX:"auto" },
  ct:{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" },
  th:{ padding:"9px 14px", textAlign:"left", fontSize:11, fontWeight:600, color:"var(--text-secondary,#666)", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-secondary,#f9f9f9)", whiteSpace:"nowrap" },
  td:{ padding:"9px 14px", fontSize:12, color:"var(--text-primary,#111)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" },
  en:{ fontWeight:600, fontSize:12 },
  er:{ fontSize:11, color:"var(--text-tertiary,#999)", marginTop:1 },
  detail:{ borderLeft:"0.5px solid var(--border-tertiary,#e5e5e5)", width:270, minWidth:270, background:"var(--bg-primary,#fff)", padding:16, overflowY:"auto" },
  dName:{ fontSize:13, fontWeight:700, marginBottom:2 },
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
  card:{ background:"var(--bg-primary,#fff)", border:"0.5px solid var(--border-tertiary,#e5e5e5)", borderRadius:10, padding:16, marginBottom:14 },
  cardT:{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12, color:"var(--text-primary,#111)" },
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
  btnDanger:{ background:"#EF4444", color:"#fff", border:"none", padding:"7px 18px", borderRadius:6, fontSize:12, fontWeight:700, cursor:"pointer" },
  toggle:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", fontSize:13 },
  toggleBtn:(on)=>({ width:36, height:20, borderRadius:10, background:on?CY:"#ccc", border:"none", cursor:"pointer", position:"relative", flexShrink:0 }),
  infoBox:{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 12px", fontSize:12, color:"var(--text-secondary,#666)", marginBottom:14, lineHeight:1.5 },
};

const nb = { padding:"5px 12px", fontSize:12, borderRadius:6, border:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"transparent", color:"var(--text-secondary,#666)", cursor:"pointer" };
const nbActive = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:700 };

export default function AffinityCoreSystemAdmin() {
  const [view, setView] = useState("users");
  const [search, setSearch] = useState("");
  const [officeF, setOfficeF] = useState("");
  const [roleF, setRoleF] = useState("");
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const [auditSearch, setAuditSearch] = useState("");
  const [checklist, setChecklist] = useState([
    { item:"MFA (TOTP) enabled for all users", note:"Delivered via Entra / Supabase Auth", status:"Backend / Entra" },
    { item:"Session timeout 5h + 4.5h warning", note:"Entra Conditional Access", status:"Backend / Entra" },
    { item:"Role-Module matrix completed & implemented", note:"UI layer live; backend enforcement pending", status:"In progress" },
    { item:"Audit logging captures before/after values", note:"Needs immutable backend store", status:"Not started" },
    { item:"System Admin field/workflow/security capabilities", note:"", status:"Not started" },
    { item:"TLS 1.3+ encryption in transit", note:"Netlify / Supabase default", status:"Done" },
    { item:"AES-256 encryption at rest", note:"Supabase default", status:"Backend / Entra" },
    { item:"Data retention policies per jurisdiction", note:"Engine retention_policy (db/048); align to doc table", status:"In progress" },
    { item:"Penetration testing completed", note:"", status:"Not started" },
    { item:"Incident response procedures documented", note:"", status:"Not started" },
  ]);
  const [configToggles, setConfigToggles] = useState({
    mfaRequired: true, auditLog: true, sessionTimeout: true,
    emailNotifs: true, autoReminders: true, wipAlerts: true,
    kycAlerts: true, retainerAuto: false, portalEnabled: false,
  });

  const filteredUsers = usersData.filter(u =>
    (!search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) &&
    (!officeF || u.office === officeF) &&
    (!roleF || u.role === roleF)
  );

  const selUser = sel ? usersData.find(u => u.id === sel) : null;

  const Toggle = ({ label, sub, key2 }) => (
    <div style={s.toggle}>
      <div>
        <div style={{ fontWeight:500 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{sub}</div>}
      </div>
      <button style={s.toggleBtn(configToggles[key2])} onClick={() => setConfigToggles(p => ({ ...p, [key2]: !p[key2] }))}>
        <div style={{ width:16, height:16, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:configToggles[key2]?18:2, transition:"left 0.15s" }} />
      </button>
    </div>
  );

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>System Admin</div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entities","Compliance","Documents","Invoicing","Reporting"].map(n => <button key={n} style={nb}>{n}</button>)}
          <button style={nbActive}>System</button>
        </div>
      </div>

      {/* Sub nav */}
      <div style={s.subnav}>
        {VIEWS.map((v,i) => <button key={v} style={s.snb(view===v)} onClick={()=>{setView(v);setSel(null);}}>{VIEW_LABELS[i]}</button>)}
      </div>

      {/* ── USERS ── */}
      {view === "users" && (<>
        <div style={s.toolbar}>
          <div style={s.sw}><span style={{ color:"#aaa" }}>🔍</span><input style={s.swInput} placeholder="Search users..." value={search} onChange={e=>{setSearch(e.target.value)}} /></div>
          <select style={s.sel} value={officeF} onChange={e=>setOfficeF(e.target.value)}>
            <option value="">All offices</option>
            {["Isle of Man","Malta","Cayman Islands","United Kingdom","Miami","Group"].map(o=><option key={o}>{o}</option>)}
          </select>
          <select style={s.sel} value={roleF} onChange={e=>setRoleF(e.target.value)}>
            <option value="">All roles</option>
            {Object.keys(roleColors).map(r=><option key={r}>{r}</option>)}
          </select>
          <button style={s.addBtn} onClick={()=>setModal("newUser")}>＋ Add user</button>
        </div>
        <div style={s.stats}>
          {[
            { label:"Total users", val:usersData.length, color:CY },
            { label:"Active", val:usersData.filter(u=>u.status==="Active").length, color:"#4CAF7D" },
            { label:"MFA enabled", val:usersData.filter(u=>u.mfa).length, color:CY },
            { label:"Without MFA", val:usersData.filter(u=>!u.mfa).length, color:"#F59E0B" },
          ].map(c=>(
            <div key={c.label} style={s.sc}><div style={s.scL}>{c.label}</div><div style={s.scV(c.color)}>{c.val}</div></div>
          ))}
        </div>
        <div style={s.main}>
          <div style={s.tarea}>
            <table style={s.ct}>
              <thead><tr>
                <th style={{ ...s.th, width:"22%" }}>Name</th>
                <th style={{ ...s.th, width:"24%" }}>Email</th>
                <th style={{ ...s.th, width:"14%" }}>Role</th>
                <th style={{ ...s.th, width:"14%" }}>Office</th>
                <th style={{ ...s.th, width:"10%" }}>MFA</th>
                <th style={{ ...s.th, width:"10%" }}>Status</th>
                <th style={{ ...s.th, width:"16%" }}>Last login</th>
              </tr></thead>
              <tbody>
                {filteredUsers.map(u=>(
                  <tr key={u.id} onClick={()=>setSel(sel===u.id?null:u.id)} style={{ cursor:"pointer", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:sel===u.id?"var(--bg-secondary,#f9f9f9)":"transparent" }}>
                    <td style={s.td}><div style={s.en}>{u.name}</div></td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)", fontSize:11 }}>{u.email}</td>
                    <td style={s.td}><Badge label={u.role} colors={roleColors[u.role]} /></td>
                    <td style={s.td}><span style={{fontSize:18,lineHeight:1}} title={u.office}>{u.flag}</span></td>
                    <td style={s.td}>{u.mfa ? <span style={{ color:"#4CAF7D", fontWeight:700, fontSize:13 }}>✓</span> : <span style={{ color:"#F59E0B", fontWeight:700 }}>⚠</span>}</td>
                    <td style={s.td}><Badge label={u.status} colors={u.status==="Active"?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#F1EFE8",color:"#888"}} /></td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)", fontSize:11 }}>{u.lastLogin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selUser && (
            <div style={s.detail}>
              <button style={s.closeX} onClick={()=>setSel(null)}>✕</button>
              <div style={s.dName}>{selUser.name}</div>
              <div style={s.dRef}>{selUser.email}</div>
              <div style={s.dSec}>
                <div style={s.dSecT}>Account</div>
                <div style={s.dRow}><span style={s.dKey}>Role</span><span style={s.dVal}><Badge label={selUser.role} colors={roleColors[selUser.role]} /></span></div>
                <div style={s.dRow}><span style={s.dKey}>Office</span><span style={s.dVal}><Badge label={selUser.office} colors={officeColors[selUser.office]} /></span></div>
                <div style={s.dRow}><span style={s.dKey}>Status</span><span style={s.dVal}>{selUser.status}</span></div>
                <div style={s.dRow}><span style={s.dKey}>MFA</span><span style={{ ...s.dVal, color:selUser.mfa?"#4CAF7D":"#F59E0B" }}>{selUser.mfa?"Enabled":"Not enabled"}</span></div>
                <div style={s.dRow}><span style={s.dKey}>Last login</span><span style={s.dVal}>{selUser.lastLogin}</span></div>
              </div>
              <div style={s.dSec}>
                <div style={s.dSecT}>Module access</div>
                {selUser.modules.map(m=>(
                  <div key={m} style={{ fontSize:12, padding:"3px 0", color:"var(--text-secondary,#666)", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>✓ {m}</div>
                ))}
              </div>
              <div style={s.actRow}>
                <button style={s.actBtn(false)} onClick={()=>setModal("editUser")}>Edit ↗</button>
                {!selUser.mfa && <button style={{ ...s.actBtn(false), color:"#F59E0B", borderColor:"#F59E0B" }}>Enforce MFA ↗</button>}
                <button style={{ ...s.actBtn(false), color:"#EF4444", borderColor:"#EF4444" }}>Suspend ↗</button>
              </div>
            </div>
          )}
        </div>
      </>)}

      {/* ── ROLES ── */}
      {view === "roles" && (
        <div style={s.pad}>
          <div style={{ ...s.infoBox, marginBottom:16 }}>ℹ️ Roles define what each user can see and do within Affinity Core. Permissions are enforced at module level and by office. Contact a Super Admin to modify role permissions.</div>
          {rolesData.map(r=>(
            <div key={r.role} style={s.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                    <Badge label={r.role} colors={roleColors[r.role]} />
                    <span style={{ fontSize:11, color:"#999" }}>{r.users} user{r.users!==1?"s":""}</span>
                  </div>
                  <div style={{ fontSize:12, color:"var(--text-secondary,#666)", lineHeight:1.5 }}>{r.desc}</div>
                </div>
                <button style={{ ...nb, fontSize:11, padding:"4px 10px", flexShrink:0, marginLeft:12 }} onClick={()=>setModal("editRole")}>Edit</button>
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                {r.permissions.map(p=>(
                  <span key={p} style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"var(--bg-secondary,#f9f9f9)", color:"var(--text-secondary,#666)", border:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>{p}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── OFFICES ── */}
      {view === "offices" && (
        <div style={s.pad}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {officesData.map(o=>(
              <div key={o.office} style={{ ...s.card, borderLeft:`3px solid ${CY}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <Badge label={o.code} colors={officeColors[o.office]} />
                    <span style={{ fontSize:14, fontWeight:700 }}>{o.office}</span>
                  </div>
                  <Badge label={o.active?"Active":"Inactive"} colors={o.active?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#F1EFE8",color:"#888"}} />
                </div>
                {[
                  ["Legal entity", o.reg],
                  ["Reg. number", o.regNo],
                  ["Address", o.address],
                  ["Regulator", o.regulator],
                  ["Licence", o.licence],
                  ["Currency", o.currency],
                  ["Managing Director", o.md],
                  ["Users", o.users],
                  ["Entities administered", o.entities],
                ].map(([k,v])=>(
                  <div key={k} style={{ ...s.dRow, fontSize:12 }}>
                    <span style={s.dKey}>{k}</span>
                    <span style={{ fontWeight:500, textAlign:"right", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop:10 }}>
                  <button style={{ ...nb, fontSize:11, padding:"4px 10px" }} onClick={()=>setModal("editOffice")}>Edit office config ↗</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FEE SCHEDULES ── */}
      {view === "fees" && (
        <>
          <div style={s.toolbar}>
            <div style={s.sw}><span style={{ color:"#aaa" }}>🔍</span><input style={s.swInput} placeholder="Search fee schedule..." /></div>
            <select style={s.sel}>
              <option value="">All offices</option>
              {["Isle of Man","Malta","Cayman Islands","United Kingdom","Miami"].map(o=><option key={o}>{o}</option>)}
            </select>
            <button style={s.addBtn} onClick={()=>setModal("newFee")}>＋ Add fee</button>
          </div>
          <div style={s.pad}>
            <div style={{ ...s.infoBox }}>ℹ️ Fee schedules define standard rates per office and service type. These are used to auto-calculate retainer invoices and WIP recovery rates. Changes require Super Admin or CFO approval.</div>
            <table style={s.ct}>
              <thead><tr>
                <th style={{ ...s.th, width:"24%" }}>Office</th>
                <th style={{ ...s.th, width:"28%" }}>Service type</th>
                <th style={{ ...s.th, width:"18%" }}>Standard fee</th>
                <th style={{ ...s.th, width:"16%" }}>Frequency</th>
                <th style={{ ...s.th, width:"14%" }}>Currency</th>
              </tr></thead>
              <tbody>
                {feeSchedules.map((f,i)=>(
                  <tr key={i} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", cursor:"pointer" }}>
                    <td style={s.td}><Badge label={f.office} colors={officeColors[f.office]} /></td>
                    <td style={s.td}>{f.type}</td>
                    <td style={{ ...s.td, fontWeight:700 }}>{f.fee}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{f.freq}</td>
                    <td style={s.td}>{f.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── AUDIT LOG ── */}
      {view === "audit" && (
        <>
          <div style={s.toolbar}>
            <div style={s.sw}><span style={{ color:"#aaa" }}>🔍</span><input style={s.swInput} placeholder="Search audit log..." value={auditSearch} onChange={e=>setAuditSearch(e.target.value)} /></div>
            <select style={s.sel}>
              <option value="">All modules</option>
              {["System","Entities","Compliance","DMS","Onboarding","Timesheets","Invoicing","Reporting"].map(m=><option key={m}>{m}</option>)}
            </select>
            <select style={s.sel}>
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
              <option>Custom range</option>
            </select>
            <button style={s.addBtn} onClick={()=>{}}>📥 Export log</button>
          </div>
          <div style={{ ...s.stats, gridTemplateColumns:"repeat(4,1fr)" }}>
            {[
              { label:"Total events today", val:6, color:CY },
              { label:"Unique users today", val:5, color:null },
              { label:"High risk actions", val:2, color:"#F59E0B" },
              { label:"Failed logins (7d)", val:0, color:"#4CAF7D" },
            ].map(c=>(
              <div key={c.label} style={s.sc}><div style={s.scL}>{c.label}</div><div style={s.scV(c.color)}>{c.val}</div></div>
            ))}
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ ...s.ct, tableLayout:"fixed" }}>
              <thead><tr>
                <th style={{ ...s.th, width:"16%" }}>Timestamp</th>
                <th style={{ ...s.th, width:"16%" }}>User</th>
                <th style={{ ...s.th, width:"28%" }}>Action</th>
                <th style={{ ...s.th, width:"12%" }}>Module</th>
                <th style={{ ...s.th, width:"18%" }}>Entity / subject</th>
                <th style={{ ...s.th, width:"10%" }}>IP</th>
              </tr></thead>
              <tbody>
                {auditLog.filter(a=>!auditSearch||a.action.toLowerCase().includes(auditSearch.toLowerCase())||a.user.toLowerCase().includes(auditSearch.toLowerCase())||a.entity.toLowerCase().includes(auditSearch.toLowerCase())).map(a=>(
                  <tr key={a.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                    <td style={{ ...s.td, fontSize:11, color:"var(--text-secondary,#666)" }}>{a.ts}</td>
                    <td style={{ ...s.td, fontWeight:600 }}>{a.user}</td>
                    <td style={s.td}>{a.action}</td>
                    <td style={s.td}><span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"var(--bg-secondary,#f9f9f9)", color:"var(--text-secondary,#666)", border:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>{a.module}</span></td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{a.entity}</td>
                    <td style={{ ...s.td, fontSize:11, color:"#aaa" }}>{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── SYSTEM CONFIG ── */}
      {view === "config" && (
        <div style={s.pad}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div style={s.card}>
              <div style={s.cardT}>Security settings</div>
              <Toggle label="Require MFA for all users" sub="Users without MFA cannot log in" key2="mfaRequired" />
              <Toggle label="Full audit logging" sub="All actions recorded with user, timestamp and IP" key2="auditLog" />
              <Toggle label="Session timeout (30 min)" sub="Auto-logout after 30 minutes of inactivity" key2="sessionTimeout" />
              <div style={{ marginTop:12, display:"flex", gap:8 }}>
                <button style={{ ...nb, fontSize:11 }} onClick={()=>setModal("sessionConfig")}>Configure session settings</button>
                <button style={{ ...nb, fontSize:11 }} onClick={()=>setModal("ipWhitelist")}>IP whitelist</button>
              </div>
            </div>

            <div style={s.card}>
              <div style={s.cardT}>Notifications & alerts</div>
              <Toggle label="Email notifications" sub="Send email alerts to responsible users" key2="emailNotifs" />
              <Toggle label="Automated KYC expiry reminders" sub="90, 60, 30 day alerts before expiry" key2="kycAlerts" />
              <Toggle label="Automated review reminders" sub="Alert 30 days before periodic review due" key2="autoReminders" />
              <Toggle label="WIP ageing alerts" sub="Flag WIP over 60 days to manager" key2="wipAlerts" />
            </div>

            <div style={s.card}>
              <div style={s.cardT}>Billing automation</div>
              <Toggle label="Auto-generate retainer invoices" sub="Create draft invoices on first of each quarter" key2="retainerAuto" />
              <Toggle label="Client portal (billing)" sub="Allow clients to view and pay invoices via portal" key2="portalEnabled" />
              <div style={{ marginTop:12 }}>
                <button style={{ ...nb, fontSize:11 }} onClick={()=>setModal("billingConfig")}>Configure billing settings ↗</button>
              </div>
            </div>

            <div style={s.card}>
              <div style={s.cardT}>Data & integrations</div>
              <div style={{ fontSize:12, color:"var(--text-secondary,#666)", marginBottom:12, lineHeight:1.6 }}>
                Affinity Core is currently operating as a standalone system. The following integrations are planned for Phase 2 deployment on Azure / Microsoft 365.
              </div>
              {[
                { name:"Microsoft 365 / Outlook", status:"Planned", color:"#aaa" },
                { name:"Azure Active Directory (SSO)", status:"Planned", color:"#aaa" },
                { name:"Microsoft Copilot", status:"Planned", color:"#aaa" },
                { name:"Worldcheck (sanctions)", status:"Manual", color:"#F59E0B" },
                { name:"Companies House API", status:"Planned", color:"#aaa" },
              ].map(i=>(
                <div key={i.name} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", fontSize:12 }}>
                  <span>{i.name}</span>
                  <span style={{ fontWeight:600, color:i.color }}>{i.status}</span>
                </div>
              ))}
            </div>

            <div style={{ ...s.card, gridColumn:"1/-1" }}>
              <div style={s.cardT}>System information</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
                {[
                  { label:"Platform", val:"Affinity Core v0.7" },
                  { label:"Modules live", val:"8 of 29" },
                  { label:"Total entities", val:"300" },
                  { label:"Total users", val:"12" },
                  { label:"Environment", val:"Prototype" },
                  { label:"Deployment", val:"Claude.ai (local)" },
                  { label:"Next milestone", val:"Phase 1 complete" },
                  { label:"Azure target", val:"Post Phase 1" },
                ].map(i=>(
                  <div key={i.label}>
                    <div style={{ fontSize:11, color:"#aaa", marginBottom:3 }}>{i.label}</div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{i.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PERMISSION MATRIX ── */}
      {view === "matrix" && (
        <div style={s.pad}>
          <div style={{ ...s.infoBox, marginBottom:16 }}>ℹ️ Live view of the enforced access rules (affinity_core_rbac.js). V=View · C=Create · E=Edit · D=Delete · A=Approve · X=No access. This is the front-end (UI) layer today; the data backend enforces the same rules once connected.</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ ...s.ct, tableLayout:"auto" }}>
              <thead><tr>
                <th style={{ ...s.th, textAlign:"left" }}>Module</th>
                {ROLES.map(r=><th key={r} style={{ ...s.th, textAlign:"center" }}>{ROLE_LABELS[r]}</th>)}
              </tr></thead>
              <tbody>
                {MATRIX_MODULES.map(([label,id])=>(
                  <tr key={id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                    <td style={{ ...s.td, fontWeight:500 }}>{label}</td>
                    {ROLES.map(r=>{ const p=permsFor(r,id); const txt=p.length?p.join("+"):"X";
                      return <td key={r} style={{ ...s.td, textAlign:"center", color:txt==="X"?"#bbb":"var(--text-primary,#333)", fontWeight:txt==="X"?400:600 }}>{txt}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── IMPLEMENTATION CHECKLIST ── */}
      {view === "checklist" && (
        <div style={s.pad}>
          <div style={{ ...s.infoBox, marginBottom:16 }}>ℹ️ Production-readiness checklist (§12 of the security document). Statuses are editable here for tracking. Several items depend on the data backend / Entra and can't be completed in the front-end alone.</div>
          <table style={{ ...s.ct, tableLayout:"auto" }}>
            <thead><tr>
              <th style={{ ...s.th, textAlign:"left", width:"6%" }}>#</th>
              <th style={{ ...s.th, textAlign:"left" }}>Item</th>
              <th style={{ ...s.th, textAlign:"left", width:"22%" }}>Status</th>
            </tr></thead>
            <tbody>
              {checklist.map((c,i)=>(
                <tr key={i} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                  <td style={s.td}>{i+1}</td>
                  <td style={s.td}>{c.item}{c.note && <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{c.note}</div>}</td>
                  <td style={s.td}>
                    <select value={c.status} onChange={e=>{const v=e.target.value;setChecklist(p=>p.map((x,j)=>j===i?{...x,status:v}:x));}}
                      style={{ padding:"5px 8px", borderRadius:6, border:"1px solid #ddd", fontSize:12 }}>
                      {["Not started","In progress","Done","Backend / Entra","N/A"].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODALS */}
      {modal && (
        <div style={s.modal} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={s.modalBox}>
            {modal==="newUser" && (<>
              <div style={s.modalTitle}>Add new user</div>
              <div style={s.fgGrid}>
                <div style={s.fg}><label style={s.fgl}>First name</label><input style={s.fgi} placeholder="First name" /></div>
                <div style={s.fg}><label style={s.fgl}>Last name</label><input style={s.fgi} placeholder="Last name" /></div>
                <div style={{ ...s.fg, gridColumn:"1/-1" }}><label style={s.fgl}>Email address</label><input style={s.fgi} placeholder="name@affinityco.com" /></div>
                <div style={s.fg}><label style={s.fgl}>Role</label><select style={s.fgi}>{Object.keys(roleColors).map(r=><option key={r}>{r}</option>)}</select></div>
                <div style={s.fg}><label style={s.fgl}>Office</label><select style={s.fgi}>{Object.keys(officeColors).map(o=><option key={o}>{o}</option>)}</select></div>
                <div style={{ ...s.fg, gridColumn:"1/-1" }}><label style={s.fgl}>Module access</label><select style={s.fgi}><option>All modules (office only)</option><option>Custom — select below</option></select></div>
              </div>
              <div style={{ ...s.infoBox }}>An invitation email will be sent to the user with instructions to set their password and configure MFA.</div>
              <div style={s.mActions}><button style={s.btnC} onClick={()=>setModal(null)}>Cancel</button><button style={s.btnS} onClick={()=>setModal(null)}>Create user & send invite</button></div>
            </>)}

            {modal==="editRole" && (<>
              <div style={s.modalTitle}>Edit role permissions</div>
              <div style={{ ...s.infoBox }}>⚠️ Role permission changes affect all users with this role. Changes are logged in the audit trail.</div>
              <div style={s.fg}><label style={s.fgl}>Role</label><select style={s.fgi}>{Object.keys(roleColors).map(r=><option key={r}>{r}</option>)}</select></div>
              <div style={s.fg}><label style={s.fgl}>Module access</label>
                {["Entities","Compliance","DMS","Onboarding","Timesheets","Invoicing","Reporting","System Admin"].map(m=>(
                  <div key={m} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0", fontSize:13 }}>
                    <input type="checkbox" defaultChecked style={{ accentColor:CY }} /> {m}
                  </div>
                ))}
              </div>
              <div style={s.mActions}><button style={s.btnC} onClick={()=>setModal(null)}>Cancel</button><button style={s.btnS} onClick={()=>setModal(null)}>Save permissions</button></div>
            </>)}

            {modal==="newFee" && (<>
              <div style={s.modalTitle}>Add fee schedule entry</div>
              <div style={s.fgGrid}>
                <div style={s.fg}><label style={s.fgl}>Office</label><select style={s.fgi}>{officesData.map(o=><option key={o.office}>{o.office}</option>)}</select></div>
                <div style={s.fg}><label style={s.fgl}>Service type</label><input style={s.fgi} placeholder="e.g. Company admin" /></div>
                <div style={s.fg}><label style={s.fgl}>Standard fee</label><input style={s.fgi} placeholder="0.00" /></div>
                <div style={s.fg}><label style={s.fgl}>Currency</label><select style={s.fgi}><option>GBP</option><option>USD</option><option>EUR</option></select></div>
                <div style={s.fg}><label style={s.fgl}>Frequency</label><select style={s.fgi}><option>Per annum</option><option>Per quarter</option><option>Per month</option><option>Fixed / one-off</option></select></div>
                <div style={s.fg}><label style={s.fgl}>Effective from</label><input style={s.fgi} placeholder="DD/MM/YYYY" /></div>
              </div>
              <div style={s.mActions}><button style={s.btnC} onClick={()=>setModal(null)}>Cancel</button><button style={s.btnS} onClick={()=>setModal(null)}>Save fee</button></div>
            </>)}

            {(modal==="editUser"||modal==="editOffice"||modal==="sessionConfig"||modal==="ipWhitelist"||modal==="billingConfig") && (<>
              <div style={s.modalTitle}>{modal==="editUser"?"Edit user":modal==="editOffice"?"Edit office configuration":modal==="sessionConfig"?"Session settings":modal==="ipWhitelist"?"IP whitelist":"Billing configuration"}</div>
              <div style={{ fontSize:13, color:"var(--text-secondary,#666)", marginBottom:16 }}>This configuration panel will be fully built in the System Admin module once connected to persistent storage.</div>
              <div style={s.mActions}><button style={s.btnS} onClick={()=>setModal(null)}>Close</button></div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
