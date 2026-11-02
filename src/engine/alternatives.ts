// Lower-carbon alternatives for a line, and the portfolio of swaps for a whole design (what-if).
import type { ProjectResult } from './calc.ts';
import { calcLine, resolveLine } from './calc.ts';
import { Library } from './library.ts';
import { kwClass, normUnit } from './rules.ts';
import type { Choice, Dataset, Design, Project, Src } from './types.ts';

export interface Alt {
  ds: Dataset;
  gwp: number; // line GWP A1–C4 with this dataset (kg CO2e)
  saving: number; // current − alternative (kg CO2e), > 0 = lower
  qaOk: boolean; // the swap needs no extra input (unit converts, kg known)
}

export interface AltOptions {
  sources?: Src[];
  sameClass?: boolean;
  hideExpired?: boolean;
  hideCheck?: boolean;
  geo?: string; // country filter, e.g. "SA" (empty = any)
  limit?: number;
  assessDate: string;
}

// Like for like: the same material class is not enough (IDEMAT 'Glass bottles' and float glass share a class), so an
// alternative must also be a building product of the same kind, and a concrete at least the same strength class.
const NOT_BUILDING = /bottle|packag|\bjar\b|\bcups?\b|\bcans?\b|food|beverage|tableware|container glass|\btoys?\b|crate|\bpallet/i;
const AGGREGATE = /aggregate|crushed|gravel|\bsand\b|granulate|\bballast\b/i;
const FLAT_GLASS = /float|flat glass|glazing|glazed|laminated|tempered|toughened|insulat|\bigu\b|low[- ]?e|pane|window|curtain|fa[cç]ade|mirror/i;
const PROCESS_ONLY = /^(tempering|coating|cutting|grinding|polishing|welding|sheet rolling|section bar|wire drawing|drawing of|impact extrusion|powder coating|zinc coating|anodi[sz])/i;
const INSULATION = [/rock ?wool|stone ?wool|mineral wool|glass ?wool|glasswool/i, /\beps\b|expanded polystyrene/i, /\bxps\b|extruded polystyrene/i,
  /\bpir\b|\bpur\b|polyiso|polyurethane|phenolic/i, /cellulose|zellulose|wood ?fib|hemp|flax|\bcork\b|straw/i, /foam ?glass|cellular glass/i];
const NON_STRUCTURAL = /roller[- ]?compacted|\brcc\b|\blean\b|blinding|screed|no[- ]?fines|foam(ed)? concrete|lightweight|mortar|grout/i;
export function strengthOf(name: string): number | null {
  const m = /\bC\s?(\d{2,3})(?:\s?\/\s?\d{2,3})?\b/.exec(name) ?? /\b(\d{2,3})\s?(?:MPa|N\/mm)/i.exec(name);
  return m ? Number(m[1]) : null;
}
export function comparable(curName: string, cls: string, alt: Dataset): boolean {
  const n = alt.n;
  if (NOT_BUILDING.test(n) && !NOT_BUILDING.test(curName)) return false;
  if (AGGREGATE.test(n) && !AGGREGATE.test(curName)) return false;
  if (PROCESS_ONLY.test(n) && !PROCESS_ONLY.test(curName)) return false;
  const ins = INSULATION.findIndex((rx) => rx.test(curName));
  if (ins >= 0 && !INSULATION[ins].test(n)) return false;
  if (/glass/i.test(cls) && FLAT_GLASS.test(curName) && !FLAT_GLASS.test(n)) return false;
  if (/concrete/i.test(cls)) {
    if (NON_STRUCTURAL.test(n) && !NON_STRUCTURAL.test(curName)) return false;
    const s0 = strengthOf(curName);
    if (s0 != null) { const s1 = strengthOf(n); if (s1 == null || s1 < s0) return false; }
  }
  return true;
}

