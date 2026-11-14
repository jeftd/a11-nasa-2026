# web-hackathon

The deployed A11 site: the Burning Activity Calendar prototype (`public/index.html`, illustrative synthetic data) with the Ember assistant (`/api/chat` → n8n). The original placeholder page is at `/status.html`.

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
| `assistant.js`, `assistant.css` | `/` | Ember assistant sidebar (below) |
| `ember.js` | both | Ember mascot expression engine (gestures, blinking, eye-follow) |
| `status.html`, `app.js`, `styles.css` | `/status.html` | Original placeholder with server/assistant status and the old floating chat |

## Ember assistant sidebar

Pattern taken from erp-ai spec 047 ("Acompañante" companion panel).

- **Open/close:** "Ask Ember" in the top bar (`aria-expanded`, `aria-controls`). On desktop the panel is a third
  grid column that pushes the map (400 / map / 380 px; 340 / map / 340 px at ≤ 1360 px). At ≤ 900 px it is a
  fixed drawer with a backdrop; Esc or a click on the backdrop closes it and focus returns to the button.
- **Remembers state:** open/closed in `localStorage` (`a11.ember.open`, desktop only); the conversation and
  `sessionId` in `sessionStorage` (`a11.ember.log`, `a11-chat-session`) so a reload keeps the thread.
- **Header:** animated Ember whose gesture mirrors the conversation (ready, reading, thinking, still working,
  failed, offline, napping), New conversation (clears the log and starts a new `sessionId`) and Close.
- **"Viewing …" line and suggestions** follow what is on screen; the calendar exposes it through
  `window.A11Context()` and fires the `a11:context` event whenever the area or month changes.
- **Messages:** user bubbles, bot replies with safe Markdown (bold, italic, inline code, `-` bullets),
  typing indicator, "Try again" on errors, auto-growing composer (Enter sends, Shift+Enter new line).
- With the panel open at 901–1700 px the "Notable months" list in the bottom dock is hidden so both charts fit.

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
- Environment: `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`
- **Auto-deploy:** every push to `main` runs `.github/workflows/deploy.yml`, which calls the Easypanel
  deploy webhook stored in the repo secret `EASYPANEL_DEPLOY_WEBHOOK` (Easypanel → service → Deployments →
  Deploy Webhook). Keep Easypanel's own "Auto Deploy" off to avoid double deploys.

## Endpoints

| Path | Method | Purpose |
| --- | --- | --- |
| `/` | GET | Static site (`public/`) |
| `/api/chat` | POST | `{ message, sessionId }` → `{ reply, sessionId }` |
| `/health` | GET | Health check |
