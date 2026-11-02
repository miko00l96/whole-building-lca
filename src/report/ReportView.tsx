// The report as A4 sheets. Every block is measured once in a hidden column of the same width as the page text, then laid
// out page by page (headings stay with what follows, tables split between rows and repeat their header), so the preview,
// the contents page numbers and the printed PDF agree.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { withBase, withPaper, type EOption } from '../ui/components/Chart.tsx';
import type { Block, Cell, ReportMeta } from './model.ts';
import { Figure1 } from './Figure1.tsx';
import './report.css';

interface Frag { i: number; from?: number; to?: number; first?: boolean; last?: boolean }
interface TableM { top: number; head: number; rows: number[]; foot: number; bottom: number }
interface M { h: number; table?: TableM }
export interface Paged { pages: Frag[][]; pageOf: Map<number, number> }

const cellText = (c: Cell) => (typeof c === 'string' ? c : c.text);
function cellClass(c: Cell): string | undefined {
  if (typeof c === 'string') return undefined;
  return [c.align, c.bold ? 'b' : '', c.tone ? `t-${c.tone}` : ''].filter(Boolean).join(' ') || undefined;
}

export function tocEntries(blocks: Block[]) {
  const out: { k: number; level: number; label: string }[] = [];
  blocks.forEach((b, k) => {
    if (b.t === 'h1') out.push({ k, level: b.level ?? 1, label: b.toc });
    else if (b.t === 'h2' && b.toc) out.push({ k, level: 2, label: b.toc });
  });
  return out;
}

function splitToc(label: string): [string, string] {
  const m = /^(\d+(?:\.\d+)?)\s+(.*)$/.exec(label);
  if (m) return [m[1], m[2]];
  const a = /^(Appendix [A-Z])\s+(.*)$/.exec(label);
  if (a) return [a[1], a[2]];
  return ['', label];
}

function ReportChart({ option, h }: { option: EOption; h: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const d = el.current;
    if (!d) return;
    const c = echarts.init(d, undefined, { renderer: 'svg', width: d.clientWidth || 642, height: h });
    c.setOption(withPaper(() => ({ ...withBase(option), animation: false })));
    return () => c.dispose();
  }, [option, h]);
  return <div ref={el} className="rpt-chart" style={{ height: h }} />;
}

function TableRows({ rows }: { rows: Cell[][] }) {
  return <>{rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className={cellClass(c)}>{cellText(c)}</td>)}</tr>)}</>;
}

