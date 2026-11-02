# Whole building LCA (web app) — brief for Claude

Owner: Michael Hanna (sustainability consultant, REEDS Consultant, Cairo; LEED AP BD+C, LCA specialist). He is not a
programmer: Claude writes, runs and checks everything; Michael reviews the result in the browser. Plain-language summaries.

## What this is
The browser version of the *Whole building LCA* Excel tool (v7.1): LEED BD+C v4.1 Option 2 / v4 Option 4 whole-building LCA
and ID+C v4.1 Option 3 interiors LCA. React 19 + Vite 8 + TypeScript, ECharts, web-ifc (IFC quantities, no 3D), docx. Static site on
GitHub Pages; no server. Everything (projects, data pack, IFC files) stays in the user's browser.
Live site: https://miko00l96.github.io/whole-building-lca/ (repository miko00l96/whole-building-lca, public; every push to
`main` rebuilds and publishes it through `.github/workflows/deploy.yml`). Commits use Michael's GitHub no-reply address.

## Rules
- **Engine fidelity**: `src/engine/` is a line-by-line port of the Excel formulas. Any change to `calc.ts`, `leed.ts`,
  `text.ts`, `library.ts` or `rules.ts` must keep `node --experimental-strip-types tools/verify.ts <data_out> 2026-11-02` at
  **5663 checks, 0 failures** (needs the private data in Claude's workspace). Explain any intended change of results.
- **Licensed data never enters the repository**: EPD library (EPD International data: no redistribution), IDEMAT (needs the
  owner's written agreement for published tools), ecoinvent (licensed). They live in the private data pack (`*.wblca`,
  git-ignored), built with `tools/make_pack.py`. Only ÖKOBAUDAT (`public/data/oekobaudat.json.gz`, attribution) is public.
  Do not commit sample projects that use private datasets (they are inside the pack); `src/data/demo.ts` uses ÖKOBAUDAT only.
- Design (Michael's choice, 2 Nov 2026): the app looks and works like Shoebox (shoebox.idfkit.com): a drawing set with a
  title block, general-notes strip, run-log rail, numbered sheets (A-01 …) and figures, IBM Plex Sans / Sans Condensed /
  Mono, drafting palette in `src/styles/tokens.css` (light vellum; dark follows the system or the rail switch). Chart
  colours come from the theme (`PAL` in `Chart.tsx` reads CSS variables). The **report stays paper**: white A4, Calibri
  (Carlito), the Excel tool's greens (`PAPER` palette; build report charts inside `withPaper()`); it must be ready to submit.
- No 3D building view (Michael removed it): IFC is used for quantities only, from the BOQ step.
- Pinned dependency versions (exact, no ranges). Ask Michael before adding services or anything that sends data out.

## Map
| Path | Role |
|---|---|
| `src/engine/` | types, rules (classes, units, densities), library, calc (BoM engine), leed (paths, points), targets (criteria for Chase), text (report sentences, contractor), alternatives (like-for-like rules), montecarlo, benchmarks, guess |
| `src/data/` | `libraryStore.ts` (public ÖKOBAUDAT, private pack in IndexedDB, search index), `demo.ts` (public example) |
| `src/state/` | `project.ts` (new / migrate / IndexedDB / files), `store.ts` (zustand: project, result, undo, change line, chase, ghost, recalculation time), `share.ts` (project links: gzip + base64url in `#p=`, names removed) |
| `src/ui/` | Shell (title block with the LEED ruler, notes strip, rail), `theme.ts`, pages (IfcImport = IFC quantities window), components (DatasetCard hover cards, DatasetPicker, Chart), `charts.ts` |
| `src/report/` | `model.ts` (report blocks = Excel Report sheet wording), `ReportView.tsx` (measured A4 pagination, print), `docx.ts` (Word), `Figure1.tsx` |
| `src/ifc/` | `parse.ts` (web-ifc reading, shared by the worker and Node), `ifcWorker.ts`, `load.ts`, `takeoff.ts` (groups, units, categories, BOQ links) |
| `tools/` | `extract_master.py`, `make_samples.py`, `make_pack.py`, `verify.ts`, `ifc_test.ts` |
| `tests/` | vitest checks that run without private data (CI runs them) |

## Checks before pushing
`npm run typecheck`, `npm test`, `npm run build`; with private data also `tools/verify.ts`. For UI changes, run the built
site (`npx vite preview`) with Playwright (Chromium is pre-installed in Claude's workspace) and look at screenshots.
`?debug` in the address exposes `window.wblca = { useApp, lib }` for scripted checks.

## Report
`ReportView` measures every block in a hidden 170 mm column and lays out A4 pages (headings kept with what follows, tables
split between rows with repeated headers, no single-row remnants; soft page breaks of the Excel page plan apply only when
a page is at least 40 % full). Printing uses the same sheets, so the PDF page numbers match the contents page. The Word
export keeps only the hard breaks (`break.word`) and lets Word number the contents (it asks to update fields on opening).

## Private copy on claude.ai (made before the site went live; not updated automatically)
Michael's private artifact https://claude.ai/artifact/HEL2Xd3yxUrFcRG7zHVKas (republish to the same URL with `url`). Build with
`VITE_PUBLIC_DATA=data/oekobaudat.json npx vite build --outDir <scratch>`; the page is `index.html` without doctype/html/head/body
(title, icon, CSS link, `<div id="root">`, module script); publish every file except `*.woff` and the `.gz` (unpack it to
`data/oekobaudat.json`: .gz is not served); escape U+FFFD in the docx chunk as `\uFFFD` (the publisher refuses it). In the
artifact frame, printing, file downloads (Word, project files) and `#p=` project links do not work; everything else does.
