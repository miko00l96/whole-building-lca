// Chart definitions shared by the dashboard, the insights page and the report.
import type { ProjectResult } from '../engine/calc.ts';
import type { DesignResult, LineResult, Project } from '../engine/types.ts';
import { PAL, SRC_COLOR, type EOption } from './components/Chart.tsx';
import { shortName } from '../engine/rules.ts';

const t = (kg: number) => kg / 1000;
const axisLab = { color: PAL.ink2, fontSize: 11.5 };
const gridLine = { lineStyle: { color: PAL.grid } };
const fmtT = (v: number) => Math.round(v).toLocaleString('en-US');
const LEED_SHORT = ['Global warming (GWP)', 'Ozone depletion (ODP)', 'Acidification (AP)', 'Eutrophication (EP)', 'Smog formation (POCP)', 'Non-renewable energy (ADPf)'];

function hbar(cats: string[], series: any[], fmt: (v: number) => string, extra: EOption = {}): EOption {
  return {
    grid: { left: 8, right: 56, top: 30, bottom: 8, containLabel: true },
    legend: { top: 0, left: 'center', itemWidth: 12, itemHeight: 10, textStyle: { fontSize: 12 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => (v == null ? '–' : fmt(Number(v))) },
    xAxis: { type: 'value', axisLabel: { ...axisLab, formatter: (v: number) => fmt(v) }, splitLine: gridLine },
    yAxis: { type: 'category', data: cats, inverse: true, axisTick: { show: false }, axisLine: { lineStyle: { color: PAL.axis } }, axisLabel: { ...axisLab, width: 190, overflow: 'truncate' } },
    series,
    ...extra,
  };
}

export function sixCategories(r: ProjectResult): EOption {
  const vals = r.leed.six.map((x) => (x.change == null ? null : x.change));
  const bdc = r.sys.sys === 'BD+C';
  const marks = bdc ? (r.sys.ver === 'v4' ? [-0.1] : [-0.05, -0.1, -0.2]) : [-0.1, -0.2];
  const nums = vals.filter((v): v is number => v != null);
  const wide = nums.length > 0 && Math.max(...nums, 0.05) - Math.min(...nums, -0.2) > 1.2; // threshold labels would overlap
  return hbar(LEED_SHORT, [
    { name: 'Change vs baseline', type: 'bar', barWidth: '55%', data: vals.map((v) => ({ value: v, itemStyle: { color: v != null && v > 0 ? PAL.orange : PAL.greenD } })),
      label: { show: true, position: 'right', formatter: (p: any) => (p.value == null ? 'n/a' : `${(p.value * 100).toFixed(1)}%`), fontSize: 11.5, color: PAL.ink },
      markLine: { symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: '#9db7a6' }, label: { show: !wide, position: 'start', formatter: (p: any) => `${Math.round(p.value * 100)}%`, fontSize: 10.5, color: PAL.muted },
        data: [...marks.map((m) => ({ xAxis: m })), ...(bdc ? [{ xAxis: 0.05, lineStyle: { color: '#e8a37a' } }] : [])] } },
  ], (v) => `${(v * 100).toFixed(0)}%`, { legend: { show: false } });
}

export function elementTable(r: ProjectResult, d: DesignResult) {
  const m = new Map<string, number>();
  for (const e of r.sys.elems) m.set(e, 0);
  let other = 0;
  for (const l of d.lines) {
    if (!l.active) continue;
    if (m.has(l.elem)) m.set(l.elem, m.get(l.elem)! + l.tot[0]);
    else other += l.tot[0];
  }
  const rows = [...m.entries()].map(([k, v]) => ({ k, v }));
  if (other) rows.push({ k: '(other / no category)', v: other });
  return rows;
}

export function byElement(r: ProjectResult, designs = r.designs): EOption {
  const tabs = designs.map((d) => elementTable(r, d));
  const keys = tabs[0].map((x) => x.k).filter((k, i) => tabs.some((tb) => (tb[i]?.v ?? 0) !== 0))
    .sort((a, b) => Math.max(...tabs.map((tb) => tb.find((x) => x.k === b)?.v ?? 0)) - Math.max(...tabs.map((tb) => tb.find((x) => x.k === a)?.v ?? 0))).slice(0, 10);
  return hbar(keys, designs.map((d, j) => ({
    name: d.name, type: 'bar', barGap: '10%', itemStyle: { color: colorOf(d, j) },
    data: keys.map((k) => t(tabs[j].find((x) => x.k === k)?.v ?? 0)),
    label: j === designs.length - 1 ? { show: true, position: 'right', formatter: (p: any) => fmtT(p.value), fontSize: 11 } : undefined,
  })), fmtT);
}

