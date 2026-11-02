import { useEffect, useMemo, useState } from 'react';
import { useApp, type Page } from '../../state/store.ts';
import { buildReport, reportMeta } from '../../report/model.ts';
import { ReportView, type Paged } from '../../report/ReportView.tsx';
import { downloadBlob, pickFile } from '../../state/project.ts';
import { Icon } from '../icons.tsx';

/** Read an image file and scale it down for the report cover (PNG keeps transparency, JPEG stays JPEG). */
async function shrinkImage(f: File, maxW = 900, maxH = 420): Promise<string> {
  const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
  const im = new Image();
  await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = url; });
  const w0 = im.naturalWidth || 600, h0 = im.naturalHeight || 300;
  const k = Math.min(1, maxW / w0, maxH / h0);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
  return f.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.9) : c.toDataURL('image/png');
}

interface Check { ok: boolean; text: string; go?: Page }

export function ReportPage() {
  const { project, result, commit, toast, go } = useApp();
  const [withOptions, setWithOptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paged, setPaged] = useState<Paged | null>(null);
  const blocks = useMemo(() => (project && result ? buildReport(project, result, { appendixOptions: withOptions }) : []), [project, result, withOptions]);
  const meta = useMemo(() => (project && result ? reportMeta(project, result) : null), [project, result]);
  useEffect(() => {
    if (!meta) return;
    const before = document.title;
    const name = meta.fileName.replace(/\.docx$/, '');
    const set = () => { document.title = name; };
    const reset = () => { document.title = before; };
    window.addEventListener('beforeprint', set);
    window.addEventListener('afterprint', reset);
    return () => { window.removeEventListener('beforeprint', set); window.removeEventListener('afterprint', reset); reset(); };
  }, [meta]);
  if (!project || !result || !meta) return null;

  const s = project.setup;
  const missing = [['project name', s.projectName], ['location', s.location], ['floor area', s.area], ['client', s.client], ['company', s.company],
    ['assessor', s.assessor], ['report reference', s.reportRef]].filter(([, v]) => !v).map(([k]) => k as string);
  const empty = (d: typeof result.base) => d.lines.filter((l) => !l.isExtra && !l.active).length;
  const eb = empty(result.base), ep = empty(result.prop);
  const qa = result.base.qaCount + result.prop.qaCount;
  const exp = result.base.expiredCount + result.prop.expiredCount;
  const checks: Check[] = [
    missing.length ? { ok: false, text: `Setup: add the ${missing.join(', ')}`, go: 'setup' } : { ok: true, text: 'Project details complete' },
    eb + ep ? { ok: false, text: `${eb + ep} BOQ line${eb + ep === 1 ? '' : 's'} without a material (baseline ${eb}, proposed ${ep})`, go: 'designs' } : { ok: true, text: 'Every BOQ line has a material in both designs' },
    qa ? { ok: false, text: `${qa} data QA note${qa === 1 ? '' : 's'} to resolve`, go: 'designs' } : { ok: true, text: 'No data QA notes' },
    exp ? { ok: false, text: `${exp} line${exp === 1 ? '' : 's'} use an expired EPD`, go: 'designs' } : { ok: true, text: 'No expired EPDs' },
    result.leed.spOk ? { ok: true, text: `Study period ${result.sp} years` } : { ok: false, text: `Study period below the LEED minimum of ${result.sys.minSp} years`, go: 'setup' },
  ];

  const word = async () => {
    setBusy(true);
    try {
      const { exportDocx } = await import('../../report/docx.ts');
      downloadBlob(await exportDocx(blocks, meta), meta.fileName);
      toast(`Word report saved: ${meta.fileName}`);
    } catch (e: any) {
      console.error(e);
      toast(`The Word report could not be made: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };
  const addLogo = async () => {
    const f = await pickFile('image/png,image/jpeg,image/svg+xml,image/webp');
    if (!f) return;
    try {
      const url = await shrinkImage(f);
      commit((p) => { p.setup.logo = url; });
      toast('Logo placed on the report cover');
    } catch {
      toast('This image could not be read. Use a PNG or JPEG file.');
    }
  };
  return (
    <div className="page report-page">
      <div className="rpt-toolbar no-print">
        <div className="page-head" style={{ marginBottom: 10 }}>
          <div className="grow">
            <div className="step-label">Step 5</div>
            <h1>LEED report</h1>
            <p className="lede">The submission report, page by page as it prints. Save it as PDF from the print dialog, or export an editable Word file.</p>
          </div>
          <div className="row wrap">
            <button className="btn" onClick={addLogo}><Icon.upload /> {s.logo ? 'Replace logo' : 'Company logo'}</button>
            {s.logo && <button className="btn ghost" onClick={() => commit((p) => { p.setup.logo = null; })} title="Remove the logo from the cover"><Icon.x /></button>}
            <button className="btn" onClick={() => window.print()} title="Choose ‘Save as PDF’ as the printer for a PDF file"><Icon.print /> Print or save as PDF</button>
            <button className="btn primary" onClick={word} disabled={busy}><Icon.word /> {busy ? 'Making the Word file…' : 'Export to Word'}</button>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {checks.map((c, k) => (
            <button key={k} className={`chip ${c.ok ? 'green' : 'amber'}`} onClick={() => c.go && go(c.go)} disabled={!c.go} title={c.go ? 'Open the page to fix it' : undefined}>
              {c.ok ? '✓' : '⚠'} {c.text}
            </button>
          ))}
          <span className="spacer" />
          {result.designs.length > 2 && (
            <label className="check small"><input type="checkbox" checked={withOptions} onChange={(e) => setWithOptions(e.target.checked)} /> Appendix B: design options</label>
          )}
          <span className="rpt-status">{paged ? `${paged.pages.length} A4 pages` : 'Laying out the pages…'}</span>
        </div>
        <p className="help" style={{ marginTop: 6 }}>Word asks to update the fields when the file opens: answer Yes to fill in the page numbers of the contents. In the print dialog, turn on “Background graphics” if the green bands are missing.</p>
      </div>
      <ReportView blocks={blocks} meta={meta} onPaged={setPaged} />
    </div>
  );
}
