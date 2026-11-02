// Calculation engine: a line-by-line port of the Excel bill-of-materials formulas (build_tool.py bom_formulas / bom_defaults,
// v7.1) and the Results sheet (build_part2.py). Verified against LibreOffice-recalculated Excel builds (tools/verify.ts).
import { Library } from './library.ts';
import { leedSys, normUnit, SITE_KW, FIT_KW, EP_INDEX, type LeedSys } from './rules.ts';
import { computeLeed } from './leed.ts';
import type {
  BoqLine, Choice, Dataset, Design, DesignResult, Ind8, LeedResult, LineResult, Project, Src, Stage,
} from './types.ts';

const Z = (): Ind8 => [0, 0, 0, 0, 0, 0, 0, 0];
const N = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k) && (o as any)[k] !== undefined;
const eqi = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const NON_EP = [0, 1, 2, 6, 7]; // GWP ODP AP POCP ADPf
const IND_KEYS = ['GWP', 'ODP', 'AP', 'EPfw', 'EPm', 'EPt', 'POCP', 'ADPf'];

/** Excel ROUNDUP(x, 0) for x > 0, with Excel's 15-digit precision. */
const roundUp = (x: number) => Math.ceil(Number(x.toPrecision(15)));

export interface ProjectResult {
  sp: number;
  sys: LeedSys;
  assessDate: string;
  epIndex: number;
  truck: Ind8;
  truckFound: boolean;
  grid: Ind8;
  gridDs: Dataset | null;
  designs: DesignResult[];
  base: DesignResult;
  prop: DesignResult;
  leed: LeedResult;
  optionLeed: Record<string, LeedResult>;
  boqXst: Record<string, string>; // EP fallback status per BOQ line
  ctx: LineCtx; // for single-line what-if calculations (alternatives, Monte Carlo)
  truckName: string;
}

export interface EpFallback {
  st: string; // '' | OK | not found | has no kg per unit | has no EP-marine
  ep: [number, number, number]; // EPfw, EPm, EPt per kg
}

export function epFallback(lib: Library, b: BoqLine | null): EpFallback {
  const none: EpFallback = { st: '', ep: [0, 0, 0] };
  if (!b || !b.epx || !b.epx.n) return none;
  const d = lib.get(b.epx.src, b.epx.n) ?? lib.anyName(b.epx.n);
  if (!d) return { st: 'not found in the libraries', ep: [0, 0, 0] };
  const xkg = d.kg && d.kg > 0 ? d.kg : normUnit(d.u) === 'kg' ? 1 : 0;
  if (!xkg) return { st: 'has no kg per unit', ep: [0, 0, 0] };
  const ep: [number, number, number] = [N(d.a[3]) / xkg, N(d.a[4]) / xkg, N(d.a[5]) / xkg];
  if (ep[1] <= 0) return { st: 'has no EP-marine', ep };
  return { st: 'OK', ep };
}

export interface Resolved {
  key: string;
  pos: number;
  isExtra: boolean;
  boq: BoqLine | null;
  ch: Choice;
  elem: string;
  desc: string;
  pair: string;
  src: Src | '';
  mat: string;
  ds: Dataset | null;
  unit: string;
  kgin: number | null;
  kgpu: number;
  qty: number | null;
  qtyFromBoq: boolean;
  rsl: number | null;
  a4: string;
  dist: number | null;
  eol: string;
  modd: string;
  reuse: boolean;
}

