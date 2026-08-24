import { useState, useMemo, useEffect } from "react";
import { filterEntitiesByAccess } from "./affinity_core_rbac";
import { REGISTERS as RAW_REGISTERS, REGISTER_ORDER } from "./affinity_core_compliance";
// "breaches" is rendered by its own view in Compliance and has no catalogue entry.
const COMPLIANCE_REGISTERS = { breaches:{ label:"Breach log", cols:["Date","Entity","Description","Severity","Status"], rows:[] }, ...RAW_REGISTERS };
import { isConfigured } from "./affinity_accounting_supabase";
import { eaEntitiesList, eaProfile, eaOfficers, eaShareholders, eaCharges, eaUbos, eaAddresses, eaMeetings,
  eaBanks, eaAssets, eaDividends, eaSafeItems, eaFileNotes, eaSafeMovements, eaSignatories,
  repAum, repBankBalances, repSafeCustody, repSignatories } from "./affinity_eadmin_api";
import EntityChart from "./affinity_core_entity_chart";
import AffinityEGaming from "./affinity_core_egaming";
const CY = "#00C4CC";
const NAVY = "#001242";

const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);

const officeColors = {
  "Isle of Man":    { bg:"#E6F7FB", color:"#0077A8" },
  "Malta":          { bg:"#EEF0FB", color:"#3C3489" },
  "Cayman Islands": { bg:"#E6EEF7", color:"#0D4A7A" },
  "United Kingdom": { bg:"#F1EFE8", color:"#444441" },
  "Miami":          { bg:"#FBEAF0", color:"#72243E" },
  "South Dakota":   { bg:"#F1EFE8", color:"#555" },
  "Cyprus":         { bg:"#E6EEF7", color:"#0D4A7A" },
};
const jurShort = { "Isle of Man":"IOM","Malta":"MLT","Cayman Islands":"CYM","United Kingdom":"UK","Miami":"MIA","South Dakota":"SD","Cyprus":"CYP" };
const riskColors = { "Very High":{bg:"#F7C1C1",color:"#501313"}, High:{bg:"#FCEBEB",color:"#A32D2D"}, Medium:{bg:"#FAEEDA",color:"#633806"}, Low:{bg:"#EAF3DE",color:"#27500A"} };
const statusBadge = s => ({ Active:{bg:"#EAF3DE",color:"#27500A"}, Dormant:{bg:"#FAEEDA",color:"#633806"}, "In liquidation":{bg:"#FCEBEB",color:"#A32D2D"}, Dissolved:{bg:"#F1EFE8",color:"#888"}, "Pending incorporation":{bg:"#E6F7FB",color:"#0077A8"} }[s]||{bg:"#eee",color:"#666"});

const ENTITIES = [
  { id:1,  name:"Meridian Holdings Ltd",          ref:"AC-2024-001", type:"Company",    jur:"Isle of Man",    status:"Active",        risk:"Medium",   admin:"Roxy Sheeley",  manager:"Roxy Sheeley",  director:"Andy Morgan", group:"Meridian Group",   principalActivity:"Holding company", yearEnd:"31/03", currency:"GBP", regNo:"117843C",    incorporated:"12/03/2018", isGaming:false },
  { id:2,  name:"Harrington Family Trust",        ref:"AC-2019-014", type:"Trust",      jur:"Isle of Man",    status:"Active",        risk:"High",     admin:"Roxy Sheeley",  manager:"Roxy Sheeley",  director:"Andy Morgan", group:"Harrington Family",principalActivity:"Family trust",    yearEnd:"05/04", currency:"GBP", regNo:"T-4421",     incorporated:"05/07/2019" },
  { id:3,  name:"Caledonian Ventures Ltd",        ref:"AC-2021-032", type:"Company",    jur:"Cayman Islands", status:"Active",        risk:"Medium",   admin:"Garry Crossan", manager:"Garry Crossan", director:"Andy Morgan", group:"Caledonian Group", principalActivity:"Investment holding",yearEnd:"31/12",currency:"USD", regNo:"CY-88341",   incorporated:"22/01/2021" },
  { id:4,  name:"Azure Mediterranean Foundation", ref:"AC-2020-008", type:"Foundation", jur:"Malta",          status:"Active",        risk:"Low",      admin:"Joanne Fenech", manager:"Joanne Fenech", director:"Andy Morgan", group:"Azure Group",      principalActivity:"Philanthropy",    yearEnd:"31/12", currency:"EUR", regNo:"MLT-F-2201", incorporated:"14/09/2020" },
  { id:5,  name:"Thornbury Asset Co Ltd",         ref:"AC-2017-055", type:"Company",    jur:"United Kingdom", status:"Dormant",       risk:"Medium",   admin:"Neil Kelly",    manager:"Neil Kelly",    director:"Andy Morgan", group:"Thornbury Group",  principalActivity:"Asset holding",   yearEnd:"31/12", currency:"GBP", regNo:"14421876",   incorporated:"03/06/2017" },
  { id:6,  name:"Pacific Wealth Trust",           ref:"AC-2022-019", type:"Trust",      jur:"Cayman Islands", status:"Active",        risk:"High",     admin:"Garry Crossan", manager:"Garry Crossan", director:"Andy Morgan", group:"Pacific Wealth",   principalActivity:"Wealth trust",    yearEnd:"31/12", currency:"USD", regNo:"T-CY-5521",  incorporated:"18/11/2022" },
  { id:7,  name:"Stonebridge Capital Ltd",        ref:"AC-2023-041", type:"Company",    jur:"Malta",          status:"Active",        risk:"Low",      admin:"Joanne Fenech", manager:"Joanne Fenech", director:"Andy Morgan", group:"Stonebridge Group",principalActivity:"Capital management",yearEnd:"31/12",currency:"EUR",regNo:"MLT-C-88221",incorporated:"07/02/2023" },
  { id:8,  name:"North Star Holdings Ltd",        ref:"AC-2016-003", type:"Company",    jur:"Isle of Man",    status:"In liquidation",risk:"High",     admin:"Roxy Sheeley",  manager:"Roxy Sheeley",  director:"Andy Morgan", group:"North Star Group", principalActivity:"Holding company", yearEnd:"31/12", currency:"GBP", regNo:"104322C",    incorporated:"30/10/2016" },
  { id:9,  name:"Rosewood Legacy Trust",          ref:"AC-2021-027", type:"Trust",      jur:"Isle of Man",    status:"Active",        risk:"Medium",   admin:"Roxy Sheeley",  manager:"Roxy Sheeley",  director:"Andy Morgan", group:"Cheshire Family",  principalActivity:"Family trust",    yearEnd:"05/04", currency:"GBP", regNo:"T-6603",     incorporated:"25/04/2021" },
  { id:10, name:"Apex Growth Fund Ltd",           ref:"AC-2023-052", type:"Company",    jur:"Cayman Islands", status:"Active",        risk:"Very High",admin:"Garry Crossan", manager:"Garry Crossan", director:"Andy Morgan", group:"Apex Group",       principalActivity:"Fund management", yearEnd:"31/12", currency:"USD", regNo:"CY-99102",   incorporated:"12/08/2023" },
  { id:11, name:"Suncoast Ventures LLC",          ref:"AC-2024-007", type:"Company",    jur:"Miami",          status:"Active",        risk:"Low",      admin:"Andy Morgan",   manager:"Andy Morgan",   director:"Andy Morgan", group:"Suncoast Group",   principalActivity:"Ventures",        yearEnd:"31/12", currency:"USD", regNo:"FL-2024-881", incorporated:"01/03/2024" },
  { id:12, name:"Bluewater Family Trust",         ref:"AC-2020-031", type:"Trust",      jur:"Cayman Islands", status:"Active",        risk:"Medium",   admin:"Garry Crossan", manager:"Garry Crossan", director:"Andy Morgan", group:"Okafor Family",    principalActivity:"Family trust",    yearEnd:"31/12", currency:"USD", regNo:"T-CY-9921",  incorporated:"19/06/2020" },
  { id:13, name:"Phoenix eGaming Ltd",             ref:"AC-2025-061", type:"Company",    jur:"Isle of Man",    status:"Active",        risk:"High",     admin:"Roxy Sheeley",  manager:"Roxy Sheeley",  director:"Andy Morgan", group:"Phoenix Group",    principalActivity:"eGaming operator", yearEnd:"31/12", currency:"GBP", regNo:"GSC-2025-0441",incorporated:"01/03/2025", isGaming:true },
  { id:14, name:"Meridian Digital Ltd",            ref:"AC-2023-058", type:"Company",    jur:"Isle of Man",    status:"Active",        risk:"Medium",   admin:"Roxy Sheeley",  manager:"Roxy Sheeley",  director:"Andy Morgan", group:"Meridian Group",   principalActivity:"B2B platform supply",yearEnd:"31/12",currency:"GBP",regNo:"GSC-2023-0218",incorporated:"01/06/2023", isGaming:true },
  // Affinity's own group companies — entityClass:"group". Mirrors db_eadmin/006_group_entities.sql
  { id:15, name:"Affinity Group Limited",          ref:"AFG-000",     type:"Company",    jur:"Isle of Man",    status:"Active",        risk:"Low",      admin:"Neil Kelly",    manager:"Neil Kelly",    director:"Andy Morgan", group:"Affinity Group",   principalActivity:"Group holding / parent company",        yearEnd:"31/12", currency:"GBP", regNo:"016232V",  incorporated:"28/06/2018", entityClass:"group" },
  { id:16, name:"Affinity (Isle of Man) Limited",  ref:"AFG-IOM",     type:"Company",    jur:"Isle of Man",    status:"Active",        risk:"Low",      admin:"Roxy Sheeley",  manager:"Roxy Sheeley",  director:"Andy Morgan", group:"Affinity Group",   principalActivity:"Corporate & Trust Service Provider (CSP)",yearEnd:"31/12",currency:"GBP", regNo:"110310C",  incorporated:"01/03/2004", entityClass:"group" },
  { id:17, name:"Affinity (Malta) Limited",        ref:"AFG-MLT",     type:"Company",    jur:"Malta",          status:"Active",        risk:"Low",      admin:"Joanne Fenech", manager:"Joanne Fenech", director:"Andy Morgan", group:"Affinity Group",   principalActivity:"Corporate services",                    yearEnd:"31/12", currency:"EUR", regNo:"—",        incorporated:"—",          entityClass:"group" },
  { id:18, name:"Affinity (Cayman) Limited",       ref:"AFG-CYM",     type:"Company",    jur:"Cayman Islands", status:"Active",        risk:"Low",      admin:"Garry Crossan", manager:"Garry Crossan", director:"Andy Morgan", group:"Affinity Group",   principalActivity:"Corporate services",                    yearEnd:"31/12", currency:"USD", regNo:"—",        incorporated:"—",          entityClass:"group" },
  { id:19, name:"Affinity (UK) Limited",           ref:"AFG-UK",      type:"Company",    jur:"United Kingdom", status:"Active",        risk:"Low",      admin:"Neil Kelly",    manager:"Neil Kelly",    director:"Andy Morgan", group:"Affinity Group",   principalActivity:"Corporate services",                    yearEnd:"31/12", currency:"GBP", regNo:"—",        incorporated:"—",          entityClass:"group" },
  { id:20, name:"Affinity South Dakota, LLC",      ref:"AFG-SD",      type:"Company",    jur:"Miami",          status:"Active",        risk:"Low",      admin:"Andy Morgan",   manager:"Andy Morgan",   director:"Andy Morgan", group:"Affinity Group",   principalActivity:"Trust services (US)",                   yearEnd:"31/12", currency:"USD", regNo:"—",        incorporated:"—",          entityClass:"group" },
  { id:21, name:"Affinity South Florida, LLC",     ref:"AFG-FL",      type:"Company",    jur:"Miami",          status:"Active",        risk:"Low",      admin:"Andy Morgan",   manager:"Andy Morgan",   director:"Andy Morgan", group:"Affinity Group",   principalActivity:"Corporate services (US)",               yearEnd:"31/12", currency:"USD", regNo:"—",        incorporated:"—",          entityClass:"group" },
];

