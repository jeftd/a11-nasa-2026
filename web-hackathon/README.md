# web-hackathon

The deployed A11 site: the Burning Activity Calendar prototype (`public/index.html`) with the Ember assistant (`/api/chat` → n8n). The original placeholder page is at `/status.html`.

The calendar loads its monthly series from `/api/harmonized/*`, which `server.js` reads from the `a11-db`
Postgres (SQL functions in `analysis/db/schema.sql`). Without a database it serves the fake files in
`public/data/harmonized/`. Flow and format: [DATA_CONTRACT.md](DATA_CONTRACT.md).

## Architecture

```
Browser ──POST /api/chat { message }──▶ Node server (Easypanel) ── chat-agent.js (LangChain + MiniMax)
   ▲                                          │  memory: Postgres chat_messages (by sessionId)
   │◀── { reply, actions: [page tool calls] } ┘
   │  agent.js plays each action with the Ember cursor (real clicks/typing on the page)
   └──POST /api/chat { toolResults }──▶ the agent resumes, may act again, then { reply }
```

The browser never sees the model key. Page tools (search an area, set the month, tabs, layers, hotspot filter,
area around a point, theme, play) are declared in `chat-agent.js` and implemented in `public/agent.js`; tools that
run on the server go in `serverTools()`: today `search_docs`, the document search (RAG) over
[`knowledge/`](knowledge/) — see `rag.js`. `CHAT_BACKEND=n8n` switches back to the old
n8n webhook proxy.

**Memory compaction:** every message is kept in `chat_messages`, but when a conversation passes 30 messages or
~24k characters since its last summary, the older part is summarized into a `summary` row and the model gets only
that summary plus the last 10 messages (cut at a user message so tool calls stay with their results).

**Hallucination control:** low temperature (0.3); a GROUNDING section in the prompt (every figure, date or claim
must come from the App context, a tool result or a doc section; say "I don't have that" instead of guessing; ask when
ambiguous; only report actions whose result is `ok`); `search_docs` returns nothing below a similarity threshold;
and a **grounding check** before each reply: numbers in the reply that do not appear in the prompt, summary, user
messages, tool results or doc sections of the turn trigger one rewrite without them (logged as `grounding:`).

## Files in `public/`

| File | Page | Purpose |
| --- | --- | --- |
| `index.html` | `/` | Burning Activity Calendar prototype (map, inspector tabs, 2001→2026 timeline, charts) |
| `harmonized.js` | `/` | Loads the series from `/api/harmonized/` (fallback `data/harmonized/`) and converts it for the calendar (the only code that knows the format) |
| `data/harmonized/` | `/` | Fake series used when there is no database, see `DATA_CONTRACT.md` |
| `assistant.js`, `assistant.css` | `/` | Ember assistant sidebar (below) |
| `agent.js`, `agent.css` | `/` | Ember agent cursor: plays the page actions the agent returns (glowing frame, Stop bar, ripples) |
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

The agent receives this inside `message`.

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
- Environment: `LLM_API_KEY` (MiniMax key), optional `LLM_BASE_URL` / `LLM_MODEL`, `DATABASE_URL`
  (`postgres://a11_web:<password>@learn_a11-db:5432/firms`; the role `a11_web` is created by `schema.sql` without
  login — enable it once with `ALTER ROLE a11_web LOGIN PASSWORD '<password>';`). It reads the data and appends to
  `chat_messages` (the agent memory, `analysis/db/chat_memory.sql`). Old backend: `CHAT_BACKEND=n8n`,
  `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`. Document search: `OPENAI_API_KEY` (embeddings; vectors in
  `rag_chunks`, `analysis/db/rag.sql`). See `.env.example`.
- **Auto-deploy:** every push to `main` runs `.github/workflows/deploy.yml`, which calls the Easypanel
  deploy webhook stored in the repo secret `EASYPANEL_DEPLOY_WEBHOOK` (Easypanel → service → Deployments →
  Deploy Webhook). Keep Easypanel's own "Auto Deploy" off to avoid double deploys.

## Endpoints

| Path | Method | Purpose |
| --- | --- | --- |
| `/` | GET | Static site (`public/`) |
| `/api/chat` | POST | `{ message, sessionId }` or `{ toolResults, sessionId }` → `{ reply, actions, sessionId }` |
| `/api/harmonized/index` | GET | Harmonized data index (areas, data date, baseline) |
| `/api/harmonized/areas/<id>` | GET | Monthly harmonized series of one area |
| `/api/harmonized/polygon` | POST | `{ polygon: [[lat, lon], ...] }` → series for a drawn area |
| `/api/harmonized/raw` | POST | `{ area }` or `{ polygon }` → raw monthly counts per sensor (Method tab) |
| `/api/hotspots` | POST | `{ area or polygon, from, to, format: "csv" or "json" }` → individual detections (CSV download, map dots) |
| `/health` | GET | Health check (`chat` backend, `memory` store, `rag` index status, `db` configured) |

## Preview without Node

```bash
py web-hackathon/dev_server.py 8771
```

Serves `public/`, proxies the existing API to https://emberatlas.ink and **mocks** `/api/hotspots` and
`/api/harmonized/raw` (invented numbers) until they are deployed. It also mocks `/api/chat` with scripted page
actions ("busca Santiago y pon abril 2024", "season tab", "dark mode", "demo") to test the agent cursor without a model.
