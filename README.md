# A11 — Harmonization of MODIS and VIIRS Hot Spots

**2026 NASA Space Apps Challenge** · Team **A11** · Monterrey
Challenge: [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)

> Build a web application that harmonizes 25 years of satellite active-fire hotspots (MODIS 2000→ and
> VIIRS 2012→) into a consistent **burning activity calendar**, so responders, scientists and land managers
> can see when and where burning happens, which periods are critical, and whether current activity is unusual.

## Status

**Phase 1 — Research & study** ✅ (this commit)
Phase 2 — Harmonization pipeline ⏳
Phase 3 — Web platform ⏳
Phase 4 — Demo & submission ⏳

## Key findings so far

- The only official resource is **NASA FIRMS**. Historical Standard Processing data can be downloaded per
  country and year **without login**; recent data come from the FIRMS Area API (free MAP_KEY).
- On Mexico 2019–2024, **VIIRS NOAA-20 detects ~4.2× more hotspots than MODIS (Terra+Aqua)**, but the monthly
  series correlate at **r ≈ 0.995** → the fire *timing* is consistent; harmonization is mainly a *scale*
  problem. The ratio varies by month (3.2×–5.9×), so a single global factor is not enough.
- **Suomi NPP stopped delivering data on Nov 2, 2026.** VIIRS continuity is NOAA-20 / NOAA-21.
- Recommended method: **overlap calibration by region and calendar month** (MODIS → VIIRS-equivalent)
  plus **anomaly/percentile views** for the calendar.

## Research documents

| # | Document |
|---|---|
| 01 | [Challenge brief](docs/research/01-challenge-brief.md) |
| 02 | [Data sources: NASA FIRMS](docs/research/02-data-sources-firms.md) |
| 03 | [MODIS vs VIIRS empirical comparison](docs/research/03-sensor-comparison.md) |
| 04 | [Harmonization approaches](docs/research/04-harmonization-approaches.md) |
| 05 | [Web app requirements & architecture](docs/research/05-web-app-requirements.md) |
| 06 | [Submission rules that affect us](docs/research/06-submission-rules.md) |
| 07 | [Understanding the data (satellites, coverage, a reading, the overlap)](docs/research/07-understanding-the-data.md) |
| — | [References](docs/research/references.md) |

## Interactive Fire Data Explorer

A 3D globe that shows every satellite's hotspots on a grid, simulates each orbit's coverage over 24 hours,
and explains every field of a reading. See [web/README.md](web/README.md).

```bash
python -m http.server 8765 --directory web/explorer
```

## Repository structure

```
.
├── docs/            Documentation (research, methodology, presentation material)
│   └── research/    Phase 1 study of the challenge and resources
├── analysis/        Python scripts / notebooks for data exploration and harmonization
├── data/            Data folder (raw downloads are git-ignored; see data/README.md)
└── web/             Web platform (front-end + API) — Phase 3
```

## Quick start (analysis)

```bash
python analysis/sensor_overlap.py --country Mexico --years 2019 2020 2021 2022 2023 2024
```
Requires Python 3.10+. `sensor_overlap.py` uses the standard library only; `build_explorer_data.py` also
needs `numpy`. Downloads are cached in `data/raw/`.

## Configuration (FIRMS API key)

```bash
cp .env.example .env   # then set FIRMS_MAP_KEY=<your key>
```
Get a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/. `.env` is git-ignored: never commit the key
or expose it in front-end code. Needed only for recent NRT data and for VIIRS NOAA-21.

## Data acknowledgment

We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System
(FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Land, Atmosphere Near real-time Capability for Earth
observations (LANCE) (https://earthdata.nasa.gov/lance) and NASA's Earth Science Data and Information System
(ESDIS).

## AI (SI) assistance disclosure

Parts of this repository's research documents and code were drafted with the assistance of an AI model
(Claude, by Anthropic) and reviewed by the team, as required by the Space Apps 2026 SI acknowledgment rules.
All quantitative results are reproducible with the scripts in `analysis/`.
