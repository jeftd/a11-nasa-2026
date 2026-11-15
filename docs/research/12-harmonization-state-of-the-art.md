# 12 — MODIS ↔ VIIRS Harmonization: State of the Art

**Goal:** check what NASA, NOAA and researchers already publish on making MODIS and VIIRS active-fire records
continuous, so our harmonization method rests on outside evidence and not only on our own measurements
([03](03-sensor-comparison.md), [04](04-harmonization-approaches.md), [07](07-understanding-the-data.md),
[`web/explorer/learn.html`](../../web/explorer/learn.html)).

Research done on 2026-11-14. **Evidence tags** used throughout:

| Tag | Meaning |
|---|---|
| **[R]** | Read in the full text or slides during this research. |
| **[A]** | Checked only in an abstract, catalog record, search summary or press page. Not checked in the full text. |
| **[K]** | Well-known background fact about the products, not re-checked online this session. Check it before quoting it to judges. |

---

## 1. Short answer: is there something ready-made?

**No. There is no published, harmonized MODIS + VIIRS active-fire *count* record (hotspots, fire pixels or
fire-days) from 2000 to today.** What exists:

1. **Design continuity, not data continuity.** The VIIRS fire algorithms (VNP14 750 m, VNP14IMG 375 m and the
   NOAA-20/21 versions VJ114/VJ214) were built from the MODIS MOD14/MYD14 algorithm "to support data continuity"
   **[A]**. NASA never released a product that converts one sensor into the other's units. In 2012 the NOAA/UMD
   fire team (Csiszar, Schroeder, Giglio, Justice) described three possible levels of continuity: (1) the daily maps
   agree, (2) aggregated statistics agree, (3) only the general patterns and trends agree. They said a true
   statistical comparison requires "matching of similar sampling conditions". They also said the main source of
   difference is **spatial sampling** (pixel size, along-scan aggregation, swath width), not the algorithm **[R]**.
2. **Harmonized products for other quantities.**
   - **Burned area.** Boschetti, Roy and Giglio planned a harmonized MODIS/VIIRS burned-area series at 0.25°
     (25 years, calibrated with Landsat/Sentinel-2 reference data). The 2023 slides say the paper is "in
     preparation" **[A]**. The VIIRS burned-area validation paper (Giglio et al., RSE 2025) says that
     **regional-scale statistical calibration** of VNP64A1 against MCD64A1 will probably be needed to get one
     consistent record **[A]**. We found no released harmonized burned-area dataset.
   - **FRP and emissions.** Operational emission systems do bridge the two sensors with **scaling factors by
     biome or ecoregion**:
     - NOAA **GBBEPx** regresses VIIRS FRP on MODIS-based QFED emissions by ecoregion and continent (2020–2021
       training) **[A]**.
     - NASA **QFED/GEOS** derives MODIS→VIIRS scaling by linear regression of FRP density against Aqua MODIS, per
       biome and per satellite **[A]**.
     - **CAMS GFAS** added VIIRS in operations on 4 Dec 2025 and earlier tested a bias correction that constrains
       the merged analysis to the MODIS-only version **[A]**.
     - **GFED5-NRT** converts daily VIIRS fire counts to burned area with biome- and region-specific "effective
       fire areas" **[A]**.

     These are the closest existing analogue of what we need, but they calibrate FRP or emissions, not counts.
3. **Single-reference-satellite practice.** Brazil's INPE builds its official fire-count series on **one
   "reference satellite"** (one overpass per day), not on all satellites together. The reference changed from
   NOAA-12 to NOAA-15 (AVHRR) and then to **Aqua MODIS, afternoon pass, on 22 Aug 2011**. Only the reference
   satellite is used for comparisons over time, and comparisons are said to be valid only over intervals longer
   than about 10 days **[A]**. INPE avoids the "number of satellites" artefact this way, but does not
   intercalibrate between reference satellites.
4. **Other Space Apps 2026 teams.** Several public repos for this same challenge use per-area or per-month ratio
   factors on the overlap years (e.g. `flare-chronos`, `firecal`, `pyfire-watch`) **[A]**. They are not
   peer-reviewed. We did not use their code or numbers.

