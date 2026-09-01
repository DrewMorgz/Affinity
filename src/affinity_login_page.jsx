import { useState, useEffect } from "react";
import { signInWithMicrosoft, isAuthConfigured } from "./affinity_auth";

const CY = "#00C4CC";
const NAVY = "#001242";

const STATS = [
  { v: "20+",  l: "Years established" },
  { v: "6",    l: "Global offices" },
  { v: "£2B+", l: "Assets under management" },
  { v: "300+", l: "Entities under management" },
  { v: "50+",  l: "Team members worldwide" },
];

const OFFICES = [
  { name: "Isle of Man",    flag: "🇮🇲", since: "Est. 2004", desc: "Our home and headquarters" },
  { name: "Malta",          flag: "🇲🇹", since: "Est. 2011", desc: "Mediterranean hub" },
  { name: "Cayman Islands", flag: "🇰🇾", since: "Est. 2021", desc: "Caribbean operations" },
  { name: "United Kingdom", flag: "🇬🇧", since: "Est. 2025", desc: "London presence" },
  { name: "Miami",          flag: "🇺🇸", since: "Est. 2023", desc: "South Florida expansion" },
  { name: "Cyprus",         flag: "🇨🇾", since: "Est. 2026", desc: "Eastern Mediterranean" },
];

const VALUES = [
  { icon: "⚡", title: "Specialist expertise", desc: "Deep knowledge in corporate and trust services across every jurisdiction we operate in." },
  { icon: "🤝", title: "Boutique service",      desc: "High Net Worth clients deserve personalised attention. We never compromise on that." },
  { icon: "🌍", title: "Global reach",          desc: "Six offices. One team. The same standard of service wherever you are in the world." },
  { icon: "🏆", title: "Award winning",         desc: "Recognised by Citywealth and industry peers for excellence in wealth management services." },
];

// Credentials are no longer held in the front end. Staff sign in with their
// Microsoft 365 account through Entra; see affinity_auth.js.
// The previous LOGIN_MAP put 17 staff passwords into the public bundle.

