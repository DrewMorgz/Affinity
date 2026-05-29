import { useState } from "react";
const CY = "#00B4D8";
const NAVY = "#0D1B2A";

const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);

const LICENCES = [
  { id:1, entity:"Phoenix eGaming Ltd",       type:"B2C",  subtype:"Casino",          ref:"GSC-2025-0441", status:"Application — stage 2", issued:null,         expiry:null,         admin:"Roxy Sheeley",  risk:"High",   notes:"IIF submitted. Awaiting OGRA suitability decision." },
  { id:2, entity:"Meridian Digital Ltd",       type:"B2B",  subtype:"Platform supply", ref:"GSC-2023-0218", status:"Live",                  issued:"01/06/2023",  expiry:"31/05/2026", admin:"Roxy Sheeley",  risk:"Medium", notes:"Annual OGRA return due November 2025." },
  { id:3, entity:"Neptune Interactive Ltd",    type:"B2C",  subtype:"Sports betting",  ref:"GSC-2022-0104", status:"Live",                  issued:"14/03/2022",  expiry:"13/03/2025", admin:"Roxy Sheeley",  risk:"High",   notes:"⚠️ Renewal overdue — contact OGRA immediately." },
  { id:4, entity:"Apex Gaming Solutions Ltd",  type:"B2B",  subtype:"Software supply", ref:"GSC-2024-0312", status:"Under review",           issued:null,         expiry:null,         admin:"Roxy Sheeley",  risk:"Medium", notes:"Business plan queries raised by OGRA. Response drafted." },
];

const OGRA_CHECKLIST = {
  1: [
    { step:1, title:"Operator information form (OIF)",              status:"Complete",    date:"01/03/2025", owner:"Roxy Sheeley",  notes:"Submitted with full corporate structure." },
    { step:2, title:"Business plan — 3 year projection",            status:"Complete",    date:"15/03/2025", owner:"Roxy Sheeley",  notes:"Approved by Andy Morgan." },
    { step:3, title:"System technical standards certification",     status:"In progress", date:null,         owner:"Roxy Sheeley",  notes:"Awaiting GLI test report from client." },
    { step:4, title:"RNG / game certification",                     status:"Pending",     date:null,         owner:"Roxy Sheeley",  notes:"Dependent on step 3." },
    { step:5, title:"Responsible gambling policy",                  status:"Complete",    date:"01/04/2025", owner:"Gary Harrison", notes:"Policy reviewed and approved." },
    { step:6, title:"AML/CFT policy",                               status:"Complete",    date:"01/04/2025", owner:"Gary Harrison", notes:"Standard Affinity AML policy adopted." },
    { step:7, title:"Suitability assessment — directors and UBOs",  status:"In progress", date:null,         owner:"Gary Harrison", notes:"Two directors cleared. One director pending police certificate." },
    { step:8, title:"Financial resources — bank evidence",          status:"Complete",    date:"10/04/2025", owner:"Neil Kelly",    notes:"Bank confirmation letter provided." },
    { step:9, title:"IT and security assessment",                   status:"Pending",     date:null,         owner:"Roxy Sheeley",  notes:"Penetration test scheduled for August." },
    { step:10,title:"OGRA suitability decision",                    status:"Pending",     date:null,         owner:"OGRA",          notes:"Awaiting OGRA confirmation. ETA unknown." },
  ],
};

const ANNUAL_RETURNS = [
  { id:1, entity:"Meridian Digital Ltd",     ref:"GSC-2023-0218", due:"30/11/2025", status:"Upcoming",  admin:"Roxy Sheeley",  items:["Audited accounts","Updated compliance report","RNG test certificate","Responsible gambling stats"] },
  { id:2, entity:"Neptune Interactive Ltd",  ref:"GSC-2022-0104", due:"13/03/2025", status:"Overdue",   admin:"Roxy Sheeley",  items:["Audited accounts","Renewal application","All suitability docs — directors"] },
];

