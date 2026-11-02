// Monte Carlo uncertainty of the GWP result and of the LEED reduction. Factors are shared where the uncertainty is shared:
// one quantity factor per BOQ line (both designs use the same take-off), one data factor per dataset (the same dataset in
// both designs moves both), one service-life factor per line. Defaults are screening assumptions the user can change.
import type { ProjectResult } from './calc.ts';
import type { DesignResult, LineResult, McSettings, Project } from './types.ts';

export const MC_DEFAULT: McSettings = {
  runs: 2000, sdQty: 0.1, sdLife: 0.2, sdDist: 0.3, seed: 42,
  sdSrc: { 'EPD': 0.1, 'EPD (CHECK note)': 0.25, 'ÖKOBAUDAT specific / average': 0.15, 'ÖKOBAUDAT generic': 0.2, 'ecoinvent': 0.2, 'IDEMAT': 0.25, 'End-of-life process': 0.3, 'Transport dataset': 0.15 },
};

export function srcClass(l: LineResult): string {
  const d = l.ds;
  if (!d) return 'IDEMAT';
  if (d.src === 'EPD') return d.n.startsWith('CHECK') ? 'EPD (CHECK note)' : 'EPD';
  if (d.src === 'ÖKOBAUDAT') return d.type === 'generic' ? 'ÖKOBAUDAT generic' : 'ÖKOBAUDAT specific / average';
  return d.src;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Log-normal multiplier with mean 1 and coefficient of variation cv. */
function lnFactor(cv: number, z: number) {
  if (cv <= 0) return 1;
  const s = Math.sqrt(Math.log(1 + cv * cv));
  return Math.exp(s * z - (s * s) / 2);
}

export interface McResult {
  runs: number;
  totals: Record<string, number[]>; // design id -> GWP per run (kg)
  change: Record<string, number[]>; // design id (not baseline) -> relative change vs baseline per run
  stats: Record<string, { p5: number; p50: number; p95: number; mean: number }>;
  changeStats: Record<string, { p5: number; p50: number; p95: number; mean: number; pLe5: number; pLe10: number; pLe20: number; pLe40: number }>;
  tornado: { label: string; swing: number }[]; // effect of ±1 sd of each factor on the proposed change (percentage points)
}

const pctl = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

export function runMonteCarlo(p: Project, r: ProjectResult, s: McSettings = MC_DEFAULT): McResult {
  const rand = rng(s.seed || 1);
  const sp = r.sp;
  const designs = r.designs;
  // factor registry
  const qtyKey = (l: LineResult) => `q|${l.key}`;
  const lifeKey = (l: LineResult) => `l|${l.key}`;
  const distKey = (l: LineResult) => `k|${l.key}`;
  const dsKey = (l: LineResult) => `d|${l.src}|${l.mat}`;
  const trKey = (l: LineResult) => `t|${l.a4}`;
  const eolKey = (l: LineResult) => `e|${l.eol}`;
  const cv = new Map<string, number>();
  const label = new Map<string, string>();
  const boqUnc = new Map(p.boq.map((b) => [b.id, b.unc ?? null] as const));
  for (const d of designs) for (const l of d.lines) {
    if (!l.active) continue;
    cv.set(qtyKey(l), boqUnc.get(l.key) ?? s.sdQty); label.set(qtyKey(l), `Quantity: ${l.desc || 'line ' + l.pos}`);
    // service-life uncertainty only for parts that are replaced within the study period (a frame designed for the whole
    // period is not replaced because its life is uncertain)
    cv.set(lifeKey(l), l.rsl > 0 && l.rsl < sp ? s.sdLife : 0); label.set(lifeKey(l), `Service life: ${l.desc || 'line ' + l.pos}`);
    cv.set(distKey(l), s.sdDist); label.set(distKey(l), `A4 distance: ${l.desc || 'line ' + l.pos}`);
    cv.set(dsKey(l), s.sdSrc[srcClass(l)] ?? 0.2); label.set(dsKey(l), `Data: ${l.mat.replace('CHECK – ', '').slice(0, 60)}`);
    if (l.a4) { cv.set(trKey(l), s.sdSrc['Transport dataset'] ?? 0.15); label.set(trKey(l), `Transport data: ${l.a4.slice(0, 50)}`); }
    if (!l.hasC && l.eol) { cv.set(eolKey(l), s.sdSrc['End-of-life process'] ?? 0.3); label.set(eolKey(l), `End-of-life data: ${l.eol.slice(0, 50)}`); }
  }
  const keys = [...cv.keys()];
  const idx = new Map(keys.map((k, i) => [k, i] as const));
  const nRuns = Math.max(100, Math.min(20000, s.runs | 0));
  const totals: Record<string, number[]> = Object.fromEntries(designs.map((d) => [d.designId, new Array(nRuns)]));
  const z = new Float64Array(keys.length);
  const f = new Float64Array(keys.length);
  const cvArr = keys.map((k) => cv.get(k)!);
  const lineTot = (l: LineResult, F: (k: string) => number) => {
    const q = F(qtyKey(l)), dd = F(dsKey(l));
    const a13 = l.cycle.a13[0] * q * dd;
    const a4 = l.cycle.a4[0] * q * F(distKey(l)) * (l.a4 ? F(trKey(l)) : 1);
    const c = l.cycle.c[0] * q * (l.hasC ? dd : l.eol ? F(eolKey(l)) : 1);
    let repl = l.repl;
    // replacements move continuously around the deterministic count (no jump when the life crosses a divisor of the period)
    if (l.rsl > 0 && l.rsl < sp) { const life = l.rsl * F(lifeKey(l)); repl = Math.max(0, l.repl + sp / life - sp / l.rsl); }
    return (l.reuse ? 0 : a13) + a4 + c + repl * (a13 + a4 + c);
  };
  for (let run = 0; run < nRuns; run++) {
    for (let i = 0; i < keys.length; i++) { z[i] = gauss(rand); f[i] = lnFactor(cvArr[i], z[i]); }
    const F = (k: string) => { const i = idx.get(k); return i == null ? 1 : f[i]; };
    for (const d of designs) {
      let t = 0;
      for (const l of d.lines) if (l.active) t += lineTot(l, F);
      totals[d.designId][run] = t;
    }
  }
  const baseId = r.base.designId;
  const change: Record<string, number[]> = {};
  for (const d of designs) if (d.designId !== baseId) change[d.designId] = totals[d.designId].map((v, i) => (v - totals[baseId][i]) / totals[baseId][i]);
  const st = (arr: number[]) => { const s2 = [...arr].sort((a, b) => a - b); return { p5: pctl(s2, 0.05), p50: pctl(s2, 0.5), p95: pctl(s2, 0.95), mean: arr.reduce((a, b) => a + b, 0) / arr.length }; };
  const stats = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, st(v)]));
  const changeStats = Object.fromEntries(Object.entries(change).map(([k, v]) => {
    const frac = (t: number) => v.filter((x) => x <= t).length / v.length;
    return [k, { ...st(v), pLe5: frac(-0.05), pLe10: frac(-0.1), pLe20: frac(-0.2), pLe40: frac(-0.4) }];
  }));
  // tornado: effect of moving one factor by ±1 sd on the proposed change (others at their mean)
  const tornado: { label: string; swing: number }[] = [];
  const pr = r.prop;
  const evalChange = (key: string, mult: number) => {
    const F = (k: string) => (k === key ? mult : 1);
    let B = 0, P = 0;
    for (const l of r.base.lines) if (l.active) B += lineTot(l, F);
    for (const l of pr.lines) if (l.active) P += lineTot(l, F);
    return (P - B) / B;
  };
  if (pr.designId !== baseId && r.base.total[0] > 0) {
    for (const k of keys) {
      const c = cv.get(k)!;
      if (!c) continue;
      const hi = evalChange(k, lnFactor(c, 1)), lo = evalChange(k, lnFactor(c, -1));
      tornado.push({ label: label.get(k)!, swing: Math.abs(hi - lo) * 100 });
    }
    tornado.sort((a, b) => b.swing - a.swing);
  }
  return { runs: nRuns, totals, change, stats, changeStats, tornado: tornado.slice(0, 12) };
}

export function designById(r: ProjectResult, id: string): DesignResult | undefined {
  return r.designs.find((d) => d.designId === id);
}
