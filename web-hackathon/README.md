# web-hackathon

Deployment template for the A11 site. No hackathon content yet — it exists to lock in the deploy pipeline and the assistant backend before the real UI/UX and framework land.

## Architecture

```
Browser ──POST /api/chat──▶ Node server (this folder, Easypanel)
                              │  adds X-Webhook-Secret
                              ▼
                       n8n webhook ──▶ AI Agent (MiniMax model) ──▶ reply
```

The browser never sees the n8n URL, the secret, or the model credentials.

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
