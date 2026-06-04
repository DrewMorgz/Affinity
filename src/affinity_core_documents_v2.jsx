import { useState } from "react";

const CY = "#00C4CC";

const Bx = ({label,colors}) => <span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:colors?.bg||"#eee",color:colors?.color||"#333",whiteSpace:"nowrap"}}>{label}</span>;
const Btn = ({primary,children,onClick,sx={}}) => <button onClick={onClick} style={{padding:"5px 12px",borderRadius:5,border:primary?"none":"0.5px solid #ccc",background:primary?CY:"transparent",color:primary?"#fff":"#111",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",...sx}}>{children}</button>;
const Md = ({title,onClose,children}) => <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(13,27,42,0.5)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:40,zIndex:200}} onClick={e=>e.target===e.currentTarget&&onClose()}><div style={{background:"#fff",borderRadius:10,border:"0.5px solid #e5e5e5",padding:22,width:520,maxWidth:"96vw",maxHeight:"88vh",overflowY:"auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{fontSize:14,fontWeight:600}}>{title}</div><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#aaa"}}>✕</button></div>{children}</div></div>;

// Full folder structure per brief
const FOLDER_TREE = [
  {name:"Accounts",subs:["AEOI","Budgets/Funding Requests","Captains Cash","Financial Statements","Management Accounts","Payroll","Player Reconciliations","Substance","Year End"]},
  {name:"Aircraft/Yacht", subs:["Aircraft/Yacht Documents","Charter","Construction","Crew","Import & Export","Purchase","Radio/EPIRB","Registration","Sale"]},
  {name:"Bank",           subs:["Application Forms/Mandate","Payments","Source of Funds","Statements"]},
  {name:"Correspondence", subs:["Correspondence","Emails"]},
  {name:"Data Protection",subs:["DPIA's","Policy and Procedures","Registration/Renewals"]},
  {name:"Delete Documents",subs:["Delete"]},
  {name:"Duty & Taxes",   subs:["GDR","Tax","VAT"]},
  {name:"E-Gaming",subs:["License Applications","Licenses","OGRA Regulatory Returns","Policies & Procedures","Registers","Regulation","Regulatory Inspection","Technological Risk Assessments","Test Certificates"]},
  {name:"FINTECH",        subs:["DBA Applications","Policies & Procedures","Registers","Regulation"]},
  {name:"Insurance",      subs:["Insurance"]},
  {name:"Investments",    subs:["Portfolio Statements","Share Certificates"]},
  {name:"Invoices",subs:["Purchase Invoices — Q1","Purchase Invoices — Q2","Purchase Invoices — Q3","Purchase Invoices — Q4","Sales Invoices — Q1","Sales Invoices — Q2","Sales Invoices — Q3","Sales Invoices — Q4"]},
  {name:"KYC",            subs:["CDD","LOE/Fees","Onboarding","Ongoing Monitoring","Source of Wealth"]},
  {name:"Permanent",      subs:["Agreements","Dividend Vouchers","Legal"]},
  {name:"Property",subs:["Licences","Management","Purchase","Sale"]},
  {name:"Statutory",      subs:["Certificate of Incorporation/Name Change","Memorandum & Articles of Association","Minutes of Meetings","Powers of Attorney","Shares","Statutory Documents"]},
  {name:"Group",          subs:["Brand","Competitor Fees","Insurance","Marketing and Business Development","Proposals","Strategy","Travel"]},
];

