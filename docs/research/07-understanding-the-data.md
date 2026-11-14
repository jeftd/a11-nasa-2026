# 07 — Understanding the Data (plain-language explainer)

This document answers the questions the team asked while studying the challenge:
*What data exist? Since when? Why is it hard to harmonize? What is the "overlap"?*

An interactive, visual version lives in [`web/explorer/`](../../web/explorer/).

## 1. Two instruments, five satellites

There are **two instrument families**. Both observe the **entire planet** (Mexico included), and both are
still operating today.

```
                  2000  2002        2012        2018      2024  2026
MODIS  (Terra)     ███████████████████████████████████████████████→ today
MODIS  (Aqua)            █████████████████████████████████████████→ today
VIIRS  (Suomi NPP)                   ███████████████████████████✕   ended Nov 2, 2026
VIIRS  (NOAA-20)                                 █████████████████→ today
VIIRS  (NOAA-21)                                            ██████→ today
```

| Satellite | Instrument | Data from | Status (Nov 2026) | Altitude | Equator crossing (local time) |
|---|---|---|---|---|---|
| Terra | MODIS | Nov 2000 | Active, end of life approaching | ~705 km | ~10:30 (day, descending) / ~22:30 |
| Aqua | MODIS | Jul 2002 | Active, end of life approaching | ~705 km | ~13:30 (day, ascending) / ~01:30 |
| Suomi NPP | VIIRS | Jan 2012 | **Ended Nov 2, 2026** | ~824 km | ~13:30 / ~01:30 |
| NOAA-20 | VIIRS | Apr 2018 | Active | ~824 km | ~12:40 / ~00:40 |
| NOAA-21 | VIIRS | Jan 2024 | Active | ~824 km | ~12:40 / ~00:40 (half an orbit from NOAA-20) |

Key points:
- MODIS did **not** stop in 2018. 2018 is only when the *second* VIIRS satellite (NOAA-20) started.
- VIIRS is an **instrument**; the same design flies on three different satellites. "Active VIIRS" means
  the satellites that are still sending data: NOAA-20 and NOAA-21.

## 2. How often and how much area each satellite sees

All five satellites are in **polar, sun-synchronous orbits**: about **14 orbits per day** (~99–101 minutes
each), always crossing a given latitude at about the same local solar time.

| | MODIS | VIIRS |
|---|---|---|
| Swath width (strip of ground imaged per pass) | **2,330 km** | **3,040 km** |
| Global coverage, one satellite | every **1–2 days** (gaps between swaths near the equator) | every **12 hours** (day + night pass, no gaps) |
| Fire pixel at nadir | ~1 km | ~375 m |
| Pixel at swath edge | grows to ~2 × 4.8 km | stays small (onboard pixel aggregation) |
| Observations per day at the equator | ≥ 4 combining Terra + Aqua | ~2 per satellite |

Coverage increases toward the poles because orbits converge there. High latitudes are observed many more times
per day than the tropics.

Our simplified orbit simulation (`analysis/build_explorer_data.py`, circular sun-synchronous orbits, average of
4 days) gives:

| Observations per day | Equator (mean / min) | 60°N |
|---|---|---|
| One MODIS satellite | 1.8 / 1.5 | ~3.9 |
| Terra + Aqua | 3.6 / 3.0 | ~7.7 |
| One VIIRS satellite | 2.2 / 2.0 | ~5 |

Why MODIS has gaps: consecutive orbits are ~25° of longitude apart at the equator (~2,750 km), wider than the
MODIS swath (2,330 km) but narrower than the VIIRS swath (3,040 km). So a single MODIS satellite misses strips of
the tropics on some passes, while VIIRS never does. The explorer's **Orbit sweep** and **Passes / day** views show
this interactively.

## 3. What one "reading" (hotspot record) contains

Each row of a FIRMS file is **one fire pixel**: a pixel that the algorithm flagged as containing at least one fire.

