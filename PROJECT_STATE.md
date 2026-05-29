# SDM LLM Gateway — PROJECT_STATE.md

> Operator: Preston Foreman
> Purpose: Single source of truth for where this project stands. Updated at the end of every working session.
> Convention: Replace contents on each update. Historical state lives in git history, not in this file.

---

## Current State

**Phase:** 1 code complete, awaiting first deploy
**Status:** All Phase 1 files written. Pending: operator pushes to GitHub, Coolify auto-builds and deploys, operator runs migrations once container is running, operator verifies Google login flow.
**Version:** v0.1.0

---

## Last Action Taken

- 2026-05-29 — Phase 1 written directly from operator chat (the CC web tool was unusable due to a workspace-path restriction the operator can't change from the UI):
  - Scaffolding: `package.json`, `next.config.js`, `jsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `Dockerfile` (multi-stage, npm ci, standalone output), `docker-compose.yml` (web only — LiteLLM container deferred to Phase 2), `.dockerignore`.
  - Migrations + runner: `scripts/migrate.js` (transactional, idempotent, tracks applied set in `_migrations` table) and seven SQL files in `migrations/` covering all six domain tables plus the seed (single workspace row + five default aliases with empty fallback chains).
  - Libs: `src/lib/db.js` (pg Pool + `query` / `queryOne` / `dbInsertMany` mirroring Ops Hub's signature), `src/lib/crypto.js` (AES-256-GCM encrypt/decrypt with `GATEWAY_ENCRYPTION_KEY` + `sha256Hex` helper for app tokens), `src/lib/auth.js` (NextAuth + GoogleProvider + `ADMIN_EMAILS` whitelist, simplified for single-operator service).
  - App router: dark-mode `layout.js`, root redirect (`/` → `/dashboard` or `/login`), `/login` page mirroring Ops Hub aesthetic, `src/app/api/auth/[...nextauth]/route.js`, `src/middleware.js` protecting all admin routes via `next-auth/middleware`.
  - Admin shell: `src/components/AdminShell.js` (sidebar + nav + sign-out), `src/components/PhaseStub.js` (placeholder body), and stub pages for `/dashboard`, `/providers`, `/aliases`, `/apps`, `/usage`, `/logs`, `/settings`. Each shows the title and a "Coming in Phase N" note.

---

## Blockers

None for first deploy. After deploy, verify:
- Build succeeds in Coolify.
- Container can reach Postgres at the internal hostname `m14bxmn9brdknd42put4wpet`.
- Migrations apply cleanly.
- Google OAuth redirect succeeds (callback URL `https://llm.sanddollarmanagementllc.com/api/auth/callback/google` must match exactly what's registered in Google Cloud Console).
- Let's Encrypt SSL provisions once the container is reachable.

---

## Next Decision Needed

None. Operator runs the git push command, watches Coolify build, runs the migration command via Coolify's web terminal, then opens the URL and verifies login.

---

## Phase Roadmap

| Phase | Title                              | Estimated effort      | Status        |
|-------|------------------------------------|------------------------|---------------|
| 0     | Scaffolding & docs                 | 1 day                  | Complete      |
| 1     | Skeleton & auth                    | 2 days                 | Code complete; awaiting deploy verification |
| 2     | LiteLLM integration & 1 provider   | 1 day                  | Not started   |
| 3     | Multi-provider & aliases           | 1-2 days               | Not started   |
| 4     | Anthropic OAuth path               | 1 day                  | Not started   |
| 5     | Admin UI & usage dashboard         | 2 days                 | Not started   |
| 6     | Consumer app migration (per app)   | 1 day × 5 apps         | Not started   |

---

## Risk Register

1. **Anthropic OAuth policy drift.** API key path remains first-class.
2. **LiteLLM maintenance.** Pin to a specific version in Phase 2; review releases before upgrading.
3. **`GATEWAY_ENCRYPTION_KEY` loss.** Catastrophic if lost. Currently lives only in Coolify env vars (D-016 backup deferred at operator request); recovery cost is re-pasting every provider credential.
4. **OAuth token expiry surprise.** OD-001 reminder mechanism resolves this in Phase 4.
5. **Cost overrun on overflow billing.** Per-app monthly budget caps mitigate (Phase 5).
6. **Stack drift between docs and reality.** Mitigated by reading Ops Hub patterns directly when in doubt (already done for Phase 1).

---

## Session Handoff Notes

Phase 1 source is fully written and locally committed-ready. Pending operator actions on next return:
1. `git push` from PowerShell.
2. Watch Coolify auto-build the new commit.
3. Once `gateway-web` container is running, open Coolify's terminal for that container and run `node scripts/migrate.js` to apply the seven SQL migrations.
4. Open `https://llm.sanddollarmanagementllc.com`. Should redirect to `/login`. Sign in with Google as `sanddollarmanagementllc@gmail.com`. After successful sign-in, browser should land on `/dashboard` showing the admin shell with sidebar nav and a "Coming in Phase 5" placeholder.
5. If anything fails, paste the error or screenshot back into chat.
