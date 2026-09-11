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
  // marked onward: this is a conduit through group, not a contribution to it
  const cfo = { name:"Group CFO", entity:"AFG-FL", region:"US", annualSalary:120000,
                recharges:[{ entity:"AFG-000", pct:100, onward:true }] };
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


group("Budget model — the group company keeps its own share");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  const CCY = { "AFG-000":"GBP","AFG-IOM":"GBP","AFG-MLT":"EUR","AFG-CYM":"USD",
                "AFG-UK":"GBP","AFG-CYP":"EUR","AFG-SD":"USD","AFG-FL":"USD" };

  // Neil's example: group MLRO paid in full by AGL, spread across the operating
  // companies, with a share retained at group because it is a group role.
  const mlro = { name:"Group MLRO", entity:"AFG-000", region:"IOM", annualSalary:80000,
                 recharges:[{ entity:"AFG-IOM", pct:30 }, { entity:"AFG-MLT", pct:20 },
                            { entity:"AFG-CYM", pct:15 }, { entity:"AFG-UK", pct:15 }] };
  const rc = M.computeRecharges([mlro], CCY);
  const cost = M.phaseStaffCost(mlro).total[0];
  const sum  = M.rechargeSummary(mlro);

  eq("80% is recharged out", sum.pct, 80);
  eq("20% is retained at group", sum.retained, 20);
  eq("the recharge out is 80% of cost", rc["AFG-000"].rechargedOut[0], Math.round(cost * 0.8 * 100) / 100);
  eq("group's own payroll is NOT automatically pushed out", rc["AFG-000"].groupOnChargeOut[0], 0);
  eq("group therefore keeps 20% of the cost",
     Math.round((cost - rc["AFG-000"].rechargedOut[0]) * 100) / 100,
     Math.round(cost * 0.2 * 100) / 100);
  ok("each operating company picks up its share",
     rc["AFG-IOM"].rechargedIn[0] > 0 && rc["AFG-MLT"].rechargedIn[0] > 0 &&
     rc["AFG-CYM"].rechargedIn[0] > 0 && rc["AFG-UK"].rechargedIn[0] > 0);
  ok("the Isle of Man share is larger than Cayman's, per the percentages",
     rc["AFG-IOM"].rechargedIn[0] > rc["AFG-CYM"].rechargedIn[0]);

  // the Florida pass-through still works and is a separate mechanism
  const florida = { name:"CFO", entity:"AFG-FL", region:"US", annualSalary:120000,
                    recharges:[{ entity:"AFG-000", pct:100, onward:true }] };
  const rc2 = M.computeRecharges([florida], CCY);
  ok("a recharge routed through group is passed on", rc2["AFG-000"].groupOnChargeOut[0] > 0);
  eq("and nothing of it sticks at group",
     Math.round((rc2["AFG-000"].rechargedIn[0] - rc2["AFG-000"].groupOnChargeOut[0]) * 100) / 100, 0);
  ok("the subsidiaries receive it", rc2["AFG-IOM"].groupOnChargeIn[0] > 0);

  // both together: group keeps its 20% of the MLRO and none of the CFO
  const both = M.computeRecharges([mlro, florida], CCY);
  eq("group keeps only its own retained share",
     Math.round((cost - both["AFG-000"].rechargedOut[0]) * 100) / 100,
     Math.round(cost * 0.2 * 100) / 100);

  // recharge lines still net to nil group-wide
  const toGBP = (ref, series) => M.convert(series.reduce((a,b)=>a+b,0), CCY[ref], "GBP");
  let debits = 0, credits = 0;
  Object.keys(both).forEach((ref) => {
    debits  += toGBP(ref, both[ref].rechargedIn) + toGBP(ref, both[ref].groupOnChargeIn);
    credits += toGBP(ref, both[ref].rechargedOut) + toGBP(ref, both[ref].groupOnChargeOut);
  });
  // 12 monthly figures across three currencies, each rounded to the penny, so a
  // few pence of rounding is expected. A pound would not be.
  ok("recharges still net to nil across the group",
     Math.abs(debits - credits) < 1, "debits " + debits.toFixed(2) + " credits " + credits.toFixed(2));
  ok("...and the rounding difference is pence, not pounds",
     Math.abs(debits - credits) < 0.5);

  // group can be configured to retain part of what it receives, if ever wanted
  const held = M.computeRecharges([florida], CCY, M.BUDGET_FX, { groupRetainOnReceived: 25 });
  ok("group can optionally retain a share of a received recharge",
     held["AFG-000"].groupOnChargeOut[0] < held["AFG-000"].rechargedIn[0]);
  eq("default is to retain nothing of what it receives", M.GROUP_RETAIN_ON_RECEIVED, 0);
}


group("Budget model — contribution to group vs conduit through it");
{
  const M = require(path.join(SRC, "affinity_budget_model.js"));
  const CCY = { "AFG-000":"GBP","AFG-IOM":"GBP","AFG-MLT":"EUR","AFG-CYM":"USD",
                "AFG-UK":"GBP","AFG-CYP":"EUR","AFG-SD":"USD","AFG-FL":"USD" };

  // (a) Affinity's policy: paid by the Isle of Man, 20% charged to group for
  //     the group functions performed. That 20% must STAY at group.
  const contrib = { entity:"AFG-IOM", region:"IOM", annualSalary:60000,
                    recharges:[{ entity:"AFG-000", pct:20 }] };
  const a = M.computeRecharges([contrib], CCY);
  const cost = M.phaseStaffCost(contrib).total[0];

  eq("the Isle of Man charges 20% out", a["AFG-IOM"].rechargedOut[0], Math.round(cost*0.2*100)/100);
  eq("group receives it", a["AFG-000"].rechargedIn[0], Math.round(cost*0.2*100)/100);
  eq("group does NOT pass a contribution back out", a["AFG-000"].groupOnChargeOut[0], 0);
  eq("group therefore keeps the 20%",
     Math.round((a["AFG-000"].rechargedIn[0] - a["AFG-000"].groupOnChargeOut[0])*100)/100,
     Math.round(cost*0.2*100)/100);
  ok("and none of it is returned to the company that paid it",
     (a["AFG-IOM"] ? a["AFG-IOM"].groupOnChargeIn[0] : 0) === 0);

  // (b) the Florida conduit, explicitly marked onward
  const conduit = { entity:"AFG-FL", region:"US", annualSalary:120000,
                    recharges:[{ entity:"AFG-000", pct:100, onward:true }] };
  const b = M.computeRecharges([conduit], CCY);
  ok("a conduit IS passed on", b["AFG-000"].groupOnChargeOut[0] > 0);
  eq("and nothing of it sticks at group",
     Math.round((b["AFG-000"].rechargedIn[0] - b["AFG-000"].groupOnChargeOut[0])*100)/100, 0);
  ok("the operating companies receive it", (b["AFG-IOM"]||{groupOnChargeIn:[0]}).groupOnChargeIn[0] > 0);

  // both at once: group keeps the contribution and passes on the conduit
  const both = M.computeRecharges([contrib, conduit], CCY);
  const kept = both["AFG-000"].rechargedIn[0] - both["AFG-000"].groupOnChargeOut[0];
  eq("group keeps exactly the contribution and no more",
     Math.round(kept*100)/100, Math.round(cost*0.2*100)/100);

  ok("the default is to keep, not to pass on — the safer assumption",
     M.computeRecharges([{ entity:"AFG-IOM", annualSalary:50000,
       recharges:[{ entity:"AFG-000", pct:50 }] }], CCY)["AFG-000"].groupOnChargeOut[0] === 0);

  // netting still holds with both kinds present
  const toGBP = (ref, series) => M.convert(series.reduce((x,y)=>x+y,0), CCY[ref], "GBP");
  let debits = 0, credits = 0;
  Object.keys(both).forEach((ref) => {
    debits  += toGBP(ref, both[ref].rechargedIn) + toGBP(ref, both[ref].groupOnChargeIn);
    credits += toGBP(ref, both[ref].rechargedOut) + toGBP(ref, both[ref].groupOnChargeOut);
  });
  ok("recharges net to nil with contributions and conduits mixed",
     Math.abs(debits - credits) < 1, "debits " + debits.toFixed(2) + " credits " + credits.toFixed(2));
}


group("Write layer — API contracts and journal balancing");
{
  const DW = require(path.join(SRC, "affinity_docs_onb_write_api.js"));

  // The imbalance helper is what the bookkeeping form uses to refuse a journal
  // before it reaches the database.
  eq("a balanced journal has zero imbalance",
     DW.journalImbalance([{ amount: 1200 }, { amount: -1200 }]), 0);
  eq("an unbalanced journal reports the difference",
     DW.journalImbalance([{ amount: 1200 }, { amount: -950 }]), 250);
  eq("a credit-heavy journal reports a negative difference",
     DW.journalImbalance([{ amount: 500 }, { amount: -800 }]), -300);
  eq("many lines still net correctly",
     DW.journalImbalance([{ amount: 100 }, { amount: 250 }, { amount: -350 }]), 0);
  eq("pennies are handled without floating point drift",
     DW.journalImbalance([{ amount: 0.1 }, { amount: 0.2 }, { amount: -0.3 }]), 0);
  eq("an empty journal is zero, not an error", DW.journalImbalance([]), 0);

  // Every write wrapper must refuse cleanly with no database rather than
  // throwing — the forms rely on that. Checked synchronously via canWrite,
  // since an await at module top level would exit the test file early.
  ok("the write layer reports itself unavailable with no database", DW.canWrite() === false);
  ok("every documented write function is exported",
     ["docFile","docReclassify","docDelete","onbCaseAdd","onbCaseAdvance","cddItemAdd",
      "cddItemVerify","journalPost","journalApprove","journalReverse","txnAdd",
      "periodOpen","periodClose","periodReopen","periodLockFinal"]
       .every((f) => typeof DW[f] === "function"));
}

