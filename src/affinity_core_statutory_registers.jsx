import { useState } from "react";
const CY = "#00C4CC";
const NAVY = "#001242";

const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);

const ANNUAL_RETURNS = [
  { id:1,  entity:"Meridian Holdings Ltd",       jur:"Isle of Man",    type:"Companies Act 1931", regNo:"117843C",    due:"12/03/2026", lastFiled:"12/03/2025", admin:"Roxy Sheeley",  status:"Upcoming",  fee:"£20" },
  { id:2,  entity:"Harrington Family Trust",      jur:"Isle of Man",    type:"Trust",              regNo:"T-4421",     due:"05/07/2025", lastFiled:"05/07/2024", admin:"Roxy Sheeley",  status:"Overdue",   fee:"—" },
  { id:3,  entity:"Caledonian Ventures Ltd",      jur:"Cayman Islands", type:"Exempted Company",   regNo:"CY-88341",   due:"31/12/2025", lastFiled:"31/12/2024", admin:"Garry Crossan", status:"Upcoming",  fee:"$900" },
  { id:4,  entity:"Azure Mediterranean Fdn",      jur:"Malta",          type:"Foundation",         regNo:"MLT-F-2201", due:"30/09/2025", lastFiled:"30/09/2024", admin:"Joanne Fenech", status:"Due soon",  fee:"€85" },
  { id:5,  entity:"Apex Growth Fund Ltd",          jur:"Cayman Islands", type:"Exempted Company",   regNo:"CY-99102",   due:"31/12/2025", lastFiled:"31/12/2024", admin:"Garry Crossan", status:"Upcoming",  fee:"$1,200" },
  { id:6,  entity:"Stonebridge Capital Ltd",       jur:"Malta",          type:"Private Ltd",        regNo:"MLT-C-88221",due:"30/06/2025", lastFiled:"30/06/2024", admin:"Joanne Fenech", status:"Overdue",   fee:"€85" },
  { id:7,  entity:"Rosewood Legacy Trust",         jur:"Isle of Man",    type:"Trust",              regNo:"T-6603",     due:"25/04/2026", lastFiled:"25/04/2025", admin:"Roxy Sheeley",  status:"Upcoming",  fee:"—" },
  { id:8,  entity:"Pacific Wealth Trust",          jur:"Cayman Islands", type:"STAR Trust",         regNo:"T-CY-5521",  due:"31/12/2025", lastFiled:"31/12/2024", admin:"Garry Crossan", status:"Upcoming",  fee:"—" },
  { id:9,  entity:"North Star Holdings Ltd",       jur:"Isle of Man",    type:"Companies Act 1931", regNo:"104322C",    due:"30/10/2025", lastFiled:"30/10/2024", admin:"Roxy Sheeley",  status:"Upcoming",  fee:"£20" },
  { id:10, entity:"Bluewater Family Trust",        jur:"Cayman Islands", type:"Ordinary Trust",     regNo:"T-CY-9921",  due:"31/12/2025", lastFiled:"31/12/2024", admin:"Garry Crossan", status:"Upcoming",  fee:"—" },
];

const BO_REGISTER = [
  { id:1,  entity:"Meridian Holdings Ltd",    jur:"Isle of Man",    boRequired:true,  submitted:"14/03/2025", status:"Current",   system:"BORS (ITD)",  nextReview:"14/03/2026" },
  { id:2,  entity:"Caledonian Ventures Ltd",  jur:"Cayman Islands", boRequired:true,  submitted:"22/01/2025", status:"Current",   system:"CIMA portal", nextReview:"22/01/2026" },
  { id:3,  entity:"Azure Mediterranean Fdn",  jur:"Malta",          boRequired:true,  submitted:"14/09/2024", status:"Due soon",  system:"MFSA BROS",   nextReview:"14/09/2025" },
  { id:4,  entity:"Apex Growth Fund Ltd",      jur:"Cayman Islands", boRequired:true,  submitted:"12/08/2024", status:"Due soon",  system:"CIMA portal", nextReview:"12/08/2025" },
  { id:5,  entity:"Stonebridge Capital Ltd",   jur:"Malta",          boRequired:true,  submitted:"07/02/2024", status:"Overdue",   system:"MFSA BROS",   nextReview:"07/02/2025" },
  { id:6,  entity:"North Star Holdings Ltd",   jur:"Isle of Man",    boRequired:true,  submitted:"30/10/2024", status:"Current",   system:"BORS (ITD)",  nextReview:"30/10/2025" },
];

