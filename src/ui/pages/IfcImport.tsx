// Quantities from an IFC model into the BOQ (no 3D view): elements grouped by class, type and material, each group added
// as a BOQ line or linked to an existing one; quantities update from a newer model by GlobalId.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../state/store.ts';
import { newBoqLine, pickFile } from '../../state/project.ts';
import { BOQ_UNITS } from '../../engine/rules.ts';
import { cachedModel, forgetIfc, readIfc, storedIfc, storeIfc, type LoadedModel } from '../../ifc/load.ts';
import { clsLabel, groupElements, planLines, refreshQuantities, type Group } from '../../ifc/takeoff.ts';
import { Modal } from '../components/common.tsx';
import { Icon } from '../icons.tsx';
import { fmt } from '../format.ts';
import '../../ifc/ifc.css';

export default function IfcImport({ onClose }: { onClose: () => void }) {
  const { project, result, commit, toast } = useApp();
  const [model, setModel] = useState<LoadedModel | null>(() => (project ? cachedModel(project.id) : null));
  const [busy, setBusy] = useState<{ phase: string; done: number; total: number } | null>(null);
  const [err, setErr] = useState('');
  const [plan, setPlan] = useState<Record<string, { unit?: string; elem?: string; split?: boolean }>>({});
  const [showOut, setShowOut] = useState(false);
  const [over, setOver] = useState(false);

  const openBuffer = async (buf: ArrayBuffer, name: string, keep = true) => {
    if (!project) return;
    setErr('');
    setBusy({ phase: 'Starting the IFC reader', done: 0, total: 1 });
    try {
      const m = await readIfc(project.id, buf, name, (done, total, phase) => setBusy({ done, total, phase }));
      if (keep) await storeIfc(project.id, name, buf);
      setModel(m);
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

  const system = project?.setup.system ?? 0;
  const groups = useMemo(() => (model ? groupElements(model.elements, system) : []), [model, system]);
  if (!project || !result) return null;
  const sp = result.sp;
  const elems = result.sys.elems;
  const linesOf = (g: Group) => {
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
    toast('Model quantities linked to the BOQ line');
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
    if (!confirm('Forget the model in this browser? The BOQ lines and their quantities stay; they are no longer updated from the model.')) return;
    await forgetIfc(project.id);
    setModel(null);
    commit((p) => { p.ifcFile = null; });
  };

  const linkedCount = project.boq.filter((b) => b.ifc?.parts?.length).length;
  const shown = groups.filter((g) => showOut || g.inScope);
  const unlinked = groups.filter((g) => g.inScope && !linesOf(g).length);
  const outCount = groups.filter((g) => !g.inScope).length;
  const qtxt = (g: Group) => [g.q.volume > 0.0005 ? `${fmt(g.q.volume, g.q.volume < 10 ? 2 : 1)} m³` : '', g.q.area > 0.05 ? `${fmt(g.q.area, g.q.area < 100 ? 1 : 0)} m²` : '',
    g.q.length > 0.05 ? `${fmt(g.q.length, 1)} m` : ''].filter(Boolean).join(' · ');
  return (
    <Modal wide title="Quantities from an IFC model" onClose={onClose}
      foot={model ? <>
        <span className="help grow">{linkedCount} BOQ line{linkedCount === 1 ? '' : 's'} take{linkedCount === 1 ? 's' : ''} {linkedCount === 1 ? 'its' : 'their'} quantity from {model.file}. The file stays in this browser.</span>
        <button className="btn" onClick={onClose}>Close</button>
      </> : undefined}>
      {err && <div className="note bad" style={{ marginBottom: 12 }}>{err}</div>}
      {!model ? (
        <div className={`ifc-drop ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={async (e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) openBuffer(await f.arrayBuffer(), f.name); }}>
          <h3>Drop an IFC file here</h3>
          <button className="btn primary" onClick={chooseFile} disabled={!!busy}><Icon.upload /> {busy ? `${busy.phase}…` : 'Choose an IFC file'}</button>
          {busy && (
            <div className="ifc-bar"><i style={{ width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%` }} /></div>
          )}
          <ul>
            <li>IFC2x3 or IFC4 from Revit, ArchiCAD, Tekla or any BIM tool. Base quantities are used when the file has them; otherwise volumes, areas and lengths are measured on the geometry.</li>
            <li>Elements are grouped by class, type and material. Each group becomes a BOQ line, or gives its quantity to a line you already have. Element category, unit and LEED scope are suggested.</li>
            <li>When the model changes, load the newer file and update the quantities: the links follow the element GlobalIds.</li>
            <li>The file is read in this browser and never uploaded.</li>
          </ul>
        </div>
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: 10 }}>
            <div className="grow small">
              <b>{model.file}</b> · {model.info.schema} · {fmt(model.elements.length)} elements · {groups.length} groups
              {model.info.storeys.length ? ` · ${model.info.storeys.length} storeys` : ''}{model.info.project ? ` · ${model.info.project}` : ''}
            </div>
            <button className="btn sm" onClick={chooseFile} disabled={!!busy}><Icon.upload /> {busy ? `${busy.phase}…` : 'Load a newer file'}</button>
            <button className="btn sm" onClick={refresh} disabled={!linkedCount} title="Recalculate the linked BOQ quantities from this model"><Icon.reset /> Update quantities</button>
            <button className="btn sm ghost danger" onClick={remove} title="Forget the model in this browser"><Icon.trash /></button>
          </div>
          <div className="row wrap" style={{ marginBottom: 10 }}>
            <button className="btn primary sm" disabled={!unlinked.length} onClick={() => create(unlinked)}><Icon.plus /> Add {unlinked.length} group{unlinked.length === 1 ? '' : 's'} to the BOQ</button>
            <span className="help grow">Check the unit and category of a group first if needed. Groups already in the BOQ show their line.</span>
            {outCount > 0 && <label className="check small"><input type="checkbox" checked={showOut} onChange={(e) => setShowOut(e.target.checked)} /> Show {outCount} group{outCount === 1 ? '' : 's'} outside the LEED scope</label>}
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 'calc(100vh - 330px)' }}>
            <table className="tbl ifc-tbl">
              <thead><tr><th>Group</th><th className="num">Elements</th><th className="num">Quantities in the model</th><th>BOQ unit</th><th>Element category</th><th>In the BOQ</th></tr></thead>
              <tbody>
                {shown.map((g) => {
                  const ls = linesOf(g);
                  const o = plan[g.key] ?? {};
                  const setO = (x: Partial<typeof o>) => setPlan({ ...plan, [g.key]: { ...o, ...x } });
                  return (
                    <tr key={g.key} className={g.inScope ? '' : 'out'}>
                      <td style={{ minWidth: 260 }}>
                        <div className="ifc-ttl">{g.label}</div>
                        <div className="xs ink2">{clsLabel(g.cls)}{g.material ? ` · ${g.material}` : ''}{/^Ifc(Wall|Door|Window|CurtainWall|Covering|Plate)$/.test(g.cls) ? (g.ext === true ? ' · external' : g.ext === false ? ' · internal' : '') : ''}</div>
                        {g.note && <div className="xs warn">{g.note}</div>}
                      </td>
                      <td className="num">{g.q.count}</td>
                      <td className="num small">{qtxt(g)}</td>
                      <td>{ls.length ? <span className="small">{ls.map(({ b }) => b.unit).join(', ')}</span> : (
                        <select className="inp" style={{ width: 82 }} value={o.unit ?? g.unit} onChange={(e) => setO({ unit: e.target.value })}>{BOQ_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                      )}</td>
                      <td>{ls.length ? <span className="small">{ls[0].b.elem}</span> : (
                        <select className="inp" style={{ maxWidth: 240 }} value={o.elem ?? g.elem} onChange={(e) => setO({ elem: e.target.value })}>{elems.map((x) => <option key={x}>{x}</option>)}</select>
                      )}</td>
                      <td>
                        {ls.length ? (
                          <div className="row wrap" style={{ gap: 4 }}>
                            {ls.map(({ b, k }) => <span key={b.id} className="chip green" title={b.item}>Line {k + 1}: {fmt(b.qty ?? 0, (b.qty ?? 0) < 100 ? 1 : 0)} {b.unit}</span>)}
                            <button className="btn xs ghost" onClick={() => unlink(g)}>Unlink</button>
                          </div>
                        ) : (
                          <div className="row wrap" style={{ gap: 6 }}>
                            {g.layers.length > 1 && <label className="check xs" title="One BOQ line per material layer"><input type="checkbox" checked={!!o.split} onChange={(e) => setO({ split: e.target.checked })} /> {g.layers.length} layers</label>}
                            <button className="btn xs" onClick={() => create([g])}><Icon.plus /> Add</button>
                            {project.boq.length > 0 && (
                              <select className="inp" style={{ width: 150, height: 26 }} value="" onChange={(e) => e.target.value && linkTo(g, e.target.value)} title="Give this group's quantity to an existing BOQ line">
                                <option value="">Link to line…</option>
                                {project.boq.map((b, k) => <option key={b.id} value={b.id}>{k + 1}. {b.item.slice(0, 48)} ({b.unit})</option>)}
                              </select>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && <tr><td colSpan={6} className="empty">No element groups in the LEED scope. Tick “Show groups outside the LEED scope” to see the rest.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
