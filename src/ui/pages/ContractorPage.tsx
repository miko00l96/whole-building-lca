import { useApp } from '../../state/store.ts';
import { contractor } from '../../engine/text.ts';
import { fmt, pct, sig } from '../format.ts';
import { DsName } from '../components/DatasetCard.tsx';
import { Icon } from '../icons.tsx';

export function ContractorPage() {
  const { project, result } = useApp();
  if (!project || !result) return null;
  const c = contractor(result, project);
  const L = result.leed;
  const q = (x: number) => (x >= 100 ? fmt(x, 0) : x >= 1 ? fmt(x, 1) : fmt(x, 2));
  const prop = result.prop.lines;
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Recommendations for the contractor</h1>
          <p className="lede">For the project team and the contractor; not part of the LEED submission. The materials below carry the LEED result, so substitutions need the LCA consultant's check first.</p>
        </div>
        <button className="btn" onClick={() => window.print()}><Icon.print /> Print this page</button>
      </div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="sec-band">The LEED result these materials support</div>
        <div className="panel-body">
          <dl className="kv" style={{ gridTemplateColumns: '260px 1fr', fontSize: 14 }}>
            <dt>Rating system and result</dt><dd>{result.sys.label} · {result.sys.opt} · {L.points === 0 ? 'no path met yet' : `${L.pathLabel} (${L.points} point${L.points === 1 ? '' : 's'}, indicative)`}</dd>
            <dt>GWP compared with the baseline</dt><dd>{L.change[0] == null ? 'fill both designs to compare' : `${pct(Math.abs(L.change[0]))} ${L.change[0] <= 0 ? 'lower' : 'higher'}`}{c.target != null ? ` · ${L.pathLabel} needs at least ${Math.round(c.target * 100)}% lower` : ''}</dd>
            <dt>Margin before that threshold is lost</dt><dd>{c.margin == null ? 'No GWP threshold applies to the current result.' : `${fmt(c.margin / 1000, 1)} t CO2e of extra GWP (${pct(c.margin / result.base.total[0])} of the baseline)`}</dd>
            <dt>Part A covers</dt><dd>{c.totalSavings <= 0 ? '–' : `${c.partA.length} lines, ${pct(c.coveredShare, 0)} of the total line-by-line GWP reduction (${fmt(c.totalSavings, 1)} t CO2e)`}</dd>
          </dl>
        </div>
      </div>
      <div className="note warn" style={{ marginBottom: 16, fontWeight: 700 }}>
        Before approving any substitution or value engineering of the materials below, send the alternative product's EPD to the LCA consultant: the LEED LCA result relies on these materials. A substitute whose EPD shows the same or a lower A1–A3 GWP per declared unit (specified GWP) keeps the result. Break-even GWP is the most one item may reach before the project drops below {c.target == null ? 'the GWP threshold' : `${L.pathLabel}'s threshold (${Math.round(c.target * 100)}% lower GWP)`}, if nothing else changes. Items in part B must be reused or salvaged as modelled.
      </div>
      <div className="sec-band">A. Materials that deliver most of the GWP reduction · keep as specified</div>
      <div className="tbl-wrap" style={{ borderRadius: '0 0 8px 8px', marginBottom: 18 }}>
        <table className="tbl">
          <thead><tr><th>Line</th><th>Element</th><th>Description (BOQ)</th><th>Specified material / EPD (proposed)</th><th>Source</th><th>Baseline material (same pair)</th><th className="num">Quantity</th><th>Unit</th><th className="num">GWP saved (t)</th><th className="num">Share</th><th className="num">Specified GWP A1–A3 (kg CO2e/unit)</th><th className="num">Break-even GWP A1–A3</th><th>What to do</th></tr></thead>
          <tbody>
            {c.partA.length === 0 && <tr><td colSpan={13} className="muted">No line saves GWP compared with its baseline pair yet: fill both designs with the same BOQ lines.</td></tr>}
            {c.partA.map((r) => {
              const l = prop.find((x) => x.pos === r.pos);
              return (
                <tr key={r.pos}><td className="idx">{r.pos}</td><td className="small">{r.elem}</td><td className="small">{r.desc}</td>
                  <td className="small" style={{ maxWidth: 300 }}>{l ? <DsName src={l.src} n={l.mat} short={false}>{r.mat}</DsName> : r.mat}</td><td className="small">{r.src}</td>
                  <td className="small" style={{ maxWidth: 220 }}>{r.baseMat}</td><td className="num">{q(r.qty)}</td><td>{r.unit}</td><td className="num"><b>{fmt(r.saved, 1)}</b></td>
                  <td className="num">{r.share == null ? '' : pct(r.share, 0)}</td><td className="num">{sig(r.fGwp)}</td><td className="num">{r.breakEven == null ? '–' : sig(r.breakEven)}</td><td className="small">{r.todo}</td></tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sec-band">B. Items to be reused or salvaged · as modelled in the LCA</div>
      <div className="tbl-wrap" style={{ borderRadius: '0 0 8px 8px', marginBottom: 18 }}>
        <table className="tbl">
          <thead><tr><th>Line</th><th>Element</th><th>Description</th><th>Material</th><th>Source</th><th className="num">Quantity</th><th>Unit</th><th className="num">GWP avoided (t)</th><th className="num">GWP A1–A3 of a new product</th><th>What to do</th></tr></thead>
          <tbody>
            {c.partB.length === 0 && <tr><td colSpan={10} className="muted">No reused or salvaged items on the proposed design (Reuse ticked).{result.sys.sys === 'ID+C' ? ' Reuse or salvage is required for ID+C Path 3.' : result.sys.ver === 'v4.1' ? ' Reuse or salvage is required for BD+C Path 4.' : ''}</td></tr>}
            {c.partB.map((r) => <tr key={r.pos}><td className="idx">{r.pos}</td><td className="small">{r.elem}</td><td className="small">{r.desc}</td><td className="small">{r.mat}</td><td className="small">{r.src}</td><td className="num">{q(r.qty)}</td><td>{r.unit}</td><td className="num">{fmt(r.saved, 1)}</td><td className="num">{sig(r.fGwp)}</td><td className="small">{r.todo}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="panel"><div className="panel-body col small ink2">
        <div><b>Part A:</b> proposed lines ranked by the GWP they save against their baseline pair, until they cover 80% of the total reduction; any line saving more than 5% of the baseline GWP is listed too.</div>
        <div><b>Specified GWP:</b> the A1–A3 GWP per declared unit of the material used in the LCA. A substitute whose EPD shows the same or a lower value for the same declared unit keeps the LEED result.</div>
        <div><b>Break-even GWP:</b> the highest A1–A3 GWP per unit this one item could have before the project drops below the GWP reduction needed for the current path, if nothing else changes. GWP only: the other impact categories also count, so send every substitute's EPD to the LCA consultant.</div>
        <div><b>Generic data</b> (ÖKOBAUDAT, ecoinvent, IDEMAT) has no product EPD to lock: keep the specified material type and its performance (strength class, density, thickness).</div>
      </div></div>
    </div>
  );
}
