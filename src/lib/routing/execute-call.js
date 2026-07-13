// src/lib/routing/execute-call.js
// Orchestrate a single chat-completion call through the gateway:
//   1. Resolve the alias to a fallback chain of providers.
//   2. Try each provider in chain order until one succeeds.
//   3. Log every attempt (success or failure) to call_logs.
//   4. Return the first successful response in OpenAI-compatible shape.

import { queryOne } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { resolveAlias } from '@/lib/routing/resolve-alias'
import { callAnthropicViaClaudeCli } from '@/lib/providers/anthropic-claude-cli'
import { callAnthropicViaApiKey } from '@/lib/providers/anthropic-api'
import { callViaLiteLLM } from '@/lib/providers/litellm'
import { logCall } from '@/lib/logging'
import { computeCostUsd } from '@/lib/routing/cost'
import {
  enforceAppPolicy,
  policySnapshot,
  selectChainEntries,
  validateAliasChainPolicy,
} from '@/lib/routing/policy'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001' // seed workspace

/**
 * @param {object} opts
 * @param {string} opts.aliasName
 * @param {object} opts.app             The app row from authenticateAppRequest.
 * @param {Array}  opts.messages        OpenAI-style messages array.
 * @param {string|null} opts.correlationId
 */
export async function executeChatCompletion({ aliasName, app, messages, correlationId = null }) {
  const { alias, providers } = await resolveAlias({
    workspaceId: WORKSPACE_ID,
    aliasName,
  })
  validateAliasChainPolicy({ alias, providers, app })
  await enforceAppPolicy({ app, alias, workspaceId: WORKSPACE_ID, requestedAlias: aliasName })

  const providerById = new Map(providers.map((p) => [p.id, p]))
  const errors = []
  const chainEntries = selectChainEntries({ alias, app })
  const snapshot = policySnapshot({ alias, app, correlationId })
  // Output-token ceiling for this alias (bounds sandbox overshoot); undefined
  // leaves the provider default in place for non-capped aliases.
  const maxTokens = alias.max_output_tokens != null ? Number(alias.max_output_tokens) : undefined

  for (let i = 0; i < chainEntries.length; i++) {
    const entry = chainEntries[i]
    const originalPosition = Array.isArray(alias.fallback_chain)
      ? alias.fallback_chain.indexOf(entry)
      : i
    const fallbackPosition = originalPosition >= 0 ? originalPosition : i
    const provider = providerById.get(entry.provider_id)
    if (!provider) {
      errors.push({ position: i, error: `provider ${entry.provider_id} not found` })
      await logCall({
        workspaceId: WORKSPACE_ID,
        appId: app?.id ?? null,
        alias: alias.name,
        providerId: null,
        model: entry.model || null,
        authMethod: null,
        status: 424,
        error: `provider ${entry.provider_id} not found`,
        fallbackPosition,
        correlationId,
        policySnapshot: snapshot,
      })
      continue
    }
    if (!provider.enabled) {
      errors.push({
        position: i,
        providerName: provider.name,
        error: `provider ${provider.name} disabled`,
      })
      await logCall({
        workspaceId: WORKSPACE_ID,
        appId: app?.id ?? null,
        alias: alias.name,
        providerId: provider.id,
        model: entry.model || null,
        authMethod: provider.auth_type,
        status: 424,
        error: `provider ${provider.name} disabled`,
        fallbackPosition,
        correlationId,
        policySnapshot: snapshot,
      })
      continue
    }

    try {
      const result = await tryProvider({ provider, entry, messages, maxTokens })
      // Price by the model WE resolved (entry.model), never the echoed id.
      const { costUsd } = await computeCostUsd({
        model: entry.model,
        requestTokens: result.request_tokens ?? null,
        responseTokens: result.response_tokens ?? null,
      })
      await logCall({
        workspaceId: WORKSPACE_ID,
        appId: app.id,
        alias: alias.name,
        providerId: provider.id,
        model: result.model,
        authMethod: provider.auth_type,
        requestTokens: result.request_tokens ?? null,
        responseTokens: result.response_tokens ?? null,
        costUsd,
        latencyMs: result.latency_ms,
        status: 200,
        fallbackPosition,
        correlationId,
        policySnapshot: snapshot,
      })
      return {
        completion: toOpenAIChatCompletion({
          aliasName: alias.name,
          model: result.model,
          content: result.content,
          id: result.id,
          requestTokens: result.request_tokens ?? null,
          responseTokens: result.response_tokens ?? null,
          diag: result._diag || null,
          correlationId,
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
        fallbackPosition,
        correlationId,
        policySnapshot: snapshot,
      })
      // fall through to next chain entry
    }
  }

  const summary = errors
    .map((e) => `[${e.position}/${e.providerName || '?'}] ${e.error}`)
    .join(' | ')
  const allFailed = new Error(`All providers in chain failed for alias "${aliasName}": ${summary}`)
  allFailed.fallbackErrors = errors
  throw allFailed
}

async function tryProvider({ provider, entry, messages, maxTokens }) {
  const name = provider.name.toLowerCase()

  // Anthropic OAuth path uses the claude CLI child process (D-020),
  // bypassing LiteLLM entirely because the Messages API rejects OAuth tokens.
  // Credentials live in the container env (ANTHROPIC_OAUTH_TOKEN), not the DB.
  if (name === 'anthropic' && provider.auth_type === 'oauth') {
    return callAnthropicViaClaudeCli({
      messages,
      model: entry.model || undefined,
    })
  }

  // Anthropic API key path uses direct HTTPS to api.anthropic.com.
  // Credentials live encrypted in providers.credentials and are decrypted
  // inside the anthropic-api module (it does the lookup itself).
  if (name === 'anthropic' && provider.auth_type === 'api_key') {
    return callAnthropicViaApiKey({
      providerId: provider.id,
      messages,
      model: entry.model || undefined,
      ...(maxTokens != null ? { maxTokens } : {}),
    })
  }

  // Everything else (OpenAI, Gemini, xAI Grok, OpenRouter, ...) goes through
  // LiteLLM. We decrypt the provider's API key here and pass it as a
  // per-request override so LiteLLM doesn't need its own env vars for
  // upstream credentials.
  const apiKey = await loadProviderApiKey(provider.id)
  return callViaLiteLLM({
    messages,
    model: entry.model,
    apiKey,
    baseUrl: provider.base_url || undefined,
    maxTokens,
  })
}

async function loadProviderApiKey(providerId) {
  const row = await queryOne(`SELECT credentials FROM providers WHERE id = $1`, [providerId])
  if (!row || !row.credentials) {
    throw new Error(
      `provider ${providerId} has no credential stored. Set its API key in the admin UI.`,
    )
  }
  return decrypt(row.credentials)
}

function toOpenAIChatCompletion({
  aliasName,
  model,
  content,
  id,
  requestTokens,
  responseTokens,
  diag,
  correlationId,
}) {
  const promptTokens = requestTokens ?? null
  const completionTokens = responseTokens ?? null
  const totalTokens =
    promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null
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
      correlation_id: correlationId || null,
      _diag: diag || null,
    },
  }
}
