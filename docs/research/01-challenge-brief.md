# 01 — Challenge Brief

**Challenge:** Harmonization of MODIS and VIIRS Hot Spots
**Event:** 2026 NASA Space Apps Challenge (November 14–15, 2026)
**Team:** A11 — Local event: Monterrey
**Difficulty:** Intermediate / Advanced
**Subjects:** Earth Science, Software
**Official page:** https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/
**Photo credit on the challenge:** CONAE (National Commission on Space Activities, Argentina)

---

## 1. The problem in one paragraph

Satellites have detected active fire "hotspots" for 25+ years, but the record is split between two
sensor families that **cannot be compared directly**:

| | MODIS | VIIRS |
|---|---|---|
| Platforms | Terra (since Nov 2000), Aqua (since Jul 2002) | Suomi NPP (2012 – Nov 2, 2026), NOAA-20 (2018 →), NOAA-21 (2024 →) |
| Fire pixel size | ~1 km (grows strongly toward swath edge) | ~375 m (pixel growth limited onboard) |
| Swath | 2,330 km | 3,040 km |
| Status | Approaching end of operational life | The continuity sensor |

Because VIIRS has smaller pixels and higher sensitivity, the same fire season produces **many more
hotspots** under VIIRS than under MODIS. If you plot raw counts across 2000 → today, you see a fake "jump"
when VIIRS starts. Fire managers therefore lack a consistent picture of *when* and *where* burning happened.

## 2. What we are asked to build

Two parts, as suggested by the challenge statement:

1. **Harmonization.** Merge MODIS and VIIRS hotspots so that "by the end of that phase the sensor of origin
   no longer matters and the patterns, trends, and anomalies become the focus."
2. **Web application** that takes the harmonized data as input and lets a user:
   - select an **area of interest** (draw on a map, or enter lat/lon),
   - select a **date range**,
   - see a **burning activity calendar** (hotspot counts from the early 2000s to the present —
     which months of the year burn most, which years had more activity),
   - compare the **current month against the historical median**,
   - **download** analytics/visualizations and a **CSV of the hotspots** found in the search.

## 3. Target users

Early-warning and emergency responders, scientists, land managers, firefighters.

## 4. Suggestions from the statement (optional, but signals what judges value)

- Interactive map (draw AOI or type coordinates).
- **Accessible color ramps** — color should express similarity/difference in hotspot counts across months.
- A **burning calendar** view.
- A few key indices/figures: historical comparisons, **anomalies vs multi-year averages**, number of fires
  detected and reported.
- Downloadable CSV.

## 5. Our reading of "success"

| Requirement | How we will know it is met |
|---|---|
| Sensor of origin no longer matters | The harmonized monthly series has no step change at 2012 / 2018, and MODIS-era and VIIRS-era values are on the same scale (validated on overlap years). |
| Calendar | Year × month heat-map for any AOI, 2000/2001 → present. |
| Current vs history | Current month value, historical median, anomaly (% and percentile). |
| Usable by responders | Works in a browser, AOI in < 3 clicks, readable color ramp (colorblind-safe), CSV export. |

## 6. Official resources provided for this challenge

The Resources tab lists **one** resource: **NASA FIRMS** (Fire Information for Resource Management System).
See [02-data-sources-firms.md](02-data-sources-firms.md).

## 7. Important timing fact discovered during research

**Suomi NPP stopped delivering new data on November 2, 2026, 15:40 UTC** (NOAA/NESDIS announcement relayed by
NASA Earthdata). This happened 12 days before the hackathon, so the "current" VIIRS stream is now
**NOAA-20 and NOAA-21 only**. Any harmonization that used S-NPP as the VIIRS reference must transition to
NOAA-20/21 going forward.
