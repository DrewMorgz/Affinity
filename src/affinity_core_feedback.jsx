import { useState, useEffect, useMemo } from "react";

const CY   = "#00C4CC";
const NAVY = "#001242";

const MODULES = [
  "Dashboard","Tasks","Entity Admin","CRM","Documents","Onboarding",
  "Timesheets","Invoicing","Bookkeeping","Budgeting","Attrition","Reporting",
  "Compliance","Procedures","Generate doc","Intranet","Assistant","System admin",
  "Login / Auth","General / Layout","Mobile","Other"
];
const TYPES      = ["Bug","UX / Design","Feature request","Copy / Wording","Performance","Question"];
const PRIORITIES = ["High","Medium","Low"];
const STATUSES   = ["Open","In review","In progress","Implemented","Won't fix","Duplicate"];

const STORAGE_KEY = "affinity-core-feedback";

const priColor = (p) => p === "High" ? {bg:"#FCEBEB",color:"#A32D2D"} : p === "Medium" ? {bg:"#FAEEDA",color:"#633806"} : {bg:"#EAF3DE",color:"#27500A"};
const typeColor = (t) => ({
  "Bug":               {bg:"#FCEBEB",color:"#A32D2D"},
  "UX / Design":       {bg:"#EEF0FB",color:"#3C3489"},
  "Feature request":   {bg:"#E6F7FB",color:"#0077A8"},
  "Copy / Wording":    {bg:"#F1EFE8",color:"#666"},
  "Performance":       {bg:"#FAEEDA",color:"#633806"},
  "Question":          {bg:"#EAF3DE",color:"#27500A"},
}[t] || {bg:"#eee",color:"#666"});
const statusColor = (s) => ({
  "Open":         {bg:"#FCEBEB",color:"#A32D2D"},
  "In review":    {bg:"#FAEEDA",color:"#633806"},
  "In progress":  {bg:"#E6F7FB",color:"#0077A8"},
  "Implemented":  {bg:"#EAF3DE",color:"#27500A"},
  "Won't fix":    {bg:"#F1EFE8",color:"#666"},
  "Duplicate":    {bg:"#F1EFE8",color:"#666"},
}[s] || {bg:"#eee",color:"#666"});

const Badge = ({ label, c }) => (
  <span style={{display:"inline-block",padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:600,background:c.bg,color:c.color,whiteSpace:"nowrap"}}>{label}</span>
);