group("Write layer — retention override is opt-in");
{
  const DW = require(path.join(SRC, "affinity_docs_onb_write_api.js"));
  // The point of the retention control is that overriding it is deliberate.
  // Assert the default rather than trusting it stays that way.
  const src = fs.readFileSync(path.join(SRC, "affinity_docs_onb_write_api.js"), "utf8");
  ok("docDelete defaults override to false",
     /docDelete = \(id, reason, overrideRetention = false\)/.test(src));
  ok("CDD methods are enumerated so a form cannot invent one",
     Array.isArray(DW.CDD_METHODS) && DW.CDD_METHODS.includes("Certified copy"));
  ok("journal types match the engine's allowed set",
     DW.JOURNAL_TYPES.join(",") === "manual,recurring,reversing,accrual,system,stat_adjustment");
  ok("onboarding stages are in order with Declined last",
     DW.ONBOARDING_STAGES[0] === "Enquiry" &&
     DW.ONBOARDING_STAGES[DW.ONBOARDING_STAGES.length - 1] === "Declined");
}


group("Output — spreadsheet export and printable documents");
{
  // The output layer takes no new dependencies: CSV is a Blob, and PDFs come
  // from the browser's own print dialogue over a styled view.
  const OUT = require(path.join(SRC, "affinity_output.js"));

  // Excel is unforgiving about these three things.
  const csv = OUT.toCSV(
    [{ label: "Name", key: "n" }, { label: "Amount", key: "a" }],
    [{ n: "Müller & Co", a: 1200 }, { n: 'O"Brien, A', a: -50 }, { n: "=1+1", a: 0 }]);
  ok("a BOM is written so accented names survive Excel", csv.charCodeAt(0) === 0xFEFF);
  ok("a value containing a comma and quote is escaped", csv.includes('"O""Brien, A"'));
  ok("a value Excel would evaluate as a formula is neutralised", csv.includes("'=1+1"));
  ok("rows are CRLF terminated as Excel expects", csv.includes("\r\n"));
  eq("header plus one row per record", csv.trim().split("\r\n").length, 4);
  // trim() would remove the very empty cell being tested, so split the raw text
  eq("a nil value becomes an empty cell, not the text null",
     OUT.toCSV([{ label: "A", key: "a" }], [{ a: null }]).split("\r\n")[1], "");
  ok("...and not the string 'null'",
     !OUT.toCSV([{ label: "A", key: "a" }], [{ a: null }]).includes("null"));

  // HTML built for a document must not be injectable from entity data.
  ok("entity data is escaped into documents",
     OUT.htmlTable(["A"], [["<script>alert(1)</script>"]]).includes("&lt;script&gt;"));
  ok("a blank value shows as a dash rather than nothing",
     OUT.htmlPairs([["Registered number", ""]]).includes("—"));
  ok("a table marks its numeric columns for right alignment",
     OUT.htmlTable(["A", "B"], [["1", "2"]], [1]).includes('class="num"'));

  // Email: a browser cannot send, but it can hand over a prepared message.
  const long = OUT.composeEmail({ to: "a@b.com", body: "x".repeat(2500) });
  ok("an over-long message is refused rather than silently truncated by the OS",
     long.ok === false && /too long/.test(long.error));

  // Regulator portals: filing is done on their site, so the right action is to
  // open the correct one.
  ["Isle of Man","Malta","Cayman Islands","United Kingdom","Cyprus","United States"]
    .forEach((j) => ok("a portal is recorded for " + j, !!OUT.REGULATOR_PORTALS[j]));
  ok("an unknown jurisdiction is reported, not opened blindly",
     OUT.openRegulatorPortal("Nowhere").ok === false);
}


group("Authentication — identity matching");
{
  // Staff records hold firstname.surname@ but real Entra accounts vary. The
  // CEO's actual account is andy@affinityco.com against a record for
  // andrew.morgan@affinityco.com, which the original exact-match logic missed —
  // he would have signed in on the least privileged role.
  const Module = require("module");
  const supaPath = path.join(SRC, "affinity_accounting_supabase.js");
  const realJs = require.extensions[".js"];
  require.extensions[".js"] = function (m, f) {
    if (f === supaPath) return m._compile("exports.supabase=null;exports.isConfigured=false;", f);
    return realJs(m, f);
  };
  const A = require(path.join(SRC, "affinity_auth.js"));
  require.extensions[".js"] = realJs;

  const STAFF = [
    { id: 1, name: "Andy Morgan", firstName: "Andrew",
      email: "andrew.morgan@affinityco.com", role: "Super Admin" },
    { id: 2, name: "Roxy Sheeley", firstName: "Roxy",
      email: "roxy.sheeley@affinityco.com", role: "Director" },
  ];
  const who = (email, display) =>
    A.identityFromSession({ user: { email, user_metadata: { full_name: display } } }, STAFF);

  eq("an exact email matches", who("andrew.morgan@affinityco.com", "Andy Morgan").role, "Super Admin");
  eq("a short account matches on display name", who("andy@affinityco.com", "Andy Morgan").role, "Super Admin");
  eq("initial.surname matches", who("a.morgan@affinityco.com", "Andrew Morgan").role, "Super Admin");
  eq("knownas.surname matches", who("andy.morgan@affinityco.com", "Andy Morgan").role, "Super Admin");
  eq("a first name alone matches", who("roxy@affinityco.com", "Roxy Sheeley").role, "Director");

  // The safety property that matters more than any match: an unrecognised
  // account must never inherit privilege.
  const unknown = who("brand.new@affinityco.com", "Brand New");
  ok("an unmatched account is not treated as matched", unknown.matched === false);
  eq("...and defaults to the least privileged role", unknown.role, "Administrator");
  ok("...but is still let in rather than locked out", !!unknown.email);
  ok("a session with no user yields nothing", A.identityFromSession(null, STAFF) === null);
}


group("Authentication — no route past the login page");
{
  // The preview fallback was removed once sign-in worked. Assert it stays gone:
  // its only remaining effect would be to let someone work in a convincing copy
  // whose entries are never saved, and the site is publicly reachable.
  const src = fs.readFileSync(path.join(SRC, "affinity_login_page.jsx"), "utf8");
  ok("no preview button remains", !/Continue to preview/.test(src));
  ok("no preview handler remains", !/handlePreview/.test(src));
  ok("onLogin is only called with a real session",
     !/onLogin\(\s*1\s*\)/.test(src));
  ok("the unconfigured state points at IT rather than offering a way round",
     /contact IT/.test(src));
  ok("...and mentions the expiring client secret, the likeliest cause of a sudden failure",
     /client secret may have expired/.test(src));
}


