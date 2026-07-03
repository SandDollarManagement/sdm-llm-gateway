# SYSTEM_MAP — sdm-llm-gateway

Shared LLM gateway for all SDM Software applications. Next.js 14 (App Router,
JavaScript) wrapper over LiteLLM Proxy + Postgres, deployed on Coolify at
`llm.sanddollarmanagementllc.com`. Phase 0 and the full Phase 2–5 build are
complete in `main`; Phase 6 (consumer-app migration) is the next planned work.

---

## 1. Routes / endpoints

### LLM API — app-to-gateway (bearer token auth)

| Path | Methods | Auth | Input schema | Purpose |
|---|---|---|---|---|
| `/v1/chat/completions` | POST | Bearer token (`authenticateAppRequest`) | `{ model: string, messages: array, stream?: bool }` | OpenAI-compatible completions. `model` is an alias name, not a real model. Supports SSE streaming when `stream: true`. |
| `/v1/messages` | POST | Bearer token (`authenticateAppRequest`) | Anthropic Messages API shape; `model` is alias | Anthropic-compatible completions. Non-streaming path is a faithful passthrough to Anthropic (tools, cache_control, structured content preserved — D-022). Streaming translates Anthropic SSE events. Currently requires an `anthropic / api_key` entry in the alias chain. |

**Bearer token extraction:** `Authorization: Bearer <token>` or `x-api-key: <token>` (both supported for OpenAI and Anthropic SDK compat).

**Fallback trigger conditions:** HTTP 5xx, network error, 429 with retry-after > 10s, 401/403 (+ operator alert), Anthropic OAuth credit exhausted (402), timeout > 60s. Every fallback is logged with reason and position in chain.

### Admin API (admin-session auth via `requireAdmin`)

All routes under `/api/admin/*` call `requireAdmin()`, which calls `getServerSession()` and enforces the `ADMIN_EMAILS` whitelist. No anonymous access.

| Path | Methods | Purpose |
|---|---|---|
| `/api/admin/providers` | GET, POST | List all providers (no credential decryption); create new provider |
| `/api/admin/providers/[id]` | PATCH, DELETE | Update credentials / `base_url` / `enabled`; delete provider |
| `/api/admin/aliases` | GET, POST | List aliases with `fallback_chain`; create alias |
| `/api/admin/aliases/[id]` | PATCH, DELETE | Update `description` / `fallback_chain`; delete alias |
| `/api/admin/aliases/[id]/test` | POST | Smoke-test alias: fires `"Say hi in 5 words."` through full fallback chain, returns which provider answered + latency |
| `/api/admin/apps` | GET, POST | List registered apps; create app + return plaintext bearer token once |
| `/api/admin/apps/[id]` | PATCH, DELETE | Update name / `default_alias` / `monthly_budget_usd` / `enabled`; delete app |
| `/api/admin/apps/[id]/rotate-token` | POST | Rotate bearer token; old token revoked immediately, new plaintext returned once |
| `/api/admin/logs` | GET | Paginated call logs with optional filters (app, alias, provider, status, date range). Max 500 rows. |
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handler (Google OAuth + JWT session) |

### Middleware (page-level auth)

`src/middleware.js` uses NextAuth's built-in middleware to redirect unauthenticated requests to `/login` for all admin pages:
`/dashboard`, `/providers`, `/aliases`, `/apps`, `/usage`, `/logs`, `/settings`.

---

## 2. Pages / UI surfaces

All admin pages are server-rendered. Layout: `AdminShell` wraps every page with a sidebar nav and dark-mode shell. The root page (`/`) redirects authenticated users to `/dashboard` and unauthenticated users to `/login`.

