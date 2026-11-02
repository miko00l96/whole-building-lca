"""Extract the libraries of the Excel tool's master workbook into the web app's data files.

Usage (Claude runs this; Michael does not need Python):
    python3 tools/extract_master.py <master.xlsx> <out_dir>

Writes
    <out_dir>/public/oekobaudat.json      ÖKOBAUDAT OBD 2024-II (published with the app, attribution required)
    <out_dir>/private/epd.json            product EPD library      (private data pack only)
    <out_dir>/private/idemat.json         IDEMAT 2026              (private data pack only)
    <out_dir>/private/ecoinvent.json      ecoinvent 3.9.1 results  (private data pack only, licensed)
    <out_dir>/private/lists.json          IDEMAT transport / end-of-life / module D lists, grid list, element list

The material-class rules are copied from _dev/build_tool.py (same order, same keywords) so every dataset gets the class the
Excel build gives it. Never commit the private folder.
"""
import sys, json, re, datetime, pathlib, collections
import openpyxl

SRC, OUT = sys.argv[1], pathlib.Path(sys.argv[2])
(OUT / "public").mkdir(parents=True, exist_ok=True)
(OUT / "private").mkdir(parents=True, exist_ok=True)

# ----------------------------------------------------------------------------------------- class rules (from build_tool.py)
CARPET_KW = ["carpet", "tufted", "needle felt", "needlefelt", "needled", "upholster", "textile floor", "textile wall", " rug ", "kugelgarn"]
ACCESS_KW = ["raised floor", "access floor", "hollow floor", "cavity floor"]
RULES = [
    ("Structural steel & metal sheet", ["metal profile"]),
    ("Glass & glazing", ["glazed partition", "glass partition"]),
    ("Ceiling & access floor systems", ["ceiling"] + ACCESS_KW + ["acoustic panel", "acoustic tile", "baffle", "glass reinforced gypsum", " grg "]),
    ("Carpet & textiles", CARPET_KW),
    ("Resilient & resin flooring", ["vinyl floor", "vinyl tile", "luxury vinyl", " lvt", "linoleum", "rubber floor", "pvc floor", "resilient",
                                    "floor covering", "resin floor", "floor coating", "floor guard", "epoxy floor", "epobat", "epopark"]),
    ("Paints, coatings & wall coverings", ["wall coating", "textured coating", "paint primer", "paint system", "(paint)", "protective coating",
                                           "wallcovering", "wall covering"]),
    ("Doors & hardware", [" door", "doorset", "door set", "hinge", "lockset", "ironmongery"]),
    ("Furniture & casework", ["furniture", "chair", " desk", "workstation", " table", "cabinet", "cupboard", "wardrobe", "shelving", "sofa",
                              "seating", "casework", "credenza", "locker"]),
    ("Gypsum & boards", ["gypsum", "gyproc", "gypfine", "mada plus", "sheathing board", "plasterboard", "plaster board", "drywall", "cement board",
                         "fibre cement", "fiber cement", "calcium silicate"]),
    ("Concrete", ["ready mix", "ready-mix", "readymix", "rcc c", "roller compacted", "c16/", "c20/", "c25/", "c30/", "c32/", "c35/", "c40/", "c45/",
                  "c50/", "c55/", "c60/", "c65/", "c70/", "c80/", "c85/", "c90/", "c105/"]),
    ("Roofing & waterproofing", ["waterproof", "membrane", "bitumen", "bituminous", "roofing", "epdm", "damp proof", "damp-proof"]),
    ("Cement, mortar & plaster", ["mortar", "plaster", "render", "grout", "screed", "levelling", "adhesive", "glue", "skim coat", "base coat",
                                  "cementitious", "cement", "lime ", "cem i", "bloc fix", "weberbloc"]),
    ("Insulation", ["insulation", "insulating", "etics", "rock wool", "rockwool", "stone wool", "mineral wool", "glass wool", "glasswool",
                    "polystyrene", "phenolic foam", "polyisocyanurate", "foam glass", "cellular glass", "pur foam", "pir "]),
    ("Masonry & blocks", ["block", "brick", "masonry", "cmu", "autoclaved aerated", "aac ", "kerb", "paver", "interlock"]),
    ("Concrete", ["concrete", " mpa", "hollow core", "slab", "precast", "shotcrete", "blinding", "ggbs", "ggbfs"]),
    ("Reinforcing steel", ["rebar", "reinforcing", "reinforcement steel", "wire rod", "steel bar", "deformed bar", "welded wire", "welded mesh"]),
    ("Electrical & lighting", ["cable", "wire", "busbar", "luminaire", " lamp", " led ", "lighting", "light fitting", "switch", "socket", "conduit",
                               "electrical", "downlight"]),
    ("Mechanical, plumbing & fire", [" duct", "pipe", "piping", "valve", "sprinkler", "fire suppression", "radiator", "boiler", " pump", "fan coil",
                                     "air handling", "ventilation", "hvac", "sanitary", "toilet", "washbasin", "wash basin", "faucet", "shower",
                                     "urinal", "mixer", "cistern", " wc ", "tapware"]),
    ("Aluminium", ["aluminium", "aluminum"]),
    ("Structural steel & metal sheet", ["steel", "sections", "hollow section", "purlin", "metal deck", "sheet pile"]),
    ("Other metals", ["copper", "zinc", "brass", "titanium", "nickel", "lead sheet"]),
    ("Timber & wood", ["timber", "wood", "plywood", "osb", "glulam", "cross laminated", "lumber", "mdf", "chipboard", "particle board", "parquet",
                       "laminate floor", "laminate board", "laminate panel", " hpl", "high-pressure laminate", "high pressure laminate", "veneer"]),
    ("Glass & glazing", ["glass", "glazing", "window", "curtain wall"]),
    ("Ceramic & stone tiles", ["porcelain", "stoneware", " tile"]),
    ("Stone, ceramics & aggregates", ["stone", "granite", "marble", "ceramic", "aggregate", "gravel", "sand", "clinker"]),
    ("Paints, coatings & wall coverings", ["paint", "primer", "lacquer", "varnish", "coating", "stain "]),
    ("Plastics & sealants", ["grp ", "pvc", "polyethylene", "polypropylene", "hdpe", "plastic", "sealant", "silicone", "epoxy", "resin", "polyurethane"]),
]


