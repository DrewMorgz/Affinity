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

  // Employer social and pension are no longer a flat percentage on the front
  // sheet. They come from the Staff tab, which applies the employing company's
  // regional rates and ceilings — so they are linked, not typed and not a
  // single hardcoded rate.
  const ni = ACCOUNTS.find((a) => a.code === "6010");
  eq("employer social is pulled from the Staff tab", ni.kind, "linked");
  eq("...and identified as coming from staff", ni.src, "staff");
  const pension = ACCOUNTS.find((a) => a.code === "6020");
  eq("pension is pulled from the Staff tab", pension.kind, "linked");

  // nothing that another tab supplies may be typed over on the front sheet
  const linkedCodes = ACCOUNTS.filter((a) => a.kind === "linked").map((a) => a.code);
  ok("revenue accounts are all linked, not editable",
     ["4000","4010","4020","4030","4040","4090"].every((c) => linkedCodes.includes(c)));
  ok("staff cost accounts are all linked, not editable",
     ["6000","6010","6020","6025","6026"].every((c) => linkedCodes.includes(c)));
  ok("genuinely manual accounts remain editable",
     ACCOUNTS.filter((a) => a.kind === "input").length > 0);
  ok("recruitment and training stays manual",
     ACCOUNTS.find((a) => a.code === "6030").kind === "input");
  ok("every linked account names its source tab",
     ACCOUNTS.filter((a) => a.kind === "linked").every((a) => a.src === "fees" || a.src === "staff"));

  ok("depreciation comes from the ledger rather than being budgeted by hand",
     ACCOUNTS.find((a) => a.code === "7050").kind === "actual");

  // net result: revenue less all cost groups
  const values = {}; ACCOUNTS.forEach((a) => { values[a.code] = 1000; });
  const groupTotal = (g) => ACCOUNTS.filter((a) => a.group === g).reduce((s, a) => s + values[a.code], 0);
  const net = ["Revenue", "Direct costs", "Staff costs", "Overheads"].reduce((s, g) => s + SIGN[g] * groupTotal(g), 0);
  // computed from the chart rather than hardcoded, so adding an account does
  // not silently break the assertion
  const expected = groupTotal("Revenue") - groupTotal("Direct costs")
                 - groupTotal("Staff costs") - groupTotal("Overheads");
  eq("net result subtracts every cost group from revenue", net, expected);
  ok("revenue is the only group added", SIGN["Revenue"] === 1 &&
     ["Direct costs","Staff costs","Overheads"].every((g) => SIGN[g] === -1));
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
  ok("employer social is charged", p.social[0] > 0);
  ok("pension is charged", p.pension[0] > 0);
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


group("Budget model — day count basis (actual days, not a flat 365)");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  eq("2026 is a 365 day year", M.daysInYear(2026), 365);
  eq("2028 is a leap year and must be 366", M.daysInYear(2028), 366);
  eq("February 2028 has 29 days", M.daysInMonth(2028)[1], 29);

  // an annual fee in a leap year must still tie to the invoiced amount
  const leap = M.phaseFee({ amount:2000, frequency:"A", markup:true }, 2028);
  eq("leap-year annual fee still ties to the invoiced total",
     Math.round(leap.earned.reduce((a,b)=>a+b,0) * 100) / 100, 2100);
  eq("leap-year February earns on 29 days",
     leap.earned[1], Math.round(2000/366*29*1.05*100)/100);
  ok("a leap-year February earns more than a normal one",
     leap.earned[1] > M.phaseFee({ amount:2000, frequency:"A", markup:true }, 2026).earned[1]);
}

