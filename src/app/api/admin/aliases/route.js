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
  try {
    await requireAdmin()
  } catch (e) {
    if (e instanceof AdminAuthError)
      return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
  const rows = await query(
    `SELECT id, name, description, fallback_chain,
            capability_type, fallback_allowed, local_only_eligible,
            retention_policy_notes, cost_latency_priority,
            embedding_dimension, embedding_model_family, embedding_model_version,
            created_at, updated_at
       FROM aliases
      WHERE workspace_id = $1
      ORDER BY name`,
    [WORKSPACE_ID],
  )
  return NextResponse.json({ aliases: rows })
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

  const name = String(body?.name || '')
    .trim()
    .toLowerCase()
  const description = body?.description ? String(body.description).trim() : null
  const fallbackChain = Array.isArray(body?.fallback_chain) ? body.fallback_chain : []
  const capabilityType = body?.capability_type ? String(body.capability_type).trim() : 'generation'
  const fallbackAllowed = typeof body?.fallback_allowed === 'boolean' ? body.fallback_allowed : true
  const localOnlyEligible =
    typeof body?.local_only_eligible === 'boolean' ? body.local_only_eligible : false
  const retentionPolicyNotes = body?.retention_policy_notes
    ? String(body.retention_policy_notes).trim()
    : null
  const costLatencyPriority = body?.cost_latency_priority
    ? String(body.cost_latency_priority).trim()
    : 'balanced'
  const embeddingDimension =
    body?.embedding_dimension != null && body.embedding_dimension !== ''
      ? Number(body.embedding_dimension)
      : null
  const embeddingModelFamily = body?.embedding_model_family
    ? String(body.embedding_model_family).trim()
    : null
  const embeddingModelVersion = body?.embedding_model_version
    ? String(body.embedding_model_version).trim()
    : null

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (
    embeddingDimension != null &&
    (!Number.isInteger(embeddingDimension) || embeddingDimension <= 0)
  ) {
    return NextResponse.json(
      { error: 'embedding_dimension must be a positive integer' },
      { status: 400 },
    )
  }
  if (
    capabilityType === 'embedding' &&
    (!embeddingDimension || !embeddingModelFamily || !embeddingModelVersion)
  ) {
    return NextResponse.json(
      {
        error:
          'embedding aliases require embedding_dimension, embedding_model_family, and embedding_model_version',
      },
      { status: 400 },
    )
  }

  const dup = await queryOne(`SELECT id FROM aliases WHERE workspace_id = $1 AND name = $2`, [
    WORKSPACE_ID,
    name,
  ])
  if (dup) return NextResponse.json({ error: `Alias "${name}" already exists.` }, { status: 409 })

  const inserted = await queryOne(
    `INSERT INTO aliases (
       workspace_id, name, description, fallback_chain, capability_type,
       fallback_allowed, local_only_eligible, retention_policy_notes,
       cost_latency_priority, embedding_dimension, embedding_model_family,
       embedding_model_version
     )
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, name, description, fallback_chain,
       capability_type, fallback_allowed, local_only_eligible,
       retention_policy_notes, cost_latency_priority,
       embedding_dimension, embedding_model_family, embedding_model_version,
       created_at, updated_at`,
    [
      WORKSPACE_ID,
      name,
      description,
      JSON.stringify(fallbackChain),
      capabilityType,
      fallbackAllowed,
      localOnlyEligible,
      retentionPolicyNotes,
      costLatencyPriority,
      embeddingDimension,
      embeddingModelFamily,
      embeddingModelVersion,
    ],
  )
  return NextResponse.json({ alias: inserted }, { status: 201 })
}
