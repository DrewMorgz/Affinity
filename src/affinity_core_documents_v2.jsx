import { useState } from "react";

const CY = "#00B4D8";

const Bx = ({label,colors}) => <span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:colors?.bg||"#eee",color:colors?.color||"#333",whiteSpace:"nowrap"}}>{label}</span>;
const Btn = ({primary,children,onClick,sx={}}) => <button onClick={onClick} style={{padding:"5px 12px",borderRadius:5,border:primary?"none":"0.5px solid #ccc",background:primary?CY:"transparent",color:primary?"#fff":"#111",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",...sx}}>{children}</button>;
const Md = ({title,onClose,children}) => <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(13,27,42,0.5)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:40,zIndex:200}} onClick={e=>e.target===e.currentTarget&&onClose()}><div style={{background:"#fff",borderRadius:10,border:"0.5px solid #e5e5e5",padding:22,width:520,maxWidth:"96vw",maxHeight:"88vh",overflowY:"auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{fontSize:14,fontWeight:600}}>{title}</div><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#aaa"}}>&#x2715;</button></div>{children}</div></div>;

// Full folder structure per brief
const FOLDER_TREE = [
  {name:"Accounts",       icon:"&#128194;",subs:["AEOI","Budgets/Funding Requests","Captains Cash","Financial Statements","Management Accounts","Payroll","Player Reconciliations","Substance","Year End"]},
  {name:"Aircraft/Yacht", icon:"&#128194;",subs:["Aircraft/Yacht Documents","Charter","Construction","Crew","Import & Export","Purchase","Radio/EPIRB","Registration","Sale"]},
  {name:"Bank",           icon:"&#128194;",subs:["Application Forms/Mandate","Payments","Source of Funds","Statements"]},
  {name:"Correspondence", icon:"&#128194;",subs:["Correspondence","Emails"]},
  {name:"Data Protection",icon:"&#128194;",subs:["DPIA's","Policy and Procedures","Registration/Renewals"]},
  {name:"Delete Documents",icon:"&#128194;",subs:["Delete"]},
  {name:"Duty & Taxes",   icon:"&#128194;",subs:["GDR","Tax","VAT"]},
  {name:"E-Gaming",       icon:"&#128194;",subs:["License Applications","Licenses","OGRA Regulatory Returns","Policies & Procedures","Registers","Regulation","Regulatory Inspection","Technological Risk Assessments","Test Certificates"]},
  {name:"FINTECH",        icon:"&#128194;",subs:["DBA Applications","Policies & Procedures","Registers","Regulation"]},
  {name:"Insurance",      icon:"&#128194;",subs:["Insurance"]},
  {name:"Investments",    icon:"&#128194;",subs:["Portfolio Statements","Share Certificates"]},
  {name:"Invoices",       icon:"&#128194;",subs:["Purchase Invoices — Q1","Purchase Invoices — Q2","Purchase Invoices — Q3","Purchase Invoices — Q4","Sales Invoices — Q1","Sales Invoices — Q2","Sales Invoices — Q3","Sales Invoices — Q4"]},
  {name:"KYC",            icon:"&#128194;",subs:["CDD","LOE/Fees","Onboarding","Ongoing Monitoring","Source of Wealth"]},
  {name:"Permanent",      icon:"&#128194;",subs:["Agreements","Dividend Vouchers","Legal"]},
  {name:"Property",       icon:"&#128194;",subs:["Licences","Management","Purchase","Sale"]},
  {name:"Statutory",      icon:"&#128194;",subs:["Certificate of Incorporation/Name Change","Memorandum & Articles of Association","Minutes of Meetings","Powers of Attorney","Shares","Statutory Documents"]},
  {name:"Group",          icon:"&#128194;",subs:["Brand","Competitor Fees","Insurance","Marketing and Business Development","Proposals","Strategy","Travel"]},
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

const ENTITIES = ["All entities","Meridian Holdings Ltd","Harrington Family Trust","Caledonian Ventures Ltd","Azure Mediterranean Fdn","Pacific Wealth Trust","Stonebridge Capital Ltd","North Star Holdings Ltd","Rosewood Legacy Trust","Apex Growth Fund Ltd"];

export default function AffinityDMS() {
  const [entity,setEntity]   = useState("All entities");
  const [openFolders,setOpen] = useState({"KYC":true});
  const [selFolder,setSelF]   = useState({folder:"KYC",sub:"CDD"});
  const [sel,setSel]          = useState(null);
  const [tab,setTab]          = useState(0); // 0=DMS, 1=Expiring, 2=Approvals, 3=Generate, 4=Email
  const [modal,setModal]      = useState(null);
  const [dragOver,setDragOver] = useState(false);
  const [isAdmin]             = useState(true); // would come from user role

  const toggleFolder = name => setOpen(p=>({...p,[name]:!p[name]}));

  const folderDocs = DOCS.filter(d=>
    (entity==="All entities"||d.entity===entity)&&
    (!selFolder.folder||d.folder===selFolder.folder)&&
    (!selFolder.sub||d.subfolder===selFolder.sub)
  );
  const selDoc = sel ? DOCS.find(d=>d.id===sel) : null;

  const th={padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.4px",borderBottom:"0.5px solid #e5e5e5",background:"#f9f9f9",whiteSpace:"nowrap"};
  const td={padding:"8px 12px",fontSize:11,borderBottom:"0.5px solid #e5e5e5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};

  const tabs = ["Document folders","Expiring / expired","Approvals","Generate document","Email filing"];

  return (
    <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",background:"#fff",color:"#111",height:"calc(100vh - 48px)",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* Toolbar */}
      <div style={{padding:"8px 16px",borderBottom:"0.5px solid #e5e5e5",display:"flex",gap:6,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        {tabs.map((t,i)=><button key={i} style={{padding:"4px 12px",fontSize:11,borderRadius:20,border:`0.5px solid ${tab===i?"#ccc":"#e5e5e5"}`,background:tab===i?"#fff":"transparent",color:tab===i?"#111":"#666",cursor:"pointer",fontWeight:tab===i?500:400,whiteSpace:"nowrap"}} onClick={()=>setTab(i)}>{t}{i===2&&DOCS.filter(d=>d.status==="Under review"||d.status==="Draft").length>0&&<span style={{marginLeft:4,background:"#EF4444",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700}}>{DOCS.filter(d=>d.status==="Under review"||d.status==="Draft").length}</span>}</button>)}
        <select style={{height:28,padding:"0 8px",fontSize:11,borderRadius:5,border:"0.5px solid #ccc",background:"#fff",color:"#111",marginLeft:"auto",minWidth:200}} value={entity} onChange={e=>setEntity(e.target.value)}>
          {ENTITIES.map(e=><option key={e}>{e}</option>)}
        </select>
        <Btn primary onClick={()=>setModal("upload")}>&#8593; Upload</Btn>
      </div>

      {/* DMS TAB — folder tree + documents */}
      {tab===0&&(
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* Folder tree */}
          <div style={{width:240,minWidth:240,borderRight:"0.5px solid #e5e5e5",overflowY:"auto",background:"#f9f9f9",flexShrink:0}}>
            <div style={{padding:"10px 12px",fontSize:10,fontWeight:600,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"0.5px solid #e5e5e5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              Folders
              {isAdmin&&<button style={{background:"none",border:"none",cursor:"pointer",color:CY,fontSize:11}}>&#43; New folder</button>}
            </div>
            {FOLDER_TREE.map(f=>(
              <div key={f.name}>
                <div onClick={()=>toggleFolder(f.name)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",cursor:"pointer",background:selFolder.folder===f.name&&!selFolder.sub?"#fff":"transparent",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}>
                  <span style={{fontSize:10,color:"#aaa",width:12,flexShrink:0}}>{openFolders[f.name]?"&#9660;":"&#9658;"}</span>
                  <span style={{fontSize:14}}>&#128194;</span>
                  <span style={{fontWeight:selFolder.folder===f.name?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                  <span style={{marginLeft:"auto",fontSize:9,color:"#aaa",flexShrink:0}}>{DOCS.filter(d=>d.folder===f.name&&(entity==="All entities"||d.entity===entity)).length||""}</span>
                </div>
                {openFolders[f.name]&&f.subs.map(sub=>{
                  const count = DOCS.filter(d=>d.folder===f.name&&d.subfolder===sub&&(entity==="All entities"||d.entity===entity)).length;
                  if(!isAdmin&&count===0) return null; // hide empty folders for non-admins
                  return (
                    <div key={sub} onClick={()=>setSelF({folder:f.name,sub})} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px 5px 32px",cursor:"pointer",background:selFolder.folder===f.name&&selFolder.sub===sub?"#E6F7FB":"transparent",fontSize:11,borderBottom:"0.5px solid #f0f0f0"}}>
                      <span style={{fontSize:12}}>&#128196;</span>
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
            {/* Drop zone */}
            <div
              onDragOver={e=>{e.preventDefault();setDragOver(true);}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);setModal("metadata");}}
              style={{padding:"8px 14px",background:dragOver?"#E6F7FB":"#f9f9f9",borderBottom:"0.5px solid #e5e5e5",fontSize:11,color:dragOver?CY:"#aaa",textAlign:"center",flexShrink:0,cursor:"pointer",transition:"all 0.1s"}}
              onClick={()=>setModal("upload")}
            >
              {dragOver?"Release to upload to this folder &#8679;":"&#8679; Drag & drop files here or click to upload &mdash; "+selFolder.folder+(selFolder.sub?" / "+selFolder.sub:"")}
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
                      <td style={{...td,textAlign:"center",fontSize:16}}>{d.folder==="KYC"?"&#128251;":d.folder==="Statutory"?"&#128196;":d.folder==="Accounts"?"&#128202;":"&#128196;"}</td>
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
                  <button onClick={()=>setSel(null)} style={{float:"right",background:"none",border:"none",cursor:"pointer",color:"#aaa",fontSize:14}}>&#x2715;</button>
                  <div style={{fontSize:12,fontWeight:600,lineHeight:1.4,marginBottom:4}}>{selDoc.name}</div>
                  <div style={{fontSize:10,color:"#999",marginBottom:10}}>{selDoc.entity}</div>
                  <Bx label={selDoc.status} colors={statusColors[selDoc.status]}/>
                  {[["Folder",selDoc.folder+" / "+selDoc.subfolder],["Date",selDoc.date],["Expiry",selDoc.expiry||"No expiry"],["Size",selDoc.size],["Uploaded by",selDoc.by]].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:11,marginTop:8}}>
                      <span style={{color:"#666"}}>{k}</span><span style={{fontWeight:500,fontSize:10,textAlign:"right",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:5,marginTop:12,flexWrap:"wrap"}}>
                    <Btn sx={{flex:1,fontSize:10}}>&#8595; Download</Btn>
                    <Btn sx={{flex:1,fontSize:10}}>&#128065; Preview</Btn>
                    {selDoc.status==="Under review"&&<Btn primary sx={{width:"100%",fontSize:10,marginTop:4}}>Approve &#10003;</Btn>}
                  </div>
                </div>
              )}
            </div>
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
                <Btn>&#128065; Preview</Btn>
                <Btn>Return</Btn>
                <Btn primary>Approve &#10003;</Btn>
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
                      <Btn primary sx={{fontSize:10,padding:"3px 8px"}}>Generate &#8599;</Btn>
                    </div>
                  </div>
                ))}
              </div>
              {section==="Statutory"&&(
                <div style={{marginTop:12}}>
                  <div style={{fontSize:11,fontWeight:600,marginBottom:8,color:"#666"}}>Jurisdiction-specific statutory forms</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
                    {["Alderney","Bahamas","Barbados","Bermuda","BVI","Brunei","Cayman Islands","Curacao","Cyprus","Delaware","England & Wales","General","Gibraltar","Guernsey","Hong Kong","Ireland","Isle of Man","Jersey","Labuan","Luxembourg","Malaysia","Malta","Mauritius","Netherlands","New York","Seychelles","Singapore","Turks & Caicos","UAE","Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"].map(j=>(
                      <div key={j} style={{background:"#f9f9f9",borderRadius:4,padding:"4px 8px",fontSize:10,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:"0.5px solid #e5e5e5"}} onClick={()=>setModal("jur")}>
                        <span>{j}</span><span style={{color:CY}}>&#8599;</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* EMAIL FILING */}
      {tab===4&&(
        <div style={{padding:16,overflowY:"auto",flex:1}}>
          <div style={{background:"#E6F7FB22",border:`0.5px solid ${CY}`,borderRadius:8,padding:"12px 14px",marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Email filing — no public folders required</div>
            <div style={{fontSize:11,color:"#555",lineHeight:1.6}}>Emails are saved into the DMS by dragging from Outlook into the appropriate folder, or by using the email preview button to file directly. Public folders are not required — all filing is done at entity level within the folder structure.</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:600,marginBottom:8}}>Method 1 — Drag from Outlook</div>
              <div style={{fontSize:11,color:"#666",lineHeight:1.7}}>1. Open the DMS to the correct entity and folder<br/>2. Drag the email from Outlook into the folder panel<br/>3. A metadata popup will appear — complete and save<br/>4. Email is filed as a .msg or .eml file</div>
            </div>
            <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:600,marginBottom:8}}>Method 2 — Preview &amp; file</div>
              <div style={{fontSize:11,color:"#666",lineHeight:1.7}}>1. Open the email in Outlook<br/>2. Click the Affinity Core add-in button<br/>3. Select entity and folder from the dropdown<br/>4. Click File — saved directly to the DMS<br/><span style={{color:"#aaa",fontSize:10}}>(Requires M365 integration — Phase 2)</span></div>
            </div>
          </div>
          <div style={{fontSize:11,fontWeight:600,marginBottom:8}}>Recently filed emails</div>
          {[
            {name:"RE: Q2 retainer invoice — Meridian Holdings",entity:"Meridian Holdings Ltd",folder:"Correspondence / Emails",date:"14/07/2025",by:"Roxy Sheeley"},
            {name:"FW: KYC renewal — Emma Harrington",          entity:"Harrington Family Trust", folder:"KYC / Onboarding",    date:"12/07/2025",by:"Roxy Sheeley"},
            {name:"RE: Apex sanctions review — MLRO",           entity:"Apex Growth Fund Ltd",    folder:"KYC / Ongoing Monitoring",date:"12/07/2025",by:"Gary Harrison"},
          ].map((e,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"0.5px solid #e5e5e5"}}>
              <div>
                <div style={{fontSize:12,fontWeight:500}}>&#9993; {e.name}</div>
                <div style={{fontSize:11,color:"#999",marginTop:2}}>{e.entity} &middot; {e.folder} &middot; {e.date} by {e.by}</div>
              </div>
              <Btn sx={{fontSize:10}}>&#128065; Preview</Btn>
            </div>
          ))}
        </div>
      )}

      {/* Upload modal */}
      {modal==="upload"&&(
        <Md title={"Upload to "+selFolder.folder+(selFolder.sub?" / "+selFolder.sub:"")} onClose={()=>setModal(null)}>
          <div style={{border:"2px dashed #ccc",borderRadius:8,padding:20,textAlign:"center",marginBottom:14,color:"#aaa",fontSize:12,cursor:"pointer"}} onClick={()=>{}}>
            &#8679; Drag & drop files here or <span style={{color:CY}}>browse</span><br/>
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
            &#10003; File dropped into <strong>{selFolder.folder} / {selFolder.sub}</strong>. Please complete the metadata below.
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

      {modal==="jur"&&(
        <Md title="Jurisdiction statutory forms" onClose={()=>setModal(null)}>
          <div style={{fontSize:11,color:"#666",marginBottom:12}}>Select the form type for this jurisdiction. Forms are pre-populated from entity data.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr",gap:6}}>
            {["Change of directors","Change of secretary","Change of registered office","Return of allotments","Annual return","Dissolution / strike-off form","Continuation form","Consent to act as director"].map(f=>(
              <div key={f} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}>
                <span>{f}</span>
                <Btn primary sx={{fontSize:10,padding:"3px 8px"}}>Generate &#8599;</Btn>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
            <Btn onClick={()=>setModal(null)}>Close</Btn>
          </div>
        </Md>
      )}
    </div>
  );
}

function TD({v,bold}) {
  return <td style={{padding:"8px 12px",fontSize:11,fontWeight:bold?600:400,borderBottom:"0.5px solid #e5e5e5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</td>;
}