group("Budget model — payroll taxes by region");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  const regions = Object.keys(M.ONCOSTS_BY_REGION);
  ok("every Affinity region has its own rates", regions.length >= 6);
  ok("Cyprus is included", !!M.ONCOSTS_BY_REGION.CYPRUS);
  ok("Cyprus charges employer social with a ceiling",
     M.ONCOSTS_BY_REGION.CYPRUS.socialPct > 0 && M.ONCOSTS_BY_REGION.CYPRUS.socialCap > 0);
  ok("Cyprus has no mandatory occupational pension",
     M.phaseStaffCost({ annualSalary:60000, region:"CYPRUS" }).pension[0] === 0);
  ok("Cyprus's ceiling caps the annual social charge",
     M.phaseStaffCost({ annualSalary:150000, region:"CYPRUS" }).social.reduce((a,b)=>a+b,0)
       <= 66612 * M.ONCOSTS_BY_REGION.CYPRUS.socialPct + 0.01);
  ok("Cyprus has its own benefit costs", !!M.BENEFITS_BY_REGION.CYPRUS);
  ok("every region is labelled and dated for review",
     regions.every((r) => M.ONCOSTS_BY_REGION[r].label && M.ONCOSTS_BY_REGION[r].reviewed));
  ok("every Affinity company maps to a region",
     ["AFG-000","AFG-IOM","AFG-MLT","AFG-CYM","AFG-UK","AFG-SD","AFG-FL"]
       .every((r) => M.ENTITY_REGION[r]));

  // the same salary costs different amounts in different places
  const same = { annualSalary: 60000 };
  const cost = (region) => M.phaseStaffCost({ ...same, region }).annual;
  ok("the same salary costs more in the US than the Isle of Man", cost("US") > cost("IOM"));
  ok("Cayman carries no payroll tax but does carry pension",
     M.phaseStaffCost({ ...same, region:"CAYMAN" }).social[0] === 0 &&
     M.phaseStaffCost({ ...same, region:"CAYMAN" }).pension[0] > 0);
  ok("Malta charges social but has no mandatory pension",
     M.phaseStaffCost({ ...same, region:"MALTA" }).social[0] > 0 &&
     M.phaseStaffCost({ ...same, region:"MALTA" }).pension[0] === 0);

  // ceilings: a capped contribution must stop once the ceiling is passed
  const high = M.phaseStaffCost({ annualSalary: 400000, region:"US" });
  ok("a capped social charge stops later in the year", high.social[11] < high.social[0],
     "Jan " + high.social[0] + " vs Dec " + high.social[11]);
  const mlt = M.phaseStaffCost({ annualSalary: 120000, region:"MALTA" });
  ok("Malta's ceiling caps the annual social charge",
     mlt.social.reduce((a,b)=>a+b,0) <= 28000 * 0.10 + 0.01);

  // thresholds: low pay attracts less employer NI proportionally
  const lowUK  = M.phaseStaffCost({ annualSalary: 6000,  region:"UK" });
  const highUK = M.phaseStaffCost({ annualSalary: 60000, region:"UK" });
  const rateOf = (r) => r.social.reduce((a,b)=>a+b,0) / r.salary.reduce((a,b)=>a+b,0);
  ok("the UK threshold means low pay attracts a lower effective rate",
     rateOf(lowUK) < rateOf(highUK));

  // benefits differ by region too
  ok("US healthcare costs more than Isle of Man healthcare",
     M.BENEFITS_BY_REGION.US.healthcare > M.BENEFITS_BY_REGION.IOM.healthcare);

  // bonuses still attract employer social where applicable
  const withBonus = M.phaseStaffCost({ annualSalary: 60000, region:"IOM", bonuses:[{ month:11, amount:10000 }] });
  ok("a bonus attracts employer social", withBonus.social[11] > withBonus.social[10]);
}


group("Cyprus office — present everywhere the other six are");
{
  const rbac = require(path.join(SRC, "affinity_core_rbac.js"));
  const off  = require(path.join(SRC, "affinity_offices.js"));

  eq("six offices, Cyprus included", off.OFFICES.length, 6);
  ok("Cyprus is an office", off.OFFICE_NAMES.includes("Cyprus"));
  ok("every office has a flag, currency and entity", off.OFFICES.every((o)=>o.flag&&o.ccy&&o.entity));
  ok("every office maps to a payroll region",
     off.OFFICES.every((o)=>!!require(path.join(SRC,"affinity_budget_model.js")).ONCOSTS_BY_REGION[o.region]));

  eq("eight Affinity group companies", rbac.INTERNAL_ENTITIES.length, 8);
  ok("Affinity (Cyprus) Limited is one of them",
     rbac.INTERNAL_ENTITIES.some((e)=>e.ref==="AFG-CYP"));
  ok("Cyprus can be granted and denied like any other company",
     rbac.canAccessInternalEntity("admin","AFG-CYP",["AFG-CYP"]) &&
     !rbac.canAccessInternalEntity("admin","AFG-CYP",["AFG-MLT"]));
  ok("Super Admin holds Cyprus by default",
     rbac.internalRefsFor("system_admin").includes("AFG-CYP"));
  ok("a Manager does not hold Cyprus by default",
     !rbac.internalRefsFor("manager").includes("AFG-CYP"));

  // the office list is now one source rather than seven copies
  ok("offices are exported for reuse", Array.isArray(off.OFFICE_NAMES) && off.OFFICE_NAMES.length === 6);
  ok("jurisdictions are wider than offices", off.JURISDICTIONS.length > off.OFFICES.length);
  ok("Cyprus appears in the jurisdiction list too", off.JURISDICTIONS.includes("Cyprus"));
}


