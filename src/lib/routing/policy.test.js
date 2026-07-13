import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  queryOne: vi.fn(),
}))

import { queryOne } from '@/lib/db'
import { enforceAppPolicy, extractCorrelationId, GatewayPolicyError } from './policy'

describe('routing policy', () => {
  beforeEach(() => {
    queryOne.mockReset()
  })

  it('enforces per-app allowed aliases', async () => {
    await expect(
      enforceAppPolicy({
        workspaceId: 'workspace-1',
        app: {
          id: 'app-1',
          name: 'document-vault',
          enabled: true,
          allowed_aliases: ['doc-answer'],
          monthly_budget_usd: null,
        },
        alias: { name: 'vision-ocr' },
        requestedAlias: 'vision-ocr',
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'alias_not_allowed',
    })
  })

  it('enforces per-app monthly budget caps only when budget_enforced is set', async () => {
    queryOne.mockResolvedValueOnce({ spent: '10.00' })

    await expect(
      enforceAppPolicy({
        workspaceId: 'workspace-1',
        app: {
          id: 'app-1',
          name: 'document-vault',
          enabled: true,
          allowed_aliases: null,
          monthly_budget_usd: '10.00',
          budget_enforced: true,
        },
        alias: { name: 'doc-answer', fallback_chain: [] },
        requestedAlias: 'doc-answer',
      }),
    ).rejects.toMatchObject({ status: 429, code: 'monthly_budget_exceeded' })
  })

  it('does NOT enforce a budget when budget_enforced is false (no retroactive arming)', async () => {
    // budget_enforced defaults false: an existing app with a cap set stays
    // track-only until explicitly opted in. No queryOne spend lookup happens.
    await expect(
      enforceAppPolicy({
        workspaceId: 'workspace-1',
        app: {
          id: 'app-legacy',
          name: 'legacy-app',
          enabled: true,
          allowed_aliases: null,
          monthly_budget_usd: '1.00',
          budget_enforced: false,
        },
        alias: { name: 'default', fallback_chain: [] },
        requestedAlias: 'default',
      }),
    ).resolves.toBe(true)
  })

  it('extracts and sanitizes an app-supplied correlation ID', () => {
    const request = new Request('https://example.test', {
      headers: { 'x-correlation-id': 'dv-123 document body should not be here' },
    })

    expect(extractCorrelationId(request)).toBe('dv-123documentbodyshouldnotbehere')
  })
})
