// src/app/v1/chat/completions/route.js
// Public OpenAI-compatible chat completions endpoint, served at /v1/chat/completions.
//
// Auth: per-app bearer token (D-008).
// Routing: model parameter is interpreted as an alias name (D-004).
// Streaming: when `stream: true` in the request body, returns Server-Sent
// Events. Phase 2D supports streaming only for Anthropic (api_key) entries.

import { NextResponse } from 'next/server'
import { authenticateAppRequest, AppAuthError } from '@/lib/app-auth'
import { executeChatCompletion } from '@/lib/routing/execute-call'
import { streamChatCompletionsOpenAI } from '@/lib/routing/stream-call'
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
  const messages = body?.messages
  const stream = body?.stream === true
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
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: { message: '`messages` must be a non-empty array', type: 'invalid_request_error' } },
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

  // ---------- Streaming path ----------
  if (stream) {
    const encoder = new TextEncoder()
    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChatCompletionsOpenAI({
            aliasName,
            app,
            messages,
            correlationId,
            abortSignal: request.signal,
          })) {
            controller.enqueue(encoder.encode(chunk))
          }
        } catch (err) {
          console.error('[chat/completions stream] fatal:', err)
          try {
            const errPayload = JSON.stringify({
              error: { message: err.message, type: 'gateway_error' },
            })
            controller.enqueue(encoder.encode(`data: ${errPayload}\n\n`))
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          } catch {}
        } finally {
          controller.close()
        }
      },
    })
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    }
    if (correlationId) headers['x-correlation-id'] = correlationId
    return new Response(sseStream, {
      status: 200,
      headers,
    })
  }

  // ---------- Non-streaming path ----------
  try {
    const { completion } = await executeChatCompletion({
      aliasName,
      app,
      messages,
      correlationId,
    })
    const response = NextResponse.json(completion, { status: 200 })
    if (correlationId) response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (err) {
    console.error('[chat/completions] route error:', err)
    await logCall({
      workspaceId: WORKSPACE_ID,
      appId: app?.id ?? null,
      alias: aliasName || null,
      providerId: null,
      model: null,
      authMethod: null,
      latencyMs: null,
      status: err instanceof GatewayPolicyError ? err.status : 502,
      error: err.message?.slice(0, 1000) || 'Routing failed',
      fallbackPosition: 0,
      correlationId,
      policySnapshot: { route: '/v1/chat/completions', policy_error: err.code || null },
    })
    return NextResponse.json(
      { error: { message: err.message || 'Routing failed', type: 'gateway_error' } },
      { status: err instanceof GatewayPolicyError ? err.status : 502 },
    )
  }
}
