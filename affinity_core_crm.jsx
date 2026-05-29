import { useState } from "react";

const CY = "#00B4D8";
const fmt = (n,s="£") => s+Math.abs(Number(n||0)).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0});

const Bx = ({label,colors}) => <span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:colors?.bg||"#eee",color:colors?.color||"#333",whiteSpace:"nowrap"}}>{label}</span>;
const Btn = ({primary,children,onClick,sx={}}) => <button onClick={onClick} style={{padding:"5px 12px",borderRadius:5,border:primary?"none":"0.5px solid #ccc",background:primary?CY:"transparent",color:primary?"#fff":"#111",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",...sx}}>{children}</button>;
const Card = ({title,children,action}) => <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:14,marginBottom:12}}>{title&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",color:"#666"}}>{title}</div>{action}</div>}{children}</div>;
const KG = ({items,cols=4}) => <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:10,marginBottom:14}}>{items.map(k=><div key={k.l} style={{background:"#f9f9f9",borderRadius:6,padding:"10px 14px"}}><div style={{fontSize:10,color:"#666",marginBottom:3}}>{k.l}</div><div style={{fontSize:20,fontWeight:600,color:k.c||"#111"}}>{k.v}</div>{k.s&&<div style={{fontSize:10,color:"#999",marginTop:2}}>{k.s}</div>}</div>)}</KG>;
const SN = ({tabs,active,onChange}) => <div style={{display:"flex",gap:3,marginBottom:14,flexWrap:"wrap"}}>{tabs.map((t,i)=><button key={i} style={{padding:"4px 12px",fontSize:11,borderRadius:20,border:`0.5px solid ${active===i?"#ccc":"#e5e5e5"}`,background:active===i?"#fff":"transparent",color:active===i?"#111":"#666",cursor:"pointer",fontWeight:active===i?500:400,whiteSpace:"nowrap"}} onClick={()=>onChange(i)}>{t}</button>)}</div>;
const Md = ({title,onClose,children}) => <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(13,27,42,0.5)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:40,zIndex:200}} onClick={e=>e.target===e.currentTarget&&onClose()}><div style={{background:"#fff",borderRadius:10,border:"0.5px solid #e5e5e5",padding:22,width:560,maxWidth:"96vw",maxHeight:"88vh",overflowY:"auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{fontSize:14,fontWeight:600}}>{title}</div><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#aaa"}}>&#x2715;</button></div>{children}</div></div>;
const FR = ({label,type="text",opts,full,placeholder,value}) => <div style={{display:"flex",flexDirection:"column",gap:3,gridColumn:full?"1/-1":"auto",marginBottom:8}}><label style={{fontSize:11,color:"#666"}}>{label}</label>{type==="select"?<select style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",padding:"0 8px",height:32,color:"#111"}}>{(opts||[]).map(o=><option key={o}>{o}</option>)}</select>:type==="textarea"?<textarea style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",padding:"6px 8px",height:56,resize:"none",background:"#fff"}} placeholder={placeholder}/>:<input type={type} defaultValue={value} style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",padding:"0 8px",height:32,background:"#fff",color:"#111"}} placeholder={placeholder}/>}</div>;

const CONTACTS = [
  {id:1, name:"James Harrington",    company:"Harrington Family Office",  type:"Existing client",  source:"Referral",       owner:"Roxy Sheeley",  phone:"+44 7700 900123", email:"j.harrington@hfo.com",      country:"United Kingdom",  value:180000, stage:"Client",    lastContact:"14/07/2025", notes:"Existing client — Meridian Holdings + Harrington Trust. Long-standing relationship since 2018."},
  {id:2, name:"Dr Sarah Patel",       company:"Patel Ventures Ltd",        type:"Prospect",         source:"Conference",     owner:"Andy Morgan",   phone:"+971 50 123 4567", email:"s.patel@patelventures.ae",  country:"UAE",             value:95000,  stage:"Proposal",  lastContact:"10/07/2025", notes:"Met at STEP Dubai 2025. Interested in Cayman holding structure and Isle of Man trust."},
  {id:3, name:"Marco Deluca",         company:"Deluca Capital",            type:"Existing client",  source:"Direct",         owner:"Joanne Fenech", phone:"+356 9912 3456",   email:"m.deluca@delucacap.com",    country:"Malta",           value:42000,  stage:"Client",    lastContact:"07/07/2025", notes:"Director of Stonebridge Capital Ltd. Looking to expand into additional jurisdictions."},
  {id:4, name:"Wei Chen",             company:"Pacific Wealth Management", type:"Existing client",  source:"Referral",       owner:"Garry Crossan", phone:"+1 345 949 8888",  email:"w.chen@pacificwealth.ky",   country:"Cayman Islands",  value:210000, stage:"Client",    lastContact:"12/07/2025", notes:"Pacific Wealth Trust. VH risk — MLRO monitoring. Refer compliance before any new services."},
  {id:5, name:"Charlotte Beaumont",   company:"Beaumont Family Office",    type:"Prospect",         source:"Referral",       owner:"Garry Crossan", phone:"+1 345 923 1234",  email:"c.beaumont@bfo.ky",         country:"Cayman Islands",  value:320000, stage:"Negotiation",lastContact:"14/07/2025", notes:"Beaumont Wealth Structures — onboarding in progress. Foundation + 2 underlying companies expected."},
  {id:6, name:"Carlos Reyes",         company:"Suncoast Ventures",         type:"Existing client",  source:"Direct",         owner:"Andy Morgan",   phone:"+1 305 555 0192",  email:"c.reyes@suncoastvnt.com",   country:"United States",   value:38000,  stage:"Client",    lastContact:"01/07/2025", notes:"Suncoast Ventures LLC — Miami. New client 2024. Building relationship for additional structures."},
  {id:7, name:"Ingrid Björk",         company:"Nordic Wealth Partners",    type:"Prospect",         source:"LinkedIn",       owner:"Andy Morgan",   phone:"+46 70 123 4567",  email:"i.bjork@nordicwealth.se",   country:"Sweden",          value:150000, stage:"Qualified", lastContact:"05/07/2025", notes:"Interested in IOM trust and Malta foundation. HNWI with family in multiple jurisdictions. Very promising."},
  {id:8, name:"Tariq Al-Rashidi",     company:"Al-Rashidi Holdings",       type:"Prospect",         source:"Conference",     owner:"Andy Morgan",   phone:"+971 4 123 4567",  email:"t.rashidi@arr-holdings.ae", country:"UAE",             value:480000, stage:"Initial contact",lastContact:"08/07/2025", notes:"Met at Citywealth Forum. Large family office seeking to consolidate structures. Multiple jurisdictions."},
  {id:9, name:"Sophie Laurent",       company:"Apex Group",                type:"Existing client",  source:"Direct",         owner:"Garry Crossan", phone:"+1 345 814 5678",  email:"s.laurent@apexgrp.ky",     country:"Cayman Islands",  value:275000, stage:"Client",    lastContact:"12/07/2025", notes:"Apex Growth Fund — VH risk. MLRO case open. No new services without Gary Harrison clearance."},
  {id:10,name:"Robert Thornbury",     company:"Thornbury Group",           type:"Existing client",  source:"Direct",         owner:"Neil Kelly",    phone:"+44 20 7946 0958", email:"r.thornbury@thornbury.co.uk",country:"United Kingdom", value:22000,  stage:"At risk",   lastContact:"20/06/2025", notes:"Thornbury Asset Co — dormant. Consider proactive outreach to discuss restructure or wind-down."},
  {id:11,name:"Fatima Al-Zaabi",      company:"Al-Zaabi Family Office",    type:"Prospect",         source:"Referral",       owner:"Roxy Sheeley",  phone:"+971 2 555 0177",  email:"f.alzaabi@azfo.ae",         country:"UAE",             value:220000, stage:"Proposal",  lastContact:"11/07/2025", notes:"Referred by James Harrington. UHNWI. Interested in IOM trust + Cayman holding + Malta residency."},
  {id:12,name:"Lena Müller",          company:"Caledonian Group",          type:"Existing client",  source:"Direct",         owner:"Garry Crossan", phone:"+41 44 123 4567",  email:"l.muller@caledoniangrp.com",country:"Switzerland",     value:158000, stage:"Client",    lastContact:"10/07/2025", notes:"Caledonian Ventures — recent asset sale. Follow up re: reinvestment structure."},
];

const INTERACTIONS = {
  1:[
    {date:"14/07/2025",type:"Call",   summary:"Quarterly review call — satisfied with service. Discussed potential new IOM company.",       by:"Roxy Sheeley"},
    {date:"01/06/2025",type:"Meeting",summary:"Annual review meeting in London. No changes to structures.",                               by:"Andy Morgan"},
    {date:"15/03/2025",type:"Email",  summary:"Sent Q1 fee invoices. Acknowledged receipt.",                                               by:"Roxy Sheeley"},
  ],
  2:[
    {date:"10/07/2025",type:"Call",   summary:"Follow-up call after STEP Dubai. Sent proposal for Cayman holding + IOM trust structure.", by:"Andy Morgan"},
    {date:"28/06/2025",type:"Email",  summary:"Initial email introducing Affinity services following conference meeting.",                 by:"Andy Morgan"},
  ],
  5:[
    {date:"14/07/2025",type:"Meeting",summary:"Onboarding kick-off meeting. KYC collection underway. Target live by end of August.",     by:"Garry Crossan"},
    {date:"01/07/2025",type:"Email",  summary:"Sent LOE and fee schedule. Confirmed acceptance.",                                          by:"Garry Crossan"},
  ],
};

const PIPELINE = [
  {stage:"Initial contact", contacts:CONTACTS.filter(c=>c.stage==="Initial contact")},
  {stage:"Qualified",       contacts:CONTACTS.filter(c=>c.stage==="Qualified")},
  {stage:"Proposal",        contacts:CONTACTS.filter(c=>c.stage==="Proposal")},
  {stage:"Negotiation",     contacts:CONTACTS.filter(c=>c.stage==="Negotiation")},
  {stage:"Client",          contacts:CONTACTS.filter(c=>c.stage==="Client")},
  {stage:"At risk",         contacts:CONTACTS.filter(c=>c.stage==="At risk")},
];

const stageC = {
  "Initial contact":{bg:"#F1EFE8",color:"#888"},
  "Qualified":      {bg:"#E6F7FB",color:"#0077A8"},
  "Proposal":       {bg:"#EEF0FB",color:"#3C3489"},
  "Negotiation":    {bg:"#FAEEDA",color:"#633806"},
  "Client":         {bg:"#EAF3DE",color:"#27500A"},
  "At risk":        {bg:"#FCEBEB",color:"#A32D2D"},
};
const typeC = {
  "Existing client":{bg:"#EAF3DE",color:"#27500A"},
  "Prospect":       {bg:"#E6F7FB",color:"#0077A8"},
};

export default function AffinityCRM() {
  const [tab,setTab]         = useState(0);
  const [sel,setSel]         = useState(null);
  const [search,setSearch]   = useState("");
  const [typeF,setTypeF]     = useState("");
  const [ownerF,setOwnerF]   = useState("");
  const [modal,setModal]     = useState(null);

  const contact = CONTACTS.find(c=>c.id===sel);
  const interactions = sel ? (INTERACTIONS[sel]||[]) : [];

  const filtered = CONTACTS.filter(c=>
    (!search||c.name.toLowerCase().includes(search.toLowerCase())||c.company.toLowerCase().includes(search.toLowerCase()))&&
    (!typeF||c.type===typeF)&&
    (!ownerF||c.owner===ownerF)
  );

  const th={padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.4px",borderBottom:"0.5px solid #e5e5e5",background:"#f9f9f9",whiteSpace:"nowrap"};
  const td={padding:"8px 12px",fontSize:11,borderBottom:"0.5px solid #e5e5e5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};

  const totalPipelineValue = CONTACTS.filter(c=>!["Client","At risk"].includes(c.stage)).reduce((s,c)=>s+c.value,0);
  const totalClientValue   = CONTACTS.filter(c=>c.stage==="Client").reduce((s,c)=>s+c.value,0);

  return (
    <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",background:"#fff",color:"#111",minHeight:"100vh"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px",borderBottom:"0.5px solid #e5e5e5"}}>
        <div style={{fontSize:18,fontWeight:500,color:CY}}>Affinity <span style={{color:"#111",fontWeight:300}}>Core</span><small style={{fontSize:11,color:"#999",fontWeight:300,marginLeft:8}}>CRM</small></div>
        <div style={{display:"flex",gap:6}}>
          <Btn onClick={()=>setModal("contact")}>&#43; Add contact</Btn>
          <Btn primary onClick={()=>setModal("contact")}>&#43; Add prospect</Btn>
        </div>
      </div>

      <div style={{padding:"14px 20px"}}>
        <KG cols={5} items={[
          {l:"Total contacts",     v:CONTACTS.length,                                              c:CY},
          {l:"Existing clients",   v:CONTACTS.filter(c=>c.type==="Existing client").length,        c:"#4CAF7D"},
          {l:"Active prospects",   v:CONTACTS.filter(c=>c.type==="Prospect").length,               c:CY},
          {l:"Pipeline value",     v:fmt(totalPipelineValue),                                       c:"#F59E0B",  s:"Prospects"},
          {l:"Client value (AUM)", v:fmt(totalClientValue),                                         c:"#4CAF7D",  s:"Annual fees"},
        ]}/>

        <SN tabs={["All contacts","Pipeline","Prospects","Existing clients","At risk","Interactions"]} active={tab} onChange={i=>{setTab(i);setSel(null);}}/>

        {/* ALL CONTACTS */}
        {tab===0&&(
          <>
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"#fff",border:"0.5px solid #ccc",borderRadius:5,padding:"0 10px",flex:1}}>
                <span style={{color:"#aaa"}}>&#128269;</span>
                <input style={{border:"none",background:"transparent",fontSize:12,outline:"none",width:"100%",height:30,color:"#111"}} placeholder="Search contacts, companies..." value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
              <select style={{height:30,padding:"0 8px",fontSize:11,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",color:"#111"}} value={typeF} onChange={e=>setTypeF(e.target.value)}>
                <option value="">All types</option>
                <option>Existing client</option><option>Prospect</option>
              </select>
              <select style={{height:30,padding:"0 8px",fontSize:11,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",color:"#111"}} value={ownerF} onChange={e=>setOwnerF(e.target.value)}>
                <option value="">All owners</option>
                {[...new Set(CONTACTS.map(c=>c.owner))].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{display:"flex"}}>
              <table style={{flex:1,borderCollapse:"collapse",tableLayout:"fixed"}}>
                <thead><tr>
                  <th style={{...th,width:"18%"}}>Name</th>
                  <th style={{...th,width:"18%"}}>Company</th>
                  <th style={{...th,width:"10%"}}>Type</th>
                  <th style={{...th,width:"10%"}}>Stage</th>
                  <th style={{...th,width:"10%"}}>Country</th>
                  <th style={{...th,width:"10%"}}>Owner</th>
                  <th style={{...th,width:"10%",textAlign:"right"}}>Value</th>
                  <th style={{...th,width:"10%"}}>Last contact</th>
                  <th style={{...th,width:"8%"}}>Action</th>
                </tr></thead>
                <tbody>
                  {filtered.map(c=>(
                    <tr key={c.id} onClick={()=>setSel(sel===c.id?null:c.id)} style={{cursor:"pointer",borderBottom:"0.5px solid #e5e5e5",background:sel===c.id?"#f9f9f9":"transparent"}}>
                      <td style={{...td,fontWeight:600}}>{c.name}</td>
                      <td style={{...td,color:"#666"}}>{c.company}</td>
                      <td style={td}><Bx label={c.type} colors={typeC[c.type]}/></td>
                      <td style={td}><Bx label={c.stage} colors={stageC[c.stage]}/></td>
                      <td style={{...td,color:"#666"}}>{c.country}</td>
                      <td style={{...td,color:"#666"}}>{c.owner.split(" ")[0]} {c.owner.split(" ")[1]?.[0]}.</td>
                      <td style={{...td,textAlign:"right",fontWeight:600,color:CY}}>{fmt(c.value)}</td>
                      <td style={{...td,color:"#666"}}>{c.lastContact}</td>
                      <td style={td}>
                        {c.type==="Prospect"&&(
                          <Btn primary onClick={e=>{e.stopPropagation();setModal("convert");}} sx={{fontSize:10,padding:"3px 8px"}}>Convert &#8599;</Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Contact detail panel */}
              {contact&&(
                <div style={{width:280,minWidth:280,borderLeft:"0.5px solid #e5e5e5",padding:14,overflowY:"auto",maxHeight:"calc(100vh - 280px)"}}>
                  <button onClick={()=>setSel(null)} style={{float:"right",background:"none",border:"none",cursor:"pointer",color:"#aaa",fontSize:14}}>&#x2715;</button>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{contact.name}</div>
                  <div style={{fontSize:11,color:"#999",marginBottom:10}}>{contact.company}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                    <Bx label={contact.type} colors={typeC[contact.type]}/>
                    <Bx label={contact.stage} colors={stageC[contact.stage]}/>
                  </div>
                  {[["Phone",contact.phone],["Email",contact.email],["Country",contact.country],["Owner",contact.owner],["Last contact",contact.lastContact],["Value",fmt(contact.value)],["Source",contact.source]].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:11}}>
                      <span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500,textAlign:"right",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</span>
                    </div>
                  ))}
                  <div style={{marginTop:10}}>
                    <div style={{fontSize:10,color:"#aaa",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.4px"}}>Notes</div>
                    <div style={{fontSize:11,color:"#666",lineHeight:1.6,background:"#f9f9f9",borderRadius:5,padding:"8px 10px"}}>{contact.notes}</div>
                  </div>
                  {interactions.length>0&&(
                    <div style={{marginTop:12}}>
                      <div style={{fontSize:10,color:"#aaa",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.4px"}}>Recent interactions</div>
                      {interactions.slice(0,3).map((i,idx)=>(
                        <div key={idx} style={{padding:"6px 0",borderBottom:"0.5px solid #e5e5e5"}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}>
                            <Bx label={i.type} colors={{Call:{bg:"#E6F7FB",color:"#0077A8"},Meeting:{bg:"#EEF0FB",color:"#3C3489"},Email:{bg:"#F1EFE8",color:"#888"}}[i.type]||{bg:"#eee",color:"#666"}}/>
                            <span style={{color:"#aaa"}}>{i.date}</span>
                          </div>
                          <div style={{fontSize:11,color:"#666",marginTop:3,lineHeight:1.4}}>{i.summary}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,marginTop:12}}>
                    <Btn onClick={()=>setModal("interaction")} sx={{flex:1}}>&#43; Log interaction</Btn>
                    {contact.type==="Prospect"&&<Btn primary onClick={()=>setModal("convert")} sx={{flex:1}}>Convert &#8599;</Btn>}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* PIPELINE */}
        {tab===1&&(
          <div>
            <div style={{fontSize:11,color:"#666",marginBottom:12}}>
              Total pipeline value: <strong style={{color:"#F59E0B"}}>{fmt(totalPipelineValue)}</strong> across {CONTACTS.filter(c=>!["Client","At risk"].includes(c.stage)).length} prospects
            </div>
            <div style={{display:"flex",gap:0,overflowX:"auto"}}>
              {PIPELINE.filter(s=>s.stage!=="At risk").map((stage,i)=>(
                <div key={stage.stage} style={{flex:1,minWidth:160,border:"0.5px solid #e5e5e5",borderLeft:i>0?"none":undefined,padding:10,background:i%2===0?"#f9f9f9":"#fff"}}>
                  <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",color:"#666",marginBottom:4}}>{stage.stage}</div>
                  <div style={{fontSize:16,fontWeight:700,color:stageC[stage.stage]?.color||CY,marginBottom:8}}>{stage.contacts.length}</div>
                  {stage.contacts.map(c=>(
                    <div key={c.id} onClick={()=>{setSel(c.id);setTab(0);}} style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:5,padding:"8px 10px",marginBottom:6,cursor:"pointer"}}>
                      <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                      <div style={{fontSize:10,color:"#999",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.company}</div>
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                        <span style={{fontSize:10,color:"#666"}}>{c.country}</span>
                        <span style={{fontSize:10,fontWeight:600,color:CY}}>{fmt(c.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PROSPECTS */}
        {tab===2&&(
          <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
            <thead><tr>
              <th style={{...th,width:"16%"}}>Name</th>
              <th style={{...th,width:"18%"}}>Company</th>
              <th style={{...th,width:"10%"}}>Stage</th>
              <th style={{...th,width:"10%"}}>Country</th>
              <th style={{...th,width:"10%"}}>Source</th>
              <th style={{...th,width:"10%"}}>Owner</th>
              <th style={{...th,width:"10%",textAlign:"right"}}>Est. value</th>
              <th style={{...th,width:"10%"}}>Last contact</th>
              <th style={{...th,width:"8%"}}>Action</th>
            </tr></thead>
            <tbody>
              {CONTACTS.filter(c=>c.type==="Prospect").map(c=>(
                <tr key={c.id} style={{borderBottom:"0.5px solid #e5e5e5",cursor:"pointer"}} onClick={()=>{setSel(c.id);setTab(0);}}>
                  <td style={{...td,fontWeight:600}}>{c.name}</td>
                  <td style={{...td,color:"#666"}}>{c.company}</td>
                  <td style={td}><Bx label={c.stage} colors={stageC[c.stage]}/></td>
                  <td style={{...td,color:"#666"}}>{c.country}</td>
                  <td style={{...td,color:"#666"}}>{c.source}</td>
                  <td style={{...td,color:"#666"}}>{c.owner.split(" ")[0]} {c.owner.split(" ")[1]?.[0]}.</td>
                  <td style={{...td,textAlign:"right",fontWeight:600,color:"#F59E0B"}}>{fmt(c.value)}</td>
                  <td style={{...td,color:"#666"}}>{c.lastContact}</td>
                  <td style={td}><Btn primary onClick={e=>{e.stopPropagation();setSel(c.id);setModal("convert");}} sx={{fontSize:10,padding:"3px 8px"}}>Convert &#8599;</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* EXISTING CLIENTS */}
        {tab===3&&(
          <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
            <thead><tr>
              <th style={{...th,width:"16%"}}>Name</th>
              <th style={{...th,width:"18%"}}>Company</th>
              <th style={{...th,width:"10%"}}>Country</th>
              <th style={{...th,width:"12%"}}>Owner</th>
              <th style={{...th,width:"12%",textAlign:"right"}}>Annual value</th>
              <th style={{...th,width:"12%"}}>Last contact</th>
              <th style={{...th,width:"14%"}}>Action</th>
            </tr></thead>
            <tbody>
              {CONTACTS.filter(c=>c.type==="Existing client"&&c.stage!=="At risk").map(c=>(
                <tr key={c.id} style={{borderBottom:"0.5px solid #e5e5e5",cursor:"pointer"}} onClick={()=>{setSel(c.id);setTab(0);}}>
                  <td style={{...td,fontWeight:600}}>{c.name}</td>
                  <td style={{...td,color:"#666"}}>{c.company}</td>
                  <td style={{...td,color:"#666"}}>{c.country}</td>
                  <td style={{...td,color:"#666"}}>{c.owner}</td>
                  <td style={{...td,textAlign:"right",fontWeight:600,color:"#4CAF7D"}}>{fmt(c.value)}</td>
                  <td style={{...td,color:"#666"}}>{c.lastContact}</td>
                  <td style={td}><div style={{display:"flex",gap:4}}><Btn sx={{fontSize:10,padding:"3px 8px"}}>Log interaction</Btn><Btn sx={{fontSize:10,padding:"3px 8px"}}>View entities &#8599;</Btn></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* AT RISK */}
        {tab===4&&(
          <div>
            <div style={{background:"#FCEBEB22",border:"0.5px solid #EF4444",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#A32D2D",marginBottom:14}}>
              &#9888; {CONTACTS.filter(c=>c.stage==="At risk").length} client{CONTACTS.filter(c=>c.stage==="At risk").length!==1?"s":""} flagged as at risk. Review and assign outreach actions.
            </div>
            {CONTACTS.filter(c=>c.stage==="At risk").map(c=>(
              <div key={c.id} style={{background:"#fff",border:"0.5px solid #EF4444",borderRadius:8,padding:"14px 16px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700}}>{c.name} — {c.company}</div>
                    <div style={{fontSize:11,color:"#999",marginTop:2}}>{c.owner} &middot; Last contact: {c.lastContact} &middot; Annual value: {fmt(c.value)}</div>
                  </div>
                  <Bx label="At risk" colors={{bg:"#FCEBEB",color:"#A32D2D"}}/>
                </div>
                <div style={{fontSize:11,color:"#666",lineHeight:1.6,background:"#f9f9f9",borderRadius:5,padding:"8px 10px",marginTop:10}}>{c.notes}</div>
                <div style={{display:"flex",gap:6,marginTop:10}}>
                  <Btn>&#43; Log interaction</Btn>
                  <Btn primary>Action plan &#8599;</Btn>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* INTERACTIONS */}
        {tab===5&&(
          <div>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <Btn primary onClick={()=>setModal("interaction")}>&#43; Log interaction</Btn>
            </div>
            {Object.entries(INTERACTIONS).flatMap(([id,ints])=>
              ints.map((i,idx)=>{
                const c=CONTACTS.find(x=>x.id===Number(id));
                return {...i,contactName:c?.name,company:c?.company,key:`${id}-${idx}`};
              })
            ).sort((a,b)=>b.date.localeCompare(a.date)).map(i=>(
              <div key={i.key} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 0",borderBottom:"0.5px solid #e5e5e5"}}>
                <div style={{width:60,textAlign:"center",flexShrink:0}}>
                  <Bx label={i.type} colors={{Call:{bg:"#E6F7FB",color:"#0077A8"},Meeting:{bg:"#EEF0FB",color:"#3C3489"},Email:{bg:"#F1EFE8",color:"#888"}}[i.type]||{bg:"#eee",color:"#666"}}/>
                  <div style={{fontSize:9,color:"#aaa",marginTop:4}}>{i.date}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:2}}>{i.contactName} — {i.company}</div>
                  <div style={{fontSize:11,color:"#666",lineHeight:1.5}}>{i.summary}</div>
                  <div style={{fontSize:10,color:"#aaa",marginTop:4}}>Logged by {i.by}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal==="contact"&&(
        <Md title="Add contact / prospect" onClose={()=>setModal(null)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <FR label="Full name" placeholder="Full legal name" full/>
            <FR label="Company / family office" placeholder="Company name"/>
            <FR label="Type" type="select" opts={["Prospect","Existing client"]}/>
            <FR label="Stage" type="select" opts={["Initial contact","Qualified","Proposal","Negotiation","Client"]}/>
            <FR label="Phone" placeholder="+44..." />
            <FR label="Email" placeholder="email@domain.com"/>
            <FR label="Country" placeholder="Country of residence"/>
            <FR label="Source" type="select" opts={["Referral","Conference","Direct","LinkedIn","Website","Other"]}/>
            <FR label="Owner" type="select" opts={["Andy Morgan","Roxy Sheeley","Garry Crossan","Joanne Fenech","Neil Kelly"]}/>
            <FR label="Estimated annual value" type="number" placeholder="0"/>
            <FR label="Notes" type="textarea" full placeholder="Background, interests, referral context..."/>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
            <Btn onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn primary onClick={()=>setModal(null)}>Save contact</Btn>
          </div>
        </Md>
      )}
      {modal==="convert"&&(
        <Md title="Convert prospect to onboarding" onClose={()=>setModal(null)}>
          <div style={{background:"#EAF3DE22",border:"0.5px solid #4CAF7D",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#27500A",marginBottom:14}}>
            &#10003; Converting this prospect will create a new onboarding case and move the contact to Existing client status.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <FR label="Entity name (legal)" placeholder="Full legal entity name" full/>
            <FR label="Entity type" type="select" opts={["Company","Trust","Foundation","LLC","Partnership"]}/>
            <FR label="Jurisdiction" type="select" opts={["Isle of Man","Malta","Cayman Islands","United Kingdom","Miami","South Dakota","BVI","Jersey","Guernsey"]}/>
            <FR label="Administrator" type="select" opts={["Roxy Sheeley","Garry Crossan","Joanne Fenech","Neil Kelly","Andy Morgan"]}/>
            <FR label="Target completion" placeholder="DD/MM/YYYY"/>
            <FR label="Source" type="select" opts={["New business","Transfer in"]}/>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
            <Btn onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn primary onClick={()=>setModal(null)}>Convert &amp; create onboarding case &#8599;</Btn>
          </div>
        </Md>
      )}
      {modal==="interaction"&&(
        <Md title="Log interaction" onClose={()=>setModal(null)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <FR label="Contact" type="select" opts={CONTACTS.map(c=>c.name)} full/>
            <FR label="Interaction type" type="select" opts={["Call","Meeting","Email","Video call","Event","Other"]}/>
            <FR label="Date" placeholder="DD/MM/YYYY"/>
            <FR label="Logged by" type="select" opts={["Andy Morgan","Roxy Sheeley","Garry Crossan","Joanne Fenech","Neil Kelly","Gary Harrison"]}/>
            <FR label="Summary" type="textarea" full placeholder="What was discussed, outcomes, next steps..."/>
            <FR label="Next action" placeholder="e.g. Send proposal by 21/07/2025" full/>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
            <Btn onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn primary onClick={()=>setModal(null)}>Save interaction</Btn>
          </div>
        </Md>
      )}
    </div>
  );
}
