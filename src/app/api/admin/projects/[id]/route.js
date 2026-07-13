// src/app/api/admin/projects/[id]/route.js
// PATCH  /api/admin/projects/[id]  — update budget, rate defaults, enabled (kill switch)
// DELETE /api/admin/projects/[id]  — delete a project (keys are detached, not deleted)

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
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await queryOne(`SELECT id FROM projects WHERE id = $1 AND workspace_id = $2`, [
    id,
    WORKSPACE_ID,
  ])
  if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const updates = []
  const args = []
  let p = 1

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.push(`name = $${p++}`)
    args.push(body.name.trim())
  }
  if (typeof body.description === 'string') {
    updates.push(`description = $${p++}`)
    args.push(body.description.trim() || null)
  }
  if (body.monthly_budget_usd === '' || body.monthly_budget_usd === null) {
    updates.push(`monthly_budget_usd = NULL`)
  } else if (body.monthly_budget_usd != null) {
    const n = Number(body.monthly_budget_usd)
    if (isNaN(n) || n < 0) {
      return NextResponse.json(
        { error: 'monthly_budget_usd must be a non-negative number' },
        { status: 400 },
      )
    }
    updates.push(`monthly_budget_usd = $${p++}`)
    args.push(n)
  }
  applyIntField(body, 'default_rpm_limit', updates, args, () => p++)
  applyIntField(body, 'default_tpm_limit', updates, args, () => p++)
  if (typeof body.enabled === 'boolean') {
    updates.push(`enabled = $${p++}`)
    args.push(body.enabled)
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })
  }
  updates.push(`updated_at = now()`)

  args.push(id, WORKSPACE_ID)
  const row = (
    await query(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${p++} AND workspace_id = $${p}
       RETURNING id, name, description, kind, monthly_budget_usd,
         default_rpm_limit, default_tpm_limit, enabled, created_at, updated_at`,
      args,
    )
  )[0]
  return NextResponse.json({ project: row })
}

export async function DELETE(_request, { params }) {
  try {
    await requireAdmin()
  } catch (e) {
    if (e instanceof AdminAuthError)
      return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
  const id = params.id
  const existing = await queryOne(`SELECT id FROM projects WHERE id = $1 AND workspace_id = $2`, [
    id,
    WORKSPACE_ID,
  ])
  if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Keys reference project_id with ON DELETE SET NULL, so they survive detached.
  await query(`DELETE FROM projects WHERE id = $1 AND workspace_id = $2`, [id, WORKSPACE_ID])
  return NextResponse.json({ ok: true })
}

// Helper: apply a nullable-integer field (NULL when '' or null, else validated int).
function applyIntField(body, field, updates, args, next) {
  if (!(field in body)) return
  const v = body[field]
  if (v === '' || v === null) {
    updates.push(`${field} = NULL`)
    return
  }
  const n = Number(v)
  if (!isNaN(n) && n >= 0) {
    updates.push(`${field} = $${next()}`)
    args.push(Math.floor(n))
  }
}