group("Budget model — staff recharges across companies");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  const CCY = { "AFG-IOM":"GBP", "AFG-MLT":"EUR", "AFG-CYM":"USD", "AFG-000":"GBP" };

  // a group MLRO employed in the Isle of Man, half recharged to Malta
  const mlro = { name:"Group MLRO", entity:"AFG-IOM", region:"IOM", annualSalary:72000,
                 recharges:[{ entity:"AFG-MLT", pct:50 }] };
  const rc = M.computeRecharges([mlro], CCY);

  ok("the employing company shows a recharge out", rc["AFG-IOM"].rechargedOut[0] > 0);
  ok("the receiving company shows a recharge in",  rc["AFG-MLT"].rechargedIn[0] > 0);
  eq("the employing company has nothing recharged in", rc["AFG-IOM"].rechargedIn[0], 0);
  eq("the receiving company has nothing recharged out", rc["AFG-MLT"].rechargedOut[0], 0);

  // half the cost, and converted into the receiving company's currency
  const full = M.phaseStaffCost(mlro).total[0];
  eq("50% of the cost is recharged", rc["AFG-IOM"].rechargedOut[0], Math.round(full * 0.5 * 100) / 100);
  ok("the recharge arrives in euro, not sterling",
     Math.abs(rc["AFG-MLT"].rechargedIn[0] - rc["AFG-IOM"].rechargedOut[0]) > 0.01);
  eq("converted at the planning rate",
     rc["AFG-MLT"].rechargedIn[0],
     Math.round(M.convert(full * 0.5, "GBP", "EUR") * 100) / 100);

  // the group must not gain or lose money through a recharge
  const outGBP = rc["AFG-IOM"].rechargedOut.reduce((a,b)=>a+b,0);
  const inGBP  = M.convert(rc["AFG-MLT"].rechargedIn.reduce((a,b)=>a+b,0), "EUR", "GBP");
  ok("recharges net to nil across the group once translated back",
     Math.abs(outGBP - inGBP) < 0.05, "out " + outGBP.toFixed(2) + " vs in " + inGBP.toFixed(2));

  // splitting across several companies
  const shared = { name:"Shared", entity:"AFG-IOM", region:"IOM", annualSalary:60000,
                   recharges:[{ entity:"AFG-MLT", pct:30 }, { entity:"AFG-CYM", pct:20 }] };
  const rc2 = M.computeRecharges([shared], CCY);
  const cost = M.phaseStaffCost(shared).total[0];
  eq("a person can be split across several companies",
     rc2["AFG-IOM"].rechargedOut[0], Math.round(cost * 0.5 * 100) / 100);
  ok("Malta and Cayman each receive their own share",
     rc2["AFG-MLT"].rechargedIn[0] > 0 && rc2["AFG-CYM"].rechargedIn[0] > 0);
  ok("the Cayman share arrives in dollars",
     Math.abs(rc2["AFG-CYM"].rechargedIn[0] - M.convert(cost*0.2, "GBP", "USD")) < 0.02);

  // guards
  eq("recharging to the employing company itself is ignored",
     Object.keys(M.computeRecharges([{ entity:"AFG-IOM", annualSalary:50000, recharges:[{ entity:"AFG-IOM", pct:50 }] }], CCY)).length, 0);
  const over = M.rechargeSummary({ recharges:[{ entity:"AFG-MLT", pct:70 }, { entity:"AFG-CYM", pct:60 }] });
  ok("more than 100% recharged is flagged", !over.valid && !!over.warning);
  const fully = M.rechargeSummary({ recharges:[{ entity:"AFG-MLT", pct:100 }] });
  ok("fully recharged is allowed but noted", fully.valid && !!fully.warning);
  eq("retained percentage is reported", M.rechargeSummary({ recharges:[{ entity:"AFG-MLT", pct:35 }] }).retained, 65);
  eq("no recharges means the whole cost is retained", M.rechargeSummary({}).retained, 100);

  // currency conversion basics
  eq("converting to the same currency changes nothing", M.convert(100, "GBP", "GBP"), 100);
  ok("an unknown currency is left alone rather than corrupted", M.convert(100, "XXX", "GBP") === 100);
}


