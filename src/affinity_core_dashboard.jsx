import { useState, useEffect } from "react";
import { isConfigured } from "./affinity_accounting_supabase";
import { tasksList } from "./affinity_tasks_api";
import { onboardingCases } from "./affinity_onboarding_api";
import { feeInvoices } from "./affinity_invoicing_api";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const CY = "#00C4CC";
const NAVY = "#001242";

const Bx = ({label,colors}) => <span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,background:colors?.bg||"#eee",color:colors?.color||"#333",whiteSpace:"nowrap"}}>{label}</span>;
const fmt = (n,s="£") => s+Math.abs(Number(n||0)).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0});
const Card = ({title,children,action,border}) => <div style={{background:"#fff",border:`0.5px solid ${border||"#e5e5e5"}`,borderRadius:8,padding:14,marginBottom:12}}>{title&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",color:"#666"}}>{title}</div>{action}</div>}{children}</div>;

const USERS = [
  {id:1,name:"Andrew Morgan",office:"USA",flag:"🇺🇸",role:"CEO — Super Admin",av:"AM",c:"#00C4CC",isManager:true, team:["Alexandra Gardner","Roxy Sheeley","Joanne Fenech","Neil Kelly","Natalie Johnson"]},
  {id:2,name:"Michael Barlow",office:"Isle of Man",flag:"🇮🇲",role:"Compliance Manager (IOM)",av:"MB",c:"#7C5CBF",isManager:false, team:[]},
  {id:3,name:"Joanne Fenech",office:"Malta",flag:"🇲🇹",role:"Managing Director (IOM)",av:"JF",c:"#4A7C6F",isManager:true, team:["Krista Fenech","Gilbert Spiteri Spadaro"]},
  {id:4,name:"Krista Fenech",office:"Malta",flag:"🇲🇹",role:"Client Administrator",av:"KF",c:"#5C8E3C",isManager:false, team:[]},
  {id:5,name:"Alexandra Gardner",office:"USA",flag:"🇺🇸",role:"COO — Super Admin",av:"AG",c:"#BF5C7A",isManager:true, team:["Natalie Johnson","Neil Kelly"]},
  {id:6,name:"Debbie Gooding",office:"Isle of Man",flag:"🇮🇲",role:"Manager",av:"DG",c:"#1A7FBF",isManager:false, team:[]},
  {id:7,name:"Natalie Johnson",office:"USA",flag:"🇺🇸",role:"Assistant Compliance Administrator",av:"NJ",c:"#2E7A8A",isManager:false, team:[]},
  {id:8,name:"Neil Kelly",office:"USA",flag:"🇺🇸",role:"CFO",av:"NK",c:"#BF7A5C",isManager:false, team:[]},
  {id:9,name:"Elena Pace",office:"Isle of Man",flag:"🇮🇲",role:"Manager",av:"EP",c:"#7B4F1D",isManager:false, team:[]},
  {id:10,name:"Shanya Pickett",office:"Isle of Man",flag:"🇮🇲",role:"Assistant Manager",av:"SP",c:"#5C7A8E",isManager:false, team:[]},
  {id:11,name:"Mattei Pisani",office:"Isle of Man",flag:"🇮🇲",role:"Director (Malta)",av:"MP",c:"#8A4A6E",isManager:false, team:[]},
  {id:12,name:"Colin Quayle",office:"Isle of Man",flag:"🇮🇲",role:"Director and Company Secretary (IOM)",av:"CQ",c:"#4A8E7C",isManager:false, team:[]},
  {id:13,name:"Kate Shaw",office:"Isle of Man",flag:"🇮🇲",role:"Manager",av:"KS",c:"#A0623E",isManager:false, team:[]},
  {id:14,name:"Roxy Sheeley",office:"Isle of Man",flag:"🇮🇲",role:"Managing Director (IOM)",av:"RS",c:"#3C5CBF",isManager:true, team:["Michael Barlow","Debbie Gooding","Elena Pace","Shanya Pickett","Mattei Pisani","Colin Quayle","Kate Shaw"]},
  {id:15,name:"Gilbert Spiteri Spadaro",office:"Malta",flag:"🇲🇹",role:"Compliance Officer (Malta)",av:"GS",c:"#3A6E4A",isManager:false, team:[]},
  {id:16,name:"Gary Harrison",office:"Isle of Man",flag:"🇮🇲",role:"COO",av:"GH",c:"#0D6E8E",isManager:true, team:["Michael Barlow","Debbie Gooding","Elena Pace","Shanya Pickett"]},
];

const ALL_TASKS = [
  {id:1, title:"Harrington Trust — CPR overdue",          assignee:"Roxy Sheeley",  module:"Compliance",priority:"Critical",due:"Today",    entity:"Harrington Family Trust"},
  {id:2, title:"Apex Growth Fund — sanctions MLRO review",assignee:"Gary Harrison", module:"Compliance",priority:"Critical",due:"Today",    entity:"Apex Growth Fund Ltd"},
  {id:3, title:"Emma Harrington — KYC expired",           assignee:"Roxy Sheeley",  module:"KYC",       priority:"Critical",due:"Overdue",  entity:"Harrington Family Trust"},
  {id:4, title:"Q3 retainer invoices — approve batch",    assignee:"Neil Kelly",    module:"Invoicing", priority:"High",    due:"15/07",    entity:"All entities"},
  {id:5, title:"Sarah Cole — missing timesheet",          assignee:"Roxy Sheeley",  module:"Timesheets",priority:"High",    due:"Today",    entity:"—"},
  {id:6, title:"North Star — sign off attrition form",    assignee:"Andy Morgan",   module:"Onboarding",priority:"High",    due:"15/07",    entity:"North Star Holdings Ltd"},
  {id:7, title:"Pacific Wealth Trust — EDD outstanding",  assignee:"Garry Crossan", module:"Compliance",priority:"High",    due:"18/07",    entity:"Pacific Wealth Trust"},
  {id:8, title:"Stonebridge — director appointment res",  assignee:"Joanne Fenech", module:"Documents", priority:"Medium",  due:"18/07",    entity:"Stonebridge Capital Ltd"},
  {id:9, title:"Maria Borg — timesheet missing",          assignee:"Joanne Fenech", module:"Timesheets",priority:"High",    due:"Today",    entity:"—"},
  {id:10,title:"Meridian Holdings — annual return prep",  assignee:"Roxy Sheeley",  module:"Statutory", priority:"Medium",  due:"12/09",    entity:"Meridian Holdings Ltd"},
  {id:11,title:"Garry Crossan — enforce MFA",             assignee:"Andy Morgan",   module:"System",    priority:"Medium",  due:"14/07",    entity:"—"},
  {id:12,title:"Azure Mediterranean — Q2 accounts",       assignee:"Joanne Fenech", module:"Accounts",  priority:"Low",     due:"30/09",    entity:"Azure Mediterranean Fdn"},
];

const INBOX_ITEMS = [
  {id:1, from:"James Harrington",     entity:"Harrington Family Trust",   subject:"Renewal of passport — scan attached",       received:"14/07/2025",type:"Scan",    read:false, assignee:"Roxy Sheeley",  daysOld:0},
  {id:2, from:"Postroom — IOM office",entity:"Meridian Holdings Ltd",      subject:"Companies Registry confirmation — annual return",received:"07/07/2025",type:"Post",   read:false, assignee:"Roxy Sheeley",  daysOld:7},
  {id:3, from:"Cayman CIMA",          entity:"Apex Growth Fund Ltd",       subject:"Regulatory notice — Q2 2025",               received:"10/07/2025",type:"Post",    read:true,  assignee:"Garry Crossan", daysOld:4},
  {id:4, from:"Postroom — IOM office",entity:"Rosewood Legacy Trust",      subject:"Letter from HMRC re: trust registration",    received:"05/07/2025",type:"Post",    read:false, assignee:"Roxy Sheeley",  daysOld:9},
  {id:5, from:"Wei Chen",             entity:"Pacific Wealth Trust",       subject:"Source of wealth — updated documentation",   received:"11/07/2025",type:"Scan",    read:false, assignee:"Garry Crossan", daysOld:3},
  {id:6, from:"Postroom — Malta",     entity:"Stonebridge Capital Ltd",    subject:"MFSA letter — director appointment acknowledgement",received:"04/07/2025",type:"Post",read:false,assignee:"Joanne Fenech", daysOld:10},
  {id:7, from:"IOMFSA",               entity:"All entities",               subject:"AML guidance update — July 2025",            received:"08/07/2025",type:"Post",    read:true,  assignee:"Gary Harrison", daysOld:6},
  {id:8, from:"Carlos Reyes",         entity:"Suncoast Ventures LLC",      subject:"Signed accounts — FY2024",                   received:"12/07/2025",type:"Scan",    read:false, assignee:"Andy Morgan",   daysOld:2},
];

const DEBTORS = {
  2:[{entity:"Harrington Family Trust",amount:1750,age:"60d+",status:"Overdue"},{entity:"North Star Holdings Ltd",amount:600,age:"90d+",status:"Overdue"},{entity:"Rosewood Legacy Trust",amount:2400,age:"Current",status:"Sent"},{entity:"Meridian Holdings Ltd",amount:2000,age:"Current",status:"Sent"}],
  3:[{entity:"Pacific Wealth Trust",amount:4200,age:"Current",status:"Sent"},{entity:"Apex Growth Fund Ltd",amount:5500,age:"Current",status:"Sent"}],
  5:[{entity:"Harrington Family Trust",amount:2250,age:"60d+",status:"Overdue"},{entity:"North Star Holdings Ltd",amount:600,age:"90d+",status:"Overdue"},{entity:"Pacific Wealth Trust",amount:4200,age:"Current",status:"Sent"},{entity:"Apex Growth Fund Ltd",amount:5500,age:"Current",status:"Sent"},{entity:"Meridian Holdings Ltd",amount:2000,age:"Current",status:"Sent"},{entity:"Azure Mediterranean Fdn",amount:900,age:"Partial",status:"Partial"}],
};

const RECENT = [
  {name:"Group management report — July",    type:"Report",   date:"14/07/2025"},
  {name:"Apex Growth Fund — sanctions case", type:"Compliance",date:"12/07/2025"},
  {name:"Q3 invoice batch — review",         type:"Invoicing", date:"11/07/2025"},
  {name:"Board pack — July 2025",            type:"Documents", date:"10/07/2025"},
];

const REVC = [
  {month:"Jan",IOM:18200,Malta:9400,Cayman:24600,UK:6200,Miami:3100},
  {month:"Mar",IOM:19400,Malta:11000,Cayman:25800,UK:7100,Miami:4200},
  {month:"May",IOM:18900,Malta:12200,Cayman:27200,UK:7400,Miami:5100},
  {month:"Jul",IOM:19800,Malta:10900,Cayman:26100,UK:7800,Miami:5400},
];

const ONBOARDING = [
  {name:"Pinnacle Trading Ltd",      pct:35,overdue:false},
  {name:"Solaris Family Trust",      pct:65,overdue:true},
  {name:"Verona Digital Holdings",   pct:80,overdue:false},
  {name:"Beaumont Wealth Structures",pct:90,overdue:false},
  {name:"Osprey Aviation Partners",  pct:10,overdue:false},
];

const modColors = {Compliance:{bg:"#FBEAF0",color:"#72243E"},KYC:{bg:"#FCEBEB",color:"#A32D2D"},Invoicing:{bg:"#EAF3DE",color:"#27500A"},Timesheets:{bg:"#E6F7FB",color:"#0077A8"},Onboarding:{bg:"#E6F1FB",color:"#0C447C"},Documents:{bg:"#F1EFE8",color:"#444441"},Statutory:{bg:"#FAEEDA",color:"#633806"},System:{bg:"#F1EFE8",color:"#888"},Accounts:{bg:"#EAF3DE",color:"#27500A"}};


// ── Shared staff/events data ──────────────────────────────────
const TODAY = { day:14, month:7 }; // July 14 — matches app date

const STAFF_PROFILES = [
  { name:"Michael Barlow", birthday:{d:27,m:1}, joined:{d:5,m:1,y:2026}, office:"Isle of Man", flag:"🇮🇲", role:"Compliance Manager (IOM)", av:"MB", c:"#7C5CBF" },
  { name:"Lily Briars", birthday:{d:24,m:2}, joined:{d:16,m:7,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"LB", c:"#4A7C6F" },
  { name:"Jessica Cain", birthday:{d:24,m:3}, joined:{d:20,m:2,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"JC", c:"#7C5CBF" },
  { name:"Ryan Cain", birthday:{d:21,m:2}, joined:{d:20,m:9,y:2021}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"RC", c:"#BF5C7A" },
  { name:"Holly Campbell", birthday:{d:23,m:12}, joined:{d:9,m:1,y:2023}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"HC", c:"#5C8E3C" },
  { name:"Jacqueline Carroll", birthday:{d:20,m:8}, joined:{d:30,m:6,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"JA", c:"#1A7FBF" },
  { name:"Jazmine Corkill", birthday:{d:8,m:6}, joined:{d:1,m:10,y:2024}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"JO", c:"#2E7A8A" },
  { name:"Kate Cowley", birthday:{d:13,m:8}, joined:{d:1,m:9,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"KC", c:"#7B4F1D" },
  { name:"Garry Crossan", birthday:{d:20,m:10}, joined:{d:1,m:5,y:2021}, office:"Isle of Man", flag:"🇮🇲", role:"Senior Manager", av:"GC", c:"#7C5CBF" },
  { name:"Sikholiwe Dlamini", birthday:{d:24,m:5}, joined:{d:5,m:6,y:2023}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"SD", c:"#8A4A6E" },
  { name:"Joanne Fenech", birthday:{d:18,m:1}, joined:{d:3,m:4,y:2020}, office:"Malta", flag:"🇲🇹", role:"Managing Director (IOM)", av:"JF", c:"#4A7C6F" },
  { name:"Krista Fenech", birthday:{d:23,m:12}, joined:{d:12,m:5,y:2025}, office:"Malta", flag:"🇲🇹", role:"Client Administrator", av:"KF", c:"#5C8E3C" },
  { name:"Luca Fenech", birthday:{d:19,m:4}, joined:{d:12,m:5,y:2025}, office:"Malta", flag:"🇲🇹", role:"Staff", av:"LF", c:"#0D6E8E" },
  { name:"Alexandra Gardner", birthday:{d:28,m:1}, joined:{d:1,m:9,y:2015}, office:"USA", flag:"🇺🇸", role:"COO — Super Admin", av:"AG", c:"#BF5C7A" },
  { name:"Deborah Gooding", birthday:{d:2,m:10}, joined:{d:12,m:5,y:2020}, office:"Isle of Man", flag:"🇮🇲", role:"Manager", av:"DG", c:"#1A7FBF" },
  { name:"Kurt Grech", birthday:{d:17,m:5}, joined:{d:8,m:6,y:2021}, office:"Malta", flag:"🇲🇹", role:"Staff", av:"KG", c:"#0E5C7F" },
  { name:"Colette Grisdale", birthday:{d:1,m:10}, joined:{d:18,m:3,y:2024}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"CG", c:"#6A8E2E" },
  { name:"Mónica Guedes", birthday:{d:18,m:1}, joined:{d:4,m:8,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"MG", c:"#BF9A3C" },
  { name:"Martin Hall", birthday:{d:6,m:10}, joined:{d:26,m:3,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"MH", c:"#4F6E8E" },
  { name:"Gary Harrison", birthday:{d:31,m:12}, joined:{d:25,m:5,y:2021}, office:"Isle of Man", flag:"🇮🇲", role:"COO", av:"GH", c:"#0D6E8E" },
  { name:"Lucy Harrison", birthday:{d:21,m:9}, joined:{d:9,m:2,y:2026}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"LH", c:"#3C5CBF" },
  { name:"Natalie Johnson", birthday:{d:4,m:12}, joined:{d:15,m:12,y:2025}, office:"USA", flag:"🇺🇸", role:"Assistant Compliance Administrator", av:"NJ", c:"#2E7A8A" },
  { name:"Stelios Kazamia", birthday:{d:8,m:4}, joined:{d:27,m:1,y:2026}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"SK", c:"#7C5CBF" },
  { name:"Allana Kelly", birthday:{d:30,m:7}, joined:{d:20,m:1,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"AK", c:"#BF5C7A" },
  { name:"Neil Kelly", birthday:{d:26,m:1}, joined:{d:20,m:3,y:2023}, office:"USA", flag:"🇺🇸", role:"CFO", av:"NK", c:"#BF7A5C" },
  { name:"Rebecca Kelly", birthday:{d:27,m:7}, joined:{d:3,m:7,y:2023}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"RK", c:"#1A7FBF" },
  { name:"Farah Kirpalani", birthday:{d:29,m:12}, joined:{d:2,m:3,y:2026}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"FK", c:"#2E7A8A" },
  { name:"Chloe Liu", birthday:{d:30,m:12}, joined:{d:13,m:10,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"CL", c:"#7B4F1D" },
  { name:"Kristy Maxwell", birthday:{d:15,m:8}, joined:{d:20,m:9,y:2023}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"KM", c:"#5C7A8E" },
  { name:"Georgia Mitchell", birthday:{d:5,m:11}, joined:{d:15,m:7,y:2024}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"GM", c:"#8A4A6E" },
  { name:"Fraser Monk", birthday:{d:23,m:2}, joined:{d:23,m:1,y:2023}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"FM", c:"#4A8E7C" },
  { name:"Andrew Morgan", birthday:{d:31,m:7}, joined:{d:18,m:5,y:2008}, office:"USA", flag:"🇺🇸", role:"CEO — Super Admin", av:"AM", c:"#00C4CC" },
  { name:"Kristina Muco", birthday:{d:27,m:12}, joined:{d:11,m:3,y:2024}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"KU", c:"#0D6E8E" },
  { name:"Mavis Nyawai", birthday:{d:4,m:3}, joined:{d:6,m:5,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"MN", c:"#3A6E4A" },
  { name:"Junona Ostache", birthday:{d:23,m:1}, joined:{d:1,m:8,y:2024}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"JS", c:"#7A4A8C" },
  { name:"Christine Otieno", birthday:{d:20,m:12}, joined:{d:21,m:9,y:2022}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"CO", c:"#0E5C7F" },
  { name:"Elena Pace", birthday:{d:25,m:10}, joined:{d:5,m:4,y:2020}, office:"Isle of Man", flag:"🇮🇲", role:"Manager", av:"EP", c:"#7B4F1D" },
  { name:"Jaydee Page", birthday:{d:8,m:3}, joined:{d:14,m:6,y:2022}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"JP", c:"#BF9A3C" },
  { name:"Claudia Palao Izquierdo", birthday:{d:18,m:1}, joined:{d:1,m:12,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"CP", c:"#4F6E8E" },
  { name:"Shanya Pickett", birthday:{d:7,m:8}, joined:{d:28,m:2,y:2026}, office:"Isle of Man", flag:"🇮🇲", role:"Assistant Manager", av:"SP", c:"#5C7A8E" },
  { name:"Mattei Pisani", birthday:{d:18,m:1}, joined:{d:8,m:11,y:2021}, office:"Isle of Man", flag:"🇮🇲", role:"Director (Malta)", av:"MP", c:"#8A4A6E" },
  { name:"Kyle Quaggan", birthday:{d:31,m:12}, joined:{d:4,m:9,y:2024}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"KQ", c:"#4A7C6F" },
  { name:"Colin Quayle", birthday:{d:8,m:4}, joined:{d:30,m:3,y:2020}, office:"Isle of Man", flag:"🇮🇲", role:"Director and Company Secretary (IOM)", av:"CQ", c:"#4A8E7C" },
  { name:"Imogen Quirk", birthday:{d:23,m:11}, joined:{d:10,m:10,y:2024}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"IQ", c:"#BF5C7A" },
  { name:"Marcus Roberts", birthday:{d:2,m:6}, joined:{d:24,m:6,y:2024}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"MR", c:"#5C8E3C" },
  { name:"Karina Rogova", birthday:{d:28,m:3}, joined:{d:5,m:11,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"KR", c:"#1A7FBF" },
  { name:"Isadora Rothwell", birthday:{d:4,m:2}, joined:{d:28,m:11,y:2022}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"IR", c:"#2E7A8A" },
  { name:"Reece Roza De Oliveira", birthday:{d:0,m:0}, joined:{d:8,m:6,y:2026}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"RR", c:"#7B4F1D" },
  { name:"Kate Shaw", birthday:{d:28,m:5}, joined:{d:28,m:10,y:2013}, office:"Isle of Man", flag:"🇮🇲", role:"Manager", av:"KS", c:"#A0623E" },
  { name:"Roxy Sheeley", birthday:{d:16,m:5}, joined:{d:13,m:9,y:2021}, office:"Isle of Man", flag:"🇮🇲", role:"Managing Director (IOM)", av:"RS", c:"#3C5CBF" },
  { name:"Rebecca Skillan", birthday:{d:25,m:7}, joined:{d:1,m:1,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"RS", c:"#4A8E7C" },
  { name:"Gilbert Spiteri Spadaro", birthday:{d:6,m:7}, joined:{d:5,m:1,y:2026}, office:"Malta", flag:"🇲🇹", role:"Compliance Officer (Malta)", av:"GS", c:"#3A6E4A" },
  { name:"Annabel Stephenson", birthday:{d:17,m:11}, joined:{d:1,m:4,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"AS", c:"#0D6E8E" },
  { name:"Ben Strodder", birthday:{d:6,m:8}, joined:{d:29,m:9,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"BS", c:"#3A6E4A" },
  { name:"Jessica Thornton", birthday:{d:16,m:6}, joined:{d:16,m:9,y:2024}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"JT", c:"#7A4A8C" },
  { name:"Romane Van Broukhoven", birthday:{d:13,m:5}, joined:{d:1,m:5,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"RV", c:"#0E5C7F" },
  { name:"Kurt Vella", birthday:{d:15,m:2}, joined:{d:5,m:10,y:2021}, office:"Malta", flag:"🇲🇹", role:"Staff", av:"KV", c:"#6A8E2E" },
  { name:"Shannan Wilson-Ferrara", birthday:{d:1,m:2}, joined:{d:11,m:8,y:2025}, office:"Isle of Man", flag:"🇮🇲", role:"Staff", av:"SW", c:"#BF9A3C" }
];

const GROUP_ANNOUNCEMENTS = [
  { id:1, title:"ISO 27001 audit — 18–19 August 2025",      author:"Gary Harrison",  date:"14/07/2025", priority:"urgent", preview:"The external ISO 27001 surveillance audit is scheduled for 18–19 August. All staff must ensure their DMS filing is up to date." },
  { id:2, title:"Q3 billing deadline — all timesheets by 17:00 Friday", author:"Neil Kelly", date:"08/07/2025", priority:"urgent", preview:"All fee-earners must submit Q3 timesheets by 17:00 this Friday. Neil Kelly will run the billing batch on Monday morning." },
  { id:3, title:"Welcome — Maria Borg joins Malta team",    author:"Joanne Fenech", date:"01/07/2025", priority:"normal",  preview:"We are pleased to welcome Maria Borg to the Malta office as Administrator. Maria joins from Fenlex." },
  { id:4, title:"New office hours — Cayman — effective 1 August", author:"Garry Crossan", date:"10/07/2025", priority:"normal", preview:"Following the team expansion in Cayman, office hours will extend to 08:00–18:00 local time from 1 August." },
];

function getHappenings() {
  // Always returns the next 6 upcoming events, regardless of how far away they are.
  // Includes both birthdays and work anniversaries. Sorted by proximity.
  const monthLen = [31,28,31,30,31,30,31,31,30,31,30,31];
  const dayOfYear = (d,m) => { let total = d; for (let i=1; i<m; i++) total += monthLen[i-1]; return total; };
  const todayDoy = dayOfYear(TODAY.day, TODAY.month);
  const daysAhead = (d,m) => { const t = dayOfYear(d,m); let diff = t - todayDoy; if (diff < 0) diff += 365; return diff; };

  const events = [];
  STAFF_PROFILES.forEach(s => {
    const first = s.name.split(" ")[0];

    // Birthday (skip if not recorded — d:0 marker)
    if (s.birthday && s.birthday.d > 0) {
      const bdAhead = daysAhead(s.birthday.d, s.birthday.m);
      if (bdAhead === 0) {
        events.push({ type:"birthday", person:s, text:`It's ${first}'s birthday today! 🎂`, av:s.av, c:s.c, sort:0 });
      } else {
        events.push({ type:"birthday_soon", person:s, text:`${first}'s birthday — ${formatAhead(bdAhead, s.birthday.d, s.birthday.m)}`, av:s.av, c:s.c, sort:bdAhead });
      }
    }

    // Anniversary
    const annAhead = daysAhead(s.joined.d, s.joined.m);
    const yearNow = new Date().getFullYear();
    const yearsCompleted = TODAY.month > s.joined.m || (TODAY.month === s.joined.m && TODAY.day >= s.joined.d)
      ? yearNow - s.joined.y : yearNow - s.joined.y - 1;
    if (annAhead === 0 && yearsCompleted > 0) {
      events.push({ type:"anniversary", person:s, text:`${first} is celebrating ${yearsCompleted} year${yearsCompleted>1?"s":""} at Affinity! 🎉`, av:s.av, c:s.c, sort:0 });
    } else if (yearsCompleted + 1 > 0) {
      const next = yearsCompleted + 1;
      events.push({ type:"anniversary_soon", person:s, text:`${first} marks ${next} year${next>1?"s":""} at Affinity — ${formatAhead(annAhead, s.joined.d, s.joined.m)}`, av:s.av, c:s.c, sort:annAhead + 0.5 });
    }
  });

  return events.sort((a,b)=>a.sort-b.sort).slice(0, 6);
}

function formatAhead(days, d, m) {
  const monthsShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (days <= 7) return `in ${days} day${days>1?"s":""}`;
  if (days <= 30) return `in ${days} days (${d} ${monthsShort[m-1]})`;
  return `${d} ${monthsShort[m-1]}`;
}

export default function Dashboard({userId, onNav}) {
  const [inboxFilter,setInboxFilter] = useState("mine");
  const [taskFilter,setTaskFilter]   = useState("mine");
  const [liveTasks,setLiveTasks]     = useState(null);
  const [liveOnb,setLiveOnb]         = useState(null);
  const [liveDebtors,setLiveDebtors] = useState(null);

  useEffect(()=>{
    if(!isConfigured) return;
    let ok=true;
    tasksList().then(({data})=>{
      if(ok && data && data.length) setLiveTasks(data.map(t=>({ id:t.id, title:t.title, assignee:t.assignee,
        module:t.category, priority:t.priority, due:t.due, entity:t.entity })));
    }).catch(()=>{});
    onboardingCases().then(({data})=>{
      if(ok && data && data.length) setLiveOnb(data.map(o=>({ name:o.name, pct:o.pct, overdue:o.overdue })));
    }).catch(()=>{});
    feeInvoices().then(({data})=>{
      if(ok && data && data.length){
        const outstanding = data.filter(i=>Number(i.balance)>0 && i.status!=="Draft")
          .map(i=>({ entity:i.entity, amount:Number(i.balance), age:i.status==="Overdue"?"Overdue":i.status==="Partial"?"Partial":"Current", status:i.status }));
        if(outstanding.length) setLiveDebtors(outstanding);
      }
    }).catch(()=>{});
    return ()=>{ok=false;};
  },[]);

  const user = USERS.find(u=>u.id===userId)||USERS[0];
  const isManager = user.isManager || userId===1;
  const allTasks   = liveTasks || ALL_TASKS;
  const onboarding = liveOnb   || ONBOARDING;

  // My tasks vs team tasks
  const myTasks   = allTasks.filter(t=>t.assignee===user.name);
  const teamTasks = isManager ? allTasks.filter(t=>user.team.includes(t.assignee)) : [];
  const shownTasks = taskFilter==="mine" ? myTasks : taskFilter==="team" ? teamTasks : allTasks;

  // My inbox vs team inbox
  const myInbox   = INBOX_ITEMS.filter(i=>i.assignee===user.name);
  const teamInbox = isManager ? INBOX_ITEMS.filter(i=>user.team.includes(i.assignee)) : [];
  const shownInbox = inboxFilter==="mine" ? myInbox : inboxFilter==="team" ? teamInbox : INBOX_ITEMS;
  const overdueInbox = shownInbox.filter(i=>i.daysOld>=7);

  const myDebtors = liveDebtors || DEBTORS[userId]||[];
  const debtTotal = myDebtors.reduce((s,d)=>s+d.amount,0);
  const wip = userId===2?18240:userId===3?16800:userId===4?8138:userId===6?0:48320;
  const util = userId===1?56:userId===2?76:userId===3?82:userId===4?74:userId===5?75:77;
  const critCount = myTasks.filter(t=>t.priority==="Critical").length;

  const KPIS = userId===6
    ? [{l:"Overdue reviews",v:3,c:"#EF4444"},{l:"Open cases",v:5,c:"#F59E0B"},{l:"Expired KYC",v:2,c:"#EF4444"},{l:"My inbox",v:myInbox.length,c:CY},{l:"Team inbox",v:teamInbox.length}]
    : userId===5
    ? [{l:"Outstanding debt",v:fmt(debtTotal),c:"#EF4444"},{l:"Invoiced YTD",v:fmt(297000)},{l:"My WIP",v:fmt(wip),c:CY},{l:"My inbox",v:myInbox.length,c:CY},{l:"Utilisation",v:util+"%",c:util>=75?"#4CAF7D":"#F59E0B"}]
    : [{l:"My tasks",v:myTasks.length,c:critCount>0?"#EF4444":CY},{l:"My entities",v:userId===1?300:userId===2?4:userId===3?4:2},{l:"My WIP",v:fmt(wip),c:CY},{l:"My debtors",v:debtTotal>0?fmt(debtTotal):"—",c:debtTotal>3000?"#EF4444":null},{l:"Utilisation",v:util+"%",c:util>=75?"#4CAF7D":"#F59E0B"}];

  return (
    <div style={{padding:18,fontFamily:"'Catamaran',system-ui,sans-serif"}}>
      {/* Greeting */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:18,fontWeight:700}}>Good morning, {user.name.split(" ")[0]}.</div>
        <div style={{fontSize:12,color:"#666",marginTop:3}}>{user.office} &middot; {user.role}
          {critCount>0&&<span style={{color:"#EF4444",marginLeft:8}}>⚠ {critCount} critical item{critCount>1?"s":""} require your attention.</span>}
        </div>
      </div>

      {/* What's happening at Affinity */}
      {(()=>{
        const happenings = getHappenings();
        const announcements = GROUP_ANNOUNCEMENTS.slice(0,2);
        // happenings always returns 6 items now, so card is always populated
        return (
          <div style={{background:"#fff",border:"0.5px solid #e5e5e5",borderRadius:10,padding:14,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",color:"#888",marginBottom:12}}>
              What's happening at Affinity
            </div>

            {/* Birthdays & anniversaries */}
            {happenings.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:announcements.length>0?12:0}}>
              {happenings.map((h,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:h.type==="birthday"?"#FFF8E7":h.type==="anniversary"?"#E6F7FB":"#F9F9F9",borderRadius:8,padding:"8px 12px",flex:"1 1 200px"}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:h.c+"22",color:h.c,fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{h.av}</div>
                  <div>
                    <div style={{fontSize:12,fontWeight:500,color:"#111"}}>{h.text}</div>
                    <div style={{fontSize:10,color:"#999",marginTop:1}}>{h.person.role}</div>
                  </div>
                </div>
              ))}
            </div>}

            {/* Announcements */}
            {announcements.length>0&&<div>
              {happenings.length>0&&<div style={{borderTop:"0.5px solid #f0f0f0",marginBottom:10}}/>}
              {announcements.map((a,i)=>(
                <div key={a.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"6px 0",borderBottom:i<announcements.length-1?"0.5px solid #f5f5f5":"none"}}>
                  <span style={{fontSize:15,flexShrink:0}}>{a.priority==="urgent"?"📢":"📣"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</div>
                    <div style={{fontSize:11,color:"#666",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.preview}</div>
                    <div style={{fontSize:10,color:"#aaa",marginTop:2}}>{a.author} · {a.date}</div>
                  </div>
                  {a.priority==="urgent"&&<span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:9,fontWeight:600,background:"#FAEEDA",color:"#633806",flexShrink:0}}>Urgent</span>}
                </div>
              ))}
            </div>}
          </div>
        );
      })()}

      {/* Timesheet alert */}
      {userId===4&&<div style={{background:"#FCEBEB22",border:"0.5px solid #EF4444",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:12,fontWeight:600,color:"#A32D2D"}}>⚠ Timesheet not submitted — Wednesday, Thursday missing</div><button style={{padding:"5px 12px",borderRadius:5,border:"none",background:"#EF4444",color:"#fff",fontSize:11,cursor:"pointer"}}>Submit now</button></div>}

      {/* Inbox 7d+ alert */}
      {overdueInbox.length>0&&<div style={{background:"#FAEEDA22",border:"0.5px solid #F59E0B",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:12,fontWeight:500,color:"#633806"}}>✉ {overdueInbox.length} item{overdueInbox.length>1?"s":""} in your inbox have been waiting 7+ days and need attention.</div><button onClick={()=>setInboxFilter("mine")} style={{padding:"5px 12px",borderRadius:5,border:"none",background:"#F59E0B",color:"#fff",fontSize:11,cursor:"pointer"}}>View inbox</button></div>}

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
        {KPIS.map(k=><div key={k.l} style={{background:"#f9f9f9",borderRadius:6,padding:"10px 14px"}}><div style={{fontSize:10,color:"#666",marginBottom:3}}>{k.l}</div><div style={{fontSize:20,fontWeight:600,color:k.c||"#111"}}>{k.v}</div></div>)}
      </div>

      {/* Main grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>

        {/* Tasks */}
        <Card title={
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            Tasks
            {isManager&&<div style={{display:"flex",gap:3}}>
              {["mine","team"].map(f=><button key={f} onClick={()=>setTaskFilter(f)} style={{padding:"2px 8px",borderRadius:20,border:`0.5px solid ${taskFilter===f?"#ccc":"#e5e5e5"}`,background:taskFilter===f?"#fff":"transparent",color:taskFilter===f?"#111":"#aaa",cursor:"pointer",fontSize:10}}>{f==="mine"?"Mine":"My team"}{f==="team"&&<span style={{marginLeft:3,fontWeight:600,color:teamTasks.filter(t=>t.priority==="Critical").length>0?"#EF4444":"#F59E0B"}}>({teamTasks.length})</span>}</button>)}
            </div>}
          </div>
        } action={<button onClick={()=>onNav&&onNav("tasks")} style={{padding:"4px 10px",borderRadius:5,border:"0.5px solid #e5e5e5",background:"transparent",fontSize:11,cursor:"pointer"}}>View all ↗</button>}>
          {shownTasks.slice(0,6).map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 0",borderBottom:"0.5px solid #e5e5e5"}}>
              <div style={{width:7,height:7,borderRadius:"50%",marginTop:4,flexShrink:0,background:t.priority==="Critical"?"#EF4444":t.priority==="High"?"#F59E0B":CY}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div>
                <div style={{fontSize:10,color:"#999",marginTop:2}}>{taskFilter==="team"?t.assignee+" · ":""}{t.due} &middot; {t.entity}</div>
              </div>
              <Bx label={t.module} colors={modColors[t.module]||{bg:"#eee",color:"#666"}}/>
            </div>
          ))}
          {shownTasks.length===0&&<div style={{fontSize:12,color:"#4CAF7D",padding:"10px 0"}}>✓ No outstanding tasks</div>}
        </Card>

        {/* Inbox */}
        <Card title={
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            Inbox — post &amp; scanned documents
            {isManager&&<div style={{display:"flex",gap:3}}>
              {["mine","team"].map(f=><button key={f} onClick={()=>setInboxFilter(f)} style={{padding:"2px 8px",borderRadius:20,border:`0.5px solid ${inboxFilter===f?"#ccc":"#e5e5e5"}`,background:inboxFilter===f?"#fff":"transparent",color:inboxFilter===f?"#111":"#aaa",cursor:"pointer",fontSize:10}}>{f==="mine"?"Mine":"My team"}{f==="team"&&<span style={{marginLeft:3,fontWeight:600,color:"#F59E0B"}}>({teamInbox.length})</span>}</button>)}
            </div>}
          </div>
        } action={<button onClick={()=>onNav&&onNav("documents")} style={{padding:"4px 10px",borderRadius:5,border:"0.5px solid #e5e5e5",background:"transparent",fontSize:11,cursor:"pointer"}}>Open DMS ↗</button>}
        border={overdueInbox.length>0?"#F59E0B":"#e5e5e5"}>
          {shownInbox.length===0&&<div style={{fontSize:12,color:"#aaa",padding:"10px 0"}}>No items in inbox.</div>}
          {shownInbox.slice(0,6).map(i=>(
            <div key={i.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 0",borderBottom:"0.5px solid #e5e5e5",opacity:i.read?0.6:1}}>
              <div style={{width:7,height:7,borderRadius:"50%",marginTop:4,flexShrink:0,background:i.daysOld>=7?"#EF4444":i.daysOld>=4?"#F59E0B":"#4CAF7D"}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
                  <Bx label={i.type} colors={i.type==="Scan"?{bg:"#E6F7FB",color:"#0077A8"}:{bg:"#EEF0FB",color:"#3C3489"}}/>
                  <span style={{fontSize:12,fontWeight:i.read?400:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.subject}</span>
                </div>
                <div style={{fontSize:10,color:"#999"}}>{i.from} &middot; {i.entity} &middot; <span style={{color:i.daysOld>=7?"#EF4444":i.daysOld>=4?"#F59E0B":"#999",fontWeight:i.daysOld>=7?600:400}}>{i.daysOld===0?"Today":i.daysOld===1?"Yesterday":i.daysOld+"d ago"}{i.daysOld>=7?" — action needed":""}</span></div>
                {inboxFilter==="team"&&<div style={{fontSize:10,color:"#aaa",marginTop:1}}>Assigned to {i.assignee}</div>}
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                <button style={{padding:"3px 7px",borderRadius:4,border:"0.5px solid #e5e5e5",background:"transparent",fontSize:10,cursor:"pointer"}}>File ↗</button>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Second row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        {/* Revenue or compliance stats */}
        {userId!==6?<Card title="Revenue by office — YTD 2025">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={REVC} margin={{top:0,right:0,left:-15,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5"/>
              <XAxis dataKey="month" tick={{fontSize:10}}/>
              <YAxis tick={{fontSize:10}} tickFormatter={v=>"£"+(v/1000).toFixed(0)+"k"}/>
              <Tooltip formatter={(v,n)=>["£"+Number(v).toLocaleString(),n]}/>
              <Bar dataKey="IOM"    name="Isle of Man"    stackId="a" fill={CY}/>
              <Bar dataKey="Malta"  name="Malta"          stackId="a" fill="#7C5CBF"/>
              <Bar dataKey="Cayman" name="Cayman Islands" stackId="a" fill="#1A7FBF"/>
              <Bar dataKey="UK"     name="UK"             stackId="a" fill="#4A7C6F"/>
              <Bar dataKey="Miami"  name="Miami"          stackId="a" fill="#BF5C7A"/>
            </BarChart>
          </ResponsiveContainer>
        </Card>:
        <Card title="Compliance overview">
          {[{l:"Overdue reviews",v:3,c:"#EF4444"},{l:"Due this month",v:2,c:"#F59E0B"},{l:"Expired KYC",v:2,c:"#EF4444"},{l:"Open cases",v:5,c:"#F59E0B"},{l:"Completion rate",v:"94%",c:"#4CAF7D"}].map(k=><div key={k.l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}><span style={{color:"#666"}}>{k.l}</span><span style={{fontWeight:600,color:k.c}}>{k.v}</span></div>)}
        </Card>}

        {/* Onboarding pipeline */}
        <Card title="Onboarding pipeline" action={<button onClick={()=>onNav&&onNav("onboarding")} style={{padding:"4px 10px",borderRadius:5,border:"0.5px solid #e5e5e5",background:"transparent",fontSize:11,cursor:"pointer"}}>View ↗</button>}>
          {onboarding.map(o=>(
            <div key={o.name} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
                <span style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{o.name}</span>
                <span style={{color:o.overdue?"#EF4444":"#666",flexShrink:0,marginLeft:6}}>{o.pct}%{o.overdue&&" ⚠"}</span>
              </div>
              <div style={{height:5,background:"#f9f9f9",borderRadius:3}}><div style={{height:"100%",width:`${o.pct}%`,background:o.overdue?"#EF4444":CY,borderRadius:3}}/></div>
            </div>
          ))}
        </Card>
      </div>

      {/* Third row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {/* Debtors or recently accessed */}
        {myDebtors.length>0?<Card title="My debtors" action={<button onClick={()=>onNav&&onNav("invoicing")} style={{padding:"4px 10px",borderRadius:5,border:"0.5px solid #e5e5e5",background:"transparent",fontSize:11,cursor:"pointer"}}>View all ↗</button>}>
          {myDebtors.map((d,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}>
              <div><div style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>{d.entity}</div><div style={{fontSize:10,color:"#999",marginTop:2}}>{d.age}</div></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontWeight:600,color:d.status==="Overdue"?"#EF4444":CY}}>{fmt(d.amount)}</span>
                <Bx label={d.status} colors={{Overdue:{bg:"#FCEBEB",color:"#A32D2D"},Sent:{bg:"#E6F1FB",color:"#0C447C"},Partial:{bg:"#FAEEDA",color:"#633806"}}[d.status]||{bg:"#eee",color:"#666"}}/>
              </div>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:13,fontWeight:700}}><span>Total outstanding</span><span style={{color:"#EF4444"}}>{fmt(debtTotal)}</span></div>
        </Card>:
        <Card title="Pending approvals">
          {[{item:"Q3 retainer invoices",type:"Invoicing",count:7},{item:"Time entries — week 28",type:"Timesheets",count:4},{item:"North Star attrition",type:"Onboarding",count:1}].map((a,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}>
              <div><div style={{fontWeight:500}}>{a.item}</div><Bx label={a.type} colors={modColors[a.type]||{bg:"#eee",color:"#666"}}/></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:600,color:CY}}>{a.count} item{a.count>1?"s":""}</span><button style={{padding:"4px 10px",borderRadius:5,border:"none",background:CY,color:"#fff",fontSize:11,cursor:"pointer"}}>Open ↗</button></div>
            </div>
          ))}
        </Card>}

        {/* Recently accessed */}
        <Card title="Recently accessed">
          {RECENT.map((r,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"0.5px solid #e5e5e5",fontSize:12}}>
              <div><div style={{fontWeight:500}}>{r.name}</div><Bx label={r.type} colors={modColors[r.type]||{bg:"#eee",color:"#666"}}/></div>
              <span style={{fontSize:10,color:"#aaa",flexShrink:0,marginLeft:8}}>{r.date}</span>
            </div>
          ))}
          <div style={{marginTop:10}}>
            <div style={{fontSize:10,color:"#aaa",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.4px"}}>Quick links</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {["Entity Admin","Timesheets","Invoicing","Compliance"].map(l=><button key={l} onClick={()=>onNav&&onNav(l.toLowerCase().replace(" ",""))} style={{padding:"4px 10px",borderRadius:20,border:"0.5px solid #e5e5e5",background:"transparent",fontSize:11,cursor:"pointer",color:"#666"}}>{l} ↗</button>)}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
