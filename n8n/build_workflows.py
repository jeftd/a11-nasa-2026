"""
Generate the n8n workflow JSON files for the A11 FIRMS pipeline.

Output: n8n/workflows/*.json (importable in n8n: Workflows > Import from file).
The sub-workflow id of "A11 Load FIRMS CSV" must be set in the two parent workflows after import
(the placeholder is SUBWORKFLOW_ID).

Usage:
  python n8n/build_workflows.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "workflows"
SCHEMA = (HERE.parent / "analysis" / "db" / "schema.sql").read_text(encoding="utf-8")

PG_CRED = {"postgres": {"id": "vc9QesVEe9bgweDY", "name": "a11-db"}}
SETTINGS_QUIET = {
    "executionOrder": "v1",
    "saveDataSuccessExecution": "none",
    "saveDataErrorExecution": "all",
    "saveManualExecutions": False,
}


def node(name, type_, version, pos, params, **extra):
    n = {"parameters": params, "name": name, "type": type_, "typeVersion": version, "position": pos}
    n.update(extra)
    return n


def link(*names):
    conns = {}
    for a, b in zip(names, names[1:]):
        conns[a] = {"main": [[{"node": b, "type": "main", "index": 0}]]}
    return conns


def pg_query(name, pos, sql, **extra):
    if "{{" in sql:  # n8n treats a parameter as an expression only when it starts with "="
        sql = "=" + sql
    return node(name, "n8n-nodes-base.postgres", 2.5, pos,
                {"operation": "executeQuery", "query": sql, "options": {}},
                credentials=PG_CRED, **extra)


# --- 1. Setup: apply schema.sql once (idempotent) ---------------------------------------------
setup = {
    "name": "A11 DB setup (schema)",
    "nodes": [
        node("Run once", "n8n-nodes-base.manualTrigger", 1, [0, 0], {}),
        pg_query("Apply schema.sql", [220, 0], SCHEMA),
    ],
    "connections": link("Run once", "Apply schema.sql"),
    "settings": {"executionOrder": "v1"},
}

# --- 2. Sub-workflow: download one CSV and load it ----------------------------------------------
# Input item: { url, source, processing, country, run_id }. url may contain {KEY} for the FIRMS MAP_KEY.
loader = {
    "name": "A11 Load FIRMS CSV",
    "nodes": [
        node("When called", "n8n-nodes-base.executeWorkflowTrigger", 1.1, [0, 0],
             {"inputSource": "passthrough"}),
        node("Download CSV", "n8n-nodes-base.httpRequest", 4.2, [220, 0], {
            "url": "={{ $json.url.replace('{KEY}', $env.FIRMS_MAP_KEY) }}",
            "options": {
                "response": {"response": {"responseFormat": "text", "outputPropertyName": "data"}},
                "timeout": 180000,
            },
        }, retryOnFail=True, maxTries=3, waitBetweenTries=5000, onError="continueRegularOutput"),
        node("Shape row", "n8n-nodes-base.set", 3.4, [440, 0], {
            "assignments": {"assignments": [
                {"id": "a1", "name": "source", "type": "string",
                 "value": "={{ $('When called').item.json.source }}"},
                {"id": "a2", "name": "processing", "type": "string",
                 "value": "={{ $('When called').item.json.processing }}"},
                {"id": "a3", "name": "country", "type": "string",
                 "value": "={{ $('When called').item.json.country }}"},
                # A failed download is staged as an error text; load_staged() logs it as status 'error'.
                {"id": "a4", "name": "csv", "type": "string",
                 "value": "={{ $json.data ?? ('DOWNLOAD ERROR ' + JSON.stringify($json.error ?? $json)) }}"},
                {"id": "a5", "name": "run_id", "type": "number",
                 "value": "={{ $('When called').item.json.run_id ?? null }}"},
            ]},
            "options": {"ignoreConversionErrors": True},
        }),
        node("Stage CSV", "n8n-nodes-base.postgres", 2.5, [660, 0], {
            "schema": {"__rl": True, "mode": "list", "value": "public"},
            "table": {"__rl": True, "mode": "name", "value": "staging_csv"},
            "columns": {"mappingMode": "autoMapInputData", "value": {}, "matchingColumns": [], "schema": []},
            "options": {},
        }, credentials=PG_CRED),
        pg_query("Parse into hotspots", [880, 0], "SELECT * FROM load_staged();", executeOnce=True),
    ],
    "connections": link("When called", "Download CSV", "Shape row", "Stage CSV", "Parse into hotspots"),
    "settings": SETTINGS_QUIET,
}

def start_run(pipeline, pos):
    sql = (f"SELECT start_pipeline_run('{pipeline}', '{{{{ $execution.mode }}}}', "
           "'{{ $execution.id }}') AS run_id;")
    return pg_query("Start run", pos, sql, executeOnce=True)


def finish_run(list_node, pos):
    sql = ("SELECT * FROM finish_pipeline_run({{ $('Start run').first().json.run_id }}, "
           f"{{{{ $('{list_node}').all().length }}}}, {{{{ $json.nrt_removed ?? 'NULL' }}}});")
    return pg_query("Finish run", pos, sql, executeOnce=True)


RUN_ID_JS = "const runId = $('Start run').first().json.run_id;\n"

CALL_LOADER = {
    "workflowId": {"__rl": True, "mode": "id", "value": "g8PK6cZ7WiIK8N3w"},
    "mode": "each",
    "options": {"waitForSubWorkflow": True},
}

# --- 3. Historical backfill (one workflow per country) ------------------------------------------
BACKFILL_JS = r"""
// __COUNTRY__ country yearly files (Standard Processing) + FIRMS Area API for the current year.
const COUNTRY = '__COUNTRY__';
const BBOXES = __BBOXES__;
const DO_COUNTRY_FILES = true;
const DO_CURRENT_YEAR_API = true;

