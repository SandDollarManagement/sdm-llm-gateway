# SDM LLM Gateway — PROJECT_STATE.md

> Operator: Preston Foreman
> Purpose: Single source of truth for where this project stands. Updated at the end of every working session.
> Convention: Replace contents on each update. Historical state lives in git history, not in this file.

---

## Current State

**Phase:** 1 complete → 2 ready to start
**Status:** Gateway live at `https://llm.sanddollarmanagementllc.com`. Google OAuth + `ADMIN_EMAILS` whitelist working. Database migrated, default workspace seeded, five default aliases seeded with empty fallback chains awaiting Phase 2 provider config.
**Version:** v0.1.0 (Phase 1 shipped)

---

## Last Action Taken

- 2026-05-29 — Phase 1 deployed and verified:
  - Pushed scaffolding, migrations, lib helpers, NextAuth setup, admin shell, and stub pages.
  - Build journey hit five issues in sequence — commit not pushed, npm install OOM, incomplete lockfile from `--package-lock-only`, missing `public/` folder, pg pruned from Next.js standalone — all resolved in-chat without server-side debugging.
  - Final fix: copied `pg` + transitive deps explicitly in Dockerfile runner stage so `scripts/migrate.js` can `require('pg')`.
  - Ran `node scripts/migrate.js` once inside the `gateway-web` container; all 7 migrations applied cleanly. Re-run confirmed idempotency (skipped all 7).
  - Verified login flow: Google OAuth consent screen (set to External, with operator added as test user) → redirect to `/dashboard` → all seven admin pages render their stubs.

---

## Blockers

None for Phase 2 in principle, but operator input needed on a couple of things before code:
- **Anthropic API key.** Phase 2 needs `sk-ant-api03-...`. Generate at `https://console.anthropic.com/settings/keys` if not already on hand.
- **LiteLLM container destination.** Add as a new resource inside the existing `sdm-llm-gateway` Coolify project (same Docker network as `gateway-web` and `gateway-db`).

---

## Next Decision Needed

Operator to confirm Phase 2 scope (LiteLLM container + Anthropic API key provider + working `/v1/chat/completions` endpoint with logging to `call_logs`) and provide the Anthropic API key when prompted.

---

## Phase Roadmap

| Phase | Title                              | Estimated effort      | Status        |
|-------|------------------------------------|------------------------|---------------|
| 0     | Scaffolding & docs                 | 1 day                  | Complete      |
| 1     | Skeleton & auth                    | 2 days                 | Complete      |
| 2     | LiteLLM integration & 1 provider   | 1 day                  | Ready to start |
| 3     | Multi-provider & aliases           | 1-2 days               | Not started   |
| 4     | Anthropic OAuth path               | 1 day                  | Not started   |
| 5     | Admin UI & usage dashboard         | 2 days                 | Not started   |
| 6     | Consumer app migration (per app)   | 1 day × 5 apps         | Not started   |

---

## Risk Register

1. **Anthropic OAuth policy drift.** API key path remains first-class.
2. **LiteLLM maintenance.** Pin to a specific version in Phase 2; review releases before upgrading.
3. **`GATEWAY_ENCRYPTION_KEY` loss.** Catastrophic if lost. Currently lives only in Coolify env vars (D-016 backup deferred at operator request).
4. **OAuth token expiry surprise.** OD-001 reminder mechanism resolves this in Phase 4.
5. **Cost overrun on overflow billing.** Per-app monthly budget caps mitigate (Phase 5).
6. **Stack drift between docs and reality.** Mitigated by reading Ops Hub patterns directly when in doubt.

---

## Open Questions Not Yet Tracked

- _(none currently)_

---

## Session Handoff Notes

Phase 1 verified live. Phase 2 plan: add LiteLLM container to the Coolify project, create `litellm-config.yaml` with Anthropic as the first provider, build thin wrapper at `/api/v1/chat/completions` that verifies app bearer token then forwards to LiteLLM and logs the call. Will also need a seed script to insert: (a) the Anthropic provider record with encrypted API key, (b) one test app with bearer token, (c) populate the `default` alias's `fallback_chain` to point at Anthropic Sonnet. End-to-end test: a curl request to `/v1/chat/completions` with the test app's bearer token and `model: "default"` should return a Sonnet response and write a `call_logs` row.
