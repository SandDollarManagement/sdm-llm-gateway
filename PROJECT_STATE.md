# SDM LLM Gateway — PROJECT_STATE.md

> Operator: Preston Foreman
> Purpose: Single source of truth for where this project stands. Updated at the end of every working session.
> Convention: Replace contents on each update. Historical state lives in git history, not in this file.

---

## Current State

**Phase:** 2A code complete; awaiting deploy + seed run + first live test
**Status:** Gateway is live with Phase 1 (auth + admin shell). Phase 2A code written: claude CLI installed in Docker image, entrypoint hydrates credentials from `ANTHROPIC_OAUTH_TOKEN`, Anthropic-via-`claude -p` provider wrapper, alias routing, `/v1/chat/completions` endpoint, per-app bearer-token auth, call logging, seed script for test app.
**Version:** v0.2.0-pre (Phase 2A awaiting verification)

---

## Last Action Taken

- 2026-05-29 — Phase 2A built:
  - **Critical architectural pivot logged as D-020.** Verified that Anthropic disallows OAuth tokens against the Messages API (Feb 2026 ToS update + sustained 401 "OAuth authentication is currently not supported"). The Max plan credit path is the official `claude` CLI binary, which Anthropic permits on any VPS. D-005 narrative updated.
  - `Dockerfile`: installs `@anthropic-ai/claude-code` globally, sets `HOME=/app`, copies and runs `scripts/docker-entrypoint.sh` as PID 1.
  - `scripts/docker-entrypoint.sh`: writes `/app/.claude/.credentials.json` from `ANTHROPIC_OAUTH_TOKEN` if not already present, then execs the Next.js server. Idempotent for persistent-volume setups.
  - `src/lib/app-auth.js`: bearer token auth via SHA-256 hash lookup against `apps.token_hash`, supports `Authorization: Bearer` and `x-api-key` headers.
  - `src/lib/providers/anthropic-claude-cli.js`: spawns `claude -p <prompt>` with optional `--model`, captures stdout, returns OpenAI-compatible structure. 60s timeout.
  - `src/lib/routing/{resolve-alias,execute-call}.js`: alias-to-chain resolution and per-chain-entry execution with logging.
  - `src/lib/logging.js`: write-only `call_logs` insert with safe failure mode (logging errors never break the request).
  - `src/app/api/v1/chat/completions/route.js`: public OpenAI-compatible endpoint. Node runtime (not Edge) because of `spawn`.
  - `scripts/seed-phase2a.js`: idempotent seed that inserts the Anthropic provider, creates one test app with a freshly generated bearer token (printed once), and populates the `default` alias's `fallback_chain`.
  - `CLAUDE.md` and `.env.example` updated for the Path A design.

---

## Blockers

For the live test to succeed, two things still need to happen on the operator side after the push:

1. **Set `ANTHROPIC_OAUTH_TOKEN` in Coolify env vars** on `gateway-web`. Use the OAuth token from `claude setup-token`.
2. **(Optional but recommended) Mount a Coolify persistent volume at `/app/.claude`** on `gateway-web`. Without this, the credentials file gets rewritten on every redeploy — still works, but you lose any token refresh the CLI may have performed.

After the rebuild deploys, run inside the `gateway-web` container terminal:

```
node scripts/seed-phase2a.js
```

That prints the test app's bearer token. Save it; the database only retains the SHA-256 hash.

Then test from anywhere:

```
curl -X POST https://llm.sanddollarmanagementllc.com/v1/chat/completions \
  -H "Authorization: Bearer <token-from-seed>" \
  -H "Content-Type: application/json" \
  -d '{"model":"default","messages":[{"role":"user","content":"Say hi in 5 words."}]}'
```

Expected response: a JSON `chat.completion` object with a real Claude reply in `choices[0].message.content`, billed against the Max plan subscription credit.

---

## Next Decision Needed

If the live test succeeds, Phase 2A is done and Phase 2B (Anthropic API key fallback) is queued. If it fails, paste the error back and we iterate on whichever piece broke (claude CLI auth, child-process invocation, alias chain, etc.).

---

## Phase Roadmap

| Phase | Title                              | Estimated effort      | Status        |
|-------|------------------------------------|------------------------|---------------|
| 0     | Scaffolding & docs                 | 1 day                  | Complete      |
| 1     | Skeleton & auth                    | 2 days                 | Complete      |
| 2A    | Anthropic via claude CLI (single provider) | 0.5 day        | Code complete; awaiting verification |
| 2B    | Anthropic API key fallback         | 0.5 day                | Not started   |
| 2C    | LiteLLM container + multi-provider fallback | 1 day         | Not started   |
| 3     | (subsumed into 2B/2C above)        | —                      | —             |
| 4     | (subsumed into 2A — OAuth already done) | —                 | —             |
| 5     | Admin UI & usage dashboard         | 2 days                 | Not started   |
| 6     | Consumer app migration (per app)   | 1 day × 5 apps         | Not started   |

Originally Phase 2 was "LiteLLM + 1 provider via API key", Phase 3 was multi-provider, Phase 4 was Anthropic OAuth. Reordered after D-020 so the operator gets subscription-credit billing first (which is the whole point of the project).

---

## Risk Register

1. **Anthropic OAuth policy drift.** Already triggered once (D-020). API key path remains first-class.
2. **`claude` CLI credentials schema.** The credentials JSON format written by `docker-entrypoint.sh` is a best-effort match for what `claude setup-token` produces; if Anthropic changes the schema we'll see auth failures and need to update the entrypoint. Quick fix is to mount a persistent volume and run `claude setup-token` interactively once inside the container.
3. **LiteLLM maintenance.** Phase 2C onward.
4. **`GATEWAY_ENCRYPTION_KEY` loss.** Catastrophic if lost. Lives only in Coolify env vars (D-016 backup deferred at operator request).
5. **OAuth token expiry surprise.** OD-001 reminder mechanism resolves this in Phase 5 admin UI.
6. **Cost overrun on overflow billing.** Per-app monthly budget caps mitigate (Phase 5).
7. **Stack drift between docs and reality.** Verify against actual code; do not reconstruct from prior-session docs.

---

## Open Questions Not Yet Tracked

- _(none currently)_

---

## Session Handoff Notes

Phase 2A code is on disk and ready to commit. Push sequence: `git add . && git commit -m "Phase 2A: Anthropic via claude CLI (D-020 pivot)" && git push`. Coolify rebuilds, operator adds `ANTHROPIC_OAUTH_TOKEN` env var, optionally mounts the persistent volume at `/app/.claude`, runs the seed script, saves the test app bearer token, hits the endpoint with curl. If anything fails on the way, paste back and we iterate.