export function resolveLine(lib: Library, setupTruck: string, b: BoqLine | null, ch: Choice, key: string, pos: number, isExtra: boolean): Resolved {
  const item = b?.item ?? '';
  const src = (ch.src ?? '') as Src | '';
  const mat = ch.mat ?? '';
  const ds = mat ? lib.material(src, mat) : null;
  const unit = !mat ? '' : ds ? (ds.src === 'IDEMAT' ? ds.u.trim() : ds.u) : '?';
  const bu = b?.unit ?? '';
  const sameUnit = (u: string) => bu === '' || normUnit(u) === normUnit(bu);
  const kgin = has(ch, 'kgin') ? (ch.kgin ?? null) : !item || !(N(b?.kgpu) > 0) ? null : sameUnit(unit) ? (b!.kgpu as number) : null;
  let kgpu = 0;
  if (mat) {
    const isKg = normUnit(unit) === 'kg';
    if (ds && ds.src !== 'IDEMAT' && N(ds.kg) > 0) kgpu = ds.kg as number;
    else kgpu = isKg ? 1 : N(kgin);
  }
  let qty: number | null;
  const qtyFromBoq = !isExtra && !has(ch, 'qty');
  if (!qtyFromBoq) qty = ch.qty ?? null;
  else if (!(N(b?.qty) !== 0)) qty = null;
  else if (unit === '' || unit === '?' || bu === '' || normUnit(unit) === normUnit(bu)) qty = b!.qty;
  else {
    const mf = normUnit(bu) === 'kg' ? 1 : normUnit(bu) === 't' ? 1000 : N(b!.kgpu);
    qty = mf > 0 && kgpu > 0 ? (b!.qty as number) * mf / kgpu : b!.qty;
  }
  return {
    key, pos, isExtra, boq: b, ch,
    elem: has(ch, 'elem') ? ch.elem ?? '' : item ? b?.elem ?? '' : '',
    desc: has(ch, 'desc') ? ch.desc ?? '' : item,
    pair: has(ch, 'pair') ? ch.pair ?? '' : item,
    src, mat, ds, unit, kgin, kgpu, qty, qtyFromBoq,
    rsl: has(ch, 'rsl') ? ch.rsl ?? null : item ? b?.rsl ?? null : null,
    a4: has(ch, 'a4') ? ch.a4 ?? '' : item ? setupTruck : '',
    dist: has(ch, 'dist') ? ch.dist ?? null : item ? b?.dist ?? null : null,
    eol: ch.eol ?? '',
    modd: ch.modd ?? '',
    reuse: ch.reuse === true,
  };
}

function designLines(lib: Library, p: Project, d: Design, truckName: string): Resolved[] {
  const out: Resolved[] = [];
  p.boq.forEach((b, i) => out.push(resolveLine(lib, truckName, b, d.choices[b.id] ?? {}, b.id, i + 1, false)));
  d.extra.forEach((x, i) => out.push(resolveLine(lib, truckName, null, x, x.id, p.boq.length + i + 1, true)));
  return out;
}

export interface LineCtx {
  lib: Library;
  sys: LeedSys;
  sp: number;
  epIndex: number;
  epMin: number;
  truck: Ind8;
  c2km: number;
  elemSet: Set<string>;
  fb: Record<string, EpFallback>;
}

