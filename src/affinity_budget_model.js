// src/affinity_budget_model.js
// ─────────────────────────────────────────────────────────────────────────────
// AFFINITY — BUDGET MODEL
//
// The calculation layer behind budgeting. Pure functions, no React, so it can
// be tested directly (tests/run.cjs) and reused by the grid, the fee review
// page and the balance sheet projection.
//
// It implements the model in Neil's Budget_Summary workbook, whose central
// idea is that a fee is phased TWO different ways:
//
//   invoiced basis — when the client is billed. An annual fee lands whole in
//                    one month; a quarterly fee lands in four.
//   earned basis   — when the work is recognised. The same annual fee spreads
//                    across the year by days in month.
//
// The gap between the two IS deferred income, which is what lets a balance
// sheet and a cash flow fall out of the P&L rather than being budgeted
// separately. Receivables follow the invoiced line and a collection period;
// payables follow their own terms. Retained earnings must always equal
// cumulative profit — that invariant is asserted in the tests.
// ─────────────────────────────────────────────────────────────────────────────

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Calendar ────────────────────────────────────────────────────────────────
export function daysInMonth(year) {
  return MONTHS.map((_, i) => new Date(year, i + 1, 0).getDate());
}
export const daysInYear = (year) => daysInMonth(year).reduce((a, b) => a + b, 0);

// ── Frequencies ─────────────────────────────────────────────────────────────
// M monthly, Q quarterly, A annual, O one-off in a stated month
export const FREQUENCIES = [
  { code:"M", label:"Monthly",   per:12 },
  { code:"Q", label:"Quarterly", per:4 },
  { code:"A", label:"Annual",    per:1 },
  { code:"O", label:"One-off",   per:1 },
];

// Which months a fee is invoiced in, given its frequency and start month.
export function invoiceMonths(frequency, startMonth = 0) {
  const s = ((startMonth % 12) + 12) % 12;
  switch (frequency) {
    case "M": return MONTHS.map((_, i) => i);
    case "Q": return [0, 3, 6, 9].map((q) => (s + q) % 12);
    case "A": return [s];
    case "O": return [s];
    default:  return [s];
  }
}

// ── Phasing methods ─────────────────────────────────────────────────────────
// Neil's request: "specific, months, or days in month — then the costs can be
// automatically calculated by just entering the method."
export const PHASING = [
  { code:"even",     label:"Evenly across the period",  hint:"Amount ÷ number of months" },
  { code:"days",     label:"By days in month",          hint:"Amount × days in month ÷ days in period" },
  { code:"specific", label:"Specific month(s)",         hint:"Falls entirely in the month(s) chosen" },
  { code:"manual",   label:"Entered by hand",           hint:"Typed into the grid, no automatic spread" },
];

// Spread an amount over a set of month indices using the chosen method.
export function spread(amount, monthIdxs, method, year) {
  const out = new Array(12).fill(0);
  if (!monthIdxs || !monthIdxs.length || !amount) return out;
  const dim = daysInMonth(year);

  if (method === "days") {
    const total = monthIdxs.reduce((s, i) => s + dim[i], 0);
    monthIdxs.forEach((i) => { out[i] = amount * dim[i] / total; });
  } else if (method === "specific") {
    monthIdxs.forEach((i) => { out[i] = amount; });     // full amount each stated month
  } else {                                              // even
    monthIdxs.forEach((i) => { out[i] = amount / monthIdxs.length; });
  }
  // "specific" repeats the full amount per stated month, so it has no single
  // total to tie back to; everything else must sum to the amount exactly.
  return method === "specific" ? out.map(r2) : roundToTotal(out, amount);
}

