// src/lib/providers/litellm.js
// Provider adapter for everything that's not Anthropic. Sends a request to
// the LiteLLM proxy running in the gateway-litellm container; LiteLLM owns
// the actual HTTPS call to OpenAI / Gemini / Grok / OpenRouter / etc.
//
// The `model` argument is the LiteLLM model_name from litellm-config.yaml
// (e.g. "openai-gpt-4o", "gemini-2.5-pro"). NOT the upstream provider's
// raw model string — LiteLLM does that mapping internally.

import { randomUUID } from 'node:crypto'

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * @param {object} opts
 * @param {Array}  opts.messages       OpenAI-style messages array.
 * @param {string} opts.model          LiteLLM model_name (e.g. "openai-gpt-4o").
 * @param {number} [opts.timeoutMs]    Default 60s.
 */
export async function callViaLiteLLM({ messages, model, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const baseUrl = process.env.LITELLM_INTERNAL_URL
  const masterKey = process.env.LITELLM_MASTER_KEY
  if (!baseUrl) throw new Error('LITELLM_INTERNAL_URL is not set')
  if (!masterKey) throw new Error('LITELLM_MASTER_KEY is not set')
  if (!model) throw new Error('litellm: a model name is required (the LiteLLM model_name from config)')

  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const startedAt = Date.now()
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${masterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const e = new Error(`litellm: network error talking to ${url}: ${err.message}`)
    e.latencyMs = Date.now() - startedAt
    throw e
  }
  clearTimeout(timer)

  const latencyMs = Date.now() - startedAt

  if (!response.ok) {
    let errText = ''
    try { errText = await response.text() } catch {}
    const err = new Error(`litellm: HTTP ${response.status}: ${errText.slice(0, 500)}`)
    err.status = response.status
    err.latencyMs = latencyMs
    throw err
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content || ''

  return {
    id: `chatcmpl-${randomUUID()}`,
    model: data?.model || model,
    content,
    raw_response: data,
    latency_ms: latencyMs,
    request_tokens: data?.usage?.prompt_tokens ?? null,
    response_tokens: data?.usage?.completion_tokens ?? null,
  }
}
