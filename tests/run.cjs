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


// ── 6. Budget model — reproduces Neil's Budget_Summary workbook ────────────
group("Budget model — phasing (validated against Budget_Summary.xlsx)");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  const YEAR = 2026;
  const dim = M.daysInMonth(YEAR);
  eq("days in year", dim.reduce((a,b)=>a+b,0), 365);

  const aa = M.phaseFee({ amount:1000, frequency:"M", markup:true }, YEAR);
  eq("monthly fee invoiced every month at 1.05", aa.invoiced, new Array(12).fill(1050));
  eq("monthly fee earned every month", aa.earned, new Array(12).fill(1050));

  const ab = M.phaseFee({ amount:2000, frequency:"A", markup:true }, YEAR);
  eq("annual fee invoiced whole in January", ab.invoiced[0], 2100);
  eq("annual fee invoiced nowhere else", ab.invoiced.slice(1), new Array(11).fill(0));
  eq("annual fee earned in Jan by days (2000/365*31*1.05)",
     ab.earned[0], Math.round(2000/365*31*1.05*100)/100);
  eq("annual fee earned in Feb by days (28 days)",
     ab.earned[1], Math.round(2000/365*28*1.05*100)/100);
  eq("annual fee earned total ties to the penny with the invoiced total",
     Math.round(ab.earned.reduce((a,b)=>a+b,0) * 100) / 100, 2100);

  const af = M.phaseFee({ amount:750, frequency:"Q", markup:true }, YEAR);
  eq("quarterly fee invoiced in four months", af.invoiced.filter(v=>v>0).length, 4);
  eq("quarterly invoice amount is 787.50", af.invoiced[0], 787.5);
  eq("quarterly invoiced in Jan, Apr, Jul, Oct",
     af.invoiced.map((v,i)=>v>0?i:null).filter(v=>v!==null), [0,3,6,9]);
  eq("quarterly fee earned in Jan by days within its quarter",
     af.earned[0], Math.round(750/(31+28+31)*31*1.05*100)/100);
  eq("quarterly earned total ties to the penny with the invoiced total",
     Math.round(af.earned.reduce((a,b)=>a+b,0) * 100) / 100, 3150);

  const lost = M.phaseFee({ amount:1000, frequency:"M", markup:true, endsMonth:5 }, YEAR);
  eq("lost business stops after the stated month", lost.invoiced.slice(6), new Array(6).fill(0));
  eq("lost business still billed up to it", lost.invoiced[5], 1050);
  const won = M.phaseFee({ amount:1200, frequency:"M", markup:true, startsMonth:9 }, YEAR);
  eq("new business starts in the stated month", won.invoiced[9], 1260);
  eq("new business bills nothing before it", won.invoiced.slice(0,9), new Array(9).fill(0));
}

group("Budget model — phasing methods");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  const all = [0,1,2,3,4,5,6,7,8,9,10,11];
  eq("'evenly' splits into twelve equal amounts", M.spread(1200, all, "even", 2026)[0], 100);
  const days = M.spread(3650, all, "days", 2026);
  ok("'by days in month' gives January more than February", days[0] > days[1]);
  eq("'by days' sums to the penny to the full amount",
     Math.round(days.reduce((a,b)=>a+b,0) * 100) / 100, 3650);
  const spec = M.spread(5000, [8], "specific", 2026);
  eq("'specific month' puts it all in that month", spec[8], 5000);
  eq("...and nothing elsewhere", spec.reduce((a,b)=>a+b,0), 5000);
}

