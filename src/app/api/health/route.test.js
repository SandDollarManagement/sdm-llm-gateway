// Tests for the unauthenticated /api/health liveness endpoint.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', () => ({ query: vi.fn() }))

import { query } from '@/lib/db'
import { GET } from './route'

const ORIGINAL_LITELLM_URL = process.env.LITELLM_INTERNAL_URL

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    query.mockReset()
    delete process.env.LITELLM_INTERNAL_URL
  })

  afterEach(() => {
    if (ORIGINAL_LITELLM_URL === undefined) {
      delete process.env.LITELLM_INTERNAL_URL
    } else {
      process.env.LITELLM_INTERNAL_URL = ORIGINAL_LITELLM_URL
    }
  })

  it('returns 200 ok when the database is reachable', async () => {
    query.mockResolvedValue([{ '?column?': 1 }])

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.checks.database).toBe(true)
    expect(typeof body.uptime_seconds).toBe('number')
  })

  it('returns 503 degraded when the database is unreachable', async () => {
    query.mockRejectedValue(new Error('connection refused'))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.checks.database).toBe(false)
  })

  it('reports litellm as null when LITELLM_INTERNAL_URL is not configured', async () => {
    query.mockResolvedValue([{ '?column?': 1 }])

    const res = await GET()
    const body = await res.json()

    expect(body.checks.litellm).toBeNull()
    expect(res.status).toBe(200)
  })

  it('reports litellm reachability without letting it affect the status code', async () => {
    query.mockResolvedValue([{ '?column?': 1 }])
    process.env.LITELLM_INTERNAL_URL = 'http://gateway-litellm:4000'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('litellm down')))

    const res = await GET()
    const body = await res.json()

    expect(body.checks.litellm).toBe(false)
    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
  })

  it('never exposes sensitive fields (keys, spend numbers)', async () => {
    query.mockResolvedValue([{ '?column?': 1 }])

    const res = await GET()
    const body = await res.json()

    expect(Object.keys(body).sort()).toEqual(['checks', 'status', 'uptime_seconds', 'version'])
    const serialized = JSON.stringify(body)
    expect(serialized).not.toMatch(/sk-ant|api[_-]?key|cost|usd|budget|token_hash/i)
  })
})
