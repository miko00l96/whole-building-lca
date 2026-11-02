"""Build the private data pack of the web app (.wblca = gzip JSON, schema 'wblca-pack@1').

Usage (Claude runs this; Michael does not need Python):
    python3 tools/make_pack.py <data_out_dir> [out_file.wblca]

Reads the files tools/extract_master.py and tools/make_samples.py wrote in <data_out_dir>/private:
    epd.json, idemat.json, ecoinvent.json, lists.json, samples.json
and writes one file with the EPD library, IDEMAT 2026, the ecoinvent 3.9.1 results, the drop-down lists (A4 transport,
end of life, module D, B6 grid) and the three sample projects of the Excel tool.

The pack holds licensed data (EPD International, IDEMAT, ecoinvent): keep it on your own drive and give it only to
colleagues who hold their own ecoinvent licence. It is never committed to the public repository (.gitignore: *.wblca).
"""
import datetime
import gzip
import json
import pathlib
import sys

if len(sys.argv) < 2:
    sys.exit(__doc__)
SRC = pathlib.Path(sys.argv[1]) / "private"
stamp = datetime.date.today().isoformat()
OUT = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else pathlib.Path(sys.argv[1]) / f"Whole_building_LCA_data_pack_{stamp}.wblca"


def lib(name):
    d = json.loads((SRC / name).read_text(encoding="utf-8"))
    return {"title": d["title"], "extracted": d.get("extracted", stamp), "rows": d["rows"]}


libs = {"EPD": lib("epd.json"), "IDEMAT": lib("idemat.json"), "ecoinvent": lib("ecoinvent.json")}
lists = json.loads((SRC / "lists.json").read_text(encoding="utf-8"))
samples = json.loads((SRC / "samples.json").read_text(encoding="utf-8")) if (SRC / "samples.json").exists() else []
notice = ("Private data pack of Whole building LCA. It contains licensed data: product EPDs (EPD International AB data may be "
          "used for your own project work with attribution and must not be redistributed; other EPDs remain the property of "
          "their owners), IDEMAT 2026 (CC BY-NC 4.0, Delft University of Technology) and ecoinvent 3.9.1 results (use only "
          "with your own ecoinvent licence). Keep this file on your own drive; do not publish it or upload it to a website.")
doc = {"schema": "wblca-pack@1", "title": f"Whole building LCA data pack ({len(libs['EPD']['rows'])} EPDs, IDEMAT 2026, ecoinvent 3.9.1)",
       "created": stamp, "notice": notice, "libs": libs, "lists": lists, "samples": samples}
raw = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
OUT.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
print(f"{OUT}  {len(raw) / 1e6:.1f} MB JSON -> {OUT.stat().st_size / 1e6:.2f} MB")
print({k: len(v["rows"]) for k, v in libs.items()}, "samples:", [s.get("name") for s in samples])
