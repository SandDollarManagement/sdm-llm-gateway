# SDM LLM Gateway — DECISION_LOG.md

> Operator: Preston Foreman
> Purpose: Permanent record of every architectural decision made on this project.
> Convention: Decisions are append-only. Never delete or rewrite. If a decision is reversed, log a new entry that supersedes the old one and reference it.

---

## Format

Each decision has:
- **ID** — sequential, e.g. `D-001`
- **Date** — ISO format
- **Status** — `Active`, `Superseded by D-XXX`, or `Reversed`
- **Title** — short, scannable
- **Context** — why this came up
- **Decision** — the actual call made
- **Alternatives considered** — what was rejected and why
- **Consequences** — what this commits us to going forward

---

## D-001 — Use LiteLLM Proxy as routing engine

- **Date:** 2026-05-19
- **Status:** Active
- **Context:** The gateway needs to talk to 5+ LLM providers with unified interface, fallback chains, retries, and usage tracking. Building this from scratch is 2-3 weeks of work and recreates a solved problem.
- **Decision:** Use LiteLLM Proxy (open source, MIT, Docker-deployable) as the core routing engine. Build a thin Next.js wrapper on top for the pieces LiteLLM doesn't cover (Anthropic OAuth handling, Ops Hub integration, custom logging).
- **Alternatives considered:**
  - Build from scratch — rejected, too much time recreating mature open source.
  - LangChain / LlamaIndex — rejected, heavier abstractions that don't match a simple gateway use case.
  - Portkey / Helicone (SaaS) — rejected, violates self-hosting preference.
- **Consequences:**
  - Adds LiteLLM as a runtime dependency. If LiteLLM has a critical bug or stops being maintained, gateway is affected.
  - Faster path to V1.
  - LiteLLM config (`litellm-config.yaml`) becomes a second source of truth alongside Supabase `providers` table. Migration logic must keep them in sync.

---

## D-002 — Standalone service, not embedded in Ops Hub

- **Date:** 2026-05-19
- **Status:** Active
- **Context:** Considered making the gateway a module inside Ops Hub since Ops Hub is the "central operations platform" and everything else feeds into it.
- **Decision:** Build as a fully standalone service with its own repo, Coolify project, and database.
- **Alternatives considered:**
  - Embed in Ops Hub — rejected because the gateway is infrastructure, not a business feature. It needs to outlive any individual app. Also, when Ops Hub goes multi-tenant, having LLM infrastructure inside it complicates the productization migration.
- **Consequences:**
  - One more service to deploy and monitor.
  - Clean separation lets the gateway evolve independently.
  - When Ops Hub productizes, gateway flips one config flag and all other apps continue working unchanged.

---

## D-003 — OpenAI-compatible API as primary public interface

- **Date:** 2026-05-19
- **Status:** Active
- **Context:** Apps need a stable HTTP interface to call the gateway. Two real options: OpenAI's `/v1/chat/completions` shape or Anthropic's `/v1/messages` shape.
- **Decision:** Primary interface is OpenAI-compatible (`/v1/chat/completions`). Secondary interface is Anthropic-compatible (`/v1/messages`) for apps already coded against the Anthropic SDK.
- **Alternatives considered:**
  - Anthropic-only — rejected because OpenAI's shape is the de facto industry standard and every SDK supports it. Future flexibility matters.
  - Custom proprietary interface — rejected because it locks apps into the gateway and complicates integration of third-party tools.
- **Consequences:**
  - Apps can swap out the gateway for direct OpenAI access (or any OpenAI-compatible provider) with a one-line URL change. Good for portability, removes lock-in.
  - Anthropic-specific features (e.g. prompt caching with cache_control blocks) need translation between the two shapes when an app uses the OpenAI endpoint to call Claude.

---

## D-004 — Alias-based routing, not direct provider/model selection

- **Date:** 2026-05-19
- **Status:** Active
- **Context:** Apps need to specify what kind of model they want. Two approaches: direct ("give me claude-sonnet-4-6") or alias ("give me `default` quality").
- **Decision:** Apps request model aliases (`default`, `reasoning`, `fast`, `vision`, `bulk-classify`). Operator defines what each alias maps to in admin UI. Apps never request specific provider/model strings.
- **Alternatives considered:**
  - Direct model selection — rejected because it spreads model strings across every app's code. Changing models requires app redeploys.
  - Hybrid (alias OR direct) — rejected for now to enforce discipline. Can be added later if a specific use case needs it.
