import React, { useState, useMemo, useEffect } from "react";
import { isConfigured } from "./affinity_accounting_supabase";
import { crmProspects } from "./affinity_crm_api";
const CY = "#00C4CC";
const NAVY = "#001242";

const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);

// Per review: new status stages
const STAGES = ["Initial Call","Proposal Sent","Proposal Accepted","KYC Arriving","KYC Approved","Fees Paid","Declined","Withdrawn"];
const STAGE_COLORS = {
  "Initial Call":      { bg:"#E6F7FB", color:"#0077A8" },
  "Proposal Sent":     { bg:"#EEF0FB", color:"#3C3489" },
  "Proposal Accepted": { bg:"#FAEEDA", color:"#633806" },
  "KYC Arriving":      { bg:"#F3E5F5", color:"#6A1B9A" },
  "KYC Approved":      { bg:"#E6F7FB", color:"#00796B" },
  "Fees Paid":         { bg:"#EAF3DE", color:"#27500A" },
  "Declined":          { bg:"#FCEBEB", color:"#A32D2D" },
  "Withdrawn":         { bg:"#F5F5F5", color:"#757575" },
};

// Per review: extended type list
const TYPES = ["Company","Trust","Foundation","Fund","LLC","Individual","B2B","B2C","Aviation","Yachting","Sports"];

// Per review: full office list
const OFFICES = ["Isle of Man","Malta","Cayman Islands","Cyprus","USA","United Kingdom","Gaming Gateway","Nav"];

const SOURCE_COLORS = {
  "Referral":        { bg:"#EAF3DE", color:"#27500A" },
  "Cold outreach":   { bg:"#E6F7FB", color:"#0077A8" },
  "Trade show":      { bg:"#FAEEDA", color:"#633806" },
  "Existing client": { bg:"#EEF0FB", color:"#3C3489" },
  "Website":         { bg:"#F1EFE8", color:"#555" },
};

const officeC = {
  "Isle of Man":    { bg:"#E6F7FB", color:"#0077A8" },
  "Malta":          { bg:"#EEF0FB", color:"#3C3489" },
  "Cayman Islands": { bg:"#E6EEF7", color:"#0D4A7A" },
  "Cyprus":         { bg:"#F3E5F5", color:"#6A1B9A" },
  "USA":            { bg:"#FBEAF0", color:"#72243E" },
  "United Kingdom": { bg:"#EAF3DE", color:"#27500A" },
  "Gaming Gateway": { bg:"#FAEEDA", color:"#633806" },
  "Nav":            { bg:"#F1EFE8", color:"#555" },
};

const riskC = {
  "Low":       { bg:"#EAF3DE", color:"#27500A" },
  "Medium":    { bg:"#FAEEDA", color:"#633806" },
  "High":      { bg:"#FCEBEB", color:"#A32D2D" },
  "Very High": { bg:"#F7C1C1", color:"#501313" },
};

const PROSPECTS = [
  { id:1, firstName:"James", lastName:"Harrington", company:"Caledonian Futures Ltd", type:"Company", jur:"Cayman Islands", office:"Cayman Islands", source:"Referral", stage:"Fees Paid", bd:"Garry Crossan", annualFee:18000, setupFee:2500, adminFee:500, conversionDate:"01/08/2025", risk:"Medium", website:"calefutures.com", address:"PO Box 1234, George Town, Cayman Islands", notes:"Ready to convert. LOE signed.", services:["Company administration","Registered office","Director services"] },
  { id:2, firstName:"William", lastName:"Westbridge", company:"Westbridge Holdings Trust", type:"Trust", jur:"Isle of Man", office:"Isle of Man", source:"Existing client", stage:"KYC Arriving", bd:"Andy Morgan", annualFee:24000, setupFee:3000, adminFee:600, conversionDate:"15/08/2025", risk:"High", website:"", address:"14 Athol Street, Douglas, Isle of Man", notes:"EDD required before acceptance.", services:["Trust administration","Compliance support"] },
  { id:3, firstName:"Marco", lastName:"Verano", company:"Verano Maritime SA", type:"Yachting", jur:"Malta", office:"Malta", source:"Trade show", stage:"Proposal Sent", bd:"Joanne Fenech", annualFee:12000, setupFee:1500, adminFee:300, conversionDate:"30/09/2025", risk:"Low", website:"veranomaritime.com", address:"Level 3, Quantum House, Malta", notes:"Met at Monaco Yacht Show.", services:["Yachting administration","VAT registration"] },
  { id:4, firstName:"David", lastName:"Silver", company:"Silverstone Capital Fund", type:"Fund", jur:"Cayman Islands", office:"Cayman Islands", source:"Cold outreach", stage:"Initial Call", bd:"Garry Crossan", annualFee:45000, setupFee:5000, adminFee:1000, conversionDate:"31/12/2025", risk:"Medium", website:"silverstonecap.com", address:"Harbour Place, George Town", notes:"Awaiting business plan.", services:["Fund administration","FATCA/CRS"] },
  { id:5, firstName:"Sofia", lastName:"Adriatic", company:"Adriatic Holdings Ltd", type:"Company", jur:"Malta", office:"Malta", source:"Referral", stage:"Initial Call", bd:"Joanne Fenech", annualFee:9500, setupFee:1200, adminFee:250, conversionDate:"30/10/2025", risk:"Low", website:"", address:"Valletta, Malta", notes:"Referred by Meridian Holdings.", services:["Company administration","Bookkeeping"] },
  { id:6, firstName:"Tom", lastName:"Phoenix", company:"Phoenix eGaming Ltd", type:"B2C", jur:"Isle of Man", office:"Gaming Gateway", source:"Website", stage:"KYC Approved", bd:"Roxy Sheeley", annualFee:32000, setupFee:4000, adminFee:800, conversionDate:"01/09/2025", risk:"High", website:"phoenixegaming.io", address:"Douglas, Isle of Man", notes:"B2C licence application. Two-strand process.", services:["eGaming onboarding","GSC licence","Company admin"] },
  { id:7, firstName:"Chen", lastName:"Riviera", company:"Riviera Trust", type:"Trust", jur:"Cayman Islands", office:"Cayman Islands", source:"Referral", stage:"Fees Paid", bd:"Garry Crossan", annualFee:28000, setupFee:3500, adminFee:700, conversionDate:"01/07/2025", risk:"Medium", website:"", address:"George Town, Cayman Islands", notes:"Converted. Onboarding in progress.", services:["Trust administration","Compliance","FATCA/CRS"] },
];