def kw_class(text, unit=""):
    t = " " + (text or "").lower() + " "
    for cls, kws in RULES:
        if any(k in t for k in kws):
            return cls
    return "Concrete" if (unit or "").strip() == "m3" else "Other"


def idemat_class(name, group, unit):
    g = (group or "").lower(); n = (name or "").lower()
    if "textiles" in g or ("leather" in n and "agricultur" in g):
        return "Carpet & textiles"
    if "electronics, others" in g:
        return "Electrical & lighting"
    if any(k in g for k in ["energy", "food", "electronics", "agricultur", "fuels", "transport", "scope 1", "waste", "processing", "paper",
                            "chemicals", "proxi", "windfarm", "recycling credit", "co-firing", "incineration", "combustion", "upcycling", "landfill"]):
        return "Other"
    if "wood" in g:
        return "Timber & wood"
    if "plastics" in g:
        return "Plastics & sealants"
    if "ceramics" in g:
        return "Ceramic & stone tiles" if any(k in n for k in ["porcelain", "stoneware", "glaze"]) else "Stone, ceramics & aggregates"
    if "glass" in g:
        return "Insulation" if "wool" in n else "Glass & glazing"
    if "aluminium" in g or "aluminium" in n or "aluminum" in n:
        return "Aluminium"
    if "ferro" in g and "non ferro" not in g:
        return "Reinforcing steel" if any(k in n for k in ["reinforc", "rebar", "wire rod"]) else "Structural steel & metal sheet"
    if "non ferro" in g or "metals" in g:
        return "Other metals"
    if "paints" in g:
        return "Paints, coatings & wall coverings"
    if "insulation" in g:
        return "Insulation"
    if "bricks" in g:
        return "Masonry & blocks"
    if "bitumen" in g:
        return "Roofing & waterproofing"
    if "concrete" in g:
        return kw_class(name, "m3") if "block" in n else "Concrete"
    if "binders" in g:
        return "Gypsum & boards" if "gypsum" in n else "Cement, mortar & plaster"
    return kw_class(name, unit) if "construction" in g else "Other"


