// src/lib/routing/execute-call.js
// Orchestrate a single chat-completion call through the gateway:
//   1. Resolve the alias to a fallback chain of providers.
//   2. Try each provider in chain order until one succeeds.
//   3. Log every attempt (success or failure) to call_logs.
//   4. Return the first successful response in OpenAI-compatible shape.

import { resolveAlias } from '@/lib/routing/resolve-alias'
import { callAnthropicViaClaudeCli } from '@/lib/providers/anthropic-claude-cli'
import { callAnthropicViaApiKey } from '@/lib/providers/anthropic-api'
import { callViaLiteLLM } from '@/lib/providers/litellm'
import { logCall } from '@/lib/logging'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001' // seed workspace

/**
 * @param {object} opts
 * @param {string} opts.aliasName
 * @param {object} opts.app             The app row from authenticateAppRequest.
 * @param {Array}  opts.messages        OpenAI-style messages array.
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
      errors.push({ position: i, providerName: provider.name, error: `provider ${provider.name} disabled` })
      continue
    }

    try {
      const result = await tryProvider({ provider, entry, messages })
      await logCall({
        workspaceId: WORKSPACE_ID,
        appId: app.id,
        alias: alias.name,
        providerId: provider.id,
        model: result.model,
        authMethod: provider.auth_type,
        requestTokens: result.request_tokens ?? null,
        responseTokens: result.response_tokens ?? null,
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
          requestTokens: result.request_tokens ?? null,
          responseTokens: result.response_tokens ?? null,
        }),
        providerId: provider.id,
        model: result.model,
        authMethod: provider.auth_type,
        latencyMs: result.latency_ms,
      }
    } catch (err) {
      errors.push({ position: i, providerName: provider.name, error: err.message })
      await logCall({
        workspaceId: WORKSPACE_ID,
        appId: app.id,
        alias: alias.name,
        providerId: provider.id,
        model: entry.model || null,
        authMethod: provider.auth_type,
        latencyMs: err.latencyMs ?? null,
        status: err.status ?? err.exitCode ?? 500,
        error: err.message?.slice(0, 1000),
        fallbackPosition: i,
      })
      // fall through to next chain entry
    }
  }

  const summary = errors
    .map(e => `[${e.position}/${e.providerName || '?'}] ${e.error}`)
    .join(' | ')
  const allFailed = new Error(`All providers in chain failed for alias "${aliasName}": ${summary}`)
  allFailed.fallbackErrors = errors
  throw allFailed
}

async function tryProvider({ provider, entry, messages }) {
  const name = provider.name.toLowerCase()

  // Anthropic OAuth path uses the claude CLI child process (D-020),
  // bypassing LiteLLM entirely because the Messages API rejects OAuth tokens.
  if (name === 'anthropic' && provider.auth_type === 'oauth') {
    return callAnthropicViaClaudeCli({
      messages,
      model: entry.model || undefined,
    })
  }

  // Anthropic API key path uses direct HTTPS to api.anthropic.com.
  // It also bypasses LiteLLM for a cleaner stack trace and to keep tokens
  // out of the LiteLLM container's address space.
  if (name === 'anthropic' && provider.auth_type === 'api_key') {
    return callAnthropicViaApiKey({
      providerId: provider.id,
      messages,
      model: entry.model || undefined,
    })
  }

  // Everything else (OpenAI, Gemini, xAI Grok, OpenRouter, ...) goes through
  // LiteLLM. The `model` field on the chain entry must match a model_name in
  // litellm-config.yaml (e.g. "openai-gpt-4o").
  return callViaLiteLLM({
    messages,
    model: entry.model,
  })
}

function toOpenAIChatCompletion({ aliasName, model, content, id, requestTokens, responseTokens }) {
  const promptTokens = requestTokens ?? null
  const completionTokens = responseTokens ?? null
  const totalTokens = promptTokens != null && completionTokens != null
    ? promptTokens + completionTokens
    : null
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
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
    _gateway: {
      resolved_model: model,
    },
  }
}
