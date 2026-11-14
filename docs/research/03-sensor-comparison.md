# 03 — MODIS vs VIIRS: Empirical Comparison

Goal: measure how different MODIS and VIIRS counts actually are before choosing a harmonization method.

- Script: [`analysis/sensor_overlap.py`](../../analysis/sensor_overlap.py)
- Data: FIRMS Country Yearly Summary CSVs (Standard Processing), `type == 0` only.
- MODIS = Terra + Aqua combined. VIIRS = NOAA-20 only (one satellite).

Reproduce:
```bash
python analysis/sensor_overlap.py --country Mexico --years 2019 2020 2021 2022 2023 2024
python analysis/sensor_overlap.py --country Mexico --years 2019 2020 2021 2022 2023 2024 --drop-low-conf
```

## 1. Mexico, 2019–2024 (72 months)

| Metric | All confidence | Low confidence removed |
|---|---|---|
| Total MODIS hotspots | 389,166 | 372,280 |
| Total VIIRS NOAA-20 hotspots | 1,671,086 | 1,436,229 |
| **Overall VIIRS / MODIS ratio** | **4.29** | **3.86** |
| Monthly ratio — median (min–max) | 4.18 (3.23 – 5.92) | 3.81 (3.10 – 5.53) |
| Pearson r, monthly counts | **0.995** | 0.994 |
| Pearson r, log(1+counts) | 0.994 | 0.994 |

Median ratio by calendar month (all confidence):

| Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3.6 | 4.1 | 4.2 | 3.9 | 4.3 | **5.4** | 4.6 | 4.1 | 3.6 | 4.2 | 4.2 | 3.6 |

## 2. Belize, 2019 and 2024 (small-country sanity check)

| Year | MODIS | VIIRS N20 | Ratio | Monthly ratio range |
|---|---|---|---|---|
| 2019 | 1,975 | 8,943 | 4.5 | 3.8 – 7.5 |
| 2024 | 2,362 | 10,860 | 4.6 | 3.3 – 6.6 |

Additional observations:
- VIIRS has a much larger **night** share (Belize 2024: 31% of VIIRS vs 21% of MODIS detections at night).
- VIIRS low-confidence (`l`) is ~8–10% of detections; MODIS has its own low/nominal/high split from 0–100.
- In small areas with few detections the ratio is noisy (single months reach 7×).

## 3. What this tells us

1. **The two sensors see the same fire seasons.** r ≈ 0.99 between monthly series means the *timing* of
   burning is consistent; harmonization is mostly a *scale* problem, not a *pattern* problem.
2. **The scale gap is large (~4×) and not constant.** It varies with month/season (more in June, the
   end of the dry season / start of rains in Mexico), with confidence filtering, and with region size. A single
   global factor would leave seasonal bias.
3. **Small AOIs are noisy.** Calibration should be estimated on aggregated regions/grid cells with enough
   detections and then applied, with uncertainty, to small AOIs.
4. **Filtering must be identical for both sensors** (type, confidence, day/night) before comparing, because
   filters change the ratio (4.29 → 3.86).
5. Possible drivers of ratio variability (to test): fire size distribution (many small agricultural fires →
   VIIRS advantage grows), cloud cover, night fire share, overpass time vs. diurnal fire cycle, and latitude.

## 4. Next experiments

- [ ] Repeat for other regions/biomes (Amazon, Sub-Saharan Africa, Siberia, Australia, US West).
- [ ] Ratio at grid-cell level (e.g. 1° × 1°) and per calendar month → map of calibration factors.
- [ ] Compare MODIS vs VIIRS **after spatial aggregation** (count fire-*cells*/fire-*days* instead of pixels).
- [ ] Add S-NPP (2012–2026) to extend the overlap window to ~14 years.
- [ ] Check stability of the ratio over time (Terra/Aqua aging, orbit drift).