// ── A fee line, phased both ways ────────────────────────────────────────────
// fee: { amount, frequency, markup, startMonth, phasing, startsMonth, endsMonth }
// startsMonth / endsMonth handle new business part way through the year and
// lost business stopping — Neil's "increases / lost business" case.
export function phaseFee(fee, year = 2026) {
  const uplift = fee.markup ? 1 + (fee.markupPct != null ? fee.markupPct : 0.05) : 1;
  const gross  = Number(fee.amount || 0) * uplift;
  const start  = fee.startMonth != null ? fee.startMonth : 0;
  const dim    = daysInMonth(year);

  // INVOICED — cash-billing pattern
  const invMonths = invoiceMonths(fee.frequency, start);
  const invoiced  = new Array(12).fill(0);
  invMonths.forEach((i) => { invoiced[i] += gross; });

  // EARNED — recognition pattern
  let earned = new Array(12).fill(0);
  if (fee.frequency === "M") {
    MONTHS.forEach((_, i) => { earned[i] = gross; });
  } else if (fee.frequency === "A") {
    const total = daysInYear(year);
    MONTHS.forEach((_, i) => { earned[i] = gross * dim[i] / total; });
  } else if (fee.frequency === "Q") {
    // each quarterly invoice is earned across its own quarter, by days
    invMonths.forEach((qStart) => {
      const idxs = [0, 1, 2].map((k) => (qStart + k) % 12);
      const total = idxs.reduce((s, i) => s + dim[i], 0);
      idxs.forEach((i) => { earned[i] += gross * dim[i] / total; });
    });
  } else {                                   // one-off: earned when invoiced
    invMonths.forEach((i) => { earned[i] += gross; });
  }

  // Apply live-from / live-until so part-year clients are handled
  const from = fee.startsMonth != null ? fee.startsMonth : 0;
  const to   = fee.endsMonth   != null ? fee.endsMonth   : 11;
  const mask = (arr) => arr.map((v, i) => (i >= from && i <= to ? v : 0));

  const inv = mask(invoiced).map(r2);
  const ern = mask(earned);
  const invTotal = r2(inv.reduce((a, b) => a + b, 0));
  return { invoiced: inv, earned: roundToTotal(ern, invTotal), gross };
}

const r2 = (n) => Math.round(n * 100) / 100;

// Round a spread to 2dp so the parts still tie exactly to the whole. Rounding
// twelve monthly figures independently leaves a penny or two against the
// invoiced amount, which is wrong in a budget: the last month with a value
// absorbs the difference.
function roundToTotal(arr, total) {
  const out = arr.map(r2);
  const diff = r2(total - out.reduce((a, b) => a + b, 0));
  if (Math.abs(diff) >= 0.01) {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i] !== 0) { out[i] = r2(out[i] + diff); break; }
    }
  }
  return out;
}

// Sum many fees into a single pair of 12-month series.
export function phaseFees(fees, year = 2026) {
  const invoiced = new Array(12).fill(0);
  const earned   = new Array(12).fill(0);
  (fees || []).forEach((f) => {
    const p = phaseFee(f, year);
    for (let i = 0; i < 12; i++) { invoiced[i] += p.invoiced[i]; earned[i] += p.earned[i]; }
  });
  return { invoiced: invoiced.map(r2), earned: earned.map(r2) };
}

