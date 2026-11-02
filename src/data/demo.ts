// Public example project: a four-storey office built with ÖKOBAUDAT datasets only, so the app can be explored without the
// private data pack. Quantities are illustrative.
import type { Choice, Project } from '../engine/types.ts';
import { newProject, uid } from '../state/project.ts';

const O = (n: string): Choice => ({ src: 'ÖKOBAUDAT', mat: n, reuse: false });
const CON_B = 'Concrete C30/37 [average, DE] OBD-b3fb0ba9';
const CON_P = 'Beton C30/37 XC4 XF1 XA1 F3 16 M ECOPact, Rezept Nummer DA5234-DNFS Version 1, Transportbetonwerk Stadtallendorf, Germany [specific, DE] OBD-03ffdb90';
const REB_B = 'Reinforcement steel wire [generic, DE] OBD-f6861618';
const REB_P = 'Reinforcing Steel Coils & Bars [average, DE] OBD-b14811fa';
const BLK_B = 'Expanded clay concrete block outer wall [generic, DE] OBD-23fc083c';
const BLK_P = 'Lightweight concrete block from 100% natural pumice [generic, DE] OBD-a1deced7';
const XPS = 'Extruded polystyrene (XPS) [generic, DE] OBD-c4ddfdbc';
const MW = 'Mineral wool (facade insulation) [generic, DE] OBD-50d421e2';
const CW_B = 'Curtain walling - VFF - Curtain walling in aluminium profiles [average, RER] OBD-740f5a3b';
const CW_P = 'Curtain walling - VFF - Curtain walling in steel profiles [average, RER] OBD-5106158c';
const BIT_B = 'Bitumen sheets PYE PV 200 S5 (non-slated) [generic, DE] OBD-c984526a';
const BIT_P = 'Bitumen sheets G 200 S4 [generic, DE] OBD-27ccffb8';
export const OBD_TRUCK = 'Truck-trailer [generic, DE] OBD-330f8948';

export function publicDemo(): Project {
  const p = newProject(0, 'EXAMPLE – 4-storey office (ÖKOBAUDAT data only)');
  Object.assign(p.setup, {
    location: 'Cairo, Egypt', area: 6000, floors: '4 (G + 3)', assessor: 'Example', company: 'Your company', client: 'Example client',
    buildingUse: 'Office', reportRef: 'LCA-EX-01 · Rev 0', truck: { src: 'ÖKOBAUDAT', n: OBD_TRUCK }, a4EolDb: 'ÖKOBAUDAT',
    grid: 'Custom factors', kwhBase: null, kwhProp: null,
    notes: 'Illustrative example built from ÖKOBAUDAT generic, average and product datasets (European data). Load the private data pack for regional EPDs.',
  });
  const rows: [string, string, number, string, number, number, string, string][] = [
    ['Foundations & footings', 'Raft and pile caps concrete', 1050, 'm3', 60, 30, CON_B, CON_P],
    ['Foundations & footings', 'Foundation rebar', 95, 't', 60, 300, REB_B, REB_P],
    ['Structural frame (columns, beams)', 'Columns and beams concrete', 640, 'm3', 60, 30, CON_B, CON_P],
    ['Structural frame (columns, beams)', 'Frame rebar', 85, 't', 60, 300, REB_B, REB_P],
    ['Floor slabs & decks', 'Slab concrete', 1500, 'm3', 60, 30, CON_B, CON_P],
    ['Floor slabs & decks', 'Slab rebar', 140, 't', 60, 300, REB_B, REB_P],
    ['Exterior walls & cladding', 'Block walls, outer leaf', 380, 'm3', 60, 60, BLK_B, BLK_P],
    ['Exterior walls & cladding', 'Wall insulation 100 mm', 210, 'm3', 60, 400, XPS, MW],
    ['Windows & curtain wall', 'Curtain wall', 1650, 'm2', 40, 800, CW_B, CW_P],
    ['Roof covering & insulation', 'Roof insulation 120 mm', 180, 'm3', 60, 400, XPS, XPS],
    ['Roof covering & insulation', 'Roofing membrane, two layers', 3000, 'm2', 25, 600, BIT_B, BIT_P],
  ];
  const [base, prop] = p.designs;
  for (const [elem, item, qty, unit, rsl, dist, b, pr] of rows) {
    const id = uid('L');
    p.boq.push({ id, elem, item, qty, unit, kgpu: null, rsl, dist, ref: '', epx: null, origin: 'sample' });
    base.choices[id] = O(b);
    prop.choices[id] = O(pr);
  }
  return p;
}