**Consequence for us.** The method in [04](04-harmonization-approaches.md) (calibrate on the overlap by region and
month, count on a common grid, show anomalies) matches how operational systems bridge sensors (regression or ratio
scaling by region or biome on the overlap). The literature adds four controls we did not have:

- keep the **satellite set fixed**;
- exclude **drifted MODIS years** from calibration;
- calibrate **day and night separately**;
- validate with **matched sampling conditions**.

---

## 2. What the official documents say about cross-sensor consistency

| Source | Statement relevant to continuity | Tag |
|---|---|---|
| Csiszar et al., AMS 2012 ("Establishing active fire data continuity between Aqua MODIS and Suomi NPP VIIRS") | Aqua and S-NPP have similar 13:30 overpasses, so their sampling of the daily fire cycle is similar. The algorithms are compatible. The main driver of differences is spatial sampling: pixel size, aggregation along the scan, and swath (VIIRS has no gaps at low latitudes). They propose an SNO-type intercalibration (simultaneous nadir overpasses / matched swath segments with similar sampling). Matching cloud masks is called "crucial". Continuity of the MODIS Climate Modeling Grid (CMG) product is necessary for long-term monitoring. | [R] |
| Schroeder, Oliva, Giglio & Csiszar 2014, RSE 143:85-96 (VIIRS 375 m algorithm) | Built on the MODIS contextual algorithm. Compared with the VIIRS 750 m product it finds **~3× more fire pixels by day and ~25× more at night**. Mapping is better than MODIS, with more consistent perimeters for multi-day fires. | [A] |
| VIIRS 375 m user guide (VNP14IMG, C1) | VNP14IMG detects many more fire pixels than VNP14 (750 m), especially at night, where smaller and cooler fires favour the 375 m product. The 375 m product was labelled *experimental* in C1. | [A] |
| Giglio, GOFC 2022 slides | VIIRS C1 stayed in use "long past its expected lifetime". The 750 m product is kept for continuity because it is more MODIS-like. The 375 m product is a significant improvement over MODIS. (The PDF failed to load because of a certificate error; only the search snippet was seen.) | [A] |
| VIIRS **Collection 2** 375 m user guide v1.2 (2025) and LP DAAC release notice (Apr 2024) | C2 uses the reprocessed NASA L1B radiance and geolocation, which removes the "bad scans" that affected C1 SDR inputs. NOAA-20 got recalibration for the whole mission and maneuver-period fixes. The V002 release covers S-NPP and NOAA-20. | [A] |
| Giglio, Schroeder & Justice 2016, RSE 178:31-41 (MODIS C6 fire algorithm) | C6 introduced adaptive thresholds for small, cool fires, a test against false alarms over Amazon clearings, processing over water (offshore flares), and cloud-mask fixes. The same changes are listed on the 2012 slides. | [R] (via 2012 slides) / [K] (paper) |
| Li, Zhang, Kondragunta & Csiszar 2018, JGR-Atmos 123 (VIIRS vs MODIS FRP) | MODIS fire characterisation depends strongly on view zenith angle: mean FRP rises by up to **~300% at the scan edge** relative to nadir, while VIIRS is stable across the swath. FRP agrees well at fire-cluster level, except large boreal fires (VIIRS ~47% lower). On 1° grids the difference is ~20% in fire-prone regions and varies more in fire-limited regions. | [A] |
| Giglio, LANCE UWG May 2025 ("Terra/Aqua orbit-drift update") and LDOPE note HC_MOD_26008 (Jan 2026) | Orbit drift affects MODIS sampling of the daily cycle, pixel size (along-scan 1 km → ~970 m by spring 2025), gaps between scans (widening through 2026), bow-tie overlap and spatial-sampling patterns, with impacts that seem to have **"abruptly increased" in late 2024**. Impact on the MODIS fire products is "under active investigation". | [R] |
| FIRMS blog, Oct 2026 ("Transitioning from Suomi NPP VIIRS & OMPS") | S-NPP production ended on 2 Nov 2026. NOAA-20/21 carry an identical VIIRS with the same resolution, in the same orbital plane, about 50 min from S-NPP. Users should switch `VIIRS_SNPP_*` to `VIIRS_NOAA20_*` / `VIIRS_NOAA21_*`. S-NPP history stays available. | [A] |
| LAADS "MODIS to VIIRS transition" (Apr 2025) and Earthdata alert (May 2025) | Planned end of MODIS science collection: **Aqua ~Aug 2026, Terra ~early 2027**, with a final MODIS reprocessing after collection ends. A later LAADS version and an OB.DAAC forum post give different dates and say plans are "in flux". **Check what FIRMS is still delivering for Aqua in Nov 2026.** | [A] |