const items = [];
const base = 'https://firms.modaps.eosdis.nasa.gov/data/country';
const products = __PRODUCTS__;
if (DO_COUNTRY_FILES) {
  for (const [p, y0, y1] of products) {
    for (let y = y0; y <= y1; y++) {
      const url = `${base}/${p}/${y}/${p}_${y}_${COUNTRY}.csv`;
      items.push({ url, source: url, processing: 'SP', country: COUNTRY, run_id: runId });
    }
  }
}

if (DO_CURRENT_YEAR_API) {
  const api = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
  const sources = __SOURCES__;
  const today = new Date();
  for (const BBOX of BBOXES) {
    for (let d = new Date(Date.UTC(today.getUTCFullYear(), 0, 1)); d <= today; d.setUTCDate(d.getUTCDate() + 5)) {
      const day = d.toISOString().slice(0, 10);
      for (const s of sources) {
        const path = `${s}/${BBOX}/5/${day}`;
        items.push({ url: `${api}/{KEY}/${path}`, source: `api:${path}`,
                     processing: s.endsWith('_SP') ? 'SP' : 'NRT', country: `${COUNTRY} (bbox)`,
                     run_id: runId });
      }
    }
  }
}
return items.map(json => ({ json }));
"""


def backfill_wf(title, pipeline, country, bboxes, products, sources):
    js = (BACKFILL_JS.replace("__COUNTRY__", country).replace("__BBOXES__", json.dumps(bboxes))
          .replace("__PRODUCTS__", json.dumps(products)).replace("__SOURCES__", json.dumps(sources)))
    return {
        "name": title,
        "nodes": [
            node("Run once", "n8n-nodes-base.manualTrigger", 1, [0, 0], {}),
            start_run(pipeline, [220, 0]),
            node("List files", "n8n-nodes-base.code", 2, [440, 0], {"jsCode": RUN_ID_JS + js.strip()}),
            node("Load each", "n8n-nodes-base.executeWorkflow", 1.2, [660, 0], CALL_LOADER),
            pg_query("Refresh grid", [880, 0], "SELECT * FROM refresh_after_load();", executeOnce=True),
            finish_run("List files", [1100, 0]),
        ],
        "connections": link("Run once", "Start run", "List files", "Load each", "Refresh grid", "Finish run"),
        "settings": {"executionOrder": "v1", "errorWorkflow": "o8c3nl6MRhfGfRqL"},
    }


MX_BBOX = "-118.5,14.5,-86.7,32.8"
# Contiguous US + Alaska. S-NPP is left out for the US: the harmonized series uses MODIS and NOAA-20 only,
# and skipping it halves the volume (US files are ~2x Mexico's).
US_BBOXES = ["-125,24.4,-66.9,49.5", "-170,51,-129.9,71.5"]

backfill = backfill_wf("A11 Historical backfill (Mexico)", "historical_backfill", "Mexico", [MX_BBOX],
                       [["modis", 2000, 2025], ["viirs-snpp", 2012, 2025], ["viirs-jpss1", 2018, 2025]],
                       ["MODIS_SP", "MODIS_NRT", "VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT",
                        "VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"])
backfill_us = backfill_wf("A11 Historical backfill (United States)", "historical_backfill_us", "United_States",
                          US_BBOXES, [["modis", 2000, 2025], ["viirs-jpss1", 2018, 2025]],
                          ["MODIS_SP", "MODIS_NRT", "VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT",
                           "VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT"])

# --- 4. Daily NRT -------------------------------------------------------------------------------
DAILY_JS = r"""
// Last 2 days of Near Real-Time hotspots over Mexico and the United States. Duplicates are ignored by the database.
const REGIONS = [['Mexico (bbox)', '-118.5,14.5,-86.7,32.8'],
                 ['United_States (bbox)', '-125,24.4,-66.9,49.5'],
                 ['United_States (bbox)', '-170,51,-129.9,71.5']];
