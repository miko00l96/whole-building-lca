// The LEED LCA report as a list of blocks (same sections and wording as the Excel Report sheet, v7.1). Rendered as HTML
// (preview, print to PDF) and as Word (.docx).
import type { ProjectResult } from '../engine/calc.ts';
import type { Project, Src } from '../engine/types.ts';
import { IND_NAME, IND_UNIT, EP_NAME, EP_UNIT, shortName } from '../engine/rules.ts';
import { conclusions, recommendations, epDrivers, epFallbacksText } from '../engine/text.ts';
import { lib } from '../data/libraryStore.ts';
import * as C from '../ui/charts.ts';
import type { EOption } from '../ui/components/Chart.tsx';

export type Cell = string | { text: string; tone?: 'good' | 'bad' | 'warn' | 'muted'; bold?: boolean; align?: 'r' | 'c' };
export type Block =
  | { t: 'cover' }
  | { t: 'toc' }
  | { t: 'h1'; text: string; toc: string; level?: 0 | 1 }
  | { t: 'h2'; text: string; toc?: string }
  | { t: 'p'; text: string; tone?: 'note' | 'small'; bullet?: boolean }
  | { t: 'kv'; rows: [string, string][] }
  | { t: 'tiles'; items: { lab: string; val: string; sub: string; tone?: 'good' | 'bad' }[] }
  | { t: 'table'; head: string[]; rows: Cell[][]; widths: number[]; caption?: string; total?: Cell[]; small?: boolean }
  | { t: 'chart'; title: string; option: EOption; h: number }
  | { t: 'figure'; caption: string }
  | { t: 'decl' }
  | { t: 'break'; word?: boolean }; // word = also a page break in the Word export (the others follow the Excel page plan)

export const APP_VERSION = '1.0';
export const TOOL = `Whole building LCA web app ${APP_VERSION}`;
const f0 = (x: number) => Math.round(x).toLocaleString('en-US');
const f1 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sci = (x: number) => (x === 0 ? '0' : x.toExponential(3).replace('e', 'E'));
const perM2 = (x: number) => (Math.abs(x) >= 100 ? f1(x) : Math.abs(x) >= 1 ? f2(x) : x.toFixed(4));
const chg = (x: number | null) => (x == null ? 'n/a' : `${x > 0 ? '▲' : x < 0 ? '▼' : ''} ${Math.abs(x * 100).toFixed(1)}%`.trim());
const pc = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const date = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export interface ReportOptions {
  appendixOptions: boolean;
}