// ── Balance sheet and cash flow projection ──────────────────────────────────
// Turns the P&L into a balance sheet using collection and payment assumptions,
// which is the part Neil describes as "a bigger can of worms".
//
//   invoiced        12 values — revenue billed
//   earned          12 values — revenue recognised
//   costsIncurred   12 values — costs recognised in the P&L
//   collectionDays  average days to collect a sales invoice (e.g. 35)
//   paymentDays     average days taken to pay a supplier
//   openingBank     bank balance brought forward
//
// Returns monthly and closing positions, plus a balance check.
export function projectBalanceSheet({
  invoiced = [], earned = [], costsIncurred = [],
  collectionDays = 30, paymentDays = 30, openingBank = 0,
} = {}) {
  const lagFor = (days) => Math.max(0, Math.round(days / 30));   // whole months
  const recLag = lagFor(collectionDays);
  const payLag = lagFor(paymentDays);

  const receipts = new Array(12).fill(0);
  const payments = new Array(12).fill(0);
  for (let i = 0; i < 12; i++) {
    const src = i - recLag;
    if (src >= 0) receipts[i] = invoiced[src] || 0;
    const psrc = i - payLag;
    if (psrc >= 0) payments[i] = costsIncurred[psrc] || 0;
  }

  const rows = [];
  let receivables = 0, deferred = 0, payables = 0, bank = openingBank, retained = 0;

  for (let i = 0; i < 12; i++) {
    const inv = invoiced[i] || 0, ern = earned[i] || 0, cost = costsIncurred[i] || 0;

    receivables += inv - receipts[i];        // billed but not yet collected
    deferred    += inv - ern;                // billed ahead of being earned
    payables    += cost - payments[i];       // incurred but not yet paid
    bank        += receipts[i] - payments[i];
    retained    += ern - cost;               // profit recognised

    rows.push({
      month: MONTHS[i],
      invoiced: r2(inv), earned: r2(ern), costs: r2(cost),
      receipts: r2(receipts[i]), payments: r2(payments[i]),
      receivables: r2(receivables), deferredIncome: r2(deferred),
      payables: r2(payables), bank: r2(bank), retained: r2(retained),
      // assets less liabilities must equal retained earnings
      check: r2((receivables + bank) - (deferred + payables) - retained),
    });
  }

  return {
    rows,
    closing: rows[11],
    balances: rows.every((r) => Math.abs(r.check) < 0.01),
  };
}

// ── Payroll modelling ───────────────────────────────────────────────────────
// Neil's staff requirements: opening salary pre-populated, pay changes from a
// stated month, bonuses, leavers stopping in the right month, and on-costs
// (employer social, pension) plus per-head benefits flowing automatically.
// ── Employer on-costs by region ─────────────────────────────────────────────
// Payroll taxes differ by jurisdiction, and the CEILINGS matter as much as the
// percentages: once cumulative earnings pass a cap, the charge stops for the
// rest of the year, so a flat monthly percentage overstates the cost for senior
// staff. Applied cumulatively below rather than month by month.
//
// ⚠️ RATES TO BE CONFIRMED BY FINANCE. These are placeholders in the right
// shape, not authoritative figures, and they change every tax year. Each entry
// is dated so it is obvious when it was last checked.
export const ONCOSTS_BY_REGION = {
  IOM: {
    label: "Isle of Man",
    socialPct: 0.128,        // employer National Insurance
    socialThreshold: 5000,   // annual earnings below which no employer NI
    socialCap: null,         // uncapped for the employer
    pensionPct: 0.06,
    pensionCap: null,
    reviewed: "placeholder — confirm against current IOM Treasury rates",
  },
  UK: {
    label: "United Kingdom",
    socialPct: 0.15,         // employer NI
    socialThreshold: 5000,   // secondary threshold
    socialCap: null,
    pensionPct: 0.03,        // auto-enrolment employer minimum
    pensionCap: null,
    reviewed: "placeholder — confirm against current HMRC rates",
  },
  MALTA: {
    label: "Malta",
    socialPct: 0.10,         // employer social security contribution
    socialThreshold: 0,
    socialCap: 28000,        // capped — contribution stops above the ceiling
    pensionPct: 0,           // no mandatory second pillar
    pensionCap: null,
    reviewed: "placeholder — confirm against current Maltese SSC classes",
  },
  CYPRUS: {
    label: "Cyprus",
    socialPct: 0.1230,       // employer social insurance 8.8% + redundancy 1.2%
                             // + industrial training 0.5% + social cohesion 2.0%
    socialThreshold: 0,
    socialCap: 66612,        // insurable earnings ceiling — social cohesion is uncapped
    pensionPct: 0,           // no mandatory occupational pension
    pensionCap: null,
    reviewed: "placeholder — confirm employer contribution split and the insurable earnings ceiling",
  },
  CAYMAN: {
    label: "Cayman Islands",
    socialPct: 0,            // no payroll tax
    socialThreshold: 0,
    socialCap: null,
    pensionPct: 0.05,        // mandatory employer pension
    pensionCap: 87000,       // capped on pensionable earnings
    reviewed: "placeholder — confirm against NPL pensionable earnings cap",
  },
  US: {
    label: "United States",
    socialPct: 0.0765,       // FICA: social security plus Medicare
    socialThreshold: 0,
    socialCap: 168600,       // social security wage base (Medicare is uncapped)
    pensionPct: 0.04,        // typical 401(k) match
    pensionCap: null,
    reviewed: "placeholder — confirm wage base and state unemployment separately",
  },
};

