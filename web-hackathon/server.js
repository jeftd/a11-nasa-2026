// Minimal web server for the A11 hackathon site (only dependency: pg, for the harmonized data).
// - Serves static files from ./public
// - Exposes POST /api/chat, which proxies to a private n8n webhook so the
//   agent URL and secret never reach the browser.
// - Exposes the harmonized fire series from the a11-db Postgres (see DATA_CONTRACT.md):
//     GET  /api/harmonized/index         -> index.json
//     GET  /api/harmonized/areas/<id>     -> areas/<id>.json
//     POST /api/harmonized/polygon        -> { months } for a polygon drawn in the page
//     POST /api/harmonized/raw            -> raw monthly counts per sensor (validation of the harmonization)
//     POST /api/hotspots                  -> the individual detections in an area and date range (CSV or JSON)
//   Without DATABASE_URL (or if the database fails) the GETs serve the fake files in
//   public/data/harmonized/, which say "synthetic": true.
// - GET /health for Easypanel health checks.
// Upstream failures return 200 + { error } because the Easypanel proxy
// replaces 5xx responses with its own HTML error page.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const PORT = Number(process.env.PORT || 3000);
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const FAKE_DIR = path.join(PUBLIC_DIR, "data", "harmonized");
const MAX_MESSAGE_CHARS = 2000;
const DATABASE_URL = process.env.DATABASE_URL || "";
const CACHE_MS = 10 * 60_000; // data changes once a day; areas take ~1 s to compute

// Postgres pool, only when DATABASE_URL is set (read-only role a11_web, see analysis/db/schema.sql).
let pool = null;
if (DATABASE_URL) {
  try {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: DATABASE_URL, max: 4, statement_timeout: 20_000, idleTimeoutMillis: 30_000 });
    pool.on("error", (err) => console.error("pg pool error", err.message));
  } catch (err) {
    console.error("pg module not available, serving fake harmonized data:", err.message);
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Very small in-memory rate limiter: `max` requests / minute / IP, per bucket.
const hits = new Map();
function rateLimited(ip, bucket = "default", max = 20) {
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}
const clientIp = (req) => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 16_384) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// n8n can answer in several shapes depending on the nodes used; normalize.
function extractReply(data) {
  if (data == null) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return extractReply(data[0]);
  return data.output ?? data.reply ?? data.text ?? data.message ?? JSON.stringify(data);
}

async function handleChat(req, res) {
  if (rateLimited(clientIp(req))) return sendJson(res, 429, { error: "Too many requests, slow down." });
  if (!N8N_WEBHOOK_URL) return sendJson(res, 200, { error: "Chat backend is not configured." });

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const message = String(payload.message || "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) return sendJson(res, 400, { error: "Message is required." });
  const sessionId = /^[\w-]{8,64}$/.test(payload.sessionId || "") ? payload.sessionId : crypto.randomUUID();

  try {
    const upstream = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(N8N_WEBHOOK_SECRET ? { "X-Webhook-Secret": N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({ message, sessionId }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      console.error("n8n error", upstream.status, text.slice(0, 300));
      return sendJson(res, 200, { error: "The assistant is unavailable right now." });
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return sendJson(res, 200, { reply: extractReply(data), sessionId });
  } catch (err) {
    console.error("n8n request failed", err.message);
    return sendJson(res, 200, { error: "The assistant took too long to answer." });
  }
}

// ---- Harmonized data ----
const cache = new Map(); // key -> { t, body }

async function dbJson(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows[0] ? rows[0].j : null;
}

function fakeJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(FAKE_DIR, file), "utf8"));
  } catch {
    return null;
  }
}

// GET index / areas/<id>: database first (cached), fake files as fallback.
async function handleHarmonizedGet(res, key) {
  let sql, params, fakeFile;
  if (key === "index") {
    sql = "SELECT harmonized_index_json() AS j";
    params = [];
    fakeFile = "index.json";
  } else {
    const id = key.slice("areas/".length).replace(/\.json$/, "");
    if (!/^[a-z0-9_-]{1,40}$/.test(id)) return sendJson(res, 404, { error: "Unknown area." });
    sql = "SELECT harmonized_area_json($1) AS j";
    params = [id];
    fakeFile = path.join("areas", `${id}.json`);
    key = `areas/${id}`;
  }

  if (pool) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < CACHE_MS) return sendJson(res, 200, hit.body);
    try {
      const body = await dbJson(sql, params);
      if (body == null) return sendJson(res, 404, { error: "Unknown area." });
      cache.set(key, { t: Date.now(), body });
      return sendJson(res, 200, body);
    } catch (err) {
      console.error("harmonized query failed, serving fake data:", key, err.message);
    }
  }
  const fake = fakeJson(fakeFile);
  return fake ? sendJson(res, 200, fake) : sendJson(res, 404, { error: "Not found." });
}

