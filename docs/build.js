// Builds the branded Affinity Core user guide as a Word document.
//
// Brand: navy #001242 for headings and rules, cyan #00C4CC for accents —
// sampled from the logo, which is #00A6C8, and matched to the palette the
// application itself uses so the document and the system look related.

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  ImageRun, PageBreak, Header, Footer, PageNumber, TableOfContents,
  LevelFormat, convertInchesToTwip,
} = require('docx');

const NAVY  = '001242';
const CYAN  = '00C4CC';
const GREY  = '5B6B7B';
const LINE  = 'D9DEE5';
const AMBER = '7B4F1D';
const AMBBG = 'FDF4DC';
const HDRBG = 'F1F4F8';

const md = fs.readFileSync('Affinity-Core-User-Guide.md', 'utf8');
const logo = fs.readFileSync('affinity_logo.png');

// ── inline formatting ────────────────────────────────────────────────
// Handles **bold**, `code` and plain text. Deliberately small: the guide
// uses a narrow set of markdown, and a general-purpose parser would be more
// code with more ways to go wrong.
function runs(text, opts = {}) {
  const base = { size: opts.size || 21, color: opts.color || '222222', font: 'Calibri' };
  const out = [];
  // Order matters: **bold** must be tried before *italic*, or the italic
  // pattern consumes the first two asterisks of a bold span.
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ ...base, text: text.slice(last, m.index) }));
    const tok = m[0];
    if (tok.startsWith('**')) {
      // A bold span can contain a code span — **`[DEMO]`**. The bold pattern
      // matches first, so the backticks would be printed literally. Strip them
      // and render the whole thing bold monospace.
      const inner = tok.slice(2, -2);
      const isCode = /^`.*`$/.test(inner);
      out.push(new TextRun({
        ...base,
        text: isCode ? inner.slice(1, -1) : inner,
        bold: true,
        ...(isCode ? { font: 'Consolas', size: base.size - 2, color: NAVY } : {}),
      }));
    } else if (tok.startsWith('*')) {
      out.push(new TextRun({ ...base, text: tok.slice(1, -1), italics: true }));
    } else {
      out.push(new TextRun({ ...base, text: tok.slice(1, -1),
                             font: 'Consolas', size: base.size - 2, color: NAVY }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ ...base, text: text.slice(last) }));
  return out.length ? out : [new TextRun({ ...base, text: '' })];
}

const body = [];

