import { useState, useEffect } from "react";
import EntitySearch from "./affinity_entity_search";
import { isConfigured } from "./affinity_accounting_supabase";
import { onboardingCases, attritionCases } from "./affinity_onboarding_api";
const CY = "#00C4CC";
const Badge = ({ label, colors }) => (<span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>);
const th = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", whiteSpace:"nowrap" };
const td = { padding:"8px 12px", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderBottom:"0.5px solid #e5e5e5" };

const CASES = [
  { id:1,  name:"Pinnacle Trading Ltd",        type:"Company",    jur:"Isle of Man",    admin:"Roxy Sheeley",   stage:"KYC collection",      pct:35,  started:"01/07/2025", target:"15/08/2025", status:"In progress", risk:"Medium", overdue:false,
    stages:["New business snapshot","Approval-in-principle","Portal invitation sent","KYC collection","Compliance review","LOE & fee setup","Entity setup","Final sign-off"],
    done:[true,true,true,false,false,false,false,false],
    docs:{ received:["Passport — director","Certificate of incorporation"], outstanding:["Address evidence — director","Source of funds questionnaire","Shareholder register"] }
  },
  { id:2,  name:"Solaris Family Trust",         type:"Trust",      jur:"Cayman Islands", admin:"Garry Crossan",  stage:"Compliance review",   pct:65,  started:"10/06/2025", target:"30/07/2025", status:"Overdue",     risk:"High",   overdue:true,
    stages:["New business snapshot","Approval-in-principle","Portal invitation sent","KYC collection","Compliance review","LOE & fee setup","Entity setup","Final sign-off"],
    done:[true,true,true,true,false,false,false,false],
    docs:{ received:["Trust deed","Trustee certificate","Settlor passport","Beneficiary passports"], outstanding:["EDD documentation","Source of wealth evidence"] }
  },
  { id:3,  name:"Verona Digital Holdings Ltd",  type:"Company",    jur:"Malta",          admin:"Joanne Fenech",  stage:"LOE & fee setup",     pct:80,  started:"15/05/2025", target:"25/07/2025", status:"In progress", risk:"Medium", overdue:false,
    stages:["New business snapshot","Approval-in-principle","Portal invitation sent","KYC collection","Compliance review","LOE & fee setup","Entity setup","Final sign-off"],
    done:[true,true,true,true,true,false,false,false],
    docs:{ received:["All KYC complete"], outstanding:["Signed LOE"] }
  },
  { id:4,  name:"Beaumont Wealth Structures",   type:"Foundation", jur:"Cayman Islands", admin:"Garry Crossan",  stage:"Entity setup",         pct:90,  started:"01/05/2025", target:"20/07/2025", status:"In progress", risk:"Low",   overdue:false,
    stages:["New business snapshot","Approval-in-principle","Portal invitation sent","KYC collection","Compliance review","LOE & fee setup","Entity setup","Final sign-off"],
    done:[true,true,true,true,true,true,false,false],
    docs:{ received:["All KYC and LOE complete"], outstanding:[] }
  },
  { id:5,  name:"Osprey Aviation Partners Ltd", type:"Company",    jur:"Cayman Islands", admin:"Andy Morgan",    stage:"New business",         pct:10,  started:"10/07/2025", target:"01/09/2025", status:"In progress", risk:"Medium", overdue:false,
    stages:["New business snapshot","Approval-in-principle","Portal invitation sent","KYC collection","Compliance review","LOE & fee setup","Entity setup","Final sign-off"],
    done:[true,false,false,false,false,false,false,false],
    docs:{ received:[], outstanding:["All KYC pending — portal not yet sent"] }
  },
];

const ATTRITION = [
  { id:1, name:"North Star Holdings Ltd", type:"Liquidation",  admin:"Roxy Sheeley",  stage:"CFO sign-off", started:"15/01/2025", status:"Pending", approvals:{ manager:"✓", director:"✓", md:"✓", cfo:"Pending" } },
  { id:2, name:"Thornbury Asset Co Ltd",  type:"Transfer out", admin:"Neil Kelly",    stage:"Director approval", started:"01/06/2025", status:"Pending", approvals:{ manager:"✓", director:"Pending", md:"Not started", cfo:"Not started" } },
];

