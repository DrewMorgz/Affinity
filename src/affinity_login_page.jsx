import { useState, useEffect } from "react";
import { AFFINITY_LOGO } from "./affinity_core_unified_v3";

const CY = "#00C4CC";
const NAVY = "#001242";

const PHOTOS = [
  { src: "/photos/p04_beach_group.jpg",         caption: "Team Day — Port Erin, Isle of Man",       tag: "IOM" },
  { src: "/photos/p02_iom_office_team.jpg",     caption: "Isle of Man Office Team",                  tag: "IOM" },
  { src: "/photos/p08_nav_event.jpg",           caption: "Affinity Nav — Atlantic Event",            tag: "Events" },
  { src: "/photos/p05_cayman_beach.jpg",        caption: "Affinity Cayman — Turtle Beach",           tag: "Cayman" },
  { src: "/photos/p06_malta_green.jpg",         caption: "Malta Team — Green Fingers Club",          tag: "Malta" },
  { src: "/photos/p07_citywealth.jpg",          caption: "Citywealth Award Win",                     tag: "Awards" },
  { src: "/photos/p09_team_harbour.jpg",        caption: "Team Day — Port Erin Harbour",             tag: "IOM" },
  { src: "/photos/p11_black_tie.jpg",           caption: "Black Tie Gala",                           tag: "Awards" },
  { src: "/photos/p12_christmas_party.jpg",     caption: "Affinity Christmas Party",                 tag: "Events" },
  { src: "/photos/p13_monaco_event.jpg",        caption: "Monaco — Affinity Nav",                    tag: "Events" },
  { src: "/photos/p01_christmas_miami.jpg",     caption: "Affinity Miami — Christmas",               tag: "Events" },
  { src: "/photos/p10_about_us.jpg",            caption: "Founded in the Isle of Man, 2004",         tag: "Story" },
  { src: "/photos/p14_adventure_hoodies.jpg",   caption: "The Adventure — Affinity",                 tag: "Culture" },
  { src: "/photos/p15_christmas_ladies.jpg",    caption: "Affinity Christmas Party",                 tag: "Events" },
  { src: "/photos/p03_adventure_logo.jpg",      caption: "The Adventure — Affinity",                 tag: "Culture" },
];

const STATS = [
  { v: "20+",  l: "Years established" },
  { v: "6",    l: "Global offices" },
  { v: "£2B+", l: "Assets under management" },
  { v: "300+", l: "Entities under management" },
  { v: "50+",  l: "Team members worldwide" },
];

const OFFICES = [
  { name: "Isle of Man",    flag: "🇮🇲", since: "Est. 2004", desc: "Our home and headquarters" },
  { name: "Malta",          flag: "🇲🇹", since: "Est. 2015", desc: "Mediterranean hub" },
  { name: "Cayman Islands", flag: "🇰🇾", since: "Est. 2018", desc: "Caribbean operations" },
  { name: "United Kingdom", flag: "🇬🇧", since: "Est. 2019", desc: "London presence" },
  { name: "Miami",          flag: "🇺🇸", since: "Est. 2023", desc: "South Florida expansion" },
  { name: "Cyprus",         flag: "🇨🇾", since: "Est. 2024", desc: "Eastern Mediterranean" },
];

const VALUES = [
  { icon: "⚡", title: "Specialist expertise", desc: "Deep knowledge in corporate and trust services across every jurisdiction we operate in." },
  { icon: "🤝", title: "Boutique service",      desc: "High Net Worth clients deserve personalised attention. We never compromise on that." },
  { icon: "🌍", title: "Global reach",          desc: "Six offices. One team. The same standard of service wherever you are in the world." },
  { icon: "🏆", title: "Award winning",         desc: "Recognised by Citywealth and industry peers for excellence in wealth management services." },
];

