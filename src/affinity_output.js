// src/affinity_output.js
// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT — spreadsheet export, printable documents, and document templates
//
// No new dependencies, deliberately. Two mechanisms cover everything the
// greyed-out output buttons needed:
//
//   CSV      built as a Blob and downloaded. Opens in Excel, and is the format
//            finance staff actually want for onward manipulation.
//   PRINT    a styled view opened in its own window, which the browser turns
//            into a PDF via its own print dialogue. That is how a firm really
//            produces a signed resolution or a register extract, and it avoids
//            shipping a PDF library that would then need its own fonts,
//            pagination and page-break handling to look acceptable.
//
// What this is NOT: a server-side render pipeline. If Affinity later needs
// unattended PDF generation — bulk statement runs, attaching a PDF to an
// automated email — that needs a backend renderer. This covers everything a
// person does at their desk, which is all the buttons in question.
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = "#001242", CYAN = "#00C4CC", MUT = "#5B6B7B", LINE = "#D9DEE5";

// ── Spreadsheet export ──────────────────────────────────────────────────────
// Excel is unforgiving about a few things, all handled here rather than at each
// call site: a leading BOM so accented and non-Latin names are not mangled,
// quoting for anything containing a comma, quote or newline, and a leading
// apostrophe guard on values Excel would otherwise read as a formula.
function csvCell(v) {
  if (v == null) return "";
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;          // stop Excel evaluating it
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCSV(columns, rows) {
  const head = columns.map((c) => csvCell(c.label || c.key || c)).join(",");
  const body = (rows || []).map((r) =>
    columns.map((c) => {
      const key = c.key || c;
      const raw = typeof c.value === "function" ? c.value(r) : r[key];
      return csvCell(raw);
    }).join(",")
  );
  return "\uFEFF" + [head, ...body].join("\r\n");
}

export function downloadCSV(filename, columns, rows) {
  const csv = toCSV(columns, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, rows: (rows || []).length };
}

// Turn what is on screen into a CSV. Used where a table is already rendered
// and building a column definition by hand would only duplicate it.
export function downloadTableCSV(filename, headers, rows) {
  return downloadCSV(filename, headers.map((h) => ({ label: h, key: h })),
    rows.map((r) => {
      const o = {};
      headers.forEach((h, i) => { o[h] = r[i]; });
      return o;
    }));
}

// ── Printable documents ─────────────────────────────────────────────────────
const PRINT_CSS = `
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Catamaran', Calibri, system-ui, sans-serif; color: #1A1A1A;
         font-size: 11pt; line-height: 1.55; margin: 0; }
  .wordmark { font-size: 22pt; font-weight: 700; color: ${CYAN}; letter-spacing: -0.5px; }
  .rule { border-bottom: 2px solid ${CYAN}; margin: 8px 0 22px; }
  h1 { font-size: 16pt; color: ${NAVY}; margin: 0 0 4px; }
  h2 { font-size: 12pt; color: ${NAVY}; margin: 20px 0 8px;
       border-bottom: 0.5px solid ${LINE}; padding-bottom: 4px; }
  .sub { color: ${MUT}; font-size: 10pt; margin: 0 0 18px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase;
       letter-spacing: 0.4px; color: #fff; background: ${NAVY};
       padding: 7px 9px; }
  td { padding: 6px 9px; border-bottom: 0.5px solid ${LINE}; font-size: 10pt;
       vertical-align: top; }
  tr:nth-child(even) td { background: #F6F8FB; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .kv { display: grid; grid-template-columns: 190px 1fr; gap: 4px 14px; margin: 0 0 16px; }
  .kv dt { color: ${MUT}; font-size: 10pt; }
  .kv dd { margin: 0; font-size: 10pt; }
  .sig { margin-top: 42px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sig div { border-top: 0.5px solid #333; padding-top: 6px; font-size: 9.5pt; color: ${MUT}; }
  .foot { margin-top: 30px; padding-top: 8px; border-top: 0.5px solid ${LINE};
          font-size: 8.5pt; color: ${MUT}; }
  .draft { position: fixed; top: 44%; left: 50%; transform: translate(-50%,-50%) rotate(-28deg);
           font-size: 78pt; color: rgba(0,18,66,0.07); font-weight: 700; letter-spacing: 4px;
           pointer-events: none; }
  @media print { .noprint { display: none; } }
`;

// Opens the document in its own window and offers the print dialogue, from
// which the browser saves a PDF. Popup blockers are the one failure mode, so
// that is reported rather than failing silently.
export function openPrintView({ title, heading, subtitle, bodyHtml, draft, footer }) {
  const w = window.open("", "_blank", "width=980,height=1200");
  if (!w) {
    return { ok: false,
             error: "The browser blocked the document window. Allow pop-ups for this site and try again." };
  }
  const stamp = new Date().toLocaleString("en-GB",
    { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${esc(title || heading || "Affinity")}</title>
    <link href="https://fonts.googleapis.com/css2?family=Catamaran:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>${PRINT_CSS}</style></head><body>
    ${draft ? '<div class="draft">DRAFT</div>' : ""}
    <div class="wordmark">Affinity</div><div class="rule"></div>
    <h1>${esc(heading || "")}</h1>
    ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ""}
    ${bodyHtml || ""}
    <div class="foot">${footer ? esc(footer) + " · " : ""}Produced from Affinity Core on ${esc(stamp)}${draft ? " · DRAFT — not for issue" : ""}</div>
    <div class="noprint" style="margin-top:26px;display:flex;gap:8px">
      <button onclick="window.print()" style="padding:9px 18px;background:${NAVY};color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">
        Print or save as PDF
      </button>
      <button onclick="window.close()" style="padding:9px 18px;background:transparent;border:1px solid ${LINE};border-radius:6px;font-size:13px;cursor:pointer">
        Close
      </button>
    </div>
  </body></html>`);
  w.document.close();
  return { ok: true };
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

// Helpers for building document bodies without hand-writing HTML each time.
export function htmlTable(headers, rows, numericCols = []) {
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${(rows || []).map((r) =>
      `<tr>${r.map((c, i) =>
        `<td class="${numericCols.includes(i) ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`
    ).join("")}</tbody></table>`;
}

export function htmlPairs(pairs) {
  return `<dl class="kv">${pairs.filter(Boolean).map(([k, v]) =>
    `<dt>${esc(k)}</dt><dd>${esc(v == null || v === "" ? "—" : v)}</dd>`).join("")}</dl>`;
}

export const htmlSignatures = (a = "Director", b = "Director / Secretary") =>
  `<div class="sig"><div>Signed &mdash; ${esc(a)}</div><div>Signed &mdash; ${esc(b)}</div></div>`;

// ── Document templates ──────────────────────────────────────────────────────
// Wording is a starting point, not legal drafting. Each template says so in
// its footer, because a minute produced from a template still needs reviewing
// before it goes in the statutory books.
const REVIEW = "Template output — review and amend before signature";

export function boardMinutes({ entity, meetingDate, present, apologies, business }) {
  return openPrintView({
    title: `Minutes — ${entity && entity.name}`,
    heading: "Minutes of a meeting of the Board of Directors",
    subtitle: entity && (entity.name + (entity.ref ? "  ·  " + entity.ref : "")),
    draft: true,
    footer: REVIEW,
    bodyHtml:
      htmlPairs([
        ["Company", entity && entity.name],
        ["Registered number", entity && entity.regNo],
        ["Date of meeting", meetingDate],
        ["Place", (entity && entity.registeredOffice) || "Registered office"],
        ["Present", (present || []).join(", ")],
        ["Apologies", (apologies || []).join(", ")],
      ]) +
      `<h2>1. Notice and quorum</h2><p>The Chairman noted that due notice of the meeting
        had been given and that a quorum was present. The meeting was declared open.</p>
       <h2>2. Business</h2>` +
      ((business && business.length)
        ? `<ol>${business.map((b) => `<li style="margin-bottom:7px">${esc(b)}</li>`).join("")}</ol>`
        : `<p style="color:${MUT}">No items recorded — add the business of the meeting before circulating.</p>`) +
      `<h2>3. Close</h2><p>There being no further business, the Chairman declared the
        meeting closed.</p>` +
      htmlSignatures("Chairman", "Secretary"),
  });
}

export function boardResolution({ entity, resolutionDate, resolutions, type }) {
  return openPrintView({
    title: `Resolution — ${entity && entity.name}`,
    heading: (type || "Written resolution") + " of the Directors",
    subtitle: entity && (entity.name + (entity.ref ? "  ·  " + entity.ref : "")),
    draft: true,
    footer: REVIEW,
    bodyHtml:
      htmlPairs([
        ["Company", entity && entity.name],
        ["Registered number", entity && entity.regNo],
        ["Date", resolutionDate || new Date().toLocaleDateString("en-GB")],
      ]) +
      `<p>The undersigned, being all of the directors of the Company entitled to receive
        notice of and vote at a meeting of the directors, HEREBY RESOLVE as follows:</p>` +
      ((resolutions && resolutions.length)
        ? `<ol>${resolutions.map((r) => `<li style="margin-bottom:9px">${esc(r)}</li>`).join("")}</ol>`
        : `<p style="color:${MUT}">No resolutions recorded — add the resolved text before circulating.</p>`) +
      htmlSignatures(),
  });
}

export function registerExtract({ entity, registerName, headers, rows, asAt }) {
  return openPrintView({
    title: `${registerName} — ${entity && entity.name}`,
    heading: registerName,
    subtitle: entity && (entity.name + (entity.ref ? "  ·  " + entity.ref : "")),
    footer: `Extract as at ${asAt || new Date().toLocaleDateString("en-GB")}`,
    bodyHtml:
      htmlPairs([
        ["Company", entity && entity.name],
        ["Registered number", entity && entity.regNo],
        ["Jurisdiction", entity && entity.jur],
        ["Extract as at", asAt || new Date().toLocaleDateString("en-GB")],
      ]) +
      ((rows && rows.length)
        ? htmlTable(headers, rows)
        : `<p style="color:${MUT}">No entries in this register.</p>`),
  });
}

export function statementDocument({ entity, title, headers, rows, numericCols, periodLabel, totals }) {
  return openPrintView({
    title: `${title} — ${entity && entity.name}`,
    heading: title,
    subtitle: (entity && entity.name) + (periodLabel ? "  ·  " + periodLabel : ""),
    footer: periodLabel || null,
    bodyHtml:
      ((rows && rows.length)
        ? htmlTable(headers, rows, numericCols || [])
        : `<p style="color:${MUT}">Nothing to report for this period.</p>`) +
      (totals ? htmlPairs(totals) : ""),
  });
}

export function genericDocument({ entity, title, sections }) {
  return openPrintView({
    title, heading: title,
    subtitle: entity && entity.name,
    draft: true,
    footer: REVIEW,
    bodyHtml: (sections || []).map((s) =>
      `<h2>${esc(s.heading)}</h2>` +
      (s.pairs ? htmlPairs(s.pairs) : "") +
      (s.table ? htmlTable(s.table.headers, s.table.rows, s.table.numericCols || []) : "") +
      (s.text ? `<p>${esc(s.text)}</p>` : "")
    ).join(""),
  });
}

// ── Email ───────────────────────────────────────────────────────────────────
// A browser cannot send email. It CAN hand a fully prepared message to the
// user's own mail client, which for a reminder or a chase is what happens
// anyway — and it keeps the sent copy in their mailbox where the audit trail
// people actually check already lives.
//
// Unattended sending (a bulk statement run) still needs a backend service;
// that is a separate build, and this does not pretend otherwise.
export function composeEmail({ to, cc, subject, body }) {
  const parts = [];
  if (cc) parts.push("cc=" + encodeURIComponent(cc));
  if (subject) parts.push("subject=" + encodeURIComponent(subject));
  if (body) parts.push("body=" + encodeURIComponent(body));
  const href = "mailto:" + encodeURIComponent(to || "") +
               (parts.length ? "?" + parts.join("&") : "");
  if (href.length > 1900) {
    return { ok: false,
             error: "The message is too long to open in your mail client. Shorten it, or attach the detail as a document instead." };
  }
  window.location.href = href;
  return { ok: true };
}

// ── Regulator portals ───────────────────────────────────────────────────────
// Filing is done on the regulator's own portal — none of them offer an API to
// us. So the honest action is: open the right portal, and record in Core that
// the filing was submitted. Pretending to file from here would be worse than
// useless.
export const REGULATOR_PORTALS = {
  "Isle of Man":    { name: "Isle of Man Companies Registry", url: "https://services.gov.im/ded/services/companiesregistry/" },
  "Malta":          { name: "Malta Business Registry",        url: "https://mbr.mt/" },
  "Cayman Islands": { name: "CIMA / General Registry",        url: "https://www.cima.ky/" },
  "United Kingdom": { name: "Companies House",                url: "https://www.gov.uk/government/organisations/companies-house" },
  "Cyprus":         { name: "Cyprus Registrar of Companies",  url: "https://www.companies.gov.cy/" },
  "United States":  { name: "FinCEN BOI / state registry",    url: "https://www.fincen.gov/boi" },
};

export function openRegulatorPortal(jurisdiction) {
  const p = REGULATOR_PORTALS[jurisdiction];
  if (!p) {
    return { ok: false,
             error: "No portal is recorded for " + (jurisdiction || "that jurisdiction") + ". Add it in System admin." };
  }
  const w = window.open(p.url, "_blank", "noopener");
  if (!w) return { ok: false, error: "The browser blocked the portal window. Allow pop-ups for this site." };
  return { ok: true, portal: p.name };
}