- **Consequences:**
  - Operator can change which actual model an alias resolves to without touching any app code.
  - Apps lose ability to request specific models. If an app's Image Analyst agent absolutely needs GPT-4o specifically, it must use an alias dedicated to GPT-4o.
  - Forces operator discipline: aliases must reflect intent (`vision`, `reasoning`), not implementation (`gpt-4o-mini`).

---

## D-005 — Anthropic OAuth handling lives in wrapper layer, not LiteLLM

- **Date:** 2026-05-19
- **Status:** Active
- **Context:** LiteLLM treats Anthropic as a single provider with one credential. The Agent SDK monthly credit ($200/mo on Max 20x) requires OAuth-token-first behavior with API-key fallback when the credit is exhausted. This is budget-aware switching, not standard fallback.
- **Decision:** The Next.js wrapper layer owns OAuth-first routing. It checks current month's OAuth spend against the configured cap before deciding which credential to use. LiteLLM is called only for the final HTTP request to Anthropic with the chosen credential.
- **Alternatives considered:**
  - Fork LiteLLM and add OAuth-aware logic — rejected because maintaining a fork is a long-term tax.
  - Register Anthropic twice in LiteLLM (once with OAuth, once with API key) and rely on natural fallback — rejected because LiteLLM falls back only on error, not on budget thresholds. Hard cap behavior is impossible.
- **Consequences:**
  - Wrapper layer has explicit Anthropic-aware logic. Adds complexity to the routing module.
  - Hard cap and soft cap modes both supported.
  - If Anthropic ever changes the OAuth model, only the wrapper needs updating.

---

## D-006 — Dedicated Supabase project, not shared with Ops Hub

- **Date:** 2026-05-19
- **Status:** Superseded by D-017 (2026-05-29). Operator does not have a Supabase account; the entire Supabase premise was a prior-session error.
- **Context:** Could share Ops Hub's existing Supabase project (saves a project slot) or use a dedicated one.
- **Decision:** Dedicated Supabase project for the gateway.
- **Alternatives considered:**
  - Shared with Ops Hub — rejected. The gateway is shared infrastructure across multiple apps; coupling its data to Ops Hub creates a dependency that breaks the standalone principle in D-002.
  - Local Postgres in the gateway Docker stack — viable but loses the convenience of the Supabase admin UI and managed backups.
- **Consequences:**
  - One more Supabase project to manage.
  - Clean data ownership boundary.
  - When Ops Hub productizes, gateway data stays separate and not entangled.

---

## D-007 — `requireOperator()` + `OPERATOR_EMAIL` env var auth pattern

- **Date:** 2026-05-19
- **Status:** Superseded by D-019 (2026-05-29). The `requireOperator()` pattern referenced does not exist in any SDM app; actual pattern is NextAuth + Google OAuth + `ADMIN_EMAILS`.
- **Context:** Admin UI needs auth. Ops Hub v4.50.0 established a single-operator pattern using `requireOperator()` middleware with `OPERATOR_EMAIL` env var.
- **Decision:** Reuse the exact same pattern in the gateway. Read the Ops Hub implementation as the reference.
- **Alternatives considered:**
  - Full multi-user auth with Supabase Auth — rejected as premature for single-operator phase. Will revisit before productization.
  - No auth (rely on private network) — rejected, admin UI handles credentials and must be protected even if the network is private.
- **Consequences:**
  - Consistent auth pattern across all SDM services.
  - When productization happens, this is the single biggest piece to swap out.

---

## D-008 — Per-app bearer tokens, hashed at rest

- **Date:** 2026-05-19
- **Status:** Active
- **Context:** Apps calling the gateway need to authenticate. Could share one token across all apps or issue per-app tokens.
- **Decision:** Each registered app gets its own bearer token. Tokens are SHA-256 hashed in the `apps` table; the plaintext is shown to the operator only once on creation.
- **Alternatives considered:**
  - Single shared token — rejected because it makes per-app usage attribution and revocation impossible.
  - Per-app API keys with full key management (rotation schedules, expiry) — rejected for V1 as overengineered. Can be added later.
