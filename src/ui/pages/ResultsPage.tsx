import { useApp } from '../../state/store.ts';
import { IND_NAME, IND_UNIT, EP_NAME } from '../../engine/rules.ts';
import { epDrivers } from '../../engine/text.ts';
import { fmt, sig, chg, pct } from '../format.ts';
import type { Stage } from '../../engine/types.ts';

const STAGES: [Stage, string][] = [['A13', 'A1–A3'], ['A4', 'A4'], ['B45', 'B4–B5'], ['C14', 'C1–C4']];
const nf = (v: number, i: number) => (i === 1 || i === 3 ? (v === 0 ? '0' : v.toExponential(3).replace('e', 'E')) : i === 0 || i === 7 ? fmt(v, 0) : fmt(v, 2));

export function ResultsPage() {
  const { project, result } = useApp();
  if (!project || !result) return null;
  const { base, prop, leed, sys } = result;
  const area = project.setup.area ?? 0;
  const ep = epDrivers(result, project);
  const largeTxt = leed.six.filter((x) => x.change != null && Math.abs(x.change) >= 0.5).map((x) => `${x.ind.startsWith('Eutro') ? 'EP' : x.ind} ${x.change! > 0 ? '+' : '−'}${Math.abs(x.change! * 100).toFixed(1)}%`).join('  ');
  const checks: [string, string][] = [
    ['GWP change', chg(leed.change[0])],
    ['Categories reduced ≥ 5% (incl. GWP)', String(leed.red5)],
    ['Categories reduced ≥ 10% (incl. GWP)', String(leed.red10)],
    ['Other categories reduced ≥ 10%', String(leed.other10)],
    ['Largest increase', leed.maxIncrease == null ? 'n/a' : pct(leed.maxIncrease)],
    [sys.sys === 'ID+C' ? 'No more than one category higher?' : 'No category up more than 5%?', leed.noneUp],
    ['Reuse / salvage in proposed?', leed.reuse ? 'YES' : 'NO'],
    ['Rows with data QA notes (base / prop)', `${base.qaCount} / ${prop.qaCount}`],
    ['Elements with a different data source', String(base.diffSrc + prop.diffSrc)],
    ['Rows using EPD data (base / prop)', `${base.epdRows} / ${prop.epdRows}`],
    ['Rows using expired EPDs', String(base.expiredCount + prop.expiredCount)],
    ['Rows using ÖKOBAUDAT + ecoinvent data (base / prop)', `${base.obdRows} + ${base.eiRows} / ${prop.obdRows} + ${prop.eiRows}`],
    sys.sys === 'ID+C' ? ['Categories higher than the baseline (Path 3: at most 1)', String(leed.higherCount)] : ['Exemplary performance v4.1 (Path 4 + ≥40% GWP)', leed.exemplary41 ? 'YES' : 'NO'],
    sys.sys === 'ID+C' ? ['Reused / salvaged lines in proposed', String(prop.reuseCount)] : ['Exemplary performance v4 (≥10% in all six)', leed.exemplary4 ? 'YES' : 'NO'],
    [`Study period ≥ ${sys.minSp} years?`, leed.spOk ? 'YES' : 'NO'],
    ['Reused rows in baseline (should be 0)', String(base.reuseCount)],
    ['Eutrophication unit', project.setup.epIndicator === 'EPm' ? 'OK' : `${EP_NAME[project.setup.epIndicator]} is not a LEED unit – use marine (kg N eq)`],
    [`BOQ lines with LCA data (base / prop${sys.sys === 'ID+C' ? '; ID+C ≥95%' : ''})`, `${pct(base.cov, 0)} / ${pct(prop.cov, 0)}`],
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="step-label">Step 4 of 5</div>
          <h1>Results</h1>
          <p className="lede">{project.setup.projectName} · {sys.cover} · {sys.sys === 'ID+C' ? 'floor area' : 'GFA'} {fmt(area)} m² · study period {result.sp} years · EN 15804+A2 indicators.</p>
        </div>
      </div>

      <div className="tbl-wrap" style={{ marginBottom: 18 }}>
        <table className="tbl">
          <thead>
            <tr><th>Indicator</th><th>Unit</th>{STAGES.map(([, n]) => <th key={'b' + n} className="num">Baseline {n}</th>)}<th className="num">Baseline total</th>
              {STAGES.map(([, n]) => <th key={'p' + n} className="num">Proposed {n}</th>)}<th className="num">Proposed total</th><th className="num">Change</th>
              <th className="num">Baseline per m²</th><th className="num">Proposed per m²</th></tr>
          </thead>
          <tbody>
            {IND_NAME.map((nm, i) => (
              <tr key={nm}>
                <td><b>{nm}</b></td><td className="ink2 xs">{IND_UNIT[i]}</td>
                {STAGES.map(([s]) => <td key={'b' + s} className="num">{nf(base.stage[s][i], i)}</td>)}
                <td className="num" style={{ background: 'var(--tile)' }}><b>{nf(base.total[i], i)}</b></td>
                {STAGES.map(([s]) => <td key={'p' + s} className="num">{nf(prop.stage[s][i], i)}</td>)}
                <td className="num" style={{ background: 'var(--tile)' }}><b>{nf(prop.total[i], i)}</b></td>
                <td className={`num ${(leed.change[i] ?? 0) < 0 ? 'good' : 'bad'}`}><b>{chg(leed.change[i])}</b></td>
                <td className="num xs">{area ? sig(base.total[i] / area, 4) : 'enter GFA'}</td>
                <td className="num xs">{area ? sig(prop.total[i] / area, 4) : 'enter GFA'}</td>
              </tr>
            ))}
            <tr><td colSpan={6} className="ink2" style={{ fontStyle: 'italic' }}>Module D, GWP (kg CO2e) – separate, not counted</td><td className="num ink2">{fmt(base.modD, 0)}</td><td colSpan={4} /><td className="num ink2">{fmt(prop.modD, 0)}</td><td colSpan={3} /></tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)', gap: 18 }}>
        <div className="panel">
          <div className="sec-band">{sys.sys === 'ID+C' ? 'LEED v4.1 ID+C Option 3 (building interiors LCA)' : 'LEED v4.1 BD+C Option 2 (v4: Option 4)'} – six impact categories</div>
          <table className="tbl">
            <thead><tr><th>LEED category</th><th>Indicator</th><th className="num">Baseline</th><th className="num">Proposed</th><th className="num">Change</th><th>Plausibility</th></tr></thead>
            <tbody>
              {leed.six.map((x, k) => {
                const bad = x.change != null && (sys.sys === 'BD+C' ? x.change > 0.05 : x.change > 0 && leed.higherCount > 1);
                const amber = x.change != null && sys.sys === 'ID+C' && x.change > 0 && leed.higherCount <= 1;
                return (
                  <tr key={x.name}>
                    <td><b>{x.name}</b></td><td className="xs ink2">{x.ind}</td>
                    <td className="num">{nf(x.base, k === 1 ? 1 : 2)}</td><td className="num">{nf(x.prop, k === 1 ? 1 : 2)}</td>
                    <td className="num" style={{ fontWeight: 700, color: bad ? 'var(--bad)' : amber ? 'var(--warn)' : (x.change ?? 0) < 0 ? 'var(--good)' : undefined, background: bad ? 'var(--bad-bg)' : amber ? 'var(--warn-bg)' : (x.change ?? 0) <= -0.1 ? 'var(--good-bg)' : undefined }}>{chg(x.change)}</td>
                    <td><span className={`chip ${x.plaus.startsWith('atypical') ? 'red' : x.plaus.startsWith('large') ? 'amber' : 'green'}`}>{x.plaus || '–'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="panel-body help">Tropospheric ozone reported as POCP (kg NMVOC eq), non-renewable energy as ADP-fossil (MJ): state this in the credit narrative. Explain any change of 50% or more; reviewers have asked for a narrative or a revised analysis when a reduction was above 70%.</div>
        </div>

        <div className="panel">
          <div className="sec-band">{sys.label} {sys.opt} – compliance paths (indicative)</div>
          {leed.paths.map((p) => (
            <div key={p.label} className={`path-row ${p.met ? 'met' : ''}`}>
              <b>{p.label}</b><span className="num">{p.points}</span><span className="small">{p.requirement}</span>
              <span className={`path-met ${p.met ? 'yes' : 'no'}`}>{p.met ? '✓ met' : '✗ not met'}</span>
            </div>
          ))}
          <div className="panel-body">
            <div className="row"><b>Indicative points</b><span className="good" style={{ fontWeight: 700, fontSize: 16 }}>{sys.sys === 'ID+C' ? `${leed.ptsIdc} (v4.1 Option 3)` : `${leed.ptsBdc41} (v4.1)  |  ${leed.ptsBdc4} (v4)`}</span></div>
            <div className={`note ${base.qaCount + prop.qaCount ? 'warn' : 'good'}`} style={{ marginTop: 8 }}>{leed.status}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)', gap: 18, marginTop: 18 }}>
        <div className="panel">
          <div className="sec-band">Checks</div>
          <table className="tbl compact"><tbody>{checks.map(([k, v]) => <tr key={k}><td className="small">{k}</td><td className="num" style={{ fontWeight: 700 }}>{v}</td></tr>)}</tbody></table>
        </div>
        <div className="panel">
          <div className="sec-band">Eutrophication · LEED indicator: {EP_NAME[project.setup.epIndicator]} ({ep.unit})</div>
          <table className="tbl compact"><tbody>
            <tr><td className="small">EP data coverage (share of GWP, base / prop)</td><td className="num"><b>{pct(base.epcov, 1)} / {pct(prop.epcov, 1)}</b></td><td>{Math.min(base.epcov, prop.epcov) >= 0.9995 ? <span className="chip green">OK</span> : Math.min(base.epcov, prop.epcov) >= 0.95 ? <span className="chip amber">minor gaps: see QA notes</span> : <span className="chip red">add EP fallbacks on the BOQ</span>}</td></tr>
            <tr><td className="small">Lines using an EP fallback (base / prop)</td><td className="num"><b>{base.epxCount} / {prop.epxCount}</b></td><td className="xs muted">{base.epxCount + prop.epxCount ? 'listed in the report' : '–'}</td></tr>
            <tr><td className="small">Direction of the three EP indicators</td><td className="num xs"><b>{ep.direction}</b></td><td>{ep.agree == null ? '–' : ep.agree ? <span className="chip green">same direction</span> : <span className="chip amber">differ: explained in report</span>}</td></tr>
            <tr><td className="small">LEED categories changing ≥ 50%</td><td className="num xs"><b>{largeTxt || 'none'}</b></td><td>{leed.six.some((x) => x.change != null && Math.abs(x.change) >= 0.7) ? <span className="chip red">atypical ≥70%: explain</span> : largeTxt ? <span className="chip amber">large: explain</span> : <span className="chip green">OK</span>}</td></tr>
          </tbody></table>
          <div className="panel-body" style={{ paddingTop: 8 }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>Top 5 lines driving the change in {EP_NAME[project.setup.epIndicator].toLowerCase()} ({ep.unit}, A1–C4)</div>
            <table className="tbl compact"><thead><tr><th>BOQ line</th><th className="num">Baseline</th><th className="num">Proposed</th><th className="num">Change</th><th className="num">Share</th><th>Data</th></tr></thead>
              <tbody>{ep.drivers.length ? ep.drivers.map((d) => <tr key={d.pos}><td className="small">{d.item}</td><td className="num xs">{fmt(d.base, 2)}</td><td className="num xs">{fmt(d.prop, 2)}</td><td className={`num xs ${d.change < 0 ? 'good' : 'bad'}`}><b>{d.change > 0 ? '+' : ''}{fmt(d.change, 2)}</b></td><td className="num xs">{d.share == null ? '' : pct(d.share, 0)}</td><td className="xs">{d.data}</td></tr>)
                : <tr><td colSpan={6} className="muted small">No eutrophication difference between the designs yet.</td></tr>}</tbody></table>
            <div className="help">* = eutrophication from the BOQ fallback dataset.</div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="sec-band">B6 operational energy (grid electricity) – reported separately, not included in the LEED totals</div>
        <table className="tbl compact">
          <thead><tr><th>Indicator</th><th>Unit</th><th className="num">Baseline B6</th><th className="num">Proposed B6</th><th className="num">Change</th></tr></thead>
          <tbody>{IND_NAME.map((nm, i) => <tr key={nm}><td>{nm}</td><td className="xs ink2">{IND_UNIT[i]}</td><td className="num">{fmt(base.b6[i], i === 1 || i === 3 ? 4 : 0)}</td><td className="num">{fmt(prop.b6[i], i === 1 || i === 3 ? 4 : 0)}</td><td className="num">{base.b6[i] ? chg((prop.b6[i] - base.b6[i]) / base.b6[i]) : 'n/a'}</td></tr>)}</tbody>
        </table>
        <div className="panel-body help">{(project.setup.kwhBase ?? 0) + (project.setup.kwhProp ?? 0) === 0 ? 'Enter annual kWh on Project setup to calculate B6.' : `B6 = annual kWh × study period (${result.sp} yr) × grid factor (${project.setup.grid}).`}</div>
      </div>

      {result.designs.length > 2 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="sec-band">Design options compared with the baseline</div>
          <table className="tbl">
            <thead><tr><th>Design</th><th className="num">GWP A1–C4 (t CO2e)</th><th className="num">Change</th><th className="num">Categories ≥10% lower</th><th>Path</th><th className="num">Points</th><th className="num">QA notes</th></tr></thead>
            <tbody>{result.designs.map((d) => {
              const L = d.kind === 'baseline' ? null : result.optionLeed[d.designId];
              return <tr key={d.designId}><td><b>{d.name}</b> <span className="xs muted">{d.kind === 'proposed' ? '(used for LEED)' : ''}</span></td><td className="num">{fmt(d.total[0] / 1000, 1)}</td><td className="num">{L ? chg(L.change[0]) : '–'}</td><td className="num">{L ? L.red10 : '–'}</td><td>{L ? L.pathLabel : '–'}</td><td className="num">{L ? L.points : '–'}</td><td className="num">{d.qaCount}</td></tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