function expired(d: Dataset, at: string) {
  const v = Library.validUntil(d);
  return !!v && (d.src === 'ÖKOBAUDAT' ? Number(v.slice(0, 4)) < Number(at.slice(0, 4)) : v < at);
}

/** Alternatives for one line of one design, cheapest in GWP first. */
export function lineAlternatives(p: Project, r: ProjectResult, lib: Library, design: Design, lineKey: string, o: AltOptions): Alt[] {
  const di = p.designs.findIndex((d) => d.id === design.id);
  const dr = r.designs[di];
  const line = dr?.lines.find((l) => l.key === lineKey);
  if (!line) return [];
  const boq = p.boq.find((b) => b.id === lineKey) ?? null;
  const extra = design.extra.find((x) => x.id === lineKey);
  const ch: Choice = extra ?? design.choices[lineKey] ?? {};
  const pos = line.pos;
  const cls = line.ds?.cls || kwClass(line.desc || boq?.item || '');
  const sources = (o.sources ?? (['EPD', 'ÖKOBAUDAT', 'ecoinvent', 'IDEMAT'] as Src[])).filter((s) => lib.has(s));
  const bu = normUnit(boq?.unit ?? '');
  const boqMass = bu === 'kg' || bu === 't' || (boq?.kgpu ?? 0) > 0;
  const cur = line.active ? line.tot[0] : Infinity;
  const out: Alt[] = [];
  for (const s of sources) {
    for (const d of lib.materials(s)) {
      if (o.sameClass !== false && d.cls !== cls) continue;
      if ((d.a[0] ?? 0) <= 0) continue;
      if (o.hideExpired && expired(d, o.assessDate)) continue;
      if (o.hideCheck && d.n.startsWith('CHECK')) continue;
      if (o.geo && !(d.geo ?? '').toUpperCase().includes(o.geo.toUpperCase())) continue;
      if (d.n === line.mat && d.src === line.src) continue;
      if (line.active && !comparable(line.mat, cls, d)) continue;
      const du = normUnit(d.u);
      const convertible = !boq || du === bu || ((Library.kgOf(d) ?? 0) > 0 && boqMass);
      if (!convertible) continue;
      const res = resolveLine(lib, r.truckName, boq, { ...ch, src: d.src, mat: d.n }, lineKey, pos, !!extra);
      const lr = calcLine(r.ctx, res);
      if (!(lr.kgpu > 0) && lr.qty > 0) continue;
      out.push({ ds: d, gwp: lr.tot[0], saving: cur === Infinity ? 0 : cur - lr.tot[0], qaOk: lr.kgpu > 0 });
    }
  }
  out.sort((a, b) => a.gwp - b.gwp);
  return out.slice(0, o.limit ?? 40);
}

export interface Opportunity {
  lineKey: string;
  pos: number;
  desc: string;
  elem: string;
  current: { src: string; n: string; gwp: number };
  best: Alt;
  sameSource: Alt | null; // best with the same data source (keeps the comparison like for like)
}

/** For every line of a design: the lowest-GWP dataset of the same class (and of the same source). */
export function opportunities(p: Project, r: ProjectResult, lib: Library, design: Design, o: AltOptions): Opportunity[] {
  const di = p.designs.findIndex((d) => d.id === design.id);
  const dr = r.designs[di];
  const out: Opportunity[] = [];
  for (const l of dr.lines) {
    if (!l.active || l.tot[0] <= 0) continue;
    const alts = lineAlternatives(p, r, lib, design, l.key, { ...o, limit: 200 });
    if (!alts.length || alts[0].saving <= 0) continue;
    const same = alts.find((a) => a.ds.src === l.src && a.saving > 0) ?? null;
    out.push({ lineKey: l.key, pos: l.pos, desc: l.desc, elem: l.elem, current: { src: l.src, n: l.mat, gwp: l.tot[0] }, best: alts[0], sameSource: same });
  }
  out.sort((a, b) => b.best.saving - a.best.saving);
  return out;
}
