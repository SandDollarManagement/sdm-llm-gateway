# SDM LLM Gateway — OPEN_DECISIONS.md

> Operator: Preston Foreman
> Purpose: Decisions awaiting operator input. Once resolved, each decision moves to DECISION_LOG.md as `D-020` onward.
> Last updated: 2026-05-29

---

## Status

Phase 1 is **unblocked**. All four original Phase 1 blockers (OD-001, OD-002, OD-003, OD-005) were resolved on 2026-05-29 and logged as `D-013` through `D-016` in `DECISION_LOG.md`. Three additional stack corrections (D-017, D-018, D-019) were logged the same day after the operator caught the prior session's Supabase / TypeScript / requireOperator assumptions as wrong.

Two open decisions remain, both for later phases.

---

## Format

Each open decision has:
- **ID** — `OD-NNN`, renumbered as decisions resolve.
- **Question** — what needs deciding.
- **Why it matters** — what depends on the answer.
- **Blocks** — which phase(s) cannot start without this.
- **Options** — concrete choices, with the recommended option marked.
- **Recommended call** — what I'd do and why.

---

## OD-001 — OAuth token rotation reminder mechanism

- **Question:** How does the operator get reminded to rotate the Anthropic OAuth token before its one-year expiry?
- **Why it matters:** If the token expires silently, OAuth-first routing fails for every Anthropic call until refresh. Apps still work (API key fallback) but the $200/mo subscription credit goes unused.
- **Blocks:** Phase 4 (OAuth path implementation).
- **Options:**
  1. **In-app reminder.** Admin UI banner appears 30 days before expiry, persistent until token is refreshed. Email alert at 14 days and 3 days.
  2. **Calendar event only.** Operator sets a personal calendar reminder. Gateway does nothing.
  3. **In-app reminder + calendar event.** Redundancy.
- **Recommended call:** **Option 3 (both).** In-app reminder is the primary system but depends on the operator logging into the admin UI within the warning window. A calendar reminder is a 30-second one-time setup that catches the case where the operator doesn't visit the admin UI for a few weeks.

---

## OD-002 — Which side owns per-agent alias selection?

- **Question:** When an app's agent (e.g. AI Social Posting App's Image Analyst) needs to use a specific alias, where is that selection stored?
- **Why it matters:** Determines whether the operator changes "Image Analyst uses `vision`" in the app's settings UI or in the gateway's admin UI. Affects developer mental model and where to look when something is misconfigured.
- **Blocks:** Phase 6 (consumer app migration patterns).
- **Options:**
  1. **App owns it.** Each app's existing settings UI stores which alias each agent uses. App passes that alias to the gateway on every call. Gateway only owns the alias → provider chain mapping.
  2. **Gateway owns it.** Gateway has a per-app-per-agent alias table. Apps just identify themselves and their agent; gateway resolves both alias and chain.
  3. **Both.** App provides default, gateway can override per agent.
- **Recommended call:** **Option 1 (app owns it).** Clean separation of concerns: apps own their domain logic (which agent does what), gateway owns its infrastructure logic (how aliases route). Confirmed verbally with operator on 2026-05-29 in setup chat; promote to DECISION_LOG when Phase 6 begins.

---

## Notes

- Decisions can be batched and answered in one pass.
- New open decisions discovered during the build go here, not into DECISION_LOG.md, until they're resolved.
- When all open decisions are resolved, this file may be emptied or kept as a template.
