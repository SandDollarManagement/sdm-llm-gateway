// src/app/api/admin/aliases/[id]/route.js
// PATCH  /api/admin/aliases/[id]   — update description and/or fallback_chain
// DELETE /api/admin/aliases/[id]   — delete alias

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
    `SELECT id FROM aliases WHERE id = $1 AND workspace_id = $2`,
    [id, WORKSPACE_ID]
  )
  if (!existing) return NextResponse.json({ error: 'Alias not found' }, { status: 404 })

  const updates = []
  const args = []
  let p = 1

  if (typeof body.description === 'string' || body.description === null) {
    updates.push(`description = $${p++}`)
    args.push(body.description ? String(body.description).trim() : null)
  }
  if (Array.isArray(body.fallback_chain)) {
    updates.push(`fallback_chain = $${p++}::jsonb`)
    args.push(JSON.stringify(body.fallback_chain))
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }
  updates.push(`updated_at = now()`)

  args.push(id, WORKSPACE_ID)
  const row = (await query(
    `UPDATE aliases SET ${updates.join(', ')}
     WHERE id = $${p++} AND workspace_id = $${p}
     RETURNING id, name, description, fallback_chain, created_at, updated_at`,
    args
  ))[0]
  return NextResponse.json({ alias: row })
}

export async function DELETE(_request, { params }) {
  try { await requireAdmin() } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
  const id = params.id
  const existing = await queryOne(
    `SELECT id FROM aliases WHERE id = $1 AND workspace_id = $2`,
    [id, WORKSPACE_ID]
  )
  if (!existing) return NextResponse.json({ error: 'Alias not found' }, { status: 404 })

  await query(`DELETE FROM aliases WHERE id = $1 AND workspace_id = $2`, [id, WORKSPACE_ID])
  return NextResponse.json({ ok: true })
}
