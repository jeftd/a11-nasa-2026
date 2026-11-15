# web-hackathon

The deployed A11 site: the Burning Activity Calendar prototype (`public/index.html`) with the Ember assistant (`/api/chat` → n8n). The original placeholder page is at `/status.html`.

The calendar loads its monthly series from `/api/harmonized/*`, which `server.js` reads from the `a11-db`
Postgres (SQL functions in `analysis/db/schema.sql`). Without a database it serves the fake files in
`public/data/harmonized/`. Flow and format: [DATA_CONTRACT.md](DATA_CONTRACT.md).

## Architecture

```
Browser ──POST /api/chat──▶ Node server (this folder, Easypanel)
                              │  adds X-Webhook-Secret
                              ▼
                       n8n webhook ──▶ AI Agent (MiniMax model) ──▶ reply
```

The browser never sees the n8n URL, the secret, or the model credentials.

## Files in `public/`

| File | Page | Purpose |
| --- | --- | --- |
| `index.html` | `/` | Burning Activity Calendar prototype (map, inspector tabs, 2001→2026 timeline, charts) |
| `harmonized.js` | `/` | Loads the series from `/api/harmonized/` (fallback `data/harmonized/`) and converts it for the calendar (the only code that knows the format) |
| `data/harmonized/` | `/` | Fake series used when there is no database, see `DATA_CONTRACT.md` |
| `assistant.js`, `assistant.css` | `/` | Ember assistant sidebar (below) |
| `fx.js`, `fx.css` | `/` | Motion layer: ember glow and sparks over the map hotspots, heat line, tab ink, chart and heatmap entrances, dark-mode reveal (all off with reduced motion) |
| `ember.js` | both | Ember mascot expression engine (gestures, blinking, eye-follow) |
| `status.html`, `app.js`, `styles.css` | `/status.html` | Original placeholder with server/assistant status and the old floating chat |

## Ember assistant sidebar

Pattern taken from erp-ai spec 047 ("Acompañante" companion panel).

- **Open/close:** "Ask Ember" in the top bar (`aria-expanded`, `aria-controls`). On desktop the panel is a third
  grid column that pushes the map (400 / map / 380 px; 340 / map / 340 px at ≤ 1360 px). Below that it is a
  fixed drawer over the map with a backdrop (≤ 1200 px); Esc or a click on the backdrop closes it and focus returns to the button.
- **Remembers state:** open/closed in `localStorage` (`a11.ember.open`, desktop only); the conversation and
  `sessionId` in `sessionStorage` (`a11.ember.log`, `a11-chat-session`) so a reload keeps the thread.
- **Header:** animated Ember whose gesture mirrors the conversation (ready, reading, thinking, still working,
  failed, offline, napping), New conversation (clears the log and starts a new `sessionId`) and Close.
- **"Viewing …" line and suggestions** follow what is on screen; the calendar exposes it through
  `window.A11Context()` and fires the `a11:context` event whenever the area or month changes.
- **Messages:** user bubbles, bot replies with safe Markdown (bold, italic, inline code, `-` bullets),
  typing indicator, "Try again" on errors, auto-growing composer (Enter sends, Shift+Enter new line).
- With the panel open at 1201–1700 px the "Notable months" list in the bottom dock is hidden so both charts fit.

### Context sent to the agent

Each message is the user's text plus an app-context line, so Ember can answer about the area and month on
screen (the whole payload is capped at 2,000 characters):

```
<question>

[App context — the user is viewing: Santiago, Nuevo León (municipality); March 2026; 412 hotspots;
category "Much above normal"; a typical month like this has about 191. The app currently shows illustrative data.]
```

The n8n agent receives this inside `message`; no change to the `/api/chat` contract was needed.

## Run locally

```bash
cp .env.example .env   # fill in values
node --env-file=.env server.js
```

Open http://localhost:3000.

## Deploy (Easypanel)

- Source: GitHub `leonardos4enz/a11-nasa-2026`, branch `main`, build path `/web-hackathon`
- Build: Dockerfile
- Port: 3000
- Environment: `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `DATABASE_URL`
  (`postgres://a11_web:<password>@learn_a11-db:5432/firms`; the read-only role `a11_web` is created by
  `schema.sql` without login — enable it once with `ALTER ROLE a11_web LOGIN PASSWORD '<password>';`)
- **Auto-deploy:** every push to `main` runs `.github/workflows/deploy.yml`, which calls the Easypanel
  deploy webhook stored in the repo secret `EASYPANEL_DEPLOY_WEBHOOK` (Easypanel → service → Deployments →
  Deploy Webhook). Keep Easypanel's own "Auto Deploy" off to avoid double deploys.

## Endpoints

| Path | Method | Purpose |
| --- | --- | --- |
| `/` | GET | Static site (`public/`) |
| `/api/chat` | POST | `{ message, sessionId }` → `{ reply, sessionId }` |
| `/api/harmonized/index` | GET | Harmonized data index (areas, data date, baseline) |
| `/api/harmonized/areas/<id>` | GET | Monthly harmonized series of one area |
| `/api/harmonized/polygon` | POST | `{ polygon: [[lat, lon], ...] }` → series for a drawn area |
| `/api/harmonized/raw` | POST | `{ area }` or `{ polygon }` → raw monthly counts per sensor (Method tab) |
| `/api/hotspots` | POST | `{ area or polygon, from, to, format: "csv" or "json" }` → individual detections (CSV download, map dots) |
| `/health` | GET | Health check (`chat`, `db` configured) |

## Preview without Node

```bash
py web-hackathon/dev_server.py 8771
```

Serves `public/`, proxies the existing API to https://emberatlas.ink and **mocks** `/api/hotspots` and
`/api/harmonized/raw` (invented numbers) until they are deployed.
