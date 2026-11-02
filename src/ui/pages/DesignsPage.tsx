import { memo, useMemo, useState } from 'react';
import { useApp } from '../../state/store.ts';
import { lib } from '../../data/libraryStore.ts';
import { leedSys, IND_SHORT, IND_UNIT, CLASSES, shortName } from '../../engine/rules.ts';
import { lineAlternatives, type Alt } from '../../engine/alternatives.ts';
import type { Choice, Design, DesignResult, LineResult, Project, Src } from '../../engine/types.ts';
import type { ProjectResult } from '../../engine/calc.ts';
import { NumInput, TextInput, QaBadge, Tiles, SrcBadge, Menu, Seg } from '../components/common.tsx';
import { DatasetPicker } from '../components/DatasetPicker.tsx';
import { DatasetCard, DsName } from '../components/DatasetCard.tsx';
import { Icon } from '../icons.tsx';
import { fmt, pct, sig, tco2, signed, chg } from '../format.ts';
import { newDesign, uid, today } from '../../state/project.ts';

export function DesignsPage() {
  const { project, result, designTab, setDesignTab, commit, selLine, select, toast } = useApp();
  const [filter, setFilter] = useState<'all' | 'issues' | 'empty'>('all');
  const [q, setQ] = useState('');
  if (!project || !result) return null;
  const di = Math.max(0, project.designs.findIndex((d) => d.id === designTab));
  const design = project.designs[di];
  const dr = result.designs[di];
  const sys = leedSys(project.setup.system);
  const isBase = design.kind === 'baseline';
  const leed = isBase ? result.leed : result.optionLeed[design.id] ?? result.leed;
  const base = result.base;
  const ch = base.total[0] ? (dr.total[0] - base.total[0]) / base.total[0] : null;
  const area = project.setup.area ?? 0;
  const top = dr.lines.filter((l) => l.active).sort((a, b) => b.tot[0] - a.tot[0])[0];
  const lines = dr.lines.filter((l) => {
    if (filter === 'issues' && !(l.active && l.qaraw)) return false;
    if (filter === 'empty' && l.active) return false;
    if (q && !`${l.desc} ${l.elem} ${l.mat}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const addOption = (from: Design) => commit((p) => {
    const d = structuredClone(from) as Design;
    d.id = uid('D-'); d.kind = 'option';
    d.name = `Option ${String.fromCharCode(65 + p.designs.filter((x) => x.kind === 'option').length)}`;
    d.extra = d.extra.map((x) => ({ ...x, id: uid('X') }));
    p.designs.push(d);
    setTimeout(() => setDesignTab(d.id), 0);
  });
  const copyFromBase = () => commit((p) => {
    const b = p.designs.find((x) => x.kind === 'baseline')!;
    const d = p.designs.find((x) => x.id === design.id)!;
    for (const k of Object.keys(b.choices)) d.choices[k] = { ...b.choices[k], reuse: false };
  }, { designId: design.id });
  const setEolAll = (eol: string) => commit((p) => {
    const d = p.designs.find((x) => x.id === design.id)!;
    dr.lines.forEach((l) => { if (l.active && l.hasC === 0 && !l.eol) { if (l.isExtra) { const x = d.extra.find((e) => e.id === l.key); if (x) x.eol = eol; } else d.choices[l.key] = { ...(d.choices[l.key] ?? {}), eol }; } });
  }, { designId: design.id });
  const resetAll = () => commit((p) => {
    const d = p.designs.find((x) => x.id === design.id)!;
    for (const k of Object.keys(d.choices)) {
      const c = d.choices[k];
      d.choices[k] = { src: c.src, cls: c.cls, mat: c.mat, eol: c.eol, reuse: c.reuse, modd: c.modd };
    }
  }, { designId: design.id });
  const addExtra = () => commit((p) => {
    const d = p.designs.find((x) => x.id === design.id)!;
    d.extra.push({ id: uid('X'), elem: sys.elems[0], desc: 'New line (this design only)', pair: '', qty: null, a4: project.setup.truck?.n ?? '' });
  }, { designId: design.id });
  const eolChoices = lib.eolList(project.setup.a4EolDb);
  const inert = eolChoices.find((d) => /landfill \(inert waste\)|Inert matter landfill|inert material landfill/i.test(d.n));

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="step-label"><span className="sheet-no">A-03</span> · Step 3 of 5</div>
          <h1>Designs</h1>
          <p className="lede">Choose a material for every line in each design. Values in italics come from the BOQ; type over a value to change it for one design only. Point at any product name to see its EPD or dataset card.</p>
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 12, gap: 6 }}>
        {project.designs.map((d, k) => (
          <button key={d.id} className={`btn ${d.id === design.id ? 'primary' : ''}`} onClick={() => setDesignTab(d.id)}>
            {d.name}
            <span className="xs" style={{ opacity: 0.8 }}>{tco2(result.designs[k].total[0], 0)} t</span>
          </button>
        ))}
        <Menu label={<><Icon.plus /> Add design option</>} className="btn" items={[
          { label: 'Copy of the Proposed design', onClick: () => addOption(project.designs.find((x) => x.kind === 'proposed')!) },
          { label: 'Copy of the Baseline design', onClick: () => addOption(project.designs.find((x) => x.kind === 'baseline')!) },
          { label: `Copy of ${design.name}`, onClick: () => addOption(design) },
        ]} />
        {design.kind === 'option' && (
          <Menu label={<><Icon.dots /> {design.name}</>} className="btn" items={[
            { label: 'Rename…', onClick: () => { const n = prompt('Name of this design option', design.name); if (n) commit((p) => { p.designs.find((x) => x.id === design.id)!.name = n; }); } },
            { label: 'Make this the Proposed design', onClick: () => commit((p) => {
              const o = p.designs.find((x) => x.id === design.id)!, pr = p.designs.find((x) => x.kind === 'proposed')!;
              const tmpName = pr.name === 'Proposed' ? `Former proposed` : pr.name;
              pr.kind = 'option'; pr.name = tmpName; o.kind = 'proposed';
              p.designs = [p.designs.find((x) => x.kind === 'baseline')!, o, ...p.designs.filter((x) => x.kind === 'option')];
              toast(`${o.name} is now the Proposed design used for LEED`);
            }) },
            { label: 'Delete this option', danger: true, onClick: () => { if (confirm(`Delete ${design.name}?`)) { commit((p) => { p.designs = p.designs.filter((x) => x.id !== design.id); }); setDesignTab(project.designs[1].id); } } },
          ]} />
        )}
      </div>

      <Tiles items={[
        { lab: 'Total GWP · A1–C4', val: `${tco2(dr.total[0])} t CO2e`, sub: `Module D excluded · ${dr.lines.filter((l) => l.active).length} lines` },
        { lab: 'Intensity', val: area ? `${fmt(dr.total[0] / area, 1)} kg/m²` : 'enter floor area', sub: `per m² ${sys.sys === 'ID+C' ? 'floor area' : 'GFA'}${area ? ` (${fmt(area)} m²)` : ''}` },
        isBase
          ? { lab: 'Proposed vs this baseline', val: chg(result.leed.change[0]), tone: (result.leed.change[0] ?? 0) < 0 ? 'good' : 'bad', sub: `${signed((result.prop.total[0] - base.total[0]) / 1000)} t CO2e` }
          : { lab: 'Change vs baseline', val: chg(ch), tone: (ch ?? 0) < 0 ? 'good' : (ch ?? 0) > 0 ? 'bad' : '', sub: `${signed((dr.total[0] - base.total[0]) / 1000)} t CO2e · LEED needs ${sys.sys === 'ID+C' ? '≥20% (Path 3)' : '≥5–10%'}` },
        { lab: `${sys.ptsLabel} (indicative)`, val: `${leed.points} points`, sub: sys.sys === 'ID+C' ? `GWP ${chg(leed.change[0])} · ${leed.other10} other ≥10% lower` : `${leed.red5} of 6 categories ≥5% lower · ${leed.red10} ≥10%` },
        { lab: 'EPD share of GWP', val: pct(dr.srcShare.EPD, 0), sub: 'product-specific EPD data' },
        { lab: 'Data quality', val: <span>{dr.okCount}<span className="t-sym">✓</span><span className={dr.qaCount ? 'warn' : ''}>{dr.qaCount}<span className="t-sym">⚠</span></span>{dr.infoCount ? <span style={{ color: 'var(--blue)' }}>{dr.infoCount}<span className="t-sym">ℹ</span></span> : null}</span>, sub: 'lines with QA notes are listed in the QA column' },
        { lab: 'Top hotspot', val: <span style={{ fontSize: 16 }}>{top ? top.label : '–'}</span>, sub: top ? `${tco2(top.tot[0])} t CO2e · ${pct(top.tot[0] / (dr.total[0] || 1), 0)} of total` : '' },
      ]} />

      <div className="row wrap" style={{ marginBottom: 10, gap: 8 }}>
        <Seg value={filter} onChange={setFilter} options={[{ v: 'all', label: `All lines (${dr.lines.length})` }, { v: 'issues', label: `With QA notes (${dr.qaCount})` }, { v: 'empty', label: `No material (${dr.lines.filter((l) => !l.active).length})` }]} />
        <input className="inp" style={{ width: 220 }} placeholder="Find a line…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="spacer" />
        {!isBase && <button className="btn sm" onClick={copyFromBase} title="Start from the baseline materials, then improve line by line"><Icon.copy /> Copy materials from Baseline</button>}
        <Menu label={<><Icon.dots /> Line tools</>} items={[
          ...(inert ? [{ label: `Set end of life “${shortName(inert.n, inert.src).slice(0, 40)}” where missing`, onClick: () => setEolAll(inert.n) }] : []),
          { label: 'Put every line back on the BOQ values (keep materials)', onClick: resetAll },
          { label: 'Add a line that exists only in this design', onClick: addExtra },
        ]} />
      </div>

      {project.boq.length === 0 && design.extra.length === 0 ? (
        <div className="panel empty"><h3>No lines yet</h3><p>Enter the bill of quantities first; every BOQ line appears here in each design.</p>
          <button className="btn primary" onClick={() => useApp.getState().go('boq')}>Go to the bill of quantities</button></div>
      ) : (
        <div className="tbl-wrap" style={{ maxHeight: 'calc(100vh - 380px)', minHeight: 320 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th className="grp" colSpan={4}>Element and material</th>
                <th className="grp" colSpan={4}>Quantity and service life</th>
                <th className="grp" colSpan={2}>Transport and end of life</th>
                <th className="grp" colSpan={2}>Result (live)</th>
                <th className="grp" />
              </tr>
              <tr>
                <th>#</th><th style={{ minWidth: 190 }}>Element · description</th><th>Source</th><th style={{ minWidth: 300 }}>Material / product</th>
                <th className="num" style={{ minWidth: 120 }}>Quantity (unit)</th><th className="num">Mass t</th><th title="Reused or salvaged (proposed only): A1–A3 of the line is zero">Reuse</th>
                <th className="num" title="Service life (years) and replacements over the study period">Life · repl.</th>
                <th style={{ minWidth: 220 }}>A4 transport · km</th><th style={{ minWidth: 200 }}>End of life (C3–C4)</th>
                <th className="num" style={{ minWidth: 120 }}>GWP t CO2e · share</th><th className="num" title="Pair change vs baseline (t CO2e)">Δ vs baseline</th>
                <th>QA</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <LineRow key={l.key} l={l} design={design} project={project} total={dr.total[0]} isBase={isBase} sel={selLine === l.key} />
              ))}
              <tr className="total">
                <td /><td>Total</td><td colSpan={3} /><td className="num">{fmt(dr.lines.reduce((a, l) => a + l.mass, 0), 1)}</td><td colSpan={4} />
                <td className="num">{tco2(dr.total[0])}</td><td className="num">{isBase ? '' : signed((dr.total[0] - base.total[0]) / 1000)}</td><td>{dr.qaCount} ⚠</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {selLine && <LineDrawer key={selLine + design.id} lineKey={selLine} design={design} dr={dr} project={project} result={result} onClose={() => select(null)} />}
      {void eolChoices}
    </div>
  );
}

const LineRow = memo(function LineRow({ l, design, project, total, isBase, sel }: {
  l: LineResult; design: Design; project: Project; total: number; isBase: boolean; sel: boolean;
}) {
  const { setChoice, select } = useApp.getState();
  const c: Choice = (l.isExtra ? design.extra.find((x) => x.id === l.key) : design.choices[l.key]) ?? {};
  const set = (patch: Partial<Choice>) => setChoice(design.id, l.key, patch);
  const boq = l.isExtra ? null : project.boq.find((b) => b.id === l.key) ?? null;
  const own = (k: keyof Choice) => Object.prototype.hasOwnProperty.call(c, k) && c[k] !== undefined;
  const srcs = (['EPD', 'ÖKOBAUDAT', 'ecoinvent', 'IDEMAT'] as Src[]).filter((s) => lib.has(s) || s === l.src);
  const trucks = lib.transportList(project.setup.a4EolDb);
  const eols = lib.eolList(project.setup.a4EolDb);
  const share = total > 0 && l.active ? l.tot[0] / total : 0;
  const hot = l.active && share >= 0.1;
  return (
    <tr className={`${sel ? 'sel' : ''} ${hot ? 'hot' : ''}`} onClick={(e) => { if ((e.target as HTMLElement).closest('input,select,button,.picker,.ds-name')) return; select(l.key); }}>
      <td className="idx">{l.pos}</td>
      <td style={{ maxWidth: 240 }}>
        <div className="cell-2l"><span className="l1" title={l.desc}>{l.desc || <span className="muted">(no description)</span>}</span><span className="l2">{l.elem}</span></div>
      </td>
      <td>
        <select className={`src-select ${l.src}`} value={l.src} onChange={(e) => set({ src: e.target.value as Src, mat: null })}>
          <option value="">source…</option>
          {srcs.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={{ maxWidth: 360 }}>
        <div className="row" style={{ gap: 4 }}>
          <DatasetPicker src={l.src} value={l.mat || null} boqText={boq?.item ?? l.desc} boqUnit={boq?.unit} cls={c.cls} width="100%"
            onPick={(src, n) => set({ src, mat: n })} />
          {l.mat && <DsName src={l.src} n={l.mat}><Icon.info width={15} height={15} style={{ color: 'var(--mid)', flex: 'none' }} /></DsName>}
        </div>
      </td>
      <td>
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <NumInput value={l.active ? l.qty : (boq?.qty ?? null)} fromBoq={!own('qty') && !l.isExtra} onCommit={(v) => set({ qty: v })} width={96} />
          <span className="xs muted" style={{ minWidth: 26 }}>{l.unit || boq?.unit}</span>
          {own('qty') && !l.isExtra && <button className="icon-btn" title="Back to the BOQ quantity" onClick={() => set({ qty: undefined })}><Icon.reset width={13} /></button>}
        </div>
      </td>
      <td className="num ink2">{l.active ? fmt(l.mass, 1) : ''}</td>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={!!c.reuse} disabled={isBase} title={isBase ? 'Reuse applies to the proposed design (LEED counts it there)' : 'Reused / salvaged'} onChange={(e) => set({ reuse: e.target.checked })} />
      </td>
      <td>
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <NumInput value={l.active ? l.rsl || null : boq?.rsl ?? null} decimals={0} fromBoq={!own('rsl') && !l.isExtra} onCommit={(v) => set({ rsl: v })} width={52} />
          <span className="xs muted" title="Replacements">×{l.repl}</span>
        </div>
      </td>
      <td>
        <div className="row" style={{ gap: 4 }}>
          <select className={`inp ${own('a4') || l.isExtra ? '' : 'from-boq'}`} style={{ width: 150, fontSize: 12 }} value={l.a4} title={l.a4} onChange={(e) => set({ a4: e.target.value })}>
            {l.a4 && !trucks.some((d) => d.n === l.a4) && <option value={l.a4}>{shortName(l.a4, 'IDEMAT').slice(0, 40)}{lib.transport(l.a4) ? '' : ' (not found)'}</option>}
            <option value="">(no A4)</option>
            {trucks.map((d) => <option key={d.src + d.n} value={d.n}>{d.src === 'IDEMAT' ? shortName(d.n, 'IDEMAT') : d.n}</option>)}
          </select>
          <NumInput value={l.active ? l.dist || null : boq?.dist ?? null} decimals={0} fromBoq={!own('dist') && !l.isExtra} onCommit={(v) => set({ dist: v })} width={58} />
        </div>
      </td>
      <td>
        {l.hasC ? <span className="xs ink2" title="The dataset declares C1–C4">from the dataset (C1–C4)</span> : (
          <select className="inp" style={{ width: 190, fontSize: 12 }} value={l.eol} title={l.eol} onChange={(e) => set({ eol: e.target.value || null })}>
            {l.eol && !eols.some((d) => d.n === l.eol) && <option value={l.eol}>{shortName(l.eol, 'IDEMAT').slice(0, 40)}{lib.eol(l.eol) ? '' : ' (not found)'}</option>}
            <option value="">(choose end of life)</option>
            {eols.map((d) => <option key={d.src + d.n} value={d.n}>{d.src}: {d.src === 'IDEMAT' ? shortName(d.n, 'IDEMAT') : d.n}</option>)}
          </select>
        )}
      </td>
      <td className="num gwp">
        {l.active && <div className="share-bar"><i style={{ width: `${Math.min(100, share * 100)}%` }} /><span><b>{tco2(l.tot[0])}</b> · {pct(share, 0)}</span></div>}
      </td>
      <td className={`num ${l.pdelta == null ? '' : l.pdelta < 0 ? 'good' : l.pdelta > 0 ? 'bad' : ''}`} style={{ fontWeight: 700 }}>
        {!isBase && l.pdelta != null ? signed(l.pdelta) : ''}
      </td>
      <td><QaBadge stat={l.stat} qa={l.qa} /></td>
    </tr>
  );
});

function LineDrawer({ lineKey, design, dr, project, result, onClose }: { lineKey: string; design: Design; dr: DesignResult; project: Project; result: ProjectResult; onClose: () => void }) {
  const { setChoice } = useApp.getState();
  const l = dr.lines.find((x) => x.key === lineKey);
  const [altSrc, setAltSrc] = useState<'all' | 'same'>('all');
  const [geo, setGeo] = useState('');
  const [hideExp, setHideExp] = useState(true);
  const alts = useMemo(() => !l || !l.active ? [] as Alt[] : lineAlternatives(project, result, lib, design, lineKey, {
    sources: altSrc === 'same' && l.src ? [l.src as Src] : undefined, hideExpired: hideExp, geo, limit: 12, assessDate: result.assessDate,
  }), [l, project, result, altSrc, geo, hideExp]);
  if (!l) return null;
  const c: Choice = (l.isExtra ? design.extra.find((x) => x.id === lineKey) : design.choices[lineKey]) ?? {};
  const set = (patch: Partial<Choice>) => setChoice(design.id, lineKey, patch);
  const boq = project.boq.find((b) => b.id === lineKey);
  const sys = leedSys(project.setup.system);
  const notes = l.qaraw.split(';').map((s) => s.trim()).filter(Boolean);
  const adv = l.adv.split(';').map((s) => s.trim()).filter(Boolean);
  return (
    <aside className="drawer" aria-label="Line details">
      <div className="drawer-head">
        <div className="grow">
          <div className="xs muted">{design.name} · line {l.pos} · {l.elem || 'no element'}</div>
          <h3 style={{ fontSize: 17 }}>{l.desc || '(no description)'}</h3>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.x /></button>
      </div>
      <div className="drawer-body">
        {l.ds ? <div className="panel" style={{ overflow: 'hidden' }}><DatasetCard d={l.ds} /></div> : l.mat ? <div className="note warn">“{l.mat}” is not in the libraries loaded in this browser.</div> : <div className="note">No material chosen yet: pick one in the table or from the alternatives below.</div>}
        {notes.length > 0 && <div className="note warn"><b>Data QA notes</b><ul style={{ margin: '4px 0 0 18px', padding: 0 }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
        {adv.length > 0 && <div className="note"><b>Scope notes</b><ul style={{ margin: '4px 0 0 18px', padding: 0 }}>{adv.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}

        {l.active && (
          <div>
            <h4>Results of this line (A1–C4)</h4>
            <table className="tbl compact" style={{ border: '1px solid var(--line)', borderRadius: 5 }}>
              <thead><tr><th>Indicator</th><th className="num">A1–A3</th><th className="num">A4</th><th className="num">B4–B5</th><th className="num">C1–C4</th><th className="num">Total</th></tr></thead>
              <tbody>{IND_SHORT.map((nm, i) => (
                <tr key={nm}><td className="xs">{nm} <span className="muted">{IND_UNIT[i]}</span></td>
                  <td className="num xs">{sig(l.stages.A13[i])}</td><td className="num xs">{sig(l.stages.A4[i])}</td><td className="num xs">{sig(l.stages.B45[i])}</td><td className="num xs">{sig(l.stages.C14[i])}</td><td className="num xs"><b>{sig(l.tot[i])}</b></td></tr>
              ))}
                <tr><td className="xs">Module D, GWP</td><td colSpan={4} className="xs muted">reported separately</td><td className="num xs">{sig(l.modD)}</td></tr>
              </tbody>
            </table>
            <div className="xs muted" style={{ marginTop: 4 }}>{fmt(l.qty, 2)} {l.unit} · {fmt(l.kgpu, 2)} kg per {l.unit} · {fmt(l.mass, 2)} t · {l.repl} replacement{l.repl === 1 ? '' : 's'} over {result.sp} years{l.epx ? ' · EP from the BOQ fallback' : ''}</div>
          </div>
        )}

        <div>
          <div className="row"><h4 className="grow">Lower-carbon alternatives</h4>
            <Seg value={altSrc} onChange={setAltSrc} options={[{ v: 'all', label: 'All libraries' }, { v: 'same', label: 'Same source' }]} /></div>
          <div className="row wrap" style={{ margin: '6px 0' }}>
            <input className="inp" style={{ width: 100, height: 28 }} placeholder="Country" value={geo} onChange={(e) => setGeo(e.target.value)} title="e.g. SA, EG, AE" />
            <label className="check xs"><input type="checkbox" checked={hideExp} onChange={(e) => setHideExp(e.target.checked)} /> Hide expired</label>
            <span className="xs muted">Same material class ({l.ds?.cls || '–'}), unit convertible, ranked by the line's GWP.</span>
          </div>
          {!l.active && <div className="xs muted">Choose a material first.</div>}
          {l.active && alts.length === 0 && <div className="xs muted">No other dataset of this class converts to the BOQ unit. Give kg per unit on the BOQ to widen the search.</div>}
          {alts.map((a) => (
            <div key={a.ds.src + a.ds.n} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line2)', alignItems: 'flex-start' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small"><DsName src={a.ds.src} n={a.ds.n} short={false} /></div>
                <div className="row xs muted" style={{ gap: 6 }}><SrcBadge src={a.ds.src} />{a.ds.geo}<span>{tco2(a.gwp)} t</span></div>
              </div>
              <div className="num" style={{ minWidth: 92 }}>
                <div className={a.saving > 0 ? 'good' : 'bad'} style={{ fontWeight: 700 }}>{a.saving > 0 ? '−' : '+'}{tco2(Math.abs(a.saving))} t</div>
                <div className="xs muted">{pct(Math.abs(a.saving) / (result.base.total[0] || 1), 2)} of baseline</div>
              </div>
              <button className="btn xs" onClick={() => set({ src: a.ds.src, mat: a.ds.n })}>Use</button>
            </div>
          ))}
        </div>

        <div>
          <h4>More inputs for this line</h4>
          <div className="form-grid" style={{ gridTemplateColumns: '140px 1fr' }}>
            <div className="lab">kg per unit</div><NumInput value={c.kgin ?? null} placeholder={l.kgpu ? `${fmt(l.kgpu, 2)} (in use)` : 'only if asked'} onCommit={(v) => set({ kgin: v })} />
            <div className="lab">Class filter</div>
            <select className="inp" value={c.cls ?? ''} onChange={(e) => set({ cls: e.target.value || undefined })}>
              <option value="">(none)</option>{CLASSES.map((x) => <option key={x}>{x}</option>)}
            </select>
            <div className="lab">Element</div>
            <select className="inp" value={l.elem} onChange={(e) => set({ elem: e.target.value })}>
              {!sys.elems.includes(l.elem) && <option value={l.elem}>{l.elem || '(none)'}</option>}
              {sys.elems.map((x) => <option key={x}>{x}</option>)}
            </select>
            <div className="lab">Description</div><TextInput value={l.desc} fromBoq={!Object.prototype.hasOwnProperty.call(c, 'desc') && !l.isExtra} onCommit={(v) => set({ desc: v })} />
            <div className="lab" title="Lines with the same pair ID are compared across designs">Pair ID</div><TextInput value={l.pair} onCommit={(v) => set({ pair: v })} />
            <div className="lab">Module D credit</div>
            <select className="inp" value={c.modd ?? ''} onChange={(e) => set({ modd: e.target.value || null })} disabled={!!l.ds?.dGwp}>
              <option value="">{l.ds?.dGwp != null ? 'from the dataset' : '(none)'}</option>
              {lib.moduleDList().map((d) => <option key={d.n} value={d.n}>{shortName(d.n, 'IDEMAT')}</option>)}
            </select>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            {!l.isExtra && <button className="btn sm" onClick={() => setChoice(design.id, lineKey, { src: c.src, mat: c.mat, eol: c.eol, reuse: c.reuse, cls: c.cls, modd: c.modd }, true)}><Icon.reset /> Put this line back on the BOQ</button>}
            {l.isExtra && <button className="btn sm danger" onClick={() => { useApp.getState().commit((p) => { const d = p.designs.find((x) => x.id === design.id)!; d.extra = d.extra.filter((x) => x.id !== lineKey); }); onClose(); }}><Icon.trash /> Delete this line</button>}
          </div>
          {boq && <div className="xs muted" style={{ marginTop: 6 }}>BOQ: {fmt(boq.qty ?? 0, 2)} {boq.unit}{boq.kgpu ? ` · ${fmt(boq.kgpu)} kg/${boq.unit}` : ''} · life {boq.rsl ?? '–'} yr · A4 {boq.dist ?? '–'} km{boq.ref ? ` · ${boq.ref}` : ''}</div>}
        </div>
        {void today}
      </div>
    </aside>
  );
}
