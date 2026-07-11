// src/app/api/admin/apps/route.js
// GET  /api/admin/apps   — list all apps in the workspace
// POST /api/admin/apps   — create a new app and return its bearer token

import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { query, queryOne } from '@/lib/db'
import { sha256Hex } from '@/lib/crypto'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'

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
  const rows = await query(
    `SELECT id, name, default_alias, monthly_budget_usd, enabled,
            allowed_aliases, fallback_allowed, created_at, last_used_at
       FROM apps
      WHERE workspace_id = $1
      ORDER BY name`,
    [WORKSPACE_ID],
  )
  return NextResponse.json({ apps: rows })
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
  const defaultAlias = body?.default_alias ? String(body.default_alias).trim() : 'default'
  const monthlyBudgetUsd =
    body?.monthly_budget_usd != null && body.monthly_budget_usd !== ''
      ? Number(body.monthly_budget_usd)
      : null
  const allowedAliases = Array.isArray(body?.allowed_aliases)
    ? body.allowed_aliases.map((a) => String(a).trim()).filter(Boolean)
    : null
  const fallbackAllowed = typeof body?.fallback_allowed === 'boolean' ? body.fallback_allowed : true

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (monthlyBudgetUsd != null && (isNaN(monthlyBudgetUsd) || monthlyBudgetUsd < 0)) {
    return NextResponse.json(
      { error: 'monthly_budget_usd must be a non-negative number' },
      { status: 400 },
    )
  }

  const dup = await queryOne(`SELECT id FROM apps WHERE workspace_id = $1 AND name = $2`, [
    WORKSPACE_ID,
    name,
  ])
  if (dup) {
    return NextResponse.json({ error: `App "${name}" already exists.` }, { status: 409 })
  }

  // Generate bearer token. Plaintext returned only this once; storage is SHA-256.
  const token = 'sdmgw-' + randomBytes(24).toString('base64url')
  const tokenHash = sha256Hex(token)

  const inserted = await queryOne(
    `INSERT INTO apps (
       workspace_id, name, token_hash, default_alias, monthly_budget_usd,
       enabled, allowed_aliases, fallback_allowed
     )
     VALUES ($1, $2, $3, $4, $5, true, $6, $7)
     RETURNING id, name, default_alias, monthly_budget_usd, enabled,
       allowed_aliases, fallback_allowed, created_at, last_used_at`,
    [
      WORKSPACE_ID,
      name,
      tokenHash,
      defaultAlias,
      monthlyBudgetUsd,
      allowedAliases,
      fallbackAllowed,
    ],
  )

  return NextResponse.json({ app: inserted, plaintext_token: token }, { status: 201 })
}