export function colorOf(d: DesignResult, j: number) {
  return d.kind === 'baseline' ? PAL.gray : d.kind === 'proposed' ? PAL.green : PAL.options[(j - 2 + PAL.options.length) % PAL.options.length];
}

export function changeByElement(r: ProjectResult): EOption {
  const b = elementTable(r, r.base), p = elementTable(r, r.prop);
  const rows = b.map((x, i) => ({ k: x.k, d: t((p[i]?.v ?? 0) - x.v) })).filter((x) => Math.abs(x.d) > 0.0005)
    .sort((a, c) => Math.abs(c.d) - Math.abs(a.d)).slice(0, 8);
  return hbar(rows.map((x) => x.k), [{
    name: 'Change (t CO2e)', type: 'bar', barWidth: '55%',
    data: rows.map((x) => ({ value: x.d, itemStyle: { color: x.d > 0 ? PAL.orange : PAL.greenD } })),
    label: { show: true, position: 'right', formatter: (q: any) => `${q.value > 0 ? '+' : ''}${fmtT(q.value)}`, fontSize: 11 },
  }], fmtT, { legend: { show: false } });
}

export function byStage(r: ProjectResult, designs = r.designs): EOption {
  const st = [['A13', 'A1–A3 product'], ['A4', 'A4 transport'], ['B45', 'B4–B5 replacement'], ['C14', 'C1–C4 end of life']] as const;
  return {
    grid: { left: 8, right: 16, top: 34, bottom: 8, containLabel: true },
    legend: { top: 0, itemWidth: 12, itemHeight: 10, textStyle: { fontSize: 12 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `${fmtT(Number(v))} t CO2e` },
    xAxis: { type: 'category', data: designs.map((d) => d.name), axisLabel: { ...axisLab, fontWeight: 'bold', color: PAL.ink }, axisLine: { lineStyle: { color: PAL.axis } } },
    yAxis: { type: 'value', axisLabel: { ...axisLab, formatter: fmtT }, splitLine: gridLine },
    series: st.map(([k, nm], i) => ({
      name: nm, type: 'bar', stack: 'gwp', barWidth: '42%', itemStyle: { color: PAL.ord[i], borderColor: '#fff', borderWidth: 1 },
      data: designs.map((d) => t(d.stage[k][0])),
    })),
  };
}

export function topContributors(d: DesignResult, n = 10): EOption {
  const rows = d.lines.filter((l) => l.active).sort((a, b) => b.tot[0] - a.tot[0]).slice(0, n);
  return hbar(rows.map((l) => l.label || shortName(l.mat, l.src)), [{
    name: d.name, type: 'bar', barWidth: '58%', itemStyle: { color: PAL.green }, data: rows.map((l) => t(l.tot[0])),
    label: { show: true, position: 'right', formatter: (p: any) => fmtT(p.value), fontSize: 11 },
  }], fmtT, { legend: { show: false } });
}

export function byClass(r: ProjectResult, designs = [r.base, r.prop]): EOption {
  const sums = designs.map((d) => {
    const m = new Map<string, number>();
    for (const l of d.lines) if (l.active && l.cls) m.set(l.cls, (m.get(l.cls) ?? 0) + l.tot[0]);
    return m;
  });
  const keys = [...new Set(sums.flatMap((m) => [...m.keys()]))]
    .sort((a, b) => Math.max(...sums.map((m) => m.get(b) ?? 0)) - Math.max(...sums.map((m) => m.get(a) ?? 0))).slice(0, 8);
  return hbar(keys, designs.map((d, j) => ({
    name: d.name, type: 'bar', itemStyle: { color: colorOf(d, d.kind === 'baseline' ? 0 : j) }, data: keys.map((k) => t(sums[j].get(k) ?? 0)),
    label: j === designs.length - 1 ? { show: true, position: 'right', formatter: (p: any) => fmtT(p.value), fontSize: 11 } : undefined,
  })), fmtT);
}

export function sourceMix(r: ProjectResult, designs = r.designs): EOption {
  const srcs = ['EPD', 'ÖKOBAUDAT', 'IDEMAT', 'ecoinvent'] as const;
  return {
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    legend: { top: 0, itemWidth: 12, itemHeight: 10, textStyle: { fontSize: 12 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `${(Number(v) * 100).toFixed(1)}%` },
    xAxis: { type: 'value', max: 1, axisLabel: { ...axisLab, formatter: (v: number) => `${Math.round(v * 100)}%` }, splitLine: gridLine },
    yAxis: { type: 'category', data: designs.map((d) => d.name), inverse: true, axisLabel: { ...axisLab, fontWeight: 'bold', color: PAL.ink } },
    series: srcs.map((s) => ({
      name: s, type: 'bar', stack: 'mix', barWidth: '50%', itemStyle: { color: SRC_COLOR[s], borderColor: '#fff', borderWidth: 1 },
      data: designs.map((d) => d.srcShare[s]),
      label: { show: true, formatter: (p: any) => (p.value >= 0.06 ? `${Math.round(p.value * 100)}%` : ''), color: '#fff', fontWeight: 'bold', fontSize: 11 },
    })),
  };
}

export function embodiedVsB6(r: ProjectResult): EOption {
  const ds = [r.base, r.prop];
  return hbar(ds.map((d) => d.name), [
    { name: 'Embodied A1–C4', type: 'bar', itemStyle: { color: PAL.green }, data: ds.map((d) => t(d.total[0])), label: { show: true, position: 'right', formatter: (p: any) => fmtT(p.value), fontSize: 11 } },
    { name: 'Operational B6 (not in the LEED result)', type: 'bar', itemStyle: { color: PAL.blue }, data: ds.map((d) => t(d.b6[0])), label: { show: true, position: 'right', formatter: (p: any) => fmtT(p.value), fontSize: 11 } },
  ], fmtT);
}

/** Material class → element → life-cycle stage (GWP flow of one design). */
export function sankey(r: ProjectResult, d: DesignResult): EOption {
  const links = new Map<string, number>();
  const add = (a: string, b: string, v: number) => { if (v > 0) links.set(`${a}\u0000${b}`, (links.get(`${a}\u0000${b}`) ?? 0) + v); };
  const stN = { A13: 'A1–A3 product', A4: 'A4 transport', B45: 'B4–B5 replacement', C14: 'C1–C4 end of life' } as const;
  for (const l of d.lines) {
    if (!l.active || l.tot[0] <= 0) continue;
    const cls = `${l.cls || 'Unclassified'} `;
    const el = l.elem || '(no element)';
    add(cls, el, t(l.tot[0]));
    for (const k of Object.keys(stN) as (keyof typeof stN)[]) add(el, stN[k], t(Math.max(0, l.stages[k][0])));
  }
  const names = new Set<string>();
  const data = [...links.entries()].map(([k, v]) => { const [s, tt] = k.split('\u0000'); names.add(s); names.add(tt); return { source: s, target: tt, value: v }; });
  const stageColors: Record<string, string> = { 'A1–A3 product': PAL.ord[0], 'A4 transport': PAL.ord[1], 'B4–B5 replacement': PAL.ord[2], 'C1–C4 end of life': PAL.ord[3] };
  return {
    tooltip: { trigger: 'item', valueFormatter: (v: any) => `${fmtT(Number(v))} t CO2e` },
    series: [{
      type: 'sankey', left: 8, right: 130, top: 10, bottom: 10, nodeGap: 9, nodeWidth: 12, draggable: false, emphasis: { focus: 'adjacency' },
      data: [...names].map((n) => ({ name: n, itemStyle: { color: stageColors[n] ?? (n.endsWith(' ') ? '#7fbf96' : '#2a7a4b') } })),
      links: data, lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 },
      label: { fontSize: 11.5, color: PAL.ink, formatter: (p: any) => p.name.trim() },
    }],
  };
}

/** Element → line hotspots of one design. */
export function treemap(r: ProjectResult, d: DesignResult): EOption {
  const m = new Map<string, LineResult[]>();
  for (const l of d.lines) if (l.active && l.tot[0] > 0) { const k = l.elem || '(no element)'; m.set(k, [...(m.get(k) ?? []), l]); }
  return {
    tooltip: { formatter: (p: any) => `${p.name}<br/><b>${fmtT(p.value)} t CO2e</b>` },
    series: [{
      type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, left: 0, right: 0, top: 0, bottom: 0,
      label: { fontSize: 11.5, overflow: 'truncate', formatter: (p: any) => `${p.name}\n${fmtT(p.value)} t` },
      upperLabel: { show: true, height: 20, color: '#fff', fontWeight: 'bold', fontSize: 11.5 },
      levels: [{ itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 } }, { colorSaturation: [0.35, 0.6], itemStyle: { borderColorSaturation: 0.7, gapWidth: 1, borderWidth: 1 } }],
      data: [...m.entries()].map(([k, ls], i) => ({
        name: k, value: t(ls.reduce((a, l) => a + l.tot[0], 0)), itemStyle: { color: [PAL.ord[1], PAL.green, PAL.mid, '#5d8f74', '#456b56', '#7fa58c'][i % 6] },
        children: ls.map((l) => ({ name: l.label || shortName(l.mat, l.src), value: t(l.tot[0]) })),
      })),
    }],
  };
}