- **Consequences:**
  - Per-app usage tracking and budgets work cleanly.
  - Revoking one app's access doesn't affect others.
  - Operator must save tokens somewhere secure on creation (1Password, etc.). They cannot be retrieved later, only regenerated.

---

## D-009 — Credentials encrypted at rest with `GATEWAY_ENCRYPTION_KEY`

- **Date:** 2026-05-19
- **Status:** Active
- **Context:** Provider credentials (Anthropic OAuth tokens, API keys for 5 providers) sit in the `providers` table. Plaintext storage is unacceptable.
- **Decision:** Encrypt the `credentials` column with AES-256-GCM using a key from `GATEWAY_ENCRYPTION_KEY` env var. Decrypt only inside the routing module, never log decrypted values.
- **Alternatives considered:**
  - Plaintext (rejected outright).
  - External secrets manager (Vault, AWS Secrets Manager) — rejected, adds external dependency that violates self-hosting preference.
  - Per-provider env vars (no DB storage) — rejected because operator wants to add/remove providers without redeploying.
- **Consequences:**
  - `GATEWAY_ENCRYPTION_KEY` becomes load-bearing. Losing it = losing access to all provider credentials. Must be backed up (Coolify env vars + password manager, per Open Decision 5).
  - Key rotation requires re-encrypting every row.

---

## D-010 — Five V1 providers: Anthropic, OpenAI, Gemini, xAI Grok, OpenRouter

- **Date:** 2026-05-19
- **Status:** Active
- **Context:** Multi-provider gateway needs a set of providers at launch. Universe of options is large.
- **Decision:** V1 ships with Anthropic (OAuth + API key), OpenAI, Google Gemini, xAI Grok, and OpenRouter. Schema accepts any provider LiteLLM supports.
- **Alternatives considered:**
  - Anthropic + OpenAI only (rejected, defeats the resilience goal).
  - All major providers including Bedrock, Groq, Ollama, Mistral, DeepSeek as direct integrations (rejected as scope creep — OpenRouter gives access to most of these through one integration).
- **Consequences:**
  - Four independent infrastructure paths plus OpenRouter as catchall. Simultaneous outage probability effectively zero.
  - Five sets of credentials to manage.
  - Groq, Bedrock, direct DeepSeek, etc. deferred to V1.1.

---

## D-011 — Five default aliases: `default`, `reasoning`, `fast`, `vision`, `bulk-classify`

- **Date:** 2026-05-19
- **Status:** Active
- **Context:** Operator needs a starting set of aliases. Could ship with zero (force operator to define everything) or with sensible defaults.
- **Decision:** Seed five aliases on first run. Operator can edit, delete, or add new ones in admin UI. Seed values live in a migration, not in code.
- **Alternatives considered:**
  - Zero seed aliases — rejected, every app would block on Phase 6 waiting for aliases to be defined.
  - More aliases (`creative`, `code`, `summarization`, etc.) — rejected, easier to add than remove. Start narrow.
- **Consequences:**
  - Apps can start integrating immediately after Phase 5.
  - Operator must review the seed aliases and tune them for actual workloads.

---

## D-012 — `workspace_id` column on every domain table

- **Date:** 2026-05-19
- **Status:** Active
- **Context:** Carry forward the multi-tenancy-readiness pattern from Ops Hub. Single workspace today; potentially many later.
- **Decision:** Every domain table has a `workspace_id` foreign key, even though there is only one workspace row for the foreseeable future. Queries always filter by `workspace_id`.
- **Alternatives considered:**
  - Skip workspace_id, add it later — rejected, schema migrations on populated tables are painful. Cheap to add now, expensive to retrofit.
- **Consequences:**
  - Slight schema overhead with no current benefit.
  - When multi-tenancy arrives, it's a config change, not a migration project.

---

## D-013 — Repo and service name: `sdm-llm-gateway`

- **Date:** 2026-05-29
- **Status:** Active
- **Context:** Resolves OD-001. Repo name affects every internal reference, Coolify project name, Docker image names.
- **Decision:** `sdm-llm-gateway`. GitHub repo created at `github.com/SandDollarManagement/sdm-llm-gateway`.
- **Alternatives considered:**
  - `1111-llm-gateway` — rejected, infrastructure should not carry a brand label.
  - `sdm-router` — rejected, too vague.
- **Consequences:**
  - Coolify project named `sdm-llm-gateway`.
  - Docker images named `sdm-llm-gateway-web` and `sdm-llm-gateway-litellm`.
  - All internal references in code, env vars, and docs use this name verbatim.

