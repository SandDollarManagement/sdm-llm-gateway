import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ query: vi.fn() }))

import { query } from '@/lib/db'
import { computeCostUsd, isModelPriced, clearPriceCache } from './cost'

describe('cost computation', () => {
  beforeEach(() => {
    clearPriceCache()
    query.mockReset().mockResolvedValue([
      { model: 'claude-sonnet-5', input_per_mtok: '3.0000', output_per_mtok: '15.0000' },
      { model: 'claude-haiku-4-5', input_per_mtok: '1.0000', output_per_mtok: '5.0000' },
    ])
  })

  it('prices a Sonnet call from input+output tokens', async () => {
    // 1,000,000 in @ $3 + 1,000,000 out @ $15 = $18
    const { costUsd, priced } = await computeCostUsd({
      model: 'claude-sonnet-5',
      requestTokens: 1_000_000,
      responseTokens: 1_000_000,
    })
    expect(priced).toBe(true)
    expect(costUsd).toBeCloseTo(18, 6)
  })

  it('prices a Haiku call proportionally', async () => {
    // 500k in @ $1 + 200k out @ $5 = 0.5 + 1.0 = $1.50
    const { costUsd } = await computeCostUsd({
      model: 'claude-haiku-4-5',
      requestTokens: 500_000,
      responseTokens: 200_000,
    })
    expect(costUsd).toBeCloseTo(1.5, 6)
  })

  it('returns null (not zero) for an unpriced model', async () => {
    const { costUsd, priced } = await computeCostUsd({
      model: 'openai-gpt-5-codex',
      requestTokens: 1000,
      responseTokens: 1000,
    })
    expect(priced).toBe(false)
    expect(costUsd).toBeNull()
  })

  it('isModelPriced reflects table membership', async () => {
    expect(await isModelPriced('claude-sonnet-5')).toBe(true)
    expect(await isModelPriced('openai-gpt-5-codex')).toBe(false)
    expect(await isModelPriced(null)).toBe(false)
  })
})
