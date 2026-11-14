/* Fire Data Guide — Team A11, NASA Space Apps 2026 */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const SATS = {
    Terra: { label: "Terra", inst: "MODIS", color: "#E69F00" },
    Aqua: { label: "Aqua", inst: "MODIS", color: "#56B4E9" },
    SNPP: { label: "Suomi NPP", inst: "VIIRS", color: "#009E73" },
    NOAA20: { label: "NOAA-20", inst: "VIIRS", color: "#CC79A7" },
    NOAA21: { label: "NOAA-21", inst: "VIIRS", color: "#4C8DFF" },
  };
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const getJSON = (u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  // ------------------------------------------------------------------ KPIs
  async function kpis() {
    const F = await getJSON("data/fires_grid_2024.json");
    const box = $("#kpis");
    if (!F) { box.remove(); return; }
    const t = (s) => F.satellites[s]?.total || 0;
    const modis = t("Terra") + t("Aqua");
    const items = [
      [fmt(modis), "MODIS hotspots in 2024", "Terra + Aqua (2 satellites)"],
      [fmt(t("NOAA20")), "NOAA-20 hotspots in 2024", "one VIIRS satellite"],
      [(t("NOAA20") / modis).toFixed(1) + "×", "one VIIRS vs both MODIS", "global, whole year"],
      ["r ≈ 0.995", "same seasonal timing", "Mexico monthly, 2019–2024"],
    ];
    box.innerHTML = items.map(([v, k, s]) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div><div class="s">${s}</div></div>`).join("");
  }

  // ------------------------------------------------------------------ day of overpasses
  const tmin = (h) => +h.slice(0, 2) * 60 + +h.slice(2);
  const hhmm = (m) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`; };
  function passesOf(win) {
    const groups = {};
    for (const p of win.pixels) (groups[p[4]] = groups[p[4]] || []).push(p);
    const out = [];
    for (const [sat, px] of Object.entries(groups)) {
      px.sort((a, b) => tmin(a[5]) - tmin(b[5]));
      let cur = null;
      for (const p of px) {
        const t = tmin(p[5]);
        if (!cur || t - cur.t1 > 20) { cur = { sat, t0: t, t1: t, n: 0, lon: 0, frp: 0 }; out.push(cur); }
        cur.t1 = t; cur.n++; cur.lon += p[1]; cur.frp += p[6];
      }
    }
    out.forEach((p) => { p.local = ((p.t0 + (p.lon / p.n) / 15 * 60) % 1440 + 1440) % 1440; p.frp /= p.n; });
    return out.sort((a, b) => a.local - b.local);
  }
  async function dayChart() {
    const P = await getJSON("data/pixels_showcase.json");
    if (!P) { $("#day").remove(); return; }
    const seg = $("#day-win");
    seg.innerHTML = P.windows.map((w, i) => `<button data-i="${i}" class="${i ? "" : "active"}">${w.date} · ${Math.abs(w.lat0)}°N ${Math.abs(w.lon0)}°W</button>`).join("");
    seg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); draw(P.windows[+b.dataset.i]);
    }));
    draw(P.windows[0]);

    function draw(w) {
      const svg = $("#day-svg");
      svg.innerHTML = "";
      const W = 1000, H = 300, L = 40, R = 40, T = 20, B = 40;
      const x = (m) => L + (m / 1440) * (W - L - R);
      const passes = passesOf(w);
      const maxN = Math.max(...passes.map((p) => p.n));
      const y = (n) => H - B - (n / maxN) * (H - T - B - 130);
      el("rect", { x: x(360), y: T, width: x(1080) - x(360), height: H - T - B, fill: "#ffffff08" }, svg);
      for (let h = 0; h <= 24; h += 3) {
        el("line", { x1: x(h * 60), x2: x(h * 60), y1: T, y2: H - B, stroke: "#243046" }, svg);
        const t = el("text", { x: x(h * 60), y: H - B + 18, fill: "#93a0b6", "font-size": 12, "text-anchor": "middle", "font-family": "JetBrains Mono" }, svg);
        t.textContent = `${String(h).padStart(2, "0")}:00`;
      }
      const lab = el("text", { x: x(360) + 8, y: T + 16, fill: "#93a0b6", "font-size": 12 }, svg);
      lab.textContent = "daytime (06–18 local solar time)";
      // place labels greedily: move a label up while it collides with one already placed
      const placed = [];
      for (const p of passes) {
        const S = SATS[p.sat], cx = x(p.local), base = Math.min(y(p.n), H - B - 30);
        let top = base, moved = true;
        while (moved) {
          moved = false;
          for (const q of placed) {
            if (Math.abs(q.cx - cx) < 118 && top > q.top - 32 && top - 32 < q.top) { top = q.top - 34; moved = true; }
          }
        }
        placed.push({ cx, top });
        el("line", { x1: cx, x2: cx, y1: H - B, y2: y(p.n), stroke: S.color, "stroke-width": 10, "stroke-linecap": "round" }, svg);
        if (top < base) el("line", { x1: cx, x2: cx, y1: top - 4, y2: y(p.n) - 6, stroke: S.color, "stroke-width": 1, "stroke-dasharray": "2 3" }, svg);
        const t1 = el("text", { x: cx, y: top - 22, fill: "#e6ebf3", "font-size": 12.5, "text-anchor": "middle", "font-weight": 600 }, svg);
        t1.textContent = `${p.n} px`;
        const t2 = el("text", { x: cx, y: top - 8, fill: S.color, "font-size": 11.5, "text-anchor": "middle" }, svg);
        t2.textContent = `${S.label} ${hhmm(p.local)}`;
      }
      const modis = passes.filter((p) => SATS[p.sat].inst === "MODIS").reduce((a, p) => a + p.n, 0);
      const viirs = passes.filter((p) => SATS[p.sat].inst === "VIIRS").reduce((a, p) => a + p.n, 0);
      $("#day-note").innerHTML = `${passes.length} overpasses in one day over this ~111 × 105 km cell · MODIS ${modis} pixels,
        VIIRS ${viirs} pixels. Mean FRP per pixel: ` + passes.map((p) => `${SATS[p.sat].label} ${hhmm(p.local)}: ${p.frp.toFixed(0)} MW`).join(" · ");
    }
  }

  // ------------------------------------------------------------------ pixel grid demo (illustrative)
  const AREA_KM = 3, FRACTION = 0.001;
  let fires = [], seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const sizeFromSlider = (v) => Math.round(30 * Math.pow(10, (v / 100) * 3.2)); // 30 m² … ~47,500 m²
  function makeFires() {
    const n = +$("#d-n").value, s = sizeFromSlider(+$("#d-s").value);
    fires = Array.from({ length: n }, () => {
      const area = s * Math.exp((rnd() - 0.5) * 1.6); // lognormal-ish spread around the typical size
      return { x: rnd() * AREA_KM, y: rnd() * AREA_KM, area };
    });
  }
  function grid(svgId, pix, color) {
    const svg = $(svgId);
    svg.innerHTML = "";
    const n = Math.ceil(AREA_KM / pix - 1e-9), scale = 300 / AREA_KM;
    const cellArea = pix * pix * 1e6;
    const sum = new Float64Array(n * n);
    for (const f of fires) {
      const i = Math.min(n - 1, Math.floor(f.y / pix)), j = Math.min(n - 1, Math.floor(f.x / pix));
      sum[i * n + j] += f.area;
    }
    let flagged = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const hit = sum[i * n + j] >= FRACTION * cellArea;
      if (hit) flagged++;
      el("rect", { x: j * pix * scale, y: i * pix * scale, width: Math.min(pix, AREA_KM - j * pix) * scale, height: Math.min(pix, AREA_KM - i * pix) * scale,
        fill: hit ? color + "66" : "none", stroke: hit ? color : "#2b3852", "stroke-width": hit ? 1.6 : 0.8 }, svg);
    }
    for (const f of fires) {
      const r = Math.max(1.6, Math.sqrt(f.area / Math.PI) / 1000 * scale);
      el("circle", { cx: f.x * scale, cy: f.y * scale, r, fill: "#ffcf4a", stroke: "#ff7a1a", "stroke-width": 0.8 }, svg);
    }
    return { flagged, area: flagged * pix * pix, threshold: FRACTION * cellArea };
  }
  function demo() {
    $("#d-n-o").textContent = $("#d-n").value;
    $("#d-s-o").textContent = fmt(sizeFromSlider(+$("#d-s").value)) + " m²";
    const m = grid("#d-modis", 1, "#E69F00"), v = grid("#d-viirs", 0.375, "#CC79A7");
    $("#d-stats").innerHTML = `
      <div class="stat"><div class="k">MODIS flags</div><div class="v">${m.flagged} px</div><div class="s">${m.area.toFixed(2)} km² · needs ≥ ${fmt(m.threshold)} m² of fire per pixel</div></div>
      <div class="stat"><div class="k">VIIRS flags</div><div class="v">${v.flagged} px</div><div class="s">${v.area.toFixed(2)} km² · needs ≥ ${fmt(v.threshold)} m²</div></div>
      <div class="stat"><div class="k">Count ratio</div><div class="v">${m.flagged ? (v.flagged / m.flagged).toFixed(1) + "×" : "∞"}</div><div class="s">VIIRS / MODIS pixels</div></div>`;
  }
  function initDemo() {
    makeFires(); demo();
    $("#d-n").addEventListener("input", () => { makeFires(); demo(); });
    $("#d-s").addEventListener("input", () => { makeFires(); demo(); });
    $("#d-shuffle").addEventListener("click", () => { seed = Math.floor(Math.random() * 1e9) + 1; makeFires(); demo(); });
  }

  kpis(); dayChart(); initDemo();
})();
