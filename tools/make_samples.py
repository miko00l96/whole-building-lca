"""Build the three reference projects of the Excel tool in the web app's project format, and (optionally) the expected
results read from LibreOffice-recalculated Excel builds, for the engine verification.

Usage:
    python3 tools/make_samples.py <data_out_dir> <riyadh_project.json> [bdc.xlsx idc.xlsx riyadh.xlsx bom_columns.json]

Reads <data_out_dir>/private/{epd,idemat,ecoinvent}.json and public/oekobaudat.json (from extract_master.py) to resolve the
name fragments the Excel generator uses (build_tool.py: epd(), obd(), idm()). Writes <data_out_dir>/private/samples.json and,
with the recalculated workbooks, <data_out_dir>/private/expected.json. Both are private (they name licensed datasets).
"""
import sys, json, pathlib, datetime

OUT = pathlib.Path(sys.argv[1])
RIY = json.load(open(sys.argv[2], encoding="utf-8"))
lib = lambda p: json.load(open(OUT / p, encoding="utf-8"))["rows"]
EPD = [r["n"] for r in lib("private/epd.json")]
IDM = [r["n"] for r in lib("private/idemat.json")]
OBD = [r["n"] for r in lib("public/oekobaudat.json")]
EI = [r["n"] for r in lib("private/ecoinvent.json") if r["use"] == "material"]
NAMES = {"EPD": EPD, "IDEMAT": IDM, "ÖKOBAUDAT": OBD, "ecoinvent": EI}


def one(names, key, what):
    if key in names:
        return key
    hits = [n for n in names if key in n]
    assert len(hits) == 1, (what, key, hits[:3])
    return hits[0]


epd = lambda k: one(EPD, k, "EPD")
obd = lambda k: one(OBD, k, "ÖKOBAUDAT")


def idm(k):
    hits = [n for n in IDM if k in n]
    assert hits, k
    return hits[0]


TRUCK = "C.060.01.106.230701 Truck+trailer 24 tonne net B7 (min weight/volume ratio 0.32 t/m3) (tkm)"
INERT = "F.130.01.106.230701 landfill (inert waste)"
LEED_OPTS = ["BD+C v4.1 – whole-building LCA (MRc Option 2)", "BD+C v4 – whole-building LCA (MRc Option 4)",
             "ID+C v4.1 – Commercial Interiors (MRc Option 3, interiors LCA)", "ID+C v4.1 – Retail (MRc Option 3, interiors LCA)",
             "ID+C v4.1 – Hospitality (MRc Option 3, interiors LCA)"]


def sel(src, mat, cls=None, eol=INERT, qty=None, reuse="N"):
    d = {"src": src, "mat": mat, "eol": eol, "reuse": reuse == "Y"}
    if cls:
        d["cls"] = cls
    if qty is not None:
        d["qty"] = qty
    return d


def setup(system, name, loc, area, assessor, notes, floors, grid, kb, kp, company, client, use, ref, recs):
    return {"system": system, "projectName": name, "location": loc, "area": area, "studyPeriod": None,
            "truck": {"src": "IDEMAT", "n": TRUCK}, "c2km": 50, "assessmentDate": None, "epIndicator": "EPm",
            "assessor": assessor, "notes": notes, "floors": floors, "a4EolDb": "All databases",
            "grid": grid, "kwhBase": kb, "kwhProp": kp, "customGrid": [None] * 8, "customGridSource": "",
            "company": company, "client": client, "buildingUse": use, "reportRef": ref, "extraRecs": recs}


def project(pid, setup_, boq, base, prop, epx=None):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    lines, bch, pch = [], {}, {}
    for i, b in enumerate(boq):
        elem, item, qty, unit, kgpu, rsl, dist = b[:7]
        ref = b[7] if len(b) > 7 else ""
        lid = f"L{i + 1:03d}"
        lines.append({"id": lid, "elem": elem, "item": item, "qty": qty, "unit": unit, "kgpu": kgpu, "rsl": rsl, "dist": dist,
                      "ref": ref or "", "epx": None})
        if epx and (i + 1) in epx:
            lines[-1]["epx"] = epx[i + 1]
        bch[lid] = base[i]
        pch[lid] = prop[i]
    return {"schema": "wblca-project@1", "id": pid, "name": setup_["projectName"], "createdAt": now, "updatedAt": now,
            "setup": setup_, "boq": lines,
            "designs": [{"id": "D-base", "name": "Baseline", "kind": "baseline", "choices": bch, "extra": []},
                        {"id": "D-prop", "name": "Proposed", "kind": "proposed", "choices": pch, "extra": []}]}


