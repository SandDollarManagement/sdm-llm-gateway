import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((value) => `decrypted:${value}`),
}))

vi.mock('@/lib/providers/anthropic-claude-cli', () => ({
  callAnthropicViaClaudeCli: vi.fn(),
}))

vi.mock('@/lib/providers/anthropic-api', () => ({
  callAnthropicViaApiKey: vi.fn(),
}))

vi.mock('@/lib/providers/litellm', () => ({
  callViaLiteLLM: vi.fn(),
}))

vi.mock('@/lib/logging', () => ({
  logCall: vi.fn(),
}))

import { query, queryOne } from '@/lib/db'
import { callViaLiteLLM } from '@/lib/providers/litellm'
import { logCall } from '@/lib/logging'
import { executeChatCompletion } from './execute-call'

const app = {
  id: 'app-1',
  name: 'document-vault',
  enabled: true,
  monthly_budget_usd: null,
  allowed_aliases: null,
  fallback_allowed: true,
}

function mockAlias({ name = 'doc-answer', chain, overrides = {} }) {
  queryOne.mockResolvedValueOnce({
    id: 'alias-1',
    name,
    description: null,
    fallback_chain: chain,
    capability_type: 'generation',
    fallback_allowed: true,
    local_only_eligible: false,
    cost_latency_priority: 'balanced',
    ...overrides,
  })
}

function mockProviders(providers) {
  query.mockResolvedValueOnce(providers)
}

describe('executeChatCompletion', () => {
  beforeEach(() => {
    query.mockReset()
    queryOne.mockReset()
    callViaLiteLLM.mockReset()
    logCall.mockReset()
  })

  it('falls back to the next provider when the primary provider fails', async () => {
    mockAlias({
      chain: [
        { provider_id: 'provider-1', model: 'openai-gpt-4o', priority: 0 },
        { provider_id: 'provider-2', model: 'gemini-2.5-flash', priority: 1 },
      ],
    })
    mockProviders([
      { id: 'provider-1', name: 'openai', auth_type: 'api_key', enabled: true },
      { id: 'provider-2', name: 'gemini', auth_type: 'api_key', enabled: true },
    ])
    queryOne.mockResolvedValueOnce({ credentials: 'openai-key' })
    queryOne.mockResolvedValueOnce({ credentials: 'gemini-key' })
    callViaLiteLLM
      .mockRejectedValueOnce(Object.assign(new Error('provider outage'), { status: 503 }))
      .mockResolvedValueOnce({
        id: 'chatcmpl-ok',
        model: 'gemini-2.5-flash',
        content: 'ok',
        latency_ms: 10,
        request_tokens: 1,
        response_tokens: 1,
      })

    const result = await executeChatCompletion({
      aliasName: 'doc-answer',
      app,
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.model).toBe('gemini-2.5-flash')
    expect(callViaLiteLLM).toHaveBeenCalledTimes(2)
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: 503, fallbackPosition: 0 }),
    )
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, fallbackPosition: 1 }),
    )
  })

  it('does not fall back when app policy disables fallback', async () => {
    mockAlias({
      chain: [
        { provider_id: 'provider-1', model: 'openai-gpt-4o', priority: 0 },
        { provider_id: 'provider-2', model: 'gemini-2.5-flash', priority: 1 },
      ],
    })
    mockProviders([
      { id: 'provider-1', name: 'openai', auth_type: 'api_key', enabled: true },
      { id: 'provider-2', name: 'gemini', auth_type: 'api_key', enabled: true },
    ])
    queryOne.mockResolvedValueOnce({ credentials: 'openai-key' })
    callViaLiteLLM.mockRejectedValueOnce(
      Object.assign(new Error('provider outage'), { status: 503 }),
    )

    await expect(
      executeChatCompletion({
        aliasName: 'doc-answer',
        app: { ...app, fallback_allowed: false },
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow('All providers in chain failed')

    expect(callViaLiteLLM).toHaveBeenCalledTimes(1)
  })

  it('rejects local-only aliases whose chain contains a cloud provider', async () => {
    mockAlias({
      name: 'local-private',
      chain: [{ provider_id: 'provider-1', model: 'openai-gpt-4o', priority: 0 }],
      overrides: {
        local_only_eligible: true,
        fallback_allowed: false,
        cost_latency_priority: 'local',
      },
    })
    mockProviders([{ id: 'provider-1', name: 'openai', auth_type: 'api_key', enabled: true }])

    await expect(
      executeChatCompletion({
        aliasName: 'local-private',
        app,
        messages: [{ role: 'user', content: 'private' }],
      }),
    ).rejects.toThrow('local-only')

    expect(callViaLiteLLM).not.toHaveBeenCalled()
  })

  it('rejects embedding fallback chains with incompatible vector dimensions', async () => {
    mockAlias({
      name: 'doc-embed',
      chain: [
        { provider_id: 'provider-1', model: 'embed-a', priority: 0, embedding_dimension: 1536 },
        { provider_id: 'provider-2', model: 'embed-b', priority: 1, embedding_dimension: 3072 },
      ],
      overrides: {
        capability_type: 'embedding',
        embedding_dimension: 1536,
        embedding_model_family: 'openai-text-embedding',
        embedding_model_version: 'text-embedding-3-small',
      },
    })
    mockProviders([
      { id: 'provider-1', name: 'openai', auth_type: 'api_key', enabled: true },
      { id: 'provider-2', name: 'openai', auth_type: 'api_key', enabled: true },
    ])

    await expect(
      executeChatCompletion({
        aliasName: 'doc-embed',
        app,
        messages: [{ role: 'user', content: 'embed this' }],
      }),
    ).rejects.toThrow('cannot fall back')
  })

  it('surfaces missing provider credentials as a clear error', async () => {
    mockAlias({
      chain: [{ provider_id: 'provider-1', model: 'openai-gpt-4o', priority: 0 }],
    })
    mockProviders([{ id: 'provider-1', name: 'openai', auth_type: 'api_key', enabled: true }])
    queryOne.mockResolvedValueOnce(null)

    await expect(
      executeChatCompletion({
        aliasName: 'doc-answer',
        app,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow('has no credential stored')

    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        error: expect.stringContaining('has no credential stored'),
      }),
    )
  })

  it('preserves correlation IDs in logs and response metadata', async () => {
    mockAlias({
      chain: [{ provider_id: 'provider-1', model: 'openai-gpt-4o', priority: 0 }],
    })
    mockProviders([{ id: 'provider-1', name: 'openai', auth_type: 'api_key', enabled: true }])
    queryOne.mockResolvedValueOnce({ credentials: 'openai-key' })
    callViaLiteLLM.mockResolvedValueOnce({
      id: 'chatcmpl-ok',
      model: 'openai-gpt-4o',
      content: 'ok',
      latency_ms: 10,
      request_tokens: 1,
      response_tokens: 1,
    })

    const result = await executeChatCompletion({
      aliasName: 'doc-answer',
      app,
      messages: [{ role: 'user', content: 'hello' }],
      correlationId: 'dv-123',
    })

    expect(result.completion._gateway.correlation_id).toBe('dv-123')
    expect(logCall).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'dv-123' }))
  })
})
