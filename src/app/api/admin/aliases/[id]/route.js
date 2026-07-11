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

  const existing = await queryOne(
    `SELECT id, capability_type, embedding_dimension, embedding_model_family,
            embedding_model_version
       FROM aliases
      WHERE id = $1 AND workspace_id = $2`,
    [id, WORKSPACE_ID],
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
  if (typeof body.capability_type === 'string') {
    updates.push(`capability_type = $${p++}`)
    args.push(body.capability_type.trim())
  }
  if (typeof body.fallback_allowed === 'boolean') {
    updates.push(`fallback_allowed = $${p++}`)
    args.push(body.fallback_allowed)
  }
  if (typeof body.local_only_eligible === 'boolean') {
    updates.push(`local_only_eligible = $${p++}`)
    args.push(body.local_only_eligible)
  }
  if (typeof body.retention_policy_notes === 'string' || body.retention_policy_notes === null) {
    updates.push(`retention_policy_notes = $${p++}`)
    args.push(body.retention_policy_notes ? String(body.retention_policy_notes).trim() : null)
  }
  if (typeof body.cost_latency_priority === 'string') {
    updates.push(`cost_latency_priority = $${p++}`)
    args.push(body.cost_latency_priority.trim())
  }
  if (body.embedding_dimension != null && body.embedding_dimension !== '') {
    const n = Number(body.embedding_dimension)
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        { error: 'embedding_dimension must be a positive integer' },
        { status: 400 },
      )
    }
    updates.push(`embedding_dimension = $${p++}`)
    args.push(n)
  }
  if (body.embedding_dimension === '' || body.embedding_dimension === null) {
    updates.push(`embedding_dimension = NULL`)
  }
  if (typeof body.embedding_model_family === 'string' || body.embedding_model_family === null) {
    updates.push(`embedding_model_family = $${p++}`)
    args.push(body.embedding_model_family ? String(body.embedding_model_family).trim() : null)
  }
  if (typeof body.embedding_model_version === 'string' || body.embedding_model_version === null) {
    updates.push(`embedding_model_version = $${p++}`)
    args.push(body.embedding_model_version ? String(body.embedding_model_version).trim() : null)
  }

  const nextCapability =
    typeof body.capability_type === 'string'
      ? body.capability_type.trim()
      : existing.capability_type
  const nextEmbeddingDimension =
    body.embedding_dimension === '' || body.embedding_dimension === null
      ? null
      : body.embedding_dimension !== undefined
        ? Number(body.embedding_dimension)
        : existing.embedding_dimension
  const nextEmbeddingFamily =
    typeof body.embedding_model_family === 'string' || body.embedding_model_family === null
      ? body.embedding_model_family
        ? String(body.embedding_model_family).trim()
        : null
      : existing.embedding_model_family
  const nextEmbeddingVersion =
    typeof body.embedding_model_version === 'string' || body.embedding_model_version === null
      ? body.embedding_model_version
        ? String(body.embedding_model_version).trim()
        : null
      : existing.embedding_model_version

  if (
    nextCapability === 'embedding' &&
    (!nextEmbeddingDimension || !nextEmbeddingFamily || !nextEmbeddingVersion)
  ) {
    return NextResponse.json(
      {
        error:
          'embedding aliases require embedding_dimension, embedding_model_family, and embedding_model_version',
      },
      { status: 400 },
    )
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }
  updates.push(`updated_at = now()`)

  args.push(id, WORKSPACE_ID)
  const row = (
    await query(
      `UPDATE aliases SET ${updates.join(', ')}
     WHERE id = $${p++} AND workspace_id = $${p}
     RETURNING id, name, description, fallback_chain,
       capability_type, fallback_allowed, local_only_eligible,
       retention_policy_notes, cost_latency_priority,
       embedding_dimension, embedding_model_family, embedding_model_version,
       created_at, updated_at`,
      args,
    )
  )[0]
  return NextResponse.json({ alias: row })
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
  const existing = await queryOne(`SELECT id FROM aliases WHERE id = $1 AND workspace_id = $2`, [
    id,
    WORKSPACE_ID,
  ])
  if (!existing) return NextResponse.json({ error: 'Alias not found' }, { status: 404 })

  await query(`DELETE FROM aliases WHERE id = $1 AND workspace_id = $2`, [id, WORKSPACE_ID])
  return NextResponse.json({ ok: true })
}