const COGS = [
  { id:1, entity:"Meridian Holdings Ltd",   requested:"01/07/2025", issued:"03/07/2025", requestedBy:"Rory James (auditor)", status:"Issued",   purpose:"Audit" },
  { id:2, entity:"Caledonian Ventures Ltd", requested:"15/06/2025", issued:"18/06/2025", requestedBy:"First Caribbean Bank",  status:"Issued",   purpose:"Bank account opening" },
  { id:3, entity:"Apex Growth Fund Ltd",    requested:"10/07/2025", issued:null,          requestedBy:"Butterfield Bank",       status:"Pending",  purpose:"Loan facility" },
];

const OFFICER_CHANGES = [
  { id:1, entity:"Stonebridge Capital Ltd", change:"Director appointment", name:"Maria Borg",         date:"01/07/2025", form:"Form 6 (Malta)", filed:"Not yet", dueDate:"30/07/2025", admin:"Joanne Fenech" },
  { id:2, entity:"Meridian Holdings Ltd",   change:"Director resignation",  name:"Emma Harrington",    date:"15/06/2025", form:"Form 6C (IOM)",  filed:"Filed",   dueDate:"15/07/2025", admin:"Roxy Sheeley" },
  { id:3, entity:"Pacific Wealth Trust",    change:"Trustee change",        name:"Affinity Trust Ltd", date:"01/05/2025", form:"Trust deed amdt", filed:"Filed",   dueDate:"01/06/2025", admin:"Garry Crossan" },
];

const DISSOLUTIONS = [
  { id:1, entity:"North Star Holdings Ltd", type:"Liquidation",  started:"15/01/2025", admin:"Roxy Sheeley",  stage:"Creditor notice period", targetClose:"31/12/2025" },
  { id:2, entity:"Thornbury Asset Co Ltd",  type:"Transfer out", started:"01/06/2025", admin:"Neil Kelly",    stage:"Director resolution signed", targetClose:"31/08/2025" },
];

const statusC = {
  "Upcoming":  { bg:"#E6F7FB", color:"#0077A8" },
  "Due soon":  { bg:"#FAEEDA", color:"#633806" },
  "Overdue":   { bg:"#FCEBEB", color:"#A32D2D" },
  "Current":   { bg:"#EAF3DE", color:"#27500A" },
  "Filed":     { bg:"#EAF3DE", color:"#27500A" },
  "Not yet":   { bg:"#FAEEDA", color:"#633806" },
  "Issued":    { bg:"#EAF3DE", color:"#27500A" },
  "Pending":   { bg:"#FAEEDA", color:"#633806" },
};

const jurC = {
  "Isle of Man":    { bg:"#E6F7FB", color:"#0077A8" },
  "Malta":          { bg:"#EEF0FB", color:"#3C3489" },
  "Cayman Islands": { bg:"#E6EEF7", color:"#0D4A7A" },
};

const VIEWS = ["calendar","returns","bo","officers","cogs","dissolution"];
const VLBLS = ["Filing calendar","Annual returns","BO registers","Officer changes","Certs of good standing","Dissolutions"];