group("Budget model — balance sheet and cash flow");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  const f = M.phaseFee({ amount:12000, frequency:"A", markup:false }, 2026);
  const bs = M.projectBalanceSheet({
    invoiced: f.invoiced, earned: f.earned,
    costsIncurred: new Array(12).fill(500), collectionDays: 35, paymentDays: 30,
  });
  ok("the balance sheet balances in every month", bs.balances);
  ok("deferred income arises when billing runs ahead of earning", bs.rows[0].deferredIncome > 0);
  ok("deferred income unwinds to nil by the year end",
     Math.abs(bs.closing.deferredIncome) < 0.02, "closing " + bs.closing.deferredIncome);
  eq("nothing is collected in the first month on 35 day terms", bs.rows[0].receipts, 0);
  eq("the January invoice is collected in February", bs.rows[1].receipts, 12000);
  eq("receivables carry the uncollected invoice at January", bs.rows[0].receivables, 12000);
  eq("receivables clear once collected", bs.rows[1].receivables, 0);
  ok("retained earnings equal cumulative profit",
     Math.abs(bs.closing.retained - 6000) < 0.02);

  const slow = M.projectBalanceSheet({
    invoiced: f.invoiced, earned: f.earned,
    costsIncurred: new Array(12).fill(500), collectionDays: 95, paymentDays: 30,
  });
  ok("slower collection delays receipts", slow.rows[1].receipts === 0);
  ok("...but profit is unchanged", Math.abs(slow.closing.retained - bs.closing.retained) < 0.02);
  ok("...and the balance sheet still balances", slow.balances);
}

group("Budget model — payroll");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  const p = M.phaseStaffCost({
    annualSalary:60000, changes:[{ month:6, annualSalary:66000 }], bonuses:[{ month:11, amount:5000 }],
  });
  eq("opening salary phased monthly", p.salary[0], 5000);
  eq("a pay rise takes effect in the stated month", p.salary[6], 5500);
  eq("...and not before it", p.salary[5], 5000);
  eq("employer social is 11% of salary", p.social[0], 550);
  eq("pension is 6% of salary", p.pension[0], 300);
  eq("a bonus lands in its month", p.bonus[11], 5000);
  ok("employer social applies to the bonus too", p.social[11] > p.social[10]);
  ok("benefits flow automatically per head", p.benefits[0] > 0);

  const leaver = M.phaseStaffCost({ annualSalary:48000, leaveMonth:4 });
  eq("a leaver's cost stops the month after they go", leaver.salary[5], 0);
  eq("...and is charged up to their last month", leaver.salary[4], 4000);
  const starter = M.phaseStaffCost({ annualSalary:36000, startMonth:9 });
  eq("a starter costs nothing before joining", starter.salary[8], 0);
  eq("...and is charged from their start month", starter.salary[9], 3000);

  const team = M.phaseHeadcount([
    { annualSalary:60000 }, { annualSalary:48000, leaveMonth:5 }, { annualSalary:36000, startMonth:6 },
  ]);
  eq("headcount reflects joiners and leavers", team.heads, [2,2,2,2,2,2,2,2,2,2,2,2]);
  ok("total staff cost includes salary, on-costs and benefits", team.total[0] > team.salary[0]);
}

group("Budget model — governance");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  ok("every cost centre has a named business owner",
     M.COST_CENTRES.every((c) => c.owner && c.ownerRole));
  ok("sales sits with the Managing Director",
     M.COST_CENTRES.find((c) => c.code === "SALES").ownerRole === "md");
  ok("events sits with Business Development",
     M.COST_CENTRES.find((c) => c.code === "EVENTS").ownerRole === "bd");
  ok("bank charges and depreciation sit with the Accountant",
     M.COST_CENTRES.find((c) => c.code === "BANKCHG").ownerRole === "acct" &&
     M.COST_CENTRES.find((c) => c.code === "DEPN").ownerRole === "acct");
  ok("the workflow includes a wish-list gathering stage",
     M.BUDGET_STAGES.some((s) => s.code === "gathering"));
  ok("...an MD consolidated review", M.BUDGET_STAGES.some((s) => s.code === "md_review"));
  ok("...and a Group discussion before submission",
     M.BUDGET_STAGES.findIndex((s) => s.code === "group_disc") <
     M.BUDGET_STAGES.findIndex((s) => s.code === "submitted"));
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
