// 3D model (IFC): quantities from the model into the BOQ, and the building coloured by embodied carbon, change against the
// baseline, element category, data source or link status.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../state/store.ts';
import { newBoqLine, pickFile } from '../../state/project.ts';
import { BOQ_UNITS } from '../../engine/rules.ts';
import type { LineResult } from '../../engine/types.ts';
import { CarbonViewer, type Paint } from '../../ifc/Viewer.ts';
import { cachedModel, forgetIfc, readIfc, storedIfc, storeIfc, type LoadedModel } from '../../ifc/load.ts';
import { clsLabel, groupElements, linkIndex, planLines, refreshQuantities, type Group } from '../../ifc/takeoff.ts';
import type { IfcElem } from '../../ifc/types.ts';
import { SRC_COLOR } from '../components/Chart.tsx';
import { Seg } from '../components/common.tsx';
import { Icon } from '../icons.tsx';
import { fmt } from '../format.ts';
import '../../ifc/model.css';

type Mode = 'carbon' | 'change' | 'category' | 'source' | 'links' | 'ifc';
const HEAT = ['#fbe7b5', '#f6c56f', '#ee9d48', '#df702e', '#c6461f', '#9a2c16', '#661c10'];
const DIV = { down3: '#1b6e45', down2: '#3f9a63', down1: '#9fd0b0', zero: '#d9ddda', up1: '#f6c9a0', up2: '#e8853a', up3: '#b5481c' };
const CAT = ['#1b6e45', '#2a78d6', '#e8853a', '#7fbf96', '#9a5b8c', '#b08a2e', '#4c6a92', '#2f7f86', '#c6461f', '#7aa6e0', '#a9864e', '#5d6b63', '#d4a5c8', '#858c88'];
const GHOST = '#d5dad7';
const kgT = (kg: number) => (Math.abs(kg) >= 1000 ? `${fmt(kg / 1000, kg >= 10000 ? 0 : 1)} t` : `${fmt(kg, 0)} kg`);

function quantiles(vals: number[], n: number): number[] {
  const v = vals.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  return Array.from({ length: n - 1 }, (_, k) => v[Math.min(v.length - 1, Math.floor(((k + 1) / n) * v.length))]);
}

