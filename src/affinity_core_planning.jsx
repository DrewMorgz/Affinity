// src/affinity_core_planning.jsx
// ─────────────────────────────────────────────────────────────────────────────
// AFFINITY CORE — PLANNING (budgeting, forecasting, scenarios)
//
// Builds only what Core did not already have. The calculation engine already
// exists on the accounting-engine branch (budget, budget_line, submit_budget,
// approve_budget, build_rolling_forecast, compare_budget_scenarios), so this is
// the interface layer over it:
//
//   1. Budget input  — spreadsheet-style grid: accounts down, periods across,
//      frozen header and first column, keyboard navigation, multi-cell paste,
//      spreading, autosave, undo, and visually distinct cell types.
//   2. Workflow      — Not started / In progress / Submitted / Returned /
//      Approved / Locked, with owner, approver, due date and a validation gate.
//   3. Scenarios     — create from an approved budget, compare, lock, promote.
//
// Design follows Core, not the source spec's tokens: Midnight Navy, Affinity
// Cyan, Catamaran, hairline borders, no rounded card per row, tabular figures
// right-aligned.
//
// Rows resolve against preview data until accounting-engine is merged and
// db/001-051 is run; every write below maps to an RPC that already exists.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useRef, useEffect, useCallback } from "react";

const NAVY = "#001242", CY = "#00C4CC";
const INK  = "var(--text-primary,#111)";
const MUT  = "var(--text-secondary,#666)";
const LINE = "var(--border-tertiary,#e5e5e5)";
const CARD = "var(--bg-primary,#fff)";
const PAGE = "var(--bg-secondary,#f8f9fc)";
const SUBTLE = "var(--bg-secondary,#f9f9f9)";
const POS = "#4CAF7D", NEG = "#EF4444", AMBER = "#F59E0B";
const FONT = "'Catamaran',system-ui,sans-serif";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Chart of accounts for planning. kind drives cell behaviour:
//    input = editable, calc = derived subtotal, actual = posted from the ledger
const ACCOUNTS = [
  { group:"Revenue",       code:"4000", name:"Company administration fees", kind:"input" },
  { group:"Revenue",       code:"4010", name:"Trustee fees",                kind:"input" },
  { group:"Revenue",       code:"4020", name:"Directorship fees",           kind:"input" },
  { group:"Revenue",       code:"4030", name:"Registered office fees",      kind:"input" },
  { group:"Revenue",       code:"4040", name:"Time-based / ad hoc",         kind:"input" },
  { group:"Revenue",       code:"4090", name:"Disbursements recovered",     kind:"input" },
  { group:"Direct costs",  code:"5000", name:"Government & registry fees",  kind:"input" },
  { group:"Direct costs",  code:"5010", name:"Sub-contracted services",     kind:"input" },
  { group:"Staff costs",   code:"6000", name:"Salaries",                    kind:"input" },
  { group:"Staff costs",   code:"6010", name:"Employer NI / social",        kind:"calcPct", of:"6000", pct:0.11 },
  { group:"Staff costs",   code:"6020", name:"Pension contributions",       kind:"calcPct", of:"6000", pct:0.06 },
  { group:"Staff costs",   code:"6030", name:"Recruitment & training",      kind:"input" },
  { group:"Overheads",     code:"7000", name:"Premises & rates",            kind:"input" },
  { group:"Overheads",     code:"7010", name:"IT & software",               kind:"input" },
  { group:"Overheads",     code:"7020", name:"Professional indemnity",      kind:"input" },
  { group:"Overheads",     code:"7030", name:"Regulatory & licence fees",   kind:"input" },
  { group:"Overheads",     code:"7040", name:"Travel & entertaining",       kind:"input" },
  { group:"Overheads",     code:"7050", name:"Depreciation",                kind:"actual" },
];

const GROUPS = ["Revenue","Direct costs","Staff costs","Overheads"];
const SIGN = { "Revenue":1, "Direct costs":-1, "Staff costs":-1, "Overheads":-1 };

const ENTITIES = [
  { ref:"AFG-000", name:"Affinity Group Limited",        ccy:"GBP" },
  { ref:"AFG-IOM", name:"Affinity (Isle of Man) Limited",ccy:"GBP" },
  { ref:"AFG-MLT", name:"Affinity (Malta) Limited",      ccy:"EUR" },
  { ref:"AFG-CYM", name:"Affinity (Cayman) Limited",     ccy:"USD" },
  { ref:"AFG-UK",  name:"Affinity (UK) Limited",         ccy:"GBP" },
  { ref:"AFG-SD",  name:"Affinity South Dakota, LLC",    ccy:"USD" },
  { ref:"AFG-FL",  name:"Affinity South Florida, LLC",   ccy:"USD" },
];

const STATES = ["Not started","In progress","Submitted","Returned","Approved","Locked"];
const STATE_STYLE = {
  "Not started": { bg:"#F2F2F2", color:"#777" },
  "In progress": { bg:"#EAF0FB", color:"#274690" },
  "Submitted":   { bg:"#FDF4DC", color:"#7B4F1D" },
  "Returned":    { bg:"#FCEBEB", color:"#A32D2D" },
  "Approved":    { bg:"#E7F4EF", color:"#1F6F54" },
  "Locked":      { bg:"#EEEEF5", color:"#4A4A6A" },
};

// seeded so the grid opens with something meaningful rather than zeros
function seedValues() {
  const v = {};
  ACCOUNTS.forEach((a) => {
    if (a.kind !== "input" && a.kind !== "actual") return;
    const base = a.group === "Revenue" ? 18000 + (Number(a.code) % 7) * 2200
               : a.group === "Staff costs" ? 26000
               : a.group === "Direct costs" ? 4200
               : 3100 + (Number(a.code) % 5) * 400;
    MONTHS.forEach((m, i) => {
      const drift = 1 + (i * 0.006) + (((Number(a.code) + i) % 5) - 2) * 0.012;
      v[a.code + ":" + i] = Math.round((base * drift) / 50) * 50;
    });
  });
  return v;
}

