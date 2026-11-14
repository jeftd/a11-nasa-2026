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

### Run locally

```bash
python -m http.server 8765 --directory web/explorer
```
Then open http://localhost:8765.

### Rebuild the data

```bash
python analysis/build_explorer_data.py --year 2024
```
Downloads ~860 MB of FIRMS yearly files (cached in `data/raw/`, git-ignored) and writes `web/explorer/data/`.
VIIRS NOAA-21 is not in the public yearly files; with `FIRMS_MAP_KEY` in `.env`, add `--with-noaa21` to fetch it
from the FIRMS API.

## Burning activity calendar (main app)

Phase 3. Requirements and proposed architecture:
[docs/research/05-web-app-requirements.md](../docs/research/05-web-app-requirements.md).
