// Quantity take-off from an IFC model: elements grouped by class, type and material, a suggested BOQ unit, element category
// and LEED scope per group, quantities in any BOQ unit, and the link between model elements and BOQ lines.
import type { BoqLine, Project } from '../engine/types.ts';
import { densityFor, normUnit } from '../engine/rules.ts';
import { guessElement, guessLife } from '../engine/guess.ts';
import type { IfcElem, IfcLayer, IfcQty } from './types.ts';

export interface Group {
  key: string;
  cls: string;
  label: string;
  material: string;
  ext: boolean | null;
  els: IfcElem[];
  q: IfcQty;
  layers: IfcLayer[]; // common layer build-up of the group (2+ layers)
  unit: string;
  elem: string;
  inScope: boolean;
  note: string;
  density: number | null;
  steel: boolean;
}

const clean = (s: string) => s.replace(/<unnamed>/gi, '').replace(/\s+/g, ' ').trim();
export const clsLabel = (cls: string) => cls.replace(/^Ifc/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ (\w)/g, (_, c) => ' ' + c.toLowerCase());

const MEP = /^Ifc(Flow|Distribution|EnergyConversion|Duct|Pipe|Cable|Air|Fan|Pump|Valve|Damper|Sanitary|FireSuppression|LightFixture|Lamp|Outlet|Switching|ElectricAppliance|ElectricDistribution|UnitaryEquipment|Boiler|Chiller|Coil|Compressor|CoolingTower|Filter|Tank|WasteTerminal|SpaceHeater|Alarm|Sensor|Actuator|Controller|ProtectiveDevice|Transformer|Motor|Junction|Communications|Audio)/;
const FURN = /^Ifc(FurnishingElement|Furniture|SystemFurnitureElement)$/;

