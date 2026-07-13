// src/app/api/admin/projects/route.js
// GET  /api/admin/projects  — list projects with month-to-date spend + key count
// POST /api/admin/projects  — create a project (grouping for cap + kill switch)

import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { monthStartIso } from '@/lib/routing/budget'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function GET() {
  try {
    await requireAdmin()
  } catch (e) {
    if (e instanceof AdminAuthError)
      return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const monthStart = monthStartIso()
  const rows = await query(
    `SELECT p.id, p.name, p.description, p.kind, p.monthly_budget_usd,
            p.default_rpm_limit, p.default_tpm_limit, p.enabled,
            p.created_at, p.updated_at,
            (SELECT COUNT(*)::int FROM apps a WHERE a.project_id = p.id) AS key_count,
            COALESCE((
              SELECT SUM(cl.cost_usd)
                FROM call_logs cl
                JOIN apps a ON a.id = cl.app_id
               WHERE a.project_id = p.id
                 AND cl.workspace_id = p.workspace_id
                 AND cl.created_at >= $2
                 AND cl.status = 200
            ), 0)::numeric AS spend_mtd
       FROM projects p
      WHERE p.workspace_id = $1
      ORDER BY p.name`,
    [WORKSPACE_ID, monthStart],
  )
  return NextResponse.json({ projects: rows })
}

export async function POST(request) {
  try {
    await requireAdmin()
  } catch (e) {
    if (e instanceof AdminAuthError)
      return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = String(body?.name || '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const kind = body?.kind === 'sandbox' ? 'sandbox' : 'internal'
  const description = body?.description ? String(body.description).trim() : null
  const monthlyBudgetUsd =
    body?.monthly_budget_usd != null && body.monthly_budget_usd !== ''
      ? Number(body.monthly_budget_usd)
      : null
  const rpm = numOrNull(body?.default_rpm_limit)
  const tpm = numOrNull(body?.default_tpm_limit)

  if (monthlyBudgetUsd != null && (isNaN(monthlyBudgetUsd) || monthlyBudgetUsd < 0)) {
    return NextResponse.json(
      { error: 'monthly_budget_usd must be a non-negative number' },
      { status: 400 },
    )
  }

  const dup = await queryOne(`SELECT id FROM projects WHERE workspace_id = $1 AND name = $2`, [
    WORKSPACE_ID,
    name,
  ])
  if (dup) return NextResponse.json({ error: `Project "${name}" already exists.` }, { status: 409 })

  const inserted = await queryOne(
    `INSERT INTO projects (
       workspace_id, name, description, kind, monthly_budget_usd,
       default_rpm_limit, default_tpm_limit, enabled
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     RETURNING id, name, description, kind, monthly_budget_usd,
       default_rpm_limit, default_tpm_limit, enabled, created_at, updated_at`,
    [WORKSPACE_ID, name, description, kind, monthlyBudgetUsd, rpm, tpm],
  )
  return NextResponse.json({ project: inserted }, { status: 201 })
}

function numOrNull(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}
