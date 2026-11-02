import { useEffect, useState } from 'react';
import { useApp } from '../../state/store.ts';
import { LEED_OPTS } from '../../engine/rules.ts';
import { cloneProject, deleteProjectLocal, listProjects, loadProjectLocal, newProject, pickFile, readProjectFile, type ProjectIndexEntry } from '../../state/project.ts';
import { lib, packMeta, samples, loadPackFile } from '../../data/libraryStore.ts';
import { publicDemo } from '../../data/demo.ts';
import { Icon } from '../icons.tsx';
import type { SystemIndex } from '../../engine/types.ts';

export function StartPage() {
  const { openProject, toast, recompute, project } = useApp();
  const [recent, setRecent] = useState<ProjectIndexEntry[]>([]);
  const [sys, setSys] = useState<SystemIndex>(0);
  const [name, setName] = useState('');
  const [, force] = useState(0);
  useEffect(() => { listProjects().then(setRecent); }, []);
  const start = () => openProject(newProject(sys, name.trim() || 'New project'), 'setup');
  const open = async () => {
    const f = await pickFile('.json,.wblca.json,application/json');
    if (!f) return;
    try { openProject(await readProjectFile(f)); toast('Project opened'); } catch (e: any) { toast(e.message); }
  };
  const loadPack = async () => {
    const f = await pickFile('.wblca,application/gzip,application/json');
    if (!f) return;
    try { const m = await loadPackFile(f); recompute(); force((x) => x + 1); toast(`Data pack loaded: ${Object.values(m.counts).reduce((a, b) => a + (b ?? 0), 0).toLocaleString()} datasets`); }
    catch (e: any) { toast(e.message ?? 'This file could not be read'); }
  };
  return (
    <div className="start">
      <div className="start-hero">
        <div>
          <h1>Embodied carbon for LEED, from BOQ to submission report.</h1>
          <p className="lede">Baseline against proposed, line by line, with EN 15804+A2 indicators. BD+C whole-building LCA (v4.1 Option 2, v4 Option 4) and ID+C v4.1 interiors LCA. Everything runs in this browser.</p>
          {project && <button className="btn primary" style={{ marginTop: 16 }} onClick={() => useApp.getState().go('designs')}>Back to {project.setup.projectName}</button>}
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Start a project</h3></div>
          <div className="panel-body col">
            <div className="field"><label>Project name</label><input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office tower, New Cairo" onKeyDown={(e) => e.key === 'Enter' && start()} /></div>
            <div className="field"><label>LEED rating system and credit</label>
              <select className="inp" value={sys} onChange={(e) => setSys(Number(e.target.value) as SystemIndex)}>
                {LEED_OPTS.map((o, i) => <option key={o} value={i}>{o}</option>)}
              </select>
            </div>
            <div className="row"><button className="btn primary" onClick={start}><Icon.plus /> Create project</button><button className="btn" onClick={open}><Icon.open /> Open a project file</button></div>
          </div>
        </div>
      </div>

      <div className="start-cards">
        <div className="start-card">
          <h3>Recent projects in this browser</h3>
          {recent.length === 0 && <p>Projects you open or create are kept here automatically. Save a project file to move it to another computer.</p>}
          {recent.slice(0, 6).map((r) => (
            <div key={r.id} className="row" style={{ borderBottom: '1px solid var(--line2)', paddingBottom: 6 }}>
              <button className="btn ghost sm grow" style={{ justifyContent: 'flex-start' }} onClick={async () => { const p = await loadProjectLocal(r.id); if (p) openProject(p); }}>
                <span className="grow" style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              </button>
              <span className="xs muted">{new Date(r.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              <button className="icon-btn" title="Remove from this browser" onClick={async () => { await deleteProjectLocal(r.id); setRecent(await listProjects()); }}><Icon.trash /></button>
            </div>
          ))}
        </div>
        <div className="start-card">
          <h3>Examples</h3>
          {packMeta && samples.length > 0 ? (
            <>
              <p>The reference projects of the Excel tool, built from your data pack. Their results match the Excel tool to the kilogram.</p>
              {samples.map((s) => (
                <button key={s.id} className="btn sm" style={{ justifyContent: 'flex-start' }} onClick={() => openProject(cloneProject(s))}>{s.name.replace(' (clear the sample rows before use)', '')}</button>
              ))}
            </>
          ) : (
            <>
              <p>A public example built with ÖKOBAUDAT only, so anyone can explore the tool. Load your data pack to open the BD+C, ID+C and Riyadh reference projects.</p>
              <button className="btn sm" onClick={() => openProject(publicDemo())}>Open the ÖKOBAUDAT example</button>
            </>
          )}
        </div>
        <div className="start-card">
          <h3>Data in this browser</h3>
          <p>
            ÖKOBAUDAT OBD 2024-II: {lib.bySrc['ÖKOBAUDAT'].length.toLocaleString()} datasets (public).<br />
            {packMeta ? <>Private data pack: {Object.entries(packMeta.counts).filter(([k]) => k !== 'ÖKOBAUDAT').map(([k, v]) => `${k} ${v?.toLocaleString()}`).join(', ')}. It stays on this computer.</>
              : <>Your EPD library, IDEMAT and ecoinvent are in a private data pack (.wblca) on your drive. Load it once per browser.</>}
          </p>
          <button className="btn sm" onClick={loadPack}><Icon.upload /> {packMeta ? 'Load a newer data pack' : 'Load the private data pack'}</button>
        </div>
      </div>
    </div>
  );
}