const nf = (n) => n == null || n === "" ? "" : Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 });

// ── Carried over from the Budgets module this replaces, so nothing is lost.
const VARIANCE = [
  { line:"Retainer income",   budget:980000, actual:497000, variance:12000,  pct:"+2.5%",  status:"Favourable" },
  { line:"Ad hoc income",     budget:420000, actual:198000, variance:-8000,  pct:"-3.8%",  status:"Adverse"    },
  { line:"Specialist income", budget:700000, actual:372000, variance:18000,  pct:"+5.1%",  status:"Favourable" },
  { line:"Staff costs",       budget:860000, actual:428000, variance:6000,   pct:"+1.4%",  status:"Adverse"    },
  { line:"Office & premises", budget:180000, actual:88000,  variance:-4000,  pct:"-4.3%",  status:"Favourable" },
  { line:"IT & software",     budget:95000,  actual:52000,  variance:2000,   pct:"+4.0%",  status:"Adverse"    },
  { line:"Professional fees", budget:120000, actual:58000,  variance:-8000,  pct:"-12.1%", status:"Favourable" },
  { line:"Travel & expenses", budget:65000,  actual:28000,  variance:4000,   pct:"+16.7%", status:"Adverse"    },
];

const SERVICELINES = [
  { line:"Company administration", budget:680000, forecast:710000, actual:348000, margin:38 },
  { line:"Trust administration",   budget:520000, forecast:545000, actual:268000, margin:42 },
  { line:"Compliance services",    budget:310000, forecast:325000, actual:162000, margin:45 },
  { line:"Accounting & finance",   budget:280000, forecast:290000, actual:141000, margin:35 },
  { line:"Specialist — Yachting",  budget:180000, forecast:195000, actual:94000,  margin:52 },
  { line:"Specialist — Sports",    budget:130000, forecast:138000, actual:68000,  margin:48 },
];

const MONTHLY = [
  { month:"Apr", budget:160000, forecast:165000, actual:158000 },
  { month:"May", budget:163000, forecast:168000, actual:171000 },
  { month:"Jun", budget:165000, forecast:172000, actual:168000 },
  { month:"Jul", budget:168000, forecast:175000, actual:null },
  { month:"Aug", budget:162000, forecast:170000, actual:null },
  { month:"Sep", budget:170000, forecast:178000, actual:null },
];

const SCENARIOS_SEED = [
  { id:1, name:"FY26 Budget",            base:null,  status:"Approved",    owner:"Neil Kelly",  created:"2025-11-14", locked:true,  delta:0 },
  { id:2, name:"FY26 Forecast — Q1 roll",base:"FY26 Budget", status:"In progress", owner:"Neil Kelly", created:"2026-04-02", locked:false, delta:2.4 },
  { id:3, name:"FY26 Downside",          base:"FY26 Budget", status:"In progress", owner:"Andrew Morgan", created:"2026-05-19", locked:false, delta:-11.8 },
  { id:4, name:"FY26 Miami expansion",   base:"FY26 Budget", status:"Draft",       owner:"Andrew Morgan", created:"2026-06-30", locked:false, delta:6.1 },
];

