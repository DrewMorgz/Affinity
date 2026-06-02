import { useState } from "react";
const CY = "#00C4CC";
const NAVY = "#001242";

const STRUCTURES = [
  {
    id: 1,
    name: "Harrington Family Group",
    admin: "Roxy Sheeley",
    nodes: [
      { id:"hft",  label:"Harrington Family Trust",    type:"Trust",      jur:"Isle of Man",    risk:"High",   x:340, y:40,  children:["hnl","hhl"] },
      { id:"hnl",  label:"Harrington Nominees Ltd",     type:"Company",    jur:"Isle of Man",    risk:"Medium", x:160, y:180, children:[] },
      { id:"hhl",  label:"Harrington Holdings Ltd",     type:"Company",    jur:"Cayman Islands", risk:"Medium", x:520, y:180, children:["hpa"] },
      { id:"hpa",  label:"Harrington Property Assoc",   type:"Company",    jur:"United Kingdom", risk:"Low",    x:520, y:320, children:[] },
    ],
    roles: [
      { name:"James Harrington",  role:"Settlor / Protector",   entity:"hft" },
      { name:"Emma Harrington",   role:"Beneficiary",           entity:"hft" },
      { name:"Affinity Trust Ltd",role:"Trustee",               entity:"hft" },
    ]
  },
  {
    id: 2,
    name: "Meridian Group",
    admin: "Roxy Sheeley",
    nodes: [
      { id:"mhl",  label:"Meridian Holdings Ltd",       type:"Company",    jur:"Isle of Man",    risk:"Medium", x:340, y:40,  children:["mdl","msa"] },
      { id:"mdl",  label:"Meridian Digital Ltd",        type:"Company",    jur:"Isle of Man",    risk:"Medium", x:160, y:180, children:[] },
      { id:"msa",  label:"Meridian Services Asia Ltd",  type:"Company",    jur:"Cayman Islands", risk:"Low",    x:520, y:180, children:[] },
    ],
    roles: [
      { name:"Wei Chen",          role:"Director / UBO",        entity:"mhl" },
      { name:"Sophie Laurent",    role:"Director",              entity:"mhl" },
    ]
  },
  {
    id: 3,
    name: "Pacific Wealth",
    admin: "Garry Crossan",
    nodes: [
      { id:"pwt",  label:"Pacific Wealth Trust",        type:"Trust",      jur:"Cayman Islands", risk:"High",   x:340, y:40,  children:["pwh","pwa"] },
      { id:"pwh",  label:"Pacific Wealth Holdings Ltd", type:"Company",    jur:"Cayman Islands", risk:"Medium", x:160, y:180, children:[] },
      { id:"pwa",  label:"Pacific Wealth Asia Ltd",     type:"Company",    jur:"Cayman Islands", risk:"Medium", x:520, y:180, children:[] },
    ],
    roles: [
      { name:"David Park",        role:"Settlor",               entity:"pwt" },
      { name:"Affinity Trust Ltd",role:"Trustee",               entity:"pwt" },
    ]
  },
];

const TYPE_COLORS = {
  Trust:    { bg:"#EEF0FB", color:"#3C3489", border:"#3C3489" },
  Company:  { bg:"#E6F7FB", color:"#0077A8", border:"#0077A8" },
  Foundation:{ bg:"#EAF3DE", color:"#27500A", border:"#27500A" },
  Fund:     { bg:"#FAEEDA", color:"#633806", border:"#633806" },
};

const RISK_DOT = { High:"#EF4444", Medium:"#F59E0B", Low:"#4CAF7D", "Very High":"#A32D2D" };

const JUR_FLAGS = {
  "Isle of Man":"🇮🇲", "Malta":"🇲🇹", "Cayman Islands":"🇰🇾",
  "United Kingdom":"🇬🇧", "USA":"🇺🇸", "Cyprus":"🇨🇾"
};

