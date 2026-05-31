// src/app/api/admin/providers/route.js
// GET  /api/admin/providers           — list all providers (without decrypting credentials)
// POST /api/admin/providers           — create a new provider

import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

const KNOWN_PROVIDER_NAMES = ['anthropic', 'openai', 'gemini', 'xai-grok', 'openrouter']
const KNOWN_AUTH_TYPES = ['oauth', 'api_key']

export async function GET() {
  try { await requireAdmin() } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const rows = await query(
    `SELECT id, name, auth_type, base_url, enabled, created_at, updated_at,
            CASE WHEN credentials IS NULL OR credentials = '' THEN false ELSE true END AS has_credential
       FROM providers
      WHERE workspace_id = $1
      ORDER BY name, auth_type`,
    [WORKSPACE_ID]
  )
  return NextResponse.json({ providers: rows })
}

export async function POST(request) {
  try { await requireAdmin() } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  let body
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const name = String(body?.name || '').trim().toLowerCase()
  const auth_type = String(body?.auth_type || '').trim().toLowerCase()
  const api_key = body?.api_key ? String(body.api_key) : null
  const base_url = body?.base_url ? String(body.base_url).trim() : null
  const enabled = body?.enabled !== false

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!KNOWN_PROVIDER_NAMES.includes(name)) {
    return NextResponse.json(
      { error: `name must be one of: ${KNOWN_PROVIDER_NAMES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!KNOWN_AUTH_TYPES.includes(auth_type)) {
    return NextResponse.json(
      { error: `auth_type must be one of: ${KNOWN_AUTH_TYPES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!api_key) {
    return NextResponse.json({ error: 'api_key is required' }, { status: 400 })
  }

  const existing = await queryOne(
    `SELECT id FROM providers WHERE workspace_id = $1 AND name = $2 AND auth_type = $3`,
    [WORKSPACE_ID, name, auth_type]
  )
  if (existing) {
    return NextResponse.json(
      { error: `Provider "${name}" with auth_type "${auth_type}" already exists. Use PATCH on /api/admin/providers/${existing.id} to update it.` },
      { status: 409 }
    )
  }

  const ciphertext = encrypt(api_key)
  const inserted = await queryOne(
    `INSERT INTO providers (workspace_id, name, auth_type, credentials, base_url, enabled)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, auth_type, base_url, enabled, created_at, updated_at`,
    [WORKSPACE_ID, name, auth_type, ciphertext, base_url, enabled]
  )
  return NextResponse.json({ provider: { ...inserted, has_credential: true } }, { status: 201 })
}
