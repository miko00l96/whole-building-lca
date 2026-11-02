// IFC reading shared by the web worker and the Node test (tools/ifc_test.ts): element facts, quantities and meshes.
import * as W from 'web-ifc';
import type { IfcElem, IfcLayer, IfcModelInfo, MeshData, WorkerOut } from './types.ts';

const SKIP = new Set(['IfcSpace', 'IfcOpeningElement', 'IfcOpeningStandardCase', 'IfcAnnotation', 'IfcGrid', 'IfcVirtualElement', 'IfcSite',
  'IfcBuilding', 'IfcBuildingStorey', 'IfcSpatialZone', 'IfcDistributionPort', 'IfcProject', 'IfcExternalSpatialElement']);
const PREFIX: Record<string, number> = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 };

const v = (x: any): any => (x == null ? null : typeof x === 'object' ? (x.value ?? x._representationValue ?? null) : x);
const str = (x: any): string => { const y = v(x); return y == null ? '' : String(y); };
const num = (x: any): number | null => { const y = v(x); const n = typeof y === 'number' ? y : parseFloat(String(y)); return Number.isFinite(n) ? n : null; };
const bool = (x: any): boolean | null => {
  const y = v(x);
  if (y === true || y === false) return y;
  const s = String(y ?? '').toUpperCase().replace(/\./g, '');
  return s === 'T' || s === 'TRUE' ? true : s === 'F' || s === 'FALSE' ? false : null;
};
const fold = (cls: string) => cls.replace(/(StandardCase|ElementedCase)$/, '');

function geomQ(pos: Float32Array, idx: Uint32Array) {
  let vol = 0, S = 0;
  const cl = new Map<number, number>();
  const ox = pos[0] ?? 0, oy = pos[1] ?? 0, oz = pos[2] ?? 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = pos[a] - ox, ay = pos[a + 1] - oy, az = pos[a + 2] - oz;
    const bx = pos[b] - ox, by = pos[b + 1] - oy, bz = pos[b + 2] - oz;
    const cx = pos[c] - ox, cy = pos[c + 1] - oy, cz = pos[c + 2] - oz;
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const d = Math.hypot(nx, ny, nz);
    if (d < 1e-12) continue;
    S += d / 2;
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    let ex = nx / d, ey = ny / d, ez = nz / d;
    if (ex < -1e-6 || (Math.abs(ex) <= 1e-6 && (ey < -1e-6 || (Math.abs(ey) <= 1e-6 && ez < 0)))) { ex = -ex; ey = -ey; ez = -ez; }
    const key = (Math.round(ex * 20) + 20) * 1681 + (Math.round(ey * 20) + 20) * 41 + (Math.round(ez * 20) + 20);
    cl.set(key, (cl.get(key) ?? 0) + d / 2);
  }
  let best = 0;
  for (const x of cl.values()) if (x > best) best = x;
  const area = best >= 0.3 * S ? best / 2 : S / 2;
  // main axis (PCA, power iteration) for the length of linear members
  const n = pos.length / 3;
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < pos.length; i += 3) { mx += pos[i]; my += pos[i + 1]; mz += pos[i + 2]; }
  mx /= n || 1; my /= n || 1; mz /= n || 1;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] - mx, y = pos[i + 1] - my, z = pos[i + 2] - mz;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  let e0 = 1, e1 = 0.7, e2 = 0.4;
  for (let k = 0; k < 30; k++) {
    const a = xx * e0 + xy * e1 + xz * e2, b = xy * e0 + yy * e1 + yz * e2, c = xz * e0 + yz * e1 + zz * e2;
    const L = Math.hypot(a, b, c) || 1;
    e0 = a / L; e1 = b / L; e2 = c / L;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const p = (pos[i] - mx) * e0 + (pos[i + 1] - my) * e1 + (pos[i + 2] - mz) * e2;
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  return { volume: Math.abs(vol), area, length: n ? hi - lo : 0 };
}

