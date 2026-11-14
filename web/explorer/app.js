/* Fire Data Explorer — Team A11, NASA Space Apps 2026
 * Static page: globe.gl for the 3D globe, a canvas painted as the globe texture for gridded data,
 * Chart.js for the Mexico time series. Data files are produced by analysis/build_explorer_data.py.
 */
(() => {
  "use strict";

  // ------------------------------------------------------------------ satellites
  const SATS = {
    Terra:  { label: "Terra",     inst: "MODIS", color: "#E69F00", from: "Nov 2000", start: 2000.83, end: null,
              status: "Active · end of life approaching", cross: "10:30 / 22:30", pixel: "~1 km" },
    Aqua:   { label: "Aqua",      inst: "MODIS", color: "#56B4E9", from: "Jul 2002", start: 2002.5, end: null,
              status: "Active · end of life approaching", cross: "13:30 / 01:30", pixel: "~1 km" },
    SNPP:   { label: "Suomi NPP", inst: "VIIRS", color: "#009E73", from: "Jan 2012", start: 2012.05, end: 2026.84,
              status: "Ended 2 Nov 2026", cross: "13:30 / 01:30", pixel: "~375 m" },
    NOAA20: { label: "NOAA-20",   inst: "VIIRS", color: "#CC79A7", from: "Apr 2018", start: 2018.25, end: null,
              status: "Active", cross: "12:40 / 00:40", pixel: "~375 m" },
    NOAA21: { label: "NOAA-21",   inst: "VIIRS", color: "#4C8DFF", from: "Jan 2024", start: 2024.05, end: null,
              status: "Active", cross: "12:40 / 00:40 (½ orbit from NOAA-20)", pixel: "~375 m" },
  };
  const ORDER = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"];
  const COMBOS = {
    MODIS: { label: "MODIS (Terra + Aqua)", members: ["Terra", "Aqua"], color: "#f0b44c" },
    VIIRS: { label: "VIIRS (all satellites)", members: ["SNPP", "NOAA20", "NOAA21"], color: "#a98bd6" },
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmt = (n) => n.toLocaleString("en-US");
  const fmtK = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : fmt(n);

  // ------------------------------------------------------------------ color ramps
  const INFERNO = [[0, [40, 11, 84]], [0.25, [101, 21, 110]], [0.5, [188, 55, 84]], [0.72, [249, 142, 9]], [1, [252, 255, 164]]];
  const VIRIDIS = [[0, [68, 1, 84]], [0.25, [59, 82, 139]], [0.5, [33, 145, 140]], [0.75, [94, 201, 98]], [1, [253, 231, 37]]];
  function ramp(stops, t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        const k = (t - t0) / (t1 - t0);
        return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      }
    }
    return stops[stops.length - 1][1];
  }
  const cssGradient = (stops) => `linear-gradient(90deg, ${stops.map(([t, c]) => `rgb(${c}) ${t * 100}%`).join(",")})`;

  // ------------------------------------------------------------------ texture canvases
  const TW = 4096, TH = 2048;
  const base = document.createElement("canvas"); base.width = TW; base.height = TH;
  const tex = document.createElement("canvas"); tex.width = TW; tex.height = TH;
  const tctx = tex.getContext("2d");
  const small = document.createElement("canvas");
  const sctx = small.getContext("2d");

  function drawBase(land, borders) {
    const c = base.getContext("2d");
    c.fillStyle = "#0a1424"; c.fillRect(0, 0, TW, TH);
    // graticule
    c.strokeStyle = "#ffffff10"; c.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) { const x = (lon + 180) / 360 * TW; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, TH); c.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { const y = (90 - lat) / 180 * TH; c.beginPath(); c.moveTo(0, y); c.lineTo(TW, y); c.stroke(); }
    c.strokeStyle = "#ffffff22"; c.beginPath(); c.moveTo(0, TH / 2); c.lineTo(TW, TH / 2); c.stroke();

    const proj = ([lon, lat]) => [(lon + 180) / 360 * TW, (90 - lat) / 180 * TH];
    function ringPath(ring, dx) {
      let prev = null;
      ring.forEach((p, i) => {
        let lon = p[0];
        if (prev !== null) { while (lon - prev > 180) lon -= 360; while (prev - lon > 180) lon += 360; }
        prev = lon;
        const [x, y] = proj([lon, p[1]]);
        i ? c.lineTo(x + dx, y) : c.moveTo(x + dx, y);
      });
    }
    c.fillStyle = "#1c2638";
    for (const f of land.features) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const dx of [-TW, 0, TW]) {
        c.beginPath(); poly.forEach((r) => ringPath(r, dx)); c.fill("evenodd");
      }
    }
    c.fillRect(0, (90 - (-85)) / 180 * TH, TW, TH); // Antarctic cap
    c.strokeStyle = "#3a4a66"; c.lineWidth = 1.4;
    const lines = borders.type === "MultiLineString" ? borders.coordinates : [borders.coordinates];
    for (const line of lines) {
      c.beginPath();
      line.forEach((p, i) => {
        const [x, y] = proj(p);
        if (i && Math.abs(p[0] - line[i - 1][0]) > 180) c.moveTo(x, y);
        else i ? c.lineTo(x, y) : c.moveTo(x, y);
      });
      c.stroke();
    }
  }

  // paint a lat/lon grid (rows from south) into the texture
  function paintGrid(nLat, nLon, colorAt, alpha = 1) {
    small.width = nLon; small.height = nLat;
    const img = sctx.createImageData(nLon, nLat);
    for (let r = 0; r < nLat; r++) {
      const y = nLat - 1 - r; // north at top
      for (let col = 0; col < nLon; col++) {
        const c = colorAt(r, col);
        if (!c) continue;
        const o = (y * nLon + col) * 4;
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c[3] ?? 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    tctx.globalAlpha = 1;
    tctx.drawImage(base, 0, 0);
    tctx.imageSmoothingEnabled = false;
    tctx.globalAlpha = alpha;
    tctx.drawImage(small, 0, 0, TW, TH);
    tctx.globalAlpha = 1;
    pushTexture();
  }

  let globe, globeReady = false;
  function pushTexture() {
    if (!globe) return;
    const m = globe.globeMaterial();
    if (m && m.map) { m.map.image = tex; m.map.needsUpdate = true; }
    else globe.globeImageUrl(tex.toDataURL("image/jpeg", 0.9));
  }

  // ------------------------------------------------------------------ data loading
  const DATA = {};
  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + " " + r.status);
    return r.json();
  }

  async function init() {
    const [land, countries, coverage, mexico, samples, fires] = await Promise.all([
      getJSON("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json"),
      getJSON("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json"),
      getJSON("data/coverage.json"),
      getJSON("data/mexico_monthly.json"),
      getJSON("data/samples.json").catch(() => ({})),
      getJSON("data/fires_grid_2024.json").catch(() => null),
    ]);
    Object.assign(DATA, { coverage, mexico, samples, fires });
    drawBase(topojson.feature(land, land.objects.land),
             topojson.mesh(countries, countries.objects.countries, (a, b) => a !== b));
    tctx.drawImage(base, 0, 0);

    const el = $("#globe");
    globe = new Globe(el, { animateIn: false })
      .globeImageUrl(tex.toDataURL("image/jpeg", 0.9))
      .backgroundColor("#0b0e14")
      .atmosphereColor("#4c8dff")
      .atmosphereAltitude(0.16)
      .pointsTransitionDuration(0)
      .pathTransitionDuration(0)
      .onGlobeReady(() => { globeReady = true; $("#loading").classList.add("hidden"); render(); })
      .onGlobeClick(({ lat, lng }) => onCellClick(lat, lng));
    globe.controls().autoRotate = false;
    globe.pointOfView({ lat: 20, lng: -60, altitude: 2.3 });
    const resize = () => globe.width(el.clientWidth).height(el.clientHeight);
    new ResizeObserver(resize).observe(el); resize();
    el.addEventListener("mousemove", onHover);
    el.addEventListener("mouseleave", () => $("#tooltip").classList.add("hidden"));

    buildFiresUI(); buildSweepUI(); buildPassesUI();
    buildTimeline(); buildSatTable(); buildFieldTable(); buildPixelSvg(); buildMexicoChart();
    $$(".tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    setMode("fires");
  }

  // ------------------------------------------------------------------ modes
  let mode = "fires";
  function setMode(m) {
    mode = m;
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    $$(".mode-body").forEach((d) => d.classList.toggle("hidden", d.dataset.for !== m));
    $("#cell-info").classList.add("hidden");
    if (m !== "sweep") stopSweep();
    globe.pointsData([]).pathsData([]);
    render();
  }
  function render() {
    if (mode === "fires") renderFires();
    else if (mode === "sweep") renderSweep();
    else renderPasses();
  }

  function satOption(container, key, { type = "radio", name, checked, disabled, meta, color, label, onChange }) {
    const lab = document.createElement("label");
    lab.className = "sat-opt" + (checked ? " on" : "") + (disabled ? " disabled" : "");
    lab.innerHTML = `<input type="${type}" name="${name}" value="${key}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
      <span class="sw" style="background:${color}"></span><span>${label}</span><span class="meta">${meta || ""}</span>`;
    lab.querySelector("input").addEventListener("change", () => {
      if (type === "radio") $$(".sat-opt", container).forEach((o) => o.classList.toggle("on", o.querySelector("input").checked));
      else lab.classList.toggle("on", lab.querySelector("input").checked);
      onChange();
    });
    container.appendChild(lab);
  }
  const checkedValues = (container) => $$("input:checked", container).map((i) => i.value);

  // ------------------------------------------------------------------ HOTSPOTS mode
  let fireSel = "Terra";
  const fireIndex = new Map(); // "i,j" -> {sat: cell}
  const FIRE_MAX = Math.log10(30000);

  function cellKey1(lat, lon) { return `${Math.floor(lat + 90)},${Math.floor(lon + 180)}`; }

  function buildFiresUI() {
    const list = $("#fire-sat-list");
    const F = DATA.fires;
    if (!F) { list.innerHTML = `<p class="hint">Hotspot grid not built yet. Run <code>analysis/build_explorer_data.py</code>.</p>`; return; }
    $("#fires-year").textContent = F.year;
    for (const [sat, d] of Object.entries(F.satellites)) {
      for (const c of d.cells) {
        const k = cellKey1(c[0], c[1]);
        if (!fireIndex.has(k)) fireIndex.set(k, {});
        fireIndex.get(k)[sat] = c;
      }
    }
    const has = (s) => !!F.satellites[s];
    for (const s of ORDER) {
      satOption(list, s, { name: "firesat", checked: s === fireSel, disabled: !has(s), color: SATS[s].color,
        label: `${SATS[s].label} <span style="color:var(--muted)">· ${SATS[s].inst}</span>`,
        meta: has(s) ? fmtK(F.satellites[s].total) : "needs API key", onChange: () => { fireSel = checkedValues(list)[0]; renderFires(); } });
    }
    for (const [k, c] of Object.entries(COMBOS)) {
      const members = c.members.filter(has);
      const tot = members.reduce((a, s) => a + F.satellites[s].total, 0);
      satOption(list, k, { name: "firesat", color: c.color, label: c.label, meta: fmtK(tot),
        onChange: () => { fireSel = checkedValues(list)[0]; renderFires(); } });
    }
    $("#fire-legend").innerHTML = `<div class="title">Hotspots per 1° cell in the year (same scale for every satellite)</div>
      <div class="bar" style="background:${cssGradient(INFERNO)}"></div>
      <div class="ticks"><span>1</span><span>10</span><span>100</span><span>1k</span><span>10k</span><span>30k</span></div>`;
  }

  function membersOf(sel) { return COMBOS[sel] ? COMBOS[sel].members.filter((s) => DATA.fires.satellites[s]) : [sel]; }

  function renderFires() {
    const F = DATA.fires;
    if (!F || !globeReady) return;
    const members = membersOf(fireSel);
    const counts = new Map();
    for (const s of members) for (const c of F.satellites[s].cells) {
      const k = cellKey1(c[0], c[1]);
      counts.set(k, (counts.get(k) || 0) + c[2]);
    }
    paintGrid(180, 360, (r, col) => {
      const n = counts.get(`${r},${col}`);
      if (!n) return null;
      const [R, G, B] = ramp(INFERNO, Math.log10(n) / FIRE_MAX);
      return [R, G, B, 235];
    });
    const tot = members.reduce((a, s) => a + F.satellites[s].total, 0);
    const night = members.reduce((a, s) => a + F.satellites[s].night, 0);
    const frp = members.reduce((a, s) => a + F.satellites[s].mean_frp * F.satellites[s].total, 0) / tot;
    const conf = members.reduce((a, s) => { const c = F.satellites[s].confidence; a.h += c.h; a.l += c.l; return a; }, { h: 0, l: 0 });
    $("#fire-stats").innerHTML = [
      stat("Hotspots in " + F.year, fmt(tot), "vegetation fires only"),
      stat("1° cells with fire", fmt(counts.size), "of 64,800 on Earth"),
      stat("Detected at night", Math.round(night / tot * 100) + "%", "VIIRS sees more night fires"),
      stat("Mean fire power", frp.toFixed(1) + " MW", "FRP per hotspot"),
      stat("High confidence", Math.round(conf.h / tot * 100) + "%", ""),
      stat("Low confidence", Math.round(conf.l / tot * 100) + "%", ""),
    ].join("");
  }

  function stat(k, v, s) { return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ""}</div></div>`; }

  function onCellClick(lat, lng) {
    if (mode !== "fires" || !DATA.fires) return;
    const k = cellKey1(lat, lng);
    const cell = fireIndex.get(k) || {};
    const lat0 = Math.floor(lat), lon0 = Math.floor(lng);
    const present = ORDER.filter((s) => DATA.fires.satellites[s]);
    const max = Math.max(1, ...present.map((s) => (cell[s] ? cell[s][2] : 0)));
    const modis = (cell.Terra?.[2] || 0) + (cell.Aqua?.[2] || 0);
    const n20 = cell.NOAA20?.[2] || 0;
    const rows = present.map((s) => {
      const c = cell[s]; const n = c ? c[2] : 0;
      return `<div class="row"><span>${SATS[s].label}</span><div class="track"><div class="fill" style="width:${n / max * 100}%;background:${SATS[s].color}"></div></div><span class="num">${fmt(n)}</span></div>`;
    }).join("");
    const box = $("#cell-info");
    box.innerHTML = `<button class="close-x" aria-label="Close">✕</button>
      <h4>Cell ${fmtLat(lat0)}–${fmtLat(lat0 + 1)}, ${fmtLon(lon0)}–${fmtLon(lon0 + 1)}</h4>
      ${rows}
      <div class="note">${modis && n20 ? `NOAA-20 alone counted <b>${(n20 / modis).toFixed(1)}×</b> the hotspots of both MODIS satellites combined in this cell.` :
        modis + n20 ? "Few detections here — ratios are noisy in small samples." : "No vegetation fires detected in this cell in " + DATA.fires.year + "."}</div>`;
    box.classList.remove("hidden");
    box.querySelector(".close-x").onclick = () => box.classList.add("hidden");
  }
  const fmtLat = (v) => `${Math.abs(v)}°${v >= 0 ? "N" : "S"}`;
  const fmtLon = (v) => `${Math.abs(v)}°${v >= 0 ? "E" : "W"}`;

  // ------------------------------------------------------------------ hover tooltip
  function onHover(ev) {
    const tip = $("#tooltip");
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    const g = globe.toGlobeCoords(x, y);
    if (!g) { tip.classList.add("hidden"); return; }
    let html = `<span class="mono">${g.lat.toFixed(1)}°, ${g.lng.toFixed(1)}°</span><br>`;
    if (mode === "fires" && DATA.fires) {
      const cell = fireIndex.get(cellKey1(g.lat, g.lng)) || {};
      const n = membersOf(fireSel).reduce((a, s) => a + (cell[s]?.[2] || 0), 0);
      html += `<b>${fmt(n)}</b> hotspots · ${COMBOS[fireSel]?.label || SATS[fireSel].label}<br><span class="mono">click to compare satellites</span>`;
    } else if (mode === "passes") {
      const v = passValue(g.lat, g.lng);
      html += `<b>${v.toFixed(1)}</b> observations per day`;
    } else if (mode === "sweep") {
      const i = Math.min(179, Math.floor(g.lat + 90)), j = Math.min(359, Math.floor(g.lng + 180));
      html += `Passes so far: <b>${sweep.count[i * 360 + j]}</b>`;
    }
    tip.innerHTML = html;
    tip.style.left = Math.min(x + 14, rect.width - 200) + "px";
    tip.style.top = (y + 14) + "px";
    tip.classList.remove("hidden");
  }

  // ------------------------------------------------------------------ SWEEP mode
  const NCELL = 180 * 360;
  const cellVec = new Float32Array(NCELL * 3);
  const cellArea = new Float32Array(NCELL);
  let totalArea = 0;
  for (let i = 0; i < 180; i++) {
    const lat = (i - 90 + 0.5) * Math.PI / 180;
    for (let j = 0; j < 360; j++) {
      const lon = (j - 180 + 0.5) * Math.PI / 180, o = (i * 360 + j);
      cellVec[o * 3] = Math.cos(lat) * Math.cos(lon); cellVec[o * 3 + 1] = Math.cos(lat) * Math.sin(lon); cellVec[o * 3 + 2] = Math.sin(lat);
      cellArea[o] = Math.cos(lat); totalArea += Math.cos(lat);
    }
  }
  const sweep = { step: 0, playing: false, speed: 1, acc: 0, sats: ["Terra", "NOAA20"], count: new Uint8Array(NCELL), last: {}, now: new Uint8Array(NCELL), computedTo: -1 };
  const SWEEP_COLORS = [null, [44, 74, 140], [33, 145, 140], [94, 201, 98], [253, 231, 37]];

  function buildSweepUI() {
    const list = $("#sweep-sat-list");
    for (const s of ORDER) {
      const o = DATA.coverage.satellites[s];
      satOption(list, s, { type: "checkbox", name: "sweepsat", checked: sweep.sats.includes(s), color: SATS[s].color,
        label: `${SATS[s].label} <span style="color:var(--muted)">· ${SATS[s].inst}</span>`, meta: `${fmt(o.swath_km)} km`,
        onChange: () => { sweep.sats = checkedValues(list); resetSweep(); renderSweep(); } });
    }
    $("#time").addEventListener("input", (e) => { sweep.step = +e.target.value; renderSweep(); });
    $("#play").addEventListener("click", () => (sweep.playing ? stopSweep() : startSweep()));
    $$("#speed button").forEach((b) => b.addEventListener("click", () => {
      $$("#speed button").forEach((x) => x.classList.toggle("active", x === b));
      sweep.speed = { 1: 0.34, 3: 1, 8: 3 }[b.dataset.v];
    }));
    sweep.speed = 1;
    $("#sweep-legend").innerHTML = `<div class="title">Times each cell has been observed since 00:00 UTC</div>
      <div class="chips">${["1", "2", "3", "4+"].map((t, i) => `<span style="--c:rgb(${SWEEP_COLORS[i + 1]})">${t}</span>`).join("")}
      <span style="--c:#ffffff">in view now</span></div>`;
  }

  function resetSweep() { sweep.count.fill(0); sweep.last = {}; sweep.computedTo = -1; }

  function advanceTo(step) {
    if (step < sweep.computedTo) resetSweep();
    const n = DATA.coverage.satellites;
    for (let k = sweep.computedTo + 1; k <= step; k++) {
      for (const s of sweep.sats) {
        const o = n[s];
        const [la, lo] = o.track[k];
        const halfDeg = o.swath_km / 2 / 6371 * 180 / Math.PI;
        const cosH = Math.cos(halfDeg * Math.PI / 180);
        const lat = la * Math.PI / 180, lon = lo * Math.PI / 180;
        const vx = Math.cos(lat) * Math.cos(lon), vy = Math.cos(lat) * Math.sin(lon), vz = Math.sin(lat);
        const last = sweep.last[s] || (sweep.last[s] = new Int16Array(NCELL).fill(-100));
        const r0 = Math.max(0, Math.floor(la + 90 - halfDeg - 1)), r1 = Math.min(179, Math.ceil(la + 90 + halfDeg + 1));
        for (let i = r0; i <= r1; i++) for (let j = 0; j < 360; j++) {
          const c = i * 360 + j, o3 = c * 3;
          if (cellVec[o3] * vx + cellVec[o3 + 1] * vy + cellVec[o3 + 2] * vz >= cosH) {
            if (k - last[c] > 6) sweep.count[c] = Math.min(255, sweep.count[c] + 1);
            last[c] = k;
          }
        }
      }
    }
    sweep.computedTo = step;
  }

  function renderSweep() {
    if (!globeReady || mode !== "sweep") return;
    const k = sweep.step;
    advanceTo(k);
    const n = DATA.coverage.satellites;
    sweep.now.fill(0);
    for (const s of sweep.sats) { const last = sweep.last[s]; if (last) for (let c = 0; c < NCELL; c++) if (last[c] === k) sweep.now[c] = 1; }
    paintGrid(180, 360, (r, col) => {
      const c = r * 360 + col;
      if (sweep.now[c]) return [255, 255, 255, 140];
      const v = sweep.count[c];
      return v ? [...SWEEP_COLORS[Math.min(4, v)], 150] : null;
    });
    // satellites + recent ground track
    const pts = [], paths = [];
    for (const s of sweep.sats) {
      const tr = n[s].track;
      const [la, lo] = tr[k];
      pts.push({ lat: la, lng: lo, color: SATS[s].color, s });
      paths.push(...splitPath(tr.slice(Math.max(0, k - 30), k + 1), SATS[s].color));
    }
    globe.pointsData(pts).pointLat("lat").pointLng("lng").pointColor("color").pointAltitude(0.06).pointRadius(1.1)
      .pathsData(paths).pathPoints("pts").pathPointLat((p) => p[0]).pathPointLng((p) => p[1]).pathColor("color").pathStroke(1.6).pathPointAlt(0.004);
    const mins = k * DATA.coverage.satellites.Terra.track_dt_s / 60;
    $("#clock").textContent = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(Math.round(mins % 60)).padStart(2, "0")} UTC`;
    $("#time").value = k;
    let seen = 0, seen2 = 0;
    for (let c = 0; c < NCELL; c++) { if (sweep.count[c]) seen += cellArea[c]; if (sweep.count[c] >= 2) seen2 += cellArea[c]; }
    const satStats = sweep.sats.map((s) => {
      const [la, lo] = n[s].track[k];
      const lst = ((mins / 60 + lo / 15) % 24 + 24) % 24;
      return stat(SATS[s].label, (lst >= 6 && lst < 18 ? "☀ day" : "☾ night") + " pass", `local time ${String(Math.floor(lst)).padStart(2, "0")}:${String(Math.floor(lst % 1 * 60)).padStart(2, "0")}`);
    });
    $("#sweep-stats").innerHTML = [
      stat("Earth seen so far", Math.round(seen / totalArea * 100) + "%", `after ${(mins / 60).toFixed(1)} h`),
      stat("Seen 2+ times", Math.round(seen2 / totalArea * 100) + "%", "day + night revisit"),
      ...satStats,
    ].join("");
  }

  function splitPath(points, color) {
    const out = []; let cur = [];
    points.forEach((p, i) => {
      if (i && Math.abs(p[1] - points[i - 1][1]) > 180) { if (cur.length > 1) out.push({ pts: cur, color }); cur = []; }
      cur.push(p);
    });
    if (cur.length > 1) out.push({ pts: cur, color });
    return out;
  }

  let raf = null;
  function startSweep() {
    sweep.playing = true; $("#play").textContent = "❚❚";
    if (sweep.step >= 719) { sweep.step = 0; resetSweep(); }
    const loop = () => {
      sweep.acc += sweep.speed;
      while (sweep.acc >= 1) { sweep.acc -= 1; sweep.step = Math.min(719, sweep.step + 1); }
      renderSweep();
      if (sweep.step >= 719) { stopSweep(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  function stopSweep() { sweep.playing = false; $("#play").textContent = "▶"; if (raf) cancelAnimationFrame(raf); raf = null; }

  // ------------------------------------------------------------------ PASSES mode
  let passSats = ["Terra", "Aqua"], passKind = "all";
  const PASS_MAX = 16;
  function buildPassesUI() {
    const list = $("#pass-sat-list");
    for (const s of ORDER) {
      const o = DATA.coverage.satellites[s];
      satOption(list, s, { type: "checkbox", name: "passsat", checked: passSats.includes(s), color: SATS[s].color,
        label: `${SATS[s].label} <span style="color:var(--muted)">· ${SATS[s].inst}</span>`, meta: `${o.orbits_per_day} orbits/day`,
        onChange: () => { passSats = checkedValues(list); renderPasses(); } });
    }
    $$("#pass-kind button").forEach((b) => b.addEventListener("click", () => {
      $$("#pass-kind button").forEach((x) => x.classList.toggle("active", x === b)); passKind = b.dataset.v; renderPasses();
    }));
    $("#pass-legend").innerHTML = `<div class="title">Observations per day (square-root scale)</div>
      <div class="bar" style="background:${cssGradient(VIRIDIS)}"></div>
      <div class="ticks"><span>0</span><span>1</span><span>2</span><span>4</span><span>9</span><span>16+</span></div>`;
  }
  function passGrid() {
    const C = DATA.coverage, key = passKind === "day" ? "day_passes" : "passes";
    const nLat = C.lats.length, nLon = C.lons.length;
    const g = Array.from({ length: nLat }, () => new Float32Array(nLon));
    for (const s of passSats) { const p = C.satellites[s][key]; for (let i = 0; i < nLat; i++) for (let j = 0; j < nLon; j++) g[i][j] += p[i][j]; }
    return g;
  }
  let passCache = null;
  function passValue(lat, lng) {
    if (!passCache) return 0;
    const r = DATA.coverage.res;
    const i = Math.min(passCache.length - 1, Math.floor((lat + 90) / r)), j = Math.min(passCache[0].length - 1, Math.floor((lng + 180) / r));
    return passCache[i][j];
  }
  // ramp ticks above map value v -> sqrt(v)/sqrt(16): 1->.25 2->.35 4->.5 9->.75
  function renderPasses() {
    if (!globeReady || mode !== "passes") return;
    const g = passCache = passGrid();
    const C = DATA.coverage;
    paintGrid(C.lats.length, C.lons.length, (r, col) => {
      const v = g[r][col];
      if (!passSats.length) return null;
      if (v === 0) return [255, 60, 60, 190];
      const [R, G, B] = ramp(VIRIDIS, Math.sqrt(v) / Math.sqrt(PASS_MAX));
      return [R, G, B, 165];
    });
    const paths = [];
    for (const s of passSats) {
      const o = C.satellites[s];
      const oneOrbit = Math.round(o.period_min * 60 / o.track_dt_s);
      paths.push(...splitPath(o.track.slice(0, oneOrbit + 1), SATS[s].color));
    }
    globe.pointsData([]).pathsData(paths).pathPoints("pts").pathPointLat((p) => p[0]).pathPointLng((p) => p[1]).pathColor("color").pathStroke(1.4).pathPointAlt(0.004);
    // stats: equator band (rows touching 0°) and 60°N
    const eqRow = g[Math.floor(90 / C.res)], hiRow = g[Math.floor(150 / C.res)];
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const zeroShare = eqRow.filter((v) => v < 1).length / eqRow.length;
    $("#pass-stats").innerHTML = passSats.length ? [
      stat("At the equator", mean(eqRow).toFixed(1) + "/day", `min ${Math.min(...eqRow).toFixed(1)} per day`),
      stat("At 60°N", mean(hiRow).toFixed(1) + "/day", "orbits converge"),
      stat("Equator < 1 look/day", Math.round(zeroShare * 100) + "%", "of longitudes (avg. over days)"),
      stat("Line on the globe", "1 orbit", "~" + Math.round(C.satellites[passSats[0]].period_min) + " min, then Earth rotates"),
    ].join("") : `<p class="hint">Select at least one satellite.</p>`;
  }

  // ------------------------------------------------------------------ satellites section
  function buildTimeline() {
    const y0 = 1999.5, y1 = 2027.2, pct = (y) => ((y - y0) / (y1 - y0) * 100) + "%";
    const ticks = [2000, 2004, 2008, 2012, 2016, 2020, 2024].map((y) => `<span style="left:${pct(y)}">${y}</span>`).join("");
    const rows = ORDER.map((s) => {
      const S = SATS[s];
      return `<div class="tl-row"><div class="name"><b style="color:${S.color}">${S.label}</b> <span style="color:var(--muted);font-size:11px">${S.inst}</span></div>
        <div class="lane"><div class="tl-mark" style="left:${pct(2012.05)}"></div><div class="tl-mark" style="left:${pct(2018.25)}"></div>
        <div class="bar ${S.end ? "ended" : ""}" style="left:${pct(S.start)};width:calc(${pct(S.end || 2026.87)} - ${pct(S.start)});background:${S.color}"></div></div></div>`;
    }).join("");
    $("#timeline").innerHTML = `<div class="tl-axis">${ticks}</div>${rows}
      <p class="hint" style="margin:8px 0 6px 120px">Dashed lines: start of the MODIS–VIIRS overlap (2012) and the arrival of NOAA-20 (2018). Today: Nov 2026.</p>`;
  }

  function buildSatTable() {
    const C = DATA.coverage.satellites, F = DATA.fires?.satellites || {};
    const head = ["Satellite", "Instrument", "Data from", "Status", "Altitude", "Orbits / day", "Swath width", "Fire pixel", "Equator crossing (local)", "Hotspots 2024", "Night share"];
    const rows = ORDER.map((s) => {
      const S = SATS[s], o = C[s], f = F[s];
      return `<tr><td><b style="color:${S.color}">${S.label}</b></td><td>${S.inst}</td><td>${S.from}</td><td>${S.status}</td>
        <td class="mono">${o.altitude_km} km</td><td class="mono">${o.orbits_per_day}</td><td class="mono">${fmt(o.swath_km)} km</td>
        <td>${S.pixel}</td><td class="mono">${S.cross}</td>
        <td class="mono">${f ? fmt(f.total) : "— (API key)"}</td><td class="mono">${f ? Math.round(f.night / f.total * 100) + "%" : "—"}</td></tr>`;
    }).join("");
    $("#sat-table").innerHTML = `<thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
  }

  const FIELDS = [
    ["latitude", "latitude", "Center of the fire pixel (not the exact location of the fire)."],
    ["longitude", "longitude", "Center of the fire pixel."],
    ["brightness", "bright_ti4", "Brightness temperature (K) in the mid-infrared channel that drives detection. MODIS band 21/22 vs VIIRS I-4: different bands, not comparable."],
    ["bright_t31", "bright_ti5", "Brightness temperature (K) in the thermal channel — the background reference."],
    ["scan", "scan", "Real pixel size along the scan (km). MODIS pixels grow toward the swath edge; VIIRS stays near 0.375 km."],
    ["track", "track", "Real pixel size along the satellite track (km)."],
    ["acq_date", "acq_date", "Acquisition date (UTC)."],
    ["acq_time", "acq_time", "Overpass time HHMM (UTC). Convert to local time for daily calendars."],
    ["satellite", "satellite", "Terra / Aqua for MODIS; N (Suomi NPP), N20, N21 for VIIRS."],
    ["instrument", "instrument", "MODIS or VIIRS."],
    ["confidence", "confidence", "Detection confidence. MODIS: 0–100 (<30 low, ≥80 high). VIIRS: l / n / h."],
    ["version", "version", "Processing collection (and NRT suffix for near-real-time data)."],
    ["frp", "frp", "Fire Radiative Power in megawatts — proxy of fire intensity. Comparable only with care across sensors."],
    ["daynight", "daynight", "D = daytime detection, N = nighttime detection."],
    ["type", "type", "0 vegetation fire · 1 volcano · 2 other static land source (gas flares, industry) · 3 offshore. We keep 0."],
  ];
  function buildFieldTable() {
    const m = DATA.samples.Terra || DATA.samples.Aqua || {}, v = DATA.samples.NOAA20 || DATA.samples.SNPP || {};
    const rows = FIELDS.map(([a, b, d]) => `<tr><td>${a === b ? a : a + " / " + b}</td><td class="mono">${m[a] ?? "—"}</td><td class="mono">${v[b] ?? "—"}</td><td>${d}</td></tr>`).join("");
    $("#field-table").innerHTML = `<thead><tr><th>Field (MODIS / VIIRS)</th><th>Real MODIS record (${m.satellite || "Terra"})</th><th>Real VIIRS record (${v.satellite || "N20"})</th><th>Meaning</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function buildPixelSvg() {
    const g = $(".px-viirs-grid"), n = 7, size = 200 / n;
    const fires = $$(".pixel-svg .fire").map((c) => [+c.getAttribute("cx"), +c.getAttribute("cy")]);
    let html = "";
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = 10 + j * size, y = 10 + i * size;
      const hit = fires.some(([fx, fy]) => fx >= x && fx < x + size && fy >= y && fy < y + size);
      html += `<rect x="${x}" y="${y}" width="${size}" height="${size}" class="${hit ? "hit" : ""}"/>`;
    }
    g.innerHTML = html;
  }

  // ------------------------------------------------------------------ Mexico chart
  let mxChart, mxScale = "linear", mxAgg = "month";
  function buildMexicoChart() {
    Chart.defaults.color = "#93a0b6";
    Chart.defaults.borderColor = "#243046";
    Chart.defaults.font.family = "Inter, sans-serif";
    $$("#mx-scale button").forEach((b) => b.addEventListener("click", () => { $$("#mx-scale button").forEach((x) => x.classList.toggle("active", x === b)); mxScale = b.dataset.v; drawMexico(); }));
    $$("#mx-agg button").forEach((b) => b.addEventListener("click", () => { $$("#mx-agg button").forEach((x) => x.classList.toggle("active", x === b)); mxAgg = b.dataset.v; drawMexico(); }));
    drawMexico();
  }
  function drawMexico() {
    const M = DATA.mexico;
    let labels = M.months, series = M.series;
    if (mxAgg === "year") {
      const years = [...new Set(M.months.map((m) => m.slice(0, 4)))];
      series = Object.fromEntries(Object.entries(M.series).map(([s, arr]) => [s, years.map((y) => arr.reduce((a, v, i) => a + (M.months[i].startsWith(y) ? v : 0), 0))]));
      labels = years;
    }
    const sats = ORDER.filter((s) => series[s]);
    const datasets = sats.map((s) => ({
      label: SATS[s].label + " (" + SATS[s].inst + ")", borderColor: SATS[s].color, backgroundColor: SATS[s].color,
      data: series[s].map((v, i) => (v === 0 && !hasData(s, labels[i]) ? null : v)), borderWidth: mxAgg === "year" ? 2.2 : 1.4,
      pointRadius: mxAgg === "year" ? 3 : 0, tension: 0.15, spanGaps: false,
    }));
    if (mxAgg === "year") {
      datasets.push({ label: "Naive sum of all satellites", borderColor: "#ffffff", borderDash: [6, 5], backgroundColor: "#fff", borderWidth: 2,
        pointRadius: 0, data: labels.map((_, i) => sats.reduce((a, s) => a + (series[s][i] || 0), 0)) });
    }
    if (mxChart) mxChart.destroy();
    mxChart = new Chart($("#mx-chart"), {
      type: "line", data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        scales: {
          x: { ticks: { maxTicksLimit: 14, callback(v) { const l = this.getLabelForValue(v); return mxAgg === "year" ? l : l.endsWith("-01") ? l.slice(0, 4) : ""; } }, grid: { display: false } },
          y: { type: mxScale === "log" ? "logarithmic" : "linear", title: { display: true, text: "Hotspots per " + mxAgg }, ticks: { callback: (v) => fmtK(+v) } },
        },
        plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y == null ? "no data" : fmt(c.parsed.y)}` } } },
      },
    });
  }
  function hasData(s, label) { return (+label.slice(0, 4) + (label.length > 4 ? (+label.slice(5, 7) - 0.5) / 12 : 0.5)) >= SATS[s].start; }

  init().catch((e) => { $("#loading").textContent = "Could not load data: " + e.message; console.error(e); });
})();