/** Element category, LEED scope and a note for one group. system = Setup system index (0–1 BD+C, 2–4 ID+C). */
export function classify(g: Pick<Group, 'cls' | 'label' | 'material' | 'ext'> & { ptype: string; parentCls: string; loadBearing: boolean | null }, system: number) {
  const idc = system >= 2;
  const text = `${g.label} ${g.material}`.toLowerCase();
  const guess = guessElement(`${g.label} ${g.material}`, system);
  const out = (elem: string, inScope = true, note = '') => ({ elem, inScope, note });
  const c = g.cls, pt = g.ptype.toUpperCase();
  if (!idc) {
    if (c === 'IfcFooting' || c === 'IfcPile') return out('Foundations & footings');
    if (c === 'IfcSlab') {
      if (pt === 'ROOF') return out('Roof structure');
      if (pt === 'LANDING') return out('Stairs');
      if (pt === 'BASESLAB' || /footing|foundation|raft|pile cap/.test(text)) return out('Foundations & footings');
      return out(guess === 'Other in-scope (explain)' ? 'Floor slabs & decks' : guess);
    }
    if (c === 'IfcRoof') return out('Roof structure');
    if (c === 'IfcBeam' || c === 'IfcColumn') {
      if (/ground beam|grade beam|tie beam|pile cap/.test(text)) return out('Foundations & footings');
      if (/roof/.test(text)) return out('Roof structure');
      return out('Structural frame (columns, beams)');
    }
    if (c === 'IfcMember') return g.parentCls === 'IfcCurtainWall' || /mullion|transom/.test(text) ? out('Windows & curtain wall') : out('Structural frame (columns, beams)');
    if (c === 'IfcPlate') return g.parentCls === 'IfcCurtainWall' || /glass|glaz|panel/.test(text) ? out('Windows & curtain wall') : out('Exterior walls & cladding');
    if (c === 'IfcCurtainWall' || c === 'IfcWindow') return out('Windows & curtain wall');
    if (c === 'IfcDoor') return g.ext === false ? out('Exterior doors', false, 'Interior door: outside the BD+C scope') : out('Exterior doors', true, g.ext == null ? 'Check: only exterior doors are in the BD+C scope' : '');
    if (c === 'IfcWall') {
      if (/retaining|basement|diaphragm/.test(text)) return out('Basement / retaining walls');
      if (g.ext === true) return out('Exterior walls & cladding');
      if (g.ext === false) return g.loadBearing ? out('Load-bearing interior walls') : out('Load-bearing interior walls', false, 'Interior non-load-bearing wall: outside the BD+C scope');
      return out(guess === 'Other in-scope (explain)' ? 'Exterior walls & cladding' : guess, true, 'Check: the file does not say whether this wall is external');
    }
    if (c === 'IfcCovering') {
      if (pt === 'ROOFING' || pt === 'MEMBRANE') return out('Roof covering & insulation');
      if (pt === 'CLADDING') return out('Exterior walls & cladding');
      if (pt === 'INSULATION') return out(/roof/.test(text) ? 'Roof covering & insulation' : 'Exterior walls & cladding', true, 'Check the element category');
      return out('Other in-scope (explain)', false, 'Interior finish: outside the BD+C scope');
    }
    if (c === 'IfcStair' || c === 'IfcStairFlight' || c === 'IfcRamp' || c === 'IfcRampFlight') return out('Stairs');
    if (c === 'IfcRailing') return out('Other in-scope (explain)', false, 'Railings are outside the BD+C scope');
    if (MEP.test(c)) return out('Other in-scope (explain)', false, 'Building services: outside the BD+C scope');
    if (FURN.test(c)) return out('Other in-scope (explain)', false, 'Furniture: outside the BD+C scope');
    return out(guess, true, c === 'IfcBuildingElementProxy' ? 'Generic element: check the category' : '');
  }
  // ID+C v4.1
  if (c === 'IfcCovering') {
    if (pt === 'FLOORING' || pt === 'SKIRTINGBOARD') return out('Flooring & wall base');
    if (pt === 'CEILING') return out('Ceilings');
    return out('Wall finishes & coverings');
  }
  if (c === 'IfcWall') return g.ext === true ? out('Structure & enclosure (in scope)', true, 'Include only if it is part of the scope of work') : out('Walls & partitions');
  if (c === 'IfcDoor') return out('Doors, frames & hardware');
  if (c === 'IfcWindow' || c === 'IfcCurtainWall' || (c === 'IfcPlate' && /glass|glaz/.test(text)))
    return g.ext === true ? out('Structure & enclosure (in scope)', true, 'Include only if it is part of the scope of work') : out('Interior glazing & window treatments');
  if (FURN.test(c)) return out(/cabinet|casework|joinery|millwork|counter|vanity/.test(text) ? 'Casework & joinery' : 'Furniture & furnishings');
  if (/^Ifc(LightFixture|Lamp|Cable|Outlet|Switching|ElectricAppliance|ElectricDistribution|Junction)/.test(c)) return out('Lighting & electrical');
  if (/^Ifc(Duct|Air|Damper|Fan|UnitaryEquipment|Coil|Filter)/.test(c)) return out('Mechanical & ductwork');
  if (/^Ifc(Pipe|Sanitary|FireSuppression|Valve|WasteTerminal|Pump|Tank)/.test(c)) return out('Plumbing & fire protection');
  if (/^Ifc(Slab|Beam|Column|Footing|Pile|Roof|Stair|StairFlight|Ramp|RampFlight|Member)$/.test(c)) return out('Structure & enclosure (in scope)', true, 'Include only if it is part of the scope of work');
  if (MEP.test(c)) return out(guess === 'Other in-scope (explain)' ? 'Mechanical & ductwork' : guess, true, 'Check the element category');
  return out(guess);
}

