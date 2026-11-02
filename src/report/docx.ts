// Word export of the report (.docx), written in the browser with the `docx` library. Same blocks as the preview, laid out
// like the Excel tool's Word export (v7.0): Calibri, green headings, cover, contents that Word updates, Word tables,
// charts as pictures, header and footer with page numbers.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, HeightRule, ImageRun, LineRuleType, Packer, PageNumber, Paragraph,
  ShadingType, Tab, Table, TableCell, TableLayoutType, TableOfContents, TableRow, TabStopType, TextRun, VerticalAlignTable, WidthType,
  type IBorderOptions, type ParagraphChild,
} from 'docx';
import type { Block, Cell, ReportMeta } from './model.ts';
import { chartPng } from '../ui/components/Chart.tsx';
import { figure1Png, FIG_H, FIG_W } from './Figure1.tsx';
import { tocEntries } from './ReportView.tsx';

const TW = 9626; // text width in twips: A4 11906 − 2 × 1140
const PX = 641; // text width in pixels (481 pt)
const C = {
  ink: '1F2A24', ink2: '52514E', muted: '898781', dark: '17402B', green: '2A7A4B', light: 'E3EFE7', line: 'D6DFD9',
  tile: 'F4F8F5', tot: 'EEF4F0', good: '006300', bad: 'B3261E', warn: 'B45309', white: 'FFFFFF', sep: 'E7ECE8',
};
const TONE: Record<string, string> = { good: C.good, bad: C.bad, warn: C.warn, muted: C.muted };
const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const LINE: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: C.line };

function bytes(dataUrl: string): Uint8Array {
  const b = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 });
    im.onerror = () => res({ w: 1, h: 1 });
    im.src = url;
  });
}

const run = (text: string, o: { size?: number; bold?: boolean; italic?: boolean; color?: string } = {}) =>
  new TextRun({ text, size: o.size, bold: o.bold, italics: o.italic, color: o.color });

export function wordHeading(toc: string): string {
  const m = /^(\d+(?:\.\d+)?)\s+(.*)$/.exec(toc);
  if (m) return (m[1].includes('.') ? `${m[1]} ` : `${m[1]}. `) + m[2];
  const a = /^(Appendix [A-Z])\s+(.*)$/.exec(toc);
  if (a) return `${a[1]} – ${a[2]}`;
  return toc;
}

function cellPara(c: Cell, size: number, head = false): Paragraph {
  const o = typeof c === 'string' ? { text: c } : c;
  const align = head || o.align === 'c' ? AlignmentType.CENTER : o.align === 'r' ? AlignmentType.RIGHT : AlignmentType.LEFT;
  return new Paragraph({
    alignment: align, spacing: { before: 0, after: 0 },
    children: [run(o.text, { size, bold: head || o.bold, color: head ? C.dark : o.tone ? TONE[o.tone] : undefined })],
  });
}

function widthsOf(rel: number[]): number[] {
  const sum = rel.reduce((a, x) => a + x, 0);
  const w = rel.map((x) => Math.round((x / sum) * TW));
  w[w.length - 1] += TW - w.reduce((a, x) => a + x, 0);
  return w;
}

