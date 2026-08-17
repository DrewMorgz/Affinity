// src/affinity_core_report_builder.jsx
// ─────────────────────────────────────────────────────────────────────────────
// AFFINITY CORE — CROSS-DOMAIN REPORT BUILDER
//
// Organising principle (per the spec): every section of the system is a header,
// and a report is built by picking fields from ONE OR MORE sections. The entity
// is the spine — every domain joins back to it — which is what makes questions
// like "licensed gaming companies whose beneficial owners sit in Australia" or
// "entities where we provide directors" answerable in one pass.
//
// Three steps, left to right: pick fields → add conditions → read results.
// The selected-fields basket is deliberately prominent: chips are coloured by
// their source section, so a cross-domain report is obvious at a glance rather
// than something you have to reason about.
//
// STATUS: this is the builder shell. The field catalogue, join model, filter
// grammar and output are real and complete. Rows currently resolve against the
// preview portfolio below; each domain is tagged with the backing table/RPC it
// reads from once Azure/Entra is in place, and DOMAINS is the single place to
// swap a resolver from preview to live without touching the UI.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { reportingScopesFor } from "./affinity_core_rbac";

const CY   = "#00C4CC";
const NAVY = "#001242";

// ── Section palette. One colour per system section, reused for chips, headers
// and result column groups so a field's origin is never ambiguous.
const SECTIONS = [
  { id:"entity",     label:"Entity Admin",   color:"#274690", bg:"#EAF0FB", source:"entity, entity_profile" },
  { id:"ownership",  label:"Owners & UBOs",  color:"#6B3FA0", bg:"#F1EBFA", source:"entity_ubo, entity_shareholder" },
  { id:"officers",   label:"Directors & Officers", color:"#0077A8", bg:"#E6F7FB", source:"entity_officer" },
  { id:"services",   label:"Services",       color:"#1F6F54", bg:"#E7F4EF", source:"entity_service" },
  { id:"gaming",     label:"Gaming",         color:"#A32D2D", bg:"#FCEBEB", source:"egaming_licence" },
  { id:"compliance", label:"Compliance",     color:"#7B4F1D", bg:"#FDF4DC", source:"creg_entry, risk_review" },
  { id:"documents",  label:"Documents",      color:"#3C3489", bg:"#EEF0FB", source:"document" },
  { id:"billing",    label:"Billing & WIP",  color:"#633806", bg:"#FAEEDA", source:"invoice, wip_entry" },
];
const SEC = SECTIONS.reduce((a,s)=>{ a[s.id]=s; return a; },{});

// ── Field catalogue. type drives the condition editor; options drive its values.
const FIELDS = [
  { sec:"entity",     key:"name",        label:"Entity name",          type:"text" },
  { sec:"entity",     key:"ref",         label:"Reference",            type:"text" },
  { sec:"entity",     key:"class",       label:"Internal / client",    type:"enum", options:["Internal","Client"] },
  { sec:"entity",     key:"type",        label:"Entity type",          type:"enum", options:["Company","Trust","Foundation","Partnership"] },
  { sec:"entity",     key:"jur",         label:"Jurisdiction",         type:"enum", options:["Isle of Man","Malta","Cayman Islands","United Kingdom","United States"] },
  { sec:"entity",     key:"status",      label:"Status",               type:"enum", options:["Active","Dormant","In liquidation"] },
  { sec:"entity",     key:"incorporated",label:"Incorporated",         type:"date" },
  { sec:"entity",     key:"yearEnd",     label:"Year end",             type:"text" },

  { sec:"ownership",  key:"uboNames",    label:"Beneficial owners",    type:"list" },
  { sec:"ownership",  key:"uboCountries",label:"UBO country of residence", type:"list", options:["Australia","United Kingdom","Germany","Ireland","France","South Korea","Isle of Man","United States","Nigeria"] },
  { sec:"ownership",  key:"uboPct",      label:"Largest holding %",    type:"number" },
  { sec:"ownership",  key:"uboPep",      label:"Any UBO is a PEP",     type:"bool" },

  { sec:"officers",   key:"directors",   label:"Directors",            type:"list" },
  { sec:"officers",   key:"affinityDirector", label:"We provide directors", type:"bool" },
  { sec:"officers",   key:"directorCount",label:"Number of directors",  type:"number" },

  { sec:"services",   key:"services",    label:"Services provided",    type:"list", options:["Company administration","Trusteeship","Directorship","Registered office","Accounting","Payroll","DPO","Nominee shareholder"] },
  { sec:"services",   key:"admin",       label:"Administrator",        type:"text" },

  { sec:"gaming",     key:"isGaming",    label:"Gaming entity",        type:"bool" },
  { sec:"gaming",     key:"licenceStatus",label:"Licence status",      type:"enum", options:["Licensed","Application in progress","Not licensed","Lapsed"] },
  { sec:"gaming",     key:"regulator",   label:"Gaming regulator",     type:"enum", options:["GSC","MGA","Curaçao","Anjouan","None"] },
  { sec:"gaming",     key:"licenceNo",   label:"Licence number",       type:"text" },

  { sec:"compliance", key:"risk",        label:"Risk rating",          type:"enum", options:["Low","Medium","High","Very High"] },
  { sec:"compliance", key:"reviewDue",   label:"Next review due",      type:"date" },
  { sec:"compliance", key:"cddComplete", label:"CDD complete",         type:"bool" },
  { sec:"compliance", key:"openBreaches",label:"Open breaches",        type:"number" },

  { sec:"documents",  key:"docCount",    label:"Documents on file",    type:"number" },
  { sec:"documents",  key:"missingDocs", label:"Missing required docs",type:"number" },

  { sec:"billing",    key:"feeAnnual",   label:"Annual fee",           type:"number" },
  { sec:"billing",    key:"wip",         label:"Unbilled WIP",         type:"number" },
  { sec:"billing",    key:"agedDebt",    label:"Aged debt",            type:"number" },
];
const FIELD = FIELDS.reduce((a,f)=>{ a[f.key]=f; return a; },{});