// Which region each Affinity company sits in.
export const ENTITY_REGION = {
  "AFG-000": "IOM", "AFG-IOM": "IOM", "AFG-MLT": "MALTA",
  "AFG-CYM": "CAYMAN", "AFG-UK": "UK", "AFG-SD": "US", "AFG-FL": "US",
  "AFG-CYP": "CYPRUS",          // no Cyprus company yet; rates ready if one is added
};

export const DEFAULT_ONCOSTS = ONCOSTS_BY_REGION.IOM;

// Benefits also differ by region — cost and availability both vary.
export const BENEFITS_BY_REGION = {
  IOM:    { healthcare: 95,  wellness: 25, cinema: 8 },
  UK:     { healthcare: 88,  wellness: 25, cinema: 8 },
  MALTA:  { healthcare: 62,  wellness: 20, cinema: 6 },
  CYPRUS: { healthcare: 70,  wellness: 20, cinema: 6 },
  CAYMAN: { healthcare: 240, wellness: 30, cinema: 0 },   // employer health cover is mandatory
  US:     { healthcare: 420, wellness: 30, cinema: 0 },   // materially higher
};
export const DEFAULT_BENEFITS = BENEFITS_BY_REGION.IOM;

// staff: { name, dept, role, annualSalary, startMonth, leaveMonth,
//          changes:[{ month, annualSalary }], bonuses:[{ month, amount }] }
export function phaseStaffCost(person, opts = {}) {
  const region = person.region || opts.region || "IOM";
  const rates  = { ...(ONCOSTS_BY_REGION[region] || ONCOSTS_BY_REGION.IOM), ...(opts.oncosts || {}) };
  const ben    = { ...(BENEFITS_BY_REGION[region] || BENEFITS_BY_REGION.IOM), ...(opts.benefits || {}) };

  const salary = new Array(12).fill(0), social = new Array(12).fill(0),
        pension = new Array(12).fill(0), bonus = new Array(12).fill(0),
        benefits = new Array(12).fill(0);

  const from = person.startMonth != null ? person.startMonth : 0;
  const to   = person.leaveMonth != null ? person.leaveMonth : 11;

  let current = Number(person.annualSalary || 0);
  const changes = (person.changes || []).slice().sort((a, b) => a.month - b.month);

  for (let i = 0; i < 12; i++) {
    changes.filter((c) => c.month === i).forEach((c) => { current = Number(c.annualSalary); });
    if (i < from || i > to) continue;
    salary[i] = current / 12;
    benefits[i] = (ben.healthcare || 0) + (ben.wellness || 0) + (ben.cinema || 0);
  }
  (person.bonuses || []).forEach((b) => {
    if (b.month >= from && b.month <= to) bonus[b.month] += Number(b.amount || 0);
  });

  // Caps and thresholds are annual, so walk the year keeping a running total of
  // chargeable pay rather than applying a flat percentage each month.
  const monthlyThreshold = (rates.socialThreshold || 0) / 12;
  let ytdForSocial = 0, ytdForPension = 0;

  for (let i = 0; i < 12; i++) {
    const pay = salary[i] + bonus[i];
    if (!pay) continue;

    // employer social: above a threshold, below a cap
    let chargeable = Math.max(0, pay - monthlyThreshold);
    if (rates.socialCap != null) {
      const headroom = Math.max(0, rates.socialCap - ytdForSocial);
      chargeable = Math.min(chargeable, headroom);
    }
    social[i] = chargeable * (rates.socialPct || 0);
    ytdForSocial += Math.max(0, pay - monthlyThreshold);

    // pension: usually on salary only, and often capped
    let pensionable = salary[i];
    if (rates.pensionCap != null) {
      const headroom = Math.max(0, rates.pensionCap - ytdForPension);
      pensionable = Math.min(pensionable, headroom);
    }
    pension[i] = pensionable * (rates.pensionPct || 0);
    ytdForPension += salary[i];
  }

  const total = salary.map((_, i) => salary[i] + social[i] + pension[i] + bonus[i] + benefits[i]);
  return {
    region, rates,
    salary: salary.map(r2), social: social.map(r2), pension: pension.map(r2),
    bonus: bonus.map(r2), benefits: benefits.map(r2), total: total.map(r2),
    annual: r2(total.reduce((a, b) => a + b, 0)),
  };
}

