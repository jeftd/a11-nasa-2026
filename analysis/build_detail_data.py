"""
Detail datasets for the Fire Data Explorer (web/explorer/data/):

  fine/<SAT>_<YEAR>.png   0.1-degree global count grid per satellite (3600 x 1800 px).
                          Count is encoded losslessly: count = R * 256 + G (north at the top row).
  fine/meta_<YEAR>.json   totals, max count per satellite, encoding description
  pixels_showcase.json    real fire pixels (true scan x track footprint) for a few 1-degree windows
                          in Mexico on high-activity days of the year, all satellites overlaid

Requires the yearly zips and Mexico CSVs already downloaded by build_explorer_data.py /
sensor_overlap.py (data/raw/...). Needs numpy and Pillow.

Usage:
  python analysis/build_detail_data.py --year 2024
"""
import argparse
import csv
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "explorer" / "data"
SAT_NAMES = {"Terra": "Terra", "Aqua": "Aqua", "T": "Terra", "A": "Aqua", "N": "SNPP", "N20": "NOAA20", "N21": "NOAA21"}
RES = 0.1
NX, NY = int(360 / RES), int(180 / RES)


def fine_grids(year):
    grids, totals = {}, defaultdict(int)
    for sensor in ("modis", "viirs-snpp", "viirs-jpss1"):
        path = RAW / "zips" / f"{sensor}_{year}_all_countries.zip"
        print("fine grid:", path.name)
        with zipfile.ZipFile(path) as z:
            for name in z.namelist():
                if not name.endswith(".csv"):
                    continue
                with z.open(name) as f:
                    for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
                        if row.get("type", "0") not in ("0", "") or not row["acq_date"].startswith(str(year)):
                            continue
                        sat = SAT_NAMES.get(row["satellite"])
                        if not sat:
                            continue
                        try:
                            lat, lon = float(row["latitude"]), float(row["longitude"])
                        except ValueError:
                            continue
                        g = grids.get(sat)
                        if g is None:
                            g = grids[sat] = np.zeros((NY, NX), dtype=np.uint32)
                        i = min(NY - 1, max(0, int((lat + 90) / RES)))
                        j = min(NX - 1, max(0, int((lon + 180) / RES)))
                        g[NY - 1 - i, j] += 1
                        totals[sat] += 1
    (OUT / "fine").mkdir(parents=True, exist_ok=True)
    meta = {"year": year, "res": RES, "width": NX, "height": NY,
            "encoding": "count = R*256 + G, row 0 = north (90N), column 0 = 180W", "satellites": {}}
    for sat, g in grids.items():
        c = np.minimum(g, 65535).astype(np.uint16)
        rgb = np.zeros((NY, NX, 3), dtype=np.uint8)
        rgb[..., 0] = c >> 8
        rgb[..., 1] = c & 255
        Image.fromarray(rgb, "RGB").save(OUT / "fine" / f"{sat}_{year}.png", optimize=True)
        meta["satellites"][sat] = {"total": int(totals[sat]), "max": int(g.max()), "cells": int((g > 0).sum()),
                                   "file": f"fine/{sat}_{year}.png"}
        print(f"  {sat}: total={totals[sat]:,} max/cell={g.max()} cells={(g > 0).sum():,}")
    (OUT / "fine" / f"meta_{year}.json").write_text(json.dumps(meta, indent=1))


def showcase(year, n=4):
    files = {"modis": RAW / "mexico" / f"modis_{year}.csv",
             "viirs-snpp": RAW / "mexico" / f"viirs-snpp_{year}.csv",
             "viirs-jpss1": RAW / "mexico" / f"viirs-jpss1_{year}.csv"}
    rows = []
    for f in files.values():
        with open(f, encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                if r.get("type", "0") in ("0", "") and SAT_NAMES.get(r["satellite"]):
                    rows.append(r)
    # rank (date, 1-degree cell) by NOAA-20 detections, require MODIS detections too
    score = defaultdict(lambda: defaultdict(int))
    for r in rows:
        k = (r["acq_date"], int(np.floor(float(r["latitude"]))), int(np.floor(float(r["longitude"]))))
        score[k][SAT_NAMES[r["satellite"]]] += 1
    ranked = sorted((k for k, v in score.items() if v.get("Terra", 0) + v.get("Aqua", 0) >= 15),
                    key=lambda k: -score[k].get("NOAA20", 0))
    chosen, dates = [], set()
    for k in ranked:
        if k[0] in dates:
            continue
        chosen.append(k)
        dates.add(k[0])
        if len(chosen) == n:
            break
    out = []
    for d, la, lo in chosen:
        pts = []
        for r in rows:
            if r["acq_date"] != d:
                continue
            lat, lon = float(r["latitude"]), float(r["longitude"])
            if la <= lat < la + 1 and lo <= lon < lo + 1:
                pts.append([round(lat, 5), round(lon, 5), float(r["scan"]), float(r["track"]),
                            SAT_NAMES[r["satellite"]], r["acq_time"], float(r["frp"] or 0),
                            r["confidence"], r["daynight"]])
        out.append({"date": d, "lat0": la, "lon0": lo, "counts": dict(score[(d, la, lo)]), "pixels": pts})
        print(f"  showcase {d} cell {la},{lo}: {dict(score[(d, la, lo)])}")
    (OUT / "pixels_showcase.json").write_text(json.dumps(
        {"fields": ["lat", "lon", "scan_km", "track_km", "satellite", "time_utc", "frp_mw", "confidence", "daynight"],
         "windows": out}, separators=(",", ":")))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2024)
    ap.add_argument("--skip-fine", action="store_true")
    a = ap.parse_args()
    print("Real-pixel showcase (Mexico)...")
    showcase(a.year)
    if not a.skip_fine:
        fine_grids(a.year)
