/* Motion layer for the Burning Activity Calendar (styles in fx.css).
   Loaded after the calendar script, so it reads its globals (map, hotLayer, area, sel, playing, catOf…)
   and wraps a few render functions to add entrance effects. Pure decoration: if anything here fails,
   the calendar keeps working. Off entirely with prefers-reduced-motion. */
(function () {
  "use strict";
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const $ = (id) => document.getElementById(id);
  const isDark = () => root.dataset.theme === "dark";
  const safe = (fn) => { try { fn(); } catch (e) { console.warn("fx:", e); } };

  /* ---------- first-load intro ---------- */
  if (!reduce.matches) {
    root.classList.add("fx-intro");
    setTimeout(() => root.classList.remove("fx-intro"), 1200);
  }

  /* ---------- wrap a global render function (function declarations live on window) ---------- */
  function after(name, fn) {
    const orig = window[name];
    if (typeof orig !== "function") return;
    window[name] = function (...args) { const r = orig.apply(this, args); safe(() => fn(...args)); return r; };
  }

  /* ---------- heat level of the month on screen → data-heat on <html> ---------- */
  function updateHeat() {
    if (typeof area === "undefined" || !area || typeof sel === "undefined" || !sel) return;
    const c = catOf(area, sel.y, sel.m);
    root.dataset.heat = c ? c.k : "normal";
  }
  after("renderHero", updateHeat);

  /* ---------- area change / first render: bars grow, profile line draws ---------- */
  let growTimer;
  function grow() {
    if (reduce.matches) return;
    document.querySelectorAll("#bars i").forEach((el, i) => el.style.setProperty("--i", i));
    document.querySelectorAll("#annual rect[data-year]").forEach((el, i) => el.style.setProperty("--i", i));
    root.classList.remove("fx-grow"); void root.offsetWidth; root.classList.add("fx-grow");
    clearTimeout(growTimer); growTimer = setTimeout(() => root.classList.remove("fx-grow"), 1400);
  }
  after("renderAll", (newArea) => { if (newArea) grow(); });

  /* profile: mark the year line so it can be drawn, and add a ping around the selected month */
  after("renderProf", () => {
    const svg = $("prof");
    const line = svg.querySelector('path[stroke="#E8590C"]');
    if (line) { line.setAttribute("pathLength", "1"); line.classList.add("fx-line"); }
    const dot = [...svg.querySelectorAll("circle")].find((c) => c.getAttribute("r") === "5");
    if (dot && !reduce.matches) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      p.setAttribute("cx", dot.getAttribute("cx")); p.setAttribute("cy", dot.getAttribute("cy"));
      p.setAttribute("r", "5"); p.setAttribute("class", "fx-pulse");
      svg.insertBefore(p, dot);
    }
  });

  /* ---------- tabs: sliding ink + staggered pane entrance ---------- */
  const tabs = document.querySelector(".tabs");
  const ink = document.createElement("span");
  ink.className = "tab-ink"; ink.setAttribute("aria-hidden", "true");
  tabs.appendChild(ink);
  root.classList.add("fx-ink-on");
  function placeInk() {
    const b = tabs.querySelector('button[aria-selected="true"]');
    if (!b) return;
    ink.style.left = b.offsetLeft + 8 + "px";
    ink.style.width = Math.max(0, b.offsetWidth - 16) + "px";
  }
  after("selectTab", (t) => {
    placeInk();
    if (reduce.matches) return;
    const pane = $("p-" + t);
    pane.classList.remove("fx-enter"); void pane.offsetWidth; pane.classList.add("fx-enter");
    setTimeout(() => pane.classList.remove("fx-enter"), 800);
    if (t === "season") setTimeout(wave, 0); // the calendar re-renders the heatmap on the next tick
  });
  new ResizeObserver(placeInk).observe(tabs);
  tabs.addEventListener("scroll", placeInk, { passive: true });
  document.fonts && document.fonts.ready.then(placeInk);
  placeInk();

  /* season heatmap: cells appear in a diagonal wave from the top-left */
  function wave() {
    const heat = $("heat");
    let row = -1, col = 0;
    [...heat.children].forEach((el) => {
      if (el.classList.contains("y")) { row++; col = 0; return; }
      if (el.classList.contains("c") || el.classList.contains("typrow")) {
        el.style.setProperty("--d", Math.min(900, (row * 2 + col) * 14));
        col++;
      }
    });
    heat.classList.remove("fx-wave"); void heat.offsetWidth; heat.classList.add("fx-wave");
    setTimeout(() => heat.classList.remove("fx-wave"), 1500);
  }

  /* ---------- burn calendar: sparks when a month is allowed, bump on the result ---------- */
  function sparks(x, y, n = 12) {
    if (reduce.matches) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      s.className = "fx-spark";
      document.body.appendChild(s);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, d = 22 + Math.random() * 34, sz = 3 + Math.random() * 4;
      s.style.width = s.style.height = sz + "px";
      s.style.left = x - sz / 2 + "px"; s.style.top = y - sz / 2 + "px";
      s.animate([
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d - 10}px) scale(.2)`, opacity: 0 },
      ], { duration: 520 + Math.random() * 380, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => s.remove();
    }
  }
  $("mgrid").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]");
    if (!b) return;
    const turningOn = b.getAttribute("aria-pressed") !== "true", r = b.getBoundingClientRect();
    if (turningOn) sparks(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2);
    requestAnimationFrame(() => {
      const out = $("burnOut");
      out.classList.remove("fx-bump"); void out.offsetWidth; out.classList.add("fx-bump");
    });
  }, true);

  /* ---------- dark mode: circular reveal from the toggle ---------- */
  const themeBtn = $("theme"), themeOrig = themeBtn.onclick;
  if (themeOrig) {
    themeBtn.onclick = function (e) {
      if (!document.startViewTransition || reduce.matches) return themeOrig.call(this, e);
      const r = themeBtn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const t = document.startViewTransition(() => themeOrig.call(this, e));
      t.ready.then(() => root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 620, easing: "cubic-bezier(.4,0,.2,1)", pseudoElement: "::view-transition-new(root)" },
      )).catch(() => {});
    };
  }

  /* ---------- playing flag for CSS ---------- */
  const isPlaying = () => typeof playing !== "undefined" && !!playing;
  setInterval(() => { root.classList.toggle("fx-playing", isPlaying()); }, 120);

  /* ================= map embers: flickering glow over hotspots + rising sparks ================= */
  if (reduce.matches || typeof map === "undefined" || typeof hotLayer === "undefined") return;
  const box = map.getContainer();
  const cv = document.createElement("canvas");
  cv.className = "fx-canvas"; cv.setAttribute("aria-hidden", "true");
  box.appendChild(cv);
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = box.clientWidth; H = box.clientHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    dirty = true;
  }

  /* glow sprites (drawImage is much cheaper than a gradient per point) */
  function sprite(stops, size = 64) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  }
  const GLOW = sprite([[0, "rgba(255,220,120,1)"], [0.25, "rgba(255,140,0,.75)"], [0.6, "rgba(232,70,10,.25)"], [1, "rgba(200,30,0,0)"]]);
  const SPARK = sprite([[0, "rgba(255,250,220,1)"], [0.35, "rgba(255,180,40,.9)"], [1, "rgba(255,80,0,0)"]], 24);

  let pts = [], gen = null, genAt = 0, dirty = true, zooming = false;
  const sparksA = [];
  function collect() {
    const layers = hotLayer.getLayers();
    if (layers[0] === gen && !dirty) return;
    if (layers[0] !== gen) {
      gen = layers[0]; genAt = performance.now();
      // the calendar draws each hotspot as a halo + a core; the core (radius 2.4) marks the point
      pts = layers.filter((l) => l.options && l.options.radius < 3).map((l) => ({
        ll: l.getLatLng(), x: 0, y: 0, ph: Math.random() * 6.28, sp: 1.5 + Math.random() * 2.5, d: Math.random() * 420,
      }));
    }
    for (const p of pts) { const c = map.latLngToContainerPoint(p.ll); p.x = c.x; p.y = c.y; }
    dirty = false;
  }
  map.on("move resize viewreset", () => (dirty = true));
  map.on("zoomstart", () => { zooming = true; });
  map.on("zoomend", () => { zooming = false; dirty = true; });

  function heatLevel() { return { record: 1, much: 0.8, above: 0.6, normal: 0.4, below: 0.3, mbelow: 0.25, low: 0.25 }[root.dataset.heat] ?? 0.4; }

  let last = performance.now(), running = false, ambientAcc = 0, spotAcc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (zooming) return;
    collect();
    const dark = isDark(), heat = heatLevel(), show = map.hasLayer(hotLayer), t = now / 1000, age = now - genAt;
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";

    /* hotspot glow: each one flickers on its own rhythm; new months ignite with a short flash */
    if (show && pts.length) {
      const base = dark ? 0.32 : 0.2, many = pts.length > 300 ? 0.7 : 1;
      for (const p of pts) {
        if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) continue;
        const local = age - p.d;
        if (local < 0) continue;
        const ign = !isPlaying() && local < 450 ? (1 - local / 450) * many : 0;
        const fl = 0.6 + 0.25 * Math.sin(t * p.sp + p.ph) + 0.15 * Math.sin(t * p.sp * 2.7 + p.ph * 1.3);
        const r = (7 + 4 * fl + ign * 7) * (0.85 + heat * 0.3);
        ctx.globalAlpha = Math.min(1, (base * fl * many + ign * 0.25) * (0.75 + heat * 0.4));
        ctx.drawImage(GLOW, p.x - r, p.y - r, r * 2, r * 2);
        if (ign > 0) {
          ctx.globalAlpha = ign * 0.35;
          ctx.strokeStyle = "rgba(255,140,0,1)"; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3 + (1 - ign) * 18, 0, 6.283); ctx.stroke();
        }
      }
      /* sparks leaving random hotspots, more in hotter months */
      spotAcc += dt * Math.min(14, 1.5 + Math.sqrt(pts.length) * 0.45) * (0.5 + heat);
      while (spotAcc > 1 && sparksA.length < 90) {
        spotAcc--;
        const p = pts[(Math.random() * pts.length) | 0];
        if (p.x > 0 && p.y > 0 && p.x < W && p.y < H) sparksA.push(spark(p.x, p.y, 0.7));
      }
      spotAcc = Math.min(spotAcc, 2);
    }

    /* ambient embers drifting up from the bottom edge of the map */
    ambientAcc += dt * (0.8 + heat * 3.2);
    while (ambientAcc > 1 && sparksA.length < 90) { ambientAcc--; sparksA.push(spark(Math.random() * W, H + 4, 1.6)); }

    for (let i = sparksA.length - 1; i >= 0; i--) {
      const s = sparksA[i];
      s.life += dt;
      if (s.life >= s.max) { sparksA.splice(i, 1); continue; }
      s.vx += Math.sin(t * 2 + s.ph) * 6 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy *= 0.995;
      const k = s.life / s.max, a = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * (dark ? 0.9 : 0.6);
      const r = s.r * (1 - k * 0.5);
      ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 14 + s.ph));
      ctx.drawImage(SPARK, s.x - r, s.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  function spark(x, y, long) {
    return { x, y, vx: (Math.random() - 0.5) * 14, vy: -(14 + Math.random() * 26) * (long > 1 ? 1.4 : 1),
      life: 0, max: (0.9 + Math.random() * 1.3) * long, r: 1.8 + Math.random() * 2.6, ph: Math.random() * 6.28 };
  }
  function start() { if (!running && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  new ResizeObserver(resize).observe(box);
  document.addEventListener("visibilitychange", start);
  reduce.addEventListener?.("change", () => { if (reduce.matches) cv.remove(); });
  resize(); start();
})();