// ── cover page ───────────────────────────────────────────────────────
body.push(
  new Paragraph({ children: [], spacing: { before: 1400 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ data: logo, type: 'png',
                              transformation: { width: 298, height: 90 } })],
  }),
  new Paragraph({ children: [], spacing: { before: 700 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Affinity Core', bold: true, size: 68,
                             color: NAVY, font: 'Calibri Light' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100 },
    children: [new TextRun({ text: 'User Guide', size: 40, color: CYAN,
                             font: 'Calibri Light' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 500 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: CYAN, space: 12 } },
    children: [new TextRun({ text: '', size: 2 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 320 },
    children: [new TextRun({ text: 'Version 2  ·  September 2026', size: 22, color: GREY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80 },
    children: [new TextRun({
      text: 'Corporate and Trust Services  ·  Isle of Man  ·  Malta  ·  Cayman Islands  ·  United Kingdom  ·  United States  ·  Cyprus',
      size: 17, color: GREY, italics: true })],
  }),
  new Paragraph({ children: [], spacing: { before: 2600 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Internal document. Contains no client data.',
                             size: 16, color: GREY })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ── contents ─────────────────────────────────────────────────────────
body.push(
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: 'Contents', bold: true, size: 32, color: NAVY })],
  }),
  // A STATIC contents with real page numbers, not a TableOfContents field.
  // The field renders blank until the reader presses F9 in Word, and most
  // people will not know to — a blank contents page in a document that gets
  // emailed around reads as broken. Page numbers come from a first render of
  // the document, so they are the actual pages.
  ...(function () {
    const toc = JSON.parse(fs.readFileSync('toc.json', 'utf8'));
    return toc.filter((e) => e.page && e.level <= 2).map((e) => new Paragraph({
      spacing: { before: e.level === 1 ? 160 : 20, after: 20 },
      indent: { left: e.level === 1 ? 0 : 300 },
      tabStops: [{ type: 'right', position: 9200, leader: 'dot' }],
      children: [
        new TextRun({
          text: e.text,
          bold: e.level === 1,
          size: e.level === 1 ? 21 : 19,
          color: e.level === 1 ? NAVY : '333333',
        }),
        new TextRun({ text: '\t' + e.page,
                      size: e.level === 1 ? 21 : 19,
                      bold: e.level === 1,
                      color: e.level === 1 ? NAVY : GREY }),
      ],
    }));
  })(),
  new Paragraph({ children: [new PageBreak()] }),
);

// ── the guide body ───────────────────────────────────────────────────
const lines = md.split('\n');
let i = 0;
let skippedTitle = false;

function headingParagraph(level, text) {
  const spec = {
    1: { size: 34, before: 420, after: 160, rule: true },
    2: { size: 27, before: 340, after: 120, rule: false },
    3: { size: 22, before: 260, after: 90,  rule: false },
    4: { size: 20, before: 200, after: 70,  rule: false },
  }[level] || { size: 20, before: 180, after: 60, rule: false };

  return new Paragraph({
    heading: HeadingLevel['HEADING_' + Math.min(level, 4)],
    spacing: { before: spec.before, after: spec.after },
    ...(spec.rule ? { border: { bottom: { style: BorderStyle.SINGLE, size: 8,
                                          color: CYAN, space: 6 } } } : {}),
    children: [new TextRun({ text, bold: true, size: spec.size,
                             color: level <= 2 ? NAVY : '2A3F5F',
                             font: 'Calibri Light' })],
  });
}

while (i < lines.length) {
  const raw = lines[i];
  const line = raw.trimEnd();

  // horizontal rule → a navy rule rather than a table
  if (/^---+$/.test(line.trim())) {
    body.push(new Paragraph({
      spacing: { before: 200, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 8 } },
      children: [new TextRun({ text: '', size: 2 })],
    }));
    i++; continue;
  }

  // headings
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    const level = h[1].length;
    const text = h[2].replace(/\*\*/g, '').trim();
    // the document title is on the cover already
    if (level === 1 && !skippedTitle) { skippedTitle = true; i++; continue; }
    // part headings start a new page
    if (level === 1) body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(headingParagraph(level, text));
    i++; continue;
  }

  // tables
  if (line.startsWith('|') && (lines[i + 1] || '').match(/^\s*\|[\s:|-]+\|\s*$/)) {
    const cells = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const header = cells(line);
    i += 2;
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      rows.push(cells(lines[i])); i++;
    }
    const n = header.length;
    // dual widths: on the table and on every cell, both DXA
    const total = 9360;
    const widths = Array(n).fill(Math.floor(total / n));
    widths[0] = total - widths.slice(1).reduce((a, b) => a + b, 0);

    const mkCell = (text, isHeader, w) => new TableCell({
      width: { size: w, type: WidthType.DXA },
      shading: isHeader ? { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' }
                        : { type: ShadingType.CLEAR, fill: 'FFFFFF', color: 'auto' },
      margins: { top: 90, bottom: 90, left: 130, right: 130 },
      children: [new Paragraph({
        spacing: { before: 0, after: 0 },
        children: isHeader
          ? [new TextRun({ text: text.replace(/\*\*/g, ''), bold: true, size: 18,
                           color: 'FFFFFF', font: 'Calibri' })]
          : runs(text, { size: 19 }),
      })],
    });

    body.push(new Table({
      columnWidths: widths,
      width: { size: total, type: WidthType.DXA },
      borders: {
        top:    { style: BorderStyle.SINGLE, size: 2, color: LINE },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        left:   { style: BorderStyle.SINGLE, size: 2, color: LINE },
        right:  { style: BorderStyle.SINGLE, size: 2, color: LINE },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: LINE },
      },
      rows: [
        new TableRow({
          tableHeader: true,
          children: header.map((c, k) => mkCell(c, true, widths[k])),
        }),
        ...rows.map((r) => new TableRow({
          children: Array.from({ length: n },
            (_, k) => mkCell(r[k] === undefined ? '' : r[k], false, widths[k])),
        })),
      ],
    }));
    body.push(new Paragraph({ children: [], spacing: { after: 180 } }));
    continue;
  }

  // blockquote — the "why it works this way" notes. Rendered as an amber
  // panel, because in the guide they are the explanation of a refusal and
  // should read as an aside rather than as body text.
  if (line.startsWith('>')) {
    const quote = [];
    while (i < lines.length && lines[i].trim().startsWith('>')) {
      quote.push(lines[i].replace(/^\s*>\s?/, '')); i++;
    }
    const paras = quote.join('\n').split(/\n\s*\n/).filter((p) => p.trim());
    body.push(new Table({
      columnWidths: [9360],
      width: { size: 9360, type: WidthType.DXA },
      borders: {
        top:    { style: BorderStyle.SINGLE, size: 2, color: 'E5CE9A' },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E5CE9A' },
        left:   { style: BorderStyle.SINGLE, size: 18, color: CYAN },
        right:  { style: BorderStyle.SINGLE, size: 2, color: 'E5CE9A' },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical:   { style: BorderStyle.NONE },
      },
      rows: [new TableRow({ children: [new TableCell({
        width: { size: 9360, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: AMBBG, color: 'auto' },
        margins: { top: 150, bottom: 150, left: 200, right: 200 },
        children: paras.map((p, k) => new Paragraph({
          spacing: { before: k ? 120 : 0, after: 0 },
          children: runs(p.replace(/\n/g, ' ').trim(), { size: 19, color: AMBER }),
        })),
      })] })],
    }));
    body.push(new Paragraph({ children: [], spacing: { after: 180 } }));
    continue;
  }

  // fenced code
  if (line.trim().startsWith('```')) {
    i++;
    const code = [];
    while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i++; }
    i++;
    body.push(new Table({
      columnWidths: [9360],
      width: { size: 9360, type: WidthType.DXA },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        left: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        right: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [new TableRow({ children: [new TableCell({
        width: { size: 9360, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: HDRBG, color: 'auto' },
        margins: { top: 130, bottom: 130, left: 180, right: 180 },
        children: code.map((c) => new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: c || ' ', font: 'Consolas', size: 17, color: NAVY })],
        })),
      })] })],
    }));
    body.push(new Paragraph({ children: [], spacing: { after: 180 } }));
    continue;
  }

  // indented block (the workflow arrows in the guide)
  if (/^ {4}\S/.test(raw)) {
    const block = [];
    while (i < lines.length && (/^ {4}/.test(lines[i]) || !lines[i].trim())) {
      if (!lines[i].trim() && !(/^ {4}/.test(lines[i + 1] || ''))) break;
      block.push(lines[i].replace(/^ {4}/, '')); i++;
    }
    block.forEach((c) => body.push(new Paragraph({
      spacing: { before: 0, after: 0 },
      indent: { left: convertInchesToTwip(0.3) },
      children: [new TextRun({ text: c || ' ', font: 'Consolas', size: 18, color: NAVY })],
    })));
    body.push(new Paragraph({ children: [], spacing: { after: 160 } }));
    continue;
  }

  // bullets
  if (/^\s*[-*]\s+/.test(line)) {
    const text = line.replace(/^\s*[-*]\s+/, '');
    body.push(new Paragraph({
      numbering: { reference: 'affinity-bullets', level: 0 },
      spacing: { before: 40, after: 40 },
      children: runs(text),
    }));
    i++; continue;
  }

  // numbered
  if (/^\s*\d+\.\s+/.test(line)) {
    const text = line.replace(/^\s*\d+\.\s+/, '');
    body.push(new Paragraph({
      numbering: { reference: 'affinity-numbers', level: 0 },
      spacing: { before: 40, after: 40 },
      children: runs(text),
    }));
    i++; continue;
  }

  // blank
  if (!line.trim()) { i++; continue; }

  // ordinary paragraph — gather continuation lines
  const para = [line];
  i++;
  while (i < lines.length && lines[i].trim() &&
         !/^(#{1,6}\s|\||>|\s*[-*]\s|\s*\d+\.\s|---+$|```)/.test(lines[i].trim()) &&
         !/^ {4}\S/.test(lines[i])) {
    para.push(lines[i].trim()); i++;
  }
  const text = para.join(' ').trim();
  // an italic single-line aside, e.g. the "Part 2 continues with..." notes
  const isAside = /^\*[^*].*\*$/.test(text);
  body.push(new Paragraph({
    spacing: { before: 60, after: 120, line: 280 },
    children: isAside
      ? [new TextRun({ text: text.slice(1, -1), italics: true, size: 20, color: GREY })]
      : runs(text),
  }));
}

