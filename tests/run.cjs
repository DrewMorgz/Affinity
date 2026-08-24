// tests/run.cjs
// ─────────────────────────────────────────────────────────────────────────────
// AFFINITY CORE — LOGIC TESTS
//
// Run:  node tests/run.cjs
//
// Covers the logic where a silent error would be expensive: who can see which
// entity, whether a report returns the right rows, and whether budget maths
// adds up. Deliberately no test framework — one file, no new dependencies, and
// it runs anywhere node does.
//
// These are unit tests over the front-end logic. They do not touch the
// database; db/056_verify.sql covers the engine's own invariants.
// ─────────────────────────────────────────────────────────────────────────────
const path = require("path");
const fs = require("fs");
const babel = require("@babel/core");

// compile jsx/esm on require
require.extensions[".jsx"] = require.extensions[".js"] = function (m, f) {
  let code = fs.readFileSync(f, "utf8");
  if (!f.includes("node_modules")) {
    code = babel.transformSync(code, {
      filename: f,
      sourceType: "unambiguous",
      presets: [
        [require("@babel/preset-env"), { targets: { node: "current" }, modules: "commonjs" }],
        [require("@babel/preset-react"), { runtime: "automatic" }],
      ],
    }).code;
  }
  return m._compile(code, f);
};
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  try { return origResolve.call(this, req, parent, ...rest); }
  catch (e) {
    if (req.startsWith(".")) {
      const base = path.resolve(path.dirname(parent.filename), req);
      for (const ext of [".js", ".jsx"]) if (fs.existsSync(base + ext)) return base + ext;
    }
    throw e;
  }
};

