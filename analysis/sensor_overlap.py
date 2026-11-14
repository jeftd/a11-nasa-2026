"""
Compare MODIS (Terra+Aqua) and VIIRS (NOAA-20) active fire hotspot counts
for one country over the years both sensors overlap.

Data source: NASA FIRMS "Country Yearly Summary" CSVs (Standard Processing),
public, no login required:
  https://firms.modaps.eosdis.nasa.gov/country/

Usage:
  python analysis/sensor_overlap.py --country Mexico --years 2019 2020 2021 2022 2023 2024

Output: monthly counts per sensor, VIIRS/MODIS ratio, and correlation of the
monthly series. Downloaded files are cached in data/raw/ (git-ignored).
"""
import argparse
import csv
import math
import statistics
import urllib.request
from collections import Counter
from pathlib import Path

BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"
SENSORS = {
    "MODIS": "modis",            # Terra + Aqua, Collection 6.1, 1 km
    "VIIRS_N20": "viirs-jpss1",  # NOAA-20, 375 m
}
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


def fetch(sensor_dir: str, year: int, country: str) -> Path:
    name = f"{sensor_dir}_{year}_{country}.csv"
    dest = RAW / sensor_dir / str(year) / name
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        url = f"{BASE}/{sensor_dir}/{year}/{name}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest


def monthly_counts(path: Path, drop_low_conf: bool) -> Counter:
    c = Counter()
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("type") not in (None, "", "0"):
                continue  # keep presumed vegetation fires only
            if drop_low_conf:
                conf = row["confidence"]
                if conf.isdigit():
                    if int(conf) < 30:  # MODIS low-confidence class
                        continue
                elif conf == "l":       # VIIRS low-confidence class
                    continue
            c[row["acq_date"][:7]] += 1
    return c


def pearson(x, y):
    mx, my = statistics.mean(x), statistics.mean(y)
    num = sum((a - mx) * (b - my) for a, b in zip(x, y))
    den = math.sqrt(sum((a - mx) ** 2 for a in x) * sum((b - my) ** 2 for b in y))
    return num / den if den else float("nan")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", default="Mexico")
    ap.add_argument("--years", nargs="+", type=int, default=[2019, 2020, 2021, 2022, 2023, 2024])
    ap.add_argument("--drop-low-conf", action="store_true")
    a = ap.parse_args()

    m, v = Counter(), Counter()
    for y in a.years:
        m += monthly_counts(fetch(SENSORS["MODIS"], y, a.country), a.drop_low_conf)
        v += monthly_counts(fetch(SENSORS["VIIRS_N20"], y, a.country), a.drop_low_conf)

    months = sorted(set(m) | set(v))
    print(f"{a.country}  years={a.years}  drop_low_conf={a.drop_low_conf}")
    print(f"{'month':8} {'MODIS':>7} {'VIIRS':>7} {'ratio':>6}")
    ratios = []
    for k in months:
        r = v[k] / m[k] if m[k] else float("nan")
        if m[k] >= 50:
            ratios.append(r)
        print(f"{k:8} {m[k]:7d} {v[k]:7d} {r:6.2f}")

    tm, tv = sum(m.values()), sum(v.values())
    xs = [m[k] for k in months]
    ys = [v[k] for k in months]
    print(f"\nTotal MODIS={tm}  VIIRS_N20={tv}  overall ratio={tv / tm:.2f}")
    print(f"Monthly ratio (months with >=50 MODIS): median={statistics.median(ratios):.2f} "
          f"min={min(ratios):.2f} max={max(ratios):.2f}")
    print(f"Pearson r (monthly counts)       = {pearson(xs, ys):.3f}")
    print(f"Pearson r (log1p monthly counts) = "
          f"{pearson([math.log1p(x) for x in xs], [math.log1p(y) for y in ys]):.3f}")

    # Seasonal ratio by calendar month: is a single constant factor enough?
    by_cal = {}
    for k in months:
        if m[k] >= 50:
            by_cal.setdefault(k[5:], []).append(v[k] / m[k])
    print("\nMedian VIIRS/MODIS ratio by calendar month:")
    print("  " + "  ".join(f"{mo}:{statistics.median(rs):.1f}" for mo, rs in sorted(by_cal.items())))


if __name__ == "__main__":
    main()
