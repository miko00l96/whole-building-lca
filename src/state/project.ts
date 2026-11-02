// Project creation, persistence in this browser (IndexedDB) and project files (.wblca.json).
import { get, set, del } from 'idb-keyval';
import type { BoqLine, Design, Project, Setup } from '../engine/types.ts';

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const today = () => new Date().toISOString().slice(0, 10);

export const DEFAULT_TRUCK = 'C.060.01.106.230701 Truck+trailer 24 tonne net B7 (min weight/volume ratio 0.32 t/m3) (tkm)';

export function defaultSetup(system: Setup['system'] = 0): Setup {
  return {
    system, projectName: 'New project', location: '', area: null, studyPeriod: null,
    truck: { src: 'IDEMAT', n: DEFAULT_TRUCK }, c2km: 50, assessmentDate: null, epIndicator: 'EPm', assessor: '', notes: '', floors: '',
    a4EolDb: 'All databases', grid: 'Egypt (IDEMAT 2026)', kwhBase: null, kwhProp: null, customGrid: Array(8).fill(null), customGridSource: '',
    company: '', client: '', buildingUse: '', reportRef: '', extraRecs: '', logo: null,
  };
}

export function newDesign(kind: Design['kind'], name: string): Design {
  return { id: uid('D-'), name, kind, choices: {}, extra: [] };
}

export function newBoqLine(partial: Partial<BoqLine> = {}): BoqLine {
  return { id: uid('L'), elem: '', item: '', qty: null, unit: 'm3', kgpu: null, rsl: null, dist: null, ref: '', epx: null, origin: 'manual', ...partial };
}

export function newProject(system: Setup['system'] = 0, name = 'New project'): Project {
  const now = new Date().toISOString();
  const s = defaultSetup(system);
  s.projectName = name;
  return {
    schema: 'wblca-project@1', id: uid('P-'), name, createdAt: now, updatedAt: now, setup: s, boq: [],
    designs: [newDesign('baseline', 'Baseline'), newDesign('proposed', 'Proposed')],
  };
}

/** Fill in fields added after a project was saved (forward compatibility). */
export function migrate(p: Project): Project {
  const base = defaultSetup(p.setup?.system ?? 0);
  p.setup = { ...base, ...p.setup };
  p.boq = (p.boq ?? []).map((b) => ({ ...newBoqLine(), ...b }));
  p.designs = (p.designs ?? []).map((d) => ({ ...d, choices: d.choices ?? {}, extra: d.extra ?? [] }));
  if (!p.designs.some((d) => d.kind === 'baseline')) p.designs.unshift(newDesign('baseline', 'Baseline'));
  if (!p.designs.some((d) => d.kind === 'proposed')) p.designs.splice(1, 0, newDesign('proposed', 'Proposed'));
  return p;
}

export function cloneProject(p: Project, asNew = true): Project {
  const c = structuredClone(p) as Project;
  if (asNew) {
    c.id = uid('P-');
    c.createdAt = c.updatedAt = new Date().toISOString();
  }
  return c;
}

// ------------------------------------------------------------------ browser storage
export interface ProjectIndexEntry {
  id: string;
  name: string;
  updatedAt: string;
  system: number;
}
const IDX = 'wblca:projects';
const LAST = 'wblca:last';

export async function listProjects(): Promise<ProjectIndexEntry[]> {
  try { return ((await get(IDX)) as ProjectIndexEntry[]) ?? []; } catch { return []; }
}

export async function saveProjectLocal(p: Project): Promise<void> {
  try {
    await set(`wblca:p:${p.id}`, p);
    const idx = (await listProjects()).filter((x) => x.id !== p.id);
    idx.unshift({ id: p.id, name: p.name, updatedAt: p.updatedAt, system: p.setup.system });
    await set(IDX, idx.slice(0, 60));
    await set(LAST, p.id);
  } catch { /* storage blocked: the project stays in memory */ }
}

export async function loadProjectLocal(id: string): Promise<Project | null> {
  try { const p = (await get(`wblca:p:${id}`)) as Project | undefined; return p ? migrate(p) : null; } catch { return null; }
}

export async function lastProjectId(): Promise<string | null> {
  try { return ((await get(LAST)) as string) ?? null; } catch { return null; }
}

export async function deleteProjectLocal(id: string): Promise<void> {
  try {
    await del(`wblca:p:${id}`);
    await set(IDX, (await listProjects()).filter((x) => x.id !== id));
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------ files
export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export function safeName(s: string) {
  return (s || 'project').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'project';
}

export function saveProjectFile(p: Project) {
  const blob = new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' });
  downloadBlob(blob, `${safeName(p.name)}.wblca.json`);
}

export async function readProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  const p = JSON.parse(text);
  if (p?.schema !== 'wblca-project@1') throw new Error('This file is not a Whole building LCA project (.wblca.json).');
  return migrate(p as Project);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files?.[0] ?? null);
    i.oncancel = () => resolve(null);
    i.click();
  });
}
