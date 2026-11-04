import { useMemo, useState } from 'react';
import { useApp } from '../../state/store.ts';
import { lib } from '../../data/libraryStore.ts';
import { Library } from '../../engine/library.ts';
import { CLASSES } from '../../engine/rules.ts';
import type { Dataset, Src } from '../../engine/types.ts';
import { findDatasets } from '../components/DatasetPicker.tsx';
import { DatasetCard, isExpired } from '../components/DatasetCard.tsx';
import { SrcBadge } from '../components/common.tsx';
import { dateFmt, sig } from '../format.ts';

export function FinderPage() {
  const { project, setChoice, toast, commit } = useApp();
  const avail = (['EPD', 'ÖKOBAUDAT', 'ecoinvent', 'IDEMAT'] as Src[]).filter((s) => lib.has(s));
  const [q, setQ] = useState('');
  const [src, setSrc] = useState<Src | 'All'>('All');
  const [cls, setCls] = useState('All');
  const [unit, setUnit] = useState('');
  const [geo, setGeo] = useState('');
  const [hideExp, setHideExp] = useState(true);
  const [sel, setSel] = useState<Dataset | null>(null);
  const [target, setTarget] = useState(() => project?.designs.find((d) => d.kind === 'proposed')?.id ?? 'boq-ep');
  const [line, setLine] = useState(1);
  const rows = useMemo(() => findDatasets({ q, srcs: src === 'All' ? avail : [src], cls, unit, hideExpired: hideExp, geo, limit: 300 }), [q, src, cls, unit, geo, hideExp, lib.version]);
  const send = (d: Dataset) => {
    if (!project) return;
    const b = project.boq[line - 1];
    if (target === 'boq-ep') {
      if (!b) return toast(`BOQ line ${line} does not exist`);
      commit((p) => { p.boq[line - 1].epx = { src: d.src, n: d.n }; });
      toast(`EP fallback of BOQ line ${line} set`);
      return;
    }
    const des = project.designs.find((x) => x.id === target);
    if (!des) return;
    const key = b?.id ?? des.extra[line - 1 - project.boq.length]?.id;
    if (!key) return toast(`Line ${line} does not exist`);
    setChoice(des.id, key, { src: d.src, mat: d.n });
    toast(`Line ${line} of ${des.name}: ${d.n.slice(0, 60)}`);
  };
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="step-label"><span className="sheet-no">C-01</span> · Libraries</div><h1>Material finder</h1>
          <p className="lede">One search across every library in this browser, lowest carbon first. Results compare GWP A1–A3 per declared unit and per kg.</p>
        </div>
      </div>
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-body row wrap">
          <input className="inp" style={{ flex: '1 1 300px' }} placeholder="Keyword: product, maker, EPD number, class…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <select className="inp" style={{ width: 150 }} value={src} onChange={(e) => setSrc(e.target.value as any)}><option value="All">All libraries</option>{avail.map((s) => <option key={s}>{s}</option>)}</select>
          <select className="inp" style={{ width: 230 }} value={cls} onChange={(e) => setCls(e.target.value)}><option value="All">All material classes</option>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="inp" style={{ width: 100 }} value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">Any unit</option>{['kg', 'm3', 'm2', 'm', 'piece'].map((u) => <option key={u}>{u}</option>)}</select>
          <input className="inp" style={{ width: 110 }} placeholder="Country" value={geo} onChange={(e) => setGeo(e.target.value)} />
          <label className="check"><input type="checkbox" checked={hideExp} onChange={(e) => setHideExp(e.target.checked)} /> Hide expired</label>
        </div>
        {project && (
          <div className="panel-body row wrap" style={{ borderTop: '1px solid var(--line2)', paddingTop: 10 }}>
            <span className="lab">Send the chosen result to</span>
            <select className="inp" style={{ width: 200 }} value={target} onChange={(e) => setTarget(e.target.value)}>
              {project.designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value="boq-ep">BOQ EP fallback</option>
            </select>
            <span className="lab">line</span><input className="inp num" type="number" min={1} style={{ width: 80 }} value={line} onChange={(e) => setLine(Math.max(1, Number(e.target.value)))} />
            <span className="help">{project.boq[line - 1]?.item ?? ''}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 14 }}>
        <div className="tbl-wrap" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <table className="tbl">
            <thead><tr><th>#</th><th>Source</th><th>Material / product</th><th>Class</th><th>Unit</th><th className="num">kg/unit</th><th className="num">GWP A1–A3 /unit</th><th className="num">/kg</th><th>Country</th><th>Valid until</th>{project && <th />}</tr></thead>
            <tbody>
              {rows.map((d, i) => {
                const kg = Library.kgOf(d);
                const v = Library.validUntil(d);
                return (
                  <tr key={d.src + d.n} className={sel === d ? 'sel' : ''} onMouseEnter={() => setSel(d)} onClick={() => setSel(d)}>
                    <td className="idx">{i + 1}</td><td><SrcBadge src={d.src} /></td>
                    <td className={`small ${d.n.startsWith('CHECK') ? 'warn' : ''}`} style={{ minWidth: 280, maxWidth: 440 }}>{d.n}</td>
                    <td className="xs ink2">{d.cls}</td><td>{d.u}</td><td className="num">{kg ? sig(kg) : ''}</td>
                    <td className="num">{sig(d.a[0])}</td><td className="num"><b>{kg ? sig((d.a[0] ?? 0) / kg) : ''}</b></td>
                    <td>{d.geo}</td><td className={`xs ${isExpired(d) ? 'bad' : ''}`}>{v ? dateFmt(v) : ''}</td>
                    {project && <td><button className="btn xs" onClick={() => send(d)}>Send</button></td>}
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={11} className="empty">No match.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="panel" style={{ alignSelf: 'start', position: 'sticky', top: 0, overflow: 'hidden' }}>
          {sel ? <DatasetCard d={sel} /> : <div className="empty small">Point at a result to see its product card.</div>}
        </div>
      </div>
    </div>
  );
}