// POST { polygon: [[lat, lon], ...] } -> { area_km2, months } computed in the database.
async function handleHarmonizedPolygon(req, res) {
  if (rateLimited(clientIp(req))) return sendJson(res, 429, { error: "Too many requests, slow down." });
  if (!pool) return sendJson(res, 200, { error: "Database not configured." });
  let pts;
  try {
    pts = JSON.parse(await readBody(req)).polygon;
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }
  const ok = Array.isArray(pts) && pts.length >= 3 && pts.length <= 200 &&
    pts.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
      Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
  if (!ok) return sendJson(res, 400, { error: "polygon must be 3-200 [lat, lon] pairs." });
  const ring = pts.map(([lat, lon]) => [lon, lat]);
  ring.push(ring[0]);
  try {
    const body = await dbJson("SELECT harmonized_drawn_json($1) AS j", [JSON.stringify({ type: "Polygon", coordinates: [ring] })]);
    return sendJson(res, 200, body);
  } catch (err) {
    console.error("polygon query failed", err.message);
    return sendJson(res, 200, { error: /too large/i.test(err.message) ? err.message : "Could not compute this area." });
  }
}

// ---- Area geometry shared by the endpoints below ----
// { area: "<id>" } uses the areas table; { polygon: [[lat, lon], ...] } a shape drawn in the page.
// Returns { sql, param, key }: `sql` is an expression that yields the geometry from $1. Or { error }.
function areaGeometry(body) {
  if (typeof body.area === "string") {
    if (!/^[a-z0-9_-]{1,40}$/.test(body.area)) return { error: "Unknown area." };
    return { sql: "(SELECT geom FROM areas WHERE id = $1)", param: body.area, key: `area:${body.area}` };
  }
  const pts = body.polygon;
  const ok = Array.isArray(pts) && pts.length >= 3 && pts.length <= 200 &&
    pts.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
      Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
  if (!ok) return { error: "Send an area id or a polygon of 3-200 [lat, lon] pairs." };
  const ring = pts.map(([lat, lon]) => [lon, lat]);
  ring.push(ring[0]);
  const geojson = JSON.stringify({ type: "Polygon", coordinates: [ring] });
  return { sql: "ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))", param: geojson, key: `poly:${geojson}` };
}

async function readJsonBody(req, res) {
  try {
    const body = JSON.parse(await readBody(req));
    if (body && typeof body === "object") return body;
  } catch {}
  sendJson(res, 400, { error: "Invalid JSON body." });
  return null;
}

// The area must exist and be under 100,000 km² (same limit as drawn areas). Returns an error message or null.
async function checkArea(geo) {
  const { rows } = await pool.query(`SELECT ST_Area(g::geography) / 1e6 AS km2 FROM (SELECT ${geo.sql} AS g) x`, [geo.param]);
  if (!rows[0] || rows[0].km2 == null) return "Unknown area.";
  if (rows[0].km2 > 100000) return `Area too large: ${Math.round(rows[0].km2).toLocaleString("en-US")} km2 (max 100,000).`;
  return null;
}

// POST { area | polygon } -> { months: [{ month, modis, noaa20, snpp, noaa21 }] }: raw vegetation-fire detections per
// month and satellite family, before any harmonization. The page uses it to show and cross-validate the adjustment.
async function handleHarmonizedRaw(req, res) {
  if (rateLimited(clientIp(req))) return sendJson(res, 429, { error: "Too many requests, slow down." });
  if (!pool) return sendJson(res, 200, { error: "Database not configured." });
  const body = await readJsonBody(req, res);
  if (!body) return;
  const geo = areaGeometry(body);
  if (geo.error) return sendJson(res, 400, { error: geo.error });
  const hit = cache.get(`raw:${geo.key}`);
  if (hit && Date.now() - hit.t < CACHE_MS) return sendJson(res, 200, hit.body);
  try {
    const bad = await checkArea(geo);
    if (bad) return sendJson(res, 200, { error: bad });
    const { rows } = await pool.query(
      `SELECT to_char(r.month, 'YYYY-MM') AS month,
              coalesce(sum(r.hotspots) FILTER (WHERE r.satellite IN ('Terra', 'Aqua')), 0)::int AS modis,
              coalesce(sum(r.hotspots) FILTER (WHERE r.satellite = 'NOAA20'), 0)::int AS noaa20,
              coalesce(sum(r.hotspots) FILTER (WHERE r.satellite = 'SNPP'), 0)::int AS snpp,
              coalesce(sum(r.hotspots) FILTER (WHERE r.satellite = 'NOAA21'), 0)::int AS noaa21
       FROM polygon_monthly_raw(${geo.sql}) r GROUP BY r.month ORDER BY r.month`, [geo.param]);
    const out = { months: rows };
    cache.set(`raw:${geo.key}`, { t: Date.now(), body: out });
    return sendJson(res, 200, out);
  } catch (err) {
    console.error("raw query failed", err.message);
    return sendJson(res, 200, { error: "Could not compute this area." });
  }
}

