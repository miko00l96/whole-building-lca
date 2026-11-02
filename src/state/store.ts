// App state: the open project, its calculated result, undo/redo, the live change banner and UI navigation.
import { create } from 'zustand';
import { computeProject, type ProjectResult } from '../engine/calc.ts';
import type { Choice, Design, Project } from '../engine/types.ts';
import { lib } from '../data/libraryStore.ts';
import { saveProjectLocal, today } from './project.ts';

export type Page = 'start' | 'setup' | 'boq' | 'designs' | 'results' | 'dashboard' | 'insights' | 'report' | 'contractor'
  | 'finder' | 'data';

export interface LastChange {
  dir: 'up' | 'down' | 'none';
  text: string;
  at: number;
}

interface State {
  project: Project | null;
  result: ProjectResult | null;
  libVersion: number;
  past: Project[];
  future: Project[];
  lastChange: LastChange | null;
  page: Page;
  designTab: string; // design id
  selLine: string | null; // selected line key (drawer)
  toasts: { id: number; text: string }[];
  calcMs: number; // time of the last full recalculation
  chase: string | null; // id of the standard pinned to the title bar (engine/targets.ts)
  ghost: number | null; // GWP change before the last edit (ghost marker on the ruler)
  setChase: (id: string | null) => void;
  openProject: (p: Project | null, page?: Page) => void;
  commit: (fn: (p: Project) => void, meta?: { designId?: string; label?: string }) => void;
  setChoice: (designId: string, lineKey: string, patch: Partial<Choice> | null, replace?: boolean) => void;
  undo: () => void;
  redo: () => void;
  recompute: () => void;
  go: (page: Page) => void;
  setDesignTab: (id: string) => void;
  select: (key: string | null) => void;
  toast: (text: string) => void;
}

let lastMs = 0;
function calc(p: Project | null): ProjectResult | null {
  if (!p) return null;
  const t0 = performance.now();
  try {
    return computeProject(p, lib, today());
  } catch (e) {
    console.error('calculation failed', e);
    return null;
  } finally {
    lastMs = performance.now() - t0;
  }
}

const chaseKey = (id: string) => `wblca:chase:${id}`;
function loadChase(id: string | undefined): string | null {
  if (!id) return null;
  try { return localStorage.getItem(chaseKey(id)); } catch { return null; }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(p: Project) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProjectLocal(p), 500);
}

const fmtT = (kg: number) => (kg / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function describeChange(before: ProjectResult | null, after: ProjectResult | null, designId?: string): LastChange | null {
  if (!before || !after) return null;
  const k = designId ? after.designs.findIndex((d) => d.designId === designId) : -1;
  if (k < 0 || !before.designs[k] || before.designs[k].designId !== designId) return null;
  const b = before.designs[k], a = after.designs[k];
  const delta = a.total[0] - b.total[0];
  if (Math.abs(delta) < 0.05) return null;
  let best = -1, bestAbs = 0;
  const n = Math.max(a.lines.length, b.lines.length);
  for (let i = 0; i < n; i++) {
    const d = (a.lines[i]?.tot[0] ?? 0) - (b.lines[i]?.tot[0] ?? 0);
    if (Math.abs(d) > bestAbs) { bestAbs = Math.abs(d); best = i; }
  }
  const line = best >= 0 ? a.lines[best] ?? b.lines[best] : null;
  const pct = b.total[0] !== 0 ? (delta / b.total[0]) * 100 : 0;
  const where = line ? ` on line ${line.pos}${line.label ? ': ' + line.label : ''}` : '';
  const verb = delta < 0 ? 'removed' : 'added';
  return {
    dir: delta < 0 ? 'down' : 'up',
    text: `${delta < 0 ? '▼' : '▲'} Last change ${verb} ${fmtT(Math.abs(delta))} t CO2e (${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%)${where}.   ${a.name} total now ${fmtT(a.total[0])} t CO2e`,
    at: Date.now(),
  };
}

export const useApp = create<State>()((set, get) => ({
  project: null,
  result: null,
  libVersion: 0,
  past: [],
  future: [],
  lastChange: null,
  page: 'start',
  designTab: '',
  selLine: null,
  toasts: [],
  calcMs: 0,
  chase: null,
  ghost: null,

  openProject: (p, page) => {
    const result = calc(p);
    set({
      project: p, result, past: [], future: [], lastChange: null, selLine: null, calcMs: lastMs, chase: loadChase(p?.id), ghost: null,
      designTab: p?.designs.find((d) => d.kind === 'proposed')?.id ?? p?.designs[0]?.id ?? '',
      page: page ?? (p ? (p.boq.length ? 'designs' : 'setup') : 'start'),
    });
    if (p) scheduleSave(p);
  },

  commit: (fn, meta) => {
    const cur = get().project;
    if (!cur) return;
    const next = structuredClone(cur) as Project;
    fn(next);
    next.updatedAt = new Date().toISOString();
    next.name = next.setup.projectName || next.name;
    const before = get().result;
    const result = calc(next);
    const lastChange = describeChange(before, result, meta?.designId) ?? get().lastChange;
    const b0 = before?.leed.change[0] ?? null, a0 = result?.leed.change[0] ?? null;
    const ghost = b0 != null && a0 != null && Math.abs(a0 - b0) > 1e-9 ? b0 : get().ghost;
    set({ project: next, result, past: [...get().past.slice(-99), cur], future: [], lastChange, calcMs: lastMs, ghost });
    scheduleSave(next);
  },

  setChoice: (designId, lineKey, patch, replace) => {
    get().commit((p) => {
      const d = p.designs.find((x) => x.id === designId) as Design | undefined;
      if (!d) return;
      const extra = d.extra.find((x) => x.id === lineKey);
      if (extra) {
        if (patch) Object.assign(extra, patch);
        for (const k of Object.keys(patch ?? {})) if ((patch as any)[k] === undefined) delete (extra as any)[k];
        return;
      }
      if (patch === null) { delete d.choices[lineKey]; return; }
      const c = replace ? { ...patch } : { ...(d.choices[lineKey] ?? {}), ...patch };
      for (const k of Object.keys(c)) if ((c as any)[k] === undefined) delete (c as any)[k];
      d.choices[lineKey] = c;
    }, { designId });
  },

  undo: () => {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    const prev = past[past.length - 1];
    set({ project: prev, result: calc(prev), past: past.slice(0, -1), future: [project, ...future].slice(0, 100), lastChange: null, calcMs: lastMs, ghost: get().result?.leed.change[0] ?? null });
    scheduleSave(prev);
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    const next = future[0];
    set({ project: next, result: calc(next), past: [...past, project].slice(-100), future: future.slice(1), lastChange: null, calcMs: lastMs, ghost: get().result?.leed.change[0] ?? null });
    scheduleSave(next);
  },
  recompute: () => set({ result: calc(get().project), libVersion: lib.version, calcMs: lastMs }),
  setChase: (id) => {
    const p = get().project;
    if (p) { try { if (id) localStorage.setItem(chaseKey(p.id), id); else localStorage.removeItem(chaseKey(p.id)); } catch { /* per session only */ } }
    set({ chase: id });
  },
  go: (page) => set({ page, selLine: null }),
  setDesignTab: (id) => set({ designTab: id, selLine: null }),
  select: (key) => set({ selLine: key }),
  toast: (text) => {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3800);
  },
}));
