// src/app/api/admin/aliases/route.js
// GET  /api/admin/aliases  — list all aliases (with fallback_chain)
// POST /api/admin/aliases  — create new alias

import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function GET() {
  try { await requireAdmin() } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
  const rows = await query(
    `SELECT id, name, description, fallback_chain, created_at, updated_at
       FROM aliases
      WHERE workspace_id = $1
      ORDER BY name`,
    [WORKSPACE_ID]
  )
  return NextResponse.json({ aliases: rows })
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
  const description = body?.description ? String(body.description).trim() : null
  const fallbackChain = Array.isArray(body?.fallback_chain) ? body.fallback_chain : []

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const dup = await queryOne(
    `SELECT id FROM aliases WHERE workspace_id = $1 AND name = $2`,
    [WORKSPACE_ID, name]
  )
  if (dup) return NextResponse.json({ error: `Alias "${name}" already exists.` }, { status: 409 })

  const inserted = await queryOne(
    `INSERT INTO aliases (workspace_id, name, description, fallback_chain)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, name, description, fallback_chain, created_at, updated_at`,
    [WORKSPACE_ID, name, description, JSON.stringify(fallbackChain)]
  )
  return NextResponse.json({ alias: inserted }, { status: 201 })
}
