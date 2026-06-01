import { useState, useRef, useEffect } from "react";

const CY = "#00C4CC";
const NAVY = "#001242";

// Internal knowledge base — answers come from system data only
const KB = {
  entities:{
    total:300, active:284, dormant:8, liquidation:5, dissolved:3,
    byJur:{"Isle of Man":114,"Cayman Islands":87,"Malta":52,"United Kingdom":31,"Miami":16,"South Dakota":4},
    byType:{Company:168,Trust:94,Foundation:24,"LLC/Partnership":14},
  },
  compliance:{
    overdueReviews:3,dueThisMonth:2,expiredKYC:2,openCases:5,completionRate:"94%",
    overdueEntities:["Harrington Family Trust","Pacific Wealth Trust","North Star Holdings Ltd"],
  },
  finance:{
    revenueYTD:487000,wip:48320,overdueDebt:27720,collectionRate:"84%",
    topDebtors:["Harrington Family Trust (£2,250)","North Star Holdings Ltd (£600)"],
  },
  timesheets:{
    missing:["Sarah Cole"],teamUtil:"75%",topPerformer:"Garry Crossan (82%)",
  },
  procedures:{total:23,activeRuns:17},
  tasks:{open:12,critical:3,high:5},
};

function getAnswer(q) {
  const ql = q.toLowerCase();

  // Entity queries
  if(ql.includes("how many entities")||ql.includes("total entities")||ql.includes("number of entities")) return `There are currently **${KB.entities.total} entities** under administration — ${KB.entities.active} active, ${KB.entities.dormant} dormant, ${KB.entities.liquidation} in liquidation, and ${KB.entities.dissolved} dissolved or struck off.`;
  if(ql.includes("cayman")&&(ql.includes("entities")||ql.includes("how many"))) return `Affinity administers **${KB.entities.byJur["Cayman Islands"]} entities** in the Cayman Islands.`;
  if(ql.includes("isle of man")||ql.includes("iom"))  {
    if(ql.includes("entities")||ql.includes("how many")) return `Affinity administers **${KB.entities.byJur["Isle of Man"]} entities** in the Isle of Man.`;
  }
  if(ql.includes("malta")&&(ql.includes("entities")||ql.includes("how many"))) return `Affinity administers **${KB.entities.byJur["Malta"]} entities** in Malta.`;
  if(ql.includes("trust")&&ql.includes("how many")) return `There are currently **${KB.entities.byType.Trust} trusts** under administration across all offices.`;
  if(ql.includes("companies")||ql.includes("how many companies")) return `There are **${KB.entities.byType.Company} companies** under administration, across Isle of Man, Cayman, Malta, UK, Miami and South Dakota.`;

  // Compliance
  if(ql.includes("overdue review")||ql.includes("reviews overdue")) return `There are currently **${KB.compliance.overdueReviews} overdue periodic reviews**: ${KB.compliance.overdueEntities.join(", ")}. These should be prioritised immediately.`;
  if(ql.includes("expired kyc")||ql.includes("kyc expired")) return `There are **${KB.compliance.expiredKYC} expired KYC documents** on file. Emma Harrington (Harrington Family Trust) and Sophie Laurent (Apex Growth Fund Ltd) are the affected principals.`;
  if(ql.includes("compliance rate")||ql.includes("review completion")) return `The current compliance review completion rate is **${KB.compliance.completionRate}**. There are ${KB.compliance.overdueReviews} overdue and ${KB.compliance.dueThisMonth} due this month.`;
  if(ql.includes("open case")||ql.includes("compliance case")) return `There are currently **${KB.compliance.openCases} open compliance cases**. The most critical is the Apex Growth Fund Ltd sanctions match, which is with the MLRO for review.`;
  if(ql.includes("sanctions")||ql.includes("apex growth")) return `Apex Growth Fund Ltd has an **open sanctions screening match** under MLRO review by Gary Harrison. No new services should be provided to this entity without MLRO clearance. This is a critical item.`;

  // Finance
  if(ql.includes("revenue")||ql.includes("income ytd")) return `Group revenue YTD 2025 is **£${(KB.finance.revenueYTD/1000).toFixed(0)}k**. The breakdown by office is: Cayman Islands (40%), Isle of Man (28%), Malta (17%), UK (10%), Miami (6%).`;
  if(ql.includes("wip")||ql.includes("work in progress")) return `Current WIP balance across all entities is **£${KB.finance.wip.toLocaleString()}**. This has been trending upward over the past 6 months.`;
  if(ql.includes("overdue debt")||ql.includes("outstanding")||ql.includes("debtor")) return `Total overdue debt is **£${KB.finance.overdueDebt.toLocaleString()}**. The main debtors are: ${KB.finance.topDebtors.join(", ")}. Collection rate is currently ${KB.finance.collectionRate} against a target of 90%.`;

  // Timesheets / team
  if(ql.includes("missing timesheet")||ql.includes("timesheet missing")) return `**${KB.timesheets.missing.join(", ")}** has not submitted a timesheet for the current week. A reminder should be sent immediately.`;
  if(ql.includes("utilisation")||ql.includes("utilization")) return `Team utilisation this week is **${KB.timesheets.teamUtil}** against a target of 75%. Top performer is ${KB.timesheets.topPerformer}.`;

  // Tasks
  if(ql.includes("critical task")||ql.includes("urgent task")) return `There are **${KB.tasks.critical} critical tasks** open: (1) Harrington Trust CPR overdue, (2) Apex Growth Fund sanctions MLRO review, (3) Emma Harrington KYC expired. All three require immediate action.`;
  if(ql.includes("how many task")||ql.includes("open task")) return `There are currently **${KB.tasks.open} open tasks** — ${KB.tasks.critical} critical, ${KB.tasks.high} high priority. View them in the Tasks module.`;

  // Procedures
  if(ql.includes("procedure")||ql.includes("active run")) return `There are **${KB.procedures.total} procedures** in the system with **${KB.procedures.activeRuns} active runs** currently in progress. Use the Procedures module to view and manage them.`;

  // Harrington
  if(ql.includes("harrington")) return `**Harrington Family Trust** (AC-2019-014) — Isle of Man. High risk. Administered by Roxy Sheeley. Current issues: ⚠ Periodic review overdue (due 05/01/2025), ⚠ Emma Harrington KYC expired (Apr 2024), ⚠ Invoice overdue 60+ days (£2,250). Requires urgent action on all three fronts.`;

  // Meridian
  if(ql.includes("meridian")) return `**Meridian Holdings Ltd** (AC-2024-001) — Isle of Man. Medium risk. Active. Administered by Roxy Sheeley. Next periodic review due 14/09/2025. Annual return due 12/03/2026. No compliance issues outstanding.`;

  // Pacific Wealth
  if(ql.includes("pacific wealth")) return `**Pacific Wealth Trust** (AC-2022-019) — Cayman Islands. High risk. Administered by Garry Crossan. Current issue: ⚠ Periodic review overdue since 18/02/2025. EDD pack in progress for Wei Chen. No new services without compliance clearance.`;

  // Who / team queries
  if(ql.includes("who is the mlro")) return `The Group MLRO is **Gary Harrison** (Group CCO). All STR referrals, sanctions matters and enhanced due diligence escalations should go through Gary.`;
  if(ql.includes("who administers")||ql.includes("who is the administrator")) return `Administrators by office: Roxy Sheeley (Isle of Man), Garry Crossan (Cayman Islands), Joanne Fenech (Malta), Andy Morgan (Group/Miami). Use Entity Admin to find the specific administrator for any entity.`;
  if(ql.includes("who is the cfo")) return `The Group CFO is **Neil Kelly**, based in the Group office. Neil oversees invoicing, bookkeeping, management accounts and budget across all offices.`;
  if(ql.includes("andy morgan")||ql.includes("ceo")) return `**Andy Morgan** is the Group CEO and founded Affinity in 2009. Andy is a Super Admin on Affinity Core and oversees the Group operation including Miami and South Dakota.`;

  // Help
  if(ql.includes("help")||ql.includes("what can you")||ql.includes("what do you know")) return `I can answer questions about data in Affinity Core. Try asking:\n\n• "How many entities do we have in Cayman?"\n• "Who has overdue compliance reviews?"\n• "What is our WIP balance?"\n• "Who is missing a timesheet?"\n• "Tell me about Harrington Family Trust"\n• "How many critical tasks are open?"\n• "What is our revenue YTD?"\n\nI only have access to internal Affinity Core data — I cannot search the internet or access external systems.`;

  // Default
  return `I don't have specific data on that in the current system. Try rephrasing, or check the relevant module directly:\n\n• Entity data → Entity Admin\n• Compliance → Compliance module\n• Finance → Invoicing or Bookkeeping\n• Tasks → Tasks module\n\nType **"help"** to see what I can answer.`;
}