export default function AffinityFeedback({ userName, isSuperAdmin }) {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const [form, setForm] = useState({
    tester:  userName || "",
    module:  "Dashboard",
    type:    "UX / Design",
    priority:"Medium",
    text:    "",
  });
  const [filter, setFilter] = useState("All");
  const [justSaved, setJustSaved] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Sync to localStorage on change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
  }, [items]);

  // Keep tester name in sync if user changes
  useEffect(() => { if (userName) setForm(f => ({...f, tester:userName})); }, [userName]);

  const submit = () => {
    if (!form.text.trim()) return;
    const entry = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      tester: form.tester || "Anonymous",
      module: form.module,
      type: form.type,
      priority: form.priority,
      text: form.text.trim(),
      status: "Open",
      adminNotes: "",
    };
    setItems([entry, ...items]);
    setForm(f => ({...f, text:""}));
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const updateStatus = (id, status) => {
    setItems(items.map(it => it.id === id ? {...it, status} : it));
  };
  const updateNotes = (id, adminNotes) => {
    setItems(items.map(it => it.id === id ? {...it, adminNotes} : it));
  };
  const remove = (id) => {
    if (!confirm("Delete this feedback entry?")) return;
    setItems(items.filter(it => it.id !== id));
  };

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g,'""')}"`;
    const cols = ["Date","Tester","Module","Type","Priority","Status","Feedback","Notes"];
    const rows = items.map(it => [
      new Date(it.createdAt).toLocaleString("en-GB"),
      it.tester, it.module, it.type, it.priority, it.status, it.text, it.adminNotes
    ].map(esc).join(","));
    const csv = [cols.join(","), ...rows].join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `affinity-core-feedback-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (!confirm(`Clear all ${items.length} feedback entries? This cannot be undone.`)) return;
    setItems([]);
  };

  const filtered = useMemo(() => {
    if (filter === "All") return items;
    if (["Open","In review","In progress","Implemented"].includes(filter)) return items.filter(i => i.status === filter);
    if (PRIORITIES.includes(filter)) return items.filter(i => i.priority === filter);
    return items;
  }, [items, filter]);

  const counts = useMemo(() => ({
    total: items.length,
    open: items.filter(i => i.status === "Open").length,
    high: items.filter(i => i.priority === "High" && i.status !== "Implemented" && i.status !== "Won't fix").length,
    done: items.filter(i => i.status === "Implemented").length,
  }), [items]);

  // ---------------- Styles ----------------
  const card = { background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:isMobile?14:18 };
  const lbl  = { fontSize:10, fontWeight:600, color:"#888", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.4px" };
  const inp  = { width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
  const btn  = (primary=false) => ({
    padding:"9px 16px", border:primary?"none":"0.5px solid #ddd", borderRadius:6,
    background:primary?CY:"#fff", color:primary?"#fff":"#333", fontSize:12,
    fontWeight:primary?600:500, cursor:"pointer", whiteSpace:"nowrap"
  });

  return (
    <div style={{padding:isMobile?"14px 14px 60px":"24px 28px 80px", maxWidth:1200, margin:"0 auto"}}>
      {/* Header */}
      <div style={{marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
          <span style={{fontSize:22}}>💬</span>
          <h1 style={{margin:0, fontSize:isMobile?20:24, fontWeight:700, color:NAVY}}>Feedback</h1>
        </div>
        <div style={{fontSize:12, color:"#666", lineHeight:1.5}}>
          Spot something odd, missing, or worth changing? Log it here — one entry per observation.
          Andy and Alex see everything you submit. <span style={{color:"#999"}}>Beta build — some features show mock data while we wire them up.</span>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:8,marginBottom:18}}>
        {[
          {l:"Total",        v:counts.total, c:CY},
          {l:"Open",         v:counts.open,  c:"#A32D2D"},
          {l:"High priority",v:counts.high,  c:"#B58A20"},
          {l:"Implemented",  v:counts.done,  c:"#27500A"},
        ].map(k=>(
          <div key={k.l} style={{...card, padding:"10px 14px"}}>
            <div style={{fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px"}}>{k.l}</div>
            <div style={{fontSize:22,fontWeight:700,color:k.c,marginTop:2}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Submit form */}
      <div style={{...card, marginBottom:18}}>
        <div style={{fontSize:13,fontWeight:700,color:NAVY,marginBottom:14}}>New feedback</div>

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <div style={lbl}>Tester</div>
            <input style={inp} value={form.tester} onChange={e=>setForm({...form,tester:e.target.value})} placeholder="Your name"/>
          </div>
          <div>
            <div style={lbl}>Module / area</div>
            <select style={inp} value={form.module} onChange={e=>setForm({...form,module:e.target.value})}>
              {MODULES.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <div style={lbl}>Type</div>
            <select style={inp} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
              {TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>Priority</div>
            <select style={inp} value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>
              {PRIORITIES.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <div style={lbl}>What's the feedback?</div>
          <textarea
            style={{...inp,minHeight:90,resize:"vertical",lineHeight:1.5}}
            value={form.text}
            onChange={e=>setForm({...form,text:e.target.value})}
            placeholder="Be specific. What did you see, where, and what would you change?"
          />
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}}>
          {justSaved && <span style={{fontSize:11,color:"#27500A",marginRight:8}}>✓ Saved</span>}
          <button style={btn(true)} onClick={submit} disabled={!form.text.trim()}>Submit feedback</button>
        </div>
      </div>

      {/* List */}
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:13,fontWeight:700,color:NAVY}}>All feedback {items.length>0 && <span style={{color:"#999",fontWeight:500}}>· {filtered.length} shown</span>}</div>
          <div style={{display:"flex",gap:6}}>
            <button style={btn(false)} onClick={exportCsv} disabled={items.length===0}>⬇ Export CSV</button>
            {isSuperAdmin && <button style={{...btn(false), color:"#A32D2D"}} onClick={clearAll} disabled={items.length===0}>Clear all</button>}
          </div>
        </div>

        {/* Filters */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,paddingBottom:12,borderBottom:"0.5px solid #f0f0f0"}}>
          {["All","Open","High","Medium","Low","Implemented"].map(f=>(
            <button key={f}
              onClick={()=>setFilter(f)}
              style={{padding:"5px 10px",fontSize:11,border:"none",borderRadius:14,background:filter===f?CY:"#f5f5f5",color:filter===f?"#fff":"#666",cursor:"pointer",fontWeight:filter===f?600:500}}>
              {f}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{padding:"40px 20px",textAlign:"center",color:"#aaa",fontSize:12}}>
            {items.length === 0 ? "No feedback yet — be the first." : "No entries match this filter."}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {filtered.map(it => (
              <div key={it.id} style={{border:"0.5px solid #eee",borderRadius:8,padding:12,background:"#fafafa"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    <Badge label={it.module} c={{bg:"#EEF0FB",color:"#3C3489"}}/>
                    <Badge label={it.type} c={typeColor(it.type)}/>
                    <Badge label={it.priority} c={priColor(it.priority)}/>
                    <Badge label={it.status} c={statusColor(it.status)}/>
                  </div>
                  <div style={{fontSize:10,color:"#999"}}>
                    {it.tester} · {new Date(it.createdAt).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
                  </div>
                </div>
                <div style={{fontSize:12,color:"#333",lineHeight:1.55,whiteSpace:"pre-wrap"}}>{it.text}</div>

                {isSuperAdmin && (
                  <div style={{marginTop:10,paddingTop:10,borderTop:"0.5px dashed #ddd",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:10,color:"#888",fontWeight:600}}>ADMIN:</span>
                    <select value={it.status} onChange={e=>updateStatus(it.id, e.target.value)} style={{fontSize:11,padding:"3px 6px",border:"0.5px solid #ddd",borderRadius:4,background:"#fff"}}>
                      {STATUSES.map(s=><option key={s}>{s}</option>)}
                    </select>
                    {editingId === it.id ? (
                      <input
                        style={{...inp, flex:1, minWidth:160, padding:"4px 8px", fontSize:11}}
                        autoFocus
                        defaultValue={it.adminNotes}
                        onBlur={e=>{ updateNotes(it.id, e.target.value); setEditingId(null); }}
                        onKeyDown={e=>{ if(e.key==="Enter"){ updateNotes(it.id, e.target.value); setEditingId(null); }}}
                        placeholder="Notes from Andy / Alex…"
                      />
                    ) : (
                      <button onClick={()=>setEditingId(it.id)} style={{fontSize:11,color:"#666",background:"transparent",border:"0.5px solid #ddd",borderRadius:4,padding:"3px 8px",cursor:"pointer"}}>
                        {it.adminNotes ? `📝 ${it.adminNotes}` : "+ Add note"}
                      </button>
                    )}
                    <button onClick={()=>remove(it.id)} style={{fontSize:11,color:"#A32D2D",background:"transparent",border:"none",cursor:"pointer",marginLeft:"auto"}}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{marginTop:16,paddingTop:14,borderTop:"0.5px solid #f0f0f0",fontSize:10,color:"#999",lineHeight:1.6}}>
          Entries are stored locally in your browser. Use <strong>Export CSV</strong> to send everything to Andy / Alex.
          {isSuperAdmin && <> Super admins see admin controls on each entry.</>}
        </div>
      </div>
    </div>
  );
}
