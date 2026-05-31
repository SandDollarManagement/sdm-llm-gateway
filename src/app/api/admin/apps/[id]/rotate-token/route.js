// src/app/api/admin/apps/[id]/rotate-token/route.js
// POST /api/admin/apps/[id]/rotate-token
// Rotate the app's bearer token. Returns the new plaintext token once;
// the old token stops working immediately.

import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { query, queryOne } from '@/lib/db'
import { sha256Hex } from '@/lib/crypto'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(_request, { params }) {
  try { await requireAdmin() } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const id = params.id
  const existing = await queryOne(
    `SELECT id, name FROM apps WHERE id = $1 AND workspace_id = $2`,
    [id, WORKSPACE_ID]
  )
  if (!existing) return NextResponse.json({ error: 'App not found' }, { status: 404 })

  const token = 'sdmgw-' + randomBytes(24).toString('base64url')
  const tokenHash = sha256Hex(token)
  await query(
    `UPDATE apps SET token_hash = $1 WHERE id = $2 AND workspace_id = $3`,
    [tokenHash, id, WORKSPACE_ID]
  )
  return NextResponse.json({ plaintext_token: token, app_name: existing.name })
}