# ------------------------------------------------------------------------------------------------ BD+C sample
F_, FR, SL, EW, WIN, RC_, RS = ("Foundations & footings", "Structural frame (columns, beams)", "Floor slabs & decks", "Exterior walls & cladding",
                                "Windows & curtain wall", "Roof covering & insulation", "Roof structure")
BDC_BOQ = [(F_, "Raft + pile caps concrete", 2200, "m3", None, 60, 25), (F_, "Foundation rebar", 220, "t", None, 60, 300),
           (FR, "Columns + beams concrete", 1600, "m3", None, 60, 25), (FR, "Frame rebar", 180, "t", None, 60, 300),
           (SL, "Slab concrete", 3000, "m3", None, 60, 25), (SL, "Slab rebar", 300, "t", None, 60, 300),
           (EW, "Block walls", 1150, "t", None, 60, 60), (EW, "Cement plaster (both faces)", 280, "t", None, 60, 900),
           (EW, "Wall insulation", 9, "t", None, 60, 400), (WIN, "Glazing", 95, "t", None, 30, 1200),
           (WIN, "Window frames", 26, "t", None, 30, 1200), (RC_, "Roof insulation", 4.5, "t", None, 60, 400),
           (RC_, "Roof waterproofing", 2200, "m2", None, 20, 1500), (RS, "Roof screed", 450, "m3", 2200, 60, 25)]
BDC_BASE = [sel("EPD", epd("R4016 - C40/20"), "Concrete"), sel("EPD", epd("Deformed steel bars (rebar)"), "Reinforcing steel"),
            sel("EPD", epd("R6503 - C65/20"), "Concrete"), sel("EPD", epd("Deformed steel bars (rebar)"), "Reinforcing steel"),
            sel("EPD", epd("R4016 - C40/20"), "Concrete"), sel("EPD", epd("Deformed steel bars (rebar)"), "Reinforcing steel"),
            sel("EPD", epd("Hollow Block – Abdullah Abdin")), sel("EPD", epd("Weberpremix fine coat")),
            sel("IDEMAT", idm("PS (EPS expandable polystyrene, white)")), sel("IDEMAT", idm("Glass for windows and facades (float glass)")),
            sel("IDEMAT", idm("Aluminium trade mix Global")), sel("IDEMAT", idm("PS (EPS expandable polystyrene, white)")),
            sel("EPD", epd("Reinforced APP (atactic polypropylene)")), sel("IDEMAT", idm("A.040.07.101.230701 Concrete"))]
BDC_PROP = [sel("EPD", epd("B4006 - C40/20"), "Concrete"), sel("EPD", epd("Nuor Steel - Rebar"), "Reinforcing steel"),
            sel("EPD", epd("B6501 - C65/20"), "Concrete"), sel("EPD", epd("Nuor Steel - Rebar"), "Reinforcing steel"),
            sel("EPD", epd("B4017 - C40/20"), "Concrete"), sel("EPD", epd("Nuor Steel - Rebar"), "Reinforcing steel"),
            sel("EPD", epd("Thermal Block – Abdullah Abdin")), sel("EPD", epd("Weberpremix fine coat")),
            sel("EPD", epd("Rock wool panel insulation"), qty=14000), sel("IDEMAT", idm("Glass for windows and facades (float glass)")),
            sel("IDEMAT", idm("Aluminium trade mix Europe")), sel("EPD", epd("Glass wool board insulation, unfaced"), qty=6000),
            sel("EPD", epd("Reinforced APP (atactic polypropylene)")), sel("IDEMAT", idm("A.040.07.101.230701 Concrete"))]
EPS_EI = "polystyrene, expandable {RoW} | polystyrene production, expandable"
CON_EI = "concrete, 25MPa {RoW} | concrete production, 25MPa, for building construction, with cement, CEM II/B"
assert EPS_EI in EI and CON_EI in EI
bdc = project("sample-bdc", setup(0, "SAMPLE – 6-storey office, Riyadh (clear the sample rows before use)", "Riyadh, Saudi Arabia", 12000,
                                  "REEDS – sample", "", "6 (G + 5)", "Saudi Arabia (IDEMAT 2026)", 1900000, 1560000, "REEDS Consultant",
                                  "Sample client", "Office", "LCA-001 · Rev 0",
                                  "Specify reinforcing steel with an EPD showing at least 90% recycled content."),
              BDC_BOQ, BDC_BASE, BDC_PROP,
              {9: {"src": "ecoinvent", "n": EPS_EI}, 12: {"src": "ecoinvent", "n": EPS_EI}, 14: {"src": "ecoinvent", "n": CON_EI}})

