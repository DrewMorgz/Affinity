import { useState, useEffect } from "react";
import EntitySearch from "./affinity_entity_search";
import { getDatasets, isConfigured } from "./affinity_ops_api";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const CY = "#00C4CC";
const fmt = (n, s="£") => s + Math.abs(Number(n||0)).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0});

const Badge = ({label,colors}) => <span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:colors?.bg||"#eee",color:colors?.color||"#333",whiteSpace:"nowrap"}}>{label}</span>;
const Btn = ({primary,children,onClick,sx={}}) => <button onClick={onClick} style={{padding:"5px 12px",borderRadius:5,border:primary?"none":"0.5px solid #ccc",background:primary?CY:"transparent",color:primary?"#fff":"#111",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",...sx}}>{children}</button>;
const Card = ({title,children,action}) => <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:14,marginBottom:12}}>{title&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",color:"#666"}}>{title}</div>{action}</div>}{children}</div>;
const KG = ({items,cols=4}) => <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:10,marginBottom:14}}>{items.map(k=><div key={k.l} style={{background:"#f9f9f9",borderRadius:6,padding:"10px 14px"}}><div style={{fontSize:10,color:"#666",marginBottom:3}}>{k.l}</div><div style={{fontSize:20,fontWeight:600,color:k.c||"#111"}}>{k.v}</div>{k.s&&<div style={{fontSize:10,color:"#999",marginTop:2}}>{k.s}</div>}</div>)}</div>;
const SN = ({tabs,active,onChange}) => <div style={{display:"flex",gap:3,marginBottom:14,flexWrap:"wrap"}}>{tabs.map((t,i)=><button key={i} style={{padding:"4px 12px",fontSize:11,borderRadius:20,border:`0.5px solid ${active===i?"#ccc":"#e5e5e5"}`,background:active===i?"#fff":"transparent",color:active===i?"#111":"#666",cursor:"pointer",fontWeight:active===i?500:400,whiteSpace:"nowrap"}} onClick={()=>onChange(i)}>{t}</button>)}</div>;
const Md = ({title,onClose,children}) => <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(13,27,42,0.5)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:40,zIndex:200}} onClick={e=>e.target===e.currentTarget&&onClose()}><div style={{background:"#fff",borderRadius:10,border:"0.5px solid #e5e5e5",padding:22,width:520,maxWidth:"96vw",maxHeight:"88vh",overflowY:"auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{fontSize:14,fontWeight:600}}>{title}</div><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#aaa"}}>✕</button></div>{children}</div></div>;

// ── Data ──────────────────────────────────────────────────────
const BUDGETS = [
  { id:1, name:"Group — FY 2025/26",    type:"Annual",    status:"Approved",  owner:"Neil Kelly",   version:"v3",  period:"Apr 2025 – Mar 2026", totalRev:2100000, totalCost:1420000 },
  { id:2, name:"Isle of Man — FY 2025/26",type:"Departmental",status:"Approved",owner:"Roxy Sheeley",version:"v2", period:"Apr 2025 – Mar 2026", totalRev:620000,  totalCost:390000  },
  { id:3, name:"Malta — FY 2025/26",     type:"Departmental",status:"Approved",owner:"Joanne Fenech",version:"v1",period:"Apr 2025 – Mar 2026", totalRev:310000,  totalCost:210000  },
  { id:4, name:"Cayman — FY 2025/26",    type:"Departmental",status:"Draft",   owner:"Garry Crossan",version:"v1",period:"Apr 2025 – Mar 2026", totalRev:840000,  totalCost:580000  },
  { id:5, name:"Group — FY 2025/26 Reforecast Q1",type:"Reforecast",status:"Under review",owner:"Neil Kelly",version:"v1",period:"Apr 2025 – Mar 2026",totalRev:2240000,totalCost:1460000},
];

