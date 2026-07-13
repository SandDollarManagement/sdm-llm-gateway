// src/lib/routing/policy.js
// Shared app/alias/project policy checks for gateway request routing. Every
// routing path (chat, messages, streaming, embeddings) funnels through
// enforceAppPolicy, so this is the single place caps, rate limits, the model
// allowlist, the kill switch, and spend alerts are enforced.

import { queryOne } from '@/lib/db'
import { isModelPriced } from '@/lib/routing/cost'
import {
  getProjectSpend,
  getKeySpend,
  countRecentRequests,
  sumRecentTokens,
  recordSpendAlerts,
  monthStartIso,
  currentPeriod,
} from '@/lib/routing/budget'

const RATE_WINDOW_SECONDS = 60

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

async function loadProject(projectId) {
  if (!projectId) return null
  return queryOne(
    `SELECT id, name, enabled, monthly_budget_usd, default_rpm_limit, default_tpm_limit
       FROM projects
      WHERE id = $1
      LIMIT 1`,
    [projectId],
  )
}

/**
 * Enforce every per-request policy. Order is chosen so cheap/structural checks
 * refuse before we spend DB work on spend rollups:
 *   1. app enabled            (403)
 *   2. project kill switch    (403)  -- one flag disables the whole lane
 *   3. model allowlist        (403)  -- fails CLOSED for contained keys
 *   4. unpriced-model refusal (403)  -- never bill an unknown cost as free
 *   5. rate limits rpm/tpm    (429)
 *   6. project spend cap      (429)  + alerts at 50/90%
 *   7. per-key spend cap      (429)  + alerts at 50/90%  (opt-in: budget_enforced)
 */
export async function enforceAppPolicy({ app, alias, workspaceId, requestedAlias }) {
  const aliasName = alias?.name || requestedAlias

  if (!app?.enabled) {
    throw new GatewayPolicyError(
      403,
      `App "${app?.name || 'unknown'}" is disabled.`,
      'app_disabled',
    )
  }

  const project = await loadProject(app.project_id)
  if (project && !project.enabled) {
    throw new GatewayPolicyError(
      403,
      `Project "${project.name}" is disabled (kill switch active).`,
      'project_disabled',
    )
  }

  // ---- Model allowlist (fails CLOSED for project-scoped keys) ----
  const contained = app.project_id != null
  // A project-scoped key is ALWAYS treated as budget-enforced: containment must
  // not depend on the budget_enforced flag being set (an admin could create a
  // project key with it false and slip unpriced/uncapped calls through).
  const enforced = contained || app.budget_enforced === true
  const allowedAliases = Array.isArray(app.allowed_aliases)
    ? app.allowed_aliases.filter(Boolean)
    : []
  if (contained && allowedAliases.length === 0) {
    throw new GatewayPolicyError(
      403,
      `App "${app.name}" is project-scoped but has no allowed aliases; refusing (fail closed).`,
      'allowlist_empty',
    )
  }
  if (allowedAliases.length > 0 && !allowedAliases.includes(aliasName)) {
    throw new GatewayPolicyError(
      403,
      `App "${app.name}" is not allowed to use alias "${aliasName}".`,
      'alias_not_allowed',
    )
  }

  // ---- Unpriced-model refusal: an enforced key may only reach models whose
  // price is known, so cost can never be under-counted as zero. ----
  if (enforced) {
    const entries = selectChainEntries({ alias, app })
    for (const entry of entries) {
      if (!(await isModelPriced(entry.model))) {
        throw new GatewayPolicyError(
          403,
          `Model "${entry.model}" in alias "${aliasName}" has no price configured; refusing so spend is never under-counted. Add it to model_prices.`,
          'model_unpriced',
        )
      }
    }
  }

  // ---- Rate limits (best-effort, DB-window; documented as a throttle) ----
  const rpm = app.rpm_limit ?? project?.default_rpm_limit ?? null
  const tpm = app.tpm_limit ?? project?.default_tpm_limit ?? null
  if (rpm != null && rpm > 0) {
    const n = await countRecentRequests({
      workspaceId,
      appId: app.id,
      windowSeconds: RATE_WINDOW_SECONDS,
    })
    if (n >= rpm) {
      throw new GatewayPolicyError(
        429,
        `App "${app.name}" exceeded its rate limit of ${rpm} requests/min.`,
        'rate_limit_rpm',
      )
    }
  }
  if (tpm != null && tpm > 0) {
    const t = await sumRecentTokens({
      workspaceId,
      appId: app.id,
      windowSeconds: RATE_WINDOW_SECONDS,
    })
    if (t >= tpm) {
      throw new GatewayPolicyError(
        429,
        `App "${app.name}" exceeded its rate limit of ${tpm} tokens/min.`,
        'rate_limit_tpm',
      )
    }
  }

  // ---- Spend caps + alerts ----
  const monthStart = monthStartIso()
  const period = currentPeriod()

  if (project && project.monthly_budget_usd != null) {
    const cap = Number(project.monthly_budget_usd)
    const spent = await getProjectSpend({ workspaceId, projectId: project.id, monthStart })
    await recordSpendAlerts({
      workspaceId,
      scope: 'project',
      projectId: project.id,
      spent,
      cap,
      period,
    })
    if (Number.isFinite(cap) && spent >= cap) {
      throw new GatewayPolicyError(
        429,
        `Project "${project.name}" has reached its monthly gateway budget cap.`,
        'project_budget_exceeded',
      )
    }
  }

  if (enforced && app.monthly_budget_usd != null) {
    const cap = Number(app.monthly_budget_usd)
    const spent = await getKeySpend({ workspaceId, appId: app.id, monthStart })
    await recordSpendAlerts({
      workspaceId,
      scope: 'key',
      projectId: app.project_id ?? null,
      appId: app.id,
      spent,
      cap,
      period,
    })
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
    alias_sandbox_only: alias.sandbox_only === true,
    app_fallback_allowed: app?.fallback_allowed !== false,
    app_allowed_aliases: Array.isArray(app?.allowed_aliases) ? app.allowed_aliases : null,
    app_monthly_budget_usd: app?.monthly_budget_usd ?? null,
    app_budget_enforced: app?.budget_enforced === true,
    app_project_id: app?.project_id ?? null,
    correlation_id: correlationId || null,
  }
}

export function validateAliasChainPolicy({ alias, providers, app = null }) {
  const providerById = new Map(providers.map((p) => [p.id, p]))
  const chain = Array.isArray(alias.fallback_chain) ? alias.fallback_chain : []
  const localOnly = alias.local_only_eligible === true || alias.name === 'local-private'

  // Sandbox aliases AND any project-scoped (contained) key must never route to
  // an OAuth (Max-subscription) provider: OAuth calls have null cost (they'd
  // bypass the cap) and burn shared credit. Binding this to the key too closes
  // the case where an admin adds a non-sandbox alias to a sandbox key.
  if (alias.sandbox_only === true || app?.project_id != null) {
    const oauthEntry = chain.find((entry) => {
      const provider = providerById.get(entry.provider_id)
      return provider && provider.auth_type === 'oauth'
    })
    if (oauthEntry) {
      const provider = providerById.get(oauthEntry.provider_id)
      throw new GatewayPolicyError(
        400,
        `Alias "${alias.name}" may not include OAuth provider "${provider.name}" for a sandbox/project-scoped key; these lanes use metered API-key billing only.`,
        'sandbox_oauth_forbidden',
      )
    }
  }

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