function suggestUnit(cls: string, text: string, steel: boolean, layers: number): string {
  if (/^Ifc(Door|FurnishingElement|Furniture|SystemFurnitureElement|LightFixture|Lamp|SanitaryTerminal|AirTerminal|Outlet|Switching|FireSuppressionTerminal|Valve|Damper|Fan|UnitaryEquipment)/.test(cls)) return 'piece';
  if (/^Ifc(PipeSegment|DuctSegment|CableSegment|CableCarrierSegment|Railing|FlowSegment)/.test(cls)) return 'm';
  if (/^Ifc(Covering|CurtainWall|Window|Plate)$/.test(cls)) return steel ? 't' : 'm2';
  if (steel) return 't';
  if (/^Ifc(Wall|Slab|Roof)$/.test(cls) && (layers > 1 || /glass|glaz|panel|cladding|board|gypsum|plasterboard|membrane|sheet/.test(text))) return 'm2';
  return 'm3';
}

/** Group the model elements for the take-off table. */
export function groupElements(els: IfcElem[], system: number): Group[] {
  const m = new Map<string, Group>();
  for (const e of els) {
    const label = clean(e.typeName || e.name) || e.cls;
    const material = clean(e.material);
    const key = [e.cls, label, material, e.parentCls, e.external === true ? 'ext' : e.external === false ? 'int' : ''].join('|');
    let g = m.get(key);
    if (!g) {
      const text = `${label} ${material}`.toLowerCase();
      const dens = densityFor(material || label);
      const steel = dens === 7850 || /\bsteel\b|\bmetal\b/.test(text);
      const cl = classify({ cls: e.cls, label, material, ext: e.external, ptype: e.ptype, parentCls: e.parentCls, loadBearing: e.loadBearing }, system);
      g = { key, cls: e.cls, label, material, ext: e.external, els: [], q: { count: 0, volume: 0, area: 0, length: 0, weight: null }, layers: e.layers,
        unit: suggestUnit(e.cls, text, steel, e.layers.length), elem: cl.elem, inScope: cl.inScope, note: cl.note, density: dens ?? (steel ? 7850 : null), steel };
      m.set(key, g);
    }
    g.els.push(e);
    g.q.count += 1;
    g.q.volume += e.q.volume;
    g.q.area += e.q.area;
    g.q.length += e.q.length;
    if (e.q.weight != null) g.q.weight = (g.q.weight ?? 0) + e.q.weight;
    if (g.layers.length && JSON.stringify(g.layers.map((l) => l.name)) !== JSON.stringify(e.layers.map((l) => l.name))) g.layers = [];
  }
  return [...m.values()].sort((a, b) => Number(b.inScope) - Number(a.inScope) || a.cls.localeCompare(b.cls) || b.q.volume - a.q.volume);
}

/** Quantity of one element in a BOQ unit (layerT = thickness of one layer, m). null = cannot be worked out. */
export function qtyIn(unit: string, e: IfcElem, density: number | null, layerT?: number): number | null {
  const V = layerT != null ? e.q.area * layerT : e.q.volume;
  switch (normUnit(unit)) {
    case 'm3': return V;
    case 'm2': return e.q.area;
    case 'm': return e.q.length;
    case 'piece': return 1;
    case 'kg': return layerT == null && e.q.weight != null ? e.q.weight : density != null ? V * density : null;
    case 't': return layerT == null && e.q.weight != null ? e.q.weight / 1000 : density != null ? (V * density) / 1000 : null;
    default: return null;
  }
}

/** kg per BOQ unit of a group (for datasets declared in another unit). */
export function kgPerUnit(unit: string, g: Group, layer?: IfcLayer): number | null {
  const d = layer ? densityFor(layer.name) : g.density;
  if (d == null || d === 0) return null;
  const V = layer ? g.q.area * layer.t : g.q.volume;
  switch (normUnit(unit)) {
    case 'm3': return d;
    case 'm2': return g.q.area > 0 ? Math.round(((d * V) / g.q.area) * 100) / 100 : null;
    case 'm': return g.q.length > 0 ? Math.round(((d * V) / g.q.length) * 100) / 100 : null;
    case 'piece': return g.q.count > 0 ? Math.round(((d * V) / g.q.count) * 10) / 10 : null;
    default: return null;
  }
}

