import { useState } from "react";
import EntitySearch from "./affinity_entity_search";
const CY = "#00C4CC";
const NAVY = "#001242";

const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);

const ENTITIES = [
  "Meridian Holdings Ltd","Harrington Family Trust","Caledonian Ventures Ltd","Azure Mediterranean Fdn",
  "Pacific Wealth Trust","Stonebridge Capital Ltd","North Star Holdings Ltd","Rosewood Legacy Trust","Apex Growth Fund Ltd",
];

// Full document library per brief
const DOCUMENT_LIBRARY = {
  Onboarding: [
    { id:"ob1",  title:"New business questionnaire — company",             desc:"Pre-onboarding data capture form for corporate entities.",                        fields:["Entity name","Jurisdiction","Proposed director(s)","Proposed shareholder(s)","Principal activity","Source of wealth"] },
    { id:"ob2",  title:"New business questionnaire — trust",               desc:"Pre-onboarding data capture for trust structures.",                               fields:["Trust name","Settlor","Trustee","Beneficiaries","Purpose","Source of wealth"] },
    { id:"ob3",  title:"KYC request letter — individual",                  desc:"Letter to client requesting personal KYC documents.",                            fields:["Addressee name","Entity name","Documents required","Deadline"] },
    { id:"ob4",  title:"KYC request letter — corporate",                   desc:"Letter requesting corporate due diligence documentation.",                       fields:["Entity name","Documents required","Deadline"] },
    { id:"ob5",  title:"Source of wealth request letter",                  desc:"Request for documentary evidence of source of wealth.",                          fields:["Client name","Entity","Specific questions","Deadline"] },
    { id:"ob6",  title:"Letter of engagement — standard",                  desc:"Standard LOE covering fee arrangement, services, and terms.",                    fields:["Entity name","Services","Fee structure","Commencement date"] },
    { id:"ob7",  title:"Letter of engagement — trust administration",      desc:"LOE specifically for trust administration mandates.",                            fields:["Trust name","Settlor","Trustee fees","Services scope"] },
    { id:"ob8",  title:"Client welcome letter",                            desc:"Confirmation letter sent on successful onboarding.",                             fields:["Client name","Entity","Administrator","Key contacts"] },
    { id:"ob9",  title:"Portal invitation",                                desc:"Invitation email to access the client portal for KYC self-service.",             fields:["Contact name","Entity","Expiry period"] },
    { id:"ob10", title:"New business committee submission",                desc:"Standard committee paper for new business sign-off.",                            fields:["Prospect name","Risk rating","Services","BD lead","Supporting notes"] },
    { id:"ob11", title:"AML/KYC assessment summary",                       desc:"Summary of AML assessment for new business committee.",                          fields:["Entity name","Risk rating","Key risks identified","Mitigants"] },
    { id:"ob12", title:"Client off-boarding / exit form",                  desc:"Records the exit of a client or entity — reason, approvals and handover (attrition).", fields:["Client / entity","Reason for exit","Effective date","Outstanding matters","Approved by"] },
    { id:"ob13", title:"Employee off-boarding / leaver form",              desc:"Staff off-boarding record — leaver details, handover and access removal (attrition).", fields:["Employee name","Role / office","Leave date","Reason","Handover to","Access revoked"] },
  ],
  Correspondence: [
    { id:"co1",  title:"General correspondence letter",                    desc:"Standard Affinity letterhead correspondence.",                                   fields:["Addressee","Subject","Body text","Signatory"] },
    { id:"co2",  title:"File note",                                        desc:"Internal file note for DMS filing.",                                             fields:["Entity name","Subject","Summary","Author"] },
    { id:"co3",  title:"Meeting minutes — standard",                       desc:"Minutes of a client or director meeting.",                                       fields:["Meeting type","Date","Attendees","Agenda items","Resolutions"] },
    { id:"co4",  title:"Engagement letter — amendment",                    desc:"Amendment to existing engagement letter.",                                       fields:["Entity name","Changes from original","Effective date"] },
    { id:"co5",  title:"Termination / attrition notice",                   desc:"Letter confirming end of services.",                                             fields:["Entity name","Reason","Last date of service","Outstanding matters"] },
    { id:"co6",  title:"Reminder letter — outstanding documents",          desc:"Chase letter for overdue KYC or documents.",                                     fields:["Client name","Entity","Outstanding items","Deadline"] },
    { id:"co7",  title:"Reminder letter — outstanding fees",               desc:"Reminder regarding unpaid invoices.",                                            fields:["Client name","Entity","Invoice references","Total outstanding","Deadline"] },
    { id:"co8",  title:"Compliance enquiry response",                      desc:"Letter responding to compliance or regulatory query.",                           fields:["Regulator / enquirer","Reference","Response text","Signatory"] },
    { id:"co9",  title:"Introducer / referral confirmation",               desc:"Letter confirming an introduced client relationship.",                           fields:["Introducer name","Client name","Date of introduction","Fees (if applicable)"] },
    { id:"co10", title:"Data subject access response (DSAR)",              desc:"Response to a data subject access request.",                                     fields:["Requestor","Entity","Data categories provided","Date"] },
  ],
  Statutory: {
    "Isle of Man": [
      { id:"iom1",  form:"Form 1",    title:"Consent to act as director",                       act:"Companies Act 1931",    notes:"Required on director appointment. File with Registrar." },
      { id:"iom2",  form:"Form 6",    title:"Notification of change of directors / secretary",  act:"Companies Act 1931",    notes:"File within 1 month of change." },
      { id:"iom3",  form:"Form 6C",   title:"Change of company secretary",                      act:"Companies Act 1931",    notes:"File within 1 month." },
      { id:"iom4",  form:"Form 7",    title:"Annual return",                                    act:"Companies Act 1931",    notes:"Due on anniversary of incorporation. Pre-populated from entity data." },
      { id:"iom5",  form:"Form 8",    title:"Return of allotments",                             act:"Companies Act 1931",    notes:"File within 2 months of share issue." },
      { id:"iom6",  form:"Form 9",    title:"Change of registered office",                      act:"Companies Act 1931",    notes:"Effective from date of filing." },
      { id:"iom7",  form:"Form 10",   title:"Notice of change of name",                         act:"Companies Act 1931",    notes:"Requires special resolution." },
      { id:"iom8",  form:"Form BNO",  title:"Beneficial ownership notification",                act:"Beneficial Ownership Act 2017", notes:"Submit to Income Tax Division." },
      { id:"iom9",  form:"TR1",       title:"Trust registration",                               act:"Trust Register Regulations 2017", notes:"Register of trusts with IOM." },
      { id:"iom10", form:"—",         title:"Strike-off application",                           act:"Companies Act 1931",    notes:"Voluntary dissolution. Requires board resolution." },
      { id:"iom11", form:"—",         title:"Board resolution — director appointment",          act:"Table A",               notes:"Signed by all current directors or written resolution." },
      { id:"iom12", form:"—",         title:"Board resolution — dividend declaration",          act:"Companies Act 1931",    notes:"Record date, amount per share, and payment date." },
      { id:"iom13", form:"—",         title:"Board resolution — general",                      act:"Table A",               notes:"Template for ad hoc board resolutions." },
      { id:"iom14", form:"—",         title:"Share transfer instrument",                        act:"Companies Act 1931",    notes:"Executed by transferor and transferee." },
      { id:"iom15", form:"—",         title:"Written shareholders' resolution",                 act:"Companies Act 1931",    notes:"Valid alternative to a general meeting." },
      { id:"iom16", form:"—",         title:"Certificate of incumbency",                        act:"—",                     notes:"Lists current directors, officers, and shareholders." },
    ],
    "Malta": [
      { id:"mlt1",  form:"Form BO1",  title:"Beneficial owner notification",                   act:"PBOA 2018",              notes:"File with MFSA on change or annual review." },
      { id:"mlt2",  form:"Form A",    title:"Annual return",                                    act:"Companies Act (Cap. 386)", notes:"Due within 42 days of anniversary." },
      { id:"mlt3",  form:"Form T",    title:"Notice of allotment of shares",                   act:"Companies Act (Cap. 386)", notes:"File within 14 days." },
      { id:"mlt4",  form:"Form D",    title:"Change of directors",                             act:"Companies Act (Cap. 386)", notes:"File within 14 days of change." },
      { id:"mlt5",  form:"Form R",    title:"Change of registered office",                     act:"Companies Act (Cap. 386)", notes:"File within 14 days." },
      { id:"mlt6",  form:"Form N",    title:"Change of company name",                          act:"Companies Act (Cap. 386)", notes:"Requires special resolution." },
      { id:"mlt7",  form:"Form L",    title:"Creation of charge",                              act:"Companies Act (Cap. 386)", notes:"Register charge within 14 days." },
      { id:"mlt8",  form:"Form S",    title:"Share transfer",                                  act:"Companies Act (Cap. 386)", notes:"Stamp duty at 2% of consideration." },
      { id:"mlt9",  form:"—",         title:"Memorandum of association amendment",             act:"Companies Act (Cap. 386)", notes:"Extraordinary resolution required." },
      { id:"mlt10", form:"—",         title:"Director consent to act",                         act:"Companies Act (Cap. 386)", notes:"Required on appointment." },
      { id:"mlt11", form:"—",         title:"Foundation deed amendment",                       act:"Second Schedule Cap. 16", notes:"Requires administrator and council approval." },
      { id:"mlt12", form:"—",         title:"Board resolution — general",                      act:"Articles",                notes:"Standard template." },
    ],
    "Cayman Islands": [
      { id:"cay1",  form:"CR1",       title:"Annual return — exempted company",                act:"Companies Law (2023)",   notes:"Due 31 January. Government fee applicable." },
      { id:"cay2",  form:"CR2",       title:"Change of registered office",                     act:"Companies Law (2023)",   notes:"File with Registrar of Companies." },
      { id:"cay3",  form:"CR4",       title:"Change of directors or officers",                 act:"Companies Law (2023)",   notes:"File within 60 days of change." },
      { id:"cay4",  form:"CR5",       title:"Return of allotments",                            act:"Companies Law (2023)",   notes:"File within 30 days of allotment." },
      { id:"cay5",  form:"CR6",       title:"Increase in authorised share capital",            act:"Companies Law (2023)",   notes:"Board or shareholder resolution required." },
      { id:"cay6",  form:"RBS",       title:"Register of beneficial owners submission",        act:"Beneficial Ownership Transparency Law 2023", notes:"File with CIMA portal." },
      { id:"cay7",  form:"ESR",       title:"Economic substance return",                       act:"International Tax Co-operation (ESR) Law 2018", notes:"Annual filing to CIMA. Due 12 months after year end." },
      { id:"cay8",  form:"FATCA",     title:"FATCA return — CRS supplemental",                act:"AEOI Law",               notes:"File with CIMA by 31 July." },
      { id:"cay9",  form:"—",         title:"Written resolution — director appointment",       act:"Articles",               notes:"Signed by all current directors." },
      { id:"cay10", form:"—",         title:"Shareholder resolution — special",                act:"Companies Law (2023)",   notes:"Two-thirds majority required." },
      { id:"cay11", form:"—",         title:"Certificate of good standing request",            act:"—",                     notes:"Apply to General Registry. Approx. 3–5 business days." },
      { id:"cay12", form:"—",         title:"Trust deed amendment",                            act:"Trusts Law (2021)",      notes:"Requires protector / settlor consent as applicable." },
    ],
    "United Kingdom": [
      { id:"uk1",   form:"AP01",      title:"Appointment of director",                        act:"Companies Act 2006",     notes:"File within 14 days at Companies House." },
      { id:"uk2",   form:"TM01",      title:"Termination of director appointment",            act:"Companies Act 2006",     notes:"File within 14 days." },
      { id:"uk3",   form:"CH01",      title:"Change of director's details",                   act:"Companies Act 2006",     notes:"File within 28 days." },
      { id:"uk4",   form:"PSC01",     title:"Notification of person with significant control",act:"Companies Act 2006",     notes:"File within 14 days." },
      { id:"uk5",   form:"SH01",      title:"Return of allotment of shares",                  act:"Companies Act 2006",     notes:"File within 1 month." },
      { id:"uk6",   form:"SH03",      title:"Share transfer — stock transfer form",           act:"Companies Act 2006",     notes:"Stamp duty at 0.5% if over £1,000." },
      { id:"uk7",   form:"AD01",      title:"Change of registered office",                    act:"Companies Act 2006",     notes:"Effective on filing." },
      { id:"uk8",   form:"CS01",      title:"Confirmation statement (annual return)",         act:"Companies Act 2006",     notes:"Due annually. £13 filing fee (online)." },
      { id:"uk9",   form:"DS01",      title:"Application to strike off",                      act:"Companies Act 2006",     notes:"Voluntary dissolution." },
      { id:"uk10",  form:"MR01",      title:"Registration of charge",                         act:"Companies Act 2006",     notes:"File within 21 days." },
    ],
  },
};

