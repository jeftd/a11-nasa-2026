"""Build the compact file of officially reported wildfires used by the calendar's "Detected vs reported" view.

Source: CONAFOR, "Incendios forestales" (datos.gob.mx, CC BY 4.0), one row per fire with coordinates:
  - 2015-2024: https://www.datos.gob.mx/datastore/dump/ddf38874-6243-4437-8f76-19f797cafa5c  (decimal degrees)
  - 2025:      https://www.datos.gob.mx/datastore/dump/b61ec11c-e729-4da0-83f6-09965a49d45a  (DMS columns, positive lon)
The listed "download" links return 403 to scripts; the CKAN datastore dumps above work.

Output: web-hackathon/public/data/reported/conafor-mx.json, columnar to keep it small:
  t   = months since 2015-01 of the fire's start date
  lat = latitude  x 1000 (about 100 m)
  lon = longitude x 1000
  ha  = burned area in hectares x 10

Usage:  py analysis/build_reported_fires.py <2015-2024 dump.csv> <2025 dump.csv>
"""
import csv
import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "web-hackathon" / "public" / "data" / "reported" / "conafor-mx.json"
Y0 = 2015


def num(s):
    try:
        return float(str(s).strip())
    except ValueError:
        return None


def rows_2015_2024(path):
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            yield r.get("Fecha_Inicio", ""), num(r.get("latitud")), num(r.get("longitud")), num(r.get("Total_hectareas"))


def rows_2025(path):
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            g = [num(r.get(k)) for k in ("latitud_grados", "latitud_minutos", "latitud_segundos",
                                         "longitud_grados", "longitud_minutos", "longitud_segundos")]
            if any(v is None for v in g):
                yield "", None, None, None
                continue
            lat = g[0] + g[1] / 60 + g[2] / 3600
            lon = -(abs(g[3]) + g[4] / 60 + g[5] / 3600)  # degrees are stored positive; Mexico is west
            yield r.get("fecha_inicio", ""), lat, lon, num(r.get("total_ha"))


def main(a, b):
    t, lat, lon, ha = [], [], [], []
    skipped = 0
    for date, la, lo, h in list(rows_2015_2024(a)) + list(rows_2025(b)):
        if not date or la is None or lo is None or la == 0 or lo == 0 or not (14 <= la <= 33.5 and -118.5 <= lo <= -86):
            skipped += 1
            continue
        y, m = int(date[:4]), int(date[5:7])
        if y < Y0 - 1:
            skipped += 1
            continue
        t.append(max(0, (y - Y0) * 12 + m - 1))  # the few Dec-2014 starts of the 2015 file go to Jan 2015
        lat.append(round(la * 1000))
        lon.append(round(lo * 1000))
        ha.append(round((h or 0) * 10))
    out = {
        "source": "CONAFOR, Incendios forestales (datos.gob.mx), CC BY 4.0",
        "url": "https://www.datos.gob.mx/dataset/incendios_forestales",
        "first_year": Y0,
        "last_year": Y0 + max(t) // 12,
        "fires": len(t),
        "t": t, "lat": lat, "lon": lon, "ha": ha,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"{len(t)} fires written, {skipped} skipped -> {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")
    per_year = {}
    for v, h in zip(t, ha):
        y = Y0 + v // 12
        n, s = per_year.get(y, (0, 0))
        per_year[y] = (n + 1, s + h / 10)
    for y in sorted(per_year):
        print(y, per_year[y][0], round(per_year[y][1]))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
