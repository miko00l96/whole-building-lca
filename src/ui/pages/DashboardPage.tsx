import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../state/store.ts';
import { Chart } from '../components/Chart.tsx';
import * as C from '../charts.ts';
import { Tiles, Seg } from '../components/common.tsx';
import { fmt, chg, tco2 } from '../format.ts';

function Card({ title, cap, children, wide }: { title: string; cap?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="chart-card" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <h3>{title}</h3>
      {cap && <div className="cap">{cap}</div>}
      {children}
    </div>
  );
}

export function DashboardPage() {
  const { project, result, designTab } = useApp();
  const [flowDesign, setFlowDesign] = useState<string>(designTab);
  const [b6, setB6] = useState<'no' | 'yes'>('no');
  const r = result;
  const opts = useMemo(() => {
    if (!r || !project) return null;
    const fd = r.designs.find((d) => d.designId === flowDesign) ?? r.prop;
    return {
      six: C.sixCategories(r), chEl: C.changeByElement(r), byEl: C.byElement(r), stage: C.byStage(r), top: C.topContributors(r.prop),
      cls: C.byClass(r, r.designs), mix: C.sourceMix(r), b6: C.embodiedVsB6(r), sankey: C.sankey(r, fd), tree: C.treemap(r, fd),
      wf: C.waterfall(r), time: C.carbonOverTime(r, project, r.designs, b6 === 'yes'), options: C.optionsBars(r),
    };
  }, [r, project, flowDesign, b6]);
  if (!project || !r || !opts) return null;
  const { leed, sys } = r;
  const area = project.setup.area ?? 0;
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Dashboard</h1>
          <p className="lede">{sys.cover} · {sys.scope}, A1–C4 (module D and B6 reported separately) · EN 15804+A2 indicators. Point at any bar for values.</p>
        </div>
      </div>
      <Tiles items={[
        { lab: 'Baseline GWP', val: `${tco2(r.base.total[0], 0)} t CO2e`, sub: area ? `${fmt(r.base.total[0] / area, 1)} kg CO2e/m²` : '' },
        { lab: 'Proposed GWP', val: `${tco2(r.prop.total[0], 0)} t CO2e`, sub: area ? `${fmt(r.prop.total[0] / area, 1)} kg CO2e/m²` : '' },
        { lab: 'GWP change', val: chg(leed.change[0]), tone: (leed.change[0] ?? 0) < 0 ? 'good' : 'bad', sub: `${fmt((r.prop.total[0] - r.base.total[0]) / 1000, 0)} t CO2e` },
        { lab: sys.ptsLabel, val: `${leed.points} points`, sub: `${leed.otherPts} · indicative` },
        { lab: 'Categories ≥ 10% lower', val: `${leed.red10} of 6`, sub: leed.noneUp === 'YES' ? (sys.sys === 'ID+C' ? 'at most one category higher' : 'no category up >5%') : leed.noneUp.startsWith('NO') ? (sys.sys === 'ID+C' ? 'more than one category higher' : 'a category is up >5%') : '' },
        { lab: 'Data QA notes', val: `${r.base.qaCount} / ${r.prop.qaCount}`, sub: 'rows (baseline / proposed)' },
      ]} />
      <div className="chart-grid">
        <Card title="Change vs baseline – six LEED impact categories" cap="Dashed lines: LEED reduction thresholds (and the +5% cap on increases for BD+C)."><Chart option={opts.six} /></Card>
        <Card title="Where the GWP change comes from (t CO2e)" cap="Change per element category, proposed minus baseline."><Chart option={opts.chEl} /></Card>
        <Card title="GWP by element category (t CO2e)"><Chart option={opts.byEl} /></Card>
        <Card title="GWP by life-cycle stage (t CO2e)"><Chart option={opts.stage} /></Card>
        <Card title="From baseline to proposed, line by line (t CO2e)" cap="The largest line changes, the rest grouped." wide><Chart option={opts.wf} height={360} /></Card>
        <Card title="Embodied carbon over the study period (t CO2e, cumulative)" cap={<span className="row">Product and transport at year 0, replacements when a service life ends, end of life at the end. <Seg value={b6} onChange={setB6} options={[{ v: 'no', label: 'Embodied only' }, { v: 'yes', label: 'Add B6 per year' }]} /></span>} wide>
          <Chart option={opts.time} height={340} />
        </Card>
        <Card title="Carbon flow: material class → element → life-cycle stage" cap={<span className="row">GWP in t CO2e. <select className="inp" style={{ width: 180, height: 26 }} value={flowDesign} onChange={(e) => setFlowDesign(e.target.value)}>{r.designs.map((d) => <option key={d.designId} value={d.designId}>{d.name}</option>)}</select></span>} wide>
          <Chart option={opts.sankey} height={440} />
        </Card>
        <Card title="Hotspots: elements and lines (t CO2e)" cap="Box size = GWP A1–C4 of the selected design." wide><Chart option={opts.tree} height={400} /></Card>
        <Card title="Top 10 contributors – proposed (t CO2e)"><Chart option={opts.top} /></Card>
        <Card title="GWP by material class (t CO2e)"><Chart option={opts.cls} /></Card>
        <Card title="Data source mix (share of GWP)"><Chart option={opts.mix} height={220} /></Card>
        <Card title="Embodied (A1–C4) vs operational (B6) GWP over the study period (t CO2e)"><Chart option={opts.b6} height={220} /></Card>
        {r.designs.length > 2 && <Card title="Design options: total GWP and LEED thresholds" wide><Chart option={opts.options} height={320} /></Card>}
      </div>
    </div>
  );
}