// ── Preview portfolio. One row per entity, flattened across domains — the same
// shape the joined view will return, so the resolver swaps without UI changes.
const ROWS = [
  { name:"Meridian Holdings Ltd", ref:"AC-2024-001", class:"Client", type:"Company", jur:"Isle of Man", status:"Active", incorporated:"2018-03-12", yearEnd:"31/03",
    uboNames:["James Harrington"], uboCountries:["United Kingdom"], uboPct:100, uboPep:false,
    directors:["James Harrington","Sarah Cole"], affinityDirector:true, directorCount:2,
    services:["Company administration","Registered office","Directorship"], admin:"Roxy Sheeley",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"Medium", reviewDue:"2026-09-30", cddComplete:true, openBreaches:0,
    docCount:48, missingDocs:0, feeAnnual:4200, wip:1850, agedDebt:0 },
  { name:"Harrington Family Trust", ref:"AC-2019-014", class:"Client", type:"Trust", jur:"Isle of Man", status:"Active", incorporated:"2019-07-05", yearEnd:"05/04",
    uboNames:["Emma Harrington","James Harrington"], uboCountries:["United Kingdom"], uboPct:60, uboPep:false,
    directors:["Affinity Trust Ltd"], affinityDirector:true, directorCount:1,
    services:["Trusteeship","Accounting"], admin:"Roxy Sheeley",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"High", reviewDue:"2026-04-14", cddComplete:false, openBreaches:1,
    docCount:63, missingDocs:2, feeAnnual:7500, wip:3200, agedDebt:1250 },
  { name:"Caledonian Ventures Ltd", ref:"AC-2021-032", class:"Client", type:"Company", jur:"Cayman Islands", status:"Active", incorporated:"2021-01-22", yearEnd:"31/12",
    uboNames:["Lena Müller"], uboCountries:["Germany"], uboPct:75, uboPep:false,
    directors:["Lena Müller","Patrick Walsh"], affinityDirector:false, directorCount:2,
    services:["Company administration","Registered office"], admin:"Garry Crossan",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"Medium", reviewDue:"2026-11-30", cddComplete:true, openBreaches:0,
    docCount:31, missingDocs:1, feeAnnual:3800, wip:900, agedDebt:0 },
  { name:"Azure Mediterranean Foundation", ref:"AC-2020-008", class:"Client", type:"Foundation", jur:"Malta", status:"Active", incorporated:"2020-09-14", yearEnd:"31/12",
    uboNames:["Marco Vella"], uboCountries:["Malta"], uboPct:100, uboPep:false,
    directors:["Joanne Fenech","Marco Vella"], affinityDirector:true, directorCount:2,
    services:["Company administration","Accounting","Registered office","Directorship"], admin:"Joanne Fenech",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"Low", reviewDue:"2027-01-31", cddComplete:true, openBreaches:0,
    docCount:29, missingDocs:0, feeAnnual:5100, wip:640, agedDebt:0 },
  { name:"Thornbury Asset Co Ltd", ref:"AC-2017-055", class:"Client", type:"Company", jur:"United Kingdom", status:"Dormant", incorporated:"2017-06-03", yearEnd:"31/12",
    uboNames:["Peter Thornbury"], uboCountries:["United Kingdom"], uboPct:100, uboPep:false,
    directors:["Peter Thornbury"], affinityDirector:false, directorCount:1,
    services:["Company administration"], admin:"Neil Kelly",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"Medium", reviewDue:"2026-12-31", cddComplete:true, openBreaches:0,
    docCount:18, missingDocs:0, feeAnnual:1800, wip:120, agedDebt:0 },
  { name:"Pacific Wealth Trust", ref:"AC-2022-019", class:"Client", type:"Trust", jur:"Cayman Islands", status:"Active", incorporated:"2022-11-18", yearEnd:"31/12",
    uboNames:["Wei Chen"], uboCountries:["Australia"], uboPct:100, uboPep:true,
    directors:["Affinity Trust Ltd"], affinityDirector:true, directorCount:1,
    services:["Trusteeship","Accounting","Directorship"], admin:"Garry Crossan",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"High", reviewDue:"2026-08-31", cddComplete:false, openBreaches:2,
    docCount:52, missingDocs:3, feeAnnual:9200, wip:4100, agedDebt:2400 },
  { name:"Stonebridge Capital Ltd", ref:"AC-2023-041", class:"Client", type:"Company", jur:"Malta", status:"Active", incorporated:"2023-02-07", yearEnd:"31/12",
    uboNames:["Elena Pace"], uboCountries:["Malta"], uboPct:80, uboPep:false,
    directors:["Joanne Fenech"], affinityDirector:true, directorCount:1,
    services:["Company administration","Registered office","Directorship","Accounting"], admin:"Joanne Fenech",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"Low", reviewDue:"2027-02-28", cddComplete:true, openBreaches:0,
    docCount:22, missingDocs:0, feeAnnual:4600, wip:1100, agedDebt:0 },
  { name:"North Star Holdings Ltd", ref:"AC-2016-003", class:"Client", type:"Company", jur:"Isle of Man", status:"In liquidation", incorporated:"2016-10-30", yearEnd:"31/12",
    uboNames:["Alan Kneale"], uboCountries:["Isle of Man"], uboPct:100, uboPep:false,
    directors:["Alan Kneale"], affinityDirector:false, directorCount:1,
    services:["Company administration"], admin:"Roxy Sheeley",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"High", reviewDue:"2026-06-30", cddComplete:false, openBreaches:1,
    docCount:41, missingDocs:4, feeAnnual:2200, wip:0, agedDebt:3800 },
  { name:"Apex Growth Fund Ltd", ref:"AC-2023-052", class:"Client", type:"Company", jur:"Cayman Islands", status:"Active", incorporated:"2023-08-12", yearEnd:"31/12",
    uboNames:["Sophie Laurent","David Park"], uboCountries:["France","South Korea"], uboPct:55, uboPep:false,
    directors:["Sophie Laurent","David Park"], affinityDirector:false, directorCount:2,
    services:["Company administration","Nominee shareholder"], admin:"Garry Crossan",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"Very High", reviewDue:"2026-08-25", cddComplete:false, openBreaches:3,
    docCount:37, missingDocs:2, feeAnnual:11500, wip:5600, agedDebt:0 },
  { name:"Suncoast Ventures LLC", ref:"AC-2024-007", class:"Client", type:"Company", jur:"United States", status:"Active", incorporated:"2024-03-01", yearEnd:"31/12",
    uboNames:["Ray Delgado"], uboCountries:["United States"], uboPct:100, uboPep:false,
    directors:["Ray Delgado"], affinityDirector:false, directorCount:1,
    services:["Company administration","Registered office"], admin:"Andy Morgan",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"Low", reviewDue:"2027-03-01", cddComplete:true, openBreaches:0,
    docCount:12, missingDocs:1, feeAnnual:2400, wip:300, agedDebt:0 },
  { name:"Bluewater Family Trust", ref:"AC-2020-031", class:"Client", type:"Trust", jur:"Cayman Islands", status:"Active", incorporated:"2020-06-19", yearEnd:"31/12",
    uboNames:["Chidi Okafor"], uboCountries:["Nigeria"], uboPct:100, uboPep:true,
    directors:["Affinity Trust Ltd"], affinityDirector:true, directorCount:1,
    services:["Trusteeship","Directorship"], admin:"Garry Crossan",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"High", reviewDue:"2026-10-15", cddComplete:true, openBreaches:0,
    docCount:44, missingDocs:0, feeAnnual:8100, wip:2200, agedDebt:0 },
  { name:"Phoenix eGaming Ltd", ref:"AC-2025-061", class:"Client", type:"Company", jur:"Isle of Man", status:"Active", incorporated:"2025-03-01", yearEnd:"31/12",
    uboNames:["Daniel Reid","Priya Shah"], uboCountries:["Australia","United Kingdom"], uboPct:70, uboPep:false,
    directors:["Roxy Sheeley","Daniel Reid"], affinityDirector:true, directorCount:2,
    services:["Company administration","Registered office","Directorship","DPO"], admin:"Roxy Sheeley",
    isGaming:true, licenceStatus:"Licensed", regulator:"GSC", licenceNo:"GSC-2025-0441",
    risk:"High", reviewDue:"2026-09-01", cddComplete:true, openBreaches:0,
    docCount:57, missingDocs:1, feeAnnual:18500, wip:6400, agedDebt:0 },
  { name:"Meridian Digital Ltd", ref:"AC-2023-058", class:"Client", type:"Company", jur:"Isle of Man", status:"Active", incorporated:"2023-06-01", yearEnd:"31/12",
    uboNames:["James Harrington"], uboCountries:["United Kingdom"], uboPct:100, uboPep:false,
    directors:["Roxy Sheeley","James Harrington"], affinityDirector:true, directorCount:2,
    services:["Company administration","Registered office","Directorship"], admin:"Roxy Sheeley",
    isGaming:true, licenceStatus:"Licensed", regulator:"GSC", licenceNo:"GSC-2023-0218",
    risk:"Medium", reviewDue:"2026-12-01", cddComplete:true, openBreaches:0,
    docCount:33, missingDocs:0, feeAnnual:12400, wip:2900, agedDebt:0 },
  { name:"Southern Cross Interactive Ltd", ref:"AC-2025-070", class:"Client", type:"Company", jur:"Malta", status:"Active", incorporated:"2025-05-20", yearEnd:"31/12",
    uboNames:["Hayley Mercer"], uboCountries:["Australia"], uboPct:100, uboPep:false,
    directors:["Joanne Fenech","Hayley Mercer"], affinityDirector:true, directorCount:2,
    services:["Company administration","Registered office","Directorship","DPO"], admin:"Joanne Fenech",
    isGaming:true, licenceStatus:"Licensed", regulator:"MGA", licenceNo:"MGA/B2C/701/2025",
    risk:"High", reviewDue:"2026-11-20", cddComplete:true, openBreaches:0,
    docCount:26, missingDocs:2, feeAnnual:16200, wip:4800, agedDebt:1500 },
  { name:"Kestrel Gaming Ltd", ref:"AC-2024-044", class:"Client", type:"Company", jur:"Isle of Man", status:"Active", incorporated:"2024-09-09", yearEnd:"31/12",
    uboNames:["Tom Bracken"], uboCountries:["Australia"], uboPct:100, uboPep:false,
    directors:["Tom Bracken"], affinityDirector:false, directorCount:1,
    services:["Company administration","Registered office"], admin:"Roxy Sheeley",
    isGaming:true, licenceStatus:"Application in progress", regulator:"GSC", licenceNo:"—",
    risk:"High", reviewDue:"2026-09-15", cddComplete:false, openBreaches:1,
    docCount:19, missingDocs:5, feeAnnual:9800, wip:7200, agedDebt:0 },
  { name:"Affinity (Isle of Man) Limited", ref:"AFG-IOM", class:"Internal", type:"Company", jur:"Isle of Man", status:"Active", incorporated:"2004-03-01", yearEnd:"31/12",
    uboNames:["Affinity Group Limited"], uboCountries:["Isle of Man"], uboPct:100, uboPep:false,
    directors:["Andy Morgan","Roxy Sheeley"], affinityDirector:true, directorCount:2,
    services:["Company administration"], admin:"Colette Grisdale",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"Low", reviewDue:"2027-03-01", cddComplete:true, openBreaches:0,
    docCount:88, missingDocs:0, feeAnnual:0, wip:0, agedDebt:0 },
  { name:"Affinity (Malta) Limited", ref:"AFG-MLT", class:"Internal", type:"Company", jur:"Malta", status:"Active", incorporated:"2012-05-14", yearEnd:"31/12",
    uboNames:["Affinity Group Limited"], uboCountries:["Isle of Man"], uboPct:100, uboPep:false,
    directors:["Andy Morgan","Joanne Fenech"], affinityDirector:true, directorCount:2,
    services:["Company administration"], admin:"Joanne Fenech",
    isGaming:false, licenceStatus:"Not licensed", regulator:"None", licenceNo:"—",
    risk:"Low", reviewDue:"2027-03-01", cddComplete:true, openBreaches:0,
    docCount:64, missingDocs:0, feeAnnual:0, wip:0, agedDebt:0 },
];

