import { useState, useEffect } from "react";

const CY = "#00C4CC";
const NAVY = "#001242";

export default function AffinityFeedback(props) {
  var userName = (props && props.userName) ? String(props.userName) : "";
  var isSuperAdmin = !!(props && props.isSuperAdmin);
  var STORAGE_KEY = "affinity-core-feedback";

  var itemsState = useState([]);
  var items = itemsState[0];
  var setItems = itemsState[1];

  var textState = useState("");
  var text = textState[0];
  var setText = textState[1];

  var modState = useState("Dashboard");
  var mod = modState[0];
  var setMod = modState[1];

  var typState = useState("Bug");
  var typ = typState[0];
  var setTyp = typState[1];

  var priState = useState("Medium");
  var pri = priState[0];
  var setPri = priState[1];

  useEffect(function() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch (e) {}
  }, []);

  useEffect(function() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {}
  }, [items]);

  function submit() {
    if (!text || !text.trim()) return;
    var entry = {
      id: Date.now(),
      tester: userName || "Anonymous",
      module: mod,
      type: typ,
      priority: pri,
      text: text.trim(),
      status: "Open",
      date: new Date().toISOString(),
    };
    setItems([entry].concat(items));
    setText("");
  }

  return (
    <div style={{padding:"24px", maxWidth:1000, margin:"0 auto"}}>
      <h1 style={{margin:0, fontSize:24, fontWeight:700, color:NAVY}}>💬 Feedback</h1>
      <p style={{fontSize:13, color:"#666", marginTop:6, marginBottom:24}}>
        Log anything you spot — design, bugs, missing features, copy. Andy and Alex see everything.
      </p>

      <div style={{background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:18, marginBottom:20}}>
        <div style={{fontSize:13, fontWeight:700, color:NAVY, marginBottom:14}}>New feedback</div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
          <div>
            <div style={{fontSize:10, fontWeight:600, color:"#888", marginBottom:4, textTransform:"uppercase"}}>Module</div>
            <select value={mod} onChange={function(e){setMod(e.target.value);}} style={{width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:12}}>
              {["Dashboard","Tasks","Entity Admin","CRM","Documents","Onboarding","Timesheets","Invoicing","Bookkeeping","Attrition","Compliance","Intranet","Login","Mobile","Other"].map(function(m){
                return <option key={m}>{m}</option>;
              })}
            </select>
          </div>
          <div>
            <div style={{fontSize:10, fontWeight:600, color:"#888", marginBottom:4, textTransform:"uppercase"}}>Type</div>
            <select value={typ} onChange={function(e){setTyp(e.target.value);}} style={{width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:12}}>
              {["Bug","UX / Design","Feature request","Copy","Performance","Question"].map(function(t){
                return <option key={t}>{t}</option>;
              })}
            </select>
          </div>
        </div>

        <div style={{marginBottom:12}}>
          <div style={{fontSize:10, fontWeight:600, color:"#888", marginBottom:4, textTransform:"uppercase"}}>Priority</div>
          <select value={pri} onChange={function(e){setPri(e.target.value);}} style={{width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:12}}>
            {["High","Medium","Low"].map(function(p){
              return <option key={p}>{p}</option>;
            })}
          </select>
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:10, fontWeight:600, color:"#888", marginBottom:4, textTransform:"uppercase"}}>What's the feedback?</div>
          <textarea
            value={text}
            onChange={function(e){setText(e.target.value);}}
            placeholder="Be specific. What did you see, where, and what would you change?"
            style={{width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:12, minHeight:90, fontFamily:"inherit", boxSizing:"border-box"}}
          />
        </div>

        <div style={{display:"flex", justifyContent:"flex-end"}}>
          <button onClick={submit} style={{padding:"9px 18px", background:CY, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer"}}>Submit feedback</button>
        </div>
      </div>

      <div style={{background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:18}}>
        <div style={{fontSize:13, fontWeight:700, color:NAVY, marginBottom:14}}>
          All feedback ({items.length})
        </div>

        {items.length === 0 ? (
          <div style={{padding:"30px 0", textAlign:"center", color:"#aaa", fontSize:12}}>
            No feedback yet — be the first.
          </div>
        ) : items.map(function(it) {
          return (
            <div key={it.id} style={{padding:"10px 0", borderBottom:"0.5px solid #f0f0f0"}}>
              <div style={{display:"flex", gap:8, marginBottom:4, fontSize:10}}>
                <span style={{background:"#EEF0FB", color:"#3C3489", padding:"2px 8px", borderRadius:12, fontWeight:600}}>{it.module}</span>
                <span style={{background:"#E6F7FB", color:"#0077A8", padding:"2px 8px", borderRadius:12, fontWeight:600}}>{it.type}</span>
                <span style={{background: it.priority==="High"?"#FCEBEB":it.priority==="Medium"?"#FAEEDA":"#EAF3DE", color: it.priority==="High"?"#A32D2D":it.priority==="Medium"?"#633806":"#27500A", padding:"2px 8px", borderRadius:12, fontWeight:600}}>{it.priority}</span>
                <span style={{marginLeft:"auto", color:"#999"}}>{it.tester} · {new Date(it.date).toLocaleString("en-GB", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"})}</span>
              </div>
              <div style={{fontSize:13, color:"#333", lineHeight:1.5, whiteSpace:"pre-wrap"}}>{it.text}</div>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:16, fontSize:10, color:"#999", textAlign:"center"}}>
        Entries stored locally · userName: {userName || "(none)"} · Admin: {isSuperAdmin ? "yes" : "no"}
      </div>
    </div>
  );
}
