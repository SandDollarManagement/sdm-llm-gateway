// src/app/api/admin/alerts/route.js
// GET /api/admin/alerts — list spend alerts (open first). These are the
// visible surface for the 50%/90% budget alerts; an alert that only lived in a
// server log would be invisible, so it lives here and on the dashboard.

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(request) {
  try {
    await requireAdmin()
  } catch (e) {
    if (e instanceof AdminAuthError)
      return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const url = new URL(request.url)
  const openOnly = url.searchParams.get('open') === 'true'

  const rows = await query(
    `SELECT sa.id, sa.scope, sa.threshold, sa.period, sa.spent_usd, sa.cap_usd,
            sa.acknowledged, sa.created_at,
            p.name AS project_name, a.name AS app_name
       FROM spend_alerts sa
       LEFT JOIN projects p ON p.id = sa.project_id
       LEFT JOIN apps a ON a.id = sa.app_id
      WHERE sa.workspace_id = $1
        ${openOnly ? 'AND sa.acknowledged = false' : ''}
      ORDER BY sa.acknowledged ASC, sa.created_at DESC
      LIMIT 200`,
    [WORKSPACE_ID],
  )
  return NextResponse.json({ alerts: rows })
}
