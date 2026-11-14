"""
Local server for the Fire Data Explorer.

Serves web/explorer/ and a small JSON API:

  GET /api/status
      -> {"local_years": [2024], "firms_key": true|false}

  GET /api/pixels?poly=lon,lat;lon,lat;...&start=YYYY-MM-DD&days=1..5&source=local|firms
                 [&sats=Terra,Aqua,SNPP,NOAA20,NOAA21][&all_types=1]
      -> every real fire pixel inside the polygon for those dates:
         {"count", "truncated", "by_sat", "bbox", "pixels": [[lat, lon, scan_km, track_km, sat,
          time_utc, frp_mw, confidence, daynight, date], ...]}

Sources
  local : the pre-built 2024 index (analysis/build_pixel_index.py). No API key needed.
  firms : NASA FIRMS Area API, using FIRMS_MAP_KEY from the project .env (never sent to the browser).

Run:
  python web/server.py            # http://localhost:8765
"""
import csv
import io
import json
import math
import sys
import urllib.parse
import urllib.request
from datetime import date, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "web" / "explorer"
INDEX_DIR = ROOT / "data" / "index"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

SATS = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"]
SAT_FROM_FIRMS = {"Terra": "Terra", "T": "Terra", "Aqua": "Aqua", "A": "Aqua", "N": "SNPP", "N20": "NOAA20", "N21": "NOAA21"}
CONF_DECODE = {201: "l", 202: "n", 203: "h"}
MAX_PIXELS = 8000
MAX_BBOX_DEG2 = 60.0
FIRMS_SOURCES = {  # satellite -> (SP source, NRT source)
    "Terra": ("MODIS_SP", "MODIS_NRT"), "Aqua": ("MODIS_SP", "MODIS_NRT"),
    "SNPP": ("VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"), "NOAA20": ("VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"),
    "NOAA21": ("VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT"),
}


def read_env():
    env = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


# ------------------------------------------------------------------ local index (memory-mapped .npy)
_INDEX = {}


def local_years():
    years = set()
    for p in INDEX_DIR.glob("pixels_*.npz"):
        years.add(int(p.stem.split("_")[1]))
    for p in INDEX_DIR.glob("*/day_start.npy"):
        years.add(int(p.parent.name))
    return sorted(years)


def load_index(year):
    if year in _INDEX:
        return _INDEX[year]
    d = INDEX_DIR / str(year)
    if not (d / "day_start.npy").exists():
        npz = INDEX_DIR / f"pixels_{year}.npz"
        if not npz.exists():
            return None
        print(f"[index] unpacking {npz.name} into memory-mappable .npy files (one time)...", flush=True)
        d.mkdir(parents=True, exist_ok=True)
        with np.load(npz) as z:
            for k in z.files:
                np.save(d / f"{k}.npy", z[k])
    idx = {p.stem: np.load(p, mmap_mode="r") for p in d.glob("*.npy")}
    _INDEX[year] = idx
    return idx


def points_in_polygon(lon, lat, poly):
    """Vectorized ray casting. poly: list of (lon, lat)."""
    inside = np.zeros(lon.shape, dtype=bool)
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        cond = (y1 > lat) != (y2 > lat)
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = (x2 - x1) * (lat - y1) / (y2 - y1) + x1
        inside ^= cond & (lon < xint)
    return inside


def query_local(poly, start, days, sats, all_types):
    idx = load_index(start.year)
    if idx is None:
        raise ValueError(f"No local index for {start.year}. Available: {local_years()}")
    jan1 = date(start.year, 1, 1)
    ds = idx["day_start"]  # ds[k] = first row with day-of-year >= k + 1
    i0 = (start - jan1).days
    i1 = i0 + days
    a = int(ds[i0])
    b = int(ds[i1]) if i1 < len(ds) else len(idx["lat"])
    lons = [p[0] for p in poly]
    lats = [p[1] for p in poly]
    lat = np.asarray(idx["lat"][a:b])
    lon = np.asarray(idx["lon"][a:b])
    m = (lat >= min(lats)) & (lat <= max(lats)) & (lon >= min(lons)) & (lon <= max(lons))
    sat_codes = [SATS.index(s) for s in sats]
    m &= np.isin(np.asarray(idx["sat"][a:b]), sat_codes)
    if not all_types:
        m &= np.asarray(idx["type"][a:b]) == 0
    sel = np.nonzero(m)[0]
    sel = sel[points_in_polygon(lon[sel].astype(np.float64), lat[sel].astype(np.float64), poly)]
    rows = []
    for i in sel + a:
        conf = int(idx["conf"][i])
        rows.append([round(float(idx["lat"][i]), 5), round(float(idx["lon"][i]), 5),
                     round(float(idx["scan"][i]), 2), round(float(idx["track"][i]), 2), SATS[int(idx["sat"][i])],
                     f"{int(idx['time'][i]):04d}", round(float(idx["frp"][i]), 1),
                     CONF_DECODE.get(conf, str(conf)), "N" if idx["night"][i] else "D",
                     (jan1 + timedelta(days=int(idx["doy"][i]) - 1)).isoformat()])
    return rows


