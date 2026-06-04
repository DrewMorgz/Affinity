import { useState } from "react";

const CY = "#00C4CC";
const TEAL_DARK = "#00929A"; // single darker shade of CY used only inside gradients
const NAVY = "#001242";

const OFFICES = [
  {city:"Douglas",        country:"Isle of Man",    tz:"Europe/London",   offset:0},
  {city:"Miami",          country:"Florida, USA",   tz:"America/New_York",offset:-5},
  {city:"Rapid City",     country:"South Dakota",   tz:"America/Chicago", offset:-6},
  {city:"Valletta",       country:"Malta",          tz:"Europe/Malta",    offset:1},
  {city:"George Town",    country:"Cayman Islands", tz:"America/Cayman",  offset:-5},
  {city:"London",         country:"United Kingdom", tz:"Europe/London",   offset:0},
];

const NEWS = [
  {id:1, title:"IOM Departmental — July 2025",     author:"Roxy Sheeley",   date:"10 Jul",  preview:"Team update: Sarah Cole returns from maternity leave on 1 August. Welcome back! Timesheets reminder — please ensure all entries are complete by 10am Monday. Congratulations to the team on achieving 100% compliance review completion for Malta this quarter.",img:"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300&q=80"},
  {id:2, title:"Group News — Cayman expansion",    author:"Andy Morgan",     date:"05 Jul",  preview:"Exciting news — we have been appointed as registered office for three new Cayman entities this month, bringing our Cayman portfolio to 87 entities. Garry and Patrick have done an outstanding job building the office.",img:"https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=300&q=80"},
  {id:3, title:"Malta Update — MFSA licensing",   author:"Joanne Fenech",   date:"28 Jun",  preview:"Our Malta MFSA licence renewal was approved last week with no conditions. Special thanks to Maria for preparing the renewal pack. We also welcomed a new client — Verona Digital Holdings — to the Malta portfolio.",img:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&q=80"},
  {id:4, title:"Welcome — New joiners June 2025", author:"Andy Morgan",     date:"02 Jun",  preview:"Please join me in welcoming Eliza Rayner (IOM, Administrator) and David O'Brien (Cayman, Compliance Officer) to the Affinity team. Both will be attending the July group offsite. Excited to have them on board.",img:"https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=300&q=80"},
];

const EVENTS = [
  {id:1, title:"Group offsite — Isle of Man",      date:"21–23 Aug 2025",  location:"Douglas, IOM",         type:"Group"},
  {id:2, title:"AML training — all staff",         date:"15 Jul 2025",     location:"Video call",            type:"Training"},
  {id:3, title:"IOM Annual compliance forum",      date:"04 Sep 2025",     location:"Douglas, IOM",         type:"External"},
  {id:4, title:"STEP Caribbean conference",        date:"14–16 Oct 2025",  location:"Cayman Islands",       type:"External"},
  {id:5, title:"Q3 board meetings",                date:"w/c 20 Oct 2025", location:"All offices",          type:"Group"},
  {id:6, title:"Malta MFSA industry day",          date:"11 Sep 2025",     location:"Valletta, Malta",      type:"External"},
];

const RESOURCES = [
  {name:"Expense claim form",         type:"Form",    desc:"Submit expenses — complete and email to finance@affinitygroup.com"},
  {name:"Holiday request form",       type:"Form",    desc:"Annual leave request — minimum 2 weeks notice"},
  {name:"IT support request",         type:"Link",    desc:"Log an IT issue — helpdesk.affinitygroup.com"},
  {name:"Employee handbook",          type:"Document",desc:"Group policies, code of conduct, benefits"},
  {name:"AML & compliance manual",    type:"Document",desc:"Current AML policies and procedures — all staff"},
  {name:"Fee schedule 2025",          type:"Document",desc:"Current client fee schedule — confidential"},
  {name:"Brand guidelines",           type:"Document",desc:"Affinity brand standards — logos, fonts, colours"},
  {name:"Health & safety policy",     type:"Document",desc:"Group health & safety — all jurisdictions"},
  {name:"Data protection policy",     type:"Document",desc:"GDPR and data protection — all staff"},
  {name:"Whistleblowing policy",      type:"Document",desc:"Confidential reporting — anonymity guaranteed"},
];

const ADVENTURE_VALUES = [
  {v:"Honesty",          icon:"✓", desc:"We are transparent and truthful in all our dealings — with clients, regulators and each other."},
  {v:"Transparent Communication", icon:"💬", desc:"We share information openly and ensure everyone has what they need to do their best work."},
  {v:"Respect",          icon:"⭐", desc:"We treat every person — colleague, client, counterparty — with dignity and professionalism."},
  {v:"Inclusivity",      icon:"🤝", desc:"We celebrate difference and ensure everyone at Affinity has an equal opportunity to thrive."},
];

function Clock({office}) {
  const now = new Date();
  const localHour = now.getUTCHours() + office.offset;
  const h = ((localHour % 24)+24)%24;
  const m = now.getUTCMinutes();
  const ampm = h>=12?"PM":"AM";
  const h12 = h%12||12;
  return (
    <div style={{background:"rgba(255,255,255,0.12)",borderRadius:8,padding:"10px 14px",minWidth:160}}>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginBottom:2}}>{office.city}, {office.country}</div>
      <div style={{fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"-0.5px"}}>{h12}:{m.toString().padStart(2,"0")} <span style={{fontSize:14,fontWeight:400}}>{ampm}</span></div>
      <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginTop:2}}>{office.offset===0?"Same time as IOM":office.offset>0?office.offset+"h ahead":Math.abs(office.offset)+"h behind"}</div>
    </div>
  );
}