const ENTITY_DATA = {
  directors: {
    1:[{id:1,name:"James Harrington",role:"Director",appointed:"12/03/2018",resigned:null,nationality:"British",dob:"15/04/1968",address:"The Old Manor, Cheshire, CH3 7YQ"},{id:2,name:"Sarah Cole",role:"Director",appointed:"12/03/2018",resigned:null,nationality:"British",dob:"22/09/1974",address:"42 Douglas Road, Douglas, Isle of Man"}],
    2:[{id:1,name:"Affinity Trust Ltd",role:"Trustee",appointed:"05/07/2019",resigned:null,nationality:"N/A",dob:"N/A",address:"14 Athol Street, Douglas, IOM"}],
    3:[{id:1,name:"Lena Müller",role:"Director / UBO",appointed:"22/01/2021",resigned:null,nationality:"German",dob:"03/11/1980",address:"Hauptstraße 12, Munich, Germany"},{id:2,name:"Patrick Walsh",role:"Director",appointed:"22/01/2021",resigned:null,nationality:"Irish",dob:"17/07/1975",address:"14 Grafton Street, Dublin, Ireland"}],
    10:[{id:1,name:"Sophie Laurent",role:"Director / UBO",appointed:"12/08/2023",resigned:null,nationality:"French",dob:"07/06/1985",address:"12 Rue de Rivoli, Paris, France"},{id:2,name:"David Park",role:"Director",appointed:"12/08/2023",resigned:null,nationality:"South Korean",dob:"23/10/1979",address:"Seoul, South Korea"}],
  },
  shareholders: {
    1:[{id:1,name:"Meridian Trust",type:"Trust",shares:100,class:"Ordinary",pct:"100%",nominal:"£1",paid:"£100",regDate:"12/03/2018"}],
    3:[{id:1,name:"Lena Müller",type:"Individual",shares:5000,class:"Ordinary",pct:"100%",nominal:"$1",paid:"$5,000",regDate:"22/01/2021"}],
    10:[{id:1,name:"Sophie Laurent",type:"Individual",shares:6000,class:"Ordinary",pct:"60%",nominal:"$1",paid:"$6,000",regDate:"12/08/2023"},{id:2,name:"David Park",type:"Individual",shares:4000,class:"Ordinary",pct:"40%",nominal:"$1",paid:"$4,000",regDate:"12/08/2023"}],
  },
  addresses: {
    1:[{type:"Registered office",address:"2nd Floor, 14 Athol Street, Douglas, Isle of Man, IM1 1JA",from:"12/03/2018",to:null},{type:"Correspondence",address:"The Old Manor, Cheshire, CH3 7YQ",from:"12/03/2018",to:null}],
    2:[{type:"Registered office",address:"2nd Floor, 14 Athol Street, Douglas, Isle of Man, IM1 1JA",from:"05/07/2019",to:null}],
    10:[{type:"Registered office",address:"Harbour Place, 103 South Church Street, George Town, Cayman Islands",from:"12/08/2023",to:null},{type:"Principal office",address:"12 Rue de Rivoli, Paris, France",from:"12/08/2023",to:null}],
  },
  bankAccounts: {
    1:[{id:1,bank:"Barclays Bank",account:"Current account",number:"****4421",currency:"GBP",signatories:"Andy Morgan, Roxy Sheeley",resolution:"12/03/2018",closed:null}],
    3:[{id:1,bank:"First Caribbean Bank",account:"USD account",number:"****8821",currency:"USD",signatories:"Garry Crossan, Andy Morgan",resolution:"22/01/2021",closed:null}],
    10:[{id:1,bank:"Butterfield Bank",account:"USD account",number:"****9102",currency:"USD",resolution:"12/08/2023",closed:null}],
  },
  charges: {
    1:[{id:1,chargee:"HSBC Bank plc",type:"Fixed charge",amount:"£500,000",registered:"15/06/2020",satisfied:null,currency:"GBP"}],
    10:[{id:1,chargee:"Scotiabank Cayman",type:"Fixed charge",amount:"$1,200,000",registered:"12/08/2023",satisfied:null,currency:"USD"}],
  },
  assets: {
    1:[{id:1,desc:"Commercial property — Manchester",acquired:"01/06/2020",lastValuation:"31/12/2024",value:"£1,200,000",currency:"GBP",notes:"Freehold. Tenanted."}],
    2:[{id:1,desc:"Investment portfolio — UK equities",acquired:"05/07/2019",lastValuation:"31/12/2024",value:"£2,400,000",currency:"GBP",notes:"Managed by Harrington Asset Management"}],
    10:[{id:1,desc:"Fund interests — Cayman SPC",acquired:"12/08/2023",lastValuation:"31/12/2024",value:"$8,500,000",currency:"USD",notes:"Segregated Portfolio Company interests"}],
  },
  dividends: {
    1:[{id:1,class:"Ordinary",name:"James Harrington",requested:"15/03/2025",paid:"30/03/2025",perShare:"£500",notes:"Q1 2025 dividend"}],
  },
  nameChanges: {
    8:[{id:1,oldName:"North Star Ventures Ltd",newName:"North Star Holdings Ltd",effective:"15/06/2019",applied:"15/06/2019"}],
  },
  foreignRegs: {
    3:[{id:1,country:"BVI",lastReturn:"22/01/2024",nextReturn:"22/01/2025",lastAccounts:"31/12/2023",nextAccounts:"30/09/2024",notes:"Dormant BVI registration"}],
  },
  fileNotes: {
    1:[{id:1,date:"14/07/2025",author:"Roxy Sheeley",subject:"Client call — Q3 review",note:"Spoke with James Harrington re Q3 accounts. Expects turnover similar to Q2. No changes to structure anticipated."}],
    2:[{id:1,date:"12/07/2025",author:"Colette Grisdale",subject:"KYC chase — Emma Harrington",note:"Third request for updated passport sent. No response. Escalating to MLRO."}],
  },
  meetings: {
    1:[{id:1,type:"Board meeting",date:"15/03/2025",location:"Douglas, Isle of Man",attendees:"James Harrington, Sarah Cole, Andy Morgan",agenda:"Q1 accounts review, dividend declaration",status:"Minutes drafted"}],
    10:[{id:1,type:"Board meeting",date:"12/01/2025",location:"Paris (video)",attendees:"Sophie Laurent, David Park, Andy Morgan",agenda:"Q4 2024 accounts, strategy review",status:"Minutes executed"}],
  },
  safeItems: {
    2:[{id:1,item:"Original trust deed",deposited:"05/07/2019",retrieved:null,auth:"Andy Morgan"}],
    1:[{id:1,item:"Original certificate of incorporation",deposited:"12/03/2018",retrieved:null,auth:"Andy Morgan"}],
  },
  relations: {
    1:[{id:1,name:"James Harrington",role:"Beneficial owner / Director",dob:"15/04/1968",nationality:"British",shared:true,linkedEntities:["Harrington Family Trust","Thornbury Asset Co Ltd"]}],
    2:[{id:1,name:"James Harrington",role:"Settlor",dob:"15/04/1968",nationality:"British",shared:true,linkedEntities:["Meridian Holdings Ltd","Thornbury Asset Co Ltd"]},{id:2,name:"Emma Harrington",role:"Beneficiary",dob:"12/08/1998",nationality:"British",shared:false,linkedEntities:[]}],
  },
};

const TABS = [
  { id:"overview",   label:"Overview",                group:"Entity" },
  { id:"directors",  label:"Officers",                group:"Entity" },
  { id:"shareholders",label:"Shareholders",           group:"Entity" },
  { id:"bank",       label:"Bank accounts",           group:"Entity" },
  { id:"charges",    label:"Charges",                 group:"Entity" },
  { id:"assets",     label:"Assets",                  group:"Entity" },
  { id:"dividends",  label:"Dividends",               group:"Entity" },
  { id:"relations",  label:"Beneficial owners",        group:"Entity" },
  { id:"meetings",   label:"Meetings",                group:"Entity" },
  { id:"structure",  label:"Structure / chart",       group:"Entity" },
  { id:"fileNotes",  label:"File notes",              group:"Entity" },
  { id:"archive",    label:"Archive",                 group:"Entity" },
  { id:"safe",       label:"Safe custody",            group:"Entity" },
  { id:"registers",  label:"Generate registers",      group:"Entity" },
  { id:"compliance", label:"Compliance register",     group:"Regulatory" },
  { id:"egaming_reg",   label:"Gaming",               group:"Registers" },
  { id:"fatca",      label:"FATCA",                   group:"Filing Obligations" },
  { id:"crs",        label:"CRS",                     group:"Filing Obligations" },
  { id:"substance",  label:"Substance",               group:"Filing Obligations" },
];

