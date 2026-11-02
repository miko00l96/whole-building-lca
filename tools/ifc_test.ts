// Node check of the IFC reader: node --experimental-strip-types tools/ifc_test.ts <file.ifc>
import * as W from 'web-ifc';
import { readFileSync } from 'node:fs';
import { parseModel } from '../src/ifc/parse.ts';
import type { IfcElem, IfcModelInfo } from '../src/ifc/types.ts';

const api = new W.IfcAPI();
await api.Init();
let els: IfcElem[] = [], info: IfcModelInfo | null = null, meshes = 0, verts = 0;
const t0 = Date.now();
parseModel(api, new Uint8Array(readFileSync(process.argv[2])), (m) => {
  if (m.type === 'meshes') { meshes += m.meshes.length; verts += m.meshes.reduce((a, x) => a + x.pos.length / 3, 0); }
  if (m.type === 'done') { els = m.elements; info = m.info; }
  if (m.type === 'error') console.error(m.message);
});
console.log('ms', Date.now() - t0, 'meshes', meshes, 'vertices', verts, 'elements', els.length);
console.log(info);
for (const e of els.slice(0, 6)) console.log(JSON.stringify(e));
const g = new Map<string, { n: number; v: number; a: number; l: number }>();
for (const e of els) {
  const k = `${e.cls} | ${e.typeName} | ${e.material} | ext=${e.external} lb=${e.loadBearing} | parent=${e.parentCls}`;
  const x = g.get(k) ?? { n: 0, v: 0, a: 0, l: 0 };
  x.n++; x.v += e.q.volume; x.a += e.q.area; x.l += e.q.length;
  g.set(k, x);
}
for (const [k, x] of g) console.log(x.n, k, '| V', x.v.toFixed(2), 'A', x.a.toFixed(1), 'L', x.l.toFixed(1));