function Node({ node, selected, onClick }) {
  const tc = TYPE_COLORS[node.type] || TYPE_COLORS.Company;
  const sel = selected === node.id;
  return (
    <g onClick={() => onClick(node.id)} style={{ cursor:"pointer" }}>
      {/* Shadow */}
      <rect x={node.x - 85} y={node.y + 3} width={170} height={64} rx={10} fill="rgba(0,0,0,0.08)" />
      {/* Card */}
      <rect x={node.x - 85} y={node.y} width={170} height={64} rx={10}
        fill={sel?"#fff":tc.bg}
        stroke={sel?CY:tc.border}
        strokeWidth={sel?2:1}
      />
      {/* Type badge */}
      <rect x={node.x - 75} y={node.y + 8} width={50} height={14} rx={7} fill={tc.color} opacity={0.15}/>
      <text x={node.x - 50} y={node.y + 18} textAnchor="middle" fontSize={8} fontWeight={600} fill={tc.color} fontFamily="Catamaran,sans-serif">{node.type.toUpperCase()}</text>
      {/* Name */}
      <text x={node.x} y={node.y + 36} textAnchor="middle" fontSize={11} fontWeight={600} fill={sel?"#001242":tc.color} fontFamily="Catamaran,sans-serif">
        {node.label.length > 22 ? node.label.slice(0,20)+"…" : node.label}
      </text>
      {/* Jurisdiction flag */}
      <text x={node.x - 62} y={node.y + 54} fontSize={10} fontFamily="Catamaran,sans-serif">{JUR_FLAGS[node.jur]||"🌐"}</text>
      <text x={node.x - 48} y={node.y + 54} fontSize={9} fill="#888" fontFamily="Catamaran,sans-serif">{node.jur}</text>
      {/* Risk dot */}
      <circle cx={node.x + 72} cy={node.y + 12} r={5} fill={RISK_DOT[node.risk]||"#aaa"} />
    </g>
  );
}

function Edge({ from, to }) {
  const x1 = from.x, y1 = from.y + 64;
  const x2 = to.x,   y2 = to.y;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <path
      d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
      stroke="#ccd" strokeWidth={1.5} fill="none" strokeDasharray="4 2"
    />
  );
}

