# 05 — Web Application: Requirements and Proposed Architecture

All UI text, labels and documentation of the platform will be in **English** (Space Apps requires English on
the submission page and linked materials).

## 1. User stories

| # | As a… | I want to… | So that… |
|---|---|---|---|
| U1 | emergency manager | draw an area or type lat/lon | I analyze exactly my jurisdiction |
| U2 | emergency manager | see a year × month burning calendar | I know which months and years are critical |
| U3 | emergency manager | compare this month to the historical median | I can tell if the current season is unusual |
| U4 | scientist | see harmonized counts with sensor provenance and uncertainty | I trust the 2000–present series |
| U5 | land manager | download a CSV of hotspots and of the monthly summary | I can use it in my own GIS/reports |
| U6 | any user | read the colors without ambiguity (color-blind safe) | the calendar is accessible |

## 2. Functional requirements

- **AOI selection:** draw rectangle/polygon on a map; or enter bounding box / point + radius; optionally
  pick a country/state.
- **Date range** selector (default: full record).
- **Burning calendar:** heat-map, rows = years, columns = months, value = harmonized hotspot count;
  toggle to anomaly/percentile view.
- **Seasonal profile:** monthly median ± interquartile range across years, with the current year overlaid.
- **Current vs history card:** current month count, historical median, % difference, percentile, label
  (e.g. "Above normal").
- **Annual totals** bar chart with trend.
- **Downloads:** CSV of raw hotspots in AOI/date range (with `sensor`, `harmonized_weight`, `provenance`),
  CSV of monthly summary, PNG of charts.
- **About/methods** page explaining the harmonization in plain English, with FIRMS acknowledgment.

## 3. Non-functional requirements

- Loads and answers an AOI query in a few seconds.
- Works on desktop and mobile browsers.
- Accessible color ramps (e.g. *viridis*/*cividis* for counts, diverging *blue–white–red* (color-blind safe) for
  anomalies), text labels in every cell on hover/tap.
- Public URL with no login (judges must open it without registration).
- FIRMS MAP_KEY kept server-side.

## 4. Proposed architecture (to be confirmed by the team)

```
            OFFLINE PIPELINE (Python)                          WEB PLATFORM
 FIRMS country CSVs / archive ──► clean & filter ──► grid     ┌──────────────────────────┐
 (MODIS SP, VIIRS SP)              (type=0, conf)   counts ──►│ precomputed harmonized    │
                                                     │        │ monthly grid (Parquet/JSON)│
                                calibration factors ◄┘        └────────────┬─────────────┘
                                k[region, month]                            │
                                                                            ▼
 FIRMS Area API (NRT, last days) ──► small API / serverless fn ──► front-end (map + charts)
```

- **Pipeline:** Python (pandas/polars, numpy), outputs a compact gridded dataset (e.g. 0.25°–0.5° × month)
  plus calibration factors.
- **Back-end:** lightweight API (e.g. FastAPI) or serverless functions that aggregate grid cells inside the
  AOI and proxy the FIRMS API for recent NRT data.
- **Front-end:** map (Leaflet or MapLibre) + charts (e.g. ECharts, Plotly, or D3) + CSV export.
- Hosting: any free static host + serverless (Vercel, Netlify, GitHub Pages + API elsewhere).

Trade-off to decide: precomputed grid (fast, AOI precision limited to grid size) vs. point-level queries
(exact AOI, heavier data). For the hackathon the grid approach is recommended, with exact points only for the
CSV download of recent data.

## 5. MVP scope for the 48-hour window

1. Harmonized monthly dataset for a demo region (e.g. Mexico) — then global if time allows.
2. Map with AOI drawing + calendar heat-map + current-vs-median card.
3. CSV download.
4. Methods page.
5. 30-second video or 7-slide demo.