group("Budget model — the Florida case: recharge to group, then on to subsidiaries");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  const CCY = { "AFG-000":"GBP","AFG-IOM":"GBP","AFG-MLT":"EUR","AFG-CYM":"USD",
                "AFG-UK":"GBP","AFG-CYP":"EUR","AFG-SD":"USD","AFG-FL":"USD" };

  eq("up to six recharge targets per person", M.MAX_RECHARGE_TARGETS, 6);
  ok("a group allocation basis exists", Object.keys(M.GROUP_ALLOCATION).length >= 6);
  eq("the group allocation sums to 100",
     Object.values(M.GROUP_ALLOCATION).reduce((a,b)=>a+b,0), 100);

  // paid by Florida, wholly recharged to Group, which passes it on
  const cfo = { name:"Group CFO", entity:"AFG-FL", region:"US", annualSalary:120000,
                recharges:[{ entity:"AFG-000", pct:100 }] };
  const rc = M.computeRecharges([cfo], CCY);

  ok("Florida recharges the cost out", rc["AFG-FL"].rechargedOut[0] > 0);
  ok("the group receives it", rc["AFG-000"].rechargedIn[0] > 0);
  ok("the group then passes all of it on", rc["AFG-000"].groupOnChargeOut[0] > 0);
  eq("the group keeps nothing",
     Math.round((rc["AFG-000"].rechargedIn[0] - rc["AFG-000"].groupOnChargeOut[0]) * 100) / 100, 0);

  ok("the Isle of Man picks up its share", rc["AFG-IOM"].groupOnChargeIn[0] > 0);
  ok("Malta picks up its share",           rc["AFG-MLT"].groupOnChargeIn[0] > 0);
  ok("Cayman picks up its share",          rc["AFG-CYM"].groupOnChargeIn[0] > 0);
  ok("Cyprus picks up its share",          rc["AFG-CYP"].groupOnChargeIn[0] > 0);
  ok("the Isle of Man share is larger than Cyprus's, per the basis",
     rc["AFG-IOM"].groupOnChargeIn[0] > rc["AFG-CYP"].groupOnChargeIn[0]);

  // the shares arrive in each company's own currency
  const iomShare = rc["AFG-IOM"].groupOnChargeIn[0];
  const mltShare = rc["AFG-MLT"].groupOnChargeIn[0];
  ok("Malta's share is stated in euro, not sterling",
     Math.abs(mltShare - M.convert(mltShare, "EUR", "GBP")) > 0.01);

  // THE INVARIANT: two steps of recharge must still net to nil group-wide
  const toGBP = (ref, series) => M.convert(series.reduce((a,b)=>a+b,0), CCY[ref], "GBP");
  let debits = 0, credits = 0;
  Object.keys(rc).forEach((ref) => {
    debits  += toGBP(ref, rc[ref].rechargedIn) + toGBP(ref, rc[ref].groupOnChargeIn);
    credits += toGBP(ref, rc[ref].rechargedOut) + toGBP(ref, rc[ref].groupOnChargeOut);
  });
  ok("a two-step recharge still nets to nil across the group",
     Math.abs(debits - credits) < 0.10, "debits " + debits.toFixed(2) + " credits " + credits.toFixed(2));

  // six targets at once
  const spread6 = { entity:"AFG-IOM", region:"IOM", annualSalary:90000, recharges:[
    { entity:"AFG-MLT", pct:10 }, { entity:"AFG-CYM", pct:10 }, { entity:"AFG-UK", pct:10 },
    { entity:"AFG-CYP", pct:10 }, { entity:"AFG-SD", pct:10 },  { entity:"AFG-FL", pct:10 },
  ]};
  const rc6 = M.computeRecharges([spread6], CCY);
  eq("all six targets receive a share",
     ["AFG-MLT","AFG-CYM","AFG-UK","AFG-CYP","AFG-SD","AFG-FL"].filter((r)=>rc6[r] && rc6[r].rechargedIn[0] > 0).length, 6);
  eq("the summary counts the targets", M.rechargeSummary(spread6).targets, 6);
  eq("and the retained share", M.rechargeSummary(spread6).retained, 40);
  const seventh = { entity:"AFG-IOM", annualSalary:50000, recharges:
    Array.from({length:8}, (_,k)=>({ entity:"AFG-MLT", pct:5 })) };
  eq("a seventh target is ignored rather than silently double counted",
     M.rechargeSummary(seventh).targets, 6);
}


