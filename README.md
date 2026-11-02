# Whole building LCA (web app)

Embodied carbon for LEED, from the bill of quantities to the submission report, in the browser.

**Open the app: https://miko00l96.github.io/whole-building-lca/**

- **LEED BD+C v4.1** MRc Building Life-Cycle Impact Reduction, Option 2 (Paths 1–4), and **LEED BD+C v4** Option 4
- **LEED ID+C v4.1** MRc Interiors Life-Cycle Impact Reduction, Option 3 (Paths 1–3)
- EN 15804+A2 indicators (GWP = fossil + luluc), stages A1–A3, A4, B4–B5, C1–C4; module D and B6 reported separately

The calculation is a line-by-line port of the *Whole building LCA* Excel tool (v7.1). It is checked against
LibreOffice-recalculated Excel builds of the three reference projects: 5,663 values (every line, indicator and stage, the
QA notes, LEED changes, paths, points and report figures) agree.

## What the web app adds to the Excel tool

| | |
|---|---|
| Design options | Any number of designs beside the baseline and the proposed design, compared side by side with their LEED result |
| Lower-carbon alternatives | For every line, the datasets of the same material class that lower its GWP, recalculated with the line's own transport, service life and end of life |
| What-if | Sliders for A1–A3 impacts by material class, transport distances and service lives, with the LEED points they would give |
| Uncertainty | Monte Carlo simulation of quantities, data and service lives: the probability of reaching each LEED threshold, and a tornado chart of the lines that matter most |
| Benchmarks | kg CO2e/m² against published targets (LETI, RIBA 2030 Climate Challenge) |
| Written result | The result in one paragraph with its figures, and what the next LEED path still needs |
| Targets to chase | Every LEED path (and LETI / RIBA benchmarks for context) as criteria with *asks for*, *reads* and *margin*; Chase pins one to the title bar, with a ghost marker of the result before the last change |
| Project links | Copy a link that carries the whole project (BOQ and materials, not the people's names); opening it creates a copy in that browser |
| IFC quantities | Quantities from an IFC2x3 or IFC4 model into the BOQ (BOQ step), grouped by class, type and material, with element category, unit and LEED scope suggested; multi-layer walls can be split per layer; quantities update when the model changes |
| Product cards | Point at any material name to see its EPD or dataset card: programme, registration number, validity, declared unit, indicators |
| Report | The LEED report as A4 pages, ready to print or save as PDF, and as an editable Word file; no limit on BOQ lines |
| Undo and the change line | Every edit recalculates both designs; the general notes under the title block show what the last change added or removed, and how long the recalculation took |

## Data

- **ÖKOBAUDAT** OBD 2024-II is published with the app (`public/data/oekobaudat.json.gz`). Source: German Federal Ministry for
  Housing, Urban Development and Building (BMWSB) / BBSR, [www.oekobaudat.de](https://www.oekobaudat.de). Free of charge;
  unmodified data may be passed on when the source is named. A4 transport per tonne-km for the nine ÖKOBAUDAT transport
  datasets was read from oekobaudat.de (`tools/oekobaudat_transport_A4.json`).
- **The product EPD library, IDEMAT 2026 and ecoinvent 3.9.1** are licensed and are **not** in this repository. They travel
  as a private data pack (`.wblca`) that the owner keeps on their own drive and loads in the browser (Data & libraries).
  The pack is stored in that browser only and is never uploaded. Give it only to people who hold their own ecoinvent licence.
- Projects are kept in the browser (IndexedDB) and can be saved as `.wblca.json` files. A project file holds material
  names, not the data.

Without the data pack the app works with ÖKOBAUDAT only, and the start page offers an example project built from it.

## Using it

Open the site, then: Projects > start a project (or open the example) > Setup > BOQ (type, paste, import an
Excel/CSV file or take quantities from an IFC model) > Designs (choose a material per line for each design) > Results >
Report. Everything runs locally in the browser.

The interface is laid out like a drawing set (after [Shoebox](https://shoebox.idfkit.com/)): a title block with the LEED
target ruler, general notes, a run-log rail and numbered sheets and figures, in IBM Plex. It follows the system's light or
dark setting, or the Auto / Light / Dark switch at the foot of the rail. The report itself stays a white A4 document in
Calibri, ready to submit.

## Development

```
npm ci
npm run dev        # http://localhost:5173
npm test           # unit checks that need no private data
npm run typecheck
npm run build      # static site in dist/
```

Pushing to `main` builds and publishes the site to GitHub Pages (`.github/workflows/deploy.yml`; repository Settings >
Pages > Source: GitHub Actions).

`tools/` (run in a private workspace, never in CI):

| Script | |
|---|---|
| `extract_master.py <master.xlsx> <out>` | Libraries of the Excel tool's master workbook → JSON (public ÖKOBAUDAT, private EPD / IDEMAT / ecoinvent / lists) |
| `make_samples.py` | The three reference projects and their expected Excel results |
| `make_pack.py <out>` | Private data pack (`.wblca`) |
| `verify.ts <out> [date]` | Engine check against the recalculated Excel builds (needs the private data) |
| `ifc_test.ts <file.ifc>` | Reads an IFC file in Node and prints the take-off groups |

## Third-party software

React (MIT), Vite (MIT), Apache ECharts (Apache-2.0), web-ifc (MPL-2.0), docx (MIT), zustand (MIT), MiniSearch (MIT),
Floating UI (MIT), idb-keyval (Apache-2.0), read-excel-file (MIT), IBM Plex Sans / Sans Condensed / Mono and Carlito fonts
(SIL OFL 1.1).

Results are indicative until GBCI review. The tool does not replace the professional judgement of the LCA practitioner.
