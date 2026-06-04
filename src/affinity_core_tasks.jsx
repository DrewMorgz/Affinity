import { useState, useMemo } from "react";
const CY = "#00C4CC";
const NAVY = "#001242";

const Badge = ({ label, colors }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:colors?.bg||"#eee", color:colors?.color||"#333", whiteSpace:"nowrap" }}>{label}</span>
);

// Per review: categories
const CATEGORIES = ["Compliance","Admin","Accounts","Internal Accounts","New Business","Statutory"];

const catColors = {
  "Compliance":        { bg:"#FCEBEB", color:"#A32D2D" },
  "Admin":             { bg:"#E6F7FB", color:"#0077A8" },
  "Accounts":          { bg:"#EAF3DE", color:"#27500A" },
  "Internal Accounts": { bg:"#EEF0FB", color:"#3C3489" },
  "New Business":      { bg:"#FAEEDA", color:"#633806" },
  "Statutory":         { bg:"#F1EFE8", color:"#555" },
};

const STAFF = ["Andrew Morgan","Michael Barlow","Joanne Fenech","Krista Fenech","Alexandra Gardner","Debbie Gooding","Natalie Johnson","Neil Kelly","Elena Pace","Shanya Pickett","Mattei Pisani","Colin Quayle","Kate Shaw","Roxy Sheeley","Gilbert Spiteri Spadaro","Gary Harrison"];

const INITIAL_TASKS = [
  { id:1,  title:"Harrington Trust — CPR overdue",               category:"Compliance",        entity:"Harrington Family Trust",   assignee:"Roxy Sheeley",   createdBy:"Gary Harrison",  due:"14/07/2025", status:"Open",        notes:"High risk client. Review now overdue by 3 months." },
  { id:2,  title:"Apex Growth Fund — sanctions MLRO review",      category:"Compliance",        entity:"Apex Growth Fund Ltd",       assignee:"Gary Harrison",   createdBy:"Andy Morgan",    due:"14/07/2025", status:"Open",        notes:"Worldcheck match requires MLRO sign-off." },
  { id:3,  title:"Emma Harrington — KYC passport expired",        category:"Compliance",        entity:"Harrington Family Trust",   assignee:"Roxy Sheeley",   createdBy:"Gary Harrison",  due:"Overdue",     status:"Open",        notes:"Passport expired April 2024. Renewal required." },
  { id:4,  title:"Q3 retainer invoices — approve batch",          category:"Accounts",          entity:"All entities",              assignee:"Neil Kelly",      createdBy:"Neil Kelly",     due:"15/07/2025", status:"Open",        notes:"7 invoices awaiting approval before issue." },
  { id:5,  title:"Sarah Cole — missing timesheet W/C 7 July",     category:"Internal Accounts", entity:"—",                         assignee:"Roxy Sheeley",   createdBy:"Roxy Sheeley",   due:"14/07/2025", status:"Open",        notes:"Reminder sent. No response." },
  { id:6,  title:"North Star — sign off attrition form",          category:"Admin",             entity:"North Star Holdings Ltd",   assignee:"Andy Morgan",    createdBy:"Roxy Sheeley",   due:"15/07/2025", status:"Open",        notes:"Awaiting CFO sign-off per procedure." },
  { id:7,  title:"Pacific Wealth Trust — EDD outstanding",        category:"Compliance",        entity:"Pacific Wealth Trust",      assignee:"Garry Crossan",  createdBy:"Gary Harrison",  due:"18/07/2025", status:"Open",        notes:"EDD pack requested. Wei Chen yet to respond." },
  { id:8,  title:"Stonebridge — director appointment resolution",  category:"Statutory",         entity:"Stonebridge Capital Ltd",   assignee:"Joanne Fenech",  createdBy:"Joanne Fenech",  due:"18/07/2025", status:"Open",        notes:"Board resolution required before Form D filing." },
  { id:9,  title:"Maria Borg — missing timesheet",                category:"Internal Accounts", entity:"—",                         assignee:"Joanne Fenech",  createdBy:"Joanne Fenech",  due:"14/07/2025", status:"Open",        notes:"First week. Reminder sent." },
  { id:10, title:"Meridian Holdings — annual return prep",         category:"Statutory",         entity:"Meridian Holdings Ltd",     assignee:"Roxy Sheeley",   createdBy:"Andy Morgan",    due:"12/09/2025", status:"Open",        notes:"Due September. Start preparation now." },
  { id:11, title:"Garry Crossan — enforce MFA on system",         category:"Admin",             entity:"—",                         assignee:"Andy Morgan",    createdBy:"Andy Morgan",    due:"14/07/2025", status:"Open",        notes:"Security requirement for all directors." },
  { id:12, title:"Azure Mediterranean — Q2 management accounts",  category:"Accounts",          entity:"Azure Mediterranean Fdn",   assignee:"Joanne Fenech",  createdBy:"Neil Kelly",     due:"30/09/2025", status:"Open",        notes:"Target sign-off by end of September." },
  { id:13, title:"Caledonian Ventures — substance filing",         category:"Statutory",         entity:"Caledonian Ventures Ltd",   assignee:"Garry Crossan",  createdBy:"Gary Harrison",  due:"30/11/2025", status:"Completed",   notes:"ESR due November. Filed." },
  { id:14, title:"Phoenix eGaming — OGRA application stage 2",    category:"New Business",      entity:"Phoenix eGaming Ltd",       assignee:"Roxy Sheeley",   createdBy:"Andy Morgan",    due:"01/09/2025", status:"Open",        notes:"Technical standards cert awaited from client." },
];

