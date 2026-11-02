import { useMemo, useState } from 'react';
import { useApp } from '../../state/store.ts';
import { lib } from '../../data/libraryStore.ts';
import { opportunities, type Opportunity } from '../../engine/alternatives.ts';
import { runMonteCarlo, MC_DEFAULT, type McResult } from '../../engine/montecarlo.ts';
import { BENCHMARKS } from '../../engine/benchmarks.ts';
import { computeLeed } from '../../engine/leed.ts';
import { CLASSES } from '../../engine/rules.ts';
import type { DesignResult, McSettings, Src } from '../../engine/types.ts';
import { Seg, Tiles, SrcBadge } from '../components/common.tsx';
import { DsName } from '../components/DatasetCard.tsx';
import { Chart, PAL } from '../components/Chart.tsx';
import { histogram } from '../charts.ts';
import { fmt, pct, chg, tco2 } from '../format.ts';
import { uid } from '../../state/project.ts';
import { Icon } from '../icons.tsx';

type Tab = 'opps' | 'whatif' | 'mc' | 'bench';

export function InsightsPage() {
  const [tab, setTab] = useState<Tab>('opps');
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Insights</h1>
          <p className="lede">Where the carbon can still come down, how sure the result is, and how it compares with published benchmarks.</p>
        </div>
        <Seg value={tab} onChange={setTab} options={[{ v: 'opps', label: 'Carbon opportunities' }, { v: 'whatif', label: 'What-if' }, { v: 'mc', label: 'Uncertainty' }, { v: 'bench', label: 'Benchmarks' }]} />
      </div>
      {tab === 'opps' && <Opportunities />}
      {tab === 'whatif' && <WhatIf />}
      {tab === 'mc' && <Uncertainty />}
      {tab === 'bench' && <Benchmarks />}
    </div>
  );
}