export default function AffinityLoginPage({ onLogin }) {
  const [showSplash, setShowSplash] = useState(true);
  const [username, setUsername]     = useState("");
  const [password, setPassword]     = useState("");
  const [showPass, setShowPass]     = useState(false);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3200);
    return () => clearTimeout(timer);
  }, []);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    const { error } = await signInWithMicrosoft();
    if (error) { setError(error.message); setLoading(false); }
    // On success the browser leaves for Microsoft and returns signed in.
  };

  // Demo access while Entra is being set up. Grants the read-only preview only —
  // the database stays locked, so no client data is reachable this way.
  const handlePreview = () => { onLogin(1); };


  // ── SPLASH SCREEN (block-letter Affinity wordmark, pure CSS) ──
  if (showSplash) return (
    <div onClick={() => setShowSplash(false)} style={{
      minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center",
      justifyContent: "center", flexDirection: "column", cursor: "pointer",
      fontFamily: "'Catamaran', system-ui, sans-serif", position: "relative", overflow: "hidden"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Catamaran:wght@300;400;700;800;900&display=swap');
        @keyframes fadeInUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      `}</style>

      <div style={{ marginBottom: 32, textAlign: "center", animation: "fadeInUp 0.8s ease 0.3s both" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35em", justifyContent: "center", width: "100%" }}>
          <img src="https://cdn.prod.website-files.com/680f471059835ea8d579b7e8/680f87c089dc0cf0630d7c8d_Affinity%20grad.svg" alt="Affinity" style={{ height: "clamp(56px, 11vw, 96px)", display: "block" }} />
          <span style={{ fontFamily: "'Catamaran', system-ui, sans-serif", fontSize: "clamp(48px, 9.5vw, 84px)", fontWeight: 300, color: "#fff", letterSpacing: "-1px", lineHeight: 1 }}>Core</span>
        </div>
        <div style={{ fontSize: 12, color: "#fff", textTransform: "uppercase", letterSpacing: "3px", marginTop: 16 }}>
          Made by Affinity, for Affinity
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: 420, marginBottom: 40, animation: "fadeInUp 0.8s ease 0.8s both" }}>
        {[
          { flag: "🇮🇲", name: "Isle of Man" },
          { flag: "🇲🇹", name: "Malta" },
          { flag: "🇰🇾", name: "Cayman Islands" },
          { flag: "🇨🇾", name: "Cyprus" },
          { flag: "🇬🇧", name: "United Kingdom" },
          { flag: "🇺🇸", name: "Miami" },
          { flag: "🇨🇾", name: "Cyprus" },
        ].map(j => (
          <div key={j.name} style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 30, padding: "7px 14px" }}>
            <span style={{ fontSize: 14 }}>{j.flag}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 400 }}>{j.name}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: "1px", textTransform: "uppercase", animation: "fadeInUp 0.6s ease 1.2s both" }}>
        Tap to continue
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.05)" }}>
        <div style={{ height: "100%", background: CY, transformOrigin: "left", animation: "grow 3s ease forwards" }} />
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Catamaran', system-ui, sans-serif", background: "#fff", minHeight: "100vh", color: "#111" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Catamaran:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-up { animation: fadeUp 0.7s ease forwards; }
        .office-card:hover { background: ${NAVY} !important; color: #fff !important; }
        .office-card:hover .office-flag { transform: scale(1.2); }
        .office-flag { transition: transform 0.2s ease; display: inline-block; }
        .login-input:focus { border-color: ${CY} !important; box-shadow: 0 0 0 3px rgba(0,196,204,0.15); outline: none; }
        .sign-in-btn:hover { background: #009ba3 !important; transform: translateY(-1px); }
        .sign-in-btn:active { transform: translateY(0); }
        .sign-in-btn { transition: all 0.2s ease; }
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: 1fr 1fr !important; }
          .offices-grid { grid-template-columns: 1fr 1fr !important; }
          .values-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── HERO SECTION ─────────────────────────────── */}
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

        <div style={{ position: "absolute", inset: 0, zIndex: 0, background: NAVY }}>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 90% at 85% 12%, rgba(0,196,204,0.18) 0%, rgba(0,196,204,0) 55%), radial-gradient(110% 80% at 8% 92%, rgba(46,230,206,0.10) 0%, rgba(0,18,66,0) 50%), linear-gradient(160deg, #001242 0%, #001a52 58%, #001242 100%)` }} />
        </div>

        <div className="hero-grid" style={{ position: "relative", zIndex: 10, flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, maxWidth: 1200, margin: "0 auto", width: "100%", padding: "40px 40px 60px", alignItems: "center" }}>

          <div style={{ paddingRight: 60 }}>
            <div className="fade-up" style={{ animationDelay: "0.1s" }}>
              <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 3, height: 36, background: CY, borderRadius: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "3px", lineHeight: 1.2 }}>Corporate &amp; Trust Services</div>
                  <div style={{ fontSize: 12, color: CY, fontWeight: 600, letterSpacing: "2px", marginTop: 3 }}>Est. 2004</div>
                </div>
              </div>
            </div>

            <div className="fade-up" style={{ animationDelay: "0.2s" }}>
              <h1 style={{ fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 800, color: "#fff", lineHeight: 1.1, marginBottom: 20, letterSpacing: "-1px" }}>
                One platform.<br />
                <span style={{ color: CY }}>Every office.</span><br />
                Every team.
              </h1>
            </div>

            <div className="fade-up" style={{ animationDelay: "0.3s" }}>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, marginBottom: 32, maxWidth: 420 }}>
                We originated in the Isle of Man in 2004 and pride ourselves on our specialist expertise and boutique service. Affinity Core brings our global team together.
              </p>
            </div>

            <div className="fade-up" style={{ animationDelay: "0.4s", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 2, background: CY, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", letterSpacing: "0.5px" }}>Isle of Man · Malta · Cayman · UK · Miami · Cyprus</span>
            </div>
          </div>

          <div className="fade-up" style={{ animationDelay: "0.3s" }}>
            <div style={{ background: "rgba(255,255,255,0.97)", borderRadius: 20, padding: "36px 32px", boxShadow: "0 40px 80px rgba(0,0,0,0.3)", backdropFilter: "blur(20px)" }}>
              <div style={{ marginBottom: 28, textAlign:"center" }}>
                <div style={{ display:"inline-flex", alignItems:"center", gap:"0.3em", justifyContent:"center", marginBottom:10 }}>
                  <img src="https://cdn.prod.website-files.com/680f471059835ea8d579b7e8/680f87c089dc0cf0630d7c8d_Affinity%20grad.svg" alt="Affinity" style={{ height:42, display:"block" }} />
                  <span style={{ fontSize:38, fontWeight:300, color:NAVY, letterSpacing:"-1px", lineHeight:1 }}>Core</span>
                </div>
                <p style={{ fontSize: 13, color: "#888", margin:0 }}>Sign in with your Affinity Microsoft account</p>
              </div>

              {/* Microsoft Entra sign-in. Staff use the account they already
                  have for Outlook and Teams — no separate password here. */}
              <button className="sign-in-btn" onClick={handleLogin} disabled={loading}
                style={{ width: "100%", padding: "14px", background: loading ? "#aaa" : "#2F2F2F", color: "#fff",
                         border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer",
                         display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <svg width="17" height="17" viewBox="0 0 23 23" aria-hidden="true">
                  <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
                  <rect x="12" y="1"  width="10" height="10" fill="#7FBA00"/>
                  <rect x="1"  y="12" width="10" height="10" fill="#00A4EF"/>
                  <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
                </svg>
                {loading ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
              </button>

              {error && (
                <div style={{ fontSize: 12, color: "#EF4444", marginTop: 12, lineHeight: 1.6 }}>{error}</div>
              )}

              {!isAuthConfigured() && (
                <div style={{ marginTop: 14, padding: "11px 13px", background: "#FDF4DC", border: "0.5px solid #E5CE9A",
                              borderRadius: 8, fontSize: 11, color: "#7B4F1D", lineHeight: 1.65 }}>
                  Microsoft sign-in is not switched on yet. IT need to register the application in Entra and enable the Azure provider in Supabase.
                </div>
              )}

              <button onClick={handlePreview}
                style={{ width: "100%", marginTop: 12, padding: "11px", background: "transparent", color: "#666",
                         border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 12.5, cursor: "pointer" }}>
                Continue to preview (demonstration data)
              </button>
              <div style={{ fontSize: 10.5, color: "#999", marginTop: 8, textAlign: "center", lineHeight: 1.6 }}>
                Preview shows sample data only. Client records stay locked until you sign in.
              </div>

              <div style={{ marginTop: 20, padding: "12px 14px", background: "#f8f9fc", borderRadius: 8, fontSize: 11, color: "#888", lineHeight: 1.6 }}>
                🔒 This platform is for authorised Affinity staff only. All activity is logged.
              </div>
            </div>
          </div>
        </div>

        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, animation: "fadeIn 1s 1s both" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "2px" }}>Scroll to discover</span>
          <div style={{ width: 1, height: 40, background: "linear-gradient(to bottom, rgba(255,255,255,0.4), transparent)", animation: "pulse 2s infinite" }} />
        </div>
      </div>

      {/* ── STATS BAR ─────────────────────────────────── */}
      <div style={{ background: NAVY, padding: "40px 40px" }}>
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 0, maxWidth: 1200, margin: "0 auto" }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: "20px", borderRight: i < STATS.length - 1 ? "0.5px solid rgba(255,255,255,0.1)" : "none" }}>
              <div style={{ fontSize: 42, fontWeight: 800, color: CY, letterSpacing: "-2px", lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.8px" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── VALUES ────────────────────────────────────── */}
      <div style={{ padding: "80px 40px", background: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: CY, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 10 }}>What we stand for</div>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: NAVY, letterSpacing: "-1px" }}>Our values</h2>
          </div>
          <div className="values-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 24 }}>
            {VALUES.map((v, i) => (
              <div key={i} style={{ padding: "32px 24px", borderRadius: 16, border: "0.5px solid #e5e5e5", background: "#fafafa", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{v.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 10 }}>{v.title}</div>
                <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>{v.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── OFFICES ───────────────────────────────────── */}
      <div style={{ padding: "80px 40px", background: NAVY }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: CY, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 10 }}>Where we are</div>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "#fff", letterSpacing: "-1px" }}>Global offices</h2>
          </div>
          <div className="offices-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
            {OFFICES.map((o, i) => (
              <div key={i} className="office-card" style={{ padding: "28px 24px", borderRadius: 14, border: "0.5px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", cursor: "default", transition: "all 0.2s" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }} className="office-flag">{o.flag}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{o.name}</div>
                <div style={{ fontSize: 11, color: CY, marginBottom: 8, fontWeight: 600 }}>{o.since}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{o.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FOOTER ────────────────────────────────────── */}
      <div style={{ background: "#000d1a", padding: "32px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
          Affinity <span style={{ color: CY, fontWeight: 300 }}>Core</span>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
          Internal use only · Authorised staff only · © Affinity Group 2025
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          © Affinity Group 2025
        </div>
      </div>
    </div>
  );
}