// POST { area | polygon, from: "YYYY-MM-DD", to: "YYYY-MM-DD", format: "csv" | "json", satellites?: [...] }
//   csv  -> every vegetation-fire detection in the area and dates (all satellites unless `satellites` is given),
//           up to HOTSPOT_CSV_MAX rows; headers X-Rows / X-Truncated.
//   json -> { total, points: [[lat, lon, frp, conf_class, satellite], ...] }, the HOTSPOT_JSON_MAX strongest, for the map.
const HOTSPOT_CSV_MAX = 200_000;
const HOTSPOT_JSON_MAX = 3_000;
const SATELLITES = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"];
const CSV_COLUMNS = ["acq_date", "acq_time", "latitude", "longitude", "sensor", "satellite", "confidence", "conf_class",
  "frp", "brightness", "bright_2", "scan", "track", "daynight", "fire_type", "processing", "version"];

function csvCell(v) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function handleHotspots(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const asJson = body.format === "json";
  if (rateLimited(clientIp(req), asJson ? "dots" : "csv", asJson ? 120 : 10)) {
    return sendJson(res, 429, { error: "Too many requests, slow down." });
  }
  if (!pool) return sendJson(res, 200, { error: "Database not configured." });
  const geo = areaGeometry(body);
  if (geo.error) return sendJson(res, 400, { error: geo.error });
  const dateOk = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
  if (!dateOk(body.from) || !dateOk(body.to) || body.from > body.to) {
    return sendJson(res, 400, { error: "from and to must be YYYY-MM-DD dates, from <= to." });
  }
  const sats = Array.isArray(body.satellites) ? body.satellites.filter((s) => SATELLITES.includes(s)) : SATELLITES;
  if (!sats.length) return sendJson(res, 400, { error: "No valid satellites." });

  const cacheKey = asJson ? `dots:${geo.key}:${body.from}:${body.to}:${sats.join()}` : null;
  const hit = cacheKey && cache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_MS) return sendJson(res, 200, hit.body);

  try {
    const bad = await checkArea(geo);
    if (bad) return sendJson(res, 200, { error: bad });
    const where = `ST_Intersects(h.geom, (SELECT ${geo.sql})) AND h.acq_date BETWEEN $2::date AND $3::date
                   AND coalesce(h.fire_type, 0) = 0 AND h.satellite = ANY($4::text[])`;
    const params = [geo.param, body.from, body.to, sats];
    if (asJson) {
      const { rows } = await pool.query(
        `SELECT count(*) OVER () AS total, h.latitude, h.longitude, h.frp, h.conf_class, h.satellite
         FROM hotspots h WHERE ${where} ORDER BY h.frp DESC NULLS LAST LIMIT ${HOTSPOT_JSON_MAX}`, params);
      const out = {
        total: rows.length ? Number(rows[0].total) : 0,
        points: rows.map((r) => [r.latitude, r.longitude, r.frp, r.conf_class, r.satellite]),
      };
      if (cache.size > 500) cache.clear();
      cache.set(cacheKey, { t: Date.now(), body: out });
      return sendJson(res, 200, out);
    }
    const { rows } = await pool.query(
      `SELECT ${CSV_COLUMNS.map((c) => (c === "acq_date" ? "to_char(h.acq_date, 'YYYY-MM-DD') AS acq_date" : "h." + c)).join(", ")}
       FROM hotspots h WHERE ${where} ORDER BY h.acq_date, h.acq_time LIMIT ${HOTSPOT_CSV_MAX + 1}`, params);
    const truncated = rows.length > HOTSPOT_CSV_MAX;
    if (truncated) rows.length = HOTSPOT_CSV_MAX;
    const lines = [CSV_COLUMNS.join(",")];
    for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Rows": String(rows.length),
      "X-Truncated": truncated ? "1" : "0",
    });
    return res.end(lines.join("\n") + "\n");
  } catch (err) {
    console.error("hotspots query failed", err.message);
    return sendJson(res, 200, { error: "Could not read the hotspots for this area." });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const type = MIME[path.extname(filePath)] || "application/octet-stream";
    // Text files are gzipped when the browser accepts it (the reported-fires JSON is 1.6 MB raw, ~0.5 MB gzipped).
    if (/^(text|application\/json)/.test(type) && data.length > 1024 && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
      return zlib.gzip(data, (zerr, gz) => {
        if (zerr) {
          res.writeHead(200, { "Content-Type": type });
          return res.end(data);
        }
        res.writeHead(200, { "Content-Type": type, "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
        res.end(gz);
      });
    }
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") return sendJson(res, 200, { ok: true, chat: Boolean(N8N_WEBHOOK_URL), db: Boolean(pool) });
  const urlPath = new URL(req.url, "http://x").pathname;
  if (urlPath === "/api/harmonized/raw" || urlPath === "/api/hotspots") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });
    return urlPath === "/api/hotspots" ? handleHotspots(req, res) : handleHarmonizedRaw(req, res);
  }
  if (urlPath === "/api/harmonized/polygon") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });
    return handleHarmonizedPolygon(req, res);
  }
  if (urlPath === "/api/harmonized/index" || urlPath.startsWith("/api/harmonized/areas/")) {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Use GET." });
    return handleHarmonizedGet(res, urlPath.slice("/api/harmonized/".length));
  }
  if (req.url === "/api/chat") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });
    return handleChat(req, res);
  }
  if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
  sendJson(res, 405, { error: "Method not allowed." });
});

server.listen(PORT, () => console.log(`web-hackathon listening on :${PORT}`));