# ------------------------------------------------------------------ FIRMS API proxy
def query_firms(poly, start, days, sats, all_types):
    key = read_env().get("FIRMS_MAP_KEY")
    if not key:
        raise ValueError("FIRMS_MAP_KEY is empty in .env")
    lons = [p[0] for p in poly]
    lats = [p[1] for p in poly]
    bbox = f"{min(lons):.4f},{min(lats):.4f},{max(lons):.4f},{max(lats):.4f}"
    recent = (date.today() - start).days < 120
    rows, done = [], set()
    for s in sats:
        sp, nrt = FIRMS_SOURCES[s]
        for src in ((sp, nrt) if recent else (sp,)):
            if src in done:
                break
            url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{src}/{bbox}/{days}/{start.isoformat()}"
            req = urllib.request.Request(url, headers={"User-Agent": "A11-FireExplorer/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                text = r.read().decode("utf-8", "replace")
            if not text.startswith("latitude"):
                raise ValueError("FIRMS: " + text.strip()[:200])
            got = list(csv.DictReader(io.StringIO(text)))
            done.add(src)
            for x in got:
                sat = SAT_FROM_FIRMS.get(x.get("satellite", ""))
                if sat not in sats:
                    continue
                if not all_types and x.get("type", "0") not in ("0", ""):
                    continue
                la, lo = float(x["latitude"]), float(x["longitude"])
                if not points_in_polygon(np.array([lo]), np.array([la]), poly)[0]:
                    continue
                rows.append([round(la, 5), round(lo, 5), float(x["scan"]), float(x["track"]), sat,
                             f"{int(x['acq_time']):04d}", float(x["frp"] or 0), x["confidence"],
                             x["daynight"], x["acq_date"]])
            if got:
                break  # SP had data; no need for NRT
    # de-duplicate (MODIS_* returns both Terra and Aqua for each requested MODIS sat)
    uniq = {tuple(r[:2] + r[4:6] + r[9:10]): r for r in rows}
    return list(uniq.values())


# ------------------------------------------------------------------ HTTP
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def send_json(self, obj, code=200):
        body = json.dumps(obj, separators=(",", ":")).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        if self.path.startswith("/data/") or self.path.endswith((".js", ".css", ".html")) or self.path == "/":
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/status":
            return self.send_json({"local_years": local_years(), "firms_key": bool(read_env().get("FIRMS_MAP_KEY"))})
        if u.path == "/api/pixels":
            try:
                return self.send_json(self.pixels(urllib.parse.parse_qs(u.query)))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
            except Exception as e:  # noqa: BLE001
                return self.send_json({"error": f"{type(e).__name__}: {e}"}, 500)
        return super().do_GET()

    def pixels(self, q):
        get = lambda k, d=None: q.get(k, [d])[0]
        poly = [tuple(map(float, p.split(","))) for p in (get("poly") or "").split(";") if p]
        if len(poly) < 3 or len(poly) > 200:
            raise ValueError("Polygon needs 3 to 200 vertices")
        lons, lats = [p[0] for p in poly], [p[1] for p in poly]
        area = (max(lons) - min(lons)) * (max(lats) - min(lats))
        if area > MAX_BBOX_DEG2:
            raise ValueError(f"Area too large ({area:.0f} deg² bounding box). Keep it under {MAX_BBOX_DEG2:.0f} deg² "
                             "(e.g. 7° × 8°).")
        start = date.fromisoformat(get("start"))
        days = max(1, min(5, int(get("days", "1"))))
        sats = [s for s in (get("sats") or ",".join(SATS)).split(",") if s in SATS]
        source = get("source", "local")
        all_types = get("all_types") == "1"
        rows = (query_firms if source == "firms" else query_local)(poly, start, days, sats, all_types)
        by_sat = {}
        for r in rows:
            by_sat[r[4]] = by_sat.get(r[4], 0) + 1
        rows.sort(key=lambda r: (r[9], r[5]))
        truncated = len(rows) > MAX_PIXELS
        if truncated:  # even sample across the whole period
            n = len(rows)
            rows = [rows[i * n // MAX_PIXELS] for i in range(MAX_PIXELS)]
        return {"source": source, "start": start.isoformat(), "days": days, "count": sum(by_sat.values()),
                "returned": len(rows), "truncated": truncated, "by_sat": by_sat,
                "bbox": [min(lons), min(lats), max(lons), max(lats)], "pixels": rows}


if __name__ == "__main__":
    print(f"Fire Data Explorer on http://localhost:{PORT}  (local index years: {local_years()}, "
          f"FIRMS key: {'yes' if read_env().get('FIRMS_MAP_KEY') else 'no'})", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
