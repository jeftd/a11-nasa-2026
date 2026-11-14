-- A11 FIRMS hotspot store (PostgreSQL 17 + PostGIS 3.5)
-- Target: Easypanel service learn/a11-db, database "firms".
-- Idempotent: safe to run more than once.

CREATE EXTENSION IF NOT EXISTS postgis;

-- One row per FIRMS detection (MODIS or VIIRS, Standard Processing or NRT).
CREATE TABLE IF NOT EXISTS hotspots (
    id           bigserial PRIMARY KEY,
    sensor       text        NOT NULL CHECK (sensor IN ('MODIS', 'VIIRS')),
    satellite    text        NOT NULL,          -- Terra, Aqua, SNPP, NOAA20, NOAA21
    acq_date     date        NOT NULL,          -- UTC
    acq_time     smallint    NOT NULL,          -- HHMM, UTC
    latitude     real        NOT NULL,
    longitude    real        NOT NULL,
    geom         geometry(Point, 4326)
                 GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
    brightness   real,                          -- MODIS ch21/22 or VIIRS I-4 (K); not comparable across sensors
    bright_2     real,                          -- MODIS bright_t31 or VIIRS bright_ti5 (K)
    scan         real,
    track        real,
    confidence   text,                          -- raw value: MODIS 0-100, VIIRS l/n/h
    conf_class   char(1)     NOT NULL,          -- harmonized: l / n / h
    frp          real,                          -- MW
    daynight     char(1),
    fire_type    smallint,                      -- 0 vegetation, 1 volcano, 2 static land, 3 offshore; NULL in NRT
    version      text,
    processing   text        NOT NULL CHECK (processing IN ('SP', 'NRT')),
    country      text,
    loaded_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (satellite, acq_date, acq_time, latitude, longitude)
);

CREATE INDEX IF NOT EXISTS hotspots_date_idx ON hotspots (acq_date);
CREATE INDEX IF NOT EXISTS hotspots_geom_idx ON hotspots USING gist (geom);
CREATE INDEX IF NOT EXISTS hotspots_sat_date_idx ON hotspots (satellite, acq_date);

-- Bookkeeping for each pipeline run (historical loads and the daily NRT pull).
CREATE TABLE IF NOT EXISTS load_runs (
    id          bigserial PRIMARY KEY,
    job         text        NOT NULL,           -- e.g. 'sp_country_csv', 'nrt_area_api'
    source      text        NOT NULL,           -- file URL or API source name
    rows_in     integer,
    rows_new    integer,
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    status      text        NOT NULL DEFAULT 'running',
    message     text
);

-- Monthly counts on a 0.25 degree grid: the input for calibration and the burning calendar.
-- Vegetation fires only (fire_type 0, or NULL for NRT rows that have no type yet).
CREATE MATERIALIZED VIEW IF NOT EXISTS monthly_grid AS
SELECT
    floor(latitude  / 0.25)::int            AS cell_y,
    floor(longitude / 0.25)::int            AS cell_x,
    date_trunc('month', acq_date)::date     AS month,
    satellite,
    sensor,
    count(*)                                AS hotspots,
    count(*) FILTER (WHERE conf_class <> 'l') AS hotspots_nominal_high,
    sum(frp)                                AS frp_sum
FROM hotspots
WHERE coalesce(fire_type, 0) = 0
GROUP BY 1, 2, 3, 4, 5;

CREATE UNIQUE INDEX IF NOT EXISTS monthly_grid_pk
    ON monthly_grid (cell_y, cell_x, month, satellite);

-- Refresh after each load (n8n runs this at the end of the daily workflow):
--   SELECT refresh_after_load();

-- Raw CSV bodies dropped here by n8n (one row per downloaded file / API response).
CREATE TABLE IF NOT EXISTS staging_csv (
    id          bigserial PRIMARY KEY,
    source      text NOT NULL,          -- URL without the MAP_KEY
    processing  text NOT NULL,          -- SP or NRT
    country     text,
    csv         text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
);

-- Parse every staged CSV into hotspots, log it in load_runs, and empty the staging table.
-- Columns are located by header name, so MODIS/VIIRS, country files and API responses all work.
CREATE OR REPLACE FUNCTION load_staged() RETURNS TABLE (source text, rows_in integer, rows_new integer)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE
    s       record;
    hdr     text[];
    hdr_line text;
    n_in    integer;
    n_new   integer;
