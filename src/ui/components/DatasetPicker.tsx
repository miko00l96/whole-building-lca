// Material picker: one search across the libraries, filters, smart suggestions from the BOQ text, and a product card preview.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFloating, offset, flip, shift, autoUpdate, FloatingPortal, size } from '@floating-ui/react';
import { Library } from '../../engine/library.ts';
import { CLASSES, kwClass, normUnit, shortName } from '../../engine/rules.ts';
import type { Dataset, Src } from '../../engine/types.ts';
import { lib, getSearch, datasetByKey } from '../../data/libraryStore.ts';
import { sig } from '../format.ts';
import { DatasetCard, isExpired } from './DatasetCard.tsx';
import { SrcBadge } from './common.tsx';
import { Icon } from '../icons.tsx';

export interface PickerProps {
  src: Src | '' | undefined;
  value: string | null | undefined;
  onPick: (src: Src, name: string) => void;
  boqText?: string; // BOQ description, for suggestions
  boqUnit?: string;
  cls?: string;
  placeholder?: string;
  sources?: Src[]; // allowed sources (default all with data)
  width?: number | string;
  autoOpen?: boolean;
  onClose?: () => void;
}

const STOP = new Set(['and', 'the', 'for', 'with', 'both', 'faces', 'of', 'in', 'to', 'a', 'mm', 'cm', 'm', 'm2', 'm3', 'kg', 'per', 'all', 'new', 'type']);

export function suggestQuery(text: string): string {
  return (text || '').toLowerCase().replace(/[()+,/×*]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d/.test(w)).slice(0, 4).join(' ');
}

export function findDatasets(opts: { q: string; srcs: Src[]; cls: string; unit: string; hideExpired: boolean; geo: string; limit?: number; mode?: 'AND' | 'OR' }): Dataset[] {
  const { q, srcs, cls, unit, hideExpired, geo } = opts;
  const limit = opts.limit ?? 150;
  const ok = (d: Dataset) =>
    srcs.includes(d.src) && (cls === 'All' || d.cls === cls) && (!unit || normUnit(d.u) === normUnit(unit) || (Library.kgOf(d) ?? 0) > 0 && unit === 'kg')
    && (!hideExpired || !isExpired(d)) && (!geo || (d.geo ?? '').toUpperCase().includes(geo.toUpperCase())) && (d.a[0] ?? 0) > 0;
  let rows: Dataset[];
  if (q.trim()) {
    const hits = getSearch().search(q, { combineWith: opts.mode ?? 'AND' });
    rows = [];
    for (const h of hits) {
      const d = datasetByKey(h.id as string);
      if (d && ok(d)) rows.push(d);
      if (rows.length >= limit) break;
    }
    if (!rows.length && (opts.mode ?? 'AND') === 'AND') return findDatasets({ ...opts, mode: 'OR' });
  } else {
    rows = [];
    for (const s of srcs) for (const d of lib.materials(s)) if (ok(d)) rows.push(d);
    rows.sort((a, b) => gwpPerKg(a) - gwpPerKg(b));
    rows = rows.slice(0, limit);
  }
  return rows;
}

export const gwpPerKg = (d: Dataset) => { const k = Library.kgOf(d); return k ? (d.a[0] ?? 0) / k : 1e9 + (d.a[0] ?? 0); };

