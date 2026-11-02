// LEED results: six impact categories, checks and compliance paths (Results sheet rows 15-43 of the Excel tool, v7.1).
import type { LeedSys } from './rules.ts';
import { EP_INDEX, EP_NAME } from './rules.ts';
import type { DesignResult, EpKey, LeedResult, PathResult } from './types.ts';

const SIX = [
  ['Global warming potential', 'GWP', 0],
  ['Stratospheric ozone depletion', 'ODP', 1],
  ['Acidification', 'AP', 2],
  ['Eutrophication', 'EP', -1],
  ['Tropospheric ozone formation', 'POCP', 6],
  ['Non-renewable energy', 'ADPf', 7],
] as const;

export function computeLeed(sys: LeedSys, sp: number, base: DesignResult, prop: DesignResult, ep: EpKey): LeedResult {
  const epI = EP_INDEX[ep] ?? 4;
  const change = base.total.map((b, i) => (b === 0 ? null : (prop.total[i] - b) / b));
  const six = SIX.map(([name, ind, idx]) => {
    const i = idx < 0 ? epI : idx;
    const b = base.total[i], p = prop.total[i];
    const ch = b === 0 ? null : (p - b) / b;
    const plaus = ch == null ? '' : Math.abs(ch) >= 0.7 ? 'atypical ≥70%' : Math.abs(ch) >= 0.5 ? 'large ≥50%' : 'OK';
    return { name, ind: idx < 0 ? EP_NAME[ep] : ind, base: b, prop: p, change: ch, plaus };
  });
  const f = six.map((x) => x.change);
  const nums = f.filter((x): x is number => x != null);
  const red5 = nums.filter((x) => x <= -0.05).length;
  const red10 = nums.filter((x) => x <= -0.1).length;
  const other10 = f.slice(1).filter((x): x is number => x != null && x <= -0.1).length;
  const maxIncrease = nums.length === 0 ? null : Math.max(0, ...nums);
  const idc = sys.sys === 'ID+C';
  const higherCount = nums.filter((x) => x > 0).length;
  const noneUp = nums.length < 6 ? 'NO – incomplete' : idc ? (higherCount <= 1 ? 'YES' : 'NO') : Math.max(...nums) <= 0.05 ? 'YES' : 'NO';
  const reuse = prop.reuseCount > 0;
  const spOk = sp >= sys.minSp;
  const D17 = six[0].base, E17 = six[0].prop, F17 = f[0];
  const gwpLe = (t: number) => F17 != null && F17 <= t;
  let paths: PathResult[];
  if (idc) {
    const p1 = E17 > 0 && spOk;
    const p2 = D17 > 0 && E17 > 0 && spOk;
    const p3 = p2 && gwpLe(-0.2) && other10 >= 2 && noneUp === 'YES' && reuse;
    const data = Math.min(base.cov, prop.cov) >= 0.95;
    const boundary = base.noEolCount + prop.noEolCount === 0;
    paths = [
      { label: 'Path 1', points: '1', requirement: 'Interiors LCA of the full scope of work (incl. structure and enclosure if any); study period ≥ 20 years.', met: p1 },
      { label: 'Path 2', points: '2', requirement: 'Path 1 + baseline interiors project of comparable size, function, energy use and service life.', met: p2 },
      { label: 'Path 3', points: '3', requirement: 'Path 2 + reused/salvaged materials; GWP ≥20% and 2 other categories ≥10% lower; at most one category higher.', met: p3 },
      { label: 'Data', points: '–', requirement: 'Life-cycle data for at least 95% of the materials in the scope of work (otherwise explain in a narrative).', met: data },
      { label: 'Boundary', points: '–', requirement: 'A1–A3 at a minimum and cradle to grave in total: A1–A4, B4–B5 and C1–C4 on every line.', met: boundary },
    ];
  } else {
    const p1 = D17 > 0 && E17 > 0 && spOk;
    const p2 = gwpLe(-0.05) && red5 >= 3 && noneUp === 'YES' && spOk;
    const p3 = gwpLe(-0.1) && red10 >= 3 && noneUp === 'YES' && spOk;
    const p4 = gwpLe(-0.2) && other10 >= 2 && noneUp === 'YES' && reuse && spOk;
    const o4 = gwpLe(-0.1) && other10 >= 2 && noneUp === 'YES' && spOk;
    paths = [
      { label: 'Path 1', points: '1', requirement: 'Conduct a whole-building LCA of structure and enclosure.', met: p1 },
      { label: 'Path 2', points: '2', requirement: '≥5% reduction in at least 3 of 6 categories, one being GWP; no category up >5%.', met: p2 },
      { label: 'Path 3', points: '3', requirement: '≥10% reduction in at least 3 of 6 categories, one being GWP; no category up >5%.', met: p3 },
      { label: 'Path 4', points: '4', requirement: '≥20% GWP + ≥10% in 2 other categories + building reuse/salvage; no category up >5%.', met: p4 },
      { label: 'v4 Opt 4', points: '3', requirement: 'LEED v4 Option 4: ≥10% GWP + ≥10% in 2 other categories; no category up >5%.', met: o4 },
    ];
  }
  const P = paths.map((p) => p.met);
  const ptsBdc41 = idc ? 0 : P[3] ? 4 : P[2] ? 3 : P[1] ? 2 : P[0] ? 1 : 0;
  const ptsBdc4 = idc ? 0 : P[4] ? 3 : 0;
  const ptsIdc = idc ? (P[2] ? 3 : P[1] ? 2 : P[0] ? 1 : 0) : 0;
  const points = idc ? ptsIdc : sys.ver === 'v4' ? ptsBdc4 : ptsBdc41;
  const pathLabel = points === 0 ? 'no path met' : !idc && sys.ver === 'v4' ? 'Option 4' : `Path ${points}`;
  const otherPts = idc ? 'interiors LCA, 1–3 points' : sys.ver === 'v4' ? `v4.1 Option 2: ${ptsBdc41} points` : `v4 Option 4: ${ptsBdc4} points`;
  const qa = base.qaCount + prop.qaCount;
  const status = qa > 0
    ? 'INDICATIVE ONLY – resolve Data QA flags (add EPDs for flagged main materials, match data sources)'
    : 'All rows pass QA – confirm comparability and document every EPD';
  return {
    sys: sys.sys, ver: sys.ver, six, change, red5, red10, other10, maxIncrease, noneUp, reuse, spOk, paths, ptsBdc41, ptsBdc4, ptsIdc,
    points, pathLabel, otherPts, status,
    exemplary41: !idc && P[3] && F17 != null && F17 <= -0.4,
    exemplary4: !idc && f.filter((x) => x != null && x <= -0.1).length === 6,
    higherCount,
  };
}

/** GWP reduction needed by the path met now (Contractor sheet P5): ID+C P3 20 %; BD+C v4.1 P4 20 %, P3 10 %, P2 5 %; v4 Opt 4 10 %. */
export function pathTarget(l: LeedResult): number | null {
  const P = l.paths.map((p) => p.met);
  if (l.sys === 'ID+C') return P[2] ? 0.2 : null;
  if (l.ver === 'v4') return P[4] ? 0.1 : null;
  return P[3] ? 0.2 : P[2] ? 0.1 : P[1] ? 0.05 : null;
}
