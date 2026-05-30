// src/lib/routing/execute-call.js
// Orchestrate a single chat-completion call through the gateway:
//   1. Resolve the alias to a fallback chain of providers.
//   2. Try each provider in chain order until one succeeds.
//   3. Log every attempt (success or failure) to call_logs.
//   4. Return the first successful response in OpenAI-compatible shape.
//
// Phase 2A: only the Anthropic-via-claude-CLI provider is wired up.
// Phase 3 will add other providers (OpenAI, Gemini, Grok, OpenRouter) and
// the fallback loop will exercise multiple entries.

import { resolveAlias } from '@/lib/routing/resolve-alias'
import { callAnthropicViaClaudeCli } from '@/lib/providers/anthropic-claude-cli'
import { logCall } from '@/lib/logging'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001' // seed workspace

/**
 * @param {object} opts
 * @param {string} opts.aliasName
 * @param {object} opts.app             The app row from authenticateAppRequest.
 * @param {Array}  opts.messages        OpenAI-style messages array.
 * @returns {Promise<{
 *   completion: object,
 *   providerId: string,
 *   model: string,
 *   authMethod: string,
 *   latencyMs: number
 * }>}
 */
export async function executeChatCompletion({ aliasName, app, messages }) {
  const { alias, providers } = await resolveAlias({
    workspaceId: WORKSPACE_ID,
    aliasName,
  })

  const providerById = new Map(providers.map(p => [p.id, p]))
  const errors = []

  for (let i = 0; i < alias.fallback_chain.length; i++) {
    const entry = alias.fallback_chain[i]
    const provider = providerById.get(entry.provider_id)
    if (!provider) {
      errors.push({ position: i, error: `provider ${entry.provider_id} not found` })
      continue
    }
    if (!provider.enabled) {
      errors.push({ position: i, error: `provider ${provider.name} disabled` })
      continue
    }

    try {
      const result = await tryProvider({ provider, entry, messages })
      // Success — log and return.
      await logCall({
        workspaceId: WORKSPACE_ID,
        appId: app.id,
        alias: alias.name,
        providerId: provider.id,
        model: result.model,
        authMethod: provider.auth_type,
        latencyMs: result.latency_ms,
        status: 200,
        fallbackPosition: i,
      })
      return {
        completion: toOpenAIChatCompletion({
          aliasName: alias.name,
          model: result.model,
          content: result.content,
          id: result.id,
        }),
        providerId: provider.id,
        model: result.model,
        authMethod: provider.auth_type,
        latencyMs: result.latency_ms,
      }
    } catch (err) {
      errors.push({ position: i, error: err.message })
      await logCall({
        workspaceId: WORKSPACE_ID,
        appId: app.id,
        alias: alias.name,
        providerId: provider.id,
        model: entry.model || null,
        authMethod: provider.auth_type,
        latencyMs: err.latencyMs ?? null,
        status: err.exitCode ?? 500,
        error: err.message?.slice(0, 1000),
        fallbackPosition: i,
      })
      // continue to next entry in chain
    }
  }

  const summary = errors
    .map(e => `[${e.position}] ${e.error}`)
    .join(' | ')
  throw new Error(`All providers in chain failed for alias "${aliasName}": ${summary}`)
}

async function tryProvider({ provider, entry, messages }) {
  // Phase 2A: only Anthropic-via-claude-CLI is implemented.
  if (provider.name.toLowerCase() === 'anthropic') {
    return callAnthropicViaClaudeCli({
      messages,
      model: entry.model || undefined,
    })
  }
  // Stub for other providers — wired up in Phase 3.
  throw new Error(
    `provider "${provider.name}" is not yet implemented in Phase 2A. ` +
    `Only "anthropic" works right now.`
  )
}

function toOpenAIChatCompletion({ aliasName, model, content, id }) {
  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: aliasName,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
    },
    _gateway: {
      resolved_model: model,
    },
  }
}