export function DatasetPicker(p: PickerProps) {
  const [open, setOpen] = useState(!!p.autoOpen);
  const avail = (p.sources ?? (['EPD', 'ÖKOBAUDAT', 'ecoinvent', 'IDEMAT'] as Src[])).filter((s) => lib.has(s));
  const [srcF, setSrcF] = useState<Src | 'All'>(p.src && avail.includes(p.src as Src) ? (p.src as Src) : 'All');
  const [cls, setCls] = useState<string>(p.cls || 'All');
  const [q, setQ] = useState('');
  const [sameUnit, setSameUnit] = useState(false);
  const [hideExp, setHideExp] = useState(true);
  const [geo, setGeo] = useState('');
  const [hl, setHl] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { refs, floatingStyles } = useFloating({
    open, placement: 'bottom-start', whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ padding: 12 }), shift({ padding: 12 }), size({ padding: 12, apply({ availableHeight, elements }) { elements.floating.style.maxHeight = `${Math.max(280, Math.min(600, availableHeight))}px`; } })],
  });
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 10);
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (refs.floating.current?.contains(t) || (refs.reference.current as HTMLElement | null)?.contains?.(t)) return;
      setOpen(false); p.onClose?.();
    };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  const suggest = !q.trim() && !!p.boqText;
  const query = q.trim() ? q : suggest ? suggestQuery(p.boqText!) : '';
  const srcs = srcF === 'All' ? avail : [srcF];
  const results = useMemo(() => open ? findDatasets({ q: query, srcs, cls, unit: sameUnit ? p.boqUnit ?? '' : '', hideExpired: hideExp, geo, mode: suggest ? 'OR' : 'AND' }) : [],
    [open, query, srcF, cls, sameUnit, hideExp, geo, lib.version]);
  useEffect(() => setHl(0), [query, srcF, cls, sameUnit, hideExp, geo]);
  const pick = (d: Dataset) => { p.onPick(d.src, d.n); setOpen(false); p.onClose?.(); };
  const cur = p.value ? lib.material(p.src || 'IDEMAT', p.value) : null;
  const prev = results[hl] ?? cur ?? null;
  const guessCls = p.boqText ? kwClass(p.boqText) : 'Other';

  return (
    <div className="picker" style={{ width: p.width }}>
      <button ref={refs.setReference} className="picker-btn" onClick={() => setOpen(!open)} title={p.value ?? ''}>
        {p.value ? <span className={`txt ${p.value.startsWith('CHECK') ? 'warn' : ''}`}>{shortName(p.value, p.src ?? '')}</span>
          : <span className="txt ph">{p.placeholder ?? 'Choose a material…'}</span>}
        <Icon.chev width={14} height={14} />
      </button>
      {open && (
        <FloatingPortal>
          <div ref={refs.setFloating} style={{ ...floatingStyles, width: 'min(980px, calc(100vw - 24px))' }} className="picker-pop" onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { setHl((h) => Math.min(results.length - 1, h + 1)); e.preventDefault(); }
            if (e.key === 'ArrowUp') { setHl((h) => Math.max(0, h - 1)); e.preventDefault(); }
            if (e.key === 'Enter' && results[hl]) pick(results[hl]);
            if (e.key === 'Escape') { setOpen(false); p.onClose?.(); }
          }}>
            <div className="picker-search">
              <input ref={inputRef} className="inp" placeholder="Search by product, maker, EPD number, class or country…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="row wrap" style={{ gap: 6 }}>
                <select className="inp" style={{ width: 140, height: 28 }} value={srcF} onChange={(e) => setSrcF(e.target.value as Src | 'All')}>
                  <option value="All">All libraries</option>
                  {avail.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="inp" style={{ width: 230, height: 28 }} value={cls} onChange={(e) => setCls(e.target.value)}>
                  <option value="All">All material classes</option>
                  {CLASSES.map((c) => <option key={c} value={c}>{c}{c === guessCls ? '  (matches the BOQ text)' : ''}</option>)}
                </select>
                <input className="inp" style={{ width: 92, height: 28 }} placeholder="Country" value={geo} onChange={(e) => setGeo(e.target.value)} title="e.g. SA, EG, AE" />
                {p.boqUnit && <label className="check"><input type="checkbox" checked={sameUnit} onChange={(e) => setSameUnit(e.target.checked)} /> Unit {p.boqUnit}</label>}
                <label className="check"><input type="checkbox" checked={hideExp} onChange={(e) => setHideExp(e.target.checked)} /> Hide expired</label>
              </div>
              {suggest && <div className="xs muted">Suggestions for “{p.boqText}”. Type to search everything.</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', minHeight: 0, flex: 1 }}>
              <div className="picker-list">
                {results.length === 0 && <div className="empty small">No match. Try fewer words, another class or all libraries.</div>}
                {results.map((d, i) => {
                  const kg = Library.kgOf(d);
                  return (
                    <div key={d.src + d.n} className={`picker-opt ${i === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(i)} onClick={() => pick(d)}>
                      <div className="o-name">{d.n.replace('CHECK – ', '')}</div>
                      <div className="o-gwp"><b>{sig(d.a[0])}</b> <span className="muted">/{d.u}</span>{kg && d.u !== 'kg' ? <div className="muted">{sig((d.a[0] ?? 0) / kg)} /kg</div> : null}</div>
                      <div className="o-meta">
                        <SrcBadge src={d.src} /><span>{d.cls}</span>{d.geo && <span>· {d.geo}</span>}
                        {d.n.startsWith('CHECK') && <span className="chip amber">CHECK</span>}
                        {isExpired(d) && <span className="chip red">expired</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ borderLeft: '1px solid var(--line2)', overflow: 'auto' }} className="hide-sm">
                {prev ? <DatasetCard d={prev} compact /> : <div className="empty small">Point at a result to see its product card.</div>}
              </div>
            </div>
            <div className="picker-foot">
              <span>{results.length >= 150 ? '150+' : results.length} results · sorted {q.trim() || suggest ? 'by relevance' : 'by GWP per kg, lowest first'}</span>
              <span className="spacer" />
              <span>↑ ↓ to move · Enter to choose · Esc to close</span>
            </div>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}
