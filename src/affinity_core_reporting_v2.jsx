import { useState, useEffect } from "react";
import ReportBuilder from "./affinity_core_report_builder";
import { getDatasets, isConfigured, bkPnlAll, bkEntities, bkTxnsAll, bkBanksAll } from "./affinity_ops_api";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
const CY = "#00C4CC";
const NAVY = "#001242";
const Row = ({ l, v, bold, hl }) => (
  <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:hl?`1px solid ${NAVY}`:"0.5px solid #eee", fontSize:12, fontWeight:bold?700:400, background:hl?"#F3FBFC":"transparent" }}>
    <span>{l}</span><span style={{ fontVariantNumeric:"tabular-nums" }}>{v}</span>
  </div>
);
const REPORT_CATALOG = [
  { label:"Financial statements", sub:"In Financial Reporting (accounting)", nav:"acc_report" },
  { label:"P&L (firm-wide)",       sub:"In Financial Reporting (accounting)", nav:"acc_report" },
  { label:"Budget vs actual",      sub:"In Financial Reporting (accounting)", nav:"acc_report" },
  { label:"Entity portfolio",      sub:"All entities & attributes",      nav:"entities" },
  { label:"Compliance registers",  sub:"Breaches, gifts, PEPs, CPD…",    nav:"compliance" },
  { label:"WIP",                   sub:"Unbilled time by office/client", nav:"acc_wip" },
  { label:"Aged debt",             sub:"Debtors by ageing band",         nav:"invoicing" },
  { label:"Assets under management",sub:"AUM & disposals",               nav:"entities" },
  { label:"Bank balances (FSA)",   sub:"Balances across entities",       nav:"entities" },
  { label:"Authorised signatories",sub:"Signatory register",            nav:"entities" },
  { label:"Safe custody & archiving",sub:"Items & movements",           nav:"entities" },
  { label:"Timesheets",            sub:"Time recording & utilisation",   nav:"timesheets" },
  { label:"CRM pipeline",          sub:"Prospects & proposals",          nav:"crm" },
  { label:"Budgets & scenarios",   sub:"Budget entry",                   nav:"budgeting" },
  { label:"Staff exits & attrition",sub:"Off-boarding & leaver analysis", nav:"attrition" },
];
const Badge = ({ label, colors }) => (<span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>);
const fmt = (n, s="£") => s + Math.abs(Number(n||0)).toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0});

const revenueByOffice = [
  { month:"Jan", IOM:18200, Malta:9400,  Cayman:24600, UK:6200, Miami:3100 },
  { month:"Feb", IOM:17800, Malta:10200, Cayman:23100, UK:5800, Miami:2900 },
  { month:"Mar", IOM:19400, Malta:11000, Cayman:25800, UK:7100, Miami:4200 },
  { month:"Apr", IOM:20100, Malta:9800,  Cayman:26400, UK:6600, Miami:3800 },
  { month:"May", IOM:18900, Malta:12200, Cayman:27200, UK:7400, Miami:5100 },
  { month:"Jun", IOM:21300, Malta:11600, Cayman:28900, UK:8200, Miami:4600 },
  { month:"Jul", IOM:19800, Malta:10900, Cayman:26100, UK:7800, Miami:5400 },
];

const wipTrend = [
  { month:"Feb", wip:38200 }, { month:"Mar", wip:41500 }, { month:"Apr", wip:44800 },
  { month:"May", wip:42100 }, { month:"Jun", wip:46300 }, { month:"Jul", wip:48320 },
];

const debtorTrend = [
  { month:"Feb", overdue:18200 }, { month:"Mar", overdue:22400 }, { month:"Apr", overdue:19800 },
  { month:"May", overdue:24100 }, { month:"Jun", overdue:21600 }, { month:"Jul", overdue:27720 },
];

const utilData = [
  { name:"Garry Crossan", util:82, target:75 },
  { name:"Colette Grisdale",  util:77, target:75 },
  { name:"Roxy Sheeley",   util:76, target:75 },
  { name:"Neil Kelly",     util:75, target:75 },
  { name:"Joanne Fenech",  util:74, target:75 },
  { name:"Patrick Walsh",  util:74, target:75 },
  { name:"Maria Borg",     util:74, target:75 },
  { name:"Andy Morgan",    util:56, target:75 },
  { name:"Sarah Cole",     util:0,  target:75 },
];

const riskPie = [
  { name:"Low",      value:142, color:"#4CAF7D" },
  { name:"Medium",   value:112, color:"#F59E0B" },
  { name:"High",     value:38,  color:"#EF4444" },
  { name:"Very High",value:8,   color:"#7B1D1D" },
];

const jurPie = [
  { name:"Isle of Man",    value:114, color:CY },
  { name:"Cayman Islands", value:87,  color:"#1A7FBF" },
  { name:"Malta",          value:52,  color:"#7C5CBF" },
  { name:"United Kingdom", value:31,  color:"#4A7C6F" },
  { name:"Miami",          value:16,  color:"#BF5C7A" },
];

