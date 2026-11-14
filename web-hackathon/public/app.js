(() => {
// Status checks
if (document.getElementById("srv")) fetch("/health")
  .then((r) => r.json())
  .then((h) => {
    document.getElementById("srv").textContent = "online";
    document.getElementById("bot").textContent = h.chat ? "connected" : "not configured";
  })
  .catch(() => {
    document.getElementById("srv").textContent = "offline";
  });

// Chat widget — talks only to our own backend (/api/chat), never to n8n directly.
const $ = (id) => document.getElementById(id);
const panel = $("chat");
const log = $("chat-log");
const form = $("chat-form");
const input = $("chat-input");

let sessionId = null;
try { sessionId = sessionStorage.getItem("a11-chat-session"); } catch {}
if (!sessionId) {
  sessionId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  try { sessionStorage.setItem("a11-chat-session", sessionId); } catch {}
}

// Tiny, safe markdown for bot replies: escape everything first, then allow bold, italic and inline code.
function renderMarkdown(text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function add(text, cls) {
  const el = document.createElement("div");
  el.className = "msg " + cls;
  if (cls === "bot") el.innerHTML = renderMarkdown(text);
  else el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

// Ember, the mascot: launcher button + header avatar. Its gesture mirrors the chat state.
const hasEmber = typeof window.Ember !== "undefined";
const fab = hasEmber ? Ember.create($("ember-fab"), { follow: true }) : null;
const head = hasEmber ? Ember.create($("ember-head"), { follow: true }) : null;
const status = $("ember-status");
let settleTimer = null;
let sleepTimer = null;

function mood(gesture, label, settleAfterMs) {
  clearTimeout(settleTimer);
  [fab, head].forEach((m) => m && m.gesture(gesture));
  if (label) status.textContent = "· " + label;
  if (settleAfterMs) settleTimer = setTimeout(() => mood("idle", "A11 Assistant"), settleAfterMs);
  // Doze off after two minutes without activity.
  clearTimeout(sleepTimer);
  if (gesture === "idle") sleepTimer = setTimeout(() => mood("sleeping", "napping"), 120_000);
}
mood("idle");
if (head) $("ember-head").onclick = () => head.flare();

$("chat-toggle").onclick = () => {
  panel.hidden = !panel.hidden;
  if (fab) fab.flare();
  if (!panel.hidden) {
    if (!log.childElementCount) add("Hi! I'm Ember, the A11 assistant. Ask me about MODIS/VIIRS fire hotspots.", "bot");
    mood("curious", "A11 Assistant", 1800);
    input.focus();
  }
};
$("chat-close").onclick = () => {
  panel.hidden = true;
  mood("idle", "A11 Assistant");
};
input.addEventListener("input", () => {
  if (input.value.trim()) mood("reading", "reading…", 1500);
});

form.onsubmit = async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  add(message, "user");
  const btn = form.querySelector("button");
  btn.disabled = true;
  const typing = add("…", "bot");
  mood("thinking", "thinking…");
  const slow = setTimeout(() => mood("working", "working on it…"), 2500);
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });
    const data = await r.json();
    typing.remove();
    if (!r.ok || data.error) {
      add(data.error || "Something went wrong.", "err");
      mood("failed", "something went wrong", 3000);
    } else {
      add(data.reply || "(empty reply)", "bot");
      if (/\b(thanks|thank you|gracias)\b/i.test(message)) mood("thankful", "you're welcome", 3000);
      else if (/\b(fire|fires|hotspot|hotspots|incendio|incendios)\b/i.test(message)) mood("found", "A11 Assistant", 2600);
      else mood("done", "A11 Assistant", 1600);
    }
  } catch {
    typing.remove();
    add("Network error. Try again.", "err");
    mood("sad", "offline", 3000);
  } finally {
    clearTimeout(slow);
    btn.disabled = false;
    input.focus();
  }
};
})();
