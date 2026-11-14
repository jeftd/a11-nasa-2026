# n8n data pipeline

Loads NASA FIRMS hotspots into the `a11-db` Postgres + PostGIS database (Easypanel project `learn`,
service `a11-db`, database `firms`, internal host `learn_a11-db:5432`).

```
FIRMS country CSVs (SP, 2000-2025) ─┐
FIRMS Area API (SP + NRT, 2026)    ─┼─► n8n "A11 Load FIRMS CSV" ─► staging_csv ─► load_staged() ─► hotspots
FIRMS Area API (NRT, daily 06:00)  ─┘                                                              │
                                                                     refresh_after_load() ◄────────┘
                                                                     (drop NRT covered by SP,
                                                                      rebuild monthly_grid)
```

The CSV text is parsed inside Postgres (`load_staged()`), so n8n only moves one item per file and stays light.
Duplicates are ignored by the `UNIQUE (satellite, acq_date, acq_time, latitude, longitude)` key, so any
workflow can be re-run safely.

## Workflows

| File | n8n name (id) | Trigger | Purpose |
|---|---|---|---|
| `workflows/01-db-setup.json` | A11 DB setup (schema) `4lcysse4oNmmKMo7` | manual | Applies `analysis/db/schema.sql` (idempotent) |
| `workflows/02-load-firms-csv.json` | A11 Load FIRMS CSV `g8PK6cZ7WiIK8N3w` | sub-workflow (published) | Downloads one CSV, stages it, parses it. A failed download is logged as an error row instead of stopping the run. Does not save successful execution data. |
| `workflows/03-historical-backfill.json` | A11 Historical backfill (Mexico) `pmmStkkyD3JB7v6e` | manual | Mexico country files (MODIS 2000-2025, S-NPP 2012-2025, NOAA-20 2018-2025) + current year from the Area API in 5-day windows (560 sources, ~20 min) |
| `workflows/04-daily-nrt.json` | A11 Daily NRT (Mexico) `YtVboT3mI1Hb5EmF` | daily 06:00 America/New_York (published) | Last 2 days of MODIS, NOAA-20 and NOAA-21 NRT |
| `workflows/05-db-status.json` | A11 DB status `Xf5atlLgxmhASd7h` | manual | Row counts, `pipeline_status_json()`, recent load errors |
| `workflows/06-pipeline-error-handler.json` | A11 Pipeline error handler `o8c3nl6MRhfGfRqL` | error workflow (published) | Marks the run as `error` when workflow 03 or 04 crashes |

The n8n UI is at https://n8n.leonardosaenz.com.mx (the `*.easypanel.host` domain does not keep the login session).

Regenerate the JSON files after editing the schema or the workflow code:

```bash
python n8n/build_workflows.py
```

## Pipeline status (for the website)

Every run of workflows 03 and 04 is recorded so a status page can show it:

```
Start run ─► start_pipeline_run()  → pipeline_runs row (status 'running')
  each file/API call ─► load_runs row with run_id (status 'ok' / 'error', rows_in, rows_new)
Finish run ─► finish_pipeline_run() → status 'success' | 'partial' | 'error' + totals
crash ─► error workflow ─► fail_pipeline_run() → status 'error' + message
```

| Object | What it holds |
|---|---|
| `pipeline_runs` | One row per run: pipeline, trigger (`schedule`/`manual`), n8n execution id, status, start/finish, sources ok/error, rows read/new, NRT rows removed, message |
| `load_runs` | One row per file or API call, linked by `run_id` |
| `pipeline_status` (view) | Latest run per pipeline + `health`: `success`, `partial`, `error`, `running`, `stalled` (running > 2 h) or `overdue` (daily run missing > 26 h) |
| `data_freshness` (materialized view) | Per satellite and processing level: first/last date, hotspot count, last load time. Rebuilt by `refresh_after_load()` |
| `pipeline_status_json()` | Everything above as one JSON document, ready for an API endpoint |

A web endpoint only needs one query:

```sql
SELECT pipeline_status_json();
```

```json
{
  "generated_at": "...",
  "pipelines":   [{ "pipeline": "daily_nrt", "status": "success", "health": "success", "started_at": "...", "duration_s": 32, "sources_ok": 3, "rows_new": 0, ... }],
  "recent_runs": [{ "id": 3, "pipeline": "daily_nrt", "trigger": "manual", "status": "success", ... }],
  "data":        [{ "satellite": "NOAA20", "processing": "NRT", "first_date": "...", "last_date": "2026-11-14", "hotspots": 53387, ... }],
  "totals":      { "hotspots": 9272521, "first_date": "2000-11-01", "last_date": "2026-11-14" }
}
```

Manual runs started from the n8n editor do not trigger the error workflow; if one crashes it stays `running`
and the view reports it as `stalled` after 2 hours.

## Configuration

- Postgres credential in n8n: `a11-db`.
- FIRMS MAP_KEY: environment variable `FIRMS_MAP_KEY` on the `n8n` service **and every `n8n-worker-*`**,
  plus `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. Workflows read it as `$env.FIRMS_MAP_KEY`; the key never
  appears in workflow JSON or in the database (`source` stores the URL with `{KEY}` removed).

## Useful queries

```sql
SELECT satellite, processing, min(acq_date), max(acq_date), count(*) FROM hotspots GROUP BY 1, 2 ORDER BY 1, 2;
SELECT * FROM load_runs ORDER BY id DESC LIMIT 20;
SELECT * FROM load_runs WHERE status <> 'ok';
SELECT * FROM pipeline_status;
SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 10;
```

## Caveats

- API rows are clipped to the Mexico bounding box (`country = 'Mexico (bbox)'`), so they include border areas
  of the US, Guatemala and Belize. Clip with a Mexico polygon before comparing with the country files.
- NRT rows have no `type` field (`fire_type` is NULL); static sources must be masked using SP rows with
  `fire_type <> 0`.
