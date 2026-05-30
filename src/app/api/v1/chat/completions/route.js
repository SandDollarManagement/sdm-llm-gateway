// src/app/api/v1/chat/completions/route.js
// Public OpenAI-compatible chat completions endpoint.
// Auth: per-app bearer token (D-008).
// Routing: model parameter is interpreted as an alias name (D-004), resolved
// to a fallback chain of providers. First successful provider wins.

import { NextResponse } from 'next/server'
import { authenticateAppRequest, AppAuthError } from '@/lib/app-auth'
import { executeChatCompletion } from '@/lib/routing/execute-call'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // claude CLI spawn requires Node runtime, not Edge.

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', type: 'invalid_request_error' } },
      { status: 400 }
    )
  }

  const aliasName = body?.model
  const messages = body?.messages
  if (!aliasName || typeof aliasName !== 'string') {
    return NextResponse.json(
      { error: { message: '`model` must be a non-empty string (alias name)', type: 'invalid_request_error' } },
      { status: 400 }
    )
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: { message: '`messages` must be a non-empty array', type: 'invalid_request_error' } },
      { status: 400 }
    )
  }

  let app
  try {
    app = await authenticateAppRequest(request)
  } catch (err) {
    if (err instanceof AppAuthError) {
      return NextResponse.json(
        { error: { message: err.message, type: 'authentication_error' } },
        { status: err.status }
      )
    }
    return NextResponse.json(
      { error: { message: 'Authentication failure', type: 'authentication_error' } },
      { status: 500 }
    )
  }

  try {
    const { completion } = await executeChatCompletion({
      aliasName,
      app,
      messages,
    })
    return NextResponse.json(completion, { status: 200 })
  } catch (err) {
    console.error('[chat/completions] route error:', err)
    return NextResponse.json(
      { error: { message: err.message || 'Routing failed', type: 'gateway_error' } },
      { status: 502 }
    )
  }
}
