// src/lib/routing/stream-call.js
// Streaming variant of execute-call. Resolves the alias's chain and uses
// the FIRST Anthropic-api-key entry as the provider (multi-provider
// streaming fallback is deferred to a later phase). Yields events in the
// format the caller requests (OpenAI SSE chunks or Anthropic pass-through).

import { resolveAlias } from '@/lib/routing/resolve-alias'
import { streamAnthropicViaApiKey } from '@/lib/providers/anthropic-api'
import { logCall } from '@/lib/logging'
import { randomUUID } from 'node:crypto'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Pick the first chain entry whose provider is "anthropic api_key" — the
 * only provider currently supported for streaming.
 */
async function pickStreamableEntry({ aliasName }) {
  const { alias, providers } = await resolveAlias({
    workspaceId: WORKSPACE_ID,
    aliasName,
  })
  const providerById = new Map(providers.map(p => [p.id, p]))
  for (let i = 0; i < alias.fallback_chain.length; i++) {
    const entry = alias.fallback_chain[i]
    const provider = providerById.get(entry.provider_id)
    if (!provider || !provider.enabled) continue
    if (provider.name.toLowerCase() === 'anthropic' && provider.auth_type === 'api_key') {
      return { alias, provider, entry, position: i }
    }
  }
  throw new Error(
    `alias "${aliasName}" has no streamable provider. Streaming currently supports anthropic (api_key) only; add one to the chain.`
  )
}

/**
 * Stream chat completions in OpenAI-compatible SSE format. Yields strings
 * ready to write to the response body.
 *
 * Format per OpenAI:
 *   data: {"id":"chatcmpl-XXX","object":"chat.completion.chunk","choices":[{"delta":{...}}]}\n\n
 *   data: [DONE]\n\n
 */
export async function* streamChatCompletionsOpenAI({ aliasName, app, messages, abortSignal }) {
  const { alias, provider, entry } = await pickStreamableEntry({ aliasName })
  const completionId = `chatcmpl-${randomUUID()}`
  const created = Math.floor(Date.now() / 1000)
  const startedAt = Date.now()
  let firstChunkSent = false
  let totalContent = ''
  let inputTokens = null
  let outputTokens = null
  let resolvedModel = entry.model || null
  let errored = null

  try {
    for await (const evt of streamAnthropicViaApiKey({
      providerId: provider.id,
      messages,
      model: entry.model,
      abortSignal,
    })) {
      if (evt.event === 'message_start' && evt.message) {
        resolvedModel = evt.message.model || resolvedModel
        inputTokens = evt.message.usage?.input_tokens ?? inputTokens
        if (!firstChunkSent) {
          firstChunkSent = true
          yield formatChunk(completionId, created, alias.name, resolvedModel, { role: 'assistant', content: '' })
        }
      } else if (evt.event === 'content_block_delta' && evt.delta?.type === 'text_delta') {
        const text = evt.delta.text || ''
        if (text) {
          totalContent += text
          yield formatChunk(completionId, created, alias.name, resolvedModel, { content: text })
        }
      } else if (evt.event === 'message_delta' && evt.usage) {
        outputTokens = evt.usage.output_tokens ?? outputTokens
      } else if (evt.event === 'message_stop') {
        yield formatChunk(completionId, created, alias.name, resolvedModel, {}, 'stop')
      }
    }
    yield 'data: [DONE]\n\n'
  } catch (err) {
    errored = err
    const errPayload = JSON.stringify({
      error: { message: err.message, type: 'gateway_error' },
    })
    yield `data: ${errPayload}\n\n`
    yield 'data: [DONE]\n\n'
  } finally {
    await logCall({
      workspaceId: WORKSPACE_ID,
      appId: app?.id ?? null,
      alias: alias.name,
      providerId: provider.id,
      model: resolvedModel,
      authMethod: provider.auth_type,
      requestTokens: inputTokens,
      responseTokens: outputTokens ?? (totalContent ? Math.ceil(totalContent.length / 4) : null),
      latencyMs: Date.now() - startedAt,
      status: errored ? 500 : 200,
      error: errored ? errored.message?.slice(0, 1000) : null,
      fallbackPosition: 0,
    })
  }
}

function formatChunk(id, created, aliasName, model, delta, finishReason = null) {
  const chunk = {
    id,
    object: 'chat.completion.chunk',
    created,
    model: aliasName,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
    _gateway: { resolved_model: model },
  }
  return `data: ${JSON.stringify(chunk)}\n\n`
}

/**
 * Stream in Anthropic-native SSE format, passing events through almost
 * untouched. Used by /v1/messages.
 */
export async function* streamMessagesAnthropic({ aliasName, app, messages, system, maxTokens, abortSignal }) {
  const { alias, provider, entry } = await pickStreamableEntry({ aliasName })
  const startedAt = Date.now()
  let inputTokens = null
  let outputTokens = null
  let resolvedModel = entry.model || null
  let errored = null

  try {
    // For /v1/messages the caller already gave us Anthropic-shape input.
    // streamAnthropicViaApiKey accepts our OpenAI-style messages, so convert
    // the system + messages back into something it understands.
    const merged = system
      ? [{ role: 'system', content: system }, ...messages]
      : messages

    for await (const evt of streamAnthropicViaApiKey({
      providerId: provider.id,
      messages: merged,
      model: entry.model,
      maxTokens,
      abortSignal,
    })) {
      if (evt.event === 'message_start' && evt.message) {
        resolvedModel = evt.message.model || resolvedModel
        inputTokens = evt.message.usage?.input_tokens ?? inputTokens
      } else if (evt.event === 'message_delta' && evt.usage) {
        outputTokens = evt.usage.output_tokens ?? outputTokens
      }
      const out = { ...evt }
      delete out.event
      yield `event: ${evt.event}\ndata: ${JSON.stringify(out)}\n\n`
    }
  } catch (err) {
    errored = err
    yield `event: error\ndata: ${JSON.stringify({ type: 'error', error: { message: err.message } })}\n\n`
  } finally {
    await logCall({
      workspaceId: WORKSPACE_ID,
      appId: app?.id ?? null,
      alias: alias.name,
      providerId: provider.id,
      model: resolvedModel,
      authMethod: provider.auth_type,
      requestTokens: inputTokens,
      responseTokens: outputTokens,
      latencyMs: Date.now() - startedAt,
      status: errored ? 500 : 200,
      error: errored ? errored.message?.slice(0, 1000) : null,
      fallbackPosition: 0,
    })
  }
}