export default function AffinityIntranet() {
  const [page,setPage]     = useState("home");
  const [newsId,setNewsId] = useState(null);

  const navItems = ["Home","The Adventure Book","Get to Know Us","Your Resources"];

  const Hero = () => (
    <div style={{background:`linear-gradient(135deg, ${CY} 0%, ${TEAL_DARK} 50%, ${NAVY} 100%)`,padding:"28px 32px",marginBottom:0,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundImage:"url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=60')",backgroundSize:"cover",backgroundPosition:"center",opacity:0.15}}/>
      <div style={{position:"relative",zIndex:1}}>
        <div style={{fontSize:28,fontWeight:700,color:"#fff",marginBottom:20}}>Affinity Group Intranet</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {OFFICES.map(o=><Clock key={o.city} office={o}/>)}
        </div>
      </div>
    </div>
  );

  const HomePage = () => (
    <div>
      <Hero/>
      <div style={{padding:"20px 28px"}}>
        {/* Vision & Mission */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24}}>
          <div style={{borderLeft:`4px solid ${CY}`,paddingLeft:16}}>
            <div style={{fontSize:16,fontWeight:700,color:NAVY,marginBottom:6}}>Our Vision</div>
            <div style={{fontSize:13,color:"#444",lineHeight:1.7}}>To be the leading destination for corporate, digital, and private wealth clients — a boutique service provider delivering bespoke solutions globally, with Innovation and Quality.</div>
          </div>
          <div style={{borderLeft:`4px solid ${TEAL_DARK}`,paddingLeft:16}}>
            <div style={{fontSize:16,fontWeight:700,color:NAVY,marginBottom:6}}>Our Mission</div>
            <div style={{fontSize:13,color:"#444",lineHeight:1.7}}>We take a personal approach, identifying new and emerging sectors, jurisdictions and technologies that provide growth opportunities and add value for existing and new clients.</div>
          </div>
        </div>

        {/* News */}
        <div style={{marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:17,fontWeight:700,color:NAVY}}>Our Group News &amp; Updates</div>
            <button style={{fontSize:12,color:CY,background:"none",border:"none",cursor:"pointer",fontWeight:500}}>See all ↗</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {NEWS.map(n=>(
              <div key={n.id} onClick={()=>setNewsId(n.id)} style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:10,overflow:"hidden",cursor:"pointer",display:"flex",gap:0}}>
                <div style={{width:90,minWidth:90,backgroundImage:`url('${n.img}')`,backgroundSize:"cover",backgroundPosition:"center"}}/>
                <div style={{padding:"12px 14px",flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:NAVY,marginBottom:4,lineHeight:1.4}}>{n.title}</div>
                  <div style={{fontSize:11,color:"#666",lineHeight:1.5,marginBottom:6,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{n.preview}</div>
                  <div style={{fontSize:10,color:"#aaa"}}>{n.author} &middot; {n.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Events */}
        <div style={{marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:17,fontWeight:700,color:NAVY}}>Our Group Events</div>
            <button style={{fontSize:12,color:CY,background:"none",border:"none",cursor:"pointer",fontWeight:500}}>+ Add event</button>
          </div>
          <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:6}}>
            {EVENTS.map(e=>(
              <div key={e.id} style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:"10px 14px",minWidth:180,flexShrink:0}}>
                <div style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:9,fontWeight:600,marginBottom:6,background:e.type==="Group"?"#E6F7FB":e.type==="Training"?"#EAF3DE":"#FAEEDA",color:e.type==="Group"?"#0077A8":e.type==="Training"?"#27500A":"#633806"}}>{e.type}</div>
                <div style={{fontSize:12,fontWeight:600,color:NAVY,marginBottom:4,lineHeight:1.4}}>{e.title}</div>
                <div style={{fontSize:10,color:"#666",marginBottom:2}}>{e.date}</div>
                <div style={{fontSize:10,color:"#aaa"}}>{e.location}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Adventure + Resources cards */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div onClick={()=>setPage("adventure")} style={{background:`linear-gradient(135deg,${NAVY} 0%,#0A2470 100%)`,borderRadius:10,padding:"24px 20px",cursor:"pointer",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,right:0,bottom:0,width:"50%",backgroundImage:"url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=60')",backgroundSize:"cover",backgroundPosition:"center",opacity:0.25}}/>
            <div style={{position:"relative",zIndex:1}}>
              <div style={{fontSize:16,fontWeight:700,color:"#fff",marginBottom:6}}>The Affinity Adventure</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginBottom:12,lineHeight:1.6}}>Our values, culture and what it means to be part of the Affinity team.</div>
              <div style={{fontSize:11,fontWeight:600,color:CY}}>LEARN MORE →</div>
            </div>
          </div>
          <div onClick={()=>setPage("resources")} style={{background:`linear-gradient(135deg,${CY} 0%,${TEAL_DARK} 100%)`,borderRadius:10,padding:"24px 20px",cursor:"pointer",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,right:0,bottom:0,width:"50%",backgroundImage:"url('https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400&q=60')",backgroundSize:"cover",backgroundPosition:"center",opacity:0.2}}/>
            <div style={{position:"relative",zIndex:1}}>
              <div style={{fontSize:16,fontWeight:700,color:"#fff",marginBottom:6}}>Explore your Resources</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginBottom:12,lineHeight:1.6}}>Forms, policies, handbooks and everything you need.</div>
              <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.8)"}}>LEARN MORE →</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const AdventurePage = () => (
    <div>
      <div style={{background:`linear-gradient(135deg,${NAVY} 0%,#0A2470 100%)`,padding:"32px 28px",backgroundImage:"url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=60')",backgroundSize:"cover",backgroundPosition:"center",backgroundBlendMode:"overlay"}}>
        <div style={{fontSize:28,fontWeight:700,color:"#fff",marginBottom:12}}>The Affinity Adventure</div>
        <div style={{fontSize:14,fontStyle:"italic",color:"rgba(255,255,255,0.9)",maxWidth:700,lineHeight:1.7,background:"rgba(0,0,0,0.3)",padding:"12px 16px",borderRadius:8,borderLeft:`4px solid ${CY}`}}>
          "Being part of the Adventure is working collaboratively to reach a shared destination whilst supporting and lifting each other up to achieve personal milestones along the way." <strong style={{color:CY}}>— Andy Morgan, Group CEO</strong>
        </div>
      </div>
      <div style={{padding:"24px 28px"}}>
        <div style={{fontSize:18,fontWeight:700,color:NAVY,marginBottom:16}}>Adventure Values</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
          {ADVENTURE_VALUES.map(v=>(
            <div key={v.v} style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:10,padding:"16px 18px",borderLeft:`3px solid ${CY}`}}>
              <div style={{fontSize:15,fontWeight:700,color:NAVY,marginBottom:6,display:"flex",alignItems:"center",gap:8}}><span dangerouslySetInnerHTML={{__html:v.icon}}/>{v.v}</div>
              <div style={{fontSize:12,color:"#555",lineHeight:1.7}}>{v.desc}</div>
            </div>
          ))}
        </div>
        <div style={{background:`linear-gradient(135deg,${TEAL_DARK},${NAVY})`,borderRadius:10,padding:"20px 24px",marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:700,color:"#fff",marginBottom:10}}>Adventure Mission</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.85)",lineHeight:1.7}}>The Affinity Adventure is our commitment to building a business and a team that genuinely makes a difference — for our clients, for each other, and for the communities we operate in across the globe. We believe that exceptional service comes from exceptional people who feel valued, supported and inspired.</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[{label:"Years in business",value:"15+",sub:"Founded 2009"},{label:"Team members",value:"28",sub:"6 offices globally"},{label:"Entities managed",value:"300+",sub:"Across 6 jurisdictions"}].map(s=>(
            <div key={s.label} style={{background:"#f9f9f9",borderRadius:8,padding:"14px 16px",textAlign:"center"}}>
              <div style={{fontSize:28,fontWeight:700,color:CY,marginBottom:4}}>{s.value}</div>
              <div style={{fontSize:11,fontWeight:600,color:NAVY,marginBottom:2}}>{s.label}</div>
              <div style={{fontSize:10,color:"#aaa"}}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const ResourcesPage = () => (
    <div style={{padding:"24px 28px"}}>
      <div style={{fontSize:20,fontWeight:700,color:NAVY,marginBottom:4}}>Your Resources</div>
      <div style={{fontSize:12,color:"#666",marginBottom:20}}>Forms, policies, handbooks and useful links for Affinity team members.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {RESOURCES.map(r=>(
          <div key={r.name} style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:8,padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{width:32,height:32,borderRadius:6,background:r.type==="Form"?"#E6F7FB":r.type==="Link"?"#EAF3DE":"#EEF0FB",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
              {r.type==="Form"?"📄":r.type==="Link"?"🔗":"📄"}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:NAVY,marginBottom:3}}>{r.name}</div>
              <div style={{fontSize:11,color:"#666",lineHeight:1.5}}>{r.desc}</div>
              <button style={{marginTop:6,fontSize:11,color:CY,background:"none",border:"none",cursor:"pointer",padding:0}}>Open ↗</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const GetToKnowPage = () => (
    <div style={{padding:"24px 28px"}}>
      <div style={{fontSize:20,fontWeight:700,color:NAVY,marginBottom:4}}>Get to Know Us</div>
      <div style={{fontSize:12,color:"#666",marginBottom:20}}>Meet the Affinity team across our global offices.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {[{name:"Andrew Morgan",title:"CEO — Super Admin",office:"USA",flag:"🇺🇸",av:"AM",c:"#00C4CC",bio:"Founded Affinity. Drives group strategy across all five jurisdictions."},
          {name:"Michael Barlow",title:"Compliance Manager (IOM)",office:"Isle of Man",flag:"🇮🇲",av:"MB",c:"#7C5CBF",bio:"Leads the IOM compliance function. AML/KYC and regulatory specialist."},
          {name:"Joanne Fenech",title:"Managing Director (IOM)",office:"Malta",flag:"🇲🇹",av:"JF",c:"#4A7C6F",bio:"Heads the Malta office and the wider Affinity managing director group."},
          {name:"Krista Fenech",title:"Client Administrator",office:"Malta",flag:"🇲🇹",av:"KF",c:"#5C8E3C",bio:"Client-facing administration for the Malta book."},
          {name:"Alexandra Gardner",title:"COO — Super Admin",office:"USA",flag:"🇺🇸",av:"AG",c:"#BF5C7A",bio:"Group Chief Operating Officer. Oversees operations and delivery firm-wide."},
          {name:"Debbie Gooding",title:"Manager",office:"Isle of Man",flag:"🇮🇲",av:"DG",c:"#1A7FBF",bio:"Manager in the IOM team. Trust and corporate administration."},
          {name:"Natalie Johnson",title:"Assistant Compliance Administrator",office:"USA",flag:"🇺🇸",av:"NJ",c:"#2E7A8A",bio:"Supports the USA compliance function. CDD and onboarding focus."},
          {name:"Neil Kelly",title:"CFO",office:"USA",flag:"🇺🇸",av:"NK",c:"#BF7A5C",bio:"Group CFO. Oversees financial reporting, billing, and management accounts."},
          {name:"Elena Pace",title:"Manager",office:"Isle of Man",flag:"🇮🇲",av:"EP",c:"#7B4F1D",bio:"Manager — IOM office. Corporate administration and client liaison."},
          {name:"Shanya Pickett",title:"Assistant Manager",office:"Isle of Man",flag:"🇮🇲",av:"SP",c:"#5C7A8E",bio:"Assistant Manager supporting IOM client delivery."},
          {name:"Mattei Pisani",title:"Director (Malta)",office:"Isle of Man",flag:"🇮🇲",av:"MP",c:"#8A4A6E",bio:"Director focused on the Malta book. Foundations and MFSA structures."},
          {name:"Colin Quayle",title:"Director and Company Secretary (IOM)",office:"Isle of Man",flag:"🇮🇲",av:"CQ",c:"#4A8E7C",bio:"Director and Company Secretary. IOM statutory and governance lead."},
          {name:"Kate Shaw",title:"Manager",office:"Isle of Man",flag:"🇮🇲",av:"KS",c:"#A0623E",bio:"Manager — IOM. Senior administration and compliance oversight."},
          {name:"Roxy Sheeley",title:"Managing Director (IOM)",office:"Isle of Man",flag:"🇮🇲",av:"RS",c:"#3C5CBF",bio:"Managing Director — IOM. Trust and estate administration specialist."},
          {name:"Gilbert Spiteri Spadaro",title:"Compliance Officer (Malta)",office:"Malta",flag:"🇲🇹",av:"GS",c:"#3A6E4A",bio:"Compliance Officer — Malta. AML, sanctions, and regulatory reporting."}].map(p=>(
          <div key={p.name} style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:10,padding:"16px 14px",textAlign:"center"}}>
            <div style={{width:56,height:56,borderRadius:"50%",background:p.c,color:"#fff",fontSize:16,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}>{p.av}</div>
            <div style={{fontSize:13,fontWeight:700,color:NAVY}}>{p.name}</div>
            <div style={{fontSize:11,color:"#666",margin:"3px 0"}}>{p.title}</div>
            <div style={{fontSize:18,marginBottom:8,lineHeight:1}} title={p.office}>{p.flag}</div>
            <div style={{fontSize:11,color:"#888",lineHeight:1.5}}>{p.bio}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const NewsDetail = () => {
    const n = NEWS.find(x=>x.id===newsId);
    if(!n) return null;
    return <div style={{padding:"24px 28px"}}>
      <button onClick={()=>setNewsId(null)} style={{fontSize:11,color:CY,background:"none",border:"none",cursor:"pointer",marginBottom:14,padding:0}}>← Back to news</button>
      <div style={{backgroundImage:`url('${n.img}')`,backgroundSize:"cover",backgroundPosition:"center",height:200,borderRadius:10,marginBottom:16}}/>
      <div style={{fontSize:20,fontWeight:700,color:NAVY,marginBottom:4}}>{n.title}</div>
      <div style={{fontSize:11,color:"#aaa",marginBottom:16}}>{n.author} &middot; {n.date}</div>
      <div style={{fontSize:13,color:"#444",lineHeight:1.8}}>{n.preview} Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</div>
    </div>;
  };

  return (
    <div style={{fontFamily:"'Catamaran',system-ui,sans-serif",background:"#f5f7fa",minHeight:"100vh",color:"#111"}}>
      {/* Nav */}
      <div style={{background:"#fff",borderBottom:"0.5px solid #e5e5e5",padding:"0 28px",display:"flex",alignItems:"center",gap:0,height:44,flexShrink:0}}>
        <div style={{fontSize:14,fontWeight:700,color:TEAL_DARK,marginRight:24}}>Affinity Group</div>
        {navItems.map(n=>{
          const id=n.toLowerCase().replace(/ /g,"-");
          const active=page===id||(n==="Home"&&page==="home");
          return <button key={n} onClick={()=>{setPage(n==="Home"?"home":n==="The Adventure Book"?"adventure":n==="Get to Know Us"?"know":"resources");setNewsId(null);}} style={{padding:"0 14px",height:44,background:"none",border:"none",borderBottom:`2px solid ${active?CY:"transparent"}`,cursor:"pointer",fontSize:12,fontWeight:active?600:400,color:active?CY:"#555",whiteSpace:"nowrap"}}>{n}</button>
        })}
      </div>
      {/* Content */}
      <div style={{background:"#fff"}}>
        {newsId?<NewsDetail/>:page==="home"?<HomePage/>:page==="adventure"?<AdventurePage/>:page==="resources"?<ResourcesPage/>:<GetToKnowPage/>}
      </div>
    </div>
  );
}
