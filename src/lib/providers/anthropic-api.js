// src/lib/providers/anthropic-api.js
// Anthropic provider using a pay-per-token API key (sk-ant-api03-...) via
// direct HTTPS to the Messages API.
//
// Exports:
//   callAnthropicViaApiKey({...})     — non-streaming, returns full response
//   streamAnthropicViaApiKey({...})   — streaming, returns async iterable of upstream events
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

  const { apiKey, baseUrl } = await loadProviderCreds(providerId)
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`

  const { system, anthropicMessages } = openAiToAnthropic(messages)
  const requestBody = {
    model,
    max_tokens: maxTokens,
    messages: anthropicMessages,
    stream: false,
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
    const err = new Error(`anthropic-api: HTTP ${response.status}: ${errText.slice(0, 500)}`)
    err.status = response.status
    err.latencyMs = latencyMs
    throw err
  }

  const data = await response.json()
  const content = Array.isArray(data.content)
    ? data.content.filter(c => c?.type === 'text').map(c => c.text).join('')
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
 * Faithful Anthropic Messages passthrough for the /v1/messages endpoint (D-022).
 *
 * Forwards the caller's ORIGINAL Anthropic-shaped request body to the Messages
 * API VERBATIM, overriding only `model` (alias -> resolved) and forcing
 * non-streaming. This preserves `system` (incl. cache_control blocks),
 * structured message content (tool_use / tool_result blocks), `tools`,
 * `tool_choice`, and sampling params — none of which the OpenAI-translation
 * path (openAiToAnthropic) carries.
 *
 * Returns the raw Anthropic response body so the consumer reads native content
 * (tool_use) and the full `usage` object (incl. cache_creation_input_tokens /
 * cache_read_input_tokens).
 *
 * SECURITY: builds a FRESH header set with the PROVIDER key. It NEVER spreads
 * the incoming request headers — the caller's `x-api-key` is the GATEWAY bearer
 * token; sending it upstream to Anthropic would 401. Only the two Anthropic
 * feature headers (`anthropic-version`, `anthropic-beta`) are forwarded.
 */
export async function callAnthropicMessagesRaw({
  providerId,
  anthropicRequest,
  model,
  forwardHeaders = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!anthropicRequest || !Array.isArray(anthropicRequest.messages) || anthropicRequest.messages.length === 0) {
    throw new Error('anthropic-api: anthropicRequest.messages array is required')
  }

  const { apiKey, baseUrl } = await loadProviderCreds(providerId)
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`

  // Verbatim forward; override only model + stream, and ensure max_tokens
  // (Anthropic requires it). The caller's value wins when present.
  const requestBody = {
    ...anthropicRequest,
    model,
    stream: false,
    max_tokens: anthropicRequest.max_tokens ?? DEFAULT_MAX_TOKENS,
  }

  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': forwardHeaders.version || '2023-06-01',
    'Content-Type': 'application/json',
  }
  if (forwardHeaders.beta) headers['anthropic-beta'] = forwardHeaders.beta

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
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
    const err = new Error(`anthropic-api: HTTP ${response.status}: ${errText.slice(0, 500)}`)
    err.status = response.status
    err.latencyMs = latencyMs
    throw err
  }

  const data = await response.json()
  return {
    model: data.model || model,
    raw_response: data,
    latency_ms: latencyMs,
    request_tokens: data.usage?.input_tokens ?? null,
    response_tokens: data.usage?.output_tokens ?? null,
  }
}

/**
 * Stream chat completions from Anthropic. Returns an async iterable that
 * yields raw Anthropic event objects:
 *   { type: 'message_start' | 'content_block_delta' | 'message_stop' | ..., ... }
 *
 * Callers translate to whichever wire format the consumer expects
 * (OpenAI SSE chunks, Anthropic SSE pass-through, etc.).
 */
export async function* streamAnthropicViaApiKey({
  providerId,
  messages,
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  abortSignal,
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('anthropic-api: messages array is required')
  }

  const { apiKey, baseUrl } = await loadProviderCreds(providerId)
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`

  const { system, anthropicMessages } = openAiToAnthropic(messages)
  const requestBody = {
    model,
    max_tokens: maxTokens,
    messages: anthropicMessages,
    stream: true,
  }
  if (system) requestBody.system = system

  const controller = new AbortController()
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    throw new Error(`anthropic-api stream: network error: ${err.message}`)
  }

  if (!response.ok) {
    clearTimeout(timer)
    let errText = ''
    try { errText = await response.text() } catch {}
    const err = new Error(`anthropic-api stream: HTTP ${response.status}: ${errText.slice(0, 500)}`)
    err.status = response.status
    throw err
  }

  try {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const evt = parseEventBlock(block)
        if (evt) yield evt
      }
    }
  } finally {
    clearTimeout(timer)
  }
}

async function loadProviderCreds(providerId) {
  const providerRow = await queryOne(
    'SELECT credentials, base_url FROM providers WHERE id = $1',
    [providerId]
  )
  if (!providerRow) throw new Error(`Provider ${providerId} not found`)
  const apiKey = decrypt(providerRow.credentials)
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    throw new Error('anthropic-api: decrypted credential is not a valid Anthropic key')
  }
  return { apiKey, baseUrl: providerRow.base_url || DEFAULT_BASE_URL }
}

function parseEventBlock(block) {
  let eventName = null
  let dataParts = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) eventName = line.slice(7).trim()
    else if (line.startsWith('data: ')) dataParts.push(line.slice(6))
  }
  if (dataParts.length === 0) return null
  const dataRaw = dataParts.join('\n')
  let parsed
  try { parsed = JSON.parse(dataRaw) } catch { return { event: eventName, raw: dataRaw } }
  return { event: eventName || parsed?.type || 'unknown', ...parsed }
}

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
