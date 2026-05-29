# SDM LLM Gateway — PROJECT_STATE.md

> Operator: Preston Foreman
> Purpose: Single source of truth for where this project stands. Updated at the end of every working session.
> Convention: Replace contents on each update. Historical state lives in git history, not in this file.

---

## Current State

**Phase:** 0 complete → 1 ready to start
**Status:** All Phase 1 blockers resolved. Stack corrections (D-017, D-018, D-019) applied to all docs on 2026-05-29 after the prior session's CLAUDE.md was found to misrepresent the actual SDM stack. Docs now reflect reality.
**Version:** v0.0.1 (pre-commit)

---

## Last Action Taken

- 2026-05-29 — Setup session in chat:
  - Resolved OD-001, OD-002, OD-003, OD-005 → logged as D-013 through D-016.
  - Operator pushed back on Supabase ("I've never set up Supabase"). Verified actual stack against `SDM-Ops-Hub` code:
    - Language: JavaScript, not TypeScript.
    - Database: plain `pg` driver, no Supabase, no ORM.
    - Auth: NextAuth + Google OAuth + `ADMIN_EMAILS` whitelist, not `requireOperator()` + `OPERATOR_EMAIL`.
  - Logged three corrections: D-017 (Postgres in Coolify), D-018 (JavaScript), D-019 (NextAuth + Google OAuth).
  - Superseded D-006, D-007, D-015.
  - Rewrote `CLAUDE.md`, `.env.example`, `README.md` to match real stack.
  - Operator started external infra setup (DNS confirmed responding via Cloudflare, Coolify project pending, Postgres container pending).

---

## Blockers

None for Phase 1.

The following are NOT blockers for Phase 1 but must resolve before their respective phases:

- **OD-001 (was OD-004)** — OAuth reminder mechanism. Blocks Phase 4.
- **OD-002 (was OD-006)** — Per-agent alias ownership. Confirmed verbally as Option 1 (apps own it); promote to DECISION_LOG when Phase 6 begins.

---

## Next Decision Needed

None. The operator is working through external infrastructure setup (DNS → grey-cloud the Cloudflare record, Coolify project on the apps server, Postgres container, env vars, push docs to GitHub). Once that's done, the kickoff prompt (provided in setup chat) goes into Claude Code on the CC server to begin Phase 1.

---

## Phase Roadmap

| Phase | Title                              | Estimated effort      | Status        |
|-------|------------------------------------|------------------------|---------------|
| 0     | Scaffolding & docs                 | 1 day                  | Complete      |
| 1     | Skeleton & auth                    | 2 days                 | Ready to start |
| 2     | LiteLLM integration & 1 provider   | 1 day                  | Not started   |
| 3     | Multi-provider & aliases           | 1-2 days               | Not started   |
| 4     | Anthropic OAuth path               | 1 day                  | Not started   |
| 5     | Admin UI & usage dashboard         | 2 days                 | Not started   |
| 6     | Consumer app migration (per app)   | 1 day × 5 apps         | Not started   |

Total estimated effort to fully operational with all five apps migrated: ~10 working days with Claude Code on the server.

---

## Risk Register

1. **Anthropic OAuth policy drift.** Anthropic could further restrict subscription-auth use from server contexts. Mitigation: API key path is first-class, never deprecated. Gateway works fully without OAuth.
2. **LiteLLM maintenance.** Project is currently active but is a dependency we don't control. Mitigation: pin to a specific version; review releases before upgrading.
3. **`GATEWAY_ENCRYPTION_KEY` loss.** Catastrophic if lost. Mitigation: D-016 backup policy (Coolify + 1Password).
4. **OAuth token expiry surprise.** Token expires after one year; silent expiry breaks OAuth-first routing. Mitigation: OD-001 reminder mechanism (resolve in Phase 4).
5. **Cost overrun on overflow billing.** If a fallback chain consistently exhausts cheap providers and lands on Opus, costs can balloon. Mitigation: per-app monthly budget caps, hard-cap mode on OAuth credit, fallback rate alerts in admin UI.
6. **Stack drift between docs and reality.** Already triggered once (Supabase / TypeScript / requireOperator). Mitigation: Claude Code on the server is instructed in the kickoff prompt to verify against `SDM-Ops-Hub` patterns rather than trust the docs blindly.

---

## Open Questions Not Yet Tracked

- _(none currently)_

---

## Session Handoff Notes

Most recent session's context for Claude Code or the operator picking this up later:

> Docs are now accurate to the SDM stack. The four-file order to read remains the same: `CLAUDE.md` → `DECISION_LOG.md` → `OPEN_DECISIONS.md` → `PROJECT_STATE.md`. Claude Code on the server should, before writing any code, also `cat` the auth helper at `~/projects/SDM-Ops-Hub/src/lib/auth.js` (or whatever path is on the CC server) to confirm the NextAuth pattern to mirror. Pending operator setup steps: grey-cloud the `llm.sanddollarmanagementllc.com` record in Cloudflare, create Coolify project + Postgres container on the apps server, paste env vars, push docs to GitHub.
