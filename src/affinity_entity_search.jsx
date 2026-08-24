// src/affinity_entity_search.jsx
// ─────────────────────────────────────────────────────────────────────────────
// SHARED ENTITY SEARCH
//
// One component, used on every page that shows client data, so the entity
// search looks and behaves identically everywhere. This is the Entity Admin
// box — same placeholder, same sizing, same type-ahead — extracted so it can
// be dropped in rather than reimplemented per module (which is how pages ended
// up with dropdowns instead).
//
// Usage:
//   const [entity, setEntity] = useState("");
//   <EntitySearch value={entity} onChange={setEntity} />
//
// Pass `entities` to supply a module's own list; otherwise it falls back to the
// shared portfolio below. When the write layer lands, that fallback becomes a
// single fetch and every page follows automatically.
// ─────────────────────────────────────────────────────────────────────────────

const CY = "#00C4CC";

// Shared portfolio — client entities plus Affinity's own group companies.
export const ENTITY_LIST = [
  { name: "Meridian Holdings Ltd",           ref: "AC-2024-001", jur: "Isle of Man" },
  { name: "Harrington Family Trust",         ref: "AC-2019-014", jur: "Isle of Man" },
  { name: "Caledonian Ventures Ltd",         ref: "AC-2021-032", jur: "Cayman Islands" },
  { name: "Azure Mediterranean Foundation",  ref: "AC-2020-008", jur: "Malta" },
  { name: "Thornbury Asset Co Ltd",          ref: "AC-2017-055", jur: "United Kingdom" },
  { name: "Pacific Wealth Trust",            ref: "AC-2022-019", jur: "Cayman Islands" },
  { name: "Stonebridge Capital Ltd",         ref: "AC-2023-041", jur: "Malta" },
  { name: "North Star Holdings Ltd",         ref: "AC-2016-003", jur: "Isle of Man" },
  { name: "Apex Growth Fund Ltd",            ref: "AC-2023-052", jur: "Cayman Islands" },
  { name: "Suncoast Ventures LLC",           ref: "AC-2024-007", jur: "United States" },
  { name: "Bluewater Family Trust",          ref: "AC-2020-031", jur: "Cayman Islands" },
  { name: "Phoenix eGaming Ltd",             ref: "AC-2025-061", jur: "Isle of Man" },
  { name: "Meridian Digital Ltd",            ref: "AC-2023-058", jur: "Isle of Man" },
  { name: "Southern Cross Interactive Ltd",  ref: "AC-2025-070", jur: "Malta" },
  { name: "Kestrel Gaming Ltd",              ref: "AC-2024-044", jur: "Isle of Man" },
  { name: "Rosewood Legacy Trust",           ref: "AC-2018-022", jur: "Isle of Man" },
  { name: "Neptune Interactive Ltd",         ref: "AC-2024-063", jur: "Malta" },
  { name: "Affinity Group Limited",          ref: "AFG-000",     jur: "Isle of Man" },
  { name: "Affinity (Isle of Man) Limited",  ref: "AFG-IOM",     jur: "Isle of Man" },
  { name: "Affinity (Malta) Limited",        ref: "AFG-MLT",     jur: "Malta" },
  { name: "Affinity (Cayman) Limited",       ref: "AFG-CYM",     jur: "Cayman Islands" },
  { name: "Affinity (UK) Limited",           ref: "AFG-UK",      jur: "United Kingdom" },
  { name: "Affinity South Dakota, LLC",      ref: "AFG-SD",      jur: "United States" },
  { name: "Affinity South Florida, LLC",     ref: "AFG-FL",      jur: "United States" },
];

export const ENTITY_NAMES = ENTITY_LIST.map((e) => e.name);

let listCounter = 0;

export default function EntitySearch({
  value = "",
  onChange,
  entities,
  placeholder = "Search for an entity by name or reference…",
  width,
  compact = false,
  id,
}) {
  const list = entities && entities.length ? entities : ENTITY_LIST;
  const listId = id || "entity-search-" + (++listCounter);

  const rows = list.map((e) =>
    typeof e === "string" ? { name: e, ref: "", jur: "" } : e
  );

  const handle = (v) => {
    if (!onChange) return;
    // typing the reference resolves to the entity name
    const byRef = rows.find((r) => r.ref && r.ref.toLowerCase() === v.trim().toLowerCase());
    onChange(byRef ? byRef.name : v);
  };

  return (
    <div style={{ position: "relative", width: width || "100%" }}>
      <input
        list={listId}
        value={value}
        onChange={(e) => handle(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          height: compact ? 32 : 38,
          padding: compact ? "0 10px" : "0 13px",
          fontSize: compact ? 12 : 13,
          border: `1px solid ${value ? CY : "var(--border-tertiary,#e5e5e5)"}`,
          borderRadius: 8,
          background: "var(--bg-primary,#fff)",
          color: "var(--text-primary,#111)",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      <datalist id={listId}>
        {rows.map((r) => (
          <option key={r.ref || r.name} value={r.name}>
            {[r.ref, r.jur].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
      {value && onChange && (
        <button
          onClick={() => onChange("")}
          title="Clear entity"
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#aaa",
            fontSize: 13,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
