import { useState } from "react";
const CY = "#00C4CC";
const NAVY = "#001242";

const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);

const JUR_INFO = {
  Cayman: {
    name: "Cayman Islands",
    regulator: "Cayman Islands Monetary Authority (CIMA)",
    legislation: ["Companies Law (2023 Revision)", "Trusts Law (2021 Revision)", "Anti-Money Laundering Regulations (2024)", "Beneficial Ownership Transparency Law 2023", "International Tax Co-operation (ESR) Law 2018", "Mutual Funds Law (2023)", "Securities Investment Business Law (2020)"],
    obligations: [
      { id:1,  area:"AML/CFT",        title:"AML policies & procedures",               freq:"Annual review", due:"31/12/2025", status:"On track",  owner:"Gary Harrison" },
      { id:2,  area:"AML/CFT",        title:"Risk assessment — ML/TF",                 freq:"Annual",        due:"31/12/2025", status:"On track",  owner:"Gary Harrison" },
      { id:3,  area:"AEOI",           title:"FATCA return — CIMA portal",              freq:"Annual",        due:"31/07/2025", status:"Overdue",   owner:"Garry Crossan" },
      { id:4,  area:"AEOI",           title:"CRS return — CIMA portal",                freq:"Annual",        due:"31/07/2025", status:"Overdue",   owner:"Garry Crossan" },
      { id:5,  area:"Substance",      title:"ESR return — all in-scope entities",      freq:"Annual",        due:"12 months after year end", status:"On track",  owner:"Garry Crossan" },
      { id:6,  area:"BO register",    title:"Beneficial ownership register — CIMA",    freq:"On change",     due:"Ongoing",    status:"Current",   owner:"Garry Crossan" },
      { id:7,  area:"Annual returns", title:"Annual returns — Registrar of Companies", freq:"Annual",        due:"31/01/2026", status:"On track",  owner:"Garry Crossan" },
      { id:8,  area:"Funds",          title:"Mutual Fund annual return",                freq:"Annual",        due:"30/06/2025", status:"Overdue",   owner:"Garry Crossan" },
    ],
    entities: [
      { name:"Caledonian Ventures Ltd",   type:"Exempted Co",  risk:"Medium", administrator:"Garry Crossan", issues:0 },
      { name:"Pacific Wealth Trust",      type:"STAR Trust",   risk:"High",   administrator:"Garry Crossan", issues:1 },
      { name:"Apex Growth Fund Ltd",      type:"Exempted Co",  risk:"Very High",administrator:"Garry Crossan",issues:2 },
      { name:"Bluewater Family Trust",    type:"Ordinary Trust",risk:"Medium",administrator:"Garry Crossan", issues:0 },
      { name:"Riviera Trust",             type:"STAR Trust",   risk:"Medium", administrator:"Garry Crossan", issues:0 },
    ],
    amlKey: [
      ["MLRO",                "Gary Harrison (Group CCO)"],
      ["DMLRO — Cayman",      "Garry Crossan"],
      ["Screening provider",  "Worldcheck"],
      ["STR filing body",     "Financial Reporting Authority (FRA)"],
      ["Review cycles",       "VH: 6mo · H: 12mo · M: 18mo · S: 24mo"],
      ["EDD threshold",       "All VH + High risk + all PEPs"],
    ],
  },
  Malta: {
    name: "Malta",
    regulator: "Malta Financial Services Authority (MFSA)",
    legislation: ["Companies Act (Cap. 386)", "Foundations (Properties) Act", "Financial Intelligence Analysis Unit (FIAU) Regulations", "Prevention of Money Laundering Act (PMLA)", "Beneficial Ownership Registration Regulations 2020", "MFSA Conduct of Business Rulebook"],
    obligations: [
      { id:1,  area:"CSP licence",    title:"Authorisation as Trustee / Administrator",  freq:"Ongoing",  due:"30/09/2025", status:"Active",    owner:"Joanne Fenech" },
      { id:2,  area:"AML/CFT",        title:"Business risk assessment",                   freq:"Annual",   due:"31/12/2025", status:"On track",  owner:"Gary Harrison" },
      { id:3,  area:"AML/CFT",        title:"FIAU sectoral risk assessment update",       freq:"Annual",   due:"31/12/2025", status:"On track",  owner:"Gary Harrison" },
      { id:4,  area:"AEOI",           title:"CRS/FATCA return — MFSA portal",            freq:"Annual",   due:"31/07/2025", status:"Overdue",   owner:"Joanne Fenech" },
      { id:5,  area:"BO register",    title:"Beneficial ownership register — MFSA BROS", freq:"On change",due:"Ongoing",    status:"Current",   owner:"Joanne Fenech" },
      { id:6,  area:"Annual returns", title:"Annual returns — Malta Business Registry",   freq:"Annual",   due:"Within 42 days of anniversary", status:"On track", owner:"Joanne Fenech" },
      { id:7,  area:"Reporting",      title:"FIAU supervision annual report",             freq:"Annual",   due:"30/04/2026", status:"On track",  owner:"Gary Harrison" },
      { id:8,  area:"Data protection","title":"Data Protection Officer annual review",   freq:"Annual",   due:"31/10/2025", status:"On track",  owner:"Joanne Fenech" },
    ],
    entities: [
      { name:"Azure Mediterranean Fdn",   type:"Foundation",   risk:"Low",    administrator:"Joanne Fenech", issues:0 },
      { name:"Stonebridge Capital Ltd",    type:"Private Ltd",  risk:"Low",    administrator:"Joanne Fenech", issues:1 },
      { name:"Malta Ventures",             type:"Company",      risk:"Medium", administrator:"Joanne Fenech", issues:2, note:"Unregulated entity — AML/KYC pending" },
      { name:"Verano Maritime SA (pend.)", type:"Company",      risk:"Low",    administrator:"Joanne Fenech", issues:0 },
    ],
    amlKey: [
      ["MLRO",                 "Gary Harrison (Group CCO)"],
      ["DMLRO — Malta",        "Joanne Fenech"],
      ["Screening provider",   "Worldcheck"],
      ["STR filing body",      "Financial Intelligence Analysis Unit (FIAU)"],
      ["Review cycles",        "VH: 6mo · H: 12mo · M: 18mo · S: 24mo"],
      ["EDD threshold",        "All VH + High risk + all PEPs"],
    ],
  },
};

