// Import a contractor BOQ from Excel (.xlsx) or CSV/TSV/pasted text, map its columns, review the element guesses, add the lines.
import { useMemo, useState } from 'react';
import { useApp } from '../../state/store.ts';
import { Modal } from '../components/common.tsx';
import { leedSys, normUnit, BOQ_UNITS } from '../../engine/rules.ts';
import { guessElement, matchElement, guessLife } from '../../engine/guess.ts';
import { newBoqLine } from '../../state/project.ts';
import { studyPeriod } from '../../engine/calc.ts';
import { parseNum } from '../format.ts';

type Cell = string | number | boolean | Date | null;
const FIELDS = [
  ['item', 'BOQ item / description', ['description', 'item', 'desc', 'material', 'name', 'element name', 'particulars', 'work']],
  ['qty', 'Quantity', ['quantity', 'qty', 'qnty', 'amount', 'volume', 'area']],
  ['unit', 'Unit', ['unit', 'uom', 'u.o.m', 'units']],
  ['elem', 'Element category', ['element', 'category', 'section', 'group', 'trade', 'class']],
  ['kgpu', 'kg per unit', ['kg per', 'kg/unit', 'density', 'weight per', 'kg/m']],
  ['rsl', 'Service life (years)', ['service life', 'life', 'rsl', 'lifespan']],
  ['dist', 'A4 distance (km)', ['distance', 'km', 'transport']],
  ['ref', 'Ref / notes', ['ref', 'code', 'no.', 'item no', 'number', 'note', 'remark']],
] as const;
type Field = (typeof FIELDS)[number][0];