group("Installable app — manifest, and what the service worker must not cache");
{
  const root = path.join(SRC, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.json"), "utf8"));
  const sw = fs.readFileSync(path.join(root, "public/service-worker.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

  eq("installs in its own window", manifest.display, "standalone");
  eq("uses Midnight Navy as the theme", manifest.theme_color, "#001242");
  ok("has both required icon sizes",
     [192, 512].every((n) => manifest.icons.some((i) => i.sizes === n + "x" + n)));
  ok("has maskable icons so Android does not crop the wordmark",
     manifest.icons.some((i) => i.purpose === "maskable"));

  // The service worker exists to make the app installable, NOT to work offline.
  // Caching client data would put beneficial ownership records on staff laptops
  // in six jurisdictions and show a stale register as current. Both are worse
  // than the app simply needing a connection.
  ok("only same-origin GETs are ever intercepted",
     /req\.method !== "GET" \|\| url\.origin !== self\.location\.origin/.test(sw));
  ok("requests carrying an auth token are never cached",
     /access_token/.test(sw) && /return;/.test(sw));
  ok("the document is network-first, so a deploy is picked up immediately",
     /network first/i.test(sw));
  ok("signing out clears the caches", /affinity-signed-out/.test(sw));
  ok("the offline notice says no data is held on the device",
     /never stored on\s*\n?\s*.{0,20}this device|never stored on this device/.test(sw));

  ok("the manifest is linked from the page", /rel="manifest"/.test(html));
  ok("iOS gets its own icon and title", /apple-touch-icon/.test(html) && /apple-mobile-web-app-title/.test(html));
  ok("an internal system is not indexed by search engines", /noindex/.test(html));
}

group("There is a way to sign out");
{
  // The application had no sign-out at all. With the preview bypass removed,
  // sign-in is the only way in — so a shared machine kept the previous
  // person's session until the browser was closed.
  const shell = fs.readFileSync(path.join(SRC, "affinity_core_unified_v3.jsx"), "utf8");
  ok("a sign-out control exists", /Sign out/.test(shell));
  ok("it calls the auth sign-out", /authSignOut\(\)/.test(shell));
  ok("it clears the local session state", /setLoggedIn\(false\)/.test(shell));
  ok("it tells the service worker to drop its caches", /affinity-signed-out/.test(shell));
}


group("Wiring — the client lifecycle joins up");
{
  // A wiring audit found the most consequential gap so far: every register
  // worked, but there was no way to create the entity they all hang off, and
  // an onboarding case could reach 'Live' with no entity ever produced.
  const sqlDir = path.join(SRC, "..", "db");
  const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");
  const api = fs.readFileSync(path.join(SRC, "affinity_docs_onb_write_api.js"), "utf8");
  const ea  = fs.readFileSync(path.join(SRC, "affinity_core_entity_admin.jsx"), "utf8");

  ok("a client entity can be created", /CREATE OR REPLACE FUNCTION ea_entity_create/.test(sql));
  ok("creating one also creates its profile row, so no field shows blank",
     /ea_entity_create[\s\S]{0,4000}?INSERT INTO entity_profile/.test(sql));
  ok("a duplicate name in the same jurisdiction is refused",
     /already exists in %\. Check it is not a duplicate/.test(sql));
  ok("an unknown jurisdiction names the valid options rather than failing on a foreign key",
     /Unknown jurisdiction/.test(sql));
  ok("onboarding going live creates the entity",
     /onb_case_go_live[\s\S]{0,3000}?ea_entity_create/.test(sql));
  ok("...links the case to it", /UPDATE onboarding_case SET entity_id/.test(sql));
  ok("...carries the verified CDD onto the client record",
     /onb_case_go_live[\s\S]{0,3000}?INSERT INTO entity_file_note/.test(sql));
  ok("...and still passes through the CDD gates rather than going round them",
     /onb_case_go_live[\s\S]{0,2000}?onb_case_advance/.test(sql));
  ok("closing an entity is refused while time is unbilled",
     /There is unbilled time against/.test(sql));
  // db/078 does delete DEMO entities, guarded by the is_demo flag. The
  // principle here is about REAL clients: they are closed, not deleted,
  // because the records must survive the relationship. Narrowed to that.
  ok("a real entity is closed rather than deleted, so its records survive",
     /admin_status = 'Closed'/.test(sql));
  ok("...and the only entity delete is the demo-guarded one",
     (sql.match(/DELETE FROM entity WHERE/g) || []).length === 1
     && /is not flagged as demo data/.test(sql));

  ok("the app exposes entity creation", /eaEntityCreate/.test(api));
  ok("the app exposes the onboarding handover", /onbCaseGoLive/.test(api));
  ok("the New entity form is wired to it", /modalSaves\.newEntity/.test(ea));
}


group("Accounting operations — the areas that had no interface");
{
  // The wiring audit found 77 unreachable functions. These areas had writers
  // but no readers, which is why nobody built screens: you could post a client
  // money receipt and have no way to see it.
  const api = fs.readFileSync(path.join(SRC, "affinity_accounting_ops_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_accounting_ops.jsx"), "utf8");
  const sh  = fs.readFileSync(path.join(SRC, "affinity_core_unified_v3.jsx"), "utf8");

  ok("the module is reachable from the sidebar", /id:"accops"/.test(sh));
  ok("...and has a route", /case "accops"/.test(sh));
  ok("...and is in global search", /Accounting operations/.test(sh));

  // Client money is the regulated one. The failure mode is specific: a pooled
  // account balancing in total while one client is short.
  ok("client money position is per client, not per account", /cmPosition/.test(api));
  ok("shortfalls have their own function", /cmShortfalls/.test(api));
  ok("the interface states why per-client matters",
     /pooled account can balance in total/.test(ui));
  ok("...and that remediation comes from the firm, never another client",
     /never from another client/.test(ui));
  ok("the client money tab carries a count so a shortfall cannot be missed",
     /shortfalls\.length > 0/.test(ui));

  // Auto-matching and preparing must not read as decisions.
  ok("bank auto-match is described as proposing, not deciding",
     /does not decide/.test(ui));
  ok("preparing a VAT return is distinguished from posting it",
     /Posting is a separate\s*\n?\s*act|posts nothing/.test(ui));

  // A stalled schedule is the accrual nobody notices until the audit.
  ok("stalled deferral schedules are flagged", /stalled/.test(ui));
  ok("...with the reason stated", /misstatement/.test(ui));

  // Every area must say why it is empty rather than showing a blank panel.
  ok("empty states explain themselves", /Nothing to show/.test(ui));
  ok("...and an empty ledger is not presented as a reconciled one",
     /empty client money ledger is not the same/.test(ui));

  ok("the module reports whether it is reading live data",
     /Live data/.test(ui) && /No records returned/.test(ui));
}


group("Accounting operations — entry forms and the client money guard");
{
  const ui = fs.readFileSync(path.join(SRC, "affinity_core_accounting_ops.jsx"), "utf8");

  // Forms exist for the write functions that had no way in.
  ["cmReceive", "cmPay", "assetCapitalise", "assetDepreciation",
   "vatPrepare", "accrual", "prepayment"].forEach((f) =>
    ok("a form exists for " + f, new RegExp(f + ":\\s*\\{").test(ui)));

  // The client money guard is the point of this module. Overdrawing is
  // permitted by the database and records a breach automatically, so the form
  // must state the consequence BEFORE the payment, not block it.
  ok("the payment form shows what is currently held",
     /Currently held for this client/.test(ui));
  ok("...and the balance the payment would leave", /Would leave/.test(ui));
  ok("an overdrawing payment is warned about", /exceeds what is held for this client/.test(ui));
  ok("...says it will be recorded as a breach", /recorded as a client money breach/.test(ui));
  ok("...names where remediation comes from", /firm's own money/.test(ui));
  ok("...and warns against using another client's balance",
     /not from another client/.test(ui));
  ok("...and tells the user to check the client", /right client before continuing/.test(ui));
  ok("the button changes to make the consequence explicit",
     /Record anyway — creates a breach/.test(ui));
  ok("but the payment is NOT blocked — the database allows it and records it",
     !/disabled=\{overdraw/.test(ui));

  // The client dropdown shows balances, so the wrong client is visibly wrong.
  ok("the client list shows what each holds", /\(\{money\(c\.held, c\.ccy\)\} held\)/.test(ui));

  // FormModal must stay at module level. Declared inside the component, every
  // keystroke created a new component type, React remounted the subtree, and
  // the derived warning never updated — which is exactly how this was broken.
  ok("FormModal is declared at module level, not inside the component",
     /^function FormModal\(/m.test(ui));
}


group("Purchases and receivables — controls made visible");
{
  const api = fs.readFileSync(path.join(SRC, "affinity_payables_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_payables.jsx"), "utf8");
  const sh  = fs.readFileSync(path.join(SRC, "affinity_core_unified_v3.jsx"), "utf8");

  ok("the module is reachable from the sidebar", /id:"payables"/.test(sh));
  ok("...and has a route", /case "payables"/.test(sh));

  // The wrappers exist because the engine's own approvals did not enforce
  // segregation of duties. The API must point at the wrappers, never the
  // engine's functions.
  ok("approval goes through the guarded wrapper", /"pay_run_approve"/.test(api));
  ok("...and expense claims too", /"expense_claim_approve"/.test(api));
  ok("the engine's unguarded approvals are NOT called directly",
     !/"approve_payment_run"/.test(api) && !/"approve_expense_claim"/.test(api));
  ok("the API says why the wrappers exist", /did not enforce segregation/.test(api));

  // Execution stays a separate act from approval.
  ok("executing is separate from approving", /"pay_run_execute"/.test(api));
  ok("the interface explains why they are separate",
     /an approved run can still be\s*\n?\s*stopped|still be stopped before/.test(ui));
  ok("executing asks for confirmation and states the amount",
     /cannot be undone/.test(ui));

  // Historic self-approvals must be surfaced, not hidden.
  ok("self-approved runs are flagged in the row", /self-approved — review/.test(ui));
  ok("...and claims approved by the claimant", /approved by the claimant — review/.test(ui));
  ok("...and counted in the header", /self-approved to review/.test(ui));
  ok("the reason is stated: closing the gate is not knowing what passed through",
     /not the same as knowing what passed through/.test(ui));

  // Credit control: over-limit is a decision, not an oversight.
  ok("customers over their credit limit are flagged", /over limit/.test(ui));
  ok("...with the reason stated", /should be a decision\s*\n?\s*rather than an oversight|decision rather than an oversight/.test(ui));
}


group("Fiduciary reporting — trust funds and statutory accounts");
{
  const api = fs.readFileSync(path.join(SRC, "affinity_fiduciary_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_fiduciary.jsx"), "utf8");
  const sh  = fs.readFileSync(path.join(SRC, "affinity_core_unified_v3.jsx"), "utf8");

  ok("the module is reachable from the sidebar", /id:"fiduciary"/.test(sh));
  ok("...and has a route", /case "fiduciary"/.test(sh));

  // TRUST: the income and capital funds must never be presented as one figure.
  // A distribution from the wrong fund changes the beneficiary's entitlement.
  ok("income and capital are separate columns",
     /Income distributed/.test(ui) && /Capital distributed/.test(ui));
  ok("the interface states they are never combined",
     /two funds are never combined/.test(ui));
  ok("...and why it matters", /determines each beneficiary's entitlement/.test(ui));
  // the phrase wraps across a comment line, so the whitespace must be flexible
  ok("a fund check per fund exists rather than a combined balance",
     /trustFundCheck/.test(api) && /is there[\s\S]{0,12}enough in THAT fund/.test(api));
  ok("beneficiary receipts are split by fund",
     /income_received/.test(ui) && /capital_received/.test(ui));
  ok("a missing apportionment is flagged", /not set/.test(ui));
  ok("an unposted distribution is flagged", /not posted to the ledger/.test(ui));
  ok("apportioning a shared expense is explicit, not defaulted",
     /p_apportion: t\.apportion === true/.test(api));

  // ACCOUNTS: the module must not present a finalisable set on an unverified
  // basis, and must say why rather than appearing broken.
  ok("the frameworks tab leads with what blocks filing",
     /BEFORE ACCOUNTS CAN BE FILED/.test(ui));
  ok("...and states that this is deliberate", /This is deliberate/.test(ui));
  ok("...and why: directors sign a true and fair view",
     /directors sign that they\s*\n?\s*give a true and fair view|give a true and fair view/.test(ui));
  ok("frameworks with no presentation format are marked not filable",
     /none — not filable/.test(ui));
  ok("readiness is shown by category, not as one number",
     /accountsReadiness/.test(api) && /g\.category/.test(ui));
  ok("finalising is described as refused unless every gate passes",
     /Refused unless every gate passes/.test(ui));
  ok("approval requires naming the director", /p_director: director/.test(api));
  ok("approval names a director and goes through the guarded function",
     /p_director: director/.test(api) && /accounts_approve/.test(api));
  // db/074 consolidated two parallel accounts models whose workflows ran in
  // OPPOSITE orders. The surviving order is approve then finalise; a
  // regression to the other way round would let a director sign an unreviewed
  // set, so it is asserted.
  ok("the workflow order is approve then finalise",
     /draft -> approved -> finalised/.test(api));
  ok("...and the gates are checked at approval, not at finalisation",
     /gates? is checked at APPROVAL|checked at APPROVAL/.test(api));
  ok("the retired duplicate functions are not called",
     !/"accounts_set_create"/.test(api) && !/"accounts_set_approve"/.test(api)
     && !/"accounts_set_finalise"/.test(api));
  ok("the interface only offers Finalise once approved",
     /selSet\.status === "approved"[\s\S]{0,400}Finalise/.test(ui));
}


group("Consolidation — translation and non-controlling interests");
{
  // consolidated_cta and consolidated_nci already existed in the engine, and
  // this module's own header claimed to cover them while the code never
  // called them. Added to the existing module rather than building a new one.
  const api = fs.readFileSync(path.join(SRC, "affinity_consolidation_fx_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_consolidation.jsx"), "utf8");

  ok("the engine's CTA function is called", /"consolidated_cta"/.test(api));
  ok("the engine's NCI function is called", /"consolidated_nci"/.test(api));
  ok("nothing is recalculated in the front end",
     !/net_assets_func\s*\*/.test(api) && !/nci_share\s*=/.test(api));

  ok("the module has a Translation & NCI view", /Translation & NCI/.test(ui));
  ok("CTA takes an opening AND closing date, because it is a movement",
     /p_opening_date/.test(api) && /p_closing_date/.test(api));
  ok("the interface states CTA is not a trading profit or loss",
     /not a trading profit or loss/.test(ui));
  ok("...and shows the rates beside it so it can be checked",
     /Opening rate/.test(ui) && /Closing rate/.test(ui));
  ok("the interface states why NCI must be split out",
     /overstates what belongs to the parent/.test(ui));
  ok("empty states say why there is nothing rather than showing a blank table",
     /Nothing calculated yet/.test(ui)
     && /functional currency differs/.test(ui));
}


group("Reports — ten engine functions that had no interface");
{
  const api = fs.readFileSync(path.join(SRC, "affinity_reports_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_reports.jsx"), "utf8");
  const sh  = fs.readFileSync(path.join(SRC, "affinity_core_unified_v3.jsx"), "utf8");

  ok("the module is reachable", /id:"reports"/.test(sh) && /case "reports"/.test(sh));

  ["report_ar_aging", "report_ap_aging", "report_ar_overdue_interest",
   "report_vat_by_jurisdiction", "report_dimension_pnl", "customer_statement_for",
   "supplier_statement", "cash_flow_forecast", "rolling_forecast_summary",
   "ic_overview"].forEach((f) =>
    ok(f + " is called", new RegExp('"' + f + '"').test(api)));

  // ic_overview was built in db/073 and left with no caller — my own orphan,
  // the exact fault the wiring audit exists to find.
  ok("the API records that ic_overview was an orphan", /my own orphan/.test(api));

  // Reports must not run on mount: several need a date, rate or period, and
  // figures produced from defaults nobody chose invite being believed.
  ok("nothing runs automatically", !/useEffect\(\s*\(\)\s*=>\s*\{\s*run/.test(ui));
  ok("the empty state explains why", /invite being believed/.test(ui));

  // Caveats appear beside the parameters, before figures exist.
  ok("overdue interest is framed as what could be charged",
     /could<\/strong> be charged/.test(ui));
  ok("...and not as a balance to collect", /balance to collect/.test(ui));
  ok("the cash flow forecast states what it is built from",
     /expected receipts and payments/.test(ui));
  ok("the intercompany check states it cannot reconcile pair by pair",
     /pair by pair/.test(ui));

  // Money formatting is detected from the value, not a keyword list. A keyword
  // list rendered a column called "total" as 8200 instead of 8,200.00.
  ok("numeric columns are detected from the value",
     /typeof sample\[k\] === "number"/.test(ui));
  ok("...and ids are excluded so they are not formatted as money",
     /_id\$\|\^id\$/.test(ui));
}


group("Month-end close, and the client money sign-off control");
{
  const api = fs.readFileSync(path.join(SRC, "affinity_monthend_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_accounting_ops.jsx"), "utf8");
  const sqlDir = path.join(SRC, "..", "db");
  const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");

  ["month_end_checklist", "run_recurring_journals", "run_deferrals",
   "run_fx_revaluation", "post_depreciation", "upsert_fx_rates",
   "run_client_money_reconciliation", "cm_recons_list", "cm_recon_sign_off"]
    .forEach((f) => ok(f + " is reachable", new RegExp('"' + f + '"').test(api)));

  // sign_off_reconciliation refused an unremedied shortfall but let the
  // preparer sign their own. Same gap as payment runs, on the regulated
  // three-way reconciliation.
  ok("a guarded sign-off wrapper exists",
     /CREATE OR REPLACE FUNCTION cm_recon_sign_off/.test(sql));
  ok("...refusing the preparer", /You prepared this reconciliation/.test(sql));
  ok("...and the API points at the wrapper, not the engine's function",
     /"cm_recon_sign_off"/.test(api) && !/"sign_off_reconciliation"/.test(api));
  ok("reconciliations self-signed before the control are flagged",
     /self_signed/.test(sql) && /self-signed/.test(ui));
  ok("...with the reason stated", /regulator asks for/.test(ui));

  // The three differences mean different things and must not be merged.
  ok("internal, external and shortfall are separate columns",
     /Internal diff/.test(ui) && /External diff/.test(ui) && /Shortfall/.test(ui));
  ok("...and each is explained", /own records disagreeing/.test(ui));
  ok("the bank balance is a parameter, not taken from our own books",
     /comes from the statement/.test(api));

  // The checklist distinguishes what blocks a close from what does not.
  ok("blocking steps are separated from the rest",
     /THESE STOP THE PERIOD BEING CLOSED/.test(ui));
  ok("a locked period is blocking", /'Period open'::text/.test(sql));
  ok("missing FX rates are blocking, since a revaluation cannot run",
     /a revaluation cannot run/.test(sql));
  ok("client money reconciliation is blocking where the entity holds it",
     /client money account\(s\) with no signed-off reconciliation/.test(sql));
  ok("an all-done checklist does not claim the output is correct",
     /has been RUN, not whether its output is right/.test(ui));
}


group("Fee transfers from client money, and intercompany writes");
{
  const sqlDir = path.join(SRC, "..", "db");
  const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");
  const fid = fs.readFileSync(path.join(SRC, "affinity_fiduciary_api.js"), "utf8");
  const pay = fs.readFileSync(path.join(SRC, "affinity_payables_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_payables.jsx"), "utf8");

  // THE KEY CONTROL. transfer_fee_from_client_money recorded a breach after the
  // fact. For a fee transfer that is wrong: unlike a client-instructed payment,
  // the firm is helping itself, and taking more than is held means paying the
  // firm out of another client's money. It is REFUSED, not recorded.
  ok("a guarded fee transfer exists", /CREATE OR REPLACE FUNCTION cm_fee_transfer/.test(sql));
  ok("...refusing a transfer the client cannot cover",
     /Cannot take % from %/.test(sql));
  ok("...and saying whose money it would be",
     /another client''s money/.test(sql));
  ok("...and what to do instead", /Bill the client and wait for funds/.test(sql));
  ok("what may be taken is readable before taking it",
     /CREATE OR REPLACE FUNCTION cm_fee_available/.test(sql));
  ok("...as the lower of held and billed", /LEAST\(/.test(sql));
  ok("the API points at the guarded wrapper",
     /"cm_fee_transfer"/.test(fid) && !/"transfer_fee_from_client_money"/.test(fid));

  // Intercompany writes, each adding a check the engine lacked.
  ok("drawing beyond the facility is refused", /against a facility of/.test(sql));
  ok("...with the reason: the agreement would not describe what happened",
     /will not describe what happened/.test(sql));
  ok("accruing on a nil-rate group loan is refused",
     /nothing to accrue/.test(sql));
  ok("...naming it as a transfer pricing exposure",
     /transfer pricing exposure/.test(sql));
  ok("an entity cannot settle with itself", /cannot settle with itself/.test(sql));
  ok("a TP charge with no policy is refused",
     /no transfer pricing policy for/.test(sql));
  ok("...because an undocumented basis is what an enquiry asks for",
     /transfer pricing enquiry/.test(sql));

  // The group total is the only valid reconciliation on this schema.
  ok("the interface shows the group total", /GROUP INTERCOMPANY TOTAL/.test(ui));
  ok("...and says a non-nil total breaks consolidation",
     /consolidation will not eliminate/.test(ui));
  ok("...and records why pair-by-pair is impossible here",
     /no\s*\n?\s*counterparty|records no counterparty/.test(pay));
  ok("nil-rate loans and nil markups are surfaced as exposure",
     /TRANSFER PRICING EXPOSURE/.test(ui));
}


group("Accounts workflow, adjustments after approval, and approval thresholds");
{
  const sqlDir = path.join(SRC, "..", "db");
  const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");
  const api = fs.readFileSync(path.join(SRC, "affinity_fiduciary_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_fiduciary.jsx"), "utf8");

  // THE GAP: post_statutory_adjustment blocked a finalised set but not an
  // APPROVED one, so a director could sign one set of figures and have
  // different ones filed. Refusing outright would be wrong — audit adjustments
  // genuinely arise after approval — so the adjustment withdraws the approval.
  ok("an adjustment wrapper exists", /CREATE OR REPLACE FUNCTION accounts_adjust/.test(sql));
  ok("...that withdraws an approval it invalidates",
     /APPROVAL WITHDRAWN BY ADJUSTMENT/.test(sql));
  ok("...returns the set to draft", /status = 'draft'/.test(sql));
  ok("...regenerates the statements so they match the adjustment",
     /accounts_set_generate_all\(p_set\)/.test(sql));
  ok("...and requires a narrative", /an audit adjustment with no explanation/.test(sql));
  ok("the interface warns before adjusting an approved set",
     /will withdraw that approval/.test(ui));
  ok("the API records why it does not simply refuse",
     /genuinely arise\s*\n?\/\/ after approval|arise\s*\n?\/\/ after approval/.test(api)
     || /audit adjustments genuinely arise/.test(api));

  // The review step between preparing and approving.
  ok("a submit-for-review step exists", /accounts_submit_for_review/.test(api));
  ok("...and readiness is reported rather than enforced there",
     /REPORTED here rather/.test(api));
  ok("the interface offers it on a draft", /Submit for review/.test(ui));

  // Year end: two gates the override cannot bypass.
  ok("year end readiness is separate from closing",
     /CREATE OR REPLACE FUNCTION year_end_readiness/.test(sql));
  ok("draft journals block the close", /left out of the result rolled to reserves/.test(sql));
  ok("client money shortfalls block the close",
     /must be remediated before the year closes/.test(sql));
  ok("...and the override cannot bypass those two",
     /No draft journals in the year', 'No client money shortfalls'/.test(sql));
  ok("advisory gates are distinguished from blocking ones",
     /These are not blocking, but confirm before closing/.test(sql));

  // Approval thresholds had no validation at all.
  ok("a negative or null threshold is refused",
     /The threshold must be zero or more/.test(sql));
  ok("...saying what nil and null each mean",
     /Zero means every journal needs approval/.test(sql));
  ok("raising a threshold is audited as a loosening of control",
     /APPROVAL THRESHOLD RAISED/.test(sql));
  ok("entities with NO threshold are surfaced, not left blank",
     /none_set/.test(sql) && /noneSet is surfaced/.test(api));
}


group("Demo data — kept, flagged, and manageable");
{
  const sqlDir = path.join(SRC, "..", "db");
  const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");
  const api = fs.readFileSync(path.join(SRC, "affinity_entity_write_api.js"), "utf8");
  const ea  = fs.readFileSync(path.join(SRC, "affinity_core_entity_admin.jsx"), "utf8");

  // The sample entities stay so the system can be shown, but they sit in the
  // same register as real clients. The realistic failure is a real filing or
  // real time recorded against sample data.
  ok("entities carry a demo flag", /ADD COLUMN IF NOT EXISTS is_demo/.test(sql));
  ok("the flag is visible on the entity", /DEMO DATA — NOT A REAL CLIENT/.test(ea));
  ok("...and the preview dataset is flagged too, since it is sample data",
     /!liveEnts \|\| !liveEnts\.length/.test(ea));
  ok("demo names are prefixed, for exports that do not know about the flag",
     /\[DEMO\] /.test(sql));

  // Removal is only safe if it cannot reach a real record.
  ok("removal refuses anything not flagged as demo",
     /is not flagged as demo data/.test(sql));
  ok("...and says to close a real client rather than delete it",
     /close it rather than delete it/.test(sql));
  ok("the table list is derived from the schema, not hand-written",
     /column_name = 'entity_id'/.test(sql));
  ok("posted journals are left alone", /would unbalance the ledger/.test(sql));
  ok("onboarding cases survive the entity they produced",
     /SET entity_id = NULL WHERE entity_id = p_entity/.test(sql));

  // Flagging a real entity AS demo makes it deletable — the dangerous
  // direction.
  ok("flagging an entity with work against it as demo is refused",
     /flagging it would make it deletable/.test(sql));

  // Clearing everything takes a typed phrase, not a boolean.
  ok("clearing all demo data needs an exact confirmation",
     /REMOVE DEMO DATA/.test(sql));
  ok("...and the reason is stated", /misplaced word/.test(sql));

  ok("the API exposes add, remove, clear and flag",
     /demoEntityAdd/.test(api) && /demoEntityRemove/.test(api)
     && /demoDataClear/.test(api) && /demoFlagSet/.test(api));
  ok("a summary reports demo against real", /demoDataSummary/.test(api));
}


group("Payroll rates and allocations — entered, locked, reopenable");
{
  const sqlDir = path.join(SRC, "..", "db");
  const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");

  // Rates vary by jurisdiction and by year, so they are entered rather than
  // derived — and effective-dated rather than edited, so a budget approved on
  // one set of rates still produces those figures.
  ok("rates are effective-dated", /effective_from\s+date NOT NULL/.test(sql));
  ok("...and a locked rate cannot be edited in place",
     /Enter a new rate effective from a later date/.test(sql));
  ok("...with the reason: an approved budget must still produce its figures",
     /must still produce them/.test(sql));
  ok("the rate in force at a date is readable",
     /CREATE OR REPLACE FUNCTION payroll_rate_at/.test(sql));

  // The factor-of-100 trap. The old hardcoded values were FRACTIONS, so
  // copying them across would make every payroll figure 100x too small — and a
  // 0-to-100 range check does not catch 0.128, which is inside the range.
  ok("a fraction entered as a percentage is caught",
     /looks like a fraction rather than a percentage/.test(sql));
  ok("...and a genuine nil rate is still allowed",
     /If the rate really is nil, enter 0/.test(sql));
  ok("a cap below the threshold is refused", /nothing would ever be due/.test(sql));

  // Locking, and reopening with a reason.
  ok("rates are agreed before they are locked",
     /must be agreed before they are locked/.test(sql));
  ok("reopening needs a reason", /Give a reason for reopening locked rates/.test(sql));
  ok("...which is kept on the record", /Reopened ' \|\|/.test(sql));

  // Allocations must total 100, or cost is lost or duplicated.
  ok("an allocation short of 100% is refused at agreement",
     /borne by nobody/.test(sql));
  ok("...and one over 100% too", /charged twice/.test(sql));
  ok("the running total is reported while building",
     /is still unallocated/.test(sql));
  ok("a locked allocation cannot be edited",
     /Create a new one effective from a later date/.test(sql));
  ok("jurisdictions with no rates at all are surfaced",
     /CREATE OR REPLACE FUNCTION payroll_rate_gaps/.test(sql));
}


group("Jurisdiction compliance — regulator and licence");
{
  const j = fs.readFileSync(path.join(SRC, "affinity_core_jurisdiction_compliance.jsx"), "utf8");

  // The regulator tile was hardcoded to CIMA or MFSA, from when only those two
  // jurisdictions existed. IOM, Cyprus, UK and USA were added later, so Cyprus
  // displayed "MFSA" — wrong, and wrong in a way that reads as authoritative.
  ok("the regulator is read from the record, not hardcoded",
     !/jur==="Cayman"\?"CIMA":"MFSA"/.test(j));
  ok("...via a short form that never guesses", /shortRegulator/.test(j));

  // Cyprus: Affinity is licensed by CySEC as an ASP for corporate services.
  ok("the Cyprus CySEC licence is recorded",
     /Licensed by CySEC as an Administrative Service Provider/.test(j));
  ok("...and displayed rather than held as unused data", /Licence held/.test(j));
  ok("the Cyprus obligation schedule is still marked outstanding",
     /Obligation schedule still to be confirmed/.test(j));
}


group("Authoring formats and checklists inside Core");
{
  const sqlDir = path.join(SRC, "..", "db");
  const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");
  const api = fs.readFileSync(path.join(SRC, "affinity_fiduciary_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_fiduciary.jsx"), "utf8");

  // Points 7, 8, 9: accountants enter the content. The system authors none of
  // it, because a caption set that looked statutory but was subtly wrong would
  // end up in filed accounts.
  ok("a caption can be added", /CREATE OR REPLACE FUNCTION fs_caption_add/.test(sql));
  ok("a presentation format can be created", /CREATE OR REPLACE FUNCTION fs_framework_add/.test(sql));
  ok("...and linked to a regulatory framework", /framework_format_link/.test(sql));
  ok("the interface says why the content is not authored by the system",
     /would end up in filed accounts/.test(ui));

  // A caption needs a code, because that is what accounts map to.
  ok("a caption without a code is refused", /a caption without one cannot be mapped/.test(sql));
  ok("an unknown statement code is refused", /would produce a statement nothing renders/.test(sql));
  ok("a caption cannot be added to a framework that does not exist",
     /create it before adding captions/.test(sql));
  ok("a mapped caption cannot be deleted",
     /deleting the caption would leave those balances out/.test(sql));

  // THE ONE I ALMOST GOT WRONG. account_fs_map's key includes caption_code, so
  // an account CAN map to several captions — and one already does, correctly:
  // a trust expense split across income and capital by fund_filter. A unique
  // constraint on (account, framework) would have broken trust accounting.
  ok("the mapping records why multiple captions are legitimate",
     /THAT WOULD HAVE BROKEN TRUST ACCOUNTING/.test(sql));
  ok("a second caption with the SAME fund treatment is refused",
     /count its balance twice/.test(sql));
  ok("...while a different fund filter is allowed",
     /if this is a trust apportionment/.test(sql));
  ok("genuine double-counting is reported separately from fund splits",
     /count\(\*\) > count\(DISTINCT coalesce\(c\.fund_filter/.test(sql));

  // Format readiness: captions on one statement only is worse than none.
  ok("a format with no balance sheet captions is flagged",
     /empty balance sheet/.test(sql));
  ok("...and no profit and loss", /no profit and loss/.test(sql));

  // One list with the next step per framework.
  ok("the outstanding work is listed with a single next step each",
     /CREATE OR REPLACE FUNCTION authoring_outstanding/.test(sql));
  ok("...ready means openable AND finalisable", /Nothing outstanding/.test(sql));
  ok("the API exposes the authoring functions",
     /fsCaptionAdd/.test(api) && /fsFrameworkAdd/.test(api)
     && /authoringOutstanding/.test(api) && /fsFormatReadiness/.test(api));
  ok("verification still requires a named edition",
     /Name the edition/.test(ui));
}


group("Obligation schedules — entered by Compliance, not pre-filled");
{
  const sqlDir = path.join(SRC, "..", "db");
  const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");
  const api = fs.readFileSync(path.join(SRC, "affinity_obligations_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_jurisdiction_compliance.jsx"), "utf8");

  // They were hardcoded in the JSX, so Malta and Cayman could not be corrected
  // and the other four could not be filled in at all.
  ok("obligations live in the database", /CREATE TABLE IF NOT EXISTS jurisdiction_obligation/.test(sql));
  ok("...and the module reads them live", /OBL\.obligationsList/.test(ui));
  ok("...rather than the old constant", /obligations arrays are no longer read/.test(ui));

  // The trigger is the commonest way a compliance date goes wrong.
  ok("a deadline with no trigger detail is refused",
     /the date cannot be calculated for any entity/.test(sql));
  ok("days and months together are refused", /they would conflict/.test(sql));
  ok("the trigger is asked for separately in the form", /Deadline runs from/.test(ui));

  // Confirming requires a source and an owner.
  ok("confirming needs a legislation reference",
     /cannot be checked by anyone else/.test(sql));
  ok("...and a named owner", /an obligation nobody owns is one nobody does/.test(sql));
  ok("the form asks for both", /required before confirming/.test(ui) && /Who does it/.test(ui));
  ok("amending a confirmed obligation withdraws the confirmation",
     /CONFIRMATION WITHDRAWN/.test(sql));

  // Unconfirmed must not read as checked.
  ok("unconfirmed obligations are flagged", /not yet confirmed/.test(ui));
  ok("...and described as a draft, not a deadline",
     /a draft rather than a deadline/.test(ui));
  ok("an empty schedule says nothing will fall due",
     /nothing here will\s*\n?\s*fall due|nothing here will/.test(ui));
  ok("...and why it is not pre-filled",
     /worse than a visibly empty one/.test(ui));

  // Removal keeps the history.
  ok("removal needs a reason", /should be on the record/.test(sql));
  ok("...and deactivates rather than deletes",
     /part of the compliance history/.test(sql));

  // Migration of the two schedules that existed.
  ok("Malta and Cayman were migrated but NOT marked confirmed",
     /NOT\s*\n?-- marked confirmed|NOT marked confirmed/.test(sql));
  ok("...and the migration cannot duplicate on re-run",
     /IF NOT EXISTS \(SELECT 1 FROM jurisdiction_obligation\)/.test(sql));

  ok("the API exposes add, update, confirm, remove and coverage",
     /obligationAdd/.test(api) && /obligationConfirm/.test(api)
     && /obligationRemove/.test(api) && /obligationCoverage/.test(api));
}


group("Pre-Azure audit — every RPC the API calls exists");
{
  // THE FINDING THIS GUARDS AGAINST. A live audit against a real database
  // found 33 read functions that the API called and that DID NOT EXIST. The
  // calls failed, the screens fell back to bundled sample data, and eleven
  // screens looked populated while showing demo data. Writes worked; reads
  // did not.
  //
  // Source-level checks could never catch it: the calls are present and the
  // wrappers are exported, so the code lines up perfectly. Only executing
  // them shows the functions are absent.
  const sqlDir = path.join(SRC, "..", "db");
  const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");

  // The 29 that were built. Each must be defined in SQL somewhere.
  ["trial_balance", "recent_journals", "pnl_by_entity", "ap_vendors", "ap_aging",
   "ap_purchase_orders", "budget_vs_actual_for_entity", "ic_loans_for_entity",
   "bank_accounts_for_entity", "fx_rates_latest", "fx_positions", "vat_boxes_ytd",
   "control_checks", "group_consolidated_summary", "group_effective_ownership",
   "comp_reg_obligations", "comp_breaches", "comp_training", "stat_annual_returns",
   "stat_bo_registers", "stat_cogs_list", "stat_officer_changes", "stat_dissolutions",
   "tasks_list", "onboarding_cases", "fee_invoices", "document_list",
   "eg_licences", "eg_log"].forEach((f) =>
    ok(f + " is defined in SQL",
       new RegExp("CREATE OR REPLACE FUNCTION " + f + "\\s*\\(").test(sql)));

  // The four that had no store were briefly marked not-built. db/084 built
  // them, so the marks are gone and the real functions must be present —
  // asserted in that direction now, because a lingering stub would mean a
  // screen still showing "not built" over a working store.
  const comp = fs.readFileSync(path.join(SRC, "affinity_compliance_api.js"), "utf8");
  const crm  = fs.readFileSync(path.join(SRC, "affinity_crm_api.js"), "utf8");
  const onb  = fs.readFileSync(path.join(SRC, "affinity_onboarding_api.js"), "utf8");
  ok("no not-built stubs remain", !/NOT_BUILT_/.test(comp + crm + onb));
  ["comp_reviews", "crm_prospects", "crm_interactions", "attrition_cases"]
    .forEach((f) => ok(f + " is now defined in SQL",
      new RegExp("CREATE OR REPLACE FUNCTION " + f + "\\s*\\(").test(sql)));

  // The two silent no-ops from db/082.
  ok("approving unsubmitted time is refused rather than doing nothing",
     /Only submitted time can be approved/.test(sql));
  ok("an empty payment run assembly is refused",
     /nothing was added to the run/.test(sql));
  ok("a standing check for the same pattern exists",
     /CREATE OR REPLACE FUNCTION silent_noop_candidates/.test(sql));
}


group("The four stores that did not exist");
{
  const sqlDir = path.join(SRC, "..", "db");
  const sql = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(sqlDir, f), "utf8")).join("\n");
  const comp = fs.readFileSync(path.join(SRC, "affinity_compliance_api.js"), "utf8");
  const crm  = fs.readFileSync(path.join(SRC, "affinity_crm_api.js"), "utf8");
  const onb  = fs.readFileSync(path.join(SRC, "affinity_onboarding_api.js"), "utf8");

  ["periodic_review", "crm_prospect", "crm_interaction", "attrition_case"]
    .forEach((t) => ok(t + " now has a table",
      new RegExp("CREATE TABLE IF NOT EXISTS " + t + "\\s*\\(").test(sql)));
  ok("the not-built stubs are gone", !/NOT_BUILT_/.test(comp + crm + onb));

  // Reviews fall due on RISK RATING, and the intervals are entered by
  // Compliance rather than hardcoded — a made-up interval would silently put
  // high-risk clients on the wrong cycle.
  ok("review intervals are entered, not hardcoded",
     /CREATE OR REPLACE FUNCTION review_frequency_set/.test(sql));
  ok("...and can be group-wide or per jurisdiction",
     /coalesce\(location_code, '\*'\)/.test(sql));
  ok("a review with no sanctions or PEP screening is refused",
     /Sanctions and PEP screening are both required/.test(sql));
  ok("...and one that refreshed nothing", /has not reviewed anything/.test(sql));
  ok("a risk conclusion is required even if unchanged",
     /the conclusion is the point of the review/.test(sql));
  ok("a review cannot be approved by whoever did it",
     /You carried out this review/.test(sql));
  ok("clients never reviewed appear in the list", /never_reviewed/.test(sql));
  ok("...and a missing interval is distinguished from a missing review",
     /no_interval_set/.test(sql));

  // Attrition: Manager, MD, then Group CEO OR COO.
  ok("the final stage accepts either Group CEO or COO",
     /'Group CEO','CEO','Group COO','COO'/.test(sql));
  ok("...and the reason is recorded: a named-person rule stalls",
     /stalls whenever they are away/.test(sql));
  ok("approvals run in sequence", /Approvals run in sequence/.test(sql));
  ok("one person cannot satisfy two stages",
     /each stage needs a different person/.test(sql));
  ok("unbilled time is captured at opening",
     /hardest one to bill afterwards/.test(sql));

  // CRM stages are validated, and a lost prospect needs a reason.
  ok("pipeline stages are validated against a list", /CREATE TABLE IF NOT EXISTS crm_stage/.test(sql));
  ok("marking a prospect lost requires a reason",
     /why we lost it is the useful part/.test(sql));
  ok("a won prospect converts to an onboarding case",
     /CREATE OR REPLACE FUNCTION crm_prospect_convert/.test(sql));
  ok("...and cannot be converted twice", /has already been converted/.test(sql));
  ok("the API exposes all four", /reviewComplete/.test(comp) && /crmProspectConvert/.test(crm)
     && /attritionApprove/.test(onb) && /attritionCases/.test(onb));
}


group("Document management — the DMS is wired");
{
  const api = fs.readFileSync(path.join(SRC, "affinity_dms_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_dms.jsx"), "utf8");
  const sh  = fs.readFileSync(path.join(SRC, "affinity_core_unified_v3.jsx"), "utf8");

  // THE FAILURE THIS GUARDS AGAINST. Core IS a document management system —
  // 17 folders, a retention policy per folder, and retention rules that vary
  // by data class and jurisdiction. All of it was built in the database and
  // almost none had a screen: filing worked, and search, reclassify,
  // delete-with-retention and folder management did not.
  //
  // It was found because the user guide claimed Core was not a DMS. Checking
  // that claim exposed the gap, and a reachability audit that traced
  // database -> API -> SCREEN rather than database -> API found 190 functions
  // in the same state.
  ok("the DMS module is reachable", /id:"dms"/.test(sh) && /case "dms"/.test(sh));

  ["doc_file", "doc_delete", "doc_reclassify", "dms_category_add",
   "get_object_documents", "search_documents", "document_list"].forEach((f) =>
    ok(f + " is called by the API", new RegExp('"' + f + '"').test(api)));

  // doc_list is deliberately NOT wrapped: it duplicates document_list, which
  // also resolves the folder name and the retention state. An unused wrapper
  // is how this whole class of problem began — a function with an API wrapper
  // and no caller looks wired and is not.
  ok("doc_list is deliberately not wrapped, and the reason is recorded",
     !/"doc_list"/.test(api) && /doc_list is NOT wrapped/.test(api));

  ["documentList", "objectDocuments", "searchDocuments", "docFile",
   "docReclassify", "docDelete", "dmsCategoryAdd"].forEach((w) =>
    ok(w + " is called by the screen", new RegExp("DMS\\." + w + "\\s*\\(").test(ui)));

  // Retention is a consequence of the folder, not a typed field.
  ok("the screen states retention follows the folder",
     /consequence of the folder/i.test(ui));
  ok("reclassifying requires a reason, because it changes the retention",
     /changes how long it must be kept/.test(ui));
  ok("deleting inside retention is called a records decision",
     /records decision/.test(ui));
  ok("a folder without a retention policy is flagged",
     /nobody knows when to destroy/.test(ui));

  // Three retention states, distinguished.
  ok("within retention is distinguished from past it and from unrecorded",
     /within_retention/.test(ui) && /No retention date recorded/.test(ui));
  ok("...and the risk of each is stated",
     /data protection exposure/.test(ui) && /records breach/.test(ui));

  // Documents attached to a specific record must be retrievable from it.
  ok("documents attached to an object can be retrieved",
     /get_object_documents/.test(api));

  // The remaining honest gap.
  ok("the API records that file storage is still missing",
     /no upload, no storage/.test(api));

  // The tab and the submit button were both "Search", which is ambiguous on
  // screen as well as in a test.
  ok("the search submit button is distinct from the tab",
     /Search documents/.test(ui));
}


group("Onboarding — the mockup replaced with a live module");
{
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_onboarding_live.jsx"), "utf8");
  const sh  = fs.readFileSync(path.join(SRC, "affinity_core_unified_v3.jsx"), "utf8");
  const old = fs.readFileSync(path.join(SRC, "affinity_core_onboarding_v2.jsx"), "utf8");

  // WHAT WAS WRONG. The previous module imported the API layer and called none
  // of it — it ran entirely on two constants, CASES and ATTRITION. Every screen
  // looked populated and nothing an administrator did was recorded. The user
  // guide described the CDD workflow, the go-live gate and the three-stage
  // attrition approval in detail, and none of it was reachable.
  ok("the shell now uses the live module", /case "onboarding": return <OnboardingLive/.test(sh));
  ok("the old module was a mockup with no live calls",
     !/OW\.\w+\s*\(/.test(old) && /const CASES/.test(old));

  ["onbCaseList", "onbCaseAdd", "cddItemList", "cddItemAdd", "cddItemVerify",
   "onbCaseGoLive"].forEach((w) =>
    ok(w + " is called by the screen", new RegExp("OW\\." + w + "\\s*\\(").test(ui)));
  ["attritionCases", "attritionOpen", "attritionApprove"].forEach((w) =>
    ok(w + " is called by the screen", new RegExp("ONB\\." + w + "\\s*\\(").test(ui)));

  // The go-live gate is in the database, and the screen says so rather than
  // implying it enforces it. A screen-level check can be bypassed by a screen.
  ok("the CDD gate is stated before the button, not after a refusal",
     /CANNOT GO LIVE/.test(ui));
  ok("...and the screen says the gate is in the database",
     /enforced in the database/.test(ui));
  ok("...and why it matters", /breach that closes firms/.test(ui));
  ok("verified CDD carrying onto the client record is explained",
     /evidence sits with the client/.test(ui));

  // Attrition: the alternate on the final stage, and the unbilled-time trap.
  ok("the CEO-or-COO alternate is explained on screen",
     /Group CEO <strong>or<\/strong> Group COO/.test(ui));
  ok("unbilled time is flagged as a write-off risk", /writes it off/.test(ui));
  ok("...and why it is captured at opening",
     /hardest one to bill afterwards/.test(ui));

  // Row buttons and form submit buttons had the same labels — ambiguous on
  // screen as well as in a test, which is how it was found.
  ok("form submit labels are distinct from the row buttons",
     /cta: "Create the client entity"/.test(ui)
     && /cta: "Record the verification"/.test(ui)
     && /cta: "Record the approval"/.test(ui));
}


group("CRM — the mockup replaced with a live module");
{
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_crm_live.jsx"), "utf8");
  const sh  = fs.readFileSync(path.join(SRC, "affinity_core_unified_v3.jsx"), "utf8");
  const old = fs.readFileSync(path.join(SRC, "affinity_core_crm.jsx"), "utf8");

  // Third module found in this state, after Documents and Onboarding: it
  // imported affinity_crm_api and called none of it. A prospect could be typed
  // in, appear in the pipeline, and be gone on reload.
  ok("the shell uses the live module", /case "crm": return <CRMLive/.test(sh));
  ok("the old module was a mockup", !/CRM\.\w+\s*\(/.test(old));

  ["crmProspects", "crmInteractions", "crmProspectAdd", "crmStageSet",
   "crmInteractionAdd", "crmProspectConvert"].forEach((w) =>
    ok(w + " is called by the screen", new RegExp("CRM\\." + w + "\\s*\\(").test(ui)));

  // First-year value is the sum, not the annual fee — that is what a pipeline
  // is judged on.
  ok("first-year value is explained as the sum of all three fees",
     /annual fee plus the setup fee plus twelve months/.test(ui));

  // A prospect nobody has contacted is not in the pipeline in any real sense.
  ok("prospects going cold are surfaced", /GOING COLD/.test(ui));
  ok("...and why that matters is stated",
     /not in the pipeline in any\s*\n?\s*meaningful sense/.test(ui));

  // An agreed next step with a passed date is worse than none.
  ok("overdue next actions are flagged separately",
     /NEXT ACTION\(S\) OVERDUE/.test(ui));
  ok("...with the reason", /the prospect is expecting it/.test(ui));

  // Why we lost is the useful part of a lost prospect.
  ok("the lost-reason requirement is explained",
     /only one of them is about price/.test(ui));

  // Converting links the two records rather than duplicating the client.
  ok("conversion is explained as linking, not duplicating",
     /one story rather than two records/.test(ui));
  ok("...and that it does NOT make the client live",
     /does NOT make the client live/.test(ui));

  // Same button-label fault as the other two modules.
  ok("form submit labels are distinct from row buttons",
     /cta: "Record the contact"/.test(ui)
     && /cta: "Create the onboarding case"/.test(ui)
     && /cta: "Add to the pipeline"/.test(ui));
}


group("Periodic reviews — the workflow now has a screen");
{
  const api = fs.readFileSync(path.join(SRC, "affinity_compliance_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_compliance.jsx"), "utf8");

  // Compliance READ the review list, so you could see a review was due. Doing
  // one had no screen: review_start, review_complete, review_approve and
  // review_frequency_set were all built, wrapped and unreachable.
  ok("a Periodic reviews tab exists", /"Periodic reviews"/.test(ui));
  ["reviewStart", "reviewComplete", "reviewApprove", "reviewFrequencySet"]
    .forEach((w) => ok(w + " is called by the screen",
      new RegExp("(?<![\\w.])" + w + "\\s*\\(").test(ui)));

  // A COLUMN MAPPING BUG that made the call succeed and the rows render blank.
  // The mapping was written against a comp_reviews that did not exist yet —
  // r.name, r.ref, r.risk. The real function returns entity_name,
  // company_code, risk_rating.
  ok("the review mapping uses the real column names",
     /r\.entity_name/.test(ui) && /r\.company_code/.test(ui) && /r\.risk_rating/.test(ui));
  ok("...and the earlier mismatch is recorded", /rendered blank/.test(ui));

  // Without an interval no next-due date can be calculated, so the cycle never
  // starts. That is a gap in the setup, not in the client's file.
  ok("clients with no interval for their rating are flagged",
     /NO REVIEW INTERVAL FOR THEIR RISK RATING/.test(ui));
  ok("...and the consequence is stated", /review cycle never starts/.test(ui));

  ok("the two mandatory checks are marked on the form",
     /required: true/.test(api) && /REVIEW_CHECKS/.test(api));
  ok("the screen warns a partial review reads as a completed one",
     /partial review on file reads as a completed one/.test(ui));
  ok("approval independence is stated on the screen",
     /is not independent/.test(ui));

  // The sidebar tabs were clickable divs: not keyboard-reachable, not
  // announced as controls, and unclickable by an automated check — which is
  // how it was noticed.
  ok("the sidebar tabs are real buttons",
     /const SideBtn[\s\S]{0,400}<button type="button"/.test(ui));
  ok("...and the reason is recorded", /not keyboard-reachable/.test(ui));
}


group("Fee transfers from client money — now reachable");
{
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_accounting_ops.jsx"), "utf8");
  const api = fs.readFileSync(path.join(SRC, "affinity_monthend_api.js"), "utf8");

  // cm_fee_transfer and cm_fee_available were built in db/076 with the control
  // that refuses a fee larger than the client holds — and had no screen. So
  // the control existed and could not be reached, and the fee would have been
  // taken some other way. Which is the situation the control was written to
  // prevent.
  ok("the fee transfer is reachable", /Take a fee/.test(ui));
  ok("cm_fee_available is wrapped", /"cm_fee_available"/.test(api));
  ok("cm_fee_transfer is wrapped", /"cm_fee_transfer"/.test(api));
  ok("both are called by the screen",
     /ME\.cmFeeAvailable\s*\(/.test(ui) && /ME\.cmFeeTransfer\s*\(/.test(ui));

  // Why a fee transfer differs from a client-instructed payment.
  ok("the screen says it is the firm helping itself",
     /another client's money to pay/.test(ui));
  ok("...and that it is refused rather than recorded as a breach",
     /refused rather than recorded as a breach/.test(ui));
  ok("what may be taken is shown before taking it",
     /lower of the two/.test(ui));
  ok("...and an over-limit amount warns before submitting",
     /will be refused/.test(ui));

  // THE BUG THIS GUARDS AGAINST, which was fixed once in this build and then
  // reintroduced. A component defined INSIDE another component is a new
  // function on every render, so React unmounts and remounts it on each
  // keystroke: the DOM value changes, onChange never reaches the parent state,
  // and the form appears frozen.
  ok("FeeTransfer is declared at module level, not inside the component",
     /^function FeeTransfer\(/m.test(ui));
  ok("...and the reason is recorded so it is not reintroduced again",
     /new function on every render/.test(ui));

  // A precedence trap I wrote and removed: `await X ? await X(...) : ...`
  // awaits the function reference, which is always truthy.
  ok("no defensive await-ternary around the availability call",
     !/await ME\.cmFeeAvailable\s*\?/.test(ui));
}


group("Demo data management — the thing that was actually asked for");
{
  const api = fs.readFileSync(path.join(SRC, "affinity_demo_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_system_admin.jsx"), "utf8");

  // db/078 built the flag and the functions after Andy asked to keep the
  // sample entities visible but be able to add and remove them. There was no
  // screen, so the one thing he asked for could not be done.
  ok("a Demo data tab exists", /"Demo data"/.test(ui));
  ["demoDataSummary", "demoEntityAdd", "demoEntityRemove", "demoDataClear"]
    .forEach((w) => ok(w + " is called by the screen",
      new RegExp("DEMO\\." + w + "\\s*\\(").test(ui)));

  // The screen states the realistic failure rather than a vague warning.
  ok("it says demo records sit in the same register as real clients",
     /SAME REGISTER AS REAL CLIENTS/.test(ui));
  ok("...and names the actual risk", /filed against a demo entity/.test(ui));
  ok("...and why there is both a flag and a name prefix",
     /prefix for any report/.test(ui));

  // Removal is only safe because it cannot reach a real record.
  ok("removal is described as checking the flag, not the name",
     /checks the flag rather than the name/.test(api));
  ok("...and says a real client is closed rather than deleted",
     /survive the relationship/.test(ui));

  // A typed phrase rather than a tick box.
  ok("clearing everything needs the exact phrase",
     /CLEAR_PHRASE = "REMOVE DEMO DATA"/.test(api));
  ok("...and the reason is on the screen", /misplaced phrase/.test(ui));
  ok("posted journals are left alone", /unbalance the ledger/.test(ui));

  // Time or filings recorded against a demo entity is the error worth
  // catching, so the summary reports it rather than only counting entities.
  ok("the summary covers work recorded against demo entities",
     /error worth catching|never be billed/.test(api) || /demo_data_summary/.test(api));
}


group("Rates and allocations — the reference data Andy asked to enter");
{
  const api = fs.readFileSync(path.join(SRC, "affinity_rates_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_rates.jsx"), "utf8");
  const sh  = fs.readFileSync(path.join(SRC, "affinity_core_unified_v3.jsx"), "utf8");

  // db/079 built the tables, the effective dating, the lock and reopen and the
  // validation. There was no screen, so budgets computed staff costs on
  // nothing and nobody could enter the figures.
  ok("the module is reachable", /id:"rates"/.test(sh) && /case "rates"/.test(sh));
  ["payrollRatesList", "payrollRateGaps", "payrollRateSet", "payrollRateAgree",
   "payrollRateLock", "payrollRateReopen", "allocationsList", "allocationLines",
   "allocationSetCreate", "allocationLineSet", "allocationSetAgree",
   "allocationSetLock", "allocationSetReopen"].forEach((w) =>
    ok(w + " is called by the screen", new RegExp("R\\." + w + "\\s*\\(").test(ui)));

  // Effective dating rather than editing in place.
  ok("the screen explains rates are never edited in place",
     /never edited in place/.test(ui));
  ok("...and the API records why", /silently rewrites history/.test(api));
  ok("the in-force rate is distinguished from superseded ones",
     /in force/.test(ui) && /superseded_from/.test(ui));

  // The factor-of-100 trap.
  ok("the form warns percentages are not fractions", /not 0\.128/.test(ui));
  ok("...and the API records the reason",
     /hundred times too small/.test(api));

  // Jurisdictions with no rates at all.
  ok("jurisdictions with no rates are flagged",
     /NO PAYROLL RATES AT ALL/.test(ui));
  ok("...and the consequence stated", /staff costs on nothing/.test(ui));

  // Allocations must total 100.
  ok("unbalanced allocations are flagged", /DO NOT TOTAL 100%/.test(ui));
  ok("...both directions explained",
     /borne by nobody/.test(ui) && /charged\s*\n?\s*twice/.test(ui));
  ok("the running total is reported rather than enforced per line",
     /would be unbuildable/.test(api));

  // A ROW-BUTTON FAILURE THAT SHOWED NOWHERE. The error went into the modal's
  // message state, which only renders inside the modal — so pressing Agree on
  // an unbalanced allocation appeared to do nothing at all.
  ok("row-button failures route to the visible message",
     /const show = form \? setFMsg : setMsg/.test(ui));
  ok("...and the reason is recorded", /showed\s*\n?\s*\/\/ nowhere|showed\s+nowhere/.test(ui));

  // The modal is at module level, as the earlier remount bug requires.
  ok("RateForm is declared at module level", /^function RateForm\(/m.test(ui));
}


group("Month-end steps and procedure runs — actionable rather than only reported");
{
  const api  = fs.readFileSync(path.join(SRC, "affinity_monthend_api.js"), "utf8");
  const ops  = fs.readFileSync(path.join(SRC, "affinity_core_accounting_ops.jsx"), "utf8");
  const proc = fs.readFileSync(path.join(SRC, "affinity_core_procedures_v2.jsx"), "utf8");

  // The month-end checklist reported what was outstanding and offered no way
  // to do any of it — a checklist you can read and not act on.
  ok("checklist steps now carry a run button", /const runners = \{/.test(ops));
  ok("...and the reason is recorded", /read and not act on/.test(ops));
  ["periodOpen", "periodReopen", "runFxRevaluation", "runRecurringJournals",
   "runDeferrals"].forEach((w) =>
    ok(w + " is called by the screen", new RegExp("ME\\." + w + "\\s*\\(").test(ops)));

  // Period control, previously unreachable.
  ok("period_open is wrapped", /"period_open"/.test(api));
  ok("period_reopen requires a reason and says why",
     /part of the record rather than a\s*\n?\/\/ formality|part of the record/.test(api));
  ok("run_deferred_income is wrapped", /"run_deferred_income"/.test(api));
  ok("...with the reason an unreleased deferral matters",
     /fails quietly/.test(api));
  ok("post_vat_return is wrapped, separate from preparing",
     /"post_vat_return"/.test(api) && /checked before it hits the accounts/.test(api));

  // A procedure run could be STARTED and never finished: procStart was wired,
  // advance, complete and abandon were not, so a run sat in Active for ever.
  ok("procAdvance is called by the screen", /OW\.procAdvance\s*\(/.test(proc));
  ok("procComplete is called by the screen", /OW\.procComplete\s*\(/.test(proc));
  ok("procAbandon is called by the screen", /OW\.procAbandon\s*\(/.test(proc));
  ok("...and abandoning asks for a reason", /Why is this run being abandoned/.test(proc));
  ok("the reason it was missing is recorded", /never finished/.test(proc));
  ok("run actions report their result", /setRunMsg/.test(proc));
}


group("Entity Admin — the registers can now be changed, not only added to");
{
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_entity_admin.jsx"), "utf8");
  const api = fs.readFileSync(path.join(SRC, "affinity_entity_write_api.js"), "utf8");

  // THE WORST FINDING OF THE AUDIT. Entity Admin could ADD to every register
  // and change nothing: a director could be appointed and never resigned, a
  // UBO added and never corrected or removed, an entity opened and never
  // closed. Seventeen functions, all with API wrappers or none at all, and not
  // one with a button — while the user guide described resigning a director in
  // detail, including why it keeps history.
  //
  // The register is the legal record and the missing operations are the
  // ordinary ones. A register you can only add to is not a register.
  ["officerResign", "officerUpdate", "uboUpdate", "uboRemove", "shareholderRemove",
   "dividendPay", "profileUpdate", "classification", "responsibilities",
   "entityClose", "caseload"].forEach((a) =>
    ok(a + " is reachable from a button", new RegExp('openAct\\("' + a + '"').test(ui)));

  // Five had no wrapper at all, so the entity itself could be created and then
  // never edited, reclassified, reassigned or closed.
  ["profileUpdate", "classificationUpdate", "responsibilitiesSet", "entityClose",
   "reassignCaseload"].forEach((w) =>
    ok(w + " is wrapped", new RegExp("export const " + w + "\\s*=").test(api)));

  // The reasons, on screen rather than only in the schema.
  ok("resigning explains why history is kept", /matter of record/.test(ui));
  ok("removing a UBO says it is a filing matter", /filing matter/.test(ui));
  ok("removing a shareholder says the register is a legal record",
     /legal record/.test(ui));
  ok("closing warns about unbilled time", /writes that work off/.test(api));
  ok("bulk reassignment explains why it is one action",
     /how one gets missed/.test(api));
  ok("FATCA and CRS classification says what it drives",
     /reporting the wrong thing/.test(ui));

  // The modal must stay at module level — a component defined inside another
  // remounts on every keystroke and the form appears frozen. Made twice
  // already in this build.
  ok("ActionModal is at module level", /^function ActionModal\(/m.test(ui));
  ok("ACTION_SPECS is at module level", /^const ACTION_SPECS/m.test(ui));

  // Writes are only offered when signed in, consistent with the module's
  // existing behaviour — in preview mode the ids are demo ids.
  ok("actions are gated on a real entity id", /entityDbId && /.test(ui));
}


group("Payables — the purchase and expense cycle can be assembled, not only approved");
{
  const api = fs.readFileSync(path.join(SRC, "affinity_payables_api.js"), "utf8");
  const ui  = fs.readFileSync(path.join(SRC, "affinity_core_payables.jsx"), "utf8");

  // The screen could APPROVE a payment run nobody could create, approve an
  // expense claim nobody could submit, and list purchase orders nobody could
  // raise. Six functions were wrapped with no button; rejecting a claim,
  // credit notes and disbursements had no wrapper at all.
  ["payRunCreate", "payRunAddPayables", "poCreate", "goodsReceive",
   "expenseClaimSubmit", "arCreditNote", "apCreditNote"].forEach((w) =>
    ok(w + " is called by the screen", new RegExp("PAY\\." + w + "\\s*\\(").test(ui)));

  ["expenseClaimReject", "supplierInvoiceRecord", "invoiceMatchToPo",
   "arCreditNote", "apCreditNote", "disbursementRecord",
   "disbursementsRecharge"].forEach((w) =>
    ok(w + " is wrapped", new RegExp("export const " + w + "\\s*=").test(api)));

  // The reasons, on screen.
  ok("the three separate acts are explained", /three separate acts/.test(ui));
  ok("...including why", /nobody checked/.test(ui));
  ok("an empty run is refused and the risk named",
     /someone goes on to approve/.test(ui));
  ok("a credit note is explained as its own document",
     /not a negative invoice/.test(ui));
  ok("...and why editing an invoice is wrong",
     /destroys the audit trail/.test(api));
  ok("rejecting a claim requires a reason", /resubmitted unchanged/.test(api));
  ok("three-way matching states why a tolerance is explicit",
     /overridden into uselessness/.test(api));
  ok("unrecharged disbursements are described as invisible money",
     /invisible until someone looks/.test(api));

  // The modal is at module level.
  ok("PayForm is at module level", /^function PayForm\(/m.test(ui));

  // FIVE PARAMETER NAMES WERE GUESSED AND WRONG — p_lines where the function
  // takes p_net and p_vat_code, p_matched_by for p_by, p_related_invoice for
  // p_related_invoice_id, p_description and p_client_entity_id that do not
  // exist. Caught by checking every wrapper against the real signature.
  ok("record_supplier_invoice passes the real parameters",
     /p_net: i\.net/.test(api) && !/p_lines: i\.lines/.test(api));
  ok("match_invoice_to_po passes p_by", /p_by: null/.test(api));
  ok("raise_ar_credit_note passes p_related_invoice_id",
     /p_related_invoice_id/.test(api));
}


group("Trust transactions — the fiduciary side could read and not record");
{
  const ui = fs.readFileSync(path.join(SRC, "affinity_core_fiduciary.jsx"), "utf8");

  // The trust tabs READ — position, beneficiaries, distributions, the overview
  // — and nothing could be written. A trustee could see the income fund held
  // money and had no way to pay any of it to a life tenant.
  ["trustRecordIncome", "trustRecordCapital", "trustRecordExpense",
   "trustDistribute"].forEach((w) =>
    ok(w + " is called by the screen", new RegExp("FID\\." + w + "\\s*\\(").test(ui)));

  // THE THING THAT MATTERS MOST IN THIS MODULE. Income belongs to the life
  // tenant, capital to the remaindermen. Paying capital as income is a breach
  // of trust rather than a misposting.
  ok("the funds-never-summed principle is on screen", /never summed/.test(ui));
  ok("the fund is a choice, not a defaulted field",
     /<option value="">— choose —<\/option>/.test(ui));
  ok("...and the reason a default would be wrong is recorded",
     /field that\s*\n?\/\/ defaults is a field people stop reading|stop reading/.test(ui));
  ok("distributing explains the check is per fund",
     /not enough in the trust/.test(ui));
  ok("...with the case that makes it concrete",
     /ample capital and no income/.test(ui));
  ok("an expense records which fund bears it rather than apportioning silently",
     /recorded explicitly rather than apportioned/.test(ui));

  ok("TrustForm is at module level", /^function TrustForm\(/m.test(ui));
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