const officeColors = {
  "Isle of Man":    { bg:"#E6F7FB", color:"#0077A8" },
  "Malta":          { bg:"#EEF0FB", color:"#3C3489" },
  "Cayman Islands": { bg:"#E6EEF7", color:"#0D4A7A" },
};
const jurShort = { "Isle of Man":"IOM","Malta":"MLT","Cayman Islands":"CYM" };

const VIEWS = ["pipeline","active","transfer","attrition","portal"];
const VLABELS = ["Overview","Active onboardings","Transfer-in","Attrition","Client portal"];

export default function AffinityOnboarding({ initialView , onNav }) {
  const [entitySearch, setEntitySearch] = useState("");
  const [view, setView]   = useState(initialView || "pipeline");
  const [live, setLive]   = useState(null);
  const STAGES8 = ["New business snapshot","Approval-in-principle","Portal invitation sent","KYC collection","Compliance review","LOE & fee setup","Entity setup","Final sign-off"];

  useEffect(()=>{
    if(!isConfigured) return;
    let ok=true;
    Promise.all([onboardingCases(), attritionCases()]).then(([c,a])=>{
      if(!ok) return;
      setLive({
        cases:(c.data||[]).map(x=>({ id:x.id, name:x.name, type:x.type, jur:x.jur, admin:x.admin, stage:x.stage,
          pct:x.pct, started:x.started, target:x.target, status:x.status, risk:x.risk, overdue:x.overdue,
          stages:STAGES8, docs:{ received:x.docs_received||[], outstanding:x.docs_outstanding||[] } })),
        attrition:(a.data||[]).map(x=>({ id:x.id, name:x.name, type:x.type, admin:x.admin, stage:x.stage,
          started:x.started, status:x.status, approvals:{ manager:x.appr_manager, director:x.appr_director, md:x.appr_md, cfo:x.appr_cfo } })),
      });
    }).catch(()=>{});
    return ()=>{ok=false;};
  },[]);

  const cases     = (live && live.cases.length)     ? live.cases     : CASES;
  const attrition = (live && live.attrition.length) ? live.attrition : ATTRITION;
  // When user lands here via the Attrition sidebar entry, only the
  // Attrition tab is shown — everything else stripped from the nav.
  const isAttritionOnly = initialView === "attrition";
  const visibleViews = isAttritionOnly ? ["attrition"] : VIEWS.filter(v => v !== "attrition");
  const visibleLabels = visibleViews.map(v => VLABELS[VIEWS.indexOf(v)]);
  const [sel, setSel]     = useState(null);
  const [modal, setModal] = useState(null);

  const selCase = sel ? cases.find(c=>c.id===sel) : null;
  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };
  const sc  = { background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 12px" };

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
        <div style={{ fontSize:18, fontWeight:500, color:"#001242" }}>Onboarding</div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entities","Compliance","Documents","Invoicing"].map(n=><button key={n} style={nb} onClick={()=>onNav&&onNav({Entities:"entities",Compliance:"compliance",Timesheets:"timesheets",Invoicing:"invoicing",Reporting:"reporting",Documents:"documents",Bookkeeping:"bookkeeping"}[n])}>{n}</button>)}
          <button style={nba}>Onboarding</button>
        </div>
      </div>
      {/* Entity search — same component on every page showing client data */}
      <div style={{ padding:"10px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-primary,#fff)" }}>
        <EntitySearch value={entitySearch} onChange={setEntitySearch} compact />
      </div>

      <div style={{ display:"flex", gap:4, padding:"8px 20px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", flexWrap:"wrap" }}>
        {visibleViews.map((v,i)=><button key={v} style={{ padding:"4px 12px", fontSize:11, borderRadius:20, border:`0.5px solid ${view===v?"#ccc":"#e5e5e5"}`, background:view===v?"var(--bg-primary,#fff)":"transparent", color:view===v?"var(--text-primary,#111)":"#666", cursor:"pointer", fontWeight:view===v?500:400 }} onClick={()=>{ setView(v); setSel(null); }}>{visibleLabels[i]}</button>)}
      </div>

      {view==="pipeline"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
            {[{l:"Active onboardings",v:cases.length,c:CY},{l:"Overdue",v:cases.filter(c=>c.overdue).length,c:"#EF4444"},{l:"Avg completion",v:"65%",c:null},{l:"Target turnaround",v:"45 days",c:null}].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:18, fontWeight:500, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
            ))}
          </div>
          {/* Stage pipeline view */}
          <div style={{ display:"flex", gap:0, marginBottom:20, overflowX:"auto" }}>
            {["New business","KYC collection","Compliance review","LOE & fee setup","Entity setup","Complete"].map((stage,i)=>{
              const inStage = cases.filter(c=>c.stage===stage||( stage==="Complete"&&c.pct===100 ));
              return (
                <div key={stage} style={{ flex:1, minWidth:120, border:"0.5px solid #e5e5e5", borderLeft:i>0?"none":undefined, padding:"10px 10px", background:i%2===0?"var(--bg-secondary,#f9f9f9)":"var(--bg-primary,#fff)" }}>
                  <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.4px", color:"#666", marginBottom:8 }}>{stage}</div>
                  <div style={{ fontSize:18, fontWeight:600, color:CY, marginBottom:8 }}>{inStage.length}</div>
                  {inStage.map(c=>(
                    <div key={c.id} onClick={()=>{ setSel(c.id); setView("active"); }} style={{ background:"var(--bg-primary,#fff)", border:`0.5px solid ${c.overdue?"#EF4444":"#e5e5e5"}`, borderRadius:5, padding:"6px 8px", marginBottom:6, cursor:"pointer", fontSize:11 }}>
                      <div style={{ fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</div>
                      <div style={{ fontSize:10, color:"#999", marginTop:2 }}>{c.admin}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view==="active"&&(
        <div style={{ display:"flex" }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", justifyContent:"flex-end", padding:"10px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
              <button style={nba} onClick={()=>setModal("newCase")}>＋ New onboarding</button>
            </div>
            {cases.map(c=>(
              <div key={c.id} onClick={()=>setSel(sel===c.id?null:c.id)} style={{ padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5", cursor:"pointer", background:sel===c.id?"var(--bg-secondary,#f9f9f9)":undefined }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{c.name}</div>
                    <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{c.type} · {c.jur} · {c.admin} · Started {c.started}</div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexShrink:0, marginLeft:12 }}>
                    <Badge label={c.status} colors={{ "In progress":{bg:"#E6F7FB",color:"#0077A8"}, Overdue:{bg:"#FCEBEB",color:"#A32D2D"} }[c.status]||{bg:"#eee",color:"#666"}} />
                    <Badge label={c.risk+" risk"} colors={{ Low:{bg:"#EAF3DE",color:"#27500A"}, Medium:{bg:"#FAEEDA",color:"#633806"}, High:{bg:"#FCEBEB",color:"#A32D2D"} }[c.risk+" risk"]||{bg:"#eee",color:"#666"}} />
                  </div>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                  <span style={{ color:"#666" }}>Current stage: <strong style={{ color:"var(--text-primary,#111)" }}>{c.stage}</strong></span>
                  <span style={{ color:c.overdue?"#EF4444":"#666" }}>Target: {c.target}</span>
                </div>
                <div style={{ height:6, background:"#eee", borderRadius:3 }}>
                  <div style={{ height:"100%", width:`${c.pct}%`, background:c.overdue?"#EF4444":CY, borderRadius:3, transition:"width 0.3s" }} />
                </div>
                <div style={{ fontSize:10, color:c.overdue?"#EF4444":"#aaa", marginTop:3 }}>{c.pct}% complete</div>
              </div>
            ))}
          </div>

          {selCase&&(
            <div style={{ width:280, minWidth:280, borderLeft:"0.5px solid #e5e5e5", padding:14, overflowY:"auto", maxHeight:680 }}>
              <button onClick={()=>setSel(null)} style={{ float:"right", background:"none", border:"none", cursor:"pointer", color:"#aaa", fontSize:14 }}>✕</button>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{selCase.name}</div>
              <div style={{ fontSize:11, color:"#999", marginBottom:12 }}>{selCase.type} · {selCase.jur}</div>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.4px", color:"#aaa", marginBottom:8 }}>Onboarding stages</div>
                {selCase.stages.map((stage,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"0.5px solid #e5e5e5" }}>
                    <div style={{ width:16, height:16, borderRadius:3, border:`1px solid ${selCase.done[i]?"#27500A":"#ccc"}`, background:selCase.done[i]?"#4CAF7D":"transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {selCase.done[i]&&<span style={{ color:"#fff", fontSize:10 }}>✓</span>}
                    </div>
                    <span style={{ fontSize:11, color:selCase.done[i]?"#aaa":"var(--text-primary,#111)", textDecoration:selCase.done[i]?"line-through":"none" }}>{stage}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.4px", color:"#aaa", marginBottom:6 }}>Documents received</div>
                {selCase.docs.received.map((d,i)=><div key={i} style={{ fontSize:11, color:"#4CAF7D", padding:"3px 0" }}>✓ {d}</div>)}
                {selCase.docs.outstanding.length>0&&(
                  <>
                    <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.4px", color:"#EF4444", margin:"8px 0 4px" }}>Outstanding</div>
                    {selCase.docs.outstanding.map((d,i)=><div key={i} style={{ fontSize:11, color:"#EF4444", padding:"3px 0" }}>✗ {d}</div>)}
                  </>
                )}
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button style={{ ...nb, flex:1, fontSize:10 }}>Advance stage ↗</button>
                {selCase.overdue&&<button style={{ fontSize:10, padding:"5px 8px", borderRadius:5, border:"0.5px solid #EF4444", color:"#EF4444", background:"transparent", cursor:"pointer" }}>Escalate</button>}
              </div>
            </div>
          )}
        </div>
      )}

      {view==="transfer"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:4 }}>Transfer-in procedure</div>
          <div style={{ fontSize:11, color:"#666", marginBottom:16 }}>When a client transfers from another CSP, the system auto-classifies scanned documents, extracts entity data, and generates a gap report.</div>
          <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:8, padding:"14px 16px", marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>Transfer-in checklist — Thorncroft Estates Ltd (in progress)</div>
            {[
              ["Certificate of incorporation","Received","✓"],
              ["Memorandum & articles","Received","✓"],
              ["Share certificate","Received","✓"],
              ["Consent and resignation letters","Received","✓"],
              ["Corporate registers","Received","✓"],
              ["Last signed accounts","Received","✓"],
              ["Trial balance at transfer","Outstanding","✗"],
              ["Bank account details","Outstanding","✗"],
              ["Beneficial owner register","Outstanding","✗"],
            ].map(([item,status,icon])=>(
              <div key={item} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12 }}>
                <span style={{ color:"#666" }}>{item}</span>
                <span style={{ color:icon==="✓"?"#4CAF7D":"#EF4444", fontWeight:500 }}>{icon} {status}</span>
              </div>
            ))}
            <button style={{ ...nba, marginTop:10, fontSize:11 }}>Generate gap report ↗</button>
          </div>
        </div>
      )}

      {view==="attrition"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:500 }}>Client attrition — active cases</div>
            <button style={nba} onClick={()=>setModal("attrition")}>＋ Raise attrition form</button>
          </div>
          {attrition.map(a=>(
            <div key={a.id} style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:8, padding:"14px 16px", marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div><div style={{ fontSize:13, fontWeight:600 }}>{a.name}</div>
                  <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{a.type} · {a.admin} · Started {a.started}</div></div>
                <Badge label={a.status} colors={{ Pending:{bg:"#FAEEDA",color:"#633806"} }[a.status]||{bg:"#eee",color:"#666"}} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                {[["Manager",a.approvals.manager],["Lead Director",a.approvals.director],["Managing Director",a.approvals.md],["Group CFO",a.approvals.cfo]].map(([role,status])=>(
                  <div key={role} style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"8px 10px" }}>
                    <div style={{ fontSize:10, color:"#aaa", marginBottom:3 }}>{role}</div>
                    <div style={{ fontSize:12, fontWeight:600, color:status==="✓"?"#4CAF7D":status==="Pending"?"#F59E0B":"#aaa" }}>{status}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:8, marginTop:10 }}>
                <button style={nb}>View form ↗</button>
                {Object.values(a.approvals).some(v=>v==="Pending")&&<button style={nba}>Approve ✓</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view==="portal"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:4 }}>Client portal — onboarding access</div>
          <div style={{ fontSize:11, color:"#666", marginBottom:16 }}>Clients with active onboarding cases can access a secure portal to upload documents and complete KYC forms. Portal is separate from the main system.</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
            {[{l:"Portal invitations sent",v:5,c:CY},{l:"Completed",v:2,c:"#4CAF7D"},{l:"Awaiting response",v:2,c:"#F59E0B"}].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:18, fontWeight:500, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
            ))}
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={th}>Client</th><th style={th}>Entity</th><th style={th}>Invited</th><th style={th}>Expires</th><th style={th}>Status</th><th style={th}>Action</th>
            </tr></thead>
            <tbody>
              {[
                { c:"James Harrington",n:"Pinnacle Trading Ltd",      sent:"01/07/2025",exp:"15/07/2025",status:"Accessed — incomplete" },
                { c:"Sophie Laurent",  n:"Pinnacle Trading Ltd",      sent:"01/07/2025",exp:"15/07/2025",status:"Completed" },
                { c:"Marco Deluca",    n:"Verona Digital Holdings Ltd",sent:"15/06/2025",exp:"29/06/2025",status:"Accessed — incomplete" },
                { c:"Carlos Reyes",    n:"Osprey Aviation Partners",  sent:"10/07/2025",exp:"24/07/2025",status:"Awaiting response" },
                { c:"Wei Chen",        n:"Solaris Family Trust",       sent:"01/06/2025",exp:"15/06/2025",status:"Expired" },
              ].map((r,i)=>(
                <tr key={i} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{ ...td, fontWeight:500 }}>{r.c}</td>
                  <td style={{ ...td, color:"#666" }}>{r.n}</td>
                  <td style={{ ...td, color:"#666" }}>{r.sent}</td>
                  <td style={{ ...td, color:r.status==="Expired"?"#EF4444":"#666" }}>{r.exp}</td>
                  <td style={td}><Badge label={r.status} colors={{ Completed:{bg:"#EAF3DE",color:"#27500A"}, "Accessed — incomplete":{bg:"#FAEEDA",color:"#633806"}, "Awaiting response":{bg:"#E6F7FB",color:"#0077A8"}, Expired:{bg:"#FCEBEB",color:"#A32D2D"} }[r.status]||{bg:"#eee",color:"#666"}} /></td>
                  <td style={td}>{r.status==="Expired"?<button style={{ ...nb, fontSize:10 }}>Re-invite</button>:<button style={{ ...nb, fontSize:10 }}>View ↗</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop:16, display:"flex", justifyContent:"flex-end" }}>
            <button style={nba} onClick={()=>setModal("invite")}>＋ Send portal invitation</button>
          </div>
        </div>
      )}

      {modal&&(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(13,27,42,0.45)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:40, zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"var(--bg-primary,#fff)", borderRadius:10, border:"0.5px solid #e5e5e5", padding:22, width:480, maxWidth:"96vw" }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:16 }}>{modal==="newCase"?"New onboarding case":modal==="attrition"?"Raise client attrition form":"Send portal invitation"}</div>
            {modal==="newCase"&&[["Entity name","text"],["Entity type","select",["Company","Trust","Foundation","LLC"]],["Jurisdiction","select",["Isle of Man","Malta","Cayman Islands","United Kingdom","Miami"]],["Administrator","text"],["Source","select",["New business — direct","Transfer in","CRM referral"]],["Target completion","text"]].map(([l,t,opts])=>(
              <div key={l} style={{ display:"flex", flexDirection:"column", gap:3, marginBottom:10 }}>
                <label style={{ fontSize:11, color:"#666" }}>{l}</label>
                {t==="select"?<select style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)" }}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>
                :<input style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)" }} placeholder={l} />}
              </div>
            ))}
            {modal==="attrition"&&[["Entity name","text"],["Reason","select",["Voluntary resignation","Transfer out","Liquidation","Dissolution","Non-payment"]],["Lead director","text"],["Retention attempt","select",["Yes — retained","Yes — not retained","No — not applicable"]],["Final invoices outstanding","text"]].map(([l,t,opts])=>(
              <div key={l} style={{ display:"flex", flexDirection:"column", gap:3, marginBottom:10 }}>
                <label style={{ fontSize:11, color:"#666" }}>{l}</label>
                {t==="select"?<select style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)" }}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>
                :<input style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)" }} placeholder={l} />}
              </div>
            ))}
            {modal==="invite"&&[["Contact name","text"],["Email","text"],["Linked entity","text"],["Expiry","select",["7 days","14 days","30 days"]]].map(([l,t,opts])=>(
              <div key={l} style={{ display:"flex", flexDirection:"column", gap:3, marginBottom:10 }}>
                <label style={{ fontSize:11, color:"#666" }}>{l}</label>
                {t==="select"?<select style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)" }}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>
                :<input style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)" }} placeholder={l} />}
              </div>
            ))}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
              <button style={nb} onClick={()=>setModal(null)}>Cancel</button>
              <button style={nba} onClick={()=>setModal(null)}>{modal==="newCase"?"Create case":modal==="attrition"?"Submit for approval":"Send invitation"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