function parseDelimited(text: string): Cell[][] {
  const delim = (text.split('\n')[0].match(/\t/g)?.length ?? 0) > 0 ? '\t' : (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: Cell[][] = [];
  let row: Cell[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
}

function findHeader(rows: Cell[][]): number {
  let best = 0, bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const r = rows[i].map((c) => String(c ?? '').toLowerCase());
    const score = FIELDS.reduce((a, [, , kws]) => a + (r.some((c) => kws.some((k) => c.includes(k))) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

function autoMap(header: Cell[]): Record<Field, number> {
  const h = header.map((c) => String(c ?? '').toLowerCase().trim());
  const used = new Set<number>();
  const out = {} as Record<Field, number>;
  for (const [f, , kws] of FIELDS) {
    let idx = -1;
    for (const k of kws) { idx = h.findIndex((c, j) => !used.has(j) && c.includes(k)); if (idx >= 0) break; }
    out[f] = idx;
    if (idx >= 0) used.add(idx);
  }
  return out;
}

export function BoqImport({ onClose }: { onClose: () => void }) {
  const { project, commit, toast } = useApp();
  const [sheets, setSheets] = useState<{ sheet: string; data: Cell[][] }[]>([]);
  const [si, setSi] = useState(0);
  const [hdr, setHdr] = useState(0);
  const [map, setMap] = useState<Record<Field, number> | null>(null);
  const [paste, setPaste] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [fileName, setFileName] = useState('');
  const sp = project ? studyPeriod(project) : 60;
  const system = project?.setup.system ?? 0;
  const data = sheets[si]?.data ?? [];

  const load = async (f: File) => {
    setFileName(f.name);
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsx } = await import('read-excel-file/universal');
        const all = await readXlsx(await f.arrayBuffer());
        const sh = all.map((s: any) => ({ sheet: s.sheet, data: s.data as Cell[][] })).filter((s) => s.data.length);
        setSheets(sh); setSi(0); pick(sh[0]?.data ?? []);
      } else {
        const d = parseDelimited(await f.text());
        setSheets([{ sheet: f.name, data: d }]); setSi(0); pick(d);
      }
    } catch (e: any) { toast(`This file could not be read: ${e?.message ?? e}`); }
  };
  const pick = (d: Cell[][]) => { const h = findHeader(d); setHdr(h); setMap(autoMap(d[h] ?? [])); };

  const rows = useMemo(() => {
    if (!map) return [];
    const get = (r: Cell[], f: Field) => (map[f] >= 0 ? r[map[f]] : null);
    const out: { item: string; qty: number | null; unit: string; elem: string; elemGuessed: boolean; kgpu: number | null; rsl: number | null; dist: number | null; ref: string }[] = [];
    for (const r of data.slice(hdr + 1)) {
      const item = String(get(r, 'item') ?? '').trim();
      const qtyRaw = get(r, 'qty');
      const qty = typeof qtyRaw === 'number' ? qtyRaw : parseNum(String(qtyRaw ?? ''));
      if (!item || qty == null || qty === 0) continue;
      const unitTxt = normUnit(String(get(r, 'unit') ?? '').toLowerCase().replace('cum', 'm3').replace('sqm', 'm2').replace('rm', 'm').replace('lm', 'm').replace('nos', 'piece'));
      const unit = BOQ_UNITS.includes(unitTxt) ? unitTxt : unitTxt || 'm3';
      const elText = String(get(r, 'elem') ?? '');
      const matched = matchElement(elText, system);
      const elem = matched ?? guessElement(`${elText} ${item}`, system);
      const n = (f: Field) => { const v = get(r, f); return typeof v === 'number' ? v : parseNum(String(v ?? '')); };
      out.push({ item, qty, unit, elem, elemGuessed: !matched, kgpu: n('kgpu'), rsl: n('rsl') ?? guessLife(item, sp), dist: n('dist'), ref: String(get(r, 'ref') ?? '') });
    }
    return out;
  }, [data, hdr, map, system, sp]);
  if (!project) return null;
  const sys = leedSys(project.setup.system);

  const doImport = () => {
    commit((p) => {
      if (mode === 'replace') { p.boq = []; for (const d of p.designs) d.choices = {}; }
      for (const r of rows) p.boq.push(newBoqLine({ ...r, rsl: r.rsl != null ? Math.min(r.rsl, sp) : null, origin: 'excel' }));
    });
    toast(`${rows.length} BOQ lines imported from ${fileName || 'the pasted table'}`);
    onClose();
  };

  return (
    <Modal title="Import a bill of quantities" onClose={onClose} wide
      foot={<>
        <select className="inp" style={{ width: 220 }} value={mode} onChange={(e) => setMode(e.target.value as any)}>
          <option value="append">Add to the current BOQ</option><option value="replace">Replace the current BOQ</option>
        </select>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!rows.length} onClick={doImport}>Import {rows.length} lines</button>
      </>}>
      <div className="col">
        <div className="row wrap">
          <input type="file" accept=".xlsx,.csv,.tsv,.txt" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          <span className="muted small">Excel (.xlsx), CSV or tab-separated text. Or paste cells copied from Excel:</span>
        </div>
        <textarea className="inp" rows={3} placeholder="Paste a table here (with its header row)…" value={paste}
          onChange={(e) => { setPaste(e.target.value); const d = parseDelimited(e.target.value); setSheets([{ sheet: 'Pasted', data: d }]); setSi(0); setFileName(''); pick(d); }} />
        {sheets.length > 0 && map && (
          <>
            <div className="row wrap">
              {sheets.length > 1 && <label className="field"><span className="lab">Sheet</span>
                <select className="inp" value={si} onChange={(e) => { const i = Number(e.target.value); setSi(i); pick(sheets[i].data); }}>
                  {sheets.map((s, i) => <option key={s.sheet} value={i}>{s.sheet}</option>)}
                </select></label>}
              <label className="field"><span className="lab">Header row</span>
                <input className="inp" type="number" min={1} style={{ width: 80 }} value={hdr + 1} onChange={(e) => { const h = Math.max(0, Number(e.target.value) - 1); setHdr(h); setMap(autoMap(data[h] ?? [])); }} />
              </label>
              {FIELDS.map(([f, label]) => (
                <label key={f} className="field"><span className="lab">{label}{f === 'item' || f === 'qty' ? ' *' : ''}</span>
                  <select className="inp" style={{ width: 150 }} value={map[f]} onChange={(e) => setMap({ ...map, [f]: Number(e.target.value) })}>
                    <option value={-1}>(none)</option>
                    {(data[hdr] ?? []).map((c, j) => <option key={j} value={j}>{String(c ?? `Column ${j + 1}`).slice(0, 40)}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="note">Element categories are matched to the {sys.sys} list; where the file has none, they are guessed from the description (shown in italics). Service life is left as given, or set from typical values capped at the study period ({sp} years) – check both before relying on the result.</div>
            <div className="tbl-wrap" style={{ maxHeight: 340 }}>
              <table className="tbl compact">
                <thead><tr><th>#</th><th>Element</th><th>Item</th><th className="num">Qty</th><th>Unit</th><th className="num">kg/unit</th><th className="num">Life</th><th className="num">A4 km</th><th>Ref</th></tr></thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      <td className="idx">{i + 1}</td><td style={{ fontStyle: r.elemGuessed ? 'italic' : 'normal', color: r.elemGuessed ? 'var(--boq-ink)' : undefined }}>{r.elem}</td>
                      <td>{r.item}</td><td className="num">{r.qty?.toLocaleString('en-US')}</td><td>{r.unit}</td><td className="num">{r.kgpu ?? ''}</td>
                      <td className="num">{r.rsl ?? ''}</td><td className="num">{r.dist ?? ''}</td><td>{r.ref}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && <div className="note warn">No line with a description and a quantity. Check the header row and the column mapping.</div>}
          </>
        )}
      </div>
    </Modal>
  );
}