// Sample documents per folder
const DOCS = [
  {id:1,  entity:"Harrington Family Trust",   folder:"KYC",           subfolder:"CDD",                        name:"Emma Harrington — Passport",          status:"Expired",     date:"01/07/2019",expiry:"22/04/2024",by:"Roxy Sheeley",  size:"1.2MB"},
  {id:2,  entity:"Harrington Family Trust",   folder:"Statutory",     subfolder:"Memorandum & Articles of Association",name:"Trust deed",                  status:"Executed",    date:"05/07/2019",expiry:null,       by:"Roxy Sheeley",  size:"3.4MB"},
  {id:3,  entity:"Apex Growth Fund Ltd",      folder:"KYC",           subfolder:"CDD",                        name:"Worldcheck result — Apex Growth Fund", status:"Current",     date:"12/07/2025",expiry:"12/07/2026",by:"Gary Harrison", size:"0.8MB"},
  {id:4,  entity:"Stonebridge Capital Ltd",   folder:"Statutory",     subfolder:"Minutes of Meetings",        name:"Board resolution — director appt",     status:"Under review",date:"01/07/2025",expiry:null,       by:"Joanne Fenech", size:"0.5MB"},
  {id:5,  entity:"Meridian Holdings Ltd",     folder:"Accounts",      subfolder:"Management Accounts",        name:"Q1 2025 management accounts",          status:"Executed",    date:"10/04/2025",expiry:null,       by:"Neil Kelly",    size:"2.1MB"},
  {id:6,  entity:"Pacific Wealth Trust",      folder:"KYC",           subfolder:"CDD",                        name:"EDD pack — Wei Chen",                  status:"Draft",       date:"10/07/2025",expiry:null,       by:"Garry Crossan", size:"4.2MB"},
  {id:7,  entity:"North Star Holdings Ltd",   folder:"Correspondence", subfolder:"Correspondence",             name:"Client attrition letter",              status:"Under review",date:"15/01/2025",expiry:null,       by:"Roxy Sheeley",  size:"0.3MB"},
  {id:8,  entity:"Caledonian Ventures Ltd",   folder:"Permanent",     subfolder:"Agreements",                 name:"Asset sale agreement — April 2024",    status:"Executed",    date:"20/04/2024",expiry:null,       by:"Garry Crossan", size:"1.8MB"},
  {id:9,  entity:"Meridian Holdings Ltd",     folder:"Bank",          subfolder:"Statements",                 name:"Barclays statement — June 2025",        status:"Current",     date:"01/07/2025",expiry:null,       by:"Neil Kelly",    size:"0.6MB"},
  {id:10, entity:"Harrington Family Trust",   folder:"KYC",           subfolder:"Source of Wealth",           name:"SOW declaration — James Harrington",   status:"Current",     date:"05/03/2025",expiry:"05/03/2027",by:"Roxy Sheeley",  size:"0.9MB"},
  {id:11, entity:"Rosewood Legacy Trust",     folder:"Statutory",     subfolder:"Certificate of Incorporation/Name Change",name:"Certificate of incorporation",status:"Executed",date:"25/04/2021",expiry:null,       by:"Roxy Sheeley",  size:"0.4MB"},
  {id:12, entity:"Azure Mediterranean Fdn",   folder:"Accounts",      subfolder:"Financial Statements",       name:"FY2024 audited accounts",              status:"Executed",    date:"30/06/2025",expiry:null,       by:"Joanne Fenech", size:"5.1MB"},
];

const statusColors = {
  Current:      {bg:"#EAF3DE",color:"#27500A"},
  Executed:     {bg:"#EAF3DE",color:"#27500A"},
  "Under review":{bg:"#FAEEDA",color:"#633806"},
  Draft:        {bg:"#FAEEDA",color:"#633806"},
  Expired:      {bg:"#FCEBEB",color:"#A32D2D"},
};

const ENTITIES = ["Meridian Holdings Ltd","Harrington Family Trust","Caledonian Ventures Ltd","Azure Mediterranean Fdn","Pacific Wealth Trust","Stonebridge Capital Ltd","North Star Holdings Ltd","Rosewood Legacy Trust","Apex Growth Fund Ltd"];

