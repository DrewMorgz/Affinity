import { useState, useMemo, useEffect } from "react";
import { isConfigured } from "./affinity_accounting_supabase";
import { feeInvoices } from "./affinity_invoicing_api";
const CY = "#00C4CC";
const Badge = ({ label, colors }) => (<span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>);
const fmt = (n,s="£") => s+Math.abs(Number(n||0)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const th = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", whiteSpace:"nowrap" };
const td = { padding:"8px 12px", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderBottom:"0.5px solid #e5e5e5" };

const INVOICES = [
  { id:1,  ref:"INV-IOM-2025-041", client:"Harrington Family",   entity:"Meridian Holdings Ltd",          jur:"Isle of Man",    amount:2000,  balance:2000,  status:"Sent",    due:"31/07/2025", type:"Retainer",  currency:"GBP", raised:"01/07/2025", bookept:true  },
  { id:2,  ref:"INV-IOM-2025-038", client:"Harrington Family",   entity:"Harrington Family Trust",        jur:"Isle of Man",    amount:1250,  balance:1250,  status:"Overdue", due:"15/05/2025", type:"Ad hoc",    currency:"GBP", raised:"15/04/2025", bookept:true  },
  { id:3,  ref:"INV-CYM-2025-019", client:"Caledonian Group",    entity:"Caledonian Ventures Ltd",        jur:"Cayman Islands", amount:5100,  balance:0,     status:"Paid",    due:"30/06/2025", type:"Retainer",  currency:"USD", raised:"01/04/2025", bookept:true  },
  { id:4,  ref:"INV-MLT-2025-022", client:"Azure Group",         entity:"Azure Mediterranean Foundation", jur:"Malta",          amount:1800,  balance:900,   status:"Partial", due:"31/07/2025", type:"Retainer",  currency:"EUR", raised:"01/07/2025", bookept:true  },
  { id:5,  ref:"INV-IOM-2025-035", client:"North Star Group",    entity:"North Star Holdings Ltd",        jur:"Isle of Man",    amount:600,   balance:600,   status:"Overdue", due:"20/04/2025", type:"Ad hoc",    currency:"GBP", raised:"20/03/2025", bookept:true  },
  { id:6,  ref:"INV-CYM-2025-021", client:"Pacific Wealth",      entity:"Pacific Wealth Trust",           jur:"Cayman Islands", amount:4200,  balance:4200,  status:"Sent",    due:"31/07/2025", type:"Retainer",  currency:"USD", raised:"01/07/2025", bookept:true  },
  { id:7,  ref:"INV-IOM-2025-040", client:"Cheshire Family",     entity:"Rosewood Legacy Trust",          jur:"Isle of Man",    amount:2400,  balance:2400,  status:"Draft",   due:"31/07/2025", type:"Retainer",  currency:"GBP", raised:"01/07/2025", bookept:false },
  { id:8,  ref:"INV-CYM-2025-023", client:"Apex Group",          entity:"Apex Growth Fund Ltd",           jur:"Cayman Islands", amount:5500,  balance:5500,  status:"Sent",    due:"31/07/2025", type:"Retainer",  currency:"USD", raised:"01/07/2025", bookept:true  },
  { id:9,  ref:"INV-MLT-2025-020", client:"Stonebridge Group",   entity:"Stonebridge Capital Ltd",        jur:"Malta",          amount:825,   balance:0,     status:"Paid",    due:"30/06/2025", type:"Ad hoc",    currency:"EUR", raised:"15/06/2025", bookept:true  },
  { id:10, ref:"INV-IOM-2025-033", client:"Harrington Family",   entity:"Harrington Family Trust",        jur:"Isle of Man",    amount:500,   balance:500,   status:"Overdue", due:"01/03/2025", type:"Ad hoc",    currency:"GBP", raised:"01/02/2025", bookept:true  },
];

const BOOKKEEPING_ENTRIES = [
  { invRef:"INV-IOM-2025-041", date:"01/07/2025", dr:"Debtors control",        cr:"Income — retainer fees",  amount:2000,  currency:"GBP", auto:true  },
  { invRef:"INV-IOM-2025-038", date:"15/04/2025", dr:"Debtors control",        cr:"Income — ad hoc fees",    amount:1250,  currency:"GBP", auto:true  },
  { invRef:"INV-CYM-2025-019", date:"01/04/2025", dr:"Debtors control",        cr:"Income — retainer fees",  amount:5100,  currency:"USD", auto:true  },
  { invRef:"INV-CYM-2025-019", date:"28/06/2025", dr:"Bank — USD account",     cr:"Debtors control",         amount:5100,  currency:"USD", auto:false, note:"Payment received" },
  { invRef:"INV-MLT-2025-022", date:"01/07/2025", dr:"Debtors control",        cr:"Income — retainer fees",  amount:1800,  currency:"EUR", auto:true  },
  { invRef:"INV-MLT-2025-022", date:"15/07/2025", dr:"Bank — EUR account",     cr:"Debtors control",         amount:900,   currency:"EUR", auto:false, note:"Partial payment received" },
  { invRef:"INV-CYM-2025-021", date:"01/07/2025", dr:"Debtors control",        cr:"Income — retainer fees",  amount:4200,  currency:"USD", auto:true  },
  { invRef:"INV-CYM-2025-023", date:"01/07/2025", dr:"Debtors control",        cr:"Income — retainer fees",  amount:5500,  currency:"USD", auto:true  },
];

const officeColors = {
  "Isle of Man":    { bg:"#E6F7FB", color:"#0077A8" },
  "Malta":          { bg:"#EEF0FB", color:"#3C3489" },
  "Cayman Islands": { bg:"#E6EEF7", color:"#0D4A7A" },
};
const jurShort = { "Isle of Man":"IOM","Malta":"MLT","Cayman Islands":"CYM","United Kingdom":"UK","Miami":"MIA" };
const invStatus = { Draft:{bg:"#FAEEDA",color:"#633806"}, Sent:{bg:"#E6F1FB",color:"#0C447C"}, Paid:{bg:"#EAF3DE",color:"#27500A"}, Overdue:{bg:"#FCEBEB",color:"#A32D2D"}, Partial:{bg:"#FAEEDA",color:"#633806"} };

const VIEWS = ["raise","invoices","client","bookkeeping","aged","retainers","credit"];
const VLABELS = ["Ad-hoc invoicing","Invoice ledger","By client","Auto-bookkeeping","Aged debt","Retainers","Credit control"];

export default function AffinityInvoicing({ onNav }) {
  const [liveInv,setLiveInv] = useState(null);
  useEffect(()=>{ if(!isConfigured) return; let ok=true; feeInvoices().then(({data})=>{ if(ok && data && data.length) setLiveInv(data); }).catch(()=>{}); return ()=>{ok=false;}; },[]);
  const invoices = liveInv || INVOICES;
  const [view, setView] = useState("invoices");
  const [search, setSearch] = useState("");
  const [statF, setStatF] = useState("");
  const [selInv, setSelInv] = useState(null);
  const [modal, setModal] = useState(null);

  const filtered = useMemo(()=>invoices.filter(i=>
    (!search||i.ref.toLowerCase().includes(search.toLowerCase())||i.entity.toLowerCase().includes(search.toLowerCase())||i.client.toLowerCase().includes(search.toLowerCase()))&&
    (!statF||i.status===statF)
  ),[search,statF]);

  const outstanding = invoices.filter(i=>["Sent","Overdue","Partial"].includes(i.status)).reduce((s,i)=>s+i.balance,0);
  const overdue     = invoices.filter(i=>i.status==="Overdue").reduce((s,i)=>s+i.balance,0);
  const collected   = invoices.filter(i=>i.status==="Paid").reduce((s,i)=>s+i.amount,0);

  // Group by client
  const byClient = useMemo(()=>{
    const map = {};
    invoices.forEach(i=>{
      if(!map[i.client]) map[i.client]={ client:i.client, invoices:[], total:0, outstanding:0 };
      map[i.client].invoices.push(i);
      map[i.client].total += i.amount;
      if(["Sent","Overdue","Partial"].includes(i.status)) map[i.client].outstanding += i.balance;
    });
    return Object.values(map).sort((a,b)=>b.outstanding-a.outstanding);
  },[]);

  const selI = selInv ? invoices.find(i=>i.id===selInv) : null;
  const bkEntries = selI ? BOOKKEEPING_ENTRIES.filter(b=>b.invRef===selI.ref) : [];

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };
  const sel = { height:30, padding:"0 8px", fontSize:11, borderRadius:5, border:"0.5px solid #ccc", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", cursor:"pointer" };
  const sc  = { background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 12px" };

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
        <div style={{ fontSize:18, fontWeight:500, color:CY }}>Affinity <span style={{ color:"var(--text-primary,#111)", fontWeight:300 }}>Core</span><small style={{ fontSize:11, color:"#999", fontWeight:300, marginLeft:8 }}>Invoicing</small></div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entities","Compliance","Timesheets","Reporting"].map(n=><button key={n} style={nb} onClick={()=>onNav&&onNav({Entities:"entities",Compliance:"compliance",Timesheets:"timesheets",Invoicing:"invoicing",Reporting:"reporting",Documents:"documents",Bookkeeping:"bookkeeping"}[n])}>{n}</button>)}
          <button style={nba}>Invoicing</button>
        </div>
      </div>

      <div style={{ display:"flex", gap:4, padding:"8px 20px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", flexWrap:"wrap" }}>
        {VIEWS.map((v,i)=><button key={v} style={{ padding:"4px 12px", fontSize:11, borderRadius:20, border:`0.5px solid ${view===v?"#ccc":"#e5e5e5"}`, background:view===v?"var(--bg-primary,#fff)":"transparent", color:view===v?"var(--text-primary,#111)":"#666", cursor:"pointer", fontWeight:view===v?500:400 }} onClick={()=>{ setView(v); setSelInv(null); }}>{VLABELS[i]}</button>)}
      </div>

      {/* INVOICE LEDGER */}
      {view==="raise"&&(
        <div style={{padding:"16px 20px",maxWidth:800}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Ad-hoc invoicing</div>
          <div style={{fontSize:11,color:"#666",marginBottom:16}}>Create a new invoice. All fields pre-populate from entity and retainer data where available.</div>

          <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:10,padding:20,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.4px",color:"#888",marginBottom:14}}>Invoice details</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
              {[
                ["Entity","select",["Meridian Holdings Ltd","Harrington Family Trust","Caledonian Ventures Ltd","Pacific Wealth Trust","Stonebridge Capital Ltd","North Star Holdings Ltd","Azure Mediterranean Fdn","Rosewood Legacy Trust","Apex Growth Fund Ltd"]],
                ["Invoice date","date"],
                ["Due date","date"],
                ["Invoice number","text","Auto-generated: INV-2025-0041"],
                ["Currency","select",["GBP","USD","EUR","CHF"]],
                ["Office","select",["Isle of Man","Malta","Cayman Islands","Cyprus","USA","United Kingdom"]],
              ].map(([l,t,opts])=>(
                <div key={l} style={{marginBottom:14}}>
                  <label style={{display:"block",fontSize:11,fontWeight:600,color:"#555",marginBottom:4}}>{l}</label>
                  {t==="select"
                    ?<select style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e0e0e0",borderRadius:6,fontSize:12,outline:"none"}}>
                      {(opts||[]).map(o=><option key={o}>{o}</option>)}
                    </select>
                    :<input type={t} placeholder={typeof opts==="string"?opts:""} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e0e0e0",borderRadius:6,fontSize:12,outline:"none",boxSizing:"border-box"}}/>}
                </div>
              ))}
            </div>
          </div>

          <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:10,padding:20,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.4px",color:"#888",marginBottom:14}}>Line items</div>
            <table style={{width:"100%",borderCollapse:"collapse",marginBottom:12}}>
              <thead><tr style={{background:"#f9f9f9"}}>
                {["Description","Type","Units","Rate","Amount",""].map(h=><th key={h} style={{padding:"7px 10px",textAlign:"left",fontSize:10,fontWeight:600,color:"#666",textTransform:"uppercase",letterSpacing:"0.4px",borderBottom:"0.5px solid #e5e5e5"}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {[
                  {desc:"Annual administration fee — FY2025/26",type:"Annual fee",units:1,rate:19800,amount:19800},
                  {desc:"Director services — Q3 2025",type:"Disbursement",units:1,rate:3600,amount:3600},
                  {desc:"Compliance review — periodic",type:"Time",units:3,rate:250,amount:750},
                ].map((item,i)=>(
                  <tr key={i} style={{borderBottom:"0.5px solid #f0f0f0"}}>
                    <td style={{padding:"8px 10px"}}><input defaultValue={item.desc} style={{width:"100%",border:"none",fontSize:12,outline:"none",background:"transparent"}}/></td>
                    <td style={{padding:"8px 10px"}}><select defaultValue={item.type} style={{border:"none",fontSize:11,outline:"none",background:"transparent",color:"#666"}}><option>Annual fee</option><option>Time</option><option>Disbursement</option><option>One-off</option></select></td>
                    <td style={{padding:"8px 10px"}}><input defaultValue={item.units} type="number" style={{width:50,border:"none",fontSize:12,outline:"none",background:"transparent",textAlign:"center"}}/></td>
                    <td style={{padding:"8px 10px"}}><input defaultValue={"£"+item.rate.toLocaleString()} style={{width:80,border:"none",fontSize:12,outline:"none",background:"transparent"}}/></td>
                    <td style={{padding:"8px 10px",fontWeight:600}}>{"£"+item.amount.toLocaleString()}</td>
                    <td style={{padding:"8px 10px"}}><button style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:14}}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button style={{padding:"6px 14px",borderRadius:5,border:"0.5px solid #00C4CC",background:"transparent",color:"#00C4CC",fontSize:11,cursor:"pointer"}}>＋ Add line item</button>

            <div style={{marginTop:16,display:"flex",justifyContent:"flex-end"}}>
              <div style={{minWidth:220}}>
                {[["Subtotal","£24,150"],["VAT (0%)","£0"],["Total","£24,150"]].map(([l,v],i)=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:i<2?"0.5px solid #f0f0f0":"none",fontWeight:i===2?700:400,fontSize:i===2?14:12,color:i===2?"#001242":"#444"}}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:10,padding:20,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.4px",color:"#888",marginBottom:12}}>Notes & payment details</div>
            <textarea rows={3} placeholder="Payment terms, bank details, or additional notes…" style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e0e0e0",borderRadius:6,fontSize:12,outline:"none",fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
          </div>

          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button style={{padding:"9px 20px",borderRadius:6,border:"0.5px solid #e5e5e5",background:"transparent",fontSize:13,cursor:"pointer",color:"#666"}}>Save draft</button>
            <button style={{padding:"9px 20px",borderRadius:6,border:"0.5px solid #00C4CC",background:"transparent",fontSize:13,cursor:"pointer",color:"#00C4CC",fontWeight:600}}>Preview PDF ↗</button>
            <button style={{padding:"9px 20px",borderRadius:6,border:"none",background:"#00C4CC",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600}}>Issue invoice ↗</button>
          </div>
        </div>
      )}

      {view==="invoices"&&(<>
        <div style={{ display:"flex", gap:8, padding:"10px 20px", borderBottom:"0.5px solid #e5e5e5", flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, background:"var(--bg-primary,#fff)", border:"0.5px solid #ccc", borderRadius:5, padding:"0 10px", flex:1 }}>
            <span style={{ color:"#aaa" }}>🔍</span>
            <input style={{ border:"none", background:"transparent", fontSize:12, outline:"none", width:"100%", height:30, color:"var(--text-primary,#111)" }} placeholder="Search invoices, entities, clients..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <select style={sel} value={statF} onChange={e=>setStatF(e.target.value)}>
            <option value="">All statuses</option>
            {["Draft","Sent","Paid","Overdue","Partial"].map(s=><option key={s}>{s}</option>)}
          </select>
          <button style={{ ...nba, marginLeft:"auto" }} onClick={()=>setModal("newInvoice")}>＋ New invoice</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
          {[
            { l:"Outstanding",   v:fmt(outstanding), c:CY },
            { l:"Overdue",       v:fmt(overdue),      c:"#EF4444" },
            { l:"Drafts",        v:invoices.filter(i=>i.status==="Draft").length, c:"#F59E0B" },
            { l:"Collected YTD", v:fmt(collected),    c:"#4CAF7D" },
            { l:"Invoiced YTD",  v:fmt(invoices.reduce((s,i)=>s+i.amount,0)), c:null },
          ].map(k=>(
            <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:18, fontWeight:500, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
          ))}
        </div>

        <div style={{ display:"flex" }}>
          <div style={{ flex:1, overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
              <thead><tr>
                <th style={{ ...th, width:"15%" }}>Invoice</th>
                <th style={{ ...th, width:"13%" }}>Client</th>
                <th style={{ ...th, width:"20%" }}>Entity</th>
                <th style={{ ...th, width:"8%" }}>Office</th>
                <th style={{ ...th, width:"8%" }}>Type</th>
                <th style={{ ...th, width:"10%", textAlign:"right" }}>Amount</th>
                <th style={{ ...th, width:"10%", textAlign:"right" }}>Balance</th>
                <th style={{ ...th, width:"9%" }}>Due</th>
                <th style={{ ...th, width:"9%" }}>Status</th>
                <th style={{ ...th, width:"6%" }}>BK</th>
              </tr></thead>
              <tbody>
                {filtered.map(i=>(
                  <tr key={i.id} onClick={()=>setSelInv(selInv===i.id?null:i.id)} style={{ cursor:"pointer", borderBottom:"0.5px solid #e5e5e5", background:selInv===i.id?"var(--bg-secondary,#f9f9f9)":"transparent" }}>
                    <td style={{ ...td, fontWeight:500, fontSize:10 }}>{i.ref}</td>
                    <td style={{ ...td, color:"#666" }}>{i.client}</td>
                    <td style={{ ...td, overflow:"hidden", textOverflow:"ellipsis" }}>{i.entity}</td>
                    <td style={td}><Badge label={jurShort[i.jur]||i.jur} colors={officeColors[i.jur]} /></td>
                    <td style={td}><Badge label={i.type} colors={i.type==="Retainer"?{bg:"#E6F7FB",color:"#0077A8"}:{bg:"#F1EFE8",color:"#666"}} /></td>
                    <td style={{ ...td, textAlign:"right", fontWeight:500 }}>{fmt(i.amount)}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:500, color:i.balance>0&&i.status==="Overdue"?"#EF4444":i.balance===0?"#aaa":undefined }}>{i.balance>0?fmt(i.balance):"Paid"}</td>
                    <td style={{ ...td, color:i.status==="Overdue"?"#EF4444":"#666" }}>{i.due}</td>
                    <td style={td}><Badge label={i.status} colors={invStatus[i.status]} /></td>
                    <td style={{ ...td, textAlign:"center" }}>
                      <span title={i.bookept?"Auto-bookept on raise":"Not yet bookept"} style={{ color:i.bookept?"#4CAF7D":"#aaa", fontSize:13 }}>{i.bookept?"✓":"—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Invoice detail panel */}
          {selI&&(
            <div style={{ width:260, minWidth:260, borderLeft:"0.5px solid #e5e5e5", padding:14, overflowY:"auto" }}>
              <button onClick={()=>setSelInv(null)} style={{ float:"right", background:"none", border:"none", cursor:"pointer", color:"#aaa", fontSize:14 }}>✕</button>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{selI.ref}</div>
              <div style={{ fontSize:11, color:"#999", marginBottom:12 }}>{selI.entity}</div>
              {[["Client",selI.client],["Status",selI.status],["Raised",selI.raised],["Due",selI.due],["Amount",fmt(selI.amount)],["Balance",selI.balance>0?fmt(selI.balance):"Paid"],["Currency",selI.currency],["Type",selI.type]].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:11 }}>
                  <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:500 }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.4px", color:"#aaa", marginBottom:6 }}>Auto-bookkeeping</div>
                {selI.bookept?(
                  <div style={{ background:"#EAF3DE", borderRadius:6, padding:"8px 10px", fontSize:11, color:"#27500A" }}>
                    ✓ Bookept automatically on raise<br/>
                    <span style={{ fontSize:10, color:"#4CAF7D" }}>DR Debtors / CR Income</span>
                  </div>
                ):(
                  <div style={{ background:"#FAEEDA", borderRadius:6, padding:"8px 10px", fontSize:11, color:"#633806" }}>
                    ⚠ Pending — will bookkeep on send
                  </div>
                )}
                {bkEntries.length>0&&(
                  <div style={{ marginTop:8 }}>
                    {bkEntries.map((b,i)=>(
                      <div key={i} style={{ fontSize:10, padding:"4px 0", borderBottom:"0.5px solid #e5e5e5", color:"#666" }}>
                        <div style={{ fontWeight:500, color:"var(--text-primary,#111)" }}>{b.date}</div>
                        <div>DR {b.dr}</div>
                        <div>CR {b.cr}</div>
                        <div style={{ color:CY, fontWeight:500 }}>{b.currency} {fmt(b.amount)}{b.note?` — ${b.note}`:""}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display:"flex", gap:6, marginTop:12 }}>
                <button style={nb}>PDF ↗</button>
                <button style={nba}>Send ↗</button>
              </div>
            </div>
          )}
        </div>
      </>)}

      {/* BY CLIENT */}
      {view==="client"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Invoices by client — all time</div>
          {byClient.map((c,i)=>(
            <div key={i} style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{c.client}</div>
                <div style={{ display:"flex", gap:10, fontSize:12 }}>
                  <span style={{ color:"#666" }}>Total billed: <strong>{fmt(c.total)}</strong></span>
                  <span style={{ color:c.outstanding>0?"#EF4444":CY }}>Outstanding: <strong>{fmt(c.outstanding)}</strong></span>
                </div>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>
                  {["Invoice","Entity","Amount","Balance","Due","Status"].map(h=><th key={h} style={{ ...th, padding:"6px 10px" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {c.invoices.map(inv=>(
                    <tr key={inv.id} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                      <td style={{ ...td, fontSize:10, fontWeight:500 }}>{inv.ref}</td>
                      <td style={{ ...td, color:"#666" }}>{inv.entity}</td>
                      <td style={{ ...td, textAlign:"right", fontWeight:500 }}>{fmt(inv.amount)}</td>
                      <td style={{ ...td, textAlign:"right", color:inv.balance>0&&inv.status==="Overdue"?"#EF4444":"#666" }}>{inv.balance>0?fmt(inv.balance):"Paid"}</td>
                      <td style={{ ...td, color:inv.status==="Overdue"?"#EF4444":"#666" }}>{inv.due}</td>
                      <td style={td}><Badge label={inv.status} colors={invStatus[inv.status]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* AUTO BOOKKEEPING */}
      {view==="bookkeeping"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ background:"#EAF3DE", border:"0.5px solid #4CAF7D", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#27500A", marginBottom:16 }}>
            ✓ <strong>Auto-bookkeeping is active.</strong> When an invoice is raised, the system automatically posts DR Debtors / CR Income to the entity's ledger. When payment is received, DR Bank / CR Debtors is posted. All journals are audit-logged.
          </div>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Bookkeeping entries — generated from invoices</div>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"16%" }}>Invoice ref</th>
              <th style={{ ...th, width:"10%" }}>Date</th>
              <th style={{ ...th, width:"22%" }}>Debit account</th>
              <th style={{ ...th, width:"22%" }}>Credit account</th>
              <th style={{ ...th, width:"12%", textAlign:"right" }}>Amount</th>
              <th style={{ ...th, width:"8%" }}>Currency</th>
              <th style={{ ...th, width:"10%" }}>Source</th>
            </tr></thead>
            <tbody>
              {BOOKKEEPING_ENTRIES.map((b,i)=>(
                <tr key={i} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{ ...td, fontWeight:500, fontSize:10 }}>{b.invRef}</td>
                  <td style={{ ...td, color:"#666" }}>{b.date}</td>
                  <td style={td}>{b.dr}</td>
                  <td style={td}>{b.cr}</td>
                  <td style={{ ...td, textAlign:"right", fontWeight:600, color:CY }}>{fmt(b.amount)}</td>
                  <td style={{ ...td, color:"#666" }}>{b.currency}</td>
                  <td style={td}><Badge label={b.auto?"Auto":"Manual"} colors={b.auto?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#E6F7FB",color:"#0077A8"}} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AGED DEBT */}
      {view==="aged"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
            {[{l:"Current (0-30d)",v:fmt(18450),c:"#4CAF7D"},{l:"31-60 days",v:fmt(12200)},{l:"61-90 days",v:fmt(8750),c:"#F59E0B"},{l:"90+ days",v:fmt(5320),c:"#EF4444"}].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:18, fontWeight:500, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
            ))}
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"24%" }}>Entity</th>
              <th style={{ ...th, width:"12%" }}>Client</th>
              <th style={{ ...th, width:"10%", textAlign:"right" }}>Current</th>
              <th style={{ ...th, width:"10%", textAlign:"right" }}>31-60d</th>
              <th style={{ ...th, width:"10%", textAlign:"right" }}>61-90d</th>
              <th style={{ ...th, width:"10%", textAlign:"right" }}>90d+</th>
              <th style={{ ...th, width:"12%", textAlign:"right" }}>Total</th>
              <th style={{ ...th, width:"12%" }}>Action</th>
            </tr></thead>
            <tbody>
              {[
                { e:"Harrington Family Trust",  c:"Harrington",  c0:0,    c31:0,    c61:1250, c90:500  },
                { e:"Pacific Wealth Trust",     c:"Pacific",     c0:4200, c31:0,    c61:0,    c90:0    },
                { e:"Apex Growth Fund Ltd",     c:"Apex",        c0:5500, c31:0,    c61:0,    c90:0    },
                { e:"Meridian Holdings Ltd",    c:"Meridian",    c0:2000, c31:0,    c61:0,    c90:0    },
                { e:"Rosewood Legacy Trust",    c:"Cheshire",    c0:2400, c31:0,    c61:0,    c90:0    },
                { e:"North Star Holdings Ltd",  c:"North Star",  c0:0,    c31:0,    c61:600,  c90:0    },
              ].map((r,i)=>(
                <tr key={i} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{ ...td, fontWeight:500 }}>{r.e}</td>
                  <td style={{ ...td, color:"#666" }}>{r.c}</td>
                  <td style={{ ...td, textAlign:"right", color:r.c0?"#4CAF7D":"#aaa" }}>{r.c0?fmt(r.c0):"—"}</td>
                  <td style={{ ...td, textAlign:"right" }}>{r.c31?fmt(r.c31):"—"}</td>
                  <td style={{ ...td, textAlign:"right", color:r.c61?"#F59E0B":"#aaa" }}>{r.c61?fmt(r.c61):"—"}</td>
                  <td style={{ ...td, textAlign:"right", color:r.c90?"#EF4444":"#aaa" }}>{r.c90?fmt(r.c90):"—"}</td>
                  <td style={{ ...td, textAlign:"right", fontWeight:600 }}>{fmt(r.c0+r.c31+r.c61+r.c90)}</td>
                  <td style={td}>{(r.c61||r.c90)>0?<button style={{ ...nb, fontSize:10, color:"#EF4444", borderColor:"#EF4444" }}>Chase ↗</button>:<span style={{ color:"#aaa", fontSize:11 }}>Sent</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* RETAINERS */}
      {view==="retainers"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ background:"#E6F7FB", border:`0.5px solid ${CY}`, borderRadius:8, padding:"10px 14px", fontSize:12, color:"#0077A8", marginBottom:16 }}>
            ℹ️ Q3 2025 retainer invoices are due for generation on 01/10/2025. Auto-generation is currently <strong>disabled</strong>. Enable in System Admin to auto-create draft invoices.
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"26%" }}>Entity</th>
              <th style={{ ...th, width:"12%" }}>Office</th>
              <th style={{ ...th, width:"12%" }}>Fee</th>
              <th style={{ ...th, width:"10%" }}>Currency</th>
              <th style={{ ...th, width:"12%" }}>Frequency</th>
              <th style={{ ...th, width:"14%" }}>Next invoice</th>
              <th style={{ ...th, width:"14%" }}>Last raised</th>
            </tr></thead>
            <tbody>
              {[
                { e:"Meridian Holdings Ltd",          j:"IOM", fee:2000, cur:"GBP", freq:"Quarterly", next:"01/10/2025", last:"01/07/2025" },
                { e:"Harrington Family Trust",         j:"IOM", fee:2400, cur:"GBP", freq:"Quarterly", next:"01/10/2025", last:"01/07/2025" },
                { e:"Rosewood Legacy Trust",           j:"IOM", fee:2400, cur:"GBP", freq:"Quarterly", next:"01/10/2025", last:"01/07/2025" },
                { e:"Caledonian Ventures Ltd",         j:"CYM", fee:5100, cur:"USD", freq:"Quarterly", next:"01/10/2025", last:"01/07/2025" },
                { e:"Pacific Wealth Trust",            j:"CYM", fee:4200, cur:"USD", freq:"Quarterly", next:"01/10/2025", last:"01/07/2025" },
                { e:"Apex Growth Fund Ltd",            j:"CYM", fee:5500, cur:"USD", freq:"Quarterly", next:"01/10/2025", last:"01/07/2025" },
                { e:"Azure Mediterranean Foundation",  j:"MLT", fee:1800, cur:"EUR", freq:"Quarterly", next:"01/10/2025", last:"01/07/2025" },
              ].map((r,i)=>(
                <tr key={i} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{ ...td, fontWeight:500 }}>{r.e}</td>
                  <td style={td}><Badge label={r.j} colors={{ IOM:{bg:"#E6F7FB",color:"#0077A8"}, CYM:{bg:"#E6EEF7",color:"#0D4A7A"}, MLT:{bg:"#EEF0FB",color:"#3C3489"} }[r.j]} /></td>
                  <td style={{ ...td, fontWeight:600 }}>{fmt(r.fee)}</td>
                  <td style={{ ...td, color:"#666" }}>{r.cur}</td>
                  <td style={{ ...td, color:"#666" }}>{r.freq}</td>
                  <td style={{ ...td, color:"#666" }}>{r.next}</td>
                  <td style={{ ...td, color:"#666" }}>{r.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREDIT CONTROL */}
      {view==="credit"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Credit control — overdue invoices</div>
          {invoices.filter(i=>["Overdue","Partial"].includes(i.status)).map(i=>{
            const parts = i.due.split("/");
            const days = Math.round((new Date()-new Date(`${parts[2]}-${parts[1]}-${parts[0]}`))/(1000*60*60*24));
            return (
              <div key={i.id} style={{ background:"var(--bg-primary,#fff)", border:`0.5px solid ${days>90?"#EF4444":days>60?"#F59E0B":"#e5e5e5"}`, borderRadius:8, padding:"12px 16px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13 }}>{i.entity}</div>
                  <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{i.ref} · Raised {i.raised} · Due {i.due}</div>
                  <div style={{ fontSize:11, color:"#666", marginTop:4 }}>Client: {i.client}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontWeight:600, fontSize:14, color:days>60?"#EF4444":"#F59E0B" }}>{fmt(i.balance)}</div>
                  <div style={{ fontSize:11, color:days>60?"#EF4444":"#F59E0B", marginTop:2 }}>{days} days overdue</div>
                  <div style={{ display:"flex", gap:6, marginTop:8, justifyContent:"flex-end" }}>
                    <button style={{ ...nb, fontSize:10 }}>Send reminder</button>
                    {days>60&&<button style={{ fontSize:10, padding:"4px 10px", borderRadius:5, border:"0.5px solid #EF4444", color:"#EF4444", background:"transparent", cursor:"pointer" }}>Escalate</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal==="newInvoice"&&(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(13,27,42,0.45)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:40, zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"var(--bg-primary,#fff)", borderRadius:10, border:"0.5px solid #e5e5e5", padding:22, width:500, maxWidth:"96vw" }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>New invoice</div>
            <div style={{ fontSize:11, color:"#4CAF7D", background:"#EAF3DE", borderRadius:5, padding:"6px 10px", marginBottom:14 }}>✓ Invoice will be automatically bookept (DR Debtors / CR Income) on raise.</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                ["Entity","text","Entity name",true],["Client","text","Client / group name",false],
                ["Invoice type","select","",false,["Retainer","Ad hoc","Disbursement","Fixed fee"]],
                ["Currency","select","",false,["GBP","USD","EUR"]],
                ["Amount","number","0.00",false],["Due date","text","DD/MM/YYYY",false],
                ["Office","select","",false,["Isle of Man","Malta","Cayman Islands","United Kingdom","Miami"]],
              ].map(([l,t,ph,full,opts])=>(
                <div key={l} style={{ display:"flex", flexDirection:"column", gap:3, gridColumn:full?"1/-1":"auto" }}>
                  <label style={{ fontSize:11, color:"#666" }}>{l}</label>
                  {t==="select"
                    ?<select style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", background:"var(--bg-primary,#fff)", padding:"0 8px", height:32, outline:"none" }}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>
                    :<input type={t} style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)" }} placeholder={ph} />
                  }
                </div>
              ))}
              <div style={{ display:"flex", flexDirection:"column", gap:3, gridColumn:"1/-1" }}>
                <label style={{ fontSize:11, color:"#666" }}>Narrative</label>
                <textarea style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"6px 8px", height:50, outline:"none", resize:"none" }} placeholder="Invoice description" />
              </div>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:14 }}>
              <button style={nb} onClick={()=>setModal(null)}>Cancel</button>
              <button style={nba} onClick={()=>setModal(null)}>Raise ad-hoc invoice + bookkeep</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
