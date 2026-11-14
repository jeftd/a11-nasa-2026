# 02 — Data Sources: NASA FIRMS

FIRMS (Fire Information for Resource Management System) is the only resource listed for the challenge.
It is operated by NASA ESDIS as part of LANCE. Global NRT data are available within ~3 hours of overpass;
some US/Canada data in real time.

- Landing page: https://www.earthdata.nasa.gov/data/tools/firms
- FIRMS app: https://firms.modaps.eosdis.nasa.gov/
- FAQ: https://www.earthdata.nasa.gov/data/tools/firms/faq
- Attribute reference: https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs

## 1. Temporal coverage (verified on the Archive Download page and FAQ, Nov 14, 2026)

| Product | Coverage |
|---|---|
| MODIS Collection 6.1 (Terra) | 1 Nov 2000 → present |
| MODIS Collection 6.1 (Aqua) | Jul 2002 → present |
| VIIRS S-NPP 375 m | 20 Jan 2012 → **2 Nov 2026 (ended)** |
| VIIRS NOAA-20 375 m | 1 Apr 2018 → present |
| VIIRS NOAA-21 375 m | 17 Jan 2024 → present (archive page says 1 Mar 2023) |
| Landsat 30 m | 20 Jun 2022 → present (**US/Canada only**) |

Known MODIS gaps: 15 Apr 2001; 15 Jun – 3 Jul 2001; 19–28 Mar 2002 (and others — see the FIRMS
"missing data" table). These must be treated as *missing*, not as *zero fires*.

## 2. Processing levels

| Level | Latency | Use for us |
|---|---|---|
| URT / RT | < 60 s / < 60 min (mostly US/Canada) | not needed |
| NRT (Near Real-Time) | ~3 h | **current month** in the app |
| SP (Standard Processing, science quality) | ~5 month lag; replaces NRT | **historical record** and harmonization |

NRT and SP use the same core algorithm, but SP has better calibration/ancillary inputs. Historical analysis
should use SP; the last ~5 months must come from NRT.

## 3. Access routes

### 3.1 Country Yearly Summary CSVs — no login needed ⭐
Best route for the historical record.

- Index: https://firms.modaps.eosdis.nasa.gov/country/
- Per-country file pattern (verified):
  - MODIS: `https://firms.modaps.eosdis.nasa.gov/data/country/modis/{YEAR}/modis_{YEAR}_{Country}.csv`
  - VIIRS NOAA-20: `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-jpss1/{YEAR}/viirs-jpss1_{YEAR}_{Country}.csv`
- All countries in one zip per year: `/data/country/zips/modis_{YEAR}_all_countries.zip` (MODIS: ~65–90 MB/yr).
- Based on Standard Processing. The index lists MODIS and VIIRS NOAA-20 (S-NPP not shown there).

### 3.2 Archive Download (custom AOI / date range)
https://firms.modaps.eosdis.nasa.gov/download/ — SHP, CSV or JSON for data older than 7 days.
Requires Earthdata Login or email code; results are delivered by email (asynchronous).

### 3.3 FIRMS Area API (for live/recent data in the app)
```
/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]
/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]/[DATE]
```
- `SOURCE`: `MODIS_NRT`, `MODIS_SP`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA21_NRT`,
  `VIIRS_NOAA21_SP`, `VIIRS_SNPP_NRT`, `VIIRS_SNPP_SP`, `LANDSAT_NRT` (US/Canada).
- `AREA_COORDINATES`: `west,south,east,north` or `world`.
- `DAY_RANGE`: **1–5** days per request (so long ranges must be paged).
- `DATE`: `YYYY-MM-DD` (optional; omitted = most recent).
- Availability check: `/api/data_availability/csv/[MAP_KEY]/all`.
- Needs a **free MAP_KEY** (rate-limited by transactions). Keep it server-side, never in the front-end.

### 3.4 Other
Web services (WMS/WFS), KML, email alerts, and Earthdata Search (Level 2 swath products MOD14/MYD14,
VNP14IMG/VJ114IMG) for advanced work such as cloud/no-observation masks.

## 4. Attribute schema (verified with real downloads)

MODIS CSV header:
```
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type
```
VIIRS CSV header:
```
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type
```

| Field | MODIS | VIIRS | Harmonization note |
|---|---|---|---|
| lat/lon | center of ~1 km pixel | center of ~375 m pixel | Location ≠ exact fire location. |
| brightness | Ch 21/22 BT (K) | I-4 BT (K) | Different bands — **not comparable**. |
| scan / track | real pixel size (km); grows to ~2×4.8 km at edge | ~0.375 km, limited growth | Use for footprint/edge filtering. |
| acq_date / acq_time | UTC | UTC | Convert to local date for daily calendars. |
| satellite | `Terra`/`Aqua` (A/T in NRT) | `N` (S-NPP), `N20`, `N21` | |
| confidence | **0–100 (numeric)** | **`l` / `n` / `h`** | Map MODIS: <30 low, 30–79 nominal, ≥80 high. |
| frp | MW, 1 km pixel | MW, hybrid 375/750 m | FRP across sensors needs care (FAQ). |
| daynight | D/N | D/N | VIIRS is much better at night. |
| type | 0 vegetation, 1 volcano, 2 other static land source, 3 offshore | same | **Keep `type == 0`** for burning activity. |
| version | collection (e.g. 6.1, 6.1NRT) | collection (e.g. 2, 2.0NRT) | |

Notes:
- `type` is available in SP/country files (not in NRT feeds) — NRT data need a static-source mask instead.
- In VIIRS NRT, low-confidence **night** pixels in the South Atlantic Magnetic Anomaly area are removed.

## 5. Caveats from the FIRMS FAQ that shape our design

- A detection means "at least one fire inside the flagged pixel", not fire size.
- MODIS routinely detects fires of ~1,000 m²; under ideal conditions ~100 m², rarely ~50 m².
- Missed fires: cloud, smoke, canopy, short-lived fires between overpasses, instrument outages.
  **Hotspot files carry no information on clouds/no-observation**, so zero ≠ "no fire".
- Do **not** estimate burned area from active-fire counts.
- Overpass times: Terra ~10:30/22:30, Aqua ~13:30/01:30, NOAA-20/21 ~12:40/00:40 local equator crossing
  (S-NPP was ~50 min later). Fire activity has a strong diurnal cycle, so overpass time matters.
- VIIRS swath gives full global coverage every 12 h with ~15% overlap at the equator; overlap increases with
  latitude, so **observation count per day varies with latitude** for both sensors.

## 6. Citation / terms

FIRMS data are open. Acknowledge as:

> We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System
> (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Land, Atmosphere Near real-time Capability for
> Earth observations (LANCE) (https://earthdata.nasa.gov/lance) and NASA's Earth Science Data and Information
> System (ESDIS).

Data are provided "as is" (LANCE disclaimer).