const INTERACTIONS = {
  1:[
    { id:1, date:"10/07/2025", type:"Call",    by:"Garry Crossan", note:"Fees confirmed. Ready to proceed.", next:"Send onboarding pack" },
    { id:2, date:"20/06/2025", type:"Meeting", by:"Garry Crossan", note:"In-person George Town. Structure agreed.", next:"Draft LOE" },
  ],
  2:[
    { id:1, date:"12/07/2025", type:"Email",   by:"Andy Morgan",   note:"EDD pack sent. Awaiting response.", next:"Chase EDD docs" },
  ],
  6:[
    { id:1, date:"14/07/2025", type:"Call",    by:"Roxy Sheeley",  note:"KYC approved. Moving to fees.", next:"Send fee invoice" },
  ],
};

const PIPELINE_STAGES = ["Initial Call","Proposal Sent","Proposal Accepted","KYC Arriving","KYC Approved","Fees Paid"];
const VIEWS = ["pipeline","performance","convert"];
const VIEWS_ALL = ["pipeline","prospects","interactions","performance","convert"]; // internal (prospects kept for detail panel)
const VLBLS = ["Pipeline","Performance","Convert"];
const fmt = n => "£"+Number(n||0).toLocaleString();

// Calculate prorated fee based on conversion date
const prorateFee = (annual, convDate) => {
  if (!convDate) return 0;
  const parts = convDate.split("/");
  if (parts.length !== 3) return annual;
  const month = parseInt(parts[1]);
  const remainingMonths = 13 - month;
  return Math.round((annual / 12) * remainingMonths);
};

