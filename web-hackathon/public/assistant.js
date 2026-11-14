// Ember assistant sidebar for the Burning Activity Calendar.
// Pattern from erp-ai spec 047: a right panel opened from the top bar, pushes content on desktop, drawer on narrow
// screens (Esc / backdrop close), remembers if it was open, shows what the user is viewing, welcome + suggestions.
// Talks only to our own server (/api/chat), which proxies to n8n.
(() => {
  const $ = (id) => document.getElementById(id);
  const app = document.querySelector(".app");
  const panel = $("ember-panel"), toggle = $("ember-toggle"), backdrop = $("ember-backdrop");
  const body = $("ember-body"), welcome = $("ember-welcome"), log = $("ember-log"), sugg = $("ember-sugg");
  const form = $("ember-form"), input = $("ember-input"), send = $("ember-send");
  const stateEl = $("ember-state"), ctxEl = $("ember-context"), sr = $("ember-sr");
  if (!panel || !toggle) return;

  const KEY_OPEN = "a11.ember.open", KEY_SID = "a11-chat-session", KEY_LOG = "a11.ember.log";
  const narrow = () => matchMedia("(max-width: 1200px)").matches;
  const get = (k, s) => { try { return (s || localStorage).getItem(k); } catch { return null; } };
  const set = (k, v, s) => { try { (s || localStorage).setItem(k, v); } catch {} };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16) + Math.random().toString(16).slice(2));
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const md = (t) => esc(t)
    .replace(/^\s*[-*] /gm, "• ")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  let sessionId = get(KEY_SID, sessionStorage);
  if (!sessionId) { sessionId = newId(); set(KEY_SID, sessionId, sessionStorage); }
  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(KEY_LOG) || "[]"); } catch {}
  const save = () => set(KEY_LOG, JSON.stringify(history.slice(-40)), sessionStorage);
  let busy = false;

  // ---- Ember avatar: its gesture mirrors the conversation state ----
  const hasEmber = typeof window.Ember !== "undefined";
  const avatar = hasEmber ? Ember.create($("ember-avatar"), { follow: true }) : null;
  const mini = hasEmber ? Ember.create($("ember-mini")) : null;
  const TEXT = { idle: "Ready to help", curious: "Ready to help", reading: "Reading…", thinking: "Thinking…", working: "Still working on it…",
    done: "Ready to help", found: "Ready to help", thankful: "You're welcome", failed: "Something went wrong", sad: "Can't reach the assistant", sleeping: "Napping" };
  let settleT = null, sleepT = null;
  function mood(g, settleMs) {
    clearTimeout(settleT);
    [avatar, mini].forEach((m) => m && m.gesture(g));
    stateEl.textContent = TEXT[g] || "";
    if (g !== "reading") sr.textContent = TEXT[g] || "";
    if (settleMs) settleT = setTimeout(() => mood("idle"), settleMs);
    clearTimeout(sleepT);
    if (g === "idle") sleepT = setTimeout(() => mood("sleeping"), 120000);
  }

  // ---- What the user is looking at (from the calendar app) ----
  const ctx = () => (typeof window.A11Context === "function" ? window.A11Context() : null);
  function renderContext() {
    const c = ctx();
    ctxEl.innerHTML = c
      ? `<svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-eye"/></svg><span>Viewing <strong>${esc(c.area)} · ${esc(c.period)}</strong></span>`
      : "";
    const list = c
      ? [`Is ${c.period} unusual for ${c.area}?`, `When is the fire season in ${c.area}?`, "What is a hotspot and how do satellites detect it?", "Why do MODIS and VIIRS count fires differently?"]
      : ["What is a hotspot and how do satellites detect it?", "Why do MODIS and VIIRS count fires differently?"];
    sugg.innerHTML = list.map((s) => `<li><button type="button">${esc(s)}</button></li>`).join("");
    sugg.querySelectorAll("button").forEach((b) => (b.onclick = () => ask(b.textContent)));
  }
  function contextSuffix() {
    const c = ctx();
    if (!c) return "";
    return `\n\n[App context — the user is viewing: ${c.area} (${c.kind}); ${c.period}; ${c.count} hotspots${c.partial ? " so far this month" : ""}; ` +
      `category "${c.category}"; a typical month like this has about ${c.typical}. The app currently shows illustrative data.]`;
  }
  window.addEventListener("a11:context", () => { if (!panel.hidden) renderContext(); });

  // ---- Messages ----
  function render() {
    welcome.hidden = history.length > 0;
    log.innerHTML = "";
    history.forEach((m, i) => {
      const el = document.createElement("div");
      el.className = "ember-msg " + m.role;
      if (m.role === "bot") el.innerHTML = md(m.text);
      else if (m.role === "err") {
        el.innerHTML = `<span>${esc(m.text)}</span><button type="button">Try again</button>`;
        el.querySelector("button").onclick = () => { const q = m.retry; history.splice(i, 1); ask(q, true); };
      } else el.textContent = m.text;
      log.appendChild(el);
    });
    if (busy) {
      const t = document.createElement("div");
      t.className = "ember-msg bot";
      t.innerHTML = '<span class="ember-typing" aria-label="Ember is typing"><i></i><i></i><i></i></span>';
      log.appendChild(t);
    }
    body.scrollTop = body.scrollHeight;
  }

  async function ask(text, isRetry) {
    const q = String(text || "").trim();
    if (!q || busy) return;
    if (!isRetry) history.push({ role: "user", text: q });
    busy = true; send.disabled = true; input.value = ""; autosize();
    save(); render();
    mood("thinking");
    const slow = setTimeout(() => mood("working"), 2500);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: (q + contextSuffix()).slice(0, 2000), sessionId }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        history.push({ role: "err", text: data.error || "Something went wrong.", retry: q });
        mood("failed", 3000);
      } else {
        history.push({ role: "bot", text: data.reply || "(empty reply)" });
        if (/\b(thanks|thank you|gracias)\b/i.test(q)) mood("thankful", 3000);
        else if (/\b(fire|fires|hotspots?|season|incendios?)\b/i.test(q)) mood("found", 2600);
        else mood("done", 1600);
      }
    } catch {
      history.push({ role: "err", text: "Network error. Check your connection.", retry: q });
      mood("sad", 3000);
    } finally {
      clearTimeout(slow);
      busy = false; save(); render(); updateSend();
      if (!narrow()) input.focus();
    }
  }

  // ---- Composer ----
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(140, input.scrollHeight) + "px"; }
  function updateSend() { send.disabled = busy || !input.value.trim(); }
  input.addEventListener("input", () => { autosize(); updateSend(); if (input.value.trim()) mood("reading", 1500); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });

  // ---- Open / close ----
  function setOpen(open, focus = true) {
    app.classList.toggle("cmp-open", open);
    panel.hidden = !open;
    backdrop.hidden = !(open && narrow());
    toggle.setAttribute("aria-expanded", String(open));
    toggle.classList.toggle("on", open);
    toggle.title = open ? "Close Ember" : "Ask Ember, the A11 assistant";
    if (!narrow()) set(KEY_OPEN, open ? "1" : "0");
    if (open) {
      renderContext(); render();
      if (focus) { mood("curious", 1600); setTimeout(() => input.focus(), 0); }
    } else if (focus) toggle.focus();
  }
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  $("ember-close").addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden && narrow()) setOpen(false); });
  $("ember-new").addEventListener("click", () => {
    if (busy) return;
    history = []; save();
    sessionId = newId(); set(KEY_SID, sessionId, sessionStorage);
    render(); mood("curious", 1200); input.focus();
  });
  if ($("ember-avatar")) $("ember-avatar").addEventListener("click", () => avatar && avatar.flare());

  mood("idle");
  updateSend();
  setOpen(!narrow() && get(KEY_OPEN) === "1", false);
})();
