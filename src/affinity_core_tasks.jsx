import { useState, useMemo, useEffect } from "react";
import { isConfigured } from "./affinity_accounting_supabase";
import { tasksList } from "./affinity_tasks_api";
import { notificationsList } from "./affinity_ops_api";
import { NOTIFICATIONS_DATA, TYPE_STYLE, timeAgo } from "./affinity_core_notifications";
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

const STAFF = ["Andrew Morgan","Michael Barlow","Joanne Fenech","Krista Fenech","Alexandra Gardner","Debbie Gooding","Natalie Johnson","Neil Kelly","Elena Pace","Shanya Pickett","Mattei Pisani","Colin Quayle","Kate Shaw","Roxy Sheeley","Gilbert Spiteri Spadaro","Colette Grisdale"];

const INITIAL_TASKS = [
  { id:1,  title:"Harrington Trust — CPR overdue",               category:"Compliance",        entity:"Harrington Family Trust",   assignee:"Roxy Sheeley",   createdBy:"Colette Grisdale",  due:"14/07/2025", status:"Open",        notes:"High risk client. Review now overdue by 3 months." },
  { id:2,  title:"Apex Growth Fund — sanctions MLRO review",      category:"Compliance",        entity:"Apex Growth Fund Ltd",       assignee:"Colette Grisdale",   createdBy:"Andy Morgan",    due:"14/07/2025", status:"Open",        notes:"Worldcheck match requires MLRO sign-off." },
  { id:3,  title:"Emma Harrington — KYC passport expired",        category:"Compliance",        entity:"Harrington Family Trust",   assignee:"Roxy Sheeley",   createdBy:"Colette Grisdale",  due:"Overdue",     status:"Open",        notes:"Passport expired April 2024. Renewal required." },
  { id:4,  title:"Q3 retainer invoices — approve batch",          category:"Accounts",          entity:"All entities",              assignee:"Neil Kelly",      createdBy:"Neil Kelly",     due:"15/07/2025", status:"Open",        notes:"7 invoices awaiting approval before issue." },
  { id:5,  title:"Sarah Cole — missing timesheet W/C 7 July",     category:"Internal Accounts", entity:"—",                         assignee:"Roxy Sheeley",   createdBy:"Roxy Sheeley",   due:"14/07/2025", status:"Open",        notes:"Reminder sent. No response." },
  { id:6,  title:"North Star — sign off attrition form",          category:"Admin",             entity:"North Star Holdings Ltd",   assignee:"Andy Morgan",    createdBy:"Roxy Sheeley",   due:"15/07/2025", status:"Open",        notes:"Awaiting CFO sign-off per procedure." },
  { id:7,  title:"Pacific Wealth Trust — EDD outstanding",        category:"Compliance",        entity:"Pacific Wealth Trust",      assignee:"Garry Crossan",  createdBy:"Colette Grisdale",  due:"18/07/2025", status:"Open",        notes:"EDD pack requested. Wei Chen yet to respond." },
  { id:8,  title:"Stonebridge — director appointment resolution",  category:"Statutory",         entity:"Stonebridge Capital Ltd",   assignee:"Joanne Fenech",  createdBy:"Joanne Fenech",  due:"18/07/2025", status:"Open",        notes:"Board resolution required before Form D filing." },
  { id:9,  title:"Maria Borg — missing timesheet",                category:"Internal Accounts", entity:"—",                         assignee:"Joanne Fenech",  createdBy:"Joanne Fenech",  due:"14/07/2025", status:"Open",        notes:"First week. Reminder sent." },
  { id:10, title:"Meridian Holdings — annual return prep",         category:"Statutory",         entity:"Meridian Holdings Ltd",     assignee:"Roxy Sheeley",   createdBy:"Andy Morgan",    due:"12/09/2025", status:"Open",        notes:"Due September. Start preparation now." },
  { id:11, title:"Garry Crossan — enforce MFA on system",         category:"Admin",             entity:"—",                         assignee:"Andy Morgan",    createdBy:"Andy Morgan",    due:"14/07/2025", status:"Open",        notes:"Security requirement for all directors." },
  { id:12, title:"Azure Mediterranean — Q2 management accounts",  category:"Accounts",          entity:"Azure Mediterranean Fdn",   assignee:"Joanne Fenech",  createdBy:"Neil Kelly",     due:"30/09/2025", status:"Open",        notes:"Target sign-off by end of September." },
  { id:13, title:"Caledonian Ventures — substance filing",         category:"Statutory",         entity:"Caledonian Ventures Ltd",   assignee:"Garry Crossan",  createdBy:"Colette Grisdale",  due:"30/11/2025", status:"Completed",   notes:"ESR due November. Filed." },
  { id:14, title:"Phoenix eGaming — GSC application stage 2",    category:"New Business",      entity:"Phoenix eGaming Ltd",       assignee:"Roxy Sheeley",   createdBy:"Andy Morgan",    due:"01/09/2025", status:"Open",        notes:"Technical standards cert awaited from client." },
];