const statusC = {
  "Open":      { bg:"#E6F7FB", color:"#0077A8" },
  "Completed": { bg:"#EAF3DE", color:"#27500A" },
  "Overdue":   { bg:"#FCEBEB", color:"#A32D2D" },
};

// Per review: anyone can add/assign, only system manager can delete
const CURRENT_USER = { name:"Andrew Morgan", role:"Super Admin", isSystemManager:true };

export default function AffinityTasks({ userId, onNav }) {
  const [tasks, setTasks]           = useState(INITIAL_TASKS);
  const [catF, setCatF]             = useState("");
  const [assigneeF, setAssigneeF]   = useState("");
  const [statusF, setStatusF]       = useState("Open");
  const [srch, setSrch]             = useState("");
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState({});
  const [sel, setSel]               = useState(null);

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };

  const filtered = useMemo(()=>tasks.filter(t=>
    (!catF || t.category===catF) &&
    (!assigneeF || t.assignee===assigneeF) &&
    (!statusF || t.status===statusF) &&
    (!srch || t.title.toLowerCase().includes(srch.toLowerCase()) || t.entity.toLowerCase().includes(srch.toLowerCase()))
  ), [tasks, catF, assigneeF, statusF, srch]);

  const selTask = tasks.find(t=>t.id===sel);

  const addTask = () => {
    if (!form.title) return;
    setTasks(prev=>[...prev, {
      ...form,
      id: Date.now(),
      status:"Open",
      createdBy: CURRENT_USER.name,
    }]);
    setModal(null);
    setForm({});
  };

  const completeTask = (id) => setTasks(prev=>prev.map(t=>t.id===id?{...t,status:"Completed"}:t));

  const deleteTask = (id) => {
    if (!CURRENT_USER.isSystemManager) return;
    setTasks(prev=>prev.filter(t=>t.id!==id));
    if (sel===id) setSel(null);
  };

  const Input = ({ label, value, onChange, type="text", options, placeholder="" }) => (
    <div style={{ marginBottom:12 }}>
      <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#555", marginBottom:4 }}>{label}</label>
      {options
        ? <select value={value} onChange={e=>onChange(e.target.value)} style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none", fontFamily:"inherit" }}>
            {options.map(o=><option key={o}>{o}</option>)}
          </select>
        : <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
            style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e0e0e0", borderRadius:6, fontSize:12, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
      }
    </div>
  );

  const openCount = tasks.filter(t=>t.status==="Open").length;

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"#f8f9fc", color:"#111", minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ background:NAVY, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          
          <span style={{ color:"#8892b0", fontSize:13 }}>Tasks</span>
        </div>
        <button style={{ ...nba, background:"#4CAF7D", borderColor:"#4CAF7D" }} onClick={()=>{ setForm({ category:"Compliance", assignee:"Andy Morgan", status:"Open" }); setModal("add"); }}>
          ＋ Add task
        </button>
      </div>

      {/* Summary bar */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid #e5e5e5", padding:"10px 24px", display:"flex", gap:20, alignItems:"center" }}>
        <div style={{ display:"flex", gap:16 }}>
          {[
            { l:"Open",         v:tasks.filter(t=>t.status==="Open").length,      c:CY },
            { l:"Overdue",      v:tasks.filter(t=>t.due==="Overdue").length,       c:"#EF4444" },
            { l:"Completed",    v:tasks.filter(t=>t.status==="Completed").length,  c:"#4CAF7D" },
            { l:"My tasks",     v:tasks.filter(t=>t.assignee===CURRENT_USER.name&&t.status==="Open").length, c:"#F59E0B" },
          ].map(k=>(
            <div key={k.l} style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:700, color:k.c }}>{k.v}</div>
              <div style={{ fontSize:10, color:"#aaa" }}>{k.l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:6, flexWrap:"wrap" }}>
          <input placeholder="Search tasks or entities…" value={srch} onChange={e=>setSrch(e.target.value)}
            style={{ height:28, padding:"0 10px", border:"0.5px solid #e5e5e5", borderRadius:5, fontSize:11, outline:"none", minWidth:180 }} />
          <select value={catF} onChange={e=>setCatF(e.target.value)} style={{ height:28, padding:"0 8px", border:"0.5px solid #e5e5e5", borderRadius:5, fontSize:11 }}>
            <option value="">All categories</option>
            {CATEGORIES.map(c=><option key={c}>{c}</option>)}
          </select>
          <select value={assigneeF} onChange={e=>setAssigneeF(e.target.value)} style={{ height:28, padding:"0 8px", border:"0.5px solid #e5e5e5", borderRadius:5, fontSize:11 }}>
            <option value="">All staff</option>
            {STAFF.map(s=><option key={s}>{s}</option>)}
          </select>
          <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={{ height:28, padding:"0 8px", border:"0.5px solid #e5e5e5", borderRadius:5, fontSize:11 }}>
            <option value="">All statuses</option>
            <option>Open</option><option>Completed</option>
          </select>
        </div>
      </div>

      {/* Task list + detail */}
      <div style={{ display:"flex", height:"calc(100vh - 130px)" }}>

        {/* List */}
        <div style={{ flex:1, overflowY:"auto", padding:"0" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"#f9f9f9", position:"sticky", top:0, zIndex:1 }}>
                {["Task","Category","Entity","Assignee","Due","Status","Actions"].map(h=>(
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:10, fontWeight:600, color:"#666", textTransform:"uppercase", letterSpacing:"0.4px", borderBottom:"0.5px solid #e5e5e5", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t=>(
                <tr key={t.id}
                  onClick={()=>setSel(sel===t.id?null:t.id)}
                  style={{ borderBottom:"0.5px solid #f0f0f0", background:sel===t.id?"#f0f8fb":t.status==="Completed"?"#fafafa":"#fff", cursor:"pointer", opacity:t.status==="Completed"?0.65:1 }}>
                  <td style={{ padding:"10px 14px", fontSize:12, fontWeight:500, maxWidth:280, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {t.status==="Completed"&&<span style={{ marginRight:6, color:"#4CAF7D" }}>✓</span>}
                    {t.title}
                  </td>
                  <td style={{ padding:"10px 14px" }}><Badge label={t.category} colors={catColors[t.category]||{bg:"#eee",color:"#666"}} /></td>
                  <td style={{ padding:"10px 14px", fontSize:11, color:"#666", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.entity}</td>
                  <td style={{ padding:"10px 14px", fontSize:11, color:"#666" }}>{t.assignee.split(" ")[0]}</td>
                  <td style={{ padding:"10px 14px", fontSize:11, color:t.due==="Overdue"?"#EF4444":"#666", fontWeight:t.due==="Overdue"?600:400 }}>{t.due}</td>
                  <td style={{ padding:"10px 14px" }}><Badge label={t.status} colors={statusC[t.status]||{bg:"#eee",color:"#666"}} /></td>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", gap:4 }} onClick={e=>e.stopPropagation()}>
                      {t.status==="Open"&&<button style={{ ...nba, fontSize:10, padding:"3px 8px" }} onClick={()=>completeTask(t.id)}>Complete ✓</button>}
                      {/* Per review: only system manager can delete */}
                      {CURRENT_USER.isSystemManager && <button style={{ ...nb, fontSize:10, padding:"3px 8px", borderColor:"#EF4444", color:"#EF4444" }} onClick={()=>deleteTask(t.id)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={7} style={{ padding:24, textAlign:"center", color:"#aaa", fontSize:13 }}>No tasks match your filters</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selTask&&(
          <div style={{ width:320, borderLeft:"0.5px solid #e5e5e5", background:"#fff", overflowY:"auto", padding:20, flexShrink:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:600, lineHeight:1.4, flex:1, marginRight:8 }}>{selTask.title}</div>
              <button onClick={()=>setSel(null)} style={{ background:"none", border:"none", fontSize:16, cursor:"pointer", color:"#aaa", flexShrink:0 }}>×</button>
            </div>
            <Badge label={selTask.category} colors={catColors[selTask.category]||{bg:"#eee",color:"#666"}} />
            <div style={{ marginTop:14 }}>
              {[["Entity",selTask.entity],["Assignee",selTask.assignee],["Created by",selTask.createdBy],["Due date",selTask.due],["Status",selTask.status]].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:12 }}>
                  <span style={{ color:"#666" }}>{k}</span><span style={{ fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </div>
            {selTask.notes&&(
              <div style={{ marginTop:14, background:"#f9f9f9", borderRadius:6, padding:"8px 10px", fontSize:11, color:"#444", lineHeight:1.5 }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#aaa", marginBottom:4 }}>NOTES</div>
                {selTask.notes}
              </div>
            )}
            {selTask.status==="Open"&&(
              <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:6 }}>
                <button style={nba} onClick={()=>completeTask(selTask.id)}>Mark as complete ✓</button>
                {CURRENT_USER.isSystemManager&&<button style={{ ...nb, borderColor:"#EF4444", color:"#EF4444" }} onClick={()=>deleteTask(selTask.id)}>Delete task</button>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add task modal */}
      {modal==="add"&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"#fff",borderRadius:12,padding:24,width:500,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
              <h3 style={{ margin:0,fontSize:16,fontWeight:600 }}>Add task</h3>
              <button onClick={()=>setModal(null)} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888" }}>×</button>
            </div>
            <Input label="Task title" value={form.title||""} onChange={v=>setForm(p=>({...p,title:v}))} placeholder="Describe the task clearly" />
            <Input label="Category" value={form.category||"Compliance"} onChange={v=>setForm(p=>({...p,category:v}))} options={CATEGORIES} />
            <Input label="Entity" value={form.entity||""} onChange={v=>setForm(p=>({...p,entity:v}))} placeholder="Entity name or — if internal" />
            <Input label="Assign to" value={form.assignee||CURRENT_USER.name} onChange={v=>setForm(p=>({...p,assignee:v}))} options={STAFF} />
            <Input label="Due date" value={form.due||""} onChange={v=>setForm(p=>({...p,due:v}))} placeholder="DD/MM/YYYY" />
            <Input label="Notes" value={form.notes||""} onChange={v=>setForm(p=>({...p,notes:v}))} placeholder="Optional additional context" />
            <button onClick={addTask} style={{ width:"100%", background:CY, color:"#fff", border:"none", borderRadius:8, padding:10, fontSize:14, fontWeight:600, cursor:"pointer" }}>
              Add task
            </button>
            <div style={{ marginTop:8, fontSize:10, color:"#aaa", textAlign:"center" }}>
              Created by {CURRENT_USER.name} · Only system managers can delete tasks
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
