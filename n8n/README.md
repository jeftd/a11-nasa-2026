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

| File | n8n name | Trigger | Purpose |
|---|---|---|---|
| `workflows/01-db-setup.json` | A11 DB setup (schema) | manual | Applies `analysis/db/schema.sql` (idempotent) |
| `workflows/02-load-firms-csv.json` | A11 Load FIRMS CSV | sub-workflow | Downloads one CSV, stages it, parses it. Does not save successful execution data. |
| `workflows/03-historical-backfill.json` | A11 Historical backfill (Mexico) | manual | Mexico country files (MODIS 2000-2025, S-NPP 2012-2025, NOAA-20 2018-2025) + current year from the Area API in 5-day windows |
| `workflows/04-daily-nrt.json` | A11 Daily NRT (Mexico) | daily 06:00 | Last 2 days of MODIS, NOAA-20 and NOAA-21 NRT |

Regenerate the JSON files after editing the schema or the workflow code:

```bash
python n8n/build_workflows.py
```

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
```

## Caveats

- API rows are clipped to the Mexico bounding box (`country = 'Mexico (bbox)'`), so they include border areas
  of the US, Guatemala and Belize. Clip with a Mexico polygon before comparing with the country files.
- NRT rows have no `type` field (`fire_type` is NULL); static sources must be masked using SP rows with
  `fire_type <> 0`.