// US States statutory forms
const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
];

const US_FORMS = [
  { id:"us1", title:"Articles of incorporation / certificate of formation", notes:"Required to register LLC or corporation in the state." },
  { id:"us2", title:"Annual report / statement of information",             notes:"Due date and fee vary by state. Automatically scheduled." },
  { id:"us3", title:"Certificate of good standing",                         notes:"Issued by Secretary of State. Typically 3–5 business days." },
  { id:"us4", title:"Registered agent change notification",                 notes:"File with Secretary of State." },
  { id:"us5", title:"Change of registered office / principal address",      notes:"File with Secretary of State." },
  { id:"us6", title:"Officer / director change notification",               notes:"Some states require, some do not — auto-populated per state." },
  { id:"us7", title:"Dissolution / cancellation filing",                    notes:"Articles of dissolution or certificate of cancellation." },
  { id:"us8", title:"Foreign qualification (out-of-state registration)",    notes:"Required if entity transacts business in another state." },
  { id:"us9", title:"FBAR notification (FinCEN 114)",                       notes:"Required for US persons with foreign bank account >$10,000." },
];

const VIEWS = ["onboarding","correspondence","statutory_iom","statutory_malta","statutory_cayman","statutory_uk","statutory_us","recent"];
const VLBLS  = ["Onboarding","Correspondence","Statutory — IOM","Statutory — Malta","Statutory — Cayman","Statutory — UK","Statutory — US states","Recently generated"];