---

## D-014 — Public domain: `llm.sanddollarmanagementllc.com`

- **Date:** 2026-05-29
- **Status:** Active
- **Context:** Resolves OD-002. Apps and operator browser both need a stable URL.
- **Decision:** Single subdomain `llm.sanddollarmanagementllc.com` serves both the admin UI and the public API (`/v1/chat/completions`, `/v1/messages`). LiteLLM remains internal-only.
- **Alternatives considered:**
  - `gateway.sanddollarmanagementllc.com` — rejected, breaks the existing `hub.`, `media.`, `qa.` naming pattern.
  - `llm.1111audiovisual.com` — rejected, mixes brand with infrastructure.
  - Internal-only — rejected, operator needs admin UI reachable from any device.
- **Consequences:**
  - Single DNS A record points subdomain at the Hetzner VPS IP.
  - SSL handled by Coolify (Let's Encrypt automatic).
  - Routing API can still be locked down at the firewall/Coolify network layer if desired later.

---

## D-015 — Dedicated Supabase project: `sdm-llm-gateway`

- **Date:** 2026-05-29
- **Status:** Superseded by D-017 (2026-05-29, same day). Operator confirmed during setup chat that he has never had a Supabase account; the original CLAUDE.md assumption was wrong.
- **Context:** Resolves OD-003. Operator confirmed dedicated project over shared schema. Reinforces D-006.
- **Decision:** New Supabase project named `sdm-llm-gateway`, separate from Ops Hub and Media Manager projects. All six tables from `CLAUDE.md` schema section live here.
- **Alternatives considered:**
  - Schema inside Ops Hub Supabase — rejected, couples gateway lifecycle to Ops Hub.
  - Schema inside Media Manager Supabase — same coupling, different host.
- **Consequences:**
  - One additional Supabase project to monitor.
  - Independent backup, billing, and access control.
  - When Ops Hub productizes, gateway data stays separate.

---

## D-016 — Encryption key backup: Coolify env + 1Password

- **Date:** 2026-05-29
- **Status:** Active
- **Context:** Resolves OD-005. `GATEWAY_ENCRYPTION_KEY` is load-bearing per D-009; losing it means losing access to every stored provider credential.
- **Decision:** `GATEWAY_ENCRYPTION_KEY` lives in two places: Coolify env var (for runtime use) and 1Password (for backup). Key is generated once at project setup and never rotated unless a leak is suspected.
- **Alternatives considered:**
  - Coolify env var only — rejected, single point of failure.
  - Coolify + 1Password + offline backup (USB or paper) — over-engineered for current threat model; operator can add later if desired.
- **Consequences:**
  - If Coolify server rebuilds or env is wiped, operator restores key from 1Password.
  - Documented in 1Password under a vault entry titled `SDM LLM Gateway — encryption key`.
  - Same backup pattern applied to `LITELLM_MASTER_KEY` and the Supabase service role key.

---

## D-017 — Database: Postgres container in Coolify, not Supabase

- **Date:** 2026-05-29
- **Status:** Active. Supersedes D-006 and D-015.
- **Context:** During setup chat the operator confirmed he has never had a Supabase account. Verification against the actual code in `SDM-Ops-Hub` showed all SDM apps use plain Postgres via the `pg` driver, deployed as a Postgres container per app in Coolify. The Supabase assumption in the original CLAUDE.md came from a prior session reconstructing without verifying.
- **Decision:** Gateway uses a dedicated Postgres container in Coolify (named `sdm-llm-gateway-db`), accessed via the `pg` Node driver with raw SQL through helper functions (`query`, `queryOne`, etc.), matching the Ops Hub pattern.
- **Alternatives considered:**
  - Supabase (rejected — operator does not use it; would introduce a new external dependency for no benefit).
  - Shared Postgres container across apps (rejected — each existing SDM app gets its own Postgres container; gateway follows the same pattern).
  - ORM (Prisma, Drizzle) (rejected — Ops Hub uses raw SQL via `pg`; introducing an ORM means two query patterns in the org).
- **Consequences:**
  - `.env.example` exposes `DATABASE_URL` (Postgres connection string), not Supabase keys.
  - Migrations live in `migrations/` (plain SQL files), not `supabase/migrations/`.
  - Backup is Coolify's standard Postgres backup, same as every other SDM app.
  - No external SaaS dependency for storage. Fully self-hosted.

---

## D-018 — Language: JavaScript, not TypeScript

- **Date:** 2026-05-29
- **Status:** Active. Implicitly supersedes the TS assumption baked into CLAUDE.md.
- **Context:** Original CLAUDE.md specified Next.js + TypeScript. Verification against actual SDM apps (Ops Hub, storyquest, Gmail-Drive-Manager) showed all are written in plain JavaScript (`.js` files). No TypeScript anywhere.
- **Decision:** Gateway is written in JavaScript, matching the existing SDM stack. All files use `.js` (or `.jsx` where React JSX is needed).
- **Alternatives considered:**
  - TypeScript (rejected — would mean operator runs two stacks; every fix has to be done twice; no other SDM app to migrate to TS alongside the gateway).
- **Consequences:**
  - File extensions throughout the repo are `.js`, not `.ts`.
  - `package.json` does not list `typescript` as a dependency.
  - No `tsconfig.json`.
  - Naming convention update: TypeScript types convention from CLAUDE.md is dropped (not relevant). Other naming conventions (env vars SCREAMING_SNAKE_CASE, DB columns snake_case, files kebab-case) carry forward unchanged.

---

## D-019 — Auth: NextAuth + Google OAuth + `ADMIN_EMAILS` whitelist

- **Date:** 2026-05-29
- **Status:** Active. Supersedes D-007.
- **Context:** Original CLAUDE.md specified `requireOperator()` middleware reading `OPERATOR_EMAIL` env var, "from Ops Hub v4.50.0". Verification against the actual Ops Hub code at `src/lib/auth.js` shows that pattern does not exist. Ops Hub uses NextAuth with `GoogleProvider`, JWT session strategy, and a comma-separated `ADMIN_EMAILS` env var to whitelist allowed emails. Ops Hub is at v4.49.5, not v4.50.0.
- **Decision:** Gateway uses identical auth pattern to Ops Hub: NextAuth + GoogleProvider, JWT sessions, `ADMIN_EMAILS` (comma-separated) whitelist. Operator signs in with Google; if their email is in `ADMIN_EMAILS`, they get access. No other emails permitted.
- **Alternatives considered:**
  - Single-operator `OPERATOR_EMAIL` env var (rejected — doesn't match Ops Hub; using `ADMIN_EMAILS` future-proofs for adding a backup operator email later).
  - Supabase Auth (rejected — no Supabase in stack).
  - Custom session middleware (rejected — NextAuth handles session, CSRF, JWT correctly out of the box).
- **Consequences:**
  - `.env.example` exposes `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAILS`. Drops `OPERATOR_EMAIL`.
  - Operator needs a Google OAuth client (Google Cloud Console → Credentials → OAuth 2.0 client ID). Same client may be reused across SDM apps or a new one created for the gateway.
  - Admin routes protected by NextAuth's `getServerSession()` check, returning 401 / redirecting to `/login` if not authenticated or not in `ADMIN_EMAILS`.

---

## D-020 — Anthropic subscription credit path is the `claude` CLI binary, not the Messages API

- **Date:** 2026-05-29
- **Status:** Superseded by D-021 (2026-05-31). The CLI path works structurally, but Anthropic CLI v2.1.159 silently refuses to bill subscription credit when invoked in a headless container, returning exit 0 with empty stdout. See D-021 for details and the new primary path.
- **Context:** The prior session's design for D-005 assumed `sk-ant-oat01-*` OAuth tokens could be sent to the Anthropic Messages API to draw from the operator's Max plan credit. Verification against current present-day Anthropic policy (February 2026 ToS update + sustained 401 "OAuth authentication is currently not supported" responses on the Messages API for Bearer-auth OAuth tokens) shows that path is both technically rejected and a violation of Anthropic Consumer ToS. The legitimate way to use subscription credit programmatically is the official `claude` CLI binary, which Anthropic explicitly permits on any machine including server VPS. Starting 2026-06-15, `claude -p` draws from a dedicated monthly Agent SDK credit on Max subscriptions.
- **Decision:** The Anthropic provider in the gateway invokes the `claude` CLI as a child process for every request. OAuth token is supplied via the `ANTHROPIC_OAUTH_TOKEN` env var; a Docker entrypoint script writes it to `~/.claude/.credentials.json` at container start so the CLI can pick it up. Other providers (OpenAI, Gemini, xAI Grok, OpenRouter) continue to use direct HTTPS API calls with API keys (Phase 3 onward).
- **Alternatives considered:**
  - Send OAuth token via `Authorization: Bearer` to the Messages API (the prior plan) — rejected, doesn't work and violates ToS.
  - Send OAuth token via `x-api-key` to the Messages API — works in some contexts but Anthropic has stated this is not officially supported and the ToS concern remains.
  - Abandon the subscription credit goal and use API key billing only — rejected; the operator pays $200/mo for Max specifically to use this credit programmatically.
- **Consequences:**
  - The gateway's Anthropic code path is a child-process invocation, not an HTTP fetch. Different shape from every other provider in the gateway.
  - The `claude` CLI must be installed in the runtime Docker image (`@anthropic-ai/claude-code` global npm install).
  - The OAuth token still lives in the `providers` table for audit/identity, but the source of truth for the CLI at runtime is the Coolify env var.
  - Token counts and per-request cost data from Anthropic via this path are not directly exposed by the CLI; `call_logs.cost_usd` and token counts may be `null` for Anthropic calls until Anthropic exposes them. Other providers (Phase 3) will populate them normally via API responses.
  - Architecture diagram and `CLAUDE.md` D-005 narrative updated to reflect this design.

---

## D-021 — Anthropic API key is primary; OAuth path retained but disabled by default

- **Date:** 2026-05-31
- **Status:** Active. Supersedes D-020.
- **Context:** D-020 designed the Anthropic path around invoking the `claude` CLI binary so the operator's Max plan subscription credit could be used programmatically. Implementation was complete: CLI installed in the runtime image, entrypoint hydrated `~/.claude/.credentials.json` from `ANTHROPIC_OAUTH_TOKEN`, wrapper spawned `claude --print` child processes. Test in production with v2.1.159 of the CLI revealed that the CLI silently refuses to bill subscription credit from a headless container — it executes, takes ~30s, returns exit 0 with empty stdout. Same behavior with `--debug` flag (no diagnostic output produced). Same behavior with `CLAUDE_CODE_OAUTH_TOKEN` env var. This is consistent with Anthropic's Feb 2026 ToS update: OAuth tokens are now explicitly restricted to first-party use cases (the official `claude` interactive flow), and Anthropic has implemented the restriction at the CLI level via a silent no-op for non-conforming environments rather than a loud error.
- **Decision:** The Anthropic provider in the gateway uses API key authentication (`sk-ant-api03-...`) as the primary and only currently-working path. Calls go directly to the Anthropic Messages API over HTTPS with `x-api-key`, billed per-token against the API key's billing account. Costs land on whatever Anthropic billing the API key is associated with. The OAuth/claude-CLI code (`src/lib/providers/anthropic-claude-cli.js`, the Docker `claude` install, the entrypoint credentials write) remains in place so if Anthropic ever re-opens programmatic subscription use, the path can be re-enabled via the admin UI without rebuilding the architecture.
- **Alternatives considered:**
  - Keep trying to make OAuth work — rejected. We exhausted every documented credentials path; Anthropic's silent-fail is intentional behavior, not a config bug.
  - Use `claude --bare` mode with OAuth token as `ANTHROPIC_API_KEY` — rejected; bare mode strictly requires a real API key per its docs, and Anthropic's API rejects OAuth tokens via that path too (Feb 2026 ToS).
  - Switch to Amazon Bedrock Claude — viable future option for cost optimization, but introduces AWS infra we don't have today. Defer.
  - Abandon Anthropic in the chain entirely — rejected; Claude is the highest-quality model for the operator's use cases, just need to accept per-token billing.
- **Consequences:**
  - The operator's Max plan subscription continues to serve interactive Claude Code use on the workstation. It does NOT subsidize gateway-routed calls. The $200/mo essentially becomes "developer tool cost" for workstation work only.
  - Gateway-routed Anthropic calls bill per-token at standard API rates against the API key.
  - The fallback chain's design rationale still holds: when Anthropic is down or over budget, the chain falls to OpenAI / Gemini / Grok / OpenRouter exactly as designed.
  - The default alias's chain becomes: `[anthropic api_key → openai → gemini → ...]` instead of `[anthropic oauth → anthropic api_key → ...]`. The OAuth provider record can be deleted or left in place (disabled).
  - Operator action: generate an Anthropic API key, add it via `/providers` admin UI, edit the `default` alias chain to put Anthropic API key first.

---

## D-022 — `/v1/messages` (non-streaming) is a faithful Anthropic passthrough

- **Date:** 2026-06-13
- **Status:** Active
- **Context:** Gmail-Drive-Manager (GDM) — currently the gateway's ONLY live
  consumer (Ops Hub / Media Manager still call `api.anthropic.com` directly) — is
  blocked on its migration Phase 3. GDM's orchestrator and instruction_parser
  agents use Anthropic **tool calling**, and all its classifiers rely on
  **prompt caching** (`cache_control`) for cost control. The non-streaming
  `/v1/messages` path extracted only `model`/`messages`/`system`/`max_tokens`/
  `stream` from the body, flattened message content to text (dropping
  `tool_use`/`tool_result` blocks), and routed `system` through
  `openAiToAnthropic` (dropping `cache_control`). Net effect: no tools reached
  Anthropic and caching never engaged — contradicting D-003, which named
  `/v1/messages` as the Anthropic-compatible interface including `cache_control`.
  The current behavior was a bug, not intent.
- **Decision:** The non-streaming `/v1/messages` path forwards the caller's
  original Anthropic-shaped body to the Anthropic Messages API **verbatim**,
  overriding only `model` (alias → resolved model from the DB chain) and forcing
  `stream:false`. `system` (incl. `cache_control` blocks), `messages` (structured
  content incl. `tool_use`/`tool_result`), `tools`, `tool_choice`, and sampling
  params pass through untouched. A new `callAnthropicMessagesRaw()` in
  `src/lib/providers/anthropic-api.js` performs the raw POST with a **fresh
  provider-key header set** (it never spreads the incoming request headers — the
  caller's `x-api-key` is the gateway bearer token and must not reach Anthropic).
  `anthropic-version` / `anthropic-beta` are forwarded from the caller when
  present, defaulting to `2023-06-01`. The route returns Anthropic's raw response
  body so consumers read native `content` (`tool_use`) and full `usage` (incl.
  `cache_read_input_tokens` / `cache_creation_input_tokens`). The existing
  `callAnthropicViaApiKey()` (used only by the OpenAI-compatible
  `/v1/chat/completions` path) is **unchanged**, so that endpoint is unaffected.
- **Alternatives considered:**
  - Extend `openAiToAnthropic` to carry tools/`cache_control` — rejected; it is an
    OpenAI→Anthropic translator for the chat/completions path. `/v1/messages`
    input is already Anthropic-shaped, so verbatim passthrough is correct and
    lower-risk than translation.
  - Hardcode a newer `anthropic-version` — rejected; forwarding the caller's SDK
    headers keeps feature flags out of the gateway (no-hardcoded mandate).
  - Fix the streaming path in the same change — deferred; GDM does not stream, and
    it widens blast radius. Logged as follow-up.
- **Consequences:**
  - `/v1/messages` becomes a true Anthropic passthrough for non-streaming calls;
    GDM's tool-using agents and cache-dependent classifiers work → GDM Phase 3
    unblocks.
  - **Follow-up (deferred):** the streaming `/v1/messages` path STILL flattens to
    text (drops tools + `cache_control`) — build a faithful streaming passthrough
    when a streaming consumer appears. And `call_logs` does not yet break out
    `cache_*` tokens (GDM reads them from the response body).
  - The OpenAI `/v1/chat/completions` endpoint is unchanged.
  - **Validation:** the gateway has no automated test suite, so the gate is
    `next build` (passed) + a live probe — a `/v1/messages` call with a `tools` +
    `cache_control` body, asserting the response contains a `tool_use` block and
    `usage.cache_*` fields. Must pass before GDM flips its agents to gateway.

---

## Decisions Pending (see OPEN_DECISIONS.md)

Two decisions remain open, both for later phases:
- **OD-001 (was OD-004)** — OAuth token rotation reminder mechanism. Now lower priority since OAuth is no longer the primary path.
- **OD-002 (was OD-006)** — Per-agent alias ownership pattern. Blocks Phase 6.

Once resolved, they move here as `D-023` onward.
