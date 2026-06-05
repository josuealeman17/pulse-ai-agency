# Pulse — AI Chatbot + Review Engine

Multi-tenant SaaS platform: an embeddable AI chat widget (Product A) and an email review-request engine (Product B). Built from `PRD_lumenlabs_review_engine.md`.

## Stack

- **Monorepo:** npm workspaces
- **API:** Hono + TypeScript (`packages/api`)
- **Widget:** React + Vite, compiled to a single embeddable `chat.js` (`packages/widget`)
- **Dashboard:** React + Vite (`packages/dashboard`) — Phase 4
- **Shared types/schema:** `packages/db`
- **AI:** Claude Haiku 4.5 · **DB/Auth:** Supabase · **Email:** Resend · **Booking:** Cal.com

## Setup

```bash
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY (Supabase optional in Phase 1)
```

## Run (Phase 1)

```bash
npm run dev:api      # API on http://localhost:8787
npm run dev:widget   # Widget dev harness on http://localhost:5173
```

Open the widget harness, click the chat bubble, and talk to the demo business.
Without Supabase configured, the API serves an in-memory **demo** client config
so the chat works end-to-end; add Supabase env vars to load real clients.

## Build the embeddable widget

```bash
npm run build:widget   # outputs packages/widget/dist/chat.js
```

Clients embed it with:

```html
<script
  src="https://widget.<your-domain>/chat.js"
  data-client-id="client_abc123"
  data-theme="light"
  data-accent="#2563EB"
  async
></script>
```

## Database

Apply `packages/db/schema.sql` in the Supabase SQL editor once a project exists.

## Build phases

See the PRD. Phase 1 (chat widget + Claude backend) is implemented; Phases 2–5
(booking, review engine, dashboard, deploy) follow at the PRD checkpoints.