/** Pass 1 of the engine for one line: factors, stages, module D, scope notes (QA text needs the other design: pass 2). */
export function calcLine(ctx: LineCtx, r: Resolved): LineResult {
  const { lib, sys, sp, epIndex, epMin, truck, c2km, elemSet, fb } = ctx;
  const ds = r.ds;
  const active = r.mat !== '';
  const found = !!ds;
  const raw: Ind8 = ds ? ds.a.map(N) : Z();
  const hasC: 0 | 1 | 2 = ds && ds.c && ds.src === 'EPD' && ds.c[0] != null ? 1 : ds && ds.c && ds.src === 'ÖKOBAUDAT' && ds.c[0] != null ? 2 : 0;
  const f = raw.slice();
  const qty = N(r.qty);
  // eutrophication gap and fallback
  const xf = r.boq ? fb[r.boq.id] : { st: '', ep: [0, 0, 0] as [number, number, number] };
  const selRaw = raw[epIndex];
  const epgap = active && found && (selRaw === 0 || (raw[4] > 0 && raw[4] / Math.max(raw[0], 1e-30) < epMin));
  const epx = epgap && xf.st === 'OK' && r.kgpu > 0;
  if (epx) { f[3] = xf.ep[0] * r.kgpu; f[4] = xf.ep[1] * r.kgpu; f[5] = xf.ep[2] * r.kgpu; }
  const mkg = qty * r.kgpu;
  const rsl = N(r.rsl);
  const repl = !active ? 0 : rsl <= 0 ? 0 : Math.max(0, roundUp(sp / rsl) - 1);
  const tr = lib.transport(r.a4);
  const trf: Ind8 = tr ? tr.a.map(N) : Z();
  const eolDs = hasC === 0 ? lib.eol(r.eol) : null;
  const isObdEol = !!eolDs && eolDs.src === 'ÖKOBAUDAT';
  const c2k = isObdEol && /c2/i.test(eolDs!.mods ?? '') ? 0 : 1;
  const eolF: Ind8 = !eolDs ? Z() : isObdEol ? (eolDs.c ?? []).map(N).concat(Z()).slice(0, 8) : eolDs.a.map(N);
  const st: Record<Stage, Ind8> = { A13: Z(), A4: Z(), B45: Z(), C14: Z() };
  const tot = Z();
  const cyc = { a13: Z(), a4: Z(), c: Z() };
  for (let i = 0; i < 8; i++) {
    const a13full = active ? qty * f[i] : 0;
    const a13 = active && !r.reuse ? qty * f[i] : 0;
    const a4 = (mkg / 1000) * N(r.dist) * trf[i];
    let c14: number;
    if (hasC === 1 || hasC === 2) c14 = qty * N(ds!.c![i]);
    else c14 = mkg * eolF[i] + c2k * (mkg / 1000) * c2km * truck[i];
    const b45 = repl * (a13full + a4 + c14);
    st.A13[i] = a13; st.A4[i] = a4; st.B45[i] = b45; st.C14[i] = c14;
    tot[i] = a13 + a4 + b45 + c14;
    cyc.a13[i] = a13full; cyc.a4[i] = a4; cyc.c[i] = c14;
  }
  // module D (GWP)
  let modD = 0;
  if (active) {
    const dIdm = lib.get('IDEMAT', r.modd);
    const idmD = mkg * (1 + repl) * (dIdm ? N(dIdm.a[0]) : 0);
    if (ds && (ds.src === 'EPD' || ds.src === 'ÖKOBAUDAT') && ds.dGwp != null) modD = qty * (1 + repl) * ds.dGwp;
    else modD = idmD;
  }
  // scope notes (info)
  let adv = '';
  if (active) {
    if (r.elem !== '' && !elemSet.has(r.elem)) adv += `Element is not in the ${sys.sys} list: check the scope; `;
    if (r.elem === 'Other in-scope (explain)' && !(r.boq?.ref ?? '')) adv += 'Explain Other in-scope in the BOQ notes; ';
    if (sys.sys === 'BD+C') {
      const dl = r.desc.toLowerCase();
      if (r.elem.slice(0, 4) !== 'Roof' && SITE_KW.some((k) => dl.includes(k)))
        adv += 'Site paving or surface parking is outside the BD+C scope (parking structures are in); ';
      if (FIT_KW.some((k) => dl.includes(k))) adv += 'Interior fit-out item: outside the BD+C minimum scope, include only on purpose; ';
    }
    if (epx) adv += 'EP from the BOQ fallback dataset; ';
  }
  return {
    key: r.key, pos: r.pos, isExtra: r.isExtra, active, elem: r.elem, desc: r.desc, pair: r.pair, src: r.src, mat: r.mat, unit: r.unit,
    qty, qtyFromBoq: r.qtyFromBoq, kgpu: r.kgpu, mass: active ? (qty * r.kgpu) / 1000 : 0, reuse: r.reuse, rsl, repl, a4: r.a4,
    dist: N(r.dist), eol: r.eol, modd: r.modd, ds, found, hasC, f, raw, stages: st, tot, modD, epgap, epx,
    qaraw: '', adv, qa: '', stat: '', srcchk: '', pdelta: null,
    cls: ds ? ds.cls : '',
    label: active ? (r.desc || (r.src === 'IDEMAT' ? r.mat.slice(r.mat.indexOf(' ') + 1) : r.mat)).slice(0, 42) : '',
    cycle: cyc,
    // stash for pass 2
    ...({ _r: r, _tr: tr, _eol: eolDs, _xst: xf.st } as object),
  } as LineResult;
}

