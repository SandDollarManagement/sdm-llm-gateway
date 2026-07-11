// src/lib/routing/execute-embedding.js
// OpenAI-compatible embeddings routing through gateway aliases.

import { queryOne } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { resolveAlias } from '@/lib/routing/resolve-alias'
import { callEmbeddingsViaLiteLLM } from '@/lib/providers/litellm'
import { logCall } from '@/lib/logging'
import {
  enforceAppPolicy,
  policySnapshot,
  selectChainEntries,
  validateAliasChainPolicy,
} from '@/lib/routing/policy'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function executeEmbedding({ aliasName, app, input, correlationId = null }) {
  const { alias, providers } = await resolveAlias({
    workspaceId: WORKSPACE_ID,
    aliasName,
  })
  if (alias.capability_type !== 'embedding') {
    throw new Error(`Alias "${aliasName}" is capability "${alias.capability_type}", not embedding.`)
  }
  validateAliasChainPolicy({ alias, providers })
  await enforceAppPolicy({ app, alias, workspaceId: WORKSPACE_ID, requestedAlias: aliasName })

  const providerById = new Map(providers.map((p) => [p.id, p]))
  const chainEntries = selectChainEntries({ alias, app })
  const snapshot = policySnapshot({ alias, app, correlationId })
  const errors = []

  for (let i = 0; i < chainEntries.length; i++) {
    const entry = chainEntries[i]
    const provider = providerById.get(entry.provider_id)
    const fallbackPosition = Array.isArray(alias.fallback_chain)
      ? Math.max(alias.fallback_chain.indexOf(entry), i)
      : i

    if (!provider) {
      const message = `provider ${entry.provider_id} not found`
      errors.push({ position: fallbackPosition, error: message })
      await logAttempt({
        app,
        alias,
        entry,
        status: 424,
        error: message,
        fallbackPosition,
        correlationId,
        snapshot,
      })
      continue
    }
    if (!provider.enabled) {
      const message = `provider ${provider.name} disabled`
      errors.push({ position: fallbackPosition, providerName: provider.name, error: message })
      await logAttempt({
        app,
        alias,
        entry,
        provider,
        status: 424,
        error: message,
        fallbackPosition,
        correlationId,
        snapshot,
      })
      continue
    }

    try {
      const apiKey = await loadProviderApiKey(provider.id)
      const result = await callEmbeddingsViaLiteLLM({
        input,
        model: entry.model,
        apiKey,
        baseUrl: provider.base_url || undefined,
      })
      await logAttempt({
        app,
        alias,
        entry,
        provider,
        model: result.model,
        status: 200,
        requestTokens: result.request_tokens ?? null,
        responseTokens: result.response_tokens ?? null,
        latencyMs: result.latency_ms,
        fallbackPosition,
        correlationId,
        snapshot,
      })
      return {
        response: {
          ...result.raw_response,
          model: alias.name,
          _gateway: {
            resolved_model: result.model,
            correlation_id: correlationId || null,
            embedding_dimension: alias.embedding_dimension,
            embedding_model_family: alias.embedding_model_family,
            embedding_model_version: alias.embedding_model_version,
          },
        },
        providerId: provider.id,
        model: result.model,
      }
    } catch (err) {
      errors.push({ position: fallbackPosition, providerName: provider.name, error: err.message })
      await logAttempt({
        app,
        alias,
        entry,
        provider,
        status: err.status ?? 500,
        error: err.message?.slice(0, 1000),
        latencyMs: err.latencyMs ?? null,
        fallbackPosition,
        correlationId,
        snapshot,
      })
    }
  }

  const summary = errors
    .map((e) => `[${e.position}/${e.providerName || '?'}] ${e.error}`)
    .join(' | ')
  const allFailed = new Error(`All providers in chain failed for alias "${aliasName}": ${summary}`)
  allFailed.fallbackErrors = errors
  throw allFailed
}

async function logAttempt({
  app,
  alias,
  entry,
  provider = null,
  model = null,
  status,
  error = null,
  requestTokens = null,
  responseTokens = null,
  latencyMs = null,
  fallbackPosition,
  correlationId,
  snapshot,
}) {
  await logCall({
    workspaceId: WORKSPACE_ID,
    appId: app?.id ?? null,
    alias: alias.name,
    providerId: provider?.id ?? null,
    model: model || entry.model || null,
    authMethod: provider?.auth_type ?? null,
    requestTokens,
    responseTokens,
    latencyMs,
    status,
    error,
    fallbackPosition,
    correlationId,
    policySnapshot: snapshot,
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
