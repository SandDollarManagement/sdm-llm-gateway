// src/lib/routing/budget.js
// Spend rollups, rate-limit counters, and spend-alert recording for the
// gateway's project/key caps. These are pure data helpers (no throwing) so
// policy.js remains the single place that decides to refuse a request.
//
// Enforcement is POST-HOC by nature: cost is only known after a provider
// responds, so a cap refuses the NEXT request once spend has crossed it (the
// gateway never queues -- it returns 429). Per-request output tokens are
// bounded server-side (alias.max_output_tokens) so worst-case overshoot is
// small and known.

import { query, queryOne } from '@/lib/db'

/** UTC first-of-month ISO string. */
export function monthStartIso(now = new Date()) {
  const d = new Date(now.getTime())
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Current billing period as YYYY-MM (UTC). */
export function currentPeriod(now = new Date()) {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Month-to-date USD spend across every app in a project (successful calls). */
export async function getProjectSpend({ workspaceId, projectId, monthStart }) {
  const row = await queryOne(
    `SELECT COALESCE(SUM(cl.cost_usd), 0)::numeric AS spent
       FROM call_logs cl
       JOIN apps a ON a.id = cl.app_id
      WHERE cl.workspace_id = $1
        AND a.project_id = $2
        AND cl.created_at >= $3
        AND cl.status = 200`,
    [workspaceId, projectId, monthStart],
  )
  return Number(row?.spent || 0)
}

/** Month-to-date USD spend for a single key. */
export async function getKeySpend({ workspaceId, appId, monthStart }) {
  const row = await queryOne(
    `SELECT COALESCE(SUM(cost_usd), 0)::numeric AS spent
       FROM call_logs
      WHERE workspace_id = $1
        AND app_id = $2
        AND created_at >= $3
        AND status = 200`,
    [workspaceId, appId, monthStart],
  )
  return Number(row?.spent || 0)
}

/** Count of logged requests for a key within the trailing window (seconds). */
export async function countRecentRequests({ workspaceId, appId, windowSeconds }) {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString()
  const row = await queryOne(
    `SELECT COUNT(*)::int AS n
       FROM call_logs
      WHERE workspace_id = $1 AND app_id = $2 AND created_at >= $3`,
    [workspaceId, appId, since],
  )
  return Number(row?.n || 0)
}

/** Sum of tokens (in+out) for a key within the trailing window (seconds). */
export async function sumRecentTokens({ workspaceId, appId, windowSeconds }) {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString()
  const row = await queryOne(
    `SELECT COALESCE(SUM(COALESCE(request_tokens,0) + COALESCE(response_tokens,0)), 0)::bigint AS t
       FROM call_logs
      WHERE workspace_id = $1 AND app_id = $2 AND created_at >= $3 AND status = 200`,
    [workspaceId, appId, since],
  )
  return Number(row?.t || 0)
}

/**
 * Insert spend-alert rows for any threshold (default 50%, 90%) newly crossed.
 * Idempotent: the unique index on (scope, threshold, period) means each
 * threshold fires at most once per period. Never throws -- alerting must not
 * break the request path.
 */
export async function recordSpendAlerts({
  workspaceId,
  scope,
  projectId = null,
  appId = null,
  spent,
  cap,
  period,
  thresholds = [50, 90],
}) {
  if (!cap || cap <= 0 || !Number.isFinite(spent)) return
  // Explicit per-scope conflict target so the partial unique indexes are used
  // as arbiters (an omitted target is unreliable against partial indexes).
  const onConflict =
    scope === 'project'
      ? `ON CONFLICT (project_id, threshold, period) WHERE scope = 'project' DO NOTHING`
      : `ON CONFLICT (app_id, threshold, period) WHERE scope = 'key' DO NOTHING`
  for (const threshold of thresholds) {
    if (spent >= (cap * threshold) / 100) {
      try {
        await query(
          `INSERT INTO spend_alerts
             (workspace_id, project_id, app_id, scope, threshold, period, spent_usd, cap_usd)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ${onConflict}`,
          [workspaceId, projectId, appId, scope, threshold, period, spent, cap],
        )
      } catch (err) {
        console.warn(`[budget] spend-alert insert failed (${scope} ${threshold}%):`, err.message)
      }
    }
  }
}