export function buildReport(p: Project, r: ProjectResult, o: ReportOptions = { appendixOptions: true }): Block[] {
  const s = p.setup, sys = r.sys, L = r.leed, idc = sys.sys === 'ID+C';
  const area = s.area ?? 0;
  const B: Block[] = [];
  const con = conclusions(r, p);
  B.push({ t: 'cover' }, { t: 'break', word: true }, { t: 'toc' }, { t: 'break', word: true });

  // executive summary
  B.push({ t: 'h1', text: 'EXECUTIVE SUMMARY', toc: 'Executive summary', level: 0 });
  B.push({ t: 'tiles', items: [
    { lab: 'BASELINE GWP (A1–C4)', val: `${f0(r.base.total[0] / 1000)} t CO2e`, sub: area ? `${f1(r.base.total[0] / area)} kg CO2e/m²` : '' },
    { lab: 'PROPOSED GWP (A1–C4)', val: `${f0(r.prop.total[0] / 1000)} t CO2e`, sub: area ? `${f1(r.prop.total[0] / area)} kg CO2e/m²` : '' },
    { lab: 'GWP CHANGE', val: chg(L.change[0]), sub: `${(r.prop.total[0] - r.base.total[0]) / 1000 > 0 ? '+' : '−'}${f0(Math.abs(r.prop.total[0] - r.base.total[0]) / 1000)} t CO2e`, tone: (L.change[0] ?? 0) < 0 ? 'good' : 'bad' },
    { lab: sys.ptsLabel, val: `${L.points} point${L.points === 1 ? '' : 's'}`, sub: 'indicative · see section 4' },
  ] });
  B.push({ t: 'h2', text: `Results for the six LEED impact categories (A1–C4, ${idc ? 'interior scope of work' : 'whole building'})` });
  const indN = ['Climate change (GWP)', 'Ozone depletion (ODP)', 'Acidification (AP)', EP_NAME[s.epIndicator], 'Photochemical ozone (POCP)', 'Abiotic depletion, fossil'];
  const indU = ['kg CO2e', 'kg CFC-11e', 'mol H+ eq', EP_UNIT[s.epIndicator], 'kg NMVOC eq', 'MJ'];
  const status = (i: number, c: number | null): Cell => {
    if (c == null) return 'n/a';
    if (idc) {
      if (i === 0) return c <= -0.2 ? { text: '✓ ≥20%', tone: 'good' } : c <= -0.1 ? { text: '✓ ≥10%', tone: 'good' } : c > 0 ? { text: '▲ higher', tone: 'warn' } : '–';
      return c <= -0.1 ? { text: '✓ ≥10%', tone: 'good' } : c > 0 ? { text: '▲ higher', tone: 'warn' } : '–';
    }
    return c <= -0.1 ? { text: '✓ ≥10%', tone: 'good' } : c <= -0.05 ? { text: '✓ ≥5%', tone: 'good' } : c > 0.05 ? { text: '✗ up >5%', tone: 'bad' } : '–';
  };
  B.push({ t: 'table', head: ['LEED impact category', 'Indicator', 'Unit', 'Baseline', 'Proposed', 'Change', 'Status'], widths: [22, 20, 10, 14, 14, 10, 10],
    rows: L.six.map((x, i) => [x.name, indN[i], indU[i], { text: i === 1 ? sci(x.base) : i === 0 || i === 5 ? f0(x.base) : f2(x.base), align: 'r' },
      { text: i === 1 ? sci(x.prop) : i === 0 || i === 5 ? f0(x.prop) : f2(x.prop), align: 'r' },
      { text: chg(x.change), bold: true, align: 'c', tone: x.change == null ? undefined : (idc ? x.change > 0 && L.higherCount > 1 : x.change > 0.05) ? 'bad' : x.change < 0 ? 'good' : 'warn' }, status(i, x.change)]) });
  B.push({ t: 'p', tone: 'note', text: 'Tropospheric ozone is reported as POCP (kg NMVOC eq) and non-renewable energy as ADP-fossil (MJ). All eight indicators, per-m² values, Module D and B6 are in section 9.' });
  B.push({ t: 'h2', text: `${sys.label} ${sys.opt} · indicative result` });
  B.push({ t: 'kv', rows: [
    ['Indicative points', `${L.points} point${L.points === 1 ? '' : 's'} · ${L.pathLabel} · ${L.otherPts}`],
    ['Key figures', idc
      ? `GWP ${chg(L.change[0])} (Path 3 needs ≥20% lower); other categories ≥10% lower: ${L.other10} (needs 2); categories higher: ${L.higherCount} (at most 1); reuse/salvage in proposed: ${L.reuse ? 'YES' : 'NO'}; study period ≥20 years: ${L.spOk ? 'YES' : 'NO'}; BOQ lines with LCA data: ${pc(r.base.cov)} / ${pc(r.prop.cov)}`
      : `GWP ${chg(L.change[0])}; categories reduced ≥5%: ${L.red5} of 6; ≥10%: ${L.red10} of 6; largest increase: ${L.maxIncrease == null ? 'n/a' : pc(L.maxIncrease, 1)}; no category up >5%: ${L.noneUp}; reuse/salvage in proposed: ${L.reuse ? 'YES' : 'NO'}; study period ≥60 years: ${L.spOk ? 'YES' : 'NO'}`],
    ['Conclusion', con.summary],
    ['Status', L.status],
  ] });
  B.push({ t: 'break', word: true });

  // 1 project details
  B.push({ t: 'h1', text: '1.  PROJECT DETAILS', toc: '1   Project details' });
  B.push({ t: 'kv', rows: [
    ['Project name', s.projectName], ['LEED rating system', sys.cover], ['Location', s.location], ['Building use', s.buildingUse],
    [sys.areaLabel, area ? `${f0(area)} m²` : ''], ['Number of floors', s.floors],
    [idc ? 'Study period (interior service life)' : 'Study period (building service life)', `${r.sp} years`], ['Client', s.client],
    ['Prepared by', [s.company, s.assessor].filter(Boolean).join(' · ')], ['Assessment date', date(r.assessDate)], ['Report reference', s.reportRef],
  ] });
  B.push({ t: 'h1', text: '2.  GOAL AND SCOPE', toc: '2   Goal and scope' });
  const goal = idc
    ? 'Compare the embodied impacts of the proposed interior fit-out with a baseline interiors project of the same size, function, operating energy performance, system boundary and service life, as LEED v4.1 ID+C MRc Interiors Life-Cycle Impact Reduction, Option 3 (Building Interiors Life Cycle Assessment) requires.'
    : "Compare the embodied impacts of the proposed building's structure and enclosure with a baseline building of equivalent size, function, orientation and operating energy performance, as LEED v4.1 BD+C MRc Building Life-Cycle Impact Reduction, Option 2 requires (LEED v4: Option 4).";
  const ref = idc
    ? `The interior scope of work over a ${r.sp}-year study period (interior service life), ${f0(area)} m² floor area. Both designs use the same bill of quantities, study period, floor area and elements; results are also given per m².`
    : `The whole building (structure and enclosure) over a ${r.sp}-year study period, ${f0(area)} m² gross floor area. Both designs use the same bill of quantities, study period, floor area and building elements; results are also given per m².`;
  const scope = idc
    ? "Included: the project's entire scope of work as entered on the BOQ – structure and enclosure where they are part of the work, flooring and wall base, subfloors and access floors, walls and interior partitions (with acoustic insulation and metal framing), wall finishes and coatings, ceilings, doors and hardware, interior glazing, furniture, furnishings and casework, lighting, cabling, ductwork, piping, plumbing fixtures and fire suppression. Excluded: elements outside the scope of work."
    : 'Included: footings and foundations, structural frame, floor and roof structure, exterior walls and cladding, windows and curtain wall, roof covering and insulation. Excluded, as LEED allows: MEP equipment and controls, plumbing fixtures, fire detection and alarm, elevators and conveying systems, excavation and site development, surface parking.';
  const fbUsed = r.base.epxCount + r.prop.epxCount > 0;
  const ind = 'EN 15804+A2 core indicators (EF 3.x characterisation). GWP = GWP-fossil + GWP-luluc (biogenic carbon excluded). Tropospheric ozone is reported as POCP (kg NMVOC eq) and non-renewable energy as ADP-fossil (MJ). LEED names eutrophication in kg N eq (TRACI) or kg PO4 eq (CML); EN 15804+A2 splits it into freshwater (kg P eq), marine (kg N eq) and terrestrial (mol N eq). '
    + (s.epIndicator === 'EPm' ? 'The LEED category is reported as eutrophication, marine: the EN 15804+A2 indicator in the TRACI unit (kg N eq), which counts nitrogen emissions to water and air. Phosphorus is counted by the freshwater indicator; freshwater and terrestrial are given in section 9 for information.'
      : `The LEED category is reported as ${EP_NAME[s.epIndicator].toLowerCase()}; LEED names kg N eq or kg PO4 eq.`)
    + (fbUsed ? ' Where a dataset has no eutrophication data, a similar generic dataset gives the three eutrophication indicators (section 12).' : '')
    + ' LEED names TRACI or CML: the use of EN 15804+A2 is stated here and in the credit narrative.';
  B.push({ t: 'kv', rows: [['Goal', goal], ['Reference unit', ref], ['Scope', scope], ['Indicators', ind]] });
  B.push({ t: 'break' });
  B.push({ t: 'h2', text: '2.1  SYSTEM BOUNDARY', toc: '2.1   System boundary' });
  B.push({ t: 'p', text: 'As shown in Figure 1, the system boundary includes the following life-cycle stages: raw material supply (A1), transport (A2), manufacturing (A3), transport to the construction site (A4), replacement and refurbishment (B4–B5) and end of life (C1–C4). Module D and operational energy use (B6) are calculated but reported separately, outside the LEED comparison. All other stages are excluded.' + (idc ? ' LEED v4.1 ID+C requires modules A1–A3 at a minimum and a cradle-to-grave boundary in total; both are met.' : '') });
  B.push({ t: 'figure', caption: 'Figure 1: Life-cycle stages included in the system boundary (EN 15978 modules)' });

  // 3 tool and data
  B.push({ t: 'h1', text: '3.  LCA TOOL AND DATA REQUIREMENTS', toc: '3   LCA tool and data requirements' });
  const libs: string[] = [];
  const n = (sx: Src) => lib.bySrc[sx].length;
  if (lib.has('IDEMAT')) libs.push(`IDEMAT 2026 (Delft University of Technology, ${f0(n('IDEMAT'))} datasets)`);
  if (lib.has('ÖKOBAUDAT')) libs.push(`ÖKOBAUDAT OBD 2024-II (${f0(lib.materials('ÖKOBAUDAT').length)} EN 15804+A2 datasets)`);
  if (lib.has('ecoinvent')) libs.push(`ecoinvent 3.9.1 (cut-off system model, ${f0(lib.materials('ecoinvent').length)} selected building datasets)`);
  if (lib.has('EPD')) libs.push(`a library of ${f0(n('EPD'))} product-specific EPDs, mainly for products made in Egypt and the GCC countries (EPD International, EPD Hub, ICIS, SCS Global Services and other programme operators)`);
  const libTxt = libs.length > 1 ? `${libs.slice(0, -1).join(', ')} and ${libs[libs.length - 1]}` : libs[0] ?? 'ÖKOBAUDAT';
  B.push({ t: 'p', text: `The LCA has been carried out with ${TOOL}, a browser-based LCA tool built for LEED BD+C (whole-building LCA) and LEED v4.1 ID+C (interiors LCA); its calculation follows the Whole building LCA spreadsheet tool line by line. ${libs.length > 1 ? 'It combines' : 'It uses'} ${libTxt}. All results are calculated with EN 15804+A2 indicators.` });
  B.push({ t: 'p', text: "The data required for the assessment is collected for each stage included within the system boundary, being A1–A3, A4, B4–B5 and C1–C4 (refer to Figure 1). The data requirements for A1–A3 include the material type and quantity, which are taken from the project's bill of quantities (BOQ); the BOQ is entered once and used for both the baseline and the proposed design. For A4, the transport mode and distance from the supplier to the site are given for each material, with transport datasets per tonne-km." });
  B.push({ t: 'p', text: `For B4 and B5, the data requirements include the service life of each building material, which may differ from the study period of the building (${r.sp} years). The materials are assumed to be replaced in their entirety at the end of their service life, so a material with a shorter service life is replaced several times (replacements = ROUNDUP(study period ÷ service life) − 1). For C1–C4, the end-of-life modules declared in the EPD or ÖKOBAUDAT dataset are used; otherwise the end-of-life process chosen for the material (EN 15804 cut-off approach), plus ${s.c2km ?? 0} km transport to waste processing. The data requirements and sources are summarised in Table 1.` });
  B.push({ t: 'table', head: ['Life-cycle stage', 'Data requirement', 'Source / default in this tool'], widths: [22, 32, 46], caption: 'Table 1: Data requirements and sources per life-cycle stage', rows: [
    ['A1–A3  Product', 'Material type and quantity', 'Project BOQ; EPD, ÖKOBAUDAT, ecoinvent or IDEMAT dataset per material'],
    ['A4  Transport to site', 'Transport mode and distance per material', 'Supplier location; IDEMAT, ecoinvent or ÖKOBAUDAT transport (default on Setup)'],
    ['B4–B5  Replacement', 'Service life of each material', 'Typical service life entered per BOQ line'],
    ['C1–C4  End of life', 'End-of-life scenario per material', 'EPD or ÖKOBAUDAT C modules, else an ecoinvent, ÖKOBAUDAT or IDEMAT process'],
    ['D  Beyond the life cycle', 'Reuse, recovery and recycling benefits', 'EPD, ÖKOBAUDAT or IDEMAT; reported separately'],
    ['B6  Operational energy', 'Annual electricity use', 'Energy model + grid factor (IDEMAT 2026, ecoinvent 3.9.1 or custom); reported separately'],
  ] });
  B.push({ t: 'break' });

  // 4 paths
  B.push({ t: 'h1', text: `4.  ${sys.label} ${sys.opt.toUpperCase()} – COMPLIANCE PATHS (indicative)`, toc: `4   ${sys.label} ${sys.opt} compliance paths` });
  B.push({ t: 'table', head: ['Path', 'Points', 'Requirement', 'Status'], widths: [12, 8, 62, 18], rows: L.paths.map((x) => [{ text: x.label, bold: true }, { text: x.points, align: 'c' }, x.requirement, x.met ? { text: '✓  met', tone: 'good', bold: true, align: 'c' } : { text: '✗  not met', tone: 'muted', align: 'c' }]) });
  B.push({ t: 'p', tone: 'note', text: idc ? 'Path 3 also requires reused or salvaged materials in the proposed design and allows no more than one impact category to increase. Points are indicative until GBCI review; the status line in the executive summary lists anything still to resolve.'
    : 'Paths 2–4 also require that no category increases by more than 5%. Points are indicative until GBCI review; the status line in the executive summary lists anything still to resolve.' });
  B.push({ t: 'h1', text: '5.  RESULTS BY IMPACT CATEGORY AND LIFE-CYCLE STAGE', toc: '5   Results by impact category and life-cycle stage' });
  B.push({ t: 'chart', title: 'Change vs baseline – six LEED impact categories', option: C.sixCategories(r), h: 250 });
  B.push({ t: 'chart', title: 'GWP by life-cycle stage (t CO2e)', option: C.byStage(r, [r.base, r.prop]), h: 250 });
  B.push({ t: 'break' });
  B.push({ t: 'h1', text: '6.  RESULTS BY ELEMENT AND MATERIAL CLASS', toc: '6   Results by element and material class' });
  B.push({ t: 'chart', title: 'GWP by element category (t CO2e)', option: C.byElement(r, [r.base, r.prop]), h: 255 });
  B.push({ t: 'chart', title: 'Where the GWP change comes from, by element (t CO2e)', option: C.changeByElement(r), h: 225 });
  B.push({ t: 'chart', title: 'GWP by material class (t CO2e)', option: C.byClass(r), h: 250 });
  B.push({ t: 'break' });

  // 7 top 15
  B.push({ t: 'h1', text: '7.  TOP CONTRIBUTORS (proposed design, A1–C4)', toc: '7   Top contributors' });
  const top = r.prop.lines.filter((l) => l.active && l.tot[0] > 0).sort((a, b) => b.tot[0] - a.tot[0]).slice(0, 15);
  B.push({ t: 'table', head: ['Element category', 'Material / product', 'Source', 'Quantity', 't CO2e', 'Share of total'], widths: [19, 40, 13, 12, 8, 8],
    rows: top.map((l) => [l.elem, l.mat.replace('CHECK – ', '').slice(0, 90), l.src, { text: `${f0(l.qty)} ${l.unit}`, align: 'r' }, { text: f1(l.tot[0] / 1000), bold: true, align: 'r' }, { text: pc(l.tot[0] / (r.prop.total[0] || 1), 1), align: 'r' }]) });
  B.push({ t: 'h1', text: '8.  DATA SOURCES AND DATA QUALITY', toc: '8   Data sources and data quality' });
  const cnt = (d: typeof r.base, sx: string) => d.lines.filter((l) => l.active && l.src === sx).length;
  B.push({ t: 'table', head: ['Item', 'Baseline', 'Proposed'], widths: [60, 20, 20], rows: [
    ['Bill-of-materials lines', String(r.base.lines.filter((l) => l.active).length), String(r.prop.lines.filter((l) => l.active).length)],
    ...(['EPD', 'ÖKOBAUDAT', 'ecoinvent', 'IDEMAT'] as Src[]).map((sx) => [`Lines using ${sx} data`, String(cnt(r.base, sx)), String(cnt(r.prop, sx))] as Cell[]),
    ...(['EPD', 'ÖKOBAUDAT', 'IDEMAT', 'ecoinvent'] as Src[]).map((sx) => [`Share of GWP from ${sx} data`, pc(r.base.srcShare[sx]), pc(r.prop.srcShare[sx])] as Cell[]),
    ['Lines with data QA notes', String(r.base.qaCount), String(r.prop.qaCount)],
    ['Lines using an expired EPD', String(r.base.expiredCount), String(r.prop.expiredCount)],
    ['BOQ lines with life-cycle data (LEED ID+C asks for at least 95% of the materials)', pc(r.base.cov), pc(r.prop.cov)],
    ['Share of GWP on lines with eutrophication data (incl. fallbacks, section 9.1)', pc(r.base.epcov, 1), pc(r.prop.epcov, 1)],
    ['Elements with a different data source in the other design', String(r.base.diffSrc), String(r.prop.diffSrc)],
  ].map((row) => row.map((c, i) => (i === 0 ? c : { text: String(c), align: 'c' as const }))) });
  B.push({ t: 'chart', title: 'Data source mix (share of GWP)', option: C.sourceMix(r, [r.base, r.prop]), h: 165 });
  B.push({ t: 'break' });

  // 9 indicators
  B.push({ t: 'h1', text: `9.  ALL EN 15804+A2 INDICATORS (A1–C4, ${idc ? 'interior scope of work' : 'whole building'})`, toc: '9   All EN 15804+A2 indicators' });
  B.push({ t: 'table', head: ['Indicator', 'Unit', 'Baseline', 'Proposed', 'Change', 'Baseline per m²', 'Proposed per m²'], widths: [28, 12, 14, 14, 10, 11, 11],
    rows: [...IND_NAME.map((nm, i) => {
      const s_ = i === 1 || i === 3;
      return [{ text: nm, bold: true }, IND_UNIT[i], { text: s_ ? sci(r.base.total[i]) : f1(r.base.total[i]), align: 'r' }, { text: s_ ? sci(r.prop.total[i]) : f1(r.prop.total[i]), align: 'r' },
        { text: chg(L.change[i]), align: 'c', bold: true, tone: (L.change[i] ?? 0) < 0 ? 'good' : 'bad' },
        { text: area ? (s_ ? sci(r.base.total[i] / area) : perM2(r.base.total[i] / area)) : '', align: 'r' }, { text: area ? (s_ ? sci(r.prop.total[i] / area) : perM2(r.prop.total[i] / area)) : '', align: 'r' }] as Cell[];
    }),
    [{ text: 'Module D, GWP (kg CO2e) – not in the totals', tone: 'muted' }, '', { text: f0(r.base.modD), align: 'r', tone: 'muted' }, { text: f0(r.prop.modD), align: 'r', tone: 'muted' }, { text: 'reported separately', tone: 'muted', align: 'c' }, '', ''],
    [{ text: 'B6 electricity, GWP over the study period (kg CO2e)', tone: 'muted' }, '', { text: f0(r.base.b6[0]), align: 'r', tone: 'muted' }, { text: f0(r.prop.b6[0]), align: 'r', tone: 'muted' }, { text: 'reported separately', tone: 'muted', align: 'c' }, '', '']] });
  const ep = epDrivers(r, p);
  B.push({ t: 'h2', text: '9.1  Eutrophication: indicator used for LEED and main drivers', toc: '9.1   Eutrophication: indicator used and main drivers' });
  const epC = L.six[3].change;
  B.push({ t: 'p', text: `The LEED eutrophication category uses ${EP_NAME[s.epIndicator].toLowerCase()} (${ep.unit}), ${epC == null ? 'not yet compared' : `${epC > 0 ? '+' : '−'}${Math.abs(epC * 100).toFixed(1)}% against the baseline`}. `
    + (ep.agree === true ? `The three EN 15804+A2 eutrophication indicators change in the same direction (${ep.direction}).` : ep.agree === false ? `The three EN 15804+A2 eutrophication indicators do not change in the same direction (${ep.direction}). They count different emissions and receiving environments – marine counts nitrogen, freshwater counts phosphorus, terrestrial counts airborne nitrogen – so they are not added together; the LEED result uses ${EP_NAME[s.epIndicator].toLowerCase()} and the other two are given for transparency.` : '')
    + ' The lines below cause most of the change in the LEED indicator.' + (fbUsed ? ' Lines marked * take their eutrophication from a fallback dataset (section 12).' : '') });
  B.push({ t: 'table', head: ['BOQ line', 'Data (baseline → proposed)', 'Baseline', 'Proposed', 'Change', 'Share of net change'], widths: [36, 20, 11, 11, 11, 11],
    rows: ep.drivers.length ? ep.drivers.map((d) => [d.item, { text: d.data, align: 'c' }, { text: f2(d.base), align: 'r' }, { text: f2(d.prop), align: 'r' }, { text: `${d.change > 0 ? '+' : '−'}${f2(Math.abs(d.change))}`, align: 'r', bold: true, tone: d.change < 0 ? 'good' : 'bad' }, { text: d.share == null ? '' : pc(d.share), align: 'c' }])
      : [['No eutrophication difference between the designs yet.', '', '', '', '', '']] });
  B.push({ t: 'p', tone: 'note', text: `Values in ${ep.unit} over A1–C4. Change = proposed − baseline for the same BOQ line; share = line change ÷ net change of the design. * = eutrophication from a fallback dataset (section 12).` });
  B.push({ t: 'h1', text: '10.  CONCLUSIONS', toc: '10   Conclusions' });
  for (const t of [con.intro, con.results, con.increases, con.summary]) if (t) B.push({ t: 'p', text: t });
  B.push({ t: 'break' });

  // 11 recommendations, 12 assumptions, 13 attribution, declaration
  B.push({ t: 'h1', text: '11.  FURTHER RECOMMENDATIONS', toc: '11   Further recommendations' });
  B.push({ t: 'p', text: `Based on this study, it is further recommended that the following actions be undertaken to reduce the environmental impact in comparison to standard practice${s.location ? ` in ${s.location}` : ''}:` });
  const recs = recommendations(r, p);
  if (!recs.length) B.push({ t: 'p', bullet: true, text: 'No line-level reductions were found yet: choose lower-carbon materials on the proposed design.' });
  for (const x of recs) B.push({ t: 'p', bullet: true, text: x.text });
  if (s.extraRecs) for (const line of s.extraRecs.split('\n').filter(Boolean)) B.push({ t: 'p', bullet: true, text: line });
  B.push({ t: 'p', text: 'Specifications to the contractor should therefore include the materials above, or equivalent products with an EPD showing an equal or lower GWP for the same declared unit.' });
  B.push({ t: 'h1', text: '12.  ASSUMPTIONS AND LIMITATIONS', toc: '12   Assumptions and limitations' });
  const fbTxt = epFallbacksText(r, p);
  for (const t of [
    "Generic data (IDEMAT 2026, ÖKOBAUDAT, ecoinvent 3.9.1) are European, global or regional averages; product EPDs are used where available. The same data source is used for the same element in both designs unless the bill of materials flags 'DIFFERENT source'.",
    'IDEMAT follows ISO 14040/44 and EN 15804 but is self-declared, not third-party verified. ÖKOBAUDAT generic datasets include a safety surcharge, so a generic baseline compared with an EPD-based proposal can overstate the reduction.',
    `A4 transport uses the transport dataset per tonne-km chosen on each line, with the distance given on the line. Where a dataset has no C1–C4, end of life uses the ecoinvent, ÖKOBAUDAT or IDEMAT process chosen on the line plus C2 transport of ${s.c2km ?? 0} km.`,
    "Quantities come from the project BOQ and are converted to each dataset's declared unit (directly for kg and t, otherwise through the kg per unit given on the BOQ). EPD values are per declared unit and use the EPD's own mass per unit.",
    fbUsed ? `Eutrophication: some datasets have no eutrophication data or an implausibly low value for their GWP (e.g. IDEMAT steel, concrete and blocks). For these lines the three eutrophication indicators come from a similar generic dataset per kg of material, with the same rule in both designs: ${fbTxt}` : 'Eutrophication: every line uses the eutrophication data of its own dataset; no fallback dataset was needed.',
    `Project notes: ${s.notes || 'none recorded on Setup.'}`,
  ]) B.push({ t: 'p', bullet: true, text: t });
  B.push({ t: 'h1', text: '13.  DATA ATTRIBUTION', toc: '13   Data attribution' });
  const used = new Set([...r.base.lines, ...r.prop.lines].filter((l) => l.active).map((l) => l.src));
  const attr: [Src, string][] = [
    ['IDEMAT', 'IDEMAT 2026 – Delft University of Technology, data from www.ecocostsvalue.com (CC BY-NC 4.0).'],
    ['ÖKOBAUDAT', 'ÖKOBAUDAT OBD 2024-II – German Federal Ministry for Housing, Urban Development and Building (BMWSB) / BBSR, www.oekobaudat.de.'],
    ['ecoinvent', 'ecoinvent 3.9.1, cut-off system model – ecoinvent Association, Zürich (licensed); LCIA with the ecoinvent EF 3.1 implementation.'],
    ['EPD', 'EPD International AB data – International EPD System, www.environdec.com. Other EPDs: EPD Hub, ICIS, CARES, SCS Global Services and the programme operators named on each dataset; each EPD remains the property of its owner.'],
  ];
  for (const [sx, t] of attr) if (used.has(sx) || (sx === 'IDEMAT' && [...r.base.lines, ...r.prop.lines].some((l) => l.a4.startsWith('C.') || l.eol.startsWith('F.')))) B.push({ t: 'p', bullet: true, tone: 'small', text: t });
  B.push({ t: 'h1', text: 'DECLARATION', toc: 'Declaration', level: 0 });
  B.push({ t: 'decl' });
  B.push({ t: 'break', word: true });

  // appendix A
  B.push({ t: 'h1', text: 'APPENDIX A · BILL OF QUANTITIES AND MATERIAL SELECTION', toc: 'Appendix A   Bill of quantities and material selection', level: 0 });
  B.push({ t: 'p', tone: 'small', text: 'Every BOQ line with the material chosen for each design and its GWP (A1–C4, t CO2e). Quantities are the BOQ quantities; where a design uses another quantity, the design table notes it.' });
  const n2 = Math.max(r.base.lines.length, r.prop.lines.length);
  const rows: Cell[][] = [];
  for (let k = 0; k < n2; k++) {
    const b = r.base.lines[k], q = r.prop.lines[k];
    const boq = p.boq[k];
    if (!boq?.item && !b?.active && !q?.active) continue;
    rows.push([`${k + 1} · ${boq?.item || b?.desc || q?.desc || ''}`, { text: boq?.qty ? `${boq.qty.toLocaleString('en-US')} ${boq.unit}` : 'per design', align: 'r' },
      b?.active ? shortName(b.mat, b.src) : '(none)', { text: b?.active ? f1(b.tot[0] / 1000) : '', align: 'r' },
      q?.active ? shortName(q.mat, q.src) : '(none)', { text: q?.active ? f1(q.tot[0] / 1000) : '', align: 'r' }]);
  }
  B.push({ t: 'table', head: ['Line · BOQ item', 'Quantity', 'Baseline material', 'Baseline t CO2e', 'Proposed material', 'Proposed t CO2e'], widths: [24, 11, 25, 7, 26, 7], rows, small: true,
    total: [{ text: `Total, ${rows.length} lines`, bold: true }, '', '', { text: f1(r.base.total[0] / 1000), bold: true, align: 'r' }, { text: `Change ${(r.prop.total[0] - r.base.total[0]) > 0 ? '+' : '−'}${f1(Math.abs(r.prop.total[0] - r.base.total[0]) / 1000)} t CO2e`, bold: true }, { text: f1(r.prop.total[0] / 1000), bold: true, align: 'r' }] });

  if (o.appendixOptions && r.designs.length > 2) {
    B.push({ t: 'break', word: true });
    B.push({ t: 'h1', text: 'APPENDIX B · DESIGN OPTIONS STUDIED', toc: 'Appendix B   Design options studied', level: 0 });
    B.push({ t: 'p', text: 'Further design options were assessed with the same BOQ, study period and rules. The proposed design above is the one submitted for LEED; the options are given for information.' });
    B.push({ t: 'table', head: ['Design', 'GWP A1–C4 (t CO2e)', 'Change vs baseline', 'Categories ≥10% lower', 'Path', 'Points'], widths: [30, 16, 14, 14, 14, 12],
      rows: r.designs.map((d) => { const ld = d.kind === 'baseline' ? null : r.optionLeed[d.designId]; return [d.name + (d.kind === 'proposed' ? ' (submitted)' : ''), { text: f1(d.total[0] / 1000), align: 'r' }, { text: ld ? chg(ld.change[0]) : '–', align: 'c' }, { text: ld ? String(ld.red10) : '–', align: 'c' }, ld ? ld.pathLabel : '–', { text: ld ? String(ld.points) : '–', align: 'c' }] as Cell[]; }) });
    B.push({ t: 'chart', title: 'Design options: total GWP and LEED thresholds', option: C.optionsBars(r), h: 300 });
  }
  return B;
}

