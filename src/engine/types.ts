// Core data model of Whole building LCA (web). Mirrors the Excel tool (v7.1): Setup, BOQ, Baseline / Proposed bills of
// materials, Results. Dataset references are by library + exact name, exactly like the Excel drop-downs and the
// `--project` JSON format, so projects stay readable and portable.

export type Src = 'EPD' | 'IDEMAT' | 'ÖKOBAUDAT' | 'ecoinvent';
export const SOURCES: Src[] = ['EPD', 'ÖKOBAUDAT', 'ecoinvent', 'IDEMAT'];

/** Eight EN 15804+A2 core indicators, always in this order. */
export const IND = ['GWP', 'ODP', 'AP', 'EPfw', 'EPm', 'EPt', 'POCP', 'ADPf'] as const;
export type IndKey = (typeof IND)[number];
export type Ind8 = number[]; // length 8, IND order
export type Ind8N = (number | null)[]; // as stored in a library (null = not declared)

export interface DsRef {
  src: Src;
  n: string;
}

/** One dataset of any library, normalised for the engine. Values per ONE declared unit. */
export interface Dataset {
  src: Src;
  n: string; // exact name (unique within its library)
  u: string; // declared unit as in the library (kg, m3, m2, m, piece, p, tkm, kWh, MJ ...)
  kg: number | null; // kg per declared unit (null / 0 = not given)
  a: Ind8N; // A1-A3 (per tkm / kWh / kg for transport, grid, end-of-life rows)
  c: Ind8N | null; // C1-C4 total (EPD, ÖKOBAUDAT); null = not declared → end-of-life process on the line is used
  dGwp: number | null; // module D GWP (EPD AA, ÖKOBAUDAT AN); reported separately
  d?: Ind8N | null; // full module D (ÖKOBAUDAT), display only
  cls: string; // material class (24 classes)
  use?: 'material' | 'transport' | 'eol' | 'grid'; // ecoinvent rows
  // metadata (display, QA)
  geo?: string; // country / geography
  valid?: string | null; // EPD valid until (ISO date)
  vy?: number | null; // ÖKOBAUDAT valid-until year
  std?: string; // EN 15804+A2 / +A1
  gwpi?: string; // GWP indicator entered in the EPD row
  reg?: string;
  prog?: string;
  maker?: string;
  owner?: string;
  type?: string; // dataset type (generic, specific, average ...)
  cat?: string; // ÖKOBAUDAT category or IDEMAT group
  mods?: string; // ÖKOBAUDAT modules declared
  warn?: string; // ÖKOBAUDAT import warnings
  note?: string;
  desc?: string;
  url?: string;
  id?: string;
  ref?: string; // reference year
  bg?: string; // background database
  gwpTot?: number | null;
  gwpBio?: number | null;
}

export type SystemIndex = 0 | 1 | 2 | 3 | 4;
export type EpKey = 'EPm' | 'EPfw' | 'EPt';
export type A4EolDb = 'All databases' | 'ecoinvent' | 'IDEMAT' | 'ÖKOBAUDAT';

export interface Setup {
  system: SystemIndex; // index in LEED_OPTS
  projectName: string;
  location: string;
  area: number | null; // GFA (BD+C) or floor area of the scope of work (ID+C)
  studyPeriod: number | null; // null = LEED minimum (60 / 20)
  truck: DsRef | null; // default truck: A4 default on every line and C2 where the end-of-life process is used
  c2km: number | null; // distance to waste site (km)
  assessmentDate: string | null; // ISO date; null = today
  epIndicator: EpKey; // eutrophication indicator reported for LEED
  assessor: string;
  notes: string;
  floors: string;
  a4EolDb: A4EolDb;
  grid: string; // B6 grid label
  kwhBase: number | null;
  kwhProp: number | null;
  customGrid: (number | null)[];
  customGridSource: string;
  company: string;
  client: string;
  buildingUse: string;
  reportRef: string;
  extraRecs: string;
  logo?: string | null; // data URL of the company logo (report cover)
}

export interface IfcLink {
  file: string;
  parts: { gid: string; q: number }[]; // element GlobalId and its share of the line quantity (BOQ unit)
  group?: string; // take-off group the line was made from
  layer?: { name: string; t: number } | null; // one material layer of the elements (thickness in m)
  dens?: number | null; // density used for kg / t lines (kg/m3)
}

export interface BoqLine {
  id: string;
  elem: string;
  item: string;
  qty: number | null;
  unit: string;
  kgpu: number | null; // kg per BOQ unit (needed when a dataset uses another unit)
  rsl: number | null; // service life (years)
  dist: number | null; // A4 distance (km)
  ref: string;
  epx: DsRef | null; // eutrophication fallback dataset
  ifc?: IfcLink | null;
  origin?: 'manual' | 'excel' | 'ifc' | 'ai' | 'sample';
  unc?: number | null; // quantity uncertainty (± fraction, Monte Carlo), optional per line
}

