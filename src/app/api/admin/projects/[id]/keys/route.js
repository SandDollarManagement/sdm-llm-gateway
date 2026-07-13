// src/app/api/admin/projects/[id]/keys/route.js
// POST /api/admin/projects/[id]/keys — mint a scoped, capped, revocable virtual
// key bound to this project. Admin-session gated (requireAdmin): the low-trust
// sandbox can NEVER mint its own key. Plaintext token is returned exactly once.

import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { query, queryOne } from '@/lib/db'
import { sha256Hex } from '@/lib/crypto'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(request, { params }) {
  try {
    await requireAdmin()
  } catch (e) {
    if (e instanceof AdminAuthError)
      return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const projectId = params.id
  const project = await queryOne(
    `SELECT id, name, kind, default_rpm_limit, default_tpm_limit, monthly_budget_usd
       FROM projects WHERE id = $1 AND workspace_id = $2`,
    [projectId, WORKSPACE_ID],
  )
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  let body
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const name = String(body?.name || '').trim() || `${project.name}-key-${Date.now()}`

  // allowed_aliases is the model allowlist and MUST be non-empty for a
  // project-scoped key (fail closed). Default to the project's sandbox aliases.
  let allowedAliases = Array.isArray(body?.allowed_aliases)
    ? body.allowed_aliases.map((a) => String(a).trim()).filter(Boolean)
    : null
  if (!allowedAliases || allowedAliases.length === 0) {
    const rows = await query(
      `SELECT name FROM aliases WHERE workspace_id = $1 AND sandbox_only = true ORDER BY name`,
      [WORKSPACE_ID],
    )
    allowedAliases = rows.map((r) => r.name)
  }
  if (allowedAliases.length === 0) {
    return NextResponse.json(
      {
        error:
          'No allowed aliases resolved for this key. A project-scoped key must have a non-empty model allowlist (fail closed).',
      },
      { status: 400 },
    )
  }

  const perKeyBudget =
    body?.monthly_budget_usd != null && body.monthly_budget_usd !== ''
      ? Number(body.monthly_budget_usd)
      : 5.0 // conservative per-key default
  if (isNaN(perKeyBudget) || perKeyBudget < 0) {
    return NextResponse.json(
      { error: 'monthly_budget_usd must be a non-negative number' },
      { status: 400 },
    )
  }
  const rpm = intOr(body?.rpm_limit, project.default_rpm_limit)
  const tpm = intOr(body?.tpm_limit, project.default_tpm_limit)
  const defaultAlias = allowedAliases[0]

  const dup = await queryOne(`SELECT id FROM apps WHERE workspace_id = $1 AND name = $2`, [
    WORKSPACE_ID,
    name,
  ])
  if (dup) return NextResponse.json({ error: `Key "${name}" already exists.` }, { status: 409 })

  const token = 'sdmgw-' + randomBytes(24).toString('base64url')
  const tokenHash = sha256Hex(token)

  const inserted = await queryOne(
    `INSERT INTO apps (
       workspace_id, project_id, name, token_hash, default_alias,
       monthly_budget_usd, budget_enforced, enabled, allowed_aliases,
       fallback_allowed, rpm_limit, tpm_limit
     )
     VALUES ($1, $2, $3, $4, $5, $6, true, true, $7, true, $8, $9)
     RETURNING id, name, project_id, default_alias, monthly_budget_usd,
       budget_enforced, enabled, allowed_aliases, rpm_limit, tpm_limit, created_at`,
    [
      WORKSPACE_ID,
      projectId,
      name,
      tokenHash,
      defaultAlias,
      perKeyBudget,
      allowedAliases,
      rpm,
      tpm,
    ],
  )

  return NextResponse.json({ key: inserted, plaintext_token: token }, { status: 201 })
}

function intOr(v, fallback) {
  if (v == null || v === '') return fallback ?? null
  const n = Number(v)
  return isNaN(n) ? (fallback ?? null) : Math.floor(n)
}
