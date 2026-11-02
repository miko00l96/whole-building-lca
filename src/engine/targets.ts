// What each LEED path (and each published benchmark) asks of the proposed design, against what the calculation reads, with
// the margin. Used by the Results sheet ("the targets") and by Chase, which pins one standard to the title bar.
import type { ProjectResult } from './calc.ts';
import { BENCHMARKS } from './benchmarks.ts';

export interface Criterion {
  label: string;
  asks: string;
  reads: string;
  margin: string;
  ok: boolean | null; // null = cannot be read yet
  slack: number; // > 0 met with room, < 0 short; comparable within one standard only
}

export interface Standard {
  id: string;
  name: string;
  kind: 'leed' | 'bench';
  points: string;
  met: boolean;
  note?: string;
  rows: Criterion[];
  gwp?: number; // GWP change the standard asks for (−0.2 = 20 % lower), drawn on the ruler
}

const pc = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const tt = (kg: number) => `${Math.round(Math.abs(kg) / 1000).toLocaleString('en-US')} t`;

export function targets(r: ProjectResult, area: number): Standard[] {
  const L = r.leed, sys = r.sys, base = r.base.total[0], prop = r.prop.total[0];
  const ch = L.change[0];
  const both = base > 0 && prop > 0;
  const gwpRow = (t: number): Criterion => {
    if (ch == null || !both) return { label: 'GWP reduction', asks: `≥ ${pc(t, 0)}`, reads: '–', margin: 'fill both designs', ok: null, slack: -1 };
    const red = -ch, d = red - t;
    return { label: 'GWP reduction', asks: `≥ ${pc(t, 0)}`, reads: pc(red), ok: d >= -1e-12, slack: d,
      margin: d >= 0 ? `+${(d * 100).toFixed(1)} pts · ${tt(d * base)} spare` : `−${(-d * 100).toFixed(1)} pts · ${tt(-d * base)} to go` };
  };
  const countRow = (label: string, need: number, have: number, of: number): Criterion => ({
    label, asks: `${need} of ${of}`, reads: `${have} of ${of}`, ok: have >= need, slack: (have - need) / of, margin: have >= need ? `+${have - need}` : `−${need - have}`,
  });
  const capRow = (): Criterion => {
    const mx = L.maxIncrease;
    if (mx == null) return { label: 'Largest increase', asks: '≤ 5%', reads: '–', margin: '', ok: null, slack: -1 };
    return { label: 'Largest increase of a category', asks: '≤ 5%', reads: mx <= 0 ? 'none' : `+${pc(mx)}`, ok: mx <= 0.05, slack: 0.05 - mx,
      margin: mx <= 0.05 ? `${((0.05 - mx) * 100).toFixed(1)} pts spare` : `${((mx - 0.05) * 100).toFixed(1)} pts over` };
  };
  const reuseRow = (): Criterion => ({ label: 'Reused or salvaged materials', asks: 'some', reads: r.prop.reuseCount ? `${r.prop.reuseCount} line${r.prop.reuseCount === 1 ? '' : 's'}` : 'none',
    ok: r.prop.reuseCount > 0, slack: r.prop.reuseCount > 0 ? 1 : -1, margin: r.prop.reuseCount > 0 ? '' : 'tick Reuse on a proposed line' });
  const spRow = (): Criterion => ({ label: 'Study period', asks: `≥ ${sys.minSp} years`, reads: `${r.sp} years`, ok: L.spOk, slack: (r.sp - sys.minSp) / sys.minSp, margin: L.spOk ? '' : `${sys.minSp - r.sp} years short` });
  const doneRow = (label: string, ok: boolean): Criterion => ({ label, asks: 'yes', reads: ok ? 'yes' : 'not yet', ok, slack: ok ? 1 : -1, margin: '' });
  const P = L.paths.map((p) => p.met);
  const out: Standard[] = [];
  if (sys.sys === 'ID+C') {
    out.push({ id: 'idc-p1', name: 'Path 1 · interiors LCA', kind: 'leed', points: '1 point', met: P[0], rows: [doneRow('Proposed design calculated', prop > 0), spRow()] });
    out.push({ id: 'idc-p2', name: 'Path 2 · compared with a baseline', kind: 'leed', points: '2 points', met: P[1], rows: [doneRow('Baseline calculated', base > 0), doneRow('Proposed design calculated', prop > 0), spRow()] });
    out.push({ id: 'idc-p3', name: 'Path 3 · lower impact and reuse', kind: 'leed', points: '3 points', met: P[2], gwp: -0.2,
      rows: [gwpRow(0.2), countRow('Other categories ≥ 10% lower', 2, L.other10, 5),
        { label: 'Categories higher than the baseline', asks: 'at most 1', reads: String(L.higherCount), ok: L.higherCount <= 1, slack: (1 - L.higherCount) / 6, margin: L.higherCount <= 1 ? '' : `${L.higherCount - 1} too many` },
        reuseRow(), spRow()] });
    const cov = Math.min(r.base.cov, r.prop.cov);
    out.push({ id: 'idc-data', name: 'Data coverage', kind: 'leed', points: 'required', met: cov >= 0.95, note: 'Life-cycle data for at least 95% of the materials, or a narrative.',
      rows: [{ label: 'BOQ lines with life-cycle data', asks: '≥ 95%', reads: pc(cov, 0), ok: cov >= 0.95, slack: cov - 0.95, margin: cov >= 0.95 ? '' : `${Math.ceil((0.95 - cov) * 100)} pts short` }] });
  } else {
    const v4 = sys.ver === 'v4';
    if (!v4) {
      out.push({ id: 'bdc-p2', name: 'Path 2', kind: 'leed', points: '2 points', met: P[1], gwp: -0.05, rows: [gwpRow(0.05), countRow('Categories ≥ 5% lower, GWP among them', 3, L.red5, 6), capRow(), spRow()] });
      out.push({ id: 'bdc-p3', name: 'Path 3', kind: 'leed', points: '3 points', met: P[2], gwp: -0.1, rows: [gwpRow(0.1), countRow('Categories ≥ 10% lower, GWP among them', 3, L.red10, 6), capRow(), spRow()] });
      out.push({ id: 'bdc-p4', name: 'Path 4', kind: 'leed', points: '4 points', met: P[3], gwp: -0.2,
        rows: [gwpRow(0.2), countRow('Other categories ≥ 10% lower', 2, L.other10, 5), capRow(), reuseRow(), spRow()] });
    }
    out.push({ id: 'bdc-o4', name: v4 ? 'Option 4' : 'LEED v4 Option 4', kind: 'leed', points: '3 points', met: P[4], gwp: -0.1,
      note: v4 ? undefined : 'Same calculation, read against the LEED v4 credit.', rows: [gwpRow(0.1), countRow('Other categories ≥ 10% lower', 2, L.other10, 5), capRow(), spRow()] });
  }
  // published benchmarks, for context
  const inten = area > 0 ? prop / area : null;
  for (const b of BENCHMARKS) {
    const domestic = b.id.endsWith('-d');
    if (domestic) continue;
    const goal = b.lines[b.lines.length - 1];
    out.push({
      id: `bench-${b.id}`, name: b.label, kind: 'bench', points: 'context', met: inten != null && inten <= goal.v, note: `${b.scope}. ${b.source}.`,
      rows: b.lines.map((ln) => ({
        label: ln.label, asks: `≤ ${ln.v} kg/m²`, reads: inten == null ? 'enter the area' : `${Math.round(inten)} kg/m²`, ok: inten == null ? null : inten <= ln.v,
        slack: inten == null ? -1 : (ln.v - inten) / ln.v, margin: inten == null ? '' : inten <= ln.v ? `${Math.round(ln.v - inten)} spare` : `${Math.round(inten - ln.v)} over`,
      })),
    });
  }
  return out;
}

/** The criterion to show when a standard is chased: the first one not met, else the one with the least room. */
export function worstRow(s: Standard): Criterion | null {
  const open = s.rows.filter((x) => x.ok === false || x.ok === null);
  if (open.length) return open[0];
  return [...s.rows].sort((a, b) => a.slack - b.slack)[0] ?? null;
}
