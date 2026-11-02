// The desk: a title block with the LEED target ruler, a strip of general notes, the run-log rail and the sheet.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp, type Page } from '../state/store.ts';
import { BrandMark, Icon } from './icons.tsx';
import { fmt } from './format.ts';
import { lib, packMeta } from '../data/libraryStore.ts';
import { saveProjectFile } from '../state/project.ts';
import { projectLink } from '../state/share.ts';
import { targets, worstRow } from '../engine/targets.ts';
import { applyTheme, getThemeChoice, onSystemTheme, type ThemeChoice } from './theme.ts';

function Ruler() {
  const r = useApp((s) => s.result);
  const project = useApp((s) => s.project);
  const chase = useApp((s) => s.chase);
  const ghost = useApp((s) => s.ghost);
  const setChase = useApp((s) => s.setChase);
  const std = useMemo(() => (r && chase ? targets(r, project?.setup.area ?? 0).find((x) => x.id === chase) ?? null : null), [r, chase, project?.setup.area]);
  if (!r) return null;
  const ch = r.leed.change[0];
  const bdc = r.sys.sys === 'BD+C';
  const ticks: { v: number; b?: string; id?: string }[] = bdc
    ? r.sys.ver === 'v4' ? [{ v: 0 }, { v: -0.1, b: 'OPT 4', id: 'bdc-o4' }] : [{ v: 0 }, { v: -0.05, b: 'P2', id: 'bdc-p2' }, { v: -0.1, b: 'P3', id: 'bdc-p3' }, { v: -0.2, b: 'P4', id: 'bdc-p4' }]
    : [{ v: 0 }, { v: -0.1 }, { v: -0.2, b: 'P3', id: 'idc-p3' }];
  const lo = Math.min(-0.4, (ch ?? 0) - 0.05, (std?.gwp ?? 0) - 0.05), hi = 0.1;
  const x = (v: number) => `${((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * 100}%`;
  const has = ch != null && r.base.total[0] > 0 && r.prop.total[0] > 0;
  const chasedTick = std?.gwp != null && !ticks.some((t) => Math.abs(t.v - std.gwp!) < 1e-9) ? [{ v: std.gwp, b: 'CHASE', id: std.id }] : [];
  const worst = std ? worstRow(std) : null;
  return (
    <div className="ruler" title="GWP of the proposed design compared with the baseline, against the LEED thresholds">
      <div className="ruler-figs">
        <span className="cap">GWP vs baseline</span>
        <span className={`big ${has ? (ch! < 0 ? 'down' : 'up') : ''}`}>{has ? `${ch! > 0 ? '+' : '−'}${Math.abs(ch! * 100).toFixed(1)}%` : '—'}</span>
        <span className="sub">{has ? `${fmt(r.base.total[0] / 1000)} → ${fmt(r.prop.total[0] / 1000)} t CO2e` : 'fill both designs'}</span>
      </div>
      <div className="ruler-track" aria-hidden="true">
        <div className="ruler-scale" />
        {(() => {
          // numbers under the scale only where they do not run into the last one shown
          let last = Infinity;
          return [...ticks, ...chasedTick].sort((a, b) => b.v - a.v).map((tk) => {
            const show = Math.abs(tk.v - last) / (hi - lo) > 0.13;
            if (show) last = tk.v;
            return (
              <div key={tk.v} className={`ruler-tick ${std && tk.id === std.id ? 'chased' : ''}`} style={{ left: x(tk.v) }}>
                {tk.b && <b>{tk.b}</b>}
                {show && <span>{tk.v === 0 ? '0' : `${Math.round(tk.v * 100)}%`}</span>}
              </div>
            );
          });
        })()}
        {has && ghost != null && Math.abs(ghost - ch!) > 1e-6 && <div className="ruler-ghost" style={{ left: x(ghost) }} title="Before the last change" />}
        {has && <div className="ruler-mark" style={{ left: x(ch!) }} />}
      </div>
      <div className="ruler-figs" style={{ textAlign: 'right' }}>
        <span className="cap">Indicative</span>
        <span className="big">{r.leed.points} pt{r.leed.points === 1 ? '' : 's'}</span>
        <span className="sub">{r.leed.pathLabel} · {r.sys.label}</span>
      </div>
      {std && (
        <div className="ruler-chase">
          Chasing {std.name}{worst ? ` · ${worst.label} ${worst.reads} of ${worst.asks}${worst.margin ? ` · ${worst.margin}` : ''}` : ''}{std.met ? ' · met' : ''}
          <button onClick={() => setChase(null)}>Release</button>
        </div>
      )}
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
  { page: 'contractor', label: 'For the contractor', icon: 'contractor' },
  { page: 'finder', label: 'Material finder', icon: 'finder' },
  { page: 'data', label: 'Data & libraries', icon: 'data' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { page, go, project, result, undo, redo, past, future, lastChange, commit, calcMs, toast, recompute } = useApp();
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);
  useEffect(() => onSystemTheme(() => recompute()), [recompute]);
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
  const done = STEPS.filter((s) => status(s.page) === 'done').length;
  const pickTheme = (t: ThemeChoice) => { applyTheme(t); setTheme(t); recompute(); };
  const copyLink = async () => {
    if (!project) return;
    try {
      const url = await projectLink(project);
      await navigator.clipboard.writeText(url);
      toast(`Project link copied (${Math.round(url.length / 1024)} kB). It carries the BOQ and the materials, not the people's names.`);
    } catch {
      toast('The link could not be copied. Save the project file instead.');
    }
  };
  const s = project?.setup;
  const area = s?.area ?? 0;
  return (
    <div className="shell">
      <header className="titleblock">
        <div className="tb-main">
          <div className="kicker lab"><BrandMark /> Whole-building LCA for LEED · EN 15804+A2 · runs in this browser</div>
          {project && s ? (
            <>
              <input className="project-name" aria-label="Project name" defaultValue={s.projectName} key={project.id + s.projectName}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.projectName) commit((p) => { p.setup.projectName = v; }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
              <div className="tb-meta">
                {[s.location, area ? <><b>{fmt(area)}</b> m²</> : null, result ? <><b>{result.sp}</b>-year study period</> : null, result ? `${result.sys.cover} · ${result.sys.opt}` : null]
                  .filter(Boolean).map((x, i) => <span key={i}>{i > 0 ? ' · ' : ''}{x}</span>)}
              </div>
            </>
          ) : (
            <>
              <h1 className="tb-title">Embodied carbon, baseline against proposed</h1>
              <div className="tb-meta">LEED BD+C v4.1 Option 2 and v4 Option 4 whole-building LCA · LEED ID+C v4.1 Option 3 interiors LCA</div>
            </>
          )}
        </div>
        {project ? <Ruler /> : (
          <dl className="tb-spec">
            <dt>Engine</dt><dd>Whole building LCA 7.1</dd>
            <dt>Indicators</dt><dd>EN 15804+A2</dd>
            <dt>Data</dt><dd>{packMeta ? 'ÖKOBAUDAT + private pack' : 'ÖKOBAUDAT'}</dd>
            <dt>Server</dt><dd>None</dd>
          </dl>
        )}
      </header>
      <div className="notes-strip" role="status" aria-live="polite">
        <span className="lab">General notes</span>
        {project ? <span className="steps">{done} of {STEPS.length} steps taken</span> : <span className="steps">no project open</span>}
        {project && <>
          <button className="tbtn" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Icon.undo /></button>
          <button className="tbtn" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)" aria-label="Redo"><Icon.redo /></button>
        </>}
        <span className={`change ${lastChange?.dir ?? ''}`}>{project ? (lastChange ? lastChange.text : 'Every edit recalculates both designs; this line shows what the last change added or removed.') : 'Open or start a project.'}</span>
        {project && <span className="clock">recalculated in {calcMs < 1 ? '<1' : Math.round(calcMs)} ms</span>}
      </div>
      <nav className="rail" aria-label="Steps">
        {project ? <>
          <div className="rail-sec">Steps</div>
          {STEPS.map((st) => {
            const v = status(st.page);
            return (
              <button key={st.page} className={`nav-item ${page === st.page ? 'active' : ''}`} onClick={() => go(st.page)}>
                <span className={`nav-num ${v}`} />{st.label}
                {st.page === 'designs' && qa > 0 && <span className="nav-badge" title="Lines with data QA notes">{qa}⚠</span>}
              </button>
            );
          })}
          <div className="rail-sec">Tools</div>
          {TOOLS.map((t) => {
            const I = Icon[t.icon];
            return <button key={t.page} className={`nav-item ${page === t.page ? 'active' : ''}`} onClick={() => go(t.page)}><span className="nav-icon"><I /></span>{t.label}</button>;
          })}
          <div className="rail-block">
            <dl className="rail-stats">
              <dt>BOQ lines</dt><dd>{project.boq.length}</dd>
              <dt>Designs</dt><dd>{project.designs.length}</dd>
              <dt>QA notes</dt><dd>{qa}</dd>
            </dl>
          </div>
          <div className="rail-block">
            <button className="rail-link" onClick={() => saveProjectFile(project)}>Save project file</button>
            <button className="rail-link" onClick={copyLink}>Copy project link</button>
            <button className="rail-link" onClick={() => go('start')}>Projects</button>
          </div>
        </> : <>
          <div className="rail-sec">Desk</div>
          <button className={`nav-item ${page === 'start' ? 'active' : ''}`} onClick={() => go('start')}><span className="nav-icon"><Icon.open /></span>Projects</button>
          <button className={`nav-item ${page === 'finder' ? 'active' : ''}`} onClick={() => go('finder')}><span className="nav-icon"><Icon.finder /></span>Material finder</button>
          <button className={`nav-item ${page === 'data' ? 'active' : ''}`} onClick={() => go('data')}><span className="nav-icon"><Icon.data /></span>Data & libraries</button>
        </>}
        <div className="rail-block" style={{ marginTop: 'auto' }}>
          <dl className="rail-stats">
            <dt>Data</dt><dd><button className={`data-pill ${packMeta ? 'private' : ''}`} onClick={() => go('data')}>{packMeta ? 'pack loaded' : 'public'}</button></dd>
            <dt>Datasets</dt><dd>{fmt(lib.bySrc.EPD.length + lib.bySrc.IDEMAT.length + lib.bySrc['ÖKOBAUDAT'].length + lib.bySrc.ecoinvent.length)}</dd>
            <dt>Server</dt><dd>none</dd>
          </dl>
          <div className="theme-switch" role="group" aria-label="Theme">
            {(['auto', 'light', 'dark'] as ThemeChoice[]).map((t) => <button key={t} className={theme === t ? 'on' : ''} onClick={() => pickTheme(t)}>{t}</button>)}
          </div>
        </div>
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
