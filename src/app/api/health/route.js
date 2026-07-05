// src/app/api/health/route.js
// Unauthenticated liveness endpoint for external watchdogs. Also served at
// /health via a rewrite in next.config.js. Deliberately cheap and free of
// sensitive data: no keys, no spend numbers, no table contents — just booleans.

import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CHECK_TIMEOUT_MS = 2500

async function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('health check timed out')), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function checkDatabase() {
  try {
    await withTimeout(query('SELECT 1'), CHECK_TIMEOUT_MS)
    return true
  } catch {
    return false
  }
}

async function checkLitellm() {
  const base = process.env.LITELLM_INTERNAL_URL
  if (!base) return null // not configured — informational, never a failure
  try {
    // /health/liveliness is LiteLLM's unauthenticated liveness probe.
    const res = await fetch(`${base.replace(/\/+$/, '')}/health/liveliness`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}

export async function GET() {
  const [database, litellm] = await Promise.all([checkDatabase(), checkLitellm()])

  // The gateway cannot serve requests without its database (bearer-token auth
  // and alias resolution both read it), so DB down => degraded => HTTP 503 so a
  // plain HTTP watchdog alerts on the status code alone. LiteLLM is
  // informational only: the Anthropic direct paths bypass it, so LiteLLM being
  // down degrades routing options, not liveness.
  const healthy = database === true

  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      uptime_seconds: Math.round(process.uptime()),
      version: process.env.NEXT_PUBLIC_APP_VERSION || null,
      checks: { database, litellm },
    },
    { status: healthy ? 200 : 503 },
  )
}