| Path | Layout pattern | Key components | Key data sources |
|---|---|---|---|
| `/` | Redirect | — | `getServerSession` → redirect |
| `/login` | Auth / standalone | `signIn('google')` | NextAuth session status |
| `/dashboard` | Stats summary | `AdminShell`, `lucide-react` icons, `recharts` (inline) | `call_logs` (today's totals, provider/alias breakdown, app totals, recent errors) direct DB queries |
| `/providers` | List + CRUD | `AdminShell`, `ProvidersClient` | `GET /api/admin/providers` (initial SSR, then client mutations) |
| `/aliases` | List + CRUD | `AdminShell`, `AliasesClient` | `GET /api/admin/aliases` + providers list for chain builder |
| `/apps` | List + CRUD | `AdminShell`, `AppsClient` | `GET /api/admin/apps` |
| `/usage` | Chart dashboard | `AdminShell`, `UsageClient`, `recharts` | `call_logs` + `monthly_usage`: 30-day daily chart, by-provider, by-alias, totals |
| `/logs` | Paginated table | `AdminShell`, `LogsClient` | `GET /api/admin/logs` (initial 100 rows SSR); `apps`, `aliases`, `providers` for filter dropdowns |
| `/settings` | Status / read-only | `AdminShell`, env-check display | `process.env` reads + `getServerSession` |

---

## 3. Background jobs / scheduled tasks

No scheduled jobs, cron, or queue infrastructure exists in this project at this time. The `monthly_usage` table is described in CLAUDE.md as "rolled up from `call_logs` nightly" but no rollup job is implemented in the codebase. This is a known gap.

**Container bootstrap** (not a recurring job): `scripts/docker-entrypoint.sh` runs once at container start. If `/app/.claude/.credentials.json` is absent and `ANTHROPIC_OAUTH_TOKEN` is set, it writes the credentials file (mode 600) so the `claude` CLI binary can use the Max plan OAuth token.

---

## 4. External services

| Service | Path / method | Wrapper module | Used by |
|---|---|---|---|
| **Anthropic Messages API** (`https://api.anthropic.com`) | Direct HTTPS POST `/v1/messages` | `src/lib/providers/anthropic-api.js` — `callAnthropicViaApiKey`, `callAnthropicMessagesRaw`, `streamAnthropicViaApiKey` | `src/lib/routing/execute-call.js`, `src/app/v1/messages/route.js` |
| **Anthropic `claude` CLI** (Max plan subscription credit) | Child process `spawn('claude', ['--print', ...])` | `src/lib/providers/anthropic-claude-cli.js` — `callAnthropicViaClaudeCli` | `src/lib/routing/execute-call.js` |
| **LiteLLM Proxy** (`http://gateway-litellm:4000`, internal Docker network) | HTTP POST `/v1/chat/completions` | `src/lib/providers/litellm.js` — `callViaLiteLLM` | `src/lib/routing/execute-call.js` |
| **Google OAuth** (via NextAuth `GoogleProvider`) | OAuth redirect flow | `src/lib/auth.js` (`authOptions`) | `src/app/api/auth/[...nextauth]/route.js`, `src/middleware.js`, all admin pages |
| **Postgres** (`gateway-db:5432`, internal Docker network) | `pg` pool | `src/lib/db.js` | All API routes, all page data loaders |

**Providers handled by LiteLLM** (no direct wrapper in this repo — credentials are passed per-request from the gateway's DB): OpenAI, Google Gemini, xAI Grok, OpenRouter.

---

## 5. Tables / data model

Database: `sdm_llm_gateway` Postgres 16. All domain tables have `workspace_id uuid REFERENCES workspaces(id)`. No soft-delete columns. Single workspace (`id = 00000000-0000-0000-0000-000000000001`) seeded in `007_seed.sql`.

| Table | Purpose | FK references | Soft-delete | Tenant scoping |
|---|---|---|---|---|
| `workspaces` | Multi-tenancy anchor. Single row in current deployment. | — | No | — |
| `providers` | LLM provider credentials (`oauth` or `api_key`). `credentials` column is AES-256-GCM encrypted. Unique on `(workspace_id, name, auth_type)`. | `workspace_id → workspaces.id` | No | `workspace_id` |
| `aliases` | Named model aliases mapping to fallback chains. `fallback_chain` is a `jsonb` array of `{ provider_id, model, priority }`. Unique on `(workspace_id, name)`. | `workspace_id → workspaces.id` | No | `workspace_id` |
| `apps` | Registered consumer apps. Bearer token stored as SHA-256 hash (`token_hash`). `monthly_budget_usd` is optional cap. | `workspace_id → workspaces.id` | No | `workspace_id` |
| `call_logs` | One row per LLM call. Includes `fallback_position`, latency, token counts, cost. Request/response bodies NOT stored by default. `app_id` and `provider_id` use `ON DELETE SET NULL`. | `workspace_id → workspaces.id`, `app_id → apps.id`, `provider_id → providers.id` | No | `workspace_id` |
| `monthly_usage` | Rolled-up monthly tokens and cost per provider per auth method. Used by OAuth budget logic. Unique on `(workspace_id, provider_id, auth_method, month)`. | `workspace_id → workspaces.id`, `provider_id → providers.id` | No | `workspace_id` |

**Indexes:** `call_logs` has composite indexes on `(workspace_id, created_at DESC)`, `(app_id, created_at DESC)`, `(provider_id, created_at DESC)`.

---

## 6. Env vars / configuration

Source: `/root/projects/sdm-llm-gateway/.env.example`

| Variable | Used by | Deploy status |
|---|---|---|
| `ADMIN_EMAILS` | `src/lib/auth.js:37`, `src/lib/admin-auth.js:22` | Required |
| `GOOGLE_CLIENT_ID` | `src/lib/auth.js:12` | Required |
| `GOOGLE_CLIENT_SECRET` | `src/lib/auth.js:13` | Required |
| `NEXTAUTH_SECRET` | NextAuth internal (JWT signing) | Required |
| `NEXTAUTH_URL` | NextAuth internal (redirect URIs) | Required (`https://llm.sanddollarmanagementllc.com`) |
| `DATABASE_URL` | `src/lib/db.js` (pg Pool) | Required |
| `GATEWAY_ENCRYPTION_KEY` | `src/lib/crypto.js` (AES-256-GCM) | Required — 32-byte hex; backed up in 1Password (D-016) |
| `LITELLM_INTERNAL_URL` | `src/lib/providers/litellm.js:43` | Required for non-Anthropic providers (default: `http://gateway-litellm:4000`) |
| `LITELLM_MASTER_KEY` | `src/lib/providers/litellm.js:44` | Required for non-Anthropic providers |
| `NEXT_PUBLIC_GATEWAY_URL` | Client-side display | Optional with default |
| `ANTHROPIC_OAUTH_TOKEN` | `scripts/docker-entrypoint.sh` → `/app/.claude/.credentials.json` | Optional — Max plan OAuth path (D-020/D-021); OAuth path disabled by default (API key is primary per D-021) |
| `NODE_ENV` | Next.js standard | Required (`production`) |
| `CLAUDE_BIN` | `src/lib/providers/anthropic-claude-cli.js:14` | Optional — defaults to `claude` on PATH |

---

## 7. Subagents

All agents are in `/root/projects/sdm-llm-gateway/.claude/agents/`.

| Name | Trigger | Bug class / job |
|---|---|---|
| `cross-page-consistency-checker` | Manual / PR adds or modifies a detail page | Flags structural drift between peer admin pages — tab vs collapsible, action-bar shape, header pattern |
| `degradation-tester` | Manual / PR integrates or modifies an external-service wrapper | Audits every outbound call site for failure-mode handling: timeout, 401, 429, 5xx, network error |
| `flow-simulator` | Manual / PR adds or modifies UI fetch calls or API routes | Traces a user-flow click-through from button → fetch → route → auth → response → render; catches UI-to-API contract gaps |
| `schema-drift-checker` | Manual / PR containing SQL keywords in source files | Verifies every column referenced in embedded SQL actually exists in the composed migration schema |
| `schema-migration-validator` | Manual / before any migration is committed | Validates migration files for idempotency, self-containment, and project migration conventions |

---

## 8. CI gates

No `.github/workflows/` directory exists. CI is not configured. Build validation (`npm run build`) has been verified manually per sprint notes. This is a known gap.

---

## 9. Recent decisions

From `DECISION_LOG.md` (D-001 through D-022):

| ID | Date | Title |
|---|---|---|
| D-022 | 2026-06-13 | `/v1/messages` (non-streaming) is a faithful Anthropic passthrough |
| D-021 | 2026-06-01 | Anthropic API key is primary; OAuth path retained but disabled by default |
| D-020 | 2026-05-29 | Anthropic subscription credit path is the `claude` CLI binary, not the Messages API |
| D-019 | 2026-05-29 | Auth: NextAuth + Google OAuth + `ADMIN_EMAILS` whitelist |
| D-018 | 2026-05-29 | Language: JavaScript, not TypeScript |
| D-017 | 2026-05-29 | Database: Postgres container in Coolify, not Supabase |
| D-016 | 2026-05-19 | Encryption key backup: Coolify env + 1Password |
| D-015 | — | Superseded by D-017 |
| D-014 | 2026-05-19 | Public domain: `llm.sanddollarmanagementllc.com` |
| D-013 | 2026-05-19 | Repo and service name: `sdm-llm-gateway` |
| D-012 | 2026-05-19 | `workspace_id` column on every domain table |
| D-011 | 2026-05-19 | Five default aliases: `default`, `reasoning`, `fast`, `vision`, `bulk-classify` |
| D-010 | 2026-05-19 | Five V1 providers: Anthropic, OpenAI, Gemini, xAI Grok, OpenRouter |

*(D-001 through D-009 and full text: see `DECISION_LOG.md`.)*

---

## 10. Known issues / closed items

From `KNOWN_GAPS.md` (stub, no entries) and cross-referencing code vs. CLAUDE.md spec:

| ID | Description | Status |
|---|---|---|
| — | `monthly_usage` rollup job not implemented. CLAUDE.md says "rolled up from `call_logs` nightly" but no scheduler, cron, or background job exists in the codebase. | OPEN |
| — | No CI / GitHub Actions configured. Build validation is manual. | OPEN |
| — | Verbose mode (per-app body capture with auto-disable) described in CLAUDE.md but not visible in current source. | Unverified |
| — | Per-app monthly budget enforcement (return 429 when cap exceeded) described in CLAUDE.md but not verified in routing code. | Unverified |
| — | OAuth token expiry warning (30-day admin UI alert, OD-001) not implemented. | OPEN (blocks Phase 4 complete) |
| — | Phase 6 (consumer-app migration: Ops Hub, Media Manager, etc.) not started. | OPEN |
| D-006 | Supabase dedicated project — **CLOSED / SUPERSEDED** by D-017 (Postgres on Coolify). | CLOSED |
| D-007 | `requireOperator()` + `OPERATOR_EMAIL` — **CLOSED / SUPERSEDED** by D-019 (NextAuth + ADMIN_EMAILS). | CLOSED |
| D-015 | Supabase project `sdm-llm-gateway` — **CLOSED / SUPERSEDED** by D-017. | CLOSED |

---

## Model aliases (seeded)

| Alias | Intent | Seeded chain |
|---|---|---|
| `default` | Balanced general purpose (Sonnet-class) | Empty — operator populates via admin UI |
| `reasoning` | Hard reasoning, long context (Opus-class) | Empty — operator populates via admin UI |
| `fast` | Cheap, high-volume, latency-sensitive (Haiku-class) | Empty — operator populates via admin UI |
| `vision` | Image understanding | Empty — operator populates via admin UI |
| `bulk-classify` | High-volume classification (cheapest-first) | Empty — operator populates via admin UI |

Chains are empty at first deploy by design (D-004). Operator adds provider entries via the Aliases admin page after providers are registered.

---

## System map — read-first doctrine

**This file is the ground-truth snapshot for sub-agents and auditors.** Before
scanning the codebase, read this file. Use it to locate routes, tables, agents,
and services. If this file is stale (check the timestamp below), regenerate via
the `meta-orchestrator` agent.

This file is **generated, never hand-edited.** Comments belong in the canonical
governance docs (`DECISION_LOG.md`, `CLAUDE.md`, `PROJECT_STATE.md`), not here.
Sub-agents that reference this map should check `Generated:` below and regenerate
if older than the project's refresh cadence.

---
Generated: 2026-07-03T02:19:28Z
Generator: meta-orchestrator subagent (.claude/agents/meta-orchestrator.md)
Last commit considered: fcd76e0
Refresh cadence: manual before any audit or build
