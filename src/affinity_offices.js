// src/affinity_offices.js
// ─────────────────────────────────────────────────────────────────────────────
// AFFINITY'S OFFICES — one place, because there were previously six copies
//
// The office list was hardcoded as a literal array in seven different files.
// Adding Cyprus meant editing every one, and missing any of them would have
// left Cyprus absent from a filter with nothing to flag it. Anything needing
// the office or jurisdiction list should import it from here.
//
// OFFICES are where Affinity has people. JURISDICTIONS are where client
// entities can be incorporated, which is a longer list — we administer
// entities in places we have no office.
// ─────────────────────────────────────────────────────────────────────────────

export const OFFICES = [
  { code:"IOM",    name:"Isle of Man",    country:"Isle of Man",    flag:"🇮🇲", region:"IOM",    ccy:"GBP", entity:"AFG-IOM" },
  { code:"MALTA",  name:"Malta",          country:"Malta",          flag:"🇲🇹", region:"MALTA",  ccy:"EUR", entity:"AFG-MLT" },
  { code:"CYM",    name:"Cayman Islands", country:"Cayman Islands", flag:"🇰🇾", region:"CAYMAN", ccy:"USD", entity:"AFG-CYM" },
  { code:"UK",     name:"United Kingdom", country:"United Kingdom", flag:"🇬🇧", region:"UK",     ccy:"GBP", entity:"AFG-UK"  },
  { code:"USA",    name:"Miami",          country:"United States",  flag:"🇺🇸", region:"US",     ccy:"USD", entity:"AFG-FL"  },
  { code:"CYPRUS", name:"Cyprus",         country:"Cyprus",         flag:"🇨🇾", region:"CYPRUS", ccy:"EUR", entity:"AFG-CYP" },
];

export const OFFICE_NAMES     = OFFICES.map((o) => o.name);
export const OFFICE_COUNTRIES = OFFICES.map((o) => o.country);
export const officeByCode     = (c) => OFFICES.find((o) => o.code === c) || null;
export const officeByEntity   = (r) => OFFICES.find((o) => o.entity === r) || null;
export const flagFor          = (name) => (OFFICES.find((o) => o.name === name || o.country === name) || {}).flag || "";

// Where client entities are administered — wider than where we have offices.
export const JURISDICTIONS = [
  "Isle of Man", "Malta", "Cayman Islands", "United Kingdom", "United States", "Cyprus",
  "Jersey", "Guernsey", "BVI", "Nevis", "Gibraltar", "Bahamas",
];
