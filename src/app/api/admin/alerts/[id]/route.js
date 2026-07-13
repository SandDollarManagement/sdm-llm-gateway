// src/app/api/admin/alerts/[id]/route.js
// PATCH /api/admin/alerts/[id] — acknowledge (dismiss) a spend alert.

import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function PATCH(request, { params }) {
  try {
    await requireAdmin()
  } catch (e) {
    if (e instanceof AdminAuthError)
      return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const id = params.id
  const existing = await queryOne(
    `SELECT id FROM spend_alerts WHERE id = $1 AND workspace_id = $2`,
    [id, WORKSPACE_ID],
  )
  if (!existing) return NextResponse.json({ error: 'Alert not found' }, { status: 404 })

  let body
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const acknowledged = typeof body?.acknowledged === 'boolean' ? body.acknowledged : true

  const row = (
    await query(
      `UPDATE spend_alerts SET acknowledged = $1 WHERE id = $2 AND workspace_id = $3
       RETURNING id, acknowledged`,
      [acknowledged, id, WORKSPACE_ID],
    )
  )[0]
  return NextResponse.json({ alert: row })
}