function Input({ label, value, onChange, type="text", options, placeholder="" }) {
  const s = { width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none", boxSizing:"border-box", fontFamily:"inherit" };
  return (
    <div style={{ marginBottom:12 }}>
      <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#555", marginBottom:4 }}>{label}</label>
      {options ? <select value={value} onChange={e=>onChange(e.target.value)} style={s}>{options.map(o=><option key={o}>{o}</option>)}</select>
               : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={s} />}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100 }} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:"#fff",borderRadius:12,padding:24,width:540,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
          <h3 style={{ margin:0,fontSize:16,fontWeight:600 }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AffinityCRM() {
  const [view,setView]   = useState("pipeline");
  const [sel,setSel]     = useState(null);
  const [modal,setModal] = useState(null);
  const [sF,setSF]       = useState("");
  const [oF,setOF]       = useState("");
  const [srch,setSrch]   = useState("");
  const [form,setForm]   = useState({});
  const [prospects,setProspects] = useState(PROSPECTS);

  useEffect(()=>{
    if(!isConfigured) return;
    let ok=true;
    crmProspects().then(({data})=>{
      if(ok && data && data.length){
        setProspects(data.map(p=>({ id:p.id, firstName:p.first_name, lastName:p.last_name, company:p.company,
          type:p.type, jur:p.jur, office:p.office, source:p.source, stage:p.stage, bd:p.bd,
          annualFee:Number(p.annual_fee||0), setupFee:Number(p.setup_fee||0), adminFee:Number(p.admin_fee||0),
          conversionDate:p.conversion_date, risk:p.risk, website:p.website, address:p.address, notes:p.notes,
          services:p.services||[] })));
      }
    }).catch(()=>{});
    return ()=>{ok=false;};
  },[]);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [proposalForm, setProposalForm] = useState({ country:"Isle of Man", sector:"Holding company", annualFee:10000, setupFee:2500, adminFee:500 });
  const [proposalOutput, setProposalOutput] = useState(null);

  const SECTOR_STRUCTURE = {
    "Holding company":"Private Limited Company",
    "Trust / estate":"Discretionary Trust",
    "Fund":"Segregated Portfolio Company",
    "Family office":"Private Trust Company with underlying Trust",
    "Yachting":"Yacht-owning SPV",
    "Aviation":"Aircraft-owning SPV",
    "eGaming":"Licensed Gaming Company",
    "Fintech":"Regulated Fintech Vehicle",
    "Real estate":"Property Holding Company",
    "Trading":"International Trading Company",
    "IP holding":"IP Holding Company",
  };
  const COUNTRY_NOTES = {
    "Isle of Man":"a stable Crown Dependency with 0% corporate tax for most activities, recognised internationally for its regulatory rigour and political neutrality",
    "Malta":"a respected EU jurisdiction offering full passporting rights, an attractive refundable tax credit system, and a deep network of double-tax treaties",
    "Cayman Islands":"the leading offshore jurisdiction for funds and tax-neutral holding vehicles, with no direct taxation and a sophisticated services industry",
    "Cyprus":"a full EU member with one of the lowest corporate tax rates in Europe (12.5%), an IP-box regime, and over 65 double-tax treaties",
    "USA":"unparalleled market access, robust legal protections and operational flexibility for international groups doing business in the Americas",
    "United Kingdom":"the global benchmark for rule of law, professional services and access to capital markets, with a wide treaty network",
    "Gaming Gateway":"our specialist eGaming services hub, offering jurisdictional flexibility and licensing support for online gaming operators",
    "Nav":"our dedicated maritime and superyacht services arm, structured to support flag-state registration and ownership vehicles",
  };
  const generateProposal = () => {
    const sp_ = prospects.find(p=>p.id===sel); if(!sp_) return;
    const { country, sector, annualFee, setupFee, adminFee } = proposalForm;
    const structure = SECTOR_STRUCTURE[sector] || "appropriate corporate vehicle";
    const note = COUNTRY_NOTES[country] || "a well-regulated jurisdiction";
    const today = new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
    const total1 = Number(setupFee) + Number(annualFee) + Number(adminFee);
    const total2 = Number(annualFee) + Number(adminFee);
    const fmt = (n) => "£" + Number(n).toLocaleString();
    setProposalOutput(
`AFFINITY GROUP
PROPOSAL FOR ${sp_.company.toUpperCase()}

Date: ${today}
Prepared for: ${sp_.firstName} ${sp_.lastName}, ${sp_.company}
Jurisdiction: ${country}
Sector: ${sector}

————————————————————————————————

EXECUTIVE SUMMARY

Affinity is pleased to present this proposal for the establishment and ongoing administration of a ${structure} in ${country}, structured to support your ${sector.toLowerCase()} activities.

${country} is ${note}.

————————————————————————————————

PROPOSED STRUCTURE

We recommend establishing a ${structure} in ${country}. This vehicle provides:

  • Clear separation of liability and operational ring-fencing
  • Tax-efficient profit extraction within applicable rules
  • Recognised counterparty status for banking, broker and investor relations
  • Regulatory comfort and a transparent compliance position

————————————————————————————————

SERVICES INCLUDED

Our annual service package covers:

  • Registered office and registered agent
  • Company secretarial and statutory filings
  • Director services (where required) and meeting administration
  • AML/KYC ongoing monitoring and periodic review
  • Bookkeeping and management account preparation
  • Dedicated client manager and quarterly review calls

————————————————————————————————

FEE SCHEDULE

Set-up fee (one-time)         ${fmt(setupFee).padStart(12)}
Annual administration         ${fmt(annualFee).padStart(12)}
Compliance & KYC (annual)     ${fmt(adminFee).padStart(12)}
                              ————————————
Total year 1                  ${fmt(total1).padStart(12)}
Total year 2 onwards          ${fmt(total2).padStart(12)}

All fees in GBP, exclusive of VAT and third-party disbursements (filing fees, agent fees, statutory levies). Fees are reviewed annually.

————————————————————————————————

NEXT STEPS

  1. Sign and return this proposal
  2. Provide initial KYC documentation
  3. Onboarding completed within 5–10 business days
  4. Receive incorporation pack and operational handover

————————————————————————————————

Your business development lead is ${sp_.bd}.
For questions, contact business.development@affinityco.com.

Affinity Group — Corporate and Trust Services
Isle of Man · Malta · Cayman Islands · Cyprus · USA · United Kingdom`
    );
  };


  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };

  const pipeline = prospects.filter(p=>!["Declined","Withdrawn"].includes(p.stage));
  const totalVal = pipeline.reduce((s,p)=>s+p.annualFee,0);

  const filtered = useMemo(()=>prospects.filter(p=>
    (!sF||p.stage===sF)&&(!oF||p.office===oF)&&
    (!srch||`${p.firstName} ${p.lastName} ${p.company}`.toLowerCase().includes(srch.toLowerCase()))
  ),[prospects,sF,oF,srch]);

  const sp = prospects.find(p=>p.id===sel);
  const si = sel?(INTERACTIONS[sel]||[]):[];

  const saveProspect = () => {
    if (modal==="add") {
      setProspects(prev=>[...prev,{...form,id:Date.now(),annualFee:Number(form.annualFee||0),setupFee:Number(form.setupFee||0),adminFee:Number(form.adminFee||0)}]);
    } else {
      setProspects(prev=>prev.map(p=>p.id===form.id?{...form,annualFee:Number(form.annualFee||0),setupFee:Number(form.setupFee||0),adminFee:Number(form.adminFee||0)}:p));
    }
    setModal(null);
  };

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"#f8f9fc", color:"#111", minHeight:"100vh" }}>
      <div style={{ background:NAVY, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          
          <span style={{ color:"#8892b0", fontSize:13 }}>CRM & Business Development</span>
        </div>
        <button style={{ ...nba, background:"#4CAF7D", borderColor:"#4CAF7D" }} onClick={()=>{ setForm({stage:"Initial Call",type:"Company",office:"Isle of Man",source:"Referral",risk:"Medium"}); setModal("add"); }}>＋ Add prospect</button>
      </div>

      <div style={{ background:"#fff", borderBottom:"0.5px solid #e5e5e5", padding:"0 24px", display:"flex", gap:2 }}>
        {VIEWS.map((v,i)=><button key={v} onClick={()=>setView(v)} style={{ padding:"10px 14px", fontSize:12, border:"none", borderBottom:`2px solid ${view===v?CY:"transparent"}`, background:"transparent", color:view===v?CY:"#666", cursor:"pointer", fontWeight:view===v?600:400 }}>{VLBLS[i]}</button>)}
      </div>

      <div style={{ background:"#fff", minHeight:"calc(100vh - 89px)" }}>

        {/* PIPELINE */}
        {view==="pipeline"&&(
          <div style={{ padding:isMobile?"12px 12px 60px":"16px 20px" }}>
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)", gap:10, marginBottom:16 }}>
              {[{l:"Active prospects",v:pipeline.length,c:CY},{l:"Total annual value",v:fmt(totalVal)+"/yr",c:"#111"},{l:"Fees paid",v:prospects.filter(p=>p.stage==="Fees Paid").length,c:"#4CAF7D"},{l:"KYC in progress",v:prospects.filter(p=>["KYC Arriving","KYC Approved"].includes(p.stage)).length,c:"#F59E0B"}].map(k=>(
                <div key={k.l} style={{ background:"#f9f9f9", borderRadius:8, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:"#666", marginBottom:4 }}>{k.l}</div>
                  <div style={{ fontSize:isMobile?16:20, fontWeight:700, color:k.c }}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* Spreadsheet-style prospect table */}
            <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:8, overflow:"hidden" }}>
              <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #e5e5e5", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                <div style={{ fontSize:12, fontWeight:600, color:NAVY }}>All prospects ({prospects.length})</div>
                <div style={{ fontSize:10, color:"#888" }}>Click any row to open</div>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, minWidth:isMobile?640:0 }}>
                  <thead>
                    <tr style={{ background:"#fafafa", borderBottom:"0.5px solid #e5e5e5" }}>
                      {["Company","Contact","Type","Office","Stage","Annual fee","Pro-rata to YE","BD lead","Last interaction"].map(h=>(
                        <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prospects.slice().sort((a,b)=>PIPELINE_STAGES.indexOf(a.stage)-PIPELINE_STAGES.indexOf(b.stage)).map(p=>{
                      const ints = INTERACTIONS[p.id]||[];
                      const last = ints[0];
                      const stageColor = PIPELINE_STAGES.indexOf(p.stage)>=4 ? "#4CAF7D" : PIPELINE_STAGES.indexOf(p.stage)>=2 ? "#F59E0B" : CY;
                      // Pro-rata to end of year — based on conversion date (DD/MM/YYYY) if set,
                      // otherwise treat as a full-year fee already.
                      let proRata = p.annualFee;
                      if (p.conversionDate) {
                        const parts = p.conversionDate.split("/");
                        if (parts.length === 3) {
                          const convDate = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
                          const yearEnd = new Date(convDate.getFullYear(), 11, 31);
                          const daysLeft = Math.max(0, Math.ceil((yearEnd - convDate) / (1000*60*60*24)));
                          proRata = Math.round(p.annualFee * (daysLeft / 365));
                        }
                      } else {
                        // No conversion date — assume today + assume rest of this year
                        const today = new Date();
                        const yearEnd = new Date(today.getFullYear(), 11, 31);
                        const daysLeft = Math.max(0, Math.ceil((yearEnd - today) / (1000*60*60*24)));
                        proRata = Math.round(p.annualFee * (daysLeft / 365));
                      }
                      return (
                        <tr key={p.id} onClick={()=>{ setSel(p.id); setView("prospects"); }}
                          style={{ borderBottom:"0.5px solid #f0f0f0", cursor:"pointer" }}
                          onMouseEnter={e=>e.currentTarget.style.background="#f9fbfc"}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <td style={{ padding:"10px", fontWeight:600 }}>{p.company}</td>
                          <td style={{ padding:"10px", color:"#666" }}>{p.firstName} {p.lastName}</td>
                          <td style={{ padding:"10px", color:"#666", whiteSpace:"nowrap" }}>{p.type||"—"}</td>
                          <td style={{ padding:"10px", whiteSpace:"nowrap" }}>
                            <Badge label={p.office.split(" ")[0]} colors={officeC[p.office]||{bg:"#eee",color:"#666"}}/>
                          </td>
                          <td style={{ padding:"10px", whiteSpace:"nowrap" }}>
                            <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:stageColor, marginRight:6, verticalAlign:"middle" }} />
                            <span style={{ fontSize:11, color:"#333" }}>{p.stage}</span>
                          </td>
                          <td style={{ padding:"10px", fontWeight:600, color:"#4CAF7D", whiteSpace:"nowrap" }}>{fmt(p.annualFee)}</td>
                          <td style={{ padding:"10px", color:"#666", whiteSpace:"nowrap" }} title="Pro-rated to 31 Dec">{fmt(proRata)}</td>
                          <td style={{ padding:"10px", color:"#666", whiteSpace:"nowrap" }}>{p.bd}</td>
                          <td style={{ padding:"10px", color:"#666", maxWidth:240 }}>
                            {last?<div>
                              <div style={{ fontSize:10, color:"#999" }}>{last.date} · {last.type} · {last.by}</div>
                              <div style={{ fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{last.note}</div>
                            </div>:<span style={{ color:"#bbb" }}>No interactions yet</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding:"10px 14px", borderTop:"0.5px solid #e5e5e5", fontSize:10, color:"#888" }}>
                Showing {prospects.length} prospects, sorted by stage.
              </div>
            </div>
          </div>
        )}

        {/* PROSPECTS */}
        {view==="prospects"&&(
          <div style={{ display:"flex", height:"calc(100vh - 120px)" }}>
            <div style={{ width:isMobile?(sp?0:"100%"):320, display:(isMobile&&sp)?"none":"flex", borderRight:"0.5px solid #e5e5e5", flexDirection:"column", flexShrink:0 }}>
              <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #e5e5e5" }}>
                <input placeholder="Search by name or company…" value={srch} onChange={e=>setSrch(e.target.value)}
                  style={{ width:"100%", height:30, padding:"0 10px", border:"0.5px solid #e5e5e5", borderRadius:5, fontSize:11, outline:"none", boxSizing:"border-box" }} />
                <div style={{ display:"flex", gap:6, marginTop:6 }}>
                  <select value={sF} onChange={e=>setSF(e.target.value)} style={{ flex:1, height:28, padding:"0 6px", border:"0.5px solid #e5e5e5", borderRadius:4, fontSize:10 }}>
                    <option value="">All stages</option>{STAGES.map(s=><option key={s}>{s}</option>)}
                  </select>
                  <select value={oF} onChange={e=>setOF(e.target.value)} style={{ flex:1, height:28, padding:"0 6px", border:"0.5px solid #e5e5e5", borderRadius:4, fontSize:10 }}>
                    <option value="">All offices</option>{OFFICES.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ flex:1, overflowY:"auto" }}>
                {filtered.map(p=>(
                  <div key={p.id} onClick={()=>setSel(p.id)} style={{ padding:"12px 14px", borderBottom:"0.5px solid #f0f0f0", cursor:"pointer", background:sel===p.id?"#f0f8fb":"transparent", borderLeft:`3px solid ${sel===p.id?CY:"transparent"}` }}>
                    <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{p.company}</div>
                    <div style={{ fontSize:11, color:"#666", marginBottom:4 }}>{p.firstName} {p.lastName}</div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      <Badge label={p.stage} colors={STAGE_COLORS[p.stage]} />
                      <Badge label={p.office.split(" ")[0]} colors={officeC[p.office]||{bg:"#eee",color:"#666"}} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding:"8px 14px", borderTop:"0.5px solid #e5e5e5", fontSize:10, color:"#aaa" }}>{filtered.length} prospects</div>
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:isMobile?"12px 16px":"20px 24px", display:(isMobile&&!sp)?"none":"block" }}>
              {!sp ? <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#bbb", fontSize:13 }}>Select a prospect</div> : (
                <>
                  {isMobile&&<button onClick={()=>setSel(null)} style={{ marginBottom:12, padding:"6px 10px", border:"0.5px solid #ddd", background:"#fff", borderRadius:6, fontSize:11, cursor:"pointer", color:"#666" }}>← Back to list</button>}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                    <div>
                      <h2 style={{ margin:"0 0 4px", fontSize:20, fontWeight:700 }}>{sp.company}</h2>
                      <div style={{ fontSize:13, color:"#666", marginBottom:8 }}>{sp.firstName} {sp.lastName}{sp.website&&<> · <a href={`https://${sp.website}`} target="_blank" rel="noreferrer" style={{ color:CY }}>{sp.website}</a></>}</div>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        <Badge label={sp.stage} colors={STAGE_COLORS[sp.stage]} />
                        <Badge label={sp.type} colors={{ bg:"#f0f0f0", color:"#555" }} />
                        <Badge label={sp.office} colors={officeC[sp.office]||{bg:"#eee",color:"#666"}} />
                        <Badge label={sp.risk+" risk"} colors={riskC[sp.risk]||{bg:"#eee",color:"#666"}} />
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {["Fees Paid","KYC Approved"].includes(sp.stage)&&<button style={{ ...nba, background:"#4CAF7D", borderColor:"#4CAF7D" }} onClick={()=>setView("convert")}>Convert ↗</button>}
                      <button style={{ ...nba }} onClick={()=>{ setProposalForm({ country:sp.jur||"Isle of Man", sector:"Holding company", annualFee:sp.annualFee||10000, setupFee:sp.setupFee||2500, adminFee:sp.adminFee||500 }); setProposalOutput(null); setModal("proposal"); }}>📄 Proposal</button>
                      <button style={nb} onClick={()=>setModal("interaction")}>＋ Log</button>
                      <button style={nb} onClick={()=>{ setForm({...sp}); setModal("edit"); }}>Edit</button>
                    </div>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
                    {/* Contact */}
                    <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>Contact</div>
                      {[["Name",`${sp.firstName} ${sp.lastName}`],["Address",sp.address],["Website",sp.website||"—"],["BD lead",sp.bd],["Source",sp.source]].map(([k,v])=>(
                        <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:11 }}>
                          <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:500, textAlign:"right", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Fees */}
                    <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>Fees</div>
                      {[
                        ["Annual fee", fmt(sp.annualFee)+"/yr"],
                        ["Setup fee",  fmt(sp.setupFee)+" (one-off)"],
                        ["Admin fee",  fmt(sp.adminFee)+"/mo"],
                        ["Conv. date", sp.conversionDate||"TBC"],
                        ["Prorated",   fmt(prorateFee(sp.annualFee, sp.conversionDate))+" est."],
                      ].map(([k,v])=>(
                        <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:11 }}>
                          <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600, color:k==="Annual fee"||k==="Prorated"?"#4CAF7D":"#111" }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Services & notes */}
                    <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>Services</div>
                      {(sp.services||[]).map(s=><div key={s} style={{ padding:"4px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:11, display:"flex", gap:6 }}><span style={{ color:CY }}>✓</span><span>{s}</span></div>)}
                      <div style={{ marginTop:10, fontSize:11, color:"#444", lineHeight:1.5 }}>{sp.notes}</div>
                    </div>
                  </div>

                  {/* Interactions */}
                  <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888" }}>Interactions</div>
                      <button style={{ ...nb, fontSize:10 }} onClick={()=>setModal("interaction")}>＋ Log</button>
                    </div>
                    {si.length===0 ? <div style={{ fontSize:12, color:"#bbb" }}>No interactions recorded.</div> : si.map(i=>(
                      <div key={i.id} style={{ padding:"8px 0", borderBottom:"0.5px solid #f5f5f5" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                            <Badge label={i.type} colors={{ Call:{bg:"#E6F7FB",color:"#0077A8"},Email:{bg:"#EAF3DE",color:"#27500A"},Meeting:{bg:"#EEF0FB",color:"#3C3489"} }[i.type]||{bg:"#eee",color:"#666"}} />
                            <span style={{ fontSize:11, fontWeight:500 }}>{i.by}</span>
                          </div>
                          <span style={{ fontSize:10, color:"#aaa" }}>{i.date}</span>
                        </div>
                        <div style={{ fontSize:12, color:"#444", lineHeight:1.5 }}>{i.note}</div>
                        {i.next&&<div style={{ fontSize:11, color:CY, marginTop:3 }}>→ {i.next}</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* INTERACTIONS */}
        {view==="interactions"&&(
          <div style={{ padding:"16px 20px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:500 }}>All interactions</div>
              <button style={nba} onClick={()=>setModal("interaction")}>＋ Log interaction</button>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#f9f9f9" }}>
                {["Date","Type","Prospect","BD","Note","Next action"].map(h=><th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {Object.entries(INTERACTIONS).flatMap(([pid,ints])=>ints.map(i=>({...i,pr:prospects.find(p=>p.id===parseInt(pid))}))).sort((a,b)=>b.date.split("/").reverse().join("").localeCompare(a.date.split("/").reverse().join(""))).map((i,idx)=>(
                  <tr key={idx} style={{ borderBottom:"0.5px solid #f0f0f0" }}>
                    <td style={{ padding:"8px 12px", fontSize:11, color:"#666" }}>{i.date}</td>
                    <td style={{ padding:"8px 12px" }}><Badge label={i.type} colors={{ Call:{bg:"#E6F7FB",color:"#0077A8"},Email:{bg:"#EAF3DE",color:"#27500A"},Meeting:{bg:"#EEF0FB",color:"#3C3489"} }[i.type]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ padding:"8px 12px", fontSize:11, fontWeight:500, color:CY, cursor:"pointer" }} onClick={()=>{ setSel(i.pr?.id); setView("prospects"); }}>{i.pr?.company}</td>
                    <td style={{ padding:"8px 12px", fontSize:11, color:"#666" }}>{i.by}</td>
                    <td style={{ padding:"8px 12px", fontSize:11, color:"#444", maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{i.note}</td>
                    <td style={{ padding:"8px 12px", fontSize:11, color:CY }}>{i.next}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PERFORMANCE */}
        {view==="performance"&&(
          <div style={{ padding:"16px 20px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>Pipeline by office</div>
                {OFFICES.map(o=>{
                  const inOffice = prospects.filter(p=>p.office===o&&!["Declined","Withdrawn"].includes(p.stage));
                  if (inOffice.length===0) return null;
                  return (
                    <div key={o} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"0.5px solid #f5f5f5" }}>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <Badge label={o} colors={officeC[o]||{bg:"#eee",color:"#666"}} />
                        <span style={{ fontSize:11, color:"#aaa" }}>{inOffice.length}</span>
                      </div>
                      <span style={{ fontSize:12, fontWeight:600, color:"#4CAF7D" }}>{fmt(inOffice.reduce((s,p)=>s+p.annualFee,0))}/yr</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>Stage funnel</div>
                {PIPELINE_STAGES.map(stage=>{
                  const count = prospects.filter(p=>p.stage===stage).length;
                  const pct = Math.round((count/prospects.length)*100);
                  return (
                    <div key={stage} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <div style={{ width:140, fontSize:11, color:"#444", flexShrink:0 }}>{stage}</div>
                      <div style={{ flex:1, background:"#f0f0f0", borderRadius:4, height:12 }}>
                        <div style={{ width:`${pct}%`, background:CY, height:"100%", borderRadius:4 }} />
                      </div>
                      <div style={{ width:20, fontSize:11, fontWeight:600, color:CY, textAlign:"right" }}>{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CONVERT */}
        {view==="convert"&&(
          <div style={{ padding:"16px 20px" }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Convert prospect → onboarding</div>
            <div style={{ fontSize:11, color:"#666", marginBottom:16 }}>All CRM data flows into the onboarding record. No re-entry required.</div>
            {prospects.filter(p=>["Fees Paid","KYC Approved"].includes(p.stage)).map(p=>(
              <div key={p.id} style={{ background:"#fff", border:`0.5px solid ${p.stage==="Fees Paid"?"#4CAF7D":"#e5e5e5"}`, borderRadius:10, padding:14, marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{p.company}</div>
                  <div style={{ fontSize:11, color:"#666", marginTop:2 }}>{p.firstName} {p.lastName} · {p.office} · Annual: {fmt(p.annualFee)} · Setup: {fmt(p.setupFee)} · Prorated: {fmt(prorateFee(p.annualFee,p.conversionDate))}</div>
                  <div style={{ display:"flex", gap:6, marginTop:6 }}>
                    <Badge label={p.stage} colors={STAGE_COLORS[p.stage]} />
                    <Badge label={p.risk+" risk"} colors={riskC[p.risk]||{bg:"#eee",color:"#666"}} />
                  </div>
                </div>
                <button style={nba} onClick={()=>setModal("convert")}>Convert ↗</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADD / EDIT MODAL */}
      {(modal==="add"||modal==="edit")&&(
        <Modal title={modal==="add"?"Add prospect":"Edit prospect"} onClose={()=>setModal(null)}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 12px" }}>
            <Input label="First name" value={form.firstName||""} onChange={v=>setForm(p=>({...p,firstName:v}))} />
            <Input label="Last name"  value={form.lastName||""}  onChange={v=>setForm(p=>({...p,lastName:v}))} />
          </div>
          <Input label="Company / entity name" value={form.company||""} onChange={v=>setForm(p=>({...p,company:v}))} />
          <Input label="Address" value={form.address||""} onChange={v=>setForm(p=>({...p,address:v}))} />
          <Input label="Website" value={form.website||""} onChange={v=>setForm(p=>({...p,website:v}))} placeholder="e.g. example.com" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 12px" }}>
            <Input label="Type" value={form.type||"Company"} onChange={v=>setForm(p=>({...p,type:v}))} options={TYPES} />
            <Input label="Status" value={form.stage||"Initial Call"} onChange={v=>setForm(p=>({...p,stage:v}))} options={STAGES} />
            <Input label="Office" value={form.office||"Isle of Man"} onChange={v=>setForm(p=>({...p,office:v}))} options={OFFICES} />
            <Input label="Source" value={form.source||"Referral"} onChange={v=>setForm(p=>({...p,source:v}))} options={["Referral","Cold outreach","Trade show","Existing client","Website","Other"]} />
            <Input label="BD lead" value={form.bd||""} onChange={v=>setForm(p=>({...p,bd:v}))} options={["Andy Morgan","Roxy Sheeley","Garry Crossan","Joanne Fenech","Neil Kelly"]} />
            <Input label="Risk" value={form.risk||"Medium"} onChange={v=>setForm(p=>({...p,risk:v}))} options={["Low","Medium","High","Very High"]} />
          </div>
          <div style={{ fontSize:11, fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:"0.4px", margin:"8px 0 6px" }}>Fees</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"0 12px" }}>
            <Input label="Annual fee (£)" value={form.annualFee||""} onChange={v=>setForm(p=>({...p,annualFee:v}))} type="number" />
            <Input label="Setup fee (£)"  value={form.setupFee||""}  onChange={v=>setForm(p=>({...p,setupFee:v}))}  type="number" />
            <Input label="Admin fee (£/mo)" value={form.adminFee||""} onChange={v=>setForm(p=>({...p,adminFee:v}))} type="number" />
          </div>
          <Input label="Expected conversion date" value={form.conversionDate||""} onChange={v=>setForm(p=>({...p,conversionDate:v}))} placeholder="DD/MM/YYYY" />
          <Input label="Notes" value={form.notes||""} onChange={v=>setForm(p=>({...p,notes:v}))} />
          <button onClick={saveProspect} style={{ width:"100%", background:CY, color:"#fff", border:"none", borderRadius:8, padding:10, fontSize:14, fontWeight:600, cursor:"pointer" }}>Save</button>
        </Modal>
      )}

      {modal==="proposal"&&sp&&(
        <Modal title={proposalOutput?"Proposal — preview":"Generate proposal"} onClose={()=>{setModal(null);setProposalOutput(null);}}>
          {!proposalOutput?(
            <>
              <div style={{ fontSize:11, color:"#666", marginBottom:12 }}>
                Select the structure parameters and fee schedule for {sp.company}. The proposal will be auto-generated.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:"#888", marginBottom:4 }}>Country / jurisdiction</div>
                  <select value={proposalForm.country} onChange={e=>setProposalForm(f=>({...f,country:e.target.value}))} style={{ width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:12 }}>
                    {OFFICES.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:"#888", marginBottom:4 }}>Sector</div>
                  <select value={proposalForm.sector} onChange={e=>setProposalForm(f=>({...f,sector:e.target.value}))} style={{ width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:12 }}>
                    {Object.keys(SECTOR_STRUCTURE).map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
                {[["Annual fee","annualFee"],["Set-up fee","setupFee"],["Compliance fee","adminFee"]].map(([lbl,key])=>(
                  <div key={key}>
                    <div style={{ fontSize:10, fontWeight:600, color:"#888", marginBottom:4 }}>{lbl} (£)</div>
                    <input type="number" value={proposalForm[key]} onChange={e=>setProposalForm(f=>({...f,[key]:e.target.value}))} style={{ width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:12 }} />
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:"0.5px solid #e5e5e5", paddingTop:12 }}>
                <button onClick={()=>setModal(null)} style={{ padding:"8px 14px", border:"0.5px solid #ddd", borderRadius:6, background:"#fff", fontSize:12, cursor:"pointer" }}>Cancel</button>
                <button onClick={generateProposal} style={{ padding:"8px 16px", border:"none", borderRadius:6, background:CY, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>Generate ↗</button>
              </div>
            </>
          ):(
            <>
              <div style={{ background:"#FAFAFA", border:"0.5px solid #e5e5e5", borderRadius:6, padding:14, maxHeight:"50vh", overflowY:"auto", fontFamily:"ui-monospace, Menlo, monospace", fontSize:11, lineHeight:1.55, whiteSpace:"pre-wrap", color:"#222" }}>
                {proposalOutput}
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"space-between", borderTop:"0.5px solid #e5e5e5", paddingTop:12, marginTop:12 }}>
                <button onClick={()=>setProposalOutput(null)} style={{ padding:"8px 14px", border:"0.5px solid #ddd", borderRadius:6, background:"#fff", fontSize:12, cursor:"pointer" }}>← Edit inputs</button>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>{navigator.clipboard?.writeText(proposalOutput); alert("Proposal copied to clipboard");}} style={{ padding:"8px 14px", border:"0.5px solid #ddd", borderRadius:6, background:"#fff", fontSize:12, cursor:"pointer" }}>Copy</button>
                  <button onClick={()=>{const blob=new Blob([proposalOutput],{type:"text/plain"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`Proposal-${sp.company.replace(/[^a-z0-9]+/gi,"-")}.txt`; a.click(); URL.revokeObjectURL(url);}} style={{ padding:"8px 16px", border:"none", borderRadius:6, background:CY, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>Download</button>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}

      {modal==="interaction"&&(
        <Modal title="Log interaction" onClose={()=>setModal(null)}>
          <Input label="Prospect" value={form.prospect||sp?.company||""} onChange={v=>setForm(p=>({...p,prospect:v}))} options={prospects.map(p=>p.company)} />
          <Input label="Type" value={form.type||"Call"} onChange={v=>setForm(p=>({...p,type:v}))} options={["Call","Email","Meeting","Note"]} />
          <Input label="Date" value={form.date||""} onChange={v=>setForm(p=>({...p,date:v}))} type="date" />
          <Input label="Summary" value={form.note||""} onChange={v=>setForm(p=>({...p,note:v}))} />
          <Input label="Next action" value={form.next||""} onChange={v=>setForm(p=>({...p,next:v}))} />
          <button onClick={()=>setModal(null)} style={{ width:"100%", background:CY, color:"#fff", border:"none", borderRadius:8, padding:10, fontSize:14, fontWeight:600, cursor:"pointer" }}>Save</button>
        </Modal>
      )}

      {modal==="convert"&&(
        <Modal title="Convert to onboarding" onClose={()=>setModal(null)}>
          <div style={{ background:"#EAF3DE22", border:"0.5px solid #4CAF7D", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#27500A" }}>✓ All CRM data will be pre-populated automatically.</div>
          <Input label="Assign administrator" value={form.admin||"Roxy Sheeley"} onChange={v=>setForm(p=>({...p,admin:v}))} options={["Roxy Sheeley","Garry Crossan","Joanne Fenech","Neil Kelly","Andy Morgan"]} />
          <Input label="Target completion date" value={form.target||""} onChange={v=>setForm(p=>({...p,target:v}))} type="date" />
          <button onClick={()=>setModal(null)} style={{ width:"100%", background:"#4CAF7D", color:"#fff", border:"none", borderRadius:8, padding:10, fontSize:14, fontWeight:600, cursor:"pointer" }}>Convert & create onboarding case ↗</button>
        </Modal>
      )}
    </div>
  );
}