const VIEWS = ["builder","executive","library","compliance","entities","operations","kpis"];
const VLABELS = ["Report builder","Executive overview","Report library","Compliance","Entity portfolio","Operations","KPIs & exports"];

const th = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)" };
const td = { padding:"8px 12px", fontSize:11, borderBottom:"0.5px solid #e5e5e5" };

export default function AffinityReporting({ onNav, role="system_admin" }) {
  const [view, setView] = useState("executive");
  const [period, setPeriod] = useState("YTD 2025");
  const [ds, setDs] = useState(null);
  const [budDs, setBudDs] = useState(null);
  const [pnlRows, setPnlRows] = useState(null);
  const [entList, setEntList] = useState([]);
  const [txnsAll, setTxnsAll] = useState([]);
  const [banksAll, setBanksAll] = useState([]);
  const [stmtEntity, setStmtEntity] = useState("");
  const [prepared, setPrepared] = useState(false);
  useEffect(() => {
    if (!isConfigured) return;
    let ok = true;
    getDatasets("report.").then(({ data }) => { if (ok && data && data.length) { const m = {}; data.forEach(r => { m[r.dkey.split(".")[1]] = r.data; }); setDs(m); } }).catch(() => {});
    getDatasets("budget.").then(({ data }) => { if (ok && data && data.length) { const m = {}; data.forEach(r => { m[r.dkey.split(".")[1]] = r.data; }); setBudDs(m); } }).catch(() => {});
    Promise.all([bkPnlAll(), bkEntities(), bkTxnsAll(), bkBanksAll()]).then(([p, e, t, b]) => {
      if (!ok) return;
      const emap = {}; (e.data || []).forEach(x => { emap[x.id] = x; });
      if (p.data && e.data) setPnlRows(p.data.map(r => ({ entity: (emap[r.entity_id] || {}).name || ("Entity " + r.entity_id), sym: r.sym || "£", income: Number(r.income), expenses: Number(r.expenses), net: Number(r.net) })));
      if (e.data) setEntList(e.data);
      if (t.data) setTxnsAll(t.data);
      if (b.data) setBanksAll(b.data);
    }).catch(() => {});
    return () => { ok = false; };
  }, []);
  const revenueByOfficeL = (ds && ds.revenueByOffice) || revenueByOffice;
  const wipTrendL = (ds && ds.wipTrend) || wipTrend;
  const debtorTrendL = (ds && ds.debtorTrend) || debtorTrend;
  const utilDataL = (ds && ds.utilData) || utilData;
  const riskPieL = (ds && ds.riskPie) || riskPie;
  const jurPieL = (ds && ds.jurPie) || jurPie;
  const budgetVariance = (budDs && budDs.variance) || [];
  const budgetMonthly = (budDs && budDs.monthly) || [];
  const budgetServicelines = (budDs && budDs.servicelines) || [];
  const pnl = pnlRows || [];

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };
  const sel = { height:28, padding:"0 8px", fontSize:11, borderRadius:5, border:"0.5px solid #ccc", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", cursor:"pointer" };
  const card = { background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:8, padding:14, marginBottom:14 };
  const cardT = { fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.4px", color:"#666", marginBottom:12 };
  const sc  = { background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 12px" };
  const g2  = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 };
  const g3  = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 };

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
        <div style={{ fontSize:18, fontWeight:500, color:CY }}>Affinity <span style={{ color:"var(--text-primary,#111)", fontWeight:300 }}>Core</span><small style={{ fontSize:11, color:"#999", fontWeight:300, marginLeft:8 }}>Reporting</small></div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entities","Compliance","Timesheets","Invoicing"].map(n=><button key={n} style={nb} onClick={()=>onNav&&onNav({Entities:"entities",Compliance:"compliance",Timesheets:"timesheets",Invoicing:"invoicing",Reporting:"reporting",Documents:"documents",Bookkeeping:"bookkeeping"}[n])}>{n}</button>)}
          <button style={nba}>Reporting</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:"flex", gap:4, padding:"8px 20px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", flexWrap:"wrap", alignItems:"center" }}>
        {VIEWS.map((v,i)=>(
          <button key={v} style={{ padding:"4px 12px", fontSize:11, borderRadius:20, border:`0.5px solid ${view===v?"#ccc":"#e5e5e5"}`, background:view===v?"var(--bg-primary,#fff)":"transparent", color:view===v?"var(--text-primary,#111)":"#666", cursor:"pointer", fontWeight:view===v?500:400 }} onClick={()=>setView(v)}>{VLABELS[i]}</button>
        ))}
        <select style={{ ...sel, marginLeft:"auto" }} value={period} onChange={e=>setPeriod(e.target.value)}>
          {["YTD 2025","Q2 2025","Q1 2025","FY 2024","Custom"].map(p=><option key={p}>{p}</option>)}
        </select>
        <button style={nba}>Export ↗</button>
      </div>

      {view==="builder" && <ReportBuilder isAdmin={role==="system_admin"} onNav={onNav} />}

      {view!=="builder" && <div style={{ padding:"16px 20px" }}>

        {/* EXECUTIVE OVERVIEW */}
        {view==="executive"&&(<>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:14 }}>
            {[{l:"Revenue YTD",v:"£487k",c:CY},{l:"Entities",v:"300",c:null},{l:"WIP balance",v:"£48,320",c:null},{l:"Overdue debt",v:"£27,720",c:"#EF4444"},{l:"Live alerts",v:"10",c:"#F59E0B"}].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:20, fontWeight:600, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
            ))}
          </div>
          <div style={g2}>
            <div style={card}>
              <div style={cardT}>Revenue by office — {period}</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueByOfficeL} margin={{ top:0, right:0, left:-10, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="month" tick={{ fontSize:10 }} />
                  <YAxis tick={{ fontSize:10 }} tickFormatter={v=>"£"+(v/1000).toFixed(0)+"k"} />
                  <Tooltip formatter={(v,n)=>["£"+Number(v).toLocaleString(),n]} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize:10 }} />
                  <Bar dataKey="IOM"    name="Isle of Man"    stackId="a" fill={CY} />
                  <Bar dataKey="Malta"  name="Malta"          stackId="a" fill="#7C5CBF" />
                  <Bar dataKey="Cayman" name="Cayman Islands" stackId="a" fill="#1A7FBF" />
                  <Bar dataKey="UK"     name="UK"             stackId="a" fill="#4A7C6F" />
                  <Bar dataKey="Miami"  name="Miami"          stackId="a" fill="#BF5C7A" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={card}>
              <div style={cardT}>Entities by jurisdiction</div>
              <div style={{ display:"flex", alignItems:"center", gap:20 }}>
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={jurPieL} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                      {jurPieL.map((e,i)=><Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v,n)=>[v+" entities",n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex:1 }}>
                  {jurPieL.map(j=>(
                    <div key={j.name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0", fontSize:12 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:8, height:8, borderRadius:2, background:j.color, flexShrink:0 }} />
                        <span style={{ color:"#666" }}>{j.name}</span>
                      </div>
                      <span style={{ fontWeight:600 }}>{j.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div style={g3}>
            <div style={card}>
              <div style={cardT}>WIP trend</div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={wipTrendL} margin={{ top:0, right:5, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="month" tick={{ fontSize:10 }} />
                  <YAxis tick={{ fontSize:10 }} tickFormatter={v=>"£"+(v/1000).toFixed(0)+"k"} />
                  <Tooltip formatter={v=>["£"+Number(v).toLocaleString(),"WIP"]} />
                  <Line type="monotone" dataKey="wip" stroke={CY} strokeWidth={2} dot={{ fill:CY, r:3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={card}>
              <div style={cardT}>Overdue debt trend</div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={debtorTrendL} margin={{ top:0, right:5, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="month" tick={{ fontSize:10 }} />
                  <YAxis tick={{ fontSize:10 }} tickFormatter={v=>"£"+(v/1000).toFixed(0)+"k"} />
                  <Tooltip formatter={v=>["£"+Number(v).toLocaleString(),"Overdue"]} />
                  <Line type="monotone" dataKey="overdue" stroke="#EF4444" strokeWidth={2} dot={{ fill:"#EF4444", r:3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={card}>
              <div style={cardT}>Risk distribution</div>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <ResponsiveContainer width="50%" height={140}>
                  <PieChart>
                    <Pie data={riskPieL} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={25}>
                      {riskPieL.map((e,i)=><Cell key={i} fill={e.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div>
                  {riskPieL.map(r=>(
                    <div key={r.name} style={{ display:"flex", justifyContent:"space-between", gap:16, padding:"3px 0", fontSize:11 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:7, height:7, borderRadius:2, background:r.color }} /><span style={{ color:"#666" }}>{r.name}</span></div>
                      <span style={{ fontWeight:600 }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>)}

        {/* FINANCE */}
        {view==="statements"&&(()=>{
          const ent = entList.find(e=>e.name===stmtEntity);
          const eid = ent?.id;
          const sym = ent?.sym || "£";
          const fmtS = (n)=> sym + Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
          const etx = eid ? txnsAll.filter(t=>t.entity_id===eid) : [];
          const prow = pnl.find(p=>p.entity===stmtEntity);
          const incomeLines = {}, expenseLines = {};
          etx.forEach(t=>{ const acc=t.account||t.type||"Other"; const cr=Number(t.cr||0), dr=Number(t.dr||0);
            if ((t.type==="Income"||t.type==="Receipt") && cr) incomeLines[acc]=(incomeLines[acc]||0)+cr;
            else if (t.type==="Expense" && dr) expenseLines[acc]=(expenseLines[acc]||0)+dr; });
          const incTotal = prow? prow.income : Object.values(incomeLines).reduce((s,v)=>s+v,0);
          const expTotal = prow? prow.expenses : Object.values(expenseLines).reduce((s,v)=>s+v,0);
          const net = incTotal - expTotal;
          const cash = eid ? banksAll.filter(b=>b.entity_id===eid).reduce((s,b)=>s+Number(b.balance||0),0) : 0;
          return (
            <div style={{ padding:"16px 20px" }}>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:16, flexWrap:"wrap" }}>
                <input list="rep-ent-list" value={stmtEntity} onChange={e=>{setStmtEntity(e.target.value); setPrepared(false);}} placeholder="Search entity by name…" style={{ ...nb, minWidth:260, height:34 }} />
                <datalist id="rep-ent-list">{entList.map(e=><option key={e.id} value={e.name}/>)}</datalist>
                <button style={nba} disabled={!stmtEntity} onClick={()=>setPrepared(true)}>Prepare financial statements</button>
                {prepared && <button style={nb} onClick={()=>window.print()}>⭳ PDF / print</button>}
              </div>
              {!prepared ? (
                <div style={{ color:"#999", fontSize:12, padding:"30px 0", textAlign:"center" }}>Select an entity and click <strong>Prepare</strong> to generate its financial statements from the ledger.</div>
              ) : (
                <div style={{ maxWidth:620 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:NAVY }}>{stmtEntity}</div>
                  <div style={{ fontSize:11, color:"#888", marginBottom:16 }}>Financial statements · prepared {new Date().toLocaleDateString("en-GB")} · unaudited</div>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:6, borderBottom:`2px solid ${NAVY}`, paddingBottom:4 }}>Profit &amp; Loss</div>
                  <div style={{ fontSize:11, fontWeight:600, color:"#888", margin:"8px 0 2px" }}>Income</div>
                  {Object.keys(incomeLines).length? Object.entries(incomeLines).map(([a,v])=><Row key={a} l={a} v={fmtS(v)} />) : <Row l="Fee income" v={fmtS(incTotal)} />}
                  <Row l="Total income" v={fmtS(incTotal)} bold />
                  <div style={{ fontSize:11, fontWeight:600, color:"#888", margin:"12px 0 2px" }}>Expenses</div>
                  {Object.keys(expenseLines).length? Object.entries(expenseLines).map(([a,v])=><Row key={a} l={a} v={fmtS(v)} />) : <Row l="Operating expenses" v={fmtS(expTotal)} />}
                  <Row l="Total expenses" v={fmtS(expTotal)} bold />
                  <Row l="Net profit / (loss)" v={fmtS(net)} bold hl />
                  <div style={{ fontSize:13, fontWeight:700, margin:"24px 0 6px", borderBottom:`2px solid ${NAVY}`, paddingBottom:4 }}>Balance Sheet</div>
                  <div style={{ fontSize:11, fontWeight:600, color:"#888", margin:"8px 0 2px" }}>Assets</div>
                  <Row l="Cash at bank" v={fmtS(cash)} />
                  <Row l="Total assets" v={fmtS(cash)} bold />
                  <div style={{ fontSize:11, fontWeight:600, color:"#888", margin:"12px 0 2px" }}>Equity</div>
                  <Row l="Retained earnings" v={fmtS(net)} />
                  <Row l="Total equity" v={fmtS(net)} bold />
                  <div style={{ fontSize:10, color:"#999", marginTop:16 }}>Prepared from the bookkeeping ledger. P&amp;L is complete; the balance sheet currently shows cash and retained earnings — full mapping (debtors, creditors, fixed assets, reserves) is delivered by the statement-mapping engine in the write phase. Figures in {sym}.</div>
                </div>
              )}
            </div>
          );})()}

        {view==="library"&&(
          <div style={{ padding:"16px 20px" }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Report library</div>
            <div style={{ fontSize:11, color:"#888", marginBottom:16 }}>Report on any category of data across the system. Financial reports open here; others jump to their module, where each has export.</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
              {REPORT_CATALOG.map(cat=>(
                <div key={cat.label} style={{ border:"0.5px solid #e5e5e5", borderRadius:8, padding:14 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:NAVY }}>{cat.label}</div>
                  <div style={{ fontSize:10, color:"#888", margin:"4px 0 10px" }}>{cat.sub}</div>
                  <button style={nb} onClick={()=>cat.view?setView(cat.view):(cat.nav&&onNav&&onNav(cat.nav))}>{cat.view?"Open report →":"Open module →"}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {view==="finance"&&(<>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
            {[{l:"Revenue YTD",v:"£487k",c:CY,sub:"vs £421k last year"},{l:"Total WIP",v:"£48,320",c:null,sub:"6-month high"},{l:"Outstanding debt",v:"£44,550",c:"#F59E0B",sub:"£27,720 overdue"},{l:"Collected YTD",v:"£412k",c:"#4CAF7D",sub:"84% recovery rate"}].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:20, fontWeight:600, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div><div style={{ fontSize:10, color:"#aaa", marginTop:2 }}>{k.sub}</div></div>
            ))}
          </div>
          <div style={g2}>
            <div style={card}>
              <div style={cardT}>Revenue by office — monthly</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueByOfficeL} margin={{ top:0, right:0, left:-10, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="month" tick={{ fontSize:10 }} />
                  <YAxis tick={{ fontSize:10 }} tickFormatter={v=>"£"+(v/1000).toFixed(0)+"k"} />
                  <Tooltip formatter={(v,n)=>["£"+Number(v).toLocaleString(),n]} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize:10 }} />
                  <Bar dataKey="IOM" name="IOM" fill={CY} />
                  <Bar dataKey="Malta" name="Malta" fill="#7C5CBF" />
                  <Bar dataKey="Cayman" name="Cayman" fill="#1A7FBF" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={card}>
              <div style={cardT}>Revenue split by office — YTD</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>
                  {["Office","Revenue","% of total","vs LY"].map(h=><th key={h} style={{ ...th, padding:"6px 10px" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[["Isle of Man","£136,500","28%","+8%"],["Cayman Islands","£197,100","40%","+14%"],["Malta","£85,100","17%","+6%"],["United Kingdom","£49,300","10%","+3%"],["Miami","£29,000","6%","+22%"]].map(([o,r,p,v])=>(
                    <tr key={o} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                      <td style={td}>{o}</td>
                      <td style={{ ...td, fontWeight:600 }}>{r}</td>
                      <td style={{ ...td, color:"#666" }}>{p}</td>
                      <td style={{ ...td, color:"#4CAF7D", fontWeight:500 }}>{v}</td>
                    </tr>
                  ))}
                  <tr style={{ background:"var(--bg-secondary,#f9f9f9)" }}>
                    <td style={{ ...td, fontWeight:600 }}>Group total</td>
                    <td style={{ ...td, fontWeight:700, color:CY }}>£497,000</td>
                    <td style={{ ...td, fontWeight:600 }}>100%</td>
                    <td style={{ ...td, color:"#4CAF7D", fontWeight:600 }}>+10%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div style={g2}>
            <div style={card}>
              <div style={cardT}>WIP & debtors trend</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={wipTrendL} margin={{ top:0, right:5, left:-10, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="month" tick={{ fontSize:10 }} />
                  <YAxis tick={{ fontSize:10 }} tickFormatter={v=>"£"+(v/1000).toFixed(0)+"k"} />
                  <Tooltip formatter={v=>["£"+Number(v).toLocaleString()]} />
                  <Line type="monotone" dataKey="wip" stroke={CY} strokeWidth={2} name="WIP" dot={{ fill:CY, r:3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={card}>
              <div style={cardT}>Aged debt summary</div>
              {[{l:"Current (0-30d)",v:"£18,450",c:"#4CAF7D"},{l:"31-60 days",v:"£12,200",c:"#F59E0B"},{l:"61-90 days",v:"£8,750",c:"#F59E0B"},{l:"90+ days",v:"£5,320",c:"#EF4444"},{l:"Total outstanding",v:"£44,720",c:CY}].map(k=>(
                <div key={k.l} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12 }}>
                  <span style={{ color:"#666" }}>{k.l}</span><span style={{ fontWeight:600, color:k.c }}>{k.v}</span>
                </div>
              ))}
            </div>
          </div>
        </>)}

        {/* BUDGET VS ACTUAL */}
        {view==="budget"&&(<>
          <div style={card}>
            <div style={cardT}>Budget vs actual — by line</div>
            {budgetVariance.length>0?(
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>
                  {["Line","Budget","Actual","Variance","%","Status"].map((h,i)=><th key={h} style={{ padding:"7px 10px", textAlign:i===0?"left":"right", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {budgetVariance.map((r,i)=>(
                    <tr key={i} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                      <td style={{ padding:"7px 10px", fontSize:12, fontWeight:500 }}>{r.line}</td>
                      <td style={{ padding:"7px 10px", fontSize:12, textAlign:"right", color:"#666" }}>{fmt(r.budget)}</td>
                      <td style={{ padding:"7px 10px", fontSize:12, textAlign:"right" }}>{fmt(r.actual)}</td>
                      <td style={{ padding:"7px 10px", fontSize:12, textAlign:"right", color:r.variance<0?"#EF4444":"#4CAF7D" }}>{r.variance<0?"-":"+"}{fmt(r.variance)}</td>
                      <td style={{ padding:"7px 10px", fontSize:12, textAlign:"right", color:"#666" }}>{r.pct}</td>
                      <td style={{ padding:"7px 10px", textAlign:"right" }}><Badge label={r.status} colors={r.status==="Favourable"?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#FCEBEB",color:"#A32D2D"}} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ):<div style={{ color:"#666", fontSize:12, padding:"16px 0", textAlign:"center" }}>Budget data loads from the ui_dataset store (run affinity_datasets.sql).</div>}
          </div>
          {budgetMonthly.length>0&&<div style={card}>
            <div style={cardT}>Revenue — budget vs forecast vs actual</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={budgetMonthly} margin={{ top:5, right:10, left:-10, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="month" tick={{ fontSize:11 }} /><YAxis tick={{ fontSize:11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize:11 }} />
                <Line type="monotone" dataKey="budget" stroke="#999" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="forecast" stroke="#F59E0B" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="actual" stroke={CY} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>}
          <div style={{ fontSize:10, color:"#999", marginTop:4 }}>Budgets and scenarios are entered in the Budgeting section; this is the reporting view of the result.</div>
        </>)}

        {/* P&L (firm-wide, by entity) */}
        {view==="pnl"&&(<>
          <div style={g3}>
            <div style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>Total income</div><div style={{ fontSize:18, fontWeight:600, color:CY }}>{fmt(pnl.reduce((s,r)=>s+r.income,0))}</div></div>
            <div style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>Total expenses</div><div style={{ fontSize:18, fontWeight:600 }}>{fmt(pnl.reduce((s,r)=>s+r.expenses,0))}</div></div>
            <div style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>Net position</div><div style={{ fontSize:18, fontWeight:600, color:pnl.reduce((s,r)=>s+r.net,0)>=0?"#4CAF7D":"#EF4444" }}>{fmt(pnl.reduce((s,r)=>s+r.net,0))}</div></div>
          </div>
          <div style={card}>
            <div style={cardT}>Profit &amp; loss by entity</div>
            {pnl.length>0?(
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>
                  {["Entity","Income","Expenses","Net"].map((h,i)=><th key={h} style={{ padding:"7px 10px", textAlign:i===0?"left":"right", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {pnl.map((r,i)=>(
                    <tr key={i} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                      <td style={{ padding:"7px 10px", fontSize:12, fontWeight:500 }}>{r.entity}</td>
                      <td style={{ padding:"7px 10px", fontSize:12, textAlign:"right", color:"#666" }}>{fmt(r.income, r.sym)}</td>
                      <td style={{ padding:"7px 10px", fontSize:12, textAlign:"right", color:"#666" }}>{fmt(r.expenses, r.sym)}</td>
                      <td style={{ padding:"7px 10px", fontSize:12, textAlign:"right", fontWeight:600, color:r.net>=0?"#4CAF7D":"#EF4444" }}>{r.net<0?"-":""}{fmt(r.net, r.sym)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ):<div style={{ color:"#666", fontSize:12, padding:"16px 0", textAlign:"center" }}>P&amp;L loads from the bookkeeping ledgers (run affinity_bookkeeping.sql). Note: entities may be in different currencies.</div>}
          </div>
          <div style={{ fontSize:10, color:"#999", marginTop:4 }}>Per-entity P&amp;L is drawn from the bookkeeping ledgers. Entities reported in their own functional currency.</div>
        </>)}

        {/* COMPLIANCE */}
        {view==="compliance"&&(<>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:14 }}>
            {[{l:"Overdue reviews",v:3,c:"#EF4444"},{l:"Due this month",v:2,c:"#F59E0B"},{l:"Expired KYC",v:2,c:"#EF4444"},{l:"Open cases",v:5,c:"#F59E0B"},{l:"Completion rate",v:"94%",c:"#4CAF7D"}].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:20, fontWeight:600, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
            ))}
          </div>
          <div style={g2}>
            <div style={card}>
              <div style={cardT}>Review schedule — upcoming & overdue</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>{["Entity","Risk","Due","Status"].map(h=><th key={h} style={{ ...th, padding:"6px 10px" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {[
                    ["Harrington Family Trust","High","05/01/2025","Overdue"],
                    ["Pacific Wealth Trust","High","18/02/2025","Overdue"],
                    ["North Star Holdings Ltd","High","30/03/2025","Overdue"],
                    ["Apex Growth Fund Ltd","Very High","12/07/2025","Due this month"],
                    ["Meridian Holdings Ltd","Medium","14/09/2025","Upcoming"],
                    ["Rosewood Legacy Trust","Medium","25/03/2026","Upcoming"],
                  ].map(([e,r,d,s])=>(
                    <tr key={e} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                      <td style={{ ...td, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", maxWidth:180 }}>{e}</td>
                      <td style={td}><Badge label={r} colors={{ High:{bg:"#FCEBEB",color:"#A32D2D"},"Very High":{bg:"#F7C1C1",color:"#501313"},Medium:{bg:"#FAEEDA",color:"#633806"} }[r]||{bg:"#eee",color:"#666"}} /></td>
                      <td style={{ ...td, color:s==="Overdue"?"#EF4444":"#666" }}>{d}</td>
                      <td style={td}><Badge label={s} colors={{ Overdue:{bg:"#FCEBEB",color:"#A32D2D"},"Due this month":{bg:"#FAEEDA",color:"#633806"},Upcoming:{bg:"#E6F7FB",color:"#0077A8"} }[s]||{bg:"#eee",color:"#666"}} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={card}>
              <div style={cardT}>Risk portfolio</div>
              <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                <ResponsiveContainer width="45%" height={160}>
                  <PieChart>
                    <Pie data={riskPieL} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={28}>
                      {riskPieL.map((e,i)=><Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v,n)=>[v+" entities",n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex:1 }}>
                  {riskPieL.map(r=>(
                    <div key={r.name} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:2 }}>
                        <span style={{ color:"#666" }}>{r.name}</span><span style={{ fontWeight:600 }}>{r.value}</span>
                      </div>
                      <div style={{ height:5, background:"#eee", borderRadius:3 }}>
                        <div style={{ height:"100%", width:`${(r.value/300)*100}%`, background:r.color, borderRadius:3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div style={card}>
            <div style={cardT}>Compliance KPIs by office</div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>{["Office","Total entities","Reviews current","Overdue","KYC issues","Open cases","Completion rate"].map(h=><th key={h} style={{ ...th, padding:"6px 10px" }}>{h}</th>)}</tr></thead>
              <tbody>
                {[["Isle of Man",114,110,3,2,3,"96%"],["Cayman Islands",87,84,2,1,2,"97%"],["Malta",52,52,0,0,0,"100%"],["United Kingdom",31,30,1,0,1,"97%"],["Miami",16,16,0,0,0,"100%"]].map(([o,t,c,ov,k,cs,rt])=>(
                  <tr key={o} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                    <td style={{ ...td, fontWeight:500 }}>{o}</td>
                    <td style={{ ...td, textAlign:"center" }}>{t}</td>
                    <td style={{ ...td, textAlign:"center", color:"#4CAF7D", fontWeight:500 }}>{c}</td>
                    <td style={{ ...td, textAlign:"center", color:ov>0?"#EF4444":"#4CAF7D", fontWeight:500 }}>{ov||"—"}</td>
                    <td style={{ ...td, textAlign:"center", color:k>0?"#EF4444":"#4CAF7D", fontWeight:500 }}>{k||"—"}</td>
                    <td style={{ ...td, textAlign:"center", color:cs>0?"#F59E0B":"#4CAF7D", fontWeight:500 }}>{cs||"—"}</td>
                    <td style={{ ...td, textAlign:"center", color:parseFloat(rt)<100?"#F59E0B":"#4CAF7D", fontWeight:600 }}>{rt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ENTITY PORTFOLIO */}
        {view==="entities"&&(<>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
            {[{l:"Total entities",v:300,c:CY},{l:"Active",v:284,c:"#4CAF7D"},{l:"Dormant / liquidation",v:16,c:"#F59E0B"},{l:"Onboardings in progress",v:5,c:null}].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:20, fontWeight:600, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
            ))}
          </div>
          <div style={g2}>
            <div style={card}>
              <div style={cardT}>Entities by type</div>
              {[{l:"Companies",v:168,c:CY},{l:"Trusts",v:94,c:"#7C5CBF"},{l:"Foundations",v:24,c:"#4A7C6F"},{l:"LLCs & partnerships",v:14,c:"#BF5C7A"}].map(k=>(
                <div key={k.l} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}>
                    <span style={{ color:"#666" }}>{k.l}</span><span style={{ fontWeight:600 }}>{k.v}</span>
                  </div>
                  <div style={{ height:5, background:"#eee", borderRadius:3 }}>
                    <div style={{ height:"100%", width:`${(k.v/300)*100}%`, background:k.c, borderRadius:3 }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={cardT}>Entities by status</div>
              {[{l:"Active",v:284,c:"#4CAF7D"},{l:"Dormant",v:8,c:"#F59E0B"},{l:"In liquidation",v:5,c:"#EF4444"},{l:"Dissolved / struck off",v:3,c:"#aaa"}].map(k=>(
                <div key={k.l} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12 }}>
                  <span style={{ color:"#666" }}>{k.l}</span><span style={{ fontWeight:600, color:k.c }}>{k.v}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={card}>
            <div style={cardT}>Entities by administrator — portfolio size</div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>{["Administrator","Office","Entities","Active","High/VH risk","Reviews due"].map(h=><th key={h} style={{ ...th, padding:"6px 10px" }}>{h}</th>)}</tr></thead>
              <tbody>
                {[["Roxy Sheeley","IOM",65,63,4,3],["Garry Crossan","Cayman",58,56,6,2],["Joanne Fenech","Malta",42,42,0,0],["Patrick Walsh","Cayman",29,28,2,0],["Neil Kelly","Group",24,22,1,0],["Maria Borg","Malta",18,18,0,0],["Sarah Cole","IOM",14,14,1,0],["Andy Morgan","Group",50,41,1,1]].map(([n,o,t,a,h,r])=>(
                  <tr key={n} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                    <td style={{ ...td, fontWeight:500 }}>{n}</td>
                    <td style={{ ...td, color:"#666" }}>{o}</td>
                    <td style={{ ...td, textAlign:"center", fontWeight:600 }}>{t}</td>
                    <td style={{ ...td, textAlign:"center", color:"#4CAF7D" }}>{a}</td>
                    <td style={{ ...td, textAlign:"center", color:h>0?"#EF4444":"#aaa" }}>{h||"—"}</td>
                    <td style={{ ...td, textAlign:"center", color:r>0?"#F59E0B":"#aaa" }}>{r||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}

        {/* OPERATIONS */}
        {view==="operations"&&(<>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
            {[{l:"Team utilisation",v:"75%",c:CY},{l:"Missing timesheets",v:1,c:"#EF4444"},{l:"Pending approvals",v:12,c:"#F59E0B"},{l:"Overdue tasks",v:7,c:"#F59E0B"}].map(k=>(
              <div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:20, fontWeight:600, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>
            ))}
          </div>
          <div style={g2}>
            <div style={card}>
              <div style={cardT}>Team utilisation — week ending 14 Jul 2025</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={utilDataL} layout="vertical" margin={{ top:0, right:30, left:80, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" horizontal={false} />
                  <XAxis type="number" domain={[0,100]} tick={{ fontSize:10 }} tickFormatter={v=>v+"%"} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize:10 }} width={80} />
                  <Tooltip formatter={v=>[v+"%","Utilisation"]} />
                  <Bar dataKey="util" fill={CY} radius={[0,3,3,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ fontSize:10, color:"#aaa", marginTop:4 }}>Target: 75% · Sarah Cole: no timesheet submitted</div>
            </div>
            <div style={card}>
              <div style={cardT}>Onboarding pipeline status</div>
              {[{s:"New business",n:1},{s:"KYC collection",n:1},{s:"Compliance review",n:1},{s:"LOE & fee setup",n:1},{s:"Entity setup",n:1}].map(k=>(
                <div key={k.s} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"0.5px solid #e5e5e5" }}>
                  <span style={{ fontSize:12, color:"#666" }}>{k.s}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontWeight:600 }}>{k.n}</span>
                    <div style={{ width:40, height:6, background:"#eee", borderRadius:3 }}>
                      <div style={{ height:"100%", width:`${(k.n/5)*100}%`, background:CY, borderRadius:3 }} />
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize:10, color:"#EF4444", marginTop:8 }}>⚠ Solaris Family Trust overdue at compliance review stage</div>
            </div>
          </div>
        </>)}

        {/* KPIs & EXPORTS */}
        {view==="kpis"&&(
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              {[
                { title:"Full management pack",      desc:"Executive summary, P&L by office, compliance status, entity portfolio, operations overview. PDF format.",       period:true },
                { title:"Compliance board report",   desc:"Overdue reviews, risk distribution, open cases, KYC expiries, regulatory obligations. Ready for board.",      period:true },
                { title:"Finance report",            desc:"Revenue by office, WIP analysis, aged debt, invoice ledger, collections performance.",                         period:true },
                { title:"Entity portfolio report",   desc:"Full entity list with status, risk, administrator, and outstanding obligations. Filterable by jurisdiction.",  period:false },
                { title:"Utilisation report",        desc:"Billable vs total hours, team performance against target, missing timesheets, PRFTINS analysis.",               period:true },
                { title:"Regulatory evidence pack",  desc:"Compliance records, review history, screening results, and KYC documentation for a selected entity.",         period:false },
              ].map(r=>(
                <div key={r.title} style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:8, padding:"12px 14px" }}>
                  <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>{r.title}</div>
                  <div style={{ fontSize:11, color:"#666", lineHeight:1.5, marginBottom:10 }}>{r.desc}</div>
                  <div style={{ display:"flex", gap:6 }}>
                    {r.period&&<select style={{ ...sel, flex:1, height:28, fontSize:11 }}><option>YTD 2025</option><option>Q2 2025</option><option>FY 2024</option></select>}
                    <button style={{ ...nb, fontSize:10 }}>Word ↗</button>
                    <button style={nba}>PDF ↗</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={cardT}>Defined KPIs — current values</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>{["KPI","Current","Target","Status","Trend"].map(h=><th key={h} style={{ ...th, padding:"6px 10px" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {[
                    ["Compliance review completion rate","94%","100%","amber","↑"],
                    ["Team utilisation (billable hours)","75%","75%","green","→"],
                    ["WIP recovery rate","84%","90%","amber","↑"],
                    ["Invoice overdue rate","12%","<5%","red","↑"],
                    ["Onboarding completion — on time","60%","80%","red","↓"],
                    ["KYC currency rate","99.3%","100%","amber","→"],
                    ["Timesheet submission rate","89%","100%","amber","↓"],
                    ["Data quality score","92%","95%","amber","↑"],
                  ].map(([k,c,t,s,tr])=>(
                    <tr key={k} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                      <td style={{ ...td, fontWeight:500 }}>{k}</td>
                      <td style={{ ...td, fontWeight:600, color:s==="green"?"#4CAF7D":s==="red"?"#EF4444":"#F59E0B" }}>{c}</td>
                      <td style={{ ...td, color:"#666" }}>{t}</td>
                      <td style={td}><Badge label={s==="green"?"On target":s==="red"?"Off target":"Near target"} colors={{ "On target":{bg:"#EAF3DE",color:"#27500A"},"Off target":{bg:"#FCEBEB",color:"#A32D2D"},"Near target":{bg:"#FAEEDA",color:"#633806"} }[s==="green"?"On target":s==="red"?"Off target":"Near target"]||{bg:"#eee",color:"#666"}} /></td>
                      <td style={{ ...td, fontSize:14, color:tr==="↑"?"#4CAF7D":tr==="↓"?"#EF4444":"#999" }}>{tr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}
