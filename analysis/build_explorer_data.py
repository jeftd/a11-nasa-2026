"""
Build the datasets used by the interactive Data Explorer (web/explorer/).

Outputs (web/explorer/data/):
  fires_grid_<YEAR>.json   1-degree grid of vegetation-fire hotspots per satellite
  coverage.json            simplified orbit simulation: passes/day per 2-degree cell + ground tracks
  mexico_monthly.json      monthly hotspot counts in Mexico per satellite, 2000-2025 (overlap story)
  samples.json             one real record per satellite, to explain each field

Inputs (downloaded, cached in data/raw/, git-ignored):
  data/raw/zips/{modis,viirs-snpp,viirs-jpss1}_<YEAR>_all_countries.zip
  data/raw/mexico/<sensor>_<YEAR>.csv
  https://firms.modaps.eosdis.nasa.gov/data/country/...

Optional: VIIRS NOAA-21 is not in the public country files. With FIRMS_MAP_KEY set in .env, run with
--with-noaa21 to fetch it from the FIRMS Area API (world, 5-day pages).

Usage:
  python analysis/build_explorer_data.py --year 2024
  python analysis/build_explorer_data.py --year 2024 --with-noaa21
"""
import argparse
import csv
import io
import json
import math
import os
import time
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "explorer" / "data"
COUNTRY_BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"

SAT_NAMES = {"Terra": "Terra", "Aqua": "Aqua", "T": "Terra", "A": "Aqua",
             "N": "SNPP", "N20": "NOAA20", "N21": "NOAA21"}

# ----------------------------------------------------------------------------- helpers

