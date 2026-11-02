import type { ReactNode } from 'react';
import { useApp } from '../../state/store.ts';
import { LEED_OPTS, leedSys, IND_NAME, IND_UNIT, EP_NAME } from '../../engine/rules.ts';
import { lib } from '../../data/libraryStore.ts';
import { NumInput, TextInput } from '../components/common.tsx';
import { DsName } from '../components/DatasetCard.tsx';
import type { A4EolDb, EpKey, Setup, SystemIndex } from '../../engine/types.ts';
import { sig } from '../format.ts';
import { today } from '../../state/project.ts';

function Row({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (<><div className="lab">{label}</div><div>{children}</div><div className="help">{help}</div></>);
}

export function SetupPage() {
  const { project, result, commit } = useApp();
  if (!project || !result) return null;
  const s = project.setup;
  const sys = leedSys(s.system);
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => commit((p) => { p.setup[k] = v; });
  const trucks = lib.transportList(s.a4EolDb);
  const grids = lib.gridEntries();
  const truckOk = !!lib.transport(s.truck?.n);
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <div className="step-label"><span className="sheet-no">A-01</span> · Step 1 of 5</div>
          <h1>Project setup</h1>
          <p className="lede">Shaded fields are inputs; everything else is calculated. The rating system sets the scope, the element list, the minimum study period and the LEED paths.</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="sec-band">LEED rating system and credit</div>
        <div className="panel-body form-grid">
          <Row label="Rating system" help="ID+C uses the LEED v4.1 interiors LCA (LEED v4 ID+C has no LCA option).">
            <select className="inp" value={s.system} onChange={(e) => set('system', Number(e.target.value) as SystemIndex)}>
              {LEED_OPTS.map((o, i) => <option key={o} value={i}>{o}</option>)}
            </select>
          </Row>
          <Row label="Credit" help={`Scope: ${sys.scope}. Minimum study period ${sys.minSp} years.`}><div className="ink2">MRc {sys.credit}, {sys.optName}</div></Row>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="sec-band">Project</div>
        <div className="panel-body form-grid">
          <Row label="Project name" help="Shown on every page and on the report."><TextInput value={s.projectName} onCommit={(v) => set('projectName', v)} /></Row>
          <Row label="Location"><TextInput value={s.location} onCommit={(v) => set('location', v)} placeholder="City, country" /></Row>
          <Row label={`${sys.areaLabel} (m²)`} help="Same for baseline and proposed; per-m² results use it."><NumInput value={s.area} onCommit={(v) => set('area', v)} decimals={0} /></Row>
          <Row label="Study period (years)" help={`At least ${sys.minSp} years for ${sys.sys}. Leave blank to follow the rating system.`}>
            <NumInput value={s.studyPeriod} onCommit={(v) => set('studyPeriod', v)} decimals={0} placeholder={`${sys.minSp} (default)`} />
          </Row>
          <Row label="Number of floors" help="For the report's project details, e.g. 'B + G + 5'."><TextInput value={s.floors} onCommit={(v) => set('floors', v)} /></Row>
          <Row label="Assessment date" help="Used for the EPD validity check. Blank = today.">
            <input type="date" className="inp" value={s.assessmentDate ?? ''} onChange={(e) => set('assessmentDate', e.target.value || null)} placeholder={today()} />
          </Row>
          <Row label="Eutrophication indicator for LEED" help="Marine (kg N eq) is in the TRACI unit LEED names. The other two are reported for information.">
            <select className="inp" value={s.epIndicator} onChange={(e) => set('epIndicator', e.target.value as EpKey)}>
              {(['EPm', 'EPfw', 'EPt'] as EpKey[]).map((k) => <option key={k} value={k}>{EP_NAME[k]}</option>)}
            </select>
          </Row>
          <Row label="Assessor"><TextInput value={s.assessor} onCommit={(v) => set('assessor', v)} /></Row>
          <Row label="Notes" help="Shown in the report under assumptions."><TextInput multiline value={s.notes} onCommit={(v) => set('notes', v)} /></Row>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="sec-band">A4 transport and end of life</div>
        <div className="panel-body form-grid">
          <Row label="Database for the A4 and end-of-life lists" help="Filters the transport and end-of-life lists. Lines already filled keep their choice.">
            <select className="inp" value={s.a4EolDb} onChange={(e) => set('a4EolDb', e.target.value as A4EolDb)}>
              {(['All databases', 'ecoinvent', 'IDEMAT', 'ÖKOBAUDAT'] as A4EolDb[]).map((k) => <option key={k}>{k}</option>)}
            </select>
          </Row>
          <Row label="Default truck (A4 default and C2)" help={truckOk ? <>Per tkm. Used on every line unless the line names another transport.</> : <span className="warn">Not found in the libraries loaded here: pick a transport dataset.</span>}>
            <select className="inp" value={s.truck ? `${s.truck.src}|${s.truck.n}` : ''} onChange={(e) => {
              const [src, ...n] = e.target.value.split('|');
              set('truck', e.target.value ? { src: src as any, n: n.join('|') } : null);
            }}>
              {!truckOk && s.truck && <option value={`${s.truck.src}|${s.truck.n}`}>{s.truck.n} (not loaded)</option>}
              <option value="">(none)</option>
              {trucks.map((d) => <option key={d.src + d.n} value={`${d.src}|${d.n}`}>{d.src}: {d.n}</option>)}
            </select>
          </Row>
          <Row label="C2 default: distance to waste site (km)" help="Replace with a project-specific assumption."><NumInput value={s.c2km} onCommit={(v) => set('c2km', v)} decimals={0} /></Row>
          <Row label="Truck factors per tkm" help="Used for A4 on every line with the default truck, and for C2 where the end-of-life process is used.">
            <div className="xs ink2">{truckOk ? <>GWP {sig(result.truck[0])} kg CO2e/tkm · <DsName src="any" n={s.truck?.n}>dataset card</DsName></> : '–'}</div>
          </Row>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="sec-band">B6 operational energy (reported separately, not part of the LEED result)</div>
        <div className="panel-body form-grid">
          <Row label="Grid electricity factors" help="IDEMAT 2026 (EG, SA), ecoinvent 3.9.1 low- or medium-voltage mixes (Middle East first), or your own factors.">
            <select className="inp" value={s.grid} onChange={(e) => set('grid', e.target.value)}>
              {!grids.some((g) => g.label === s.grid) && !s.grid.startsWith('Custom') && <option value={s.grid}>{s.grid} (not loaded)</option>}
              {grids.map((g) => <option key={g.label} value={g.label}>{g.label}</option>)}
              <option value="Custom factors">Custom factors (below)</option>
            </select>
          </Row>
          <Row label="Baseline annual electricity (kWh/yr)" help="From the energy model (LEED EA baseline)."><NumInput value={s.kwhBase} onCommit={(v) => set('kwhBase', v)} decimals={0} /></Row>
          <Row label="Proposed annual electricity (kWh/yr)" help="From the energy model (proposed design)."><NumInput value={s.kwhProp} onCommit={(v) => set('kwhProp', v)} decimals={0} /></Row>
          <Row label="Grid GWP used" help={result.gridDs ? <DsName src={result.gridDs.src} n={result.gridDs.n}>{result.gridDs.n}</DsName> : s.grid.startsWith('Custom') ? 'Your factors below' : 'No grid dataset loaded'}>
            <div className="xs ink2">{sig(result.grid[0])} kg CO2e/kWh</div>
          </Row>
        </div>
        {s.grid.startsWith('Custom') && (
          <div className="panel-body form-grid" style={{ borderTop: '1px solid var(--line2)' }}>
            {IND_NAME.map((nm, i) => (
              <Row key={nm} label={`${nm} (${IND_UNIT[i]}/kWh)`}>
                <NumInput value={s.customGrid[i]} decimals={6} onCommit={(v) => commit((p) => { p.setup.customGrid = [...p.setup.customGrid]; p.setup.customGrid[i] = v; })} />
              </Row>
            ))}
            <Row label="Source / dataset name and version"><TextInput value={s.customGridSource} onCommit={(v) => set('customGridSource', v)} /></Row>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="sec-band">Report details (cover page and report text)</div>
        <div className="panel-body form-grid">
          <Row label="Company / consultant" help="Report cover and footer."><TextInput value={s.company} onCommit={(v) => set('company', v)} /></Row>
          <Row label="Company logo" help="PNG or JPG, shown on the report cover. Kept in the project file.">
            <div className="row">
              {s.logo && <img src={s.logo} alt="" style={{ height: 32, maxWidth: 140, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 3 }} />}
              <input type="file" accept="image/png,image/jpeg" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
                set('logo', url);
              }} />
              {s.logo && <button className="btn xs" onClick={() => set('logo', null)}>Remove</button>}
            </div>
          </Row>
          <Row label="Client (prepared for)"><TextInput value={s.client} onCommit={(v) => set('client', v)} /></Row>
          <Row label="Building use"><TextInput value={s.buildingUse} onCommit={(v) => set('buildingUse', v)} /></Row>
          <Row label="Report reference / revision"><TextInput value={s.reportRef} onCommit={(v) => set('reportRef', v)} /></Row>
          <Row label="Additional recommendations" help="Added to the report's recommendations."><TextInput multiline value={s.extraRecs} onCommit={(v) => set('extraRecs', v)} /></Row>
        </div>
      </div>
    </div>
  );
}
