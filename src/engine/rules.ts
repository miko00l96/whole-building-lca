// Rating-system settings, element lists and material-class rules, ported from the Excel generator (_dev/build_tool.py, v7.1).
import type { SystemIndex } from './types.ts';

export const IND_NAME = [
  'Climate change (GWP)',
  'Ozone depletion',
  'Acidification',
  'Eutrophication, freshwater',
  'Eutrophication, marine',
  'Eutrophication, terrestrial',
  'Photochemical ozone formation',
  'Abiotic depletion, fossil (ADP-fossil)',
];
export const IND_SHORT = ['GWP', 'ODP', 'AP', 'EP-fw', 'EP-m', 'EP-t', 'POCP', 'ADPf'];
export const IND_UNIT = ['kg CO2e', 'kg CFC-11e', 'mol H+ eq', 'kg P eq', 'kg N eq', 'mol N eq', 'kg NMVOC eq', 'MJ'];
export const EP_NAME: Record<string, string> = {
  EPm: 'Eutrophication, marine',
  EPfw: 'Eutrophication, freshwater',
  EPt: 'Eutrophication, terrestrial',
};
export const EP_INDEX: Record<string, number> = { EPfw: 3, EPm: 4, EPt: 5 };
export const EP_UNIT: Record<string, string> = { EPfw: 'kg P eq', EPm: 'kg N eq', EPt: 'mol N eq' };

export const LEED_OPTS = [
  'BD+C v4.1 – whole-building LCA (MRc Option 2)',
  'BD+C v4 – whole-building LCA (MRc Option 4)',
  'ID+C v4.1 – Commercial Interiors (MRc Option 3, interiors LCA)',
  'ID+C v4.1 – Retail (MRc Option 3, interiors LCA)',
  'ID+C v4.1 – Hospitality (MRc Option 3, interiors LCA)',
];

export const BDC_ELEMS = [
  'Foundations & footings',
  'Basement / retaining walls',
  'Structural frame (columns, beams)',
  'Floor slabs & decks',
  'Roof structure',
  'Exterior walls & cladding',
  'Windows & curtain wall',
  'Exterior doors',
  'Roof covering & insulation',
  'Load-bearing interior walls',
  'Stairs',
  'Parking structure / ancillary building',
  'Other in-scope (explain)',
];
export const IDC_ELEMS = [
  'Structure & enclosure (in scope)',
  'Flooring & wall base',
  'Subfloor, screed & access floors',
  'Walls & partitions',
  'Wall finishes & coverings',
  'Ceilings',
  'Doors, frames & hardware',
  'Interior glazing & window treatments',
  'Furniture & furnishings',
  'Casework & joinery',
  'Lighting & electrical',
  'Mechanical & ductwork',
  'Plumbing & fire protection',
  'Other in-scope (explain)',
];

export const SITE_KW = ['asphalt', 'paving', 'pavement', 'paver', 'parking lot', 'surface parking', 'kerb', 'curb', 'landscap', 'hardscape', 'interlock'];
export const FIT_KW = ['interior door', 'internal door', 'false ceiling', 'suspended ceiling', 'ceiling tile', 'carpet', 'raised floor', 'access floor',
  'furniture', 'joinery', 'wallpaper'];

export interface LeedSys {
  sys: 'BD+C' | 'ID+C';
  ver: 'v4.1' | 'v4';
  type: string;
  minSp: number;
  label: string; // LEED BD+C v4.1
  cover: string;
  opt: string; // Option 2 / 4 / 3
  optName: string;
  credit: string;
  title: string;
  hdr: string;
  scope: string;
  areaLabel: string;
  ptsLabel: string;
  elems: string[];
}

