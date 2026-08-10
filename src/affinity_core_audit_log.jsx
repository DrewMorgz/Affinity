import { useState, useMemo, useEffect } from "react";
import { auditEvents, isConfigured } from "./affinity_ops_api";

const CY   = "#00C4CC";
const NAVY = "#001242";

// ─── Sample audit data ──────────────────────────────────────
// 80 realistic events spanning the last ~3 weeks. Mix of users, modules,
// actions and entities. In production this would come from the backend.
const LOG_DATA = [
  // — Today —
  {t:"2026-06-05T14:42:18Z", user:"Andrew Morgan",   userId:1,  action:"Logged in",          mod:"System",      target:"Affinity Core",                 details:"Login from Miami office IP",                ip:"104.28.241.18", severity:"info"},
  {t:"2026-06-05T14:31:02Z", user:"Roxy Sheeley",    userId:14, action:"Document uploaded",  mod:"Documents",   target:"AGM Minutes — Meridian Holdings",details:"4.2 MB · Correspondence / Statutory",       ip:"86.176.20.4",   severity:"info"},
  {t:"2026-06-05T13:55:44Z", user:"Colin Quayle",    userId:12, action:"Director added",     mod:"Entity Admin",target:"Stonebridge Capital Ltd",        details:"Appointed Andrew Thornbury as Director",     ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-05T13:18:09Z", user:"Colette Grisdale",   userId:16, action:"Risk rating changed",mod:"Entity Admin",target:"Apex Growth Fund Ltd",           details:"High → Very High (annual review)",           ip:"86.176.21.92",  severity:"warn"},
  {t:"2026-06-05T12:50:33Z", user:"Krista Fenech",   userId:4,  action:"KYC submitted",      mod:"Onboarding",  target:"Verona Digital Holdings Ltd",    details:"EDD pack uploaded, awaiting review",         ip:"194.158.32.7",  severity:"info"},
  {t:"2026-06-05T12:04:11Z", user:"Joanne Fenech",   userId:3,  action:"KYC approved",       mod:"Onboarding",  target:"Adriatic Holdings Ltd",          details:"All CDD requirements satisfied",             ip:"194.158.32.7",  severity:"info"},
  {t:"2026-06-05T11:38:21Z", user:"Andrew Morgan",   userId:1,  action:"User added",         mod:"System Admin",target:"Lucy Harrison",                  details:"Added as Client Admin · IOM",                ip:"104.28.241.18", severity:"warn"},
  {t:"2026-06-05T10:55:47Z", user:"Michael Barlow",  userId:2,  action:"Substance return filed",mod:"Compliance",target:"Caledonian Ventures Ltd",       details:"Q2 2026 submission · Cayman Islands TIA",    ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-05T10:12:08Z", user:"Natalie Johnson", userId:7,  action:"FATCA report generated",mod:"Compliance",target:"Bluewater Family Trust",         details:"Reportable accounts: 3 · USD 2.4M total",    ip:"104.28.241.18", severity:"info"},
  {t:"2026-06-05T09:48:30Z", user:"Roxy Sheeley",    userId:14, action:"Invoice sent",       mod:"Invoicing",   target:"Apex Growth Fund Ltd",           details:"INV-2026-0844 · £42,500 · Q2 admin fees",    ip:"86.176.20.4",   severity:"info"},
  {t:"2026-06-05T09:22:15Z", user:"Andrew Morgan",   userId:1,  action:"Logged in",          mod:"System",      target:"Affinity Core",                 details:"Login from Miami office IP",                ip:"104.28.241.18", severity:"info"},

  // — Yesterday —
  {t:"2026-06-04T17:55:42Z", user:"Colette Grisdale",   userId:16, action:"Bank account added", mod:"Entity Admin",target:"Pacific Wealth Trust",           details:"Butterfield Bank · Account 4427",            ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-04T16:30:18Z", user:"Elena Pace",      userId:9,  action:"Task completed",     mod:"Tasks",       target:"Renew Pacific Wealth licence",   details:"Marked done · 4 hours logged",               ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-04T16:01:55Z", user:"Colin Quayle",    userId:12, action:"Resolution drafted", mod:"Generate Doc",target:"Meridian Holdings Ltd",          details:"Capital reorganisation · awaiting signatures",ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-04T15:44:22Z", user:"Shanya Pickett",  userId:10, action:"Document approved",  mod:"Documents",   target:"Engagement Letter — Adriatic",   details:"Approved by Manager · ready to send",        ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-04T14:18:09Z", user:"Mattei Pisani",   userId:11, action:"Meeting logged",     mod:"Entity Admin",target:"Verona Digital Holdings Ltd",    details:"Board meeting · 3 directors present",        ip:"194.158.32.7",  severity:"info"},
  {t:"2026-06-04T13:33:44Z", user:"Alexandra Gardner",userId:5, action:"Role permissions updated",mod:"System Admin",target:"Mattei Pisani",              details:"Granted access to Malta Ventures module",    ip:"104.28.241.18", severity:"warn"},
  {t:"2026-06-04T12:50:31Z", user:"Kate Shaw",       userId:13, action:"Time entry logged",  mod:"Timesheets",  target:"Caledonian Ventures Ltd",        details:"2.5 hours · Annual return preparation",      ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-04T11:42:18Z", user:"Debbie Gooding",  userId:6,  action:"Document downloaded",mod:"Documents",   target:"Trust Deed — Harrington Family", details:"PDF · 2.8 MB · Statutory folder",            ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-04T10:55:07Z", user:"Andrew Morgan",   userId:1,  action:"Entity created",     mod:"Entity Admin",target:"Thornbury Asset Co Ltd",         details:"New UK company · Low risk · Set up complete",ip:"104.28.241.18", severity:"info"},
  {t:"2026-06-04T09:30:14Z", user:"Colette Grisdale",   userId:16, action:"Logged in",          mod:"System",      target:"Affinity Core",                 details:"Login from Isle of Man office IP",          ip:"86.176.21.92",  severity:"info"},

  // — 2 days ago —
  {t:"2026-06-03T17:12:55Z", user:"Roxy Sheeley",    userId:14, action:"CRM stage changed",  mod:"CRM",         target:"Silverstone Capital — David Silver",details:"Proposal Sent → Proposal Accepted",       ip:"86.176.20.4",   severity:"info"},
  {t:"2026-06-03T16:25:31Z", user:"Krista Fenech",   userId:4,  action:"Email filed",        mod:"Documents",   target:"Azure Mediterranean Foundation", details:"Email · Source of funds documentation",      ip:"194.158.32.7",  severity:"info"},
  {t:"2026-06-03T15:48:22Z", user:"Michael Barlow",  userId:2,  action:"Sanctions screening run",mod:"Compliance",target:"Apex Growth Fund Ltd",          details:"All shareholders cleared · WorldCheck",      ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-03T14:30:18Z", user:"Andrew Morgan",   userId:1,  action:"Settings updated",   mod:"System Admin",target:"Office filter defaults",         details:"Changed firm-wide office filter to All",     ip:"104.28.241.18", severity:"warn"},
  {t:"2026-06-03T13:55:44Z", user:"Natalie Johnson", userId:7,  action:"Failed login attempt",mod:"System",     target:"Andrew Morgan account",          details:"Wrong password · 3rd attempt · IP locked 5m",ip:"73.221.84.55",  severity:"alert"},
  {t:"2026-06-03T12:18:09Z", user:"Joanne Fenech",   userId:3,  action:"Charge registered",  mod:"Entity Admin",target:"Stonebridge Capital Ltd",        details:"HSBC Bank Malta · £2.4M facility",           ip:"194.158.32.7",  severity:"info"},
  {t:"2026-06-03T11:42:33Z", user:"Colin Quayle",    userId:12, action:"Annual return filed",mod:"Compliance",  target:"Meridian Holdings Ltd",          details:"Filed with IOM Companies Registry · ref AR1234",ip:"86.176.21.92",severity:"info"},
  {t:"2026-06-03T10:30:47Z", user:"Elena Pace",      userId:9,  action:"Beneficiary added",  mod:"Entity Admin",target:"Rosewood Legacy Trust",          details:"James Rosewood (son) added as beneficiary",  ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-03T09:55:08Z", user:"Gilbert Spiteri Spadaro",userId:15,action:"Compliance review",mod:"Compliance",target:"Adriatic Holdings Ltd",        details:"Periodic review · No findings",              ip:"194.158.32.7",  severity:"info"},

  // — 3 days ago —
  {t:"2026-06-02T16:42:18Z", user:"Andrew Morgan",   userId:1,  action:"User deactivated",   mod:"System Admin",target:"Former employee account",        details:"Access revoked · all sessions terminated",   ip:"104.28.241.18", severity:"warn"},
  {t:"2026-06-02T15:18:09Z", user:"Roxy Sheeley",    userId:14, action:"Bank account closed",mod:"Entity Admin",target:"North Star Holdings Ltd",        details:"NatWest IOM · Account closed by client",     ip:"86.176.20.4",   severity:"info"},
  {t:"2026-06-02T14:30:55Z", user:"Mattei Pisani",   userId:11, action:"Dividend declared",  mod:"Entity Admin",target:"Verona Digital Holdings Ltd",    details:"€500,000 interim dividend · ex-date 30 Jun", ip:"194.158.32.7",  severity:"info"},
  {t:"2026-06-02T13:55:31Z", user:"Neil Kelly",      userId:8,  action:"Budget revised",     mod:"Budgeting",   target:"FY26 firm-wide budget",          details:"Revenue forecast +8% · Q3 update",           ip:"104.28.241.18", severity:"info"},
  {t:"2026-06-02T12:12:18Z", user:"Shanya Pickett",  userId:10, action:"Task assigned",      mod:"Tasks",       target:"Renew Apex licence",             details:"Assigned to Michael Barlow · due 25 Jun",    ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-02T11:42:09Z", user:"Kate Shaw",       userId:13, action:"Time entry logged",  mod:"Timesheets",  target:"Pacific Wealth Trust",           details:"6 hours · KYC renewal documentation",        ip:"86.176.21.92",  severity:"info"},
  {t:"2026-06-02T10:55:44Z", user:"Andrew Morgan",   userId:1,  action:"Logged in",          mod:"System",      target:"Affinity Core",                 details:"Login from London office IP",                ip:"81.169.140.30", severity:"info"},

  // — 4-7 days ago —
  {t:"2026-06-01T16:18:33Z", user:"Alexandra Gardner",userId:5, action:"Permission elevated",mod:"System Admin",target:"Roxy Sheeley",                   details:"Added super-admin privileges (temporary)",   ip:"104.28.241.18", severity:"alert"},
  {t:"2026-06-01T14:30:55Z", user:"Roxy Sheeley",    userId:14, action:"Onboarding completed",mod:"Onboarding", target:"Apex Growth Fund Ltd",           details:"All steps complete · entity now active",     ip:"86.176.20.4",   severity:"info"},
  {t:"2026-06-01T11:42:09Z", user:"Joanne Fenech",   userId:3,  action:"Director removed",   mod:"Entity Admin",target:"Azure Mediterranean Foundation", details:"Maria Vella resigned · effective 31 May",    ip:"194.158.32.7",  severity:"info"},
  {t:"2026-05-31T15:18:09Z", user:"Colette Grisdale",   userId:16, action:"Approval requested", mod:"Tasks",       target:"Quarterly fee review",           details:"Awaiting CEO sign-off",                      ip:"86.176.21.92",  severity:"info"},
  {t:"2026-05-31T13:30:22Z", user:"Michael Barlow",  userId:2,  action:"Compliance flag raised",mod:"Compliance",target:"Apex Growth Fund Ltd",         details:"Annual review trigger · 12-month interval",  ip:"86.176.21.92",  severity:"warn"},
  {t:"2026-05-30T11:42:18Z", user:"Elena Pace",      userId:9,  action:"Document uploaded",  mod:"Documents",   target:"Stonebridge Capital Ltd",        details:"Bank mandate · Onboarding folder",           ip:"86.176.21.92",  severity:"info"},
  {t:"2026-05-30T10:18:55Z", user:"Andrew Morgan",   userId:1,  action:"Settings exported",  mod:"System Admin",target:"Firm-wide configuration",        details:"Config snapshot for DR backup",              ip:"104.28.241.18", severity:"info"},
  {t:"2026-05-29T16:55:31Z", user:"Colin Quayle",    userId:12, action:"AGM scheduled",      mod:"Entity Admin",target:"Meridian Holdings Ltd",          details:"AGM date: 15 Jul · invitations sent",        ip:"86.176.21.92",  severity:"info"},
  {t:"2026-05-29T14:30:18Z", user:"Krista Fenech",   userId:4,  action:"EDD requested",      mod:"Onboarding",  target:"New prospect — Verona Digital",  details:"Enhanced due diligence pack requested",      ip:"194.158.32.7",  severity:"warn"},
  {t:"2026-05-28T11:42:09Z", user:"Roxy Sheeley",    userId:14, action:"Invoice paid",       mod:"Invoicing",   target:"Stonebridge Capital Ltd",        details:"INV-2026-0820 · £12,500 · BACS",             ip:"86.176.20.4",   severity:"info"},
  {t:"2026-05-27T15:18:33Z", user:"Andrew Morgan",   userId:1,  action:"Risk policy updated",mod:"Compliance",  target:"Firm-wide risk framework",       details:"Threshold for High → Very High lowered",     ip:"104.28.241.18", severity:"alert"},
  {t:"2026-05-26T13:30:55Z", user:"Mattei Pisani",   userId:11, action:"Beneficial owner updated",mod:"Entity Admin",target:"Adriatic Holdings Ltd",      details:"UBO % changed: 60% → 75% (Sofia Adriatic)",  ip:"194.158.32.7",  severity:"warn"},
  {t:"2026-05-26T10:42:18Z", user:"Natalie Johnson", userId:7,  action:"CRS report generated",mod:"Compliance", target:"Bluewater Family Trust",         details:"Reportable accounts: 5 · auto-sent to TIA",  ip:"104.28.241.18", severity:"info"},
];

const SEVERITY_COLORS = {
  info:  {bg:"#E6F7FB", color:"#0077A8", label:"Info"},
  warn:  {bg:"#FAEEDA", color:"#633806", label:"Warning"},
  alert: {bg:"#FCEBEB", color:"#A32D2D", label:"Alert"},
};

const MODULE_COLORS = {
  "System":         {bg:"#F1EFE8", color:"#666"},
  "System Admin":   {bg:"#F1EFE8", color:"#666"},
  "Entity Admin":   {bg:"#E6F7FB", color:"#0077A8"},
  "Documents":      {bg:"#EEF0FB", color:"#3C3489"},
  "CRM":            {bg:"#FAEEDA", color:"#633806"},
  "Onboarding":     {bg:"#EAF3DE", color:"#27500A"},
  "Compliance":     {bg:"#FCEBEB", color:"#A32D2D"},
  "Tasks":          {bg:"#FDF4DC", color:"#7B4F1D"},
  "Invoicing":      {bg:"#E6F7FB", color:"#0077A8"},
  "Timesheets":     {bg:"#EAF3DE", color:"#27500A"},
  "Generate Doc":   {bg:"#F1EFE8", color:"#666"},
  "Budgeting":      {bg:"#FAEEDA", color:"#633806"},
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return min + "m ago";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "h ago";
  const days = Math.floor(hr / 24);
  if (days < 7) return days + "d ago";
  return new Date(iso).toLocaleDateString("en-GB", {day:"numeric",month:"short"});
}

function formatTimestamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

export default function AffinityAuditLog(props) {
  const userName = (props && props.userName) ? String(props.userName) : "";
  const isSuperAdmin = !!(props && props.isSuperAdmin);

  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("All");
  const [modFilter, setModFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("7d"); // 24h, 7d, 30d, all
  const [expandedRow, setExpandedRow] = useState(null);
  const [liveLog,setLiveLog]=useState(null);
  useEffect(()=>{ if(!isConfigured) return; let ok=true; auditEvents().then(({data})=>{ if(ok&&data&&data.length) setLiveLog(data); }).catch(()=>{}); return ()=>{ok=false;}; },[]);
  const log = liveLog || LOG_DATA;

  // Unique values for filter dropdowns
  const users = useMemo(() => Array.from(new Set(log.map(e => e.user))).sort(), [log]);
  const modules = useMemo(() => Array.from(new Set(log.map(e => e.mod))).sort(), [log]);

  const filtered = useMemo(() => {
    return log.filter(e => {
      // Date filter
      if (dateFilter !== "all") {
        const diff = Date.now() - new Date(e.t).getTime();
        const hours = diff / 3600000;
        if (dateFilter === "24h" && hours > 24) return false;
        if (dateFilter === "7d" && hours > 168) return false;
        if (dateFilter === "30d" && hours > 720) return false;
      }
      // User filter
      if (userFilter !== "All" && e.user !== userFilter) return false;
      // Module filter
      if (modFilter !== "All" && e.mod !== modFilter) return false;
      // Severity filter
      if (severityFilter !== "All" && e.severity !== severityFilter) return false;
      // Search
      if (search) {
        const q = search.toLowerCase();
        const hay = (e.user + " " + e.action + " " + e.target + " " + e.details).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime());
  }, [search, userFilter, modFilter, severityFilter, dateFilter, log]);

  function exportCsv() {
    function esc(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    const cols = ["Timestamp","User","Action","Module","Target","Details","Severity","IP"];
    const rows = filtered.map(e => [formatTimestamp(e.t), e.user, e.action, e.mod, e.target, e.details, e.severity, e.ip].map(esc).join(","));
    const csv = [cols.join(",")].concat(rows).join("\n");
    try {
      const blob = new Blob([csv], {type:"text/csv"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "affinity-core-audit-log-" + new Date().toISOString().slice(0,10) + ".csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {}
  }

  const stats = useMemo(() => ({
    total: filtered.length,
    alerts: filtered.filter(e => e.severity === "alert").length,
    warnings: filtered.filter(e => e.severity === "warn").length,
    users: new Set(filtered.map(e => e.user)).size,
  }), [filtered]);

  const cardStyle = {background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:14};
  const inputStyle = {padding:"7px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:11, fontFamily:"inherit", background:"#fff", color:"#333"};

  return (
    <div style={{padding:"20px 24px 80px", maxWidth:1400, margin:"0 auto", fontFamily:"'Catamaran',system-ui,sans-serif"}}>
      {/* Header */}
      <div style={{marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
          <div>
            <h1 style={{margin:0, fontSize:22, fontWeight:700, color:NAVY}}>Audit log</h1>
            <p style={{fontSize:12, color:"#666", margin:"4px 0 0", lineHeight:1.5}}>
              Every action taken in Affinity Core. Filter, search, and export for compliance reporting.
            </p>
          </div>
          <button onClick={exportCsv} style={{padding:"8px 14px", background:CY, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap"}}>
            ⬇ Export CSV ({filtered.length})
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:18}}>
        <div style={{...cardStyle, padding:"10px 14px"}}>
          <div style={{fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px"}}>Events shown</div>
          <div style={{fontSize:22,fontWeight:700,color:CY,marginTop:2}}>{stats.total}</div>
        </div>
        <div style={{...cardStyle, padding:"10px 14px"}}>
          <div style={{fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px"}}>Alerts</div>
          <div style={{fontSize:22,fontWeight:700,color:"#A32D2D",marginTop:2}}>{stats.alerts}</div>
        </div>
        <div style={{...cardStyle, padding:"10px 14px"}}>
          <div style={{fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px"}}>Warnings</div>
          <div style={{fontSize:22,fontWeight:700,color:"#B58A20",marginTop:2}}>{stats.warnings}</div>
        </div>
        <div style={{...cardStyle, padding:"10px 14px"}}>
          <div style={{fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px"}}>Active users</div>
          <div style={{fontSize:22,fontWeight:700,color:NAVY,marginTop:2}}>{stats.users}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{...cardStyle, marginBottom:14, padding:"12px 14px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input
            type="text"
            placeholder="Search action, user, entity…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{...inputStyle, minWidth:220, flex:"1 1 220px"}}
          />
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={inputStyle}>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)} style={inputStyle}>
            <option value="All">All users</option>
            {users.map(u => <option key={u}>{u}</option>)}
          </select>
          <select value={modFilter} onChange={e => setModFilter(e.target.value)} style={inputStyle}>
            <option value="All">All modules</option>
            {modules.map(m => <option key={m}>{m}</option>)}
          </select>
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={inputStyle}>
            <option value="All">All severity</option>
            <option value="info">Info only</option>
            <option value="warn">Warnings only</option>
            <option value="alert">Alerts only</option>
          </select>
          {(search || userFilter !== "All" || modFilter !== "All" || severityFilter !== "All" || dateFilter !== "7d") && (
            <button onClick={() => { setSearch(""); setUserFilter("All"); setModFilter("All"); setSeverityFilter("All"); setDateFilter("7d"); }} style={{...inputStyle, cursor:"pointer", border:"0.5px solid #ddd", color:"#A32D2D"}}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Log entries */}
      <div style={{...cardStyle, padding:0, overflow:"hidden"}}>
        {filtered.length === 0 ? (
          <div style={{padding:"40px 20px", textAlign:"center", color:"#aaa", fontSize:12}}>
            No events match your filters.
          </div>
        ) : (
          <div>
            {filtered.map((e, i) => {
              const modC = MODULE_COLORS[e.mod] || {bg:"#eee",color:"#666"};
              const sevC = SEVERITY_COLORS[e.severity] || SEVERITY_COLORS.info;
              const expanded = expandedRow === i;
              return (
                <div key={i}
                  onClick={() => setExpandedRow(expanded ? null : i)}
                  style={{padding:"12px 14px", borderBottom:i < filtered.length-1 ? "0.5px solid #f0f0f0" : "none", cursor:"pointer", background: expanded ? "#fafbfc" : "transparent", transition:"background 0.1s"}}
                  onMouseEnter={ev => { if (!expanded) ev.currentTarget.style.background = "#fafbfc"; }}
                  onMouseLeave={ev => { if (!expanded) ev.currentTarget.style.background = "transparent"; }}>

                  <div style={{display:"flex",gap:10,alignItems:"flex-start",flexWrap:"wrap"}}>
                    {/* Time column */}
                    <div style={{minWidth:90,flexShrink:0}}>
                      <div style={{fontSize:11, fontWeight:600, color:"#333"}}>{timeAgo(e.t)}</div>
                      <div style={{fontSize:9, color:"#aaa", marginTop:1}}>{new Date(e.t).toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit"})}</div>
                    </div>

                    {/* Main column */}
                    <div style={{flex:1, minWidth:200}}>
                      <div style={{fontSize:12, color:"#333", lineHeight:1.5}}>
                        <span style={{fontWeight:600, color:NAVY}}>{e.user}</span>
                        <span style={{color:"#666"}}> · </span>
                        <span>{e.action}</span>
                        <span style={{color:"#666"}}> · </span>
                        <span style={{fontWeight:500}}>{e.target}</span>
                      </div>
                      <div style={{fontSize:11, color:"#888", marginTop:3}}>{e.details}</div>
                    </div>

                    {/* Badges */}
                    <div style={{display:"flex", gap:5, alignItems:"center", flexShrink:0, flexWrap:"wrap"}}>
                      <span style={{padding:"2px 8px", borderRadius:12, fontSize:9, fontWeight:600, background:modC.bg, color:modC.color, whiteSpace:"nowrap"}}>{e.mod}</span>
                      {e.severity !== "info" && (
                        <span style={{padding:"2px 8px", borderRadius:12, fontSize:9, fontWeight:600, background:sevC.bg, color:sevC.color, whiteSpace:"nowrap"}}>{sevC.label}</span>
                      )}
                    </div>
                  </div>

                  {/* Expanded row — extra detail */}
                  {expanded && (
                    <div style={{marginTop:10, paddingTop:10, borderTop:"0.5px dashed #ddd", display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10, fontSize:10}}>
                      <div>
                        <div style={{color:"#888", fontWeight:600, marginBottom:2}}>FULL TIMESTAMP</div>
                        <div style={{color:"#333", fontFamily:"ui-monospace, monospace"}}>{formatTimestamp(e.t)}</div>
                      </div>
                      <div>
                        <div style={{color:"#888", fontWeight:600, marginBottom:2}}>USER</div>
                        <div style={{color:"#333"}}>{e.user} (ID: {e.userId})</div>
                      </div>
                      <div>
                        <div style={{color:"#888", fontWeight:600, marginBottom:2}}>IP ADDRESS</div>
                        <div style={{color:"#333", fontFamily:"ui-monospace, monospace"}}>{e.ip}</div>
                      </div>
                      <div>
                        <div style={{color:"#888", fontWeight:600, marginBottom:2}}>SEVERITY</div>
                        <div style={{color:sevC.color, fontWeight:600}}>{sevC.label}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div style={{marginTop:14, padding:"12px 14px", background:"#fafbfc", border:"0.5px solid #e5e5e5", borderRadius:8, fontSize:10, color:"#888", lineHeight:1.6}}>
        ℹ <strong>Beta note:</strong> entries shown are sample data for demonstration. In the live system every action in Affinity Core will be logged automatically with timestamps, user attribution, IP address and device fingerprint. Logs will be retained for 7 years to meet regulatory requirements (Isle of Man FSA, MFSA, CIMA, FCA).
        {!isSuperAdmin && <div style={{marginTop:6,color:"#A32D2D"}}>⚠ You are viewing the full log. In production, non-super-admin users see only their own activity.</div>}
      </div>
    </div>
  );
}