/** Baseline → largest line changes → proposed (or an option). */
export function waterfall(r: ProjectResult, target: DesignResult = r.prop, n = 8): EOption {
  const changes: { k: string; v: number }[] = [];
  const nL = Math.max(r.base.lines.length, target.lines.length);
  for (let i = 0; i < nL; i++) {
    const b = r.base.lines[i], p = target.lines[i];
    const v = t((p?.active ? p.tot[0] : 0) - (b?.active ? b.tot[0] : 0));
    if (Math.abs(v) > 0.0005) changes.push({ k: (p?.label || b?.label || `Line ${i + 1}`).slice(0, 28), v });
  }
  changes.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const top = changes.slice(0, n);
  const rest = changes.slice(n).reduce((a, c) => a + c.v, 0);
  if (Math.abs(rest) > 0.0005) top.push({ k: 'Other lines', v: rest });
  const cats = ['Baseline', ...top.map((x) => x.k), target.name];
  const base: (number | string)[] = [], up: (number | string)[] = [], down: (number | string)[] = [];
  let run = t(r.base.total[0]);
  base.push(0); up.push(run); down.push('-');
  for (const c of top) {
    if (c.v >= 0) { base.push(run); up.push(c.v); down.push('-'); run += c.v; }
    else { run += c.v; base.push(run); up.push('-'); down.push(-c.v); }
  }
  base.push(0); up.push(t(target.total[0])); down.push('-');
  return {
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: any[]) => {
      const i = ps[0].dataIndex;
      if (i === 0) return `Baseline: <b>${fmtT(t(r.base.total[0]))} t</b>`;
      if (i === cats.length - 1) return `${target.name}: <b>${fmtT(t(target.total[0]))} t</b>`;
      const c = top[i - 1];
      return `${c.k}: <b>${c.v > 0 ? '+' : ''}${fmtT(c.v)} t</b>`;
    } },
    xAxis: { type: 'category', data: cats, axisLabel: { ...axisLab, interval: 0, rotate: 32, width: 120, overflow: 'truncate' } },
    yAxis: { type: 'value', axisLabel: { ...axisLab, formatter: fmtT }, splitLine: gridLine },
    series: [
      { type: 'bar', stack: 'w', itemStyle: { color: 'transparent' }, data: base, silent: true },
      { name: 'Increase / total', type: 'bar', stack: 'w', data: up.map((v, i) => ({ value: v, itemStyle: { color: i === 0 ? PAL.gray : i === cats.length - 1 ? PAL.green : PAL.orange } })) },
      { name: 'Reduction', type: 'bar', stack: 'w', itemStyle: { color: PAL.greenD }, data: down },
    ],
  };
}