export function leedSys(i: SystemIndex | number): LeedSys {
  const o = LEED_OPTS[i] ?? LEED_OPTS[0];
  const idc = o.startsWith('ID+C');
  const sys = idc ? 'ID+C' : 'BD+C';
  const ver = idc ? 'v4.1' : o.includes('v4.1') ? 'v4.1' : 'v4';
  const type = idc ? o.slice(o.indexOf('– ') + 2, o.indexOf(' (')) : '';
  const opt = idc ? 'Option 3' : ver === 'v4' ? 'Option 4' : 'Option 2';
  const label = `LEED ${sys} ${ver}`;
  return {
    sys,
    ver,
    type,
    minSp: idc ? 20 : 60,
    label,
    cover: label + (idc ? '  ·  ' + type : ''),
    opt,
    optName: idc ? 'Option 3, building interiors life-cycle assessment' : `${opt}, whole-building life-cycle assessment`,
    credit: idc ? 'Interiors Life-Cycle Impact Reduction' : 'Building Life-Cycle Impact Reduction',
    title: idc ? 'BUILDING INTERIORS LIFE CYCLE ASSESSMENT' : 'BUILDING LIFE CYCLE ASSESSMENT',
    hdr: idc ? 'Building Interiors Life Cycle Assessment Analysis Report' : 'Building Life Cycle Assessment Analysis Report',
    scope: idc ? 'interior scope of work' : 'structure + enclosure',
    areaLabel: idc ? 'Floor area (scope of work)' : 'Gross floor area',
    ptsLabel: `LEED ${ver} ${opt.toUpperCase()}`,
    elems: idc ? IDC_ELEMS : BDC_ELEMS,
  };
}

