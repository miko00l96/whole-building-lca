import { useEffect, type ReactNode } from 'react';
import { useApp, type Page } from '../state/store.ts';
import { BrandMark, Icon } from './icons.tsx';
import { fmt } from './format.ts';
import { packMeta } from '../data/libraryStore.ts';
import { saveProjectFile } from '../state/project.ts';

function Ruler() {
  const r = useApp((s) => s.result);
  if (!r) return <div className="ruler" />;
  const ch = r.leed.change[0];
  const bdc = r.sys.sys === 'BD+C';
  const ticks: { v: number; b?: string }[] = bdc
    ? r.sys.ver === 'v4' ? [{ v: 0 }, { v: -0.1, b: 'Opt 4' }] : [{ v: 0 }, { v: -0.05, b: 'P2' }, { v: -0.1, b: 'P3' }, { v: -0.2, b: 'P4' }]
    : [{ v: 0 }, { v: -0.1 }, { v: -0.2, b: 'P3' }];
  const lo = Math.min(-0.4, (ch ?? 0) - 0.05), hi = 0.1;
  const x = (v: number) => `${((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * 100}%`;
  const has = ch != null && r.base.total[0] > 0 && r.prop.total[0] > 0;
  return (
    <div className="ruler" title="GWP of the proposed design compared with the baseline, against the LEED thresholds">
      <div className="ruler-figs">
        <span className="big">{has ? `${ch! > 0 ? '+' : '−'}${Math.abs(ch! * 100).toFixed(1)}%` : '—'}</span>
        <span className="sub">{has ? `${fmt(r.base.total[0] / 1000)} → ${fmt(r.prop.total[0] / 1000)} t CO2e` : 'fill both designs to compare'}</span>
      </div>
      <div className="ruler-track" aria-hidden="true">
        <div className="ruler-scale" />
        {ticks.map((tk) => (
          <div key={tk.v} className="ruler-tick" style={{ left: x(tk.v) }}>
            {tk.b && <b>{tk.b}</b>}
            <span>{tk.v === 0 ? '0' : `${Math.round(tk.v * 100)}%`}</span>
          </div>
        ))}
        {has && <div className="ruler-mark" style={{ left: x(ch!) }} />}
      </div>
      <div className="ruler-figs" style={{ textAlign: 'right' }}>
        <span className="big">{r.leed.points} pts</span>
        <span className="sub">{r.leed.pathLabel} · {r.sys.label}</span>
      </div>
    </div>
  );
}

const STEPS: { page: Page; label: string }[] = [
  { page: 'setup', label: 'Project setup' },
  { page: 'boq', label: 'Bill of quantities' },
  { page: 'designs', label: 'Designs' },
  { page: 'results', label: 'Results' },
  { page: 'report', label: 'Report' },
];
const TOOLS: { page: Page; label: string; icon: keyof typeof Icon }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { page: 'insights', label: 'Insights', icon: 'insights' },
  { page: 'model', label: '3D model (IFC)', icon: 'model' },
  { page: 'contractor', label: 'For the contractor', icon: 'contractor' },
  { page: 'finder', label: 'Material finder', icon: 'finder' },
  { page: 'data', label: 'Data & libraries', icon: 'data' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { page, go, project, result, undo, redo, past, future, lastChange, commit } = useApp();
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && project) { e.preventDefault(); saveProjectFile(project); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [undo, redo, project]);
  const status = (pg: Page): 'done' | 'issue' | '' => {
    if (!project || !result) return '';
    if (pg === 'setup') return project.setup.projectName && project.setup.area ? 'done' : '';
    if (pg === 'boq') return project.boq.length ? 'done' : '';
    if (pg === 'designs') {
      if (!project.boq.length) return '';
      if (result.base.qaCount + result.prop.qaCount > 0) return 'issue';
      const all = [result.base, result.prop].every((d) => d.lines.filter((l) => !l.isExtra).every((l) => l.active));
      return all ? 'done' : '';
    }
    if (pg === 'results') return result.leed.points > 0 ? 'done' : '';
    return '';
  };
  const qa = result ? result.base.qaCount + result.prop.qaCount : 0;
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div className="brand-name">Whole building LCA<small>for LEED BD+C and ID+C</small></div>
        </div>
        {project ? (
          <>
            <input className="project-name" aria-label="Project name" defaultValue={project.setup.projectName} key={project.id + project.setup.projectName}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== project.setup.projectName) commit((p) => { p.setup.projectName = v; }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            <Ruler />
          </>
        ) : <div className="grow" />}
        <div className="top-actions">
          <button className={`data-pill ${packMeta ? 'private' : ''}`} onClick={() => go('data')}
            title={packMeta ? 'Your private data pack is loaded in this browser' : 'Only the public ÖKOBAUDAT library is loaded'}>
            {packMeta ? 'Private data loaded' : 'Public data only'}
          </button>
          {project && <>
            <button className="tbtn" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Icon.undo /></button>
            <button className="tbtn" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)" aria-label="Redo"><Icon.redo /></button>
            <button className="tbtn" onClick={() => saveProjectFile(project)} title="Save the project file (Ctrl+S)"><Icon.save /> Save</button>
          </>}
          <button className="tbtn" onClick={() => go('start')} title="Projects"><Icon.open /> Projects</button>
        </div>
      </header>
      <div className={`change-strip ${lastChange?.dir ?? ''}`} role="status" aria-live="polite">
        {project ? (lastChange ? lastChange.text : 'Every edit recalculates both designs. This line shows what your last change added or removed.') : 'Open or start a project to begin.'}
      </div>
      <nav className="sidebar" aria-label="Steps">
        {project && <>
          <div className="nav-sec">Steps</div>
          {STEPS.map((s, i) => {
            const st = status(s.page);
            return (
              <button key={s.page} className={`nav-item ${page === s.page ? 'active' : ''}`} onClick={() => go(s.page)}>
                <span className={`nav-num ${st}`}>{st === 'done' ? '✓' : i + 1}</span>{s.label}
                {s.page === 'designs' && qa > 0 && <span className="nav-badge" title="Lines with data QA notes">{qa} ⚠</span>}
              </button>
            );
          })}
          <div className="nav-sec">Tools</div>
          {TOOLS.map((t) => {
            const I = Icon[t.icon];
            return (
              <button key={t.page} className={`nav-item ${page === t.page ? 'active' : ''}`} onClick={() => go(t.page)}>
                <span className="nav-icon"><I /></span>{t.label}
              </button>
            );
          })}
        </>}
        {!project && <>
          <button className={`nav-item ${page === 'start' ? 'active' : ''}`} onClick={() => go('start')}><span className="nav-icon"><Icon.open /></span>Projects</button>
          <button className={`nav-item ${page === 'finder' ? 'active' : ''}`} onClick={() => go('finder')}><span className="nav-icon"><Icon.finder /></span>Material finder</button>
          <button className={`nav-item ${page === 'data' ? 'active' : ''}`} onClick={() => go('data')}><span className="nav-icon"><Icon.data /></span>Data & libraries</button>
        </>}
      </nav>
      <main className="main" id="main">{children}</main>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return <div className="toast-zone">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>;
}