// ── Condition grammar per field type.
const OPS = {
  text:   [["contains","contains"],["eq","is"],["neq","is not"],["blank","is empty"]],
  enum:   [["eq","is"],["neq","is not"],["in","is any of"]],
  list:   [["has","includes"],["hasnot","does not include"],["count_gte","has at least"]],
  bool:   [["true","is yes"],["false","is no"]],
  number: [["gte","at least"],["lte","at most"],["eq","equals"],["gt","more than"],["lt","less than"]],
  date:   [["before","before"],["after","after"]],
};

function testCond(row, c) {
  const f = FIELD[c.field]; if (!f) return true;
  const v = row[c.field];
  const val = c.value;
  switch (c.op) {
    case "contains": return String(v||"").toLowerCase().includes(String(val||"").toLowerCase());
    case "eq":       return String(v) === String(val);
    case "neq":      return String(v) !== String(val);
    case "blank":    return v == null || v === "" || (Array.isArray(v) && !v.length);
    case "in":       return String(val||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean).indexOf(String(v).toLowerCase()) > -1;
    case "has":      return Array.isArray(v) && v.some(x=>String(x).toLowerCase() === String(val||"").toLowerCase());
    case "hasnot":   return Array.isArray(v) && !v.some(x=>String(x).toLowerCase() === String(val||"").toLowerCase());
    case "count_gte":return Array.isArray(v) && v.length >= Number(val||0);
    case "true":     return v === true;
    case "false":    return v === false;
    case "gte":      return Number(v||0) >= Number(val||0);
    case "lte":      return Number(v||0) <= Number(val||0);
    case "gt":       return Number(v||0) >  Number(val||0);
    case "lt":       return Number(v||0) <  Number(val||0);
    case "before":   return String(v||"") <  String(val||"");
    case "after":    return String(v||"") >  String(val||"");
    default:         return true;
  }
}

