# 72 h fire forecast in the calendar

The calendar shows what happened; the forecast shows what is likely in the **next 72 hours**. It comes from
**FireCast**, a separate model/API (LightGBM on VIIRS NOAA-20 history, 0.25° cells, global), running on the team
server.

## Where it appears

| Place | What |
|---|---|
| **Timeline** (dock) | A dashed block after the current month: `29% · Next 72 h`, coloured by risk. Click → forecast layer on the map + Overview card. |
| **Overview** | "Next 72 hours · forecast" card, above "What usually comes next" (which stays the historical pattern). |
| **Map** | Layer "72 h forecast": 0.25° cells coloured by risk, tooltip with % and hotspots in the last 7 days. |
| **Ember** | `A11Context().forecast_72h` → chance, riskiest cell, window, data date. |

Numbers:
- **Big %** = chance of at least one hotspot anywhere in the area, `1 − Π(1 − p_cell)` over the 0.25° cells that
  touch the area (assumes independence, so it is an upper-side estimate for large areas).
- **Risk level** = riskiest cell, same thresholds as the API: very high ≥ 80 %, high ≥ 50 %, moderate ≥ 20 %.

## Plumbing

```
page ─► forecast.js ─► GET /api/forecast/<forecast|forecast/point|forecast/summary|model>?...  (server.js)
                                  └─► FORECAST_API_URL (default http://31.170.165.34:8080/api/v1/), 10-min cache
```

- The proxy avoids mixed content (the site is HTTPS, FireCast is HTTP) and only forwards known paths/params.
- Set `FORECAST_API_URL` in Easypanel if FireCast moves (e.g. `https://api.emberatlas.ink/api/v1/`).
- If FireCast is down the card shows "Forecast unavailable right now"; the rest of the page is unaffected.

## The model (for the pitch)

- Target: ≥ 1 VIIRS hotspot in a 0.25° cell during the next 3 days.
- Inputs: hotspots in the last 1/3/7/30 days, fire days, FRP, days since last fire, neighbouring cells, climatology
  of the cell for that time of year, location and season. Static sources (flares, volcanoes) removed.
- Trained on 2024, tested on all of 2025: **AUC 0.914** vs 0.849 for climatology and 0.814 for persistence;
  calibrated (says 72 % → happened 69 %).
- Live: downloads the last 30 days from FIRMS (NOAA-20 NRT) and refreshes every 3 h.
- API docs: `http://31.170.165.34:8080/docs`.