const s = {
  wrap:  { fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", height:"100vh", display:"flex", flexDirection:"column", overflow:"hidden" },
  hdr:   { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", flexShrink:0 },
  logo:  { fontSize:18, fontWeight:500, color:CY },
  body:  { display:"flex", flex:1, overflow:"hidden" },
  list:  { width:280, minWidth:280, borderRight:"0.5px solid var(--border-tertiary,#e5e5e5)", display:"flex", flexDirection:"column", overflow:"hidden" },
  listHdr:{ padding:"10px 14px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-secondary,#f9f9f9)", flexShrink:0 },
  listBody:{ flex:1, overflowY:"auto" },
  detail:{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  detHdr:{ padding:"14px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", flexShrink:0 },
  tabBar:{ display:"flex", gap:2, padding:"8px 16px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-secondary,#f9f9f9)", flexWrap:"nowrap", overflowX:"auto", flexShrink:0 },
  tabBtn:(a)=>({ padding:"4px 11px", fontSize:11, borderRadius:20, border:`0.5px solid ${a?"#ccc":"var(--border-tertiary,#e5e5e5)"}`, background:a?"var(--bg-primary,#fff)":"transparent", color:a?"var(--text-primary,#111)":"var(--text-secondary,#666)", cursor:"pointer", fontWeight:a?500:400, whiteSpace:"nowrap", flexShrink:0 }),
  tabBody:{ flex:1, overflowY:"auto", padding:"14px 20px" },
  eRow:  (sel)=>({ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", cursor:"pointer", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:sel?"var(--bg-secondary,#f9f9f9)":"transparent", transition:"background 0.1s" }),
  avatar:{ width:30, height:30, borderRadius:6, background:"#E6F7FB", color:"#0077A8", fontSize:11, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  card:  { background:"var(--bg-primary,#fff)", border:"0.5px solid var(--border-tertiary,#e5e5e5)", borderRadius:8, padding:14, marginBottom:12 },
  cardT: { fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.4px", color:"var(--text-secondary,#666)", marginBottom:10 },
  dRow:  { display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", fontSize:12 },
  dKey:  { color:"var(--text-secondary,#666)", flexShrink:0, maxWidth:"45%" },
  dVal:  { fontWeight:500, textAlign:"right", overflow:"hidden", textOverflow:"ellipsis" },
  th:    { padding:"7px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"var(--text-secondary,#666)", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-secondary,#f9f9f9)", whiteSpace:"nowrap" },
  td:    { padding:"8px 12px", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" },
  btn:   (p)=>({ padding:"5px 12px", borderRadius:5, border:p?"none":"0.5px solid var(--border-secondary,#ccc)", background:p?CY:"transparent", color:p?"#fff":"var(--text-primary,#111)", fontSize:11, cursor:"pointer", whiteSpace:"nowrap" }),
  sw:    { display:"flex", alignItems:"center", gap:6, background:"var(--bg-primary,#fff)", border:"0.5px solid var(--border-secondary,#ccc)", borderRadius:5, padding:"0 8px", height:30 },
  swI:   { border:"none", background:"transparent", fontSize:12, outline:"none", width:"100%", color:"var(--text-primary,#111)" },
  sel:   { height:28, padding:"0 6px", fontSize:11, borderRadius:5, border:"0.5px solid var(--border-secondary,#ccc)", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", cursor:"pointer" },
  g2:    { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 },
  g3:    { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 },
  g4:    { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 },
  kpi:   { background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 12px" },
  modal: { position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(13,27,42,0.45)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:40, zIndex:100 },
  modalBox:{ background:"var(--bg-primary,#fff)", borderRadius:10, border:"0.5px solid var(--border-tertiary,#e5e5e5)", padding:22, width:520, maxWidth:"96vw", maxHeight:"90vh", overflowY:"auto" },
  fg:    { display:"flex", flexDirection:"column", gap:3, marginBottom:10 },
  fgl:   { fontSize:11, color:"var(--text-secondary,#666)" },
  fgi:   { fontSize:12, borderRadius:5, border:"0.5px solid var(--border-secondary,#ccc)", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", padding:"0 8px", height:32, outline:"none" },
  fgGrid:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
};

const Tbl = ({ cols, rows }) => (
  <div style={{ overflowX:"auto" }}>
    <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
      <thead><tr>{cols.map(c=><th key={c.l} style={{ ...s.th, width:c.w }}>{c.l}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </div>
);

const KpiGrid = ({ items }) => (
  <div style={{ display:"grid", gridTemplateColumns:`repeat(${items.length},1fr)`, gap:10, marginBottom:14 }}>
    {items.map(k=><div key={k.l} style={s.kpi}><div style={{ fontSize:10, color:"var(--text-secondary,#666)", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:18, fontWeight:500, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>)}
  </div>
);

function getInitials(name) {
  return name.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();
}


// ── FATCA Tab ─────────────────────────────────────────────────
function FATCATab({entity}) {
  const [modal,setModal]=useState(null);
  const data={
    status:entity?.jur==="Isle of Man"||entity?.jur==="Cayman Islands"?"Registered":"Not applicable",
    giin:entity?.id===1?"7FHKP2.00000.SP.833":entity?.id===3?"4KPML9.00000.SP.136":entity?.id===10?"9RQVN1.00000.SP.136":null,
    classification:entity?.type==="Trust"?"Reporting FI — Trustee Documented Trust":entity?.type==="Foundation"?"Non-Reporting FI — Exempt Beneficial Owner":"Reporting FI — Investment Entity",
    usPersons:"None identified",
    filingDue:entity?.jur==="Isle of Man"?"31 May 2026":entity?.jur==="Cayman Islands"?"31 July 2026":"N/A",
    lastFiling:entity?.jur==="Isle of Man"?"31 May 2025":entity?.jur==="Cayman Islands"?"31 July 2025":"N/A",
    filingStatus:"Complete",
    reportingCountry:"Isle of Man" || entity?.jur,
    exchangePartner:"IRS (USA)",
  };
  const isApplicable=["Isle of Man","Cayman Islands","Malta","Jersey","Guernsey","BVI"].includes(entity?.jur);
  const Bx=({label,colors})=><span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:colors?.bg||"#eee",color:colors?.color||"#333"}}>{label}</span>;
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div><div style={{fontSize:14,fontWeight:600}}>FATCA — Foreign Account Tax Compliance Act</div><div style={{fontSize:11,color:"#666",marginTop:2}}>US reporting obligation status for {entity?.name}</div></div>
      {isApplicable&&<button onClick={()=>setModal("fatca")} style={{padding:"5px 14px",borderRadius:5,border:"none",background:"#00C4CC",color:"#fff",fontSize:11,cursor:"pointer"}}>+ Add/edit FATCA data</button>}
    </div>
    {!isApplicable?<div style={{background:"#f9f9f9",borderRadius:8,padding:20,textAlign:"center",color:"#aaa",fontSize:12}}>FATCA reporting is not applicable for entities in {entity?.jur}.</div>:
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:14}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",color:"#666",marginBottom:10}}>Registration</div>
        {[["Status",<Bx label={data.status} colors={data.status==="Registered"?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#FAEEDA",color:"#633806"}}/>],["GIIN",data.giin||"Not registered"],["Classification",data.classification],["US persons identified",data.usPersons],["Reporting country",data.reportingCountry],["Exchange partner",data.exchangePartner]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}><span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500,textAlign:"right",maxWidth:220}}>{v}</span></div>
        ))}
      </div>
      <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:14}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",color:"#666",marginBottom:10}}>Filing history</div>
        {[["Filing status",<Bx label={data.filingStatus} colors={{Complete:{bg:"#EAF3DE",color:"#27500A"},Outstanding:{bg:"#FCEBEB",color:"#A32D2D"}}[data.filingStatus]||{bg:"#eee",color:"#666"}}/>],["Last filing",data.lastFiling],["Next filing due",data.filingDue],["Filing method","AEOI portal — "+data.reportingCountry],["Reportable accounts","0"],["Nil return",data.giin?"Yes — nil return filed":"N/A"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}><span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500,textAlign:"right",maxWidth:220}}>{v}</span></div>
        ))}
        <div style={{marginTop:12,display:"flex",gap:6}}>
          <button style={{flex:1,padding:"6px",borderRadius:5,border:"0.5px solid #ccc",background:"transparent",fontSize:11,cursor:"pointer"}}>View return ↗</button>
          <button style={{flex:1,padding:"6px",borderRadius:5,border:"none",background:"#00C4CC",color:"#fff",fontSize:11,cursor:"pointer"}}>File return ↗</button>
        </div>
      </div>
    </div>}
  </div>;
}

// ── CRS Tab ───────────────────────────────────────────────────
function CRSTab({entity}) {
  const [modal,setModal]=useState(null);
  const participatingJurs=["Isle of Man","Malta","Cayman Islands","Jersey","Guernsey","United Kingdom","BVI","Cyprus"];
  const isApplicable=participatingJurs.includes(entity?.jur);
  const Bx=({label,colors})=><span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:colors?.bg||"#eee",color:colors?.color||"#333"}}>{label}</span>;
  const reportingJurs=entity?.jur==="Isle of Man"?["Germany","France","Netherlands","Sweden","Australia"]:entity?.jur==="Cayman Islands"?["United Kingdom","Germany","France","Australia"]:entity?.jur==="Malta"?["Germany","France","Italy","Spain"]:[];
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div><div style={{fontSize:14,fontWeight:600}}>CRS — Common Reporting Standard</div><div style={{fontSize:11,color:"#666",marginTop:2}}>OECD automatic exchange of financial information</div></div>
      {isApplicable&&<button style={{padding:"5px 14px",borderRadius:5,border:"none",background:"#00C4CC",color:"#fff",fontSize:11,cursor:"pointer"}}>+ Add/edit CRS data</button>}
    </div>
    {!isApplicable?<div style={{background:"#f9f9f9",borderRadius:8,padding:20,textAlign:"center",color:"#aaa",fontSize:12}}>CRS reporting does not apply to entities in {entity?.jur}.</div>:
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:14}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",color:"#666",marginBottom:10}}>CRS classification</div>
        {[["CRS status",<Bx label="Reporting FI" colors={{bg:"#EAF3DE",color:"#27500A"}}/>],["Entity classification",entity?.type==="Trust"?"Reporting FI — Trustee Documented":entity?.type==="Foundation"?"Non-Reporting FI":"Reporting FI — Investment Entity"],["Controlling persons identified","Yes — see Relations tab"],["Account holder tax residency","Under review"],["Self-certification obtained","Yes"],["Self-cert date","01/04/2025"],["Self-cert expiry","01/04/2028"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}><span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500,textAlign:"right",maxWidth:200}}>{v}</span></div>
        ))}
      </div>
      <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:14}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",color:"#666",marginBottom:10}}>Reporting jurisdictions</div>
        {reportingJurs.length>0?reportingJurs.map((j,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}>
            <span style={{color:"#666"}}>{j}</span>
            <Bx label="Annual reporting" colors={{bg:"#E6F7FB",color:"#0077A8"}}/>
          </div>
        )):<div style={{fontSize:11,color:"#aaa",padding:"10px 0"}}>No reportable jurisdictions identified.</div>}
        <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["Last CRS return","31 May 2025"],["Next due","31 May 2026"],["Reportable accounts","0"],["Filing status","Complete"]].map(([k,v])=>(
            <div key={k} style={{background:"#f9f9f9",borderRadius:5,padding:"6px 8px"}}><div style={{fontSize:9,color:"#aaa",marginBottom:2}}>{k}</div><div style={{fontSize:11,fontWeight:500}}>{v}</div></div>
          ))}
        </div>
      </div>
    </div>}
  </div>;
}

// ── Substance Tab ─────────────────────────────────────────────
function SubstanceTab({entity}) {
  const [modal,setModal]=useState(null);
  const substanceJurs=["Isle of Man","Cayman Islands","BVI","Jersey","Guernsey","Bahamas"];
  const isApplicable=substanceJurs.includes(entity?.jur)&&entity?.type!=="Trust"&&entity?.type!=="Foundation";
  const activities=["Holding company","Banking","Insurance","Fund management","Finance and leasing","Headquarters","Distribution and service centre","Intellectual property","Shipping"];
  const entityActivity=entity?.principalActivity||"Holding company";
  const Bx=({label,colors})=><span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:colors?.bg||"#eee",color:colors?.color||"#333"}}>{label}</span>;
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div><div style={{fontSize:14,fontWeight:600}}>Substance requirements</div><div style={{fontSize:11,color:"#666",marginTop:2}}>Economic substance test — {entity?.jur}</div></div>
      {isApplicable&&<button style={{padding:"5px 14px",borderRadius:5,border:"none",background:"#00C4CC",color:"#fff",fontSize:11,cursor:"pointer"}}>+ Update substance data</button>}
    </div>
    {!isApplicable?<div style={{background:"#f9f9f9",borderRadius:8,padding:20,textAlign:"center",color:"#aaa",fontSize:12}}>
      {entity?.type==="Trust"||entity?.type==="Foundation"?"Substance requirements do not apply to "+entity?.type.toLowerCase()+"s.":"Substance requirements do not apply to entities in "+entity?.jur+"."}
    </div>:
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:14}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",color:"#666",marginBottom:10}}>Activity classification</div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:"#666",marginBottom:6}}>Relevant activities (select all that apply):</div>
            {activities.map(a=><div key={a} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"0.5px solid #f5f5f5",fontSize:12}}>
              <div style={{width:14,height:14,borderRadius:3,border:"1px solid #ccc",background:a===entityActivity||a==="Holding company"?"#00C4CC":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {(a===entityActivity||a==="Holding company")&&<span style={{color:"#fff",fontSize:9}}>✓</span>}
              </div>
              <span style={{color:a===entityActivity||a==="Holding company"?"#111":"#666"}}>{a}</span>
            </div>)}
          </div>
        </div>
        <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:14}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",color:"#666",marginBottom:10}}>Substance test status</div>
          {[["Test applicable","Yes — "+entityActivity],["Substance status",<Bx label="Meets test" colors={{bg:"#EAF3DE",color:"#27500A"}}/>],["CIGA performed in "+entity?.jur,"Yes"],["Adequate employees",entity?.jur==="Isle of Man"?"2 directors — IOM resident":"Review required"],["Adequate premises","Registered office — "+entity?.jur],["Adequate expenditure","Annual fee — meets minimum threshold"],["Board meetings in jurisdiction","1 per year (minimum)"],["Last substance filing","November 2024"],["Next substance due","November 2025"],["Filing status",<Bx label="On track" colors={{bg:"#EAF3DE",color:"#27500A"}}/>]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}><span style={{color:"#666",maxWidth:160}}>{k}</span><span style={{fontWeight:500,textAlign:"right",maxWidth:180}}>{v}</span></div>
          ))}
        </div>
      </div>
      <div style={{background:"#f9f9f9",borderRadius:8,padding:12}}>
        <div style={{fontSize:11,fontWeight:600,marginBottom:8}}>Substance evidence on file</div>
        {[
          {item:"Board meeting minutes — in jurisdiction",status:"✓ Filed",c:"#4CAF7D"},
          {item:"Directors resident in jurisdiction",status:"✓ Confirmed",c:"#4CAF7D"},
          {item:"Accounts / management accounts",status:"✓ Filed",c:"#4CAF7D"},
          {item:"Payroll records (if applicable)",status:"N/A — holding company",c:"#aaa"},
          {item:"CIGA evidence — decision making",status:"✓ Board minutes filed",c:"#4CAF7D"},
        ].map((e,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:11}}>
            <span style={{color:"#666"}}>{e.item}</span>
            <span style={{color:e.c,fontWeight:500}} dangerouslySetInnerHTML={{__html:e.status}}/>
          </div>
        ))}
      </div>
    </div>}
  </div>;
}