const statusC = {
  "Open":      { bg:"#E6F7FB", color:"#0077A8" },
  "Completed": { bg:"#EAF3DE", color:"#27500A" },
  "Overdue":   { bg:"#FCEBEB", color:"#A32D2D" },
};

// Per review: anyone can add/assign, only system manager can delete
const CURRENT_USER = { name:"Andrew Morgan", role:"Super Admin", isSystemManager:true };

export default function AffinityTasks({ userId, onNav, initialView }) {
  const [tasks, setTasks]           = useState(INITIAL_TASKS);

  useEffect(()=>{
    if(!isConfigured) return;
    let ok=true;
    tasksList().then(({data})=>{
      if(ok && data && data.length){
        setTasks(data.map(t=>({ id:t.id, title:t.title, category:t.category, entity:t.entity,
          assignee:t.assignee, createdBy:t.created_by, due:t.due, status:t.status, notes:t.notes })));
      }
    }).catch(()=>{});
    return ()=>{ok=false;};
  },[]);
  const [catF, setCatF]             = useState("");
  const [assigneeF, setAssigneeF]   = useState("");
  const [statusF, setStatusF]       = useState("Open");
  const [srch, setSrch]             = useState("");
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState({});
  const [sel, setSel]               = useState(null);

  // ── Merged activity feed (was the standalone Notifications module) ──
  const [view, setView]             = useState(initialView==="activity"?"activity":"tasks");   // "tasks" | "activity"
  const [liveN, setLiveN]           = useState(null);
  const [readIds, setReadIds]       = useState({});
  const [feedTab, setFeedTab]       = useState("all");     // "all" | "unread"
  const [feedType, setFeedType]     = useState("All");

  useEffect(()=>{
    if(!isConfigured) return;
    let ok=true;
    notificationsList().then(r=>{ if(ok && r.data && r.data.length) setLiveN(r.data); }).catch(()=>{});
    return ()=>{ok=false;};
  },[]);

  // read state persists locally (same key as the old module, so nothing is "lost" in the merge)
  useEffect(()=>{
    try {
      const raw = localStorage.getItem("affinity-core-notifications-read");
      if(raw){ const p = JSON.parse(raw); if(p && typeof p==="object") setReadIds(p); }
    } catch(e){}
  },[]);
  useEffect(()=>{
    try { localStorage.setItem("affinity-core-notifications-read", JSON.stringify(readIds)); } catch(e){}
  },[readIds]);

  const notifs = liveN || NOTIFICATIONS_DATA;
  const unreadCount = notifs.filter(n=>!readIds[n.id]).length;
  const feed = useMemo(()=>{
    let list = notifs;
    if(feedTab==="unread") list = list.filter(n=>!readIds[n.id]);
    if(feedType!=="All")   list = list.filter(n=>n.type===feedType);
    return list;
  },[notifs, feedTab, feedType, readIds]);

  const markRead    = (id)=> setReadIds(p=>({...p,[id]:true}));
  const markAllRead = ()=> setReadIds(notifs.reduce((a,n)=>{a[n.id]=true;return a;},{}));

  // click an item: mark read, then either stay here (task-related) or jump to its module
  const clickNotif = (n)=>{
    markRead(n.id);
    if(n.mod==="tasks"||n.mod==="notifications"){ setView("tasks"); return; }
    if(onNav) onNav(n.mod);
  };

  // the point of the merge: turn any notification into a tracked task
  const notifToTask = (n)=>{
    markRead(n.id);
    const catMap = { compliance:"Compliance", filing:"Statutory", approval:"Admin", invoice:"Accounts",
                     onboarding:"New Business", document:"Admin", sign:"Admin", mention:"Admin",
                     system:"Admin", task:"Admin", birthday:"Admin" };
    setForm({
      title: n.title,
      category: catMap[n.type] || "Admin",
      entity: "—",
      assignee: CURRENT_USER.name,
      due: "",
      status: "Open",
      notes: n.body + "  ·  raised from activity: " + n.who + ", " + timeAgo(n.t) + " ago",
    });
    setView("tasks");
    setModal("add");
  };

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
          {/* Notifications live here now — one place for anything needing attention */}
          <div style={{ display:"flex", background:"rgba(255,255,255,0.08)", borderRadius:6, overflow:"hidden" }}>
            {[["tasks","Tasks",openCount],["activity","Activity",unreadCount]].map(([v,l,n])=>(
              <button key={v} onClick={()=>setView(v)}
                style={{ border:"none", cursor:"pointer", fontSize:11, padding:"5px 12px", fontWeight:view===v?600:400,
                         background:view===v?CY:"transparent", color:view===v?"#fff":"#8892b0", display:"flex", alignItems:"center", gap:5 }}>
                {l}
                {n>0 && <span style={{ background:view===v?"rgba(255,255,255,0.25)":"#EF4444", color:"#fff", borderRadius:9, fontSize:9, fontWeight:700, padding:"1px 5px", minWidth:14, textAlign:"center" }}>{n}</span>}
              </button>
            ))}
          </div>
        </div>
        {view==="tasks"
          ? <button style={{ ...nba, background:"#4CAF7D", borderColor:"#4CAF7D" }} onClick={()=>{ setForm({ category:"Compliance", assignee:"Andy Morgan", status:"Open" }); setModal("add"); }}>
              ＋ Add task
            </button>
          : <button style={{ ...nb, background:"transparent", color:"#8892b0", borderColor:"#33405e" }} onClick={markAllRead}>Mark all read</button>}
      </div>

      {/* Summary bar */}
      {view==="tasks"&&(
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

      )}

      {/* Task list + detail */}
      {view==="tasks"&&(
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
      )}

      {/* ── ACTIVITY VIEW — notifications feed, merged into Tasks ── */}
      {view==="activity"&&(
        <div style={{ padding:"14px 24px 60px", maxWidth:900, margin:"0 auto" }}>

          <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:"10px 14px", marginBottom:14, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            {[["all","All"],["unread","Unread"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFeedTab(v)}
                style={{ padding:"5px 12px", fontSize:11, border:"none", borderRadius:14, cursor:"pointer",
                         background:feedTab===v?CY:"#f5f5f5", color:feedTab===v?"#fff":"#666", fontWeight:feedTab===v?600:500 }}>{l}</button>
            ))}
            <div style={{ width:1, height:18, background:"#e5e5e5", margin:"0 4px" }}/>
            <select value={feedType} onChange={e=>setFeedType(e.target.value)}
              style={{ padding:"5px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:11, background:"#fff", color:"#333", cursor:"pointer" }}>
              <option value="All">All types</option>
              {Object.keys(TYPE_STYLE).map(t=><option key={t} value={t}>{TYPE_STYLE[t].label}</option>)}
            </select>
            <span style={{ marginLeft:"auto", fontSize:11, color:"#888" }}>{unreadCount>0?unreadCount+" unread":"All caught up ✓"}</span>
          </div>

          <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10 }}>
            {feed.length===0 ? (
              <div style={{ padding:"50px 20px", textAlign:"center", color:"#aaa", fontSize:12 }}>
                {feedTab==="unread" ? "All caught up ✓ — nothing unread." : "Nothing matches."}
              </div>
            ) : feed.map((n,i)=>{
              const st = TYPE_STYLE[n.type] || TYPE_STYLE.system;
              const unread = !readIds[n.id];
              return (
                <div key={n.id} onClick={()=>clickNotif(n)}
                  style={{ padding:"12px 16px", borderBottom:i<feed.length-1?"0.5px solid #f5f5f5":"none", cursor:"pointer",
                           display:"flex", gap:12, background:unread?"#f9fcfd":"transparent" }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:st.bg, color:st.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0, fontWeight:700 }}>{st.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, flexWrap:"wrap" }}>
                      <div style={{ fontSize:13, fontWeight:unread?600:500, color:"#222", lineHeight:1.4 }}>{n.title}</div>
                      <Badge label={st.label} colors={{ bg:st.bg, color:st.color }} />
                    </div>
                    <div style={{ fontSize:12, color:"#666", marginTop:3, lineHeight:1.5 }}>{n.body}</div>
                    <div style={{ fontSize:10, color:"#aaa", marginTop:6 }}>{timeAgo(n.t)} ago · {n.who} · {n.mod}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"flex-end" }} onClick={e=>e.stopPropagation()}>
                    <button style={{ ...nb, fontSize:10, padding:"3px 8px" }} onClick={()=>notifToTask(n)}>＋ Task</button>
                    {unread && <button style={{ ...nb, fontSize:10, padding:"3px 8px", border:"none", color:CY }} onClick={()=>markRead(n.id)}>Mark read</button>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop:14, padding:"10px 14px", background:"#fafbfc", border:"0.5px solid #e5e5e5", borderRadius:8, fontSize:10, color:"#888", lineHeight:1.6 }}>
            ℹ Notifications now live inside Tasks. Anything here that needs following up can be turned into a tracked task with <strong>＋ Task</strong>. In production these are raised automatically by events across Affinity Core (task assignments, approvals, @mentions, KYC and filing due dates, Zoho signatures). Read state is stored locally until the write layer lands.
          </div>
        </div>
      )}

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