/** Material choice of one design for one BOQ line. Keys left out follow the BOQ (green italics in Excel). */
export interface Choice {
  src?: Src | '';
  cls?: string; // optional class filter for the picker
  mat?: string | null; // dataset name in `src`
  eol?: string | null; // end-of-life process (IDEMAT, ecoinvent or ÖKOBAUDAT, per kg)
  reuse?: boolean; // reused / salvaged (zeroes A1-A3 of the line)
  modd?: string | null; // module D process (IDEMAT, per kg)
  // overrides of BOQ values for this design only
  elem?: string;
  desc?: string;
  pair?: string;
  qty?: number | null;
  kgin?: number | null;
  rsl?: number | null;
  a4?: string | null;
  dist?: number | null;
}

/** A line that exists in one design only (not on the BOQ). */
export interface ExtraLine extends Choice {
  id: string;
  unit?: string; // BOQ-style unit of the typed quantity (informative)
}

export interface Design {
  id: string;
  name: string;
  kind: 'baseline' | 'proposed' | 'option';
  choices: Record<string, Choice>;
  extra: ExtraLine[];
  note?: string;
}

export interface Project {
  schema: 'wblca-project@1';
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  setup: Setup;
  boq: BoqLine[];
  designs: Design[]; // [0] baseline, [1] proposed, then options
  ifcFile?: string | null;
  mc?: McSettings;
}

export interface McSettings {
  runs: number;
  sdQty: number; // default quantity uncertainty (fraction, 1 sigma)
  sdLife: number; // service life uncertainty (fraction)
  sdDist: number; // transport distance uncertainty
  sdSrc: Record<string, number>; // data uncertainty per source kind
  seed: number;
}

// ------------------------------------------------------------------------------------------------ results

export type Stage = 'A13' | 'A4' | 'B45' | 'C14';

export interface LineResult {
  key: string; // BOQ line id or extra line id
  pos: number; // 1-based line number (BOQ order, then extra lines)
  isExtra: boolean;
  active: boolean; // a material is chosen
  // resolved inputs
  elem: string;
  desc: string;
  pair: string;
  src: Src | '';
  mat: string;
  unit: string; // dataset unit ('?' when the name is not found)
  qty: number; // in dataset unit
  qtyFromBoq: boolean;
  kgpu: number;
  mass: number; // t
  reuse: boolean;
  rsl: number;
  repl: number;
  a4: string;
  dist: number;
  eol: string;
  modd: string;
  ds: Dataset | null;
  found: boolean;
  hasC: 0 | 1 | 2;
  f: Ind8; // factors per declared unit (after EP fallback)
  raw: Ind8;
  stages: Record<Stage, Ind8>;
  tot: Ind8;
  modD: number;
  epgap: boolean;
  epx: boolean;
  qaraw: string;
  adv: string;
  qa: string;
  stat: string; // ✓ / ℹ / ⚠ n / ''
  srcchk: string;
  pdelta: number | null; // pair change vs baseline (t), first line of a pair only
  cls: string; // class of the dataset
  label: string;
  // per-cycle breakdown for the Monte Carlo: A1-A3 per cycle (not zeroed by reuse), A4 and C per cycle
  cycle: { a13: Ind8; a4: Ind8; c: Ind8 };
}

export interface DesignResult {
  designId: string;
  name: string;
  kind: Design['kind'];
  lines: LineResult[];
  stage: Record<Stage, Ind8>;
  total: Ind8;
  modD: number;
  qaCount: number;
  infoCount: number;
  okCount: number;
  cov: number; // share of used lines with LCA data
  epcov: number;
  epxCount: number;
  srcShare: Record<Src, number>; // share of GWP per data source
  diffSrc: number;
  reuseCount: number;
  expiredCount: number;
  noEolCount: number;
  epdRows: number;
  obdRows: number;
  eiRows: number;
  b6: Ind8; // over the study period
}

export interface PathResult {
  label: string;
  points: string; // shown
  requirement: string;
  met: boolean;
}

export interface LeedResult {
  sys: 'BD+C' | 'ID+C';
  ver: 'v4.1' | 'v4';
  six: { name: string; ind: string; base: number; prop: number; change: number | null; plaus: string }[];
  change: (number | null)[]; // all eight indicators (prop vs base)
  red5: number;
  red10: number;
  other10: number;
  maxIncrease: number | null;
  noneUp: string; // C31: YES / NO / NO – incomplete
  reuse: boolean;
  spOk: boolean;
  paths: PathResult[];
  ptsBdc41: number;
  ptsBdc4: number;
  ptsIdc: number;
  points: number;
  pathLabel: string;
  otherPts: string;
  status: string;
  exemplary41: boolean;
  exemplary4: boolean;
  higherCount: number;
}
