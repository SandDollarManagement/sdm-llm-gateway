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
