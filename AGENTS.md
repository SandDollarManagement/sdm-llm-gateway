# AGENTS.md — sdm-llm-gateway

**This file is a pointer, not a rulebook.** It exists so Codex and Grok load the same rules
Claude Code already follows in this repo. Everything authoritative lives in the files it names.
Do not restate rules here: two copies drift, and the copy an agent happens to read wins.

## Read these first, in this order

1. `/root/.claude/CLAUDE.md` — the operator's global rules. Binding in every project.
2. `./CLAUDE.md` — this project's own rules and its canonical documentation map.

## This project's canonical docs

Findings **append** to these. Do not spawn a new tracker.

- `~/.claude/CLAUDE.md`
- `SYSTEM_MAP.md`
- `PROJECT_STATE.md`
- `FEATURE_SPECS.md`
- `KNOWN_GAPS.md`
- `OPEN_FEATURES.md`
- `OPEN_DECISIONS.md`
- `DECISION_LOG.md`
- `CLAUDE.md`

## What is true in every project, restated only because it is a boundary

- **Preston is not a coder.** Technical decisions are yours. Bring him product behaviour,
  business or legal judgement, external-account actions, irreversible live-data actions, and
  visible UI look/feel — nothing else.
- **Claude Code owns the governed merge.** Grok audits and explores read-only; Codex implements
  in an isolated workspace. Neither self-merges governed work unless this project says otherwise.
- **Never invent a number or a value.** Missing data stays blank and flagged `needs data`.
- **Silent failures always surface.** Anything that cannot complete must become visible to him,
  never a line in a log he will not read.
- **Destructive DATA operations need his approval and a backup proven to restore.** Code-only,
  reversible work does not.

## Before you act

If this project has `.claude/capabilities.json`, read it: it states what this system may
actually touch. If a capability you need is not listed, that is a `blocked`, not a guess.

_Generated 2026-08-15 by the AGENT-PLATFORM-GREATNESS-2026 build (gate 1, "project intake is
durable"). Regenerate rather than hand-edit; if this project needs bespoke agent rules, put them
in `./CLAUDE.md` where every tool already reads them._
