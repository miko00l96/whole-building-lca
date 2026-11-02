// Report sentences, recommendations and contractor tables (Chart_Data report helpers and Contractor sheet of the Excel
// tool, build_part3.py v7.1).
import type { ProjectResult } from './calc.ts';
import { pathTarget } from './leed.ts';
import { shortName, EP_UNIT, EP_NAME } from './rules.ts';
import type { LineResult, Project } from './types.ts';

const CAT_PROSE = ['Global Warming', 'Ozone Depletion', 'Acidification', 'Eutrophication', 'Photochemical Ozone Formation', 'Resource Depletion (Fossil)'];
export const pct2 = (x: number) => `${(x * 100).toFixed(2)}%`;
export const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
export const chg1 = (x: number | null | undefined) =>
  x == null ? 'n/a' : `${x > 0 ? '▲' : x < 0 ? '▼' : ''} ${Math.abs(x * 100).toFixed(1)}%`.trim();
export const fmt0 = (x: number) => Math.round(x).toLocaleString('en-US');
export const fmt1 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Join "a, b, c" as "a, b, and c" (Excel andify()). */
export function andify(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export interface Conclusions {
  elig: string; // eligibility sentence (A136)
  intro: string; // A137
  results: string; // A138
  increases: string; // A139
  summary: string; // A140 = elig + QA note
}

export function conclusions(r: ProjectResult, p: Project): Conclusions {
  const L = r.leed;
  const ch = L.six.map((x) => x.change);
  const nums = ch.filter((x): x is number => x != null);
  const ge10 = ch.map((c, i) => (c != null && c <= -0.1 ? i : -1)).filter((i) => i >= 0);
  const in510 = ch.map((c, i) => (c != null && c <= -0.05 && c > -0.1 ? i : -1)).filter((i) => i >= 0);
  const up5 = ch.map((c, i) => (c != null && c > 0.05 ? i : -1)).filter((i) => i >= 0);
  const higher = ch.map((c, i) => (c != null && c > 0 ? i : -1)).filter((i) => i >= 0);
  const names10 = andify(ge10.map((i) => CAT_PROSE[i]));
  const vals10 = andify(ge10.map((i) => pct2(-(ch[i] as number))));
  const list510 = andify(in510.map((i) => `${CAT_PROSE[i]} (${pct2(-(ch[i] as number))})`));
  const listUp5 = andify(up5.map((i) => `${CAT_PROSE[i]} (+${pct2(ch[i] as number)})`));
  const listHigher = andify(higher.map((i) => `${CAT_PROSE[i]} (+${pct2(ch[i] as number)})`));
  const P = L.paths.map((x) => x.met);
  const CR_IDC = "LEED v4.1 ID+C credit 'Interiors Life-Cycle Impact Reduction', Option 3";
  const CR_BDC4 = "LEED v4 BD+C credit 'Building Life-Cycle Impact Reduction', Option 4";
  const CR41 = "LEED v4.1 credit 'Building Life-Cycle Impact Reduction'";
  let elig: string;
  if (L.sys === 'ID+C') {
    elig = P[2] ? `With the above findings, this LCA study therefore confirms eligibility for ${CR_IDC}, under Path 3 (3 points).`
      : P[1] ? `With the above findings, this LCA study confirms eligibility for ${CR_IDC}, under Path 2 (2 points): the interiors LCA was compared with a baseline, but the reductions or the reuse needed for Path 3 are not met.`
      : P[0] ? `With the above findings, the study meets Path 1 (1 point) of ${CR_IDC}: the interiors LCA was carried out, but the baseline comparison is not complete.`
      : 'The study does not yet meet the LEED v4.1 ID+C credit requirements: complete the proposed design (and the baseline for Path 2) and use a study period of at least 20 years.';
  } else if (L.ver === 'v4') {
    elig = P[4] ? `With the above findings, this LCA study therefore confirms eligibility for ${CR_BDC4}, whole-building life-cycle assessment (3 points).`
      : `The study does not yet meet ${CR_BDC4}: it needs GWP and two other categories at least 10% lower, no category more than 5% higher and a study period of at least 60 years.`;
  } else {
    elig = P[3] ? `With the above findings, this LCA study therefore confirms eligibility for ${CR41}, under Path 4 (4 points).`
      : P[2] ? `With the above findings, this LCA study therefore confirms eligibility for ${CR41}, under Path 3 (3 points).`
      : P[1] ? `With the above findings, this LCA study therefore confirms eligibility for ${CR41}, under Path 2 (2 points).`
      : P[0] ? `With the above findings, the study meets Path 1 (1 point) of ${CR41}: the whole-building LCA was carried out, but the reductions do not meet Path 2.`
      : 'The study does not yet meet the LEED v4.1 credit requirements: complete both designs and check the study period.';
  }
  const intro = `An LCA was conducted for ${p.setup.projectName || 'the project'}, where a baseline design was compared to a proposed design. The proposed design incorporated design decisions that aim to reduce the overall environmental impact of the ${L.sys === 'ID+C' ? 'interior fit-out' : 'building'}, with a focus on the material selection.`;
  let results: string;
  if (nums.length < 6) results = 'Results are incomplete: enter both designs to compare all six impact categories.';
  else if (ge10.length === 6) results = `It was found that the environmental impact reduction was greater than 10% for all of the impact categories assessed, being ${names10}. For these impact categories reductions of ${vals10} were observed, respectively.`;
  else if (ge10.length > 0) results = `It was found that the environmental impact reduction was greater than 10% for ${ge10.length} of the six impact categories assessed, being ${names10}, with reductions of ${vals10}, respectively.${in510.length ? ` A reduction of between 5% and 10% was found for ${list510}.` : ''}`;
  else if (in510.length > 0) results = `It was found that the environmental impact reduction was between 5% and 10% for ${list510}.`;
  else results = 'The proposed design did not reduce any impact category by 5% or more.';
  let increases = '';
  if (nums.length >= 6) {
    if (L.sys === 'ID+C') {
      increases = higher.length === 0 ? 'Notably, none of the impact categories assessed increased compared with the baseline.'
        : higher.length === 1 ? `An increase was observed only for ${listHigher}, which is within the Path 3 allowance of one category.${(L.maxIncrease ?? 0) > 0.05 ? ' The 5% limit on increases is a LEED v4.1 BD+C Option 2 requirement; the ID+C Path 3 requirement is that no more than one impact category increases compared with the baseline interiors project.' : ''}`
        : `However, increases were observed for ${listHigher}; Path 3 allows no more than one impact category to increase.`;
    } else {
      increases = up5.length === 0 ? 'Notably, an increase of greater than 5% was not observed for any of the impact categories assessed.'
        : `However, an increase of greater than 5% was observed for ${listUp5}, which rules out ${L.ver === 'v4' ? 'Option 4.' : 'Paths 2 to 4.'}`;
    }
  }
  const qa = r.base.qaCount + r.prop.qaCount;
  const summary = elig + (qa > 0 ? ` This result remains indicative until the ${qa} data QA notes in the bill of materials are resolved.` : '');
  return { elig, intro, results, increases, summary };
}

export interface Rec {
  pos: number;
  item: string;
  propMat: string;
  baseMat: string;
  saved: number; // t CO2e
  share: number | null;
  reuse: boolean;
  text: string;
}

/** Proposed lines that save GWP against their baseline pair, largest first (Chart_Data A345:A544 / 547-551). */
export function pairSavings(r: ProjectResult): { line: LineResult; saved: number }[] {
  const out: { line: LineResult; saved: number }[] = [];
  for (const l of r.prop.lines) if (l.active && l.pdelta != null && l.pdelta < -0.0005) out.push({ line: l, saved: -l.pdelta });
  out.sort((a, b) => b.saved + b.line.pos * 1e-9 - (a.saved + a.line.pos * 1e-9));
  return out;
}

export function recommendations(r: ProjectResult, p: Project, n = 5): Rec[] {
  const tot = r.base.total[0] / 1000 - r.prop.total[0] / 1000;
  return pairSavings(r).slice(0, n).map(({ line, saved }) => {
    const base = r.base.lines.find((b) => b.pair !== '' && b.pair.toLowerCase() === line.pair.toLowerCase());
    const share = tot > 0 ? saved / (tot) : null;
    const ps = shortName(line.mat, line.src), bs = base && base.mat ? shortName(base.mat, base.src) : '';
    const item = (line.desc || '').toLowerCase();
    const sh = share == null ? '' : `${Math.round(share * 100)}%`;
    let text: string;
    if (line.reuse) text = `Keep the planned reuse of the ${item} (reused or salvaged items: ${fmt0(saved)} t CO2e lower than new${sh ? `, ${sh} of the total reduction` : ''}).`;
    else if (ps === bs) text = `Keep the quantity saving on the ${item} (${fmt0(saved)} t CO2e lower than the baseline).`;
    else text = `Procure ${ps} for the ${item} instead of ${bs}: ${fmt0(saved)} t CO2e lower${sh ? ` (${sh} of the total reduction)` : ''}.`;
    return { pos: line.pos, item: line.desc, propMat: line.mat, baseMat: base?.mat ?? '', saved, share, reuse: line.reuse, text };
  });
}

export interface ConRow {
  pos: number;
  elem: string;
  desc: string;
  mat: string;
  src: string;
  baseMat: string;
  qty: number;
  unit: string;
  saved: number;
  share: number | null;
  fGwp: number;
  breakEven: number | null; // null = '–'
  todo: string;
}

/** Recommendations for the contractor (Contractor sheet): part A until 80 % of the line savings (+ any line > 5 % of the baseline), part B reused items. */
export function contractor(r: ProjectResult, _p: Project) {
  const target = pathTarget(r.leed);
  const H5 = r.base.total[0], M5 = r.prop.total[0];
  const margin = target == null || H5 <= 0 ? null : Math.max(0, H5 * (1 - target) - M5);
  const sav = pairSavings(r);
  const key = (x: { line: LineResult; saved: number }) => x.saved + (344 + x.line.pos) * 1e-9; // Chart_Data key: saving + ROW()*1E-9
  const P7 = sav.reduce((a, s) => a + key(s), 0);
  const P8 = H5 / 1000;
  const partA: ConRow[] = [];
  let cum = 0;
  for (let k = 0; k < Math.min(12, sav.length); k++) {
    const { line, saved } = sav[k];
    const take = k === 0 ? true : cum < 0.8 * P7 || key(sav[k]) > 0.05 * P8;
    cum += key(sav[k]);
    if (!take) continue;
    const base = r.base.lines.find((b) => b.pair !== '' && b.pair.toLowerCase() === line.pair.toLowerCase());
    partA.push({
      pos: line.pos, elem: line.elem, desc: line.desc,
      mat: line.src === 'EPD' ? line.mat.replace('CHECK – ', '') : shortName(line.mat, line.src), src: line.src,
      baseMat: base && base.mat ? shortName(base.mat, base.src) : '', qty: line.qty, unit: line.unit, saved,
      share: P7 > 0 ? saved / P7 : null, fGwp: line.f[0],
      breakEven: margin == null || line.reuse || line.qty === 0 ? null : line.f[0] + margin / (line.qty * (1 + line.repl)),
      todo: line.reuse ? 'Reuse / salvage as modelled' : line.src === 'EPD' ? 'Keep this EPD product' : 'Keep this material type',
    });
  }
  const partB: ConRow[] = r.prop.lines.filter((l) => l.active && l.reuse).map((line) => {
    const base = r.base.lines.find((b) => b.pair !== '' && b.pair.toLowerCase() === line.pair.toLowerCase());
    return {
      pos: line.pos, elem: line.elem, desc: line.desc, mat: line.src === 'EPD' ? line.mat.replace('CHECK – ', '') : shortName(line.mat, line.src),
      src: line.src, baseMat: base && base.mat ? shortName(base.mat, base.src) : '', qty: line.qty, unit: line.unit,
      saved: (line.qty * line.f[0]) / 1000, share: null, fGwp: line.f[0], breakEven: null, todo: 'Reuse / salvage as modelled',
    };
  });
  const coveredShare = P7 > 0 ? partA.reduce((a, x) => a + x.saved, 0) / P7 : 0;
  return { target, margin, totalSavings: P7, partA, partB, coveredShare };
}

export interface EpDriver {
  pos: number;
  item: string;
  base: number;
  prop: number;
  change: number;
  share: number | null;
  data: string;
  elem: string;
}

/** Top lines driving the change in the LEED eutrophication indicator (Results H40:P46). */
export function epDrivers(r: ProjectResult, p: Project, n = 5): { drivers: EpDriver[]; agree: boolean | null; direction: string; unit: string; name: string } {
  const i = r.epIndex;
  const bl = r.base.lines, pl = r.prop.lines;
  const m = Math.max(bl.length, pl.length);
  const rows: EpDriver[] = [];
  const net = r.prop.total[i] - r.base.total[i];
  for (let k = 0; k < m; k++) {
    const b = bl[k], q = pl[k];
    const be = b && b.active ? b.tot[i] : 0, pe = q && q.active ? q.tot[i] : 0;
    const change = pe - be;
    if (Math.abs(change) < 1e-9) continue;
    const boqItem = k < p.boq.length ? p.boq[k].item : '';
    const src = (l?: LineResult) => (!l || !l.active ? '–' : `${l.src}${l.epx ? '*' : ''}`);
    rows.push({ pos: k + 1, item: boqItem || b?.desc || '', base: be, prop: pe, change, share: Math.abs(net) < 1e-9 ? null : change / net,
      data: `${src(b)} → ${src(q)}`, elem: b?.elem ?? '' });
  }
  rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const c = [3, 4, 5].map((j) => r.leed.change[j]);
  const agree = c.some((x) => x == null) ? null : Math.sign(c[0]!) === Math.sign(c[1]!) && Math.sign(c[1]!) === Math.sign(c[2]!);
  const direction = c.some((x) => x == null) ? '–' : `marine ${chgTxt(c[1]!)} · freshwater ${chgTxt(c[0]!)} · terrestrial ${chgTxt(c[2]!)}`;
  return { drivers: rows.slice(0, n), agree, direction, unit: EP_UNIT[p.setup.epIndicator] ?? 'kg N eq', name: EP_NAME[p.setup.epIndicator] };
}

const chgTxt = (x: number) => `${x > 0 ? '▲' : x < 0 ? '▼' : ''} ${Math.abs(x * 100).toFixed(1)}%`.trim();

/** EP fallbacks in use, one text per BOQ line (report section 12). */
export function epFallbacksText(r: ProjectResult, p: Project): string {
  const parts: string[] = [];
  p.boq.forEach((b, k) => {
    const be = r.base.lines[k]?.epx, pe = r.prop.lines[k]?.epx;
    if (!be && !pe) return;
    const nm = b.epx?.n ?? '';
    const cut = nm.indexOf(' | ');
    parts.push(`line ${k + 1} (${b.item.slice(0, 40).toLowerCase()}): ${cut >= 0 ? nm.slice(0, cut) : nm.slice(0, 60)}${be && pe ? '' : ` (${be ? 'baseline' : 'proposed'} only)`}`);
  });
  return parts.length ? parts.join('; ') + '.' : '';
}