export default function AffinityLoginPage({ onLogin }) {
  const [showSplash, setShowSplash] = useState(true);
  const [username, setUsername]     = useState("");
  const [password, setPassword]     = useState("");
  const [showPass, setShowPass]     = useState(false);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [heroPhoto, setHeroPhoto]   = useState(0);
  const [imgErrors, setImgErrors]   = useState({});

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setHeroPhoto(p => (p + 1) % PHOTOS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = () => {
    if (!username || !password) { setError("Please enter your username and password"); return; }
    setLoading(true);
    setTimeout(() => {
      if (username.toLowerCase() === "admin" && password === "Madebyus") {
        onLogin(1);
      } else {
        setError("Incorrect username or password");
        setLoading(false);
      }
    }, 800);
  };

  const handleImgError = (idx) => {
    setImgErrors(prev => ({ ...prev, [idx]: true }));
  };

  // ── SPLASH SCREEN (block-letter Affinity logo on navy) ─────
  if (showSplash) return (
    <div onClick={() => setShowSplash(false)} style={{
      minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center",
      justifyContent: "center", flexDirection: "column", cursor: "pointer",
      fontFamily: "'Catamaran', system-ui, sans-serif", position: "relative", overflow: "hidden"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Catamaran:wght@300;400;700;800&display=swap');
        @keyframes fadeInUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      `}</style>

      <div style={{ marginBottom: 32, textAlign: "center", animation: "fadeInUp 0.8s ease 0.3s both" }}>
        <img src={AFFINITY_LOGO} alt="Affinity" style={{ width: 280, maxWidth: "80vw" }} />
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "3px", marginTop: 16 }}>
          Made by Affinity, for Affinity
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: 420, marginBottom: 40, animation: "fadeInUp 0.8s ease 0.8s both" }}>
        {[
          { flag: "🇮🇲", name: "Isle of Man" },
          { flag: "🇲🇹", name: "Malta" },
          { flag: "🇰🇾", name: "Cayman Islands" },
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
        <div style={{ height: "100%", background: "#00C4CC", transformOrigin: "left", animation: "grow 3s ease forwards" }} />
      </div>
    </div>
  );

  const tagColors = {
    IOM:     { bg: "#E6F7FB", color: "#0077A8" },
    Malta:   { bg: "#EEF0FB", color: "#3C3489" },
    Cayman:  { bg: "#E6EEF7", color: "#0D4A7A" },
    Awards:  { bg: "#FAEEDA", color: "#633806" },
    Events:  { bg: "#EAF3DE", color: "#27500A" },
    Culture: { bg: "#F3E5F5", color: "#6A1B9A" },
    Story:   { bg: "#FFF8E7", color: "#7A5C00" },
  };

  return (
    <div style={{ fontFamily: "'Catamaran', system-ui, sans-serif", background: "#fff", minHeight: "100vh", color: "#111" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Catamaran:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-up { animation: fadeUp 0.7s ease forwards; }
        .photo-card:hover { transform: translateY(-4px) scale(1.02); box-shadow: 0 20px 40px rgba(0,0,0,0.15) !important; }
        .photo-card { transition: all 0.3s ease; }
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
          .photos-grid { grid-template-columns: 1fr 1fr !important; }
          .offices-grid { grid-template-columns: 1fr 1fr !important; }
          .values-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── HERO SECTION ─────────────────────────────── */}
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          {PHOTOS.map((p, i) => (
            <div key={i} style={{
              position: "absolute", inset: 0,
              opacity: i === heroPhoto ? 1 : 0,
              transition: "opacity 1s ease",
              background: imgErrors[i] ? `linear-gradient(135deg, ${NAVY}, #0a3a6e)` : undefined,
            }}>
              {!imgErrors[i] && (
                <img src={p.src} alt="" onError={() => handleImgError(i)}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
              )}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,18,66,0.75) 0%, rgba(0,18,66,0.4) 50%, rgba(0,18,66,0.85) 100%)" }} />
            </div>
          ))}
        </div>

        <div style={{ position: "relative", zIndex: 10, padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>
            Affinity <span style={{ color: CY, fontWeight: 300 }}>Core</span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "2px" }}>
            Internal Platform
          </div>
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

            <div className="fade-up" style={{ animationDelay: "0.4s", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {PHOTOS.map((_, i) => (
                  <div key={i} onClick={() => setHeroPhoto(i)} style={{ width: i === heroPhoto ? 24 : 6, height: 6, borderRadius: 3, background: i === heroPhoto ? CY : "rgba(255,255,255,0.3)", cursor: "pointer", transition: "all 0.3s ease" }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{PHOTOS[heroPhoto].caption}</span>
            </div>
          </div>

          <div className="fade-up" style={{ animationDelay: "0.3s" }}>
            <div style={{ background: "rgba(255,255,255,0.97)", borderRadius: 20, padding: "36px 32px", boxShadow: "0 40px 80px rgba(0,0,0,0.3)", backdropFilter: "blur(20px)" }}>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Sign in to Affinity Core</h2>
                <p style={{ fontSize: 13, color: "#888" }}>Enter your credentials to access the platform</p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Username</label>
                <input className="login-input" type="text" value={username} onChange={e => { setUsername(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  placeholder="Enter your username" autoFocus
                  style={{ width: "100%", padding: "12px 14px", border: `1.5px solid ${error ? "#EF4444" : "#e0e0e0"}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fafafa", color: NAVY, transition: "all 0.2s" }}
                />
              </div>

              <div style={{ marginBottom: error ? 8 : 24 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Password</label>
                <div style={{ position: "relative" }}>
                  <input className="login-input" type={showPass ? "text" : "password"} value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                    placeholder="Enter your password"
                    style={{ width: "100%", padding: "12px 44px 12px 14px", border: `1.5px solid ${error ? "#EF4444" : "#e0e0e0"}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fafafa", color: NAVY, transition: "all 0.2s" }}
                  />
                  <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#aaa" }}>
                    {showPass ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              {error && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}><span>⚠️</span>{error}</div>}

              <button className="sign-in-btn" onClick={handleLogin} disabled={loading}
                style={{ width: "100%", padding: "14px", background: loading ? "#aaa" : CY, color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {loading ? <><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Signing in…</> : "Sign in →"}
              </button>

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

      {/* ── PHOTO GRID (photo-only, cropped, no captions) ── */}
      <div style={{ background: "#000" }}>
        <div className="photos-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
          {PHOTOS.map((p, i) => {
            const tall = i === 0 || i === 4 || i === 8;
            return (
              <div key={i} className="photo-card" style={{ overflow: "hidden", gridRow: tall ? "span 2" : "span 1", position: "relative", height: tall ? 420 : 200, background: NAVY }}>
                {!imgErrors[i] && (
                  <img src={p.src} alt={p.caption} onError={() => handleImgError(i)}
                    style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", position: "absolute", inset: 0, display: "block" }} />
                )}
              </div>
            );
          })}
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