const MONTHLY = [
  { month:"Apr",budget:160000,forecast:165000,actual:158000,budgetC:115000,forecastC:118000,actualC:112000},
  { month:"May",budget:163000,forecast:168000,actual:171000,budgetC:117000,forecastC:120000,actualC:119000},
  { month:"Jun",budget:165000,forecast:172000,actual:168000,budgetC:118000,forecastC:122000,actualC:117000},
  { month:"Jul",budget:168000,forecast:175000,actual:null,  budgetC:120000,forecastC:124000,actualC:null  },
  { month:"Aug",budget:162000,forecast:170000,actual:null,  budgetC:116000,forecastC:121000,actualC:null  },
  { month:"Sep",budget:170000,forecast:178000,actual:null,  budgetC:122000,forecastC:127000,actualC:null  },
];

const SCENARIOS = [
  { name:"Base case",    rev:2100000, cost:1420000, margin:32.4, prob:"60%", color:CY },
  { name:"Best case",    rev:2380000, cost:1440000, margin:39.5, prob:"20%", color:"#4CAF7D" },
  { name:"Downside",     rev:1820000, cost:1400000, margin:23.1, prob:"20%", color:"#EF4444" },
];

const VARIANCE = [
  { line:"Retainer income",   budget:980000, actual:497000, variance:+12000, pct:"+2.5%", status:"Favourable" },
  { line:"Ad hoc income",     budget:420000, actual:198000, variance:-8000,  pct:"-3.8%", status:"Adverse"    },
  { line:"Specialist income", budget:700000, actual:372000, variance:+18000, pct:"+5.1%", status:"Favourable" },
  { line:"Staff costs",       budget:860000, actual:428000, variance:+6000,  pct:"+1.4%", status:"Adverse"    },
  { line:"Office & premises", budget:180000, actual:88000,  variance:-4000,  pct:"-4.3%", status:"Favourable" },
  { line:"IT & software",     budget:95000,  actual:52000,  variance:+2000,  pct:"+4.0%", status:"Adverse"    },
  { line:"Professional fees", budget:120000, actual:58000,  variance:-8000,  pct:"-12.1%",status:"Favourable" },
  { line:"Travel & expenses", budget:65000,  actual:28000,  variance:+4000,  pct:"+16.7%",status:"Adverse"    },
];

const SERVICELINES = [
  { line:"Company administration", budget:680000,  forecast:710000,  actual:348000, margin:38 },
  { line:"Trust administration",   budget:520000,  forecast:545000,  actual:268000, margin:42 },
  { line:"Compliance services",    budget:310000,  forecast:325000,  actual:162000, margin:45 },
  { line:"Accounting & finance",   budget:280000,  forecast:290000,  actual:141000, margin:35 },
  { line:"Specialist — Yachting",  budget:180000,  forecast:195000,  actual:94000,  margin:52 },
  { line:"Specialist — Sports",    budget:130000,  forecast:138000,  actual:68000,  margin:48 },
];

const POS = [
  { ref:"PO-2025-018", supplier:"Carey Olsen — Legal",     amount:12000, status:"Approved",  raised:"01/05/2025", dept:"Legal" },
  { ref:"PO-2025-019", supplier:"Microsoft Azure",          amount:3200,  status:"Approved",  raised:"01/06/2025", dept:"IT" },
  { ref:"PO-2025-020", supplier:"Worldcheck — Refinitiv",   amount:8400,  status:"Approved",  raised:"01/04/2025", dept:"Compliance" },
  { ref:"PO-2025-021", supplier:"KPMG — Audit fees",        amount:28000, status:"Pending",   raised:"14/07/2025", dept:"Finance" },
  { ref:"PO-2025-022", supplier:"Office supplies — IOM",    amount:1200,  status:"Approved",  raised:"10/07/2025", dept:"Operations" },
  { ref:"PO-2025-023", supplier:"Staff training — AML",     amount:4500,  status:"Pending",   raised:"14/07/2025", dept:"Compliance" },
];