let passed = 0, failed = 0;
const results = [];
function group(name) { results.push({ group: name }); }
function ok(desc, cond, detail) {
  if (cond) { passed++; results.push({ desc, pass: true }); }
  else { failed++; results.push({ desc, pass: false, detail: detail || "" }); }
}
function eq(desc, actual, expected) {
  ok(desc, JSON.stringify(actual) === JSON.stringify(expected),
     `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const SRC = path.join(__dirname, "..", "src");

// ── 1. Entity access — who can see Affinity's own companies ────────────────
group("Entity access (internal vs client segregation)");
{
  const rbac = require(path.join(SRC, "affinity_core_rbac.js"));
  const portfolio = [
    { name: "Meridian Holdings Ltd", ref: "AC-2024-001", entityClass: "client" },
    { name: "Affinity Group Limited", ref: "AFG-000", entityClass: "group" },
    { name: "Affinity (Malta) Limited", ref: "AFG-MLT", entityClass: "group" },
    { name: "Affinity (Isle of Man) Limited", ref: "AFG-IOM", entityClass: "group" },
    { name: "Legacy record", ref: "AC-1999-001" },            // no class set
  ];
  const names = (r, o) => rbac.filterEntitiesByAccess(portfolio, r, o).map((e) => e.name);

  ok("Super Admin sees every entity",
     names("system_admin").length === 5);
  ok("Manager sees no Affinity group company by default",
     !names("manager").some((n) => n.startsWith("Affinity")));
  ok("Manager still sees client entities",
     names("manager").includes("Meridian Holdings Ltd"));
  ok("an entity with no class set is treated as a client entity, not internal",
     names("manager").includes("Legacy record"));

  // the segregation requirement: per company, not a single internal switch
  const maltaOnly = ["AFG-MLT"];
  ok("a Malta administrator granted only AFG-MLT sees Affinity (Malta)",
     rbac.canAccessInternalEntity("admin", "AFG-MLT", maltaOnly));
  ok("...and NOT Affinity Group Limited's consolidated position",
     !rbac.canAccessInternalEntity("admin", "AFG-000", maltaOnly));
  ok("...and NOT Affinity (Isle of Man)",
     !rbac.canAccessInternalEntity("admin", "AFG-IOM", maltaOnly));
  eq("that user's visible portfolio is exactly client entities plus Malta",
     names("admin", maltaOnly).sort(),
     ["Affinity (Malta) Limited", "Legacy record", "Meridian Holdings Ltd"]);

  ok("an empty grant list means no internal companies at all",
     rbac.filterEntitiesByAccess(portfolio, "admin", []).filter((e) => e.entityClass === "group").length === 0);
  ok("reporting scope follows the same per-company grants",
     rbac.reportingInternalRefs("admin", maltaOnly).length === 1);
}

// ── 2. Report builder condition grammar ────────────────────────────────────
group("Report builder — condition grammar");
{
  const src = fs.readFileSync(path.join(SRC, "affinity_core_report_builder.jsx"), "utf8");
  const rows = src.slice(src.indexOf("const ROWS = ["), src.indexOf("// ── Condition grammar"));
  const grammar = src.slice(src.indexOf("const OPS = {"), src.indexOf("// ── Starter reports"));
  const FIELD = {};
  ["licenceStatus","uboCountries","affinityDirector","risk","cddComplete","wip","class","name","services","openBreaches"]
    .forEach((k) => { FIELD[k] = { key: k }; });
  const mod = new Function("FIELD", rows + grammar + "\nreturn {ROWS, testCond};")(FIELD);
  const { ROWS, testCond } = mod;
  const q = (conds, set) => (set || ROWS.filter((r) => r.class === "Client"))
    .filter((r) => conds.every((c) => testCond(r, c))).map((r) => r.name);

  // the two questions from the specification
  eq("licensed gaming companies with an Australian beneficial owner",
     q([{ field: "licenceStatus", op: "eq", value: "Licensed" },
        { field: "uboCountries", op: "has", value: "Australia" }]).sort(),
     ["Phoenix eGaming Ltd", "Southern Cross Interactive Ltd"]);

  ok("a gaming company whose licence is only applied for is excluded",
     !q([{ field: "licenceStatus", op: "eq", value: "Licensed" },
         { field: "uboCountries", op: "has", value: "Australia" }]).includes("Kestrel Gaming Ltd"));

  ok("...but that same company still appears in a CDD gap report",
     q([{ field: "risk", op: "in", value: "High, Very High" },
        { field: "cddComplete", op: "false", value: "" }]).includes("Kestrel Gaming Ltd"));

  ok("entities where we provide directors returns a non-empty set",
     q([{ field: "affinityDirector", op: "true", value: "" }]).length > 0);

  // operator behaviour
  ok("'has' matches a value inside a list", testCond({ services: ["Trusteeship", "Directorship"] }, { field: "services", op: "has", value: "directorship" }));
  ok("'has' is case-insensitive", testCond({ services: ["Trusteeship"] }, { field: "services", op: "has", value: "TRUSTEESHIP" }));
  ok("'hasnot' excludes correctly", testCond({ services: ["Trusteeship"] }, { field: "services", op: "hasnot", value: "Directorship" }));
  ok("'gt' compares numerically, not as text", testCond({ wip: 9000 }, { field: "wip", op: "gt", value: "800" }));
  ok("'gt' rejects when below threshold", !testCond({ wip: 700 }, { field: "wip", op: "gt", value: "800" }));
  ok("'blank' detects an empty list", testCond({ services: [] }, { field: "services", op: "blank", value: "" }));
  ok("'in' accepts a comma separated list", testCond({ risk: "High" }, { field: "risk", op: "in", value: "High, Very High" }));
  ok("'in' rejects a value outside the list", !testCond({ risk: "Low" }, { field: "risk", op: "in", value: "High, Very High" }));
}

// ── 3. Budget maths ────────────────────────────────────────────────────────
group("Planning — budget arithmetic");
{
  const src = fs.readFileSync(path.join(SRC, "affinity_core_planning.jsx"), "utf8");
  const accounts = src.slice(src.indexOf("const ACCOUNTS = ["), src.indexOf("const GROUPS ="));
  const signs = src.slice(src.indexOf("const SIGN ="), src.indexOf("const ENTITIES ="));
  const m = new Function(accounts + signs + "\nreturn {ACCOUNTS, SIGN};")();
  const { ACCOUNTS, SIGN } = m;

  ok("revenue is treated as positive and costs as negative",
     SIGN["Revenue"] === 1 && SIGN["Staff costs"] === -1 && SIGN["Overheads"] === -1);

  const ni = ACCOUNTS.find((a) => a.code === "6010");
  ok("employer NI is a formula account, not typed in", ni && ni.kind === "calcPct");
  ok("employer NI derives from salaries", ni && ni.of === "6000");
  eq("employer NI is 11% of salaries", Math.round(40000 * ni.pct), 4400);

  const pension = ACCOUNTS.find((a) => a.code === "6020");
  eq("pension is 6% of salaries", Math.round(40000 * pension.pct), 2400);

  ok("depreciation comes from the ledger rather than being budgeted by hand",
     ACCOUNTS.find((a) => a.code === "7050").kind === "actual");

  // net result: revenue less all cost groups
  const values = {}; ACCOUNTS.forEach((a) => { values[a.code] = 1000; });
  const groupTotal = (g) => ACCOUNTS.filter((a) => a.group === g).reduce((s, a) => s + values[a.code], 0);
  const net = ["Revenue", "Direct costs", "Staff costs", "Overheads"].reduce((s, g) => s + SIGN[g] * groupTotal(g), 0);
  eq("net result subtracts every cost group from revenue", net, 6000 - 2000 - 4000 - 6000);
}

// ── 4. Budget period pivot ─────────────────────────────────────────────────
group("Planning — database to grid pivot");
{
  const api = require(path.join(SRC, "affinity_planning_api.js"));
  const p = api.pivotToGrid([
    { account_code: "4000", period: "2026-01", amount: "18000" },
    { account_code: "4000", period: "2026-12", amount: "19500" },
    { account_code: "6000", period: "2026-06", amount: "26000" },
  ]);
  eq("January maps to the first column", p["4000:0"], 18000);
  eq("December maps to the twelfth column", p["4000:11"], 19500);
  eq("June maps to the sixth column", p["6000:5"], 26000);
  ok("amounts arrive as numbers, not strings", typeof p["4000:0"] === "number");

  const apr = api.pivotToGrid([{ account_code: "4000", period: "2026-04", amount: 100 }], 4);
  eq("an April year-start puts April in the first column", apr["4000:0"], 100);
}

// ── 5. Module permissions ──────────────────────────────────────────────────
group("Module permissions");
{
  const rbac = require(path.join(SRC, "affinity_core_rbac.js"));
  ok("Super Admin can reach System Admin", rbac.canAccessModule("system_admin", "system"));
  ok("an Administrator cannot reach System Admin", !rbac.canAccessModule("admin", "system"));
  ok("only privileged roles can delete documents",
     rbac.can("director", "documents", "D") && !rbac.can("admin", "documents", "D"));
}

// ── report ─────────────────────────────────────────────────────────────────
console.log("");
for (const r of results) {
  if (r.group) { console.log("\n" + r.group); continue; }
  console.log(`  ${r.pass ? "pass" : "FAIL"}  ${r.desc}`);
  if (!r.pass && r.detail) console.log(`        ${r.detail}`);
}
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
