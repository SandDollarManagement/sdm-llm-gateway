#!/usr/bin/env node
/**
 * scripts/seed-phase2b.js
 *
 * One-time seed for Phase 2B. Idempotent — safe to re-run.
 *
 * Inserts the Anthropic API-key provider (auth_type='api_key') and updates
 * the `default` alias's fallback_chain to [OAuth, API-key]. The pay-per-
 * token Anthropic key is encrypted at rest with GATEWAY_ENCRYPTION_KEY
 * (D-009).
 *
 * Required env vars when running:
 *   DATABASE_URL              — already set in the container
 *   GATEWAY_ENCRYPTION_KEY    — already set in the container
 *   ANTHROPIC_API_KEY         — the sk-ant-api03-... key to encrypt and store
 *
 * Run inside the gateway-web container terminal:
 *   ANTHROPIC_API_KEY=sk-ant-api03-XXXX node scripts/seed-phase2b.js
 *
 * After the script completes you can unset/remove ANTHROPIC_API_KEY from
 * Coolify env vars — the encrypted credential lives in the providers table.
 */

const { Pool } = require('pg')
const crypto = require('node:crypto')

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[seed-phase2b] DATABASE_URL is not set'); process.exit(1)
  }
  if (!process.env.GATEWAY_ENCRYPTION_KEY) {
    console.error('[seed-phase2b] GATEWAY_ENCRYPTION_KEY is not set'); process.exit(1)
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    console.error('[seed-phase2b] ANTHROPIC_API_KEY env var must be set to a valid Anthropic key (starts with sk-ant-)')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 2,
  })

  const client = await pool.connect()
  try {
    // ---------- 1. Anthropic API key provider ----------
    const ciphertext = encrypt(apiKey)
    let providerRow = (await client.query(
      `SELECT id FROM providers WHERE workspace_id = $1 AND name = $2 AND auth_type = $3`,
      [WORKSPACE_ID, 'anthropic', 'api_key']
    )).rows[0]
    if (providerRow) {
      console.log(`[seed-phase2b] anthropic (api_key) provider already exists id=${providerRow.id}`)
      console.log('[seed-phase2b] updating its credentials field with the freshly-encrypted key')
      await client.query(
        `UPDATE providers SET credentials = $1, updated_at = now() WHERE id = $2`,
        [ciphertext, providerRow.id]
      )
    } else {
      providerRow = (await client.query(
        `INSERT INTO providers (workspace_id, name, auth_type, credentials, base_url, enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [WORKSPACE_ID, 'anthropic', 'api_key', ciphertext, null, true]
      )).rows[0]
      console.log(`[seed-phase2b] inserted anthropic (api_key) provider id=${providerRow.id}`)
    }
    const apiKeyProviderId = providerRow.id

    // ---------- 2. Resolve OAuth provider id (already exists from Phase 2A) ----------
    const oauthRow = (await client.query(
      `SELECT id FROM providers WHERE workspace_id = $1 AND name = $2 AND auth_type = $3`,
      [WORKSPACE_ID, 'anthropic', 'oauth']
    )).rows[0]
    if (!oauthRow) {
      console.error('[seed-phase2b] WARN: Anthropic OAuth provider not found. Run seed-phase2a.js first.')
      process.exit(1)
    }

    // ---------- 3. Update default alias fallback_chain to [OAuth, API key] ----------
    const chain = [
      { provider_id: oauthRow.id,        model: 'claude-sonnet-4-5', priority: 0 },
      { provider_id: apiKeyProviderId,   model: 'claude-sonnet-4-5', priority: 1 },
    ]
    await client.query(
      `UPDATE aliases
          SET fallback_chain = $1::jsonb,
              updated_at = now()
        WHERE workspace_id = $2 AND name = $3`,
      [JSON.stringify(chain), WORKSPACE_ID, 'default']
    )
    console.log(`[seed-phase2b] default alias fallback_chain set to [OAuth, API key]`)

    console.log('')
    console.log('====================================================================')
    console.log(' Phase 2B seed complete.')
    console.log('====================================================================')
    console.log(' default alias now tries:')
    console.log('   1. Anthropic OAuth (claude CLI, Max plan credit)')
    console.log('   2. Anthropic API key (pay-per-token fallback)')
    console.log('')
    console.log(' You can now remove ANTHROPIC_API_KEY from Coolify env vars — the')
    console.log(' encrypted key lives in the providers table.')
    console.log('====================================================================')
  } finally {
    client.release()
    await pool.end()
  }
}

function encrypt(plaintext) {
  const keyHex = process.env.GATEWAY_ENCRYPTION_KEY
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) {
    throw new Error('GATEWAY_ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), ct.toString('hex')].join(':')
}

main().catch(err => {
  console.error('[seed-phase2b] fatal:', err)
  process.exit(1)
})