function Opportunities() {
  const { project, result, commit, toast, setDesignTab, go } = useApp();
  const [designId, setDesignId] = useState(() => project?.designs.find((d) => d.kind === 'proposed')?.id ?? '');
  const [mode, setMode] = useState<'same' | 'any'>('same');
  const [geo, setGeo] = useState('');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const design = project?.designs.find((d) => d.id === designId);
  const opps = useMemo(() => (!project || !result || !design ? [] : opportunities(project, result, lib, design, { hideExpired: true, hideCheck: true, geo, assessDate: result.assessDate })),
    [project, result, designId, geo]);
  if (!project || !result || !design) return null;
  const pickAlt = (o: Opportunity) => (mode === 'same' ? o.sameSource : o.best);
  const rows = opps.filter((o) => pickAlt(o));
  const chosen = rows.filter((o) => sel[o.lineKey] ?? true);
  const saving = chosen.reduce((a, o) => a + (pickAlt(o)?.saving ?? 0), 0);
  const dr = result.designs.find((d) => d.designId === design.id)!;
  const newTotal = dr.total[0] - saving;
  const ch = result.base.total[0] ? (newTotal - result.base.total[0]) / result.base.total[0] : null;
  const apply = (asNew: boolean) => {
    let targetId = design.id;
    commit((p) => {
      let d = p.designs.find((x) => x.id === design.id)!;
      if (asNew) {
        const c = structuredClone(d); c.id = uid('D-'); c.kind = 'option';
        c.name = `Option ${String.fromCharCode(65 + p.designs.filter((x) => x.kind === 'option').length)} (low carbon)`;
        p.designs.push(c); d = c; targetId = c.id;
      }
      for (const o of chosen) {
        const a = pickAlt(o)!;
        const ex = d.extra.find((x) => x.id === o.lineKey);
        if (ex) { ex.src = a.ds.src; ex.mat = a.ds.n; } else d.choices[o.lineKey] = { ...(d.choices[o.lineKey] ?? {}), src: a.ds.src, mat: a.ds.n };
      }
    }, { designId: design.id });
    toast(`${chosen.length} swaps applied${asNew ? ' to a new design option' : ` to ${design.name}`}`);
    setDesignTab(targetId); go('designs');
  };
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <span className="lab">Design</span>
        <select className="inp" style={{ width: 200 }} value={designId} onChange={(e) => { setDesignId(e.target.value); setSel({}); }}>
          {project.designs.filter((d) => d.kind !== 'baseline').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <Seg value={mode} onChange={setMode} options={[{ v: 'same', label: 'Same data source (like for like)' }, { v: 'any', label: 'Any library' }]} />
        <input className="inp" style={{ width: 120 }} placeholder="Country filter" value={geo} onChange={(e) => setGeo(e.target.value)} title="e.g. SA, EG, AE" />
        <span className="help">Same material class, unit convertible, valid and without CHECK notes. Product EPDs are the best basis for LEED; check strength class, thickness and performance before you specify a swap.</span>
      </div>
      <Tiles items={[
        { lab: `${design.name} now`, val: `${tco2(dr.total[0])} t CO2e`, sub: `${chg(result.base.total[0] ? (dr.total[0] - result.base.total[0]) / result.base.total[0] : null)} vs baseline` },
        { lab: 'Selected swaps', val: `${chosen.length} of ${rows.length}`, sub: `save ${tco2(saving)} t CO2e` },
        { lab: 'After the swaps', val: `${tco2(newTotal)} t CO2e`, tone: (ch ?? 0) < 0 ? 'good' : '', sub: `${chg(ch)} vs baseline (GWP)` },
      ]} />
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn primary" disabled={!chosen.length} onClick={() => apply(true)}><Icon.plus /> Apply to a new design option</button>
        <button className="btn" disabled={!chosen.length} onClick={() => apply(false)}>Apply to {design.name}</button>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th><input type="checkbox" checked={rows.length > 0 && rows.every((o) => sel[o.lineKey] ?? true)} onChange={(e) => setSel(Object.fromEntries(rows.map((o) => [o.lineKey, e.target.checked])))} /></th>
            <th>#</th><th>Line</th><th>Current material</th><th className="num">Now t</th><th>Lower-carbon alternative</th><th className="num">Then t</th><th className="num">Saving t</th><th className="num">of baseline</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="empty">No lower-carbon dataset of the same class found for the current lines{mode === 'same' ? ' in the same library – try “Any library”' : ''}.</td></tr>}
            {rows.map((o) => {
              const a = pickAlt(o)!;
              return (
                <tr key={o.lineKey}>
                  <td><input type="checkbox" checked={sel[o.lineKey] ?? true} onChange={(e) => setSel({ ...sel, [o.lineKey]: e.target.checked })} /></td>
                  <td className="idx">{o.pos}</td>
                  <td><div className="cell-2l"><span className="l1">{o.desc}</span><span className="l2">{o.elem}</span></div></td>
                  <td style={{ maxWidth: 300 }}><SrcBadge src={o.current.src} /> <DsName src={o.current.src} n={o.current.n} /></td>
                  <td className="num">{tco2(o.current.gwp)}</td>
                  <td style={{ maxWidth: 320 }}><SrcBadge src={a.ds.src} /> <DsName src={a.ds.src} n={a.ds.n} /> <span className="xs muted">{a.ds.geo}</span></td>
                  <td className="num">{tco2(a.gwp)}</td>
                  <td className="num good"><b>−{tco2(a.saving)}</b></td>
                  <td className="num xs">{pct(a.saving / (result.base.total[0] || 1), 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function WhatIf() {
  const { project, result } = useApp();
  const [f, setF] = useState<Record<string, number>>({});
  const [dist, setDist] = useState(0);
  const [life, setLife] = useState(0);
  // scale the A1–A3 (incl. replacements) of the proposed lines per class; transport distance and service life globally
  const scaled: DesignResult | null = useMemo(() => {
    if (!result) return null;
    const prop = result.prop;
    const total = prop.total.slice();
    for (const l of prop.lines) {
      if (!l.active) continue;
      const k = (f[l.cls] ?? 0) / 100;
      const df = dist / 100;
      for (let i = 0; i < 8; i++) {
        const a13 = l.stages.A13[i] + l.repl * l.cycle.a13[i];
        total[i] += a13 * k + (l.stages.A4[i] + l.repl * l.cycle.a4[i]) * df;
      }
      if (life && l.rsl > 0) {
        const nl = l.rsl * (1 + life / 100);
        const repl = Math.max(0, Math.ceil(result.sp / nl) - 1);
        const per = l.cycle.a13.map((x, i) => x * (1 + k) + l.cycle.a4[i] * (1 + df) + l.cycle.c[i]);
        for (let i = 0; i < 8; i++) total[i] += (repl - l.repl) * per[i];
      }
    }
    return { ...prop, total };
  }, [result, f, dist, life]);
  if (!project || !result || !scaled) return null;
  const prop = result.prop;
  const classes = CLASSES.filter((c) => prop.lines.some((l) => l.active && l.cls === c && l.tot[0] > 0));
  const L = computeLeed(result.sys, result.sp, result.base, scaled, project.setup.epIndicator);
  const ch = L.change[0];
  return (
    <>
      <p className="lede" style={{ marginBottom: 12 }}>Move a slider to see what a change on the proposed design would do to the LEED result before you look for products. Nothing here changes the project.</p>
      <Tiles items={[
        { lab: 'Proposed GWP now', val: `${tco2(prop.total[0])} t`, sub: `${chg(result.leed.change[0])} · ${result.leed.points} points` },
        { lab: 'With the changes', val: `${tco2(scaled.total[0])} t`, tone: (ch ?? 0) < (result.leed.change[0] ?? 0) ? 'good' : '', sub: `${chg(ch)} vs baseline` },
        { lab: 'LEED result', val: `${L.points} points`, sub: `${L.pathLabel} · ${L.red10} categories ≥10% lower` },
      ]} />
      <div className="panel"><div className="panel-body col">
        {classes.map((c) => {
          const share = prop.lines.filter((l) => l.active && l.cls === c).reduce((a, l) => a + l.tot[0], 0) / (prop.total[0] || 1);
          return (
            <div key={c} className="row">
              <span style={{ width: 260 }}>{c} <span className="xs muted">({pct(share, 0)} of GWP)</span></span>
              <input type="range" min={-60} max={30} step={5} value={f[c] ?? 0} onChange={(e) => setF({ ...f, [c]: Number(e.target.value) })} style={{ flex: 1 }} />
              <span className="num" style={{ width: 120 }}>{(f[c] ?? 0) > 0 ? '+' : ''}{f[c] ?? 0}% A1–A3</span>
            </div>
          );
        })}
        <div className="row"><span style={{ width: 260 }}>All A4 transport distances</span><input type="range" min={-80} max={100} step={10} value={dist} onChange={(e) => setDist(Number(e.target.value))} style={{ flex: 1 }} /><span className="num" style={{ width: 120 }}>{dist > 0 ? '+' : ''}{dist}%</span></div>
        <div className="row"><span style={{ width: 260 }}>All service lives</span><input type="range" min={-50} max={100} step={10} value={life} onChange={(e) => setLife(Number(e.target.value))} style={{ flex: 1 }} /><span className="num" style={{ width: 120 }}>{life > 0 ? '+' : ''}{life}%</span></div>
        <div className="row"><button className="btn sm" onClick={() => { setF({}); setDist(0); setLife(0); }}><Icon.reset /> Reset</button>
          <span className="help">A class slider scales the A1–A3 impacts (all eight indicators) of the proposed lines of that class, e.g. −30% for a lower-clinker concrete or high-recycled-content steel.</span></div>
      </div></div>
    </>
  );
}

function Uncertainty() {
  const { project, result } = useApp();
  const [s, setS] = useState<McSettings>(() => ({ ...MC_DEFAULT, ...(project?.mc ?? {}) }));
  const [mc, setMc] = useState<McResult | null>(null);
  const [busy, setBusy] = useState(false);
  if (!project || !result) return null;
  const run = () => { setBusy(true); setTimeout(() => { setMc(runMonteCarlo(project, result, s)); setBusy(false); }, 20); };
  const pid = result.prop.designId;
  const cs = mc?.changeStats[pid];
  const thr = result.sys.sys === 'BD+C' ? (result.sys.ver === 'v4' ? [0.1] : [0.05, 0.1, 0.2]) : [0.2];
  const sd = (k: keyof McSettings, label: string) => (
    <label className="field" key={String(k)}><span className="lab">{label}</span>
      <input className="inp num" style={{ width: 90 }} type="number" step={1} value={Math.round((s[k] as number) * 100)} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) / 100 })} /></label>
  );
  return (
    <>
      <p className="lede" style={{ marginBottom: 12 }}>A Monte Carlo run draws every uncertain input many times and recalculates both designs. Shared inputs move together: the same BOQ quantity in both designs, the same dataset wherever it is used. The result is the chance that the proposed design really meets each LEED reduction threshold.</p>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-body row wrap" style={{ alignItems: 'flex-end' }}>
          <label className="field"><span className="lab">Runs</span><input className="inp num" style={{ width: 90 }} type="number" value={s.runs} onChange={(e) => setS({ ...s, runs: Number(e.target.value) })} /></label>
          {sd('sdQty', 'Quantities ± %')}{sd('sdLife', 'Service life ± %')}{sd('sdDist', 'A4 distance ± %')}
          {Object.keys(s.sdSrc).map((k) => (
            <label className="field" key={k}><span className="lab">{k} ± %</span>
              <input className="inp num" style={{ width: 90 }} type="number" value={Math.round(s.sdSrc[k] * 100)} onChange={(e) => setS({ ...s, sdSrc: { ...s.sdSrc, [k]: Number(e.target.value) / 100 } })} /></label>
          ))}
          <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Running…' : `Run ${s.runs.toLocaleString()} simulations`}</button>
        </div>
        <div className="panel-body help" style={{ paddingTop: 0 }}>Values are one standard deviation (coefficient of variation) of a log-normal factor with mean 1. They are screening assumptions: product-specific EPDs are the most precise; generic data is wider (ÖKOBAUDAT generic datasets already include a safety margin).</div>
      </div>
      {!mc && <div className="panel empty"><h3>Run the simulation to see the result</h3><p>Takes a second or two in this browser.</p></div>}
      {mc && cs && (
        <>
          <Tiles items={[
            ...thr.map((t) => ({ lab: `Chance of ≥ ${Math.round(t * 100)}% lower GWP`, val: pct(t === 0.05 ? cs.pLe5 : t === 0.1 ? cs.pLe10 : cs.pLe20, 0), tone: ((t === 0.05 ? cs.pLe5 : t === 0.1 ? cs.pLe10 : cs.pLe20) >= 0.9 ? 'good' : (t === 0.05 ? cs.pLe5 : t === 0.1 ? cs.pLe10 : cs.pLe20) < 0.5 ? 'bad' : '') as any, sub: result.sys.sys === 'BD+C' ? (t === 0.05 ? 'Path 2' : t === 0.1 ? (result.sys.ver === 'v4' ? 'Option 4' : 'Path 3') : 'Path 4') : 'Path 3' })),
            { lab: 'GWP change, 90% interval', val: `${chg(cs.p5)} to ${chg(cs.p95)}`, sub: `median ${chg(cs.p50)} · deterministic ${chg(result.leed.change[0])}` },
            { lab: 'Proposed GWP, 90% interval', val: `${tco2(mc.stats[pid].p5, 0)}–${tco2(mc.stats[pid].p95, 0)} t`, sub: `baseline ${tco2(mc.stats[result.base.designId].p5, 0)}–${tco2(mc.stats[result.base.designId].p95, 0)} t` },
          ]} />
          <div className="chart-grid">
            <div className="chart-card"><h3>Distribution of the GWP change (proposed vs baseline)</h3><div className="cap">{mc.runs.toLocaleString()} runs. Dashed lines: LEED thresholds.</div>
              <Chart option={histogram(mc.change[pid], thr.map((t) => ({ x: -t, label: `−${Math.round(t * 100)}%` })), (v) => `${(v * 100).toFixed(1)}%`)} /></div>
            <div className="chart-card"><h3>What drives the uncertainty</h3><div className="cap">Swing in the GWP change (percentage points) when one input moves by ±1 standard deviation.</div>
              <Chart option={{
                grid: { left: 8, right: 40, top: 10, bottom: 8, containLabel: true },
                xAxis: { type: 'value', axisLabel: { formatter: (v: number) => `${v.toFixed(1)}` } },
                yAxis: { type: 'category', inverse: true, data: mc.tornado.map((t) => t.label), axisLabel: { width: 260, overflow: 'truncate', fontSize: 11 } },
                tooltip: { trigger: 'axis', valueFormatter: (v: any) => `${Number(v).toFixed(2)} points` },
                series: [{ type: 'bar', data: mc.tornado.map((t) => t.swing), itemStyle: { color: PAL.mid }, label: { show: true, position: 'right', formatter: (p: any) => p.value.toFixed(1), fontSize: 11 } }],
              }} height={340} /></div>
          </div>
        </>
      )}
    </>
  );
}

function Benchmarks() {
  const { project, result } = useApp();
  if (!project || !result) return null;
  const area = project.setup.area ?? 0;
  if (!area) return <div className="panel empty"><h3>Enter the floor area on Project setup</h3><p>Benchmarks are per m².</p></div>;
  const val = (d: DesignResult, m: 'upfront' | 'wholelife') => (m === 'upfront' ? d.stage.A13[0] + d.stage.A4[0] : d.total[0]) / area;
  return (
    <>
      <div className="note" style={{ marginBottom: 14 }}>
        Context only. These benchmarks cover the whole building (substructure, superstructure, finishes, building services) and include construction (A5). The LEED {result.sys.sys} LCA covers {result.sys.scope} with A1–A4, B4–B5 and C1–C4, so its result normally sits below them. “Upfront” here is A1–A3 + A4 (the LEED scope has no A5).
      </div>
      <div className="chart-grid">
        {BENCHMARKS.map((b) => {
          const pts = result.designs.map((d, j) => ({ name: d.name, v: val(d, b.metric), color: d.kind === 'baseline' ? PAL.gray : d.kind === 'proposed' ? PAL.green : PAL.options[(j - 2) % PAL.options.length] }));
          const max = Math.max(...b.lines.map((x) => x.v), ...pts.map((p) => p.v)) * 1.12;
          return (
            <div className="chart-card" key={b.id}>
              <h3>{b.label}</h3>
              <div className="cap">{b.scope}. Source: <a href={b.url} target="_blank" rel="noreferrer">{b.source}</a></div>
              <Chart height={220} option={{
                grid: { left: 8, right: 24, top: 40, bottom: 20, containLabel: true },
                xAxis: { type: 'value', max, name: 'kg CO2e/m²', nameLocation: 'middle', nameGap: 26, axisLabel: { fontSize: 11 } },
                yAxis: { type: 'category', data: pts.map((p) => p.name), inverse: true, axisLabel: { fontWeight: 'bold' } },
                tooltip: { trigger: 'axis', valueFormatter: (v: any) => `${fmt(Number(v), 0)} kg CO2e/m²` },
                series: [{ type: 'bar', barWidth: '45%', data: pts.map((p) => ({ value: p.v, itemStyle: { color: p.color } })), label: { show: true, position: 'right', formatter: (p: any) => fmt(p.value, 0), fontSize: 11 },
                  markLine: { symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: PAL.orange }, label: { position: 'end', formatter: (p: any) => `${p.name} ${p.value}`, fontSize: 10, color: PAL.ink2 },
                    data: b.lines.map((x) => ({ xAxis: x.v, name: x.label })) } }],
              }} />
            </div>
          );
        })}
      </div>
    </>
  );
}

export type { Src };