// ------------------------------------------------------------------------------------------------ material classes
export const CLASSES = [
  'Concrete', 'Cement, mortar & plaster', 'Masonry & blocks', 'Reinforcing steel', 'Structural steel & metal sheet', 'Aluminium',
  'Other metals', 'Timber & wood', 'Insulation', 'Glass & glazing', 'Gypsum & boards', 'Roofing & waterproofing',
  'Stone, ceramics & aggregates', 'Plastics & sealants', 'Paints, coatings & wall coverings', 'Ceramic & stone tiles', 'Carpet & textiles',
  'Resilient & resin flooring', 'Ceiling & access floor systems', 'Doors & hardware', 'Furniture & casework', 'Electrical & lighting',
  'Mechanical, plumbing & fire', 'Other',
];
const CARPET_KW = ['carpet', 'tufted', 'needle felt', 'needlefelt', 'needled', 'upholster', 'textile floor', 'textile wall', ' rug ', 'kugelgarn'];
const ACCESS_KW = ['raised floor', 'access floor', 'hollow floor', 'cavity floor'];
export const RULES: [string, string[]][] = [
  ['Structural steel & metal sheet', ['metal profile']],
  ['Glass & glazing', ['glazed partition', 'glass partition']],
  ['Ceiling & access floor systems', ['ceiling', ...ACCESS_KW, 'acoustic panel', 'acoustic tile', 'baffle', 'glass reinforced gypsum', ' grg ']],
  ['Carpet & textiles', CARPET_KW],
  ['Resilient & resin flooring', ['vinyl floor', 'vinyl tile', 'luxury vinyl', ' lvt', 'linoleum', 'rubber floor', 'pvc floor', 'resilient',
    'floor covering', 'resin floor', 'floor coating', 'floor guard', 'epoxy floor', 'epobat', 'epopark']],
  ['Paints, coatings & wall coverings', ['wall coating', 'textured coating', 'paint primer', 'paint system', '(paint)', 'protective coating',
    'wallcovering', 'wall covering']],
  ['Doors & hardware', [' door', 'doorset', 'door set', 'hinge', 'lockset', 'ironmongery']],
  ['Furniture & casework', ['furniture', 'chair', ' desk', 'workstation', ' table', 'cabinet', 'cupboard', 'wardrobe', 'shelving', 'sofa',
    'seating', 'casework', 'credenza', 'locker']],
  ['Gypsum & boards', ['gypsum', 'gyproc', 'gypfine', 'mada plus', 'sheathing board', 'plasterboard', 'plaster board', 'drywall', 'cement board',
    'fibre cement', 'fiber cement', 'calcium silicate']],
  ['Concrete', ['ready mix', 'ready-mix', 'readymix', 'rcc c', 'roller compacted', 'c16/', 'c20/', 'c25/', 'c30/', 'c32/', 'c35/', 'c40/', 'c45/',
    'c50/', 'c55/', 'c60/', 'c65/', 'c70/', 'c80/', 'c85/', 'c90/', 'c105/']],
  ['Roofing & waterproofing', ['waterproof', 'membrane', 'bitumen', 'bituminous', 'roofing', 'epdm', 'damp proof', 'damp-proof']],
  ['Cement, mortar & plaster', ['mortar', 'plaster', 'render', 'grout', 'screed', 'levelling', 'adhesive', 'glue', 'skim coat', 'base coat',
    'cementitious', 'cement', 'lime ', 'cem i', 'bloc fix', 'weberbloc']],
  ['Insulation', ['insulation', 'insulating', 'etics', 'rock wool', 'rockwool', 'stone wool', 'mineral wool', 'glass wool', 'glasswool',
    'polystyrene', 'phenolic foam', 'polyisocyanurate', 'foam glass', 'cellular glass', 'pur foam', 'pir ']],
  ['Masonry & blocks', ['block', 'brick', 'masonry', 'cmu', 'autoclaved aerated', 'aac ', 'kerb', 'paver', 'interlock']],
  ['Concrete', ['concrete', ' mpa', 'hollow core', 'slab', 'precast', 'shotcrete', 'blinding', 'ggbs', 'ggbfs']],
  ['Reinforcing steel', ['rebar', 'reinforcing', 'reinforcement steel', 'wire rod', 'steel bar', 'deformed bar', 'welded wire', 'welded mesh']],
  ['Electrical & lighting', ['cable', 'wire', 'busbar', 'luminaire', ' lamp', ' led ', 'lighting', 'light fitting', 'switch', 'socket', 'conduit',
    'electrical', 'downlight']],
  ['Mechanical, plumbing & fire', [' duct', 'pipe', 'piping', 'valve', 'sprinkler', 'fire suppression', 'radiator', 'boiler', ' pump', 'fan coil',
    'air handling', 'ventilation', 'hvac', 'sanitary', 'toilet', 'washbasin', 'wash basin', 'faucet', 'shower', 'urinal', 'mixer', 'cistern',
    ' wc ', 'tapware']],
  ['Aluminium', ['aluminium', 'aluminum']],
  ['Structural steel & metal sheet', ['steel', 'sections', 'hollow section', 'purlin', 'metal deck', 'sheet pile']],
  ['Other metals', ['copper', 'zinc', 'brass', 'titanium', 'nickel', 'lead sheet']],
  ['Timber & wood', ['timber', 'wood', 'plywood', 'osb', 'glulam', 'cross laminated', 'lumber', 'mdf', 'chipboard', 'particle board', 'parquet',
    'laminate floor', 'laminate board', 'laminate panel', ' hpl', 'high-pressure laminate', 'high pressure laminate', 'veneer']],
  ['Glass & glazing', ['glass', 'glazing', 'window', 'curtain wall']],
  ['Ceramic & stone tiles', ['porcelain', 'stoneware', ' tile']],
  ['Stone, ceramics & aggregates', ['stone', 'granite', 'marble', 'ceramic', 'aggregate', 'gravel', 'sand', 'clinker']],
  ['Paints, coatings & wall coverings', ['paint', 'primer', 'lacquer', 'varnish', 'coating', 'stain ']],
  ['Plastics & sealants', ['grp ', 'pvc', 'polyethylene', 'polypropylene', 'hdpe', 'plastic', 'sealant', 'silicone', 'epoxy', 'resin', 'polyurethane']],
];

