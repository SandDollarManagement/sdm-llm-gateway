# SDM LLM Gateway — PROJECT_STATE.md

> Operator: Preston Foreman
> Purpose: Single source of truth for where this project stands. Updated at the end of every working session.
> Convention: Replace contents on each update. Historical state lives in git history, not in this file.

---

## State update — 2026-07-11 (Document Vault shared provider layer)

- **Gateway alias/policy layer built:** Added `FS-001` support for Document
  Vault and future SDM apps. New first-class aliases are seeded for
  `doc-answer`, `doc-summarize`, `doc-rerank`, `doc-embed`, `vision-ocr`,
  `fast-classify`, and `local-private`, with capability metadata, fallback
  policy, local/cloud eligibility, retention notes, priority, and embedding
  dimension/family/version where needed.
- **Per-app controls built:** Apps now support allowed-alias lists and
  fallback permission in addition to existing enabled state and monthly budget
  cap. Routing enforces these policies before provider calls.
- **Fallback safety built:** Provider fallback now respects alias/app policy,
  local-only aliases reject cloud providers, and embedding aliases reject
  fallback entries with incompatible vector dimensions.
- **Correlation and visibility built:** App-supplied correlation IDs are
  accepted from headers/body metadata, written to call logs, returned in
  OpenAI-compatible response metadata and response headers where practical, and
  visible/filterable in the Logs UI. Raw document content is still not logged by
  default.
- **Admin surfaces updated:** Aliases UI exposes metadata/policy fields. Apps UI
  exposes allowed aliases and fallback permission. Logs UI exposes correlation
  IDs.
- **LiteLLM config updated:** Added model entries for
  `openai-text-embedding-3-small` and `local-private-llama` so provider chains
  have stable model names for embedding/local routing once providers are
  configured.
- **Embeddings endpoint added:** `/v1/embeddings` accepts a gateway alias,
  enforces embedding capability metadata, routes through LiteLLM, and returns
  OpenAI-compatible embedding responses with gateway metadata.

---

## Current State

**Phase:** Shared gateway provider layer implementation complete in working tree.
**Status:** Code and canonical docs updated; lint, unit tests, and production
build pass locally.
**Version:** Still `0.6.0`; no version bump done in this slice.

---

## Last Action Taken

- Added migration `008_gateway_alias_policy.sql`.
- Added shared routing policy enforcement in `src/lib/routing/policy.js` and
  embedding routing in `src/lib/routing/execute-embedding.js`.
- Updated alias resolution, non-streaming execution, streaming execution, app
  auth, logging, OpenAI-compatible route, Anthropic-compatible route, admin APIs,
  and admin UI components.
- Added unit tests for alias resolution, fallback behavior, policy enforcement,
  embedding compatibility, missing credentials, and correlation logging.
- Logged architecture decision `D-023` and feature spec `FS-001`.

---

## Blockers

None from the operator. Live provider chains still need actual provider rows and
model choices configured in the admin UI before Document Vault can send
production traffic through the new aliases.

---

## Next Decision Needed

None. Technical implementation choices are made. Next work is operational:
configure provider chains for the new aliases and migrate Document Vault to call
gateway aliases instead of direct provider models.

---

## Build Queue

1. Apply migration `008_gateway_alias_policy.sql` in the deployed Postgres
   database.
2. Configure provider chains for the seven Document Vault aliases in the gateway
   admin UI.
3. Migrate Document Vault to use `SDM_GATEWAY_TOKEN`,
   `SDM_GATEWAY_URL`, and gateway alias names.

---

## Risk Register

1. **Rerank endpoint coverage:** This slice establishes the `doc-rerank` alias
   and policy metadata, but no separate rerank-specific public endpoint exists
   yet. If Document Vault needs a dedicated rerank API instead of a
   generation/structured call, that is the next implementation slice.
2. **Live provider-chain setup:** Seeded aliases intentionally have empty chains
   until providers are configured. Calls to empty aliases return clear errors.
3. **Generated system map stale:** `SYSTEM_MAP.md` is generated-only and now
   needs regeneration by the project meta-orchestrator after this build because
   tables, routes, and admin surfaces changed.