function dataTable(head: string[] | null, rows: Cell[][], rel: number[], o: { size?: number; total?: Cell[] } = {}): Table {
  const ws = widthsOf(rel), size = o.size ?? 17;
  const mk = (cells: Cell[], kind: 'head' | 'body' | 'total') => new TableRow({
    tableHeader: kind === 'head', cantSplit: true,
    children: cells.map((c, j) => new TableCell({
      width: { size: ws[j], type: WidthType.DXA },
      margins: { top: 35, bottom: 35, left: 70, right: 70 },
      verticalAlign: kind === 'head' ? VerticalAlignTable.CENTER : VerticalAlignTable.TOP,
      shading: kind === 'head' ? { type: ShadingType.CLEAR, color: 'auto', fill: C.light } : kind === 'total' ? { type: ShadingType.CLEAR, color: 'auto', fill: C.tot } : undefined,
      borders: kind === 'total' ? { top: { style: BorderStyle.SINGLE, size: 6, color: C.green }, bottom: { style: BorderStyle.SINGLE, size: 6, color: C.green }, left: LINE, right: LINE } : undefined,
      children: [cellPara(kind === 'total' && typeof c === 'string' ? { text: c, bold: true } : c, size, kind === 'head')],
    })),
  });
  const trs: TableRow[] = [];
  if (head) trs.push(mk(head, 'head'));
  for (const r of rows) trs.push(mk(r, 'body'));
  if (o.total) trs.push(mk(o.total, 'total'));
  return new Table({
    rows: trs, width: { size: TW, type: WidthType.DXA }, columnWidths: ws, layout: TableLayoutType.FIXED,
    borders: { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE },
  });
}

function kvTable(rows: [string, string][], o: { labelPct?: number; center?: boolean; labelRight?: boolean; size?: number } = {}): Table {
  const lp = o.labelPct ?? 27;
  const total = o.center ? Math.round(TW * 0.78) : TW;
  const ws = [Math.round((total * lp) / 100), total - Math.round((total * lp) / 100)];
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: ws, layout: TableLayoutType.FIXED,
    alignment: o.center ? AlignmentType.CENTER : undefined,
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideVertical: NONE, insideHorizontal: o.center ? NONE : { style: BorderStyle.SINGLE, size: 4, color: C.sep } },
    rows: rows.map(([k, v]) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({ width: { size: ws[0], type: WidthType.DXA }, margins: { top: 50, bottom: 50, left: 0, right: 140 },
          children: [new Paragraph({ alignment: o.labelRight ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: 0 }, children: [run(k, { bold: true, size: 19, color: o.center ? C.ink2 : C.dark })] })] }),
        new TableCell({ width: { size: ws[1], type: WidthType.DXA }, margins: { top: 50, bottom: 50, left: 60, right: 0 },
          children: [new Paragraph({ spacing: { after: 0 }, children: [run(v, { size: o.size ?? 19 })] })] }),
      ],
    })),
  });
}

function tilesTable(items: Extract<Block, { t: 'tiles' }>['items']): Table {
  const ws = widthsOf([1, 1, 0.8, 1.1]);
  const white: IBorderOptions = { style: BorderStyle.SINGLE, size: 24, color: C.white };
  return new Table({
    width: { size: TW, type: WidthType.DXA }, columnWidths: ws, layout: TableLayoutType.FIXED,
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: white },
    rows: [new TableRow({
      cantSplit: true,
      children: items.map((x, j) => new TableCell({
        width: { size: ws[j], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.tile },
        margins: { top: 90, bottom: 100, left: 140, right: 100 },
        children: [
          new Paragraph({ spacing: { after: 30 }, children: [run(x.lab, { size: 15, bold: true, color: C.ink2 })] }),
          new Paragraph({ spacing: { after: 20 }, children: [run(x.val, { size: 32, bold: true, color: x.tone ? TONE[x.tone] : C.ink })] }),
          new Paragraph({ spacing: { after: 0 }, children: [run(x.sub || ' ', { size: 17, color: C.ink2 })] }),
        ],
      })),
    })],
  });
}