export function studyPeriod(p: Project): number {
  const sys = leedSys(p.setup.system);
  return p.setup.studyPeriod != null && Number.isFinite(p.setup.studyPeriod) ? p.setup.studyPeriod : sys.minSp;
}

export function computeProject(p: Project, lib: Library, todayIso: string): ProjectResult {
  const s = p.setup;
  const sys = leedSys(s.system);
  const sp = studyPeriod(p);
  const assessDate = s.assessmentDate || todayIso;
  const assessYear = Number(assessDate.slice(0, 4));
  const epIndex = EP_INDEX[s.epIndicator] ?? 4;
  const epMin = lib.lists.epMarineGwpMin || 1e-5;
  const truckName = s.truck?.n ?? '';
  const truckDs = lib.transport(truckName);
  const truck: Ind8 = truckDs ? truckDs.a.map(N) : Z();
  const c2km = N(s.c2km);
  const elemSet = new Set(sys.elems);

  // EP fallback per BOQ line
  const fb: Record<string, EpFallback> = {};
  for (const b of p.boq) fb[b.id] = epFallback(lib, b);

  // pass 1: resolve and calculate every line of every design
  const resolved = p.designs.map((d) => designLines(lib, p, d, truckName));
  const ctx: LineCtx = { lib, sys, sp, epIndex, epMin, truck, c2km, elemSet, fb };
  const lineCalc = resolved.map((rows) => rows.map((r) => calcLine(ctx, r)));

  // pass 2: cross-design checks (pair / source), QA text, pair change
  const iBase = Math.max(0, p.designs.findIndex((d) => d.kind === 'baseline'));
  const iProp = p.designs.findIndex((d) => d.kind === 'proposed');
  const otherOf = (k: number) => (k === iBase ? (iProp >= 0 ? iProp : -1) : iBase);
  const pairSums = (k: number) => {
    const m = new Map<string, number>();
    for (const l of lineCalc[k]) if (l.pair !== '') m.set(l.pair.toLowerCase(), (m.get(l.pair.toLowerCase()) ?? 0) + l.tot[0]);
    return m;
  };
  const baseSums = pairSums(iBase);
  const sumsCache = new Map<number, Map<string, number>>();

  lineCalc.forEach((rows, k) => {
    const o = otherOf(k);
    const oth = o >= 0 ? lineCalc[o] : [];
    const othPairs = new Map<string, { n: number; srcs: string[] }>();
    for (const l of oth) {
      if (l.pair === '') continue;
      const kk = l.pair.toLowerCase();
      const e = othPairs.get(kk) ?? { n: 0, srcs: [] };
      e.n++; e.srcs.push(l.src.toLowerCase());
      othPairs.set(kk, e);
    }
    const cmpK = k === iBase ? (iProp >= 0 ? iProp : k) : k; // pair change: proposed (or this option) minus baseline
    if (!sumsCache.has(cmpK)) sumsCache.set(cmpK, pairSums(cmpK));
    const cmpSums = sumsCache.get(cmpK)!;
    const seen = new Set<string>();
    for (const l of rows) {
      const r = (l as any)._r as Resolved;
      const tr = (l as any)._tr as Dataset | null;
      const eolDs = (l as any)._eol as Dataset | null;
      const xst = (l as any)._xst as string;
      delete (l as any)._r; delete (l as any)._tr; delete (l as any)._eol; delete (l as any)._xst;
      if (!l.active) { seen.add(l.pair.toLowerCase()); continue; }
      // source vs other design
      if (l.pair === '') l.srcchk = 'No pair ID';
      else {
        const e = othPairs.get(l.pair.toLowerCase());
        if (!e) l.srcchk = 'Only in this design';
        else l.srcchk = e.srcs.filter((x) => x === l.src.toLowerCase()).length === e.n ? 'Same source' : 'DIFFERENT source';
      }
      // QA notes (same order and wording as the Excel 'Data QA notes', sheet names replaced by library names)
      const ds = l.ds;
      let q = '';
      if (l.src === '') q += 'Select data source; ';
      if (!ds) q += `Name not found in ${l.src === 'EPD' ? 'the EPD library' : l.src || 'IDEMAT'}; `;
      if (l.qty > 0 && l.kgpu === 0) q += 'Enter kg/unit; ';
      for (const i of NON_EP) if (l.f[i] === 0) q += `${IND_KEYS[i]}=0; `;
      const b = r.boq;
      if (r.qtyFromBoq && b && N(b.qty) > 0 && l.unit !== '' && l.unit !== '?' && (b.unit ?? '') !== '' && normUnit(l.unit) !== normUnit(b.unit)) {
        const mf = normUnit(b.unit) === 'kg' ? 1 : normUnit(b.unit) === 't' ? 1000 : N(b.kgpu);
        if (mf === 0 || l.kgpu === 0)
          q += `BOQ unit ${b.unit} differs from dataset unit ${l.unit}: give kg per unit on the BOQ or type the quantity; `;
      }
      if (l.epgap && !l.epx) {
        q += l.raw[4] > 0 && l.raw[3] > 0 && l.raw[5] > 0 ? 'EP-marine low' : 'No EP data';
        q += xst === '' ? ': add an EP fallback on the BOQ; ' : xst !== 'OK' ? `: EP fallback ${xst}; ` : ': EP fallback needs kg per unit; ';
      }
      if (ds && ds.src === 'EPD') {
        if (ds.valid && ds.valid < assessDate) q += 'EPD expired; ';
        if (ds.gwpi === 'GWP-total' && ds.std !== 'EN 15804+A1') q += 'EPD GWP-total incl. biogenic – use GWP-fossil+luc; ';
        if (ds.std === 'EN 15804+A1') q += 'A1 EPD – only GWP/ODP/ADPf comparable; ';
        if (l.mat.startsWith('CHECK')) q += 'EPD marked CHECK – read its library note; ';
      }
      if (l.a4 === '') q += 'No A4 transport; ';
      else if (!tr) q += 'A4 transport not found; ';
      if (l.hasC === 0) {
        if (l.eol === '') q += 'No end-of-life; ';
        else if (!eolDs) q += 'End-of-life process not found; ';
      }
      if (l.srcchk === 'DIFFERENT source') q += 'Source differs from other design; ';
      if (ds && ds.src === 'ÖKOBAUDAT') {
        const expired = ds.vy != null && ds.vy < assessYear;
        const noA = ds.a[0] == null;
        const warn = ds.warn ?? '';
        if (expired || noA || warn) q += `ÖKOBAUDAT: ${expired ? `Expired ${ds.vy}; ` : ''}${noA ? 'No A1-A3; ' : ''}${warn}; `;
      }
      l.qaraw = q;
      l.stat = q === '' ? (l.adv === '' ? '✓' : 'ℹ') : `⚠ ${(q.match(/;/g) ?? []).length}`;
      l.qa = q === '' ? (l.adv === '' ? 'OK' : 'ℹ ' + l.adv) : q + (l.adv === '' ? '' : ' ℹ ' + l.adv);
      // pair change vs baseline (t CO2e), on the first line of each pair
      const pk = l.pair.toLowerCase();
      if (l.pair !== '' && !seen.has(pk)) l.pdelta = ((cmpSums.get(pk) ?? 0) - (baseSums.get(pk) ?? 0)) / 1000;
      seen.add(pk);
    }
  });

  // design totals
  const gridDs = gridDataset(p, lib);
  const grid = gridFactors(p, lib, gridDs);
  const designs: DesignResult[] = p.designs.map((d, k) => summarise(d, lineCalc[k], p, sp, grid, k === iBase ? s.kwhBase : s.kwhProp));
  const base = designs[iBase];
  const prop = iProp >= 0 ? designs[iProp] : designs[iBase];
  const leed = computeLeed(sys, sp, base, prop, s.epIndicator);
  const optionLeed: Record<string, LeedResult> = {};
  designs.forEach((dr, k) => { if (k !== iBase) optionLeed[dr.designId] = computeLeed(sys, sp, base, dr, s.epIndicator); });
  const boqXst: Record<string, string> = {};
  for (const b of p.boq) boqXst[b.id] = fb[b.id].st;
  return { sp, sys, assessDate, epIndex, truck, truckFound: !!truckDs, grid, gridDs, designs, base, prop, leed, optionLeed, boqXst, ctx, truckName };
}

