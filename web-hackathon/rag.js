// Ember document search (RAG) over web-hackathon/knowledge/*.md.
//
// On start the server splits every document into sections (## headings), embeds the ones it has not seen before
// with OpenAI (LangChain OpenAIEmbeddings, text-embedding-3-small) and keeps the vectors in Postgres (table
// rag_chunks, see analysis/db/rag.sql) so a redeploy only pays for changed sections. Sections that no longer exist
// are deleted. The search itself runs in memory (cosine similarity over a few hundred vectors is instant), so
// pgvector is not needed. Without a database it still works, re-embedding everything on each start.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const EMBEDDINGS_MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || path.join(__dirname, "knowledge");
const MAX_CHARS = 1800; // longer sections are split by paragraphs
const MIN_SCORE = 0.2; // cosine similarity below this is not returned

function chunkMarkdown(source, text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const title = (lines.find((l) => /^#\s/.test(l)) || source).replace(/^#\s*/, "").trim();
  const sections = [];
  let head = "", body = [];
  const flush = () => {
    const content = body.join("\n").trim();
    if (content) sections.push({ section: head || title, content });
    body = [];
  };
  for (const l of lines) {
    if (/^#\s/.test(l)) continue;
    if (/^##+\s/.test(l)) { flush(); head = l.replace(/^#+\s*/, "").trim(); }
    else body.push(l);
  }
  flush();
  const out = [];
  for (const s of sections) {
    // Split long sections on blank lines, keeping each piece under MAX_CHARS.
    const parts = [];
    let cur = "";
    for (const p of s.content.split(/\n\s*\n/)) {
      if (cur && (cur + "\n\n" + p).length > MAX_CHARS) { parts.push(cur); cur = p; }
      else cur = cur ? cur + "\n\n" + p : p;
    }
    if (cur) parts.push(cur);
    parts.forEach((content, i) =>
      out.push({ source, title, section: s.section + (parts.length > 1 ? ` (${i + 1})` : ""), content }),
    );
  }
  return out;
}

function loadDocs() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return [];
  return fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.toLowerCase().endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort()
    .flatMap((f) => chunkMarkdown(f, fs.readFileSync(path.join(KNOWLEDGE_DIR, f), "utf8")))
    .map((c) => {
      // The embedded text carries the document and section titles, which helps retrieval a lot.
      const text = `${c.title} — ${c.section}\n\n${c.content}`;
      return { ...c, text, hash: crypto.createHash("sha256").update(EMBEDDINGS_MODEL + "\n" + text).digest("hex") };
    });
}

const norm = (v) => {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return v.map((x) => x / s);
};
const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

function createRag({ pool }) {
  if (!OPENAI_API_KEY) return null;
  let embedder = null;
  async function getEmbedder() {
    if (!embedder) {
      const { OpenAIEmbeddings } = await import("@langchain/openai");
      embedder = new OpenAIEmbeddings({ model: EMBEDDINGS_MODEL, apiKey: OPENAI_API_KEY, batchSize: 64, maxRetries: 2 });
    }
    return embedder;
  }

  let index = []; // [{ source, title, section, content, vec }]
  const status = { ready: false, chunks: 0, embedded: 0, store: pool ? "postgres" : "memory", error: null };

  async function build() {
    const docs = loadDocs();
    const known = new Map();
    let usePg = Boolean(pool);
    if (usePg) {
      try {
        const { rows } = await pool.query("SELECT hash, embedding FROM rag_chunks WHERE model = $1", [EMBEDDINGS_MODEL]);
        rows.forEach((r) => known.set(r.hash, r.embedding));
      } catch (err) {
        console.error("rag: rag_chunks unavailable, keeping vectors in memory:", err.message);
        usePg = false;
        status.store = "memory";
      }
    }
    const missing = docs.filter((d) => !known.has(d.hash));
    if (missing.length) {
      const vectors = await (await getEmbedder()).embedDocuments(missing.map((d) => d.text));
      missing.forEach((d, i) => known.set(d.hash, vectors[i]));
      status.embedded = missing.length;
      if (usePg) {
        try {
          for (const d of missing)
            await pool.query(
              `INSERT INTO rag_chunks (hash, source, section, content, model, embedding) VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (hash) DO NOTHING`,
              [d.hash, d.source, d.section, d.content, EMBEDDINGS_MODEL, known.get(d.hash)],
            );
        } catch (err) {
          console.error("rag: could not store vectors:", err.message);
        }
      }
    }
    if (usePg) {
      try {
        await pool.query("DELETE FROM rag_chunks WHERE NOT (hash = ANY($1::text[]))", [docs.map((d) => d.hash)]);
      } catch (err) {
        console.error("rag: could not prune old sections:", err.message);
      }
    }
    index = docs.map((d) => ({ source: d.source, title: d.title, section: d.section, content: d.content, vec: norm(known.get(d.hash)) }));
    status.ready = true;
    status.chunks = index.length;
    console.log(`rag: ${index.length} sections indexed (${missing.length} embedded now, store ${status.store})`);
  }

  const building = build().catch((err) => {
    status.error = err.message;
    console.error("rag: indexing failed:", err.message);
  });

  async function search(query, k = 4) {
    await building;
    if (!index.length) return [];
    const q = norm(await (await getEmbedder()).embedQuery(String(query).slice(0, 2000)));
    return index
      .map((c) => ({ c, score: dot(q, c.vec) }))
      .filter((x) => x.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(8, k)))
      .map(({ c, score }) => ({ document: c.title, section: c.section, file: c.source, score: Math.round(score * 100) / 100, text: c.content }));
  }

  return { search, status };
}

module.exports = { createRag, chunkMarkdown };
