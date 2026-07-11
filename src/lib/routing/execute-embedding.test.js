import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((value) => `decrypted:${value}`),
}))

vi.mock('@/lib/providers/litellm', () => ({
  callEmbeddingsViaLiteLLM: vi.fn(),
}))

vi.mock('@/lib/logging', () => ({
  logCall: vi.fn(),
}))

import { query, queryOne } from '@/lib/db'
import { callEmbeddingsViaLiteLLM } from '@/lib/providers/litellm'
import { logCall } from '@/lib/logging'
import { executeEmbedding } from './execute-embedding'

const app = {
  id: 'app-1',
  name: 'document-vault',
  enabled: true,
  monthly_budget_usd: null,
  allowed_aliases: ['doc-embed'],
  fallback_allowed: true,
}

describe('executeEmbedding', () => {
  beforeEach(() => {
    query.mockReset()
    queryOne.mockReset()
    callEmbeddingsViaLiteLLM.mockReset()
    logCall.mockReset()
  })

  it('routes embedding aliases through LiteLLM and preserves correlation metadata', async () => {
    queryOne.mockResolvedValueOnce({
      id: 'alias-1',
      name: 'doc-embed',
      description: null,
      fallback_chain: [
        { provider_id: 'provider-1', model: 'openai-text-embedding-3-small', priority: 0 },
      ],
      capability_type: 'embedding',
      fallback_allowed: false,
      local_only_eligible: false,
      embedding_dimension: 1536,
      embedding_model_family: 'openai-text-embedding',
      embedding_model_version: 'text-embedding-3-small',
    })
    query.mockResolvedValueOnce([
      { id: 'provider-1', name: 'openai', auth_type: 'api_key', enabled: true },
    ])
    queryOne.mockResolvedValueOnce({ credentials: 'openai-key' })
    callEmbeddingsViaLiteLLM.mockResolvedValueOnce({
      model: 'text-embedding-3-small',
      raw_response: {
        object: 'list',
        data: [{ object: 'embedding', embedding: [0.1, 0.2], index: 0 }],
        usage: { prompt_tokens: 2, total_tokens: 2 },
      },
      latency_ms: 12,
      request_tokens: 2,
      response_tokens: 0,
    })

    const result = await executeEmbedding({
      aliasName: 'doc-embed',
      app,
      input: 'hello',
      correlationId: 'dv-embed-1',
    })

    expect(result.response.model).toBe('doc-embed')
    expect(result.response._gateway.embedding_dimension).toBe(1536)
    expect(result.response._gateway.correlation_id).toBe('dv-embed-1')
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'dv-embed-1', status: 200 }),
    )
  })

  it('rejects non-embedding aliases on the embeddings route', async () => {
    queryOne.mockResolvedValueOnce({
      id: 'alias-1',
      name: 'doc-answer',
      fallback_chain: [{ provider_id: 'provider-1', model: 'openai-gpt-4o', priority: 0 }],
      capability_type: 'generation',
      fallback_allowed: true,
      local_only_eligible: false,
    })
    query.mockResolvedValueOnce([
      { id: 'provider-1', name: 'openai', auth_type: 'api_key', enabled: true },
    ])

    await expect(
      executeEmbedding({
        aliasName: 'doc-answer',
        app: { ...app, allowed_aliases: ['doc-answer'] },
        input: 'hello',
      }),
    ).rejects.toThrow('not embedding')
  })
})
