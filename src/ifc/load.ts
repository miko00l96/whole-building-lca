// Main-thread side of the IFC reader: runs the worker, and keeps the last model of each project in this browser
// (IndexedDB) so the 3D view comes back when the project is opened again. The file never leaves the computer.
import { del, get, set } from 'idb-keyval';
import type { IfcElem, IfcModelInfo, MeshData, WorkerOut } from './types.ts';

export interface LoadedModel {
  projectId: string;
  file: string;
  size: number;
  elements: IfcElem[];
  info: IfcModelInfo;
  meshes: MeshData[];
  colors: Map<number, [number, number, number, number]>;
}

let cache: LoadedModel | null = null;
export const cachedModel = (projectId: string) => (cache && cache.projectId === projectId ? cache : null);

export function readIfc(projectId: string, buffer: ArrayBuffer, file: string, onProgress: (done: number, total: number, phase: string) => void): Promise<LoadedModel> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./ifcWorker.ts', import.meta.url), { type: 'module' });
    const meshes: MeshData[] = [];
    w.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      if (m.type === 'progress') onProgress(m.done, m.total, m.phase);
      else if (m.type === 'meshes') meshes.push(...m.meshes);
      else if (m.type === 'done') {
        w.terminate();
        const colors = new Map(meshes.map((x) => [x.id, x.color] as const));
        cache = { projectId, file, size: buffer.byteLength, elements: m.elements, info: m.info, meshes, colors };
        resolve(cache);
      } else if (m.type === 'error') {
        w.terminate();
        reject(new Error(m.message));
      }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'The IFC reader stopped.')); };
    const copy = buffer.slice(0);
    w.postMessage({ type: 'open', buffer: copy }, [copy]);
  });
}

const key = (projectId: string) => `wblca:ifc:${projectId}`;

export async function storeIfc(projectId: string, file: string, buffer: ArrayBuffer) {
  try { await set(key(projectId), { file, buffer }); } catch { /* storage full or blocked: the model works for this session */ }
}

export async function storedIfc(projectId: string): Promise<{ file: string; buffer: ArrayBuffer } | null> {
  try { return ((await get(key(projectId))) as { file: string; buffer: ArrayBuffer } | undefined) ?? null; } catch { return null; }
}

export async function forgetIfc(projectId: string) {
  if (cache?.projectId === projectId) cache = null;
  try { await del(key(projectId)); } catch { /* nothing stored */ }
}
