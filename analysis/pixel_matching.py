"""
Do MODIS and VIIRS see the *same* hotspots?

For each daytime pixel of one sensor, look for the nearest pixel of the other sensor on the same day whose
overpass is within --max-dt minutes, and report how many have a counterpart within --radius km (both
directions). Default pair: Aqua (MODIS) vs Suomi NPP (VIIRS), which both cross the equator at ~13:30; over a
given place their passes can still differ by up to ~100 min because the orbits have different altitudes.

Uses the local index (analysis/build_pixel_index.py -> data/index/<YEAR>/).

Usage:
  python analysis/pixel_matching.py --bbox -118 14 -86 33 --start 2024-04-01 --days 61
"""
import argparse
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SATS = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"]


def minutes(t):
    return (t // 100) * 60 + t % 100


def nearest(g, mask, a, b, max_dt):
    """Distance (km) from each pixel of sat a to the nearest pixel of sat b, same day, |dt| <= max_dt."""
    A = np.nonzero(mask & (g["sat"] == a))[0]
    B = np.nonzero(mask & (g["sat"] == b))[0]
    dist = np.full(len(A), np.inf)
    for day in np.unique(g["doy"][A]):
        ka = np.nonzero(g["doy"][A] == day)[0]
        bi = B[g["doy"][B] == day]
        if not len(bi):
            continue
        bl, bo = g["lat"][bi].astype(float), g["lon"][bi].astype(float)
        bt = minutes(g["time"][bi].astype(int))
        for k in ka:
            j = A[k]
            ok = np.abs(bt - minutes(int(g["time"][j]))) <= max_dt
            if not ok.any():
                continue
            dy = (bl[ok] - g["lat"][j]) * 111.32
            dx = (bo[ok] - g["lon"][j]) * 111.32 * np.cos(np.radians(g["lat"][j]))
            dist[k] = np.sqrt(dx * dx + dy * dy).min()
    return A, dist


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", nargs=4, type=float, default=[-118, 14, -86, 33], metavar=("W", "S", "E", "N"))
    ap.add_argument("--start", default="2024-04-01")
    ap.add_argument("--days", type=int, default=61)
    ap.add_argument("--modis", default="Aqua", choices=["Aqua", "Terra"])
    ap.add_argument("--viirs", default="SNPP", choices=["SNPP", "NOAA20"])
    ap.add_argument("--max-dt", type=int, default=100, help="max minutes between overpasses")
    ap.add_argument("--radius", type=float, default=2.0, help="match radius in km")
    a = ap.parse_args()

    start = date.fromisoformat(a.start)
    I = {p.stem: np.load(p, mmap_mode="r") for p in (ROOT / "data" / "index" / str(start.year)).glob("*.npy")}
    ds = I["day_start"]
    i0 = (start - date(start.year, 1, 1)).days
    sl = slice(int(ds[i0]), int(ds[min(i0 + a.days, len(ds) - 1)]))
    g = {k: np.asarray(I[k][sl]) for k in ("lat", "lon", "sat", "type", "night", "doy", "time", "frp", "scan", "track")}
    W, S, E, N = a.bbox
    mask = (g["lat"] >= S) & (g["lat"] <= N) & (g["lon"] >= W) & (g["lon"] <= E) & (g["type"] == 0) & (g["night"] == 0)
    m, v = SATS.index(a.modis), SATS.index(a.viirs)
    print(f"bbox {a.bbox}, {a.start} + {a.days} days, daytime vegetation fires, "
          f"match radius {a.radius} km, |dt| <= {a.max_dt} min\n")
    for x, y in ((m, v), (v, m)):
        idx, d = nearest(g, mask, x, y, a.max_dt)
        area = (g["scan"][idx].astype(float) * g["track"][idx]).sum()
        hit = d <= a.radius
        print(f"{SATS[x]}: {len(idx):,} pixels, mean pixel {area / max(1, len(idx)):.3f} km², total flagged {area:,.0f} km²")
        print(f"   with a {SATS[y]} counterpart: {hit.mean():.0%}  "
              f"(within 1 km {np.mean(d <= 1):.0%}, 3 km {np.mean(d <= 3):.0%})")
        print(f"   median FRP with / without counterpart: {np.median(g['frp'][idx][hit]):.1f} / "
              f"{np.median(g['frp'][idx][~hit]):.1f} MW\n")


if __name__ == "__main__":
    main()
