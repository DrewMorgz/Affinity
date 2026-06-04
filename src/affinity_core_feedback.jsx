import { useState, useEffect } from "react";

const CY   = "#00C4CC";
const NAVY = "#001242";

const MODULES = ["Dashboard","Tasks","Entity Admin","CRM","Documents","Onboarding","Timesheets","Invoicing","Bookkeeping","Budgeting","Attrition","Reporting","Compliance","Procedures","Intranet","System admin","Login","Mobile","Other"];
const TYPES = ["Bug","UX / Design","Feature request","Copy","Performance","Question"];
const PRIORITIES = ["High","Medium","Low"];
const STATUSES = ["Open","In review","In progress","Implemented","Won't fix"];
const STORAGE_KEY = "affinity-core-feedback";

function priColor(p) {
  if (p === "High") return {bg:"#FCEBEB",color:"#A32D2D"};
  if (p === "Medium") return {bg:"#FAEEDA",color:"#633806"};
  return {bg:"#EAF3DE",color:"#27500A"};
}

function Badge(props) {
  var c = props.c || {bg:"#eee",color:"#666"};
  return (
    <span style={{display:"inline-block",padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:600,background:c.bg,color:c.color,whiteSpace:"nowrap"}}>
      {props.label}
    </span>
  );
}

