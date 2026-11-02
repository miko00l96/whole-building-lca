/// <reference lib="webworker" />
// Reads an IFC file with web-ifc (WebAssembly) off the main thread: element facts (class, type, material and layers, storey,
// IsExternal / LoadBearing), quantities (IFC base quantities when the file has them, else measured on the geometry) and the
// triangle meshes for the 3D view. Nothing leaves the browser.
import * as W from 'web-ifc';
import wasmUrl from 'web-ifc/web-ifc.wasm?url';
import { parseModel } from './parse.ts';
import type { WorkerIn, WorkerOut } from './types.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: WorkerOut, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

scope.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  if (ev.data?.type !== 'open') return;
  try {
    const api = new W.IfcAPI();
    await api.Init((path: string) => (path.endsWith('.wasm') ? wasmUrl : path), true);
    parseModel(api, new Uint8Array(ev.data.buffer), post);
  } catch (e: any) {
    post({ type: 'error', message: String(e?.message ?? e) });
  }
};
