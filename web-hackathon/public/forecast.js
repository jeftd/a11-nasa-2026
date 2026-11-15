// 72 h fire forecast for an area (FireCast model, via the /api/forecast/ proxy in server.js).
// This is the only place in the page that knows the forecast API format (see FORECAST.md).
//
//   const f = await A11Forecast.forPolygon([[lat, lon], ...]);
//   f.pAny      chance of at least one hotspot in the area in the next 72 h (0-1)
//   f.pMax      highest cell probability inside the area
//   f.level     "very_high" | "high" | "moderate" | "low"   (from pMax, same thresholds as the API)
//   f.cells     [{lat, lon, prob, risk, hotspots_7d, ...}] cells of 0.25° that touch the area
//   f.meta      { issue_date, valid_from, valid_to, mode, model, ... }
// Throws if the forecast service is unavailable; the page then shows "Forecast unavailable".
(function () {
  const BASE = "/api/forecast/";
  const RES = 0.25; // grid of the model, degrees
  const LEVELS = { muy_alto: "very_high", alto: "high", moderado: "moderate", bajo: "low" };
  const cache = new Map(); // polygon key -> { t, promise }
  const TTL = 30 * 60_000;

  function levelOf(p) {
    return p >= 0.8 ? "very_high" : p >= 0.5 ? "high" : p >= 0.2 ? "moderate" : "low";
  }

  // Point in polygon, both in [lat, lon].
  function inside(p, vs) {
    const x = p[1], y = p[0];
    let ins = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][1], yi = vs[i][0], xj = vs[j][1], yj = vs[j][0];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }

  // A grid cell touches the area if its centre is inside, or a vertex / the centroid of the area is inside it.
  function touches(cell, poly, centroid) {
    if (inside([cell.lat, cell.lon], poly)) return true;
    const h = RES / 2, inCell = (p) => Math.abs(p[0] - cell.lat) <= h && Math.abs(p[1] - cell.lon) <= h;
    return inCell(centroid) || poly.some(inCell);
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: "no-cache" });
    const body = await res.json();
    if (!res.ok || body.error || body.detail) throw new Error(body.error || body.detail || `HTTP ${res.status}`);
    return body;
  }

  async function compute(poly, date) {
    const lats = poly.map((p) => p[0]), lons = poly.map((p) => p[1]);
    const bbox = [Math.min(...lons) - RES, Math.min(...lats) - RES, Math.max(...lons) + RES, Math.max(...lats) + RES]
      .map((v) => v.toFixed(3)).join(",");
    const qs = new URLSearchParams({ bbox, min_prob: "0", limit: "5000" });
    if (date) qs.set("date", date);
    const body = await getJson(`${BASE}forecast?${qs}`);
    const centroid = [lats.reduce((a, b) => a + b, 0) / lats.length, lons.reduce((a, b) => a + b, 0) / lons.length];
    const cells = body.cells.filter((c) => touches(c, poly, centroid));
    let none = 1, pMax = 0, expected = 0;
    for (const c of cells) { none *= 1 - c.prob; pMax = Math.max(pMax, c.prob); expected += c.prob; }
    const { cells: _all, count: _n, ...meta } = body;
    return {
      meta, cells: cells.map((c) => ({ ...c, level: LEVELS[c.risk] || levelOf(c.prob) })),
      nearby: body.cells.map((c) => ({ ...c, level: LEVELS[c.risk] || levelOf(c.prob) })),
      pAny: 1 - none, pMax, expected, level: levelOf(pMax),
    };
  }

  function forPolygon(poly, date) {
    const key = JSON.stringify([poly, date || ""]);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < TTL) return hit.promise;
    const promise = compute(poly, date);
    promise.catch(() => cache.delete(key));
    cache.set(key, { t: Date.now(), promise });
    return promise;
  }

  window.A11Forecast = { forPolygon, levelOf, RES };
})();
