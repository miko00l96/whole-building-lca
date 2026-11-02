// Libraries in memory: EPD, IDEMAT, ÖKOBAUDAT, ecoinvent. Name lookups follow the Excel MATCH() order.
import type { A4EolDb, Dataset, Src } from './types.ts';

export interface GridEntry {
  label: string;
  src: Src;
  n: string;
}

export interface Lists {
  idematTransport: string[];
  idematEol: string[];
  idematModuleD: string[];
  grid: GridEntry[];
  epMarineGwpMin: number;
}

export interface LibraryInfo {
  src: Src;
  title: string;
  count: number;
  extracted?: string;
  origin: 'public' | 'private';
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr8 = (v: unknown): (number | null)[] => {
  const a = Array.isArray(v) ? v : [];
  return Array.from({ length: 8 }, (_, i) => num(a[i]));
};

/** Convert one raw record of a library file (tools/extract_master.py format) into a Dataset. */
export function normalise(src: Src, r: Record<string, any>): Dataset {
  switch (src) {
    case 'EPD':
      return {
        src, n: r.n, u: r.u ?? '', kg: num(r.kg), a: arr8(r.a), c: Array.isArray(r.c) ? arr8(r.c) : null, dGwp: num(r.d), cls: r.cls ?? 'Other',
        geo: r.geo, valid: r.valid ?? null, std: r.std, gwpi: r.gwpi, reg: r.reg, prog: r.prog, maker: r.maker, note: r.note, desc: r.desc,
        url: r.url,
      };
    case 'IDEMAT':
      return { src, n: r.n, u: r.u ?? '', kg: null, a: arr8(r.a), c: null, dGwp: null, cls: r.cls ?? 'Other', cat: r.g, id: r.id, geo: 'Global' };
    case 'ÖKOBAUDAT':
      return {
        src, n: r.n, u: r.u ?? '', kg: num(r.kg), a: arr8(r.a), c: Array.isArray(r.c) ? arr8(r.c) : null,
        dGwp: Array.isArray(r.d) ? num(r.d[0]) : null, d: Array.isArray(r.d) ? arr8(r.d) : null, cls: r.cls ?? 'Other', cat: r.cat,
        geo: r.geo, vy: num(r.vy), std: r.std, reg: r.reg, prog: r.prog, owner: r.owner, type: r.type, mods: r.mods, warn: r.warn,
        note: r.info, url: r.url, id: r.id, ref: r.ry != null ? String(r.ry) : undefined, bg: r.bg, gwpTot: num(r.aTot), gwpBio: num(r.aBio),
        use: r.use === 'transport' ? 'transport' : undefined,
      };
    case 'ecoinvent':
      return {
        src, n: r.n, u: r.u ?? '', kg: num(r.kg), a: arr8(r.a), c: null, dGwp: null, cls: r.cls || 'Other', use: r.use, geo: r.geo,
        type: r.type, note: r.note, id: r.id, cat: r.act, gwpTot: num(r.tot), gwpBio: num(r.bio), desc: r.prod,
      };
  }
}

export class Library {
  bySrc: Record<Src, Dataset[]> = { EPD: [], IDEMAT: [], 'ÖKOBAUDAT': [], ecoinvent: [] };
  private maps: Record<Src, Map<string, Dataset>> = {
    EPD: new Map(), IDEMAT: new Map(), 'ÖKOBAUDAT': new Map(), ecoinvent: new Map(),
  };
  info: Partial<Record<Src, LibraryInfo>> = {};
  lists: Lists = { idematTransport: [], idematEol: [], idematModuleD: [], grid: [], epMarineGwpMin: 1e-5 };
  version = 0; // bumped on every change (memo key)

  set(src: Src, rows: Dataset[], info: LibraryInfo) {
    this.bySrc[src] = rows;
    const m = new Map<string, Dataset>();
    for (const d of rows) if (!m.has(d.n)) m.set(d.n, d);
    this.maps[src] = m;
    this.info[src] = info;
    this.version++;
  }

  clear(src: Src) {
    this.bySrc[src] = [];
    this.maps[src] = new Map();
    delete this.info[src];
    this.version++;
  }

  has(src: Src) {
    return this.bySrc[src].length > 0;
  }