# ------------------------------------------------------------------------------------------------ ID+C example
FL, SUB_, WP, WF, CE, DO, GL, FU, LE, ME = ("Flooring & wall base", "Subfloor, screed & access floors", "Walls & partitions",
                                            "Wall finishes & coverings", "Ceilings", "Doors, frames & hardware", "Interior glazing & window treatments",
                                            "Furniture & furnishings", "Lighting & electrical", "Mechanical & ductwork")
IDC_BOQ = [(FL, "Carpet tiles, office floors", 3200, "m2", None, 10, 1000), (FL, "Porcelain tiles, lobbies and pantries", 900, "m2", None, 25, 1000),
           (FL, "Tile adhesive", 4500, "kg", None, 25, 400), (SUB_, "Raised access floor, office areas", 2600, "m2", None, 20, 1000),
           (WP, "Gypsum board 12.5 mm, partitions (both faces)", 6400, "m2", None, 25, 300), (WP, "Steel studs and tracks", 28000, "kg", None, 25, 400),
           (WP, "Acoustic insulation in partitions (glass wool)", 9500, "kg", None, 25, 1000), (WF, "Emulsion paint, walls (two coats)", 3800, "kg", None, 10, 400),
           (CE, "Suspended ceiling tiles 600 × 600", 3600, "m2", None, 20, 1000), (CE, "Ceiling grid, galvanised steel", 9000, "kg", None, 20, 1000),
           (DO, "Interior timber doors with frames", 300, "m2", None, 20, 1000), (GL, "Glazed office partitions", 420, "m2", None, 20, 1000),
           (FU, "Workstations and storage: steel frames", 9000, "kg", None, 20, 300), (FU, "Workstations and storage: melamine-faced board", 1300, "m2", None, 20, 300),
           (LE, "LED office luminaires", 600, "piece", None, 15, 1000), (LE, "Power and data cabling", 9000, "m", None, 20, 400),
           (ME, "Ductwork, galvanised steel", 14000, "kg", None, 25, 400)]
IDC_BASE = [sel("ÖKOBAUDAT", obd("6.2.02. Tufted carpet tiles (PA 6), LC3"), "Carpet & textiles"),
            sel("ÖKOBAUDAT", obd("Italian Ceramic Tiles"), "Ceramic & stone tiles"), sel("EPD", epd("Webercol premium F (KSA)")),
            sel("ÖKOBAUDAT", obd("Raised Floor Panel, Type LIGNA"), "Ceiling & access floor systems"),
            sel("EPD", epd("MADA PLUS REGULAR PLASTERBOARD"), "Gypsum & boards"), sel("ÖKOBAUDAT", obd("Galvanized steel profile (blast furnace route")),
            sel("ÖKOBAUDAT", obd("SAGLAN glass wool, bonded with phenolic resin"), "Insulation"), sel("EPD", epd("Sigmacryl Silk (paint)")),
            sel("ÖKOBAUDAT", obd("Mineral fibre ceiling board (15 mm)"), "Ceiling & access floor systems"),
            sel("ÖKOBAUDAT", obd("PregyMetal - Z100 galvanized steel profiles 0,6 mm")),
            sel("ÖKOBAUDAT", obd("Door - Rubner Türen GmbH - Wood interior door"), "Doors & hardware"),
            sel("ÖKOBAUDAT", obd("Glass partition walls - average product")), sel("ÖKOBAUDAT", obd("Cold Rolled Steel Coil - Cold Rolled Steel Coil")),
            sel("ÖKOBAUDAT", obd("EGGER Eurodekor - Melamine Faced Chipboard")), sel("ÖKOBAUDAT", obd("LED office luminaire [generic"), "Electrical & lighting"),
            sel("ÖKOBAUDAT", obd("Cable 3-wire [generic"), "Electrical & lighting"), sel("ÖKOBAUDAT", obd("Air ventilation duct (zinc coated steel plate)"))]
IDC_PROP = [dict(r) for r in IDC_BASE]
IDC_PROP[0] = sel("ÖKOBAUDAT", obd("Tufted carpet tiles, total pile material max. 1010 g/m² PA 6 with 100% recycled"), "Carpet & textiles")
IDC_PROP[4] = sel("EPD", epd("Gypsum board 12.5 mm regular – United Mining"), "Gypsum & boards")
IDC_PROP[5] = sel("ÖKOBAUDAT", obd("Galvanized steel profile (electric arc furnace route"))
IDC_PROP[6] = sel("ÖKOBAUDAT", obd("SAGLAN glass wool, bonded with bio-based adhesive"), "Insulation")
IDC_PROP[7] = sel("EPD", epd("Sigmacryl Flat A.F (paint)"))
for k in (10, 12, 13):
    IDC_PROP[k] = dict(IDC_PROP[k], reuse=True)
