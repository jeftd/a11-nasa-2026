// Status checks
fetch("/health")
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

function add(text, cls) {
  const el = document.createElement("div");
  el.className = "msg " + cls;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

$("chat-toggle").onclick = () => {
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    if (!log.childElementCount) add("Hi! I'm the A11 assistant. Ask me about MODIS/VIIRS fire hotspots.", "bot");
    input.focus();
  }
};
$("chat-close").onclick = () => (panel.hidden = true);

form.onsubmit = async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  add(message, "user");
  const btn = form.querySelector("button");
  btn.disabled = true;
  const typing = add("…", "bot");
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });
    const data = await r.json();
    typing.remove();
    if (!r.ok || data.error) add(data.error || "Something went wrong.", "err");
    else add(data.reply || "(empty reply)", "bot");
  } catch {
    typing.remove();
    add("Network error. Try again.", "err");
  } finally {
    btn.disabled = false;
    input.focus();
  }
};
