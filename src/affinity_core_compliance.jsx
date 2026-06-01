import { useState } from "react";
const CY = "#00C4CC";
const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);
const nb  = { padding:"5px 12px", fontSize:12, borderRadius:6, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:700 };
const th  = { padding:"9px 14px", textAlign:"left", fontSize:11, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", whiteSpace:"nowrap" };
const td  = { padding:"9px 14px", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderBottom:"0.5px solid #e5e5e5" };
const sc  = { background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 14px" };
const card = { background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:10, padding:16, marginBottom:14 };

const VIEWS = ["overview","csp","aml","reporting","breaches","training"];
const VLABELS = ["Overview","CSP licence","AML/CFT framework","Regulatory reporting","Breach log","Staff training"];

const entities = [
  { id:1, name:"Meridian Holdings Ltd",    ref:"AC-2024-001", type:"Company", risk:"Medium", reviewer:"Roxy Sheeley",   nextReview:"14/09/2025", status:"Due this month" },
  { id:2, name:"Harrington Family Trust",  ref:"AC-2019-014", type:"Trust",   risk:"High",   reviewer:"Gary Harrison",  nextReview:"05/01/2025", status:"Overdue" },
  { id:3, name:"North Star Holdings Ltd",  ref:"AC-2016-003", type:"Company", risk:"High",   reviewer:"Gary Harrison",  nextReview:"30/03/2025", status:"Overdue" },
  { id:4, name:"Rosewood Legacy Trust",    ref:"AC-2021-027", type:"Trust",   risk:"Medium", reviewer:"Roxy Sheeley",   nextReview:"25/03/2026", status:"Upcoming" },
  { id:5, name:"Thornbury Asset Co Ltd",   ref:"AC-2017-055", type:"Company", risk:"Medium", reviewer:"Neil Kelly",     nextReview:"03/07/2026", status:"Upcoming" },
];

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
  { name:"Gary Harrison",  role:"CCO",             aml:"20/01/2025", csp:"10/02/2025", refreshDue:"20/01/2026", status:"Current" },
  { name:"Sarah Cole",     role:"Administrator",   aml:"10/02/2025", csp:"10/02/2025", refreshDue:"10/02/2026", status:"Current" },
  { name:"Neil Kelly",     role:"CFO",             aml:"15/01/2025", csp:"N/A",        refreshDue:"15/01/2026", status:"Current" },
  { name:"Andy Morgan",    role:"CEO",             aml:"15/01/2025", csp:"10/02/2025", refreshDue:"15/01/2026", status:"Current" },
];

export default function AffinityIOMCompliance() {
  const [view, setView] = useState("overview");
  const [modal, setModal] = useState(null);
  const fg = { display:"flex", flexDirection:"column", gap:3, marginBottom:12 };
  const fgl = { fontSize:11, color:"#666" };
  const fgi = { fontSize:13, borderRadius:6, border:"0.5px solid #ccc", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", padding:"0 10px", height:34, outline:"none" };

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
        <div style={{ fontSize:18, fontWeight:500, color:CY }}>Affinity <span style={{ color:"var(--text-primary,#111)", fontWeight:400 }}>Core</span><small style={{ fontSize:11, color:"#999", fontWeight:400, marginLeft:8 }}>Isle of Man — Compliance Framework</small></div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <Badge label="IOMFSA Regulated" colors={{ bg:"#E6F7FB", color:"#0077A8" }} />
          <Badge label="CSP Licence Active" colors={{ bg:"#EAF3DE", color:"#27500A" }} />
        </div>
      </div>
      <div style={{ display:"flex", gap:4, padding:"10px 20px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", flexWrap:"wrap" }}>
        {VIEWS.map((v,i)=><button key={v} style={{ padding:"5px 14px", fontSize:12, borderRadius:20, border:`0.5px solid ${view===v?"#ccc":"#e5e5e5"}`, background:view===v?"var(--bg-primary,#fff)":"transparent", color:view===v?"var(--text-primary,#111)":"#666", cursor:"pointer", fontWeight:view===v?600:400 }} onClick={()=>setView(v)}>{VLABELS[i]}</button>)}
      </div>

      {view==="overview"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
            {[{l:"IOM entities",v:5,c:CY},{l:"CSP licence status",v:"Active",c:"#4CAF7D"},{l:"Overdue reviews",v:2,c:"#EF4444"},{l:"Open breaches",v:2,c:"#F59E0B"}].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:11, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:20, fontWeight:700, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12 }}>IOM regulatory framework</div>
              {[
                ["Regulator","Isle of Man Financial Services Authority (IOMFSA)"],
                ["Licence type","Corporate & Trust Service Provider (CSP)"],
                ["Licence number","XXXXXX (update in System Admin)"],
                ["Registered entity","Affinity Group Ltd"],
                ["Registered office","2nd Floor, 14 Athol Street, Douglas, IM1 1JA"],
                ["MLRO","Gary Harrison"],
                ["Compliance officer","Gary Harrison"],
                ["AML legislation","Proceeds of Crime Act 2008, Anti-Money Laundering Code 2019"],
                ["Key obligation","Risk-based AML/CFT, periodic reviews, suspicious activity reporting"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12, gap:12 }}>
                  <span style={{ color:"#666", flexShrink:0 }}>{k}</span>
                  <span style={{ fontWeight:500, textAlign:"right" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12 }}>IOM entity review schedule</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>
                  <th style={th}>Entity</th><th style={th}>Risk</th><th style={th}>Next review</th><th style={th}>Status</th>
                </tr></thead>
                <tbody>
                  {entities.map(e=>(
                    <tr key={e.id} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                      <td style={td}><div style={{ fontWeight:600, fontSize:12 }}>{e.name}</div></td>
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
                ["Compliance contact","Gary Harrison (CCO)"],
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
                ["MLRO appointed and notified to IOMFSA","✓ Gary Harrison"],
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
              {reportingObs.map(r=>(
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
          {breachLog.map(b=>(
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
              {training.map((t,i)=>(
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

      {modal&&(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(13,27,42,0.45)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:40, zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"var(--bg-primary,#fff)", borderRadius:10, border:"0.5px solid #e5e5e5", padding:22, width:480, maxWidth:"96vw" }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:18 }}>{modal==="breach"?"Log compliance breach / incident":"Record staff training"}</div>
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
              <div style={fg}><label style={fgl}>Staff member</label><select style={fgi}><option>Roxy Sheeley</option><option>Gary Harrison</option><option>Sarah Cole</option><option>Neil Kelly</option><option>Andy Morgan</option></select></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div style={fg}><label style={fgl}>Training type</label><select style={fgi}><option>AML/CFT awareness</option><option>CSP obligations</option><option>MLRO refresher</option><option>PEP training</option><option>Sanctions training</option></select></div>
                <div style={fg}><label style={fgl}>Date completed</label><input style={fgi} placeholder="DD/MM/YYYY" /></div>
                <div style={fg}><label style={fgl}>Provider</label><input style={fgi} placeholder="e.g. ICA, internal" /></div>
                <div style={fg}><label style={fgl}>Next refresh due</label><input style={fgi} placeholder="DD/MM/YYYY" /></div>
              </div>
            </>}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
              <button style={{ background:"transparent", border:"0.5px solid #ccc", color:"var(--text-primary,#111)", padding:"7px 18px", borderRadius:6, fontSize:12, cursor:"pointer" }} onClick={()=>setModal(null)}>Cancel</button>
              <button style={{ background:CY, color:"#fff", border:"none", padding:"7px 18px", borderRadius:6, fontSize:12, fontWeight:700, cursor:"pointer" }} onClick={()=>setModal(null)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