idc = project("sample-idc", setup(2, "SAMPLE – office fit-out, levels 3–5, Riyadh (clear the sample rows before use)", "Riyadh, Saudi Arabia", 4800,
                                  "REEDS – sample", "", "3 floors (levels 3–5)", "Saudi Arabia (IDEMAT 2026)", 620000, 540000, "REEDS Consultant",
                                  "Sample client", "Office", "LCA-001 · Rev 0",
                                  "Specify carpet tiles with recycled nylon and a manufacturer take-back scheme, and keep the reused furniture and door "
                                  "inventory with the LEED documents."), IDC_BOQ, IDC_BASE, IDC_PROP)

# ------------------------------------------------------------------------------------------------ Riyadh test (--project file)
def proj_choice(d):
    src, mat = d.get("src"), d.get("mat")
    out = {"src": src, "mat": one(NAMES[src], mat, src) if mat else None, "eol": d.get("eol", INERT), "reuse": d.get("reuse", "N") == "Y"}
    for k in ("qty", "kgin", "rsl", "dist"):
        if k in d:
            out[k] = d[k]
    if "a4" in d:
        out["a4"] = d["a4"]
    return out


S, B6, RP = RIY["setup"], RIY["b6"], RIY["report"]
riy = project("sample-riyadh", setup(RIY.get("system", 0), S.get("5", ""), S.get("6", ""), S.get("7"), S.get("13", ""), S.get("14", ""),
                                     S.get("15", ""), B6.get("29"), B6.get("30"), B6.get("31"), RP.get("58", ""), RP.get("59", ""),
                                     RP.get("60", ""), RP.get("61", ""), RP.get("62", "")),
              [tuple(x) for x in RIY["boq"]], [proj_choice(d) for d in RIY["base"]], [proj_choice(d) for d in RIY["prop"]],
              {int(k): v for k, v in RIY.get("epx", {}).items()} or None)
samples = [bdc, idc, riy]
(OUT / "private/samples.json").write_text(json.dumps(samples, ensure_ascii=False, indent=1), encoding="utf-8")
print("samples:", [(p["id"], len(p["boq"])) for p in samples])

# ------------------------------------------------------------------------------------------------ expected results
if len(sys.argv) > 6:
    import openpyxl
    COLS = json.load(open(sys.argv[6]))
    IND = ["GWP", "ODP", "AP", "EPfw", "EPm", "EPt", "POCP", "ADPf"]
    keys = [f"{i}_{s}" for i in IND for s in ["A13", "A4", "B45", "C14", "TOT"]] + ["modD", "qty", "kgpu", "mass", "repl", "unit", "stat", "qa",
                                                                                    "epx", "epgap", "adv", "srcchk", "pdelta", "fGWP", "hasC"]
    col_idx = {k: openpyxl.utils.column_index_from_string(COLS[k]) - 1 for k in keys}
    expected = {}
    for pid, path in zip(["sample-bdc", "sample-idc", "sample-riyadh"], sys.argv[3:6]):
        wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        res = {}
        for sheet in ("Baseline", "Proposed"):
            ws = wb[sheet]
            lines = []
            for row in ws.iter_rows(min_row=10, max_row=209, values_only=True):
                mat = row[openpyxl.utils.column_index_from_string(COLS["mat"]) - 1]
                if not mat:
                    continue
                lines.append({k: row[j] for k, j in col_idx.items()})
            res[sheet] = lines
        R = wb["Results"]
        res["results"] = {c: R[c].value for c in [f"{x}{y}" for x in "DEFGHIJKLMN" for y in range(5, 14)] +
                          [f"F{y}" for y in range(17, 23)] + [f"G{y}" for y in range(17, 23)] + [f"C{y}" for y in range(26, 44)] +
                          [f"P{y}" for y in range(26, 31)] + ["J31", "J32"] + [f"{x}{y}" for x in "DE" for y in range(46, 54)] +
                          [f"K{y}" for y in range(36, 40)] + [f"O{y}" for y in range(36, 40)] + [f"H{y}" for y in range(42, 47)] +
                          [f"{x}{y}" for x in "KLMN" for y in range(42, 47)]}
        CD = wb["Chart_Data"]
        res["chart"] = {"conclusions": [CD[f"A{r}"].value for r in range(136, 141)],
                        "cov": [CD["B818"].value, CD["B819"].value], "epcov": [CD["B899"].value, CD["B900"].value]}
        C = wb["Contractor"]
        res["contractor"] = [[C.cell(row=r, column=c).value for c in range(2, 15)] for r in range(16, 28)]
        expected[pid] = res
    (OUT / "private/expected.json").write_text(json.dumps(expected, ensure_ascii=False, default=str, indent=0), encoding="utf-8")
    print("expected results written")
