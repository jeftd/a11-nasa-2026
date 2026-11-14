"""
Build a compact, date-sorted binary index of every 2024 hotspot (all satellites) so the local API
(web/server.py) can answer "all real pixels inside this polygon on these dates" in milliseconds,
without a FIRMS API key.

Input : data/raw/zips/{modis,viirs-snpp,viirs-jpss1}_<YEAR>_all_countries.zip
Output: data/index/<YEAR>/*.npy        (git-ignored, ~1.1 GB for 2024)

Columns: lat, lon (float32), scan, track (float16, km), frp (float32, MW), time (uint16 HHMM UTC),
         sat (uint8: 0 Terra, 1 Aqua, 2 SNPP, 3 NOAA20, 4 NOAA21), conf (uint8: MODIS 0-100;
         VIIRS 201=l 202=n 203=h), night (uint8), type (uint8), doy (uint16 day of year)
Rows are sorted by day of year; `day_start[d]` gives the first row of day d (1-based, length 367+1).

Usage:
  python analysis/build_pixel_index.py --year 2024
"""
import argparse
import array
import csv
import io
import zipfile
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
SAT_CODE = {"Terra": 0, "T": 0, "Aqua": 1, "A": 1, "N": 2, "N20": 3, "N21": 4}
CONF_CODE = {"l": 201, "n": 202, "h": 203}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2024)
    a = ap.parse_args()
    y = a.year
    jan1 = date(y, 1, 1).toordinal()
    cols = {k: [] for k in ("lat", "lon", "scan", "track", "frp", "time", "sat", "conf", "night", "type", "doy")}
    for sensor in ("modis", "viirs-snpp", "viirs-jpss1"):
        path = RAW / "zips" / f"{sensor}_{y}_all_countries.zip"
        print("reading", path.name)
        tc = {"lat": "f", "lon": "f", "scan": "f", "track": "f", "frp": "f", "time": "H", "sat": "B",
              "conf": "B", "night": "B", "type": "B", "doy": "H"}
        buf = {k: array.array(tc[k]) for k in cols}
        with zipfile.ZipFile(path) as z:
            for name in z.namelist():
                if not name.endswith(".csv"):
                    continue
                with z.open(name) as f:
                    for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
                        d = r["acq_date"]
                        if not d.startswith(str(y)):
                            continue
                        s = SAT_CODE.get(r["satellite"])
                        if s is None:
                            continue
                        try:
                            vals = (float(r["latitude"]), float(r["longitude"]), float(r["scan"]),
                                    float(r["track"]), float(r["frp"] or 0))
                        except ValueError:
                            continue
                        for k, v in zip(("lat", "lon", "scan", "track", "frp"), vals):
                            buf[k].append(v)
                        buf["time"].append(int(r["acq_time"] or 0))
                        buf["sat"].append(s)
                        c = r["confidence"]
                        buf["conf"].append(CONF_CODE.get(c, int(c) if c.isdigit() else 202))
                        buf["night"].append(1 if r["daynight"] == "N" else 0)
                        buf["type"].append(min(255, int(r.get("type") or 0)))
                        buf["doy"].append(date.fromisoformat(d).toordinal() - jan1 + 1)
        dt = {"lat": np.float32, "lon": np.float32, "scan": np.float16, "track": np.float16, "frp": np.float32,
              "time": np.uint16, "sat": np.uint8, "conf": np.uint8, "night": np.uint8, "type": np.uint8, "doy": np.uint16}
        for k in cols:
            cols[k].append(np.frombuffer(buf[k], dtype=buf[k].typecode).astype(dt[k]))
        print(f"  {len(buf['sat']):,} rows")
        del buf
    arr = {k: np.concatenate(v) for k, v in cols.items()}
    order = np.argsort(arr["doy"], kind="stable")
    arr = {k: v[order] for k, v in arr.items()}
    day_start = np.searchsorted(arr["doy"], np.arange(1, 369)).astype(np.int64)
    out = ROOT / "data" / "index"
    out.mkdir(parents=True, exist_ok=True)
    d = out / str(y)
    d.mkdir(parents=True, exist_ok=True)
    for k, v in {**arr, "day_start": day_start, "year": np.array([y])}.items():
        np.save(d / f"{k}.npy", v)  # separate .npy files so web/server.py can memory-map them
    print(f"saved {d}  rows={len(order):,}")


if __name__ == "__main__":
    main()