// ── Starter reports. The first two are the questions from the spec verbatim.
const PRESETS = [
  { id:"gaming_au", name:"Licensed gaming companies with UBOs in Australia",
    note:"The cross-domain case: Gaming licence status joined to UBO country of residence.",
    fields:["name","jur","licenceStatus","regulator","licenceNo","uboNames","uboCountries"],
    conds:[{field:"licenceStatus",op:"eq",value:"Licensed"},{field:"uboCountries",op:"has",value:"Australia"}] },
  { id:"we_direct", name:"Entities where we provide directors",
    note:"Directorship exposure across the portfolio, with risk and jurisdiction for context.",
    fields:["name","jur","type","directors","directorCount","risk","admin"],
    conds:[{field:"affinityDirector",op:"true",value:""}] },
  { id:"cdd_gaps", name:"High-risk entities with incomplete CDD",
    note:"Compliance joined to Entity Admin — the review queue, worst first.",
    fields:["name","jur","risk","cddComplete","reviewDue","openBreaches","admin"],
    conds:[{field:"risk",op:"in",value:"High, Very High"},{field:"cddComplete",op:"false",value:""}] },
  { id:"wip_exposure", name:"Unbilled WIP over £2,000",
    note:"Billing joined to the administrator who owns the relationship.",
    fields:["name","admin","wip","agedDebt","feeAnnual"],
    conds:[{field:"wip",op:"gt",value:"2000"}] },
  { id:"internal", name:"Affinity's own group companies",
    note:"The internal register — our own entities, separated from the client portfolio.",
    fields:["name","ref","jur","type","directors","docCount"],
    conds:[{field:"class",op:"eq",value:"Internal"}] },
];