  get(src: Src | '' | undefined, name: string | null | undefined): Dataset | null {
    if (!src || !name) return null;
    return this.maps[src].get(name) ?? null;
  }

  /** Material dataset as the Excel BoM resolves it: src EPD / ÖKOBAUDAT / ecoinvent, anything else = IDEMAT. */
  material(src: Src | '' | undefined, name: string | null | undefined): Dataset | null {
    if (!name) return null;
    if (src === 'EPD' || src === 'ÖKOBAUDAT' || src === 'ecoinvent') return this.get(src, name);
    return this.get('IDEMAT', name);
  }

  /** A4 transport per tkm: IDEMAT first, then ecoinvent (tD / tE), then the ÖKOBAUDAT transport datasets (web only). */
  transport(name: string | null | undefined): Dataset | null {
    if (!name) return null;
    const o = this.maps['ÖKOBAUDAT'].get(name);
    return this.maps.IDEMAT.get(name) ?? this.maps.ecoinvent.get(name) ?? (o && o.use === 'transport' ? o : null);
  }

  /** End of life per kg: IDEMAT, then ecoinvent, then ÖKOBAUDAT (eD / eE / eO). */
  eol(name: string | null | undefined): Dataset | null {
    if (!name) return null;
    return this.maps.IDEMAT.get(name) ?? this.maps.ecoinvent.get(name) ?? this.maps['ÖKOBAUDAT'].get(name) ?? null;
  }

  /** Any library, Excel order of the BOQ EP fallback lookup: ecoinvent, ÖKOBAUDAT, EPD, IDEMAT. */
  anyName(name: string | null | undefined): Dataset | null {
    if (!name) return null;
    return this.maps.ecoinvent.get(name) ?? this.maps['ÖKOBAUDAT'].get(name) ?? this.maps.EPD.get(name) ?? this.maps.IDEMAT.get(name) ?? null;
  }

  /** Material rows of a library (ecoinvent: material use only). */
  materials(src: Src): Dataset[] {
    const rows = this.bySrc[src];
    return src === 'ecoinvent' ? rows.filter((d) => d.use === 'material') : src === 'ÖKOBAUDAT' ? rows.filter((d) => d.use !== 'transport') : rows;
  }

  transportList(db: A4EolDb): Dataset[] {
    const out: Dataset[] = [];
    if (db === 'All databases' || db === 'ecoinvent') out.push(...this.bySrc.ecoinvent.filter((d) => d.use === 'transport'));
    if (db === 'All databases' || db === 'IDEMAT')
      for (const n of this.lists.idematTransport) { const d = this.maps.IDEMAT.get(n); if (d) out.push(d); }
    if (db === 'All databases' || db === 'ÖKOBAUDAT') out.push(...this.bySrc['ÖKOBAUDAT'].filter((d) => d.use === 'transport'));
    return out;
  }

  eolList(db: A4EolDb): Dataset[] {
    const out: Dataset[] = [];
    if (db === 'All databases' || db === 'ecoinvent') out.push(...this.bySrc.ecoinvent.filter((d) => d.use === 'eol'));
    if (db === 'All databases' || db === 'ÖKOBAUDAT')
      out.push(...this.bySrc['ÖKOBAUDAT'].filter((d) => (d.cat ?? '').startsWith('End of Life') && d.u === 'kg'));
    if (db === 'All databases' || db === 'IDEMAT')
      for (const n of this.lists.idematEol) { const d = this.maps.IDEMAT.get(n); if (d) out.push(d); }
    return out;
  }

  moduleDList(): Dataset[] {
    return this.lists.idematModuleD.map((n) => this.maps.IDEMAT.get(n)).filter((d): d is Dataset => !!d);
  }

  gridEntries(): GridEntry[] {
    return this.lists.grid.filter((g) => !!this.get(g.src, g.n));
  }

  /** kg per declared unit as the Excel uses it for display (kg unit = 1). */
  static kgOf(d: Dataset): number | null {
    if (d.kg && d.kg > 0) return d.kg;
    if (d.u === 'kg') return 1;
    if (d.u === 't') return 1000;
    return null;
  }

  /** Validity as a year-comparable date string (EPD date, ÖKOBAUDAT year-end). */
  static validUntil(d: Dataset): string | null {
    if (d.valid) return d.valid;
    if (d.vy) return `${d.vy}-12-31`;
    return null;
  }
}
