#!/usr/bin/env node
/**
 * scripts/aether-seed.js
 *
 * Wires the three Aether sandbox alias chains to the REAL provider rows.
 * Idempotent — safe to re-run. Run AFTER migration 009 and after the
 * anthropic (api_key) and openai providers exist (with encrypted keys).
 *
 *   docker exec gateway-web node scripts/aether-seed.js
 *
 * Chains are single-entry on purpose: a sandbox alias routes to exactly ONE
 * build-tier model with no fallback to anything else. Sandbox aliases may
 * never include an OAuth entry (that path is uncosted and would bypass the
 * cap), so this only ever wires api_key / LiteLLM providers.
 */

const { Pool } = require('pg')

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[aether-seed] DATABASE_URL is not set')
    process.exit(1)
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 2,
  })
  const client = await pool.connect()
  try {
    const anthropic = (
      await client.query(
        `SELECT id FROM providers WHERE workspace_id = $1 AND name = 'anthropic' AND auth_type = 'api_key'`,
        [WORKSPACE_ID],
      )
    ).rows[0]
    if (!anthropic) {
      console.error(
        '[aether-seed] No anthropic (api_key) provider found. Run seed-phase2b.js (with a real API key) first — sandbox lanes never use the OAuth path.',
      )
      process.exit(1)
    }

    const openai = (
      await client.query(
        `SELECT id FROM providers WHERE workspace_id = $1 AND name = 'openai' AND auth_type = 'api_key'`,
        [WORKSPACE_ID],
      )
    ).rows[0]

    await setChain(client, 'aether-claude-build', [
      { provider_id: anthropic.id, model: 'claude-sonnet-5', priority: 0 },
    ])
    await setChain(client, 'aether-claude-mechanical', [
      { provider_id: anthropic.id, model: 'claude-haiku-4-5', priority: 0 },
    ])

    if (openai) {
      await setChain(client, 'aether-codex-build', [
        { provider_id: openai.id, model: 'openai-gpt-5-codex', priority: 0 },
      ])
      console.log('[aether-seed] aether-codex-build wired to openai/openai-gpt-5-codex.')
      console.log(
        '[aether-seed] NOTE: gpt-5-codex is UNPRICED in model_prices; a budgeted key will REFUSE it until you add its price (never bill an unknown cost as free).',
      )
    } else {
      console.log(
        '[aether-seed] No openai (api_key) provider found — aether-codex-build left with an empty chain. Add an OpenAI provider (with key) and re-run to enable Codex.',
      )
    }

    console.log('')
    console.log(
      '[aether-seed] Done. aether-claude-build -> Sonnet, aether-claude-mechanical -> Haiku.',
    )
  } finally {
    client.release()
    await pool.end()
  }
}

async function setChain(client, aliasName, chain) {
  const res = await client.query(
    `UPDATE aliases SET fallback_chain = $1::jsonb, updated_at = now()
      WHERE workspace_id = $2 AND name = $3`,
    [JSON.stringify(chain), WORKSPACE_ID, aliasName],
  )
  if (res.rowCount === 0) {
    console.warn(`[aether-seed] alias "${aliasName}" not found (did migration 009 run?)`)
  } else {
    console.log(`[aether-seed] ${aliasName} chain set (${chain.length} entry).`)
  }
}

main().catch((err) => {
  console.error('[aether-seed] fatal:', err)
  process.exit(1)
})
