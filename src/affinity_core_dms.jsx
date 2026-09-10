import { useState, useEffect } from "react";
import * as DMS from "./affinity_dms_api";
import { isConfigured } from "./affinity_accounting_supabase";

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT MANAGEMENT
//
// Core IS the document management system: the filing structure, the retention
// policy per folder, and retention rules that vary by data class and
// jurisdiction. All of that was built in the database and almost none of it had
// a screen — filing worked, and search, reclassify, delete-with-retention and
// folder management did not.
//
// The design point running through this screen: RETENTION IS A CONSEQUENCE OF
// THE FOLDER, not a field someone types. Filing a document in KYC/CDD gives it
// that folder's retention period and legal basis. Moving it to another folder
// changes how long it must be kept, which is why reclassifying asks for a
// reason. Deleting inside the retention period is refused unless overridden
// deliberately.
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = "#001242", CY = "#00C4CC", MUT = "#5B6B7B", LINE = "#D9DEE5";
const RED = "#A32D2D", RED_BG = "#FCEBEB", AMB = "#7B4F1D", AMB_BG = "#FDF4DC",
      GRN = "#1F6F54", GRN_BG = "#E7F4EF";

const fmtD = (d) => d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—";
const card = { background: "#fff", border: "0.5px solid " + LINE, borderRadius: 10,
               padding: "14px 16px", marginBottom: 14 };
