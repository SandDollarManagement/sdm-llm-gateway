import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import { query, queryOne } from '@/lib/db'
import { resolveAlias } from './resolve-alias'

describe('resolveAlias', () => {
  beforeEach(() => {
    query.mockReset()
    queryOne.mockReset()
  })

  it('hydrates alias metadata and providers for the fallback chain', async () => {
    queryOne.mockResolvedValue({
      id: 'alias-1',
      name: 'doc-answer',
      description: 'answer docs',
      fallback_chain: [{ provider_id: 'provider-1', model: 'model-a' }],
      capability_type: 'generation',
      fallback_allowed: true,
      local_only_eligible: false,
    })
    query.mockResolvedValue([
      { id: 'provider-1', name: 'openai', auth_type: 'api_key', enabled: true },
    ])

    const result = await resolveAlias({ workspaceId: 'workspace-1', aliasName: 'doc-answer' })

    expect(result.alias.name).toBe('doc-answer')
    expect(result.alias.capability_type).toBe('generation')
    expect(result.providers).toHaveLength(1)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM providers'), [['provider-1']])
  })

  it('throws a clear error for missing aliases', async () => {
    queryOne.mockResolvedValue(null)

    await expect(
      resolveAlias({ workspaceId: 'workspace-1', aliasName: 'missing' }),
    ).rejects.toThrow('Alias "missing" not found')
  })
})
