// src/app/api/admin/providers/[id]/route.js
// PATCH  /api/admin/providers/[id]    — update credentials, base_url, or enabled
// DELETE /api/admin/providers/[id]    — remove a provider entirely

import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
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
    `SELECT id, name, auth_type FROM providers WHERE id = $1 AND workspace_id = $2`,
    [id, WORKSPACE_ID]
  )
  if (!existing) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  const updates = []
  const params_ = []
  let p = 1

  if (typeof body.api_key === 'string' && body.api_key.length > 0) {
    updates.push(`credentials = $${p++}`)
    params_.push(encrypt(body.api_key))
  }
  if (typeof body.base_url === 'string') {
    updates.push(`base_url = $${p++}`)
    params_.push(body.base_url.trim() || null)
  }
  if (typeof body.enabled === 'boolean') {
    updates.push(`enabled = $${p++}`)
    params_.push(body.enabled)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update. Send api_key, base_url, or enabled.' }, { status: 400 })
  }
  updates.push(`updated_at = now()`)

  params_.push(id, WORKSPACE_ID)
  const sql = `
    UPDATE providers SET ${updates.join(', ')}
    WHERE id = $${p++} AND workspace_id = $${p}
    RETURNING id, name, auth_type, base_url, enabled, created_at, updated_at,
              CASE WHEN credentials IS NULL OR credentials = '' THEN false ELSE true END AS has_credential
  `
  const row = (await query(sql, params_))[0]
  return NextResponse.json({ provider: row })
}

export async function DELETE(_request, { params }) {
  try { await requireAdmin() } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const id = params.id
  const existing = await queryOne(
    `SELECT id FROM providers WHERE id = $1 AND workspace_id = $2`,
    [id, WORKSPACE_ID]
  )
  if (!existing) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  await query(`DELETE FROM providers WHERE id = $1 AND workspace_id = $2`, [id, WORKSPACE_ID])
  return NextResponse.json({ ok: true })
}
