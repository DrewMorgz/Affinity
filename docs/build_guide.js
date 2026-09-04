// build_guide.js — Affinity Core User Guide, branded Word document
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun,
  Header, Footer, PageNumber, TabStopType, TableOfContents, LevelFormat,
  PositionalTab, PositionalTabAlignment, PositionalTabLeader, VerticalAlign,
} = require("docx");

// ── Brand ──────────────────────────────────────────────────────────────────
const NAVY = "001242";      // Midnight Navy
const CYAN = "00C4CC";      // Affinity Cyan
const INK  = "1A1A1A";
const MUT  = "5B6B7B";
const RULE = "D9DEE5";
const TINT = "F4F7FA";
const AMBER = "7B4F1D";
const AMBER_BG = "FDF4DC";
const FONT = "Calibri";     // Catamaran is not available in Word; Calibri is the closest safe match

const PAGE = { width: 11906, height: 16838 };   // A4 portrait, DXA
const CONTENT_W = PAGE.width - 1440 - 1440;     // 1" margins

const logo      = fs.readFileSync("/home/claude/affinity_logo.png");
const logoNavy  = fs.readFileSync("/home/claude/affinity_logo_navy.png");

// ── Helpers ────────────────────────────────────────────────────────────────
const t = (text, o = {}) => new TextRun({ text, font: FONT, ...o });

const body = (text, o = {}) =>
  new Paragraph({
    spacing: { after: 140, line: 288 },
    children: Array.isArray(text) ? text : [t(text, { size: 21, color: INK })],
    ...o,
  });

const h1 = (text, breakBefore = false) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: breakBefore,
    keepNext: true,
    spacing: { before: 360, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: CYAN, space: 6 } },
    children: [t(text, { size: 30, bold: true, color: NAVY, font: FONT })],
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 260, after: 120 },
    children: [t(text, { size: 24, bold: true, color: NAVY, font: FONT })],
  });

const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    spacing: { before: 200, after: 100 },
    children: [t(text, { size: 21, bold: true, color: "0D5C66", font: FONT })],
  });

const bullet = (text, level = 0) =>
  new Paragraph({
    numbering: { reference: "afg-bullets", level },
    spacing: { after: 80, line: 288 },
    children: Array.isArray(text) ? text : [t(text, { size: 21, color: INK })],
  });

// Each numbered list gets its own numbering instance so it restarts at 1.
// Without this, docx continues one sequence through the whole document.
let stepInstance = 0;
const steps = (items) => {
  const instance = ++stepInstance;
  return items.map((text) =>
    new Paragraph({
      numbering: { reference: "afg-steps", level: 0, instance },
      spacing: { after: 80, line: 288 },
      children: Array.isArray(text) ? text : [t(text, { size: 21, color: INK })],
    })
  );
};

// Callout box — used for the things people get wrong
const callout = (title, lines, tone = "cyan") => {
  const bg = tone === "amber" ? AMBER_BG : TINT;
  const bar = tone === "amber" ? "E5CE9A" : CYAN;
  const titleColor = tone === "amber" ? AMBER : NAVY;
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: bar },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: bar },
      left: { style: BorderStyle.SINGLE, size: 18, color: bar },
      right: { style: BorderStyle.SINGLE, size: 2, color: bar },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: bg },
            margins: { top: 160, bottom: 160, left: 220, right: 200 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [t(title, { size: 20, bold: true, color: titleColor })],
              }),
              ...lines.map((l) =>
                new Paragraph({
                  spacing: { after: 60, line: 276 },
                  children: Array.isArray(l) ? l : [t(l, { size: 20, color: INK })],
                })
              ),
            ],
          }),
        ],
      }),
    ],
  });
};

// Data table with a navy header row
const table = (headers, rows, widths) => {
  const cols = widths || headers.map(() => Math.floor(CONTENT_W / headers.length));
  const sum = cols.reduce((a, b) => a + b, 0);
  if (sum !== CONTENT_W) cols[cols.length - 1] += CONTENT_W - sum;

  const cell = (text, i, opts = {}) =>
    new TableCell({
      width: { size: cols[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: opts.fill || "FFFFFF" },
      margins: { top: 90, bottom: 90, left: 130, right: 130 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          spacing: { after: 0, line: 260 },
          children: [t(String(text), {
            size: 19,
            bold: !!opts.bold,
            color: opts.color || INK,
          })],
        }),
      ],
    });

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: cols,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((hd, i) =>
          cell(hd, i, { bold: true, color: "FFFFFF", fill: NAVY })
        ),
      }),
      ...rows.map((r, ri) =>
        new TableRow({
          children: r.map((c, i) =>
            cell(c, i, { fill: ri % 2 ? TINT : "FFFFFF", bold: i === 0 && r.length > 2 })
          ),
        })
      ),
    ],
  });
};

// Header and footer bars. A two-column borderless table places the right-hand
// item hard against the margin in Word, LibreOffice and Google Docs alike;
// PositionalTab does not render consistently.
const barTable = (leftChildren, rightChildren) => {
  const L = Math.floor(CONTENT_W / 2), R = CONTENT_W - L;
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [L, R],
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: L, type: WidthType.DXA },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ spacing: { after: 0 }, children: leftChildren })],
          }),
          new TableCell({
            width: { size: R, type: WidthType.DXA },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.RIGHT, children: rightChildren })],
          }),
        ],
      }),
    ],
  });
};

