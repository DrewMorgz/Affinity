import { useState, useEffect, useMemo } from "react";
import { notificationsList, isConfigured } from "./affinity_ops_api";

const CY   = "#00C4CC";
const NAVY = "#001242";

// Sample notifications — in production these come from backend events
export const NOTIFICATIONS_DATA = [
  {id:1,  t:"2026-06-05T14:18:00Z", type:"task",       title:"Roxy assigned you a task",          body:"Renew Apex Growth Fund licence — due 25 Jun",     who:"Roxy Sheeley",      mod:"tasks"},
  {id:2,  t:"2026-06-05T13:42:00Z", type:"approval",   title:"Document awaiting your approval",   body:"Engagement Letter — Adriatic Holdings",           who:"Joanne Fenech",     mod:"documents"},
  {id:3,  t:"2026-06-05T12:50:00Z", type:"mention",    title:"Colin @mentioned you",              body:"On a note: 'Need your sign-off on capital reorg'",who:"Colin Quayle",      mod:"entities"},
  {id:4,  t:"2026-06-05T11:30:00Z", type:"compliance", title:"KYC review due in 7 days",          body:"Pacific Wealth Trust · Cayman · High risk",       who:"System",            mod:"compliance"},
  {id:5,  t:"2026-06-05T10:55:00Z", type:"document",   title:"Roxy uploaded a document",          body:"AGM Minutes — Meridian Holdings (4.2 MB)",        who:"Roxy Sheeley",      mod:"documents"},
  {id:6,  t:"2026-06-05T09:48:00Z", type:"sign",       title:"Document signed via Zoho Sign",     body:"Board Resolution — Apex Growth Fund",             who:"David Silver",      mod:"documents"},
  {id:7,  t:"2026-06-05T08:30:00Z", type:"onboarding", title:"KYC pack received",                 body:"Verona Digital Holdings — ready for review",      who:"Krista Fenech",     mod:"onboarding"},
  {id:8,  t:"2026-06-04T17:30:00Z", type:"filing",     title:"Annual return due in 14 days",      body:"Stonebridge Capital Ltd · IOM Companies Reg",     who:"System",            mod:"compliance"},
  {id:9,  t:"2026-06-04T16:15:00Z", type:"invoice",    title:"Invoice paid",                      body:"INV-2026-0820 · Stonebridge Capital · £12,500",   who:"System",            mod:"invoicing"},
  {id:10, t:"2026-06-04T14:30:00Z", type:"birthday",   title:"It's Colin Quayle's birthday today!",body:"Drop him a line 🎂",                              who:"System",            mod:"intranet"},
  {id:11, t:"2026-06-04T11:18:00Z", type:"task",       title:"Task overdue",                      body:"Renew Pacific Wealth licence — was due yesterday",who:"System",            mod:"tasks"},
  {id:12, t:"2026-06-04T09:22:00Z", type:"system",     title:"Login from new device",             body:"Safari on iPad · Isle of Man IP · Verify if not you",who:"System",         mod:"system"},
  {id:13, t:"2026-06-03T16:42:00Z", type:"mention",    title:"Gary @mentioned you",               body:"On Apex Growth: 'Annual review trigger fired'",   who:"Colette Grisdale",     mod:"compliance"},
  {id:14, t:"2026-06-03T14:30:00Z", type:"sign",       title:"Document signed via Zoho Sign",     body:"Engagement Letter — Bluewater Family Trust",      who:"Lisa Reston",       mod:"documents"},
  {id:15, t:"2026-06-03T11:42:00Z", type:"compliance", title:"Sanctions screening cleared",       body:"All shareholders of Apex Growth Fund — WorldCheck",who:"Michael Barlow",   mod:"compliance"},
  {id:16, t:"2026-06-02T15:18:00Z", type:"approval",   title:"Bank account ready to add",         body:"Pacific Wealth Trust · Butterfield Bank",         who:"Colette Grisdale",     mod:"entities"},
];