const th = (r) => ({ textAlign: r ? "right" : "left", fontSize: 10, fontWeight: 600,
                     color: "#fff", background: NAVY, padding: "8px 10px",
                     textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap" });
const td = { padding: "8px 10px", fontSize: 12, borderBottom: "0.5px solid " + LINE };
const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const btn = (p) => ({ padding: "6px 13px", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
                      border: p ? "none" : "0.5px solid " + LINE,
                      background: p ? CY : "transparent", color: p ? "#fff" : "#333" });
const inp = { height: 32, fontSize: 12, borderRadius: 6, border: "0.5px solid #ccc",
              padding: "0 8px", width: "100%" };
const pill = (bg, fg) => ({ fontSize: 9.5, fontWeight: 600, padding: "2px 7px",
                            borderRadius: 20, background: bg, color: fg, whiteSpace: "nowrap" });

const TABS = [
  { id: "browse",    label: "Browse" },
  { id: "search",    label: "Search" },
  { id: "retention", label: "Retention" },
  { id: "attached",  label: "Attached to a record" },
  { id: "folders",   label: "Folders" },
];

export default function AffinityDMS({ onNav, entityId }) {
  const [tab, setTab]       = useState("browse");
  const [docs, setDocs]     = useState([]);
  const [msg, setMsg]       = useState("");
  const [busy, setBusy]     = useState(false);
  const [eid, setEid]       = useState(entityId ? String(entityId) : "");
  const [cat, setCat]       = useState("");
  const [query, setQuery]   = useState("");
  const [hits, setHits]     = useState([]);
  const [objType, setObjType] = useState("");
  const [objId, setObjId]     = useState("");
  const [attached, setAttached] = useState([]);
  const [form, setForm]     = useState(null);
  const [f, setF]           = useState({});

  const load = async () => {
    setBusy(true); setMsg("");
    const r = await DMS.documentList(eid ? Number(eid) : null, cat || null);
    setBusy(false);
    if (!r.live) { setMsg("Not signed in — the document register cannot be read."); return; }
    setDocs(r.data || []);
    if (!r.ok) setMsg(r.error);
  };
  useEffect(() => { load(); }, []);   // eslint-disable-line

  const act = async (fn, okMsg) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r && r.ok) { setMsg(okMsg); setForm(null); setF({}); load(); return; }
    if (r && r.live === false) { setMsg("Not signed in — that cannot be saved."); return; }
    setMsg((r && r.error) || "That could not be completed.");
  };

  const within = docs.filter((d) => d.within_retention);
  const due    = docs.filter((d) => d.retention_until && !d.within_retention);
  const noRet  = docs.filter((d) => !d.retention_until);

  // ── Browse ────────────────────────────────────────────────────────────────
  const Browse = () => (
    <div>
      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                            color: "#555", marginBottom: 3 }}>Entity id</label>
            <input style={{ ...inp, width: 110 }} value={eid}
                   onChange={(e) => setEid(e.target.value)} placeholder="all entities" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                            color: "#555", marginBottom: 3 }}>Folder</label>
            <input style={{ ...inp, width: 200 }} value={cat}
                   onChange={(e) => setCat(e.target.value)} placeholder="all folders" />
          </div>
          <button style={btn(true)} onClick={load} disabled={busy}>
            {busy ? "Loading…" : "Load"}
          </button>
          <button style={btn(false)} onClick={() => { setForm("file"); setF({}); }}>
            ＋ File a document
          </button>
        </div>
      </div>

      {docs.length > 0 && (
        <div style={{ ...card, overflowX: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {docs.length} document{docs.length === 1 ? "" : "s"}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Filename", "Folder", "Entity", "Attached to", "Filed by", "Filed",
                "Retention until", "", ""].map((h, i) =>
                <th key={h + i} style={th(false)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{d.filename}</td>
                  <td style={td}>{d.dms_category || "—"}</td>
                  <td style={{ ...td, color: MUT }}>{d.entity_name || "—"}</td>
                  <td style={{ ...td, color: MUT, fontSize: 11 }}>
                    {d.object_type === "entity" ? "the entity"
                      : `${d.object_type} ${d.object_id}`}
                  </td>
                  <td style={{ ...td, color: MUT }}>{d.uploaded_by || "—"}</td>
                  <td style={td}>{fmtD(d.uploaded_at)}</td>
                  <td style={td}>
                    {d.retention_until ? fmtD(d.retention_until) : (
                      <span style={pill(AMB_BG, AMB)}>no retention set</span>
                    )}
                    {d.within_retention && (
                      <div style={{ ...pill(GRN_BG, GRN), marginTop: 3, display: "inline-block" }}>
                        must be kept
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <button style={btn(false)}
                            onClick={() => { setForm("reclassify"); setF({ id: d.id, filename: d.filename }); }}>
                      Move
                    </button>
                  </td>
                  <td style={td}>
                    <button style={btn(false)}
                            title={d.within_retention
                              ? "Within retention — deletion is refused unless overridden"
                              : "Past its retention date"}
                            onClick={() => { setForm("delete"); setF({ id: d.id, filename: d.filename, within: d.within_retention }); }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!docs.length && !busy && (
        <div style={{ ...card, textAlign: "center", padding: "28px 18px", color: MUT,
                      fontSize: 12.5, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}>
            No documents filed
          </div>
          Core holds the document register: which documents exist, which entity and which
          record they belong to, and when they may be destroyed. Filing one records it
          against a folder, and the folder determines the retention period.
        </div>
      )}
    </div>
  );

  // ── Search ────────────────────────────────────────────────────────────────
  const Search = () => (
    <div>
      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                            color: "#555", marginBottom: 3 }}>Search filenames and references</label>
            <input style={inp} value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="e.g. engagement letter, passport, certificate" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                            color: "#555", marginBottom: 3 }}>Entity id</label>
            <input style={{ ...inp, width: 110 }} value={eid}
                   onChange={(e) => setEid(e.target.value)} placeholder="all" />
          </div>
          <button style={btn(true)} disabled={busy || !query.trim()}
                  onClick={async () => {
                    setBusy(true); setMsg("");
                    const r = await DMS.searchDocuments(eid ? Number(eid) : null, query.trim());
                    setBusy(false);
                    if (!r.live) { setMsg("Not signed in — search cannot run."); return; }
                    setHits(r.data || []);
                    if (!r.ok) setMsg(r.error);
                    else if (!(r.data || []).length) setMsg("Nothing matched that.");
                  }}>
            Search documents
          </button>
        </div>
      </div>

      {hits.length > 0 && (
        <div style={{ ...card, overflowX: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {hits.length} match{hits.length === 1 ? "" : "es"}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Filename", "Folder", "Attached to", "Reference", "Filed"].map((h) =>
                <th key={h} style={th(false)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {hits.map((d) => (
                <tr key={d.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{d.filename}</td>
                  <td style={td}>{d.category || "—"}</td>
                  <td style={{ ...td, color: MUT, fontSize: 11 }}>
                    {d.object_type === "entity" ? "the entity" : `${d.object_type} ${d.object_id}`}
                  </td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{d.dms_ref || "—"}</td>
                  <td style={td}>{fmtD(d.uploaded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Retention ─────────────────────────────────────────────────────────────
  // The reason this tab exists: a document past its retention date that nobody
  // destroys is a data protection exposure, and one destroyed early is a
  // records breach. Both are invisible without a list.
  const Retention = () => (
    <div>
      <div style={{ ...card, background: AMB_BG, borderColor: "#E5CE9A" }}>
        <div style={{ fontSize: 11.5, color: AMB, lineHeight: 1.8 }}>
          Retention is a consequence of the folder, not a field anyone types. Filing a
          document in KYC/CDD gives it that folder's retention period and legal basis.
          <div style={{ marginTop: 6 }}>
            A document held past its retention date is a data protection exposure. One
            destroyed inside it is a records breach. Both are invisible without this list,
            which is why it exists.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {[
          { n: within.length, label: "Within retention — must be kept", bg: GRN_BG, fg: GRN },
          { n: due.length,    label: "Past retention — may be destroyed", bg: AMB_BG, fg: AMB },
          { n: noRet.length,  label: "No retention date recorded", bg: RED_BG, fg: RED },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, minWidth: 180, background: s.bg,
                                      border: "0.5px solid " + LINE, borderRadius: 10,
                                      padding: "12px 14px" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.fg }}>{s.n}</div>
            <div style={{ fontSize: 11, color: s.fg, lineHeight: 1.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {noRet.length > 0 && (
        <div style={{ ...card, background: RED_BG, borderColor: "#f0c9c9" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 6 }}>
            {noRet.length} DOCUMENT(S) WITH NO RETENTION DATE
          </div>
          <div style={{ fontSize: 11.5, color: RED, lineHeight: 1.7 }}>
            Nobody knows when these may be destroyed, so they will be kept indefinitely by
            default. Usually it means the folder they are in has no retention policy — check
            the Folders tab.
          </div>
        </div>
      )}

      {due.length > 0 && (
        <div style={{ ...card, overflowX: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 10,
                        textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Past their retention date
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Filename", "Folder", "Entity", "Retention ended", "Days past", ""].map((h) =>
                <th key={h} style={th(false)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {due.map((d) => {
                const days = d.retention_until
                  ? Math.floor((Date.now() - new Date(d.retention_until)) / 86400000) : null;
                return (
                  <tr key={d.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{d.filename}</td>
                    <td style={td}>{d.dms_category || "—"}</td>
                    <td style={{ ...td, color: MUT }}>{d.entity_name || "—"}</td>
                    <td style={td}>{fmtD(d.retention_until)}</td>
                    <td style={num}>{days ?? "—"}</td>
                    <td style={td}>
                      <button style={btn(false)}
                              onClick={() => { setForm("delete"); setF({ id: d.id, filename: d.filename, within: false }); }}>
                        Destroy
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Attached to a record ──────────────────────────────────────────────────
  // Filing a document against an invoice or a statutory filing is only useful
  // if it can be retrieved FROM that record. get_object_documents does that
  // and had no caller, so documents could be attached to an invoice and never
  // found from it — which is the same fault as the rest of this module.
  const Attached = () => (
    <div>
      <div style={card}>
        <div style={{ fontSize: 11, color: MUT, marginBottom: 10, lineHeight: 1.7 }}>
          Documents filed against a specific record rather than against the entity as a
          whole — an invoice, a statutory filing, a meeting, a CDD item. Filing against a
          record is only useful if it can be found from that record.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                            color: "#555", marginBottom: 3 }}>Kind of record</label>
            <select value={objType} onChange={(e) => setObjType(e.target.value)}
                    style={{ ...inp, width: 230, height: 32 }}>
              <option value="">—</option>
              {DMS.OBJECT_TYPES.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 600,
                            color: "#555", marginBottom: 3 }}>Record id</label>
            <input style={{ ...inp, width: 110 }} value={objId}
                   onChange={(e) => setObjId(e.target.value)} placeholder="e.g. 44" />
          </div>
          <button style={btn(true)} disabled={busy || !objType || !objId}
                  onClick={async () => {
                    setBusy(true); setMsg("");
                    const r = await DMS.objectDocuments(objType, Number(objId));
                    setBusy(false);
                    if (!r.live) { setMsg("Not signed in — this cannot be read."); return; }
                    setAttached(r.data || []);
                    if (!r.ok) setMsg(r.error);
                    else if (!(r.data || []).length) {
                      setMsg("No documents are filed against that record.");
                    }
                  }}>
            Find documents
          </button>
        </div>
      </div>

      {attached.length > 0 && (
        <div style={{ ...card, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Filename", "Folder", "Reference", "Filed by", "Filed"].map((h) =>
                <th key={h} style={th(false)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {attached.map((d) => (
                <tr key={d.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{d.filename}</td>
                  <td style={td}>{d.category || "—"}</td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>
                    {d.dms_ref || "—"}
                  </td>
                  <td style={{ ...td, color: MUT }}>{d.uploaded_by || "—"}</td>
                  <td style={td}>{fmtD(d.uploaded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Folders ───────────────────────────────────────────────────────────────
  const Folders = () => {
    const byFolder = {};
    docs.forEach((d) => {
      const k = d.dms_category || "(no folder)";
      byFolder[k] = (byFolder[k] || 0) + 1;
    });
    return (
      <div>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUT,
                          textTransform: "uppercase", letterSpacing: "0.4px" }}>
              The filing structure
            </div>
            <button style={btn(true)} onClick={() => { setForm("folder"); setF({}); }}>
              ＋ New folder
            </button>
          </div>
          <div style={{ fontSize: 11, color: MUT, lineHeight: 1.7 }}>
            A new folder needs its retention period and the basis for it. A folder with no
            retention policy produces documents nobody knows when to destroy — which is the
            state the Retention tab flags in red.
          </div>
        </div>

        <div style={{ ...card, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={th(false)}>Folder</th>
              <th style={th(true)}>Documents filed</th>
            </tr></thead>
            <tbody>
              {Object.keys(byFolder).sort().map((k) => (
                <tr key={k}>
                  <td style={{ ...td, fontWeight: 600 }}>{k}</td>
                  <td style={num}>{byFolder[k]}</td>
                </tr>
              ))}
              {!Object.keys(byFolder).length && (
                <tr><td colSpan={2} style={{ ...td, textAlign: "center", color: MUT,
                                             padding: "22px 10px" }}>
                  Load documents on the Browse tab to see the folders in use.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Forms ─────────────────────────────────────────────────────────────────
  const FORMS = {
    file: {
      title: "File a document",
      note: "The folder determines how long the document must be kept, so it is required — an unfiled document cannot be found again.",
      cta: "File",
      fields: [
        { k: "entityId", label: "Entity id", required: true },
        { k: "category", label: "Folder code", required: true, ph: "3 for KYC/CDD" },
        { k: "filename", label: "Filename", full: true, required: true },
        { k: "ref", label: "Reference in the DMS", full: true },
        { k: "objectType", label: "Attached to", type: "select",
          opts: DMS.OBJECT_TYPES.map((o) => o.id + " — " + o.label) },
        { k: "objectId", label: "Which record", ph: "leave blank for the entity" },
      ],
      save: () => act(() => DMS.docFile({
        entityId: Number(f.entityId), category: Number(f.category),
        filename: f.filename, ref: f.ref,
        objectType: (f.objectType || "entity").split(" ")[0],
        objectId: f.objectId ? Number(f.objectId) : null,
      }), "Document filed."),
    },
    reclassify: {
      title: "Move to another folder",
      note: "The folder determines the retention period, so moving a document changes how long it must be kept. That is why a reason is required.",
      cta: "Move",
      fields: [
        { k: "category", label: "New folder code", required: true },
        { k: "reason", label: "Reason", full: true, required: true },
      ],
      save: () => act(() => DMS.docReclassify(f.id, Number(f.category), f.reason),
                      "Document moved."),
    },
    delete: {
      title: "Delete a document record",
      note: "Refused while the document is within its retention period, unless the override is set deliberately.",
      cta: "Delete",
      fields: [
        { k: "reason", label: "Reason", full: true, required: true },
        { k: "override", label: "Override retention", type: "select", opts: ["no", "yes"] },
      ],
      save: () => act(() => DMS.docDelete(f.id, f.reason, f.override === "yes"),
                      "Document record deleted."),
    },
    folder: {
      title: "New folder",
      note: "The retention period and its basis are both required. A folder without them produces documents nobody knows when to destroy.",
      cta: "Create",
      fields: [
        { k: "name", label: "Folder name", full: true, required: true },
        { k: "retainYears", label: "Retain for (years)", required: true },
        { k: "basis", label: "Basis", full: true, required: true,
          ph: "e.g. IOM Companies Act 2006 — 6 years from end of relationship" },
      ],
      save: () => act(() => DMS.dmsCategoryAdd(f.name, Number(f.retainYears), f.basis),
                      "Folder created."),
    },
  };

  const Form = () => {
    if (!form || !FORMS[form]) return null;
    const d = FORMS[form];
    return (
      <div onClick={(e) => e.target === e.currentTarget && (setForm(null), setF({}))}
           style={{ position: "fixed", inset: 0, background: "rgba(0,18,66,0.45)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 1000, padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: "22px 24px",
                      width: "min(600px,100%)", maxHeight: "86vh", overflowY: "auto" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
            {d.title}
          </div>
          {f.filename && (
            <div style={{ fontSize: 12, color: MUT, marginBottom: 8 }}>{f.filename}</div>
          )}
          {f.within && (
            <div style={{ padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                          marginBottom: 12, background: RED_BG,
                          border: "0.5px solid #f0c9c9", color: RED, lineHeight: 1.7 }}>
              This document is <strong>within its retention period</strong> and must be kept.
              Deleting it will be refused unless you set the override, and doing so is a
              records decision rather than a housekeeping one.
            </div>
          )}
          <div style={{ fontSize: 11.5, color: MUT, lineHeight: 1.7, marginBottom: 14 }}>
            {d.note}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
            {d.fields.map((fl) => (
              <div key={fl.k} style={{ gridColumn: fl.full ? "1/-1" : "auto" }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600,
                                color: "#555", marginBottom: 4 }}>
                  {fl.label}{fl.required && <span style={{ color: RED }}> *</span>}
                </label>
                {fl.type === "select" ? (
                  <select value={f[fl.k] || ""} onChange={(e) => setF({ ...f, [fl.k]: e.target.value })}
                          style={{ ...inp, height: 34 }}>
                    <option value="">—</option>
                    {fl.opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input value={f[fl.k] || ""} placeholder={fl.ph || ""}
                         onChange={(e) => setF({ ...f, [fl.k]: e.target.value })}
                         style={{ ...inp, height: 34 }} />
                )}
              </div>
            ))}
          </div>
          {msg && (
            <div style={{ marginTop: 14, padding: "9px 12px", borderRadius: 7, fontSize: 11.5,
                          lineHeight: 1.6, background: RED_BG,
                          border: "0.5px solid #f0c9c9", color: RED }}>
              {msg}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
            <button style={btn(false)} onClick={() => { setForm(null); setF({}); setMsg(""); }}>
              Cancel
            </button>
            <button style={btn(true)} onClick={d.save} disabled={busy}>{d.cta}</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "Catamaran, system-ui, sans-serif",
                  background: "var(--bg-secondary,#F6F8FB)", minHeight: 600 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 20px", borderBottom: "0.5px solid #e5e5e5",
                    background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: NAVY }}>Documents</div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
                         background: isConfigured ? GRN_BG : AMB_BG,
                         color: isConfigured ? GRN : AMB,
                         border: "0.5px solid " + (isConfigured ? "#bfe0d2" : "#E5CE9A") }}>
            ● {isConfigured ? "Live register" : "Not signed in"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", background: "#fff",
                    borderBottom: "0.5px solid #e5e5e5", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setMsg(""); }}
                  style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer",
                           border: "none", background: "transparent",
                           color: tab === t.id ? NAVY : MUT,
                           fontWeight: tab === t.id ? 600 : 400,
                           borderBottom: tab === t.id ? "2px solid " + CY
                                                      : "2px solid transparent" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px 24px" }}>
        {msg && !form && (
          <div style={{ padding: "9px 12px", borderRadius: 7, fontSize: 11.5, marginBottom: 14,
                        background: AMB_BG, border: "0.5px solid #E5CE9A", color: AMB,
                        whiteSpace: "pre-wrap" }}>
            {msg}
          </div>
        )}
        {tab === "browse"    && <Browse />}
        {tab === "search"    && <Search />}
        {tab === "retention" && <Retention />}
        {tab === "attached"  && <Attached />}
        {tab === "folders"   && <Folders />}
      </div>

      <Form />
    </div>
  );
}