/** One block, or the part of a table on one page. measure = draw charts as empty boxes of their height. */
function BlockView({ b, f, meta, measure }: { b: Block; f: Frag; meta: ReportMeta; measure?: boolean }) {
  const first = f.first !== false, last = f.last !== false;
  switch (b.t) {
    case 'h1': return <div className="rb"><div className="rpt-h1" id={`s${f.i}`}>{b.text}</div></div>;
    case 'h2': return <div className="rb"><div className="rpt-h2" id={`s${f.i}`}>{b.text}</div></div>;
    case 'p': return <div className="rb"><p className={['rpt-p', b.tone, b.bullet ? 'bullet' : ''].filter(Boolean).join(' ')}>{b.text}</p></div>;
    case 'kv': {
      const rows = f.from != null ? b.rows.slice(f.from, f.to) : b.rows;
      return <div className="rb"><table className="rpt-kv"><tbody>{rows.map(([k, v], j) => <tr key={j}><th>{k}</th><td>{v}</td></tr>)}</tbody></table></div>;
    }
    case 'tiles':
      return (
        <div className="rb"><div className="rpt-tiles">{b.items.map((x, j) => (
          <div key={j} className="rpt-tile"><div className="l">{x.lab}</div><div className={`v ${x.tone ? `t-${x.tone}` : ''}`}>{x.val}</div><div className="s">{x.sub || ' '}</div></div>
        ))}</div></div>
      );
    case 'table': {
      const rows = f.from != null ? b.rows.slice(f.from, f.to) : b.rows;
      const sum = b.widths.reduce((a, x) => a + x, 0);
      return (
        <div className="rb">
          {b.caption && first && <div className="rpt-cap">{b.caption}{f.from ? ' (continued)' : ''}</div>}
          <table className={`rpt-tbl ${b.small ? 'xs' : ''}`}>
            <colgroup>{b.widths.map((w, j) => <col key={j} style={{ width: `${(w / sum) * 100}%` }} />)}</colgroup>
            <thead><tr>{b.head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
            <tbody><TableRows rows={rows} /></tbody>
            {b.total && last && <tfoot><tr>{b.total.map((c, j) => <td key={j} className={cellClass(c)}>{cellText(c)}</td>)}</tr></tfoot>}
          </table>
        </div>
      );
    }
    case 'chart':
      return <div className="rb"><div className="rpt-chart-t">{b.title}</div>{measure ? <div className="rpt-chart" style={{ height: b.h }} /> : <ReportChart option={b.option} h={b.h} />}</div>;
    case 'figure':
      return <div className="rb"><Figure1 /><div className="rpt-figcap">{b.caption}</div></div>;
    case 'decl':
      return (
        <div className="rb">
          <table className="rpt-decl"><colgroup><col style={{ width: '16%' }} /><col style={{ width: '38%' }} /><col style={{ width: '15%' }} /><col style={{ width: '31%' }} /></colgroup>
            <tbody>
              <tr><th>Prepared by</th><td>{meta.declBy}</td><th className="r">Date</th><td>{meta.declDate}</td></tr>
              <tr><th>Signature</th><td /><th className="r">Reviewed by</th><td /></tr>
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

function measureAll(root: HTMLElement): M[] {
  return Array.from(root.children).map((el) => {
    const box = el.getBoundingClientRect();
    const t = el.querySelector('table.rpt-tbl, table.rpt-kv') as HTMLTableElement | null;
    if (!t) return { h: box.height };
    const tb = t.getBoundingClientRect();
    const head = t.tHead ? t.tHead.getBoundingClientRect().height : 0;
    const foot = t.tFoot ? t.tFoot.getBoundingClientRect().height : 0;
    const rows = Array.from(t.tBodies[0]?.rows ?? []).map((r) => r.getBoundingClientRect().height);
    return { h: box.height, table: { top: tb.top - box.top, head, rows, foot, bottom: box.bottom - tb.bottom + 1.5 } };
  });
}

export function paginate(blocks: Block[], m: M[], H: number): Paged {
  const pages: Frag[][] = [];
  let cur: Frag[] = [], used = 0;
  const flush = () => { if (cur.length) { pages.push(cur); cur = []; used = 0; } };
  const minH = (k: number): number => {
    const b = blocks[k], mm = m[k];
    if (!b || !mm) return 0;
    if (b.t === 'h1' || b.t === 'h2') return mm.h + minH(k + 1);
    if (mm.table && mm.table.rows.length) return mm.table.top + mm.table.head + mm.table.rows[0] + (mm.table.rows.length === 1 ? mm.table.foot : 0) + mm.table.bottom;
    return b.t === 'break' ? 0 : mm.h;
  };
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k], mm = m[k];
    if (b.t === 'cover' || b.t === 'toc') { flush(); pages.push([{ i: k }]); continue; }
    // a soft break (Excel page plan) only starts a new page when this one is already well filled
    if (b.t === 'break') { if (b.word || used > 0.4 * H) flush(); continue; }
    const T = mm.table;
    if (T && T.rows.length > 1 && used + mm.h > H) {
      const n = T.rows.length;
      const partH = (r0: number, r1: number, first: boolean) => {
        let h = (first ? T.top : 0) + T.head + T.bottom;
        for (let j = r0; j < r1; j++) h += T.rows[j];
        return h + (r1 === n ? T.foot : 0);
      };
      let r0 = 0, first = true;
      while (r0 < n) {
        let r1 = r0;
        while (r1 < n && used + partH(r0, r1 + 1, first) <= H) r1++;
        // no single row alone at the end of a page or at the top of the next one
        if (r1 < n && r1 > r0 && n - r1 === 1 && r1 - r0 >= 3) r1--;
        if (first && cur.length && n > 2 && r1 - r0 < 2) { flush(); continue; }
        if (r1 === r0) {
          if (cur.length) { flush(); continue; }
          r1 = r0 + 1;
        }
        cur.push({ i: k, from: r0, to: r1, first, last: r1 === n });
        used += partH(r0, r1, first);
        r0 = r1;
        first = false;
        if (r0 < n) flush();
      }
      continue;
    }
    const need = b.t === 'h1' || b.t === 'h2' ? mm.h + Math.min(minH(k + 1), 170) : mm.h;
    if (used + need > H && cur.length) flush();
    cur.push({ i: k });
    used += mm.h;
  }
  flush();
  const pageOf = new Map<number, number>();
  pages.forEach((pg, n) => pg.forEach((f) => { if (!pageOf.has(f.i)) pageOf.set(f.i, n + 1); }));
  return { pages, pageOf };
}

function Cover({ meta }: { meta: ReportMeta }) {
  return (
    <div className="rpt-cover">
      <div className="band top" />
      <div className="logo">{meta.logo ? <img src={meta.logo} alt="Company logo" /> : <div className="logo-ph no-print">Company logo: add it with “Company logo” above the report</div>}</div>
      <div className="title">{meta.title}</div>
      <div className="subtitle">{meta.subtitle}</div>
      <div className="rule" />
      <div className="proj">{meta.project}</div>
      <div className="sys">{meta.system}</div>
      <div className="credit">{meta.credit}</div>
      <table className="facts"><tbody>{meta.facts.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
      <div className="with">{meta.prepared}</div>
      <div className="band bottom" />
    </div>
  );
}

function Contents({ blocks, paged }: { blocks: Block[]; paged: Paged }) {
  return (
    <div className="rpt-flow">
      <div className="rpt-toc-t">CONTENTS</div>
      <nav className="rpt-toc">
        {tocEntries(blocks).map((e) => {
          const [n, t] = splitToc(e.label);
          return (
            <a key={e.k} href={`#s${e.k}`} className={`l${e.level}`} onClick={(ev) => { ev.preventDefault(); document.getElementById(`s${e.k}`)?.scrollIntoView({ block: 'start' }); }}>
              {n && <span className="n">{n}</span>}<span className="t">{t}</span><span className="pg">{paged.pageOf.get(e.k) ?? ''}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}

export function ReportView({ blocks, meta, onPaged }: { blocks: Block[]; meta: ReportMeta; onPaged?: (p: Paged) => void }) {
  const mref = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [paged, setPaged] = useState<Paged | null>(null);
  useLayoutEffect(() => {
    let alive = true;
    const run = () => {
      if (!alive || !mref.current || !probe.current) return;
      const H = probe.current.getBoundingClientRect().height - 2;
      const p = paginate(blocks, measureAll(mref.current), H);
      setPaged(p);
      onPaged?.(p);
    };
    run();
    Promise.all([document.fonts?.load('10pt Carlito'), document.fonts?.load('bold 10pt Carlito')]).catch(() => undefined)
      .then(() => document.fonts?.ready).then(run, run);
    return () => { alive = false; };
  }, [blocks, meta]);
  const N = paged?.pages.length ?? 0;
  return (
    <>
      <div className="rpt-measure rpt-type" aria-hidden="true">
        <div ref={probe} style={{ height: '255mm', position: 'absolute', width: 1 }} />
        <div className="rpt-flow" ref={mref}>
          {blocks.map((b, i) => (b.t === 'cover' || b.t === 'toc' || b.t === 'break' ? <div key={i} className="rb" /> : <BlockView key={i} b={b} f={{ i }} meta={meta} measure />))}
        </div>
      </div>
      {paged && (
        <div className="rpt-wrap rpt-type">
          {paged.pages.map((pg, n) => {
            const b0 = blocks[pg[0].i];
            if (b0.t === 'cover') return <section key={n} className="rpt-sheet"><Cover meta={meta} /></section>;
            return (
              <section key={n} className="rpt-sheet">
                <div className="rpt-head"><span>{meta.header}</span><span>{meta.project}</span></div>
                <div className="rpt-body">
                  {b0.t === 'toc' ? <Contents blocks={blocks} paged={paged} /> : (
                    <div className="rpt-flow">{pg.map((f, j) => <BlockView key={`${f.i}-${f.from ?? 0}-${j}`} b={blocks[f.i]} f={f} meta={meta} />)}</div>
                  )}
                </div>
                <div className="rpt-foot"><span>{meta.footer}</span><span>Page {n + 1} of {N}</span></div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