function declTable(meta: ReportMeta): Table {
  const ws = widthsOf([17, 38, 15, 30]);
  const under: IBorderOptions = { style: BorderStyle.SINGLE, size: 6, color: C.ink2 };
  const cell = (text: string, j: number, lab: boolean) => new TableCell({
    width: { size: ws[j], type: WidthType.DXA }, verticalAlign: VerticalAlignTable.BOTTOM,
    margins: { top: 0, bottom: 40, left: j === 2 ? 200 : 40, right: 40 },
    borders: { top: NONE, left: NONE, right: NONE, bottom: lab ? NONE : under },
    children: [new Paragraph({ spacing: { after: 0 }, children: [run(text, lab ? { bold: true, size: 19, color: C.dark } : { size: 20 })] })],
  });
  return new Table({
    width: { size: TW, type: WidthType.DXA }, columnWidths: ws, layout: TableLayoutType.FIXED,
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
    rows: [['Prepared by', meta.declBy, 'Date', meta.declDate], ['Signature', '', 'Reviewed by', '']].map((r) => new TableRow({
      height: { value: 640, rule: HeightRule.ATLEAST }, cantSplit: true,
      children: r.map((t, j) => cell(t, j, j % 2 === 0)),
    })),
  });
}

async function coverChildren(meta: ReportMeta): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];
  const line = (text: string, size: number, o: { bold?: boolean; color?: string; after?: number; before?: number } = {}) =>
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: o.before ?? 0, after: o.after ?? 0 }, children: [run(text, { size, bold: o.bold, color: o.color })] });
  if (meta.logo) {
    const { w, h } = await imageSize(meta.logo);
    const k = Math.min(260 / w, 120 / h);
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 900, after: 0 },
      children: [new ImageRun({ type: meta.logo.startsWith('data:image/jpeg') ? 'jpg' : 'png', data: bytes(meta.logo), transformation: { width: Math.round(w * k), height: Math.round(h * k) } })],
    }));
  }
  out.push(line(meta.title, 52, { bold: true, color: C.dark, before: meta.logo ? 1000 : 3000, after: 40 }));
  out.push(line(meta.subtitle, 30, { color: C.ink2, after: 80 }));
  out.push(new Paragraph({ spacing: { after: 560 }, indent: { left: Math.round(TW * 0.3), right: Math.round(TW * 0.3) }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.green, space: 1 } }, children: [] }));
  out.push(line(meta.project, 40, { bold: true, after: 160 }));
  out.push(line(meta.system, 32, { bold: true, color: C.green, after: 80 }));
  out.push(line(meta.credit, 21, { color: C.ink2, after: 1000 }));
  if (meta.facts.length) out.push(kvTable(meta.facts, { labelPct: 45, center: true, labelRight: true, size: 21 }));
  out.push(line(meta.prepared, 17, { color: C.muted, before: 1400 }));
  return out;
}

