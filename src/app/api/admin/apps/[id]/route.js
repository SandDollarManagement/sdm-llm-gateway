// src/app/api/admin/apps/[id]/route.js
// PATCH  /api/admin/apps/[id]    — update name, default_alias, monthly_budget_usd, enabled
// DELETE /api/admin/apps/[id]    — delete app
// POST   /api/admin/apps/[id]/rotate-token — rotate bearer token, return new plaintext

import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function PATCH(request, { params }) {
  try { await requireAdmin() } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const id = params.id
  let body
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const existing = await queryOne(
    `SELECT id FROM apps WHERE id = $1 AND workspace_id = $2`,
    [id, WORKSPACE_ID]
  )
  if (!existing) return NextResponse.json({ error: 'App not found' }, { status: 404 })

  const updates = []
  const args = []
  let p = 1

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.push(`name = $${p++}`)
    args.push(body.name.trim())
  }
  if (typeof body.default_alias === 'string') {
    updates.push(`default_alias = $${p++}`)
    args.push(body.default_alias.trim() || null)
  }
  if (body.monthly_budget_usd != null) {
    const n = Number(body.monthly_budget_usd)
    if (isNaN(n) || n < 0) {
      return NextResponse.json({ error: 'monthly_budget_usd must be a non-negative number' }, { status: 400 })
    }
    updates.push(`monthly_budget_usd = $${p++}`)
    args.push(n)
  }
  if (body.monthly_budget_usd === '' || body.monthly_budget_usd === null) {
    updates.push(`monthly_budget_usd = NULL`)
  }
  if (typeof body.enabled === 'boolean') {
    updates.push(`enabled = $${p++}`)
    args.push(body.enabled)
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })
  }

  args.push(id, WORKSPACE_ID)
  const row = (await query(
    `UPDATE apps SET ${updates.join(', ')} WHERE id = $${p++} AND workspace_id = $${p}
     RETURNING id, name, default_alias, monthly_budget_usd, enabled, created_at, last_used_at`,
    args
  ))[0]
  return NextResponse.json({ app: row })
}

export async function DELETE(_request, { params }) {
  try { await requireAdmin() } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
  const id = params.id
  const existing = await queryOne(
    `SELECT id FROM apps WHERE id = $1 AND workspace_id = $2`,
    [id, WORKSPACE_ID]
  )
  if (!existing) return NextResponse.json({ error: 'App not found' }, { status: 404 })

  await query(`DELETE FROM apps WHERE id = $1 AND workspace_id = $2`, [id, WORKSPACE_ID])
  return NextResponse.json({ ok: true })
}
