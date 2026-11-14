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
  const TW = 7200, TH = 3600; // 0.1° grid = 2 texture pixels
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
  function paintGrid(nLat, nLon, colorAt, alpha = 1, lineRes = 0) {
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
    // grid lines baked into the texture when cells are big enough to see them
    const px = TW / (360 / (lineRes || 1));
    if (lineRes && px >= 6) {
      tctx.strokeStyle = "rgba(255,255,255,0.16)"; tctx.lineWidth = 1;
      tctx.beginPath();
      for (let x = 0; x <= TW; x += px) { tctx.moveTo(Math.round(x) + 0.5, 0); tctx.lineTo(Math.round(x) + 0.5, TH); }
      for (let y = 0; y <= TH; y += px) { tctx.moveTo(0, Math.round(y) + 0.5); tctx.lineTo(TW, Math.round(y) + 0.5); }
      tctx.stroke();
    }
    pushTexture();
  }

  let globe, globeReady = false;
  function pushTexture() {
    if (!globe) return;
    const m = globe.globeMaterial();
    if (m && m.map) {
      m.map.image = tex;
      m.map.magFilter = 1003; // THREE.NearestFilter: crisp cells when zoomed in
      m.map.anisotropy = 8;
      m.map.needsUpdate = true;
    }
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
    const [land, countries, coverage, mexico, samples, fires, pixels] = await Promise.all([
      getJSON("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json"),
      getJSON("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json"),
      getJSON("data/coverage.json"),
      getJSON("data/mexico_monthly.json"),
      getJSON("data/samples.json").catch(() => ({})),
      getJSON("data/fires_grid_2024.json").catch(() => null),
      getJSON("data/pixels_showcase.json").catch(() => null),
    ]);
    Object.assign(DATA, { coverage, mexico, samples, fires, pixels });
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
      .onGlobeClick(({ lat, lng }) => { if (mode === "pixels") addVertex(lat, lng); else onCellClick(lat, lng); })
      .onZoom((pov) => onZoomChange(pov));
    globe.controls().autoRotate = false;
    globe.pointOfView({ lat: 20, lng: -60, altitude: 2.3 });
    const resize = () => globe.width(el.clientWidth).height(el.clientHeight);
    new ResizeObserver(resize).observe(el); resize();
    el.addEventListener("mousemove", onHover);
    el.addEventListener("mouseleave", () => {
      $("#tooltip").classList.add("hidden");
      if (hoverRect) { hoverRect = null; hoverKey = null; updateFirePaths(); }
    });

    buildFiresUI(); buildPixelsUI(); buildSweepUI(); buildPassesUI();
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
    globe.pointsData([]).pathsData([]).polygonsData([]);
    hoverRect = null; hoverKey = null; zoomLines = []; zoomKey = "";
    if (m === "pixels") renderPixels(true);
    else render();
    if (m === "fires") onZoomChange(globe.pointOfView());
  }
  function render() {
    if (mode === "fires") renderFires();
    else if (mode === "pixels") renderPixels(false);
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
    updateFireLegend();
    loadFine().then(() => { aggCache.clear(); if (mode === "fires") renderFires(); }).catch((e) => console.warn("fine grid not available", e));
    $$("#fire-res button").forEach((b) => b.addEventListener("click", () => {
      $$("#fire-res button").forEach((x) => x.classList.toggle("active", x === b));
      fireRes = +b.dataset.v; hoverKey = null; hoverRect = null; zoomKey = "";
      updateFireLegend(); renderFires(); onZoomChange(globe.pointOfView());
    }));
    $("#fire-lines").addEventListener("change", (e) => { fireLines = e.target.checked; zoomKey = ""; renderFires(); onZoomChange(globe.pointOfView()); });
  }

  // ---- fine 0.1° grids decoded from PNG (count = R*256 + G, row 0 = north)
  let fireRes = 1, fireLines = true, hoverKey = null, hoverRect = null, zoomLines = [], zoomKey = "";
  const FINE = { meta: null, counts: {}, promise: null };
  function loadFine() {
    if (FINE.promise) return FINE.promise;
    FINE.promise = (async () => {
      const meta = await getJSON("data/fine/meta_2024.json");
      await Promise.all(Object.entries(meta.satellites).map(async ([s, m]) => {
        const blob = await (await fetch("data/" + m.file, { cache: "no-cache" })).blob();
        const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
        const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        const arr = new Uint16Array(c.width * c.height);
        for (let i = 0, o = 0; i < arr.length; i++, o += 4) arr[i] = d[o] * 256 + d[o + 1];
        FINE.counts[s] = arr;
      }));
      FINE.meta = meta;
    })();
    return FINE.promise;
  }

  const aggCache = new Map();
  // grid accessor for a selection at a resolution; rows counted from the south
  function aggregated(sel, res) {
    const nLat = Math.round(180 / res), nLon = Math.round(360 / res);
    if (FINE.meta && Math.abs(res - FINE.meta.res) < 1e-9) {
      const W = FINE.meta.width, H = FINE.meta.height;
      const arrs = membersOf(sel).map((s) => FINE.counts[s]).filter(Boolean);
      return { nLat, nLon, get: (r, col) => { let v = 0; const o = (H - 1 - r) * W + col; for (const a of arrs) v += a[o]; return v; } };
    }
    const key = sel + "|" + res;
    if (!aggCache.has(key)) {
      const a = new Float32Array(nLat * nLon);
      if (FINE.meta) {
        const W = FINE.meta.width, H = FINE.meta.height, f = Math.round(res / FINE.meta.res);
        for (const s of membersOf(sel)) {
          const arr = FINE.counts[s]; if (!arr) continue;
          for (let y = 0; y < H; y++) {
            const row = Math.floor((H - 1 - y) / f) * nLon, off = y * W;
            for (let x = 0; x < W; x++) { const v = arr[off + x]; if (v) a[row + Math.floor(x / f)] += v; }
          }
        }
      } else if (res === 1) {
        for (const s of membersOf(sel)) for (const c of DATA.fires.satellites[s].cells) a[Math.floor(c[0] + 90) * 360 + Math.floor(c[1] + 180)] += c[2];
      } else return null;
      aggCache.set(key, a);
    }
    const a = aggCache.get(key);
    return { nLat, nLon, get: (r, col) => a[r * nLon + col] };
  }
  const cellIdx = (lat, lng, res) => [Math.min(Math.round(180 / res) - 1, Math.floor((lat + 90) / res)), Math.min(Math.round(360 / res) - 1, Math.floor((lng + 180) / res))];
  const fireMaxLog = () => Math.log10(Math.max(30, 30000 * Math.pow(fireRes, 1.1)));
  const kmCell = (res, lat) => [res * 111.32, res * 111.32 * Math.cos(lat * Math.PI / 180)];

  function updateFireLegend() {
    const m = fireMaxLog();
    const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => fmtK(Math.round(Math.pow(10, t * m))));
    $("#fire-legend").innerHTML = `<div class="title">Hotspots per ${fireRes}° cell in the year (same scale for every satellite)</div>
      <div class="bar" style="background:${cssGradient(INFERNO)}"></div>
      <div class="ticks">${ticks.map((t) => `<span>${t}</span>`).join("")}</div>`;
    const [ns, ew] = kmCell(fireRes, 20), dp = fireRes < 0.5 ? 1 : 0;
    $("#cell-size").innerHTML = `1 cell = <b>${fireRes}° × ${fireRes}°</b> ≈ <b>${ns.toFixed(dp)} km</b> N–S × <b>${ew.toFixed(dp)} km</b> E–W (at 20° lat)<br>
      Real sensor pixel: MODIS ≈ <b>1 km</b> · VIIRS ≈ <b>0.375 km</b> → see <b>Real pixels</b> tab`;
  }

  function membersOf(sel) { return COMBOS[sel] ? COMBOS[sel].members.filter((s) => DATA.fires.satellites[s]) : [sel]; }

  function renderFires() {
    const F = DATA.fires;
    if (!F || !globeReady || mode !== "fires") return;
    const g = aggregated(fireSel, fireRes);
    if (!g) { $("#fire-stats").innerHTML = `<p class="hint">Loading the 0.1° grids…</p>`; return; }
    const m = fireMaxLog();
    let cells = 0;
    paintGrid(g.nLat, g.nLon, (r, col) => {
      const n = g.get(r, col);
      if (!n) return null;
      cells++;
      const [R, G, B] = ramp(INFERNO, Math.log10(n) / m);
      return [R, G, B, 235];
    }, 1, fireLines ? fireRes : 0);
    const members = membersOf(fireSel);
    const tot = members.reduce((a, s) => a + F.satellites[s].total, 0);
    const night = members.reduce((a, s) => a + F.satellites[s].night, 0);
    const frp = members.reduce((a, s) => a + F.satellites[s].mean_frp * F.satellites[s].total, 0) / tot;
    const conf = members.reduce((a, s) => { const c = F.satellites[s].confidence; a.h += c.h; a.l += c.l; return a; }, { h: 0, l: 0 });
    $("#fire-stats").innerHTML = [
      stat("Hotspots in " + F.year, fmt(tot), "vegetation fires only"),
      stat(`${fireRes}° cells with fire`, fmt(cells), `of ${fmt(g.nLat * g.nLon)} on Earth`),
      stat("Detected at night", Math.round(night / tot * 100) + "%", "VIIRS sees more night fires"),
      stat("Mean fire power", frp.toFixed(1) + " MW", "FRP per hotspot"),
      stat("High confidence", Math.round(conf.h / tot * 100) + "%", ""),
      stat("Low confidence", Math.round(conf.l / tot * 100) + "%", ""),
    ].join("");
    updateFirePaths();
  }

  function rectPts(lat0, lon0, res) {
    const n = Math.max(2, Math.ceil(res / 0.1)), pts = [];
    for (let i = 0; i <= n; i++) pts.push([lat0, lon0 + res * i / n]);
    for (let i = 1; i <= n; i++) pts.push([lat0 + res * i / n, lon0 + res]);
    for (let i = 1; i <= n; i++) pts.push([lat0 + res, lon0 + res - res * i / n]);
    for (let i = 1; i <= n; i++) pts.push([lat0 + res - res * i / n, lon0]);
    return pts;
  }
  // Overlays sit just above the surface (alt is in globe radii: 0.00012 ≈ 0.8 km) so they do not drift
  // against the texture when the globe rotates (parallax), and are interpolated along the sphere every 0.2°
  // so long segments do not cut below the curvature.
  function setPaths(paths, alt = 0.00012) {
    globe.pathsData(paths).pathPoints("pts").pathPointLat((p) => p[0]).pathPointLng((p) => p[1])
      .pathColor("color").pathStroke((d) => d.w || 1).pathPointAlt(alt).pathResolution(0.2);
  }
  function updateFirePaths() {
    if (mode !== "fires") return;
    const paths = [...zoomLines];
    if (hoverRect) paths.push({ pts: hoverRect, color: "#ffffff", w: 2.2 });
    setPaths(paths);
  }
  // fine grid lines drawn in 3D around the camera when zoomed in
  function onZoomChange(pov) {
    if (!pov || mode !== "fires") return;
    if (!fireLines || pov.altitude > 0.7) {
      if (zoomLines.length) { zoomLines = []; zoomKey = ""; updateFirePaths(); }
      return;
    }
    const r = fireRes;
    // visible half-height ≈ altitude × 27° (50° camera FOV); pad it and widen for the screen aspect ratio
    const hLat = Math.min(12, Math.max(0.5, pov.altitude * 34));
    const hLon = Math.min(30, hLat * 1.9 / Math.max(0.25, Math.cos(pov.lat * Math.PI / 180)));
    if ((2 * hLat) / r > 110) { // cells too small on screen: lines would only hide the colors
      if (zoomLines.length) { zoomLines = []; zoomKey = ""; updateFirePaths(); }
      return;
    }
    const i0 = Math.floor((pov.lat - hLat) / r), i1 = Math.ceil((pov.lat + hLat) / r);
    const j0 = Math.floor((pov.lng - hLon) / r), j1 = Math.ceil((pov.lng + hLon) / r);
    const key = [r, i0, i1, j0, j1].join(",");
    if (key === zoomKey) return;
    zoomKey = key;
    zoomLines = [];
    if ((i1 - i0) + (j1 - j0) > 500) { updateFirePaths(); return; }
    const segLon = Math.max(1, Math.ceil((j1 - j0) / 40)), segLat = Math.max(1, Math.ceil((i1 - i0) / 40));
    const col = "rgba(255,255,255,0.28)";
    for (let i = i0; i <= i1; i++) {
      const la = Math.max(-90, Math.min(90, i * r)), pts = [];
      for (let j = j0; j <= j1; j += segLon) pts.push([la, j * r]);
      pts.push([la, j1 * r]);
      zoomLines.push({ pts, color: col, w: 0.5 });
    }
    for (let j = j0; j <= j1; j++) {
      const pts = [];
      for (let i = i0; i <= i1; i += segLat) pts.push([Math.max(-90, Math.min(90, i * r)), j * r]);
      pts.push([Math.max(-90, Math.min(90, i1 * r)), j * r]);
      zoomLines.push({ pts, color: col, w: 0.5 });
    }
    updateFirePaths();
  }

  function stat(k, v, s) { return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ""}</div></div>`; }

  function onCellClick(lat, lng) {
    if (mode !== "fires" || !DATA.fires) return;
    const r = fireRes;
    const [ri, ci] = cellIdx(lat, lng, r);
    const lat0 = -90 + ri * r, lon0 = -180 + ci * r;
    const present = ORDER.filter((s) => DATA.fires.satellites[s]);
    const val = (s) => { const g = aggregated(s, r); return g ? g.get(ri, ci) : 0; };
    const vals = Object.fromEntries(present.map((s) => [s, val(s)]));
    const max = Math.max(1, ...Object.values(vals));
    const modis = (vals.Terra || 0) + (vals.Aqua || 0), n20 = vals.NOAA20 || 0;
    const rows = present.map((s) => `<div class="row"><span>${SATS[s].label}</span><div class="track"><div class="fill" style="width:${vals[s] / max * 100}%;background:${SATS[s].color}"></div></div><span class="num">${fmt(vals[s])}</span></div>`).join("");
    const [ns, ew] = kmCell(r, lat0 + r / 2), dp = r < 0.5 ? 1 : 0, f = (v) => +v.toFixed(2);
    const box = $("#cell-info");
    box.innerHTML = `<button class="close-x" aria-label="Close">✕</button>
      <h4>Cell ${fmtLat(f(lat0))}–${fmtLat(f(lat0 + r))}, ${fmtLon(f(lon0))}–${fmtLon(f(lon0 + r))}</h4>
      <div class="note" style="margin:0 0 8px">${r}° × ${r}° ≈ ${ns.toFixed(dp)} × ${ew.toFixed(dp)} km · hotspots in ${DATA.fires.year}</div>
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
    if (mode === "pixels") { tip.classList.add("hidden"); return; }
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    const g = globe.toGlobeCoords(x, y);
    if (!g) { tip.classList.add("hidden"); return; }
    let html = `<span class="mono">${g.lat.toFixed(2)}°, ${g.lng.toFixed(2)}°</span><br>`;
    if (mode === "fires" && DATA.fires) {
      const r = fireRes, [ri, ci] = cellIdx(g.lat, g.lng, r);
      const lat0 = -90 + ri * r, lon0 = -180 + ci * r;
      const agg = aggregated(fireSel, r);
      const n = agg ? agg.get(ri, ci) : 0;
      const key = ri + "," + ci + "," + r;
      if (key !== hoverKey) { hoverKey = key; hoverRect = rectPts(lat0, lon0, r); updateFirePaths(); }
      const [ns, ew] = kmCell(r, lat0 + r / 2);
      html += `<b>${fmt(n)}</b> hotspots · ${COMBOS[fireSel]?.label || SATS[fireSel].label}<br>
        Cell ${r}° ≈ <b>${ns.toFixed(1)} × ${ew.toFixed(1)} km</b><br><span class="mono">click to compare satellites</span>`;
    } else if (mode === "passes") {
      const v = passValue(g.lat, g.lng);
      html += `<b>${v.toFixed(1)}</b> observations per day`;
    } else if (mode === "sweep") {
      const i = Math.min(179, Math.floor(g.lat + 90)), j = Math.min(359, Math.floor(g.lng + 180));
      html += `Passes so far: <b>${sweep.count[i * 360 + j]}</b>`;
    }
    tip.innerHTML = html;
    tip.style.left = Math.min(x + 14, rect.width - 220) + "px";
    tip.style.top = (y + 14) + "px";
    tip.classList.remove("hidden");
  }

  // ------------------------------------------------------------------ REAL PIXELS mode
  const PIX_SATS = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"];
  const PIX_ALT = { Terra: 0.00002, Aqua: 0.00004, SNPP: 0.00006, NOAA20: 0.00008, NOAA21: 0.0001 }; // 0.1–0.6 km
  let pixSats = [...PIX_SATS], pixGrid = true, scene = null, api = null;
  const draw = { active: false, verts: [] }; // verts: [lat, lng]
  const fmtDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  function windowScene(i) {
    const w = DATA.pixels.windows[i];
    return { pixels: w.pixels, bbox: [w.lon0, w.lat0, w.lon0 + 1, w.lat0 + 1], outline: rectPts(w.lat0, w.lon0, 1),
             label: `${fmtDate(w.date)} · 1° × 1° example`, date: w.date };
  }

  // ---- overpasses: pixels of one satellite on one date whose times are within 20 min form one pass
  const tmin = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(2);
  const hhmm = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(Math.round(((m % 60) + 60) % 60)).padStart(2, "0")}`;
  function computePasses(sc) {
    const groups = {};
    sc.pixels.forEach((p, i) => {
      const key = p[4] + "|" + (p[9] || sc.date);
      (groups[key] = groups[key] || []).push(i);
    });
    const passes = [];
    sc.passOf = new Int32Array(sc.pixels.length);
    for (const [key, idx] of Object.entries(groups)) {
      const [sat, day] = key.split("|");
      idx.sort((a, b) => tmin(sc.pixels[a][5]) - tmin(sc.pixels[b][5]));
      let cur = null;
      for (const i of idx) {
        const t = tmin(sc.pixels[i][5]);
        if (!cur || t - cur.t1 > 20) { cur = { sat, day, t0: t, t1: t, n: 0, lonSum: 0, night: 0 }; passes.push(cur); }
        cur.t1 = t; cur.n++; cur.lonSum += sc.pixels[i][1]; cur.night += sc.pixels[i][8] === "N" ? 1 : 0;
        sc.passOf[i] = passes.length - 1;
      }
    }
    // local solar time ≈ UTC + longitude / 15
    passes.forEach((p, k) => { p.local = p.t0 + (p.lonSum / p.n) / 15 * 60; p.k = k; });
    const order = [...passes].sort((a, b) => (a.day + hhmm(a.t0)).localeCompare(b.day + hhmm(b.t0)));
    sc.passes = passes; sc.passOrder = order; sc.passOn = new Set(passes.map((p) => p.k));
  }
  function buildPassList() {
    const box = $("#pix-passes");
    if (!scene || !scene.passes) { box.innerHTML = ""; return; }
    const multiDay = new Set(scene.passes.map((p) => p.day)).size > 1;
    box.innerHTML = `<div class="pass-tools"><button class="btn-sm ghost" data-a="all">All</button><button class="btn-sm ghost" data-a="none">None</button>
        <span class="hint" style="margin:0">Click a time to show only that pass</span></div>` +
      scene.passOrder.map((p) => {
        const S = SATS[p.sat], night = p.night > p.n / 2;
        return `<label class="pass-row ${scene.passOn.has(p.k) ? "on" : ""}" data-k="${p.k}">
          <input type="checkbox" ${scene.passOn.has(p.k) ? "checked" : ""}>
          <span class="sw" style="background:${S.color}"></span>
          <span class="pass-time" title="Show only this pass"><b>${hhmm(p.local)}</b> local</span>
          <span class="pass-meta">${S.label} · ${hhmm(p.t0)} UTC${multiDay ? " · " + p.day.slice(5) : ""} · ${night ? "☾" : "☀"}</span>
          <span class="pass-n">${p.n} px</span></label>`;
      }).join("");
    box.querySelectorAll(".pass-row").forEach((row) => {
      const k = +row.dataset.k;
      row.querySelector("input").addEventListener("change", (e) => { e.target.checked ? scene.passOn.add(k) : scene.passOn.delete(k); renderPixels(false); });
      row.querySelector(".pass-time").addEventListener("click", (e) => { e.preventDefault(); scene.passOn = new Set([k]); renderPixels(false); });
    });
    box.querySelector('[data-a="all"]').onclick = () => { scene.passOn = new Set(scene.passes.map((p) => p.k)); renderPixels(false); };
    box.querySelector('[data-a="none"]').onclick = () => { scene.passOn = new Set(); renderPixels(false); };
  }

  async function buildPixelsUI() {
    const list = $("#pix-sat-list");
    for (const s of PIX_SATS) {
      satOption(list, s, { type: "checkbox", name: "pixsat", checked: true, color: SATS[s].color,
        label: `${SATS[s].label} <span style="color:var(--muted)">· ${SATS[s].inst}</span>`, meta: SATS[s].pixel,
        onChange: () => { pixSats = checkedValues(list); renderPixels(false); } });
    }
    $("#pix-grid").addEventListener("change", (e) => { pixGrid = e.target.checked; renderPixels(false); });

    const P = DATA.pixels;
    if (P) {
      $("#pix-windows").innerHTML = P.windows.map((w, i) => {
        const m = (w.counts.Terra || 0) + (w.counts.Aqua || 0);
        return `<button class="win-btn ${i === 0 ? "active" : ""}" data-i="${i}">${fmtDate(w.date)} · ${fmtLat(w.lat0)}, ${fmtLon(w.lon0)}
          <small>MODIS ${m} px · S-NPP ${w.counts.SNPP || 0} px · NOAA-20 ${w.counts.NOAA20 || 0} px</small></button>`;
      }).join("");
      $$("#pix-windows .win-btn").forEach((b) => b.addEventListener("click", () => {
        $$("#pix-windows .win-btn").forEach((x) => x.classList.toggle("active", x === b));
        cancelDraw(); scene = windowScene(+b.dataset.i); renderPixels(true);
      }));
      scene = windowScene(0);
    }

    // drawing + API
    $("#draw-start").addEventListener("click", startDraw);
    $("#draw-finish").addEventListener("click", finishDraw);
    $("#draw-clear").addEventListener("click", () => { cancelDraw(); draw.verts = []; updateDrawUI(); renderPixels(false); });
    $("#pix-load").addEventListener("click", loadArea);
    try {
      api = await getJSON("/api/status");
      const src = $("#pix-source");
      src.querySelector('[value="local"]').textContent = api.local_years.length ? `Local index (${api.local_years.join(", ")}, no key)` : "Local index (not built)";
      src.querySelector('[value="firms"]').textContent = api.firms_key ? "NASA FIRMS API (any date)" : "NASA FIRMS API (add key to .env)";
      src.querySelector('[value="firms"]').disabled = !api.firms_key;
      if (!api.local_years.length && api.firms_key) src.value = "firms";
    } catch {
      api = null;
      $("#pix-status").innerHTML = `Drawing needs the local server: run <code>python web/server.py</code> and open <b>http://localhost:8765</b>.`;
      $("#draw-start").disabled = true;
    }
  }

  function startDraw() {
    draw.active = true; draw.verts = [];
    globe.polygonsData([]);
    $("#pix-status").textContent = "Click on the globe to add vertices (3 or more), then press Finish.";
    updateDrawUI(); renderDraw();
  }
  function cancelDraw() { draw.active = false; updateDrawUI(); }
  function finishDraw() {
    if (draw.verts.length < 3) return;
    draw.active = false; updateDrawUI(); renderDraw();
    $("#pix-status").textContent = "Area ready. Pick a date and press Load.";
  }
  function addVertex(lat, lng) {
    if (!draw.active) return false;
    draw.verts.push([lat, lng]); updateDrawUI(); renderDraw();
    return true;
  }
  function updateDrawUI() {
    $("#draw-start").classList.toggle("on", draw.active);
    $("#draw-finish").disabled = !(draw.active && draw.verts.length >= 3);
    $("#pix-load").disabled = draw.active || draw.verts.length < 3 || !api;
  }
  function polyOutline(verts) {
    // densify each edge so it follows the sphere
    const pts = [];
    for (let i = 0; i < verts.length; i++) {
      const [a1, b1] = verts[i], [a2, b2] = verts[(i + 1) % verts.length];
      const n = Math.max(1, Math.ceil(Math.hypot(a2 - a1, b2 - b1) / 0.25));
      for (let k = 0; k < n; k++) pts.push([a1 + (a2 - a1) * k / n, b1 + (b2 - b1) * k / n]);
    }
    pts.push(verts[0]);
    return pts;
  }
  function renderDraw() {
    if (mode !== "pixels") return;
    const v = draw.verts;
    const paths = [];
    if (v.length >= 2) paths.push({ pts: draw.active ? v : polyOutline(v), color: "#ff7a1a", w: 2.4 });
    setPaths(paths, 0.00015);
    globe.pointsData(v.map(([lat, lng]) => ({ lat, lng, color: "#ff7a1a" })))
      .pointLat("lat").pointLng("lng").pointColor("color").pointAltitude(0.0002)
      .pointRadius(Math.max(0.003, globe.pointOfView().altitude * 0.25));
  }

  async function loadArea() {
    const v = draw.verts;
    if (v.length < 3) return;
    const start = $("#pix-date").value, days = $("#pix-days").value, source = $("#pix-source").value;
    const poly = v.map(([lat, lng]) => `${lng.toFixed(4)},${lat.toFixed(4)}`).join(";");
    const status = $("#pix-status");
    status.textContent = "Loading…";
    $("#pix-load").disabled = true;
    try {
      const r = await fetch(`/api/pixels?poly=${encodeURIComponent(poly)}&start=${start}&days=${days}&source=${source}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || r.status);
      $$("#pix-windows .win-btn").forEach((x) => x.classList.remove("active"));
      const lab = `${fmtDate(start)}${+days > 1 ? ` + ${days - 1} day${days > 2 ? "s" : ""}` : ""} · your area · ${source === "firms" ? "FIRMS API" : "local index"}`;
      scene = { pixels: j.pixels, bbox: j.bbox, outline: polyOutline(v), label: lab, date: start };
      status.innerHTML = `<b>${fmt(j.count)}</b> pixels found${j.truncated ? ` (showing ${fmt(j.returned)} — draw a smaller area or fewer days for all)` : ""}.`;
      renderPixels(true);
    } catch (e) {
      status.textContent = "Error: " + e.message;
    } finally { updateDrawUI(); }
  }

  function gridResFor(bbox) {
    const [w, s, e, n] = bbox;
    for (const r of [0.1, 0.25, 0.5, 1, 2]) if ((e - w) / r + (n - s) / r <= 160) return r;
    return 5;
  }

  function renderPixels(fly) {
    if (!globeReady || mode !== "pixels") return;
    paintGrid(1, 1, () => null);
    if (draw.active || !scene) { globe.polygonsData([]); renderDraw(); return; }
    if (!scene.passes) computePasses(scene);
    buildPassList();
    const polys = [], stats = {};
    for (let pi = 0; pi < scene.pixels.length; pi++) {
      const p = scene.pixels[pi];
      const [lat, lon, scan, track, sat, time, frp, conf, dn, day] = p;
      if (!pixSats.includes(sat) || !scene.passOn.has(scene.passOf[pi])) continue;
      const dLat = track / 111.32 / 2, dLon = scan / (111.32 * Math.cos(lat * Math.PI / 180)) / 2;
      polys.push({ type: "Feature", properties: { sat, time, frp, conf, dn, scan, track, lat, lon, day },
        // clockwise ring (d3-geo spherical convention), otherwise it is read as the complement of the box
        geometry: { type: "Polygon", coordinates: [[[lon - dLon, lat - dLat], [lon - dLon, lat + dLat], [lon + dLon, lat + dLat], [lon + dLon, lat - dLat], [lon - dLon, lat - dLat]]] } });
      const s = stats[sat] || (stats[sat] = { n: 0, area: 0, scan: 0, track: 0 });
      s.n++; s.area += scan * track; s.scan += scan; s.track += track;
    }
    globe.polygonsData(polys)
      .polygonCapColor((d) => hexA(SATS[d.properties.sat].color, 0.4))
      .polygonSideColor(() => "rgba(0,0,0,0)")
      .polygonStrokeColor((d) => SATS[d.properties.sat].color)
      .polygonAltitude((d) => PIX_ALT[d.properties.sat])
      .polygonCapCurvatureResolution(10)
      .polygonsTransitionDuration(0)
      .polygonLabel((d) => {
        const q = d.properties, S = SATS[q.sat];
        return `<div style="background:#0b0e14ee;border:1px solid #243046;border-radius:8px;padding:8px 10px;font:12.5px Inter,sans-serif;color:#e6ebf3">
          <b style="color:${S.color}">${S.label}</b> · ${S.inst}${q.day ? " · " + q.day : ""}<br>
          Pixel <b>${q.scan.toFixed(2)} × ${q.track.toFixed(2)} km</b> = ${(q.scan * q.track).toFixed(2)} km²<br>
          <b>${hhmm(tmin(q.time) + q.lon / 15 * 60)} local</b> (${q.time.slice(0, 2)}:${q.time.slice(2)} UTC) · ${q.dn === "N" ? "night" : "day"}<br>
          FRP ${q.frp} MW · confidence ${q.conf}<br>
          <span style="color:#93a0b6;font-family:'JetBrains Mono',monospace">${q.lat.toFixed(4)}, ${q.lon.toFixed(4)}</span></div>`;
      })
      .onPolygonClick((p, ev, c) => { if (draw.active && c) addVertex(c.lat, c.lng); });
    const [w, s, e, n] = scene.bbox;
    const gr = gridResFor(scene.bbox);
    const paths = [{ pts: scene.outline, color: "#ffffff", w: 2 }];
    if (pixGrid) {
      const col = "rgba(255,255,255,0.3)";
      for (let i = Math.ceil(s / gr); i * gr <= n; i++) paths.push({ pts: [[i * gr, w], [i * gr, (w + e) / 2], [i * gr, e]], color: col, w: 0.6 });
      for (let j = Math.ceil(w / gr); j * gr <= e; j++) paths.push({ pts: [[s, j * gr], [(s + n) / 2, j * gr], [n, j * gr]], color: col, w: 0.6 });
    }
    globe.pointsData([]);
    setPaths(paths, 0.00013);
    const cLat = (s + n) / 2, cLon = (w + e) / 2;
    const ext = Math.max(n - s, (e - w) * Math.cos(cLat * Math.PI / 180));
    if (fly) globe.pointOfView({ lat: cLat, lng: cLon, altitude: Math.max(0.02, ext * Math.PI / 180 * 1.7) }, 1500);
    const km = (gr * 111.32).toFixed(gr < 1 ? 1 : 0);
    $("#pix-grid-label").textContent = `Show ${gr}° grid (≈ ${km} km)`;
    $("#pix-stats").innerHTML = `<div class="stat" style="grid-column:1/-1"><div class="k">Scene</div><div class="v" style="font-size:14px">${scene.label}</div></div>` +
      PIX_SATS.filter((x) => stats[x]).map((x) => {
        const q = stats[x];
        return stat(`${SATS[x].label} · ${fmt(q.n)} pixels`, `${(q.scan / q.n).toFixed(2)} × ${(q.track / q.n).toFixed(2)} km`, `average pixel · ${Math.round(q.area)} km² flagged`);
      }).join("") + (polys.length ? "" : `<p class="hint">No fire pixels for the selected satellites here.</p>`);
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
      .pathsData(paths).pathPoints("pts").pathPointLat((p) => p[0]).pathPointLng((p) => p[1]).pathColor("color").pathStroke(1.6).pathPointAlt(0.0003).pathResolution(0.5);
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
    globe.pointsData([]).pathsData(paths).pathPoints("pts").pathPointLat((p) => p[0]).pathPointLng((p) => p[1]).pathColor("color").pathStroke(1.4).pathPointAlt(0.0003).pathResolution(0.5);
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