---

## 3. Published harmonization / intercalibration methods

| # | Method | What it calibrates | Data needed | Reported accuracy | Limitations | Example / source |
|---|---|---|---|---|---|---|
| M1 | **Single reference satellite** (one sensor and one overpass define the series) | Counts. Avoids the artefact of a changing number of satellites. | Detections from one satellite only | Not reported as an error figure. INPE says comparisons are valid only over intervals longer than ~10 days. | Discards most data. Changing the reference creates a break unless it is intercalibrated. Not robust to drift or end of life of the reference. | INPE Queimadas: AVHRR NOAA-12/15 → Aqua MODIS (2011) [A] |
| M2 | **Overlap ratio / regression by region (biome, ecoregion) and season** | FRP, emissions or counts | Both sensors over ≥ 2–3 overlap years, region map | GBBEPx/QFED/GFAS report "well correlated" fits with no single public error figure [A]. Punjab: monthly Aqua vs VIIRS FRP r² = 0.98, counts VIIRS/MODIS ≈ 4.8 (Aqua+Terra) or 6.5 (Aqua only) [R] | Assumes the ratio is stable over time. Noisy where fires are few. Ratio depends on the confidence filter (our 4.29 → 3.86). | NOAA GBBEPx (VIIRS FRP regressed on QFED by ecoregion) [A]. NASA QFED (biome-level regression on Aqua) [A]. Vadrevu & Lasko 2018 [R]. Our [03](03-sensor-comparison.md) |
| M3 | **Matched-sampling intercalibration** (SNO / matched swath segments, near-nadir pairs, same pass) | Detection-level agreement, FRP | Pixel-level data from both sensors, time window ≤ ~30 min, VZA filter | Africa: matched daily FRP sums r > 0.95, MODIS sum FRP ~49% below VIIRS [A] | Few true coincidences except Aqua/S-NPP. Validates the physics but does not by itself give a monthly correction. | Csiszar et al. 2012 [R]. Our `pixel_matching.py` |
| M4 | **Aggregate VIIRS to the MODIS footprint + VZA correction, then fuse** | FRP | Pixel data, MODIS pixel geometry (scan/track), VZA | Quantifies the VZA dependence of the VIIRS/MODIS FRP ratio and applies a correction before fusion (2012–2024) [A] | Needs swath-level geometry. Targets FRP, not counts. Recent paper (2026), not independently replicated. | *Remote Sensing* 18:1650 (2026), MYD14 + VNP14IMG [A] |
| M5 | **Quantile mapping on the overlap** | Distribution of a gridded variable (burned area, gridded FRP) | Overlap years, enough samples per cell | MRBA60: calibrated 2019–2024, extended back to 2003 [A]. Earlier MODIS gridded-FRP bow-tie correction [A] | Needs long overlap per cell. Assumes the distribution shape is stable. Hard to explain to users. | MRBA60 (Sentinel-3 + MODIS BA) [A]. *Remote Sensing* 11:1205 [A] |
| M6 | **Counts → burned area / emissions via scaling** (small-fire boost, "effective fire area") | Converts active-fire counts into a physical quantity | Burned-area product, land-cover or biome map | GFED4s: small fires add ~35% global burned area, much more in Central America (+143%) [A] | Large uncertainty in the small-fire layer. Older MCD64 C5.1 basis. Changes the unit (km², not hotspots). | Randerson et al. 2012 / GFED4s [A]. GFED5-NRT preprint (VIIRS counts → BA by biome/region) [A] |
| M7 | **Fire clusters / fire events / fire-days** (aggregate pixels in space and time before counting) | Removes pixel splitting and part of the timing effect | Pixel data, clustering rule (distance, days) | FRP of the two sensors agrees closely at cluster level (Li et al. 2018) [A]. We found no published count ratio at event level. | Result depends on the grid or cluster rule. Sensitivity difference (small fires) remains. | Li et al. 2018 [A]. Global Fire Atlas / FIRED are event products built on MODIS burned area, not on active fires [A] |
| M8 | **Scale-free indices** (anomaly, percentile, z-score against each sensor's own climatology) | Removes any constant multiplicative bias | ≥ ~8–10 years per sensor | No error figure. Robust by construction. | Loses absolute counts. VIIRS N20 climatology is short (2018→). Does not fix trends inside a sensor's own record. | Standard in fire-danger and anomaly products [K]. Our approach C |
| M9 | **ML regression** (MODIS counts + covariates → VIIRS-equivalent) | Counts or FRP, non-linear and regional | Overlap data plus covariates (land cover, FRP, cloud, day/night) | Not found for counts. ML papers use MODIS and VIIRS as inputs for prediction, not for harmonization [A]. | Overfitting risk. Hard to defend in one day. | arXiv 2503.08580 compares MODIS vs VIIRS predictability [A] |

---

## 4. Known problems

| Problem | Effect on counts | How others handle it | Source |
|---|---|---|---|
| **Pixel size and scan-angle growth** (MODIS 1 km → ~2 × 4.8 km at the edge, with bow-tie duplicates; VIIRS 375 m, with pixel growth limited onboard) | One fire gives 1 MODIS pixel but 2–3 VIIRS pixels (our median 2). MODIS counts and FRP depend on viewing angle; edge pixels have up to ~300% higher mean FRP. Bow-tie overlap double-counts the same fire. | Count fire cells or clusters. Filter by VZA or scan×track. Remove bow-tie duplicates. Aggregate VIIRS to the MODIS footprint (M4). | Csiszar 2012 [R]. Li et al. 2018 [A]. RS 18:1650 [A] |
| **Detection limit** (small or cool fires) | VIIRS sees many fires MODIS misses: ~70% of VIIRS pixels have no MODIS match in our Mexico test. NE Asia: 65% (forest) and 83% (low-biomass land) of VIIRS fire pixels missed by MODIS. Ratio is largest in agricultural, small-fire regions. | Regional or biome-specific calibration (M2). The sensitivity gap cannot be removed by aggregation. | Our [03](03-sensor-comparison.md) §5. NE Asia study [A]. Vadrevu & Lasko 2018 [R] |
| **Overpass time and diurnal cycle** (Terra ~10:30, Aqua ~13:30, S-NPP ~13:30, NOAA-20/21 ~12:40; night passes ~22:30 / 01:30 / 00:40) | Afternoon passes catch the daily peak: Aqua flags 2.3× more than Terra in our 2024 data. Night share: Terra 40%, Aqua 6%, VIIRS 24%. | Pair sensors with similar overpass (Aqua ↔ S-NPP) for calibration. Calibrate day and night separately. INPE uses only the afternoon Aqua pass. | Csiszar 2012 [R]. INPE [A]. Our [learn.html](../../web/explorer/learn.html) |
| **Terra and Aqua orbit drift and end of life** | Overpass time shifts earlier, pixel size and scan gaps change, and spatial-sampling effects jumped in late 2024. Fire-product impact is not yet quantified. Planned end of science collection: Aqua ~Aug 2026, Terra ~early 2027. | NASA is still investigating. CAMS GFAS and NOAA GBBEPx moved to VIIRS-based processing. Nobody publishes a correction yet. | Giglio LANCE 2025 [R]. LDOPE 2026 [R]. LAADS 2025 [A]. CAMS [A] |
| **Number of VIIRS satellites changes** (1 in 2012, 2 in 2018, 3 in 2024, 2 from Nov 2026) | Summing satellites makes fake jumps: Mexico 105k → 343k → 517k hotspots per year. | Fix the satellite set, or count fire-days (any satellite, once per cell per day). INPE uses one reference satellite. | Our [learn.html](../../web/explorer/learn.html). INPE [A] |
| **S-NPP end and the NOAA-20/21 transition** | S-NPP and NOAA-20 have identical sensors but pass ~50 min apart, so small diurnal differences. NOAA-20 C2 got a separate recalibration. | FIRMS: switch to NOAA-20/21 feeds. S-NPP history remains for 2012–2018. | FIRMS blog 2026 [A]. LP DAAC V002 notice [A] |
| **Collection changes** (MODIS C6 → C6.1; VIIRS C1 → C2) | C6 changed small-fire thresholds and false-alarm tests (more small fires, fewer false alarms over Amazon clearings and deserts). C6.1 is mainly an upstream L1B recalibration [K]. VIIRS C2 removed "bad scans" and improved NOAA-20 calibration, so C1 and C2 counts can differ. | Use one collection for the whole record. FIRMS SP files are MODIS C6.1. Record the `version` field. | Csiszar 2012 [R]. VIIRS C2 UG [A]. LP DAAC [A] |
| **Cloud, smoke and saturation** | Clouds or thick smoke mean no detection, which is not the same as no fire. Cloudier months are under-counted by both sensors, but not equally (different cloud masks). VIIRS I4 saturates over hot fires, so FRP comes from M13 at 750 m [K]. | Compare under matched cloud masks (said to be "crucial"). Report counts as "detected", not as "fires". | Csiszar 2012 [R]. Vadrevu & Lasko 2018 (VIIRS FRP from M13) [R] |
| **Static sources** (gas flares, industry, volcanoes) | Persistent hotspots inflate counts and do not follow the fire season. Where they are frequent they also distort the VIIRS/MODIS ratio, because VIIRS detects more small flares. | FIRMS `type` field (0 = vegetation, 1 = volcano, 2 = static land source, 3 = offshore). FIRMS Static Thermal Anomalies mask (provisional, from 2023 MODIS + S-NPP plus industrial inventories, Feb 2025). | FIRMS blog Feb 2025 [A]. GWIS 2024 [A]. Volcano MODIS→VIIRS transition (Campus et al. 2022: VIIRS gives ~60% more alerts than MODIS) [R] |
| **NRT vs standard processing** | NRT uses provisional ancillary inputs and is later replaced by SP (~5 months later). Small count differences are possible. | SP for history and calibration. NRT only for recent months, marked provisional. | Our [02](02-data-sources-firms.md) |
| **Regional biases** (tropics, drylands, agriculture, boreal) | The ratio depends on fire-size distribution: high where burning is small and agricultural (Punjab 4.8–6.5×, Mexico 3.2–5.9×), lower where fires are large. Boreal: VIIRS FRP ~47% lower for large fires. MODIS has a 1–2 day revisit gap in the tropics. | Per-region or per-biome factors (GBBEPx ecoregions, QFED/GFAS biomes). | Li et al. 2018 [A]. Vadrevu & Lasko 2018 [R]. Our [03](03-sensor-comparison.md) |

---

## 5. Recommended method for our pipeline (≈ one day of work)

This refines Approach A + B + C of [04](04-harmonization-approaches.md) with the controls found above.

**Target unit:** *VIIRS-equivalent fire cell-days*. A cell-day is one cell of a fixed ~1 km grid (e.g.
0.01°) with at least one `type = 0` detection on a given local day. These are summed per area of interest and
month.

1. **Fix the satellite set for each era** (lesson from INPE):
   - VIIRS series = **S-NPP 20 Jan 2012 – 31 Mar 2018**, then **NOAA-20 from 1 Apr 2018**. One satellite at a
     time; NOAA-21 is not added to the long series.
   - MODIS reference = **Aqua** (13:30, the best match to VIIRS, the choice of Csiszar 2012 and INPE).
     **Terra** is used only for Nov 2000 – Jun 2002, through its own Terra→Aqua factor learned on 2003–2011.
2. **Same filters for both sensors:** `type = 0`, the same confidence rule, local date, outage days marked
   missing. MODIS: drop pixels with very large scan × track (edge and bow-tie). Calibrate **day and night
   separately**, or use daytime only for the main series, because the night shares differ (Aqua 6% vs VIIRS 24%).
3. **Calibrate on clean overlap years: 2012–2021** (Aqua ↔ S-NPP or NOAA-20). Exclude 2022 onward, because Terra
   left the constellation in 2022 and both MODIS orbits drifted with effects that NASA says jumped in late 2024.
   For each region (state or 1° cell with enough detections, falling back to a biome or national factor) and
   calendar month:
   `k = median over years of (VIIRS cell-days / Aqua cell-days)`, plus its interquartile range or a bootstrap 90%
   interval.
4. **Build the series:**
   - VIIRS values from 2012 onward;
   - `k × Aqua` for Jul 2002 – 2011;
   - `k × k_TA × Terra` for 2000–2002.
   Tag each value's provenance (`VIIRS-SNPP`, `VIIRS-N20`, `MODIS-Aqua-cal`, `MODIS-Terra-cal`).
5. **Calendar and alerts in anomaly terms (Approach C):** percentile of the current month against the harmonized
   2003–2025 distribution for that calendar month, with the median.

**Validation to report (cheap to compute):**
- *Leave-one-year-out* on 2012–2021: predict VIIRS from Aqua × k, report median absolute percentage error and bias
  per region.
- *Step test*: mean of (harmonized − VIIRS) in the overlap, and a visual check of no break at 2012 and 2018.
- *S-NPP vs NOAA-20 check* on 2018–2021: their ratio should be close to 1 (both satellites operating, ~50 min apart).
- *Drift check*: plot k by year for 2012–2025. A trend after 2022 is evidence of the MODIS drift and confirms that
  those years must stay out of calibration.

**Limits to state honestly in the app and the presentation:**
- The MODIS-era values are **estimates of what VIIRS would have seen**. They inherit the uncertainty of k, which
  should be shown as a band, and they cannot recover small fires that MODIS never detected in a specific year.
  The method assumes the fire-size mix in a region and month was similar before 2012.
- Factors are not reliable for small areas or months with few detections. Show "low confidence" when the
  calibration cell has fewer than about 30 Aqua cell-days in that month.
- Counts are **detections, not fires or burned area** (FIRMS recommendation). Clouds and smoke cause under-detection.
- No NASA-endorsed harmonized product exists. Our factors are a transparent, reproducible approximation, in line
  with how GBBEPx, QFED and GFAS bridge the sensors (regional regression on the overlap), but for counts.
- Recent MODIS (2022→) and the end of Aqua and Terra: the series after 2026 is VIIRS-only, which is why the
  harmonization goes MODIS → VIIRS-equivalent and not the other way round.

---

## 6. Open questions to check before the presentation

- Is FIRMS still delivering Aqua MODIS after the planned ~Aug 2026 end of science collection? (Our notes say
  "active"; LAADS planned otherwise.)
- Does the FIRMS archive serve VIIRS C2 for S-NPP across the whole of 2012–2026, or a mix of C1 and C2? Check the
  `version` field in our tables.
- Can we get the full text of RS 18:1650 (2026) for its VZA correction coefficients? The download was over the
  10 MB fetch limit this session.

---

## 7. Sources

Tags: **[R]** read in full or as slides this session; **[A]** abstract, catalog record or search summary only;
**[K]** background knowledge.

**NASA / NOAA documents and slides**
- Csiszar, Schroeder, Giglio, Justice, Ellicott (2012). *Establishing active fire data continuity between Aqua MODIS and Suomi NPP VIIRS.* AMS Annual Meeting. https://www.star.nesdis.noaa.gov/JPSS/documents/meetings/2012/AMS_NewOrleans_2012/Oral/2012_AMS_Csiszar_Fire_V1.pdf [R]
- Giglio, L. (2025). *Terra/Aqua Orbit-Drift Update.* LANCE User Working Group. https://landweb.modaps.eosdis.nasa.gov/data/filePost/LANCE_UWG_Orbit_Drift_Giglio_202505.pdf [R]
- NASA LDOPE (2026). *MODIS – Terra/Aqua Drift* (HC_MOD_26008). https://landweb.modaps.eosdis.nasa.gov/displayissue?id=1254 [R]
- VIIRS Active Fire User Guide (C1, 375 m / 750 m). https://lpdaac.usgs.gov/documents/427/VNP14_User_Guide_V1.pdf · https://viirsland.gsfc.nasa.gov/PDF/VIIRS_activefire_User_Guide.pdf [A]
- VIIRS 750 m Active Fire ATBD. https://lpdaac.usgs.gov/documents/133/VNP14_ATBD.pdf [A]
- NOAA VIIRS I-band Active Fire ATBD v1.0. https://www.star.nesdis.noaa.gov/jpss/documents/ATBD/ATBD_Iband_ActiveFires_v1.0.pdf [A]
- VIIRS Collection 2 Active Fire 375 m User Guide v1.2 (2025). https://www.earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf [A]
- Earthdata: VIIRS Active Fire products (V002) released. https://www.earthdata.nasa.gov/data/alerts-outages/viirs-active-fire-products-released [A]
- NASA Active Fire product page (Fire ESDR). https://viirsland.gsfc.nasa.gov/Products/NASA/FireESDR.html [A]
- Giglio (2022). *NASA VIIRS and MODIS Fire Products Update.* GOFC-GOLD. https://gofcgold.org/sites/default/files/2022-07/Giglio_GOFC_2022_NASA_Fire.pdf [A — certificate error, snippet only]
- Schroeder (2016). *VIIRS (and Landsat-class) Active Fire Data Products.* GOFC Fire IT. https://gofcgold.umd.edu/sites/default/files/fireit_meetings/GOFC_Fire_IT_2016/pdfs/day1/Schroeder_0.pdf [A]
- Boschetti, Roy, Giglio (2022, 2023). Harmonized MODIS/VIIRS burned-area record, MODIS Science Team slides. https://modis.gsfc.nasa.gov/sci_team/meetings/202204/presentations/session1/boschetti.pdf · https://modis.gsfc.nasa.gov/sci_team/meetings/202305/presentations/boschetti.pdf [A — server refused connection]
- FIRMS blog (Oct 2026). *Transitioning from Suomi NPP VIIRS & OMPS: What FIRMS Users Need to Know.* https://www.earthdata.nasa.gov/news/blog/transitioning-from-suomi-npp-viirs-omps-what-firms-users-need-know [A]
- FIRMS blog (Feb 2025). *FIRMS incorporates static thermal anomalies data.* https://wiki.earthdata.nasa.gov/spaces/FIRMS/blog/2025/02/28/425855667/FIRMS+incorporates+static+thermal+anomalies+data+to+help+users+differentiate+between+vegetation+and+non+vegetation+fires. [A]
- Roberts et al. (2024). VIIRS static thermal anomalies, GOFC/GWIS. https://gofcgold.umd.edu/sites/default/files/2024-11/GOFC_GWIS_2024_Roberts_short.pdf [A]
- LAADS DAAC (2025). *MODIS to VIIRS Transition.* https://ladsweb.modaps.eosdis.nasa.gov/learn/modis-to-viirs-transition/MODIS-VIIRS_Transition.pdf · https://ladsweb.modaps.eosdis.nasa.gov/learn/modis-to-viirs-transition/MODIS-VIIRS_Transition-2.pdf [A]
- Earthdata alert: Transition from MODIS to VIIRS. https://www.earthdata.nasa.gov/data/alerts-outages/transition-from-modis-viirs [A]
- Terra project: 2023 Terra Updates. https://terra.nasa.gov/news/2023-terra-updates [A]

**Operational emission systems (sensor bridging by scaling)**
- NOAA GBBEPx ATBD and user manual. https://ospo.noaa.gov/resources/documents/pdf/GBBEPx_ATBD.pdf · https://ospo.noaa.gov/resources/documents/pdf/GBBEPx_EUM.pdf [A]
- Kondragunta et al. (2018). GBBEPx, JPSS Annual Meeting. https://star.nesdis.noaa.gov/data/star_docs/meetings/2018JPSSAnnual/Thursday/kondragunta_GBBEPx_30aug18.pdf [A]
- AMS 2024: *Global Biomass Burning Emissions Product for Operational Air Quality Forecasting* (VIIRS regression on QFED by ecoregion). https://ams.confex.com/ams/104ANNUAL/webprogram/Paper435801.html [A]
- Collow et al. QFED/GEOS MODIS→VIIRS scaling, CEOS AC-VC-22. https://ceos.org/document_management/Virtual_Constellations/AC-VC/Meetings/AC-VC-22/Presentations/AC-VC_5.17_Collow_version1.pdf [A]
- CAMS: *Drifting away from MODIS* (GFAS adds VIIRS, Dec 2025). https://atmosphere.copernicus.eu/drifting-away-modis-cams-global-fire-assimilation-system [A]
- Kaiser (2018). CAMS GFAS development (VIIRS merge, bias correction to MODIS). https://atmosphere.copernicus.eu/sites/default/files/2018-11/5_181016_CAMSGA_CAMS44_Kaiser.pdf [A]
- GFED5-NRT preprint (ESSD, 2026). https://essd.copernicus.org/preprints/essd-2026-158/essd-2026-158-manuscript-version5.pdf [A]

**Peer-reviewed papers**
- Schroeder, Oliva, Giglio, Csiszar (2014). The new VIIRS 375 m active fire detection data product. *RSE* 143:85–96. doi:10.1016/j.rse.2013.12.008 · https://directreadout.sci.gsfc.nasa.gov/publications_documents/Schroeder_et_al_2014b_RSE.pdf [A]
- Giglio, Schroeder, Justice (2016). The Collection 6 MODIS active fire detection algorithm and fire products. *RSE* 178:31–41. https://www.researchgate.net/publication/297741123 [K]
- Li, Zhang, Kondragunta, Csiszar (2018). Comparison of fire radiative power estimates from VIIRS and MODIS observations. *JGR-Atmos* 123. doi:10.1029/2017JD027823 · https://repository.library.noaa.gov/view/noaa/49896 [A]
- Vadrevu & Lasko (2018). Intercomparison of MODIS Aqua and VIIRS I-band fires and emissions in an agricultural landscape. *Remote Sensing* 10(7):978. https://pmc.ncbi.nlm.nih.gov/articles/PMC6108185/ [R, partial]
- Campus et al. (2022). The transition from MODIS to VIIRS for global volcano thermal monitoring. *Sensors* 22(5):1713. https://pmc.ncbi.nlm.nih.gov/articles/PMC8914890/ [R, partial]
- *Fire Radiative Power Correction and Spatiotemporal Fusion Based on MYD14 and VNP14IMG* (2026). *Remote Sensing* 18:1650. https://doi.org/10.3390/rs18101650 [A — PDF over the size limit]
- Biomass burning in Africa: FRP missed by MODIS using the 375 m VIIRS product (2020). *Remote Sensing* 12(10):1561. https://www.mdpi.com/2072-4292/12/10/1561 [A]
- Giglio, Boschetti, Roy et al. (2025). The NASA VIIRS burned area product, global validation, and intercomparison with the NASA MODIS burned area product. *RSE* 331:115006. https://geog.umd.edu/node/14474 [A]
- Wooster et al. (2021). Satellite remote sensing of active fires: history and current status, applications and future requirements. *RSE* 267:112694. https://repository.library.noaa.gov/view/noaa/67728 [A]
- Randerson et al. (2012) and GFED4s: van der Werf et al. (2017), Global fire emissions estimates during 1997–2016. *ESSD* 9:697–720. https://essd.copernicus.org/articles/9/697/2017/ [A]
- Andela et al. (2017). A human-driven decline in global burned area. *Science*. https://research.vu.nl/en/publications/a-human-driven-decline-in-global-burned-area/ [A]
- MRBA60: long-term consistent global burned-area dataset from Sentinel-3 and MODIS (quantile mapping on 2019–2024). https://www.researchgate.net/publication/410818797 [A]
- Gridded MODIS FRP bow-tie correction by quantile mapping. *Remote Sensing* 11:1205. https://www.mdpi.com/2072-4292/11/10/1205 [A]
- *Comparing next-day wildfire predictability of MODIS and VIIRS satellite data* (2025). https://arxiv.org/pdf/2503.08580 [A]

**INPE (reference-satellite practice)**
- INPE technical notice: change of reference satellite to Aqua (2011). https://dataserver-coids.inpe.br/queimadas/queimadas/Publicacoes-Impacto/documentos/20110824_Aviso_Ref_Mudoup_Aqua.pdf [A]
- INFOQUEIMA monthly bulletin (Sep 2024). https://dataserver-coids.inpe.br/queimadas/queimadas/Infoqueima/2024/2024_09_infoqueima.pdf [A]
- Pesquisa FAPESP (2019). *Como monitorar o fogo.* https://revistapesquisa.fapesp.br/como-monitorar-o-fogo/ [A]

**Other Space Apps 2026 teams (not peer-reviewed, context only)**
- https://github.com/the-aris-club/flare-chronos · https://github.com/samuelakosaonyejekwe/firecal · https://github.com/Thay32-Heng/pyfire-watch [A]

*Parts of this document were drafted with AI assistance (Claude, Anthropic) and must be reviewed by Team A11.*
