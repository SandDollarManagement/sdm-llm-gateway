// src/lib/routing/policy.js
// Shared app/alias policy checks for gateway request routing.

import { queryOne } from '@/lib/db'

export class GatewayPolicyError extends Error {
  constructor(status, message, code = 'policy_error') {
    super(message)
    this.status = status
    this.code = code
  }
}

export function extractCorrelationId(request, body = null) {
  const fromHeader =
    request.headers.get('x-correlation-id') ||
    request.headers.get('x-request-id') ||
    request.headers.get('traceparent')
  const fromBody = body?.metadata?.correlation_id || body?.metadata?.request_id || body?.user
  const raw = String(fromHeader || fromBody || '').trim()
  if (!raw) return null
  return raw.replace(/[^\w:./=-]/g, '').slice(0, 200) || null
}

export async function enforceAppPolicy({ app, alias, workspaceId, requestedAlias }) {
  const aliasName = alias?.name || requestedAlias
  if (!app?.enabled) {
    throw new GatewayPolicyError(
      403,
      `App "${app?.name || 'unknown'}" is disabled.`,
      'app_disabled',
    )
  }

  const allowedAliases = Array.isArray(app.allowed_aliases)
    ? app.allowed_aliases.filter(Boolean)
    : []
  if (allowedAliases.length > 0 && !allowedAliases.includes(aliasName)) {
    throw new GatewayPolicyError(
      403,
      `App "${app.name}" is not allowed to use alias "${aliasName}".`,
      'alias_not_allowed',
    )
  }

  if (app.monthly_budget_usd != null) {
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const row = await queryOne(
      `SELECT COALESCE(SUM(cost_usd), 0)::numeric AS spent
         FROM call_logs
        WHERE workspace_id = $1
          AND app_id = $2
          AND created_at >= $3
          AND status = 200`,
      [workspaceId, app.id, monthStart.toISOString()],
    )
    const spent = Number(row?.spent || 0)
    const cap = Number(app.monthly_budget_usd)
    if (Number.isFinite(cap) && spent >= cap) {
      throw new GatewayPolicyError(
        429,
        `App "${app.name}" has reached its monthly gateway budget cap.`,
        'monthly_budget_exceeded',
      )
    }
  }

  return true
}

export function canUseFallback({ alias, app }) {
  return alias.fallback_allowed !== false && app?.fallback_allowed !== false
}

export function policySnapshot({ alias, app, correlationId }) {
  return {
    alias_capability_type: alias.capability_type || null,
    alias_fallback_allowed: alias.fallback_allowed !== false,
    alias_local_only_eligible: alias.local_only_eligible === true,
    app_fallback_allowed: app?.fallback_allowed !== false,
    app_allowed_aliases: Array.isArray(app?.allowed_aliases) ? app.allowed_aliases : null,
    app_monthly_budget_usd: app?.monthly_budget_usd ?? null,
    correlation_id: correlationId || null,
  }
}

export function validateAliasChainPolicy({ alias, providers }) {
  const providerById = new Map(providers.map((p) => [p.id, p]))
  const chain = Array.isArray(alias.fallback_chain) ? alias.fallback_chain : []
  const localOnly = alias.local_only_eligible === true || alias.name === 'local-private'

  if (localOnly) {
    const cloudEntry = chain.find((entry) => {
      const provider = providerById.get(entry.provider_id)
      return provider && !isLocalProvider(provider)
    })
    if (cloudEntry) {
      const provider = providerById.get(cloudEntry.provider_id)
      throw new GatewayPolicyError(
        400,
        `Alias "${alias.name}" is local-only but its chain includes cloud provider "${provider.name}".`,
        'local_only_cloud_provider',
      )
    }
  }

  if (alias.capability_type === 'embedding') {
    const expected = Number(alias.embedding_dimension)
    if (!Number.isInteger(expected) || expected <= 0) {
      throw new GatewayPolicyError(
        400,
        `Embedding alias "${alias.name}" is missing embedding vector dimension metadata.`,
        'embedding_dimension_missing',
      )
    }

    const incompatible = chain.find((entry) => {
      if (entry.embedding_dimension == null || entry.embedding_dimension === '') return false
      return Number(entry.embedding_dimension) !== expected
    })
    if (incompatible) {
      throw new GatewayPolicyError(
        400,
        `Embedding alias "${alias.name}" cannot fall back from ${expected} dimensions to ${incompatible.embedding_dimension} dimensions.`,
        'embedding_dimension_mismatch',
      )
    }
  }
}

export function selectChainEntries({ alias, app }) {
  const chain = Array.isArray(alias.fallback_chain) ? alias.fallback_chain : []
  if (canUseFallback({ alias, app })) return chain
  return chain.slice(0, 1)
}

export function isLocalProvider(provider) {
  const name = String(provider?.name || '').toLowerCase()
  const baseUrl = String(provider?.base_url || '').toLowerCase()
  return (
    name.includes('ollama') ||
    name.includes('local') ||
    baseUrl.includes('localhost') ||
    baseUrl.includes('127.0.0.1') ||
    baseUrl.includes('host.docker.internal')
  )
}
