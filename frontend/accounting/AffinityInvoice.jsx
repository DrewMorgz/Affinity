import React, { useMemo } from "react";

/*
  Affinity Core — Invoice template (print / PDF ready)
  -------------------------------------------------------------
  Renders the JSON from the engine:
      SELECT get_invoice_json(:invoice_id);
  shape: { invoice, bill_to, jurisdiction, bank, lines[] }

  Supabase wiring:
      const { data } = await supabase.rpc('get_invoice_json', { p_invoice_id });

  The firm's own letterhead per jurisdiction lives in OFFICES below — edit the
  addresses / regulator lines / VAT numbers to the real details.
*/

// ---- firm letterhead per jurisdiction (EDIT THESE) -----------------------
const OFFICES = {
  IOM: {
    legal: "Affinity (IOM) Limited",
    lines: ["1st Floor, Affinity House", "Athol Street", "Douglas, Isle of Man, IM1 1LD"],
    regulator: "Licensed by the Isle of Man Financial Services Authority",
    vat: "VAT No. GB 000 0000 00", email: "billing@affinityco.com",
  },
  MLT: {
    legal: "Affinity (Malta) Limited",
    lines: ["Level 2, Affinity Court", "Triq l-Imdina", "Birkirkara, BKR 9034, Malta"],
    regulator: "Authorised by the Malta Financial Services Authority",
    vat: "VAT No. MT 0000 0000", email: "billing@affinityco.com",
  },
  CYM: {
    legal: "Affinity (Cayman) Limited",
    lines: ["Affinity House, Cricket Square", "George Town", "Grand Cayman, KY1-1104"],
    regulator: "Regulated by the Cayman Islands Monetary Authority",
    vat: "", email: "billing@affinityco.com",
  },
  GBR: {
    legal: "Affinity (UK) Limited",
    lines: ["Affinity House", "London", "United Kingdom"],
    regulator: "", vat: "VAT No. GB 000 0000 00", email: "billing@affinityco.com",
  },
  USA: {
    legal: "Affinity (US) LLC",
    lines: ["Brickell Avenue", "Miami, FL", "United States"],
    regulator: "", vat: "", email: "billing@affinityco.com",
  },
};

const CCY = { GBP: "\u00A3", EUR: "\u20AC", USD: "$" };
const C = { navy: "#001242", teal: "#19B9B0", pink: "#FF2D78", ink: "#14233B", slate: "#5A6B86", hair: "#DCE2EC", tint: "#F7F8FA" };

