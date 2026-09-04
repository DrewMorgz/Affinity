import { useState, useEffect } from "react";
import { getDatasets, isConfigured } from "./affinity_ops_api";

const CY    = "#00C4CC";
const NAVY  = "#001242";
const CREAM = "#FAF8F3";

// Sample client — Emma Harrington (beneficial owner of Harrington Family Trust + Meridian Holdings)
const SAMPLE_CLIENT = {
  name: "Emma Harrington",
  email: "emma.harrington@gmail.com",
  phone: "+44 7700 900123",
  lastLogin: "2026-06-03T14:20:00Z",
  rm: {
    name: "Roxy Sheeley",
    role: "Managing Director — IOM",
    email: "roxy.sheeley@affinityco.com",
    phone: "+44 1624 555 102",
    avatar: "RS",
    color: "#3C5CBF",
  },
  entities: [
    { id: 1, name: "Harrington Family Trust",  role: "Settlor & Beneficiary",      jurisdiction: "Cayman Islands", flag: "🇰🇾", type: "Trust",   status: "Active" },
    { id: 2, name: "Meridian Holdings Ltd",    role: "Ultimate Beneficial Owner (75%)", jurisdiction: "Isle of Man", flag: "🇮🇲", type: "Company", status: "Active" },
    { id: 3, name: "Harrington Investments Ltd",role: "Sole Director & Shareholder",   jurisdiction: "United Kingdom", flag: "🇬🇧", type: "Company", status: "Active" },
  ],
  actions: [
    { id:1, type:"kyc",     title:"KYC renewal due",            desc:"Upload an updated passport copy (current expires 30 Jul)", due:"2026-06-30", urgent:true },
    { id:2, type:"sign",    title:"Board resolution awaiting signature", desc:"Meridian Holdings — capital reorganisation", due:"2026-06-15", urgent:false },
    { id:3, type:"invoice", title:"Q2 admin invoice ready",     desc:"INV-2026-0851 · £4,250 · Harrington Family Trust", due:"2026-06-25", urgent:false },
  ],
  documents: [
    { id:1, name:"Trust Deed — Harrington Family",          entity:"Harrington Family Trust",  date:"12 Mar 2024", type:"PDF", size:"2.8 MB" },
    { id:2, name:"Memorandum & Articles — Meridian Holdings",entity:"Meridian Holdings Ltd",   date:"05 Sep 2018", type:"PDF", size:"1.2 MB" },
    { id:3, name:"AGM Minutes — Meridian Holdings 2025",    entity:"Meridian Holdings Ltd",   date:"30 May 2025", type:"PDF", size:"4.2 MB" },
    { id:4, name:"Annual Statement — Harrington Trust 2025",entity:"Harrington Family Trust", date:"15 Apr 2025", type:"PDF", size:"850 KB" },
  ],
  messages: [
    { id:1, from:"rm", t:"2026-06-04T11:30:00Z", text:"Hi Emma — just a heads up that we'll need an updated passport copy in the next couple of weeks. The renewal portal upload is the easiest way." },
    { id:2, from:"client", t:"2026-06-04T15:45:00Z", text:"Thanks Roxy, will sort that this week. Also — when you have a minute, can we discuss adding James as a beneficiary?" },
    { id:3, from:"rm", t:"2026-06-04T16:12:00Z", text:"Absolutely. I'll send over a call invite for Friday afternoon and a short note on what we'll need to add him properly." },
  ],
  invoices: [
    { id:"INV-2026-0851", date:"01 Jun 2026", amount:"£4,250.00", status:"Outstanding", entity:"Harrington Family Trust" },
    { id:"INV-2026-0712", date:"01 Mar 2026", amount:"£4,250.00", status:"Paid",        entity:"Harrington Family Trust" },
    { id:"INV-2026-0698", date:"01 Mar 2026", amount:"£1,825.00", status:"Paid",        entity:"Meridian Holdings Ltd" },
  ],
};