const api = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
const day = new Date().toISOString().slice(0, 10);
return REGIONS.flatMap(([country, BBOX]) => ['MODIS_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'].map(s => ({ json: {
  url: `${api}/{KEY}/${s}/${BBOX}/2`,
  source: `api:${s}/${BBOX}/2@${day}`,
  processing: 'NRT',
  country,
  run_id: runId,
}})));
"""

daily = {
    "name": "A11 Daily NRT (Mexico + US)",
    "nodes": [
        node("Every day 06:00", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 0],
             {"rule": {"interval": [{"triggerAtHour": 6}]}}),
        start_run("daily_nrt", [220, 0]),
        node("List sources", "n8n-nodes-base.code", 2, [440, 0], {"jsCode": RUN_ID_JS + DAILY_JS.strip()}),
        node("Load each", "n8n-nodes-base.executeWorkflow", 1.2, [660, 0], CALL_LOADER),
        pg_query("Refresh grid", [880, 0], "SELECT * FROM refresh_after_load();", executeOnce=True),
        finish_run("List sources", [1100, 0]),
    ],
    "connections": link("Every day 06:00", "Start run", "List sources", "Load each", "Refresh grid", "Finish run"),
    "settings": {"executionOrder": "v1", "errorWorkflow": "o8c3nl6MRhfGfRqL"},
}

# --- 5. DB status (manual check) ---------------------------------------------------------------
STATUS_SQL = """SELECT 'hotspots' AS what, satellite || ' ' || processing AS k, min(acq_date)::text AS from_date,
       max(acq_date)::text AS to_date, count(*) AS n FROM hotspots GROUP BY 2
UNION ALL SELECT 'load_runs', status, min(finished_at)::text, max(finished_at)::text, count(*) FROM load_runs GROUP BY 2
UNION ALL SELECT 'staging', 'pending', null, null, count(*) FROM staging_csv
UNION ALL SELECT 'grid', 'rows', null, null, count(*) FROM monthly_grid
ORDER BY 1, 2;"""

# What the website's /api/harmonized endpoints would return (summarised), and how long each area takes.
HARMONIZED_SQL = """SELECT harmonized_index_json() - 'areas' AS index,
       (SELECT jsonb_agg(jsonb_build_object(
            'id', a.id,
            'months', jsonb_array_length(j -> 'months'),
            'first', j -> 'months' -> 0,
            'last', j -> 'months' -> -1,
            'year_totals', (SELECT jsonb_object_agg(y, n) FROM (
                 SELECT left(m ->> 'month', 4) AS y, sum((m ->> 'count')::int) AS n
                 FROM jsonb_array_elements(j -> 'months') m GROUP BY 1 ORDER BY 1) t)))
        FROM areas a, LATERAL (SELECT harmonized_area_json(a.id) AS j) x) AS areas;"""

status = {
    "name": "A11 DB status",
    "nodes": [
        node("Run", "n8n-nodes-base.manualTrigger", 1, [0, 0], {}),
        pg_query("Status", [220, -200], STATUS_SQL),
        pg_query("Pipeline status", [220, 0], "SELECT pipeline_status_json() AS status;"),
        pg_query("Errors", [220, 200],
                 "SELECT id, run_id, source, message FROM load_runs WHERE status <> 'ok' ORDER BY id DESC LIMIT 20;"),
        pg_query("Harmonized", [220, 400], HARMONIZED_SQL),
        pg_query("Web role", [220, 600], "SELECT rolname, rolcanlogin, rolpassword IS NOT NULL AS has_password "
                                         "FROM pg_authid WHERE rolname = 'a11_web';"),
    ],
    "connections": {"Run": {"main": [[{"node": n, "type": "main", "index": 0}
                                       for n in ("Status", "Pipeline status", "Errors", "Harmonized", "Web role")]]}},
    "settings": {"executionOrder": "v1"},
}

# --- 6. Error handler: marks the pipeline run as failed when a parent workflow crashes ------------
errors = {
    "name": "A11 Pipeline error handler",
    "nodes": [
        node("On workflow error", "n8n-nodes-base.errorTrigger", 1, [0, 0], {}),
        pg_query("Mark run failed", [220, 0],
                 "SELECT * FROM fail_pipeline_run('{{ $json.execution.id }}', "
                 "$msg${{ $json.execution.lastNodeExecuted }}: {{ $json.execution.error.message }}$msg$);"),
    ],
    "connections": link("On workflow error", "Mark run failed"),
    "settings": {"executionOrder": "v1"},
}

OUT.mkdir(exist_ok=True)
for fname, wf in [("01-db-setup.json", setup), ("02-load-firms-csv.json", loader),
                  ("03-historical-backfill.json", backfill), ("04-daily-nrt.json", daily),
                  ("07-historical-backfill-us.json", backfill_us),
                  ("05-db-status.json", status), ("06-pipeline-error-handler.json", errors)]:
    (OUT / fname).write_text(json.dumps(wf, indent=2), encoding="utf-8")
    print("wrote", fname)