OBD_MINERAL = [("ready mixed concrete", "Concrete"), ("precast concrete", "Concrete"), ("binder / cement", "Cement, mortar & plaster"),
               ("binder / gypsum", "Gypsum & boards"), ("binder / lime", "Cement, mortar & plaster"), ("ceiling panel", "Ceiling & access floor systems"),
               ("gypsum plasterboard", "Gypsum & boards"), ("fibre cement", "Gypsum & boards"), ("renders and plasters", "Cement, mortar & plaster"),
               ("adhesive", "Cement, mortar & plaster"), ("mortar (masonry)", "Cement, mortar & plaster"), ("screed", "Cement, mortar & plaster"),
               ("substrate", "Cement, mortar & plaster"), ("concrete additive", "Other"), ("concrete aggregates", "Stone, ceramics & aggregates"),
               ("natural cut stone", "Stone, ceramics & aggregates"), ("tiles and cladding", "Ceramic & stone tiles"), ("roof tile", "Ceramic & stone tiles"),
               ("asphalt", "Other"), ("pigments", "Other"), ("brick", "Masonry & blocks"), ("aerated concrete", "Masonry & blocks"),
               ("light concrete", "Masonry & blocks"), ("hemp blocks", "Masonry & blocks"), ("clay panels", "Masonry & blocks"), ("glass block", "Masonry & blocks")]
OBD_MEP = ("air conditioning and ventilation", "heating", "sanitary", "fire protection", "conveyance")
OBD_DOORS = ("doors", "accessories for windows, walling and doors", "window fittings", "drive system")


def obd_class(name, cat, unit):
    c = (cat or "").lower(); n = (name or "").lower()
    parts = c.split(" / "); top, sub = parts[0], (parts[1] if len(parts) > 1 else "")
    if any(k in n for k in ACCESS_KW):
        return "Ceiling & access floor systems"
    if top == "building service engineering":
        if sub == "electrical":
            return "Electrical & lighting"
        return "Mechanical, plumbing & fire" if sub in OBD_MEP else "Other"
    if top in ("end of life", "others"):
        return "Other"
    if top == "composites":
        if "ceiling" in c:
            if any(k in n for k in ["decke", "hollow core", "slab"]):
                return "Concrete"
            return "Gypsum & boards" if "cement board" in n else "Ceiling & access floor systems"
        if "glass" in n:
            return "Glass & glazing"
        if "inner walls" in c:
            return "Timber & wood" if any(k in n for k in ["laminate", "hpl", "biofiber", "fibre board", "fiber board"]) else "Other"
        return kw_class(name + " / " + cat, unit)
    if top == "mineral building products":
        if "stoneware" in c:
            return "Mechanical, plumbing & fire" if "pipe" in n else "Ceramic & stone tiles"
        for k, v in OBD_MINERAL:
            if k in c:
                return v
        return kw_class(name, unit)
    if top == "wood":
        return "Timber & wood"
    if top == "plastics":
        if "flooring" in c:
            t = " " + n + " "
            return "Carpet & textiles" if any(k in t for k in CARPET_KW + ["woven", "textile"]) else "Resilient & resin flooring"
        return kw_class(name + " " + cat, unit) if any(k in (name + cat).lower() for k in ["insulation", "membrane", "waterproof", "roofing"]) else "Plastics & sealants"
    if top == "insulation materials":
        return "Insulation"
    if top == "metals":
        n2 = n + " " + c
        if "alumin" in n2:
            return "Aluminium"
        if any(k in n2 for k in ["reinforc", "rebar", "wire rod"]):
            return "Reinforcing steel"
        if "steel" in n2 or "iron" in n2:
            return "Structural steel & metal sheet"
        return "Other metals"
    if top == "components for windows and curtain walls":
        return "Doors & hardware" if sub in OBD_DOORS else "Glass & glazing"
    if top == "coverings":
        if any(k in (name + cat).lower() for k in ["membrane", "bitumen", "roof", "waterproof"]):
            return kw_class(name + " " + cat, unit)
        if any(k in n for k in ["laminate", "hpl", "resopal"]):
            return "Timber & wood"
        if any(k in n for k in ["tape", "adhesive", "glue", "sticker"]):
            return "Plastics & sealants"
        return "Paints, coatings & wall coverings"
    return kw_class(name + " / " + cat, unit)


