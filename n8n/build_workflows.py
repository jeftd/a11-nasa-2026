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
# Input item: { url, source, processing, country }. url may contain {KEY} for the FIRMS MAP_KEY.
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
        }, retryOnFail=True, maxTries=3, waitBetweenTries=5000),
        node("Shape row", "n8n-nodes-base.set", 3.4, [440, 0], {
            "assignments": {"assignments": [
                {"id": "a1", "name": "source", "type": "string",
                 "value": "={{ $('When called').item.json.source }}"},
                {"id": "a2", "name": "processing", "type": "string",
                 "value": "={{ $('When called').item.json.processing }}"},
                {"id": "a3", "name": "country", "type": "string",
                 "value": "={{ $('When called').item.json.country }}"},
                {"id": "a4", "name": "csv", "type": "string", "value": "={{ $json.data }}"},
            ]},
            "options": {},
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

CALL_LOADER = {
    "workflowId": {"__rl": True, "mode": "id", "value": "g8PK6cZ7WiIK8N3w"},
    "mode": "each",
    "options": {"waitForSubWorkflow": True},
}

# --- 3. Historical backfill (Mexico) ------------------------------------------------------------
BACKFILL_JS = r"""
// Mexico country yearly files (Standard Processing) + FIRMS Area API for the current year.
const COUNTRY = 'Mexico';
const BBOX = '-118.5,14.5,-86.7,32.8';
const DO_COUNTRY_FILES = true;
const DO_CURRENT_YEAR_API = true;

const items = [];
const base = 'https://firms.modaps.eosdis.nasa.gov/data/country';
const products = [['modis', 2000, 2025], ['viirs-snpp', 2012, 2025], ['viirs-jpss1', 2018, 2025]];
if (DO_COUNTRY_FILES) {
  for (const [p, y0, y1] of products) {
    for (let y = y0; y <= y1; y++) {
      const url = `${base}/${p}/${y}/${p}_${y}_${COUNTRY}.csv`;
      items.push({ url, source: url, processing: 'SP', country: COUNTRY });
    }
  }
}

if (DO_CURRENT_YEAR_API) {
  const api = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
  const sources = ['MODIS_SP', 'MODIS_NRT', 'VIIRS_NOAA20_SP', 'VIIRS_NOAA20_NRT',
                   'VIIRS_NOAA21_SP', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_SP', 'VIIRS_SNPP_NRT'];
  const today = new Date();
  for (let d = new Date(Date.UTC(today.getUTCFullYear(), 0, 1)); d <= today; d.setUTCDate(d.getUTCDate() + 5)) {
    const day = d.toISOString().slice(0, 10);
    for (const s of sources) {
      const path = `${s}/${BBOX}/5/${day}`;
      items.push({ url: `${api}/{KEY}/${path}`, source: `api:${path}`,
                   processing: s.endsWith('_SP') ? 'SP' : 'NRT', country: `${COUNTRY} (bbox)` });
    }
  }
}
return items.map(json => ({ json }));
"""

backfill = {
    "name": "A11 Historical backfill (Mexico)",
    "nodes": [
        node("Run once", "n8n-nodes-base.manualTrigger", 1, [0, 0], {}),
        node("List files", "n8n-nodes-base.code", 2, [220, 0], {"jsCode": BACKFILL_JS.strip()}),
        node("Load each", "n8n-nodes-base.executeWorkflow", 1.2, [440, 0], CALL_LOADER),
        pg_query("Refresh grid", [660, 0], "SELECT * FROM refresh_after_load();", executeOnce=True),
    ],
    "connections": link("Run once", "List files", "Load each", "Refresh grid"),
    "settings": {"executionOrder": "v1"},
}

# --- 4. Daily NRT -------------------------------------------------------------------------------
DAILY_JS = r"""
// Last 2 days of Near Real-Time hotspots over Mexico. Duplicates are ignored by the database.
const BBOX = '-118.5,14.5,-86.7,32.8';
const api = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
return ['MODIS_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'].map(s => ({ json: {
  url: `${api}/{KEY}/${s}/${BBOX}/2`,
  source: `api:${s}/${BBOX}/2@${new Date().toISOString().slice(0, 10)}`,
  processing: 'NRT',
  country: 'Mexico (bbox)',
}}));
"""

daily = {
    "name": "A11 Daily NRT (Mexico)",
    "nodes": [
        node("Every day 06:00", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 0],
             {"rule": {"interval": [{"triggerAtHour": 6}]}}),
        node("List sources", "n8n-nodes-base.code", 2, [220, 0], {"jsCode": DAILY_JS.strip()}),
        node("Load each", "n8n-nodes-base.executeWorkflow", 1.2, [440, 0], CALL_LOADER),
        pg_query("Refresh grid", [660, 0], "SELECT * FROM refresh_after_load();", executeOnce=True),
    ],
    "connections": link("Every day 06:00", "List sources", "Load each", "Refresh grid"),
    "settings": {"executionOrder": "v1"},
}

OUT.mkdir(exist_ok=True)
for fname, wf in [("01-db-setup.json", setup), ("02-load-firms-csv.json", loader),
                  ("03-historical-backfill.json", backfill), ("04-daily-nrt.json", daily)]:
    (OUT / fname).write_text(json.dumps(wf, indent=2), encoding="utf-8")
    print("wrote", fname)