/** Keyword class of a text (first rule that matches; the text is searched with a space before and after). */
export function kwClass(text: string, unit = ''): string {
  const t = ' ' + (text || '').toLowerCase() + ' ';
  for (const [cls, kws] of RULES) if (kws.some((k) => t.includes(k))) return cls;
  return (unit || '').trim() === 'm3' ? 'Concrete' : 'Other';
}

/** Product part of an EPD name (before " – manufacturer"), without a leading "CHECK – ". */
export function epdProduct(name: string): string {
  const n = (name || '').replace('CHECK – ', '');
  const i = n.indexOf(' – ');
  return i >= 0 ? n.slice(0, i) : n;
}

/** Readable product name: no 'CHECK – ', no ' [registration no.]', no IDEMAT code. */
export function shortName(mat: string, src: string): string {
  let n = (mat || '').replace('CHECK – ', '');
  const b = n.indexOf(' [');
  if (b >= 0) n = n.slice(0, b);
  if (src === 'IDEMAT') {
    const s = n.indexOf(' ');
    n = s >= 0 ? n.slice(s + 1) : n;
  }
  return n;
}

export const BOQ_UNITS = ['kg', 't', 'm3', 'm2', 'm', 'piece'];
/** Unit spellings treated as the same unit (the Excel compares the literal text). */
export function normUnit(u: string | null | undefined): string {
  const s = (u ?? '').trim();
  const l = s.toLowerCase();
  if (l === 'm³') return 'm3';
  if (l === 'm²') return 'm2';
  if (['p', 'pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'item', 'nr', 'no', 'ea', 'each'].includes(l)) return 'piece';
  if (l === 'tonne' || l === 'ton' || l === 'tonnes') return 't';
  return s;
}

/** Typical density (kg/m3) by material keyword, used to pre-fill kg per unit for IFC and imported BOQ lines. */
export const DENSITY: [string[], number][] = [
  [['air', 'cavity', 'void', 'gap'], 0],
  [['rebar', 'reinforc'], 7850],
  [['steel', 'iron', 'metal deck', 'stud'], 7850],
  [['alumin'], 2700],
  [['copper'], 8960],
  [['zinc'], 7140],
  [['lightweight concrete', 'aerated', 'aac', 'autoclaved'], 600],
  [['block', 'cmu'], 1400],
  [['brick'], 1800],
  [['screed', 'mortar', 'render', 'plaster'], 1800],
  [['concrete', 'cement', 'beton'], 2400],
  [['glass wool', 'glasswool', 'mineral wool', 'rock wool', 'rockwool', 'stone wool'], 40],
  [['eps', 'expanded polystyrene'], 20],
  [['xps', 'extruded polystyrene'], 35],
  [['pir', 'pur', 'polyurethane', 'polyiso', 'phenolic'], 32],
  [['insulation'], 35],
  [['clt', 'cross laminated', 'glulam'], 470],
  [['plywood', 'osb', 'mdf', 'chipboard', 'particle'], 600],
  [['timber', 'wood', 'lumber'], 500],
  [['gypsum', 'plasterboard', 'drywall'], 800],
  [['glass', 'glazing'], 2500],
  [['granite', 'marble', 'stone'], 2700],
  [['ceramic', 'porcelain', 'tile'], 2000],
  [['bitumen', 'asphalt'], 1100],
  [['gravel', 'aggregate'], 1700],
  [['sand'], 1600],
  [['soil', 'earth'], 1800],
  [['pvc'], 1400],
  [['polyethylene', 'hdpe', 'membrane'], 950],
];

// Short keywords match at the start of a word only ('air' is not in 'stair', 'eps' is not in 'steps'); longer ones anywhere.
const DENSITY_RX: [RegExp[], number][] = DENSITY.map(([kws, d]) => [kws.map((k) => new RegExp(k.length <= 4 ? `(^|[^a-z])${k}` : k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), d]);

export function densityFor(text: string): number | null {
  const t = (text || '').toLowerCase();
  for (const [rx, d] of DENSITY_RX) if (rx.some((r) => r.test(t))) return d;
  return null;
}