EI_EARLY = [("13", "Carpet & textiles"), ("2030", "Carpet & textiles"), ("2029", "Plastics & sealants"), ("16", "Timber & wood"),
            ("3100", "Furniture & casework"), ("2819", "Mechanical, plumbing & fire"), ("4322", "Mechanical, plumbing & fire"), ("2732", "Electrical & lighting")]
EI_ISIC = [("08", "Stone, ceramics & aggregates"), ("2013", "Plastics & sealants"), ("2022", "Paints, coatings & wall coverings"), ("22", "Plastics & sealants"),
           ("2310", "Glass & glazing"), ("2392", "Masonry & blocks"), ("2394", "Cement, mortar & plaster"), ("2395", "Concrete"),
           ("2396", "Stone, ceramics & aggregates"), ("2410", "Structural steel & metal sheet"), ("2431", "Structural steel & metal sheet"),
           ("2432", "Other metals"), ("2511", "Doors & hardware"), ("259", "Structural steel & metal sheet")]
EI_SPECIAL = [("clinker", "Cement, mortar & plaster"), ("stucco", "Cement, mortar & plaster"), ("anhydrite floor", "Cement, mortar & plaster"),
              ("mastic asphalt", "Roofing & waterproofing"), ("expanded clay", "Stone, ceramics & aggregates"), ("burnt shale", "Stone, ceramics & aggregates"),
              ("calcined clay", "Stone, ceramics & aggregates"), ("expanded perlite", "Insulation"), ("expanded vermiculite", "Insulation"),
              ("sealing tape", "Plastics & sealants"), ("mattress", "Furniture & casework")]


def ei_class(prod, act, isic, unit):
    p = (prod or "").lower(); i = str(isic or "")
    for k, c in EI_SPECIAL:
        if p.startswith(k):
            return c
    if p.startswith(("aluminium", "aluminum")) or "aluminium sheet" in p:
        return "Aluminium"
    if p.startswith(("copper", "zinc", "lead", "brass", "bronze", "titanium zinc", "tin ")):
        return "Other metals"
    for k, c in EI_EARLY:
        if i.startswith(k):
            return c
    for t in (prod, act):
        c = kw_class(t, "")
        if c != "Other":
            return c
    for k, c in EI_ISIC:
        if i.startswith(k):
            return c
    return "Concrete" if unit == "m3" else "Other"


def epd_product(name):
    n = (name or "").replace("CHECK – ", "")
    return n.split(" – ")[0] if " – " in n else n


# ----------------------------------------------------------------------------------------- helpers
def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v) if isinstance(v, float) else v
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def iso(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    return None


def s(v):
    return "" if v is None else str(v)


def rows(ws, first, ncol, last=None):
    for r in ws.iter_rows(min_row=first, max_row=last, max_col=ncol, values_only=True):
        yield list(r) + [None] * (ncol - len(r))


URL_RE = re.compile(r"https?://[^\s;,)]+")
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=False)

# Method: IDEMAT Pt -> characterised value (Pt x NF / WF), plausibility threshold
meth = {r[1]: r for r in rows(wb["Method"], 1, 8, 20) if r[1]}
IND = ["GWP", "ODP", "AP", "EPfw", "EPm", "EPt", "POCP", "ADPf"]
NFWF = [(num(meth[k][5]), num(meth[k][6])) for k in IND]
EPM_GWP_MIN = num(list(rows(wb["Method"], 16, 8, 16))[0][5])

