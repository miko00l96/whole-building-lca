import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmt, parseNum } from '../format.ts';
import { Icon } from '../icons.tsx';

/** Number input that keeps what you type and commits on Enter / leaving the cell (like Excel). */
export function NumInput(props: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  decimals?: number;
  fromBoq?: boolean;
  placeholder?: string;
  className?: string;
  width?: number | string;
  title?: string;
  disabled?: boolean;
  min?: number;
}) {
  const { value, decimals = 2, fromBoq, placeholder, className = '', width, title, disabled } = props;
  const [txt, setTxt] = useState<string | null>(null);
  const shown = txt ?? (value == null ? '' : fmt(value, Number.isInteger(value) ? 0 : decimals));
  const commit = () => {
    if (txt == null) return;
    const v = parseNum(txt);
    setTxt(null);
    if (v !== (value ?? null)) props.onCommit(v);
  };
  return (
    <input
      className={`inp num ${fromBoq ? 'from-boq' : ''} ${className}`}
      style={width ? { width } : undefined}
      value={shown}
      placeholder={placeholder}
      title={title}
      disabled={disabled}
      inputMode="decimal"
      onFocus={(e) => { setTxt(value == null ? '' : String(value)); requestAnimationFrame(() => e.target.select()); }}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setTxt(null); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}

export function TextInput(props: {
  value: string | null | undefined;
  onCommit: (v: string) => void;
  fromBoq?: boolean;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
  title?: string;
  list?: string;
}) {
  const [txt, setTxt] = useState<string | null>(null);
  const shown = txt ?? props.value ?? '';
  const commit = () => {
    if (txt == null) return;
    const v = txt;
    setTxt(null);
    if (v !== (props.value ?? '')) props.onCommit(v);
  };
  const cls = `inp ${props.fromBoq ? 'from-boq' : ''} ${props.className ?? ''}`;
  if (props.multiline)
    return <textarea className={cls} rows={props.rows ?? 3} value={shown} placeholder={props.placeholder} title={props.title}
      onChange={(e) => setTxt(e.target.value)} onBlur={commit} />;
  return (
    <input className={cls} value={shown} placeholder={props.placeholder} title={props.title} list={props.list}
      onChange={(e) => setTxt(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setTxt(null); (e.target as HTMLInputElement).blur(); }
      }} />
  );
}

export function SrcBadge({ src }: { src: string | null | undefined }) {
  if (!src) return <span className="src src-none">no source</span>;
  return <span className={`src src-${src}`}>{src}</span>;
}

export function QaBadge({ stat, qa }: { stat: string; qa: string }) {
  if (!stat) return null;
  const k = stat.startsWith('✓') ? 'ok' : stat.startsWith('ℹ') ? 'info' : 'warn';
  return <span className={`qa ${k}`} title={qa}>{stat}</span>;
}

/** "4,022.7 t CO2e" → the figure in mono, the unit set small beside it, as a dimension on a drawing. */
const figure = (v: ReactNode) => {
  if (typeof v !== 'string') return v;
  // the unit: words that do not start with a digit ("t CO2e", "kg/m²", "points"); "3 of 14" and ranges stay as they are
  const m = /^([▲▼]?\s?[−+-]?[\d,.]+(?:E[−+-]?\d+)?%?)\s+([^\d\s]\S*(?:\s+[^\d\s]\S*)*)$/.exec(v);
  return m ? <>{m[1]}<span className="t-unit">{m[2]}</span></> : v;
};

export function Tiles({ items }: { items: { lab: ReactNode; val: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | '' }[] }) {
  return (
    <div className="tiles">
      {items.map((t, i) => (
        <div className="tile" key={i}>
          <div className="t-lab">{t.lab}</div>
          <div className={`t-val ${t.tone ?? ''}`}>{figure(t.val)}</div>
          {t.sub != null && <div className="t-sub">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function Modal(props: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className={`modal ${props.wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 className="grow">{props.title}</h2>
          <button className="icon-btn" onClick={props.onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.foot && <div className="modal-foot">{props.foot}</div>}
      </div>
    </div>
  );
}

export function Seg<T extends string>(props: { value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {props.options.map((o) => (
        <button key={o.v} className={o.v === props.value ? 'on' : ''} onClick={() => props.onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Menu(props: { label: ReactNode; items: { label: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button className={props.className ?? 'btn sm'} onClick={() => setOpen(!open)}>{props.label}</button>
      {open && (
        <div className="card-pop" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 260, padding: 4 }}>
          {props.items.map((it, i) => (
            <button key={i} className={`nav-item ${it.danger ? 'bad' : ''}`} disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }} style={{ fontSize: 13.5 }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
