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
            INSERT INTO load_runs (job, source, rows_in, rows_new, finished_at, status, message)
            VALUES ('load_staged', s.source, 0, 0, now(), 'error', left(s.csv, 300));
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

        INSERT INTO load_runs (job, source, rows_in, rows_new, finished_at, status)
        VALUES ('load_staged', s.source, n_in, n_new, now(), 'ok');
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
