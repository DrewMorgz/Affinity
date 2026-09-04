import { useState, useMemo, useEffect } from "react";
import * as OUT from "./affinity_output";
import * as DW from "./affinity_docs_onb_write_api";
import EntitySearch from "./affinity_entity_search";
import { bkEntities, bkTxnsAll, bkPnlAll, bkBanksAll, isConfigured } from "./affinity_ops_api";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
const CY = "#00C4CC";
const Badge = ({ label, colors }) => (<span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>);
const fmt = (n,s="£") => s+Math.abs(Number(n||0)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const th = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", whiteSpace:"nowrap" };
const td = { padding:"8px 12px", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderBottom:"0.5px solid #e5e5e5" };

const ENTITIES = [
  { id:1,  name:"Meridian Holdings Ltd",          currency:"GBP", sym:"£", jur:"Isle of Man",    yearEnd:"31/03" },
  { id:3,  name:"Caledonian Ventures Ltd",         currency:"USD", sym:"$", jur:"Cayman Islands", yearEnd:"31/12" },
  { id:4,  name:"Azure Mediterranean Foundation",  currency:"EUR", sym:"€", jur:"Malta",          yearEnd:"31/12" },
  { id:6,  name:"Pacific Wealth Trust",            currency:"USD", sym:"$", jur:"Cayman Islands", yearEnd:"31/12" },
  { id:10, name:"Apex Growth Fund Ltd",            currency:"USD", sym:"$", jur:"Cayman Islands", yearEnd:"31/12" },
  { id:9,  name:"Rosewood Legacy Trust",           currency:"GBP", sym:"£", jur:"Isle of Man",    yearEnd:"05/04" },
];

const TXNS = {
  1:[
    { id:1, date:"01/04/2025", desc:"Opening balance",               type:"Balance",  dr:0,     cr:0,      ref:"OB-2025",  account:"Current account",  status:"Locked"   },
    { id:2, date:"01/04/2025", desc:"Q1 retainer fee — Affinity",    type:"Income",   dr:0,     cr:2000,   ref:"INV-041",  account:"Current account",  status:"Posted"   },
    { id:3, date:"15/04/2025", desc:"Registered office disbursement",type:"Expense",  dr:250,   cr:0,      ref:"DIS-001",  account:"Current account",  status:"Posted"   },
    { id:4, date:"30/04/2025", desc:"Bank charges — April",          type:"Expense",  dr:45,    cr:0,      ref:"BANK-APR", account:"Current account",  status:"Posted"   },
    { id:5, date:"01/07/2025", desc:"Q2 retainer fee — Affinity",    type:"Income",   dr:0,     cr:2000,   ref:"INV-041",  account:"Current account",  status:"Posted"   },
    { id:6, date:"14/07/2025", desc:"Directors fee — July 2025",     type:"Expense",  dr:1500,  cr:0,      ref:"DIR-JUL",  account:"Current account",  status:"Draft"    },
    { id:7, date:"14/07/2025", desc:"Q2 retainer received",          type:"Receipt",  dr:0,     cr:2000,   ref:"REC-001",  account:"Current account",  status:"Posted"   },
  ],
  3:[
    { id:1, date:"01/01/2025", desc:"Opening balance",               type:"Balance",  dr:0,     cr:0,      ref:"OB-2025",  account:"USD account",      status:"Locked"   },
    { id:2, date:"01/04/2025", desc:"Q1 retainer fee",               type:"Income",   dr:0,     cr:3600,   ref:"INV-019",  account:"USD account",      status:"Posted"   },
    { id:3, date:"10/04/2025", desc:"Legal fees — asset sale",       type:"Expense",  dr:4200,  cr:0,      ref:"LEG-001",  account:"USD account",      status:"Posted"   },
    { id:4, date:"14/04/2025", desc:"Asset sale proceeds",           type:"Income",   dr:0,     cr:250000, ref:"SALE-001", account:"USD account",      status:"Posted"   },
    { id:5, date:"01/07/2025", desc:"Q2 retainer fee",               type:"Income",   dr:0,     cr:5100,   ref:"INV-019",  account:"USD account",      status:"Posted"   },
  ],
};

const PNL = {
  1:{ income:16000, expenses:7650,  net:8350,   currency:"GBP", sym:"£" },
  3:{ income:262700,expenses:4200,  net:258500, currency:"USD", sym:"$" },
  4:{ income:3600,  expenses:320,   net:3280,   currency:"EUR", sym:"€" },
  6:{ income:7200,  expenses:1200,  net:6000,   currency:"USD", sym:"$" },
  10:{ income:11000,expenses:850,   net:10150,  currency:"USD", sym:"$" },
  9:{ income:4800,  expenses:5000,  net:-200,   currency:"GBP", sym:"£" },
};

const BANKS = {
  1:[{ name:"Current account", bank:"Barclays Bank",        currency:"GBP", balance:18240.50, asAt:"14/07/2025" },{ name:"Deposit account",bank:"Barclays Bank",currency:"GBP",balance:50000,asAt:"14/07/2025" }],
  3:[{ name:"USD account",     bank:"First Caribbean Bank", currency:"USD", balance:312480,   asAt:"14/07/2025" }],
  4:[{ name:"EUR account",     bank:"Bank of Valletta",     currency:"EUR", balance:9240.80,  asAt:"14/07/2025" }],
  6:[{ name:"USD account",     bank:"Scotiabank Cayman",    currency:"USD", balance:28640,    asAt:"14/07/2025" }],
  10:[{ name:"USD account",    bank:"Butterfield Bank",     currency:"USD", balance:88340,    asAt:"14/07/2025" }],
  9:[{ name:"GBP account",     bank:"Lloyds Bank",          currency:"GBP", balance:7640,     asAt:"14/07/2025" }],
};

const wipTrend = [
  { month:"Feb", wip:38200 },{ month:"Mar", wip:41500 },{ month:"Apr", wip:44800 },
  { month:"May", wip:42100 },{ month:"Jun", wip:46300 },{ month:"Jul", wip:48320 },
];

const VIEWS = ["sales","purchases","cashbook","journals","reports"];
const VLABELS = ["Sales","Purchases","Cashbook","Journals (adjustments)","Reports"];

export default function AffinityBookkeeping({ onNav }) {
  // ── Output plumbing ───────────────────────────────────────────────────────
  const [outMsg, setOutMsg] = useState("");
  const outRun = (fn) => {
    try {
      const res = fn();
      if (res && res.ok === false) { setOutMsg(res.error || "That could not be produced."); return false; }
      setOutMsg("");
      return true;
    } catch (e) { setOutMsg(String((e && e.message) || e)); return false; }
  };

  // Ledger export and a printable client statement.
  const exportLedger = () => {
    const rows = (typeof txns !== "undefined" && Array.isArray(txns)) ? txns : [];
    if (!rows.length) { setOutMsg("There are no transactions to export."); return; }
    outRun(() => OUT.downloadCSV("Ledger export", [
      { label:"Date", key:"txn_date" }, { label:"Description", key:"descr" },
      { label:"Type", key:"txn_type" }, { label:"Debit", key:"dr" },
      { label:"Credit", key:"cr" }, { label:"Reference", key:"ref" },
      { label:"Account", key:"account" }, { label:"Status", key:"status" },
    ], rows));
  };

  const printStatement = () => {
    const rows = (typeof txns !== "undefined" && Array.isArray(txns)) ? txns : [];
    const ent = (ents||[]).find(e=>e.id===eId) || {};
    outRun(() => OUT.statementDocument({
      entity: { name: ent.name || "Selected entity" },
      title: "Statement of account",
      headers: ["Date","Description","Debit","Credit"],
      numericCols: [2,3],
      rows: rows.map(t=>[t.txn_date, t.descr, t.dr || "", t.cr || ""]),
      periodLabel: "As at " + new Date().toLocaleDateString("en-GB"),
    }));
  };

  const [entitySearch, setEntitySearch] = useState("");
  const [bkE,setBkE]=useState(null),[bkT,setBkT]=useState(null),[bkP,setBkP]=useState(null),[bkB,setBkB]=useState(null);
  useEffect(()=>{ if(!isConfigured) return; let ok=true;
    bkEntities().then(({data})=>{if(ok&&data&&data.length)setBkE(data);}).catch(()=>{});
    bkTxnsAll().then(({data})=>{if(ok&&data)setBkT(data);}).catch(()=>{});
    bkPnlAll().then(({data})=>{if(ok&&data)setBkP(data);}).catch(()=>{});
    bkBanksAll().then(({data})=>{if(ok&&data)setBkB(data);}).catch(()=>{});
    return ()=>{ok=false;}; },[]);
  const ents = bkE || ENTITIES;
  const txnsMap = bkT ? bkT.reduce((m,t)=>{(m[t.entity_id]=m[t.entity_id]||[]).push(t);return m;},{}) : TXNS;
  const pnlMap = bkP ? bkP.reduce((m,p)=>{m[p.entity_id]=p;return m;},{}) : PNL;
  const banksMap = bkB ? bkB.reduce((m,b)=>{(m[b.entity_id]=m[b.entity_id]||[]).push(b);return m;},{}) : BANKS;
  const [view, setView]     = useState("sales");
  const [entityId, setEId]  = useState(1);
  const [search, setSearch] = useState("");
  const [modal, setModal]   = useState(null);
  const [bf, setBf]       = useState({});
  const [bBusy, setBBusy] = useState(false);
  const [bErr, setBErr]   = useState("");
  const setBv = (k,v) => setBf(p=>({ ...p, [k]:v }));

  const toISO = (v) => {
    if (!v || !String(v).trim()) return null;
    const t=String(v).trim();
    const uk=t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (uk) return `${uk[3]}-${uk[2].padStart(2,"0")}-${uk[1].padStart(2,"0")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    return null;
  };
  const bnum = (v) => (v==="" || v==null ? null : Number(String(v).replace(/[^0-9.\-]/g,"")) || null);
  const bkEntityId = () => {
    const byName = (ents||[]).find(e => e.name === bf["Entity"]);
    if (byName) return byName.id;
    const cur = (ents||[]).find(e => e.id === eId);
    return cur ? cur.id : null;
  };

  // Two lines: debit positive, credit negative. The imbalance is checked here
  // so it is shown before submitting rather than returned as a database error.
  const postJournal = async () => {
    setBBusy(true); setBErr("");
    const dr = bnum(bf["Debit amount"]), cr = bnum(bf["Credit amount"]);
    const drAcc = bf["Debit account"], crAcc = bf["Credit account"];
    if (!drAcc || !crAcc) { setBBusy(false); setBErr("Give both a debit and a credit account."); return; }
    if (!dr || !cr)       { setBBusy(false); setBErr("Enter both a debit and a credit amount."); return; }
    if (Math.round((dr - cr) * 100) !== 0) {
      setBBusy(false);
      setBErr("The journal does not balance — debits and credits differ by " +
              (Math.round(Math.abs(dr - cr) * 100) / 100).toFixed(2) + ".");
      return;
    }
    if (!bf["Description"] || !String(bf["Description"]).trim()) {
      setBBusy(false); setBErr("Give the journal a narrative — it is what the auditor reads."); return;
    }
    const entityId = bkEntityId();
    if (!entityId) { setBBusy(false); setBErr("Choose an entity that is loaded from the database."); return; }

    const res = await DW.journalPost(entityId, {
      date: toISO(bf["Date"]) || new Date().toISOString().slice(0,10),
      narrative: bf["Description"],
      lines: [
        { accountCode: drAcc, amount:  dr, ccy: bf["Currency"] || "GBP", memo: bf["Journal reference"] },
        { accountCode: crAcc, amount: -cr, ccy: bf["Currency"] || "GBP", memo: bf["Journal reference"] },
      ],
    });
    setBBusy(false);
    if (res.ok) { setModal(null); setBf({}); return; }
    if (!res.live) { setBErr("Not signed in — this journal cannot be posted yet."); return; }
    setBErr(res.error);
  };

  const saveBookkeeping = async () => {
    if (modal === "journal") return postJournal();
    if (modal === "moneyin" || modal === "moneyout") {
      setBBusy(true); setBErr("");
      const amt = bnum(bf["Amount"]);
      if (!amt) { setBBusy(false); setBErr("Enter an amount."); return; }
      const entityId = bkEntityId();
      if (!entityId) { setBBusy(false); setBErr("Choose an entity that is loaded from the database."); return; }
      const res = await DW.txnAdd(entityId, {
        date: toISO(bf["Date"]) || new Date().toISOString().slice(0,10),
        description: bf["Description"] || bf["Narrative"] || bf["Reference"],
        type: modal === "moneyin" ? "Receipt" : "Payment",
        debit:  modal === "moneyin"  ? amt : null,
        credit: modal === "moneyout" ? amt : null,
        ref: bf["Reference"] || null, account: bf["Account"] || null,
      });
      setBBusy(false);
      if (res.ok) { setModal(null); setBf({}); return; }
      if (!res.live) { setBErr("Not signed in — this cannot be saved yet."); return; }
      setBErr(res.error);
      return;
    }
    setBErr("This form cannot be saved yet — the write function for it is not built.");
  };


  const entity = ents.find(e=>e.id===entityId);
  const txns   = txnsMap[entityId]||[];
  const pnl    = pnlMap[entityId];
  const banks  = banksMap[entityId]||[];
  const sym    = entity?.sym||"£";

  const filtered = useMemo(()=>txns.filter(t=>
    !search||t.desc.toLowerCase().includes(search.toLowerCase())||t.ref.toLowerCase().includes(search.toLowerCase())
  ),[txns, search]);

  let running = 0;
  const withBal = filtered.map(t=>{ running+=(t.cr-t.dr); return {...t,balance:running}; });

  // day-book splits (QuickBooks-style): Sales = invoices+receipts, Purchases = bills/expenses
  const salesTxns    = filtered.filter(t=>t.type==="Income"||t.type==="Receipt");
  const purchaseTxns = filtered.filter(t=>t.type==="Expense");
  const salesInvoiced = salesTxns.filter(t=>t.type==="Income").reduce((s,t)=>s+t.cr,0);
  const salesReceived = salesTxns.filter(t=>t.type==="Receipt").reduce((s,t)=>s+t.cr,0);
  const purchTotal    = purchaseTxns.reduce((s,t)=>s+t.dr,0);
  const purchPaid     = purchaseTxns.filter(t=>t.status==="Posted").reduce((s,t)=>s+t.dr,0);
  const bankList = banksMap[entityId]||[];

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };
  const sc  = { background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 12px" };
  const sel = { height:30, padding:"0 8px", fontSize:11, borderRadius:5, border:"0.5px solid #ccc", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", cursor:"pointer" };

  const Toolbar = () => (
    <div style={{ display:"flex", gap:8, padding:"10px 20px", borderBottom:"0.5px solid #e5e5e5", flexWrap:"wrap", alignItems:"center" }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, background:"var(--bg-primary,#fff)", border:"0.5px solid #ccc", borderRadius:5, padding:"0 10px", flex:1 }}>
        <span style={{ color:"#aaa" }}>🔍</span>
        <input style={{ border:"none", background:"transparent", fontSize:12, outline:"none", width:"100%", height:30, color:"var(--text-primary,#111)" }} placeholder="Search transactions..." value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)", minHeight:600 }}>
      {outMsg && (
        <div style={{ margin:"0 20px 10px", padding:"9px 12px", borderRadius:7, fontSize:11.5,
                      lineHeight:1.6, background:"#FCEBEB", border:"0.5px solid #f0c9c9", color:"#A32D2D" }}>
          {outMsg}
        </div>
      )}

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
        <div style={{ fontSize:18, fontWeight:500, color:"#001242" }}>Bookkeeping</div>
        <div style={{ display:"flex", gap:5 }}>
          {["Entities","Timesheets","Invoicing","Reporting"].map(n=><button key={n} style={nb} onClick={()=>onNav&&onNav({Entities:"entities",Compliance:"compliance",Timesheets:"timesheets",Invoicing:"invoicing",Reporting:"reporting",Documents:"documents",Bookkeeping:"bookkeeping"}[n])}>{n}</button>)}
          <button style={nba} onClick={()=>onNav&&onNav("acc_book")}>Bookkeeping</button>
        </div>
      </div>
      {/* Entity search — same component on every page showing client data */}
      <div style={{ padding:"10px 20px", borderBottom:"0.5px solid var(--border-tertiary,#e5e5e5)", background:"var(--bg-primary,#fff)" }}>
        <EntitySearch value={entitySearch} compact
          onChange={(v)=>{ setEntitySearch(v); const m=ents.find(x=>x.name===v); if(m) setEId(m.id); }} />
      </div>

      <div style={{ display:"flex", gap:4, padding:"8px 20px", borderBottom:"0.5px solid #e5e5e5", background:"var(--bg-secondary,#f9f9f9)", flexWrap:"wrap" }}>
        {VIEWS.map((v,i)=><button key={v} style={{ padding:"4px 12px", fontSize:11, borderRadius:20, border:`0.5px solid ${view===v?"#ccc":"#e5e5e5"}`, background:view===v?"var(--bg-primary,#fff)":"transparent", color:view===v?"var(--text-primary,#111)":"#666", cursor:"pointer", fontWeight:view===v?500:400 }} onClick={()=>setView(v)}>{VLABELS[i]}</button>)}
      </div>

      {view==="sales"&&(<>
        <Toolbar />
        <div style={{ display:"flex", gap:8, padding:"10px 20px", borderBottom:"0.5px solid #e5e5e5", alignItems:"center" }}>
          <button style={nba} onClick={()=>setModal("invoice")}>＋ New sales invoice</button>
          <button style={nb} onClick={()=>setModal("receipt")}>＋ Receive payment</button>
          <div style={{ marginLeft:"auto", fontSize:10, color:"#999" }}>Sales day book — customer invoices &amp; receipts</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
          {[{l:"Invoiced YTD",v:fmt(salesInvoiced,sym),c:CY},{l:"Received YTD",v:fmt(salesReceived,sym),c:"#4CAF7D"},{l:"Outstanding",v:fmt(salesInvoiced-salesReceived,sym),c:salesInvoiced-salesReceived>0?"#F59E0B":"#4CAF7D"}].map(k=><div key={k.l} style={sc}><div style={{fontSize:10,color:"#666",marginBottom:3}}>{k.l}</div><div style={{fontSize:18,fontWeight:500,color:k.c}}>{k.v}</div></div>)}
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{...th,width:"12%"}}>Date</th><th style={{...th,width:"12%"}}>Ref</th>
              <th style={{...th,width:"38%"}}>Customer / description</th><th style={{...th,width:"12%"}}>Type</th>
              <th style={{...th,width:"14%",textAlign:"right"}}>Amount</th><th style={{...th,width:"12%"}}>Status</th>
            </tr></thead>
            <tbody>
              {salesTxns.length?salesTxns.map(t=>(
                <tr key={t.id} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{...td,color:"#666"}}>{t.date}</td>
                  <td style={{...td,fontSize:10,color:"#666"}}>{t.ref}</td>
                  <td style={{...td,fontWeight:500}}>{t.desc}</td>
                  <td style={td}><Badge label={t.type==="Income"?"Invoice":"Receipt"} colors={t.type==="Income"?{bg:"#EAF3DE",color:"#27500A"}:{bg:"#EEF0FB",color:"#3C3489"}} /></td>
                  <td style={{...td,textAlign:"right",fontWeight:600,color:"#27500A"}}>{fmt(t.cr,sym)}</td>
                  <td style={td}><Badge label={t.status} colors={{Posted:{bg:"#EAF3DE",color:"#27500A"},Draft:{bg:"#FAEEDA",color:"#633806"},Locked:{bg:"#F1EFE8",color:"#888"}}[t.status]||{bg:"#eee",color:"#666"}} /></td>
                </tr>
              )):<tr><td colSpan={6} style={{...td,textAlign:"center",color:"#aaa",padding:30}}>No sales transactions for this entity</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding:"8px 20px", fontSize:10, color:"#999" }}>Posting a sales invoice or receipt generates the double-entry automatically (Dr Debtors / Cr Income; Dr Bank / Cr Debtors). Live entry activates with the write layer.</div>
      </>)}

      {view==="purchases"&&(<>
        <Toolbar />
        <div style={{ display:"flex", gap:8, padding:"10px 20px", borderBottom:"0.5px solid #e5e5e5", alignItems:"center" }}>
          <button style={nba} onClick={()=>setModal("bill")}>＋ New bill</button>
          <button style={nb} onClick={()=>setModal("payment")}>＋ Pay bill</button>
          <div style={{ marginLeft:"auto", fontSize:10, color:"#999" }}>Purchase day book — supplier bills &amp; payments</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
          {[{l:"Purchases YTD",v:fmt(purchTotal,sym),c:CY},{l:"Paid",v:fmt(purchPaid,sym),c:"#4CAF7D"},{l:"Outstanding",v:fmt(purchTotal-purchPaid,sym),c:purchTotal-purchPaid>0?"#F59E0B":"#4CAF7D"}].map(k=><div key={k.l} style={sc}><div style={{fontSize:10,color:"#666",marginBottom:3}}>{k.l}</div><div style={{fontSize:18,fontWeight:500,color:k.c}}>{k.v}</div></div>)}
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{...th,width:"12%"}}>Date</th><th style={{...th,width:"12%"}}>Ref</th>
              <th style={{...th,width:"42%"}}>Supplier / description</th>
              <th style={{...th,width:"14%",textAlign:"right"}}>Amount</th><th style={{...th,width:"12%"}}>Status</th>
            </tr></thead>
            <tbody>
              {purchaseTxns.length?purchaseTxns.map(t=>(
                <tr key={t.id} style={{ borderBottom:"0.5px solid #e5e5e5" }}>
                  <td style={{...td,color:"#666"}}>{t.date}</td>
                  <td style={{...td,fontSize:10,color:"#666"}}>{t.ref}</td>
                  <td style={{...td,fontWeight:500}}>{t.desc}</td>
                  <td style={{...td,textAlign:"right",fontWeight:600,color:"#A32D2D"}}>{fmt(t.dr,sym)}</td>
                  <td style={td}><Badge label={t.status} colors={{Posted:{bg:"#EAF3DE",color:"#27500A"},Draft:{bg:"#FAEEDA",color:"#633806"},Locked:{bg:"#F1EFE8",color:"#888"}}[t.status]||{bg:"#eee",color:"#666"}} /></td>
                </tr>
              )):<tr><td colSpan={5} style={{...td,textAlign:"center",color:"#aaa",padding:30}}>No purchase transactions for this entity</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding:"8px 20px", fontSize:10, color:"#999" }}>Posting a bill or payment generates the double-entry automatically (Dr Expense / Cr Creditors; Dr Creditors / Cr Bank). Live entry activates with the write layer.</div>
      </>)}

      {view==="cashbook"&&(<>
        <Toolbar />
        {bankList.length>0&&<div style={{ display:"flex", gap:10, padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5", flexWrap:"wrap" }}>
          {bankList.map((b,i)=><div key={i} style={{ ...sc, minWidth:170 }}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{(b.name||b.bank)} · {b.currency}</div><div style={{ fontSize:16, fontWeight:600 }}>{fmt(b.balance,sym)}</div><div style={{ fontSize:9, color:"#999", marginTop:2 }}>{b.bank}</div></div>)}
          <div style={{ marginLeft:"auto", alignSelf:"center", display:"flex", gap:8 }}>
            <button style={nba} onClick={()=>setModal("moneyin")}>＋ Money in</button>
            <button style={nb} onClick={()=>setModal("moneyout")}>＋ Money out</button>
          </div>
        </div>}
        {pnl&&<div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, padding:"12px 20px", borderBottom:"0.5px solid #e5e5e5" }}>
          {[
            { l:"Total income YTD",   v:fmt(pnl.income,sym),                                                   c:CY },
            { l:"Total expenses YTD", v:fmt(pnl.expenses,sym),                                                 c:null },
            { l:"Net position",       v:(pnl.net>=0?"+":"")+fmt(pnl.net,sym),                                  c:pnl.net>=0?"#4CAF7D":"#EF4444" },
            { l:"Currency",           v:entity?.currency,                                                       c:null },
            { l:"Year end",           v:entity?.yearEnd,                                                        c:null },
          ].map(k=><div key={k.l} style={sc}><div style={{ fontSize:10, color:"#666", marginBottom:3 }}>{k.l}</div><div style={{ fontSize:18, fontWeight:500, color:k.c||"var(--text-primary,#111)" }}>{k.v}</div></div>)}
        </div>}
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"10%" }}>Date</th>
              <th style={{ ...th, width:"28%" }}>Description</th>
              <th style={{ ...th, width:"13%" }}>Account</th>
              <th style={{ ...th, width:"9%" }}>Ref</th>
              <th style={{ ...th, width:"8%" }}>Type</th>
              <th style={{ ...th, width:"9%", textAlign:"right" }}>Debit</th>
              <th style={{ ...th, width:"9%", textAlign:"right" }}>Credit</th>
              <th style={{ ...th, width:"10%", textAlign:"right" }}>Balance</th>
              <th style={{ ...th, width:"8%" }}>Status</th>
            </tr></thead>
            <tbody>
              {withBal.map(t=>(
                <tr key={t.id} style={{ borderBottom:"0.5px solid #e5e5e5", background:t.type==="Balance"?"var(--bg-secondary,#f9f9f9)":undefined }}>
                  <td style={{ ...td, color:"#666" }}>{t.date}</td>
                  <td style={{ ...td, fontWeight:t.type==="Balance"?600:400 }}>{t.desc}</td>
                  <td style={{ ...td, fontSize:10, color:"#999" }}>{t.account}</td>
                  <td style={{ ...td, fontSize:10, color:"#666" }}>{t.ref}</td>
                  <td style={td}><Badge label={t.type} colors={{ Income:{bg:"#EAF3DE",color:"#27500A"}, Expense:{bg:"#FCEBEB",color:"#A32D2D"}, Balance:{bg:"#E6F7FB",color:"#0077A8"}, Receipt:{bg:"#EEF0FB",color:"#3C3489"} }[t.type]||{bg:"#eee",color:"#666"}} /></td>
                  <td style={{ ...td, textAlign:"right", color:t.dr?"var(--text-primary,#111)":"#ddd" }}>{t.dr?fmt(t.dr,sym):"—"}</td>
                  <td style={{ ...td, textAlign:"right", color:t.cr?"#27500A":"#ddd" }}>{t.cr?fmt(t.cr,sym):"—"}</td>
                  <td style={{ ...td, textAlign:"right", fontWeight:600, color:t.balance>=0?"var(--text-primary,#111)":"#EF4444" }}>{fmt(Math.abs(t.balance),sym)}</td>
                  <td style={td}><Badge label={t.status} colors={{ Posted:{bg:"#EAF3DE",color:"#27500A"}, Draft:{bg:"#FAEEDA",color:"#633806"}, Locked:{bg:"#F1EFE8",color:"#888"} }[t.status]||{bg:"#eee",color:"#666"}} /></td>
                </tr>
              ))}
              {withBal.length===0&&<tr><td colSpan={9} style={{ ...td, textAlign:"center", color:"#aaa", padding:30 }}>No transactions found</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding:"8px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
          <button style={nb} onClick={()=>setModal("journal")}>＋ Post journal</button>
          <button style={nba} onClick={exportLedger}>Export ledger ↗</button>
        </div>
      </>)}

      {view==="pnl"&&(<>
        <Toolbar />
        <div style={{ padding:"16px 20px" }}>
          {pnl&&entity&&(
            <div style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:10, padding:18, marginBottom:16, borderLeft:`3px solid ${CY}` }}>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>{entity.name} — P&L YTD 2025</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                <div>
                  <div style={{ fontSize:10, color:"#aaa", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.4px" }}>Income</div>
                  {(txnsMap[entityId]||[]).filter(t=>t.type==="Income").map(t=>(
                    <div key={t.id} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12 }}>
                      <span style={{ color:"#666" }}>{t.desc}</span>
                      <span style={{ fontWeight:500, color:"#27500A" }}>{fmt(t.cr,sym)}</span>
                    </div>
                  ))}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", fontSize:13, fontWeight:600, borderTop:"1px solid #ccc", marginTop:4 }}>
                    <span>Total income</span><span style={{ color:"#27500A" }}>{fmt(pnl.income,sym)}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#aaa", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.4px" }}>Expenses</div>
                  {(txnsMap[entityId]||[]).filter(t=>t.type==="Expense").map(t=>(
                    <div key={t.id} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12 }}>
                      <span style={{ color:"#666" }}>{t.desc}</span>
                      <span style={{ fontWeight:500, color:"#A32D2D" }}>{fmt(t.dr,sym)}</span>
                    </div>
                  ))}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", fontSize:13, fontWeight:600, borderTop:"1px solid #ccc", marginTop:4 }}>
                    <span>Total expenses</span><span style={{ color:"#A32D2D" }}>{fmt(pnl.expenses,sym)}</span>
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 16px", marginTop:14, background:pnl.net>=0?"#EAF3DE":"#FCEBEB", borderRadius:8, fontSize:14, fontWeight:600 }}>
                <span>Net position</span>
                <span style={{ color:pnl.net>=0?"#27500A":"#A32D2D" }}>{pnl.net>=0?"+":""}{fmt(pnl.net,sym)}</span>
              </div>
            </div>
          )}
          <div style={{ fontSize:13, fontWeight:500, marginBottom:10 }}>All entities — P&L summary</div>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"28%" }}>Entity</th>
              <th style={{ ...th, width:"10%" }}>Currency</th>
              <th style={{ ...th, width:"16%", textAlign:"right" }}>Income</th>
              <th style={{ ...th, width:"16%", textAlign:"right" }}>Expenses</th>
              <th style={{ ...th, width:"18%", textAlign:"right" }}>Net position</th>
            </tr></thead>
            <tbody>
              {ents.map(e=>{ const p=pnlMap[e.id]; if(!p) return null; return (
                <tr key={e.id} onClick={()=>setEId(e.id)} style={{ borderBottom:"0.5px solid #e5e5e5", cursor:"pointer", background:entityId===e.id?"var(--bg-secondary,#f9f9f9)":undefined }}>
                  <td style={{ ...td, fontWeight:500 }}>{e.name}</td>
                  <td style={{ ...td, color:"#666" }}>{p.currency}</td>
                  <td style={{ ...td, textAlign:"right", color:"#27500A", fontWeight:500 }}>{fmt(p.income,p.sym)}</td>
                  <td style={{ ...td, textAlign:"right", color:"#A32D2D", fontWeight:500 }}>{fmt(p.expenses,p.sym)}</td>
                  <td style={{ ...td, textAlign:"right", fontWeight:600, color:p.net>=0?"#27500A":"#EF4444" }}>{p.net>=0?"+":""}{fmt(p.net,p.sym)}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </>)}

      {view==="banks"&&(<>
        <Toolbar />
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:12, fontWeight:500, marginBottom:12 }}>Bank accounts — {entity?.name}</div>
          {banks.length>0?(
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
              {banks.map((b,i)=>(
                <div key={i} style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:10, padding:16, borderLeft:`3px solid ${CY}` }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>{b.name}</div>
                  <div style={{ fontSize:11, color:"#999", marginBottom:10 }}>{b.bank} · {b.currency}</div>
                  {[["Balance",fmt(b.balance,b.currency==="USD"?"$":b.currency==="EUR"?"€":"£")],["Currency",b.currency],["As at",b.asAt]].map(([k,v])=>(
                    <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"0.5px solid #e5e5e5", fontSize:12 }}>
                      <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:600, color:k==="Balance"?CY:undefined }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:6, marginTop:10 }}>
                    <button style={{ ...nb, fontSize:10 }} disabled title="Needs a bank feed, which is not connected yet">Reconcile ↗</button>
                    <button style={{ ...nb, fontSize:10 }} onClick={printStatement}>Statement ↗</button>
                  </div>
                </div>
              ))}
            </div>
          ):(
            <div style={{ color:"#aaa", fontSize:12, padding:"20px 0", textAlign:"center" }}>No bank accounts configured for this entity. <button style={{ ...nba, fontSize:11 }} onClick={()=>setModal("bank")}>Add account</button></div>
          )}
          <div style={{ fontSize:12, fontWeight:500, marginBottom:10 }}>All entities — bank account summary</div>
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead><tr>
              <th style={{ ...th, width:"28%" }}>Entity</th>
              <th style={{ ...th, width:"18%" }}>Bank</th>
              <th style={{ ...th, width:"14%" }}>Account</th>
              <th style={{ ...th, width:"10%" }}>Currency</th>
              <th style={{ ...th, width:"18%", textAlign:"right" }}>Balance</th>
              <th style={{ ...th, width:"12%" }}>As at</th>
            </tr></thead>
            <tbody>
              {ents.flatMap(e=>(banksMap[e.id]||[]).map((b,j)=>({ ...b, eName:e.name, eId:e.id, key:`${e.id}-${j}` }))).map(b=>(
                <tr key={b.key} onClick={()=>setEId(b.eId)} style={{ borderBottom:"0.5px solid #e5e5e5", cursor:"pointer", background:entityId===b.eId?"var(--bg-secondary,#f9f9f9)":undefined }}>
                  <td style={{ ...td, fontWeight:500 }}>{b.eName}</td>
                  <td style={{ ...td, color:"#666", fontSize:10 }}>{b.bank}</td>
                  <td style={{ ...td, color:"#666" }}>{b.name}</td>
                  <td style={{ ...td, color:"#666" }}>{b.currency}</td>
                  <td style={{ ...td, textAlign:"right", fontWeight:600, color:CY }}>{fmt(b.balance, b.currency==="USD"?"$":b.currency==="EUR"?"€":"£")}</td>
                  <td style={{ ...td, color:"#666" }}>{b.asAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}

      {view==="journals"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:500 }}>Manual journals — adjustments only</div>
            <button style={nba} onClick={()=>setModal("journal")}>＋ Post journal</button>
          </div>
          <div style={{ background:"var(--bg-secondary,#f9f9f9)", borderRadius:6, padding:"10px 12px", fontSize:11, color:"#666", marginBottom:14 }}>
            ℹ️ Manual journals are for <strong>adjustments only</strong> — accruals, prepayments, depreciation, reclassifications and corrections. Routine transactions are entered in <strong>Sales</strong>, <strong>Purchases</strong> and <strong>Cashbook</strong>, which post their double-entry automatically. Debits must equal credits; manual journals require preparer and approver sign-off.
          </div>
          {[
            { ref:"JNL-2025-007", date:"01/07/2025", entity:"Meridian Holdings Ltd",    desc:"Q3 retainer accrual",           dr:"Debtors £2,000",      cr:"Income £2,000",     by:"Neil Kelly",   status:"Posted", auto:false },
            { ref:"JNL-2025-006", date:"30/06/2025", entity:"Rosewood Legacy Trust",    desc:"Trust distribution — Q2 2025", dr:"Trust capital £5,000",cr:"Bank £5,000",       by:"Roxy Sheeley", status:"Posted", auto:false },
            { ref:"JNL-2025-005", date:"14/04/2025", entity:"Caledonian Ventures Ltd",  desc:"Asset sale proceeds",           dr:"Bank $250,000",       cr:"Asset disposal $250,000",by:"Garry Crossan",status:"Posted",auto:false },
            { ref:"AUTO-2025-041",date:"01/07/2025", entity:"Meridian Holdings Ltd",    desc:"Auto-journal — invoice raised", dr:"Debtors £2,000",      cr:"Income £2,000",     by:"System",       status:"Posted", auto:true  },
            { ref:"JNL-2025-008", date:"14/07/2025", entity:"Stonebridge Capital Ltd",  desc:"Director fee accrual",          dr:"Expenses €1,200",     cr:"Creditors €1,200",  by:"Joanne Fenech",status:"Draft",  auto:false },
          ].map((j,i)=>(
            <div key={i} style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{j.ref} — {j.entity}</div>
                  <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{j.date} · {j.desc} · Posted by: {j.by}</div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  {j.auto&&<Badge label="Auto" colors={{ bg:"#EAF3DE", color:"#27500A" }} />}
                  <Badge label={j.status} colors={{ Posted:{bg:"#EAF3DE",color:"#27500A"}, Draft:{bg:"#FAEEDA",color:"#633806"} }[j.status]||{bg:"#eee",color:"#666"}} />
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div style={{ background:"#FCEBEB22", borderRadius:6, padding:"6px 10px", fontSize:11 }}><span style={{ color:"#A32D2D", fontWeight:600 }}>DR </span>{j.dr}</div>
                <div style={{ background:"#EAF3DE44", borderRadius:6, padding:"6px 10px", fontSize:11 }}><span style={{ color:"#27500A", fontWeight:600 }}>CR </span>{j.cr}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view==="reports"&&(
        <div style={{ padding:"16px 20px" }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>Financial reports</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {["Trial balance","Profit & loss statement","Balance sheet","Bank reconciliation","Cash flow statement","Aged creditors","Aged debtors","Consolidated group P&L"].map(r=>(
              <div key={r} style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:8, padding:"12px 14px" }}>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>{r}</div>
                <div style={{ display:"flex", gap:6 }}>
                  <select style={{ ...sel, flex:1, height:28, fontSize:11 }}><option>YTD 2025</option><option>Q2 2025</option><option>FY 2024</option></select>
                  <><input list="bk-rep-entity" defaultValue="All entities" placeholder="Search entity…" style={{ ...sel, flex:1, height:28, fontSize:11, boxSizing:"border-box" }} /><datalist id="bk-rep-entity"><option value="All entities"/>{ents.map(e=><option key={e.id} value={e.name}/>)}</datalist></>
                  <button style={nba} onClick={printStatement}>Generate ↗</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:12, fontWeight:500, marginBottom:10 }}>WIP trend — all entities</div>
            <div style={{ background:"var(--bg-primary,#fff)", border:"0.5px solid #e5e5e5", borderRadius:8, padding:14 }}>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={wipTrend} margin={{ top:0, right:10, left:-10, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="month" tick={{ fontSize:10 }} />
                  <YAxis tick={{ fontSize:10 }} tickFormatter={v=>"£"+(v/1000).toFixed(0)+"k"} />
                  <Tooltip formatter={v=>["£"+Number(v).toLocaleString(),"WIP"]} />
                  <Line type="monotone" dataKey="wip" stroke={CY} strokeWidth={2.5} dot={{ fill:CY, r:4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {modal&&(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(13,27,42,0.45)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:40, zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"var(--bg-primary,#fff)", borderRadius:10, border:"0.5px solid #e5e5e5", padding:22, width:480, maxWidth:"96vw" }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:16 }}>{modal==="journal"?"Post journal entry":"Add bank account"}</div>
            {modal==="journal"&&(
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[["Entity","select",ents.map(e=>e.name)],["Journal reference","text","JNL-2025-"],["Date","text","DD/MM/YYYY"],["Description","text","Narrative"],["Debit account","text","e.g. Debtors"],["Debit amount","number","0.00"],["Credit account","text","e.g. Income"],["Credit amount","number","0.00"],["Currency","select",["GBP","USD","EUR"]]].map(([l,t,opts])=>(
                  <div key={l} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    <label style={{ fontSize:11, color:"#666" }}>{l}</label>
                    {(l==="Entity"||l==="Client"||l==="Entity name"||l==="Client name"||l==="Linked entity")?<><input list="bk-ent-1" value={bf[l]||""} onChange={e=>setBv(l, e.target.value)} placeholder="Search entity…" style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)" , boxSizing:"border-box" }} /><datalist id="bk-ent-1">{(Array.isArray(opts)?opts:[]).map(o=><option key={o} value={o}/>)}</datalist></>:t==="select"?<select value={bf[l]||""} onChange={e=>setBv(l, e.target.value)} style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)" }}>{(Array.isArray(opts)?opts:[]).map(o=><option key={o}>{o}</option>)}</select>
                    :<input type={t} value={bf[l]||""} onChange={e=>setBv(l, e.target.value)} style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)" }} placeholder={typeof opts==="string"?opts:""} />}
                  </div>
                ))}
              </div>
            )}
            {modal==="bank"&&(
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[["Bank name","text"],["Account name","text"],["Currency","select",["GBP","USD","EUR"]],["Opening balance","number"],["Balance date","text"]].map(([l,t,opts])=>(
                  <div key={l} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    <label style={{ fontSize:11, color:"#666" }}>{l}</label>
                    {(l==="Entity"||l==="Client"||l==="Entity name"||l==="Client name"||l==="Linked entity")?<><input list="bk-ent-2" value={bf[l]||""} onChange={e=>setBv(l, e.target.value)} placeholder="Search entity…" style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)" , boxSizing:"border-box" }} /><datalist id="bk-ent-2">{(Array.isArray(opts)?opts:[]).map(o=><option key={o} value={o}/>)}</datalist></>:t==="select"?<select value={bf[l]||""} onChange={e=>setBv(l, e.target.value)} style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)" }}>{(Array.isArray(opts)?opts:[]).map(o=><option key={o}>{o}</option>)}</select>
                    :<input type={t} value={bf[l]||""} onChange={e=>setBv(l, e.target.value)} style={{ fontSize:12, borderRadius:5, border:"0.5px solid #ccc", padding:"0 8px", height:32, outline:"none", background:"var(--bg-primary,#fff)", color:"var(--text-primary,#111)" }} />}
                  </div>
                ))}
              </div>
            )}
            {bErr && (
              <div style={{ marginTop:12, fontSize:11.5, color:"#A32D2D", background:"#FCEBEB",
                            border:"0.5px solid #f0c9c9", borderRadius:6, padding:"8px 10px", lineHeight:1.6 }}>
                {bErr}
              </div>
            )}
            {modal==="journal" && (
              <div style={{ marginTop:10, fontSize:10.5, color:"#7B4F1D", background:"#FDF4DC",
                            border:"0.5px solid #E5CE9A", borderRadius:6, padding:"8px 10px", lineHeight:1.6 }}>
                Use account codes rather than names. A journal must balance and needs a narrative.
                It posts as a draft — someone other than you approves it, and approving is what
                posts it to the ledger.
              </div>
            )}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:14 }}>
              <button style={nb} onClick={()=>{setModal(null); setBErr("");}} disabled={bBusy}>Cancel</button>
              <button style={nba} onClick={saveBookkeeping} disabled={bBusy}>
                {bBusy ? "Saving…" : modal==="journal" ? "Post journal" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