/** Cumulative embodied carbon over the study period: product stage at year 0, replacements when each service life ends, end of life at the end. */
export function carbonOverTime(r: ProjectResult, p: Project, designs = r.designs, withB6 = false): EOption {
  const sp = r.sp;
  const years = Array.from({ length: sp + 1 }, (_, y) => y);
  const series = designs.map((d, j) => {
    const yearly = new Array(sp + 1).fill(0);
    for (const l of d.lines) {
      if (!l.active) continue;
      yearly[0] += l.stages.A13[0] + l.stages.A4[0];
      if (l.repl > 0 && l.rsl > 0) {
        const per = (l.cycle.a13[0] + l.cycle.a4[0] + l.cycle.c[0]);
        for (let k = 1; k <= l.repl; k++) { const y = Math.min(sp, Math.round(k * l.rsl)); yearly[y] += per; }
      }
      yearly[sp] += l.stages.C14[0];
    }
    const b6y = withB6 ? d.b6[0] / Math.max(1, sp) : 0;
    let cum = 0;
    const data = years.map((y) => { cum += yearly[y] + (y > 0 ? b6y : 0); return Math.round(t(cum) * 10) / 10; });
    return { name: d.name, type: 'line', step: 'end', symbol: 'none', lineStyle: { width: 2.2, color: colorOf(d, j) }, itemStyle: { color: colorOf(d, j) }, data };
  });
  void p;
  return {
    grid: { left: 8, right: 20, top: 34, bottom: 8, containLabel: true },
    legend: { top: 0, itemWidth: 14, itemHeight: 8, textStyle: { fontSize: 12 } },
    tooltip: { trigger: 'axis', valueFormatter: (v: any) => `${fmtT(Number(v))} t CO2e`, axisPointer: { type: 'line' } },
    xAxis: { type: 'category', data: years, name: 'year', nameLocation: 'end', nameTextStyle: { color: PAL.muted }, axisLabel: { ...axisLab, interval: Math.max(1, Math.round(sp / 12)) - 1 }, boundaryGap: false },
    yAxis: { type: 'value', axisLabel: { ...axisLab, formatter: fmtT }, splitLine: gridLine, name: 't CO2e (cumulative)', nameTextStyle: { color: PAL.muted, align: 'left' } },
    series,
  };
}

