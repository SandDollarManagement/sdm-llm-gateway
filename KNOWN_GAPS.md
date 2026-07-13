# SDM LLM Gateway — Known Gaps

Bugs, gaps, and the intent-vs-reality delta (what's built vs. what `FEATURE_SPECS.md`
says it should do). Consciously-deferred work lives here with its rationale and
what would unblock it. One entry per gap as `G-NNN`.

---

_No known gaps yet._

---

## G-001 — CLI tool-call + streaming passthrough (blocks end-to-end sandbox builds)

- **Status:** OPEN — tracked follow-on to FS-002 (the Aether Sandbox lane).
- **Delta:** FS-002 delivers the guardrails, but the CLIs cannot run real
  tool-using builds through the gateway yet:
  - `/v1/chat/completions` → `callViaLiteLLM` sends only `{model, messages}`,
    dropping `tools`/`tool_choice`/`max_tokens`/`temperature`/`stream`; and the
    response reconstruction drops `tool_calls`. **Codex CLI cannot function.**
    OpenAI streaming does not exist at all (`stream-call.js` only streams the
    Anthropic api_key provider).
  - `/v1/messages` non-streaming is a faithful passthrough (D-022), but the
    STREAMING path normalizes to text-only and strips `tool_use`/`tool_result`.
    **Claude Code CLI streams by default and uses tools**, so streaming tool use
    is silently lost.
- **Why it matters:** this touches the shared `/v1/messages` and
  `/v1/chat/completions` RESPONSE CONTRACT (cross-project surface), so it needs
  its own planning-council pass. Do NOT ship it bundled with the guardrails.
- **Unblock:** (a) forward tools/params to LiteLLM and reconstruct the OpenAI
  tool-call response shape (+ a net-new OpenAI streaming adapter); (b) a faithful
  Anthropic streaming passthrough that preserves tool blocks. Then wire the
  sandbox aliases' Codex chain (needs an `openai` api_key provider) and price
  `gpt-5-codex`.

## G-002 — Cap is post-hoc; rate limits are best-effort

- **Status:** OPEN / accepted limitation (documented, not a bug).
- **Delta:** The spend cap is evaluated BEFORE a call from already-logged cost,
  so the request that crosses the cap still runs (plus any concurrent in-flight);
  the gateway refuses the NEXT request (429, never queues). Overshoot is bounded
  by `alias.max_output_tokens` (sandbox aliases clamp to 8192). Rate limits count
  `call_logs` rows in a trailing 60s window, so in-flight requests are invisible
  and the limit is a best-effort throttle, not a hard limiter (no shared counter
  across instances — verify `gateway-web` runs single-instance before relying on
  it as more than a throttle). The spend cap is the real backstop.
- **Unblock (if ever needed):** a shared-state limiter (Redis) for hard rpm/tpm,
  and/or a pre-call token reservation for a strict cap.

## G-003 — `gpt-5-codex` unpriced until confirmed

- **Status:** OPEN — needs data.
- **Delta:** `model_prices` seeds Sonnet 5 ($3/$15) and Haiku 4.5 ($1/$5) but NOT
  `gpt-5-codex` (never invent a number). A budget-enforced key therefore REFUSES
  Codex calls (`model_unpriced`) until its real per-MTok price is added via a new
  migration. Safe by design — spend is never under-counted — but Codex is
  non-functional for sandbox keys until priced (moot until G-001 lands anyway).

## G-004 — Streaming policy refusals surface as SSE error at HTTP 200, not 429/403

- **Status:** OPEN / accepted architectural limitation (pre-existing, inherited by
  the new caps + kill switch).
- **Delta:** `pickStreamableEntry` runs `enforceAppPolicy` inside the
  `ReadableStream.start()` callback, after the `Response` has already committed a
  200 status. So on the streaming transport a kill-switch/rate-limit/spend-cap
  refusal is delivered as an in-band `event: error` SSE frame at HTTP 200, not a
  real 429/403. A streaming client that only checks HTTP status won't see the
  block. Non-streaming paths return the correct status.
- **Why deferred:** SSE cannot change status after headers commit; the fix is to
  run policy checks BEFORE opening the stream (move `pickStreamableEntry`'s policy
  enforcement into the route handler ahead of the `Response`), which is best done
  with the G-001 streaming rework.
- **Mitigation today:** the CLIs treat SSE error frames as errors, and the
  non-streaming cap still refuses; the kill switch also disables the key so the
  next request (stream or not) is refused.