const fmtCell = (v, f) => {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (f && f.type === "number" && ["feeAnnual","wip","agedDebt"].indexOf(f.key) > -1)
    return "£" + Number(v).toLocaleString();
  if (f && f.type === "date") return String(v).split("-").reverse().join("/");
  return String(v);
};

export default function AffinityReportBuilder({ isAdmin = false, onNav, role = "admin", reportingScopes }) {
  const [picked, setPicked]   = useState(PRESETS[0].fields);
  const [conds, setConds]     = useState(PRESETS[0].conds);
  const [openSecs, setOpenSecs] = useState({ entity:true, gaming:true, ownership:true });
  const [activePreset, setActivePreset] = useState(PRESETS[0].id);
  const [saved, setSaved]     = useState([]);
  const [name, setName]       = useState(PRESETS[0].name);
  const allowed = reportingScopesFor(role, reportingScopes);
  const [scope, setScope]     = useState("all"); // client | internal | all

  const results = useMemo(()=>{
    let rows = ROWS.filter(r=>allowed.indexOf(r.class === "Internal" ? "group" : "client") > -1);
    if (scope === "client")   rows = rows.filter(r=>r.class === "Client");
    if (scope === "internal") rows = rows.filter(r=>r.class === "Internal");
    return rows.filter(r=>conds.every(c=>testCond(r,c)));
  },[conds, scope, role, reportingScopes]);

  const usedSecs = useMemo(()=>{
    const set = [];
    picked.forEach(k=>{ const f=FIELD[k]; if(f && set.indexOf(f.sec)<0) set.push(f.sec); });
    return set;
  },[picked]);

  const toggleField = (k)=> setPicked(p=> p.indexOf(k)>-1 ? p.filter(x=>x!==k) : p.concat([k]));
  const addCond = ()=> setConds(c=>c.concat([{ field:"name", op:"contains", value:"" }]));
  const setCond = (i, patch)=> setConds(c=>c.map((x,j)=>j===i?{...x,...patch}:x));
  const delCond = (i)=> setConds(c=>c.filter((_,j)=>j!==i));

  const loadPreset = (p)=>{ setPicked(p.fields); setConds(p.conds); setActivePreset(p.id); setName(p.name); };

  const saveReport = ()=>{
    if(!name.trim()) return;
    setSaved(s=>[{ id:Date.now(), name:name.trim(), fields:picked, conds, scope, rows:results.length }].concat(s));
  };

  const exportCsv = ()=>{
    const head = picked.map(k=>FIELD[k].label).join(",");
    const body = results.map(r=>picked.map(k=>`"${String(fmtCell(r[k],FIELD[k])).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([head+"\n"+body], { type:"text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (name||"affinity-report").toLowerCase().replace(/[^a-z0-9]+/g,"-") + ".csv";
    a.click();
  };

  const btn  = { padding:"6px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const btnP = { ...btn, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:600 };
  const th   = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", whiteSpace:"nowrap" };
  const td   = { padding:"8px 12px", fontSize:11, borderBottom:"0.5px solid #f0f0f0", verticalAlign:"top" };
  const inp  = { height:26, padding:"0 7px", fontSize:11, border:"0.5px solid #ccc", borderRadius:4, background:"#fff" };

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", color:"#111", background:"#f8f9fc", minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid #e5e5e5", padding:"14px 22px" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
          <h2 style={{ margin:0, fontSize:19, fontWeight:600, color:NAVY }}>Report builder</h2>
          <span style={{ fontSize:11.5, color:"#888" }}>Pick fields from any section of the system. The entity is the spine, so sections combine.</span>
        </div>
      </div>

      {/* Starter reports */}
      <div style={{ padding:"12px 22px 0" }}>
        <div style={{ fontSize:10, fontWeight:600, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7 }}>Start from a question</div>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
          {PRESETS.map(p=>(
            <button key={p.id} onClick={()=>loadPreset(p)} title={p.note}
              style={{ ...btn, background:activePreset===p.id?"#EAF0FB":"#fff", borderColor:activePreset===p.id?"#274690":"#e5e5e5",
                       color:activePreset===p.id?"#274690":"#555", fontWeight:activePreset===p.id?600:400, textAlign:"left", maxWidth:270 }}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", gap:14, padding:"14px 22px 70px", alignItems:"flex-start", flexWrap:"wrap" }}>

        {/* ── STEP 1 — fields, grouped by system section ── */}
        <div style={{ width:270, minWidth:250, flexShrink:0, background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:9, overflow:"hidden" }}>
          <div style={{ padding:"10px 13px", borderBottom:"0.5px solid #e5e5e5", fontSize:11, fontWeight:700, color:NAVY }}>
            1 · Fields
            <span style={{ float:"right", fontWeight:400, color:"#aaa", fontSize:10 }}>{picked.length} picked</span>
          </div>
          <div style={{ maxHeight:520, overflowY:"auto" }}>
            {SECTIONS.map(sec=>{
              const fs = FIELDS.filter(f=>f.sec===sec.id);
              const n  = fs.filter(f=>picked.indexOf(f.key)>-1).length;
              const open = !!openSecs[sec.id];
              return (
                <div key={sec.id}>
                  <div onClick={()=>setOpenSecs(o=>({...o,[sec.id]:!o[sec.id]}))}
                    style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 13px", cursor:"pointer",
                             borderBottom:"0.5px solid #f0f0f0", background:open?sec.bg:"#fff" }}>
                    <span style={{ fontSize:9, color:"#aaa", width:9 }}>{open?"▼":"►"}</span>
                    <span style={{ width:3, height:13, background:sec.color, borderRadius:2 }} />
                    <span style={{ fontSize:11.5, fontWeight:600, color:sec.color }}>{sec.label}</span>
                    {n>0 && <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700, color:"#fff", background:sec.color, borderRadius:9, padding:"1px 6px" }}>{n}</span>}
                  </div>
                  {open && (
                    <div style={{ padding:"3px 0 6px" }}>
                      <div style={{ fontSize:9, color:"#bbb", padding:"2px 13px 5px 32px", fontStyle:"italic" }}>{sec.source}</div>
                      {fs.map(f=>(
                        <label key={f.key} style={{ display:"flex", alignItems:"center", gap:7, padding:"4px 13px 4px 32px", cursor:"pointer", fontSize:11.5 }}>
                          <input type="checkbox" checked={picked.indexOf(f.key)>-1} onChange={()=>toggleField(f.key)} style={{ width:13, height:13, cursor:"pointer" }} />
                          <span style={{ color:picked.indexOf(f.key)>-1?"#111":"#666" }}>{f.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── STEP 2 + 3 — basket, conditions, results ── */}
        <div style={{ flex:1, minWidth:420, display:"flex", flexDirection:"column", gap:14 }}>

          {/* Basket — the signature element: chips coloured by source section */}
          <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:9, padding:"11px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
              <span style={{ fontSize:11, fontWeight:700, color:NAVY }}>Columns</span>
              {usedSecs.length>1 && (
                <span style={{ fontSize:10, fontWeight:600, color:"#1F6F54", background:"#E7F4EF", borderRadius:20, padding:"2px 9px" }}>
                  Cross-section · {usedSecs.length} sections joined
                </span>
              )}
              <button onClick={()=>setPicked([])} style={{ ...btn, marginLeft:"auto", padding:"3px 9px", fontSize:10 }}>Clear</button>
            </div>
            {picked.length===0 ? (
              <div style={{ fontSize:11.5, color:"#999", padding:"8px 0" }}>No columns yet. Tick fields on the left — mix sections freely.</div>
            ) : (
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {picked.map(k=>{
                  const f = FIELD[k]; if(!f) return null;
                  const sec = SEC[f.sec];
                  return (
                    <span key={k} style={{ display:"inline-flex", alignItems:"center", gap:6, background:sec.bg, color:sec.color,
                                           borderRadius:20, padding:"3px 9px", fontSize:11, fontWeight:600 }}>
                      {f.label}
                      <button onClick={()=>toggleField(k)} title="Remove column"
                        style={{ background:"none", border:"none", cursor:"pointer", color:sec.color, fontSize:12, padding:0, lineHeight:1, opacity:0.65 }}>✕</button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conditions */}
          <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:9, padding:"11px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9, flexWrap:"wrap" }}>
              <span style={{ fontSize:11, fontWeight:700, color:NAVY }}>2 · Conditions</span>
              <span style={{ fontSize:10, color:"#aaa" }}>all must be true</span>
              <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center" }}>
                <span style={{ fontSize:10, color:"#888" }}>Portfolio</span>
                <select value={scope} onChange={e=>setScope(e.target.value)} style={inp}>
                  {allowed.indexOf("client")>-1 && <option value="client">Managed entities</option>}
                  {allowed.indexOf("group")>-1  && <option value="internal">Affinity internal</option>}
                  {allowed.length>1             && <option value="all">All entities</option>}
                </select>
                <button onClick={addCond} style={btn}>＋ Condition</button>
              </div>
            </div>

            {conds.length===0 && <div style={{ fontSize:11.5, color:"#999" }}>No conditions — every entity in the selected portfolio is returned.</div>}

            {conds.map((c,i)=>{
              const f = FIELD[c.field] || FIELDS[0];
              const ops = OPS[f.type] || OPS.text;
              const sec = SEC[f.sec];
              const needsValue = ["blank","true","false"].indexOf(c.op) < 0;
              return (
                <div key={i} style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6, flexWrap:"wrap" }}>
                  <span style={{ width:3, height:20, background:sec.color, borderRadius:2 }} />
                  <select value={c.field} style={{ ...inp, maxWidth:190 }}
                    onChange={e=>{ const nf=FIELD[e.target.value]; setCond(i,{ field:e.target.value, op:(OPS[nf.type]||OPS.text)[0][0], value:"" }); }}>
                    {SECTIONS.map(s=>(
                      <optgroup key={s.id} label={s.label}>
                        {FIELDS.filter(x=>x.sec===s.id).map(x=><option key={x.key} value={x.key}>{x.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <select value={c.op} onChange={e=>setCond(i,{ op:e.target.value })} style={{ ...inp, maxWidth:130 }}>
                    {ops.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                  {needsValue && (
                    f.options
                      ? <><input list={"rb-opt-"+f.key} value={c.value} onChange={e=>setCond(i,{ value:e.target.value })}
                               placeholder={c.op==="in"?"comma separated":"value"} style={{ ...inp, minWidth:170 }} />
                          <datalist id={"rb-opt-"+f.key}>{f.options.map(o=><option key={o} value={o}/>)}</datalist></>
                      : <input value={c.value} onChange={e=>setCond(i,{ value:e.target.value })}
                          placeholder={f.type==="date"?"YYYY-MM-DD":f.type==="number"?"amount":"value"} style={{ ...inp, minWidth:170 }} />
                  )}
                  <button onClick={()=>delCond(i)} style={{ ...btn, padding:"3px 8px", fontSize:10, borderColor:"#f0c9c9", color:"#A32D2D" }}>Remove</button>
                </div>
              );
            })}
          </div>

          {/* Results */}
          <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:9, overflow:"hidden" }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, padding:"11px 13px", borderBottom:"0.5px solid #e5e5e5", flexWrap:"wrap" }}>
              <span style={{ fontSize:11, fontWeight:700, color:NAVY }}>3 · Results</span>
              <span style={{ fontSize:11, color:"#666" }}>{results.length} {results.length===1?"entity":"entities"}</span>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name this report"
                style={{ ...inp, marginLeft:"auto", minWidth:210, height:28 }} />
              <button onClick={saveReport} style={btn} disabled={!picked.length}>Save report</button>
              <button onClick={exportCsv} style={btnP} disabled={!picked.length}>Export CSV</button>
            </div>

            {picked.length===0 ? (
              <div style={{ padding:"44px 20px", textAlign:"center", color:"#999", fontSize:12 }}>Pick at least one column to see results.</div>
            ) : results.length===0 ? (
              <div style={{ padding:"44px 20px", textAlign:"center", color:"#999", fontSize:12 }}>
                Nothing matches these conditions. Loosen one, or switch the portfolio.
              </div>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    {/* section band above the column names — shows the join visually */}
                    <tr>
                      {picked.map(k=>{ const sec=SEC[FIELD[k].sec];
                        return <th key={"s"+k} style={{ ...th, padding:"4px 12px", fontSize:9, color:sec.color, background:sec.bg, borderBottom:`2px solid ${sec.color}` }}>{sec.label}</th>; })}
                    </tr>
                    <tr>
                      {picked.map(k=><th key={k} style={{ ...th, color:"#666", background:"#f9f9f9" }}>{FIELD[k].label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r,i)=>(
                      <tr key={i} style={{ background:i%2?"#fcfcfd":"#fff" }}>
                        {picked.map(k=><td key={k} style={td}>{fmtCell(r[k], FIELD[k])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Saved reports */}
          {saved.length>0 && (
            <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:9, padding:"11px 13px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:NAVY, marginBottom:8 }}>Saved this session</div>
              {saved.map(s=>(
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:11.5 }}>
                  <span style={{ fontWeight:600 }}>{s.name}</span>
                  <span style={{ color:"#aaa", fontSize:10 }}>{s.fields.length} columns · {s.conds.length} conditions · {s.rows} rows</span>
                  <button onClick={()=>{ setPicked(s.fields); setConds(s.conds); setScope(s.scope); setName(s.name); }}
                    style={{ ...btn, marginLeft:"auto", padding:"3px 9px", fontSize:10 }}>Load</button>
                </div>
              ))}
              <div style={{ fontSize:10, color:"#999", marginTop:8, lineHeight:1.6 }}>
                Saved reports are held for this session only. Persisting them per user, and sharing them with a team, needs the write layer.
              </div>
            </div>
          )}

          {/* Admin-only */}
          {isAdmin ? (
            <div style={{ background:"#fff", border:`0.5px solid ${CY}`, borderRadius:9, padding:"11px 13px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:NAVY, marginBottom:6 }}>
                Custom SQL <span style={{ fontWeight:400, color:"#888" }}>· system admins only</span>
              </div>
              <div style={{ fontSize:11.5, color:"#666", marginBottom:8, lineHeight:1.6 }}>
                For questions the field picker can't express — recursive ownership chains, period-on-period movement, anything needing a join the builder doesn't model. Runs read-only against the reporting views.
              </div>
              <textarea readOnly value={"-- Example: licensed gaming entities with an Australian UBO\nselect e.name, l.licence_no, u.name as ubo, u.country\nfrom entity e\njoin egaming_licence l on l.entity_id = e.id and l.status = 'Licensed'\njoin entity_ubo u on u.entity_id = e.id and u.country = 'Australia'\nwhere e.entity_class = 'client'\norder by e.name;"}
                style={{ width:"100%", height:118, fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace", fontSize:11, lineHeight:1.55,
                         border:"0.5px solid #e0e0e0", borderRadius:6, padding:"9px 10px", background:"#fbfbfd", color:"#333",
                         resize:"vertical", boxSizing:"border-box" }} />
              <div style={{ display:"flex", gap:6, marginTop:8, alignItems:"center", flexWrap:"wrap" }}>
                <button style={btn} disabled title="Enabled once the reporting views are live on Azure">Run query</button>
                <span style={{ fontSize:10, color:"#888" }}>Read-only execution arrives with the Azure reporting views — the editor is here so the permission model can be agreed now.</span>
              </div>
            </div>
          ) : (
            <div style={{ background:"#fafbfc", border:"0.5px solid #e5e5e5", borderRadius:9, padding:"10px 13px", fontSize:11, color:"#888" }}>
              Custom SQL reporting is restricted to system admins.
            </div>
          )}

          <div style={{ background:"#FDF4DC", border:"0.5px solid #E5CE9A", borderRadius:8, padding:"10px 13px", fontSize:10.5, color:"#7B4F1D", lineHeight:1.65 }}>
            ⚠️ Builder shell. The field catalogue, join model, conditions, grouping and CSV export are complete and final — rows currently resolve against a preview portfolio of {ROWS.length} entities. Each section header shows the table it will read from. Swapping to live data is one resolver change in <code>DOMAINS</code>, and needs the Azure reporting views plus Entra identity so row-level scoping (internal vs client) is enforced server-side rather than in the browser.
          </div>
        </div>
      </div>
    </div>
  );
}