const spacer = (after = 200) => new Paragraph({ spacing: { after }, children: [] });

// ── Cover ──────────────────────────────────────────────────────────────────
const cover = [
  new Paragraph({ spacing: { before: 2600, after: 0 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 700 },
    children: [new ImageRun({ data: logo, type: "png", transformation: { width: 208, height: 63 } })],
  }),
  new Paragraph({
    spacing: { after: 60 },
    children: [t("Affinity Core", { size: 68, bold: true, color: NAVY })],
  }),
  new Paragraph({
    spacing: { after: 420 },
    children: [t("User Guide", { size: 44, color: CYAN })],
  }),
  new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 14, color: CYAN, space: 10 } },
    spacing: { before: 100, after: 300 },
    children: [],
  }),
  new Paragraph({
    spacing: { after: 100 },
    children: [t("Practice management for corporate and trust services", { size: 24, color: MUT })],
  }),
  new Paragraph({
    spacing: { after: 900 },
    children: [t("Isle of Man  ·  Malta  ·  Cayman Islands  ·  United Kingdom  ·  Miami  ·  Cyprus",
      { size: 19, color: MUT })],
  }),
  new Paragraph({ spacing: { after: 60 }, children: [t("Version 1.0", { size: 20, bold: true, color: NAVY })] }),
  new Paragraph({ spacing: { after: 60 }, children: [t("September 2026", { size: 20, color: MUT })] }),
  new Paragraph({ spacing: { after: 0 }, children: [t("Internal — Affinity Group", { size: 20, color: MUT })] }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Contents ───────────────────────────────────────────────────────────────
const contents = [
  h1("Contents"),
  new Paragraph({
    spacing: { after: 200 },
    children: [t("Right-click and choose “Update field” to refresh page numbers after editing.",
      { size: 18, italics: true, color: MUT })],
  }),
  new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Sections ───────────────────────────────────────────────────────────────
const s = [];

s.push(h1("How to use this guide"));
s.push(body("Sections 1 to 3 are worth reading before you start. After that, go to the section for the job you are doing; each one stands on its own."));
s.push(body([
  t("Where something does not work yet, this guide says so plainly rather than describing it as though it does. ", { size: 21, color: INK }),
  t("Anything greyed out in the system is deliberate, not broken", { size: 21, color: INK, bold: true }),
  t(" — hover over it and it will tell you what it is waiting for.", { size: 21, color: INK }),
]));
s.push(spacer());
s.push(callout("A note on timing", [
  "Affinity Core is being deployed to Azure for testing. Some parts of this guide describe behaviour that becomes available as that work completes — section 18 lists exactly what is and is not working today, and will be updated as each piece lands.",
]));

// 1
s.push(h1("1. What Affinity Core is"));
s.push(body("Affinity Core is Affinity’s own practice management platform. It holds the entities we administer, the compliance work around them, the documents, the time we record, what we bill, and our own accounts and budgets."));
s.push(body("It covers six offices — Isle of Man, Malta, Cayman Islands, United Kingdom, Miami and Cyprus — and two kinds of entity, which the system treats differently:"));
s.push(bullet([t("Client entities", { size: 21, bold: true, color: INK }), t(" — the companies, trusts and foundations we administer for clients.", { size: 21, color: INK })]));
s.push(bullet([t("Internal entities", { size: 21, bold: true, color: INK }), t(" — Affinity’s own eight group companies. These are segregated: you only see them if you have specifically been granted access, because they hold the firm’s own statutory records, accounts and bank mandates.", { size: 21, color: INK })]));
s.push(spacer(120));
s.push(callout("If an entity is missing", [
  "The most likely reason is access rather than a fault, particularly for Affinity’s own companies. Ask a System Administrator before assuming the record does not exist.",
]));

// 2
s.push(h1("2. Signing in"));
s.push(body([
  t("Affinity Core uses your ", { size: 21, color: INK }),
  t("Microsoft 365 account", { size: 21, bold: true, color: INK }),
  t(" — the same one you use for Outlook and Teams. There is no separate password.", { size: 21, color: INK }),
]));
s.push(...steps(["Go to the Affinity Core address in your browser.", "Click Sign in with Microsoft.", "Complete the usual Microsoft sign-in, including MFA if prompted.", "You are returned to Affinity Core, signed in."]));
s.push(spacer(120));
s.push(callout("Continue to preview", [
  "If the Microsoft button says sign-in is not switched on yet, IT have not finished the setup. There is a Continue to preview option in the meantime.",
  "Be clear about what that is: it shows demonstration data only. No real client information is reachable that way, nothing you do is saved, and nothing you see in it is real.",
], "amber"));
s.push(spacer(120));
s.push(body("Signing out removes your access immediately. So does being removed from Entra by IT, which is how leavers are handled — there is no separate account here to close."));

// 3
s.push(h1("3. Finding your way around"));
s.push(h2("The left-hand menu"));
s.push(body("Grouped by the kind of work rather than alphabetically."));
s.push(table(["Section", "Contains"], [
  ["Overview", "Dashboard, Tasks"],
  ["Core", "Entity Admin, Documents, Timesheets, Reporting, Procedures, Generate doc, Client portal"],
  ["Compliance", "Compliance, CRM"],
  ["Onboarding", "Onboarding"],
  ["Internal Accounts", "WIP, Invoicing"],
  ["Affinity Accounting", "Bookkeeping, Transactions, Assets & Groups, Financial Reporting, Planning, Consolidation, Accounting admin"],
  ["People", "Intranet, Assistant"],
  ["System", "System admin"],
], [2900, CONTENT_W - 2900]));
s.push(spacer(160));
s.push(body("You will not see all of these. The menu only shows what your role can open."));

s.push(h2("The entity search"));
s.push(body("Every page that shows client information has the same search box under the page title:"));
s.push(new Paragraph({
  spacing: { before: 60, after: 140 },
  indent: { left: 360 },
  children: [t("Search for an entity by name or reference…", { size: 21, italics: true, color: MUT })],
}));
s.push(body("Type a name or a reference such as AC-2024-001 and it completes as you type. Entering a reference resolves to the entity name. The ✕ clears it."));
s.push(body("This is the same box everywhere, deliberately. There is no separate way to pick an entity on different pages, and there are no entity dropdowns to scroll — if you find one, report it."));

s.push(h2("Reading the screen"));
s.push(table(["What you see", "What it means"], [
  ["Amber “Preview data”", "The page is showing demonstration figures, not the database"],
  ["Green “Live data”", "It is reading real records"],
  ["Greyed-out button", "The action cannot work yet — hover for the reason"],
  ["Pill badges", "Status: green is good, amber needs attention, red is a problem"],
  ["“Internal — Affinity Group”", "One of our own companies, not a client entity"],
], [3400, CONTENT_W - 3400]));

// 4
s.push(h1("4. Dashboard and Tasks"));
s.push(h2("Dashboard"));
s.push(body("Your starting point: entities by jurisdiction, live alerts, reviews falling due, onboarding in progress and overdue filings."));
s.push(body([
  t("Financial figures are not on the Dashboard.", { size: 21, bold: true, color: INK }),
  t(" Revenue, WIP and debt live in Financial Reporting so there is one set of numbers rather than two that can disagree.", { size: 21, color: INK }),
]));
s.push(h2("Tasks"));
s.push(bullet([t("Tasks", { size: 21, bold: true, color: INK }), t(" — the work assigned to you or your team, with category, entity, assignee, due date and status. ＋ Add task creates one.", { size: 21, color: INK })]));
s.push(bullet([t("Activity", { size: 21, bold: true, color: INK }), t(" — what used to be a separate notifications area. Task assignments, approvals, mentions, filing and review dates, and signature requests all appear here.", { size: 21, color: INK })]));
s.push(spacer(120));
s.push(callout("Turn something you have read into work you will do", [
  "Any item in Activity has a ＋ Task button. Press it and it becomes a tracked task, pre-filled with the title, a sensible category, and notes recording who raised it and when. Use that rather than trying to remember it.",
]));

// 5
s.push(h1("5. Entity Admin"));
s.push(body("The core record for every entity. Search for one and its tabs appear, grouped:"));
s.push(table(["Group", "Tabs"], [
  ["Entity", "Overview, Officers, Shareholders, Bank accounts, Charges, Assets, Dividends, Beneficial owners, Meetings, Structure / chart, File notes, Archive, Safe custody, Generate registers"],
  ["Regulatory", "Compliance register"],
  ["Registers", "Gaming — appears only for gaming entities"],
  ["Filing Obligations", "FATCA, CRS, Substance"],
], [2500, CONTENT_W - 2500]));
s.push(spacer(160));
s.push(h2("Working with an entity"));
s.push(...steps(["Search for it by name or reference.", "The header shows reference, class (client or internal), jurisdiction, type, status and risk rating at a glance.", "Move between tabs to see each register."]));
s.push(h2("Things worth knowing"));
s.push(bullet("Documents ↗ in the header opens the Documents module for that entity."));
s.push(bullet("Generate register ↗ opens Generate doc to produce a statutory register."));
s.push(bullet("Edit entity is greyed out — changing entity records needs the write layer."));
s.push(bullet("Structure / chart draws the ownership chain. Useful for CDD and for explaining a structure to a client."));
s.push(bullet("Gaming carries the licence position and, beneath it, a Compliance log — the same 17 registers as the Compliance module, scoped to that entity, so gaming obligations are recorded in context."));

// 6
s.push(h1("6. Compliance"));
s.push(body("The sidebar is organised as Framework and Registers."));
s.push(h2("Framework"));
s.push(body("Overview, CSP licence, AML/CFT framework, Regulatory reporting and Staff training — the firm-level position rather than any one entity."));
s.push(h2("Registers"));
s.push(body("All 17 registers sit behind one Registers entry rather than cluttering the sidebar:"));
s.push(body([t("Errors & omissions · Deviations · Complaints · Gifts & hospitality · Conflicts · Sanctions · PEPs · Frozen assets · Declined business · Advertising · Outsourcing · Cyber incidents · Litigation · Insurance · Key staff · CPD log · Breach log", { size: 20, color: MUT })]));
s.push(...steps(["Click Registers. You get a contents view: every register as a card with its entry count, and a green badge where entries have actually been recorded.", "Click a card, or use the dropdown at the top, to open one.", "← All registers returns to the contents view."]));
s.push(body("The dropdown includes All registers so you can move between them without going back each time."));
s.push(h2("Recording an entry"));
s.push(body("Use ＋ Add entry within a register. The CPD log and the compliance registers write to the database; most other registers are read-only until the write layer lands. If the button is greyed out, that is why."));

// 7
s.push(h1("7. Documents"));
s.push(body("The document library, organised by entity: 18 top-level folders and 88 subfolders."));
s.push(body([t("Accounts · Aircraft/Yacht · Bank · Compliance · Correspondence · Data Protection · Delete Documents · Duty & Taxes · E-Gaming · FINTECH · Insurance · Investments · Invoices · KYC · Permanent · Property · Statutory · Group", { size: 20, color: MUT })]));
s.push(spacer(120));
s.push(callout("Only relevant folders are shown", [
  "You see only the folders that hold documents for that entity. A property holding company does not see eGaming folders. This applies to everyone, including administrators.",
  "To file the first document into an empty folder, switch the toggle in the Folders header from “In use” to “All folders”. Switch it back afterwards.",
]));
s.push(spacer(120));
s.push(h2("Filing a document"));
s.push(...steps(["Search for the entity.", "Pick the folder, or reveal all folders if the one you need is empty.", "↑ Upload — it files into the selected folder."]));
s.push(body("If an entity has nothing filed at all you will see a note saying so rather than an empty panel."));

// 8
s.push(h1("8. Timesheets"));
s.push(body("Tabs: Time entry, WIP by entity, Utilisation, Missing timesheets, Approval queue, Reports."));
s.push(h2("Recording time"));
s.push(bullet([t("Timer", { size: 21, bold: true, color: INK }), t(" — set the entity using the search at the top of the page, add matter and work type, then start it. The timer’s entity follows the page search rather than being chosen separately.", { size: 21, color: INK })]));
s.push(bullet([t("＋ Manual entry", { size: 21, bold: true, color: INK }), t(" — for time recorded after the event.", { size: 21, color: INK })]));
s.push(body("Search for a person by name using the person search on the Time entry tab rather than scrolling the staff list."));
s.push(h2("The other tabs"));
s.push(table(["Tab", "What it is for"], [
  ["WIP by entity", "Unbilled time, ready for invoicing"],
  ["Utilisation", "Chargeable against available hours, by person"],
  ["Missing timesheets", "Who has not submitted — chase from here"],
  ["Approval queue", "Managers approve submitted time"],
], [3000, CONTENT_W - 3000]));

// 9
s.push(h1("9. Reporting"));
s.push(body("Reporting is the report builder and your saved reports. There are no pre-built reports, deliberately: if you can build any report you need, a guessed set of “typical” reports only takes up space."));
s.push(callout("Accounts reporting is not here", [
  "Revenue, WIP, aged debt, P&L and budgets are in Affinity Accounting → Financial Reporting, reported off the ledger so there is one set of figures.",
], "amber"));
s.push(spacer(140));
s.push(h2("Building a report"));
s.push(...steps([[t("Pick your columns. ", { size: 21, bold: true, color: INK }), t("The left panel lists every section of the system — Entity Admin, Owners & UBOs, Directors & Officers, Services, Gaming, Compliance, Documents, Billing & WIP, Statutory & Filing, Banking & Assets, Onboarding, CRM & Fees, Time & Recovery, Our People, Meetings, Shares & Capital, Charges, Assets & Safe Custody, Dividends, Tax & Substance, Procedures & Tasks, Archive & Retention. Expand a section and tick fields. You can mix sections freely — that is the point.", { size: 21, color: INK })], [t("Watch the basket. ", { size: 21, bold: true, color: INK }), t("Chosen columns appear as chips coloured by section. Once you span more than one section a Cross-section marker appears, so a joined report looks joined.", { size: 21, color: INK })], [t("Add conditions. ", { size: 21, bold: true, color: INK }), t("Choose a field, an operator and a value. Operators suit the field: “includes” for a list, “at least” for a number, “is any of” for a comma-separated list. All conditions must be true.", { size: 21, color: INK })], [t("Set the portfolio ", { size: 21, bold: true, color: INK }), t("— managed entities, Affinity internal, or all.", { size: 21, color: INK })], [t("Read the results. ", { size: 21, bold: true, color: INK }), t("A band above the column names shows which section each came from.", { size: 21, color: INK })]]));
s.push(h2("Two worked examples"));
s.push(h3("Licensed gaming companies with beneficial owners in Australia"));
s.push(body([t("Columns: ", { size: 20, bold: true, color: MUT }), t("entity name, jurisdiction, licence status, regulator, licence number, beneficial owners, UBO country of residence.", { size: 20, color: INK })]));
s.push(body([t("Conditions: ", { size: 20, bold: true, color: MUT }), t("licence status is Licensed; UBO country of residence includes Australia.", { size: 20, color: INK })]));
s.push(h3("Entities where we provide directors"));
s.push(body([t("Columns: ", { size: 20, bold: true, color: MUT }), t("entity name, jurisdiction, type, directors, number of directors, risk rating, administrator.", { size: 20, color: INK })]));
s.push(body([t("Condition: ", { size: 20, bold: true, color: MUT }), t("we provide directors is yes.", { size: 20, color: INK })]));
s.push(body("Both ship as starter examples under “Examples to start from”."));
s.push(h2("Saving and re-running"));
s.push(body("Name the report and press Save report. It appears on the Saved reports tab."));
s.push(callout("A saved report stores its definition, not a snapshot", [
  "Re-running it evaluates against today’s data — so “UK client report” picks up new UK clients automatically. Saving again under the same name updates it rather than creating a duplicate.",
  "Tick Share to make a report visible to the whole team; otherwise it is yours. Run counts show which reports actually get used.",
]));
s.push(spacer(140));
s.push(h2("“Awaiting data”"));
s.push(body("Some fields are labelled awaiting data. The field is catalogued and the report will include it once the underlying data is connected, but it returns nothing today. This is shown deliberately so a gap is never mistaken for a nil."));

// 10-12
s.push(h1("10. Onboarding"));
s.push(body("Tabs: Overview, Active onboardings, Transfer-in, Attrition, Client portal."));
s.push(body("The route from enquiry to a live entity: enquiry → CDD collection → risk rating → sign-off. Active onboardings shows each case and its stage. Transfer-in handles entities coming from another provider, which have their own fee and information requirements."));
s.push(body("Sign-off, CDD source of wealth and funds, and the Zoho signature replacement are write-layer features and currently read-only."));

s.push(h1("11. CRM"));
s.push(body("The business development pipeline: leads, proposals and fees, sector, and pipeline status including Invoice Issued and On Hold."));
s.push(body("Fee quoting draws on the same rate card as Invoicing → Fee schedules. If you change a rate, change it there."));

s.push(h1("12. Internal Accounts"));
s.push(h2("WIP"));
s.push(body("Unbilled work in progress. Start at all offices and drill down: office → client → fee earner, or search for a client directly using the entity search at the top of the page."));
s.push(h2("Invoicing"));
s.push(table(["Tab", "What it is for"], [
  ["Ad-hoc invoicing", "Raise an invoice outside the retainer cycle"],
  ["Invoice ledger", "Every invoice, searchable by number, amount or status"],
  ["By client", "Invoices grouped by client"],
  ["Auto-bookkeeping", "Invoices posted to the ledger automatically"],
  ["Aged debt", "Current, 31–60, 61–90 and 90+ days"],
  ["Retainers", "Recurring fee invoicing"],
  ["Credit control", "Collection actions"],
  ["Fee schedules", "Standard rates by office and service type, in local currency. This is the rate card behind retainer invoices and proposal fees"],
], [3000, CONTENT_W - 3000]));

// 13
s.push(h1("13. Affinity Accounting"));
s.push(body("Our own accounts, in seven areas."));
s.push(table(["Area", "Contains"], [
  ["Bookkeeping", "Sales, Purchases, Cashbook, journals, reports"],
  ["Transactions", "General Ledger, Accounts Receivable, Accounts Payable, Banking & Reconciliation"],
  ["Assets & Groups", "Fixed Assets, Intercompany, Consolidation"],
  ["Financial Reporting", "Cash Flow & Treasury, Tax & VAT, Financial Statements, Management Reports, Auditor Pack"],
  ["Planning", "Budgeting and forecasting — section 14"],
  ["Consolidation", "Group results — section 15"],
  ["Accounting admin", "FX rates and multi-currency"],
], [3000, CONTENT_W - 3000]));
s.push(spacer(160));
s.push(body("Financial Reporting → Management Reports holds P&L by entity, departmental profitability, revenue by office, revenue against budget and forecast, aged debt summary, WIP and debtors movement, and financial KPIs."));
s.push(body("Set the company you are looking at using the entity search at the top; every tab follows it."));

// 14
s.push(h1("14. Planning — budgeting and forecasting", true));
s.push(body("Seven tabs. The order below is the order you would use them."));

s.push(h2("14.1  Fees & sales"));
s.push(body("Where the revenue budget comes from. Sales are not typed in — they start from the recurring fee book."));
s.push(body("Each line shows the client, which Affinity company bills it, the service, description, frequency, amount, currency, whether the 5% uplift applies, status, and the months it runs between."));
s.push(bullet([t("Frequency", { size: 21, bold: true, color: INK }), t(" — monthly, quarterly, annual or one-off. This drives both when it is invoiced and how it is earned.", { size: 21, color: INK })]));
s.push(bullet([t("Uplift", { size: 21, bold: true, color: INK }), t(" — tick to apply the annual increase.", { size: 21, color: INK })]));
s.push(bullet([t("Status", { size: 21, bold: true, color: INK }), t(" — Recurring, Lost (stops in the month set in “To”) or New business (starts in the month set in “From”, carrying the client’s sector for reporting).", { size: 21, color: INK })]));
s.push(bullet([t("Billed by", { size: 21, bold: true, color: INK }), t(" — which Affinity company bills it. The revenue lands on that company’s budget, so this matters.", { size: 21, color: INK })]));
s.push(spacer(120));
s.push(callout("The idea worth understanding: invoiced against earned", [
  "An annual fee is invoiced in one month but earned across the year by days in month. A quarterly fee is invoiced four times but earned across each quarter.",
  [t("The gap between invoiced and earned is ", { size: 20, color: INK }), t("deferred income", { size: 20, bold: true, color: NAVY }), t(" — and it is what allows a balance sheet and a cash flow to be calculated rather than budgeted separately.", { size: 20, color: INK })],
  "Day counts use the actual days in the year, so a leap year is handled correctly.",
]));

s.push(h2("14.2  Staff"));
s.push(body("Where the staff budget comes from, starting from the payroll file. Each person shows name, employing company, department, role, payroll region, opening salary, a pay change and the month it takes effect, bonus, start and leave months, and their cost for the year."));
s.push(bullet([t("Employing company", { size: 21, bold: true, color: INK }), t(" — whose budget carries this person. Change it and the cost moves.", { size: 21, color: INK })]));
s.push(bullet([t("Pay change", { size: 21, bold: true, color: INK }), t(" — enter the new annual salary and the month it applies from. Gross, employer social and pension recalculate from that month, not the whole year.", { size: 21, color: INK })]));
s.push(bullet([t("Bonus", { size: 21, bold: true, color: INK }), t(" — lands in its month, with employer social applied to it.", { size: 21, color: INK })]));
s.push(bullet([t("Leaves / Starts", { size: 21, bold: true, color: INK }), t(" — cost stops after the leave month, and begins in the start month.", { size: 21, color: INK })]));
s.push(bullet("Healthcare, wellness and cinema follow headcount automatically. Do not budget them separately."));
s.push(spacer(120));
s.push(callout("Employer on-costs and their ceilings", [
  "Employer social and pension are charged at the employing company’s jurisdiction rates, and ceilings are applied cumulatively across the year — so a capped contribution correctly stops once the year’s earnings pass the limit rather than being charged flat every month.",
  "The rates, thresholds and ceilings in force are shown in their own table. They are set by Finance and change every tax year.",
]));

s.push(h2("14.3  Recharges"));
s.push(body("The blue columns on the right, for people who work across companies. Press Recharges ▾ on a row to open up to six targets. For each, choose the company and the percentage. Every percentage is entered per person — there are no default rates."));
s.push(bullet("The employing company keeps the balance and shows a credit on Recharged out — direct."));
s.push(bullet("The receiving company picks it up on Recharged in — direct, converted into its own budget currency at the year’s planning rate."));
s.push(bullet("Retained % shows what stays with the employer. Over 100% is flagged."));
s.push(spacer(120));
s.push(callout("A charge to Affinity Group Limited means one of two things", [
  [t("Left clear — a contribution to group. ", { size: 20, bold: true, color: NAVY }), t("Paid by a subsidiary with a share charged across for group work performed. That share stays at group. This is the usual case, such as an Isle of Man employee charging 20% across.", { size: 20, color: INK })],
  [t("Ticked “pass on” — a conduit. ", { size: 20, bold: true, color: NAVY }), t("Group receives the charge and spreads it to the operating companies on the group allocation basis. Use this for someone paid by one company but working across the whole group.", { size: 20, color: INK })],
  [t("Getting this wrong is worth avoiding: a contribution marked “pass on” would be pushed straight back out to the operating companies, including returning part of it to the company that paid it.", { size: 20, color: AMBER })],
], "amber"));
s.push(spacer(120));
s.push(body("The group allocation basis — how group spreads a conduit charge — is shown as its own table and is set by Finance."));

s.push(h2("14.4  Budget input — the front sheet"));
s.push(body("Accounts down, months across, with group subtotals and a net result line."));
s.push(callout("Cells you cannot type in", [
  "Anything supplied by another tab is locked and shaded, and carries a FROM FEES or FROM STAFF badge. Click the badge to jump to the tab where that figure is actually maintained. Revenue and all staff costs work this way.",
  "An editable cell that another sheet overwrites would be worse than no cell at all — the change looks accepted and then silently disappears.",
]));
s.push(spacer(140));
s.push(body("Cells you can type in: direct costs, overheads, recruitment and training."));
s.push(table(["Action", "How"], [
  ["Move", "Arrow keys"],
  ["Start editing", "Enter, or just start typing"],
  ["Next cell", "Tab"],
  ["Clear a cell", "Delete"],
  ["Paste a block", "Copy from Excel and paste — tab or comma separated, from the selected cell"],
  ["Spread a year across months", "“spread” beside the account name, then enter the annual figure"],
  ["Undo", "↶ Undo, up to 25 steps"],
], [3800, CONTENT_W - 3800]));
s.push(spacer(160));
s.push(body("Changes save automatically; the header shows when they last saved. FORMULA rows are derived. ACTUAL rows come from the ledger. Once a budget is approved the whole grid becomes read-only."));
s.push(body([
  t("Validation", { size: 21, bold: true, color: INK }),
  t(" — the drawer lists blank periods, negative figures and unusual margins. Submit for approval is blocked while there are errors.", { size: 21, color: INK }),
]));
s.push(body([
  t("Comments", { size: 21, bold: true, color: INK }),
  t(" — select a cell and add a note explaining a movement. Approvers see it beside the figure.", { size: 21, color: INK }),
]));

s.push(h2("14.5  Balance sheet & cash"));
s.push(body("Calculated from the budget, not budgeted separately. Set debtor days and creditor days. The projection returns, by month: invoiced, earned, costs, receipts, payments, debtors, deferred income, creditors, bank and retained earnings."));
s.push(body("On 35-day terms, nothing is collected in the first month and January’s invoice is collected in February — which is the point of separating invoiced from earned."));
s.push(callout("The balance check", [
  "A badge confirms that assets less liabilities equals retained earnings in every month. If the assumptions ever stop hanging together it will say so, rather than quietly producing a wrong answer.",
]));

s.push(h2("14.6  Workflow"));
s.push(body("The budget process, in eight stages:"));
s.push(table(["Stage", "Who", "What happens"], [
  ["1. Principles set", "Group finance", "The year’s assumptions issued: headcount, fee uplift, growth"],
  ["2. Wish list", "Cost centre owner", "Owner gathers requirements from their team"],
  ["3. Owner / MD review", "Owner and MD", "Costs reviewed, discussed and amended with the team"],
  ["4. MD consolidated review", "Managing Director", "MD reviews every centre for their office"],
  ["5. Group discussion", "MD and Group", "Key points agreed before submission"],
  ["6. Submitted", "Managing Director", "Budget goes to Group finance"],
  ["7. Approved", "Group finance", ""],
  ["8. Locked", "Group finance", "Closed to further change; reopening is possible and recorded"],
], [3100, 2600, CONTENT_W - 5700]));
s.push(spacer(160));
s.push(body("Beneath it, every cost centre with its named business owner — sales with the MD, events with BD, bank charges and depreciation with the Accountant — and the stage each has reached. Every transition is recorded in the approval history with who and when."));

s.push(h2("14.7  Scenarios and Variance"));
s.push(bullet([t("Scenarios", { size: 21, bold: true, color: INK }), t(" — copies of an approved budget. Changing a scenario never touches the approved figures. The comparison shows the effect of changed drivers on the result rather than two spreadsheets side by side.", { size: 21, color: INK })]));
s.push(bullet([t("Variance & analysis", { size: 21, bold: true, color: INK }), t(" — budget against actual year to date with variance and status, revenue by service line, monthly budget against forecast against actual, and key metrics. ＋ Explain attaches a note to a variance.", { size: 21, color: INK })]));

// 15
s.push(h1("15. Consolidation"));
s.push(table(["Tab", "What it does"], [
  ["Cockpit", "An operational control screen. Every group member against seven readiness gates: data received, mapped, balanced, translated, intercompany, journals, approved. The first failing gate is marked, so the blocker is obvious. Resolve ↗ takes you to it"],
  ["Data collection", "Trial balance imports with checksum, who imported, when, row count and status. A failed import says why. ↑ Import trial balance runs a three-step wizard: file, column mapping, then validation showing rows parsed, whether debits equal credits, duplicates and unmapped accounts"],
  ["Mapping", "Local chart to group chart, per entity. Unmapped accounts block consolidation, and the queue is shown. Mappings are versioned by effective date, so restating a prior period uses the mapping that applied then"],
  ["Intercompany", "Both entities, both accounts, both reported amounts, the difference, owner and status. Set a tolerance and auto-match within it. Differences inside tolerance are flagged rather than hidden; anything outside blocks the run"],
  ["Runs", "Every run with its reference, period, timing, who started it, rules version and outcome, so any figure traces back to the run that produced it"],
], [2400, CONTENT_W - 2400]));
s.push(spacer(160));
s.push(callout("Running a consolidation", [
  "Clear the readiness gates, resolve intercompany differences, then press Run consolidation. A blocked run still executes and records why, rather than refusing silently.",
]));

// 16
s.push(h1("16. Procedures, Generate doc, Client portal, Intranet"));
s.push(bullet([t("Procedures", { size: 21, bold: true, color: INK }), t(" — Overview, Procedure library, Active runs, History. The written procedures staff follow, and where a procedure has been run against an entity.", { size: 21, color: INK })]));
s.push(bullet([t("Generate doc", { size: 21, bold: true, color: INK }), t(" — produces documents from live entity data. Set the entity at the top of the page; every document on the page uses it.", { size: 21, color: INK })]));
s.push(bullet([t("Client portal", { size: 21, bold: true, color: INK }), t(" — what a client sees of their own entities.", { size: 21, color: INK })]));
s.push(bullet([t("Intranet", { size: 21, bold: true, color: INK }), t(" — firm news, policies, offices, birthdays and anniversaries. Editable.", { size: 21, color: INK })]));
s.push(bullet([t("Assistant", { size: 21, bold: true, color: INK }), t(" — question-and-answer help across the system.", { size: 21, color: INK })]));

// 17
s.push(h1("17. System admin"));
s.push(body("Restricted to System Administrators. Eight tabs."));
s.push(table(["Tab", "What it controls"], [
  ["Users", "Staff, roles, MFA status, office"],
  ["Roles & permissions", "What each role can do"],
  ["Permission matrix", "Every module broken down by sub-section, expandable. Beneath it, individual user rights for Affinity’s own group companies — a column per company, per person. An override replaces the role default"],
  ["Document permissions", "Its own section, because the library is 18 folders and 88 subfolders. Expand a folder to set View, Add, Edit and Delete per subfolder per role. Subfolders inherit their parent unless set explicitly, and an overridden row is badged"],
  ["Custom fields & lists", "The 28 dropdown lists the system reads — entity type, jurisdiction, incorporation regime, officer role, share class, source of wealth and funds, verification method, PEP category, risk rating, work type, sector, fee type and more. Adding an option here is an administrative change, not a development one. Values in use can be retired but not deleted, so existing records keep their value"],
  ["Procedures & templates", "Procedures, workflows, document templates, checklists and register definitions, in one place"],
  ["Audit log", "Activity trail"],
  ["System config", "Session, IP and general settings"],
], [2900, CONTENT_W - 2900]));
s.push(spacer(160));
s.push(h2("Granting access to Affinity’s own companies"));
s.push(...steps(["Open Permission matrix.", "Scroll to Individual user rights.", "Tick the companies that person should see."]));
s.push(callout("Role defaults are deliberately tight", [
  "Only Super Admin holds all eight companies by default. Directors hold Group and Isle of Man. Managers and Administrators hold none until granted.",
]));

// 18
s.push(h1("18. What does not work yet, and why"));
s.push(body("Being straightforward about this saves time reporting things that were never built. This section is updated as the Azure deployment progresses."));
s.push(table(["Area", "Position today"], [
  ["Microsoft sign-in", "Being set up. Until it is complete the app cannot read the database, so most modules show demonstration data"],
  ["The write layer", "Roughly a hundred actions are visibly greyed out. Reading, searching, filtering and reporting work; saving mostly does not. This includes editing entity records, most register entries, onboarding sign-off, statutory forms and posting forms"],
  ["Working today", "The CPD log, compliance registers, saved reports, and the Planning and Consolidation calculations"],
  ["Report builder", "22 sections and 137 fields, of which about half return data today. The rest are labelled “awaiting data”"],
  ["Planning and Consolidation", "Calculate correctly, but against preview figures until connected"],
  ["Rates set by Finance", "Placeholders at present: employer social and pension rates and ceilings for all six regions, budget FX planning rates, and the group allocation basis"],
], [3200, CONTENT_W - 3200]));

// 19
s.push(h1("19. Getting help"));
s.push(table(["Situation", "What to do"], [
  ["Something looks wrong", "Note the page, the tab and what you did. “Compliance → Gifts register → Add entry does nothing” is actionable; “compliance is broken” is not"],
  ["Something is greyed out", "Hover it first — it will say what it is waiting for"],
  ["You cannot see an entity", "Most likely an access question, particularly for Affinity’s own companies. Ask a System Administrator"],
  ["A figure looks wrong in Planning", "Check which tab supplies it. Revenue comes from Fees & sales, staff costs from Staff. The front sheet only displays them"],
  ["Rates or percentages look wrong", "Those are Finance’s to set, not a system fault"],
], [3200, CONTENT_W - 3200]));
s.push(spacer(300));
s.push(new Paragraph({
  border: { top: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 8 } },
  spacing: { before: 200, after: 100 },
  children: [],
}));
s.push(new Paragraph({
  children: [t("Affinity Core is developed in-house and changes regularly. Where this guide and the system disagree, the system is right — please flag it so the guide can be corrected.",
    { size: 19, italics: true, color: MUT })],
}));

// ── Document ───────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Affinity Group",
  title: "Affinity Core — User Guide",
  description: "User guide for the Affinity Core practice management platform",
  styles: {
    default: {
      document: { run: { font: FONT, size: 21, color: INK } },
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 30, bold: true, color: NAVY }, paragraph: { outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 24, bold: true, color: NAVY }, paragraph: { outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 21, bold: true, color: "0D5C66" }, paragraph: { outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "afg-bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "▪", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 260 } },
                   run: { color: CYAN, font: FONT } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 880, hanging: 260 } },
                   run: { color: MUT, font: FONT } } },
      ]},
      { reference: "afg-steps", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 300 } },
                   run: { color: NAVY, bold: true, font: FONT } } },
      ]},
    ],
  },
  sections: [
    // Cover — no header or footer
    {
      properties: { page: { size: { width: PAGE.width, height: PAGE.height },
                            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: cover,
    },
    // Body — branded header and footer
    {
      properties: { page: { size: { width: PAGE.width, height: PAGE.height },
                            margin: { top: 1300, right: 1440, bottom: 1200, left: 1440 } } },
      headers: {
        default: new Header({
          children: [
            barTable(
              [new ImageRun({ data: logo, type: "png", transformation: { width: 88, height: 27 } })],
              [t("Affinity Core — User Guide", { size: 17, color: MUT })]
            ),
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CYAN, space: 4 } },
              spacing: { before: 40, after: 200 },
              children: [],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } },
              spacing: { before: 60, after: 40 },
              children: [],
            }),
            barTable(
              [t("Internal — Affinity Group", { size: 17, color: MUT })],
              [
                t("Page ", { size: 17, color: MUT }),
                new TextRun({ children: [PageNumber.CURRENT], size: 17, color: NAVY, bold: true, font: FONT }),
                t(" of ", { size: 17, color: MUT }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17, color: MUT, font: FONT }),
              ]
            ),
          ],
        }),
      },
      children: [...contents, ...s],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/claude/outputs/Affinity-Core-User-Guide.docx", buf);
  console.log("written:", buf.length, "bytes");
});