def load_env():
    env = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def download(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    return dest


def conf_class(c):
    if c in ("l", "n", "h"):
        return c
    try:
        v = int(float(c))
    except ValueError:
        return "n"
    return "l" if v < 30 else ("h" if v >= 80 else "n")


class Grid:
    """Accumulates hotspots on a lat/lon grid."""

    def __init__(self, res=1.0):
        self.res = res
        self.cells = defaultdict(lambda: [0, 0, 0.0, 0, 0])  # count, night, frp_sum, high, low
        self.total = 0
        self.night = 0
        self.frp = 0.0
        self.months = [0] * 12
        self.conf = {"l": 0, "n": 0, "h": 0}

    def add(self, lat, lon, night, frp, conf, month):
        i = int(math.floor((lat + 90) / self.res))
        j = int(math.floor((lon + 180) / self.res))
        c = self.cells[(i, j)]
        c[0] += 1
        c[1] += night
        c[2] += frp
        if conf == "h":
            c[3] += 1
        elif conf == "l":
            c[4] += 1
        self.total += 1
        self.night += night
        self.frp += frp
        self.months[month - 1] += 1
        self.conf[conf] += 1

    def export(self):
        r = self.res
        cells = []
        for (i, j), (n, ni, frp, hi, lo) in self.cells.items():
            cells.append([round(-90 + (i + 0.5) * r, 2), round(-180 + (j + 0.5) * r, 2),
                          n, ni, round(frp / n, 1), hi, lo])
        cells.sort(key=lambda c: -c[2])
        return {
            "total": self.total, "night": self.night,
            "mean_frp": round(self.frp / self.total, 2) if self.total else 0,
            "by_month": self.months, "confidence": self.conf, "cells": cells,
        }


def ingest_rows(rows, grids, samples, year):
    for row in rows:
        if row.get("type", "0") not in ("0", ""):
            continue
        sat = SAT_NAMES.get(row["satellite"])
        if sat is None:
            continue
        d = row["acq_date"]
        if not d.startswith(str(year)):
            continue
        try:
            lat, lon = float(row["latitude"]), float(row["longitude"])
            frp = float(row["frp"] or 0)
        except ValueError:
            continue
        grids.setdefault(sat, Grid()).add(lat, lon, 1 if row["daynight"] == "N" else 0,
                                          frp, conf_class(row["confidence"]), int(d[5:7]))
        if sat not in samples and row["confidence"] not in ("l",) and 20 < frp < 80:
            samples[sat] = dict(row)


def ingest_zip(path, grids, samples, year):
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if not name.endswith(".csv"):
                continue
            with z.open(name) as f:
                ingest_rows(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")), grids, samples, year)


def ingest_noaa21_api(key, year, grids, samples):
    base = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}"
    d = date(year, 1, 1)
    end = date(year, 12, 31)
    cache = RAW / "api" / "noaa21"
    cache.mkdir(parents=True, exist_ok=True)
    while d <= end:
        f = cache / f"VIIRS_NOAA21_SP_{d.isoformat()}.csv"
        if not f.exists():
            url = f"{base}/VIIRS_NOAA21_SP/world/5/{d.isoformat()}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=600) as r:
                f.write_bytes(r.read())
            time.sleep(1)
        with open(f, encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        for r in rows:
            r.setdefault("type", "0")
        ingest_rows(rows, grids, samples, year)
        d += timedelta(days=5)


# ----------------------------------------------------------------------------- orbit simulation

R_EARTH = 6371.0
SIM_DAYS = 4
SIDEREAL_DAY = 86164.0
# name: (altitude km, period min, inclination deg, LTAN hours, swath km, phase deg)
ORBITS = {
    "Terra":  (705, 98.88, 98.2, 22.5, 2330, 0),
    "Aqua":   (705, 98.82, 98.2, 13.5, 2330, 0),
    "SNPP":   (824, 101.44, 98.7, 13.5, 3040, 0),
    "NOAA20": (824, 101.44, 98.7, 12.67, 3040, 0),
    "NOAA21": (824, 101.44, 98.7, 12.67, 3040, 180),
}


def ground_track(alt, period_min, inc_deg, ltan_h, phase_deg, dt=30, hours=24):
    t = np.arange(0, hours * 3600, dt, dtype=float)
    P = period_min * 60
    i = math.radians(inc_deg)
    u = 2 * math.pi * t / P + math.radians(phase_deg)
    # ascending node at t=0 placed where local solar time == LTAN (UTC 00:00 => LST = lon/15)
    node0 = math.radians(15 * ltan_h)
    x = np.cos(u)
    y = np.sin(u) * math.cos(i)
    z = np.sin(u) * math.sin(i)
    lat = np.degrees(np.arcsin(z))
    lon_inertial = np.arctan2(y, x) + node0
    # Earth rotation; sun-synchronous precession keeps LTAN fixed (approx. by solar-day rotation)
    lon = np.degrees(lon_inertial - 2 * math.pi * t / 86400.0)
    lon = (lon + 180) % 360 - 180
    utc_h = t / 3600.0
    lst = (utc_h + lon / 15.0) % 24
    day = (lst >= 6) & (lst < 18)
    pass_id = np.floor((u + math.pi / 2) / math.pi).astype(int)  # half-orbits pole-to-pole
    return t, lat, lon, day, pass_id


def coverage(res=2.0):
    lats = np.arange(-90 + res / 2, 90, res)
    lons = np.arange(-180 + res / 2, 180, res)
    LA, LO = np.meshgrid(lats, lons, indexing="ij")
    cla, slat = np.cos(np.radians(LA)).ravel(), np.sin(np.radians(LA)).ravel()
    lo_r = np.radians(LO).ravel()
    out = {"res": res, "lats": lats.round(2).tolist(), "lons": lons.round(2).tolist(), "satellites": {}}
    for name, (alt, per, inc, ltan, swath, phase) in ORBITS.items():
        t, lat, lon, day, pid = ground_track(alt, per, inc, ltan, phase, hours=24 * SIM_DAYS)
        half = swath / 2 / R_EARTH  # radians of arc on the ground
        passes = np.zeros(cla.size, dtype=np.float32)
        dpass = np.zeros(cla.size, dtype=np.float32)
        for p in np.unique(pid):
            m = pid == p
            pl, pn = np.radians(lat[m]), np.radians(lon[m])
            cosd = np.outer(slat, np.sin(pl)) + np.outer(cla, np.cos(pl)) * np.cos(lo_r[:, None] - pn[None, :])
            hit = (cosd >= math.cos(half)).any(axis=1)
            passes += hit
            if day[m].mean() >= 0.5:
                dpass += hit
        # simulated SIM_DAYS days -> average passes per day (removes the 24 h window seam)
        per_day = (passes / SIM_DAYS).round(1).reshape(LA.shape)
        day_per_day = (dpass / SIM_DAYS).round(1).reshape(LA.shape)
        step = 4  # export the first 24 h of track, every 2 minutes
        n24 = int(24 * 3600 / 30)
        out["satellites"][name] = {
            "altitude_km": alt, "period_min": per, "inclination_deg": inc, "swath_km": swath,
            "orbits_per_day": round(1440 / per, 2),
            "passes": per_day.tolist(),
            "day_passes": day_per_day.tolist(),
            "track": [[round(float(a), 2), round(float(b), 2)]
                      for a, b in zip(lat[:n24:step], lon[:n24:step])],
            "track_dt_s": 30 * step,
        }
        eq = per_day[len(lats) // 2]
        print(f"  coverage {name}: equator passes/day mean={eq.mean():.2f} min={eq.min()}")
    return out


# ----------------------------------------------------------------------------- Mexico monthly

def mexico_monthly():
    series = defaultdict(lambda: defaultdict(int))
    folder = RAW / "mexico"
    for f in sorted(folder.glob("*.csv")):
        with open(f, encoding="utf-8") as fh:
            head = fh.read(200)
            if not head.startswith("latitude"):
                continue
            fh.seek(0)
            for row in csv.DictReader(fh):
                if row.get("type", "0") not in ("0", ""):
                    continue
                sat = SAT_NAMES.get(row["satellite"])
                if sat:
                    series[sat][row["acq_date"][:7]] += 1
    months = sorted({m for s in series.values() for m in s})
    return {"months": months, "series": {k: [v.get(m, 0) for m in months] for k, v in series.items()}}


# ----------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2024)
    ap.add_argument("--with-noaa21", action="store_true")
    ap.add_argument("--skip-fires", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    print("Orbit coverage simulation...")
    (OUT / "coverage.json").write_text(json.dumps(coverage(), separators=(",", ":")))

    print("Mexico monthly series...")
    (OUT / "mexico_monthly.json").write_text(json.dumps(mexico_monthly(), separators=(",", ":")))

    if a.skip_fires:
        return
    grids, samples = {}, {}
    for sensor in ("modis", "viirs-snpp", "viirs-jpss1"):
        name = f"{sensor}_{a.year}_all_countries.zip"
        path = download(f"{COUNTRY_BASE}/zips/{name}", RAW / "zips" / name)
        print(f"Gridding {name} ...")
        ingest_zip(path, grids, samples, a.year)
    if a.with_noaa21:
        key = load_env().get("FIRMS_MAP_KEY") or os.environ.get("FIRMS_MAP_KEY")
        if not key:
            raise SystemExit("FIRMS_MAP_KEY missing in .env")
        print("Fetching NOAA-21 from FIRMS API ...")
        ingest_noaa21_api(key, a.year, grids, samples)

    data = {"year": a.year, "res": 1.0, "filter": "type == 0 (vegetation fires), country-assigned points",
            "satellites": {k: g.export() for k, g in grids.items()}}
    (OUT / f"fires_grid_{a.year}.json").write_text(json.dumps(data, separators=(",", ":")))
    (OUT / "samples.json").write_text(json.dumps(samples, indent=1))
    for k, g in grids.items():
        print(f"  {k:7} hotspots={g.total:>9,}  cells={len(g.cells):>6}  night={g.night / g.total:.0%}")


if __name__ == "__main__":
    main()