# ----------------------------------------------------------------------------------------- EPD library
epd = []
for r in rows(wb["EPD_Library"], 8, 29, 1807):
    if not r[0]:
        continue
    name = s(r[0]).strip()
    unit = s(r[1]).strip()
    note = s(r[27])
    m = URL_RE.search(note)
    epd.append({
        "n": name, "u": unit, "kg": num(r[2]), "reg": s(r[3]), "prog": s(r[4]), "maker": s(r[5]), "geo": s(r[6]),
        "valid": iso(r[7]), "std": s(r[8]), "gwpi": s(r[9]),
        "a": [num(x) for x in r[10:18]],
        "c": [num(x) for x in r[18:26]] if isinstance(r[18], (int, float)) else None,
        "d": num(r[26]),
        "note": note, "desc": s(r[28]), "url": m.group(0) if m else "",
        "cls": kw_class(epd_product(name), unit),
    })
print("EPD", len(epd))

# ----------------------------------------------------------------------------------------- IDEMAT
idm, seen = [], set()
for r in rows(wb["IDEMAT_DB"], 5, 21):
    if not r[1]:
        continue
    name = s(r[1]).strip()
    if name in seen:                     # MATCH() in Excel returns the first row; keep the first only
        continue
    seen.add(name)
    unit = s(r[3]).strip()
    a = []
    for k in range(8):
        pt = num(r[4 + k]) or 0.0
        nf, wf = NFWF[k]
        a.append(pt * nf / wf)
    idm.append({"id": s(r[0]), "n": name, "g": s(r[2]), "u": unit, "a": a, "traci": num(r[20]), "cls": idemat_class(name, s(r[2]), unit)})
dev = max(abs(x["a"][0] - x["traci"]) / max(abs(x["traci"]), 1e-12) for x in idm if x["traci"])
print("IDEMAT", len(idm), "max GWP deviation from TRACI check:", f"{dev:.2e}")
for x in idm:
    x.pop("traci")

# ----------------------------------------------------------------------------------------- ÖKOBAUDAT
obd = []
for r in rows(wb["OEKOBAUDAT_DB"], 5, 53):
    if not r[1]:
        continue
    name, cat, unit = s(r[1]).strip(), s(r[2]), s(r[3]).strip()
    uid, ver = s(r[0]), s(r[16])
    obd.append({
        "id": uid, "n": name, "cat": cat, "u": unit, "kg": num(r[4]), "kgf": s(r[5]), "type": s(r[6]), "bg": s(r[7]), "std": s(r[8]),
        "ef": s(r[9]), "geo": s(r[10]), "ry": num(r[11]), "vy": num(r[12]), "owner": s(r[13]), "reg": s(r[14]), "prog": s(r[15]),
        "ver": ver, "mods": s(r[17]), "scen": s(r[18]),
        "a": [num(x) for x in r[19:27]], "aTot": num(r[27]), "aBio": num(r[28]),
        "c": [num(x) for x in r[29:37]] if isinstance(r[29], (int, float)) else None, "cTot": num(r[37]), "cBio": num(r[38]),
        "d": [num(x) for x in r[39:47]] if isinstance(r[39], (int, float)) else None, "dTot": num(r[47]), "dBio": num(r[48]),
        "info": s(r[49]), "warn": s(r[50]),
        "url": f"https://oekobaudat.de/OEKOBAU.DAT/datasetdetail/process.xhtml?uuid={uid}&version={ver}" if uid else "",
        "cls": obd_class(name, cat, unit),
    })
# A4 values of the nine ÖKOBAUDAT transport datasets (the master holds no A4 block): tools/oekobaudat_transport_A4.json
_tr = json.load(open(pathlib.Path(__file__).with_name("oekobaudat_transport_A4.json"), encoding="utf-8"))
for x in obd:
    t = _tr.get(x["id"])
    if t and x["u"] == "tkm":
        x["a"] = [t["fos"] + t["luc"], t["odp"], t["ap"], t["epfw"], t["epm"], t["ept"], t["pocp"], t["adpf"]]
        x["aTot"], x["aBio"], x["use"] = t["tot"], t["bio"], "transport"
        x["info"] = (x["info"] + "; " if x["info"] else "") + "A4 per tkm read from oekobaudat.de on 2026-11-02"
print("OBD", len(obd), "EoL per kg:", sum(1 for x in obd if x["cat"].startswith("End of Life") and x["u"] == "kg"),
      "tkm:", sum(1 for x in obd if x["u"] == "tkm"))