const jurC = {
  "Isle of Man":    { bg:"#E6F7FB", color:"#0077A8" },
  "Malta":          { bg:"#EEF0FB", color:"#3C3489" },
  "Cayman Islands": { bg:"#E6EEF7", color:"#0D4A7A" },
  "United Kingdom": { bg:"#EAF3DE", color:"#27500A" },
};

const RECENT = [
  { title:"Board resolution — director appointment",   entity:"Stonebridge Capital Ltd",   jur:"Malta",          generated:"14/07/2025", by:"Joanne Fenech", format:"DOCX" },
  { title:"Annual return",                            entity:"Meridian Holdings Ltd",       jur:"Isle of Man",    generated:"12/03/2025", by:"Roxy Sheeley",  format:"PDF" },
  { title:"KYC request letter — individual",          entity:"Harrington Family Trust",    jur:"Isle of Man",    generated:"10/07/2025", by:"Roxy Sheeley",  format:"DOCX" },
  { title:"Certificate of good standing request",     entity:"Caledonian Ventures Ltd",    jur:"Cayman Islands", generated:"18/06/2025", by:"Garry Crossan", format:"PDF" },
  { title:"Letter of engagement — standard",          entity:"Phoenix eGaming Ltd",         jur:"Isle of Man",    generated:"01/06/2025", by:"Roxy Sheeley",  format:"DOCX" },
  { title:"New business questionnaire — company",     entity:"Verano Maritime SA",          jur:"Malta",          generated:"01/06/2025", by:"Joanne Fenech", format:"DOCX" },
];