const statusC = {
  "On track":  { bg:"#EAF3DE", color:"#27500A" },
  "Active":    { bg:"#EAF3DE", color:"#27500A" },
  "Current":   { bg:"#EAF3DE", color:"#27500A" },
  "Overdue":   { bg:"#FCEBEB", color:"#A32D2D" },
  "Due soon":  { bg:"#FAEEDA", color:"#633806" },
};

const th = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"#f9f9f9" };
const td = { padding:"9px 12px", fontSize:11, borderBottom:"0.5px solid #e5e5e5" };

export default function AffinityJurisdictionCompliance() {
  const [jur, setJur]   = useState("Cayman");
  const [view, setView] = useState("overview");
  const [modal, setModal] = useState(null);

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };

  const data = JUR_INFO[jur];
  const overdueCount = data.obligations.filter(o=>o.status==="Overdue").length;

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"#f8f9fc", color:"#111", minHeight:"100vh" }}>
      <div style={{ background:NAVY, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          
          <span style={{ color:"#8892b0", fontSize:13 }}>Jurisdiction Compliance</span>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entity Admin","Compliance","Statutory"].map(n=><button key={n} style={{ ...nb, color:"#8892b0", borderColor:"#334" }}>{n}</button>)}
          <button style={nba}>Jurisdiction</button>
        </div>
      </div>

      {/* Jurisdiction switcher */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid #e5e5e5", padding:"10px 24px", display:"flex", gap:8, alignItems:"center" }}>
        <span style={{ fontSize:11, color:"#666", marginRight:4 }}>Jurisdiction:</span>
        {["Cayman","Malta"].map(j=>(
          <button key={j} onClick={()=>setJur(j)} style={{ padding:"6px 18px", borderRadius:20, border:`0.5px solid ${jur===j?"#ccc":"#e5e5e5"}`, background:jur===j?"#fff":"transparent", fontSize:12, fontWeight:jur===j?600:400, cursor:"pointer", color:jur===j?"#111":"#666" }}>
            {j==="Cayman"?"🇰🇾 Cayman Islands":"🇲🇹 Malta"}
            {jur===j&&overdueCount>0&&<span style={{ marginLeft:6, background:"#EF4444", color:"#fff", borderRadius:10, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{overdueCount}</span>}
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
          {["overview","obligations","entities","aml","legislation"].map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{ padding:"5px 12px", fontSize:11, borderRadius:20, border:`0.5px solid ${view===v?"#ccc":"#e5e5e5"}`, background:view===v?"#fff":"transparent", color:view===v?"#111":"#666", cursor:"pointer", fontWeight:view===v?500:400 }}>
              {{"overview":"Overview","obligations":"Obligations","entities":"Entities","aml":"AML framework","legislation":"Legislation"}[v]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background:"#fff", minHeight:"calc(100vh - 100px)", padding:"16px 24px" }}>

        {/* OVERVIEW */}
        {view==="overview"&&(
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
              {[
                { l:"Entities",         v:data.entities.length,                             c:CY },
                { l:"Obligations overdue", v:data.obligations.filter(o=>o.status==="Overdue").length, c:"#EF4444" },
                { l:"Issues flagged",   v:data.entities.reduce((s,e)=>s+e.issues,0),       c:"#F59E0B" },
                { l:"Regulator",        v:jur==="Cayman"?"CIMA":"MFSA",                     c:"#666" },
              ].map(k=>(
                <div key={k.l} style={{ background:"#f9f9f9", borderRadius:8, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:"#666", marginBottom:4 }}>{k.l}</div>
                  <div style={{ fontSize:20, fontWeight:700, color:k.c }}>{k.v}</div>
                </div>
              ))}
            </div>

            {overdueCount>0&&(
              <div style={{ background:"#FCEBEB22", border:"0.5px solid #EF4444", borderRadius:8, padding:"10px 14px", marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#A32D2D", marginBottom:6 }}>⚠️ Overdue obligations — {data.name}</div>
                {data.obligations.filter(o=>o.status==="Overdue").map(o=>(
                  <div key={o.id} style={{ fontSize:11, color:"#A32D2D", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"3px 0" }}>
                    <span>{o.title} · Due: {o.due} · Owner: {o.owner}</span>
                    <button style={{ ...nb, fontSize:10, borderColor:"#EF4444", color:"#EF4444" }}>Action ↗</button>
                  </div>
                ))}
              </div>
            )}

            {jur==="Malta"&&data.entities.find(e=>e.note)&&(
              <div style={{ background:"#FAEEDA22", border:"0.5px solid #F59E0B", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#633806" }}>
                ⚠️ <strong>Malta Ventures</strong> — unregulated Malta entity. AML/KYC onboarding not yet complete. This entity requires full compliance coverage despite being unregulated. Contact Joanne Fenech to progress.
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>Regulator — {data.name}</div>
                {[["Regulator",data.regulator],["MLRO",data.amlKey.find(([k])=>k==="MLRO")?.[1]||"—"],["DMLRO",data.amlKey.find(([k])=>k.includes("DMLRO"))?.[1]||"—"],["STR filing",data.amlKey.find(([k])=>k==="STR filing body")?.[1]||"—"]].map(([k,v])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:12 }}>
                    <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:500, textAlign:"right", maxWidth:220, fontSize:11 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>Entity overview</div>
                {data.entities.map(e=>(
                  <div key={e.name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"0.5px solid #f5f5f5" }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:500 }}>{e.name}</div>
                      <div style={{ fontSize:10, color:"#aaa" }}>{e.type} · {e.administrator}</div>
                    </div>
                    <div style={{ display:"flex", gap:6 }}>
                      <Badge label={e.risk} colors={{ Low:{bg:"#EAF3DE",color:"#27500A"}, Medium:{bg:"#FAEEDA",color:"#633806"}, High:{bg:"#FCEBEB",color:"#A32D2D"}, "Very High":{bg:"#F7C1C1",color:"#501313"} }[e.risk]||{bg:"#eee",color:"#666"}} />
                      {e.issues>0&&<Badge label={e.issues+" issue"+(e.issues>1?"s":"")} colors={{ bg:"#FCEBEB", color:"#A32D2D" }} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* OBLIGATIONS */}
        {view==="obligations"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>Regulatory obligations — {data.name}</div>
              <button style={nba} onClick={()=>setModal("addObligation")}>＋ Add obligation</button>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Area","Obligation","Frequency","Due","Owner","Status","Action"].map(h=><th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.obligations.map(o=>(
                  <tr key={o.id} style={{ borderBottom:"0.5px solid #f0f0f0", background:o.status==="Overdue"?"#FFF5F5":"transparent" }}>
                    <td style={td}><Badge label={o.area} colors={{ "AML/CFT":{bg:"#FCEBEB",color:"#A32D2D"}, AEOI:{bg:"#EEF0FB",color:"#3C3489"}, Substance:{bg:"#FAEEDA",color:"#633806"}, "BO register":{bg:"#EAF3DE",color:"#27500A"}, "Annual returns":{bg:"#E6F7FB",color:"#0077A8"}, "CSP licence":{bg:"#EAF3DE",color:"#27500A"}, Reporting:{bg:"#E6F7FB",color:"#0077A8"}, Funds:{bg:"#EEF0FB",color:"#3C3489"}, "Data protection":{bg:"#F1EFE8",color:"#555"} }[o.area]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...td, fontWeight:500 }}>{o.title}</td>
                    <td style={{ ...td, color:"#666", fontSize:10 }}>{o.freq}</td>
                    <td style={{ ...td, color:o.status==="Overdue"?"#EF4444":"#666", fontWeight:o.status==="Overdue"?600:400 }}>{o.due}</td>
                    <td style={{ ...td, color:"#666" }}>{o.owner}</td>
                    <td style={td}><Badge label={o.status} colors={statusC[o.status]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={td}>{o.status==="Overdue"?<button style={{ ...nb, fontSize:10, borderColor:"#EF4444", color:"#EF4444" }}>File ↗</button>:<button style={{ ...nb, fontSize:10 }}>View ↗</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ENTITIES */}
        {view==="entities"&&(
          <div>
            <div style={{ fontSize:12, fontWeight:500, marginBottom:14 }}>Entities — {data.name} ({data.entities.length})</div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Entity","Type","Risk","Administrator","Issues","Action"].map(h=><th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.entities.map(e=>(
                  <tr key={e.name} style={{ borderBottom:"0.5px solid #f0f0f0", background:e.issues>0?"#FFFBEB":"transparent" }}>
                    <td style={{ ...td, fontWeight:600 }}>
                      {e.name}
                      {e.note&&<div style={{ fontSize:9, color:"#F59E0B", fontWeight:400 }}>⚠️ {e.note}</div>}
                    </td>
                    <td style={{ ...td, color:"#666" }}>{e.type}</td>
                    <td style={td}><Badge label={e.risk} colors={{ Low:{bg:"#EAF3DE",color:"#27500A"}, Medium:{bg:"#FAEEDA",color:"#633806"}, High:{bg:"#FCEBEB",color:"#A32D2D"}, "Very High":{bg:"#F7C1C1",color:"#501313"} }[e.risk]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...td, color:"#666" }}>{e.administrator}</td>
                    <td style={td}>{e.issues>0?<Badge label={e.issues+" open"} colors={{ bg:"#FCEBEB", color:"#A32D2D" }} />:<span style={{ color:"#4CAF7D", fontSize:11 }}>✓ None</span>}</td>
                    <td style={td}><button style={{ ...nb, fontSize:10 }}>Open in Entity Admin ↗</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* AML FRAMEWORK */}
        {view==="aml"&&(
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>AML/CFT framework — {data.name}</div>
              {data.amlKey.map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:12 }}>
                  <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:500, textAlign:"right", maxWidth:220, fontSize:11 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>Jurisdiction-specific requirements</div>
              {jur==="Cayman"?[
                ["CIMA supervision tier","Tier B — Corporate / Trust Service Provider"],
                ["AML regulations","Anti-Money Laundering Regulations (as revised)"],
                ["CDD standard","Full CDD for all clients — no simplified available for CSPs"],
                ["PEP screening","Enhanced — all clients regardless of risk"],
                ["EDD requirement","All PEPs, HNW clients, and High/VH risk clients"],
                ["Transaction monitoring","Manual for now; Copilot integration Phase 2"],
                ["STR threshold","No minimum — file on suspicion"],
                ["Record retention","5 years post relationship end (minimum)"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:12 }}>
                  <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:500, textAlign:"right", maxWidth:220, fontSize:11 }}>{v}</span>
                </div>
              )):[
                ["FIAU supervision","Regulated as CSP and TrustCo"],
                ["AML regulations","PMLA and FIAU Implementing Procedures Part II"],
                ["CDD standard","Full CDD — all clients"],
                ["Simplified CDD","Not available for CSPs under Maltese law"],
                ["PEP screening","All clients — Enhanced where PEP status identified"],
                ["EDD requirement","All PEPs, cross-border correspondent relationships"],
                ["STR threshold","No minimum — file on reasonable suspicion"],
                ["Record retention","5 years from end of business relationship (Art. 28 PMLA)"],
                ["FIAU reporting","Annual supervisory report — due 30 April"],
                ["Data Protection","GDPR applies — DPO appointed — see System Admin"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:12 }}>
                  <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:500, textAlign:"right", maxWidth:220, fontSize:11 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEGISLATION */}
        {view==="legislation"&&(
          <div>
            <div style={{ fontSize:12, fontWeight:500, marginBottom:14 }}>Applicable legislation — {data.name}</div>
            <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:16 }}>
              {data.legislation.map((l,i)=>(
                <div key={i} style={{ display:"flex", gap:12, padding:"9px 0", borderBottom:"0.5px solid #f5f5f5", alignItems:"center" }}>
                  <span style={{ width:24, height:24, borderRadius:"50%", background:"#E6F7FB", color:CY, fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</span>
                  <span style={{ fontSize:12, fontWeight:500 }}>{l}</span>
                  <button style={{ ...nb, fontSize:10, marginLeft:"auto", flexShrink:0 }}>View ↗</button>
                </div>
              ))}
            </div>
            <div style={{ marginTop:14, background:"#f9f9f9", borderRadius:8, padding:"10px 14px", fontSize:11, color:"#666" }}>
              ℹ️ Legislation references are updated by the Group CCO as and when amendments are enacted. Changes that require operational action are flagged as compliance events. Contact Gary Harrison with any queries.
            </div>
          </div>
        )}
      </div>

      {modal&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"#fff", borderRadius:12, padding:24, width:440, maxWidth:"95vw" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15, fontWeight:600 }}>Add regulatory obligation</h3>
              <button onClick={()=>setModal(null)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
            </div>
            {[["Area","select",["AML/CFT","AEOI","Substance","BO register","Annual returns","Reporting","Other"]],["Title","text"],["Frequency","select",["Annual","Quarterly","Monthly","On change","Ongoing"]],["Due date","date"],["Owner","select",["Gary Harrison","Garry Crossan","Joanne Fenech","Andy Morgan"]]].map(([l,t,opts])=>(
              <div key={l} style={{ marginBottom:12 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#555", marginBottom:4 }}>{l}</label>
                {t==="select"?<select style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none" }}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>
                :<input type={t} style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none", boxSizing:"border-box" }} />}
              </div>
            ))}
            <button onClick={()=>setModal(null)} style={{ width:"100%", background:CY, color:"#fff", border:"none", borderRadius:8, padding:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