const th = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"#f9f9f9", whiteSpace:"nowrap" };
const td = { padding:"9px 12px", fontSize:11, borderBottom:"0.5px solid #e5e5e5", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" };

export default function AffinityStatutory() {
  const [view, setView]   = useState("calendar");
  const [modal, setModal] = useState(null);
  const [jurF, setJurF]   = useState("");

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };

  const overdueReturns  = ANNUAL_RETURNS.filter(r => r.status === "Overdue").length;
  const overdueBO       = BO_REGISTER.filter(r => r.status === "Overdue").length;
  const pendingOfficer  = OFFICER_CHANGES.filter(c => c.filed === "Not yet").length;
  const dueSoon         = ANNUAL_RETURNS.filter(r => r.status === "Due soon").length;

  const filteredReturns = ANNUAL_RETURNS.filter(r => !jurF || r.jur === jurF);

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"#f8f9fc", color:"#111", minHeight:"100vh" }}>
      {/* Header */}
      <div style={{ background:NAVY, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          
          <span style={{ color:"#8892b0", fontSize:13 }}>Statutory, Company Secretarial & Regulatory Registers</span>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entity Admin","Compliance","DMS"].map(n => <button key={n} style={{ ...nb, color:"#8892b0", borderColor:"#334" }}>{n}</button>)}
          <button style={nba}>Statutory</button>
        </div>
      </div>

      {/* Nav */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid #e5e5e5", padding:"0 24px", display:"flex", gap:2 }}>
        {VIEWS.map((v, i) => (
          <button key={v} onClick={() => setView(v)} style={{ padding:"10px 14px", fontSize:12, border:"none", borderBottom:`2px solid ${view===v?CY:"transparent"}`, background:"transparent", color:view===v?CY:"#666", cursor:"pointer", fontWeight:view===v?600:400 }}>
            {VLBLS[i]}
            {v==="returns"&&overdueReturns>0&&<span style={{ marginLeft:5, background:"#EF4444", color:"#fff", borderRadius:10, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{overdueReturns}</span>}
            {v==="bo"&&overdueBO>0&&<span style={{ marginLeft:5, background:"#EF4444", color:"#fff", borderRadius:10, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{overdueBO}</span>}
            {v==="officers"&&pendingOfficer>0&&<span style={{ marginLeft:5, background:"#F59E0B", color:"#fff", borderRadius:10, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{pendingOfficer}</span>}
          </button>
        ))}
      </div>

      <div style={{ background:"#fff", minHeight:"calc(100vh - 89px)", padding:"16px 24px" }}>

        {/* FILING CALENDAR */}
        {view==="calendar"&&(
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
              {[{l:"Overdue returns",v:overdueReturns,c:"#EF4444"},{l:"Due this month",v:dueSoon,c:"#F59E0B"},{l:"BO register overdue",v:overdueBO,c:"#EF4444"},{l:"Officer changes pending",v:pendingOfficer,c:"#F59E0B"}].map(k=>(
                <div key={k.l} style={{ background:"#f9f9f9", borderRadius:8, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:"#666", marginBottom:4 }}>{k.l}</div>
                  <div style={{ fontSize:22, fontWeight:700, color:k.c||"#111" }}>{k.v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:10, color:"#EF4444" }}>⚠️ Overdue — action required</div>
              {[...ANNUAL_RETURNS.filter(r=>r.status==="Overdue"), ...BO_REGISTER.filter(b=>b.status==="Overdue"), ...OFFICER_CHANGES.filter(c=>c.filed==="Not yet")].map((item, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:"0.5px solid #f5f5f5" }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:500 }}>{item.entity} — {item.type||item.change||"BO register"}</div>
                    <div style={{ fontSize:10, color:"#aaa", marginTop:2 }}>{item.jur} · Due: {item.due||item.dueDate||item.nextReview}</div>
                  </div>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <Badge label={item.jur} colors={jurC[item.jur]||{bg:"#eee",color:"#666"}} />
                    <button style={{ ...nb, fontSize:10, borderColor:"#EF4444", color:"#EF4444" }}>File now ↗</button>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:10, color:"#633806" }}>Due within 90 days</div>
              {ANNUAL_RETURNS.filter(r=>r.status==="Due soon"||r.status==="Upcoming").slice(0,6).map((r,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"0.5px solid #f5f5f5" }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:500 }}>{r.entity} — Annual return</div>
                    <div style={{ fontSize:10, color:"#aaa", marginTop:2 }}>{r.jur} · {r.admin} · Fee: {r.fee}</div>
                  </div>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ fontSize:11, color:"#666" }}>{r.due}</span>
                    <Badge label={r.status} colors={statusC[r.status]} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ANNUAL RETURNS */}
        {view==="returns"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ display:"flex", gap:8 }}>
                <select value={jurF} onChange={e=>setJurF(e.target.value)} style={{ height:30, padding:"0 8px", border:"0.5px solid #ccc", borderRadius:5, fontSize:11 }}>
                  <option value="">All jurisdictions</option>
                  {["Isle of Man","Malta","Cayman Islands"].map(j=><option key={j}>{j}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button style={{ ...nb, fontSize:10 }}>Export to Excel ↗</button>
                <button style={nba} onClick={()=>setModal("newReturn")}>＋ Log filing</button>
              </div>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Entity","Jurisdiction","Type","Reg. no.","Due date","Last filed","Admin","Fee","Status","Action"].map(h=><th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filteredReturns.map(r=>(
                  <tr key={r.id} style={{ borderBottom:"0.5px solid #f0f0f0", background:r.status==="Overdue"?"#FFF5F5":"transparent" }}>
                    <td style={{ ...td, fontWeight:500 }}>{r.entity}</td>
                    <td style={td}><Badge label={r.jur} colors={jurC[r.jur]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...td, color:"#666", fontSize:10 }}>{r.type}</td>
                    <td style={{ ...td, color:"#666", fontFamily:"monospace" }}>{r.regNo}</td>
                    <td style={{ ...td, color:r.status==="Overdue"?"#EF4444":"#666", fontWeight:r.status==="Overdue"?600:400 }}>{r.due}</td>
                    <td style={{ ...td, color:"#666" }}>{r.lastFiled}</td>
                    <td style={{ ...td, color:"#666" }}>{r.admin}</td>
                    <td style={{ ...td, color:"#aaa" }}>{r.fee}</td>
                    <td style={td}><Badge label={r.status} colors={statusC[r.status]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={td}>{r.status==="Overdue"?<button style={{ ...nb, fontSize:10, borderColor:"#EF4444", color:"#EF4444" }}>File ↗</button>:<button style={{ ...nb, fontSize:10 }}>Prepare ↗</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* BO REGISTERS */}
        {view==="bo"&&(
          <div>
            <div style={{ background:"#E6F7FB22", border:`0.5px solid ${CY}`, borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:11, color:"#0077A8" }}>
              ℹ️ Beneficial ownership registers must be maintained and submitted per applicable legislation. IOM: BORS via Income Tax Division. Cayman: CIMA portal. Malta: MFSA Business Registry.
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10 }}>
              <button style={nba} onClick={()=>setModal("boUpdate")}>＋ Record BO submission</button>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Entity","Jurisdiction","BO register required","Last submitted","Status","System","Next review","Action"].map(h=><th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {BO_REGISTER.map(b=>(
                  <tr key={b.id} style={{ borderBottom:"0.5px solid #f0f0f0", background:b.status==="Overdue"?"#FFF5F5":"transparent" }}>
                    <td style={{ ...td, fontWeight:500 }}>{b.entity}</td>
                    <td style={td}><Badge label={b.jur} colors={jurC[b.jur]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...td, color:"#4CAF7D" }}>{b.boRequired?"Yes":"-"}</td>
                    <td style={{ ...td, color:"#666" }}>{b.submitted}</td>
                    <td style={td}><Badge label={b.status} colors={statusC[b.status]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...td, color:"#666", fontSize:10 }}>{b.system}</td>
                    <td style={{ ...td, color:b.status==="Overdue"?"#EF4444":"#666", fontWeight:b.status==="Overdue"?600:400 }}>{b.nextReview}</td>
                    <td style={td}>{b.status==="Overdue"?<button style={{ ...nb, fontSize:10, borderColor:"#EF4444", color:"#EF4444" }}>Submit ↗</button>:<button style={{ ...nb, fontSize:10 }}>Update ↗</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* OFFICER CHANGES */}
        {view==="officers"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>Director & officer changes — statutory notifications required</div>
              <button style={nba} onClick={()=>setModal("officerChange")}>＋ Record change</button>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Entity","Change type","Individual","Date","Statutory form","Filing deadline","Filed","Admin","Action"].map(h=><th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {OFFICER_CHANGES.map(c=>(
                  <tr key={c.id} style={{ borderBottom:"0.5px solid #f0f0f0", background:c.filed==="Not yet"?"#FFFBEB":"transparent" }}>
                    <td style={{ ...td, fontWeight:500 }}>{c.entity}</td>
                    <td style={td}><Badge label={c.change} colors={{ "Director appointment":{bg:"#EAF3DE",color:"#27500A"}, "Director resignation":{bg:"#FAEEDA",color:"#633806"}, "Trustee change":{bg:"#EEF0FB",color:"#3C3489"} }[c.change]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...td, fontWeight:500 }}>{c.name}</td>
                    <td style={{ ...td, color:"#666" }}>{c.date}</td>
                    <td style={{ ...td, color:CY, fontSize:10 }}>{c.form}</td>
                    <td style={{ ...td, color:c.filed==="Not yet"?"#F59E0B":"#666", fontWeight:c.filed==="Not yet"?600:400 }}>{c.dueDate}</td>
                    <td style={td}><Badge label={c.filed} colors={statusC[c.filed]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...td, color:"#666" }}>{c.admin}</td>
                    <td style={td}>{c.filed==="Not yet"?<button style={nba}>Prepare form ↗</button>:<button style={{ ...nb, fontSize:10 }}>View ↗</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* CERTS OF GOOD STANDING */}
        {view==="cogs"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>Certificates of good standing — request and tracking log</div>
              <button style={nba} onClick={()=>setModal("cogRequest")}>＋ Request certificate</button>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Entity","Requested","Issued","Requested by","Purpose","Status","Action"].map(h=><th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {COGS.map(c=>(
                  <tr key={c.id} style={{ borderBottom:"0.5px solid #f0f0f0" }}>
                    <td style={{ ...td, fontWeight:500 }}>{c.entity}</td>
                    <td style={{ ...td, color:"#666" }}>{c.requested}</td>
                    <td style={{ ...td, color:"#666" }}>{c.issued||"Pending"}</td>
                    <td style={{ ...td, color:"#666", fontSize:10 }}>{c.requestedBy}</td>
                    <td style={{ ...td, color:"#666", fontSize:10 }}>{c.purpose}</td>
                    <td style={td}><Badge label={c.status} colors={statusC[c.status]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={td}>{c.status==="Pending"?<button style={nba}>Chase registry</button>:<button style={{ ...nb, fontSize:10 }}>View in DMS ↗</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* DISSOLUTIONS */}
        {view==="dissolution"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>Dissolutions, liquidations & transfer-outs in progress</div>
              <button style={nba} onClick={()=>setModal("dissolution")}>＋ Open dissolution</button>
            </div>
            {DISSOLUTIONS.map(d=>(
              <div key={d.id} style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:16, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600 }}>{d.entity}</div>
                    <div style={{ fontSize:11, color:"#666", marginTop:2 }}>{d.type} · Started {d.started} · Admin: {d.admin}</div>
                  </div>
                  <Badge label={d.type} colors={{ Liquidation:{bg:"#FCEBEB",color:"#A32D2D"}, "Transfer out":{bg:"#FAEEDA",color:"#633806"} }[d.type]||{bg:"#eee",color:"#666"}} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
                  {[["Current stage",d.stage],["Target close",d.targetClose],["Admin",d.admin]].map(([k,v])=>(
                    <div key={k} style={{ background:"#f9f9f9", borderRadius:6, padding:"8px 10px" }}>
                      <div style={{ fontSize:9, color:"#aaa", marginBottom:2 }}>{k}</div>
                      <div style={{ fontSize:11, fontWeight:500 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button style={nb}>View checklist ↗</button>
                  <button style={nba}>Advance stage</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"#fff", borderRadius:12, padding:24, width:460, maxWidth:"95vw" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15, fontWeight:600 }}>
                {modal==="newReturn"?"Log annual return filing":modal==="boUpdate"?"Record BO submission":modal==="officerChange"?"Record officer change":modal==="cogRequest"?"Request certificate of good standing":"Open dissolution / transfer"}
              </h3>
              <button onClick={()=>setModal(null)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
            </div>
            {[["Entity","select",["Meridian Holdings Ltd","Harrington Family Trust","Caledonian Ventures Ltd","Azure Mediterranean Fdn","Apex Growth Fund Ltd","Stonebridge Capital Ltd"]],["Jurisdiction","select",["Isle of Man","Malta","Cayman Islands"]],["Date","date"],["Notes","text","Optional notes"]].map(([l,t,opts])=>(
              <div key={l} style={{ marginBottom:12 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#555", marginBottom:4 }}>{l}</label>
                {t==="select"?<select style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none" }}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>
                :<input type={t} style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none", boxSizing:"border-box" }} placeholder={typeof opts==="string"?opts:""} />}
              </div>
            ))}
            <button onClick={()=>setModal(null)} style={{ width:"100%", background:CY, color:"#fff", border:"none", borderRadius:8, padding:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
