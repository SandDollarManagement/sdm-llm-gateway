# SDM LLM Gateway

Self-hosted multi-provider LLM gateway for SDM Software apps. Routes calls through the Anthropic Agent SDK monthly credit first, then falls back to OpenAI, Gemini, xAI Grok, or OpenRouter automatically. One place to manage credentials, fallback rules, and per-app usage.

**Status:** Phase 0 complete. Phase 1 (skeleton + auth) ready to start with Claude Code on the server.

---

## Read these in order before changing anything

1. `CLAUDE.md` — project guidance, architecture, conventions, what NOT to do
2. `DECISION_LOG.md` — every architectural decision made and why
3. `OPEN_DECISIONS.md` — what's still unresolved
4. `PROJECT_STATE.md` — current phase, last action, blockers, next decision needed

---

## Stack

Matches existing SDM apps (Ops Hub, storyquest, Gmail-Drive-Manager):

- Next.js 14 (App Router) + React 18, JavaScript (no TypeScript)
- Postgres 16 via the `pg` driver, raw SQL through helper functions (no ORM)
- NextAuth + Google OAuth + `ADMIN_EMAILS` whitelist for admin auth
- Coolify on Hetzner VPS for deployment
- Three containers in the Coolify project: `gateway-web` (Next.js, public), `gateway-litellm` (LiteLLM proxy, internal), `gateway-db` (Postgres, internal)

---

## Domain and infrastructure

- **Public URL:** `https://llm.sanddollarmanagementllc.com`
- **Repo:** `github.com/SandDollarManagement/sdm-llm-gateway`
- **Hosting:** Coolify project `sdm-llm-gateway` on the apps server (NOT the CC server)
- **Database:** `gateway-db` Postgres container inside the Coolify project

---

## Env vars

See `.env.example` for the canonical list. Required at runtime:

| Var | Source |
|---|---|
| `ADMIN_EMAILS` | Comma-separated allowed Google login emails |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console OAuth 2.0 client |
| `NEXTAUTH_SECRET` | Generated, stored in Coolify env + 1Password |
| `NEXTAUTH_URL` | `https://llm.sanddollarmanagementllc.com` |
| `DATABASE_URL` | Postgres connection string (`postgresql://USER:PASS@gateway-db:5432/sdm_llm_gateway`) |
| `GATEWAY_ENCRYPTION_KEY` | Generated, stored in Coolify env + 1Password |
| `LITELLM_INTERNAL_URL` | `http://gateway-litellm:4000` |
| `LITELLM_MASTER_KEY` | Generated, stored in Coolify env + 1Password |

---

## How an app calls the gateway

OpenAI-compatible endpoint. Apps swap their existing OpenAI/Anthropic SDK base URL to the gateway and use a model alias (`default`, `reasoning`, `fast`, `vision`, `bulk-classify`) instead of a specific model name.

```javascript
import OpenAI from "openai";

const llm = new OpenAI({
  apiKey: process.env.SDM_GATEWAY_TOKEN,
  baseURL: "https://llm.sanddollarmanagementllc.com/v1",
});

const response = await llm.chat.completions.create({
  model: "default",
  messages: [{ role: "user", content: "Hello" }],
});
```

Per-app bearer tokens are issued in the gateway admin UI under Apps.

---

## Repo layout

See the **Repo Layout** section in `CLAUDE.md` for the canonical tree. Claude Code on the server scaffolds this in Phase 1.