export default function AffinityBudgeting() {
  const [entitySearch, setEntitySearch] = useState("");
  const [ds,setDs]=useState(null);
  useEffect(()=>{ if(!isConfigured) return; let ok=true; getDatasets("budget.").then(({data})=>{ if(ok&&data&&data.length){ const m={}; data.forEach(r=>{ m[r.dkey.split(".")[1]]=r.data; }); setDs(m); } }).catch(()=>{}); return ()=>{ok=false;}; },[]);
  const BUDGETSL = (ds&&ds["budgets"])||BUDGETS;
  const MONTHLYL = (ds&&ds["monthly"])||MONTHLY;
  const SCENARIOSL = (ds&&ds["scenarios"])||SCENARIOS;
  const VARIANCEL = (ds&&ds["variance"])||VARIANCE;
  const SERVICELINESL = (ds&&ds["servicelines"])||SERVICELINES;
  const POSL = (ds&&ds["pos"])||POS;
  const [tab,setTab]       = useState(0);
  const [selBudget,setSel] = useState(1);
  const [scenario,setScen] = useState(0);
  const [modal,setModal]   = useState(null);

  const budget = BUDGETSL.find(b=>b.id===selBudget);
  const ytdRev  = MONTHLYL.filter(m=>m.actual).reduce((s,m)=>s+(m.actual||0),0);
  const ytdCost = MONTHLYL.filter(m=>m.actualC).reduce((s,m)=>s+(m.actualC||0),0);
  const ytdBudRev = MONTHLYL.filter(m=>m.actual).reduce((s,m)=>s+m.budget,0);

  const th = {padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.4px",borderBottom:"0.5px solid #e5e5e5",background:"#f9f9f9",whiteSpace:"nowrap"};
  const td = {padding:"8px 12px",fontSize:11,borderBottom:"0.5px solid #e5e5e5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};

  return (
    <div style={{fontFamily:"'Catamaran',system-ui,sans-serif",background:"#fff",color:"#111",minHeight:"100vh"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px",borderBottom:"0.5px solid #e5e5e5"}}>
        <div style={{fontSize:18,fontWeight:500,color:CY}}>Affinity <span style={{color:"#111",fontWeight:300}}>Core</span><small style={{fontSize:11,color:"#999",fontWeight:300,marginLeft:8}}>Budgeting</small></div>
        <div style={{display:"flex",gap:6}}>
          <Btn onClick={()=>setModal("newBudget")}>+ New budget</Btn>
          <Btn primary onClick={()=>setModal("newBudget")}>+ New reforecast</Btn>
        </div>
      </div>
      {/* Entity search — same component as Entity Admin */}
      <div style={{ padding:"10px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-primary,#fff)" }}>
        <EntitySearch value={entitySearch} onChange={setEntitySearch} compact />
      </div>


      {/* Budget selector */}
      <div style={{display:"flex",gap:0,padding:"0 20px",borderBottom:"0.5px solid #e5e5e5",overflowX:"auto"}}>
        {BUDGETSL.map(b=>(
          <div key={b.id} onClick={()=>setSel(b.id)} style={{padding:"10px 16px",cursor:"pointer",borderBottom:`2px solid ${selBudget===b.id?CY:"transparent"}`,whiteSpace:"nowrap",fontSize:12,fontWeight:selBudget===b.id?600:400,color:selBudget===b.id?CY:"#666"}}>
            {b.name}
            <span style={{marginLeft:6,display:"inline-block",padding:"1px 6px",borderRadius:10,fontSize:9,fontWeight:600,background:b.status==="Approved"?"#EAF3DE":b.status==="Draft"?"#FAEEDA":"#E6F7FB",color:b.status==="Approved"?"#27500A":b.status==="Draft"?"#633806":"#0077A8"}}>{b.status}</span>
          </div>
        ))}
      </div>

      <div style={{padding:"16px 20px"}}>
        <SN tabs={["Budgets","Scenarios","Purchase orders","Settings"]} active={tab} onChange={setTab}/>

        {/* OVERVIEW */}
        {tab===0&&budget&&(<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:16,fontWeight:700}}>{budget.name}</div>
              <div style={{fontSize:11,color:"#999",marginTop:2}}>{budget.period} &middot; Owner: {budget.owner} &middot; Version: {budget.version}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn>Export ↗</Btn>
              <Btn>Edit budget</Btn>
              <Btn primary>Approve ✓</Btn>
            </div>
          </div>
          <KG cols={5} items={[
            {l:"Budgeted revenue",  v:fmt(budget.totalRev),   c:CY,      s:budget.period},
            {l:"Budgeted costs",    v:fmt(budget.totalCost),  c:null,    s:budget.period},
            {l:"Budgeted margin",   v:Math.round((budget.totalRev-budget.totalCost)/budget.totalRev*100)+"%", c:"#4CAF7D", s:"Target"},
            {l:"YTD actual revenue",v:fmt(ytdRev),            c:ytdRev>ytdBudRev?"#4CAF7D":"#F59E0B", s:ytdRev>ytdBudRev?"Ahead of budget":"Behind budget"},
            {l:"YTD variance",      v:(ytdRev-ytdBudRev>0?"+":"")+fmt(ytdRev-ytdBudRev), c:ytdRev>=ytdBudRev?"#4CAF7D":"#EF4444", s:"vs budget"},
          ]}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Card title="Revenue — budget vs actual vs forecast">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={MONTHLYL} margin={{top:0,right:0,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5"/>
                  <XAxis dataKey="month" tick={{fontSize:10}}/>
                  <YAxis tick={{fontSize:10}} tickFormatter={v=>"£"+(v/1000).toFixed(0)+"k"}/>
                  <Tooltip formatter={(v,n)=>v?["£"+Number(v).toLocaleString(),n]:["—",n]}/>
                  <Legend iconSize={8} wrapperStyle={{fontSize:10}}/>
                  <Bar dataKey="budget"   name="Budget"   fill="#E6F7FB" stroke={CY} strokeWidth={1}/>
                  <Bar dataKey="forecast" name="Forecast" fill={CY} opacity={0.7}/>
                  <Bar dataKey="actual"   name="Actual"   fill="#4CAF7D"/>
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Key metrics">
              {[
                ["Budget type",       budget.type],
                ["Status",            budget.status],
                ["Version",           budget.version],
                ["Period",            budget.period],
                ["Budget owner",      budget.owner],
                ["Total revenue",     fmt(budget.totalRev)],
                ["Total costs",       fmt(budget.totalCost)],
                ["Budgeted profit",   fmt(budget.totalRev-budget.totalCost)],
                ["Target margin",     Math.round((budget.totalRev-budget.totalCost)/budget.totalRev*100)+"%"],
                ["Last updated",      "14/07/2025"],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}>
                  <span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500}}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        </>)}

        {/* BUDGET VS ACTUAL */}
        {false&&(<>
          <div style={{background:"#EAF3DE22",border:"0.5px solid #4CAF7D",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#27500A",marginBottom:14}}>
            YTD revenue <strong>{fmt(ytdRev)}</strong> vs budget <strong>{fmt(ytdBudRev)}</strong> &mdash; <strong style={{color:ytdRev>=ytdBudRev?"#27500A":"#EF4444"}}>{ytdRev>=ytdBudRev?"Ahead":"Behind"} by {fmt(Math.abs(ytdRev-ytdBudRev))}</strong>
          </div>
          <Card title="Monthly revenue — budget vs forecast vs actual">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={MONTHLYL} margin={{top:0,right:10,left:-10,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5"/>
                <XAxis dataKey="month" tick={{fontSize:10}}/>
                <YAxis tick={{fontSize:10}} tickFormatter={v=>"£"+(v/1000).toFixed(0)+"k"}/>
                <Tooltip formatter={(v,n)=>v?["£"+Number(v).toLocaleString(),n]:["Not yet",n]}/>
                <Legend iconSize={8} wrapperStyle={{fontSize:10}}/>
                <Line type="monotone" dataKey="budget"   name="Budget"   stroke="#ccc" strokeWidth={1.5} strokeDasharray="4 2" dot={false}/>
                <Line type="monotone" dataKey="forecast" name="Forecast" stroke={CY}  strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="actual"   name="Actual"   stroke="#4CAF7D" strokeWidth={2.5} dot={{fill:"#4CAF7D",r:4}}/>
              </LineChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Variance analysis — YTD">
            <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
              <thead><tr>
                <th style={{...th,width:"24%"}}>Line item</th>
                <th style={{...th,width:"14%",textAlign:"right"}}>Full year budget</th>
                <th style={{...th,width:"14%",textAlign:"right"}}>YTD actual</th>
                <th style={{...th,width:"14%",textAlign:"right"}}>YTD variance</th>
                <th style={{...th,width:"10%",textAlign:"right"}}>%</th>
                <th style={{...th,width:"12%"}}>Status</th>
              </tr></thead>
              <tbody>
                {VARIANCEL.map((v,i)=>(
                  <tr key={i} style={{borderBottom:"0.5px solid #e5e5e5"}}>
                    <td style={{...td,fontWeight:500}}>{v.line}</td>
                    <td style={{...td,textAlign:"right",color:"#666"}}>{fmt(v.budget)}</td>
                    <td style={{...td,textAlign:"right",fontWeight:500}}>{fmt(v.actual)}</td>
                    <td style={{...td,textAlign:"right",fontWeight:600,color:v.variance>0?"#4CAF7D":"#EF4444"}}>{v.variance>0?"+":""}{fmt(v.variance)}</td>
                    <td style={{...td,textAlign:"right",color:v.variance>0?"#4CAF7D":"#EF4444",fontWeight:500}}>{v.pct}</td>
                    <td style={td}><Badge label={v.status} colors={v.status==="Favourable"?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#FCEBEB",color:"#A32D2D"}}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>)}

        {/* SCENARIOSL */}
        {tab===1&&(<>
          <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>Scenario modelling — FY 2025/26</div>
          <div style={{fontSize:11,color:"#666",marginBottom:14}}>Compare base case, best case, and downside scenarios. Adjust assumptions to model different outcomes.</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
            {SCENARIOSL.map((s,i)=>(
              <div key={i} onClick={()=>setScen(i)} style={{background:"#fff",border:`2px solid ${scenario===i?s.color:"#e5e5e5"}`,borderRadius:10,padding:16,cursor:"pointer"}}>
                <div style={{fontSize:13,fontWeight:700,color:s.color,marginBottom:8}}>{s.name}</div>
                {[["Revenue",fmt(s.rev)],["Costs",fmt(s.cost)],["Profit",fmt(s.rev-s.cost)],["Margin",s.margin+"%"],["Probability",s.prob]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}>
                    <span style={{color:"#666"}}>{k}</span><span style={{fontWeight:600}}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <Card title="Scenario comparison — revenue">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={[{name:"Revenue",...Object.fromEntries(SCENARIOSL.map(s=>[s.name,s.rev]))},{name:"Costs",...Object.fromEntries(SCENARIOSL.map(s=>[s.name,s.cost]))},{name:"Profit",...Object.fromEntries(SCENARIOSL.map(s=>[s.name,s.rev-s.cost]))}]} margin={{top:0,right:0,left:-10,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5"/>
                <XAxis dataKey="name" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:10}} tickFormatter={v=>"£"+(v/1000000).toFixed(1)+"m"}/>
                <Tooltip formatter={v=>["£"+Number(v).toLocaleString()]}/>
                <Legend iconSize={8} wrapperStyle={{fontSize:10}}/>
                {SCENARIOSL.map(s=><Bar key={s.name} dataKey={s.name} fill={s.color} opacity={0.85}/>)}
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <div style={{background:"#f9f9f9",borderRadius:8,padding:14}}>
            <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>Key assumptions — {SCENARIOSL[scenario].name}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["Revenue growth vs prior year",scenario===0?"8%":scenario===1?"15%":"-5%"],["New client onboardings",scenario===0?"12":scenario===1?"18":"6"],["Client attrition rate",scenario===0?"3%":scenario===1?"1%":"8%"],["Average fee increase",scenario===0?"3%":scenario===1?"5%":"0%"],["Staff cost increase",scenario===0?"4%":scenario===1?"4%":"4%"],["Headcount change",scenario===0?"+1":scenario===1?"+2":"-1"]].map(([k,v])=>(
                <div key={k} style={{background:"#fff",borderRadius:6,padding:"8px 12px"}}>
                  <div style={{fontSize:10,color:"#999",marginBottom:2}}>{k}</div>
                  <div style={{fontSize:13,fontWeight:600,color:SCENARIOSL[scenario].color}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </>)}

        {/* SERVICE LINES */}
        {false&&(<>
          <KG cols={4} items={[
            {l:"Service lines tracked",v:SERVICELINESL.length,c:CY},
            {l:"Highest margin",v:"Yachting 52%",c:"#4CAF7D"},
            {l:"Total budgeted revenue",v:fmt(SERVICELINESL.reduce((s,l)=>s+l.budget,0)),c:null},
            {l:"YTD actual vs budget",v:"+3.2%",c:"#4CAF7D",s:"Ahead"},
          ]}/>
          <Card title="Revenue by service line — budget vs forecast vs actual">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={SERVICELINESL.map(l=>({name:l.line.split(" — ")[0].replace(" administration","").replace(" services",""),budget:l.budget,forecast:l.forecast,actual:l.actual}))} margin={{top:0,right:0,left:-10,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5"/>
                <XAxis dataKey="name" tick={{fontSize:9}}/>
                <YAxis tick={{fontSize:10}} tickFormatter={v=>"£"+(v/1000).toFixed(0)+"k"}/>
                <Tooltip formatter={(v,n)=>["£"+Number(v).toLocaleString(),n]}/>
                <Legend iconSize={8} wrapperStyle={{fontSize:10}}/>
                <Bar dataKey="budget"   name="Budget"   fill="#e5e5e5"/>
                <Bar dataKey="forecast" name="Forecast" fill={CY} opacity={0.7}/>
                <Bar dataKey="actual"   name="Actual"   fill="#4CAF7D"/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
            <thead><tr>
              <th style={{...th,width:"28%"}}>Service line</th>
              <th style={{...th,width:"14%",textAlign:"right"}}>Budget</th>
              <th style={{...th,width:"14%",textAlign:"right"}}>Forecast</th>
              <th style={{...th,width:"14%",textAlign:"right"}}>YTD actual</th>
              <th style={{...th,width:"14%",textAlign:"right"}}>Variance</th>
              <th style={{...th,width:"10%",textAlign:"right"}}>Margin</th>
            </tr></thead>
            <tbody>
              {SERVICELINESL.map((l,i)=>{
                const v=l.actual-(l.budget/2);
                return (
                  <tr key={i} style={{borderBottom:"0.5px solid #e5e5e5"}}>
                    <td style={{...td,fontWeight:500}}>{l.line}</td>
                    <td style={{...td,textAlign:"right",color:"#666"}}>{fmt(l.budget)}</td>
                    <td style={{...td,textAlign:"right",color:CY,fontWeight:500}}>{fmt(l.forecast)}</td>
                    <td style={{...td,textAlign:"right",fontWeight:600}}>{fmt(l.actual)}</td>
                    <td style={{...td,textAlign:"right",fontWeight:600,color:v>=0?"#4CAF7D":"#EF4444"}}>{v>=0?"+":""}{fmt(v)}</td>
                    <td style={{...td,textAlign:"right",fontWeight:600,color:l.margin>=40?"#4CAF7D":l.margin>=35?"#F59E0B":"#EF4444"}}>{l.margin}%</td>
                  </tr>
                );
              })}
              <tr style={{background:"#f9f9f9",fontWeight:700}}>
                <td style={{...td,fontWeight:700}}>Total</td>
                <td style={{...td,textAlign:"right",fontWeight:700}}>{fmt(SERVICELINESL.reduce((s,l)=>s+l.budget,0))}</td>
                <td style={{...td,textAlign:"right",fontWeight:700,color:CY}}>{fmt(SERVICELINESL.reduce((s,l)=>s+l.forecast,0))}</td>
                <td style={{...td,textAlign:"right",fontWeight:700}}>{fmt(SERVICELINESL.reduce((s,l)=>s+l.actual,0))}</td>
                <td style={{...td,textAlign:"right",fontWeight:700,color:"#4CAF7D"}}>+{fmt(SERVICELINESL.reduce((s,l)=>s+(l.actual-(l.budget/2)),0))}</td>
                <td style={{...td,textAlign:"right",fontWeight:700,color:"#4CAF7D"}}>43%</td>
              </tr>
            </tbody>
          </table>
        </>)}

        {/* PURCHASE ORDERS */}
        {tab===2&&(<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <KG cols={4} items={[
              {l:"Total POs raised",     v:POSL.length,                                         c:CY},
              {l:"Total committed",      v:fmt(POSL.reduce((s,p)=>s+p.amount,0)),              c:null},
              {l:"Pending approval",     v:POSL.filter(p=>p.status==="Pending").length,         c:"#F59E0B"},
              {l:"Budget remaining (IT)",v:fmt(95000-POSL.filter(p=>p.dept==="IT").reduce((s,p)=>s+p.amount,0)),c:"#4CAF7D"},
            ]}/>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
            <Btn primary onClick={()=>setModal("po")}>+ Raise purchase order</Btn>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
            <thead><tr>
              <th style={{...th,width:"12%"}}>PO ref</th>
              <th style={{...th,width:"28%"}}>Supplier</th>
              <th style={{...th,width:"12%"}}>Department</th>
              <th style={{...th,width:"12%",textAlign:"right"}}>Amount</th>
              <th style={{...th,width:"12%"}}>Raised</th>
              <th style={{...th,width:"12%"}}>Status</th>
              <th style={{...th,width:"10%"}}>Action</th>
            </tr></thead>
            <tbody>
              {POSL.map((p,i)=>(
                <tr key={i} style={{borderBottom:"0.5px solid #e5e5e5"}}>
                  <td style={{...td,fontWeight:500,fontSize:10}}>{p.ref}</td>
                  <td style={{...td,fontWeight:500}}>{p.supplier}</td>
                  <td style={{...td,color:"#666"}}>{p.dept}</td>
                  <td style={{...td,textAlign:"right",fontWeight:600}}>{fmt(p.amount)}</td>
                  <td style={{...td,color:"#666"}}>{p.raised}</td>
                  <td style={td}><Badge label={p.status} colors={p.status==="Approved"?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#FAEEDA",color:"#633806"}}/></td>
                  <td style={td}>{p.status==="Pending"?<Btn primary>Approve ✓</Btn>:<Btn>View</Btn>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>)}

        {/* SETTINGS */}
        {tab===3&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Card title="Budget periods">
              {[["Current financial year","Apr 2025 – Mar 2026"],["Next financial year","Apr 2026 – Mar 2027"],["Budget cycle start","1 November"],["Reforecast frequency","Quarterly"],["Approval required","CFO + MD"]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}><span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500}}>{v}</span></div>
              ))}
            </Card>
            <Card title="Pricing rules">
              {[["Standard retainer uplift","3% per annum"],["Minimum fee — company","£1,800/year"],["Minimum fee — trust","£2,400/year"],["Ad hoc rate — standard","£250/hour"],["Ad hoc rate — director","£300/hour"],["Deviation approval","CFO sign-off required"],["Bundled service discount","Up to 10% with MD approval"]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}><span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500,textAlign:"right",maxWidth:180}}>{v}</span></div>
              ))}
            </Card>
            <Card title="Budget versions">
              {BUDGETSL.map(b=>(
                <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"0.5px solid #e5e5e5"}}>
                  <div><div style={{fontSize:12,fontWeight:500}}>{b.name}</div><div style={{fontSize:10,color:"#999"}}>{b.version} &middot; {b.owner}</div></div>
                  <Badge label={b.status} colors={b.status==="Approved"?{bg:"#EAF3DE",color:"#27500A"}:b.status==="Draft"?{bg:"#FAEEDA",color:"#633806"}:{bg:"#E6F7FB",color:"#0077A8"}}/>
                </div>
              ))}
            </Card>
            <Card title="Departments">
              {["Isle of Man","Malta","Cayman Islands","United Kingdom","Miami","Group — Finance","Group — Compliance","Group — IT","Group — Operations"].map(d=>(
                <div key={d} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}>
                  <span>{d}</span><Btn>Edit</Btn>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal==="newBudget"&&(
        <Md title="New budget / reforecast" onClose={()=>setModal(null)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Budget name","text","e.g. Group FY 2026/27",true],["Type","select","",false,["Annual","Departmental","Reforecast","Scenario"]],["Period start","text","DD/MM/YYYY"],["Period end","text","DD/MM/YYYY"],["Budget owner","select","",false,["Neil Kelly","Roxy Sheeley","Garry Crossan","Joanne Fenech"]],["Base on","select","",false,["Prior year actuals","Prior year budget","Blank"]],["Total revenue target","number","0"],["Total cost budget","number","0"]].map(([l,t,ph,full,opts])=>(
              <div key={l} style={{display:"flex",flexDirection:"column",gap:3,gridColumn:full?"1/-1":"auto"}}>
                <label style={{fontSize:11,color:"#666"}}>{l}</label>
                {t==="select"?<select style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",padding:"0 8px",height:32}}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>:<input type={t} style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",padding:"0 8px",height:32,background:"#fff"}} placeholder={ph}/>}
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><Btn onClick={()=>setModal(null)}>Cancel</Btn><Btn primary onClick={()=>setModal(null)}>Create budget</Btn></div>
        </Md>
      )}
      {modal==="po"&&(
        <Md title="Raise purchase order" onClose={()=>setModal(null)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Supplier name","text","Supplier",true],["Department","select","",false,["Finance","IT","Compliance","Legal","Operations","HR"]],["Amount","number","0.00"],["Currency","select","",false,["GBP","USD","EUR"]],["Budget line","select","",false,["Staff costs","IT & software","Professional fees","Office & premises","Travel & expenses","Other"]],["Description","text","Description of goods/services",true]].map(([l,t,ph,full,opts])=>(
              <div key={l} style={{display:"flex",flexDirection:"column",gap:3,gridColumn:full?"1/-1":"auto"}}>
                <label style={{fontSize:11,color:"#666"}}>{l}</label>
                {t==="select"?<select style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",padding:"0 8px",height:32}}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>:<input type={t} style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",padding:"0 8px",height:32,background:"#fff"}} placeholder={ph}/>}
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><Btn onClick={()=>setModal(null)}>Cancel</Btn><Btn primary onClick={()=>setModal(null)}>Submit for approval</Btn></div>
        </Md>
      )}
    </div>
  );
}
