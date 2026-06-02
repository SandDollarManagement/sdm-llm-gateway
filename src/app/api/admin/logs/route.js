// src/app/api/admin/logs/route.js
// GET /api/admin/logs   — paginated call logs with optional filters

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(request) {
  try { await requireAdmin() } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)
  const appId = url.searchParams.get('app_id') || null
  const alias = url.searchParams.get('alias') || null
  const providerId = url.searchParams.get('provider_id') || null
  const status = url.searchParams.get('status') || null

  const filters = ['workspace_id = $1']
  const args = [WORKSPACE_ID]
  let p = 2
  if (appId) { filters.push(`app_id = $${p++}`); args.push(appId) }
  if (alias) { filters.push(`alias = $${p++}`); args.push(alias) }
  if (providerId) { filters.push(`provider_id = $${p++}`); args.push(providerId) }
  if (status) {
    if (status === 'ok') filters.push(`status = 200`)
    else if (status === 'error') filters.push(`status <> 200`)
  }

  args.push(limit, offset)
  const sql = `
    SELECT cl.id, cl.created_at, cl.alias, cl.model, cl.auth_method,
           cl.request_tokens, cl.response_tokens, cl.cost_usd,
           cl.latency_ms, cl.status, cl.error, cl.fallback_position,
           a.name AS app_name,
           p.name AS provider_name
      FROM call_logs cl
      LEFT JOIN apps a ON a.id = cl.app_id
      LEFT JOIN providers p ON p.id = cl.provider_id
     WHERE ${filters.join(' AND ')}
     ORDER BY cl.created_at DESC
     LIMIT $${p++} OFFSET $${p}
  `
  const rows = await query(sql, args)
  return NextResponse.json({ logs: rows, limit, offset })
}
