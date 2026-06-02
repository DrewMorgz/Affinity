if (showSplash) return (
    <div onClick={() => setShowSplash(false)} style={{
      minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center",
      justifyContent: "center", flexDirection: "column", cursor: "pointer",
      fontFamily: "'Catamaran', system-ui, sans-serif"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Catamaran:wght@300;400;700;800&display=swap');
        @keyframes fadeInUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      `}</style>

      <div style={{ textAlign: "center", marginBottom: 32, animation: "fadeInUp 0.8s ease 0.2s both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
          {["A","F","F","I","N","I","T","Y"].map((l, i) => (
            <span key={i} style={{
              fontSize: "clamp(56px, 10vw, 96px)",
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-2px",
              lineHeight: 1,
              fontFamily: "'Catamaran', system-ui, sans-serif",
              background: `linear-gradient(135deg, #fff ${i*12}%, ${CY} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: `fadeInUp 0.5s ease ${0.1 + i * 0.06}s both`
            }}>{l}</span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, justifyContent: "center", animation: "fadeInUp 0.8s ease 0.8s both" }}>
          <div style={{ width: 30, height: 1, background: "rgba(0,196,204,0.4)" }} />
          <span style={{ fontSize: 11, color: CY, fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px" }}>Corporate &amp; Trust Services</span>
          <div style={{ width: 30, height: 1, background: "rgba(0,196,204,0.4)" }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: 420, marginBottom: 40, animation: "fadeInUp 0.8s ease 1s both" }}>
        {[{flag:"🇮🇲",name:"Isle of Man"},{flag:"🇲🇹",name:"Malta"},{flag:"🇰🇾",name:"Cayman Islands"},{flag:"🇬🇧",name:"United Kingdom"},{flag:"🇺🇸",name:"Miami"},{flag:"🇨🇾",name:"Cyprus"}].map(j => (
          <div key={j.name} style={{ display:"flex", alignItems:"center", gap:7, background:"rgba(255,255,255,0.06)", border:"0.5px solid rgba(255,255,255,0.1)", borderRadius:30, padding:"7px 14px" }}>
            <span style={{ fontSize: 14 }}>{j.flag}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 400 }}>{j.name}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: "1px", textTransform: "uppercase", animation: "fadeInUp 0.6s ease 1.4s both" }}>
        Tap to continue
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.05)" }}>
        <div style={{ height: "100%", background: CY, transformOrigin: "left", animation: "grow 3s ease forwards" }} />
      </div>
    </div>
  );