const ACTION_STYLE = {
  kyc:     { icon: "📋", bg: "#FCEBEB", color: "#A32D2D", label: "Compliance" },
  sign:    { icon: "✍",  bg: "#FAEEDA", color: "#633806", label: "Signature required" },
  invoice: { icon: "💷", bg: "#E6F7FB", color: "#0077A8", label: "Billing" },
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const hr = Math.floor(diff / 3600000);
  if (hr < 1) return "moments ago";
  if (hr < 24) return hr + "h ago";
  const d = Math.floor(hr / 24);
  if (d < 7) return d + "d ago";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function AffinityClientPortal() {
  const [liveC,setLiveC]=useState(null);
  useEffect(()=>{ if(!isConfigured) return; let ok=true; getDatasets("portal.").then(({data})=>{ if(ok&&data&&data.length){ const r=data.find(x=>x.dkey==="portal.client"); if(r)setLiveC(r.data);} }).catch(()=>{}); return ()=>{ok=false;}; },[]);
  const c = liveC || SAMPLE_CLIENT;
  const [tab, setTab] = useState("home");
  const [message, setMessage] = useState("");
  const [thread, setThread] = useState(c.messages);

  function sendMessage() {
    if (!message.trim()) return;
    setThread(t => t.concat([{ id: Date.now(), from: "client", t: new Date().toISOString(), text: message.trim() }]));
    setMessage("");
  }

  const NAV = [
    { id: "home",      label: "Home",      icon: "⌂" },
    { id: "entities",  label: "Entities",  icon: "🏢" },
    { id: "documents", label: "Documents", icon: "📄" },
    { id: "messages",  label: "Messages",  icon: "💬" },
    { id: "billing",   label: "Billing",   icon: "💷" },
  ];

  const card = { background: "#fff", border: "0.5px solid #e8e8e8", borderRadius: 12, padding: 18 };
  const sectionTitle = { fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.8px" };

  return (
    <div style={{ minHeight: "100%", background: CREAM, fontFamily: "'Catamaran', system-ui, sans-serif" }}>
      {/* Hero / banner */}
      <div style={{ background: `linear-gradient(135deg, ${CY} 0%, #00929A 50%, ${NAVY} 100%)`, padding: "28px 24px", color: "#fff" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 11, opacity: 0.85, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 6 }}>Affinity Client Portal</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 4 }}>Welcome back, {c.name.split(" ")[0]}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Last signed in {timeAgo(c.lastLogin)} · {c.entities.length} entities under management · {c.actions.length} actions need your attention</div>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ background: "#fff", borderBottom: "0.5px solid #e8e8e8", padding: "0 20px", overflowX: "auto" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 0 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              style={{ padding: "14px 16px", background: "transparent", border: "none", borderBottom: `2px solid ${tab === n.id ? CY : "transparent"}`, color: tab === n.id ? NAVY : "#888", fontSize: 12, fontWeight: tab === n.id ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap" }}>
              <span style={{ marginRight: 6 }}>{n.icon}</span>{n.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px" }}>

        {/* HOME — actions, entities preview, RM, recent docs */}
        {tab === "home" && (<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Actions required */}
          <div style={card}>
            <div style={sectionTitle}>Actions required ({c.actions.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {c.actions.map(a => {
                const st = ACTION_STYLE[a.type];
                return (
                  <div key={a.id} style={{ display: "flex", gap: 12, padding: 12, border: "0.5px solid #f0f0f0", borderRadius: 10, background: a.urgent ? "#fefafa" : "#fafafa", borderLeft: a.urgent ? `3px solid #A32D2D` : `3px solid ${st.color}` }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: st.bg, color: st.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, fontWeight: 700 }}>{st.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.title}</div>
                        {a.urgent && <span style={{ padding: "1px 7px", borderRadius: 10, fontSize: 9, fontWeight: 700, background: "#FCEBEB", color: "#A32D2D", textTransform: "uppercase" }}>Urgent</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{a.desc}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                        <button style={{ padding: "6px 12px", background: CY, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          {a.type === "kyc" ? "Upload document" : a.type === "sign" ? "Review & sign" : "View invoice"}
                        </button>
                        <span style={{ fontSize: 10, color: "#999" }}>Due {new Date(a.due).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Entities preview */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ ...sectionTitle, marginBottom: 0 }}>My entities</div>
              <button onClick={() => setTab("entities")} style={{ background: "none", border: "none", fontSize: 11, color: CY, cursor: "pointer", fontWeight: 600 }}>View all →</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {c.entities.map(e => (
                <div key={e.id} style={{ padding: 12, border: "0.5px solid #f0f0f0", borderRadius: 10, background: "#fafafa", cursor: "pointer" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{e.flag}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 3 }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>{e.type} · {e.jurisdiction}</div>
                  <div style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>{e.role}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RM card */}
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: c.rm.color, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.rm.avatar}</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Your relationship manager</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{c.rm.name}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{c.rm.role}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{c.rm.email} · {c.rm.phone}</div>
            </div>
            <button onClick={() => setTab("messages")} style={{ padding: "8px 14px", background: CY, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Send a message</button>
          </div>
        </div>)}

        {/* ENTITIES TAB */}
        {tab === "entities" && (<div style={card}>
          <div style={sectionTitle}>Entities under management ({c.entities.length})</div>
          {c.entities.map(e => (
            <div key={e.id} style={{ padding: "16px 0", borderBottom: "0.5px solid #f0f0f0", display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ fontSize: 28 }}>{e.flag}</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{e.name}</div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{e.type} · {e.jurisdiction}</div>
                <div style={{ fontSize: 12, color: "#333", fontStyle: "italic", marginBottom: 8 }}>Your role: {e.role}</div>
                <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: "#EAF3DE", color: "#27500A" }}>{e.status}</span>
              </div>
            </div>
          ))}
        </div>)}

        {/* DOCUMENTS TAB */}
        {tab === "documents" && (<div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div style={{ ...sectionTitle, marginBottom: 0 }}>Your documents ({c.documents.length})</div>
            <button style={{ padding: "7px 14px", background: CY, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }} disabled title="Client-side upload needs the client portal to be authenticated separately">⬆ Upload document</button>
          </div>
          {c.documents.map((d, i) => (
            <div key={d.id} style={{ padding: "12px 0", borderBottom: i < c.documents.length - 1 ? "0.5px solid #f0f0f0" : "none", display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: "#EEF0FB", color: "#3C3489", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, fontWeight: 700 }}>{d.type}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{d.entity} · {d.date} · {d.size}</div>
              </div>
              <button style={{ padding: "6px 10px", background: "transparent", border: "0.5px solid #ddd", borderRadius: 6, fontSize: 11, color: "#666", cursor: "pointer", whiteSpace: "nowrap" }} disabled title="Needs the document generation engine, which is not built yet">↓ Download</button>
            </div>
          ))}
        </div>)}

        {/* MESSAGES TAB */}
        {tab === "messages" && (<div style={card}>
          <div style={{ ...sectionTitle, marginBottom: 14 }}>Conversation with {c.rm.name}</div>
          <div style={{ maxHeight: 380, overflowY: "auto", padding: "4px 2px", marginBottom: 14 }}>
            {thread.map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.from === "client" ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: 12, background: m.from === "client" ? CY : "#f0f0f0", color: m.from === "client" ? "#fff" : "#222", fontSize: 12, lineHeight: 1.5 }}>
                  {m.text}
                  <div style={{ fontSize: 9, opacity: 0.7, marginTop: 4 }}>{new Date(m.t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, borderTop: "0.5px solid #f0f0f0", paddingTop: 14 }}>
            <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Type a message…"
              style={{ flex: 1, padding: "9px 12px", border: "0.5px solid #ddd", borderRadius: 6, fontSize: 12, fontFamily: "inherit" }} />
            <button onClick={sendMessage} style={{ padding: "9px 16px", background: CY, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Send</button>
          </div>
        </div>)}

        {/* BILLING TAB */}
        {tab === "billing" && (<div style={card}>
          <div style={sectionTitle}>Invoices</div>
          {c.invoices.map((inv, i) => (
            <div key={inv.id} style={{ padding: "14px 0", borderBottom: i < c.invoices.length - 1 ? "0.5px solid #f0f0f0" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{inv.id}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{inv.entity} · {inv.date}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{inv.amount}</div>
                <span style={{ padding: "3px 9px", borderRadius: 12, fontSize: 10, fontWeight: 600, background: inv.status === "Paid" ? "#EAF3DE" : "#FAEEDA", color: inv.status === "Paid" ? "#27500A" : "#633806" }}>{inv.status}</span>
                {inv.status === "Outstanding" && <button style={{ padding: "6px 12px", background: CY, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }} disabled title="Needs a payment provider, which is not connected yet">Pay now</button>}
              </div>
            </div>
          ))}
        </div>)}

        {/* Footer note */}
        <div style={{ marginTop: 20, padding: "12px 14px", background: "#fff", border: "0.5px solid #e8e8e8", borderRadius: 8, fontSize: 10, color: "#888", lineHeight: 1.6, textAlign: "center" }}>
          🔒 Secure portal · all activity encrypted and logged · <span style={{ color: NAVY, fontWeight: 600 }}>Affinity Corporate & Trust Services</span>
        </div>
      </div>
    </div>
  );
}