/** Reads the model with an initialised IfcAPI; emit gets progress, mesh batches and the element list. */
export function parseModel(api: W.IfcAPI, data: Uint8Array, emit: (m: WorkerOut, transfer?: Transferable[]) => void): void {
  const post = emit;
  const mid = api.OpenModel(data, { COORDINATE_TO_ORIGIN: true });
  const schema = String(api.GetModelSchema(mid) ?? '');
  const ids = (t: number): number[] => {
    const vec = api.GetLineIDsWithType(mid, t);
    const out: number[] = [];
    for (let i = 0; i < vec.size(); i++) out.push(vec.get(i));
    return out;
  };
  const line = (id: number, flat = false): any => { try { return api.GetLine(mid, id, flat); } catch { return null; } };
  const clsOf = (o: any): string => { try { return api.GetNameFromTypeCode(o?.type ?? api.GetLineType(mid, o?.expressID)); } catch { return ''; } };
  post({ type: 'progress', done: 0, total: 1, phase: 'Reading the model' });

  // units
  const scale = { len: 1, area: 1, vol: 1, mass: 1 };
  let lengthUnit = 'm';
  for (const ua of ids(W.IFCUNITASSIGNMENT)) {
    const u = line(ua, true);
    for (const x of u?.Units ?? []) {
      const ut = str(x?.UnitType);
      let f: number | null = null;
      if (clsOf(x) === 'IfcSIUnit') {
        const p = PREFIX[str(x.Prefix)] ?? 1;
        f = ut === 'AREAUNIT' ? p * p : ut === 'VOLUMEUNIT' ? p * p * p : ut === 'MASSUNIT' ? (p * (str(x.Name) === 'GRAM' ? 0.001 : 1)) : p;
        if (ut === 'LENGTHUNIT') lengthUnit = `${str(x.Prefix).toLowerCase()}${str(x.Name).toLowerCase()}`.replace('millimetre', 'mm').replace('centimetre', 'cm').replace('metre', 'm');
      } else if (clsOf(x) === 'IfcConversionBasedUnit') {
        const cf = x.ConversionFactor;
        const val = num(cf?.ValueComponent) ?? 1;
        const base = cf?.UnitComponent ? (PREFIX[str(cf.UnitComponent.Prefix)] ?? 1) : 1;
        f = ut === 'AREAUNIT' ? val * base * base : ut === 'VOLUMEUNIT' ? val * base ** 3 : val * base;
        if (ut === 'LENGTHUNIT') lengthUnit = str(x.Name).toLowerCase();
      }
      if (f == null) continue;
      if (ut === 'LENGTHUNIT') scale.len = f;
      if (ut === 'AREAUNIT') scale.area = f;
      if (ut === 'VOLUMEUNIT') scale.vol = f;
      if (ut === 'MASSUNIT') scale.mass = f;
    }
  }

  // types
  const typeOf = new Map<number, number>();
  for (const r of ids(W.IFCRELDEFINESBYTYPE)) {
    const x = line(r);
    const t = v(x?.RelatingType);
    for (const o of x?.RelatedObjects ?? []) typeOf.set(v(o), t);
  }
  // materials
  const matCache = new Map<number, { name: string; layers: IfcLayer[] }>();
  const mm = (m: number) => `${Math.round(m * 1000)} mm`;
  const resolve = (m: any, depth = 0): { name: string; layers: IfcLayer[] } => {
    if (!m || depth > 4) return { name: '', layers: [] };
    const c = clsOf(m);
    if (c === 'IfcMaterial') return { name: str(m.Name), layers: [] };
    if (c === 'IfcMaterialLayerSetUsage') return resolve(m.ForLayerSet, depth + 1);
    if (c === 'IfcMaterialLayerSet') {
      const layers = (m.MaterialLayers ?? []).map((l: any) => ({ name: str(l?.Material?.Name) || str(l?.Name) || 'Layer', t: (num(l?.LayerThickness) ?? 0) * scale.len }));
      const name = layers.length === 1 ? layers[0].name : layers.map((l: IfcLayer) => `${l.name} ${mm(l.t)}`).join(' + ');
      return { name, layers: layers.length > 1 ? layers : [] };
    }
    if (c === 'IfcMaterialLayer') return { name: str(m.Material?.Name), layers: [] };
    if (c === 'IfcMaterialList') return { name: (m.Materials ?? []).map((x: any) => str(x?.Name)).filter(Boolean).join(' + '), layers: [] };
    if (c === 'IfcMaterialConstituentSet') return { name: (m.MaterialConstituents ?? []).map((x: any) => str(x?.Material?.Name)).filter(Boolean).join(' + '), layers: [] };
    if (c === 'IfcMaterialProfileSetUsage') return resolve(m.ForProfileSet, depth + 1);
    if (c === 'IfcMaterialProfileSet') return { name: (m.MaterialProfiles ?? []).map((x: any) => str(x?.Material?.Name)).filter(Boolean).join(' + '), layers: [] };
    return { name: str(m.Name), layers: [] };
  };
  const matOf = new Map<number, { name: string; layers: IfcLayer[] }>();
  for (const r of ids(W.IFCRELASSOCIATESMATERIAL)) {
    const x = line(r);
    const mid_ = v(x?.RelatingMaterial);
    if (mid_ == null) continue;
    let m = matCache.get(mid_);
    if (!m) { m = resolve(line(mid_, true)); matCache.set(mid_, m); }
    for (const o of x?.RelatedObjects ?? []) matOf.set(v(o), m);
  }
  // property sets and base quantities
  const ext = new Map<number, boolean | null>(), lb = new Map<number, boolean | null>();
  const qto = new Map<number, Record<string, number>>();
  for (const r of ids(W.IFCRELDEFINESBYPROPERTIES)) {
    const x = line(r);
    const pd = line(v(x?.RelatingPropertyDefinition));
    if (!pd) continue;
    const c = clsOf(pd);
    const objs: number[] = (x.RelatedObjects ?? []).map((o: any) => v(o));
    if (c === 'IfcPropertySet' && /Common$/.test(str(pd.Name))) {
      for (const pr of pd.HasProperties ?? []) {
        const p = line(v(pr));
        const nm = str(p?.Name);
        if (nm !== 'IsExternal' && nm !== 'LoadBearing') continue;
        const b = bool(p?.NominalValue);
        for (const o of objs) (nm === 'IsExternal' ? ext : lb).set(o, b);
      }
    } else if (c === 'IfcElementQuantity') {
      const q: Record<string, number> = {};
      for (const qr of pd.Quantities ?? []) {
        const qq = line(v(qr));
        const qc = clsOf(qq), nm = str(qq?.Name);
        const val = qc === 'IfcQuantityVolume' ? (num(qq.VolumeValue) ?? 0) * scale.vol
          : qc === 'IfcQuantityArea' ? (num(qq.AreaValue) ?? 0) * scale.area
          : qc === 'IfcQuantityLength' ? (num(qq.LengthValue) ?? 0) * scale.len
          : qc === 'IfcQuantityWeight' ? (num(qq.WeightValue) ?? 0) * scale.mass
          : qc === 'IfcQuantityCount' ? num(qq.CountValue) ?? 0 : null;
        if (val != null && nm) q[`${qc.replace('IfcQuantity', '')}:${nm}`] = val;
      }
      for (const o of objs) qto.set(o, { ...(qto.get(o) ?? {}), ...q });
    }
  }
  // spatial structure and aggregates
  const storeyOf = new Map<number, string>();
  for (const r of ids(W.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const x = line(r);
    const s = line(v(x?.RelatingStructure));
    const nm = str(s?.Name) || str(s?.LongName);
    for (const o of x?.RelatedElements ?? []) storeyOf.set(v(o), nm);
  }
  const parentOf = new Map<number, number>();
  for (const r of ids(W.IFCRELAGGREGATES)) {
    const x = line(r);
    for (const o of x?.RelatedObjects ?? []) parentOf.set(v(o), v(x?.RelatingObject));
  }
  const storeys = ids(W.IFCBUILDINGSTOREY).map((id) => { const s = line(id); return { n: str(s?.Name) || str(s?.LongName), z: num(s?.Elevation) ?? 0 }; })
    .sort((a, b) => a.z - b.z).map((s) => s.n);
  const pj = line(ids(W.IFCPROJECT)[0] ?? -1);
  const bd = line(ids(W.IFCBUILDING)[0] ?? -1);
  const st = line(ids(W.IFCSITE)[0] ?? -1);
  const info: IfcModelInfo = { schema, project: str(pj?.LongName) || str(pj?.Name), site: str(st?.Name), building: str(bd?.LongName) || str(bd?.Name), storeys, lengthUnit };

  // meshes
  const elements: IfcElem[] = [];
  let batch: MeshData[] = [], batchV = 0;
  const flush = () => {
    if (!batch.length) return;
    post({ type: 'meshes', meshes: batch }, batch.flatMap((m) => [m.pos.buffer, m.nrm.buffer, m.idx.buffer]));
    batch = [];
    batchV = 0;
  };
  api.StreamAllMeshes(mid, (mesh, index, total) => {
    const id = mesh.expressID;
    const raw = clsOf({ expressID: id, type: api.GetLineType(mid, id) });
    const cls = fold(raw);
    if (SKIP.has(raw) || SKIP.has(cls)) return;
    const parts: { p: Float32Array; n: Float32Array; i: Uint32Array }[] = [];
    let color: [number, number, number, number] = [0.8, 0.8, 0.8, 1];
    let nv = 0, ni = 0;
    for (let g = 0; g < mesh.geometries.size(); g++) {
      const pg = mesh.geometries.get(g);
      if (g === 0) color = [pg.color.x, pg.color.y, pg.color.z, pg.color.w];
      const geo = api.GetGeometry(mid, pg.geometryExpressID);
      const vd = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
      const id_ = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
      const m = pg.flatTransformation;
      const k = vd.length / 6;
      const p = new Float32Array(k * 3), n = new Float32Array(k * 3);
      for (let j = 0; j < k; j++) {
        const x = vd[j * 6], y = vd[j * 6 + 1], z = vd[j * 6 + 2], a = vd[j * 6 + 3], b = vd[j * 6 + 4], c = vd[j * 6 + 5];
        p[j * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
        p[j * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        p[j * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        const nx = m[0] * a + m[4] * b + m[8] * c, ny = m[1] * a + m[5] * b + m[9] * c, nz = m[2] * a + m[6] * b + m[10] * c;
        const L = Math.hypot(nx, ny, nz) || 1;
        n[j * 3] = nx / L; n[j * 3 + 1] = ny / L; n[j * 3 + 2] = nz / L;
      }
      parts.push({ p, n, i: id_.slice() });
      nv += k;
      ni += id_.length;
      geo.delete();
    }
    if (!nv) return;
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const pt of parts) {
      pos.set(pt.p, ov * 3);
      nrm.set(pt.n, ov * 3);
      for (let j = 0; j < pt.i.length; j++) idx[oi + j] = pt.i[j] + ov;
      ov += pt.p.length / 3;
      oi += pt.i.length;
    }
    const gq = geomQ(pos, idx);
    const e = line(id);
    const tId = typeOf.get(id);
    const t = tId != null ? line(tId) : null;
    const mat = matOf.get(id) ?? (tId != null ? matOf.get(tId) : undefined) ?? { name: '', layers: [] };
    const par = parentOf.get(id);
    const parCls = par != null ? fold(clsOf({ expressID: par, type: api.GetLineType(mid, par) })) : '';
    const Q = qto.get(id) ?? {};
    const pick = (...keys: string[]) => { for (const k of keys) if (Q[k] != null && Q[k] > 0) return Q[k]; return null; };
    const qv = pick('Volume:NetVolume', 'Volume:GrossVolume', ...Object.keys(Q).filter((k) => k.startsWith('Volume:')));
    const qa = pick('Area:NetSideArea', 'Area:NetArea', 'Area:Area', 'Area:NetSurfaceArea', 'Area:GrossSideArea', 'Area:GrossArea', 'Area:NetFootprintArea', 'Area:GrossFootprintArea');
    const ql = pick('Length:Length', 'Length:NetLength', 'Length:GrossLength');
    const qw = pick('Weight:NetWeight', 'Weight:GrossWeight');
    elements.push({
      id, gid: str(e?.GlobalId), cls, ptype: str(e?.PredefinedType) || str(t?.PredefinedType),
      name: str(e?.Name).replace(/:\d+$/, ''), typeName: str(t?.Name) || str(e?.ObjectType), material: mat.name, layers: mat.layers,
      storey: storeyOf.get(id) ?? (par != null ? storeyOf.get(par) ?? storeyOf.get(parentOf.get(par) ?? -1) ?? '' : ''),
      parentCls: parCls, external: ext.get(id) ?? (tId != null ? ext.get(tId) ?? null : null) ?? (par != null ? ext.get(par) ?? null : null),
      loadBearing: lb.get(id) ?? (tId != null ? lb.get(tId) ?? null : null),
      q: { count: 1, volume: qv ?? gq.volume, area: qa ?? gq.area, length: ql ?? gq.length, weight: qw },
      qFrom: { volume: qv != null ? 'ifc' : 'geometry', area: qa != null ? 'ifc' : 'geometry', length: ql != null ? 'ifc' : 'geometry' },
    });
    batch.push({ id, pos, nrm, idx, color });
    batchV += nv;
    if (batchV > 250_000 || batch.length >= 400) flush();
    if (index % 50 === 0) post({ type: 'progress', done: index + 1, total, phase: 'Reading the elements' });
  });
  flush();
  api.CloseModel(mid);
  post({ type: 'done', elements, info });
}