export interface Planned {
  item: string;
  elem: string;
  unit: string;
  qty: number;
  kgpu: number | null;
  rsl: number;
  parts: { gid: string; q: number }[];
  layer: IfcLayer | null;
  dens: number | null;
  missing: number; // elements whose quantity could not be worked out in this unit
}

/** BOQ line(s) for a group: one line, or one per layer when split. */
export function planLines(g: Group, unit: string, elem: string, sp: number, split: boolean): Planned[] {
  const mk = (item: string, u: string, layer?: IfcLayer): Planned => {
    const parts: { gid: string; q: number }[] = [];
    const dens = layer ? densityFor(layer.name) : g.density;
    let missing = 0;
    for (const e of g.els) {
      const q = qtyIn(u, e, dens, layer?.t);
      if (q == null) { missing++; continue; }
      parts.push({ gid: e.gid, q: Math.round(q * 1e4) / 1e4 });
    }
    const qty = parts.reduce((a, x) => a + x.q, 0);
    return { item, elem, unit: u, qty: Math.round(qty * 1000) / 1000, kgpu: kgPerUnit(u, g, layer), rsl: guessLife(`${item} ${g.material}`, sp), parts,
      layer: layer ?? null, dens, missing };
  };
  const base = g.label + (g.material && !g.label.toLowerCase().includes(g.material.toLowerCase()) ? ` (${g.material})` : '');
  if (split && g.layers.length > 1) {
    return g.layers.filter((l) => l.t > 0 && densityFor(l.name) !== 0).map((l) => mk(`${g.label}, layer: ${l.name} ${Math.round(l.t * 1000)} mm`, 'm3', l));
  }
  return [mk(base.slice(0, 160), unit)];
}

/** BOQ lines that take quantities from the model, by element GlobalId: line id → share of each element. */
export function linkIndex(p: Project): Map<string, { line: BoqLine; q: number; total: number }[]> {
  const out = new Map<string, { line: BoqLine; q: number; total: number }[]>();
  for (const b of p.boq) {
    if (!b.ifc?.parts?.length) continue;
    const total = b.ifc.parts.reduce((a, x) => a + x.q, 0);
    for (const pt of b.ifc.parts) {
      const arr = out.get(pt.gid) ?? [];
      arr.push({ line: b, q: pt.q, total });
      out.set(pt.gid, arr);
    }
  }
  return out;
}

/** New quantities of the linked BOQ lines when the model changed (same GlobalIds, new element quantities). */
export function refreshQuantities(p: Project, els: IfcElem[]): { lineId: string; pos: number; item: string; old: number | null; qty: number; parts: { gid: string; q: number }[]; lost: number }[] {
  const byGid = new Map(els.map((e) => [e.gid, e]));
  const out: { lineId: string; pos: number; item: string; old: number | null; qty: number; parts: { gid: string; q: number }[]; lost: number }[] = [];
  p.boq.forEach((b, k) => {
    if (!b.ifc?.parts?.length) return;
    const layerT = b.ifc.layer?.t ?? undefined;
    const dens = b.ifc.dens ?? (b.kgpu && normUnit(b.unit) === 'm3' ? b.kgpu : densityFor(b.item));
    let lost = 0;
    const parts: { gid: string; q: number }[] = [];
    for (const pt of b.ifc.parts) {
      const e = byGid.get(pt.gid);
      if (!e) { lost++; continue; }
      const q = qtyIn(b.unit, e, dens, layerT);
      parts.push({ gid: pt.gid, q: q == null ? pt.q : Math.round(q * 1e4) / 1e4 });
    }
    const qty = Math.round(parts.reduce((a, x) => a + x.q, 0) * 1000) / 1000;
    if (lost || Math.abs(qty - (b.qty ?? 0)) > 1e-6) out.push({ lineId: b.id, pos: k + 1, item: b.item, old: b.qty, qty, parts, lost });
  });
  return out;
}