export default function AffinityGenerateDocument() {
  const [entitySearch, setEntitySearch] = useState("");
  const [view,    setView]    = useState("onboarding");
  const [entity,  setEntity]  = useState(ENTITIES[0]);
  const [usState, setUsState] = useState("Delaware");
  const [modal,   setModal]   = useState(null);
  const [selDoc,  setSelDoc]  = useState(null);

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };

  const openModal = (doc) => { setSelDoc(doc); setModal("generate"); };

  const DocCard = ({ doc }) => (
    <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:8, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
      <div style={{ flex:1, marginRight:12 }}>
        <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>{doc.form ? <><span style={{ color:CY, marginRight:6 }}>{doc.form}</span>{doc.title}</> : doc.title}</div>
        <div style={{ fontSize:11, color:"#666", lineHeight:1.4, marginBottom:6 }}>{doc.desc || doc.notes}</div>
        {doc.act && <Badge label={doc.act} colors={{ bg:"#f0f0f0", color:"#555" }} />}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:5, flexShrink:0 }}>
        <input list="gd-entity-list" value={entity} onChange={e=>setEntity(e.target.value)} placeholder="Search entity…"
          style={{ height:26, padding:"0 6px", border:"0.5px solid #ccc", borderRadius:4, fontSize:10, background:"#fff", maxWidth:160, boxSizing:"border-box" }} />
        <div style={{ display:"flex", gap:4 }}>
          <button style={{ ...nb, fontSize:10, padding:"4px 8px" }} onClick={()=>openModal(doc)}>DOCX ↗</button>
          <button style={{ ...nba, fontSize:10, padding:"4px 8px" }} onClick={()=>openModal(doc)}>PDF ↗</button>
        </div>
      </div>
    </div>
  );

  const Section = ({ title, docs }) => (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.5px", color:"#888", marginBottom:10, paddingBottom:6, borderBottom:"0.5px solid #e5e5e5" }}>{title}</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {docs.map(d => <DocCard key={d.id} doc={d} />)}
      </div>
    </div>
  );

  const StatutorySection = ({ jur, docs }) => (
    <div style={{ marginBottom:20 }}>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr style={{ background:"#f9f9f9" }}>
            {["Form ref","Document","Legislation","Notes","Generate"].map(h=>(
              <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map(d=>(
            <tr key={d.id} style={{ borderBottom:"0.5px solid #f0f0f0" }}>
              <td style={{ padding:"9px 12px", fontSize:11, fontWeight:600, color:CY, whiteSpace:"nowrap" }}>{d.form||"—"}</td>
              <td style={{ padding:"9px 12px", fontSize:12, fontWeight:500 }}>{d.title}</td>
              <td style={{ padding:"9px 12px", fontSize:10, color:"#666", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.act}</td>
              <td style={{ padding:"9px 12px", fontSize:10, color:"#aaa", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.notes}</td>
              <td style={{ padding:"9px 12px" }}>
                <div style={{ display:"flex", gap:4 }}>
                  <button style={{ ...nb, fontSize:10, padding:"3px 8px" }} onClick={()=>openModal(d)}>DOCX</button>
                  <button style={{ ...nba, fontSize:10, padding:"3px 8px" }} onClick={()=>openModal(d)}>PDF</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"#f8f9fc", color:"#111", minHeight:"100vh" }}>
      {/* Header */}
      <div style={{ background:NAVY, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          
          <span style={{ color:"#8892b0", fontSize:13 }}>Generate Document</span>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entity Admin","Documents","Onboarding"].map(n=><button key={n} style={{ ...nb, color:"#8892b0", borderColor:"#334" }}>{n}</button>)}
          <button style={nba}>Generate</button>
        </div>
      </div>
      {/* Entity search — same component on every page showing client data */}
      <div style={{ padding:"10px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-primary,#fff)" }}>
        <EntitySearch value={entitySearch} onChange={setEntitySearch} compact />
      </div>


      {/* Nav */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid #e5e5e5", padding:"0 24px", display:"flex", gap:0, overflowX:"auto" }}>
        {VIEWS.map((v,i)=>(
          <button key={v} onClick={()=>setView(v)} style={{ padding:"10px 14px", fontSize:11, border:"none", borderBottom:`2px solid ${view===v?CY:"transparent"}`, background:"transparent", color:view===v?CY:"#666", cursor:"pointer", fontWeight:view===v?600:400, whiteSpace:"nowrap" }}>
            {VLBLS[i]}
            {v.startsWith("statutory_")&&<Badge label={["IOM","Malta","Cayman","UK","US"][["statutory_iom","statutory_malta","statutory_cayman","statutory_uk","statutory_us"].indexOf(v)]} colors={[jurC["Isle of Man"],jurC["Malta"],jurC["Cayman Islands"],jurC["United Kingdom"],{bg:"#FBEAF0",color:"#72243E"}][["statutory_iom","statutory_malta","statutory_cayman","statutory_uk","statutory_us"].indexOf(v)]} />}
          </button>
        ))}
      </div>

      {/* Info banner */}
      <div style={{ background:"#f0f8fb", borderBottom:"0.5px solid #daeef5", padding:"8px 24px", fontSize:11, color:"#0077A8", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span>📄 Documents are generated from live entity data. Select the entity before generating. All generated documents are auto-saved to DMS under the relevant folder.</span>
        <input list="gd-entity-list" value={entity} onChange={e=>setEntity(e.target.value)} placeholder="Search entity…"
          style={{ height:26, padding:"0 8px", border:"0.5px solid #ccc", borderRadius:4, fontSize:11, background:"#fff", minWidth:200, boxSizing:"border-box" }} />
        {/* shared entity list — referenced by every entity search on this page */}
        <datalist id="gd-entity-list">{ENTITIES.map(e=><option key={e} value={e}/>)}</datalist>
      </div>

      <div style={{ padding:"16px 24px" }}>

        {/* ONBOARDING */}
        {view==="onboarding"&&<Section title="Onboarding documents" docs={DOCUMENT_LIBRARY.Onboarding} />}

        {/* CORRESPONDENCE */}
        {view==="correspondence"&&<Section title="Correspondence & file management" docs={DOCUMENT_LIBRARY.Correspondence} />}

        {/* STATUTORY — IOM */}
        {view==="statutory_iom"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>Isle of Man — statutory forms</div>
                <div style={{ fontSize:11, color:"#666", marginTop:2 }}>Companies Act 1931 · Beneficial Ownership Act 2017 · Trust Register Regulations 2017</div>
              </div>
              <Badge label="Isle of Man Financial Services Authority" colors={jurC["Isle of Man"]} />
            </div>
            <StatutorySection jur="Isle of Man" docs={DOCUMENT_LIBRARY.Statutory["Isle of Man"]} />
          </div>
        )}

        {/* STATUTORY — MALTA */}
        {view==="statutory_malta"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>Malta — statutory forms</div>
                <div style={{ fontSize:11, color:"#666", marginTop:2 }}>Companies Act (Cap. 386) · Foundations (Properties) Act · MFSA regulations</div>
              </div>
              <Badge label="Malta Financial Services Authority" colors={jurC["Malta"]} />
            </div>
            <StatutorySection jur="Malta" docs={DOCUMENT_LIBRARY.Statutory["Malta"]} />
          </div>
        )}

        {/* STATUTORY — CAYMAN */}
        {view==="statutory_cayman"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>Cayman Islands — statutory forms</div>
                <div style={{ fontSize:11, color:"#666", marginTop:2 }}>Companies Law (2023) · Beneficial Ownership Transparency Law 2023 · ESR Law 2018</div>
              </div>
              <Badge label="Cayman Islands Monetary Authority" colors={jurC["Cayman Islands"]} />
            </div>
            <StatutorySection jur="Cayman Islands" docs={DOCUMENT_LIBRARY.Statutory["Cayman Islands"]} />
          </div>
        )}

        {/* STATUTORY — UK */}
        {view==="statutory_uk"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>United Kingdom — statutory forms</div>
                <div style={{ fontSize:11, color:"#666", marginTop:2 }}>Companies Act 2006 · Companies House filing requirements</div>
              </div>
              <Badge label="Companies House" colors={jurC["United Kingdom"]} />
            </div>
            <StatutorySection jur="United Kingdom" docs={DOCUMENT_LIBRARY.Statutory["United Kingdom"]} />
          </div>
        )}

        {/* STATUTORY — US STATES */}
        {view==="statutory_us"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>United States — all 50 states</div>
                <div style={{ fontSize:11, color:"#666", marginTop:2 }}>Filing requirements vary by state. Select the relevant state — forms auto-populate with state-specific requirements and fees.</div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <label style={{ fontSize:11, color:"#666" }}>State:</label>
                <select value={usState} onChange={e=>setUsState(e.target.value)} style={{ height:30, padding:"0 8px", border:"0.5px solid #ccc", borderRadius:5, fontSize:12, background:"#fff" }}>
                  {US_STATES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ background:"#FBEAF022", border:"0.5px solid #BF5C7A", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:11, color:"#72243E" }}>
              📋 Showing forms for <strong>{usState}</strong>. Due dates, fees, and specific requirements for this state are pre-loaded. Some states require registered agent filings — flagged where applicable.
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#f9f9f9" }}>
                  {["Document","State-specific notes","Generate"].map(h=>(
                    <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {US_FORMS.map(f=>(
                  <tr key={f.id} style={{ borderBottom:"0.5px solid #f0f0f0" }}>
                    <td style={{ padding:"9px 12px", fontSize:12, fontWeight:500 }}>{f.title}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:"#666" }}>{f.notes} <span style={{ color:CY }}>({usState} specific requirements auto-loaded)</span></td>
                    <td style={{ padding:"9px 12px" }}>
                      <div style={{ display:"flex", gap:4 }}>
                        <button style={{ ...nb, fontSize:10, padding:"3px 8px" }} onClick={()=>openModal(f)}>DOCX</button>
                        <button style={{ ...nba, fontSize:10, padding:"3px 8px" }} onClick={()=>openModal(f)}>PDF</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* RECENTLY GENERATED */}
        {view==="recent"&&(
          <div>
            <div style={{ fontSize:12, fontWeight:500, marginBottom:14 }}>Recently generated documents — last 30 days</div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#f9f9f9" }}>
                  {["Document","Entity","Jurisdiction","Generated","By","Format","Actions"].map(h=>(
                    <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RECENT.map((r,i)=>(
                  <tr key={i} style={{ borderBottom:"0.5px solid #f0f0f0" }}>
                    <td style={{ padding:"9px 12px", fontSize:12, fontWeight:500 }}>{r.title}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:"#666" }}>{r.entity}</td>
                    <td style={{ padding:"9px 12px" }}><Badge label={r.jur} colors={jurC[r.jur]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:"#666" }}>{r.generated}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:"#666" }}>{r.by}</td>
                    <td style={{ padding:"9px 12px" }}><Badge label={r.format} colors={{ DOCX:{bg:"#E6EEF7",color:"#0D4A7A"}, PDF:{bg:"#FCEBEB",color:"#A32D2D"} }[r.format]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ padding:"9px 12px" }}>
                      <div style={{ display:"flex", gap:4 }}>
                        <button style={{ ...nb, fontSize:10, padding:"3px 8px" }}>Download ↓</button>
                        <button style={{ ...nb, fontSize:10, padding:"3px 8px" }}>View in DMS ↗</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate modal */}
      {modal==="generate"&&selDoc&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"#fff", borderRadius:12, padding:24, width:520, maxWidth:"95vw", maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15, fontWeight:600 }}>{selDoc.title}</h3>
              <button onClick={()=>setModal(null)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
            </div>
            {selDoc.form&&<div style={{ marginBottom:10 }}><Badge label={"Form: "+selDoc.form} colors={{ bg:"#E6F7FB", color:"#0077A8" }} /></div>}
            <div style={{ background:"#f9f9f9", borderRadius:6, padding:"8px 12px", fontSize:11, color:"#666", marginBottom:16, lineHeight:1.5 }}>{selDoc.desc||selDoc.notes}</div>

            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#555", marginBottom:4 }}>Entity</label>
              <input list="gd-entity-list" value={entity} onChange={e=>setEntity(e.target.value)} placeholder="Search entity by name…"
                style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none", boxSizing:"border-box" }} />
            </div>

            {(selDoc.fields||[]).map(f=>(
              <div key={f} style={{ marginBottom:12 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#555", marginBottom:4 }}>{f}</label>
                <input placeholder={"Pre-populated from entity data where available"} style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none", boxSizing:"border-box", background:"#fafafa" }} />
              </div>
            ))}

            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#555", marginBottom:4 }}>Auto-save to DMS</label>
              <select style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none" }}>
                <option>Yes — save to Statutory folder</option>
                <option>Yes — save to Correspondence folder</option>
                <option>Yes — save to KYC / Onboarding folder</option>
                <option>No — download only</option>
              </select>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:16 }}>
              <button onClick={()=>setModal(null)} style={{ background:"#E6EEF7", color:"#0D4A7A", border:"none", borderRadius:8, padding:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                Generate DOCX ↗
              </button>
              <button onClick={()=>setModal(null)} style={{ background:CY, color:"#fff", border:"none", borderRadius:8, padding:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                Generate PDF ↗
              </button>
            </div>
            <div style={{ marginTop:8, fontSize:10, color:"#aaa", textAlign:"center" }}>Document will be auto-saved to DMS and a task created to review before sending.</div>
          </div>
        </div>
      )}
    </div>
  );
}
