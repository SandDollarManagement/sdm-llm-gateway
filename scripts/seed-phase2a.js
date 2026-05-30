#!/usr/bin/env node
/**
 * scripts/seed-phase2a.js
 *
 * One-time seed for Phase 2A. Idempotent — safe to re-run.
 *
 * Inserts:
 *   1. The Anthropic provider record (auth_type=oauth). The actual OAuth
 *      token used at runtime lives in ANTHROPIC_OAUTH_TOKEN; the provider
 *      record carries a marker, not the token itself.
 *   2. One test app named "test-app" with a freshly generated bearer token.
 *      The plaintext token is printed once to stdout — save it, because the
 *      database only retains the SHA-256 hash (D-008).
 *   3. Updates the `default` alias's fallback_chain to point at the
 *      Anthropic provider with a Sonnet-class model.
 *
 * Run inside the gateway-web container:
 *   node scripts/seed-phase2a.js
 */

const { Pool } = require('pg')
const crypto = require('node:crypto')

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[seed-phase2a] DATABASE_URL is not set')
    process.exit(1)
  }
  if (!process.env.GATEWAY_ENCRYPTION_KEY) {
    console.error('[seed-phase2a] GATEWAY_ENCRYPTION_KEY is not set')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 2,
  })

  const client = await pool.connect()
  try {
    // ---------- 1. Anthropic provider ----------
    // The provider record exists for identity and audit. Runtime auth happens
    // via the claude CLI reading $HOME/.claude/.credentials.json (which is
    // hydrated by docker-entrypoint.sh from ANTHROPIC_OAUTH_TOKEN).
    const credentialsMarker = encrypt('env:ANTHROPIC_OAUTH_TOKEN')
    let providerRow = (await client.query(
      `SELECT id FROM providers WHERE workspace_id = $1 AND name = $2 AND auth_type = $3`,
      [WORKSPACE_ID, 'anthropic', 'oauth']
    )).rows[0]
    if (providerRow) {
      console.log(`[seed-phase2a] anthropic (oauth) provider already exists at id=${providerRow.id}`)
    } else {
      providerRow = (await client.query(
        `INSERT INTO providers (workspace_id, name, auth_type, credentials, base_url, enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [WORKSPACE_ID, 'anthropic', 'oauth', credentialsMarker, null, true]
      )).rows[0]
      console.log(`[seed-phase2a] inserted anthropic (oauth) provider id=${providerRow.id}`)
    }
    const providerId = providerRow.id

    // ---------- 2. Test app ----------
    const existingApp = (await client.query(
      `SELECT id, token_hash FROM apps WHERE workspace_id = $1 AND name = $2`,
      [WORKSPACE_ID, 'test-app']
    )).rows[0]
    let testToken
    if (existingApp) {
      console.log(`[seed-phase2a] test-app already exists at id=${existingApp.id}`)
      console.log(`[seed-phase2a] (cannot recover plaintext; delete the row in DB and re-run if you need a fresh token)`)
    } else {
      testToken = 'sdmgw-test-' + crypto.randomBytes(24).toString('base64url')
      const tokenHash = sha256Hex(testToken)
      const inserted = (await client.query(
        `INSERT INTO apps (workspace_id, name, token_hash, default_alias, enabled)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [WORKSPACE_ID, 'test-app', tokenHash, 'default', true]
      )).rows[0]
      console.log(`[seed-phase2a] inserted test-app id=${inserted.id}`)
    }

    // ---------- 3. Update default alias fallback_chain ----------
    const chain = [
      {
        provider_id: providerId,
        model: 'claude-sonnet-4-5',
        priority: 0,
      },
    ]
    await client.query(
      `UPDATE aliases
          SET fallback_chain = $1::jsonb,
              updated_at = now()
        WHERE workspace_id = $2 AND name = $3`,
      [JSON.stringify(chain), WORKSPACE_ID, 'default']
    )
    console.log(`[seed-phase2a] default alias fallback_chain set to [anthropic/claude-sonnet-4-5]`)

    // ---------- Summary ----------
    console.log('')
    console.log('====================================================================')
    console.log(' Phase 2A seed complete.')
    console.log('====================================================================')
    if (testToken) {
      console.log('')
      console.log(' TEST APP BEARER TOKEN (save this — it is not retrievable later):')
      console.log('')
      console.log('   ' + testToken)
      console.log('')
    }
    console.log(' Try a call from any machine that can reach the gateway:')
    console.log('')
    console.log('   curl -X POST https://llm.sanddollarmanagementllc.com/v1/chat/completions \\')
    console.log('     -H "Authorization: Bearer <token-above>" \\')
    console.log('     -H "Content-Type: application/json" \\')
    console.log("     -d '{\"model\":\"default\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hi in 5 words.\"}]}'")
    console.log('')
    console.log('====================================================================')
  } finally {
    client.release()
    await pool.end()
  }
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex')
}

// Mirrors src/lib/crypto.js encrypt() so the seed script can run as a plain
// Node script outside the Next.js bundle.
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
  console.error('[seed-phase2a] fatal:', err)
  process.exit(1)
})
