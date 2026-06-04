import { useState, useMemo } from "react";
import EntityChart from "./affinity_core_entity_chart";
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
    2:[{id:1,date:"12/07/2025",author:"Gary Harrison",subject:"KYC chase — Emma Harrington",note:"Third request for updated passport sent. No response. Escalating to MLRO."}],
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
  { id:"relations",  label:"Relations",               group:"Entity" },
  { id:"meetings",   label:"Meetings",                group:"Entity" },
  { id:"structure",  label:"Structure / chart",       group:"Entity" },
  { id:"fileNotes",  label:"File notes",              group:"Entity" },
  { id:"archive",    label:"Archive",                 group:"Entity" },
  { id:"safe",       label:"Safe custody",            group:"Entity" },
  { id:"registers",  label:"Generate registers",      group:"Entity" },
  { id:"compliance", label:"Compliance register",     group:"Regulatory" },
  { id:"egaming",    label:"eGaming / OGRA",          group:"Regulatory", gamingOnly:true },
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

export default function AffinityCoreEntityAdmin({ officeFilter="" }) {
  const [sel, setSel]       = useState(1);
  const [tab, setTab]       = useState("overview");
  const [search, setSearch] = useState("");
  const [jurF, setJurF]     = useState("");
  const [typeF, setTypeF]   = useState("");
  const [statF, setStatF]   = useState("");
  const [modal, setModal]   = useState(null);

  // Map office name to jurisdiction for cross-filter
  const officeToJur = {
    "Isle of Man":"Isle of Man","Malta":"Malta",
    "Cayman Islands":"Cayman Islands","United Kingdom":"United Kingdom",
    "Miami":"United States","Cyprus":"Cyprus"
  };
  const activeJurF = officeFilter && officeFilter !== "All" ? officeToJur[officeFilter] : jurF;

  const filtered = useMemo(()=>ENTITIES.filter(e=>
    (!search||e.name.toLowerCase().includes(search.toLowerCase())||e.ref.toLowerCase().includes(search.toLowerCase()))&&
    (!activeJurF||e.jur===activeJurF)&&(!typeF||e.type===typeF)&&(!statF||e.status===statF)
  ),[search,activeJurF,typeF,statF,jurF,officeFilter]);

  const entity   = ENTITIES.find(e=>e.id===sel);
  const dirs     = ENTITY_DATA.directors[sel]||[];
  const shares   = ENTITY_DATA.shareholders[sel]||[];
  const addrs    = ENTITY_DATA.addresses[sel]||[];
  const banks    = ENTITY_DATA.bankAccounts[sel]||[];
  const charges  = ENTITY_DATA.charges[sel]||[];
  const assets   = ENTITY_DATA.assets[sel]||[];
  const divs     = ENTITY_DATA.dividends[sel]||[];
  const nameChgs = ENTITY_DATA.nameChanges[sel]||[];
  const forgRegs = ENTITY_DATA.foreignRegs[sel]||[];
  const fileNotes= ENTITY_DATA.fileNotes[sel]||[];
  const meetings = ENTITY_DATA.meetings[sel]||[];
  const safeItems= ENTITY_DATA.safeItems[sel]||[];
  const relations= ENTITY_DATA.relations[sel]||[];

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
              {[["Client / group",entity.group],["Principal activity",entity.principalActivity],["Entity type",entity.type],["Jurisdiction",entity.jur],["Registration number",entity.regNo],["Incorporated",entity.incorporated],["Year end",entity.yearEnd],["Currency",entity.currency],["Status",entity.status],["Risk rating",entity.risk]].map(([k,v])=>(
                <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={s.dVal}>{v}</span></div>
              ))}
              <div style={{ marginTop:14, paddingTop:10, borderTop:"0.5px dashed #e5e5e5" }}>
                <div style={{ ...s.cardT, marginBottom:6 }}>Addresses</div>
                {[["Registered office",`Affinity Group, ${entity.jur}`],["Business address","Same as registered"],["Communication address","Same as registered"]].map(([k,v])=>(
                  <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={s.dVal}>{v}</span></div>
                ))}
              </div>
              <div style={{ marginTop:14, paddingTop:10, borderTop:"0.5px dashed #e5e5e5" }}>
                <div style={{ ...s.cardT, marginBottom:6 }}>Foreign registrations</div>
                {(entity.foreignRegs && entity.foreignRegs.length>0)?entity.foreignRegs.map((fr,i)=>(
                  <div key={i} style={s.dRow}><span style={s.dKey}>{fr.jurisdiction||fr.jur||"—"}</span><span style={s.dVal}>{fr.regNo||fr.number||"—"}</span></div>
                )):<div style={{ fontSize:11, color:"var(--text-secondary,#888)", padding:"4px 0" }}>None recorded.</div>}
              </div>
            </div>
            <div style={s.card}>
              <div style={s.cardT}>Administration</div>
              {[["Administrator",entity.admin],["Manager",entity.manager],["Lead director",entity.director],["Accountant","Neil Kelly"],["MLRO","Gary Harrison"],["Office",entity.jur]].map(([k,v])=>(
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
              <button style={{ ...s.btn(false), marginTop:8, fontSize:10 }}>View M&A in DMS ↗</button>
            </div>
          </div>
          <div style={s.card}>
            <div style={s.cardT}>Share capital</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>
              <div>{[["Authorised share capital","£100,000"],["Issued share capital","£10,000"],["Currency",entity.currency||"GBP"]].map(([k,v])=>(
                <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={s.dVal}>{v}</span></div>
              ))}</div>
              <div>{[["Share classes","Ordinary"],["Par value","£1.00"]].map(([k,v])=>(
                <div key={k} style={s.dRow}><span style={s.dKey}>{k}</span><span style={s.dVal}>{v}</span></div>
              ))}</div>
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
          <Tbl cols={[{l:"Name",w:"22%"},{l:"Role",w:"16%"},{l:"Appointed",w:"12%"},{l:"Resigned",w:"12%"},{l:"Nationality",w:"12%"},{l:"Date of birth",w:"12%"},{l:"Address",w:"14%"}]}
            rows={dirs.map(d=>(
              <tr key={d.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:d.resigned?"var(--bg-secondary,#f9f9f9)":"transparent" }}>
                <td style={{ ...s.td, fontWeight:500, color:d.resigned?"var(--text-secondary,#666)":undefined }}>{d.name}</td>
                <td style={s.td}><Badge label={d.role} colors={{ Director:{bg:"#E6F7FB",color:"#0077A8"},"Director / UBO":{bg:"#FCEBEB",color:"#A32D2D"}, Trustee:{bg:"#EEF0FB",color:"#3C3489"}, Settlor:{bg:"#EAF3DE",color:"#27500A"}, Beneficiary:{bg:"#FAEEDA",color:"#633806"} }[d.role.split(" / ")[0]]||{bg:"#eee",color:"#666"}} /></td>
                <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{d.appointed}</td>
                <td style={s.td}>{d.resigned?<Badge label="Resigned" colors={{ bg:"#F1EFE8", color:"#888" }} />:<span style={{ color:"var(--text-secondary,#666)" }}>—</span>}</td>
                <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{d.nationality}</td>
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
            <Tbl cols={[{l:"Bank / broker",w:"18%"},{l:"Account name",w:"14%"},{l:"Account no.",w:"12%"},{l:"Currency",w:"7%"},{l:"Signatories",w:"22%"},{l:"Resolution date",w:"12%"},{l:"Status",w:"10%"}]}
              rows={banks.map(b=>(
                <tr key={b.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                  <td style={{ ...s.td, fontWeight:500 }}>{b.bank}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{b.account}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{b.number}</td>
                  <td style={s.td}>{b.currency}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)", fontSize:11 }}>{b.signatories||"—"}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{b.resolution}</td>
                  <td style={s.td}><Badge label={b.closed?"Closed":"Active"} colors={b.closed?{bg:"#F1EFE8",color:"#888"}:{bg:"#EAF3DE",color:"#27500A"}} /></td>
                </tr>
              ))}
            />
          ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No bank accounts recorded.</div>}
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
            <Tbl cols={[{l:"Description",w:"28%"},{l:"Date acquired",w:"14%"},{l:"Last valuation",w:"14%"},{l:"Purchase value",w:"14%"},{l:"Currency",w:"10%"},{l:"Notes",w:"20%"}]}
              rows={assets.map(a=>(
                <tr key={a.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                  <td style={{ ...s.td, fontWeight:500 }}>{a.desc}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{a.acquired}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{a.lastValuation}</td>
                  <td style={{ ...s.td, fontWeight:600 }}>{a.value}</td>
                  <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{a.currency}</td>
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
            <div style={{ fontSize:12, fontWeight:500 }}>Relations — reusable across entities (no duplicate entry)</div>
            <button style={s.btn(true)} onClick={()=>setModal("relation")}>＋ Add relation</button>
          </div>
          <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"8px 12px", fontSize:11, color:"var(--text-secondary,#666)", marginBottom:12 }}>
            ℹ️ Relations are individuals or entities connected to this file. When a relation is also connected to another entity, the record is shared — no duplicate data entry required.
          </div>
          {relations.length>0?(relations.map(r=>(
            <div key={r.id} style={{ ...s.card, marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{r.name}</div>
                  <div style={{ fontSize:11, color:"var(--text-secondary,#666)", marginTop:3 }}>{r.role} · DOB: {r.dob} · {r.nationality}</div>
                  {r.shared&&<div style={{ fontSize:10, color:CY, marginTop:4 }}>⟳ Shared record — also linked to: {r.linkedEntities.join(", ")}</div>}
                </div>
                <Badge label={r.shared?"Shared record":"This entity only"} colors={r.shared?{bg:"#E6F7FB",color:"#0077A8"}:{bg:"#F1EFE8",color:"#666"}} />
              </div>
            </div>
          ))):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No relations recorded.</div>}
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
          {fileNotes.length>0?(fileNotes.map(n=>(
            <div key={n.id} style={{ ...s.card, marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div><div style={{ fontSize:12, fontWeight:600 }}>{n.subject}</div>
                  <div style={{ fontSize:10, color:"var(--text-secondary,#666)", marginTop:2 }}>{n.date} · {n.author}</div></div>
              </div>
              <div style={{ fontSize:12, color:"var(--text-secondary,#666)", lineHeight:1.5 }}>{n.note}</div>
            </div>
          ))):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No file notes recorded.</div>}
        </div>
      );

      case "archive": {
        // Archive shows historical / closed records (same table format as safe custody)
        const archived = safeItems.filter(si=>si.retrieved); // retrieved items are the archive
        return (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>Archive — historical records</div>
              <button style={s.btn(true)} onClick={()=>setModal("safeItem")}>＋ Add archive entry</button>
            </div>
            {archived.length>0?(
              <Tbl cols={[{l:"Item description",w:"34%"},{l:"Date archived",w:"18%"},{l:"Date retrieved",w:"18%"},{l:"Authorised by",w:"18%"},{l:"Status",w:"12%"}]}
                rows={archived.map(si=>(
                  <tr key={si.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                    <td style={{ ...s.td, fontWeight:500 }}>{si.item}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.deposited}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.retrieved||"—"}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.auth}</td>
                    <td style={s.td}><Badge label="Archived" colors={{bg:"#F1EFE8",color:"#888"}} /></td>
                  </tr>
                ))}
              />
            ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No archived records.</div>}
          </div>
        );
      }

      case "safe": {
        // Safe custody = items currently held (not yet retrieved)
        const inSafe = safeItems.filter(si=>!si.retrieved);
        return (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>Safe custody register</div>
              <button style={s.btn(true)} onClick={()=>setModal("safeItem")}>＋ Add item</button>
            </div>
            {inSafe.length>0?(
              <Tbl cols={[{l:"Item description",w:"34%"},{l:"Date deposited",w:"18%"},{l:"Date retrieved",w:"18%"},{l:"Authorised by",w:"18%"},{l:"Status",w:"12%"}]}
                rows={inSafe.map(si=>(
                  <tr key={si.id} style={{ borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)" }}>
                    <td style={{ ...s.td, fontWeight:500 }}>{si.item}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.deposited}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.retrieved||"—"}</td>
                    <td style={{ ...s.td, color:"var(--text-secondary,#666)" }}>{si.auth}</td>
                    <td style={s.td}><Badge label="In safe" colors={{bg:"#EAF3DE",color:"#27500A"}} /></td>
                  </tr>
                ))}
              />
            ):<div style={{ color:"var(--text-secondary,#666)", fontSize:12, padding:"20px 0", textAlign:"center" }}>No safe custody items recorded.</div>}
          </div>
        );
      }

      case "compliance": return (
        <div>
          <div style={{ fontSize:12, fontWeight:500, marginBottom:12 }}>Compliance register — {entity.name}</div>
          <div style={s.g2}>
            <div style={s.card}>
              <div style={s.cardT}>Compliance status</div>
              {[["Risk rating",entity.risk],["Last periodic review","14/03/2024"],["Next review due",entity.risk==="High"?"18/08/2025":entity.risk==="Very High"?"12/07/2025":"14/09/2025"],["MLRO","Gary Harrison"],["Compliance officer","Gary Harrison"],["KYC status",entity.risk==="High"?"Issues outstanding":"Current"],["Worldcheck","Last screened 14/07/2025"],["PEP status","No PEP identified"],["SOF status","Documented"]].map(([k,v])=>(
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
        const entity = ENTITIES.find(e=>e.id===sel);
        return (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>eGaming & OGRA licence</div>
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
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>OGRA obligations</div>
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
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>OGRA application checklist</div>
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
                  { step:"OGRA suitability decision",                  status:"Pending" },
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
      {label:"Role / connection",type:"select",opts:["Beneficial owner","Director","Shareholder","Trustee","Settlor","Beneficiary","Attorney","Protector","Introducer","Service provider","Other"]},
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
        <div style={{ display:"flex", gap:5 }}>
          {["Compliance","Documents","Timesheets","Invoicing","Reporting"].map(n=>(
            <button key={n} style={{ ...nb, fontSize:11 }}>{n}</button>
          ))}
          <button style={nba}>Entity Admin</button>
        </div>
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
                  const m=ENTITIES.find(en=>en.name===v||en.ref===v);
                  if(m){ setSel(m.id); setTab("overview"); }
                }}
              />
              <datalist id="ea-entity-list">{ENTITIES.flatMap(e=>[<option key={"n"+e.id} value={e.name}>{e.ref}</option>,<option key={"r"+e.id} value={e.ref}>{e.name}</option>])}</datalist>
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
                      <Badge label={jurShort[entity.jur]||entity.jur} colors={officeColors[entity.jur]} />
                      <Badge label={entity.type} colors={{ bg:"var(--bg-secondary,#f9f9f9)", color:"var(--text-secondary,#666)" }} />
                      <Badge label={entity.status} colors={statusBadge(entity.status)} />
                      <Badge label={entity.risk+" risk"} colors={riskColors[entity.risk]} />
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button style={s.btn(false)}>Edit entity ↗</button>
                    <button style={s.btn(false)}>DMS ↗</button>
                    <button style={s.btn(true)}>Generate register ↗</button>
                  </div>
                </div>
              </div>
              <div style={{display:"flex",flex:1,overflow:"hidden"}}>
                <div style={{width:172,minWidth:172,borderRight:"0.5px solid var(--border-tertiary,#e5e5e5)",overflowY:"auto",background:"var(--bg-secondary,#f9f9f9)",flexShrink:0}}>
                  {["Entity","Regulatory","Filing Obligations","Admin"].map(group=>{
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
                  {tab!=="fatca"&&tab!=="crs"&&tab!=="substance"&&tab!=="structure"&&renderTab()}
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
            {label:"Principal activity",placeholder:"e.g. Holding company"},
            {label:"Currency",type:"select",opts:["GBP","USD","EUR"]},
            {label:"Year end",placeholder:"DD/MM"},
            {label:"Initial status",type:"select",opts:["Active","Pending incorporation","Dormant"]},
          ]}
          onClose={()=>setModal(null)}
        />
      )}
    </div>
  );
}
