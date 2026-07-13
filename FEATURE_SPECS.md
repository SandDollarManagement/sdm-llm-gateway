# SDM LLM Gateway — Feature Specs (intent / requirements)

**Intent source of truth:** what each feature _should_ do + how to verify it.
The doc a full-system audit tests reality against. One entry per feature as
`FS-NNN`. Never invent intent for an undiscovered feature — it stays in
`OPEN_FEATURES.md` as "needs intent" until discussed, then graduates to an
`FS-NNN` here.

---

## FS-001 — Shared Gateway Alias and App Policy Layer

**Intent:** SDM LLM Gateway is the shared AI provider layer for Document Vault
and future SDM apps. Consumer apps call stable aliases through the gateway, not
raw provider/model names. The gateway owns provider credentials, alias metadata,
fallback policy, local/cloud eligibility, app tokens, per-app caps, usage logs,
and correlation IDs.

**First-class app aliases:**

| Alias           | Capability     | Fallback | Local-only eligible | Priority | Embedding metadata                                           |
| --------------- | -------------- | -------- | ------------------- | -------- | ------------------------------------------------------------ |
| `doc-answer`    | generation     | yes      | no                  | quality  | —                                                            |
| `doc-summarize` | generation     | yes      | no                  | balanced | —                                                            |
| `doc-rerank`    | rerank         | yes      | no                  | latency  | —                                                            |
| `doc-embed`     | embedding      | no       | no                  | cost     | 1536 dims, `openai-text-embedding`, `text-embedding-3-small` |
| `vision-ocr`    | vision         | yes      | no                  | balanced | —                                                            |
| `fast-classify` | classification | yes      | no                  | latency  | —                                                            |
| `local-private` | generation     | no       | yes                 | local    | —                                                            |

**Policy requirements:**

- `/v1/chat/completions`, `/v1/messages`, and `/v1/embeddings` accept gateway
  aliases instead of raw provider model names.
- Alias metadata includes capability type, fallback permission, local-only
  eligibility, retention notes, cost/latency priority, and embedding vector
  metadata when relevant.
- Per-app policy includes enabled/disabled state, allowed aliases, monthly cap,
  and whether fallback is allowed for that app.
- Fallback happens automatically only when both alias and app policy allow it.
- Local-only aliases reject cloud providers in their chain.
- Embedding aliases reject fallback entries with incompatible vector dimensions.
- Gateway logs provider failures, skipped/missing providers, policy failures,
  and correlation IDs without storing raw document content by default.

**Verification:**

- Unit tests cover alias resolution, fallback chain behavior, fallback-disabled
  behavior, local-only enforcement, incompatible embedding fallback rejection,
  missing provider credentials, embedding routing, app alias limits, monthly
  caps, and correlation ID preservation in logs/response metadata.

---

## FS-002 — Aether Sandbox lane

**Intent:** Give a low-trust, network-sealed build sandbox ("Aether", running the
Claude Code CLI and Codex CLI) scoped, capped, revocable access to build-tier
models through the gateway, so real Anthropic/OpenAI keys never enter the
sandbox. Every guardrail is mandatory and conservative-by-default.

**Requirements:**

- **Scoped virtual key** per sandbox build (or a single dedicated key), bound to
  the `aether-sandbox` project, independently revocable (disable/delete/rotate),
  minted only from the trusted admin side (never by the sandbox).
- **Hard spend cap**, project-wide AND per-key, that REFUSES (429, never queues)
  once reached. Defaults: $20/mo project, $5/mo per key. Easy to raise in the UI.
- **Rate limits**: requests/min and tokens/min ceilings (defaults 30 rpm / 60k
  tpm) so a looping build is throttled (429).
- **Model allowlist**: sandbox keys may reach ONLY `claude-sonnet-5` (build),
  `claude-haiku-4-5` (mechanical), and `gpt-5-codex` (Codex). Everything else is
  refused. The allowlist fails CLOSED (empty allowlist → refuse). Sandbox aliases
  are pinned to the api_key Anthropic provider — never the OAuth/Max path.
- **Per-request logging + spend alerts** at 50% and 90% of a cap, surfaced in the
  admin UI (dashboard + Projects), not only server logs.
- **One-action kill switch**: disabling the project refuses every key in it
  instantly, touching no other project/key (`scripts/aether-kill.js` or the
  Projects UI toggle).
- **Integration**: sandbox points Claude Code CLI at `ANTHROPIC_BASE_URL` (Anthropic
  Messages API) and Codex CLI at its `openai_base_url` (OpenAI API), both over
  HTTPS at `llm.sanddollarmanagementllc.com`. The `model` sent must be a sandbox
  alias name; any other value fails closed.

**Verification:**

- Unit tests (`policy-sandbox.test.js`, `cost.test.js`): kill switch → 403;
  fail-closed empty allowlist → 403; unpriced model → 403; rpm ceiling → 429;
  project cap → 429; per-key cap only when `budget_enforced`; OAuth entry in a
  sandbox chain rejected; happy-path under caps resolves; cost math for
  Sonnet/Haiku; unpriced model returns null (not zero).
- Build + lint green; all four routing paths compute cost from the resolved
  chain model and pass it to `logCall`.

**Known limitation (tracked):** this delivers the locked-down lane. Making both
CLIs actually run tool-using builds end-to-end requires tool-call + streaming
passthrough on `/v1/chat/completions` and `/v1/messages` — see `KNOWN_GAPS.md`
G-001. Until that ships, the sandbox is guardrail-ready but not build-capable.