export async function exportDocx(blocks: Block[], meta: ReportMeta): Promise<Blob> {
  const body: (Paragraph | Table | TableOfContents)[] = [];
  let pendingBreak = false;
  const para = (children: ParagraphChild[], o: Record<string, unknown> = {}) => {
    const p = new Paragraph({ ...o, pageBreakBefore: pendingBreak || undefined, children });
    pendingBreak = false;
    body.push(p);
  };
  const beforeTable = () => {
    if (pendingBreak) para([], { spacing: { before: 0, after: 0 }, run: { size: 2 } });
  };
  for (const b of blocks) {
    switch (b.t) {
      case 'cover': body.push(...(await coverChildren(meta))); break;
      case 'toc': {
        para([run('Contents', { size: 36, bold: true, color: C.dark })], { spacing: { after: 280 } });
        body.push(new TableOfContents('Contents', {
          hyperlink: true, headingStyleRange: '1-2',
          cachedEntries: tocEntries(blocks).map((e) => ({ title: wordHeading(e.label), level: e.level === 2 ? 2 : 1 })),
        }));
        break;
      }
      case 'break': if (b.word) pendingBreak = true; break;
      case 'h1': para([run(wordHeading(b.toc))], { heading: HeadingLevel.HEADING_1 }); break;
      case 'h2': para([run(b.toc ? wordHeading(b.toc) : b.text)], { heading: b.toc ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 }); break;
      case 'p': {
        const o = b.tone === 'note' ? { size: 17, italic: true, color: C.muted } : b.tone === 'small' ? { size: 18, color: C.ink2 } : {};
        para([run(b.text, o)], b.bullet ? { bullet: { level: 0 } } : {});
        break;
      }
      case 'kv': beforeTable(); body.push(kvTable(b.rows)); para([], { spacing: { after: 60 } }); break;
      case 'tiles': beforeTable(); body.push(tilesTable(b.items)); para([], { spacing: { after: 60 } }); break;
      case 'table':
        if (b.caption) para([run(b.caption)], { style: 'Caption', keepNext: true });
        else beforeTable();
        body.push(dataTable(b.head, b.rows, b.widths, { size: b.small ? 16 : 17, total: b.total }));
        para([], { spacing: { after: 60 } });
        break;
      case 'chart': {
        const png = await chartPng(b.option, 642, b.h);
        para([run(b.title, { bold: true, size: 19, color: C.dark })], { keepNext: true, spacing: { before: 120, after: 40 } });
        para([new ImageRun({ type: 'png', data: bytes(png), transformation: { width: PX, height: Math.round((b.h * PX) / 642) } })], { spacing: { after: 120 } });
        break;
      }
      case 'figure': {
        const png = await figure1Png();
        para([new ImageRun({ type: 'png', data: bytes(png), transformation: { width: PX, height: Math.round((FIG_H * PX) / FIG_W) } })], { keepNext: true, spacing: { after: 40 } });
        para([run(b.caption)], { style: 'Caption' });
        break;
      }
      case 'decl': beforeTable(); body.push(declTable(meta)); break;
    }
  }
  const hf = (children: ParagraphChild[]) => new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: TW }], children });
  const doc = new Document({
    creator: meta.footer, title: `${meta.title} – ${meta.project}`, description: meta.system,
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 20, color: C.ink }, paragraph: { spacing: { after: 100, line: 259, lineRule: LineRuleType.AUTO } } },
        heading1: { run: { font: 'Calibri', size: 28, bold: true, color: C.dark }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true, keepLines: true, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.green, space: 2 } } } },
        heading2: { run: { font: 'Calibri', size: 23, bold: true, color: C.green }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true, keepLines: true, outlineLevel: 1 } },
        heading3: { run: { font: 'Calibri', size: 21, bold: true, color: C.dark }, paragraph: { spacing: { before: 200, after: 60 }, keepNext: true, keepLines: true, outlineLevel: 2 } },
      },
      paragraphStyles: [
        { id: 'Caption', name: 'caption', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 19, bold: true, color: C.green }, paragraph: { spacing: { before: 60, after: 160 } } },
        { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal', run: { size: 22 }, paragraph: { spacing: { before: 80, after: 40 } } },
        { id: 'TOC2', name: 'toc 2', basedOn: 'Normal', next: 'Normal', run: { size: 20 }, paragraph: { spacing: { after: 30 }, indent: { left: 440 } } },
        { id: 'Header', name: 'header', basedOn: 'Normal', run: { size: 16, color: C.ink2 }, paragraph: { spacing: { after: 0 } } },
        { id: 'Footer', name: 'footer', basedOn: 'Normal', run: { size: 16, color: C.ink2 }, paragraph: { spacing: { after: 0 } } },
      ],
    },
    sections: [{
      properties: {
        titlePage: true,
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1280, bottom: 1160, left: 1140, right: 1140, header: 560, footer: 560 } },
      },
      headers: {
        default: new Header({ children: [hf([run(meta.header, { size: 16, color: C.ink2 }), new TextRun({ children: [new Tab(), meta.project], size: 16, color: C.ink2 })])] }),
        first: new Header({ children: [new Paragraph({ children: [] })] }),
      },
      footers: {
        default: new Footer({ children: [hf([run(meta.footer, { size: 16, color: C.ink2 }), new TextRun({ children: [new Tab(), 'Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: C.ink2 })])] }),
        first: new Footer({ children: [new Paragraph({ children: [] })] }),
      },
      children: body,
    }],
  });
  return Packer.toBlob(doc);
}