const COMPLIANCE_LOG = [
  { id:1, entity:"Meridian Digital Ltd",    date:"14/07/2025", type:"Player complaint",      status:"Closed",      detail:"Complaint resolved within 48 hours per licence condition 7.3." },
  { id:2, entity:"Neptune Interactive Ltd", date:"05/06/2025", type:"Licence breach",        status:"Open",        detail:"⚠️ Licence lapsed — no renewal filed. OGRA notified. Urgent." },
  { id:3, entity:"Apex Gaming Solutions",   date:"20/05/2025", type:"OGRA query response",  status:"In progress", detail:"Business plan queries under consideration. Response due 25/07/2025." },
  { id:4, entity:"Meridian Digital Ltd",    date:"01/04/2025", type:"AML/KYC review",        status:"Closed",      detail:"Annual AML review completed. No issues raised." },
];

const statusC = {
  "Live":            { bg:"#EAF3DE", color:"#27500A" },
  "Application — stage 2": { bg:"#E6F7FB", color:"#0077A8" },
  "Under review":    { bg:"#FAEEDA", color:"#633806" },
  "Upcoming":        { bg:"#E6F7FB", color:"#0077A8" },
  "Overdue":         { bg:"#FCEBEB", color:"#A32D2D" },
  "Complete":        { bg:"#EAF3DE", color:"#27500A" },
  "In progress":     { bg:"#E6F7FB", color:"#0077A8" },
  "Pending":         { bg:"#F5F5F5", color:"#757575" },
  "Open":            { bg:"#FCEBEB", color:"#A32D2D" },
  "Closed":          { bg:"#EAF3DE", color:"#27500A" },
};

const VIEWS = ["overview","licences","applications","returns","compliance"];
const VLBLS = ["Overview","Licence register","Applications","Annual returns","Compliance log"];