const TYPE_STYLE = {
  task:       {icon:"✓",  bg:"#FDF4DC", color:"#7B4F1D", label:"Task"},
  approval:   {icon:"⚙",  bg:"#FAEEDA", color:"#633806", label:"Approval"},
  mention:    {icon:"@",  bg:"#EEF0FB", color:"#3C3489", label:"Mention"},
  compliance: {icon:"⚠",  bg:"#FCEBEB", color:"#A32D2D", label:"Compliance"},
  document:   {icon:"📄", bg:"#E6F7FB", color:"#0077A8", label:"Document"},
  sign:       {icon:"✍",  bg:"#EAF3DE", color:"#27500A", label:"Signed"},
  onboarding: {icon:"➜",  bg:"#EAF3DE", color:"#27500A", label:"Onboarding"},
  filing:     {icon:"📅", bg:"#FAEEDA", color:"#633806", label:"Filing"},
  invoice:    {icon:"💷", bg:"#EAF3DE", color:"#27500A", label:"Invoice"},
  birthday:   {icon:"🎂", bg:"#FCEBEB", color:"#BF5C7A", label:"Birthday"},
  system:     {icon:"🔒", bg:"#F1EFE8", color:"#666",    label:"System"},
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return min + "m";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "h";
  const days = Math.floor(hr / 24);
  if (days < 7) return days + "d";
  return new Date(iso).toLocaleDateString("en-GB", {day:"numeric",month:"short"});
}