/** Cover, header, footer and declaration texts of the report. */
export interface ReportMeta {
  title: string;
  subtitle: string;
  project: string;
  system: string;
  credit: string;
  facts: [string, string][];
  prepared: string;
  header: string;
  footer: string;
  logo: string | null;
  declBy: string;
  declDate: string;
  fileName: string;
  sysShort: 'BDC' | 'IDC';
}

export function reportMeta(p: Project, r: ProjectResult): ReportMeta {
  const s = p.setup, sys = r.sys;
  const used = new Set([...r.base.lines, ...r.prop.lines].filter((l) => l.active).map((l) => l.src));
  const libs: string[] = [];
  if (used.has('IDEMAT')) libs.push('IDEMAT 2026');
  if (used.has('ÖKOBAUDAT')) libs.push('ÖKOBAUDAT');
  if (used.has('ecoinvent')) libs.push('ecoinvent 3.9.1');
  if (used.has('EPD')) libs.push('product EPDs');
  if (!libs.length) libs.push('ÖKOBAUDAT');
  const libTxt = libs.length > 1 ? `${libs.slice(0, -1).join(', ')} and ${libs[libs.length - 1]}` : libs[0];
  const area = s.area ?? 0;
  const by = [s.assessor, s.company].filter(Boolean).join(' · ');
  const sysShort = sys.sys === 'ID+C' ? 'IDC' : 'BDC';
  const safe = (x0: string) => {
    let x = x0.replace(/[–—]/g, '-').replace(/[\\/:*?"<>|]+/g, '_').replace(/[^\x20-\x7E]/g, '_').replace(/_+/g, '_').replace(/\s+/g, ' ').trim();
    const k = x.indexOf(' (');
    if (x.length > 40 && k > 8) x = x.slice(0, k);
    if (x.length > 60) x = x.slice(0, x.lastIndexOf(' ', 60) > 20 ? x.lastIndexOf(' ', 60) : 60);
    return x.replace(/[ ._-]+$/, '');
  };
  return {
    title: sys.title,
    subtitle: 'Analysis Report',
    project: s.projectName || '(project name – enter it on Setup)',
    system: sys.cover,
    credit: `MR credit: ${sys.credit}  ·  ${sys.optName}`,
    facts: [
      ['Location', s.location], [sys.areaLabel, area ? `${f0(area)} m²` : ''], ['Prepared for', s.client], ['Prepared by', s.company],
      ['Report reference', s.reportRef], ['Date of issue', date(r.assessDate)],
    ].filter(([, v]) => v) as [string, string][],
    prepared: `Prepared with ${TOOL}  ·  EN 15804+A2 indicators  ·  ${libTxt}`,
    header: sys.hdr,
    footer: s.company || TOOL,
    logo: s.logo ?? null,
    declBy: by,
    declDate: new Date(r.assessDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    fileName: `${safe(s.projectName || 'Project') || 'Project'}_LEED_${sysShort}_LCA_report_${r.assessDate}.docx`,
    sysShort,
  };
}