const th = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"#f9f9f9", whiteSpace:"nowrap" };
const td = { padding:"9px 12px", fontSize:11, borderBottom:"0.5px solid #e5e5e5", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" };

export default function AffinityEGaming() {
  const [view, setView]   = useState("overview");
  const [sel, setSel]     = useState(null);
  const [modal, setModal] = useState(null);

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };

  const selLic   = LICENCES.find(l => l.id === sel);
  const checklist = sel ? (OGRA_CHECKLIST[sel] || []) : [];

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", background:"#f8f9fc", color:"#111", minHeight:"100vh" }}>
      <div style={{ background:NAVY, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ color:"#fff", fontWeight:700, fontSize:17 }}>Affinity <span style={{ fontWeight:300 }}>Core</span></span>
          <span style={{ color:"#8892b0", fontSize:13 }}>eGaming & OGRA Licensing</span>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entity Admin","Compliance","Statutory"].map(n=><button key={n} style={{ ...nb, color:"#8892b0", borderColor:"#334" }}>{n}</button>)}
          <button style={nba}>eGaming</button>
          <button style={{ ...nba, background:"#4CAF7D", borderColor:"#4CAF7D" }} onClick={()=>setModal("newLic")}>＋ New licence</button>
        </div>
      </div>

      <div style={{ background:"#fff", borderBottom:"0.5px solid #e5e5e5", padding:"0 24px", display:"flex", gap:2 }}>
        {VIEWS.map((v,i)=>(
          <button key={v} onClick={()=>setView(v)} style={{ padding:"10px 14px", fontSize:12, border:"none", borderBottom:`2px solid ${view===v?CY:"transparent"}`, background:"transparent", color:view===v?CY:"#666", cursor:"pointer", fontWeight:view===v?600:400 }}>{VLBLS[i]}
            {v==="returns"&&ANNUAL_RETURNS.filter(r=>r.status==="Overdue").length>0&&<span style={{ marginLeft:4, background:"#EF4444", color:"#fff", borderRadius:10, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{ANNUAL_RETURNS.filter(r=>r.status==="Overdue").length}</span>}
          </button>
        ))}
      </div>

      <div style={{ background:"#fff", minHeight:"calc(100vh - 89px)", padding:"16px 24px" }}>

        {/* OVERVIEW */}
        {view==="overview"&&(
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
              {[
                { l:"Live licences",     v:LICENCES.filter(l=>l.status==="Live").length,         c:"#4CAF7D" },
                { l:"Applications open", v:LICENCES.filter(l=>l.status.includes("Application")||l.status==="Under review").length, c:CY },
                { l:"Returns overdue",   v:ANNUAL_RETURNS.filter(r=>r.status==="Overdue").length, c:"#EF4444" },
                { l:"Compliance issues", v:COMPLIANCE_LOG.filter(c=>c.status==="Open").length,    c:"#F59E0B" },
              ].map(k=>(
                <div key={k.l} style={{ background:"#f9f9f9", borderRadius:8, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:"#666", marginBottom:4 }}>{k.l}</div>
                  <div style={{ fontSize:22, fontWeight:700, color:k.c }}>{k.v}</div>
                </div>
              ))}
            </div>

            {ANNUAL_RETURNS.filter(r=>r.status==="Overdue").length>0&&(
              <div style={{ background:"#FCEBEB22", border:"0.5px solid #EF4444", borderRadius:8, padding:"10px 14px", marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#A32D2D", marginBottom:6 }}>⚠️ Licence renewal overdue — immediate action required</div>
                {ANNUAL_RETURNS.filter(r=>r.status==="Overdue").map(r=>(
                  <div key={r.id} style={{ fontSize:11, color:"#A32D2D", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span>{r.entity} — {r.ref} — due {r.due}</span>
                    <button style={{ ...nba, background:"#EF4444", borderColor:"#EF4444", fontSize:10 }}>Take action ↗</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>Licence register summary</div>
                {LICENCES.map(l=>(
                  <div key={l.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"0.5px solid #f5f5f5", cursor:"pointer" }} onClick={()=>{ setSel(l.id); setView("licences"); }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:500 }}>{l.entity}</div>
                      <div style={{ fontSize:10, color:"#aaa", marginTop:2 }}>{l.type} — {l.subtype} · {l.ref}</div>
                    </div>
                    <Badge label={l.status} colors={statusC[l.status]||{bg:"#eee",color:"#666"}} />
                  </div>
                ))}
              </div>
              <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>OGRA key obligations — IOM</div>
                {[
                  ["Regulator","Isle of Man Gambling Supervision Commission (OGRA / GSC)"],
                  ["Legislation","Online Gambling Regulation Act 2001 (as amended)"],
                  ["Licence types","B2C (player-facing), B2B (platform/software supply)"],
                  ["Annual return","Required 6 months after year end"],
                  ["AML obligation","Full AML/CFT policy required; OGRA-specific procedures"],
                  ["Responsible gambling","RG policy, self-exclusion register, and affordability checks required"],
                  ["Technical standards","Systems must meet OGRA technical standards; third-party cert required"],
                  ["Suitability","All directors and 10%+ shareholders subject to suitability assessment"],
                ].map(([k,v])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:11 }}>
                    <span style={{ color:"#666", flexShrink:0, marginRight:10 }}>{k}</span>
                    <span style={{ fontWeight:400, textAlign:"right", fontSize:10, color:"#444" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* LICENCE REGISTER */}
        {view==="licences"&&(
          <div style={{ display:"flex", height:"calc(100vh - 120px)" }}>
            <div style={{ width:320, borderRight:"0.5px solid #e5e5e5", overflowY:"auto" }}>
              {LICENCES.map(l=>(
                <div key={l.id} onClick={()=>setSel(l.id)} style={{ padding:"12px 14px", borderBottom:"0.5px solid #f0f0f0", cursor:"pointer", background:sel===l.id?"#f0f8fb":"transparent", borderLeft:`3px solid ${sel===l.id?CY:"transparent"}` }}>
                  <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>{l.entity}</div>
                  <div style={{ display:"flex", gap:6, marginBottom:4 }}>
                    <Badge label={l.type} colors={{ bg:"#EEF0FB", color:"#3C3489" }} />
                    <Badge label={l.status} colors={statusC[l.status]||{bg:"#eee",color:"#666"}} />
                  </div>
                  <div style={{ fontSize:10, color:"#aaa" }}>{l.ref} · {l.admin}</div>
                </div>
              ))}
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
              {!selLic ? <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#bbb", fontSize:13 }}>Select a licence</div> : (
                <>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                    <div>
                      <h2 style={{ margin:"0 0 6px", fontSize:18, fontWeight:700 }}>{selLic.entity}</h2>
                      <div style={{ display:"flex", gap:8 }}>
                        <Badge label={selLic.type+" — "+selLic.subtype} colors={{ bg:"#EEF0FB", color:"#3C3489" }} />
                        <Badge label={selLic.status} colors={statusC[selLic.status]||{bg:"#eee",color:"#666"}} />
                        <Badge label={selLic.risk+" risk"} colors={{ High:{bg:"#FCEBEB",color:"#A32D2D"}, Medium:{bg:"#FAEEDA",color:"#633806"} }[selLic.risk+" risk"]||{bg:"#eee",color:"#666"}} />
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6 }}>
                      <button style={nb}>Documents in DMS ↗</button>
                      <button style={nba}>Update record</button>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
                    <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>Licence details</div>
                      {[["Reference",selLic.ref],["Licence type",selLic.type+" — "+selLic.subtype],["Date issued",selLic.issued||"Not yet issued"],["Expiry",selLic.expiry||"N/A"],["Administrator",selLic.admin]].map(([k,v])=>(
                        <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:12 }}>
                          <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:500 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>Notes</div>
                      <div style={{ fontSize:12, color:"#444", lineHeight:1.6 }}>{selLic.notes}</div>
                    </div>
                  </div>
                  {checklist.length>0&&(
                    <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:12 }}>OGRA application checklist</div>
                      {checklist.map(c=>(
                        <div key={c.step} style={{ display:"flex", gap:12, padding:"8px 0", borderBottom:"0.5px solid #f5f5f5" }}>
                          <div style={{ width:22, height:22, borderRadius:"50%", background:c.status==="Complete"?"#4CAF7D":c.status==="In progress"?CY:"#f0f0f0", color:c.status==="Complete"||c.status==="In progress"?"#fff":"#aaa", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, flexShrink:0, marginTop:1 }}>{c.status==="Complete"?"✓":c.step}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:500 }}>{c.title}</div>
                            <div style={{ fontSize:10, color:"#aaa", marginTop:2 }}>{c.owner}{c.date?" · "+c.date:""} {c.notes&&"— "+c.notes}</div>
                          </div>
                          <Badge label={c.status} colors={statusC[c.status]||{bg:"#eee",color:"#666"}} />
                        </div>
                      ))}
                      <div style={{ marginTop:12, fontSize:11, color:"#666" }}>
                        {checklist.filter(c=>c.status==="Complete").length} of {checklist.length} steps complete
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* APPLICATIONS */}
        {view==="applications"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>Active OGRA applications</div>
              <button style={nba} onClick={()=>setModal("newApp")}>＋ New application</button>
            </div>
            {LICENCES.filter(l=>!["Live"].includes(l.status)).map(l=>(
              <div key={l.id} style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:16, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600 }}>{l.entity}</div>
                    <div style={{ fontSize:11, color:"#666", marginTop:2 }}>{l.type} — {l.subtype} · {l.ref} · {l.admin}</div>
                  </div>
                  <Badge label={l.status} colors={statusC[l.status]||{bg:"#eee",color:"#666"}} />
                </div>
                <div style={{ fontSize:12, color:"#444", marginBottom:12 }}>{l.notes}</div>
                {OGRA_CHECKLIST[l.id]&&(
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:12 }}>
                    {OGRA_CHECKLIST[l.id].map(c=>(
                      <div key={c.step} title={c.title} style={{ width:28, height:28, borderRadius:"50%", background:c.status==="Complete"?"#4CAF7D":c.status==="In progress"?CY:"#f0f0f0", color:c.status==="Complete"||c.status==="In progress"?"#fff":"#aaa", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, cursor:"pointer" }}>
                        {c.status==="Complete"?"✓":c.step}
                      </div>
                    ))}
                    <span style={{ fontSize:11, color:"#aaa", alignSelf:"center", marginLeft:4 }}>{OGRA_CHECKLIST[l.id].filter(c=>c.status==="Complete").length}/{OGRA_CHECKLIST[l.id].length} steps done</span>
                  </div>
                )}
                <div style={{ display:"flex", gap:6 }}>
                  <button style={nb} onClick={()=>{ setSel(l.id); setView("licences"); }}>View checklist ↗</button>
                  <button style={nba}>Update status</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ANNUAL RETURNS */}
        {view==="returns"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>OGRA annual returns & renewals</div>
              <button style={nba} onClick={()=>setModal("return")}>＋ Log filing</button>
            </div>
            {ANNUAL_RETURNS.map(r=>(
              <div key={r.id} style={{ background:"#fff", border:`0.5px solid ${r.status==="Overdue"?"#EF4444":"#e5e5e5"}`, borderRadius:10, padding:16, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600 }}>{r.entity}</div>
                    <div style={{ fontSize:11, color:"#666", marginTop:2 }}>{r.ref} · {r.admin} · Due: <span style={{ color:r.status==="Overdue"?"#EF4444":"#666", fontWeight:600 }}>{r.due}</span></div>
                  </div>
                  <Badge label={r.status} colors={statusC[r.status]||{bg:"#eee",color:"#666"}} />
                </div>
                <div style={{ fontSize:11, fontWeight:600, marginBottom:6, color:"#666" }}>Required documents:</div>
                {r.items.map((item,i)=>(
                  <div key={i} style={{ fontSize:11, color:"#444", padding:"4px 0", display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ color:r.status==="Overdue"?"#EF4444":CY }}>•</span>{item}
                  </div>
                ))}
                <div style={{ display:"flex", gap:6, marginTop:12 }}>
                  <button style={nb}>Generate return document ↗</button>
                  {r.status==="Overdue"?<button style={{ ...nba, background:"#EF4444", borderColor:"#EF4444" }}>File now — urgent</button>:<button style={nba}>Prepare filing</button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* COMPLIANCE LOG */}
        {view==="compliance"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:500 }}>eGaming compliance events</div>
              <button style={nba} onClick={()=>setModal("logEvent")}>＋ Log event</button>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Entity","Date","Type","Status","Detail","Action"].map(h=><th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {COMPLIANCE_LOG.map(c=>(
                  <tr key={c.id} style={{ borderBottom:"0.5px solid #f0f0f0", background:c.status==="Open"?"#FFF5F5":"transparent" }}>
                    <td style={{ ...td, fontWeight:500 }}>{c.entity}</td>
                    <td style={{ ...td, color:"#666" }}>{c.date}</td>
                    <td style={td}><Badge label={c.type} colors={{ "Licence breach":{bg:"#FCEBEB",color:"#A32D2D"}, "Player complaint":{bg:"#FAEEDA",color:"#633806"}, "AML/KYC review":{bg:"#EAF3DE",color:"#27500A"}, "OGRA query response":{bg:"#E6F7FB",color:"#0077A8"} }[c.type]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={td}><Badge label={c.status} colors={statusC[c.status]||{bg:"#eee",color:"#666"}} /></td>
                    <td style={{ ...td, maxWidth:300, whiteSpace:"normal", fontSize:10, color:"#444", lineHeight:1.4 }}>{c.detail}</td>
                    <td style={td}>{c.status==="Open"?<button style={{ ...nba, fontSize:10 }}>Resolve ↗</button>:<button style={{ ...nb, fontSize:10 }}>View ↗</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"#fff", borderRadius:12, padding:24, width:460, maxWidth:"95vw" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15, fontWeight:600 }}>
                {modal==="newLic"?"New licence record":modal==="newApp"?"New OGRA application":modal==="return"?"Log annual return filing":"Log compliance event"}
              </h3>
              <button onClick={()=>setModal(null)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
            </div>
            {[["Entity","select",["Phoenix eGaming Ltd","Meridian Digital Ltd","Neptune Interactive Ltd","Apex Gaming Solutions Ltd"]],["Licence type","select",["B2C — Casino","B2C — Sports betting","B2C — Poker","B2B — Platform supply","B2B — Software supply"]],["Reference / GSC number","text"],["Notes","text"]].map(([l,t,opts])=>(
              <div key={l} style={{ marginBottom:12 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#555", marginBottom:4 }}>{l}</label>
                {t==="select"?<select style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none" }}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>
                :<input style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none", boxSizing:"border-box" }} />}
              </div>
            ))}
            <button onClick={()=>setModal(null)} style={{ width:"100%", background:CY, color:"#fff", border:"none", borderRadius:8, padding:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