// ──────────────────────────────────────────────────────────
// DROPDOWN PANEL — opens from topbar bell icon
// ──────────────────────────────────────────────────────────
export function NotificationsPanel(props) {
  const onNavigate = props && props.onNavigate;
  const onClose = props && props.onClose;
  const readIds = (props && props.readIds) || {};
  const setReadIds = (props && props.setReadIds) || function() {};
  const [tab, setTab] = useState("all");
  const [liveN,setLiveN]=useState(null);
  useEffect(function(){ if(!isConfigured) return; var ok=true; notificationsList().then(function(r){ if(ok&&r.data&&r.data.length) setLiveN(r.data); }).catch(function(){}); return function(){ok=false;}; },[]);
  var notifs = liveN || NOTIFICATIONS_DATA;

  const items = useMemo(function() {
    var list = notifs;
    if (tab === "unread")   list = list.filter(function(n){ return !readIds[n.id]; });
    if (tab === "mentions") list = list.filter(function(n){ return n.type === "mention"; });
    return list.slice(0, 12);
  }, [tab, readIds]);

  function markAllRead() {
    var all = {};
    notifs.forEach(function(n){ all[n.id] = true; });
    setReadIds(all);
  }

  function clickNotif(n) {
    var next = Object.assign({}, readIds);
    next[n.id] = true;
    setReadIds(next);
    if (onNavigate) onNavigate(n.mod);
    if (onClose) onClose();
  }

  return (
    <div style={{position:"absolute",top:42,right:0,width:360,maxWidth:"95vw",maxHeight:"75vh",background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:10,boxShadow:"0 12px 32px rgba(0,0,0,0.12)",zIndex:300,display:"flex",flexDirection:"column",overflow:"hidden"}}
      onClick={function(e){ e.stopPropagation(); }}>

      <div style={{padding:"10px 14px",borderBottom:"0.5px solid #e5e5e5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:13,fontWeight:700,color:NAVY}}>Notifications</div>
        <button onClick={markAllRead} style={{background:"none",border:"none",fontSize:10,color:CY,cursor:"pointer",fontWeight:600}}>Mark all read</button>
      </div>

      <div style={{display:"flex",gap:4,padding:"8px 10px",borderBottom:"0.5px solid #f0f0f0"}}>
        {[{id:"all",label:"All"},{id:"unread",label:"Unread"},{id:"mentions",label:"Mentions"}].map(function(t){
          return (
            <button key={t.id} onClick={function(){ setTab(t.id); }}
              style={{padding:"4px 10px",fontSize:11,border:"none",borderRadius:14,background:tab===t.id?CY:"#f5f5f5",color:tab===t.id?"#fff":"#666",cursor:"pointer",fontWeight:tab===t.id?600:500}}>
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{flex:1,overflowY:"auto"}}>
        {items.length === 0 ? (
          <div style={{padding:"30px 20px",textAlign:"center",color:"#aaa",fontSize:11}}>
            {tab === "unread" ? "All caught up ✓" : "Nothing yet."}
          </div>
        ) : items.map(function(n){
          var st = TYPE_STYLE[n.type] || TYPE_STYLE.system;
          var unread = !readIds[n.id];
          return (
            <div key={n.id} onClick={function(){ clickNotif(n); }}
              style={{padding:"10px 14px",borderBottom:"0.5px solid #f5f5f5",cursor:"pointer",display:"flex",gap:10,background:unread?"#f9fcfd":"transparent"}}
              onMouseEnter={function(e){ e.currentTarget.style.background = "#f0f9fa"; }}
              onMouseLeave={function(e){ e.currentTarget.style.background = unread ? "#f9fcfd" : "transparent"; }}>
              <div style={{width:32,height:32,borderRadius:8,background:st.bg,color:st.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0,fontWeight:700}}>{st.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:unread?600:500,color:"#222",lineHeight:1.35}}>{n.title}</div>
                <div style={{fontSize:11,color:"#666",marginTop:2,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{n.body}</div>
                <div style={{fontSize:9,color:"#aaa",marginTop:4}}>{timeAgo(n.t)} ago · {n.who}</div>
              </div>
              {unread && <div style={{width:8,height:8,borderRadius:"50%",background:CY,flexShrink:0,marginTop:6}}/>}
            </div>
          );
        })}
      </div>

      <div style={{padding:"8px 14px",borderTop:"0.5px solid #e5e5e5",background:"#fafbfc"}}>
        <button onClick={function(){ if (onNavigate) onNavigate("notifications"); if (onClose) onClose(); }}
          style={{width:"100%",padding:"6px",background:"none",border:"0.5px solid #e0e0e0",borderRadius:6,fontSize:11,color:NAVY,cursor:"pointer",fontWeight:600}}>
          See all notifications →
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// FULL PAGE — for sidebar navigation
// ──────────────────────────────────────────────────────────
export default function AffinityNotifications(props) {
  const onNav = props && props.onNav;
  const [readIds, setReadIds] = useState({});
  const [tab, setTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState("All");
  const [liveN2,setLiveN2]=useState(null);
  useEffect(function(){ if(!isConfigured) return; var ok=true; notificationsList().then(function(r){ if(ok&&r.data&&r.data.length) setLiveN2(r.data); }).catch(function(){}); return function(){ok=false;}; },[]);
  var notifs2 = liveN2 || NOTIFICATIONS_DATA;

  useEffect(function() {
    try {
      var raw = localStorage.getItem("affinity-core-notifications-read");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setReadIds(parsed);
      }
    } catch (e) {}
  }, []);

  useEffect(function() {
    try { localStorage.setItem("affinity-core-notifications-read", JSON.stringify(readIds)); } catch (e) {}
  }, [readIds]);

  const filtered = useMemo(function() {
    var list = notifs2;
    if (tab === "unread") list = list.filter(function(n){ return !readIds[n.id]; });
    if (typeFilter !== "All") list = list.filter(function(n){ return n.type === typeFilter; });
    return list;
  }, [tab, typeFilter, readIds, notifs2]);

  const unreadCount = notifs2.filter(function(n){ return !readIds[n.id]; }).length;

  function markAllRead() {
    var all = {};
    notifs2.forEach(function(n){ all[n.id] = true; });
    setReadIds(all);
  }
  function markAllUnread() { setReadIds({}); }

  function clickNotif(n) {
    var next = Object.assign({}, readIds);
    next[n.id] = true;
    setReadIds(next);
    if (onNav) onNav(n.mod);
  }

  var card = {background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:10};

  return (
    <div style={{padding:"20px 24px 80px",maxWidth:900,margin:"0 auto",fontFamily:"'Catamaran',system-ui,sans-serif"}}>
      <div style={{marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:700,color:NAVY}}>Notifications</h1>
          <p style={{fontSize:12,color:"#666",margin:"4px 0 0"}}>{unreadCount > 0 ? unreadCount + " unread" : "All caught up"}</p>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={markAllRead} style={{padding:"7px 12px",background:"#fff",border:"0.5px solid #ddd",borderRadius:6,fontSize:11,color:"#666",cursor:"pointer",fontWeight:500}}>Mark all read</button>
          <button onClick={markAllUnread} style={{padding:"7px 12px",background:"#fff",border:"0.5px solid #ddd",borderRadius:6,fontSize:11,color:"#666",cursor:"pointer",fontWeight:500}}>Reset</button>
        </div>
      </div>

      <div style={Object.assign({},card,{padding:"10px 14px",marginBottom:14,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"})}>
        {["all","unread"].map(function(t){
          return (
            <button key={t} onClick={function(){ setTab(t); }}
              style={{padding:"5px 12px",fontSize:11,border:"none",borderRadius:14,background:tab===t?CY:"#f5f5f5",color:tab===t?"#fff":"#666",cursor:"pointer",fontWeight:tab===t?600:500}}>
              {t === "all" ? "All" : "Unread"}
            </button>
          );
        })}
        <div style={{width:1,height:18,background:"#e5e5e5",margin:"0 4px"}}/>
        <select value={typeFilter} onChange={function(e){ setTypeFilter(e.target.value); }} style={{padding:"5px 10px",border:"0.5px solid #ddd",borderRadius:6,fontSize:11,background:"#fff",color:"#333",cursor:"pointer"}}>
          <option value="All">All types</option>
          {Object.keys(TYPE_STYLE).map(function(t){ return <option key={t} value={t}>{TYPE_STYLE[t].label}</option>; })}
        </select>
      </div>

      <div style={card}>
        {filtered.length === 0 ? (
          <div style={{padding:"50px 20px",textAlign:"center",color:"#aaa",fontSize:12}}>
            {tab === "unread" ? "All caught up ✓ — no unread notifications." : "Nothing matches."}
          </div>
        ) : filtered.map(function(n, i){
          var st = TYPE_STYLE[n.type] || TYPE_STYLE.system;
          var unread = !readIds[n.id];
          return (
            <div key={n.id} onClick={function(){ clickNotif(n); }}
              style={{padding:"12px 16px",borderBottom:i<filtered.length-1?"0.5px solid #f5f5f5":"none",cursor:"pointer",display:"flex",gap:12,background:unread?"#f9fcfd":"transparent"}}
              onMouseEnter={function(e){ e.currentTarget.style.background = "#f0f9fa"; }}
              onMouseLeave={function(e){ e.currentTarget.style.background = unread ? "#f9fcfd" : "transparent"; }}>
              <div style={{width:36,height:36,borderRadius:8,background:st.bg,color:st.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,fontWeight:700}}>{st.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
                  <div style={{fontSize:13,fontWeight:unread?600:500,color:"#222",lineHeight:1.4}}>{n.title}</div>
                  <span style={{padding:"2px 7px",borderRadius:10,fontSize:9,fontWeight:600,background:st.bg,color:st.color,whiteSpace:"nowrap"}}>{st.label}</span>
                </div>
                <div style={{fontSize:12,color:"#666",marginTop:3,lineHeight:1.5}}>{n.body}</div>
                <div style={{fontSize:10,color:"#aaa",marginTop:6}}>{timeAgo(n.t)} ago · {n.who} · {n.mod}</div>
              </div>
              {unread && <div style={{width:8,height:8,borderRadius:"50%",background:CY,flexShrink:0,marginTop:8}}/>}
            </div>
          );
        })}
      </div>

      <div style={{marginTop:14,padding:"10px 14px",background:"#fafbfc",border:"0.5px solid #e5e5e5",borderRadius:8,fontSize:10,color:"#888",lineHeight:1.6}}>
        ℹ <strong>Beta note:</strong> sample notifications. In production these are triggered automatically by events across Affinity Core (task assignments, document approvals, @mentions, KYC due dates, signed documents via Zoho, etc.) and persist across devices. Read state currently stored locally.
      </div>
    </div>
  );
}