BEGIN
    FOR s IN SELECT * FROM staging_csv ORDER BY id LOOP
        hdr_line := split_part(s.csv, E'\n', 1);
        IF hdr_line NOT LIKE 'latitude,%' THEN
            INSERT INTO load_runs (job, source, rows_in, rows_new, finished_at, status, message, run_id)
            VALUES ('load_staged', s.source, 0, 0, now(), 'error', left(s.csv, 300), s.run_id);
            DELETE FROM staging_csv WHERE id = s.id;
            source := s.source; rows_in := 0; rows_new := 0; RETURN NEXT;
            CONTINUE;
        END IF;
        hdr := string_to_array(btrim(hdr_line, E'\r '), ',');

        WITH lines AS (
            SELECT string_to_array(btrim(l, E'\r '), ',') AS f
            FROM string_to_table(s.csv, E'\n') WITH ORDINALITY AS t(l, i)
            WHERE i > 1 AND btrim(l, E'\r ') <> ''
        ), parsed AS (
            SELECT
                f[array_position(hdr, 'latitude')]::real                         AS latitude,
                f[array_position(hdr, 'longitude')]::real                        AS longitude,
                nullif(f[coalesce(array_position(hdr, 'brightness'),
                                  array_position(hdr, 'bright_ti4'))], '')::real  AS brightness,
                nullif(f[coalesce(array_position(hdr, 'bright_t31'),
                                  array_position(hdr, 'bright_ti5'))], '')::real  AS bright_2,
                nullif(f[array_position(hdr, 'scan')], '')::real                 AS scan,
                nullif(f[array_position(hdr, 'track')], '')::real                AS track,
                f[array_position(hdr, 'acq_date')]::date                         AS acq_date,
                f[array_position(hdr, 'acq_time')]::smallint                     AS acq_time,
                f[array_position(hdr, 'satellite')]                              AS sat_raw,
                f[array_position(hdr, 'instrument')]                             AS instrument,
                f[array_position(hdr, 'confidence')]                             AS confidence,
                f[array_position(hdr, 'version')]                                AS version,
                nullif(f[array_position(hdr, 'frp')], '')::real                  AS frp,
                f[array_position(hdr, 'daynight')]                               AS daynight,
                CASE WHEN array_position(hdr, 'type') IS NOT NULL
                     THEN nullif(f[array_position(hdr, 'type')], '')::smallint END AS fire_type
            FROM lines
        ), ins AS (
            INSERT INTO hotspots (sensor, satellite, acq_date, acq_time, latitude, longitude,
                                  brightness, bright_2, scan, track, confidence, conf_class,
                                  frp, daynight, fire_type, version, processing, country)
            SELECT
                CASE WHEN upper(instrument) = 'MODIS' THEN 'MODIS' ELSE 'VIIRS' END,
                CASE sat_raw WHEN 'T' THEN 'Terra' WHEN 'A' THEN 'Aqua'
                             WHEN 'N' THEN 'SNPP' WHEN '1' THEN 'NOAA20' WHEN 'N20' THEN 'NOAA20'
                             WHEN 'N21' THEN 'NOAA21' ELSE sat_raw END,
                acq_date, acq_time, latitude, longitude, brightness, bright_2, scan, track,
                confidence,
                CASE WHEN lower(confidence) IN ('l', 'low')     THEN 'l'
                     WHEN lower(confidence) IN ('h', 'high')    THEN 'h'
                     WHEN lower(confidence) IN ('n', 'nominal') THEN 'n'
                     WHEN confidence ~ '^\d+$' THEN
                          CASE WHEN confidence::int < 30 THEN 'l'
                               WHEN confidence::int < 80 THEN 'n' ELSE 'h' END
                     ELSE 'n' END,
                frp, daynight, fire_type, version, s.processing, s.country
            FROM parsed
            ON CONFLICT (satellite, acq_date, acq_time, latitude, longitude) DO NOTHING
            RETURNING 1
        )
        SELECT (SELECT count(*) FROM lines), (SELECT count(*) FROM ins) INTO n_in, n_new;

        INSERT INTO load_runs (job, source, rows_in, rows_new, finished_at, status, run_id)
        VALUES ('load_staged', s.source, n_in, n_new, now(), 'ok', s.run_id);
        DELETE FROM staging_csv WHERE id = s.id;

        source := s.source; rows_in := n_in; rows_new := n_new; RETURN NEXT;
    END LOOP;
