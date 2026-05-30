// src/lib/app-auth.js
// Bearer token authentication for consumer apps calling the gateway
// (D-008). The plaintext token is sha256-hashed and compared against
// apps.token_hash. On success returns the matching app row; on failure
// throws an auth error that the route handler converts to 401/403.

import { query } from '@/lib/db'
import { sha256Hex } from '@/lib/crypto'

export class AppAuthError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * Verify an incoming request's bearer token and return the app row.
 *
 * Accepts either `Authorization: Bearer <token>` (OpenAI-compatible
 * clients) or `x-api-key: <token>` (Anthropic-compatible clients).
 */
export async function authenticateAppRequest(request) {
  const token = extractToken(request)
  if (!token) {
    throw new AppAuthError(401, 'Missing bearer token. Use Authorization: Bearer <token> or x-api-key.')
  }

  const tokenHash = sha256Hex(token)
  const rows = await query(
    `SELECT id, workspace_id, name, default_alias, monthly_budget_usd, enabled
       FROM apps
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash]
  )
  const app = rows[0]
  if (!app) {
    throw new AppAuthError(401, 'Invalid bearer token.')
  }
  if (!app.enabled) {
    throw new AppAuthError(403, `App "${app.name}" is disabled.`)
  }

  // Best-effort last_used_at update; failures here should not block the request.
  query('UPDATE apps SET last_used_at = now() WHERE id = $1', [app.id])
    .catch(err => console.warn(`[app-auth] last_used_at update failed for ${app.id}:`, err.message))

  return app
}

function extractToken(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match) return match[1].trim()
  }
  const apiKeyHeader = request.headers.get('x-api-key')
  if (apiKeyHeader) return apiKeyHeader.trim()
  return null
}
