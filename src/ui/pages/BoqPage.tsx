import { useState } from 'react';
import { useApp } from '../../state/store.ts';
import { BOQ_UNITS, densityFor, leedSys, shortName } from '../../engine/rules.ts';
import { newBoqLine } from '../../state/project.ts';
import { NumInput, TextInput, Menu } from '../components/common.tsx';
import { DatasetPicker } from '../components/DatasetPicker.tsx';
import { DsName } from '../components/DatasetCard.tsx';
import { Icon } from '../icons.tsx';
import { tco2, signed } from '../format.ts';
import { BoqImport } from './BoqImport.tsx';
import type { BoqLine } from '../../engine/types.ts';

export function BoqPage() {
  const { project, result, commit, go, setDesignTab, select, toast } = useApp();
  const [imp, setImp] = useState(false);
  if (!project || !result) return null;
  const sys = leedSys(project.setup.system);
  const upd = (id: string, patch: Partial<BoqLine>) => commit((p) => { const b = p.boq.find((x) => x.id === id); if (b) Object.assign(b, patch); });
  const add = () => commit((p) => { p.boq.push(newBoqLine({ elem: sys.elems[0] })); });
  const del = (id: string) => commit((p) => { p.boq = p.boq.filter((b) => b.id !== id); for (const d of p.designs) delete d.choices[id]; });
  const move = (id: string, dir: -1 | 1) => commit((p) => {
    const i = p.boq.findIndex((b) => b.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= p.boq.length) return;
    [p.boq[i], p.boq[j]] = [p.boq[j], p.boq[i]];
  });
  const base = result.base, prop = result.prop;
  const totalB = base.total[0], totalP = prop.total[0];
  const estimate = () => {
    let n = 0;
    commit((p) => { for (const b of p.boq) if (b.unit === 'm3' && !b.kgpu) { const d = densityFor(b.item); if (d) { b.kgpu = d; n++; } } });
    toast(n ? `kg per unit estimated for ${n} m3 lines from typical densities` : 'No m3 line without kg per unit');
  };
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="step-label">Step 2 of 5</div>
          <h1>Bill of quantities</h1>
          <p className="lede">Enter every item once: element, description, quantity and unit, service life and A4 distance. Both designs use these lines; you only choose the material for each design. Quantities convert automatically (t ↔ kg directly, other units through kg per unit).</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setImp(true)}><Icon.upload /> Import Excel / CSV</button>
          <button className="btn" onClick={() => go('model')}><Icon.model /> Import from IFC</button>
          <Menu label={<><Icon.dots /> More</>} items={[
            { label: 'Estimate kg per unit for m3 lines (typical densities)', onClick: estimate },
            { label: 'Clear all BOQ lines', danger: true, onClick: () => { if (confirm('Remove every BOQ line and its material choices?')) commit((p) => { p.boq = []; for (const d of p.designs) d.choices = {}; }); } },
          ]} />
          <button className="btn primary" onClick={add}><Icon.plus /> Add line</button>
        </div>
      </div>
      {project.boq.length === 0 ? (
        <div className="panel empty">
          <h3>No BOQ lines yet</h3>
          <p>Add lines by hand, import a contractor BOQ from Excel or CSV, or take quantities from an IFC model.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
            <button className="btn primary" onClick={add}><Icon.plus /> Add the first line</button>
            <button className="btn" onClick={() => setImp(true)}><Icon.upload /> Import Excel / CSV</button>
            <button className="btn" onClick={() => go('model')}><Icon.model /> Import from IFC</button>
          </div>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="grp" colSpan={10}>Bill of quantities · enter once</th>
                <th className="grp" colSpan={5} style={{ background: 'var(--dark)' }}>Material choice and result per line (live)</th>
                <th className="grp" />
              </tr>
              <tr>
                <th>#</th><th>Element category</th><th style={{ minWidth: 220 }}>BOQ item / description</th><th className="num">Quantity</th><th>Unit</th>
                <th className="num" title="Needed when a dataset uses another unit (e.g. 2,400 kg per m3 of concrete)">kg per unit</th>
                <th className="num">Service life</th><th className="num">A4 km</th><th>Ref / notes</th>
                <th title="Used only where a design's dataset has no or implausibly low eutrophication data">EP fallback</th>
                <th>Baseline material</th><th className="num">t CO2e</th><th>Proposed material</th><th className="num">t CO2e</th><th className="num">Change</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {project.boq.map((b, i) => {
                const bl = base.lines[i], pl = prop.lines[i];
                const ch = bl?.active && pl?.active ? pl.tot[0] - bl.tot[0] : null;
                const xst = result.boqXst[b.id];
                const goLine = (designKind: 'baseline' | 'proposed') => {
                  const d = project.designs.find((x) => x.kind === designKind);
                  if (d) { setDesignTab(d.id); go('designs'); select(b.id); }
                };
                return (
                  <tr key={b.id}>
                    <td className="idx">{i + 1}</td>
                    <td style={{ minWidth: 190 }}>
                      <select className="inp" value={b.elem} onChange={(e) => upd(b.id, { elem: e.target.value })}>
                        {!sys.elems.includes(b.elem) && <option value={b.elem}>{b.elem || '(choose)'}</option>}
                        {sys.elems.map((el) => <option key={el}>{el}</option>)}
                      </select>
                    </td>
                    <td><TextInput value={b.item} onCommit={(v) => upd(b.id, { item: v })} placeholder="e.g. Raft concrete C40" /></td>
                    <td style={{ width: 110 }}><NumInput value={b.qty} onCommit={(v) => upd(b.id, { qty: v })} /></td>
                    <td style={{ width: 82 }}>
                      <select className="inp" value={b.unit} onChange={(e) => upd(b.id, { unit: e.target.value })}>
                        {!BOQ_UNITS.includes(b.unit) && <option>{b.unit}</option>}
                        {BOQ_UNITS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ width: 96 }}><NumInput value={b.kgpu} onCommit={(v) => upd(b.id, { kgpu: v })} placeholder={b.unit === 'kg' || b.unit === 't' ? 'n/a' : ''} /></td>
                    <td style={{ width: 80 }}><NumInput value={b.rsl} onCommit={(v) => upd(b.id, { rsl: v })} decimals={0} /></td>
                    <td style={{ width: 80 }}><NumInput value={b.dist} onCommit={(v) => upd(b.id, { dist: v })} decimals={0} /></td>
                    <td style={{ minWidth: 110 }}><TextInput value={b.ref} onCommit={(v) => upd(b.id, { ref: v })} /></td>
                    <td style={{ minWidth: 170 }}>
                      <div className="row" style={{ gap: 4 }}>
                        <DatasetPicker src={b.epx?.src ?? 'ecoinvent'} value={b.epx?.n} placeholder="(optional)" boqText={b.item} width={170}
                          onPick={(src, n) => upd(b.id, { epx: { src, n } })} />
                        {b.epx && <button className="icon-btn" title="Remove the fallback" onClick={() => upd(b.id, { epx: null })}><Icon.x /></button>}
                      </div>
                      {xst && xst !== 'OK' && <div className="xs warn">{xst}</div>}
                    </td>
                    <td style={{ maxWidth: 240 }} onDoubleClick={() => goLine('baseline')}>
                      {bl?.active ? <DsName src={bl.src} n={bl.mat} /> : <button className="btn xs ghost muted" onClick={() => goLine('baseline')}>(choose on Baseline)</button>}
                    </td>
                    <td className="num">{bl?.active ? tco2(bl.tot[0]) : ''}</td>
                    <td style={{ maxWidth: 240 }}>
                      {pl?.active ? <DsName src={pl.src} n={pl.mat} /> : <button className="btn xs ghost muted" onClick={() => goLine('proposed')}>(choose on Proposed)</button>}
                    </td>
                    <td className="num">{pl?.active ? tco2(pl.tot[0]) : ''}</td>
                    <td className={`num ${ch == null ? '' : ch < 0 ? 'good' : ch > 0 ? 'bad' : ''}`} style={{ fontWeight: 700 }}>{ch == null ? '' : signed(ch / 1000)}</td>
                    <td className="nowrap">
                      <button className="icon-btn" title="Move up" onClick={() => move(b.id, -1)}>↑</button>
                      <button className="icon-btn" title="Move down" onClick={() => move(b.id, 1)}>↓</button>
                      <button className="icon-btn" title="Delete line" onClick={() => del(b.id)}><Icon.trash /></button>
                    </td>
                  </tr>
                );
              })}
              <tr className="total">
                <td /><td>Total</td><td>{project.boq.length} BOQ lines</td><td colSpan={8} />
                <td className="num">{tco2(totalB)}</td><td /><td className="num">{tco2(totalP)}</td>
                <td className={`num ${totalP - totalB < 0 ? 'good' : 'bad'}`}>{signed((totalP - totalB) / 1000)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="help" style={{ marginTop: 10 }}>
        Line numbers match the design lines (BOQ line 5 = line 5 in every design). On each design, values taken from this sheet show in green italics; type over a cell there to change it for that design only. {shortName('', '')}
      </p>
      {imp && <BoqImport onClose={() => setImp(false)} />}
    </div>
  );
}