export default function ModelPage() {
  const { project, result, commit, toast, go, setDesignTab, select } = useApp();
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<CarbonViewer | null>(null);
  const [model, setModel] = useState<LoadedModel | null>(() => (project ? cachedModel(project.id) : null));
  const [busy, setBusy] = useState<{ phase: string; done: number; total: number } | null>(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<Mode>('carbon');
  const [designId, setDesignId] = useState(() => project?.designs.find((d) => d.kind === 'proposed')?.id ?? '');
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [plan, setPlan] = useState<Record<string, { unit?: string; elem?: string; split?: boolean }>>({});
  const [showOut, setShowOut] = useState(false);
  const [over, setOver] = useState(false);

  // open a file
  const openBuffer = async (buf: ArrayBuffer, name: string, keep = true) => {
    if (!project) return;
    setErr('');
    setBusy({ phase: 'Starting the IFC reader', done: 0, total: 1 });
    try {
      const m = await readIfc(project.id, buf, name, (done, total, phase) => setBusy({ done, total, phase }));
      if (keep) await storeIfc(project.id, name, buf);
      setModel(m);
      setSel(null);
      setFocus(null);
      if (project.ifcFile !== name) commit((p) => { p.ifcFile = name; });
    } catch (e: any) {
      setErr(`The IFC file could not be read: ${e?.message ?? e}. Export it again from the BIM tool (IFC2x3 or IFC4) and retry.`);
    } finally {
      setBusy(null);
    }
  };
  const chooseFile = async () => {
    const f = await pickFile('.ifc');
    if (f) openBuffer(await f.arrayBuffer(), f.name);
  };
  useEffect(() => {
    if (!project || model) return;
    storedIfc(project.id).then((s) => { if (s) openBuffer(s.buffer, s.file, false); });
  }, [project?.id]);

  // viewer life cycle
  useEffect(() => {
    if (!model || !host.current) return;
    const v = new CarbonViewer(host.current);
    viewer.current = v;
    v.add(model.meshes);
    v.addEdges();
    v.fit();
    v.onHover = (id, x, y) => setHover(id == null ? null : { id, x, y });
    v.onPick = (id) => setSel(id);
    return () => { v.dispose(); viewer.current = null; };
  }, [model]);

  const system = project?.setup.system ?? 0;
  const groups = useMemo(() => (model ? groupElements(model.elements, system) : []), [model, system]);
  const groupOf = useMemo(() => { const m = new Map<number, Group>(); for (const g of groups) for (const e of g.els) m.set(e.id, g); return m; }, [groups]);
  const byId = useMemo(() => new Map((model?.elements ?? []).map((e) => [e.id, e])), [model]);
  const links = useMemo(() => (project ? linkIndex(project) : new Map()), [project]);
  const lineRes = useMemo(() => {
    const m = new Map<string, Map<string, LineResult>>();
    for (const d of result?.designs ?? []) m.set(d.designId, new Map(d.lines.map((l) => [l.key, l])));
    return m;
  }, [result]);
  const elemGwp = (e: IfcElem, dId: string) => {
    const lr = lineRes.get(dId);
    let s = 0;
    for (const k of links.get(e.gid) ?? []) { const l = lr?.get(k.line.id); if (l?.active && k.total > 0) s += (l.tot[0] * k.q) / k.total; }
    return s;
  };
  const baseId = project?.designs.find((d) => d.kind === 'baseline')?.id ?? '';
  const elems = result?.sys.elems ?? [];

  // colours
  const legend = useMemo(() => {
    if (!model || !project) return { title: '', items: [] as { c: string; t: string }[], paint: (_: number): Paint => ({ color: GHOST }) };
    const els = model.elements;
    const linked = (e: IfcElem) => (links.get(e.gid)?.length ?? 0) > 0;
    const ghost = (e: IfcElem): Paint => ({ color: GHOST, opacity: groupOf.get(e.id)?.inScope === false ? 0.16 : 0.42 });
    let paint: (e: IfcElem) => Paint;
    let items: { c: string; t: string }[] = [];
    let title = '';
    if (mode === 'carbon') {
      const vals = new Map(els.map((e) => [e.id, elemGwp(e, designId)]));
      const q = quantiles([...vals.values()], HEAT.length);
      const bin = (x: number) => { let k = 0; while (k < q.length && x > q[k]) k++; return k; };
      paint = (e) => (linked(e) ? { color: HEAT[bin(vals.get(e.id) ?? 0)] } : ghost(e));
      const name = project.designs.find((d) => d.id === designId)?.name ?? '';
      title = `GWP A1–C4 per element · ${name}`;
      items = HEAT.map((c, k) => ({ c, t: k === 0 ? `up to ${kgT(q[0] ?? 0)}` : k === HEAT.length - 1 ? `over ${kgT(q[k - 1] ?? 0)}` : `${kgT(q[k - 1] ?? 0)} – ${kgT(q[k] ?? 0)}` }));
      if (!q.length) items = [];
    } else if (mode === 'change') {
      const d = new Map(els.map((e) => [e.id, elemGwp(e, designId) - elemGwp(e, baseId)]));
      const mx = Math.max(1, ...[...d.values()].map((x) => Math.abs(x)));
      const col = (x: number) => (Math.abs(x) < mx * 0.02 ? DIV.zero : x < 0 ? (x < -mx * 0.4 ? DIV.down3 : x < -mx * 0.12 ? DIV.down2 : DIV.down1) : x > mx * 0.4 ? DIV.up3 : x > mx * 0.12 ? DIV.up2 : DIV.up1);
      paint = (e) => (linked(e) ? { color: col(d.get(e.id) ?? 0) } : ghost(e));
      title = `GWP change vs the baseline, per element (largest ${kgT(mx)})`;
      items = [{ c: DIV.down3, t: 'much lower' }, { c: DIV.down2, t: 'lower' }, { c: DIV.down1, t: 'slightly lower' }, { c: DIV.zero, t: 'about the same' }, { c: DIV.up1, t: 'slightly higher' }, { c: DIV.up2, t: 'higher' }, { c: DIV.up3, t: 'much higher' }];
    } else if (mode === 'category') {
      const cats = new Map<string, string>();
      elems.forEach((x, k) => cats.set(x, CAT[k % CAT.length]));
      paint = (e) => {
        const l = links.get(e.gid)?.[0]?.line;
        const c = l ? cats.get(l.elem) ?? '#858c88' : null;
        return c ? { color: c } : ghost(e);
      };
      title = 'Element category of the BOQ line';
      const used = new Set(project.boq.filter((b) => b.ifc?.parts?.length).map((b) => b.elem));
      items = [...cats].filter(([k]) => used.has(k)).map(([t, c]) => ({ c, t }));
    } else if (mode === 'source') {
      const lr = lineRes.get(designId);
      paint = (e) => {
        const l = links.get(e.gid)?.[0]?.line;
        const r = l ? lr?.get(l.id) : undefined;
        return r?.active ? { color: SRC_COLOR[r.src] ?? '#858c88' } : linked(e) ? { color: '#f1d7c4' } : ghost(e);
      };
      title = 'Data source of the material';
      items = [...Object.entries(SRC_COLOR).map(([t, c]) => ({ c, t })), { c: '#f1d7c4', t: 'linked, no material yet' }];
    } else if (mode === 'links') {
      paint = (e) => (linked(e) ? { color: '#2a7a4b' } : groupOf.get(e.id)?.inScope === false ? { color: GHOST, opacity: 0.25 } : { color: '#e8853a' });
      title = 'Quantities taken into the BOQ';
      items = [{ c: '#2a7a4b', t: 'linked to a BOQ line' }, { c: '#e8853a', t: 'in scope, not linked yet' }, { c: GHOST, t: 'outside the LEED scope' }];
    } else {
      paint = (e) => { const c = model.colors.get(e.id) ?? [0.8, 0.8, 0.8, 1]; return { color: `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`, opacity: c[3] < 0.99 ? Math.max(0.25, c[3]) : 1 }; };
      title = 'Colours of the IFC file';
    }
    const fin = (id: number): Paint => {
      const e = byId.get(id);
      if (!e) return { color: GHOST, hidden: true };
      const g = groupOf.get(id);
      if (!showOut && g?.inScope === false && mode !== 'ifc') return { color: GHOST, opacity: 0.1 };
      if (focus && g?.key !== focus) return { color: GHOST, opacity: 0.1 };
      return paint(e);
    };
    return { title, items, paint: fin };
  }, [model, project, result, mode, designId, focus, showOut, links, groupOf]);
  useEffect(() => { viewer.current?.paint(legend.paint); }, [legend, model]);
  useEffect(() => { viewer.current?.select(sel); }, [sel, model]);

  if (!project || !result) return null;
  const sp = result.sp;
  const linesOfGroup = (g: Group) => {
    const gids = new Set(g.els.map((e) => e.gid));
    return project.boq.map((b, k) => ({ b, k })).filter(({ b }) => b.ifc?.parts?.some((x) => gids.has(x.gid)));
  };
  const create = (gs: Group[]) => {
    let n = 0, missing = 0;
    commit((p) => {
      for (const g of gs) {
        const o = plan[g.key] ?? {};
        for (const pl of planLines(g, o.unit ?? g.unit, o.elem ?? g.elem, sp, !!o.split)) {
          missing += pl.missing;
          p.boq.push(newBoqLine({ elem: pl.elem, item: pl.item, qty: pl.qty, unit: pl.unit, kgpu: pl.kgpu, rsl: pl.rsl, origin: 'ifc',
            ifc: { file: model?.file ?? '', parts: pl.parts, group: g.key, layer: pl.layer, dens: pl.dens } }));
          n++;
        }
      }
      p.ifcFile = model?.file ?? p.ifcFile;
    });
    toast(`${n} BOQ line${n === 1 ? '' : 's'} added from the model${missing ? ` (${missing} elements had no quantity in that unit)` : ''}. Choose their materials on Designs.`);
  };
  const linkTo = (g: Group, lineId: string) => {
    commit((p) => {
      const b = p.boq.find((x) => x.id === lineId);
      if (!b) return;
      const gids = new Set(g.els.map((e) => e.gid));
      const pl = planLines(g, b.unit, b.elem, sp, false)[0];
      const kept = (b.ifc?.parts ?? []).filter((x) => !gids.has(x.gid));
      const parts = [...kept, ...pl.parts];
      b.ifc = { file: model?.file ?? '', parts, group: kept.length ? undefined : g.key, layer: null, dens: pl.dens };
      b.qty = Math.round(parts.reduce((a, x) => a + x.q, 0) * 1000) / 1000;
      if (b.kgpu == null && pl.kgpu != null) b.kgpu = pl.kgpu;
    });
    toast(`Model quantities linked to the BOQ line`);
  };
  const unlink = (g: Group) => {
    const gids = new Set(g.els.map((e) => e.gid));
    commit((p) => {
      for (const b of p.boq) {
        if (!b.ifc?.parts?.some((x) => gids.has(x.gid))) continue;
        const parts = b.ifc.parts.filter((x) => !gids.has(x.gid));
        if (!parts.length) b.ifc = null;
        else { b.ifc = { ...b.ifc, parts, group: undefined }; b.qty = Math.round(parts.reduce((a, x) => a + x.q, 0) * 1000) / 1000; }
      }
    });
  };
  const refresh = () => {
    if (!model) return;
    const ch = refreshQuantities(project, model.elements);
    if (!ch.length) return toast('The linked BOQ quantities already match the model');
    commit((p) => { for (const c of ch) { const b = p.boq.find((x) => x.id === c.lineId); if (b && b.ifc) { b.qty = c.qty; b.ifc = { ...b.ifc, parts: c.parts }; } } });
    const lost = ch.reduce((a, c) => a + c.lost, 0);
    toast(`${ch.length} BOQ quantit${ch.length === 1 ? 'y' : 'ies'} updated from the model${lost ? `; ${lost} linked elements are no longer in the file` : ''}`);
  };
  const remove = async () => {
    if (!confirm('Remove the model from this project? The BOQ lines and their quantities stay; they are no longer updated from the model.')) return;
    await forgetIfc(project.id);
    setModel(null);
    commit((p) => { p.ifcFile = null; });
  };
  const savePng = () => {
    const url = viewer.current?.png();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.setup.projectName || 'model').replace(/[^\w-]+/g, '_')}_3D_${mode}.png`;
    a.click();
  };
  const openLine = (lineId: string) => {
    go('designs');
    setDesignTab(designId || project.designs[1]?.id);
    select(lineId);
  };

  const linkedCount = project.boq.filter((b) => b.ifc?.parts?.length).length;
  if (!model) {
    return (
      <div className="page">
        <div className="page-head"><div className="grow"><h1>3D model (IFC)</h1>
          <p className="lede">Take quantities from the BIM model into the BOQ, then see the building coloured by its embodied carbon. The file is read in this browser and never uploaded.</p></div></div>
        {err && <div className="note bad" style={{ marginBottom: 12 }}>{err}</div>}
        {linkedCount > 0 && <div className="note" style={{ marginBottom: 12 }}>{linkedCount} BOQ line{linkedCount === 1 ? ' takes its quantity' : 's take their quantities'} from {project.ifcFile || 'an IFC file'}. Load the file again to see the 3D view and refresh the quantities.</div>}
        <div className={`mdl-drop ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={async (e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) openBuffer(await f.arrayBuffer(), f.name); }}>
          <Icon.model style={{ width: 42, height: 42, color: 'var(--green)' }} />
          <h3>Drop an IFC file here</h3>
          <button className="btn primary" onClick={chooseFile} disabled={!!busy}><Icon.upload /> {busy ? `${busy.phase}…` : 'Choose an IFC file'}</button>
          {busy && <div className="help">{busy.total > 1 ? `${fmt(busy.done)} of ${fmt(busy.total)} elements` : 'This can take a minute for a large model.'}</div>}
          <ul>
            <li>IFC2x3 or IFC4 from Revit, ArchiCAD, Tekla or any BIM tool. Base quantities are used when the file has them; otherwise volumes, areas and lengths are measured on the geometry.</li>
            <li>Elements are grouped by class, type and material. Each group becomes a BOQ line (or links to one you already have), with its element category and LEED scope suggested.</li>
            <li>When the model changes, load the new file and update the quantities: the links follow the element GlobalIds.</li>
          </ul>
        </div>
      </div>
    );
  }

  const shown = groups.filter((g) => showOut || g.inScope);
  const unlinked = groups.filter((g) => g.inScope && !linesOfGroup(g).length);
  const hoverEl = hover ? byId.get(hover.id) : undefined;
  const selEl = sel != null ? byId.get(sel) : undefined;
  const designOpts = project.designs.filter((d) => d.kind !== 'baseline' || mode !== 'change');
  return (
    <div className="page" style={{ paddingBottom: 20 }}>
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div className="grow"><h1>3D model (IFC)</h1>
          <p className="lede">{model.file} · {model.info.schema} · {fmt(model.elements.length)} elements{model.info.storeys.length ? ` · ${model.info.storeys.length} storeys` : ''}{model.info.project ? ` · ${model.info.project}` : ''}</p></div>
        <div className="row wrap">
          <button className="btn" onClick={chooseFile}><Icon.upload /> Load a newer file</button>
          <button className="btn" onClick={refresh} disabled={!linkedCount} title="Recalculate the linked BOQ quantities from this model"><Icon.reset /> Update quantities</button>
          <button className="btn ghost danger" onClick={remove} title="Remove the model from this project"><Icon.trash /></button>
        </div>
      </div>
      {err && <div className="note bad" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="mdl">
        <aside className="mdl-side">
          <div className="hd">
            <div className="row wrap">
              <b className="grow">Take-off · {shown.length} groups</b>
              <label className="check small"><input type="checkbox" checked={showOut} onChange={(e) => setShowOut(e.target.checked)} /> Outside the scope</label>
            </div>
            <div className="row wrap">
              <button className="btn primary sm" disabled={!unlinked.length} onClick={() => create(unlinked)}><Icon.plus /> Add {unlinked.length} group{unlinked.length === 1 ? '' : 's'} to the BOQ</button>
              <span className="help">Set the unit and category first if needed. Click a group to see it in 3D.</span>
            </div>
          </div>
          <div className="mdl-list">
            {shown.map((g) => {
              const ls = linesOfGroup(g);
              const o = plan[g.key] ?? {};
              const setO = (x: Partial<typeof o>) => setPlan({ ...plan, [g.key]: { ...o, ...x } });
              const q = g.q;
              const qtxt = [q.volume > 0.0005 ? `${fmt(q.volume, q.volume < 10 ? 2 : 1)} m³` : '', q.area > 0.05 ? `${fmt(q.area, q.area < 100 ? 1 : 0)} m²` : '', q.length > 0.05 ? `${fmt(q.length, 1)} m` : ''].filter(Boolean).join(' · ');
              return (
                <div key={g.key} className={`mdl-grp ${focus === g.key ? 'focus' : ''} ${g.inScope ? '' : 'out'}`}
                  onClick={() => { const f = focus === g.key ? null : g.key; setFocus(f); if (f) viewer.current?.fit(g.els.map((e) => e.id)); }}>
                  <span className="dot" style={{ background: ls.length ? '#2a7a4b' : g.inScope ? '#e8853a' : GHOST }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="ttl">{g.label}</div>
                    <div className="mat">{clsLabel(g.cls)}{g.material ? ` · ${g.material}` : ''}{/^Ifc(Wall|Door|Window|CurtainWall|Covering|Plate)$/.test(g.cls) ? (g.ext === true ? ' · external' : g.ext === false ? ' · internal' : '') : ''}</div>
                    {g.note && <div className="gnote">{g.note}</div>}
                  </div>
                  <div className="qty"><b>{g.q.count}×</b><br />{qtxt}</div>
                  <div className="ctl" onClick={(e) => e.stopPropagation()}>
                    {ls.length ? (
                      <>
                        {ls.map(({ b, k }) => <button key={b.id} className="chip green" style={{ border: 'none', cursor: 'pointer' }} onClick={() => openLine(b.id)} title={b.item}>Line {k + 1}: {fmt(b.qty ?? 0, (b.qty ?? 0) < 100 ? 1 : 0)} {b.unit}</button>)}
                        <button className="btn xs ghost" onClick={() => unlink(g)}>Unlink</button>
                      </>
                    ) : (
                      <>
                        <select className="inp" value={o.unit ?? g.unit} onChange={(e) => setO({ unit: e.target.value })} title="BOQ unit">{BOQ_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                        <select className="inp" value={o.elem ?? g.elem} onChange={(e) => setO({ elem: e.target.value })} title="Element category">{elems.map((x) => <option key={x}>{x}</option>)}</select>
                        {g.layers.length > 1 && <label className="check xs"><input type="checkbox" checked={!!o.split} onChange={(e) => setO({ split: e.target.checked })} /> {g.layers.length} layers</label>}
                        <button className="btn xs" onClick={() => create([g])}><Icon.plus /> Add</button>
                        {project.boq.length > 0 && (
                          <select className="inp" value="" onChange={(e) => e.target.value && linkTo(g, e.target.value)} title="Take the quantity of an existing BOQ line from these elements">
                            <option value="">Link to line…</option>
                            {project.boq.map((b, k) => <option key={b.id} value={b.id}>{k + 1}. {b.item.slice(0, 48)} ({b.unit})</option>)}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
        <div className="mdl-view">
          <div ref={host} className="mdl-canvas" />
          <div className="mdl-tools">
            <Seg<Mode> value={mode} onChange={setMode} options={[{ v: 'carbon', label: 'Embodied carbon' }, { v: 'change', label: 'Change' }, { v: 'category', label: 'Category' },
              { v: 'source', label: 'Data source' }, { v: 'links', label: 'Take-off' }, { v: 'ifc', label: 'IFC colours' }]} />
            {(mode === 'carbon' || mode === 'change' || mode === 'source') && (
              <select className="inp" value={designId} onChange={(e) => setDesignId(e.target.value)} title="Design">
                {designOpts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <span className="spacer" />
            <div className="seg">
              <button onClick={() => viewer.current?.view('iso')} title="Fit the model (double-click an element to zoom to it)">Fit</button>
              <button onClick={() => viewer.current?.view('top')}>Top</button>
              <button onClick={() => viewer.current?.view('front')}>Front</button>
              <button onClick={() => viewer.current?.view('side')}>Side</button>
            </div>
            <button className="btn sm" onClick={savePng} title="Save the view as a picture"><Icon.download /> PNG</button>
          </div>
          {linkedCount === 0 && mode !== 'ifc' && mode !== 'links' && (
            <div className="mdl-legend"><b>Nothing is in the BOQ yet</b>Add the groups on the left to the BOQ: the model is then coloured by the carbon of their materials.</div>
          )}
          {legend.items.length > 0 && (
            <div className="mdl-legend">
              <b>{legend.title}</b>
              {legend.items.map((it) => <div key={it.t} className="it"><span className="sw" style={{ background: it.c }} />{it.t}</div>)}
              <div className="it muted"><span className="sw" style={{ background: GHOST, opacity: 0.6 }} />not linked to the BOQ</div>
            </div>
          )}
          {hoverEl && hover && sel !== hover.id && (
            <div className="mdl-tip" style={{ left: Math.min(hover.x + 14, (host.current?.clientWidth ?? 800) - 340), top: Math.min(hover.y + 14, (host.current?.clientHeight ?? 600) - 140) }}>
              <div className="t">{clsLabel(hoverEl.cls)} · {hoverEl.typeName || hoverEl.name}</div>
              <div className="muted">{[hoverEl.storey, hoverEl.material].filter(Boolean).join(' · ')}</div>
              {(links.get(hoverEl.gid) ?? []).map((k: { line: { id: string; item: string; unit: string } ; q: number }) => (
                <div key={k.line.id}>Line {project.boq.findIndex((b) => b.id === k.line.id) + 1}: {k.line.item.slice(0, 60)} · {fmt(k.q, k.q < 10 ? 2 : 1)} {k.line.unit}</div>
              ))}
              {(links.get(hoverEl.gid)?.length ?? 0) > 0
                ? <div><b>{kgT(elemGwp(hoverEl, designId))} CO2e</b> {project.designs.find((d) => d.id === designId)?.name}{baseId !== designId ? ` · baseline ${kgT(elemGwp(hoverEl, baseId))}` : ''}</div>
                : <div className="warn">Not in the BOQ yet</div>}
            </div>
          )}
          {selEl && (
            <div className="mdl-sel">
              <div className="hd">
                <div className="grow"><b>{selEl.typeName || selEl.name}</b><div className="muted">{clsLabel(selEl.cls)}{selEl.storey ? ` · ${selEl.storey}` : ''}</div></div>
                <button className="icon-btn" onClick={() => setSel(null)} aria-label="Close"><Icon.x /></button>
              </div>
              <div className="bd">
                <dl>
                  <dt>Material</dt><dd>{selEl.layers.length > 1 ? selEl.layers.map((l) => `${l.name} ${Math.round(l.t * 1000)} mm`).join(' + ') : selEl.material || '–'}</dd>
                  <dt>Volume</dt><dd>{fmt(selEl.q.volume, 3)} m³ <span className="muted">({selEl.qFrom.volume === 'ifc' ? 'IFC quantity' : 'measured'})</span></dd>
                  <dt>Area</dt><dd>{fmt(selEl.q.area, 2)} m² <span className="muted">({selEl.qFrom.area === 'ifc' ? 'IFC quantity' : 'measured'})</span></dd>
                  <dt>Length</dt><dd>{fmt(selEl.q.length, 2)} m</dd>
                  {selEl.external != null && <><dt>External</dt><dd>{selEl.external ? 'yes' : 'no'}{selEl.loadBearing != null ? ` · load-bearing: ${selEl.loadBearing ? 'yes' : 'no'}` : ''}</dd></>}
                  <dt>GlobalId</dt><dd className="xs">{selEl.gid}</dd>
                </dl>
                {(links.get(selEl.gid) ?? []).map((k: { line: { id: string; item: string; unit: string }; q: number; total: number }) => {
                  const pos = project.boq.findIndex((b) => b.id === k.line.id) + 1;
                  return (
                    <div key={k.line.id} className="note" style={{ margin: 0 }}>
                      <b>Line {pos}</b>: {k.line.item}<br />
                      {fmt(k.q, k.q < 10 ? 3 : 1)} of {fmt(k.total, 1)} {k.line.unit} ({Math.round((k.q / (k.total || 1)) * 100)}%)<br />
                      {project.designs.map((d) => { const l = lineRes.get(d.id)?.get(k.line.id); return l?.active ? <span key={d.id}>{d.name}: <b>{kgT((l.tot[0] * k.q) / (k.total || 1))}</b> · </span> : null; })}
                      <button className="btn xs" style={{ marginTop: 4 }} onClick={() => openLine(k.line.id)}>Open the line</button>
                    </div>
                  );
                })}
                {!(links.get(selEl.gid)?.length) && <div className="warn">This element is not in the BOQ. Add its group on the left.</div>}
              </div>
            </div>
          )}
          {busy && (
            <div className="mdl-busy"><div style={{ textAlign: 'center' }}><b>{busy.phase}…</b>
              <div className="bar"><i style={{ width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%` }} /></div></div></div>
          )}
        </div>
      </div>
    </div>
  );
}
