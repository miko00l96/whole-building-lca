// Product information card, shown when the pointer rests on a product or dataset name anywhere in the app.
import { Fragment, useState, type ReactNode } from 'react';
import {
  useFloating, useHover, useFocus, useInteractions, offset, flip, shift, size, autoUpdate, FloatingPortal, safePolygon,
} from '@floating-ui/react';
import { Library } from '../../engine/library.ts';
import { IND_SHORT, IND_UNIT, shortName } from '../../engine/rules.ts';
import type { Dataset } from '../../engine/types.ts';
import { lib } from '../../data/libraryStore.ts';
import { dateFmt, sig } from '../format.ts';
import { SrcBadge } from './common.tsx';
import { today } from '../../state/project.ts';

export function isExpired(d: Dataset, at = today()): boolean {
  const v = Library.validUntil(d);
  if (!v) return false;
  return d.src === 'ÖKOBAUDAT' ? Number(v.slice(0, 4)) < Number(at.slice(0, 4)) : v < at;
}

export function DatasetCard({ d, compact = false }: { d: Dataset; compact?: boolean }) {
  const kg = Library.kgOf(d);
  const gwpKg = kg ? (d.a[0] ?? 0) / kg : null;
  const valid = Library.validUntil(d);
  const expired = isExpired(d);
  const check = d.n.startsWith('CHECK');
  const rows: [string, ReactNode][] = [];
  if (d.src === 'EPD') {
    if (d.maker) rows.push(['Manufacturer', d.maker]);
    if (d.prog) rows.push(['Programme', d.prog]);
    if (d.reg) rows.push(['Registration', d.reg]);
  } else if (d.src === 'ÖKOBAUDAT') {
    if (d.owner) rows.push(['Declaration owner', d.owner]);
    if (d.type) rows.push(['Dataset type', d.type]);
    if (d.reg) rows.push(['Registration', d.reg]);
    if (d.cat) rows.push(['Category', d.cat]);
  } else if (d.src === 'ecoinvent') {
    rows.push(['Activity', d.cat ?? '']);
    if (d.type) rows.push(['Dataset type', d.type]);
  } else if (d.src === 'IDEMAT') {
    rows.push(['IDEMAT group', d.cat ?? '']);
  }
  rows.push(['Country', d.geo || '–']);
  rows.push(['Declared unit', `1 ${d.u}${kg && d.u !== 'kg' ? ` = ${sig(kg)} kg` : ''}`]);
  if (valid) rows.push(['Valid until', <span className={expired ? 'bad' : ''}>{dateFmt(valid)}{expired ? '  (expired)' : ''}</span>]);
  if (d.std) rows.push(['Standard', d.std]);
  rows.push(['Material class', d.cls || '–']);
  if (d.src === 'ÖKOBAUDAT' && d.mods) rows.push(['Modules', d.mods]);
  return (
    <div>
      <div className="dscard-head">
        <div className="row">
          <SrcBadge src={d.src} />
          {expired && <span className="chip red">expired</span>}
          {check && <span className="chip amber">CHECK note</span>}
          {d.std === 'EN 15804+A1' && <span className="chip amber">EN 15804+A1</span>}
          <span className="spacer" />
          <span className="xs muted">GWP A1–A3</span>
          <b>{sig(d.a[0])}</b><span className="xs muted">kg CO2e/{d.u}</span>
        </div>
        <div className="nm">{d.n.replace('CHECK – ', '')}</div>
        {gwpKg != null && d.u !== 'kg' && <div className="xs muted">{sig(gwpKg)} kg CO2e per kg</div>}
      </div>
      <div className="dscard-body">
        <dl className="kv">{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
        {!compact && (
          <div className="ind-grid">
            <div className="h">Indicator</div><div className="h n">A1–A3</div><div className="h n">C1–C4</div><div className="h n">D</div>
            {IND_SHORT.map((nm, i) => (
              <Row key={nm} label={`${nm} (${IND_UNIT[i]})`} a={d.a[i]} c={d.c ? d.c[i] : undefined} dd={i === 0 ? d.dGwp : d.d ? d.d[i] : undefined} />
            ))}
          </div>
        )}
        {!d.c && (d.src === 'EPD' || d.src === 'ÖKOBAUDAT') && <div className="xs muted">No C1–C4 declared: the end-of-life process on the line is used.</div>}
        {d.desc && d.src === 'EPD' && <div className="desc-text">{d.desc}</div>}
        {d.desc && d.src === 'ecoinvent' && <div className="desc-text">Reference product: {d.desc}</div>}
        {d.warn && <div className="note warn xs">{d.warn}</div>}
        {d.note && !compact && <details><summary className="xs muted" style={{ cursor: 'pointer' }}>Data notes</summary><div className="xs ink2" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{d.note}</div></details>}
        {d.url && <a className="xs" href={d.url} target="_blank" rel="noreferrer">Open the {d.src === 'EPD' ? 'EPD' : 'dataset'} page ↗</a>}
      </div>
    </div>
  );
}

function Row({ label, a, c, dd }: { label: string; a: number | null; c?: number | null; dd?: number | null }) {
  return (
    <>
      <div className="xs">{label}</div>
      <div className="n">{a == null ? '–' : sig(a)}</div>
      <div className="n">{c === undefined ? '' : c == null ? '–' : sig(c)}</div>
      <div className="n">{dd == null ? '' : sig(dd)}</div>
    </>
  );
}

/** A dataset name; resting the pointer on it opens the product card. */
export function DsName({ src, n, short = true, className = '', children }: {
  src: string | null | undefined; n: string | null | undefined; short?: boolean; className?: string; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const d = src && n ? (src === 'any' ? lib.anyName(n) : lib.material(src as any, n) ?? lib.eol(n) ?? lib.transport(n)) : null;
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange: setOpen, placement: 'bottom-start', middleware: [offset(6), flip({ padding: 10 }), shift({ padding: 10, crossAxis: true }), size({ padding: 10, apply({ availableHeight, elements }) { Object.assign(elements.floating.style, { maxHeight: `${Math.max(240, availableHeight)}px`, overflowY: 'auto' }); } })], whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, { delay: { open: 280, close: 80 }, handleClose: safePolygon() });
  const focus = useFocus(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus]);
  if (!n) return null;
  const label = children ?? (short ? shortName(n, src ?? '') : n);
  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} className={`ds-name ${n.startsWith('CHECK') ? 'check' : ''} ${className}`} tabIndex={d ? 0 : -1}>
        {label}
      </span>
      {open && d && (
        <FloatingPortal>
          <div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()} className="card-pop">
            <DatasetCard d={d} />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
