// src/app/api/admin/aliases/[id]/test/route.js
// POST /api/admin/aliases/[id]/test
// Admin-only smoke test: fires a tiny sample request through the alias's
// fallback chain and returns which provider answered, the elapsed time,
// and the reply text. This is the "press a button, watch your Max plan
// answer" confirmation flow.

import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { executeChatCompletion } from '@/lib/routing/execute-call'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'
const TEST_PROMPT = 'Say hi in 5 words.'

export async function POST(_request, { params }) {
  try { await requireAdmin() } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const aliasRow = await queryOne(
    `SELECT id, name FROM aliases WHERE id = $1 AND workspace_id = $2`,
    [params.id, WORKSPACE_ID]
  )
  if (!aliasRow) return NextResponse.json({ error: 'Alias not found' }, { status: 404 })

  // Use a synthetic "admin-test" app shape. executeChatCompletion needs
  // an `app` object with at least `id`; logging tolerates a null app_id
  // (foreign key is ON DELETE SET NULL). We pass null so the test calls
  // don't pollute any real app's usage stats.
  const syntheticApp = { id: null, name: 'admin-test' }

  const startedAt = Date.now()
  try {
    const { completion, providerId, model, authMethod, latencyMs } = await executeChatCompletion({
      aliasName: aliasRow.name,
      app: syntheticApp,
      messages: [{ role: 'user', content: TEST_PROMPT }],
    })
    const elapsed = Date.now() - startedAt

    // Resolve provider name for the result display
    const providerRow = providerId
      ? await queryOne(`SELECT name, auth_type FROM providers WHERE id = $1`, [providerId])
      : null

    return NextResponse.json({
      ok: true,
      alias: aliasRow.name,
      provider: providerRow ? `${providerRow.name} (${providerRow.auth_type})` : 'unknown',
      model,
      auth_method: authMethod,
      latency_ms: latencyMs ?? elapsed,
      reply: completion?.choices?.[0]?.message?.content || '(empty)',
    })
  } catch (err) {
    const elapsed = Date.now() - startedAt
    return NextResponse.json({
      ok: false,
      alias: aliasRow.name,
      error: err.message || 'unknown error',
      fallback_errors: err.fallbackErrors || [],
      latency_ms: elapsed,
    }, { status: 502 })
  }
}