# ----------------------------------------------------------------------------------------- ecoinvent
ei = []
for r in rows(wb["ECOINVENT_DB"], 5, 23):
    if not r[1]:
        continue
    prod, act, isic, unit, use = s(r[2]), s(r[6]), s(r[7]), s(r[3]).strip(), s(r[9])
    ei.append({
        "id": s(r[0]), "n": s(r[1]).strip(), "prod": prod, "u": unit, "kg": num(r[4]), "geo": s(r[5]), "act": act, "isic": isic,
        "type": s(r[8]), "use": use, "a": [num(x) for x in r[10:18]], "tot": num(r[18]), "bio": num(r[19]),
        "note": s(r[20]), "qa": s(r[21]), "lab": s(r[22]),
        "cls": ei_class(prod, act, isic, unit) if use == "material" else "",
    })
print("ecoinvent", len(ei), collections.Counter(x["use"] for x in ei))

# ----------------------------------------------------------------------------------------- lists
L = list(rows(wb["Lists"], 2, 11))
col = lambda j: [s(x[j]).strip() for x in L if x[j] not in (None, "")]
idm_tr, idm_eol, idm_modd, bdc_el = col(1), col(2), col(3), col(4)
assert (len(idm_tr), len(idm_eol)) == (24, 230), (len(idm_tr), len(idm_eol))
GRID_FIRST = ["EG", "SA", "AE", "BH", "KW", "OM", "QA", "JO", "LB", "IQ", "SY", "YE", "IR", "IL", "TR", "RME"]
grid_rows = [x for x in ei if x["use"] == "grid"]


def gk(x):
    return (GRID_FIRST.index(x["geo"]), str("medium" in x["lab"])) if x["geo"] in GRID_FIRST else (99, x["lab"].lower())


grid_rows.sort(key=gk)
grid = ([{"label": "Egypt (IDEMAT 2026)", "src": "IDEMAT", "n": "B.044.01.158.251007 Electricity Egypt production"},
         {"label": "Saudi Arabia (IDEMAT 2026)", "src": "IDEMAT", "n": "B.044.01.248.251007 Electricity Saudi Arabia production"}] +
        [{"label": x["lab"], "src": "ecoinvent", "n": x["n"]} for x in grid_rows])
lists = {"idematTransport": idm_tr, "idematEol": idm_eol, "idematModuleD": idm_modd, "bdcElements": bdc_el, "grid": grid,
         "epMarineGwpMin": EPM_GWP_MIN}
print("BD+C elements", bdc_el)
print("grid entries", len(grid), "EP-marine/GWP min", EPM_GWP_MIN)

stamp = datetime.date.today().isoformat()


def dump(path, lib, title, recs, extra=None):
    doc = {"schema": "wblca-lib@1", "lib": lib, "title": title, "extracted": stamp, "count": len(recs), "rows": recs}
    if extra:
        doc.update(extra)
    pathlib.Path(path).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


dump(OUT / "public/oekobaudat.json", "ÖKOBAUDAT", "ÖKOBAUDAT OBD_2024_II (EN 15804+A2), BBSR – oekobaudat.de", obd,
     {"licence": "ÖKOBAUDAT data are provided free of charge by the BMWSB/BBSR; free distribution of unmodified data is permitted "
                 "provided the source is named. Values per declared unit; GWP = GWP-fossil + GWP-luluc (EN 15804+A2).",
      "source": "https://www.oekobaudat.de"})
dump(OUT / "private/epd.json", "EPD", "Product EPD library (EG, SA, AE, BH, QA, KW, OM)", epd)
dump(OUT / "private/idemat.json", "IDEMAT", "IDEMAT 2026 Rev B1 – TU Delft / Sustainability Impact Metrics (CC BY-NC 4.0)", idm)
dump(OUT / "private/ecoinvent.json", "ecoinvent", "ecoinvent 3.9.1 cut-off, EF 3.1 (licensed)", ei)
(OUT / "private/lists.json").write_text(json.dumps(lists, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("written to", OUT)