function gridDataset(p: Project, lib: Library): Dataset | null {
  const g = lib.lists.grid.find((x) => x.label === p.setup.grid);
  return g ? lib.get(g.src, g.n) : null;
}

/** B6 grid factors per kWh (Setup C36:C43): custom, ecoinvent per kWh, or IDEMAT per MJ × 3.6. */
export function gridFactors(p: Project, lib: Library, ds?: Dataset | null): Ind8 {
  const s = p.setup;
  if ((s.grid ?? '').startsWith('Custom')) return Array.from({ length: 8 }, (_, i) => N(s.customGrid?.[i]));
  const d = ds === undefined ? gridDataset(p, lib) : ds;
  if (!d) return Z();
  return d.src === 'ecoinvent' ? d.a.map(N) : d.a.map((v) => N(v) * 3.6);
}

function summarise(d: Design, lines: LineResult[], p: Project, sp: number, grid: Ind8, kwh: number | null): DesignResult {
  const stage: Record<Stage, Ind8> = { A13: Z(), A4: Z(), B45: Z(), C14: Z() };
  const total = Z();
  let modD = 0, qaCount = 0, infoCount = 0, okCount = 0, epxCount = 0, diffSrc = 0, reuseCount = 0, expiredCount = 0, noEolCount = 0;
  let epdRows = 0, obdRows = 0, eiRows = 0;
  const srcGwp: Record<Src, number> = { EPD: 0, IDEMAT: 0, 'ÖKOBAUDAT': 0, ecoinvent: 0 };
  let used = 0, withData = 0, gapGwp = 0;
  for (const l of lines) {
    for (const s of ['A13', 'A4', 'B45', 'C14'] as Stage[]) for (let i = 0; i < 8; i++) stage[s][i] += l.stages[s][i];
    for (let i = 0; i < 8; i++) total[i] += l.tot[i];
    modD += l.modD;
    const isUsed = (!l.isExtra && !!p.boq[l.pos - 1]?.item) || l.active;
    if (isUsed) { used++; if (l.found) withData++; }
    if (!l.active) continue;
    if (l.qaraw !== '') qaCount++;
    else if (l.adv !== '') infoCount++;
    else okCount++;
    if (l.epx) epxCount++;
    if (l.epgap && !l.epx) gapGwp += l.tot[0];
    if (l.srcchk === 'DIFFERENT source') diffSrc++;
    if (l.reuse) reuseCount++;
    if (l.qa.includes('EPD expired')) expiredCount++;
    if (l.qa.includes('No end-of-life')) noEolCount++;
    if (l.src === 'EPD') epdRows++;
    if (l.src === 'ÖKOBAUDAT') obdRows++;
    if (l.src === 'ecoinvent') eiRows++;
    if (l.src) srcGwp[l.src] += l.tot[0];
  }
  const g = total[0];
  const srcShare = Object.fromEntries((Object.keys(srcGwp) as Src[]).map((k) => [k, g === 0 ? 0 : srcGwp[k] / g])) as Record<Src, number>;
  const b6 = grid.map((x) => N(kwh) * sp * x);
  return {
    designId: d.id, name: d.name, kind: d.kind, lines, stage, total, modD, qaCount, infoCount, okCount,
    cov: used === 0 ? 0 : withData / used, epcov: g <= 0 ? 1 : 1 - gapGwp / g, epxCount, srcShare, diffSrc, reuseCount, expiredCount,
    noEolCount, epdRows, obdRows, eiRows, b6,
  };
}

/** Life-cycle stage sums of one line set (helper for charts). */
export function stageTotals(lines: LineResult[], i = 0) {
  const o = { A13: 0, A4: 0, B45: 0, C14: 0 };
  for (const l of lines) for (const s of ['A13', 'A4', 'B45', 'C14'] as Stage[]) o[s] += l.stages[s][i];
  return o;
}
