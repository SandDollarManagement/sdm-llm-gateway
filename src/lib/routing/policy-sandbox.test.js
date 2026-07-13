import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ queryOne: vi.fn(), query: vi.fn() }))
vi.mock('@/lib/routing/cost', () => ({ isModelPriced: vi.fn() }))
vi.mock('@/lib/routing/budget', () => ({
  getProjectSpend: vi.fn(),
  getKeySpend: vi.fn(),
  countRecentRequests: vi.fn(),
  sumRecentTokens: vi.fn(),
  recordSpendAlerts: vi.fn(),
  monthStartIso: () => '2026-07-01T00:00:00.000Z',
  currentPeriod: () => '2026-07',
}))

import { queryOne } from '@/lib/db'
import { isModelPriced } from '@/lib/routing/cost'
import { getProjectSpend, countRecentRequests, sumRecentTokens } from '@/lib/routing/budget'
import { enforceAppPolicy, validateAliasChainPolicy } from './policy'

const sandboxApp = (over = {}) => ({
  id: 'key-1',
  name: 'aether-build-1',
  enabled: true,
  project_id: 'proj-1',
  budget_enforced: true,
  allowed_aliases: ['aether-claude-build'],
  monthly_budget_usd: null,
  ...over,
})

const buildAlias = {
  name: 'aether-claude-build',
  fallback_chain: [{ provider_id: 'anthropic-1', model: 'claude-sonnet-5', priority: 0 }],
}

describe('aether sandbox policy', () => {
  beforeEach(() => {
    queryOne.mockReset()
    isModelPriced.mockReset().mockResolvedValue(true)
    getProjectSpend.mockReset().mockResolvedValue(0)
    countRecentRequests.mockReset().mockResolvedValue(0)
    sumRecentTokens.mockReset().mockResolvedValue(0)
  })

  it('kill switch: a disabled project refuses every key in it', async () => {
    queryOne.mockResolvedValueOnce({ id: 'proj-1', name: 'aether-sandbox', enabled: false })
    await expect(
      enforceAppPolicy({
        workspaceId: 'w1',
        app: sandboxApp(),
        alias: buildAlias,
        requestedAlias: 'aether-claude-build',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'project_disabled' })
  })

  it('fails CLOSED: a project-scoped key with an empty allowlist is refused', async () => {
    queryOne.mockResolvedValueOnce({ id: 'proj-1', name: 'aether-sandbox', enabled: true })
    await expect(
      enforceAppPolicy({
        workspaceId: 'w1',
        app: sandboxApp({ allowed_aliases: [] }),
        alias: buildAlias,
        requestedAlias: 'aether-claude-build',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'allowlist_empty' })
  })

  it('refuses an unpriced model rather than billing it as free', async () => {
    queryOne.mockResolvedValueOnce({ id: 'proj-1', name: 'aether-sandbox', enabled: true })
    isModelPriced.mockResolvedValue(false)
    await expect(
      enforceAppPolicy({
        workspaceId: 'w1',
        app: sandboxApp({ allowed_aliases: ['aether-codex-build'] }),
        alias: {
          name: 'aether-codex-build',
          fallback_chain: [{ provider_id: 'openai-1', model: 'openai-gpt-5-codex' }],
        },
        requestedAlias: 'aether-codex-build',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'model_unpriced' })
  })

  it('throttles when the rpm ceiling is hit', async () => {
    queryOne.mockResolvedValueOnce({
      id: 'proj-1',
      name: 'aether-sandbox',
      enabled: true,
      default_rpm_limit: 30,
    })
    countRecentRequests.mockResolvedValue(30)
    await expect(
      enforceAppPolicy({
        workspaceId: 'w1',
        app: sandboxApp({ rpm_limit: null }),
        alias: buildAlias,
        requestedAlias: 'aether-claude-build',
      }),
    ).rejects.toMatchObject({ status: 429, code: 'rate_limit_rpm' })
  })

  it('refuses once the project spend cap is reached', async () => {
    queryOne.mockResolvedValueOnce({
      id: 'proj-1',
      name: 'aether-sandbox',
      enabled: true,
      monthly_budget_usd: '20.00',
    })
    getProjectSpend.mockResolvedValue(20)
    await expect(
      enforceAppPolicy({
        workspaceId: 'w1',
        app: sandboxApp(),
        alias: buildAlias,
        requestedAlias: 'aether-claude-build',
      }),
    ).rejects.toMatchObject({ status: 429, code: 'project_budget_exceeded' })
  })

  it('allows a fully-compliant, under-cap sandbox request', async () => {
    queryOne.mockResolvedValueOnce({
      id: 'proj-1',
      name: 'aether-sandbox',
      enabled: true,
      monthly_budget_usd: '20.00',
      default_rpm_limit: 30,
      default_tpm_limit: 60000,
    })
    getProjectSpend.mockResolvedValue(1.23)
    await expect(
      enforceAppPolicy({
        workspaceId: 'w1',
        app: sandboxApp(),
        alias: buildAlias,
        requestedAlias: 'aether-claude-build',
      }),
    ).resolves.toBe(true)
  })

  it('bans an OAuth entry in a sandbox alias chain', () => {
    expect(() =>
      validateAliasChainPolicy({
        alias: {
          name: 'aether-claude-build',
          sandbox_only: true,
          fallback_chain: [{ provider_id: 'oauth-1', model: 'claude-sonnet-5' }],
        },
        providers: [{ id: 'oauth-1', name: 'anthropic', auth_type: 'oauth' }],
      }),
    ).toThrow(/may not include OAuth/)
  })

  it('containment does NOT depend on budget_enforced: a project key still refuses unpriced models', async () => {
    // Even if an admin created a project-scoped key with budget_enforced=false,
    // containment holds because it is project-scoped.
    queryOne.mockResolvedValueOnce({ id: 'proj-1', name: 'aether-sandbox', enabled: true })
    isModelPriced.mockResolvedValue(false)
    await expect(
      enforceAppPolicy({
        workspaceId: 'w1',
        app: sandboxApp({ budget_enforced: false, allowed_aliases: ['aether-codex-build'] }),
        alias: {
          name: 'aether-codex-build',
          fallback_chain: [{ provider_id: 'openai-1', model: 'openai-gpt-5-codex' }],
        },
        requestedAlias: 'aether-codex-build',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'model_unpriced' })
  })

  it('bans OAuth for a project-scoped key even when the alias is not sandbox_only', () => {
    expect(() =>
      validateAliasChainPolicy({
        alias: {
          name: 'default',
          sandbox_only: false,
          fallback_chain: [{ provider_id: 'oauth-1', model: 'claude-sonnet-5' }],
        },
        providers: [{ id: 'oauth-1', name: 'anthropic', auth_type: 'oauth' }],
        app: { id: 'key-1', project_id: 'proj-1' },
      }),
    ).toThrow(/may not include OAuth/)
  })
})