export default function AffinityEntityChart() {
  const [selGroup, setSelGroup] = useState(0);
  const [selNode,  setSelNode]  = useState(null);

  const group = STRUCTURES[selGroup];
  const nodeMap = Object.fromEntries(group.nodes.map(n => [n.id, n]));
  const selNodeData = selNode ? nodeMap[selNode] : null;

  const nb  = { padding:"5px 12px", fontSize:11, borderRadius:5, border:"0.5px solid #e5e5e5", background:"transparent", color:"#666", cursor:"pointer" };
  const nba = { ...nb, background:CY, color:"#fff", border:`0.5px solid ${CY}`, fontWeight:500 };

  // Build edges from children
  const edges = [];
  group.nodes.forEach(n => {
    (n.children||[]).forEach(childId => {
      const child = nodeMap[childId];
      if (child) edges.push({ from:n, to:child });
    });
  });

  return (
    <div style={{ fontFamily:"'Catamaran',system-ui,sans-serif", background:"#f8f9fc", color:"#111", minHeight:"100vh" }}>
      <div style={{ background:NAVY, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ color:"#fff", fontWeight:700, fontSize:17 }}>Affinity <span style={{ fontWeight:300 }}>Core</span></span>
          <span style={{ color:"#8892b0", fontSize:13 }}>Entity Structure</span>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button style={{ ...nb, color:"#8892b0", borderColor:"#334" }}>Entity Admin ↗</button>
          <button style={nba}>Structure chart</button>
        </div>
      </div>

      {/* Group selector */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid #e5e5e5", padding:"10px 24px", display:"flex", gap:8, alignItems:"center", overflowX:"auto" }}>
        <span style={{ fontSize:11, color:"#888", marginRight:4, flexShrink:0 }}>Group:</span>
        {STRUCTURES.map((g, i) => (
          <button key={g.id} onClick={() => { setSelGroup(i); setSelNode(null); }}
            style={{ padding:"5px 14px", borderRadius:20, border:`0.5px solid ${selGroup===i?"#ccc":"#e5e5e5"}`, background:selGroup===i?"#fff":"transparent", fontSize:12, fontWeight:selGroup===i?600:400, cursor:"pointer", color:selGroup===i?"#111":"#666", whiteSpace:"nowrap" }}>
            {g.name}
          </button>
        ))}
        <span style={{ fontSize:11, color:"#aaa", marginLeft:4 }}>· {group.admin}</span>
      </div>

      <div style={{ display:"flex", height:"calc(100vh - 100px)" }}>
        {/* Chart */}
        <div style={{ flex:1, overflow:"auto", padding:24 }}>
          <div style={{ background:"#fff", borderRadius:12, border:"0.5px solid #e5e5e5", padding:24, minHeight:440, position:"relative" }}>
            {/* Legend */}
            <div style={{ display:"flex", gap:16, marginBottom:16, flexWrap:"wrap" }}>
              {Object.entries(TYPE_COLORS).map(([type, c]) => (
                <div key={type} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:12, height:12, borderRadius:3, background:c.bg, border:`1px solid ${c.border}` }} />
                  <span style={{ fontSize:11, color:"#666" }}>{type}</span>
                </div>
              ))}
              <div style={{ display:"flex", gap:10, marginLeft:"auto" }}>
                {Object.entries(RISK_DOT).map(([risk, c]) => (
                  <div key={risk} style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:c }} />
                    <span style={{ fontSize:10, color:"#aaa" }}>{risk}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SVG Chart */}
            <svg width="100%" height="420" viewBox="0 0 700 420" style={{ overflow:"visible" }}>
              {/* Edges first (behind nodes) */}
              {edges.map((e, i) => <Edge key={i} from={e.from} to={e.to} />)}
              {/* Nodes */}
              {group.nodes.map(n => (
                <Node key={n.id} node={n} selected={selNode} onClick={setSelNode} />
              ))}
            </svg>
          </div>
        </div>

        {/* Detail panel */}
        <div style={{ width:280, borderLeft:"0.5px solid #e5e5e5", background:"#fff", padding:20, overflowY:"auto", flexShrink:0 }}>
          {!selNodeData ? (
            <div>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:14 }}>Group summary</div>
              <div style={{ fontSize:11, color:"#666", marginBottom:16 }}>{group.nodes.length} entities in this structure</div>
              {/* People / roles */}
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:10 }}>Key roles</div>
              {group.roles.map((r, i) => (
                <div key={i} style={{ padding:"8px 0", borderBottom:"0.5px solid #f5f5f5" }}>
                  <div style={{ fontSize:12, fontWeight:500 }}>{r.name}</div>
                  <div style={{ fontSize:10, color:"#aaa", marginTop:2 }}>{r.role}</div>
                  <div style={{ fontSize:10, color:CY, marginTop:1 }}>{nodeMap[r.entity]?.label}</div>
                </div>
              ))}
              <div style={{ marginTop:16, fontSize:11, color:"#aaa" }}>Click any entity in the chart to see details</div>
            </div>
          ) : (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{selNodeData.label}</div>
                <button onClick={() => setSelNode(null)} style={{ background:"none", border:"none", fontSize:16, cursor:"pointer", color:"#aaa" }}>×</button>
              </div>
              {[
                ["Type",    selNodeData.type],
                ["Jurisdiction", selNodeData.jur],
                ["Risk",    selNodeData.risk],
                ["Children", selNodeData.children?.length || 0],
              ].map(([k,v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"0.5px solid #f5f5f5", fontSize:12 }}>
                  <span style={{ color:"#666" }}>{k}</span>
                  <span style={{ fontWeight:500 }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px", color:"#888", marginBottom:8 }}>Associated roles</div>
                {group.roles.filter(r => r.entity === selNodeData.id).map((r, i) => (
                  <div key={i} style={{ padding:"6px 0", borderBottom:"0.5px solid #f5f5f5" }}>
                    <div style={{ fontSize:12, fontWeight:500 }}>{r.name}</div>
                    <div style={{ fontSize:10, color:"#aaa" }}>{r.role}</div>
                  </div>
                ))}
                {group.roles.filter(r => r.entity === selNodeData.id).length === 0 && (
                  <div style={{ fontSize:11, color:"#aaa" }}>No direct roles recorded</div>
                )}
              </div>
              <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:6 }}>
                <button style={nba}>Open in Entity Admin ↗</button>
                <button style={nb}>View documents ↗</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
