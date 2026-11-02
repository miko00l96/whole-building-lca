// Element category guesses for imported BOQ lines and IFC elements.
import { BDC_ELEMS, IDC_ELEMS } from './rules.ts';

const BDC: [string, string[]][] = [
  ['Stairs', ['stair', 'landing']],
  ['Parking structure / ancillary building', ['parking structure', 'car park', 'carpark', 'ancillary']],
  ['Basement / retaining walls', ['retaining', 'basement wall', 'diaphragm wall', 'secant', 'contiguous pile wall', 'sheet pile']],
  ['Foundations & footings', ['footing', 'foundation', 'raft', 'pile', 'blinding', 'ground beam', 'grade beam', 'tie beam', 'substructure', 'mat ', 'pad ', 'strip ']],
  ['Windows & curtain wall', ['window', 'glazing', 'curtain wall', 'curtainwall', 'glass', 'mullion', 'skylight', 'louvre', 'louver']],
  ['Exterior doors', ['door', 'entrance', 'shutter', 'gate']],
  ['Roof covering & insulation', ['roofing', 'waterproof', 'membrane', 'roof insulation', 'bitumen', 'roof tile', 'roof cover', 'flashing', 'gravel ballast']],
  ['Roof structure', ['roof slab', 'roof deck', 'roof beam', 'roof structure', 'roof screed', 'roof truss', 'roof']],
  ['Structural frame (columns, beams)', ['column', 'beam', 'frame', 'girder', 'truss', 'structural steel', 'brace', 'bracing', 'core wall', 'shear wall']],
  ['Floor slabs & decks', ['slab', 'deck', 'floor', 'topping', 'screed', 'hollow core', 'composite deck']],
  ['Load-bearing interior walls', ['load-bearing interior', 'load bearing internal', 'internal load', 'bearing wall']],
  ['Exterior walls & cladding', ['external wall', 'exterior wall', 'facade', 'façade', 'cladding', 'block', 'brick', 'masonry', 'render', 'plaster', 'insulation', 'parapet', 'wall']],
];
const IDC: [string, string[]][] = [
  ['Interior glazing & window treatments', ['glazed partition', 'glass partition', 'blind', 'curtain', 'window film', 'interior glazing']],
  ['Ceilings', ['ceiling', 'baffle', 'acoustic panel']],
  ['Subfloor, screed & access floors', ['screed', 'raised floor', 'access floor', 'levelling', 'leveling', 'subfloor', 'underlay']],
  ['Flooring & wall base', ['carpet', 'tile', 'floor finish', 'vinyl', 'lvt', 'skirting', 'parquet', 'terrazzo', 'flooring', 'rubber floor', 'adhesive']],
  ['Doors, frames & hardware', ['door', 'frame', 'ironmongery', 'hinge', 'lock']],
  ['Furniture & furnishings', ['furniture', 'workstation', 'desk', 'chair', 'sofa', 'table', 'seating', 'storage']],
  ['Casework & joinery', ['joinery', 'casework', 'cabinet', 'millwork', 'counter', 'vanity', 'wardrobe']],
  ['Lighting & electrical', ['light', 'luminaire', 'lamp', 'cable', 'electrical', 'socket', 'switch', 'busbar', 'tray']],
  ['Mechanical & ductwork', ['duct', 'hvac', 'ahu', 'fan coil', 'diffuser', 'damper', 'chiller', 'vrf']],
  ['Plumbing & fire protection', ['pipe', 'piping', 'sprinkler', 'sanitary', 'plumbing', 'wc', 'basin', 'tap', 'fire']],
  ['Wall finishes & coverings', ['paint', 'wallpaper', 'wall covering', 'wallcovering', 'cladding', 'panelling', 'paneling', 'render', 'plaster']],
  ['Walls & partitions', ['partition', 'gypsum', 'plasterboard', 'drywall', 'stud', 'wall', 'block']],
  ['Structure & enclosure (in scope)', ['concrete', 'steel', 'slab', 'beam', 'column', 'facade']],
];

export function guessElement(text: string, system: number): string {
  const idc = system >= 2;
  const t = ' ' + (text || '').toLowerCase() + ' ';
  for (const [el, kws] of idc ? IDC : BDC) if (kws.some((k) => t.includes(k))) return el;
  return 'Other in-scope (explain)';
}

export function matchElement(text: string, system: number): string | null {
  const list = system >= 2 ? IDC_ELEMS : BDC_ELEMS;
  const t = (text || '').trim().toLowerCase();
  if (!t) return null;
  const exact = list.find((e) => e.toLowerCase() === t);
  if (exact) return exact;
  const part = list.find((e) => e.toLowerCase().includes(t) || t.includes(e.toLowerCase().split(' ')[0]));
  return part ?? null;
}

/** Typical service life (years) by keyword, capped at the study period by the caller. Indicative only. */
export function guessLife(text: string, sp: number): number {
  const t = (text || '').toLowerCase();
  const table: [string[], number][] = [
    [['carpet', 'paint', 'coating', 'wallpaper'], 10],
    [['luminaire', 'lighting', 'led', 'lamp'], 15],
    [['membrane', 'waterproof', 'roofing', 'bitumen', 'sealant'], 20],
    [['vinyl', 'lvt', 'ceiling', 'raised floor', 'access floor', 'furniture', 'workstation'], 20],
    [['window', 'glazing', 'curtain wall', 'door'], 30],
    [['tile', 'partition', 'gypsum', 'plasterboard', 'duct', 'pipe'], 25],
  ];
  for (const [k, y] of table) if (k.some((w) => t.includes(w))) return Math.min(y, sp);
  return sp;
}
