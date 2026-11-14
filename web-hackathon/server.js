// Minimal zero-dependency web server for the A11 hackathon site.
// - Serves static files from ./public
// - Exposes POST /api/chat, which proxies to a private n8n webhook so the
//   agent URL and secret never reach the browser.
// - GET /health for Easypanel health checks.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_MESSAGE_CHARS = 2000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Very small in-memory rate limiter: 20 requests / minute / IP.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

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
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (rateLimited(ip)) return sendJson(res, 429, { error: "Too many requests, slow down." });
  if (!N8N_WEBHOOK_URL) return sendJson(res, 503, { error: "Chat backend is not configured." });

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
      return sendJson(res, 502, { error: "The assistant is unavailable right now." });
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
    return sendJson(res, 504, { error: "The assistant took too long to answer." });
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
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") return sendJson(res, 200, { ok: true, chat: Boolean(N8N_WEBHOOK_URL) });
  if (req.url === "/api/chat") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });
    return handleChat(req, res);
  }
  if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
  sendJson(res, 405, { error: "Method not allowed." });
});

server.listen(PORT, () => console.log(`web-hackathon listening on :${PORT}`));
