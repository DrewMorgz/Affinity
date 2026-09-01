import { useState, useEffect } from "react";
import EntitySearch from "./affinity_entity_search";
import { isConfigured } from "./affinity_accounting_supabase";
import { compReviews, compRegObligations, compBreaches, compTraining } from "./affinity_compliance_api";
import { cpdList } from "./affinity_cpd_api";
import { cregList, cregAdd } from "./affinity_creg_api";
const CY = "#00C4CC";
const SideBtn = ({ active, onClick, children }) => (
  <div onClick={onClick} style={{ padding:"7px 10px", fontSize:12, borderRadius:6, cursor:"pointer", marginBottom:1, background:active?"#E6F7FB":"transparent", color:active?"#0077A8":"#444", fontWeight:active?600:400 }}>{children}</div>
);
const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);
const nb  = { padding:"5px 12px", fontSize:12, borderRadius:6, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:700 };
const th  = { padding:"9px 14px", textAlign:"left", fontSize:11, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", whiteSpace:"nowrap" };
const td  = { padding:"9px 14px", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderBottom:"0.5px solid #e5e5e5" };
const sc  = { background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 14px" };
const card = { background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:10, padding:16, marginBottom:14 };

const VIEWS = ["overview","csp","aml","reporting","training"];
const VLABELS = ["Overview","CSP licence","AML/CFT framework","Regulatory reporting","Staff training"];

const entities = [
  { id:1, name:"Meridian Holdings Ltd",    ref:"AC-2024-001", type:"Company", risk:"Medium", reviewer:"Roxy Sheeley",   nextReview:"14/09/2025", status:"Due this month", jurisdiction:"Isle of Man" },
  { id:2, name:"Harrington Family Trust",  ref:"AC-2019-014", type:"Trust",   risk:"High",   reviewer:"Colette Grisdale",  nextReview:"05/01/2025", status:"Overdue", jurisdiction:"Isle of Man" },
  { id:3, name:"North Star Holdings Ltd",  ref:"AC-2016-003", type:"Company", risk:"High",   reviewer:"Colette Grisdale",  nextReview:"30/03/2025", status:"Overdue", jurisdiction:"Isle of Man" },
  { id:4, name:"Rosewood Legacy Trust",    ref:"AC-2021-027", type:"Trust",   risk:"Medium", reviewer:"Roxy Sheeley",   nextReview:"25/03/2026", status:"Upcoming", jurisdiction:"Isle of Man" },
  { id:5, name:"Caledonian Ventures Ltd",  ref:"AC-2021-032", type:"Company", risk:"Medium", reviewer:"Garry Crossan",  nextReview:"12/12/2025", status:"Upcoming", jurisdiction:"Cayman Islands" },
  { id:6, name:"Pacific Wealth Trust",     ref:"AC-2022-019", type:"Trust",   risk:"High",   reviewer:"Garry Crossan",  nextReview:"08/02/2025", status:"Overdue", jurisdiction:"Cayman Islands" },
  { id:7, name:"Azure Mediterranean Fdn",  ref:"AC-2020-008", type:"Foundation", risk:"Low", reviewer:"Joanne Fenech",  nextReview:"20/04/2026", status:"Upcoming", jurisdiction:"Malta" },
  { id:8, name:"Stonebridge Capital Ltd",  ref:"AC-2023-041", type:"Company", risk:"Low",    reviewer:"Joanne Fenech",  nextReview:"15/10/2025", status:"Due this month", jurisdiction:"Malta" },
];

// Managed legal entity / regulatory context per jurisdiction.
// Regulator + legislation facts are accurate; Affinity-specific fields (entity, licence no, MLRO) update in System Admin.
const REG = {
  "Isle of Man": { short:"IOMFSA Regulated", regulator:"Isle of Man Financial Services Authority (IOMFSA)", licence:"Corporate & Trust Service Provider (CSP)", entity:"Affinity (Isle of Man) Limited (110310C)", office:"Second Floor, 14 Athol Street, Douglas, Isle of Man", mlro:"Colette Grisdale", legislation:"Proceeds of Crime Act 2008, AML/CFT Code 2019", obligation:"Risk-based AML/CFT, periodic reviews, suspicious activity reporting to the FIU" },
  "Cayman Islands": { short:"CIMA Regulated", regulator:"Cayman Islands Monetary Authority (CIMA)", licence:"Corporate services", entity:"Affinity (Cayman) Limited (WT-359621)", office:"Buckingham Square, South Building, 2nd Floor, West Bay Road, Grand Cayman", mlro:"Colette Grisdale", legislation:"Proceeds of Crime Act (Revised), Anti-Money Laundering Regulations", obligation:"CDD, risk-based monitoring, SAR reporting to the Financial Reporting Authority" },
  "Malta": { short:"MFSA Regulated", regulator:"Malta Financial Services Authority (MFSA)", licence:"Company Service Provider (CSP)", entity:"Affinity (Malta) Limited (C53435)", office:"Level 2, Progetta House, Tower Street, Swatar, Birkirkara BKR 4012, Malta", mlro:"Gilber Spiteri Spadaro", legislation:"Prevention of Money Laundering Act (PMLA), PMLFTR", obligation:"CDD, risk-based monitoring, STR reporting to the FIAU" },
};
const JUR_OPTS = ["Isle of Man","Cayman Islands","Malta","Cyprus","All jurisdictions"];

const reportingObs = [
  { id:1, type:"Annual compliance return", regulator:"IOMFSA", due:"31/03/2026", filed:"31/03/2025", status:"Filed",    freq:"Annual" },
  { id:2, type:"Suspicious activity reports", regulator:"FIU Isle of Man", due:"Ongoing", filed:"N/A", status:"Ongoing", freq:"As required" },
  { id:3, type:"DNFBP registration renewal", regulator:"IOMFSA", due:"01/06/2026", filed:"01/06/2025", status:"Filed",    freq:"Annual" },
  { id:4, type:"Beneficial ownership register submission", regulator:"IOM Companies Registry", due:"Ongoing", filed:"Current", status:"Current", freq:"On change" },
  { id:5, type:"CSP licence renewal", regulator:"IOMFSA", due:"30/09/2026", filed:"30/09/2025", status:"Filed",    freq:"Annual" },
  { id:6, type:"AML/CFT risk assessment", regulator:"Internal", due:"31/12/2025", filed:"31/12/2024", status:"Due Q4",  freq:"Annual" },
];

const breachLog = [
  { id:1, date:"15/03/2025", type:"Late KYC renewal",      entity:"Harrington Family Trust", severity:"Minor",  reported:false, action:"KYC renewal requested. Monitoring.", status:"Open" },
  { id:2, date:"10/01/2025", type:"Delayed periodic review",entity:"Pacific Wealth Trust",   severity:"Minor",  reported:false, action:"Review now in progress. EDD outstanding.", status:"Open" },
  { id:3, date:"22/11/2024", type:"Missing SAR report",    entity:"N/A — internal",          severity:"Moderate",reported:true, action:"SAR filed with FIU on 23/11/2024. Process reviewed.", status:"Closed" },
];

const training = [
  { name:"Roxy Sheeley",   role:"MD — IOM",       aml:"15/01/2025", csp:"10/02/2025", refreshDue:"15/01/2026", status:"Current" },
  { name:"Colette Grisdale",  role:"CCO",             aml:"20/01/2025", csp:"10/02/2025", refreshDue:"20/01/2026", status:"Current" },
  { name:"Sarah Cole",     role:"Administrator",   aml:"10/02/2025", csp:"10/02/2025", refreshDue:"10/02/2026", status:"Current" },
  { name:"Neil Kelly",     role:"CFO",             aml:"15/01/2025", csp:"N/A",        refreshDue:"15/01/2026", status:"Current" },
  { name:"Andy Morgan",    role:"CEO",             aml:"15/01/2025", csp:"10/02/2025", refreshDue:"15/01/2026", status:"Current" },
];

// ---- Compliance registers (Entity-Admin-style). Each = columns + demo rows. ----
const ST = { open:{bg:"#FCEBEB",color:"#A32D2D"}, closed:{bg:"#EAF3DE",color:"#27500A"}, review:{bg:"#FAEEDA",color:"#633806"}, ok:{bg:"#EAF3DE",color:"#27500A"} };
export const REGISTERS = {
  errors:     { label:"Errors & omissions", cols:["Date","Description","Entity","Owner","Remediation","Status"], rows:[
    ["12/06/2025","Incorrect fee note issued","Meridian Holdings Ltd","N. Kelly","Credit note raised, process updated","Closed"],
    ["28/07/2025","Filing submitted one day late","Rosewood Legacy Trust","R. Sheeley","Filed; no penalty; reminder added","Closed"]] },
  deviations: { label:"Deviations", cols:["Date","Procedure","Reason","Approved by","Review date","Status"], rows:[
    ["03/05/2025","Onboarding — certified docs","Notary abroad, delay","C. Grisdale","03/11/2025","Open"],
    ["19/06/2025","Payment authorisation limit","Director travelling","C. Grisdale","19/09/2025","Closed"]] },
  complaints: { label:"Complaints", cols:["Date","Complainant","Entity","Nature","Handler","Status"], rows:[
    ["02/07/2025","J. Client","Pacific Wealth Trust","Delay in distribution","C. Grisdale","Open"],
    ["14/04/2025","Third party","Meridian Holdings Ltd","Fee query","N. Kelly","Closed"]] },
  gifts:      { label:"Gifts & hospitality", cols:["Date","Staff","From / to","Description","Value","Approved"], rows:[
    ["20/06/2025","R. Sheeley","From introducer","Dinner","£85","Approved"],
    ["11/03/2025","A. Morgan","To client","Corporate event ticket","£150","Approved"]] },
  conflicts:  { label:"Conflicts of interest", cols:["Date","Staff","Nature of conflict","Entity","Mitigation","Status"], rows:[
    ["09/05/2025","N. Kelly","Director of related supplier","North Star Holdings Ltd","Recused from decision","Open"],
    ["22/02/2025","J. Fenech","Family connection","Azure Mediterranean Fdn","Disclosed; monitored","Closed"]] },
  sanctions:  { label:"Sanctions screening", cols:["Date","Screened party","Entity","List / source","Result","Action"], rows:[
    ["01/07/2025","New UBO","Stonebridge Capital Ltd","OFAC / UK / EU","No match","Cleared"],
    ["18/06/2025","Counterparty","Pacific Wealth Trust","World-Check","Possible match","EDD — under review"]] },
  peps:       { label:"PEP register", cols:["Name","Entity","Position","Country","EDD status","Approved by"], rows:[
    ["[Redacted]","Caledonian Ventures Ltd","Former minister","—","Complete","C. Grisdale"],
    ["[Redacted]","Azure Mediterranean Fdn","Family of PEP","—","In progress","J. Fenech"]] },
  frozen:     { label:"Frozen assets", cols:["Date","Entity","Asset","Reason","Authority","Status"], rows:[
    ["—","—","—","No frozen assets currently recorded","—","—"]] },
  declined:   { label:"Declined & terminated business", cols:["Date","Prospect / client","Type","Reason","Decision by","Notes"], rows:[
    ["15/06/2025","[Prospect]","Declined at onboarding","SoW unsatisfactory","C. Grisdale","Not proceeded"],
    ["03/04/2025","[Client]","Terminated","Risk appetite / conduct","Board","Exit completed"]] },
  advertising:{ label:"Advertising & financial promotions", cols:["Date","Item","Channel","Approved by","Review date","Status"], rows:[
    ["10/06/2025","LinkedIn — service post","LinkedIn","C. Grisdale","10/12/2025","Approved"],
    ["21/05/2025","Website — gaming page","Web","C. Grisdale","21/11/2025","Approved"]] },
  outsourcing:{ label:"Outsourcing register", cols:["Provider","Service","Entity","Contract review","Risk","Status"], rows:[
    ["Quantios","Core system / DMS","Group","01/2026","Medium","Active"],
    ["[IT MSP]","Managed IT & security","Group","09/2025","Medium","Active"]] },
  cyber:      { label:"Cyber security incidents", cols:["Date","Incident","Severity","Systems","Response","Status"], rows:[
    ["—","No incidents recorded this period","—","—","—","—"]] },
  litigation: { label:"Litigation & risk", cols:["Date","Matter","Entity","Exposure","Adviser","Status"], rows:[
    ["—","No active litigation","—","—","—","—"]] },
  insurance:  { label:"Insurance register", cols:["Policy","Insurer","Cover","Limit","Renewal","Status"], rows:[
    ["Professional indemnity","[Insurer]","PI","£[x]m","31/12/2025","Active"],
    ["Cyber","[Insurer]","Cyber & data","£[x]m","31/12/2025","Active"]] },
  keystaff:   { label:"Key staff register", cols:["Name","Role","Function","Regulator approval","Since","Status"], rows:[
    ["Colette Grisdale","MLRO / Compliance","AML/CFT","IOMFSA","2018","Active"],
    ["A. Morgan","CEO / Director","Governance","IOMFSA","2004","Active"]] },
  cpd:        { label:"CPD log", cols:["Staff","Activity","Category","Hours","Date","Verified"], rows:[
    ["C. Grisdale","AML/CFT annual update","Compliance","4.0","06/2025","Verified"],
    ["R. Sheeley","Trust administration webinar","Technical","2.0","05/2025","Verified"]] },
};
export const REGISTER_ORDER = ["breaches","errors","deviations","complaints","gifts","conflicts","sanctions","peps","frozen","declined","advertising","outsourcing","cyber","litigation","insurance","keystaff","cpd"];

export default function AffinityIOMCompliance() {
  const [entitySearch, setEntitySearch] = useState("");
  const [view, setView] = useState("overview");
  const [modal, setModal] = useState(null);
  const [live, setLive] = useState(null);
  const [jur, setJur] = useState("Isle of Man");
  const [cpdRows, setCpdRows] = useState(null);
  const [liveReg, setLiveReg] = useState({});   // register id -> array of live row-arrays
  const [addForm, setAddForm] = useState({});
  const [addSaving, setAddSaving] = useState(false);

  // load live entries for the open register (non-CPD registers use the generic creg store)
  useEffect(() => {
    if (!isConfigured || !REGISTERS[view] || view === "cpd" || view === "breaches") return;
    let ok = true;
    cregList(view).then(({ data }) => {
      if (!ok || !data) return;
      const cols = REGISTERS[view].cols;
      const rows = data.map(e => cols.map(c => (e.data && e.data[c] != null ? e.data[c] : "")));
      setLiveReg(p => ({ ...p, [view]: rows }));
    }).catch(() => {});
    return () => { ok = false; };
  }, [view]);

  const openAdd = () => { const f = {}; (REGISTERS[view]?.cols || []).forEach(c => { f[c] = ""; }); setAddForm(f); setModal("add"); };
  const saveAdd = async () => {
    setAddSaving(true);
    try {
      await cregAdd({ register: view, jurisdiction: jur === "All jurisdictions" ? "" : jur, data: addForm, by: "" });
      const { data } = await cregList(view);
      if (data) {
        const cols = REGISTERS[view].cols;
        setLiveReg(p => ({ ...p, [view]: data.map(e => cols.map(c => (e.data && e.data[c] != null ? e.data[c] : ""))) }));
      }
      setModal(null);
    } catch (e) { /* refresh shows nothing new on failure */ }
    setAddSaving(false);
  };

  useEffect(() => {
    if (!isConfigured) return;
    let ok = true;
    Promise.all([compReviews(), compRegObligations(), compBreaches(), compTraining()])
      .then(([rv, ob, br, tr]) => {
        if (!ok) return;
        setLive({
          revs: (rv.data || []).map(r => ({ id:r.id, name:r.name, ref:r.ref, type:r.type, risk:r.risk, reviewer:r.reviewer, nextReview:r.next_review, status:r.status, jurisdiction:r.jurisdiction })),
          obs: ob.data || [],
          breaches: br.data || [],
          trg: (tr.data || []).map(t => ({ name:t.name, role:t.role, aml:t.aml, csp:t.csp, refreshDue:t.refresh_due, status:t.status })),
        });
      }).catch(() => {});
    cpdList().then(({ data }) => { if (ok && data && data.length) setCpdRows(data.map(c => [c.staff, c.activity, c.category, c.hours, c.entry_date, c.verified ? "Verified" : "Unverified"])); }).catch(() => {});
    return () => { ok = false; };
  }, []);

  const revs     = (live && live.revs.length)     ? live.revs     : entities;
  const obs      = (live && live.obs.length)      ? live.obs      : reportingObs;
  const breaches = (live && live.breaches.length) ? live.breaches : breachLog;
  const trg      = (live && live.trg.length)      ? live.trg      : training;
  const jurRevs = jur==="All jurisdictions" ? revs : revs.filter(r => r.jurisdiction === jur);
  const ctx = REG[jur] || null;
  const overdueReviews = jurRevs.filter(r => r.status === "Overdue").length;
  const openBreaches   = breaches.filter(b => b.status === "Open").length;
  const fg = { display:"flex", flexDirection:"column", gap:3, marginBottom:12 };
  const fgl = { fontSize:11, color:"#666" };
  const fgi = { fontSize:13, borderRadius:6, border:"0.5px solid #ccc", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", padding:"0 10px", height:34, outline:"none" };

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
        <div style={{ fontSize:18, fontWeight:500, color:"#001242" }}>{jur==="All jurisdictions"?"Group":jur} — Compliance Framework</div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <select value={jur} onChange={e=>setJur(e.target.value)} style={{ ...fgi, height:32, fontWeight:500 }}>
            {JUR_OPTS.map(j=><option key={j} value={j}>{j==="All jurisdictions"?"All jurisdictions":`Managed entity — ${j}`}</option>)}
          </select>
          {ctx && <Badge label={ctx.short} colors={{ bg:"#E6F7FB", color:"#0077A8" }} />}
          {ctx && <Badge label="CSP Licence Active" colors={{ bg:"#EAF3DE", color:"#27500A" }} />}
        </div>
      </div>
      {/* Entity search — same component on every page showing client data */}
      <div style={{ padding:"10px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-primary,#fff)" }}>
        <EntitySearch value={entitySearch} onChange={setEntitySearch} compact />
      </div>

      <div style={{ display:"flex", alignItems:"flex-start" }}>
        <aside style={{ width:212, flexShrink:0, borderRight:"0.5px solid #e5e5e5", padding:"12px 8px", minHeight:520, background:"var(--bg-secondary,#fafafa)" }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.5px", color:"#999", padding:"6px 10px" }}>Framework</div>
          {VIEWS.map((v,i)=><SideBtn key={v} active={view===v} onClick={()=>setView(v)}>{VLABELS[i]}</SideBtn>)}
          <SideBtn active={view==="registers"||!!REGISTERS[view]} onClick={()=>setView("registers")}>
            Registers <span style={{ fontSize:9, opacity:0.6 }}>({REGISTER_ORDER.length})</span>
          </SideBtn>
        </aside>
        <div style={{ flex:1, minWidth:0 }}>

      {view==="overview"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
            {[{l:(jur==="All jurisdictions"?"Total":jur)+" entities",v:jurRevs.length,c:CY},{l:"CSP licence status",v:ctx?"Active":"—",c:"#4CAF7D"},{l:"Overdue reviews",v:overdueReviews,c:"#EF4444"},{l:"Open breaches",v:openBreaches,c:"#F59E0B"}].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:11, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:20, fontWeight:700, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12 }}>{ctx?`${jur} regulatory framework`:"Group regulatory framework"}</div>
              {ctx ? [
                ["Regulator",ctx.regulator],
                ["Licence type",ctx.licence],
                ["Licence number","XXXXXX (update in System Admin)"],
                ["Registered entity",ctx.entity],
                ["Registered office",ctx.office],
                ["MLRO",ctx.mlro],
                ["Compliance officer",ctx.mlro],
                ["AML legislation",ctx.legislation],
                ["Key obligation",ctx.obligation],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12, gap:12 }}>
                  <span style={{ color:"#666", flexShrink:0 }}>{k}</span>
                  <span style={{ fontWeight:500, textAlign:"right" }}>{v}</span>
                </div>
              )) : (
                <div style={{ fontSize:12, color:"#666", lineHeight:1.7 }}>
                  Affinity operates regulated managed entities across {Object.keys(REG).join(", ")}. Select a managed entity above to view its regulator, licence and framework. The schedule opposite shows the periodic review timetable across all jurisdictions.
                </div>
              )}
            </div>
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12 }}>{ctx?jur:"All"} entity review schedule</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>
                  <th style={th}>Entity</th>{jur==="All jurisdictions"&&<th style={th}>Jurisdiction</th>}<th style={th}>Risk</th><th style={th}>Next review</th><th style={th}>Status</th>
                </tr></thead>
                <tbody>
                  {jurRevs.map(e=>(
                    <tr key={e.id} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                      <td style={td}><div style={{ fontWeight:600, fontSize:12 }}>{e.name}</div></td>
                      {jur==="All jurisdictions"&&<td style={{ ...td, color:"#666" }}>{e.jurisdiction}</td>}
                      <td style={td}><Badge label={e.risk} colors={{ High:{bg:"#FCEBEB",color:"#A32D2D"}, Medium:{bg:"#FAEEDA",color:"#633806"}, Low:{bg:"#EAF3DE",color:"#27500A"} }[e.risk]||{bg:"#eee",color:"#666"}} /></td>
                      <td style={{ ...td, color:e.status==="Overdue"?"#EF4444":"#666" }}>{e.nextReview}</td>
                      <td style={td}><Badge label={e.status} colors={{ Overdue:{bg:"#FCEBEB",color:"#A32D2D"}, "Due this month":{bg:"#FAEEDA",color:"#633806"}, Upcoming:{bg:"#E6F7FB",color:"#0077A8"}, Complete:{bg:"#EAF3DE",color:"#27500A"} }[e.status]||{bg:"#eee",color:"#666"}} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {view==="csp"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12 }}>CSP licence details</div>
              {[
                ["Licence type","Class 4 — Corporate & Trust Service Provider"],
                ["Licence status","Active"],
                ["Issue date","01/10/2004"],
                ["Last renewal","30/09/2025"],
                ["Next renewal","30/09/2026"],
                ["Regulator","IOMFSA"],
                ["Compliance contact","Colette Grisdale (CCO)"],
                ["Conditions","Standard CSP conditions apply. See IOMFSA website."],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12, gap:12 }}>
                  <span style={{ color:"#666", flexShrink:0 }}>{k}</span><span style={{ fontWeight:500, textAlign:"right" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12 }}>CSP obligations checklist</div>
              {[
                ["Adequate resources maintained","✓ Met"],
                ["Fit and proper persons in control","✓ Met"],
                ["AML/CFT policies and procedures","✓ Current — last reviewed Jan 2025"],
                ["Staff AML training","✓ All current"],
                ["MLRO appointed and notified to IOMFSA","✓ Colette Grisdale"],
                ["Annual compliance return filed","✓ Filed 31/03/2025"],
                ["Business risk assessment current","⚠ Due Q4 2025"],
                ["Outsourcing notifications","✓ None applicable"],
                ["Beneficial ownership data submitted","✓ Current"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12 }}>
                  <span style={{ color:"#666" }}>{k}</span>
                  <span style={{ fontWeight:600, color:v.startsWith("✓")?"#4CAF7D":v.startsWith("⚠")?"#F59E0B":"#EF4444" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view==="aml"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12 }}>AML/CFT policy framework</div>
              {[
                ["Primary legislation","Proceeds of Crime Act 2008"],
                ["Secondary legislation","Anti-Money Laundering Code 2019 (as amended)"],
                ["Guidance notes","IOMFSA Guidance Notes for CSPs"],
                ["Business risk assessment","Completed December 2024 — next due Q4 2025"],
                ["Customer risk assessment","Risk-based, applied at onboarding and review"],
                ["CDD standard","Enhanced for High/Very High risk — EDD applied"],
                ["Simplified CDD","Not applied — all clients subject to full CDD"],
                ["PEP policy","6-month review cycle, senior management approval"],
                ["Sanctions screening provider","Worldcheck"],
                ["SAR threshold","Suspicion — no de minimis threshold"],
                ["Tipping-off controls","In place — staff briefed"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12, gap:12 }}>
                  <span style={{ color:"#666", flexShrink:0, maxWidth:"45%" }}>{k}</span><span style={{ fontWeight:500, textAlign:"right" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12 }}>Risk rating matrix — IOM</div>
              {[
                { tier:"Very High", cycle:"6 months", edd:"Mandatory", mgmt:"MLRO + MD approval", examples:"PEPs, sanctions adjacent, complex structures" },
                { tier:"High",      cycle:"12 months",edd:"Required",   mgmt:"Compliance officer + Director", examples:"High-risk jurisdictions, complex ownership" },
                { tier:"Medium",    cycle:"24 months",edd:"Discretionary",mgmt:"Compliance officer",examples:"Standard structures, known introducers" },
                { tier:"Low",       cycle:"36 months",edd:"Not required",mgmt:"Administrator",    examples:"Simple structures, low-risk jurisdictions" },
              ].map(r=>(
                <div key={r.tier} style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 12px", marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontWeight:700, fontSize:12 }}>{r.tier}</span>
                    <Badge label={`Review: ${r.cycle}`} colors={{ bg:"#E6F7FB", color:"#0077A8" }} />
                  </div>
                  <div style={{ fontSize:11, color:"#666", lineHeight:1.5 }}>
                    <span style={{ color:"#333" }}>EDD: </span>{r.edd} · <span style={{ color:"#333" }}>Approval: </span>{r.mgmt}<br/>
                    <span style={{ color:"#999" }}>{r.examples}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view==="reporting"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>Regulatory reporting obligations — Isle of Man</div>
            <div style={{ fontSize:12, color:"#666" }}>All IOM regulatory reports, filings and submissions tracked below. IOMFSA portal submissions should be confirmed here on completion.</div>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"28%" }}>Report / obligation</th>
              <th style={{ ...th, width:"20%" }}>Regulator</th>
              <th style={{ ...th, width:"12%" }}>Frequency</th>
              <th style={{ ...th, width:"12%" }}>Due</th>
              <th style={{ ...th, width:"12%" }}>Last filed</th>
              <th style={{ ...th, width:"16%" }}>Status</th>
            </tr></thead>
            <tbody>
              {obs.map(r=>(
                <tr key={r.id} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{ ...td, fontWeight:600 }}>{r.type}</td>
                  <td style={{ ...td, color:"#666" }}>{r.regulator}</td>
                  <td style={{ ...td, color:"#666" }}>{r.freq}</td>
                  <td style={{ ...td, color:"#666" }}>{r.due}</td>
                  <td style={{ ...td, color:"#666" }}>{r.filed}</td>
                  <td style={td}><Badge label={r.status} colors={{ Filed:{bg:"#EAF3DE",color:"#27500A"}, Ongoing:{bg:"#E6F7FB",color:"#0077A8"}, Current:{bg:"#EAF3DE",color:"#27500A"}, "Due Q4":{bg:"#FAEEDA",color:"#633806"} }[r.status]||{bg:"#eee",color:"#666"}} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view==="breaches"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>Breach and incident log</div>
            <button style={nba} onClick={()=>setModal("breach")}>＋ Log breach</button>
          </div>
          <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 14px", fontSize:12, color:"#666", marginBottom:16 }}>
            ℹ️ All compliance breaches, near misses and regulatory incidents must be logged here. Material breaches must be reported to IOMFSA within the required timeframe. MLRO maintains oversight of all entries.
          </div>
          {breaches.map(b=>(
            <div key={b.id} style={{ background:"var(--bg-primary,#fff)", border:`0.5px solid ${b.severity==="Moderate"?"#F59E0B":"#e5e5e5"}`, borderRadius:8, padding:"12px 16px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:13 }}>{b.type}</div>
                  <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{b.date} · {b.entity}</div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <Badge label={b.severity} colors={{ Minor:{bg:"#FAEEDA",color:"#633806"}, Moderate:{bg:"#FCEBEB",color:"#A32D2D"}, Serious:{bg:"#7B1D1D22",color:"#7B1D1D"} }[b.severity]||{bg:"#eee",color:"#666"}} />
                  <Badge label={b.status} colors={b.status==="Closed"?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#FAEEDA",color:"#633806"}} />
                </div>
              </div>
              <div style={{ fontSize:12, color:"#666", marginBottom:6 }}><strong>Action taken:</strong> {b.action}</div>
              <div style={{ fontSize:11, color:b.reported?"#4CAF7D":"#F59E0B" }}>Reported to regulator: {b.reported?"Yes":"No — below reporting threshold"}</div>
            </div>
          ))}
        </div>
      )}

      {view==="training"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>Staff AML/CFT training register</div>
            <button style={nba} onClick={()=>setModal("training")}>＋ Record training</button>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"20%" }}>Staff member</th>
              <th style={{ ...th, width:"18%" }}>Role</th>
              <th style={{ ...th, width:"16%" }}>AML training</th>
              <th style={{ ...th, width:"16%" }}>CSP training</th>
              <th style={{ ...th, width:"16%" }}>Refresh due</th>
              <th style={{ ...th, width:"14%" }}>Status</th>
            </tr></thead>
            <tbody>
              {trg.map((t,i)=>(
                <tr key={i} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{ ...td, fontWeight:600 }}>{t.name}</td>
                  <td style={{ ...td, color:"#666" }}>{t.role}</td>
                  <td style={{ ...td, color:"#666" }}>{t.aml}</td>
                  <td style={{ ...td, color:"#666" }}>{t.csp}</td>
                  <td style={{ ...td, color:"#666" }}>{t.refreshDue}</td>
                  <td style={td}><Badge label={t.status} colors={{ Current:{bg:"#EAF3DE",color:"#27500A"}, Overdue:{bg:"#FCEBEB",color:"#A32D2D"}, Due:{bg:"#FAEEDA",color:"#633806"} }[t.status]||{bg:"#eee",color:"#666"}} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Register picker — one dropdown plus an all-registers contents view,
          so 17 registers don't take over the sidebar. */}
      {(view==="registers" || REGISTERS[view]) && (
        <div style={{ padding:"14px 20px 0" }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:4 }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#001242" }}>Register</span>
            <select value={REGISTERS[view]?view:""} onChange={e=>setView(e.target.value||"registers")}
              style={{ height:30, padding:"0 8px", fontSize:11.5, border:"0.5px solid #ccc", borderRadius:5, background:"#fff", minWidth:230 }}>
              <option value="">All registers ({REGISTER_ORDER.length})</option>
              {REGISTER_ORDER.map(r=><option key={r} value={r}>{r==="breaches"?"Breach log":(REGISTERS[r]?REGISTERS[r].label:r)}</option>)}
            </select>
            {REGISTERS[view] && <button onClick={()=>setView("registers")}
              style={{ height:30, padding:"0 10px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" }}>
              ← All registers
            </button>}
            <span style={{ fontSize:10.5, color:"#888", marginLeft:"auto" }}>
              Scoped to {jur==="All jurisdictions"?"the whole group":jur}
            </span>
          </div>
        </div>
      )}

      {/* All-registers contents view */}
      {view==="registers" && (
        <div style={{ padding:"10px 20px 16px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(232px,1fr))", gap:9 }}>
            {REGISTER_ORDER.map(r=>{
              // "breaches" is rendered by its own view and has no REGISTERS entry —
              // fall back to a descriptor so the contents grid can still list it.
              const reg = REGISTERS[r] || { label:"Breach log", cols:["Date","Entity","Description","Severity","Status"], rows:[] };
              const live = (liveReg[r]||[]).length;
              const demo = (reg.rows||[]).length;
              return (
                <div key={r} onClick={()=>setView(r)}
                  style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:8,
                           padding:"11px 13px", cursor:"pointer", display:"flex", flexDirection:"column", gap:5 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"#001242" }}>{r==="breaches"?"Breach log":reg.label}</div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                    <span style={{ fontSize:17, fontWeight:700, color:(live+demo)?"#00C4CC":"#ccc" }}>{live+demo}</span>
                    <span style={{ fontSize:10, color:"#999" }}>{(live+demo)===1?"entry":"entries"}</span>
                    {live>0 && <span style={{ fontSize:9, fontWeight:700, color:"#27500A", background:"#EAF3DE", borderRadius:9, padding:"1px 6px", marginLeft:"auto" }}>{live} live</span>}
                  </div>
                  <div style={{ fontSize:10, color:"#aaa" }}>{(reg.cols||[]).slice(0,3).join(" · ")}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {REGISTERS[view] && (
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#001242" }}>{REGISTERS[view].label}{jur!=="All jurisdictions"?` — ${jur}`:""}</div>
            <button style={{ background:CY, color:"#fff", border:"none", padding:"6px 14px", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }} onClick={openAdd}>＋ Add entry</button>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>{REGISTERS[view].cols.map((c,i)=><th key={c} style={{ padding:"8px 10px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5" }}>{c}</th>)}</tr></thead>
            <tbody>
              {(view==="cpd"&&cpdRows ? cpdRows : [...(liveReg[view]||[]), ...REGISTERS[view].rows]).map((row,ri)=>(
                <tr key={ri} style={{ borderBottom:"0.5px solid #eee" }}>
                  {row.map((cell,ci)=>{
                    const isStatus = ci===row.length-1;
                    const sc = { "Open":ST.open,"Closed":ST.closed,"Active":ST.ok,"Approved":ST.ok,"Verified":ST.ok,"Cleared":ST.ok,"Not proceeded":{bg:"#F1EFE8",color:"#888"} }[cell];
                    return <td key={ci} style={{ padding:"8px 10px", fontSize:12, color:ci===0?"#001242":"#444", fontWeight:ci===0?600:400 }}>{isStatus&&sc?<Badge label={cell} colors={sc} />:(cell==="—"?<span style={{color:"#bbb"}}>—</span>:cell)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize:10, color:"#999", marginTop:12 }}>Read-only in beta. Adding and editing register entries activates with the write layer. Registers scope to the selected managed entity / jurisdiction above.</div>
        </div>
      )}
        </div>
      </div>

      {modal&&(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(13,27,42,0.45)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:40, zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"var(--bg-primary,#fff)", borderRadius:10, border:"0.5px solid #e5e5e5", padding:22, width:480, maxWidth:"96vw" }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:18 }}>{modal==="breach"?"Log compliance breach / incident":modal==="training"?"Record staff training":modal==="add"?("Add entry — "+(REGISTERS[view]?.label||"")):""}</div>
            {modal==="add"&&REGISTERS[view]&&<>
              {REGISTERS[view].cols.map(c=>(
                <div style={fg} key={c}><label style={fgl}>{c}</label>
                  <input style={fgi} value={addForm[c]||""} onChange={e=>setAddForm(f=>({...f,[c]:e.target.value}))} placeholder={c} />
                </div>
              ))}
              {!isConfigured&&<div style={{ fontSize:11, color:"#B25000" }}>Backend not connected — entry won't save.</div>}
            </>}
            {modal==="breach"&&<>
              <div style={fg}><label style={fgl}>Breach type</label><select style={fgi}><option>Late KYC renewal</option><option>Delayed periodic review</option><option>Missing SAR report</option><option>Tipping-off breach</option><option>Data breach</option><option>Other</option></select></div>
              <div style={fg}><label style={fgl}>Date identified</label><input style={fgi} placeholder="DD/MM/YYYY" /></div>
              <div style={fg}><label style={fgl}>Entity (if applicable)</label><input style={fgi} placeholder="Entity name" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div style={fg}><label style={fgl}>Severity</label><select style={fgi}><option>Minor</option><option>Moderate</option><option>Serious</option></select></div>
                <div style={fg}><label style={fgl}>Reported to IOMFSA?</label><select style={fgi}><option>No — below threshold</option><option>Yes — reported</option><option>Under review</option></select></div>
              </div>
              <div style={fg}><label style={fgl}>Description & action taken</label><textarea style={{ ...fgi, height:80, padding:"8px 10px" }} placeholder="Describe the breach and action taken..." /></div>
            </>}
            {modal==="training"&&<>
              <div style={fg}><label style={fgl}>Staff member</label><select style={fgi}><option>Roxy Sheeley</option><option>Colette Grisdale</option><option>Sarah Cole</option><option>Neil Kelly</option><option>Andy Morgan</option></select></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div style={fg}><label style={fgl}>Training type</label><select style={fgi}><option>AML/CFT awareness</option><option>CSP obligations</option><option>MLRO refresher</option><option>PEP training</option><option>Sanctions training</option></select></div>
                <div style={fg}><label style={fgl}>Date completed</label><input style={fgi} placeholder="DD/MM/YYYY" /></div>
                <div style={fg}><label style={fgl}>Provider</label><input style={fgi} placeholder="e.g. ICA, internal" /></div>
                <div style={fg}><label style={fgl}>Next refresh due</label><input style={fgi} placeholder="DD/MM/YYYY" /></div>
              </div>
            </>}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
              <button style={{ background:"transparent", border:"0.5px solid #ccc", color:"var(--text-primary,#111)", padding:"7px 18px", borderRadius:6, fontSize:12, cursor:"pointer" }} onClick={()=>setModal(null)}>Cancel</button>
              <button style={{ background:CY, color:"#fff", border:"none", padding:"7px 18px", borderRadius:6, fontSize:12, fontWeight:700, cursor:"pointer", opacity:addSaving?0.5:1 }} onClick={modal==="add"?saveAdd:()=>setModal(null)} disabled={addSaving}>{modal==="add"?(addSaving?"Saving…":"Save entry"):"Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