function fmt(n, sym) {
  return `${sym}${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---- sample data (real get_invoice_json(1) output) -----------------------
const SAMPLE = {
  invoice: { id: 1, number: "INV-000001", invoice_date: "2026-06-10", ccy: "GBP",
             status: "posted", settled: "open", net_total: 12000.0, vat_total: 2400.0,
             gross_total: 14400.0, outstanding: 14400.0 },
  bill_to: { name: "Meridian Holdings Ltd", code: "A00001", jurisdiction: "IOM" },
  jurisdiction: "IOM",
  bank: { name: "Affinity GBP", iban: "GB29 NWBK 6016 1331 9268 19", ccy: "GBP" },
  lines: [
    { description: "Annual administration fee — corporate services", net: 10000.0, vat: 2000.0, gross: 12000.0 },
    { description: "Incorporation & first-year setup", net: 2000.0, vat: 400.0, gross: 2400.0 },
  ],
};

export default function AffinityInvoice({ data = SAMPLE }) {
  const { invoice, bill_to, jurisdiction, bank, lines } = data;
  const sym = CCY[invoice.ccy] || invoice.ccy + " ";
  const office = OFFICES[jurisdiction] || OFFICES.IOM;
  const paid = invoice.settled === "paid";
  const due = useMemo(() => {
    const d = new Date(invoice.invoice_date); d.setDate(d.getDate() + 30);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }, [invoice.invoice_date]);
  const issued = new Date(invoice.invoice_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  // VAT summary by rate
  const vatRows = useMemo(() => {
    const m = {};
    lines.forEach((l) => {
      const rate = l.net ? Math.round((l.vat / l.net) * 100) : 0;
      m[rate] = m[rate] || { rate, net: 0, vat: 0 };
      m[rate].net += l.net; m[rate].vat += l.vat;
    });
    return Object.values(m).sort((a, b) => b.rate - a.rate);
  }, [lines]);

  return (
    <div style={{ background: "#EAEDF3", minHeight: "100vh", padding: "24px 0",
                  fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", color: C.ink }}>
      <style>{`
        @media print {
          .no-print{ display:none !important }
          body{ background:#fff }
          .sheet{ box-shadow:none !important; margin:0 !important }
          @page { size: A4; margin: 14mm }
        }
        .pay-btn:hover{ background:${C.navy} !important }
      `}</style>

      <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 16px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="pay-btn" onClick={() => window.print()} style={{
          background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
          fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Download / print PDF</button>
      </div>

      <div className="sheet" style={{ maxWidth: 820, margin: "0 auto", background: "#fff",
            boxShadow: "0 10px 40px rgba(0,18,66,0.12)", borderRadius: 4, overflow: "hidden", position: "relative" }}>

        {/* top band */}
        <div style={{ background: C.navy, padding: "26px 40px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ color: C.teal, fontWeight: 800, letterSpacing: 3, fontSize: 22 }}>AFFINITY</span>
              <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 300, letterSpacing: 2, fontSize: 12 }}>
                {jurisdiction}
              </span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
              <div style={{ color: "#fff", fontWeight: 600 }}>{office.legal}</div>
              {office.lines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#fff", fontSize: 26, fontWeight: 700, letterSpacing: 1 }}>INVOICE</div>
            <div style={{ color: C.teal, fontSize: 15, fontWeight: 600, marginTop: 2 }}>{invoice.number}</div>
          </div>
        </div>

        {/* meta strip */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.hair}` }}>
          {[["Bill to", null], ["Issued", issued], ["Due", paid ? "Paid" : due], ["Amount due", paid ? fmt(0, sym) : fmt(invoice.outstanding, sym)]].map(([label, val], i) => (
            <div key={i} style={{ flex: i === 0 ? 2 : 1, padding: "18px 24px", borderRight: i < 3 ? `1px solid ${C.hair}` : "none" }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.8, color: C.slate, marginBottom: 6 }}>{label}</div>
              {i === 0 ? (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{bill_to.name}</div>
                  <div style={{ fontSize: 12.5, color: C.slate, marginTop: 2 }}>{bill_to.code} · {bill_to.jurisdiction}</div>
                </div>
              ) : (
                <div style={{ fontSize: 15, fontWeight: i === 3 ? 700 : 500, color: i === 3 ? C.navy : C.ink, fontVariantNumeric: "tabular-nums" }}>{val}</div>
              )}
            </div>
          ))}
        </div>

        {/* line items */}
        <div style={{ padding: "8px 24px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: C.slate, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.7 }}>
                <th style={{ textAlign: "left", padding: "14px 8px 10px", fontWeight: 600 }}>Description</th>
                <th style={{ textAlign: "right", padding: "14px 8px 10px", fontWeight: 600, width: 110 }}>Net</th>
                <th style={{ textAlign: "right", padding: "14px 8px 10px", fontWeight: 600, width: 90 }}>VAT</th>
                <th style={{ textAlign: "right", padding: "14px 8px 10px", fontWeight: 600, width: 120 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.hair}` }}>
                  <td style={{ padding: "13px 8px", fontSize: 14, color: C.ink }}>{l.description}</td>
                  <td style={{ padding: "13px 8px", textAlign: "right", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{fmt(l.net, sym)}</td>
                  <td style={{ padding: "13px 8px", textAlign: "right", fontSize: 14, fontVariantNumeric: "tabular-nums", color: C.slate }}>{fmt(l.vat, sym)}</td>
                  <td style={{ padding: "13px 8px", textAlign: "right", fontSize: 14, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmt(l.gross, sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 24px 0" }}>
          <div style={{ width: 320 }}>
            {[["Subtotal", invoice.net_total, false], ["VAT", invoice.vat_total, false]].map(([l, v], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 8px", fontSize: 14, color: C.slate }}>
                <span>{l}</span><span style={{ fontVariantNumeric: "tabular-nums", color: C.ink }}>{fmt(v, sym)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 8px", marginTop: 4,
                          borderTop: `2px solid ${C.navy}`, fontSize: 16, fontWeight: 700, color: C.navy }}>
              <span>Total {invoice.ccy}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(invoice.gross_total, sym)}</span>
            </div>
          </div>
        </div>

        {/* VAT summary + payment */}
        <div style={{ display: "flex", gap: 24, padding: "26px 24px", marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.8, color: C.slate, marginBottom: 8 }}>Payment details</div>
            <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.7 }}>
              <div><span style={{ color: C.slate }}>Account:</span> {bank ? bank.name : "—"}</div>
              <div><span style={{ color: C.slate }}>IBAN:</span> <span style={{ fontVariantNumeric: "tabular-nums" }}>{bank ? bank.iban : "—"}</span></div>
              <div><span style={{ color: C.slate }}>Reference:</span> {invoice.number}</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.8, color: C.slate, marginBottom: 8 }}>VAT summary</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr style={{ color: C.slate }}>
                <th style={{ textAlign: "left", fontWeight: 600, padding: "0 0 4px" }}>Rate</th>
                <th style={{ textAlign: "right", fontWeight: 600, padding: "0 0 4px" }}>Net</th>
                <th style={{ textAlign: "right", fontWeight: 600, padding: "0 0 4px" }}>VAT</th>
              </tr></thead>
              <tbody>
                {vatRows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: "3px 0" }}>{r.rate}%</td>
                    <td style={{ padding: "3px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(r.net, sym)}</td>
                    <td style={{ padding: "3px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(r.vat, sym)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* footer */}
        <div style={{ background: C.tint, borderTop: `1px solid ${C.hair}`, padding: "16px 24px",
                      fontSize: 11.5, color: C.slate, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>{office.regulator}</span>
          <span>{[office.vat, office.email].filter(Boolean).join(" · ")}</span>
        </div>

        {/* PAID stamp */}
        {paid && (
          <div style={{ position: "absolute", top: 200, left: "50%", transform: "translate(-50%,0) rotate(-14deg)",
                        border: `4px solid ${C.teal}`, color: C.teal, fontSize: 46, fontWeight: 800, letterSpacing: 6,
                        padding: "6px 26px", borderRadius: 10, opacity: 0.18, pointerEvents: "none" }}>PAID</div>
        )}
      </div>
    </div>
  );
}