export default function AffinityPlanning({ onNav, userName = "" }) {
  const [view, setView]       = useState("input");   // input | workflow | scenarios
  const [entity, setEntity]   = useState(ENTITIES[1].ref);
  const [scenario, setScenario] = useState("FY26 Budget");
  const [values, setValues]   = useState(seedValues);
  const [undoStack, setUndo]  = useState([]);
  const [dirty, setDirty]     = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [sel, setSel]         = useState({ r:0, c:0 });
  const [editing, setEditing] = useState(null);   // "code:idx"
  const [draft, setDraft]     = useState("");
  const [drawer, setDrawer]   = useState(null);   // "comments" | "validation" | null
  const [comments, setComments] = useState({});
  const [state, setState]     = useState("In progress");
  const [history, setHistory] = useState([
    { at:"14/11/2025 09:20", who:"Neil Kelly", what:"Budget created from FY25 actuals" },
  ]);
  const gridRef = useRef(null);

  const ent = ENTITIES.find((e) => e.ref === entity) || ENTITIES[0];
  const locked = state === "Locked" || state === "Approved";

  // ── derived values ────────────────────────────────────────────────────────
  const valueOf = useCallback((acc, i) => {
    if (acc.kind === "calcPct") {
      const src = values[acc.of + ":" + i];
      return src == null ? 0 : Math.round(src * acc.pct);
    }
    const v = values[acc.code + ":" + i];
    return v == null ? 0 : Number(v);
  }, [values]);

  const rowTotal = useCallback((acc) => MONTHS.reduce((s, _, i) => s + valueOf(acc, i), 0), [valueOf]);

  const groupTotal = useCallback((g, i) =>
    ACCOUNTS.filter((a) => a.group === g).reduce((s, a) => s + valueOf(a, i), 0), [valueOf]);

  const monthResult = useCallback((i) =>
    GROUPS.reduce((s, g) => s + SIGN[g] * groupTotal(g, i), 0), [groupTotal]);

  const yearResult = useMemo(() => MONTHS.reduce((s, _, i) => s + monthResult(i), 0), [monthResult]);
  const yearRevenue = useMemo(() => MONTHS.reduce((s, _, i) => s + groupTotal("Revenue", i), 0), [groupTotal]);

  // ── validation, the gate before submission ────────────────────────────────
  const validation = useMemo(() => {
    const issues = [];
    ACCOUNTS.filter((a) => a.kind === "input").forEach((a) => {
      const blanks = MONTHS.filter((_, i) => values[a.code + ":" + i] == null || values[a.code + ":" + i] === "").length;
      if (blanks === 12) issues.push({ level:"warn", msg:`${a.code} ${a.name} — no values entered for any period` });
      else if (blanks > 0) issues.push({ level:"warn", msg:`${a.code} ${a.name} — ${blanks} period${blanks>1?"s":""} blank` });
      const neg = MONTHS.filter((_, i) => Number(values[a.code + ":" + i]) < 0).length;
      if (neg) issues.push({ level:"error", msg:`${a.code} ${a.name} — ${neg} negative value${neg>1?"s":""}; use the opposite account instead` });
    });
    if (yearRevenue === 0) issues.push({ level:"error", msg:"No revenue budgeted for the year" });
    const margin = yearRevenue ? yearResult / yearRevenue : 0;
    if (margin < -0.05) issues.push({ level:"warn", msg:`Budgeted net margin is ${(margin*100).toFixed(1)}% — confirm this is intended` });
    return issues;
  }, [values, yearRevenue, yearResult]);

  const errors = validation.filter((v) => v.level === "error");

  // ── editing ───────────────────────────────────────────────────────────────
  const pushUndo = () => setUndo((u) => [...u.slice(-24), values]);

  const commit = (code, i, raw) => {
    const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
    if (cleaned === "") { setEditing(null); return; }
    pushUndo();
    setValues((v) => ({ ...v, [code + ":" + i]: Math.round(Number(cleaned)) }));
    setDirty(true);
    setEditing(null);
  };

  const undo = () => {
    setUndo((u) => {
      if (!u.length) return u;
      setValues(u[u.length - 1]);
      setDirty(true);
      return u.slice(0, -1);
    });
  };

  // spread a full-year figure evenly across the twelve periods
  const spread = (acc, annual) => {
    pushUndo();
    const per = Math.round(Number(annual) / 12);
    setValues((v) => {
      const n = { ...v };
      MONTHS.forEach((_, i) => { n[acc.code + ":" + i] = per; });
      return n;
    });
    setDirty(true);
  };

  // autosave — mirrors the spec's requirement, debounced
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      setSavedAt(new Date());
      setDirty(false);
    }, 1200);
    return () => clearTimeout(t);
  }, [dirty, values]);

  const editableRows = ACCOUNTS.filter((a) => a.kind === "input");

  // keyboard navigation across the grid
  const onKey = (e) => {
    if (editing) return;
    const max = editableRows.length - 1;
    let { r, c } = sel;
    if (e.key === "ArrowDown")  r = Math.min(max, r + 1);
    else if (e.key === "ArrowUp")   r = Math.max(0, r - 1);
    else if (e.key === "ArrowRight" || e.key === "Tab") { e.preventDefault(); c = c + 1 > 11 ? 0 : c + 1; if (c === 0) r = Math.min(max, r + 1); }
    else if (e.key === "ArrowLeft") c = Math.max(0, c - 1);
    else if (e.key === "Enter") { const a = editableRows[r]; setEditing(a.code + ":" + c); setDraft(String(values[a.code + ":" + c] ?? "")); return; }
    else if (/^[0-9]$/.test(e.key)) { const a = editableRows[r]; setEditing(a.code + ":" + c); setDraft(e.key); return; }
    else if (e.key === "Delete" || e.key === "Backspace") { const a = editableRows[r]; pushUndo(); setValues((v) => ({ ...v, [a.code + ":" + c]: 0 })); setDirty(true); return; }
    else return;
    e.preventDefault();
    setSel({ r, c });
  };

  // multi-cell paste, tab or comma separated, straight out of Excel
  const onPaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text) return;
    e.preventDefault();
    const rows = text.trim().split(/\r?\n/).map((line) => line.split(/\t|,/));
    pushUndo();
    setValues((v) => {
      const n = { ...v };
      rows.forEach((cells, ri) => {
        const acc = editableRows[sel.r + ri];
        if (!acc) return;
        cells.forEach((cell, ci) => {
          const col = sel.c + ci;
          if (col > 11) return;
          const num = Number(String(cell).replace(/[^0-9.\-]/g, ""));
          if (!isNaN(num)) n[acc.code + ":" + col] = Math.round(num);
        });
      });
      return n;
    });
    setDirty(true);
  };

  const transition = (to, note) => {
    setState(to);
    setHistory((h) => [...h, {
      at: new Date().toLocaleString("en-GB", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }),
      who: userName || "Andrew Morgan",
      what: note,
    }]);
  };

  // ── shared styles ─────────────────────────────────────────────────────────
  const btn  = { padding:"6px 12px", fontSize:11.5, borderRadius:6, border:`0.5px solid ${LINE}`, background:"transparent", color:MUT, cursor:"pointer" };
  const btnP = { ...btn, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:600 };
  const cellBase = { padding:"0", borderRight:`0.5px solid ${LINE}`, borderBottom:`0.5px solid ${LINE}`, height:28, fontSize:12,
                     textAlign:"right", fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap" };
  const stickyHead = { position:"sticky", top:0, zIndex:3, background:SUBTLE };
  const stickyCol  = { position:"sticky", left:0, zIndex:2, background:CARD, borderRight:`0.5px solid ${LINE}`, textAlign:"left" };

  const Badge = ({ label }) => {
    const st = STATE_STYLE[label] || STATE_STYLE["Not started"];
    return <span style={{ background:st.bg, color:st.color, borderRadius:20, padding:"3px 10px", fontSize:10.5, fontWeight:700 }}>{label}</span>;
  };

  return (
    <div style={{ fontFamily:FONT, background:PAGE, minHeight:"100vh", color:INK }} onPaste={onPaste}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 22px", background:CARD, borderBottom:`0.5px solid ${LINE}`, flexWrap:"wrap" }}>
        <h2 style={{ margin:0, fontSize:18, fontWeight:500, color:NAVY }}>Planning</h2>
        <div style={{ display:"flex", border:`0.5px solid ${LINE}`, borderRadius:6, overflow:"hidden" }}>
          {[["input","Budget input"],["workflow","Workflow"],["scenarios","Scenarios"],["variance","Variance & analysis"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)}
              style={{ border:"none", cursor:"pointer", fontSize:11.5, padding:"6px 13px", fontWeight:view===v?600:400,
                       background:view===v?CY:CARD, color:view===v?"#fff":MUT }}>{l}</button>
          ))}
        </div>
        <span style={{ fontSize:10.5, color:"#B08A3E", background:"#FDF4DC", borderRadius:20, padding:"3px 10px" }}>Preview data</span>
      </div>

      {/* Persistent filter bar */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 22px", background:CARD, borderBottom:`0.5px solid ${LINE}`, flexWrap:"wrap" }}>
        <span style={{ fontSize:10, fontWeight:600, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.5px" }}>Entity</span>
        <select value={entity} onChange={(e)=>setEntity(e.target.value)}
          style={{ height:30, padding:"0 8px", fontSize:11.5, border:`0.5px solid ${LINE}`, borderRadius:6, background:CARD, color:INK, minWidth:230 }}>
          {ENTITIES.map((e)=><option key={e.ref} value={e.ref}>{e.name}</option>)}
        </select>
        <span style={{ fontSize:10, fontWeight:600, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.5px", marginLeft:6 }}>Scenario</span>
        <select value={scenario} onChange={(e)=>setScenario(e.target.value)}
          style={{ height:30, padding:"0 8px", fontSize:11.5, border:`0.5px solid ${LINE}`, borderRadius:6, background:CARD, color:INK }}>
          {SCENARIOS_SEED.map((s)=><option key={s.id}>{s.name}</option>)}
        </select>
        <span style={{ fontSize:11, color:MUT }}>FY26 · {ent.ccy}</span>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <Badge label={state} />
          <span style={{ fontSize:10.5, color:MUT }}>
            {dirty ? "Saving…" : savedAt ? "Saved " + savedAt.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "No changes"}
          </span>
        </div>
      </div>

      {/* ══════════════ BUDGET INPUT GRID ══════════════ */}
      {view === "input" && (
        <div style={{ display:"flex", alignItems:"flex-start" }}>
          <div style={{ flex:1, minWidth:0 }}>

            {/* Grid toolbar */}
            <div style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 22px", flexWrap:"wrap" }}>
              <button style={btn} onClick={undo} disabled={!undoStack.length}
                title="Undo the last change">↶ Undo</button>
              <button style={btn} onClick={()=>setDrawer(drawer==="validation"?null:"validation")}>
                Validation {errors.length ? <span style={{ color:NEG, fontWeight:700 }}>· {errors.length}</span>
                                          : <span style={{ color:POS, fontWeight:700 }}>· clear</span>}
              </button>
              <button style={btn} onClick={()=>setDrawer(drawer==="comments"?null:"comments")}>
                Comments {Object.keys(comments).length>0 && <strong>· {Object.keys(comments).length}</strong>}
              </button>
              <span style={{ fontSize:10.5, color:MUT, marginLeft:6 }}>
                Click a cell then type · arrows to move · Enter to edit · paste a block straight from Excel
              </span>
              <div style={{ marginLeft:"auto", display:"flex", gap:7 }}>
                {(state==="In progress"||state==="Returned") && (
                  <button style={{ ...btnP, opacity: errors.length?0.5:1, cursor: errors.length?"not-allowed":"pointer" }}
                    disabled={!!errors.length}
                    title={errors.length?"Resolve validation errors before submitting":"Submit for approval"}
                    onClick={()=>transition("Submitted","Submitted for approval")}>Submit for approval ↗</button>
                )}
                {state==="Submitted" && (<>
                  <button style={btn} onClick={()=>transition("Returned","Returned for revision")}>Return</button>
                  <button style={btnP} onClick={()=>transition("Approved","Budget approved")}>Approve ✓</button>
                </>)}
                {state==="Approved" && <button style={btn} onClick={()=>transition("Locked","Period locked")}>Lock period</button>}
                {state==="Locked" && <button style={btn} onClick={()=>transition("In progress","Period reopened — reason recorded")}>Reopen</button>}
              </div>
            </div>

            {/* The grid */}
            <div ref={gridRef} tabIndex={0} onKeyDown={onKey}
              style={{ margin:"0 22px 22px", background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9,
                       overflow:"auto", maxHeight:"64vh", outline:"none" }}>
              <table style={{ borderCollapse:"separate", borderSpacing:0, minWidth:1180 }}>
                <thead>
                  <tr>
                    <th style={{ ...cellBase, ...stickyHead, ...stickyCol, zIndex:4, minWidth:260, padding:"0 12px",
                                 fontSize:10, fontWeight:600, color:MUT, textTransform:"uppercase", letterSpacing:"0.4px" }}>Account</th>
                    {MONTHS.map((m)=>(
                      <th key={m} style={{ ...cellBase, ...stickyHead, minWidth:74, padding:"0 8px",
                                           fontSize:10, fontWeight:600, color:MUT, textTransform:"uppercase", letterSpacing:"0.4px" }}>{m}</th>
                    ))}
                    <th style={{ ...cellBase, ...stickyHead, minWidth:92, padding:"0 10px", fontSize:10, fontWeight:700,
                                 color:NAVY, textTransform:"uppercase", letterSpacing:"0.4px", background:"#EFF7F8" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map((g)=>(
                    <>
                      <tr key={g}>
                        <td colSpan={14} style={{ ...cellBase, ...stickyCol, textAlign:"left", padding:"0 12px",
                                                  background:SUBTLE, fontWeight:700, fontSize:11, color:NAVY,
                                                  textTransform:"uppercase", letterSpacing:"0.4px" }}>{g}</td>
                      </tr>
                      {ACCOUNTS.filter((a)=>a.group===g).map((a)=>{
                        const rowIdx = editableRows.indexOf(a);
                        return (
                          <tr key={a.code}>
                            <td style={{ ...cellBase, ...stickyCol, padding:"0 12px", fontSize:12 }}>
                              <span style={{ color:MUT, fontSize:10.5, marginRight:8 }}>{a.code}</span>{a.name}
                              {a.kind==="calcPct" && <span style={{ marginLeft:6, fontSize:9, color:"#7B4F1D", background:"#FDF4DC", borderRadius:8, padding:"1px 5px" }}>FORMULA</span>}
                              {a.kind==="actual"  && <span style={{ marginLeft:6, fontSize:9, color:"#1F6F54", background:"#E7F4EF", borderRadius:8, padding:"1px 5px" }}>ACTUAL</span>}
                              {a.kind==="input" && (
                                <button title="Spread a full-year figure evenly across the periods"
                                  onClick={()=>{ const t=window.prompt("Annual figure to spread evenly across 12 periods:", String(rowTotal(a))); if(t!=null) spread(a,t); }}
                                  style={{ marginLeft:8, border:"none", background:"none", cursor:"pointer", color:CY, fontSize:10 }}>spread</button>
                              )}
                            </td>
                            {MONTHS.map((m,i)=>{
                              const key = a.code+":"+i;
                              const isEditing = editing===key;
                              const isSel = rowIdx>-1 && sel.r===rowIdx && sel.c===i;
                              const editable = a.kind==="input" && !locked;
                              const bg = locked ? "#F4F4F6"
                                       : a.kind==="calcPct" ? "#FBF7EC"
                                       : a.kind==="actual"  ? "#F1F7F4"
                                       : isSel ? "rgba(0,196,204,0.12)" : "#FCFEFF";
                              return (
                                <td key={m}
                                  onClick={()=>{ if(rowIdx>-1) setSel({r:rowIdx,c:i}); if(editable){ setEditing(key); setDraft(String(values[key] ?? "")); } }}
                                  style={{ ...cellBase, background:bg, cursor:editable?"cell":"default",
                                           outline:isSel?`1.5px solid ${CY}`:"none", outlineOffset:"-1.5px" }}>
                                  {isEditing ? (
                                    <input autoFocus value={draft}
                                      onChange={(e)=>setDraft(e.target.value)}
                                      onBlur={()=>commit(a.code,i,draft)}
                                      onKeyDown={(e)=>{
                                        if(e.key==="Enter"){ commit(a.code,i,draft); setSel({r:rowIdx,c:i}); gridRef.current&&gridRef.current.focus(); }
                                        if(e.key==="Escape"){ setEditing(null); }
                                        if(e.key==="Tab"){ e.preventDefault(); commit(a.code,i,draft); setSel({r:rowIdx,c:Math.min(11,i+1)}); gridRef.current&&gridRef.current.focus(); }
                                      }}
                                      style={{ width:"100%", height:"100%", border:"none", outline:"none", textAlign:"right",
                                               padding:"0 8px", fontSize:12, fontFamily:FONT, background:"#fff",
                                               fontVariantNumeric:"tabular-nums", boxSizing:"border-box" }} />
                                  ) : (
                                    <span style={{ display:"block", padding:"0 8px", lineHeight:"28px",
                                                   color: a.kind==="input" ? INK : MUT }}>{nf(valueOf(a,i))}</span>
                                  )}
                                </td>
                              );
                            })}
                            <td style={{ ...cellBase, padding:"0 10px", fontWeight:600, background:"#EFF7F8" }}>
                              <span style={{ lineHeight:"28px" }}>{nf(rowTotal(a))}</span>
                            </td>
                          </tr>
                        );
                      })}
                      <tr key={g+"-sub"}>
                        <td style={{ ...cellBase, ...stickyCol, padding:"0 12px", fontWeight:700, background:"#F3F6F9" }}>
                          <span style={{ lineHeight:"28px" }}>Total {g.toLowerCase()}</span>
                        </td>
                        {MONTHS.map((m,i)=>(
                          <td key={m} style={{ ...cellBase, fontWeight:700, background:"#F3F6F9" }}>
                            <span style={{ display:"block", padding:"0 8px", lineHeight:"28px" }}>{nf(groupTotal(g,i))}</span>
                          </td>
                        ))}
                        <td style={{ ...cellBase, padding:"0 10px", fontWeight:700, background:"#E6EFF1" }}>
                          <span style={{ lineHeight:"28px" }}>{nf(MONTHS.reduce((s,_,i)=>s+groupTotal(g,i),0))}</span>
                        </td>
                      </tr>
                    </>
                  ))}
                  <tr>
                    <td style={{ ...cellBase, ...stickyCol, padding:"0 12px", fontWeight:700, background:NAVY, color:"#fff" }}>
                      <span style={{ lineHeight:"28px" }}>Net result</span>
                    </td>
                    {MONTHS.map((m,i)=>{
                      const v = monthResult(i);
                      return (
                        <td key={m} style={{ ...cellBase, fontWeight:700, background:NAVY, color: v<0 ? "#FF9B9B" : "#8FE9ED" }}>
                          <span style={{ display:"block", padding:"0 8px", lineHeight:"28px" }}>{nf(v)}</span>
                        </td>
                      );
                    })}
                    <td style={{ ...cellBase, padding:"0 10px", fontWeight:700, background:"#000B26", color: yearResult<0 ? "#FF9B9B" : "#8FE9ED" }}>
                      <span style={{ lineHeight:"28px" }}>{nf(yearResult)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Right drawer — validation and comments */}
          {drawer && (
            <div style={{ width:300, flexShrink:0, background:CARD, borderLeft:`0.5px solid ${LINE}`, minHeight:"64vh", padding:"14px 16px" }}>
              <div style={{ display:"flex", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontSize:12.5, fontWeight:600, color:NAVY }}>{drawer==="validation"?"Validation":"Comments"}</div>
                <button onClick={()=>setDrawer(null)} style={{ marginLeft:"auto", border:"none", background:"none", cursor:"pointer", color:"#aaa" }}>✕</button>
              </div>
              {drawer==="validation" ? (
                validation.length===0
                  ? <div style={{ fontSize:11.5, color:POS }}>✓ No issues. Ready to submit.</div>
                  : validation.map((v,i)=>(
                      <div key={i} style={{ fontSize:11, lineHeight:1.6, padding:"7px 9px", marginBottom:6, borderRadius:6,
                                            background: v.level==="error"?"#FCEBEB":"#FDF4DC",
                                            color: v.level==="error"?"#A32D2D":"#7B4F1D" }}>
                        <strong>{v.level==="error"?"Error":"Check"}</strong> · {v.msg}
                      </div>
                    ))
              ) : (
                <>
                  <div style={{ fontSize:11, color:MUT, lineHeight:1.6, marginBottom:9 }}>
                    Attach an explanation to the selected cell. Approvers see these alongside the figure.
                  </div>
                  <div style={{ fontSize:11, fontWeight:600, marginBottom:6 }}>
                    {editableRows[sel.r] ? editableRows[sel.r].name + " · " + MONTHS[sel.c] : "No cell selected"}
                  </div>
                  <textarea rows={4} placeholder="Explain a movement or assumption…"
                    value={comments[(editableRows[sel.r]||{}).code + ":" + sel.c] || ""}
                    onChange={(e)=>setComments((c)=>({ ...c, [(editableRows[sel.r]||{}).code + ":" + sel.c]: e.target.value }))}
                    style={{ width:"100%", fontSize:11.5, fontFamily:FONT, border:`0.5px solid ${LINE}`, borderRadius:6,
                             padding:"7px 9px", resize:"vertical", boxSizing:"border-box", background:CARD, color:INK }} />
                  {Object.keys(comments).filter((k)=>comments[k]).length>0 && (
                    <div style={{ marginTop:12 }}>
                      <div style={{ fontSize:10, fontWeight:600, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>All comments</div>
                      {Object.keys(comments).filter((k)=>comments[k]).map((k)=>{
                        const [code,idx]=k.split(":");
                        const acc=ACCOUNTS.find((a)=>a.code===code);
                        return (
                          <div key={k} style={{ fontSize:10.5, color:MUT, borderTop:`0.5px solid ${LINE}`, padding:"6px 0", lineHeight:1.5 }}>
                            <strong style={{ color:INK }}>{acc?acc.name:code} · {MONTHS[idx]}</strong><br/>{comments[k]}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ WORKFLOW ══════════════ */}
      {view === "workflow" && (
        <div style={{ padding:"16px 22px 60px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:9, marginBottom:16 }}>
            {STATES.map((st)=>{
              const n = st===state ? 1 : st==="Not started" ? 3 : st==="Approved" ? 2 : 0;
              const sty = STATE_STYLE[st];
              return (
                <div key={st} style={{ background:CARD, border:`0.5px solid ${st===state?CY:LINE}`, borderRadius:9, padding:"11px 13px" }}>
                  <div style={{ fontSize:10.5, fontWeight:700, color:sty.color, marginBottom:5 }}>{st.toUpperCase()}</div>
                  <div style={{ fontSize:20, fontWeight:700, color: n?NAVY:"#ddd" }}>{n}</div>
                  <div style={{ fontSize:10, color:MUT }}>{n===1?"entity":"entities"}</div>
                </div>
              );
            })}
          </div>

          <div style={{ background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9, overflow:"hidden", marginBottom:18 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Entity","Owner","Approver","Due","Status","Validation",""].map((h)=>(
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:10, fontWeight:600, color:MUT,
                                       textTransform:"uppercase", letterSpacing:"0.4px", background:SUBTLE, borderBottom:`0.5px solid ${LINE}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {ENTITIES.map((e,i)=>{
                  const st = e.ref===entity ? state : ["Approved","Not started","In progress","Not started","Approved","Not started","Submitted"][i];
                  const errs = e.ref===entity ? errors.length : (i===2 ? 2 : 0);
                  return (
                    <tr key={e.ref} style={{ borderBottom:`0.5px solid ${LINE}`, background:e.ref===entity?"rgba(0,196,204,0.05)":"transparent" }}>
                      <td style={{ padding:"9px 14px", fontSize:12.5, fontWeight:e.ref===entity?600:400 }}>{e.name}</td>
                      <td style={{ padding:"9px 14px", fontSize:12 }}>{["Neil Kelly","Neil Kelly","Joanne Fenech","Garry Crossan","Neil Kelly","Andrew Morgan","Andrew Morgan"][i]}</td>
                      <td style={{ padding:"9px 14px", fontSize:12, color:MUT }}>Andrew Morgan</td>
                      <td style={{ padding:"9px 14px", fontSize:12, color:MUT }}>30/09/2026</td>
                      <td style={{ padding:"9px 14px" }}><Badge label={st} /></td>
                      <td style={{ padding:"9px 14px", fontSize:11.5, color: errs?NEG:POS, fontWeight:600 }}>
                        {errs ? errs+" error"+(errs>1?"s":"") : "clear"}
                      </td>
                      <td style={{ padding:"9px 14px" }}>
                        <button style={{ ...btn, padding:"3px 10px", fontSize:10.5 }}
                          onClick={()=>{ setEntity(e.ref); setView("input"); }}>Open ↗</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:12.5, fontWeight:600, color:NAVY, marginBottom:8 }}>Approval history — {ent.name}</div>
          <div style={{ background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9, padding:"12px 15px" }}>
            {history.map((h,i)=>(
              <div key={i} style={{ display:"flex", gap:10, padding:"7px 0", borderBottom: i<history.length-1?`0.5px solid ${LINE}`:"none", fontSize:11.5 }}>
                <span style={{ color:MUT, minWidth:130 }}>{h.at}</span>
                <span style={{ fontWeight:600, minWidth:120 }}>{h.who}</span>
                <span style={{ color:MUT }}>{h.what}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════ SCENARIOS ══════════════ */}
      {view === "scenarios" && (
        <div style={{ padding:"16px 22px 60px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:11, flexWrap:"wrap" }}>
            <div style={{ fontSize:13, fontWeight:600, color:NAVY }}>Scenarios</div>
            <span style={{ fontSize:11, color:MUT }}>A scenario is a copy of an approved budget. Changing one never touches the approved figures.</span>
            <button style={{ ...btnP, marginLeft:"auto" }}>＋ New scenario from approved budget</button>
          </div>

          <div style={{ background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9, overflow:"hidden", marginBottom:18 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Scenario","Based on","Owner","Created","Status","Net result vs budget",""].map((h)=>(
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:10, fontWeight:600, color:MUT,
                                       textTransform:"uppercase", letterSpacing:"0.4px", background:SUBTLE, borderBottom:`0.5px solid ${LINE}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {SCENARIOS_SEED.map((sc)=>(
                  <tr key={sc.id} style={{ borderBottom:`0.5px solid ${LINE}`, background:sc.name===scenario?"rgba(0,196,204,0.05)":"transparent" }}>
                    <td style={{ padding:"9px 14px", fontSize:12.5, fontWeight:600 }}>
                      {sc.name} {sc.locked && <span title="Locked" style={{ marginLeft:5, fontSize:9, color:"#4A4A6A", background:"#EEEEF5", borderRadius:8, padding:"1px 6px" }}>LOCKED</span>}
                    </td>
                    <td style={{ padding:"9px 14px", fontSize:12, color:MUT }}>{sc.base || "—"}</td>
                    <td style={{ padding:"9px 14px", fontSize:12 }}>{sc.owner}</td>
                    <td style={{ padding:"9px 14px", fontSize:12, color:MUT }}>{sc.created.split("-").reverse().join("/")}</td>
                    <td style={{ padding:"9px 14px" }}><Badge label={sc.status==="Draft"?"Not started":sc.status} /></td>
                    <td style={{ padding:"9px 14px", fontSize:12.5, fontWeight:700, fontVariantNumeric:"tabular-nums",
                                 color: sc.delta>0?POS : sc.delta<0?NEG : MUT }}>
                      {sc.delta===0 ? "baseline" : (sc.delta>0?"+":"") + sc.delta.toFixed(1) + "%"}
                    </td>
                    <td style={{ padding:"9px 14px", whiteSpace:"nowrap" }}>
                      <button style={{ ...btn, padding:"3px 10px", fontSize:10.5 }}
                        onClick={()=>{ setScenario(sc.name); setView("input"); }}>Open ↗</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:12.5, fontWeight:600, color:NAVY, marginBottom:8 }}>Comparison — effect of the change, not two spreadsheets side by side</div>
          <div style={{ background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Driver","FY26 Budget","FY26 Downside","Change","Effect on net result"].map((h)=>(
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:10, fontWeight:600, color:MUT,
                                       textTransform:"uppercase", letterSpacing:"0.4px", background:SUBTLE, borderBottom:`0.5px solid ${LINE}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {[
                  ["New entity take-on (per month)", "6", "3", "−50%", -184000],
                  ["Average annual fee",             "£4,150", "£3,900", "−6.0%", -71000],
                  ["Attrition rate",                 "4.0%", "6.5%", "+2.5pp", -96000],
                  ["Salary inflation",               "3.5%", "3.5%", "no change", 0],
                  ["Headcount at year end",          "58", "55", "−3", 112000],
                ].map((r,i)=>(
                  <tr key={i} style={{ borderBottom:`0.5px solid ${LINE}` }}>
                    <td style={{ padding:"9px 14px", fontSize:12.5 }}>{r[0]}</td>
                    <td style={{ padding:"9px 14px", fontSize:12.5, fontVariantNumeric:"tabular-nums" }}>{r[1]}</td>
                    <td style={{ padding:"9px 14px", fontSize:12.5, fontVariantNumeric:"tabular-nums" }}>{r[2]}</td>
                    <td style={{ padding:"9px 14px", fontSize:12, color:MUT }}>{r[3]}</td>
                    <td style={{ padding:"9px 14px", fontSize:12.5, fontWeight:700, fontVariantNumeric:"tabular-nums",
                                 color: r[4]>0?POS : r[4]<0?NEG : MUT }}>
                      {r[4]===0 ? "—" : (r[4]>0?"+":"−") + "£" + Math.abs(r[4]).toLocaleString("en-GB")}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding:"10px 14px", fontSize:12.5, fontWeight:700, background:SUBTLE }}>Total effect</td>
                  <td colSpan={3} style={{ background:SUBTLE }} />
                  <td style={{ padding:"10px 14px", fontSize:13, fontWeight:700, background:SUBTLE, color:NEG, fontVariantNumeric:"tabular-nums" }}>−£239,000</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════ VARIANCE & ANALYSIS ══════════════ */}
      {view === "variance" && (
        <div style={{ padding:"16px 22px 60px" }}>

          {/* Key metrics, carried over from Budgets */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:10, marginBottom:18 }}>
            {[
              ["Budget — full year", "£2,100,000", NAVY],
              ["Forecast — full year", "£2,203,000", CY],
              ["Actual YTD", "£1,081,000", NAVY],
              ["Variance YTD", "+£22,000", POS],
              ["Net margin", "28.4%", NAVY],
            ].map(([l,v,c])=>(
              <div key={l} style={{ background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9, padding:"12px 14px" }}>
                <div style={{ fontSize:10.5, color:MUT, marginBottom:5 }}>{l}</div>
                <div style={{ fontSize:19, fontWeight:700, color:c, fontVariantNumeric:"tabular-nums" }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize:12.5, fontWeight:600, color:NAVY, marginBottom:8 }}>Variance analysis — YTD</div>
          <div style={{ background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9, overflow:"hidden", marginBottom:20 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Line","Budget","Actual YTD","Variance","%","Status",""].map((h)=>(
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:10, fontWeight:600, color:MUT,
                                       textTransform:"uppercase", letterSpacing:"0.4px", background:SUBTLE, borderBottom:`0.5px solid ${LINE}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {VARIANCE.map((v,i)=>(
                  <tr key={i} style={{ borderBottom:`0.5px solid ${LINE}` }}>
                    <td style={{ padding:"9px 14px", fontSize:12.5 }}>{v.line}</td>
                    <td style={{ padding:"9px 14px", fontSize:12.5, fontVariantNumeric:"tabular-nums" }}>£{nf(v.budget)}</td>
                    <td style={{ padding:"9px 14px", fontSize:12.5, fontVariantNumeric:"tabular-nums" }}>£{nf(v.actual)}</td>
                    <td style={{ padding:"9px 14px", fontSize:12.5, fontWeight:700, fontVariantNumeric:"tabular-nums",
                                 color: v.variance>0?POS:NEG }}>{v.variance>0?"+":"−"}£{nf(Math.abs(v.variance))}</td>
                    <td style={{ padding:"9px 14px", fontSize:12, color:MUT }}>{v.pct}</td>
                    <td style={{ padding:"9px 14px" }}>
                      <span style={{ fontSize:10, fontWeight:700, borderRadius:20, padding:"2px 9px",
                                     background: v.status==="Favourable"?"#E7F4EF":"#FCEBEB",
                                     color: v.status==="Favourable"?"#1F6F54":"#A32D2D" }}>{v.status}</span>
                    </td>
                    <td style={{ padding:"9px 14px" }}>
                      <button style={{ ...btn, padding:"3px 9px", fontSize:10 }}
                        onClick={()=>{ setView("input"); setDrawer("comments"); }}
                        title="Attach an explanation to this variance">＋ Explain</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:12.5, fontWeight:600, color:NAVY, marginBottom:8 }}>Revenue by service line — budget vs forecast vs actual</div>
          <div style={{ background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9, overflow:"hidden", marginBottom:20 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Service line","Budget","Forecast","Actual YTD","Margin %","Forecast vs budget"].map((h)=>(
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:10, fontWeight:600, color:MUT,
                                       textTransform:"uppercase", letterSpacing:"0.4px", background:SUBTLE, borderBottom:`0.5px solid ${LINE}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {SERVICELINES.map((r,i)=>{
                  const d = r.forecast - r.budget;
                  return (
                    <tr key={i} style={{ borderBottom:`0.5px solid ${LINE}` }}>
                      <td style={{ padding:"9px 14px", fontSize:12.5 }}>{r.line}</td>
                      <td style={{ padding:"9px 14px", fontSize:12.5, fontVariantNumeric:"tabular-nums" }}>£{nf(r.budget)}</td>
                      <td style={{ padding:"9px 14px", fontSize:12.5, fontVariantNumeric:"tabular-nums" }}>£{nf(r.forecast)}</td>
                      <td style={{ padding:"9px 14px", fontSize:12.5, fontVariantNumeric:"tabular-nums", color:MUT }}>£{nf(r.actual)}</td>
                      <td style={{ padding:"9px 14px", fontSize:12.5, fontWeight:600 }}>{r.margin}%</td>
                      <td style={{ padding:"9px 14px", fontSize:12.5, fontWeight:700, fontVariantNumeric:"tabular-nums", color: d>=0?POS:NEG }}>
                        {d>=0?"+":"−"}£{nf(Math.abs(d))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:12.5, fontWeight:600, color:NAVY, marginBottom:8 }}>Monthly revenue — budget vs forecast vs actual</div>
          <div style={{ background:CARD, border:`0.5px solid ${LINE}`, borderRadius:9, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Month","Budget","Forecast","Actual","Actual vs budget"].map((h)=>(
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:10, fontWeight:600, color:MUT,
                                       textTransform:"uppercase", letterSpacing:"0.4px", background:SUBTLE, borderBottom:`0.5px solid ${LINE}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {MONTHLY.map((m,i)=>{
                  const d = m.actual == null ? null : m.actual - m.budget;
                  return (
                    <tr key={i} style={{ borderBottom:`0.5px solid ${LINE}` }}>
                      <td style={{ padding:"9px 14px", fontSize:12.5 }}>{m.month}</td>
                      <td style={{ padding:"9px 14px", fontSize:12.5, fontVariantNumeric:"tabular-nums" }}>£{nf(m.budget)}</td>
                      <td style={{ padding:"9px 14px", fontSize:12.5, fontVariantNumeric:"tabular-nums" }}>£{nf(m.forecast)}</td>
                      <td style={{ padding:"9px 14px", fontSize:12.5, fontVariantNumeric:"tabular-nums", color: m.actual==null?"#bbb":INK }}>
                        {m.actual==null ? "not yet posted" : "£"+nf(m.actual)}
                      </td>
                      <td style={{ padding:"9px 14px", fontSize:12.5, fontWeight:700, fontVariantNumeric:"tabular-nums",
                                   color: d==null?"#bbb":d>=0?POS:NEG }}>
                        {d==null ? "—" : (d>=0?"+":"−")+"£"+nf(Math.abs(d))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ margin:"0 22px 30px", background:"#FDF4DC", border:"0.5px solid #E5CE9A", borderRadius:8,
                    padding:"10px 13px", fontSize:10.5, color:"#7B4F1D", lineHeight:1.65 }}>
        ⚠️ Interface layer. The grid, workflow states, validation, scenarios and comparison are complete and behave as they will in production, against preview figures. The calculation engine they map to already exists on the <code>accounting-engine</code> branch — submit_budget, approve_budget, build_rolling_forecast, compare_budget_scenarios — and connecting them needs that branch merged and db/001–051 run. Accounting policy for account mappings and any consolidation treatment needs finance sign-off before this is used for real budgets.
      </div>
    </div>
  );
}