export default function AffinityFeedback(props) {
  var userName = (props && props.userName) ? String(props.userName) : "";
  var isSuperAdmin = !!(props && props.isSuperAdmin);

  var itemsState = useState([]);
  var items = itemsState[0];
  var setItems = itemsState[1];

  var testerState = useState(userName);
  var tester = testerState[0]; var setTester = testerState[1];

  var moduleState = useState("Dashboard");
  var moduleField = moduleState[0]; var setModuleField = moduleState[1];

  var typeState = useState("UX / Design");
  var typeField = typeState[0]; var setTypeField = typeState[1];

  var priorityState = useState("Medium");
  var priorityField = priorityState[0]; var setPriorityField = priorityState[1];

  var textState = useState("");
  var text = textState[0]; var setText = textState[1];

  var savedState = useState(false);
  var justSaved = savedState[0]; var setJustSaved = savedState[1];

  useEffect(function() {
    try {
      var raw = (typeof localStorage !== "undefined") ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(function() {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      }
    } catch (e) { /* ignore */ }
  }, [items]);

  useEffect(function() {
    if (userName) setTester(userName);
  }, [userName]);

  function submit() {
    if (!text || !text.trim()) return;
    var entry = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      tester: tester || "Anonymous",
      module: moduleField,
      type: typeField,
      priority: priorityField,
      text: text.trim(),
      status: "Open",
    };
    setItems([entry].concat(items));
    setText("");
    setJustSaved(true);
    setTimeout(function() { setJustSaved(false); }, 2000);
  }

  function updateStatus(id, status) {
    setItems(items.map(function(it) { return it.id === id ? Object.assign({}, it, {status:status}) : it; }));
  }

  function remove(id) {
    if (typeof window !== "undefined" && !window.confirm("Delete this feedback entry?")) return;
    setItems(items.filter(function(it) { return it.id !== id; }));
  }

  function exportCsv() {
    function esc(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    var cols = ["Date","Tester","Module","Type","Priority","Status","Feedback"];
    var rows = items.map(function(it) {
      return [new Date(it.createdAt).toLocaleString("en-GB"), it.tester, it.module, it.type, it.priority, it.status, it.text].map(esc).join(",");
    });
    var csv = [cols.join(",")].concat(rows).join("\n");
    try {
      var blob = new Blob([csv], {type:"text/csv"});
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "affinity-core-feedback.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { /* ignore */ }
  }

  function clearAll() {
    if (typeof window !== "undefined" && !window.confirm("Clear all " + items.length + " feedback entries?")) return;
    setItems([]);
  }

  var totalCount = items.length;
  var openCount = items.filter(function(i) { return i.status === "Open"; }).length;
  var highCount = items.filter(function(i) { return i.priority === "High" && i.status !== "Implemented"; }).length;
  var doneCount = items.filter(function(i) { return i.status === "Implemented"; }).length;

  var cardStyle = {background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:16};
  var inputStyle = {width:"100%", padding:"8px 10px", border:"0.5px solid #ddd", borderRadius:6, fontSize:12, boxSizing:"border-box", fontFamily:"inherit"};
  var labelStyle = {fontSize:10, fontWeight:600, color:"#888", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.4px"};
  var btnPrimary = {padding:"9px 16px", border:"none", borderRadius:6, background:CY, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer"};
  var btnSecondary = {padding:"9px 16px", border:"0.5px solid #ddd", borderRadius:6, background:"#fff", color:"#333", fontSize:12, fontWeight:500, cursor:"pointer"};

  return (
    <div style={{padding:"20px 24px 80px", maxWidth:1100, margin:"0 auto", fontFamily:"'Catamaran',system-ui,sans-serif"}}>
      <div style={{marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
          <span style={{fontSize:22}}>💬</span>
          <h1 style={{margin:0, fontSize:22, fontWeight:700, color:NAVY}}>Feedback</h1>
        </div>
        <div style={{fontSize:12, color:"#666", lineHeight:1.5}}>
          Log anything you spot — design, bugs, missing features, copy. Andy and Alex see everything.
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:18}}>
        <div style={Object.assign({}, cardStyle, {padding:"10px 14px"})}>
          <div style={{fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase"}}>Total</div>
          <div style={{fontSize:22,fontWeight:700,color:CY,marginTop:2}}>{totalCount}</div>
        </div>
        <div style={Object.assign({}, cardStyle, {padding:"10px 14px"})}>
          <div style={{fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase"}}>Open</div>
          <div style={{fontSize:22,fontWeight:700,color:"#A32D2D",marginTop:2}}>{openCount}</div>
        </div>
        <div style={Object.assign({}, cardStyle, {padding:"10px 14px"})}>
          <div style={{fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase"}}>High priority</div>
          <div style={{fontSize:22,fontWeight:700,color:"#B58A20",marginTop:2}}>{highCount}</div>
        </div>
        <div style={Object.assign({}, cardStyle, {padding:"10px 14px"})}>
          <div style={{fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase"}}>Done</div>
          <div style={{fontSize:22,fontWeight:700,color:"#27500A",marginTop:2}}>{doneCount}</div>
        </div>
      </div>

      <div style={Object.assign({}, cardStyle, {marginBottom:18})}>
        <div style={{fontSize:13,fontWeight:700,color:NAVY,marginBottom:14}}>New feedback</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <div style={labelStyle}>Tester</div>
            <input style={inputStyle} value={tester} onChange={function(e){setTester(e.target.value);}} placeholder="Your name" />
          </div>
          <div>
            <div style={labelStyle}>Module / area</div>
            <select style={inputStyle} value={moduleField} onChange={function(e){setModuleField(e.target.value);}}>
              {MODULES.map(function(m){ return <option key={m}>{m}</option>; })}
            </select>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <div style={labelStyle}>Type</div>
            <select style={inputStyle} value={typeField} onChange={function(e){setTypeField(e.target.value);}}>
              {TYPES.map(function(t){ return <option key={t}>{t}</option>; })}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Priority</div>
            <select style={inputStyle} value={priorityField} onChange={function(e){setPriorityField(e.target.value);}}>
              {PRIORITIES.map(function(p){ return <option key={p}>{p}</option>; })}
            </select>
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={labelStyle}>What's the feedback?</div>
          <textarea
            style={Object.assign({}, inputStyle, {minHeight:90, resize:"vertical", lineHeight:1.5})}
            value={text}
            onChange={function(e){setText(e.target.value);}}
            placeholder="Be specific. What did you see, where, and what would you change?"
          />
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}}>
          {justSaved ? <span style={{fontSize:11,color:"#27500A",marginRight:8}}>✓ Saved</span> : null}
          <button style={btnPrimary} onClick={submit}>Submit feedback</button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:13,fontWeight:700,color:NAVY}}>All feedback</div>
          <div style={{display:"flex",gap:6}}>
            <button style={btnSecondary} onClick={exportCsv}>⬇ Export CSV</button>
            {isSuperAdmin ? <button style={Object.assign({}, btnSecondary, {color:"#A32D2D"})} onClick={clearAll}>Clear all</button> : null}
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{padding:"40px 20px",textAlign:"center",color:"#aaa",fontSize:12}}>
            No feedback yet — be the first.
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {items.map(function(it) {
              return (
                <div key={it.id} style={{border:"0.5px solid #eee",borderRadius:8,padding:12,background:"#fafafa"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <Badge label={it.module} c={{bg:"#EEF0FB",color:"#3C3489"}} />
                      <Badge label={it.type} c={{bg:"#E6F7FB",color:"#0077A8"}} />
                      <Badge label={it.priority} c={priColor(it.priority)} />
                      <Badge label={it.status} c={{bg:"#F1EFE8",color:"#666"}} />
                    </div>
                    <div style={{fontSize:10,color:"#999"}}>{it.tester} · {new Date(it.createdAt).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                  <div style={{fontSize:12,color:"#333",lineHeight:1.55,whiteSpace:"pre-wrap"}}>{it.text}</div>
                  {isSuperAdmin ? (
                    <div style={{marginTop:10,paddingTop:10,borderTop:"0.5px dashed #ddd",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontSize:10,color:"#888",fontWeight:600}}>ADMIN:</span>
                      <select value={it.status} onChange={function(e){updateStatus(it.id, e.target.value);}} style={{fontSize:11,padding:"3px 6px",border:"0.5px solid #ddd",borderRadius:4,background:"#fff"}}>
                        {STATUSES.map(function(s){ return <option key={s}>{s}</option>; })}
                      </select>
                      <button onClick={function(){ remove(it.id); }} style={{fontSize:11,color:"#A32D2D",background:"transparent",border:"none",cursor:"pointer",marginLeft:"auto"}}>Delete</button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div style={{marginTop:16,paddingTop:14,borderTop:"0.5px solid #f0f0f0",fontSize:10,color:"#999",lineHeight:1.6}}>
          Entries are stored locally in your browser. Use Export CSV to share with Andy / Alex.
        </div>
      </div>
    </div>
  );
}
