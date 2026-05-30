// src/lib/providers/anthropic-api.js
// Anthropic provider using a pay-per-token API key (sk-ant-api03-...) via
// direct HTTPS to the Messages API. Used as the second-priority fallback in
// the default alias chain: when the claude-CLI path (Phase 2A) fails or the
// monthly subscription credit is exhausted, this provider takes over.
//
// Credentials are stored encrypted in providers.credentials (D-009) and
// decrypted only here at call time. Plaintext never leaves this module.

import { queryOne } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { randomUUID } from 'node:crypto'

const DEFAULT_BASE_URL = 'https://api.anthropic.com'
const DEFAULT_MODEL = 'claude-sonnet-4-5'
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Call Anthropic via API key.
 *
 * @param {object} opts
 * @param {string} opts.providerId       Provider row id (DB-side credentials lookup).
 * @param {Array}  opts.messages         OpenAI-style messages array.
 * @param {string} [opts.model]          Anthropic model name (e.g. claude-sonnet-4-5).
 * @param {number} [opts.maxTokens]      Anthropic max_tokens. Default 4096.
 * @param {number} [opts.timeoutMs]      Network timeout. Default 60s.
 * @returns {Promise<{
 *   id: string,
 *   model: string,
 *   content: string,
 *   raw_response: object,
 *   latency_ms: number,
 *   request_tokens: number|null,
 *   response_tokens: number|null,
 * }>}
 */
export async function callAnthropicViaApiKey({
  providerId,
  messages,
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('anthropic-api: messages array is required')
  }

  const providerRow = await queryOne(
    'SELECT credentials, base_url FROM providers WHERE id = $1',
    [providerId]
  )
  if (!providerRow) throw new Error(`Provider ${providerId} not found`)

  const apiKey = decrypt(providerRow.credentials)
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    throw new Error('anthropic-api: decrypted credential is not a valid Anthropic key')
  }

  const baseUrl = providerRow.base_url || DEFAULT_BASE_URL
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`

  const { system, anthropicMessages } = openAiToAnthropic(messages)
  const requestBody = {
    model,
    max_tokens: maxTokens,
    messages: anthropicMessages,
  }
  if (system) requestBody.system = system

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const startedAt = Date.now()
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const e = new Error(`anthropic-api: network error: ${err.message}`)
    e.latencyMs = Date.now() - startedAt
    throw e
  }
  clearTimeout(timer)

  const latencyMs = Date.now() - startedAt

  if (!response.ok) {
    let errText = ''
    try { errText = await response.text() } catch {}
    const err = new Error(
      `anthropic-api: HTTP ${response.status}: ${errText.slice(0, 500)}`
    )
    err.status = response.status
    err.latencyMs = latencyMs
    throw err
  }

  const data = await response.json()
  const content = Array.isArray(data.content)
    ? data.content
        .filter(c => c?.type === 'text')
        .map(c => c.text)
        .join('')
    : ''

  return {
    id: `chatcmpl-${randomUUID()}`,
    model: data.model || model,
    content,
    raw_response: data,
    latency_ms: latencyMs,
    request_tokens: data.usage?.input_tokens ?? null,
    response_tokens: data.usage?.output_tokens ?? null,
  }
}

/**
 * Convert OpenAI-style messages to Anthropic's format.
 * OpenAI puts the system prompt as a message with role:"system" inline;
 * Anthropic takes it as a top-level `system` field. Anthropic also requires
 * messages to alternate user/assistant and never have consecutive same-role.
 */
function openAiToAnthropic(messages) {
  let systemParts = []
  const anthropicMessages = []
  for (const m of messages) {
    const content = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map(c => (typeof c === 'string' ? c : c?.text || '')).join('')
        : ''
    if (m.role === 'system') {
      if (content) systemParts.push(content)
    } else if (m.role === 'user' || m.role === 'assistant') {
      // Merge with previous message if same role to avoid Anthropic's
      // "messages must alternate" error.
      const prev = anthropicMessages[anthropicMessages.length - 1]
      if (prev && prev.role === m.role) {
        prev.content = `${prev.content}\n\n${content}`
      } else {
        anthropicMessages.push({ role: m.role, content })
      }
    }
  }
  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : null,
    anthropicMessages,
  }
}
