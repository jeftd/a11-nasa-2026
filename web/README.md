# Web Platform

All platform text and UI must be in English.

## `explorer/` — Fire Data Explorer (research tool)

An interactive 3D globe to understand the raw data before harmonizing it:

- **Hotspots** — every 2024 vegetation-fire hotspot per satellite on a 1° grid, all on the same color scale.
  Click a cell to compare Terra, Aqua, Suomi NPP and NOAA-20 for that place.
- **Orbit sweep** — animated 24-hour simulation of each satellite's ground track and swath; shows how much of the
  Earth each one (or a combination) observes and how often.
- **Passes / day** — average observations per day per 2° cell for any combination of satellites.
- **Satellites** — timeline and specification table (altitude, orbits/day, swath, pixel size, overpass time).
- **A reading** — real MODIS and VIIRS records with every field explained.
- **The overlap** — Mexico 2000–2025 monthly series per satellite, showing why harmonization is needed and how
  the overlap years make it possible.

- **Grid cell size** — 1°, 0.5°, 0.2° or 0.1° (≈ 11 km). Zoom in to see the grid lines; hovering a cell shows its
  real size in km.
- **Real pixels** — draw a polygon on the globe, pick a date and 1–5 days, and load every real fire pixel inside it,
  drawn with its true footprint (`scan × track` km). Or open one of the Mexico examples. The **overpass filter** lists
  every pass (satellite + local solar time) so passes taken hours apart are not mixed; click a time to show only it.

### `explorer/learn.html` — Fire Data Guide

English primer for the harmonization phase: what a hotspot is, a real day of overpasses over one cell, the six reasons
MODIS and VIIRS counts differ (with our measured numbers), an interactive *same fires, two pixel grids* demo, the
counting units (pixels, fire cells, fire days, calibrated counts, anomalies) and the planned pipeline.
Open it from the explorer header (**Data guide →**) or at http://localhost:8765/learn.html.

### `explorer/ember.html` — Ember, the mascot

A standalone page with a small flame mascot in all its states (same eye system as Corve, Corvesia's mascot: two
pills whose lids carry the emotion). `ember.js` is the expression engine (18 gestures, flicker, blinking, springs,
`prefers-reduced-motion` support). Click any flame to make it flare up. It is not shown inside the explorer itself.

### Run locally

```bash
python web/server.py
```
Then open http://localhost:8765. The server serves the page and a small API:

| Endpoint | Purpose |
|---|---|
| `GET /api/status` | Which local index years exist and whether a FIRMS key is configured |
| `GET /api/pixels?poly=lon,lat;...&start=YYYY-MM-DD&days=1..5&source=local\|firms` | Real pixels inside a polygon |

Sources for **Real pixels → Your area**:
- `local` — the 2024 index, no key needed. Build it once (≈ 5 min, ≈ 1.1 GB in `data/index/`, git-ignored):
  `python analysis/build_pixel_index.py --year 2024`
- `firms` — NASA FIRMS Area API for any date (also NOAA-21 and recent NRT data). Needs `FIRMS_MAP_KEY` in `.env`;
  the key stays on the server and is never sent to the browser.

Limits: polygon bounding box ≤ 60 deg², up to 5 days, up to 8,000 pixels drawn (evenly sampled beyond that).

A plain static server (`python -m http.server 8765 --directory web/explorer`) also works, without the
draw-your-area feature.

### Rebuild the data

```bash
python analysis/build_explorer_data.py --year 2024
```
Downloads ~860 MB of FIRMS yearly files (cached in `data/raw/`, git-ignored) and writes `web/explorer/data/`.
Then `python analysis/build_detail_data.py --year 2024` builds the 0.1° grids (`data/fine/*.png`, counts encoded
as `R*256+G`) and the Mexico real-pixel examples.
VIIRS NOAA-21 is not in the public yearly files; with `FIRMS_MAP_KEY` in `.env`, add `--with-noaa21` to fetch it
from the FIRMS API.

## Burning activity calendar (main app)

Phase 3. Requirements and proposed architecture:
[docs/research/05-web-app-requirements.md](../docs/research/05-web-app-requirements.md).

### `mockup/` — UI design prototype

Clickable mockup of the main app with **illustrative synthetic data**: map canvas, inspector tabs (Overview ·
Season · Burn calendar · Data) and a 2001→2026 timeline that drives every view. `v1.html` is the first,
scrolling-page version kept for comparison (see the audit in `docs/research/11-ui-audit-and-references.md`). Design rationale:
[docs/research/09-user-research-and-use-cases.md](../docs/research/09-user-research-and-use-cases.md) and
[docs/research/10-interface-design.md](../docs/research/10-interface-design.md).

```bash
python -m http.server 8770 --directory web/mockup
```