/** Total GWP and LEED points per design. */
export function optionsBars(r: ProjectResult): EOption {
  const ds = r.designs;
  const thr = r.sys.sys === 'BD+C' ? (r.sys.ver === 'v4' ? [0.1] : [0.05, 0.1, 0.2]) : [0.2];
  const b = t(r.base.total[0]);
  return {
    grid: { left: 8, right: 70, top: 20, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `${fmtT(Number(v))} t CO2e` },
    xAxis: { type: 'category', data: ds.map((d) => d.name), axisLabel: { ...axisLab, fontWeight: 'bold', color: PAL.ink } },
    yAxis: { type: 'value', axisLabel: { ...axisLab, formatter: fmtT }, splitLine: gridLine },
    series: [{
      type: 'bar', barWidth: '46%', data: ds.map((d, j) => ({ value: t(d.total[0]), itemStyle: { color: colorOf(d, j) } })),
      label: { show: true, position: 'top', fontSize: 11.5, formatter: (q: any) => { const c = (q.value - b) / b; return q.dataIndex === 0 ? fmtT(q.value) : `${fmtT(q.value)}  (${c > 0 ? '+' : ''}${(c * 100).toFixed(1)}%)`; } },
      markLine: { symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: '#9db7a6' }, label: { position: 'end', fontSize: 10.5, color: PAL.muted, formatter: (q: any) => q.name },
        data: thr.map((x) => ({ yAxis: b * (1 - x), name: `−${Math.round(x * 100)}%` })) },
    }],
  };
}

export function histogram(values: number[], marks: { x: number; label: string }[], fmt: (v: number) => string, color = PAL.green, bins = 40): EOption {
  if (!values.length) return {};
  const lo = Math.min(...values), hi = Math.max(...values);
  const w = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  const centers = counts.map((_, i) => lo + w * (i + 0.5));
  return {
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', formatter: (ps: any[]) => `${fmt(centers[ps[0].dataIndex])}: ${ps[0].value} runs` },
    xAxis: { type: 'category', data: centers.map((c) => fmt(c)), axisLabel: { ...axisLab, interval: Math.ceil(bins / 8) - 1 } },
    yAxis: { type: 'value', axisLabel: axisLab, splitLine: gridLine, name: 'runs', nameTextStyle: { color: PAL.muted } },
    series: [{
      type: 'bar', barCategoryGap: '8%', data: counts, itemStyle: { color },
      markLine: { symbol: 'none', silent: true, label: { formatter: (q: any) => q.name, fontSize: 10.5, color: PAL.ink2 }, lineStyle: { color: PAL.orange, type: 'dashed' },
        data: marks.filter((m) => m.x >= lo && m.x <= hi).map((m) => ({ xAxis: Math.min(bins - 1, Math.floor((m.x - lo) / w)), name: m.label })) },
    }],
  };
}
