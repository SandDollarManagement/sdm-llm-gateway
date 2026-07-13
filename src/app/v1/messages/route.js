// src/app/v1/messages/route.js
// Anthropic-compatible Messages endpoint at /v1/messages.
//
// Apps using the Anthropic SDK directly hit this. Request and response
// shapes match Anthropic's Messages API spec. The `model` parameter is
// interpreted as an alias name (same convention as /v1/chat/completions).
// Phase 2D supports anthropic (api_key) chain entries; other providers
// will be added when their adapters can translate to Anthropic's shape.

import { NextResponse } from 'next/server'
import { authenticateAppRequest, AppAuthError } from '@/lib/app-auth'
import { resolveAlias } from '@/lib/routing/resolve-alias'
import { callAnthropicMessagesRaw } from '@/lib/providers/anthropic-api'
import { streamMessagesAnthropic } from '@/lib/routing/stream-call'
import { logCall } from '@/lib/logging'
import { computeCostUsd } from '@/lib/routing/cost'
import {
  enforceAppPolicy,
  extractCorrelationId,
  GatewayPolicyError,
  policySnapshot,
  selectChainEntries,
  validateAliasChainPolicy,
} from '@/lib/routing/policy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { type: 'error', error: { type: 'invalid_request_error', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const aliasName = body?.model
  const anthroMessages = body?.messages
  const system = body?.system || null
  const maxTokens = body?.max_tokens || 4096
  const stream = body?.stream === true
  const correlationId = extractCorrelationId(request, body)

  if (!aliasName || typeof aliasName !== 'string') {
    return NextResponse.json(
      {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: '`model` must be a non-empty string (alias name)',
        },
      },
      { status: 400 },
    )
  }
  if (!Array.isArray(anthroMessages) || anthroMessages.length === 0) {
    return NextResponse.json(
      {
        type: 'error',
        error: { type: 'invalid_request_error', message: '`messages` must be a non-empty array' },
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
        { type: 'error', error: { type: 'authentication_error', message: err.message } },
        { status: err.status },
      )
    }
    return NextResponse.json(
      { type: 'error', error: { type: 'authentication_error', message: 'Authentication failure' } },
      { status: 500 },
    )
  }

  // Normalize Anthropic message content (string or array of content blocks)
  // into the same string-per-message shape used by our routing layer.
  const normalizedMessages = anthroMessages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .filter((c) => c?.type === 'text')
              .map((c) => c.text)
              .join('')
          : '',
  }))

  // ---------- Streaming path ----------
  if (stream) {
    const encoder = new TextEncoder()
    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamMessagesAnthropic({
            aliasName,
            app,
            messages: normalizedMessages,
            system,
            maxTokens,
            correlationId,
            abortSignal: request.signal,
          })) {
            controller.enqueue(encoder.encode(chunk))
          }
        } catch (err) {
          console.error('[/v1/messages stream] fatal:', err)
          try {
            const errPayload = JSON.stringify({
              type: 'error',
              error: { type: 'gateway_error', message: err.message },
            })
            controller.enqueue(encoder.encode(`event: error\ndata: ${errPayload}\n\n`))
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
  let alias
  let providers
  try {
    const resolved = await resolveAlias({
      workspaceId: WORKSPACE_ID,
      aliasName,
    })
    alias = resolved.alias
    providers = resolved.providers
    validateAliasChainPolicy({ alias, providers, app })
    await enforceAppPolicy({ app, alias, workspaceId: WORKSPACE_ID, requestedAlias: aliasName })
  } catch (err) {
    await logCall({
      workspaceId: WORKSPACE_ID,
      appId: app?.id ?? null,
      alias: aliasName || null,
      providerId: null,
      model: null,
      authMethod: null,
      status: err instanceof GatewayPolicyError ? err.status : 502,
      error: err.message?.slice(0, 1000) || 'Routing failed',
      fallbackPosition: 0,
      correlationId,
      policySnapshot: { route: '/v1/messages', policy_error: err.code || null },
    })
    return NextResponse.json(
      { type: 'error', error: { type: 'gateway_error', message: err.message || 'Routing failed' } },
      { status: err instanceof GatewayPolicyError ? err.status : 502 },
    )
  }
  const providerById = new Map(providers.map((p) => [p.id, p]))
  const snapshot = policySnapshot({ alias, app, correlationId })

  const chainEntries = selectChainEntries({ alias, app })
  const candidates = []
  for (let i = 0; i < chainEntries.length; i++) {
    const entry = chainEntries[i]
    const provider = providerById.get(entry.provider_id)
    if (!provider || !provider.enabled) continue
    if (provider.name.toLowerCase() === 'anthropic' && provider.auth_type === 'api_key') {
      const originalPosition = Array.isArray(alias.fallback_chain)
        ? alias.fallback_chain.indexOf(entry)
        : i
      candidates.push({ entry, provider, position: originalPosition >= 0 ? originalPosition : i })
    }
  }
  if (candidates.length === 0) {
    await logCall({
      workspaceId: WORKSPACE_ID,
      appId: app?.id ?? null,
      alias: alias.name,
      providerId: null,
      model: null,
      authMethod: null,
      status: 400,
      error: `alias "${aliasName}" has no anthropic (api_key) entry in its chain; /v1/messages currently supports anthropic only.`,
      fallbackPosition: 0,
      correlationId,
      policySnapshot: snapshot,
    })
    return NextResponse.json(
      {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: `alias "${aliasName}" has no anthropic (api_key) entry in its chain; /v1/messages currently supports anthropic only.`,
        },
      },
      { status: 400 },
    )
  }

  // Build the Anthropic request from the ORIGINAL body so structured content
  // (tool_use / tool_result), tools, tool_choice, and system blocks WITH
  // cache_control pass through UNTOUCHED. Override only the model (alias ->
  // resolved). The streaming branch above still uses normalizedMessages. (D-022)
  // Clamp output tokens to the alias ceiling when set (bounds sandbox overshoot).
  const effectiveMaxTokens =
    alias.max_output_tokens != null
      ? Math.min(Number(maxTokens), Number(alias.max_output_tokens))
      : maxTokens
  const anthropicRequest = { messages: anthroMessages, max_tokens: effectiveMaxTokens }
  if (system !== null) anthropicRequest.system = system
  if (body.tools !== undefined) anthropicRequest.tools = body.tools
  if (body.tool_choice !== undefined) anthropicRequest.tool_choice = body.tool_choice
  if (body.metadata !== undefined) anthropicRequest.metadata = body.metadata
  if (body.stop_sequences !== undefined) anthropicRequest.stop_sequences = body.stop_sequences
  if (body.temperature !== undefined) anthropicRequest.temperature = body.temperature
  if (body.top_p !== undefined) anthropicRequest.top_p = body.top_p
  if (body.top_k !== undefined) anthropicRequest.top_k = body.top_k

  const errors = []
  for (const chosen of candidates) {
    const startedAt = Date.now()
    try {
      const result = await callAnthropicMessagesRaw({
        providerId: chosen.provider.id,
        anthropicRequest,
        model: chosen.entry.model,
        forwardHeaders: {
          version: request.headers.get('anthropic-version') || undefined,
          beta: request.headers.get('anthropic-beta') || undefined,
        },
      })

      const { costUsd } = await computeCostUsd({
        model: chosen.entry.model,
        requestTokens: result.request_tokens ?? null,
        responseTokens: result.response_tokens ?? null,
      })
      await logCall({
        workspaceId: WORKSPACE_ID,
        appId: app.id,
        alias: alias.name,
        providerId: chosen.provider.id,
        model: result.model,
        authMethod: chosen.provider.auth_type,
        requestTokens: result.request_tokens ?? null,
        responseTokens: result.response_tokens ?? null,
        costUsd,
        latencyMs: result.latency_ms,
        status: 200,
        fallbackPosition: chosen.position,
        correlationId,
        policySnapshot: snapshot,
      })

      // Pass through Anthropic's response shape directly (raw_response is the
      // full original body returned by Anthropic).
      const response = NextResponse.json(result.raw_response, { status: 200 })
      if (correlationId) response.headers.set('x-correlation-id', correlationId)
      return response
    } catch (err) {
      console.error('[/v1/messages] route error:', err)
      errors.push({
        position: chosen.position,
        providerName: chosen.provider.name,
        error: err.message,
      })
      await logCall({
        workspaceId: WORKSPACE_ID,
        appId: app.id,
        alias: alias.name,
        providerId: chosen.provider.id,
        model: chosen.entry.model || null,
        authMethod: chosen.provider.auth_type,
        latencyMs: Date.now() - startedAt,
        status: err.status ?? 500,
        error: err.message?.slice(0, 1000),
        fallbackPosition: chosen.position,
        correlationId,
        policySnapshot: snapshot,
      })
    }
  }

  const summary = errors
    .map((e) => `[${e.position}/${e.providerName || '?'}] ${e.error}`)
    .join(' | ')
  return NextResponse.json(
    {
      type: 'error',
      error: {
        type: 'gateway_error',
        message: `All providers in chain failed for alias "${aliasName}": ${summary}`,
      },
    },
    { status: 502 },
  )
}
