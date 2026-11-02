// The libraries in this browser: ÖKOBAUDAT ships with the app; EPD, IDEMAT and ecoinvent come from the private data pack,
// which the user loads from their own drive. The pack is kept in this browser's IndexedDB only and is never uploaded.
import { get, set, del } from 'idb-keyval';
import MiniSearch from 'minisearch';
import { Library, normalise, type Lists } from '../engine/library.ts';
import type { Dataset, Project, Src } from '../engine/types.ts';

export const lib = new Library();
export let samples: Project[] = [];
export let packMeta: PackMeta | null = null;

export interface PackMeta {
  title: string;
  created: string;
  counts: Partial<Record<Src, number>>;
  notice: string;
}

const PACK_KEY = 'wblca:pack';

export async function gunzipText(buf: ArrayBuffer): Promise<string> {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x1f && u8[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }
  return new TextDecoder().decode(u8);
}

export async function gzipText(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).blob();
}

let searchIndex: MiniSearch<SearchDoc> | null = null;
let searchVersion = -1;
export interface SearchDoc {
  id: string;
  src: Src;
  n: string;
  cls: string;
  geo: string;
  maker: string;
  extra: string;
}

export function dsKey(d: { src: string; n: string }) {
  return `${d.src}|${d.n}`;
}

const byKey = new Map<string, Dataset>();
export function datasetByKey(k: string): Dataset | null {
  return byKey.get(k) ?? null;
}

function rebuildKeyMap() {
  byKey.clear();
  for (const src of Object.keys(lib.bySrc) as Src[]) for (const d of lib.bySrc[src]) if (!byKey.has(dsKey(d))) byKey.set(dsKey(d), d);
}

/** Full-text index over every material dataset (built on first use, rebuilt when a library changes). */
export function getSearch(): MiniSearch<SearchDoc> {
  if (searchIndex && searchVersion === lib.version) return searchIndex;
  const ms = new MiniSearch<SearchDoc>({
    fields: ['n', 'cls', 'geo', 'maker', 'extra'],
    storeFields: ['src', 'n'],
    searchOptions: { prefix: true, fuzzy: 0.15, boost: { n: 3, cls: 1.2 }, combineWith: 'AND' },
    tokenize: (s) => s.toLowerCase().split(/[\s,;:()[\]/\\|+–—-]+/).filter(Boolean),
  });
  const docs: SearchDoc[] = [];
  for (const src of Object.keys(lib.bySrc) as Src[])
    for (const d of lib.materials(src))
      docs.push({ id: dsKey(d), src, n: d.n, cls: d.cls, geo: d.geo ?? '', maker: d.maker ?? d.owner ?? '', extra: `${d.reg ?? ''} ${d.prog ?? ''} ${d.cat ?? ''}` });
  ms.addAll(docs);
  searchIndex = ms;
  searchVersion = lib.version;
  return ms;
}

export async function loadPublic(base = import.meta.env.BASE_URL): Promise<void> {
  if (lib.has('ÖKOBAUDAT')) return;
  const res = await fetch(`${base}data/oekobaudat.json.gz`);
  if (!res.ok) throw new Error(`ÖKOBAUDAT could not be loaded (${res.status})`);
  const doc = JSON.parse(await gunzipText(await res.arrayBuffer()));
  lib.set('ÖKOBAUDAT', doc.rows.map((r: any) => normalise('ÖKOBAUDAT', r)), {
    src: 'ÖKOBAUDAT', title: doc.title, count: doc.rows.length, extracted: doc.extracted, origin: 'public',
  });
  if (!lib.lists.grid.length) lib.lists = { ...lib.lists, epMarineGwpMin: 1e-5 };
  rebuildKeyMap();
}

interface PackDoc {
  schema: string;
  title: string;
  created: string;
  notice?: string;
  libs: Partial<Record<Src, { title: string; extracted?: string; rows: any[] }>>;
  lists?: Lists;
  samples?: Project[];
}

function applyPack(doc: PackDoc) {
  if (doc.schema !== 'wblca-pack@1') throw new Error('This file is not a Whole building LCA data pack.');
  const counts: Partial<Record<Src, number>> = {};
  for (const src of ['EPD', 'IDEMAT', 'ecoinvent', 'ÖKOBAUDAT'] as Src[]) {
    const L = doc.libs[src];
    if (!L) continue;
    lib.set(src, L.rows.map((r) => normalise(src, r)), { src, title: L.title, count: L.rows.length, extracted: L.extracted, origin: 'private' });
    counts[src] = L.rows.length;
  }
  if (doc.lists) lib.lists = doc.lists;
  samples = doc.samples ?? [];
  packMeta = { title: doc.title, created: doc.created, counts, notice: doc.notice ?? '' };
  rebuildKeyMap();
}

/** Load a data pack file chosen by the user; keep a copy in this browser for next time. */
export async function loadPackFile(file: File | Blob): Promise<PackMeta> {
  const buf = await file.arrayBuffer();
  const doc = JSON.parse(await gunzipText(buf)) as PackDoc;
  applyPack(doc);
  try { await set(PACK_KEY, buf); } catch { /* storage may be blocked: the pack still works for this session */ }
  return packMeta!;
}

export async function restorePack(): Promise<boolean> {
  try {
    const buf = (await get(PACK_KEY)) as ArrayBuffer | undefined;
    if (!buf) return false;
    applyPack(JSON.parse(await gunzipText(buf)));
    return true;
  } catch {
    return false;
  }
}

export async function removePack(): Promise<void> {
  for (const src of ['EPD', 'IDEMAT', 'ecoinvent'] as Src[]) lib.clear(src);
  lib.lists = { idematTransport: [], idematEol: [], idematModuleD: [], grid: [], epMarineGwpMin: 1e-5 };
  samples = [];
  packMeta = null;
  rebuildKeyMap();
  try { await del(PACK_KEY); } catch { /* ignore */ }
}