export default function AffinityDMS() {
  const [entity,setEntity]   = useState("Meridian Holdings Ltd");
  const [openFolders,setOpen] = useState({"KYC":true});
  const [selFolder,setSelF]   = useState({folder:"KYC",sub:"CDD"});
  const [sel,setSel]          = useState(null);
  const [tab,setTab]          = useState(0); // 0=DMS, 1=Expiring, 2=Approvals, 3=Generate
  const [modal,setModal]      = useState(null);
  const [dragOver,setDragOver] = useState(false);
  const [isAdmin]             = useState(true); // would come from user role

  const toggleFolder = name => setOpen(p=>({...p,[name]:!p[name]}));

  const folderDocs = DOCS.filter(d=>
    d.entity===entity&&
    (!selFolder.folder||d.folder===selFolder.folder)&&
    (!selFolder.sub||d.subfolder===selFolder.sub)
  );
  const selDoc = sel ? DOCS.find(d=>d.id===sel) : null;

  const th={padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.4px",borderBottom:"0.5px solid #e5e5e5",background:"#f9f9f9",whiteSpace:"nowrap"};
  const td={padding:"8px 12px",fontSize:11,borderBottom:"0.5px solid #e5e5e5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};

  const tabs = ["Document folders","Expiring / expired","Approvals","Generate document"];

  return (
    <div style={{fontFamily:"'Catamaran',system-ui,sans-serif",background:"#fff",color:"#111",height:"calc(100vh - 48px)",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* Toolbar */}
      <div style={{padding:"8px 16px",borderBottom:"0.5px solid #e5e5e5",display:"flex",gap:6,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        {tabs.map((t,i)=><button key={i} style={{padding:"4px 12px",fontSize:11,borderRadius:20,border:`0.5px solid ${tab===i?"#ccc":"#e5e5e5"}`,background:tab===i?"#fff":"transparent",color:tab===i?"#111":"#666",cursor:"pointer",fontWeight:tab===i?500:400,whiteSpace:"nowrap"}} onClick={()=>setTab(i)}>{t}{i===2&&DOCS.filter(d=>d.status==="Under review"||d.status==="Draft").length>0&&<span style={{marginLeft:4,background:"#EF4444",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700}}>{DOCS.filter(d=>d.status==="Under review"||d.status==="Draft").length}</span>}</button>)}
        <div style={{position:"relative",marginLeft:"auto"}}>
          <input list="dms-entities" value={entity} onChange={e=>setEntity(e.target.value)}
            placeholder="Search entity…"
            style={{height:28,padding:"0 10px",fontSize:11,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",color:"#111",minWidth:200,outline:"none"}}/>
          <datalist id="dms-entities">{ENTITIES.map(e=><option key={e} value={e}/>)}</datalist>
        </div>
        <Btn primary onClick={()=>setModal("upload")}>↑ Upload</Btn>
      </div>

      {/* DMS TAB — folder tree + documents */}
      {tab===0&&(
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* Folder tree */}
          <div style={{width:240,minWidth:240,borderRight:"0.5px solid #e5e5e5",overflowY:"auto",background:"#f9f9f9",flexShrink:0}}>
            <div style={{padding:"10px 12px",fontSize:10,fontWeight:600,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"0.5px solid #e5e5e5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              Folders
              {isAdmin&&<button style={{background:"none",border:"none",cursor:"pointer",color:CY,fontSize:11}}>+ New folder</button>}
            </div>
            {FOLDER_TREE.map(f=>(
              <div key={f.name}>
                <div onClick={()=>toggleFolder(f.name)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",cursor:"pointer",background:selFolder.folder===f.name&&!selFolder.sub?"#fff":"transparent",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}>
                  <span style={{fontSize:10,color:"#aaa",width:12,flexShrink:0}}>{openFolders[f.name]?"▼":"►"}</span>
                  
                  <span style={{fontWeight:selFolder.folder===f.name?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                  <span style={{marginLeft:"auto",fontSize:9,color:"#aaa",flexShrink:0}}>{DOCS.filter(d=>d.folder===f.name&&d.entity===entity).length||""}</span>
                </div>
                {openFolders[f.name]&&f.subs.map(sub=>{
                  const count = DOCS.filter(d=>d.folder===f.name&&d.subfolder===sub&&d.entity===entity).length;
                  if(!isAdmin&&count===0) return null; // hide empty folders for non-admins
                  return (
                    <div key={sub} onClick={()=>setSelF({folder:f.name,sub})} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px 5px 32px",cursor:"pointer",background:selFolder.folder===f.name&&selFolder.sub===sub?"#E6F7FB":"transparent",fontSize:11,borderBottom:"0.5px solid #f0f0f0"}}>
                      <span style={{fontSize:12}}>📄</span>
                      <span style={{color:selFolder.folder===f.name&&selFolder.sub===sub?CY:"#555",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub}</span>
                      {count>0&&<span style={{marginLeft:"auto",fontSize:9,color:CY,fontWeight:600,flexShrink:0}}>{count}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Document list */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {selFolder.folder==="Correspondence" && selFolder.sub==="Emails" ? (
            <div style={{padding:"12px 16px",overflowY:"auto",flex:1}}>
              {/* Email filing — both methods now go into Correspondence > Emails */}
          <div style={{background:"#E6F7FB22",border:`0.5px solid ${CY}`,borderRadius:8,padding:"12px 14px",marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
              <div style={{fontSize:12,fontWeight:600}}>📧 Email filing — files into Correspondence / Emails</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:10}}>
              <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:6,padding:12}}>
                <div style={{fontSize:11,fontWeight:600,marginBottom:6}}>Method 1 — Drag from Outlook</div>
                <div style={{fontSize:11,color:"#666",lineHeight:1.6}}>1. Open the entity in the DMS<br/>2. Drag the email from Outlook into the Correspondence / Emails folder<br/>3. Complete the metadata popup<br/>4. Filed as .msg or .eml</div>
              </div>
              <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:6,padding:12}}>
                <div style={{fontSize:11,fontWeight:600,marginBottom:6}}>Method 2 — Outlook add-in</div>
                <div style={{fontSize:11,color:"#666",lineHeight:1.6}}>1. Open the email in Outlook<br/>2. Click the Affinity Core add-in button<br/>3. Pick entity from the dropdown — filing target defaults to Correspondence / Emails<br/>4. Click File</div>
              </div>
            </div>
            <div style={{fontSize:10,color:"#888",marginBottom:10}}>Both methods are supported. Emails always land in the entity's Correspondence / Emails subfolder unless you override the destination.</div>
            <div style={{marginTop:10,paddingTop:10,borderTop:"0.5px solid #e5e5e5"}}>
              <div style={{fontSize:11,fontWeight:600,marginBottom:8}}>Recently filed emails</div>
              <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:6,overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"140px 140px 1fr 110px 40px",gap:0,padding:"6px 10px",background:"#fafafa",fontSize:10,fontWeight:600,color:"#666",textTransform:"uppercase",letterSpacing:"0.3px",borderBottom:"0.5px solid #e5e5e5"}}>
                  <div>To</div><div>From</div><div>Subject</div><div>Date</div><div></div>
                </div>
                {[
                  {from:"Roxy Sheeley",     to:"emma.harrington@gmail.com",       subject:"RE: Q2 retainer invoice — Meridian Holdings",      date:"14 Jul 14:22", entity:"Meridian Holdings Ltd"},
                  {from:"Garry Crossan",    to:"david.silver@silverstone.ky",     subject:"FW: KYC renewal — Emma Harrington",                date:"14 Jul 11:30", entity:"Harrington Family Trust"},
                  {from:"Gary Harrison",    to:"compliance@apexgrowth.com",       subject:"RE: Apex sanctions review — MLRO",                 date:"14 Jul 09:08", entity:"Apex Growth Fund Ltd"},
                  {from:"Andrew Morgan",    to:"sofia.adriatic@adriatic.mt",      subject:"Onboarding pack — Adriatic Holdings",              date:"13 Jul 16:45", entity:"Adriatic Holdings Ltd"},
                  {from:"Joanne Fenech",    to:"verona.digital@vdh.com.mt",       subject:"MFSA licence — Verona Digital structure approved", date:"13 Jul 14:12", entity:"Verona Digital Holdings Ltd"},
                  {from:"Neil Kelly",       to:"andrew@stonebridge-capital.co.uk", subject:"Q3 invoice — annual administration fees",         date:"12 Jul 17:30", entity:"Stonebridge Capital Ltd"},
                  {from:"Colin Quayle",     to:"board@meridian-holdings.com",     subject:"Director resolution — capital reorganisation",     date:"12 Jul 15:02", entity:"Meridian Holdings Ltd"},
                  {from:"Alexandra Gardner",to:"counsel@bluewater.fl",            subject:"FATCA reporting — Bluewater Trust",                date:"12 Jul 10:45", entity:"Bluewater Family Trust"},
                  {from:"Krista Fenech",    to:"kyc@azure-med.mt",                subject:"FW: Source of funds documentation",                date:"11 Jul 16:22", entity:"Azure Mediterranean Foundation"},
                  {from:"Michael Barlow",   to:"compliance@pacific-wealth.ky",    subject:"EDD review outstanding — please respond",          date:"11 Jul 13:50", entity:"Pacific Wealth Trust"},
                  {from:"Roxy Sheeley",     to:"david.thornbury@asset-co.co.uk",  subject:"AGM minutes for signature — Thornbury Asset Co",   date:"10 Jul 09:15", entity:"Thornbury Asset Co Ltd"},
                  {from:"Mattei Pisani",    to:"k.papadopoulos@silverstone.ky",   subject:"Silverstone Capital Fund — Cayman registration",   date:"09 Jul 11:08", entity:"Silverstone Capital Fund"},
                ].map((e,i)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"140px 140px 1fr 110px 40px",gap:0,padding:"8px 10px",borderBottom:i<11?"0.5px solid #f0f0f0":"none",fontSize:11,alignItems:"center"}}>
                    <div style={{color:"#666",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.to}</div>
                    <div style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.from}</div>
                    <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      <span style={{color:"#888"}}>✉ </span>{e.subject}
                      <span style={{color:"#aaa",fontSize:10,marginLeft:6}}>· {e.entity}</span>
                    </div>
                    <div style={{color:"#888",fontSize:10}}>{e.date}</div>
                    <div><Btn sx={{fontSize:9,padding:"2px 6px"}}>👁</Btn></div>
                  </div>
                ))}
              </div>
            </div>
            </div>
            </div>
          ) : (
          <>
            {/* Drop zone */}
            <div
              onDragOver={e=>{e.preventDefault();setDragOver(true);}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);setModal("metadata");}}
              style={{padding:"8px 14px",background:dragOver?"#E6F7FB":"#f9f9f9",borderBottom:"0.5px solid #e5e5e5",fontSize:11,color:dragOver?CY:"#aaa",textAlign:"center",flexShrink:0,cursor:"pointer",transition:"all 0.1s"}}
              onClick={()=>setModal("upload")}
            >
              {dragOver?"Release to upload to this folder ⇧":"⇧ Drag & drop files here or click to upload &mdash; "+selFolder.folder+(selFolder.sub?" / "+selFolder.sub:"")}
            </div>
            <div style={{padding:"8px 14px",borderBottom:"0.5px solid #e5e5e5",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{fontSize:12,fontWeight:600}}>{selFolder.sub||selFolder.folder||"All documents"}</div>
              <div style={{fontSize:11,color:"#aaa"}}>{folderDocs.length} document{folderDocs.length!==1?"s":""}</div>
            </div>
            <div style={{flex:1,overflowY:"auto",display:"flex"}}>
              <table style={{flex:1,borderCollapse:"collapse",tableLayout:"fixed",height:"fit-content"}}>
                <thead><tr>
                  <th style={{...th,width:"4%"}}></th>
                  <th style={{...th,width:"30%"}}>Document name</th>
                  <th style={{...th,width:"20%"}}>Entity</th>
                  <th style={{...th,width:"11%"}}>Status</th>
                  <th style={{...th,width:"10%"}}>Date</th>
                  <th style={{...th,width:"10%"}}>Expiry</th>
                  <th style={{...th,width:"7%"}}>Size</th>
                  <th style={{...th,width:"8%"}}>By</th>
                </tr></thead>
                <tbody>
                  {folderDocs.length===0&&(
                    <tr><td colSpan={8} style={{...td,textAlign:"center",color:"#aaa",padding:30}}>No documents in this folder. Drag & drop to upload.</td></tr>
                  )}
                  {folderDocs.map(d=>(
                    <tr key={d.id} onClick={()=>setSel(sel===d.id?null:d.id)} style={{cursor:"pointer",borderBottom:"0.5px solid #e5e5e5",background:sel===d.id?"#f0fafe":"transparent"}}>
                      <td style={{...td,textAlign:"center",fontSize:16}}>{d.folder==="KYC"?"📻":d.folder==="Statutory"?"📄":d.folder==="Accounts"?"📊":"📄"}</td>
                      <TD v={d.name} bold/>
                      <td style={{...td,color:"#666",fontSize:10}}>{d.entity}</td>
                      <td style={td}><Bx label={d.status} colors={statusColors[d.status]}/></td>
                      <td style={{...td,color:"#666",fontSize:10}}>{d.date}</td>
                      <td style={{...td,color:d.status==="Expired"?"#EF4444":"#666",fontSize:10}}>{d.expiry||"—"}</td>
                      <td style={{...td,color:"#aaa",fontSize:10}}>{d.size}</td>
                      <td style={{...td,color:"#aaa",fontSize:10}}>{d.by.split(" ")[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Doc detail panel */}
              {selDoc&&(
                <div style={{width:220,minWidth:220,borderLeft:"0.5px solid #e5e5e5",padding:14,overflowY:"auto"}}>
                  <button onClick={()=>setSel(null)} style={{float:"right",background:"none",border:"none",cursor:"pointer",color:"#aaa",fontSize:14}}>✕</button>
                  <div style={{fontSize:12,fontWeight:600,lineHeight:1.4,marginBottom:4}}>{selDoc.name}</div>
                  <div style={{fontSize:10,color:"#999",marginBottom:10}}>{selDoc.entity}</div>
                  <Bx label={selDoc.status} colors={statusColors[selDoc.status]}/>
                  {[["Folder",selDoc.folder+" / "+selDoc.subfolder],["Date",selDoc.date],["Expiry",selDoc.expiry||"No expiry"],["Size",selDoc.size],["Uploaded by",selDoc.by]].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:11,marginTop:8}}>
                      <span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500,fontSize:10,textAlign:"right",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:5,marginTop:12,flexWrap:"wrap"}}>
                    <Btn sx={{flex:1,fontSize:10}}>↓ Download</Btn>
                    <Btn sx={{flex:1,fontSize:10}}>👁 Preview</Btn>
                    {selDoc.status==="Under review"&&<Btn primary sx={{width:"100%",fontSize:10,marginTop:4}}>Approve ✓</Btn>}
                  </div>
                </div>
              )}
            </div>
          </>
          )}
          </div>
        </div>
      )}

      {/* EXPIRING */}
      {tab===1&&(
        <div style={{padding:16,overflowY:"auto",flex:1}}>
          <div style={{fontSize:12,fontWeight:600,marginBottom:12}}>Expiring &amp; expired documents</div>
          {[
            ...DOCS.filter(d=>d.status==="Expired"),
            ...DOCS.filter(d=>d.expiry&&d.status!=="Expired"),
          ].map(d=>(
            <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"0.5px solid #e5e5e5"}}>
              <div>
                <div style={{fontSize:12,fontWeight:500}}>{d.name}</div>
                <div style={{fontSize:11,color:"#999",marginTop:2}}>{d.entity} &middot; {d.folder} / {d.subfolder} &middot; Expiry: <span style={{color:d.status==="Expired"?"#EF4444":"#F59E0B",fontWeight:500}}>{d.expiry}</span></div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <Bx label={d.status} colors={statusColors[d.status]}/>
                <Btn>Request renewal</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* APPROVALS */}
      {tab===2&&(
        <div style={{padding:16,overflowY:"auto",flex:1}}>
          <div style={{fontSize:12,fontWeight:600,marginBottom:12}}>Documents awaiting approval</div>
          {DOCS.filter(d=>d.status==="Under review"||d.status==="Draft").map(d=>(
            <div key={d.id} style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:"12px 14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{d.name}</div>
                <div style={{fontSize:11,color:"#999",marginTop:2}}>{d.entity} &middot; {d.folder} / {d.subfolder} &middot; {d.date} by {d.by}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <Btn>👁 Preview</Btn>
                <Btn>Return</Btn>
                <Btn primary>Approve ✓</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* GENERATE DOCUMENT */}
      {tab===3&&(
        <div style={{padding:16,overflowY:"auto",flex:1}}>
          {["Onboarding","Correspondence","Statutory"].map(section=>(
            <div key={section} style={{marginBottom:20}}>
              <div style={{fontSize:12,fontWeight:700,color:CY,marginBottom:10,borderBottom:"0.5px solid #e5e5e5",paddingBottom:6}}>{section}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {(section==="Onboarding"?["KYC request letter","New business questionnaire","Source of wealth request","Portal invitation","Client welcome letter"]:
                  section==="Correspondence"?["General correspondence","File note","Meeting minutes","Engagement letter","Termination notice","Reminder letter"]:
                  ["Board resolution — director appointment","Board resolution — dividend declaration","Board resolution — general","Share transfer form","Register of members","Register of directors","Register of charges","Powers of attorney","Annual return draft","Certificate of incumbency","Certificate of good standing","Structure chart"]
                ).map(t=>(
                  <div key={t} style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:6,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12}}>{t}</span>
                    <div style={{display:"flex",gap:4}}>
                      <select style={{height:26,fontSize:10,borderRadius:4,border:"0.5px solid #ccc",background:"#fff",padding:"0 4px"}}>
                        {ENTITIES.slice(1).map(e=><option key={e}>{e.split(" ").slice(0,2).join(" ")}</option>)}
                      </select>
                      <Btn primary sx={{fontSize:10,padding:"3px 8px"}}>Generate ↗</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}


      {/* Upload modal */}
      {modal==="upload"&&(
        <Md title={"Upload to "+selFolder.folder+(selFolder.sub?" / "+selFolder.sub:"")} onClose={()=>setModal(null)}>
          <div style={{border:"2px dashed #ccc",borderRadius:8,padding:20,textAlign:"center",marginBottom:14,color:"#aaa",fontSize:12,cursor:"pointer"}} onClick={()=>{}}>
            ⇧ Drag & drop files here or <span style={{color:CY}}>browse</span><br/>
            <span style={{fontSize:10}}>PDF, Word, Excel, image — max 50MB</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Entity","select",ENTITIES.slice(1)],["Document name","text"],["Document date","text","DD/MM/YYYY"],["Expiry date (if applicable)","text","DD/MM/YYYY or N/A"],["Version","text","e.g. v1"],["Confidential","select",["No","Yes — restricted access"]]].map(([l,t,opts])=>(
              <div key={l} style={{display:"flex",flexDirection:"column",gap:3}}>
                <label style={{fontSize:11,color:"#666"}}>{l}</label>
                {t==="select"
                  ?<select style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",padding:"0 8px",height:32}}>{(Array.isArray(opts)?opts:[]).map(o=><option key={o}>{o}</option>)}</select>
                  :<input type="text" style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",padding:"0 8px",height:32,background:"#fff"}} placeholder={typeof opts==="string"?opts:""}/>
                }
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
            <Btn onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn primary onClick={()=>setModal(null)}>Upload &amp; classify</Btn>
          </div>
        </Md>
      )}

      {/* Metadata popup (after drag drop) */}
      {modal==="metadata"&&(
        <Md title="Add document metadata" onClose={()=>setModal(null)}>
          <div style={{background:"#EAF3DE22",border:"0.5px solid #4CAF7D",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#27500A",marginBottom:12}}>
            ✓ File dropped into <strong>{selFolder.folder} / {selFolder.sub}</strong>. Please complete the metadata below.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Entity","select",ENTITIES.slice(1)],["Document name","text"],["Document date","text","DD/MM/YYYY"],["Expiry date","text","DD/MM/YYYY or N/A"],["Version","text","e.g. v1"],["Notes","text","Optional"]].map(([l,t,opts])=>(
              <div key={l} style={{display:"flex",flexDirection:"column",gap:3}}>
                <label style={{fontSize:11,color:"#666"}}>{l}</label>
                {t==="select"
                  ?<select style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",padding:"0 8px",height:32}}>{(Array.isArray(opts)?opts:[]).map(o=><option key={o}>{o}</option>)}</select>
                  :<input type="text" style={{fontSize:12,borderRadius:5,border:"0.5px solid #ccc",padding:"0 8px",height:32,background:"#fff"}} placeholder={typeof opts==="string"?opts:""}/>
                }
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
            <Btn onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn primary onClick={()=>setModal(null)}>Save &amp; file document</Btn>
          </div>
        </Md>
      )}

    </div>
  );
}

function TD({v,bold}) {
  return <td style={{padding:"8px 12px",fontSize:11,fontWeight:bold?600:400,borderBottom:"0.5px solid #e5e5e5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</td>;
}