END $$;

-- After any load: drop NRT rows that Standard Processing now covers, then rebuild the monthly grid.
CREATE OR REPLACE FUNCTION refresh_after_load() RETURNS TABLE (nrt_removed integer, grid_rows bigint)
LANGUAGE plpgsql AS $$
DECLARE
    removed integer;
BEGIN
    WITH sp_end AS (
        SELECT satellite, max(acq_date) AS last_sp FROM hotspots WHERE processing = 'SP' GROUP BY satellite
    ), del AS (
        DELETE FROM hotspots h USING sp_end e
        WHERE h.processing = 'NRT' AND h.satellite = e.satellite AND h.acq_date <= e.last_sp
        RETURNING 1
    )
    SELECT count(*) INTO removed FROM del;

    REFRESH MATERIALIZED VIEW monthly_grid;

    nrt_removed := removed;
    grid_rows := (SELECT count(*) FROM monthly_grid);
    RETURN NEXT;
END $$;

-- ============================================================================================
-- Pipeline run tracking (for a status page on the website)
-- ============================================================================================

-- One row per pipeline execution (daily NRT, historical backfill, ...).
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id               bigserial PRIMARY KEY,
    pipeline         text        NOT NULL,          -- 'daily_nrt', 'historical_backfill'
    trigger          text        NOT NULL,          -- 'schedule', 'manual'
    n8n_execution_id text,
    status           text        NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'success', 'partial', 'error')),
    started_at       timestamptz NOT NULL DEFAULT now(),
    finished_at      timestamptz,
    sources_expected integer,                       -- files / API calls planned
    sources_ok       integer,
    sources_error    integer,
    rows_in          bigint,
    rows_new         bigint,
    nrt_removed      integer,
    message          text
);
CREATE INDEX IF NOT EXISTS pipeline_runs_pipeline_idx ON pipeline_runs (pipeline, started_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_exec_idx ON pipeline_runs (n8n_execution_id);

-- Link each file/API load to its run.
ALTER TABLE load_runs   ADD COLUMN IF NOT EXISTS run_id bigint REFERENCES pipeline_runs (id);
ALTER TABLE staging_csv ADD COLUMN IF NOT EXISTS run_id bigint;
CREATE INDEX IF NOT EXISTS load_runs_run_idx ON load_runs (run_id);

-- Called by n8n right after the trigger. Returns the run id the rest of the workflow carries along.
CREATE OR REPLACE FUNCTION start_pipeline_run(p_pipeline text, p_trigger text, p_execution_id text)
RETURNS bigint LANGUAGE sql AS $$
    -- n8n execution modes: 'trigger' = schedule, 'manual'/'test' = run from the editor
    INSERT INTO pipeline_runs (pipeline, trigger, n8n_execution_id)
    VALUES (p_pipeline,
            CASE p_trigger WHEN 'trigger' THEN 'schedule' WHEN 'test' THEN 'manual' ELSE p_trigger END,
            p_execution_id)
    RETURNING id;
$$;

-- Called by n8n at the end. Totals come from load_runs; status is success / partial / error.
CREATE OR REPLACE FUNCTION finish_pipeline_run(p_run_id bigint, p_sources_expected integer,
                                               p_nrt_removed integer DEFAULT NULL)
RETURNS SETOF pipeline_runs LANGUAGE sql AS $$
    UPDATE pipeline_runs r SET
        finished_at      = now(),
        sources_expected = p_sources_expected,
        sources_ok       = t.ok,
        sources_error    = t.err,
        rows_in          = t.rows_in,
        rows_new         = t.rows_new,
        nrt_removed      = p_nrt_removed,
        status           = CASE WHEN t.err = 0 AND t.ok >= p_sources_expected THEN 'success'
                                WHEN t.ok = 0 THEN 'error'
                                ELSE 'partial' END,
        message          = CASE WHEN t.err > 0 THEN t.err || ' source(s) failed, see load_runs' END
    FROM (
        SELECT count(*) FILTER (WHERE status = 'ok')  AS ok,
               count(*) FILTER (WHERE status <> 'ok') AS err,
               coalesce(sum(rows_in), 0)  AS rows_in,
               coalesce(sum(rows_new), 0) AS rows_new
        FROM load_runs WHERE run_id = p_run_id
    ) t
    WHERE r.id = p_run_id
    RETURNING r.*;
$$;

-- Called by the n8n error workflow when an execution crashes.
CREATE OR REPLACE FUNCTION fail_pipeline_run(p_execution_id text, p_message text)
RETURNS SETOF pipeline_runs LANGUAGE sql AS $$
    UPDATE pipeline_runs SET status = 'error', finished_at = now(), message = left(p_message, 1000)
    WHERE n8n_execution_id = p_execution_id AND status = 'running'
    RETURNING *;
$$;

-- Latest run of each pipeline, with a derived health flag for the status page.
CREATE OR REPLACE VIEW pipeline_status AS
SELECT DISTINCT ON (pipeline)
    pipeline, id AS run_id, trigger, status, started_at, finished_at,
    extract(epoch FROM coalesce(finished_at, now()) - started_at)::int AS duration_s,
    sources_expected, sources_ok, sources_error, rows_new, message,
    CASE
        WHEN status = 'running' AND started_at < now() - interval '2 hours' THEN 'stalled'
        WHEN pipeline = 'daily_nrt' AND started_at < now() - interval '26 hours' THEN 'overdue'
        ELSE status
    END AS health
FROM pipeline_runs
ORDER BY pipeline, started_at DESC;

-- How fresh the data is, per satellite and processing level (rebuilt by refresh_after_load()).
CREATE MATERIALIZED VIEW IF NOT EXISTS data_freshness AS
SELECT satellite, sensor, processing,
       min(acq_date) AS first_date, max(acq_date) AS last_date,
       count(*) AS hotspots, max(loaded_at) AS last_loaded_at
FROM hotspots
GROUP BY satellite, sensor, processing;

-- Everything a status page needs, as one JSON document:  SELECT pipeline_status_json();
CREATE OR REPLACE FUNCTION pipeline_status_json() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'generated_at', now(),
        'pipelines',  coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.pipeline) FROM pipeline_status p), '[]'),
        'recent_runs', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC)
                                 FROM (SELECT id, pipeline, trigger, status, started_at, finished_at,
                                              sources_ok, sources_error, rows_new, message
                                       FROM pipeline_runs ORDER BY started_at DESC LIMIT 20) r), '[]'),
        'data', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.satellite, d.processing) FROM data_freshness d), '[]'),
        'totals', jsonb_build_object(
            'hotspots', (SELECT count(*) FROM hotspots),
            'first_date', (SELECT min(acq_date) FROM hotspots),
            'last_date',  (SELECT max(acq_date) FROM hotspots))
    );
$$;

-- Redefined here so it also rebuilds data_freshness (supersedes the earlier definition).
CREATE OR REPLACE FUNCTION refresh_after_load() RETURNS TABLE (nrt_removed integer, grid_rows bigint)
LANGUAGE plpgsql AS $$
DECLARE
    removed integer;
BEGIN
    WITH sp_end AS (
        SELECT satellite, max(acq_date) AS last_sp FROM hotspots WHERE processing = 'SP' GROUP BY satellite
    ), del AS (
        DELETE FROM hotspots h USING sp_end e
        WHERE h.processing = 'NRT' AND h.satellite = e.satellite AND h.acq_date <= e.last_sp
        RETURNING 1
    )
    SELECT count(*) INTO removed FROM del;

    REFRESH MATERIALIZED VIEW monthly_grid;
    REFRESH MATERIALIZED VIEW data_freshness;

    nrt_removed := removed;
    grid_rows := (SELECT count(*) FROM monthly_grid);
    RETURN NEXT;
END $$;

-- Normalise trigger names written before start_pipeline_run() mapped them.
UPDATE pipeline_runs SET trigger = 'manual' WHERE trigger = 'test';
UPDATE pipeline_runs SET trigger = 'schedule' WHERE trigger = 'trigger';