export default function AffinityCoreEntityAdmin({ officeFilter="", onNav, role="system_admin", internalRefs }) {
  const [sel, setSel]       = useState(1);
  const [tab, setTab]       = useState("overview");
  const [search, setSearch] = useState("");
  const [classF, setClassF] = useState("");  // ""=all, "client", "group"
  const [jurF, setJurF]     = useState("");
  const [typeF, setTypeF]   = useState("");
  const [statF, setStatF]   = useState("");
  const [modal, setModal]   = useState(null);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [gamingReg, setGamingReg] = useState("");
  const [repTab, setRepTab] = useState("aum");
  const [repRows, setRepRows] = useState([]);
  const [repLoading, setRepLoading] = useState(false);
  const REPORTS = {
    aum:  { label:"Assets under management", fetch:()=>repAum(),          cols:[["entity","Entity"],["jurisdiction","Jurisdiction"],["description","Asset"],["acquired","Acquired"],["value","Value"],["ccy","Ccy"],["disposed","Disposed"],["disposal_value","Disposal value"],["status","Status"]] },
    bank: { label:"Bank balances (FSA)",      fetch:()=>repBankBalances(), cols:[["entity","Entity"],["bank","Bank"],["account_name","Account"],["ccy","Ccy"],["balance","Balance"],["balance_date","As at"],["iban","IBAN"],["sort_code","Sort code"]] },
    safe: { label:"Safe custody & archiving",  fetch:()=>repSafeCustody(null), cols:[["entity","Entity"],["record_type","Type"],["item","Item"],["location","Location"],["box_number","Box no."],["deposited","Deposited"],["retrieved","Retrieved"],["authorised_by","Authorised by"]] },
    sig:  { label:"Authorised signatories",    fetch:()=>repSignatories(),  cols:[["entity","Entity"],["signatory","Signatory"],["category","Category"],["class","Class"],["bank","Bank"],["from_date","From"],["to_date","To"]] },
  };

  // Map office name to jurisdiction for cross-filter
  const officeToJur = {
    "Isle of Man":"Isle of Man","Malta":"Malta",
    "Cayman Islands":"Cayman Islands","United Kingdom":"United Kingdom",
    "Miami":"United States","Cyprus":"Cyprus"
  };
  const activeJurF = officeFilter && officeFilter !== "All" ? officeToJur[officeFilter] : jurF;

  const [liveEnts, setLiveEnts] = useState(null);
  const [det, setDet] = useState(null);
  const fmtD = (s) => (s ? String(s).split("-").reverse().join("/") : null);

  // load live client portfolio
  useEffect(() => {
    if (!isConfigured) return;
    let ok = true;
    eaEntitiesList().then(({ data }) => {
      if (!ok || !data || !data.length) return;
      const mapped = data.map((r) => {
        const demo = ENTITIES.find((e) => e.ref === r.ref) || {};
        return { ...demo, id: r.id, ref: r.ref, name: r.name, type: r.entity_type, jur: r.jurisdiction,
                 status: r.admin_status, risk: r.risk_rating, incorporated: fmtD(r.incorporation_date), entityClass: r.entity_class };
      });
      setLiveEnts(mapped);
      setSel((s) => (mapped.find((e) => e.id === s) ? s : mapped[0].id));
    }).catch(() => {});
    return () => { ok = false; };
  }, []);

  // load selected entity detail
  useEffect(() => {
    if (!isConfigured || !liveEnts || sel == null) { setDet(null); return; }
    let ok = true;
    Promise.all([eaProfile(sel), eaOfficers(sel), eaShareholders(sel), eaCharges(sel), eaUbos(sel), eaAddresses(sel), eaMeetings(sel),
                 eaBanks(sel), eaAssets(sel), eaDividends(sel), eaSafeItems(sel), eaFileNotes(sel), eaSafeMovements(sel), eaSignatories(sel)])
      .then(([p, o, sh, c, u, a, m, bk, as, dv, sf, fn, sm, sg]) => { if (ok) setDet({
        profile: (p.data && p.data[0]) || null, officers: o.data || [], shareholders: sh.data || [],
        charges: c.data || [], ubos: u.data || [], addresses: a.data || [], meetings: m.data || [],
        banks: bk.data || [], assets: as.data || [], dividends: dv.data || [], safe: sf.data || [], fileNotes: fn.data || [],
        safeMovements: sm.data || [], signatories: sg.data || [] }); })
      .catch(() => { if (ok) setDet(null); });
    return () => { ok = false; };
  }, [sel, liveEnts]);

  // Internal-vs-client scoping: a role without "group" access never sees Affinity's
  // own entities anywhere in this module (portfolio, search, counts, reports).
  const allEnts = liveEnts || ENTITIES;
  // Affinity's own companies are checked one by one, not as a single switch.
  const ents    = useMemo(()=>filterEntitiesByAccess(allEnts, role, internalRefs),[allEnts,role,internalRefs]);

  useEffect(()=>{
    if(!reportsOpen || !isConfigured) return;
    let ok=true; setRepLoading(true);
    REPORTS[repTab].fetch().then(({data})=>{ if(ok){ setRepRows(data||[]); setRepLoading(false); } })
      .catch(()=>{ if(ok){ setRepRows([]); setRepLoading(false); } });
    return ()=>{ok=false;};
  },[reportsOpen, repTab]);
  const exportRepCsv = () => {
    const cols = REPORTS[repTab].cols;
    const head = cols.map(c=>c[1]).join(",");
    const body = repRows.map(r=>cols.map(c=>`"${String(r[c[0]]??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([head+"\n"+body], { type:"text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `affinity-${repTab}-report.csv`; a.click();
  };

  const filtered = useMemo(()=>ents.filter(e=>
    (!search||e.name.toLowerCase().includes(search.toLowerCase())||e.ref.toLowerCase().includes(search.toLowerCase()))&&
    (!activeJurF||e.jur===activeJurF)&&(!typeF||e.type===typeF)&&(!statF||e.status===statF)&&(!classF||(e.entityClass||"client")===classF)
  ),[search,activeJurF,typeF,statF,classF,jurF,officeFilter,ents]);

  // entity-class counts for the Internal/Client scope control
  const classCounts = useMemo(()=>ents.reduce((a,e)=>{
    const k=(e.entityClass||"client")==="group"?"group":"client"; a[k]=(a[k]||0)+1; return a;
  },{client:0,group:0}),[ents]);

  const baseEntity = ents.find(e=>e.id===sel);
  const entity = (det && det.profile)
    ? { ...baseEntity, regNo:det.profile.reg_no, yearEnd:det.profile.year_end, principalActivity:det.profile.business_activity,
        jur:det.profile.jurisdiction, type:det.profile.entity_type, incorporated:fmtD(det.profile.incorporation_date),
        status:det.profile.admin_status, risk:det.profile.risk_rating, companiesAct:det.profile.incorporation_regime, regulator:det.profile.regulator, mlroOfficer:det.profile.mlro, regOffice:det.profile.registered_office, auditStatus:det.profile.audit_status, entityClass:baseEntity.entityClass }
    : baseEntity;
  const dirs     = det ? det.officers.map(o=>({ id:o.id, name:o.name, role:o.role, appointed:fmtD(o.appointed), resigned:fmtD(o.resigned), nationality:o.nationality, dob:fmtD(o.dob), address:o.address, tin:o.tin, taxResidence:o.tax_residence }))  : (ENTITY_DATA.directors[sel]||[]);
  const shares   = det ? det.shareholders.map(x=>({ id:x.id, name:x.name, type:"—", shares:x.shares, class:x.share_class, pct:(x.pct!=null?x.pct+"%":"—"), nominal:"—", paid:"—", regDate:fmtD(x.held_from) })) : (ENTITY_DATA.shareholders[sel]||[]);
  const addrs    = det ? det.addresses.map(a=>({ type:a.address_type, address:a.address, from:fmtD(a.from_date), to:a.to_date?fmtD(a.to_date):null })) : (ENTITY_DATA.addresses[sel]||[]);
  const banks    = det ? det.banks.map(b=>({ id:b.id, bank:b.bank, account:b.account_name, number:b.number, currency:b.ccy, signatories:b.signatories, resolution:fmtD(b.resolution_date), closed:b.closed_date?fmtD(b.closed_date):null, iban:b.iban, sortCode:b.sort_code, balance:b.balance, balanceDate:b.balance_date?fmtD(b.balance_date):null })) : (ENTITY_DATA.bankAccounts[sel]||[]);
  const charges  = det ? det.charges.map(c=>({ id:c.id, chargee:c.chargee, type:c.charge_type, amount:(c.ccy||"")+" "+Number(c.amount||0).toLocaleString(), registered:fmtD(c.registered_date), satisfied:c.satisfied_date?fmtD(c.satisfied_date):null, currency:c.ccy })) : (ENTITY_DATA.charges[sel]||[]);
  const assets   = det ? det.assets.map(a=>({ id:a.id, desc:a.description, acquired:fmtD(a.acquired_date), lastValuation:fmtD(a.last_valuation_date), value:(a.ccy||"")+" "+Number(a.value||0).toLocaleString(), currency:a.ccy, notes:a.notes, disposal:a.disposal_date?fmtD(a.disposal_date):null, disposalValue:(a.disposal_value!=null?(a.ccy||"")+" "+Number(a.disposal_value).toLocaleString():null) })) : (ENTITY_DATA.assets[sel]||[]);
  const divs     = det ? det.dividends.map(d=>({ id:d.id, class:d.share_class, name:d.name, requested:fmtD(d.requested_date), paid:fmtD(d.paid_date), perShare:d.per_share, notes:d.notes })) : (ENTITY_DATA.dividends[sel]||[]);
  const nameChgs = ENTITY_DATA.nameChanges[sel]||[];
  const forgRegs = ENTITY_DATA.foreignRegs[sel]||[];
  const fileNotes= det ? det.fileNotes.map(f=>({ id:f.id, date:fmtD(f.note_date), author:f.author, employee:f.employee_name, linkedEntityId:f.linked_entity_id, subject:f.subject, note:f.note })) : (ENTITY_DATA.fileNotes[sel]||[]);
  const meetings = det ? det.meetings.map(m=>({ id:m.id, type:m.meeting_type, date:fmtD(m.meeting_date), location:"—", attendees:"—", agenda:m.notes, status:"Recorded" })) : (ENTITY_DATA.meetings[sel]||[]);
  const safeItems= det ? det.safe.map(x=>({ id:x.id, item:x.item, deposited:fmtD(x.deposited_date), retrieved:x.retrieved_date?fmtD(x.retrieved_date):null, auth:x.authorised_by, recordType:x.record_type||"Safe custody", location:x.location, boxNumber:x.box_number, description:x.description })) : (ENTITY_DATA.safeItems[sel]||[]);
  const safeMovements = det ? (det.safeMovements||[]).map(m=>({ id:m.id, requestedBy:m.requested_by, action:m.action, date:fmtD(m.movement_date), reason:m.reason })) : [];
  const signatories = det ? (det.signatories||[]).map(s=>({ id:s.id, name:s.name, category:s.category, class:s.class, from:fmtD(s.from_date), to:s.to_date?fmtD(s.to_date):null })) : [];
  const relations= det ? det.ubos.map(u=>({ id:u.id, name:u.name, role:u.role, nature:u.nature_of_control, ownershipPct:u.ownership_pct, dob:fmtD(u.dob), nationality:u.nationality, tin:u.tin, taxResidence:u.tax_residence, shared:false, linkedEntities:[] })) : (ENTITY_DATA.relations[sel]||[]);

  const nb = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"transparent", color:"var(--text-secondary,#666)", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };

  const FormModal = ({ title, fields, onClose }) => (
    <div style={s.modal} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.modalBox}>
        <div style={{ fontSize:14, fontWeight:600, marginBottom:16 }}>{title}</div>
        <div style={s.fgGrid}>
          {fields.map((f,i)=>(
            <div key={i} style={{ ...s.fg, gridColumn:f.full?"1/-1":"auto" }}>
              <label style={s.fgl}>{f.label}</label>
              {f.type==="select"
                ?<select style={s.fgi}>{(f.opts||[]).map(o=><option key={o}>{o}</option>)}</select>
                :f.type==="textarea"
                ?<textarea style={{ ...s.fgi, height:60, padding:"6px 8px" }} placeholder={f.placeholder||""} />
                :<input style={s.fgi} placeholder={f.placeholder||""} type={f.type||"text"} />
              }
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:14 }}>
          <button style={s.btn(false)} onClick={onClose}>Cancel</button>
          <button style={s.btn(true)} onClick={onClose}>Save</button>
        </div>
      </div>
    </div>
  );

  const renderTab = () => {
    if(!entity) return null;
    switch(tab) {

      case "overview": return (
        <div>
          <div style={s.g2}>
            <div style={s.card}>
              <div style={s.cardT}>Core information</div>
              {[
                ["Client / group",entity.group],
                ["Principal activity",entity.principalActivity],
                ["Entity type",entity.type],
                ...(entity.companiesAct?[["Incorporation regime",entity.companiesAct]]:[]),
                ["Jurisdiction",entity.jur],
                ["Registration number",entity.regNo],
                ["Incorporated",entity.incorporated],
                ["Year end",entity.yearEnd],
                ["Currency",entity.currency],
                ["Status",entity.status],
                ["Risk rating",entity.risk],
                ...(entity.auditStatus?[["Audit status", <Bx label={entity.auditStatus} colors={{"Up to date":{bg:"#EAF3DE",color:"#27500A"},"In progress":{bg:"#FAEEDA",color:"#633806"},"Overdue":{bg:"#FCEBEB",color:"#A32D2D"},"Not required":{bg:"#F1EFE8",color:"#888"}}[entity.auditStatus]||{bg:"#eee",color:"#666"}}/>]]:[]),
                ["Registered office", entity.regOffice || `Affinity Group, ${entity.jur}`],
                ...(entity.regulator ? [["Regulator", entity.regulator], ...(entity.mlroOfficer?[["MLRO / Compliance Officer", entity.mlroOfficer]]:[])] : []),
                ["Business address","Same as registered"],
                ["Communication address","Same as registered"],
                ...((entity.foreignRegs && entity.foreignRegs.length>0)
                  ? entity.foreignRegs.map(fr => [`Foreign reg — ${fr.jurisdiction||fr.jur||"—"}`, fr.regNo||fr.number||"—"])
                  : [
                      ["Foreign reg","FR-2024-08821"],
                      ["Foreign reg","C-92847-MFS"],
                    ]),
              ].map(([k,v], i)=>(
                <div key={k+"-"+i} style={s.dRow}><span style={s.dKey}>{k}</span><span style={s.dVal}>{v}</span></div>
              ))}
            </div>
            <div style={s.card}>
              <div style={s.cardT}>Administration</div>
              {[["Administrator",entity.admin],["Manager",entity.manager],["Lead director",entity.director],["Accountant","Neil Kelly"],["MLRO","Colette Grisdale"],["Office",entity.jur]].map(([k,v])=>(
                <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={s.dVal}>{v}</span></div>
              ))}
              <div style={{ marginTop:10 }}>
                <div style={s.cardT}>Active services</div>
                {["Company administration","Registered office","Director services","Annual return filing"].map(sv=>(
                  <div key={sv} style={{ fontSize:11, padding:"4px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ color:CY }}>✓</span><span style={{ color:"var(--text-secondary,#666)" }}>{sv}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={s.g3}>
            <div style={s.card}>
              <div style={s.cardT}>Upcoming reminders</div>
              {[
                { item:"Annual return due",date:"12/03/2026",type:"Filing",sev:"green" },
                { item:"Periodic review due",date:entity.risk==="High"?"18/08/2025":"14/09/2025",type:"Compliance",sev:entity.risk==="High"?"red":"amber" },
                { item:"Year end accounts",date:`30/09/${new Date().getFullYear()}`,type:"Accounts",sev:"blue" },
              ].map((r,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", fontSize:11 }}>
                  <div><div style={{ fontWeight:500 }}>{r.item}</div><div style={{ color:"var(--text-secondary,#666)", fontSize:10 }}>{r.type}</div></div>
                  <span style={{ color:{red:"#EF4444",amber:"#F59E0B",green:"#4CAF7D",blue:CY}[r.sev], fontWeight:500 }}>{r.date}</span>
                </div>
              ))}
            </div>
            <div style={s.card}>
              <div style={s.cardT}>Quick summary</div>
              {[["Directors / trustees",dirs.filter(d=>!d.resigned).length],["Shareholders",shares.length],["Bank accounts",banks.length],["Active charges",charges.filter(c=>!c.satisfied).length],["Assets on record",assets.length],["File notes",fileNotes.length],["Meetings recorded",meetings.length]].map(([k,v])=>(
                <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={s.dVal}>{v||"—"}</span></div>
              ))}
            </div>
            <div style={s.card}>
              <div style={s.cardT}>Memorandum &amp; articles</div>
              {[["Date of M&A","12/03/2018"],["Last amended","N/A"],["Custom clauses","Restriction on transfer of shares"],["Filed with","IOM Companies Registry"],["Copy in DMS","Yes — Certificate + M&A"]].map(([k,v])=>(
                <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={s.dVal}>{v}</span></div>
              ))}
              <button style={{ ...s.btn(false), marginTop:8, fontSize:10 }} onClick={()=>onNav&&onNav("documents")}>View M&amp;A in Documents ↗</button>
            </div>
          </div>
        </div>
      );

      case "statutory": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Statutory information — {entity.name}</div>
            <button style={s.btn(true)} onClick={()=>setModal("statutory")}>Edit statutory data</button>
          </div>
          <div style={s.g2}>
            <div style={s.card}>
              <div style={s.cardT}>Registration details</div>
              {[["Registration number",entity.regNo],["Jurisdiction",entity.jur],["Type",entity.type],["Incorporated",entity.incorporated],["Year end",entity.yearEnd],["Tax status","Tax exempt"],["FATCA classification","Passive NFE"],["CRS classification","Passive NFE"],["GIIN","Not applicable"]].map(([k,v])=>(
                <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={s.dVal}>{v}</span></div>
              ))}
            </div>
            <div style={s.card}>
              <div style={s.cardT}>Filing obligations</div>
              {[["Annual return due","12/03/2026"],["Last annual return filed","12/03/2025"],["Last accounts prepared","31/03/2025"],["Next accounts due","30/09/2025"],["Audit required","No"],["Substance review due","31/12/2025"],["Substance classification","Holding company"],["FATCA return due","31/05/2026"]].map(([k,v])=>(
                <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={s.dVal}>{v}</span></div>
              ))}
            </div>
          </div>
          {nameChgs.length>0&&(
            <div style={s.card}>
              <div style={s.cardT}>Name changes</div>
              <Tbl cols={[{l:"Old name",w:"30%"},{l:"New name",w:"30%"},{l:"Effective date",w:"20%"},{l:"Applied date",w:"20%"}]}
                rows={nameChgs.map(n=>(
                  <tr key={n.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                    <td style={s.td}>{n.oldName}</td><td style={{ ...s.td, fontWeight:500 }}>{n.newName}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{n.effective}</td><td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{n.applied}</td>
                  </tr>
                ))}
              />
            </div>
          )}
        </div>
      );

      case "directors": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>{entity.type==="Trust"?"Trustees & parties":"Directors & officers"}</div>
            <button style={s.btn(true)} onClick={()=>setModal("director")}>＋ Appoint officer</button>
          </div>
          <Tbl cols={[{l:"Name",w:"16%"},{l:"Role",w:"13%"},{l:"Appointed",w:"9%"},{l:"Resigned",w:"8%"},{l:"Nationality",w:"10%"},{l:"Tax residence",w:"12%"},{l:"TIN",w:"11%"},{l:"Date of birth",w:"9%"},{l:"Address",w:"12%"}]}
            rows={dirs.map(d=>(
              <tr key={d.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:d.resigned?"var(--bg-secondary,#f9f9f9)":"transparent" }}>
                <td style={{ ...s.td, fontWeight:500, color:d.resigned?"var(--text-secondary,#666)":undefined }}>{d.name}</td>
                <td style={s.td}><Badge label={d.role} colors={{ Director:{bg:"#E6F7FB",color:"#0077A8"},"Director / UBO":{bg:"#FCEBEB",color:"#A32D2D"}, Trustee:{bg:"#EEF0FB",color:"#3C3489"}, Settlor:{bg:"#EAF3DE",color:"#27500A"}, Beneficiary:{bg:"#FAEEDA",color:"#633806"} }[d.role.split(" / ")[0]]||{bg:"#eee",color:"#666"}} /></td>
                <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{d.appointed}</td>
                <td style={s.td}>{d.resigned?<Badge label="Resigned" colors={{ bg:"#F1EFE8", color:"#888" }} />:<span style={{ color:"var(--text-secondary,#666)" }}>—</span>}</td>
                <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{d.nationality}</td>
                <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{d.taxResidence||"—"}</td>
                <td style={{ ...s.td, color:"var(--text-secondary,#666)", fontFamily:"monospace", fontSize:10 }}>{d.tin||"—"}</td>
                <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{d.dob}</td>
                <td style={{ ...s.td, color:"var(--text-secondary,#666)", overflow:"hidden", textOverflow:"ellipsis" }}>{d.address}</td>
              </tr>
            ))}
          />
          {dirs.length===0&&<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No officers recorded. Click '+ Appoint officer' to add.</div>}
        </div>
      );

      case "shareholders": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Share register — {entity.name}</div>
            <button style={s.btn(true)} onClick={()=>setModal("shareholder")}>＋ Register transfer / issuance</button>
          </div>
          {shares.length>0?(
            <Tbl cols={[{l:"Shareholder",w:"22%"},{l:"Type",w:"10%"},{l:"Shares",w:"10%"},{l:"Class",w:"10%"},{l:"Nominal",w:"10%"},{l:"Paid up",w:"10%"},{l:"%",w:"8%"},{l:"Reg. date",w:"12%"}]}
              rows={shares.map(sh=>(
                <tr key={sh.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                  <td style={{ ...s.td, fontWeight:500 }}>{sh.name}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{sh.type}</td>
                  <td style={{ ...s.td, textAlign:"right", fontWeight:500 }}>{sh.shares.toLocaleString()}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{sh.class}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{sh.nominal}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{sh.paid}</td>
                  <td style={{ ...s.td, fontWeight:600 }}>{sh.pct}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{sh.regDate}</td>
                </tr>
              ))}
            />
          ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>{entity.type==="Trust"?"Trust structure — no share register applicable.":"No shareholders recorded."}</div>}
        </div>
      );

      case "addresses": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Addresses — unlimited address types supported</div>
            <button style={s.btn(true)} onClick={()=>setModal("address")}>＋ Add address</button>
          </div>
          {addrs.length>0?(addrs.map(a=>(
            <div key={a.type} style={{ ...s.card, marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:CY, marginBottom:4 }}>{a.type}</div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{a.address}</div>
                  <div style={{ fontSize:11, color:"var(--text-secondary,#666)", marginTop:4 }}>From {a.from}{a.to?` to ${a.to}`:""}</div>
                </div>
                <button style={s.btn(false)}>Edit</button>
              </div>
            </div>
          ))):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No addresses recorded.</div>}
        </div>
      );

      case "bank": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Bank &amp; broker accounts</div>
            <button style={s.btn(true)} onClick={()=>setModal("bank")}>＋ Add account</button>
          </div>
          {banks.length>0?(
            <Tbl cols={[{l:"Bank / broker",w:"14%"},{l:"Account name",w:"12%"},{l:"Account no.",w:"10%"},{l:"IBAN",w:"16%"},{l:"Sort code",w:"8%"},{l:"Ccy",w:"5%"},{l:"Balance",w:"15%"},{l:"Status",w:"8%"}]}
              rows={banks.map(b=>(
                <tr key={b.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                  <td style={{ ...s.td, fontWeight:500 }}>{b.bank}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{b.account}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{b.number}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)", fontFamily:"monospace", fontSize:10 }}>{b.iban||"—"}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)", fontFamily:"monospace", fontSize:10 }}>{b.sortCode||"—"}</td>
                  <td style={s.td}>{b.currency}</td>
                  <td style={{ ...s.td, fontWeight:600 }}>{b.balance!=null?`${b.currency||""} ${Number(b.balance).toLocaleString()}`:"—"}{b.balanceDate&&<span style={{ display:"block", fontSize:9, fontWeight:400, color:"var(--text-secondary,#999)" }}>as at {b.balanceDate}</span>}</td>
                  <td style={s.td}><Badge label={b.closed?"Closed":"Active"} colors={b.closed?{bg:"#F1EFE8",color:"#888"}:{bg:"#EAF3DE",color:"#27500A"}} /></td>
                </tr>
              ))}
            />
          ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No bank accounts recorded.</div>}

          <div style={{ display:"flex", justifyContent:"space-between", margin:"18px 0 10px" }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Authorised signatory list</div>
            <button style={s.btn(true)} onClick={()=>setModal("signatory")}>＋ Add signatory</button>
          </div>
          {signatories.length>0?(
            <Tbl cols={[{l:"Signatory",w:"28%"},{l:"Category",w:"24%"},{l:"Class",w:"16%"},{l:"From",w:"14%"},{l:"To",w:"14%"}]}
              rows={signatories.map(sg=>(
                <tr key={sg.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:sg.to?"var(--bg-secondary,#f9f9f9)":"transparent" }}>
                  <td style={{ ...s.td, fontWeight:500 }}>{sg.name}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{sg.category||"—"}</td>
                  <td style={s.td}>{sg.class?<Badge label={sg.class} colors={{bg:"#E6F7FB",color:"#0077A8"}} />:"—"}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{sg.from}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{sg.to||"Current"}</td>
                </tr>
              ))}
            />
          ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"14px 0", textAlign:"center" }}>No authorised signatories recorded.</div>}
        </div>
      );

      case "charges": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Charges &amp; security interests</div>
            <button style={s.btn(true)} onClick={()=>setModal("charge")}>＋ Register charge</button>
          </div>
          {charges.length>0?(
            <Tbl cols={[{l:"Chargee / lender",w:"22%"},{l:"Type",w:"14%"},{l:"Amount",w:"14%"},{l:"Currency",w:"10%"},{l:"Registered",w:"12%"},{l:"Discharged",w:"12%"},{l:"Status",w:"12%"}]}
              rows={charges.map(c=>(
                <tr key={c.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                  <td style={{ ...s.td, fontWeight:500 }}>{c.chargee}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{c.type}</td>
                  <td style={{ ...s.td, fontWeight:600 }}>{c.amount}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{c.currency}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{c.registered}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{c.satisfied||"—"}</td>
                  <td style={s.td}><Badge label={c.satisfied?"Satisfied":"Active"} colors={c.satisfied?{bg:"#F1EFE8",color:"#888"}:{bg:"#FAEEDA",color:"#633806"}} /></td>
                </tr>
              ))}
            />
          ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No charges registered.</div>}
        </div>
      );

      case "assets": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Assets</div>
            <button style={s.btn(true)} onClick={()=>setModal("asset")}>＋ Add asset</button>
          </div>
          <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"8px 12px", fontSize:11, color:"var(--text-secondary,#666)", marginBottom:12 }}>
            ℹ️ Assets are recorded at entity level. This includes all asset types — property, investments, vessels, aircraft, and other holdings.
          </div>
          {assets.length>0?(
            <Tbl cols={[{l:"Description",w:"24%"},{l:"Acquired",w:"11%"},{l:"Last valuation",w:"12%"},{l:"Purchase value",w:"13%"},{l:"Disposed",w:"11%"},{l:"Disposal value",w:"13%"},{l:"Status",w:"8%"},{l:"Notes",w:"8%"}]}
              rows={assets.map(a=>(
                <tr key={a.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:a.disposal?"var(--bg-secondary,#f9f9f9)":"transparent" }}>
                  <td style={{ ...s.td, fontWeight:500 }}>{a.desc}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{a.acquired}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{a.lastValuation}</td>
                  <td style={{ ...s.td, fontWeight:600 }}>{a.value}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{a.disposal||"—"}</td>
                  <td style={{ ...s.td, fontWeight:a.disposalValue?600:400, color:a.disposalValue?undefined:"var(--text-secondary,#666)" }}>{a.disposalValue||"—"}</td>
                  <td style={s.td}><Badge label={a.disposal?"Disposed":"Held"} colors={a.disposal?{bg:"#F1EFE8",color:"#888"}:{bg:"#EAF3DE",color:"#27500A"}} /></td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)", whiteSpace:"normal", lineHeight:1.3 }}>{a.notes}</td>
                </tr>
              ))}
            />
          ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No assets recorded.</div>}
        </div>
      );

      case "dividends": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Dividends</div>
            <button style={s.btn(true)} onClick={()=>setModal("dividend")}>＋ Record dividend</button>
          </div>
          {divs.length>0?(
            <Tbl cols={[{l:"Share class",w:"14%"},{l:"Recipient",w:"20%"},{l:"Date requested",w:"14%"},{l:"Date paid",w:"14%"},{l:"Per share",w:"14%"},{l:"Notes",w:"24%"}]}
              rows={divs.map(d=>(
                <tr key={d.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                  <td style={s.td}>{d.class}</td>
                  <td style={{ ...s.td, fontWeight:500 }}>{d.name}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{d.requested}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{d.paid}</td>
                  <td style={{ ...s.td, fontWeight:600 }}>{d.perShare}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{d.notes}</td>
                </tr>
              ))}
            />
          ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No dividends recorded.</div>}
        </div>
      );

      case "foreignRegs": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Foreign registrations</div>
            <button style={s.btn(true)} onClick={()=>setModal("foreignReg")}>＋ Add registration</button>
          </div>
          {forgRegs.length>0?(
            <Tbl cols={[{l:"Country",w:"14%"},{l:"Last annual return",w:"16%"},{l:"Next annual return",w:"16%"},{l:"Last accounts",w:"14%"},{l:"Next accounts",w:"14%"},{l:"Notes",w:"26%"}]}
              rows={forgRegs.map(f=>(
                <tr key={f.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                  <td style={{ ...s.td, fontWeight:500 }}>{f.country}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{f.lastReturn}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{f.nextReturn}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{f.lastAccounts}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{f.nextAccounts}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{f.notes}</td>
                </tr>
              ))}
            />
          ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No foreign registrations recorded.</div>}
        </div>
      );

      case "relations": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Beneficial owners register — owners &amp; controllers</div>
            <button style={s.btn(true)} onClick={()=>setModal("relation")}>＋ Add beneficial owner</button>
          </div>
          <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"8px 12px", fontSize:11, color:"var(--text-secondary,#666)", marginBottom:12 }}>
            ℹ️ Beneficial owners (owners &amp; controllers) are held here, distinct from the officer register. A person may appear both here and as an officer where they hold both roles.
          </div>
          {relations.length>0?(
            <Tbl cols={[{l:"Name",w:"18%"},{l:"Nature of control",w:"22%"},{l:"Ownership",w:"9%"},{l:"DOB",w:"11%"},{l:"Nationality",w:"11%"},{l:"Tax residence",w:"11%"},{l:"TIN",w:"11%"},{l:"Record",w:"7%"}]}
              rows={relations.map(r=>(
                <tr key={r.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                  <td style={{ ...s.td, fontWeight:500 }}>{r.name}{r.role&&<span style={{ display:"block", fontSize:10, fontWeight:400, color:"var(--text-secondary,#999)" }}>{r.role}</span>}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)", whiteSpace:"normal", lineHeight:1.3 }}>{r.nature||"—"}</td>
                  <td style={{ ...s.td, fontWeight:600 }}>{r.ownershipPct!=null?r.ownershipPct+"%":"—"}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{r.dob}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{r.nationality}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{r.taxResidence||"—"}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)", fontFamily:"monospace", fontSize:10 }}>{r.tin||"—"}</td>
                  <td style={s.td}>{r.shared?<Badge label="Shared" colors={{bg:"#E6F7FB",color:"#0077A8"}} title={r.linkedEntities.join(", ")} />:<span style={{ color:"var(--text-secondary,#999)" }}>—</span>}</td>
                </tr>
              ))}
            />
          ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No beneficial owners recorded.</div>}
        </div>
      );

      case "meetings": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>Meetings</div>
            <button style={s.btn(true)} onClick={()=>setModal("meeting")}>＋ Schedule meeting</button>
          </div>
          {meetings.length>0?(meetings.map(m=>(
            <div key={m.id} style={{ ...s.card, marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div><div style={{ fontSize:13, fontWeight:600 }}>{m.type} — {m.date}</div>
                  <div style={{ fontSize:11, color:"var(--text-secondary,#666)", marginTop:3 }}>{m.location}</div></div>
                <Badge label={m.status} colors={{ "Minutes drafted":{bg:"#FAEEDA",color:"#633806"}, "Minutes executed":{bg:"#EAF3DE",color:"#27500A"}, Scheduled:{bg:"#E6F7FB",color:"#0077A8"} }[m.status]||{bg:"#eee",color:"#666"}} />
              </div>
              {[["Attendees",m.attendees],["Agenda",m.agenda]].map(([k,v])=>(
                <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={{ ...s.dVal, maxWidth:300, whiteSpace:"normal", textAlign:"right" }}>{v}</span></div>
              ))}
              <div style={{ display:"flex", gap:6, marginTop:8 }}>
                <button style={{ ...s.btn(false), fontSize:10 }}>Generate minutes ↗</button>
                <button style={{ ...s.btn(false), fontSize:10 }}>Generate resolution ↗</button>
                <button style={{ ...s.btn(true), fontSize:10 }}>View documents ↗</button>
              </div>
            </div>
          ))):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No meetings recorded.</div>}
        </div>
      );

      case "fileNotes": return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500 }}>File notes</div>
            <button style={s.btn(true)} onClick={()=>setModal("fileNote")}>＋ Add file note</button>
          </div>
          {fileNotes.length>0?(fileNotes.map(n=>{
            const linked = n.linkedEntityId ? (ents.find(e=>e.id===n.linkedEntityId)||{}).name : null;
            return (
            <div key={n.id} style={{ ...s.card, marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div><div style={{ fontSize:12, fontWeight:600 }}>{n.subject}</div>
                  <div style={{ fontSize:10, color:"var(--text-secondary,#666)", marginTop:2 }}>{n.date}{n.employee?` · ${n.employee}`:(n.author?` · ${n.author}`:"")}</div></div>
              </div>
              <div style={{ fontSize:12, color:"var(--text-secondary,#666)", lineHeight:1.5 }}>{n.note}</div>
              {linked&&<div style={{ fontSize:10, color:CY, marginTop:6 }}>⟳ Also linked to master file: {linked}</div>}
            </div>
          );})):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No file notes recorded.</div>}
        </div>
      );

      case "archive": {
        // Archiving register — box-numbered archived records (record_type = 'Archiving')
        const archived = safeItems.filter(si=>si.recordType==="Archiving");
        return (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>Archiving register</div>
              <button style={s.btn(true)} onClick={()=>setModal("safeItem")}>＋ Add archive entry</button>
            </div>
            {archived.length>0?(
              <Tbl cols={[{l:"Item",w:"26%"},{l:"Description",w:"20%"},{l:"Location",w:"18%"},{l:"Box no.",w:"12%"},{l:"Date archived",w:"14%"},{l:"Authorised by",w:"10%"}]}
                rows={archived.map(si=>(
                  <tr key={si.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                    <td style={{ ...s.td, fontWeight:500 }}>{si.item}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.description||"—"}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.location||"—"}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)", fontFamily:"monospace", fontSize:10 }}>{si.boxNumber||"—"}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.deposited}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.auth}</td>
                  </tr>
                ))}
              />
            ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No archiving records. Items marked as "Archiving" in Safe custody appear here.</div>}
          </div>
        );
      }

      case "safe": {
        return (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>Safe custody &amp; archiving register</div>
              <button style={s.btn(true)} onClick={()=>setModal("safeItem")}>＋ Add item</button>
            </div>
            {safeItems.length>0?(
              <Tbl cols={[{l:"Type",w:"12%"},{l:"Item",w:"22%"},{l:"Location",w:"18%"},{l:"Box no.",w:"10%"},{l:"Deposited",w:"11%"},{l:"Retrieved",w:"11%"},{l:"Authorised by",w:"12%"},{l:"Status",w:"9%"}]}
                rows={safeItems.map(si=>(
                  <tr key={si.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:si.retrieved?"var(--bg-secondary,#f9f9f9)":"transparent" }}>
                    <td style={s.td}><Badge label={si.recordType||"Safe custody"} colors={si.recordType==="Archiving"?{bg:"#EEF0FB",color:"#3C3489"}:{bg:"#E6F7FB",color:"#0077A8"}} /></td>
                    <td style={{ ...s.td, fontWeight:500 }}>{si.item}{si.description&&<span style={{ display:"block", fontSize:10, fontWeight:400, color:"var(--text-secondary,#999)" }}>{si.description}</span>}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.location||"—"}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)", fontFamily:"monospace", fontSize:10 }}>{si.boxNumber||"—"}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.deposited}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.retrieved||"—"}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.auth}</td>
                    <td style={s.td}><Badge label={si.retrieved?"Out":"Held"} colors={si.retrieved?{bg:"#F1EFE8",color:"#888"}:{bg:"#EAF3DE",color:"#27500A"}} /></td>
                  </tr>
                ))}
              />
            ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No safe custody or archiving items recorded.</div>}

            <div style={{ display:"flex", justifyContent:"space-between", margin:"18px 0 10px" }}>
              <div style={{ fontSize:12, fontWeight:500 }}>Movements log</div>
              <button style={s.btn(true)} onClick={()=>setModal("safeMovement")}>＋ Log movement</button>
            </div>
            {safeMovements.length>0?(
              <Tbl cols={[{l:"Date",w:"16%"},{l:"Action",w:"20%"},{l:"Requested by",w:"22%"},{l:"Reason",w:"42%"}]}
                rows={safeMovements.map(mv=>(
                  <tr key={mv.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{mv.date}</td>
                    <td style={s.td}><Badge label={mv.action} colors={/remov/i.test(mv.action)?{bg:"#FAEEDA",color:"#633806"}:/return|deposit/i.test(mv.action)?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...s.td, fontWeight:500 }}>{mv.requestedBy}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)", whiteSpace:"normal", lineHeight:1.3 }}>{mv.reason}</td>
                  </tr>
                ))}
              />
            ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"14px 0", textAlign:"center" }}>No movements logged.</div>}
          </div>
        );
      }

      case "compliance": return (
        <div>
          <div style={{ fontSize:12, fontWeight:500, marginBottom:12 }}>Compliance register — {entity.name}</div>
          <div style={s.g2}>
            <div style={s.card}>
              <div style={s.cardT}>Compliance status</div>
              {[["Risk rating",entity.risk],["Last periodic review","14/03/2024"],["Next review due",entity.risk==="High"?"18/08/2025":entity.risk==="Very High"?"12/07/2025":"14/09/2025"],["MLRO","Colette Grisdale"],["Compliance officer","Colette Grisdale"],["KYC status",entity.risk==="High"?"Issues outstanding":"Current"],["Worldcheck","Last screened 14/07/2025"],["PEP status","No PEP identified"],["SOF status","Documented"]].map(([k,v])=>(
                <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={{ ...s.dVal, color:v.includes("outstanding")?"#EF4444":v.includes("overdue")?"#EF4444":undefined }}>{v}</span></div>
              ))}
            </div>
            <div style={s.card}>
              <div style={s.cardT}>Open compliance cases</div>
              {entity.risk==="High"||entity.risk==="Very High"?(
                <div>
                  <div style={{ background:"#FAEEDA", borderRadius:6, padding:"8px 12px", fontSize:11, color:"#633806", marginBottom:8 }}>
                    ⚠️ {entity.risk==="Very High"?"Sanctions match open — MLRO review required":"EDD documentation outstanding — review overdue"}
                  </div>
                  <div style={{ fontSize:11, color:"var(--text-secondary,#666)", marginBottom:6 }}>Open cases: {entity.risk==="Very High"?2:1}</div>
                  <button style={s.btn(true)}>View in compliance module ↗</button>
                </div>
              ):<div style={{ fontSize:12, color:"#4CAF7D" }}>✓ No open compliance cases</div>}
            </div>
          </div>
        </div>
      );

      case "registers": return (
        <div>
          <div style={{ fontSize:12, fontWeight:500, marginBottom:4 }}>Generate registers</div>
          <div style={{ fontSize:11, color:"var(--text-secondary,#666)", marginBottom:14 }}>Select a register, choose output format, and download. All registers are generated from live entity data.</div>
          {[
            "Company information sheet — detailed",
            "Company information sheet — summary",
            "Register of members",
            "Register of transfers",
            "Register of issuances",
            "Register of directors",
            "Register of secretaries",
            "Register of charges",
            "Register of auditors",
            "Register of managers",
            "Register of directors' shareholdings",
          ].map(r=>(
            <div key={r} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
              <span style={{ fontSize:12 }}>{r}</span>
              <div style={{ display:"flex", gap:6 }}>
                <button style={{ ...s.btn(false), fontSize:10 }}>Word ↗</button>
                <button style={{ ...s.btn(false), fontSize:10 }}>Excel ↗</button>
                <button style={{ ...s.btn(true), fontSize:10 }}>PDF ↗</button>
              </div>
            </div>
          ))}
          <div style={{ marginTop:16, padding:14, background:"var(--bg-secondary,#f9f9f9)", borderRadius:8 }}>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>Structure chart</div>
            <div style={{ fontSize:11, color:"var(--text-secondary,#666)", marginBottom:10 }}>Generate a structure chart showing ownership, control, and relationships for {entity.name}.</div>
            <div style={{ display:"flex", gap:6 }}>
              <button style={{ ...s.btn(false), fontSize:10 }}>Word ↗</button>
              <button style={{ ...s.btn(false), fontSize:10 }}>Excel ↗</button>
              <button style={{ ...s.btn(true), fontSize:10 }}>PDF ↗</button>
            </div>
          </div>
        </div>
      );

      case "egaming": {
        const entity = ents.find(e=>e.id===sel);
        return (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>eGaming & GSC licence</div>
                <div style={{ fontSize:11, color:"var(--text-secondary,#666)" }}>Gambling Supervision Commission — Isle of Man</div>
              </div>
              <button style={{ padding:"5px 14px", borderRadius:5, border:"none", background:"#00C4CC", color:"#fff", fontSize:11, cursor:"pointer" }}>Update licence data</button>
            </div>

            {/* Licence summary */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:8, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>Licence details</div>
                {[
                  ["Licence reference", entity?.regNo||"—"],
                  ["Licence type", entity?.id===13?"B2C — Casino":"B2B — Platform supply"],
                  ["Status", entity?.id===13?"Application — stage 2":"Live"],
                  ["Issued", entity?.id===13?"Pending":"01/06/2023"],
                  ["Expiry", entity?.id===13?"Pending":"31/05/2026"],
                  ["Annual return due", entity?.id===13?"N/A":"30/11/2025"],
                ].map(([k,v])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", fontSize:12 }}>
                    <span style={{ color:"var(--text-secondary,#666)" }}>{k}</span>
                    <span style={{ fontWeight:500 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:8, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>GSC obligations</div>
                {[
                  ["AML/CFT policy",       "Current",    "#4CAF7D"],
                  ["Responsible gambling", "Current",    "#4CAF7D"],
                  ["Technical standards",  entity?.id===13?"Pending":"Current", entity?.id===13?"#F59E0B":"#4CAF7D"],
                  ["Suitability — directors","Current",  "#4CAF7D"],
                  ["Financial resources",  "Confirmed",  "#4CAF7D"],
                  ["RNG certification",    entity?.id===13?"Pending":"Current", entity?.id===13?"#F59E0B":"#4CAF7D"],
                ].map(([k,v,c])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", fontSize:12 }}>
                    <span style={{ color:"var(--text-secondary,#666)" }}>{k}</span>
                    <span style={{ fontWeight:600, color:c }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Application checklist if applicable */}
            {entity?.id===13&&(
              <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:8, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>GSC application checklist</div>
                {[
                  { step:"Operator information form (OIF)",            status:"Complete" },
                  { step:"Business plan — 3 year projection",          status:"Complete" },
                  { step:"AML/CFT policy",                             status:"Complete" },
                  { step:"Responsible gambling policy",                status:"Complete" },
                  { step:"Suitability — all directors",                status:"In progress" },
                  { step:"System technical standards certification",   status:"Pending" },
                  { step:"RNG / game certification",                   status:"Pending" },
                  { step:"Financial resources evidence",               status:"Complete" },
                  { step:"IT & security assessment",                   status:"Pending" },
                  { step:"GSC suitability decision",                  status:"Pending" },
                ].map((c,i)=>(
                  <div key={i} style={{ display:"flex", gap:10, padding:"7px 0", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", alignItems:"center" }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:c.status==="Complete"?"#4CAF7D":c.status==="In progress"?"#00C4CC":"#f0f0f0", color:c.status==="Complete"||c.status==="In progress"?"#fff":"#aaa", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, flexShrink:0 }}>
                      {c.status==="Complete"?"✓":i+1}
                    </div>
                    <div style={{ flex:1, fontSize:12 }}>{c.step}</div>
                    <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:20, fontSize:10, fontWeight:600, background:c.status==="Complete"?"#EAF3DE":c.status==="In progress"?"#E6F7FB":"#f0f0f0", color:c.status==="Complete"?"#27500A":c.status==="In progress"?"#0077A8":"#aaa" }}>{c.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      default: return <div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>Content for {tab} tab.</div>;
    }
  };

  const modalForms = {
    director: { title:"Appoint officer / trustee", fields:[
      {label:"Full legal name",placeholder:"Full name",full:true},
      {label:"Role",type:"select",opts:["Director","Director / UBO","Alternate Director","Secretary","Trustee","Settlor","Beneficiary","Protector","Manager","Attorney"]},
      {label:"Date appointed",placeholder:"DD/MM/YYYY"},
      {label:"Date of birth",placeholder:"DD/MM/YYYY"},
      {label:"Nationality",placeholder:"Nationality"},
      {label:"Residential address",placeholder:"Full address",full:true},
    ]},
    shareholder: { title:"Register share transfer / issuance", fields:[
      {label:"Shareholder name",placeholder:"Full legal name",full:true},
      {label:"Type",type:"select",opts:["Individual","Corporate","Trust"]},
      {label:"Number of shares",placeholder:"0",type:"number"},
      {label:"Share class",type:"select",opts:["Ordinary","Preference","Redeemable","Units","A shares","B shares"]},
      {label:"Nominal value",placeholder:"£1"},
      {label:"Amount paid up",placeholder:"£0.00"},
      {label:"Registration date",placeholder:"DD/MM/YYYY"},
      {label:"Transaction type",type:"select",opts:["New issuance","Transfer in","Transfer out","Redemption"]},
    ]},
    address: { title:"Add address", fields:[
      {label:"Address type",type:"select",opts:["Registered office","Correspondence","Business address","Mailing address","Property address","Other"]},
      {label:"Address",placeholder:"Full address",full:true,type:"textarea"},
      {label:"Effective from",placeholder:"DD/MM/YYYY"},
      {label:"Effective to (if historical)",placeholder:"DD/MM/YYYY or leave blank"},
    ]},
    bank: { title:"Add bank / broker account", fields:[
      {label:"Bank / broker name",placeholder:"e.g. Barclays Bank",full:true},
      {label:"Account name",placeholder:"e.g. Current account"},
      {label:"Account number (last 4 digits)",placeholder:"****"},
      {label:"Currency",type:"select",opts:["GBP","USD","EUR","Other"]},
      {label:"Board resolution date",placeholder:"DD/MM/YYYY"},
      {label:"Date closed",placeholder:"DD/MM/YYYY or leave blank"},
    ]},
    charge: { title:"Register charge / security interest", fields:[
      {label:"Chargee / lender",placeholder:"Name",full:true},
      {label:"Type",type:"select",opts:["Fixed charge","Floating charge","Debenture","Mortgage","Pledge"]},
      {label:"Amount",placeholder:"0.00"},
      {label:"Currency",type:"select",opts:["GBP","USD","EUR"]},
      {label:"Date registered",placeholder:"DD/MM/YYYY"},
      {label:"Date discharged",placeholder:"DD/MM/YYYY or leave blank"},
    ]},
    asset: { title:"Add asset", fields:[
      {label:"Description",placeholder:"e.g. Commercial property — Manchester",full:true},
      {label:"Date of acquisition",placeholder:"DD/MM/YYYY"},
      {label:"Last valuation date",placeholder:"DD/MM/YYYY"},
      {label:"Purchase / current value",placeholder:"0.00"},
      {label:"Currency",type:"select",opts:["GBP","USD","EUR"]},
      {label:"Notes",placeholder:"Any relevant notes",full:true,type:"textarea"},
    ]},
    dividend: { title:"Record dividend", fields:[
      {label:"Share class",type:"select",opts:["Ordinary","Preference","A shares","B shares"]},
      {label:"Recipient",placeholder:"Name"},
      {label:"Date requested",placeholder:"DD/MM/YYYY"},
      {label:"Date paid",placeholder:"DD/MM/YYYY"},
      {label:"Dividend per share",placeholder:"£0.00"},
      {label:"Notes",placeholder:"Notes",full:true},
    ]},
    foreignReg: { title:"Add foreign registration", fields:[
      {label:"Country",placeholder:"Country"},
      {label:"Last annual return",placeholder:"DD/MM/YYYY"},
      {label:"Next annual return",placeholder:"DD/MM/YYYY"},
      {label:"Last accounts",placeholder:"DD/MM/YYYY"},
      {label:"Next accounts due",placeholder:"DD/MM/YYYY"},
      {label:"Notes",placeholder:"Notes",full:true},
    ]},
    relation: { title:"Add relation", fields:[
      {label:"Full legal name",placeholder:"Full name",full:true},
      {label:"Role / connection",type:"select",opts:["Beneficial owner","Director","Shareholder","Trustee","Settlor","Beneficiary","Attorney","Protector","Introducer","Service provider","Customer","Supplier","Designated Officer","Operations Manager","Data Protection Officer","MLRO","DMLRO","AML/CFT Compliance Officer","Nominated AML/CFT Compliance Officer","Other"]},
      {label:"Date of birth",placeholder:"DD/MM/YYYY"},
      {label:"Nationality",placeholder:"Nationality"},
      {label:"Also linked to (other entities)",placeholder:"Leave blank or enter entity names",full:true},
    ]},
    meeting: { title:"Schedule meeting", fields:[
      {label:"Meeting type",type:"select",opts:["Board meeting","Shareholder meeting","Trustee meeting","Annual general meeting","Extraordinary general meeting","Written resolution"]},
      {label:"Date",placeholder:"DD/MM/YYYY"},
      {label:"Location / platform",placeholder:"e.g. Douglas, IOM or Zoom"},
      {label:"Attendees",placeholder:"Names of attendees",full:true},
      {label:"Agenda items",placeholder:"Agenda summary",full:true,type:"textarea"},
    ]},
    fileNote: { title:"Add file note", fields:[
      {label:"Subject",placeholder:"Brief subject",full:true},
      {label:"Date",placeholder:"DD/MM/YYYY"},
      {label:"Note",placeholder:"Note content",full:true,type:"textarea"},
    ]},
    safeItem: { title:"Add safe custody item", fields:[
      {label:"Item description",placeholder:"e.g. Original certificate of incorporation",full:true},
      {label:"Date deposited",placeholder:"DD/MM/YYYY"},
      {label:"Authorised by",placeholder:"Name"},
    ]},
    statutory: { title:"Edit statutory data", fields:[
      {label:"Registration number",placeholder:entity?.regNo},
      {label:"Date incorporated",placeholder:entity?.incorporated},
      {label:"Year end",placeholder:entity?.yearEnd},
      {label:"Principal currency",type:"select",opts:["GBP","USD","EUR"]},
      {label:"Tax status",type:"select",opts:["Tax exempt","Tax resident — IOM","Tax resident — UK","Tax resident — Malta","Tax resident — Cayman","Other"]},
      {label:"FATCA classification",type:"select",opts:["Passive NFE","Active NFE","Foreign Financial Institution","Deemed Compliant FFI","Exempt Beneficial Owner"]},
      {label:"CRS classification",type:"select",opts:["Passive NFE","Active NFE","Reporting Financial Institution","Non-Reporting Financial Institution"]},
    ]},
  };

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.hdr}>
        <div style={s.logo}>Entity Admin</div>
      </div>

      <div style={s.body}>
        {/* Search-driven entity admin — list panel removed per UX review */}
        <div style={{...s.detail, flex:1}}>
          <div style={{ padding:"12px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ ...s.sw, flex:1, maxWidth:520, minWidth:240 }}>
              <i className="ti ti-search" style={{ fontSize:13, color:"var(--text-secondary,#666)" }} />
              <input
                list="ea-entity-list"
                style={s.swI}
                placeholder="Search for an entity by name or reference…"
                value={search}
                onChange={e=>{
                  const v=e.target.value;
                  setSearch(v);
                  const m=filtered.find(en=>en.name===v||en.ref===v)||ents.find(en=>en.name===v||en.ref===v);
                  if(m){ setSel(m.id); setTab("overview"); }
                }}
              />
              <datalist id="ea-entity-list">{filtered.flatMap(e=>{
                const mark=(e.entityClass||"client")==="group"?" · Internal":"";
                return [<option key={"n"+e.id} value={e.name}>{e.ref+mark}</option>,<option key={"r"+e.id} value={e.ref}>{e.name+mark}</option>];
              })}</datalist>
            </div>
            {entity&&<button style={s.btn(false)} onClick={()=>{ setSel(null); setSearch(""); }}>Clear ✕</button>}
            <button style={s.btn(true)} onClick={()=>setModal("newEntity")}>＋ New entity</button>
          </div>
          {entity?(
            <>
              <div style={s.detHdr}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontSize:16, fontWeight:600, marginBottom:4 }}>{entity.name}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      <Badge label={entity.ref} colors={{ bg:"var(--bg-secondary,#f9f9f9)", color:"var(--text-secondary,#666)" }} />
                      {(entity.entityClass||"client")==="group"
                        ? <Badge label="Internal — Affinity Group" colors={{ bg:"#EAF0FB", color:"#274690" }} />
                        : <Badge label="Client entity" colors={{ bg:"#F0F7F0", color:"#2F6B3A" }} />}
                      <Badge label={jurShort[entity.jur]||entity.jur} colors={officeColors[entity.jur]} />
                      <Badge label={entity.type} colors={{ bg:"var(--bg-secondary,#f9f9f9)", color:"var(--text-secondary,#666)" }} />
                      <Badge label={entity.status} colors={statusBadge(entity.status)} />
                      {entity.risk && entity.risk!=="—" && <Badge label={entity.risk+" risk"} colors={riskColors[entity.risk]} />}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button style={{ ...s.btn(false), opacity:0.5, cursor:"not-allowed" }} disabled
                      title="Editing entity records needs the write layer (Azure + Entra)">Edit entity</button>
                    <button style={s.btn(false)} onClick={()=>onNav&&onNav("documents")}
                      title={"Open "+(entity?entity.name:"this entity")+" in Documents"}>Documents ↗</button>
                    <button style={s.btn(true)} onClick={()=>onNav&&onNav("generate")}
                      title="Generate a statutory register document">Generate register ↗</button>
                  </div>
                </div>
              </div>
              <div style={{display:"flex",flex:1,overflow:"hidden"}}>
                <div style={{width:172,minWidth:172,borderRight:"0.5px solid var(--border-tertiary,#e5e5e5)",overflowY:"auto",background:"var(--bg-secondary,#f9f9f9)",flexShrink:0}}>
                  {["Entity","Regulatory","Registers","Filing Obligations","Admin"].map(group=>{
                    const groupTabs=TABS.filter(t=>t.group===group && (!t.gamingOnly || entity?.isGaming));
                    if(groupTabs.length===0) return null;
                    return <div key={group}>
                      <div style={{fontSize:9,fontWeight:600,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.5px",padding:"10px 12px 4px"}}>{group}</div>
                      {groupTabs.map(t=><div key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 12px",cursor:"pointer",fontSize:12,borderLeft:`2px solid ${tab===t.id?CY:"transparent"}`,background:tab===t.id?"var(--bg-primary,#fff)":"transparent",color:tab===t.id?"var(--text-primary,#111)":"var(--text-secondary,#666)",fontWeight:tab===t.id?500:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.label}</div>)}
                    </div>;
                  })}
                </div>
                <div style={{flex:1,overflowY:"auto",padding:"14px 20px"}}>
                  {tab==="fatca"&&<FATCATab entity={entity}/>}
                  {tab==="crs"&&<CRSTab entity={entity}/>}
                  {tab==="substance"&&<SubstanceTab entity={entity}/>}
                  {tab==="structure"&&<div style={{margin:"-20px -24px"}}><EntityChart/></div>}
                  {tab==="egaming_reg"&&<div style={{margin:"-14px -20px"}}>
                    <AffinityEGaming entity={entity} onNav={onNav}/>
                    {/* Gaming compliance log — the same register catalogue as Compliance,
                        scoped to this entity, so gaming obligations are logged in context. */}
                    <div style={{ padding:"16px 20px", borderTop:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                        <div style={{ fontSize:14, fontWeight:600, color:"#001242" }}>Compliance log</div>
                        <span style={{ fontSize:10.5, color:"#888" }}>{REGISTER_ORDER.length} registers · {entity?.name}</span>
                        <select value={gamingReg} onChange={e=>setGamingReg(e.target.value)}
                          style={{ height:29, padding:"0 8px", fontSize:11.5, border:"0.5px solid #ccc", borderRadius:5, background:"#fff", minWidth:220, marginLeft:"auto" }}>
                          <option value="">All registers</option>
                          {REGISTER_ORDER.map(r=><option key={r} value={r}>{r==="breaches"?"Breach log":COMPLIANCE_REGISTERS[r].label}</option>)}
                        </select>
                      </div>
                      {!gamingReg ? (
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:8, marginTop:10 }}>
                          {REGISTER_ORDER.map(r=>(
                            <div key={r} onClick={()=>setGamingReg(r)}
                              style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:8, padding:"10px 12px", cursor:"pointer" }}>
                              <div style={{ fontSize:11.5, fontWeight:600, color:"#001242" }}>{r==="breaches"?"Breach log":COMPLIANCE_REGISTERS[r].label}</div>
                              <div style={{ fontSize:10, color:"#aaa", marginTop:3 }}>{(COMPLIANCE_REGISTERS[r].cols||[]).slice(0,3).join(" · ")}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ marginTop:10 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                            <div style={{ fontSize:12.5, fontWeight:600 }}>{gamingReg==="breaches"?"Breach log":COMPLIANCE_REGISTERS[gamingReg].label}</div>
                            <button onClick={()=>setGamingReg("")} style={{ height:26, padding:"0 9px", fontSize:10.5, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" }}>← All registers</button>
                          </div>
                          <table style={{ width:"100%", borderCollapse:"collapse" }}>
                            <thead><tr>{(COMPLIANCE_REGISTERS[gamingReg].cols||[]).map(c=>(
                              <th key={c} style={{ padding:"7px 10px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5" }}>{c}</th>
                            ))}</tr></thead>
                            <tbody>
                              <tr><td colSpan={(COMPLIANCE_REGISTERS[gamingReg].cols||[]).length}
                                style={{ padding:"22px 10px", textAlign:"center", fontSize:11, color:"#999" }}>
                                No entries logged against {entity?.name} yet. Entries added here appear in the group register in Compliance.
                              </td></tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>}
                  {tab!=="fatca"&&tab!=="crs"&&tab!=="substance"&&tab!=="structure"&&tab!=="egaming_reg"&&renderTab()}
                </div>
              </div>
            </>
          ):(
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"var(--text-secondary,#666)", fontSize:13 }}>
              Select an entity from the list to view its full record.
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal&&modal!=="newEntity"&&modalForms[modal]&&(
        <FormModal
          title={modalForms[modal].title}
          fields={modalForms[modal].fields}
          onClose={()=>setModal(null)}
        />
      )}
      {modal==="newEntity"&&(
        <FormModal
          title="Add new entity"
          fields={[
            {label:"Entity name",placeholder:"Full legal name",full:true},
            {label:"Client / group",placeholder:"Group or client name"},
            {label:"Entity type",type:"select",opts:["Company","Trust","Foundation","LLC","Partnership"]},
            {label:"Jurisdiction",type:"select",opts:Object.keys(officeColors)},
            {label:"Registration number",placeholder:"Reg. number"},
            {label:"Date incorporated",placeholder:"DD/MM/YYYY"},
            {label:"Administrator",placeholder:"Name"},
            {label:"Lead director",placeholder:"Name"},
            {label:"Principal activity",type:"select",opts:["Holding company","Investment holding","Trading company","Property holding","Family trust","Wealth & estate planning","Fund / investment fund","eGaming operator","eGaming B2B supply","Yacht / aircraft ownership","Philanthropy / foundation","Intellectual property holding","Financing / treasury","Consultancy / services","Dormant","Other"]},
            {label:"Currency",type:"select",opts:["GBP","USD","EUR"]},
            {label:"Year end",placeholder:"DD/MM"},
            {label:"Initial status",type:"select",opts:["Active","Pending incorporation","Dormant"]},
          ]}
          onClose={()=>setModal(null)}
        />
      )}

      {reportsOpen && (
        <div onClick={()=>setReportsOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,18,66,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:"var(--bg-primary,#fff)", borderRadius:10, width:"min(1040px,96vw)", maxHeight:"90vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 10px 40px rgba(0,0,0,0.3)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"0.5px solid #e5e5e5" }}>
              <div style={{ fontSize:15, fontWeight:600, color:"#001242" }}>Entity Admin — Reports</div>
              <button style={s.btn(false)} onClick={()=>setReportsOpen(false)}>Close ✕</button>
            </div>
            <div style={{ display:"flex", gap:6, padding:"10px 18px", borderBottom:"0.5px solid #e5e5e5", flexWrap:"wrap" }}>
              {Object.entries(REPORTS).map(([k,r])=>(
                <button key={k} onClick={()=>setRepTab(k)} style={{ padding:"5px 14px", fontSize:12, borderRadius:20, border:`0.5px solid ${repTab===k?CY:"#e5e5e5"}`, background:repTab===k?CY:"transparent", color:repTab===k?"#fff":"#666", cursor:"pointer", fontWeight:repTab===k?600:400 }}>{r.label}</button>
              ))}
            </div>
            <div style={{ padding:"14px 18px", overflow:"auto" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontSize:12, color:"var(--text-secondary,#666)" }}>{repLoading?"Loading…":`${repRows.length} record${repRows.length===1?"":"s"}`}</div>
                <button style={s.btn(true)} onClick={exportRepCsv} disabled={!repRows.length}>⭳ Export CSV</button>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>{REPORTS[repTab].cols.map(c=><th key={c[0]} style={{ padding:"8px 10px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", position:"sticky", top:0, background:"var(--bg-primary,#fff)" }}>{c[1]}</th>)}</tr></thead>
                <tbody>
                  {repRows.map((r,i)=>(
                    <tr key={i} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                      {REPORTS[repTab].cols.map(c=><td key={c[0]} style={{ ...s.td, fontSize:11 }}>{r[c[0]]==null||r[c[0]]===""?"—":String(r[c[0]])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!repLoading&&!repRows.length&&<div style={{ textAlign:"center", padding:"24px 0", color:"var(--text-secondary,#666)", fontSize:12 }}>No records for this report yet. Run the round-2 SQL (and, once the write layer is live, staff-entered records will populate these).</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
