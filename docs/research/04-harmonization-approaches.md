# 04 — Harmonization Approaches

**Goal:** a single hotspot activity time series (early 2000s → present) where the sensor of origin no longer
matters. Input: MODIS (2000→), VIIRS S-NPP (2012–2026), VIIRS NOAA-20 (2018→), NOAA-21 (2024→).

## 0. Common pre-processing (all approaches)

1. **Same filters for every sensor:** `type == 0` (vegetation fires; drops volcanoes, static industrial
   sources, offshore), same confidence policy (e.g. drop low), keep day + night but record `daynight`.
2. **Local date**, not UTC, for daily/monthly bins (a night overpass at 02:00 UTC belongs to the previous
   local day in the Americas).
3. **Missing data ≠ zero.** Flag known outage days (FIRMS missing-data table) and exclude them or mark
   the month as incomplete.
4. **Edge-of-swath effect:** MODIS pixels grow up to ~2 × 4.8 km at the edge; optionally drop detections with
   very large `scan*track` or weight them.
5. **NRT → SP replacement:** use SP for history and NRT only for the last ~5 months, tagged as provisional.

## Approach A — Overlap calibration ("cross-calibration factors") ⭐ recommended core

Use the overlap years (MODIS ∩ VIIRS: 2012–present with S-NPP, 2018–present with NOAA-20) to learn how
many VIIRS detections correspond to one MODIS detection, per region and season, then convert MODIS-era counts
into **VIIRS-equivalent** units.

- Model: `log(1 + V[cell, month]) = a[cell, cal_month] + b · log(1 + M[cell, month])`
  or simply a robust ratio `k[cell, cal_month] = median(V / M)`.
- Cells: a fixed grid (e.g. 0.5° or 1°) or biomes/ecoregions; fall back to a coarser region when a cell has
  too few detections (hierarchical / shrinkage estimate).
- Output: `H = V` where VIIRS exists, `H = k · M` before 2012/2018, with an uncertainty band from the spread
  of `k`.
- Validation: leave-one-year-out on overlap years (predict VIIRS from MODIS, measure error); check there is
  no step change at 2012/2018 in the harmonized series.
- Pros: simple, explainable to judges and users, keeps absolute counts. Our Mexico test supports it (r ≈ 0.995).
- Cons: assumes the relationship is stable over time; noisy for small cells.

## Approach B — Spatial-temporal aggregation to a common footprint

Reduce resolution differences by counting **fire-cells per day** instead of pixels: snap all detections to a
common grid of ~1 km (MODIS-like) or coarser, and count each cell at most once per day.

- Removes much of the "one MODIS pixel = several VIIRS pixels" inflation.
- Does not remove the sensitivity difference (VIIRS still sees smaller fires), so combine with A.
- Pros: physically motivated. Cons: grid choice affects results; more data processing.

## Approach C — Scale-free indices (anomalies / percentiles per sensor)

Express each month relative to **its own sensor's climatology**: z-score, percentile rank, or ratio to the
multi-year median. A month at the 90th percentile means the same thing whether it came from MODIS or VIIRS.

- Ideal for the **calendar colors** and "current vs historical median" comparisons asked for in the challenge.
- Pros: robust, no calibration needed, intuitive for responders.
- Cons: loses absolute counts; needs enough years per sensor to build a climatology (VIIRS N20 has ~8 years).

## Approach D — Statistical / ML regression

Predict VIIRS-equivalent counts from MODIS counts plus covariates (FRP, day/night share, latitude, land cover,
calendar month, cloud fraction) using gradient boosting or quantile regression trained on overlap years.

- Pros: can capture non-linear, regional effects. Cons: harder to explain, risk of overfitting in 2 days.
- Keep as a stretch goal.

## Recommendation for the hackathon

**A + C, with B as an option:**

1. Build a gridded monthly count dataset per sensor (pre-processing §0, optionally with B's daily cell
   de-duplication).
2. Estimate calibration factors `k[region, calendar month]` on 2018–2025 (NOAA-20) — optionally 2012–2025 with
   S-NPP — and convert MODIS 2000–2017 to VIIRS-equivalent counts (A).
3. In the app, show the calendar in harmonized counts **and** as anomaly/percentile vs the historical median
   (C), which is what responders actually read.
4. Show uncertainty for MODIS-era values and a provenance tag (`MODIS-calibrated` / `VIIRS`) in the CSV.

## Continuity notes

- **S-NPP ended on 2 Nov 2026.** Use NOAA-20 as the VIIRS reference; NOAA-21 can be added (same orbit) but
  check whether using 1, 2 or 3 VIIRS satellites changes the counts — the number of satellites must be held
  constant (or normalized per overpass) across the series.
- MODIS Terra/Aqua are near end of life; once MODIS stops, the harmonized series continues with VIIRS only, which
  is exactly why the MODIS → VIIRS-equivalent direction is preferred.
