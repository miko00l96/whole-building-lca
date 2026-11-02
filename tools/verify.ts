// Engine verification against LibreOffice-recalculated Excel builds (private data; run in Claude's workspace).
// node --experimental-strip-types tools/verify.ts <data_out_dir> [YYYY-MM-DD]
import { readFileSync } from 'node:fs';
import { Library, normalise } from '../src/engine/library.ts';
import { computeProject } from '../src/engine/calc.ts';
import { pathTarget } from '../src/engine/leed.ts';
import { contractor } from '../src/engine/text.ts';
import type { Project, Src } from '../src/engine/types.ts';

const dir = process.argv[2];
const today = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const J = (p: string) => JSON.parse(readFileSync(`${dir}/${p}`, 'utf8'));
const lib = new Library();
for (const [src, file, origin] of [['EPD', 'private/epd.json', 'private'], ['IDEMAT', 'private/idemat.json', 'private'],
  ['ÖKOBAUDAT', 'public/oekobaudat.json', 'public'], ['ecoinvent', 'private/ecoinvent.json', 'private']] as [Src, string, 'public' | 'private'][]) {
  const d = J(file);
  lib.set(src, d.rows.map((r: any) => normalise(src, r)), { src, title: d.title, count: d.rows.length, origin });
}
lib.lists = J('private/lists.json');
const samples: Project[] = J('private/samples.json');
const expected = J('private/expected.json');
const IND = ['GWP', 'ODP', 'AP', 'EPfw', 'EPm', 'EPt', 'POCP', 'ADPf'];
const ST = ['A13', 'A4', 'B45', 'C14', 'TOT'];
let fails = 0, checks = 0;
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) + 1e-12;
function chk(label: string, got: unknown, exp: unknown) {
  checks++;
  const ok = typeof exp === 'number' && typeof got === 'number' ? close(got, exp) : String(got ?? '') === String(exp ?? '');
  if (!ok) { fails++; if (fails < 60) console.log('  ✗', label, 'got', got, 'expected', exp); }
}

for (const p of samples) {
  const e = expected[p.id];
  const r = computeProject(p, lib, today);
  console.log(`\n${p.id}: baseline ${r.base.total[0].toFixed(2)}  proposed ${r.prop.total[0].toFixed(2)}  ` +
    `change ${(100 * (r.leed.change[0] ?? 0)).toFixed(2)} %  points ${r.leed.points} (${r.leed.pathLabel})`);
  for (const [k, sheet] of [[0, 'Baseline'], [1, 'Proposed']] as [number, string][]) {
    const lines = r.designs[k].lines.filter((l) => l.active);
    chk(`${sheet} active lines`, lines.length, e[sheet].length);
    lines.forEach((l, j) => {
      const x = e[sheet][j];
      if (!x) return;
      const tag = `${sheet} line ${l.pos}`;
      IND.forEach((ind, i) => ST.forEach((s) => {
        const got = s === 'TOT' ? l.tot[i] : (l.stages as any)[s][i];
        chk(`${tag} ${ind}_${s}`, got, x[`${ind}_${s}`] ?? 0);
      }));
      chk(`${tag} modD`, l.modD, x.modD ?? 0);
      chk(`${tag} qty`, l.qty, x.qty ?? 0);
      chk(`${tag} kgpu`, l.kgpu, x.kgpu);
      chk(`${tag} repl`, l.repl, x.repl);
      chk(`${tag} unit`, l.unit, x.unit);
      chk(`${tag} stat`, l.stat, x.stat);
      chk(`${tag} epx`, l.epx ? 1 : 0, x.epx);
      chk(`${tag} srcchk`, l.srcchk, x.srcchk);
      chk(`${tag} pdelta`, l.pdelta ?? '', x.pdelta ?? '');
    });
  }
  const R = e.results;
  IND.forEach((_, i) => {
    chk(`Results H${5 + i}`, r.base.total[i], R[`H${5 + i}`]);
    chk(`Results M${5 + i}`, r.prop.total[i], R[`M${5 + i}`]);
  });
  chk('Results H13 module D', r.base.modD, R.H13); chk('Results M13 module D', r.prop.modD, R.M13);
  r.leed.six.forEach((x, i) => { chk(`F${17 + i}`, x.change ?? 'n/a', R[`F${17 + i}`]); chk(`G${17 + i}`, x.plaus, R[`G${17 + i}`]); });
  r.leed.paths.forEach((x, i) => chk(`P${26 + i}`, x.met ? 'YES' : 'NO', R[`P${26 + i}`]));
  const j31 = r.leed.sys === 'ID+C' ? `${r.leed.ptsIdc} (v4.1 Option 3)` : `${r.leed.ptsBdc41} (v4.1)  |  ${r.leed.ptsBdc4} (v4)`;
  chk('J31', j31, R.J31);
  chk('C33 QA', `${r.base.qaCount} / ${r.prop.qaCount}`, R.C33);
  chk('J32 status', r.leed.status, R.J32);
  for (let i = 0; i < 8; i++) { chk(`B6 D${46 + i}`, r.base.b6[i], R[`D${46 + i}`]); chk(`B6 E${46 + i}`, r.prop.b6[i], R[`E${46 + i}`]); }
  chk('COV base', r.base.cov, e.chart.cov[0]); chk('COV prop', r.prop.cov, e.chart.cov[1]);
  chk('EPCOV base', r.base.epcov, e.chart.epcov[0]); chk('EPCOV prop', r.prop.epcov, e.chart.epcov[1]);
  // contractor part A
  const con = contractor(r, p);
  const expA = (e.contractor as any[][]).filter((row) => row[0] !== '' && row[0] != null);
  chk('contractor rows', con.partA.length, expA.length);
  con.partA.forEach((row, j) => {
    const x = expA[j]; if (!x) return;
    chk(`contractor ${j + 1} line`, row.pos, x[0]);
    chk(`contractor ${j + 1} saved`, row.saved, x[8]);
    chk(`contractor ${j + 1} share`, row.share ?? '', x[9]);
    chk(`contractor ${j + 1} fGWP`, row.fGwp, x[10]);
    chk(`contractor ${j + 1} breakeven`, row.breakEven ?? '–', x[11]);
  });
  void pathTarget;
}
console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