export function phaseHeadcount(staff, opts) {
  const acc = { salary:new Array(12).fill(0), social:new Array(12).fill(0),
                pension:new Array(12).fill(0), bonus:new Array(12).fill(0),
                benefits:new Array(12).fill(0), total:new Array(12).fill(0), heads:new Array(12).fill(0) };
  (staff || []).forEach((p) => {
    const r = phaseStaffCost(p, opts);
    ["salary","social","pension","bonus","benefits","total"].forEach((k) => {
      for (let i = 0; i < 12; i++) acc[k][i] += r[k][i];
    });
    const from = p.startMonth != null ? p.startMonth : 0;
    const to   = p.leaveMonth != null ? p.leaveMonth : 11;
    for (let i = from; i <= to; i++) acc.heads[i] += 1;
  });
  Object.keys(acc).forEach((k) => { if (k !== "heads") acc[k] = acc[k].map(r2); });
  return acc;
}

// ── Cost centre ownership ───────────────────────────────────────────────────
// "Every income/cost centre needs to be allocated a business owner."
export const COST_CENTRES = [
  { code:"SALES",    name:"Sales / fee income",        owner:"Managing Director",  ownerRole:"md" },
  { code:"NEWBIZ",   name:"New business",             owner:"Business Development", ownerRole:"bd" },
  { code:"EVENTS",   name:"Events & marketing",        owner:"Business Development", ownerRole:"bd" },
  { code:"STAFF",    name:"Staff costs",              owner:"Managing Director",  ownerRole:"md" },
  { code:"TRAINING", name:"Training & development",    owner:"Managing Director",  ownerRole:"md" },
  { code:"PREMISES", name:"Premises & facilities",     owner:"Chief Operating Officer", ownerRole:"coo" },
  { code:"IT",       name:"IT & software",            owner:"Chief Operating Officer", ownerRole:"coo" },
  { code:"COMPLY",   name:"Regulatory & compliance",   owner:"MLRO",               ownerRole:"mlro" },
  { code:"BANKCHG",  name:"Bank charges",             owner:"Accountant",         ownerRole:"acct" },
  { code:"DEPN",     name:"Depreciation",             owner:"Accountant",         ownerRole:"acct" },
  { code:"PROF",     name:"Professional fees",         owner:"Accountant",         ownerRole:"acct" },
];

// ── Workflow stages ─────────────────────────────────────────────────────────
// Neil's sequence, which is longer than a simple submit-and-approve: owners
// gather a wish list, discuss with their MD, the MD reviews every centre, then
// Group is consulted before submission to Group finance.
export const BUDGET_STAGES = [
  { code:"setup",     label:"Principles set",       owner:"Group finance",  note:"Year's budget principles issued — headcount, fee uplift, growth assumptions" },
  { code:"gathering", label:"Wish list",            owner:"Cost centre owner", note:"Owner gathers requirements from their team" },
  { code:"owner_md",  label:"Owner / MD review",    owner:"Cost centre owner + MD", note:"Costs reviewed, discussed and amended with the team" },
  { code:"md_review", label:"MD consolidated review", owner:"Managing Director", note:"MD reviews every centre for their office" },
  { code:"group_disc",label:"Group discussion",     owner:"MD + Group",     note:"Key points agreed with Group before submission" },
  { code:"submitted", label:"Submitted to Group finance", owner:"Managing Director", note:"" },
  { code:"approved",  label:"Approved",             owner:"Group finance",  note:"" },
  { code:"locked",    label:"Locked",               owner:"Group finance",  note:"Period closed to further change" },
];
