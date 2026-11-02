// Checks that run without the private data: the public example project, the IFC take-off helpers and the report layout.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Library, normalise } from '../src/engine/library.ts';
import { computeProject } from '../src/engine/calc.ts';
import { densityFor } from '../src/engine/rules.ts';
import { publicDemo } from '../src/data/demo.ts';
import { groupElements, planLines, qtyIn } from '../src/ifc/takeoff.ts';
import type { IfcElem } from '../src/ifc/types.ts';
import { paginate } from '../src/report/ReportView.tsx';
import type { Block } from '../src/report/model.ts';

const doc = JSON.parse(gunzipSync(readFileSync('public/data/oekobaudat.json.gz')).toString('utf8'));
const lib = new Library();
lib.set('ÖKOBAUDAT', doc.rows.map((r: any) => normalise('ÖKOBAUDAT', r)), { src: 'ÖKOBAUDAT', title: doc.title, count: doc.rows.length, origin: 'public' });

describe('public example project (ÖKOBAUDAT only)', () => {
  const r = computeProject(publicDemo(), lib, '2026-11-02');
  it('finds every dataset', () => {
    for (const d of [r.base, r.prop]) expect(d.lines.every((l) => l.found)).toBe(true);
  });
  it('gives a stable result that meets Path 3', () => {
    expect(r.base.total[0]).toBeCloseTo(1956445.8, 0);
    expect(r.leed.change[0]!).toBeLessThan(-0.2);
    expect(r.leed.points).toBe(3);
    expect(r.base.qaCount + r.prop.qaCount).toBe(0);
  });
});

describe('densities', () => {
  it('matches short keywords at the start of a word only', () => {
    expect(densityFor('stair concrete')).toBe(2400);
    expect(densityFor('Air gap 50 mm')).toBe(0);
    expect(densityFor('chair')).toBeNull();
    expect(densityFor('Metal - Steel - 345 MPa')).toBe(7850);
  });
});

describe('IFC take-off', () => {
  const el = (id: number, cls: string, typeName: string, material: string, q: Partial<IfcElem['q']>, ext: boolean | null = null): IfcElem => ({
    id, gid: `G${id}`, cls, ptype: '', name: typeName, typeName, material, layers: [], storey: 'Level 1', parentCls: '', external: ext, loadBearing: null,
    q: { count: 1, volume: 0, area: 0, length: 0, weight: null, ...q }, qFrom: { volume: 'geometry', area: 'geometry', length: 'geometry' },
  });
  const els = [
    el(1, 'IfcWall', 'Basic Wall:200 Concrete', 'Concrete', { volume: 3, area: 15, length: 5 }, true),
    el(2, 'IfcWall', 'Basic Wall:200 Concrete', 'Concrete', { volume: 2, area: 10, length: 4 }, true),
    el(3, 'IfcBeam', 'UB 305', 'Steel S355', { volume: 0.05, area: 2, length: 6 }),
    el(4, 'IfcFurnishingElement', 'Desk', 'Wood', { volume: 0.1 }),
  ];
  const g = groupElements(els, 0);
  it('groups by class, type and material and suggests units and categories', () => {
    const wall = g.find((x) => x.cls === 'IfcWall')!;
    expect(wall.els.length).toBe(2);
    expect(wall.unit).toBe('m3');
    expect(wall.elem).toBe('Exterior walls & cladding');
    const beam = g.find((x) => x.cls === 'IfcBeam')!;
    expect(beam.unit).toBe('t');
    expect(g.find((x) => x.cls === 'IfcFurnishingElement')!.inScope).toBe(false);
  });
  it('works out quantities in the BOQ unit', () => {
    expect(qtyIn('t', els[2], 7850)).toBeCloseTo(0.3925, 6);
    const [pl] = planLines(g.find((x) => x.cls === 'IfcWall')!, 'm2', 'Exterior walls & cladding', 60, false);
    expect(pl.qty).toBe(25);
    expect(pl.kgpu).toBe(480);
  });
});

describe('report pages', () => {
  it('splits a long table between rows and keeps headings with what follows', () => {
    const rows = Array.from({ length: 40 }, (_, k) => [`row ${k}`]);
    const blocks: Block[] = [{ t: 'h1', text: 'A', toc: '1   A' }, { t: 'table', head: ['x'], rows, widths: [1] }];
    const m = [{ h: 30 }, { h: 40 * 20 + 30, table: { top: 0, head: 25, rows: rows.map(() => 20), foot: 0, bottom: 5 } }];
    const p = paginate(blocks, m, 400);
    expect(p.pages.length).toBe(3);
    expect(p.pages[0][0].i).toBe(0);
    const parts = p.pages.flat().filter((f) => f.i === 1);
    expect(parts.reduce((a, f) => a + ((f.to ?? 0) - (f.from ?? 0)), 0)).toBe(40);
  });
});

import { comparable, strengthOf } from '../src/engine/alternatives.ts';
describe('like-for-like alternatives', () => {
  const ds = (n: string) => ({ src: 'IDEMAT', n, u: 'kg', kg: 1, a: [1], c: null, dGwp: null, cls: 'x' }) as any;
  it('keeps the strength class of concrete and the kind of product', () => {
    expect(strengthOf('B4017 - C40/20 (195kg OPC + 195kg GGBS)')).toBe(40);
    expect(comparable('B4017 - C40/20 OPC + GGBS', 'Concrete', ds('RCC C10 (100% SRC with Recycled Aggregate)'))).toBe(false);
    expect(comparable('B4017 - C40/20 OPC + GGBS', 'Concrete', ds('C45/20 70% GGBS mix'))).toBe(true);
    expect(comparable('Glass for windows and facades (float glass)', 'Glass & glazing', ds('Glass bottles 100% recycled'))).toBe(false);
    expect(comparable('Rock wool panel insulation', 'Insulation', ds('ISOCELL cellulose blown insulation'))).toBe(false);
    expect(comparable('Rock wool panel insulation', 'Insulation', ds('glass wool mat, uncoated'))).toBe(true);
  });
});

import { projectFromHash, projectLink } from '../src/state/share.ts';
describe('project links', () => {
  it('carry the project without the people and open as a new project', async () => {
    (globalThis as any).location = { origin: 'https://example.org', pathname: '/whole-building-lca/' };
    const p = publicDemo();
    p.setup.client = 'Client name';
    const url = await projectLink(p);
    expect(url.startsWith('https://example.org/whole-building-lca/#p=')).toBe(true);
    const q = await projectFromHash(url.slice(url.indexOf('#')));
    expect(q).not.toBeNull();
    expect(q!.id).not.toBe(p.id);
    expect(q!.setup.client).toBe('');
    expect(q!.boq.length).toBe(p.boq.length);
    expect(computeProject(q!, lib, '2026-11-02').prop.total[0]).toBeCloseTo(computeProject(p, lib, '2026-11-02').prop.total[0], 6);
  });
});