// ── document ─────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'Affinity',
  title: 'Affinity Core — User Guide',
  description: 'Internal user guide for Affinity Core. Contains no client data.',
  numbering: {
    config: [
      { reference: 'affinity-bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022',
                   alignment: AlignmentType.LEFT,
                   style: { paragraph: { indent: { left: 420, hanging: 260 } },
                            run: { color: CYAN } } }] },
      { reference: 'affinity-numbers',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.',
                   alignment: AlignmentType.LEFT,
                   style: { paragraph: { indent: { left: 420, hanging: 260 } },
                            run: { color: NAVY, bold: true } } }] },
    ],
  },
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 21, color: '222222' } },
    },
  },
  sections: [{
    properties: {
      titlePage: true,                            // no running header on the cover
      page: {
        size: { width: 12240, height: 15840 },   // US Letter
        margin: { top: 1100, bottom: 1000, left: 1440, right: 1440 },
      },
    },
    titlePage: true,
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 6 } },
        children: [
          new TextRun({ text: 'Affinity Core', bold: true, size: 16, color: NAVY }),
          new TextRun({ text: '   \u00b7   User Guide', size: 16, color: GREY }),
        ],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Internal  \u00b7  Version 2, September 2026  \u00b7  ',
                        size: 15, color: GREY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 15, color: NAVY, bold: true }),
        ],
      })] }),
    },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync('Affinity-Core-User-Guide.docx', buf);
  console.log('written: Affinity-Core-User-Guide.docx', (buf.length / 1024).toFixed(0) + ' KB');
});