group("Budget model — the group company retains no staff cost");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  const CCY = { "AFG-000":"GBP","AFG-IOM":"GBP","AFG-MLT":"EUR","AFG-CYM":"USD",
                "AFG-UK":"GBP","AFG-CYP":"EUR","AFG-SD":"USD","AFG-FL":"USD" };

  // someone employed directly BY the group, with no person-level recharge
  const groupStaff = { name:"Group role", entity:"AFG-000", region:"IOM", annualSalary:90000 };
  const rc = M.computeRecharges([groupStaff], CCY);
  const cost = M.phaseStaffCost(groupStaff).total;

  ok("the group on-charges its own payroll out", rc["AFG-000"].groupOnChargeOut[0] > 0);
  eq("all of its own staff cost goes out",
     rc["AFG-000"].groupOnChargeOut[0], Math.round(cost[0] * 100) / 100);
  eq("the group is left carrying nothing",
     Math.round((cost[0] - rc["AFG-000"].groupOnChargeOut[0]) * 100) / 100, 0);
  ok("the subsidiaries pick it up", rc["AFG-IOM"].groupOnChargeIn[0] > 0 && rc["AFG-MLT"].groupOnChargeIn[0] > 0);

  // combined: group's own payroll AND a recharge received from Florida
  const florida = { name:"CFO", entity:"AFG-FL", region:"US", annualSalary:120000,
                    recharges:[{ entity:"AFG-000", pct:100 }] };
  const both = M.computeRecharges([groupStaff, florida], CCY);
  ok("the group's on-charge covers both its own cost and what it received",
     both["AFG-000"].groupOnChargeOut[0] > both["AFG-000"].rechargedIn[0]);
  eq("group nets to nil overall",
     Math.round((cost[0] + both["AFG-000"].rechargedIn[0] - both["AFG-000"].groupOnChargeOut[0]) * 100) / 100, 0);

  // and the whole thing still balances group-wide
  const toGBP = (ref, series) => M.convert(series.reduce((a,b)=>a+b,0), CCY[ref], "GBP");
  let debits = 0, credits = 0;
  Object.keys(both).forEach((ref) => {
    debits  += toGBP(ref, both[ref].rechargedIn) + toGBP(ref, both[ref].groupOnChargeIn);
    credits += toGBP(ref, both[ref].rechargedOut) + toGBP(ref, both[ref].groupOnChargeOut);
  });
  // The recharge lines themselves still net to nil: every on-charge out is
  // matched by an on-charge in somewhere. The group's own payroll is a real
  // cost and sits in the staff cost lines, not in these transfer lines — which
  // is exactly why staff costs are shown gross and recharges separately.
  eq("the recharge lines net to nil group-wide, both hops included",
     Math.round((credits - debits) * 100) / 100, 0);

  // a group employee partly recharged directly: only the remainder is on-charged
  const partly = { entity:"AFG-000", region:"IOM", annualSalary:60000,
                   recharges:[{ entity:"AFG-IOM", pct:40 }] };
  const rc3 = M.computeRecharges([partly], CCY);
  const c3 = M.phaseStaffCost(partly).total[0];
  eq("40% goes out directly", rc3["AFG-000"].rechargedOut[0], Math.round(c3 * 0.4 * 100) / 100);
  eq("the remaining 60% goes out via the allocation basis",
     rc3["AFG-000"].groupOnChargeOut[0], Math.round(c3 * 0.6 * 100) / 100);
  eq("nothing is double counted",
     Math.round((rc3["AFG-000"].rechargedOut[0] + rc3["AFG-000"].groupOnChargeOut[0] - c3) * 100) / 100, 0);
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
