# SDM LLM Gateway — PROJECT_STATE.md

> Operator: Preston Foreman
> Purpose: Single source of truth for where this project stands. Updated at the end of every working session.
> Convention: Replace contents on each update. Historical state lives in git history, not in this file.

---

## State update — 2026-07-12 (Aether Sandbox lane — guardrails built)

- **Aether Sandbox lane built (FS-002 / D-024):** a locked-down project + scoped
  key for a low-trust build sandbox. Additive and reversible.
  - New `projects` grouping with a project-wide monthly cap, rate-limit
    defaults, and an `enabled` kill switch. Seeded `aether-sandbox` ($20/mo,
    30 rpm, 60k tpm).
  - Sandbox keys are `apps` rows scoped to the project, `budget_enforced`, with a
    per-key cap ($5/mo default) and rpm/tpm limits, locked to the three sandbox
    aliases. Minted admin-side only (`scripts/mint-sandbox-key.js` or the
    Projects UI) — the sandbox can never mint its own key.
  - **Real cost computation added** (`model_prices` + `cost.js`), wired into all
    four routing paths. This fixes a latent bug where `call_logs.cost_usd` was
    always NULL and every spend cap silently never fired.
  - Guardrails: fail-closed model allowlist, unpriced-model refusal (never bill
    unknown cost as free), sandbox-OAuth ban, rpm/tpm throttle, project + per-key
    caps with 50%/90% spend alerts surfaced in the admin UI.
  - Allowed models: `claude-sonnet-5`, `claude-haiku-4-5`, `gpt-5-codex`.
- **No retroactive enforcement:** `budget_enforced` defaults FALSE, so existing
  apps that already have a `monthly_budget_usd` set are NOT newly 429'd — they
  stay track-only until explicitly opted in.
- **Admin surfaces:** new Projects page (spend vs cap, kill switch, mint key,
  spend alerts), dashboard spend-alert banner, Apps API extended for the new
  key fields.

---

## Current State

**Phase:** Aether Sandbox guardrail lane complete in the working tree (branch
`feat/aether-sandbox-lane` not yet created — git write ops blocked in this
session; changes staged in the working tree).
**Status:** Unit tests (32) pass, production build compiles all new
routes/pages, lint clean. Fresh-context security + correctness audits ran; all
findings fixed and locked with tests:

- P0: `/projects` added to the auth middleware matcher (was readable
  unauthenticated).
- Security/P1: containment no longer depends on the `budget_enforced` flag — any
  project-scoped key refuses unpriced models + enforces its cap; OAuth ban now
  bound to the key, not just the alias; empty-allowlist DB CHECK uses
  `cardinality()` (was a no-op via `array_length('{}',1)`).
- P1: `max_output_tokens` ceiling wired into the `/v1/chat/completions`
  (OpenAI-shim) paths too.
- P2: Apps PATCH returns 400 (not 500) on a bad `project_id`; spend-alert insert
  uses explicit per-scope conflict targets; streaming-refusal-at-200 logged as
  G-004.
  **Version:** `0.6.0` (no bump in this slice).

---

## Last Action Taken

- Added migration `009_aether_sandbox.sql` (projects, apps columns, aliases
  columns, model_prices, spend_alerts, seeds; additive/idempotent).
- Added `src/lib/routing/cost.js` and `src/lib/routing/budget.js`; extended
  `policy.js` (kill switch, fail-closed allowlist, unpriced-model refusal,
  rpm/tpm, project+key caps, spend alerts, sandbox-OAuth ban).
- Wired cost into `execute-call.js`, `v1/messages/route.js`, `stream-call.js`,
  `execute-embedding.js`; extended `app-auth.js` and `resolve-alias.js` selects.
- Added admin routes: `projects` (+`[id]`, `[id]/keys`), `alerts` (+`[id]`);
  extended `apps` routes. Added Projects page + `ProjectsClient`, dashboard alert
  banner, Projects nav item.
- Added `scripts/aether-seed.js`, `scripts/aether-kill.js`,
  `scripts/mint-sandbox-key.js`; added `openai-gpt-5-codex` to litellm-config.
- Added tests `cost.test.js`, `policy-sandbox.test.js`; updated `policy.test.js`.
- Logged `D-024`, `FS-002`, gaps `G-001`/`G-002`/`G-003`.

---

## Blockers

Out-of-band steps only I (operator) can do — none block the code merge:

1. Run migration 009 on the deployed Postgres (`docker exec gateway-web node
scripts/migrate.js`) — migrations do NOT auto-run on deploy.
2. Confirm an `anthropic (api_key)` provider and an `openai (api_key)` provider
   exist with real keys, then run `scripts/aether-seed.js` to wire the sandbox
   alias chains.
3. Mint the sandbox key (Projects UI or `scripts/mint-sandbox-key.js`).
4. **Pre-merge safety check:** confirm no live app already has a
   `monthly_budget_usd` set that would now enforce — but `budget_enforced`
   defaults FALSE so this is belt-and-suspenders, not a hard gate.

---

## Next Decision Needed

None for the guardrail lane. The open product decision is sequencing of the
follow-on (**G-001**: CLI tool-call + streaming passthrough) that makes the CLIs
actually run builds end-to-end — recommended as the immediate next build with its
own council pass, since it changes the shared response contract.

---

## Build Queue

1. Deploy code + run migration 009 + `aether-seed.js` + mint key (out-of-band).
2. Price `gpt-5-codex` in `model_prices` (G-003) when confirmed.
3. **G-001 follow-on build (council-gated):** tool-call + streaming passthrough
   for `/v1/messages` (Anthropic) and `/v1/chat/completions` (OpenAI/Codex) so
   both CLIs run tool-using builds end-to-end.
4. Regenerate `SYSTEM_MAP.md` (routes/tables/env changed).

---

## Risk Register

1. **Post-hoc cap / best-effort rate limit (G-002):** the cap refuses the next
   request after spend crosses (never queues); output tokens clamped to bound
   overshoot. Rate limits are a best-effort DB-window throttle. The cap is the
   real backstop.
2. **Codex non-functional until G-001 + G-003:** the sandbox is guardrail-ready
   but not build-capable for Codex until the passthrough lands and gpt-5-codex is
   priced.
3. **Generated system map stale:** `SYSTEM_MAP.md` needs regeneration after this
   build (new routes, tables, admin surfaces).