const SUGGESTIONS = [
  "How many entities do we have?",
  "Any overdue compliance reviews?",
  "Who is missing a timesheet?",
  "What is our WIP balance?",
  "Tell me about Harrington Family Trust",
  "How many critical tasks are open?",
];

export default function AffinityChatbot() {
  const [messages,setMessages] = useState([
    {role:"assistant",text:"Hello — I'm the Affinity Core assistant. I can answer questions about your entities, compliance status, finance, tasks and team data. All answers come from Affinity Core data only — I have no external internet connection.\n\nWhat would you like to know?"}
  ]);
  const [input,setInput]   = useState("");
  const [loading,setLoading] = useState(false);
  const endRef             = useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);

  const send = (text) => {
    const q = text||input.trim();
    if(!q) return;
    setInput("");
    setMessages(p=>[...p,{role:"user",text:q}]);
    setLoading(true);
    setTimeout(()=>{
      const answer = getAnswer(q);
      setMessages(p=>[...p,{role:"assistant",text:answer}]);
      setLoading(false);
    },600);
  };

  const renderText = (text) => {
    // Bold **text**, newlines
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p,i)=>{
      if(p.startsWith("**")&&p.endsWith("**")) return <strong key={i}>{p.slice(2,-2)}</strong>;
      return p.split("\n").map((line,j)=><span key={j}>{line}{j<p.split("\n").length-1&&<br/>}</span>);
    });
  };

  return (
    <div style={{fontFamily:"'Catamaran',system-ui,sans-serif",display:"flex",flexDirection:"column",height:"calc(100vh - 48px)",background:"#f5f7fa"}}>
      {/* Header */}
      <div style={{background:"#fff",borderBottom:"0.5px solid #e5e5e5",padding:"12px 20px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:CY,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>&#129302;</div>
          <div>
            <div style={{fontSize:14,fontWeight:600}}>Affinity Core Assistant</div>
            <div style={{fontSize:11,color:"#4CAF7D"}}>&#9679; Online &middot; Internal data only &middot; No external connection</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:12}}>
            {m.role==="assistant"&&<div style={{width:28,height:28,borderRadius:"50%",background:CY,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,marginRight:8,marginTop:2}}>&#129302;</div>}
            <div style={{maxWidth:"72%",padding:"10px 14px",borderRadius:m.role==="user"?"12px 12px 2px 12px":"12px 12px 12px 2px",background:m.role==="user"?CY:"#fff",color:m.role==="user"?"#fff":"#111",fontSize:12,lineHeight:1.65,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:m.role==="user"?"none":"0.5px solid #e5e5e5"}}>
              {renderText(m.text)}
            </div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:CY,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>&#129302;</div>
          <div style={{padding:"10px 14px",borderRadius:"12px 12px 12px 2px",background:"#fff",border:"0.5px solid #e5e5e5",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#ccc",animation:`pulse 1s ${i*0.2}s infinite`}}/>)}
            </div>
          </div>
        </div>}
        <div ref={endRef}/>
      </div>

      {/* Suggestions */}
      {messages.length<=2&&<div style={{padding:"0 20px 10px",display:"flex",gap:6,flexWrap:"wrap",flexShrink:0}}>
        {SUGGESTIONS.map(s=><button key={s} onClick={()=>send(s)} style={{padding:"5px 12px",borderRadius:20,border:`0.5px solid ${CY}`,background:"transparent",color:CY,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>{s}</button>)}
      </div>}

      {/* Input */}
      <div style={{padding:"10px 20px 16px",background:"#fff",borderTop:"0.5px solid #e5e5e5",flexShrink:0}}>
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <div style={{flex:1,background:"#f5f7fa",borderRadius:8,border:"0.5px solid #e5e5e5",padding:"8px 12px",display:"flex",alignItems:"center"}}>
            <textarea
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
              placeholder="Ask about entities, compliance, finance, tasks..."
              style={{flex:1,border:"none",background:"transparent",fontSize:12,outline:"none",resize:"none",lineHeight:1.5,maxHeight:80,minHeight:20,fontFamily:"inherit",color:"#111"}}
              rows={1}
            />
          </div>
          <button onClick={()=>send()} disabled={!input.trim()||loading} style={{width:36,height:36,borderRadius:8,border:"none",background:input.trim()&&!loading?CY:"#e5e5e5",color:"#fff",cursor:input.trim()&&!loading?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
            &#8594;
          </button>
        </div>
        <div style={{fontSize:10,color:"#aaa",marginTop:6,textAlign:"center"}}>Internal use only &middot; Data sourced from Affinity Core &middot; No external connection</div>
      </div>
    </div>
  );
}
