// src/app/v1/embeddings/route.js
// OpenAI-compatible embeddings endpoint. `model` is a gateway alias.

import { NextResponse } from 'next/server'
import { authenticateAppRequest, AppAuthError } from '@/lib/app-auth'
import { executeEmbedding } from '@/lib/routing/execute-embedding'
import { extractCorrelationId, GatewayPolicyError } from '@/lib/routing/policy'
import { logCall } from '@/lib/logging'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', type: 'invalid_request_error' } },
      { status: 400 },
    )
  }

  const aliasName = body?.model
  const input = body?.input
  const correlationId = extractCorrelationId(request, body)

  if (!aliasName || typeof aliasName !== 'string') {
    return NextResponse.json(
      {
        error: {
          message: '`model` must be a non-empty string (alias name)',
          type: 'invalid_request_error',
        },
      },
      { status: 400 },
    )
  }
  if (input == null || !(typeof input === 'string' || (Array.isArray(input) && input.length > 0))) {
    return NextResponse.json(
      {
        error: {
          message: '`input` must be a non-empty string or array',
          type: 'invalid_request_error',
        },
      },
      { status: 400 },
    )
  }

  let app
  try {
    app = await authenticateAppRequest(request)
  } catch (err) {
    if (err instanceof AppAuthError) {
      return NextResponse.json(
        { error: { message: err.message, type: 'authentication_error' } },
        { status: err.status },
      )
    }
    return NextResponse.json(
      { error: { message: 'Authentication failure', type: 'authentication_error' } },
      { status: 500 },
    )
  }

  try {
    const { response } = await executeEmbedding({
      aliasName,
      app,
      input,
      correlationId,
    })
    const nextResponse = NextResponse.json(response, { status: 200 })
    if (correlationId) nextResponse.headers.set('x-correlation-id', correlationId)
    return nextResponse
  } catch (err) {
    console.error('[embeddings] route error:', err)
    await logCall({
      workspaceId: WORKSPACE_ID,
      appId: app?.id ?? null,
      alias: aliasName || null,
      providerId: null,
      model: null,
      authMethod: null,
      latencyMs: null,
      status: err instanceof GatewayPolicyError ? err.status : 502,
      error: err.message?.slice(0, 1000) || 'Embedding routing failed',
      fallbackPosition: 0,
      correlationId,
      policySnapshot: { route: '/v1/embeddings', policy_error: err.code || null },
    })
    return NextResponse.json(
      { error: { message: err.message || 'Embedding routing failed', type: 'gateway_error' } },
      { status: err instanceof GatewayPolicyError ? err.status : 502 },
    )
  }
}
