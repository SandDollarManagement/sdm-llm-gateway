// src/lib/logging.js
// Insert one row into call_logs for every LLM call routed through the
// gateway. Bodies are NOT stored by default (PII / sensitive prompts);
// only metadata.

import { query } from '@/lib/db'

/**
 * @param {object} entry
 * @param {string} entry.workspaceId
 * @param {string|null} entry.appId
 * @param {string|null} entry.alias
 * @param {string|null} entry.providerId
 * @param {string|null} entry.model
 * @param {('oauth'|'api_key'|null)} entry.authMethod
 * @param {number|null} entry.requestTokens
 * @param {number|null} entry.responseTokens
 * @param {number|null} entry.costUsd
 * @param {number|null} entry.latencyMs
 * @param {number|null} entry.status        HTTP-ish status code.
 * @param {string|null} entry.error
 * @param {number} entry.fallbackPosition   0 = primary, 1 = first fallback, etc.
 * @param {string|null} entry.correlationId
 * @param {object|null} entry.policySnapshot
 */
export async function logCall(entry) {
  try {
    await query(
      `INSERT INTO call_logs (
        workspace_id, app_id, alias, provider_id, model, auth_method,
        request_tokens, response_tokens, cost_usd, latency_ms, status, error,
        fallback_position, correlation_id, policy_snapshot
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
      [
        entry.workspaceId,
        entry.appId ?? null,
        entry.alias ?? null,
        entry.providerId ?? null,
        entry.model ?? null,
        entry.authMethod ?? null,
        entry.requestTokens ?? null,
        entry.responseTokens ?? null,
        entry.costUsd ?? null,
        entry.latencyMs ?? null,
        entry.status ?? null,
        entry.error ?? null,
        entry.fallbackPosition ?? 0,
        entry.correlationId ?? null,
        entry.policySnapshot ? JSON.stringify(entry.policySnapshot) : null,
      ],
    )
  } catch (err) {
    // Logging failures must never break the request path.
    console.error('[logging] logCall failed:', err.message)
  }
}
