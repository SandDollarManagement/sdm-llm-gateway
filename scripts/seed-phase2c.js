#!/usr/bin/env node
/**
 * scripts/seed-phase2c.js
 *
 * One-time seed for Phase 2C. Idempotent — safe to re-run.
 *
 * Inserts provider records for each non-Anthropic provider whose API key
 * env var is present in the current environment (OPENAI_API_KEY,
 * GEMINI_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY). The provider's
 * credentials column stores an encrypted env-var marker, not the key
 * itself — the actual key lives in the gateway-litellm container's env.
 *
 * Then extends the `default` alias's fallback_chain with whatever
 * providers were inserted, in order: OpenAI → Gemini → Grok → OpenRouter,
 * after the existing Anthropic OAuth and API key entries.
 *
 * Run inside gateway-web container (do this only after you've set the
 * matching API key env vars on the gateway-litellm resource):
 *
 *   OPENAI_API_KEY=sk-... GEMINI_API_KEY=... node scripts/seed-phase2c.js
 *
 * Or selectively: only set the env vars for the providers you actually
 * use. The script silently skips providers whose env var is empty.
 */

const { Pool } = require('pg')
const crypto = require('node:crypto')

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

// Map of provider name -> { env var to detect, LiteLLM model_name to pin
// in the default alias chain }.
const NONANTHROPIC = [
  { name: 'openai',     envVar: 'OPENAI_API_KEY',     defaultModel: 'openai-gpt-4o' },
  { name: 'gemini',     envVar: 'GEMINI_API_KEY',     defaultModel: 'gemini-2.5-pro' },
  { name: 'xai-grok',   envVar: 'XAI_API_KEY',        defaultModel: 'grok-3' },
  { name: 'openrouter', envVar: 'OPENROUTER_API_KEY', defaultModel: 'openrouter-deepseek' },
]

async function main() {
  if (!process.env.DATABASE_URL) { console.error('[seed-phase2c] DATABASE_URL not set'); process.exit(1) }
  if (!process.env.GATEWAY_ENCRYPTION_KEY) { console.error('[seed-phase2c] GATEWAY_ENCRYPTION_KEY not set'); process.exit(1) }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 2,
  })
  const client = await pool.connect()
  try {
    // ---------- Pre-flight: confirm Anthropic providers from prior phases exist ----------
    const anthropicOauth = (await client.query(
      `SELECT id FROM providers WHERE workspace_id = $1 AND name = 'anthropic' AND auth_type = 'oauth'`,
      [WORKSPACE_ID]
    )).rows[0]
    const anthropicApiKey = (await client.query(
      `SELECT id FROM providers WHERE workspace_id = $1 AND name = 'anthropic' AND auth_type = 'api_key'`,
      [WORKSPACE_ID]
    )).rows[0]
    if (!anthropicOauth) {
      console.error('[seed-phase2c] anthropic (oauth) provider not found. Run seed-phase2a.js first.')
      process.exit(1)
    }

    // ---------- Insert / update each requested non-Anthropic provider ----------
    const insertedIds = {}
    for (const p of NONANTHROPIC) {
      const present = !!process.env[p.envVar]
      if (!present) {
        console.log(`[seed-phase2c] skipping ${p.name} (${p.envVar} not set)`)
        continue
      }
      const marker = encrypt(`env:${p.envVar}`)
      const existing = (await client.query(
        `SELECT id FROM providers WHERE workspace_id = $1 AND name = $2 AND auth_type = 'api_key'`,
        [WORKSPACE_ID, p.name]
      )).rows[0]
      if (existing) {
        await client.query(
          `UPDATE providers SET credentials = $1, enabled = true, updated_at = now() WHERE id = $2`,
          [marker, existing.id]
        )
        insertedIds[p.name] = existing.id
        console.log(`[seed-phase2c] updated ${p.name} provider id=${existing.id}`)
      } else {
        const row = (await client.query(
          `INSERT INTO providers (workspace_id, name, auth_type, credentials, base_url, enabled)
           VALUES ($1, $2, 'api_key', $3, NULL, true)
           RETURNING id`,
          [WORKSPACE_ID, p.name, marker]
        )).rows[0]
        insertedIds[p.name] = row.id
        console.log(`[seed-phase2c] inserted ${p.name} provider id=${row.id}`)
      }
    }

    // ---------- Rebuild the default alias chain ----------
    const chain = [
      { provider_id: anthropicOauth.id, model: 'claude-sonnet-4-5', priority: 0 },
    ]
    if (anthropicApiKey) {
      chain.push({ provider_id: anthropicApiKey.id, model: 'claude-sonnet-4-5', priority: 1 })
    }
    let priority = chain.length
    for (const p of NONANTHROPIC) {
      const id = insertedIds[p.name]
      if (!id) continue
      chain.push({ provider_id: id, model: p.defaultModel, priority })
      priority++
    }

    await client.query(
      `UPDATE aliases
          SET fallback_chain = $1::jsonb,
              updated_at = now()
        WHERE workspace_id = $2 AND name = 'default'`,
      [JSON.stringify(chain), WORKSPACE_ID]
    )

    console.log('')
    console.log('====================================================================')
    console.log(' Phase 2C seed complete.')
    console.log('====================================================================')
    console.log(' Updated default alias fallback_chain:')
    for (const entry of chain) {
      const provider = await client.query('SELECT name, auth_type FROM providers WHERE id = $1', [entry.provider_id])
      const row = provider.rows[0]
      console.log(`   [${entry.priority}] ${row.name} (${row.auth_type}) -> ${entry.model}`)
    }
    console.log('====================================================================')
  } finally {
    client.release()
    await pool.end()
  }
}

function encrypt(plaintext) {
  const keyHex = process.env.GATEWAY_ENCRYPTION_KEY
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('GATEWAY_ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), ct.toString('hex')].join(':')
}

main().catch(err => { console.error('[seed-phase2c] fatal:', err); process.exit(1) })
