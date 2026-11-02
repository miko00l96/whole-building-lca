import { useState } from 'react';
import { useApp } from '../../state/store.ts';
import { lib, loadPackFile, packMeta, removePack } from '../../data/libraryStore.ts';
import { pickFile } from '../../state/project.ts';
import { Icon } from '../icons.tsx';
import type { Src } from '../../engine/types.ts';

const ATTR: Record<Src, string> = {
  'ÖKOBAUDAT': 'ÖKOBAUDAT OBD_2024_II – German Federal Ministry for Housing, Urban Development and Building (BMWSB) / BBSR, www.oekobaudat.de. Free of charge; unmodified data may be passed on when the source is named.',
  EPD: 'Product EPDs – EPD International AB data (www.environdec.com), EPD Hub, ICIS, CARES, BRE, IBU, EPD Norway, SCS Global Services and the programme operators named on each dataset. Each EPD remains the property of its owner. EPD International data: own project work with attribution; do not redistribute.',
  IDEMAT: 'IDEMAT 2026 – Sustainability Impact Metrics / Delft University of Technology, data from www.ecocostsvalue.com (CC BY-NC 4.0).',
  ecoinvent: 'ecoinvent 3.9.1, cut-off system model – ecoinvent Association, Zürich; LCIA with the ecoinvent EF 3.1 implementation. Licensed: use only with your own ecoinvent licence.',
};

export function DataPage() {
  const { recompute, toast } = useApp();
  const [, force] = useState(0);
  const load = async () => {
    const f = await pickFile('.wblca,application/gzip,application/json');
    if (!f) return;
    try { await loadPackFile(f); recompute(); force((x) => x + 1); toast('Private data pack loaded in this browser'); }
    catch (e: any) { toast(e?.message ?? 'This file could not be read'); }
  };
  const remove = async () => {
    if (!confirm('Remove the private data pack from this browser? Projects keep their material names; they calculate again when you load the pack.')) return;
    await removePack(); recompute(); force((x) => x + 1); toast('Private data pack removed from this browser');
  };
  return (
    <div className="page narrow">
      <div className="page-head"><div className="grow"><div className="step-label"><span className="sheet-no">C-02</span> · Libraries</div><h1>Data and libraries</h1>
        <p className="lede">This app runs entirely in your browser. Projects and data packs are stored on this computer only (browser storage) and are never uploaded.</p></div></div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="sec-band">Libraries loaded in this browser</div>
        <table className="tbl">
          <thead><tr><th>Library</th><th className="num">Datasets</th><th>Origin</th><th>Version</th></tr></thead>
          <tbody>{(['EPD', 'ÖKOBAUDAT', 'ecoinvent', 'IDEMAT'] as Src[]).map((s) => {
            const i = lib.info[s];
            return <tr key={s}><td><b>{s}</b></td><td className="num">{i ? lib.bySrc[s].length.toLocaleString() : '–'}</td>
              <td>{i ? (i.origin === 'public' ? 'Published with the app' : 'Your private data pack') : <span className="muted">not loaded</span>}</td><td className="xs ink2">{i?.title ?? ''}</td></tr>;
          })}</tbody>
        </table>
        <div className="panel-body row wrap">
          <button className="btn primary" onClick={load}><Icon.upload /> {packMeta ? 'Load a newer data pack' : 'Load the private data pack (.wblca)'}</button>
          {packMeta && <button className="btn danger" onClick={remove}><Icon.trash /> Remove it from this browser</button>}
          {packMeta && <span className="help">Pack: {packMeta.title} · created {packMeta.created}</span>}
        </div>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="sec-band">How the private data pack works</div>
        <div className="panel-body col small ink2">
          <p>The EPD library, IDEMAT and ecoinvent cannot be published with the app: EPD International data may not be redistributed, IDEMAT needs the owner's agreement for use in published tools, and ecoinvent results may only be used with an ecoinvent licence. They travel as one file, the data pack (.wblca), kept on your own drive.</p>
          <p>Load it once in each browser you use. It is stored in that browser only; remove it here on a shared computer. Give the file only to colleagues who hold their own ecoinvent licence.</p>
          <p>Project files (.wblca.json) contain material names, not the data, so you can share them freely. Whoever opens one needs the same libraries to calculate it.</p>
        </div>
      </div>
      <div className="panel">
        <div className="sec-band">Data attribution</div>
        <div className="panel-body col small">{(Object.keys(ATTR) as Src[]).map((s) => <div key={s}><b>{s}.</b> {ATTR[s]}</div>)}</div>
      </div>
    </div>
  );
}