| Field | Meaning |
|---|---|
| `latitude`, `longitude` | Center of the pixel (not the exact fire location). |
| `brightness` / `bright_ti4` | Brightness temperature in the mid-infrared band (K). MODIS band 21/22 vs VIIRS I-4: **different bands**. |
| `bright_t31` / `bright_ti5` | Brightness temperature in the thermal band (K), the background reference. |
| `scan`, `track` | Real pixel size in km (grows toward the swath edge, especially for MODIS). |
| `acq_date`, `acq_time` | Date and time of the overpass in **UTC**. |
| `satellite` | `Terra`, `Aqua`, `N` (Suomi NPP), `N20`, `N21`. |
| `instrument` | `MODIS` or `VIIRS`. |
| `confidence` | MODIS: 0–100. VIIRS: `l` (low) / `n` (nominal) / `h` (high). |
| `version` | Processing collection and source (NRT vs standard). |
| `frp` | Fire Radiative Power in megawatts: a proxy of fire intensity. |
| `daynight` | `D` daytime, `N` nighttime detection. |
| `type` | 0 = vegetation fire, 1 = volcano, 2 = other static land source (e.g. gas flares, industry), 3 = offshore. |

A hotspot is **not** a fire event. A single wildfire produces many hotspots over many pixels and days, and
a pixel with no hotspot may simply have been cloudy or not observed.

## 4. Why harmonization is hard

1. **Different pixel size.** A 1 km MODIS pixel with four small fires gives **1 point**; VIIRS, with
   375 m pixels, may give **4 points** for the same fires.
2. **Different sensitivity.** VIIRS detects smaller and cooler fires, especially at night.
3. **The difference is not constant.** In Mexico 2019–2024 VIIRS NOAA-20 counted **4.2×** more hotspots
   than MODIS overall, but **3.2× to 5.9×** depending on the month. One fixed multiplier is not enough.
4. **Different overpass times.** Fires grow during the afternoon; Terra (10:30), NOAA-20 (12:40) and Aqua
   (13:30) sample the daily fire cycle at different moments.
5. **The number of satellites changes over time.** VIIRS went from 1 satellite (2012) → 2 (2018) → 3 (2024)
   → 2 (Nov 2026). More satellites means more chances to detect the same fire.
6. **Different formats** (e.g. confidence as a number vs a letter).

If raw counts are concatenated, the 2000 → today chart shows a **fake jump** when VIIRS starts: it looks as if
fires multiplied by four, but only the sensor changed.

## 5. The overlap and why it lets us harmonize

**Overlap** = the years when **both sensors observed the same place at the same time** (2012 → today).

Analogy: two scales. An old scale always reads low; a new one is accurate. For years you weighed everything
with the old one (2000–2011). To know the "true" weights, you weigh the **same objects on both scales** for a
while and learn the rule (e.g. "in May the new scale reads 4.3× the old; in June 5.4×"). Then you apply that
rule to all the old measurements.

In the overlap years, MODIS and VIIRS rise and fall together (monthly correlation **r ≈ 0.995** in Mexico): they
see the **same fire seasons**, only on a different scale. Therefore harmonization is feasible:

1. Learn conversion factors from the overlap, by region and calendar month.
2. Convert MODIS-only years (2000–2011) to **VIIRS-equivalent** counts.
3. Produce one continuous 2000 → today series without the fake jump, with an uncertainty band for the
   converted years.

## 6. Where the data come from and whether we need an API key

| Need | Source | Key needed? |
|---|---|---|
| History, MODIS (Terra + Aqua) 2000 → | FIRMS country yearly CSV / zips | No |
| History, VIIRS Suomi NPP 2012–2026 | FIRMS country yearly CSV / zips | No |
| History, VIIRS NOAA-20 2018 → | FIRMS country yearly CSV / zips | No |
| VIIRS NOAA-21 (2024 →) | FIRMS Area API (`VIIRS_NOAA21_SP` / `_NRT`) | **Yes** |
| Recent days (current month, NRT) | FIRMS Area API (`*_NRT`) | **Yes** |

### Setting up the FIRMS MAP_KEY

1. Request a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/ (it arrives by email).
2. Copy `.env.example` to `.env` (already done locally) and set `FIRMS_MAP_KEY=<your key>`.
3. `.env` is git-ignored. **Never commit the key or put it in front-end code**; the web platform must call
   FIRMS through a server-side function.
4. Check remaining transactions at https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=<key>.

API limits: `DAY_RANGE` is 1–5 days per request, so longer periods are fetched in 5-day pages.
