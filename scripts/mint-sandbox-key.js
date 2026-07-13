#!/usr/bin/env node
/**
 * scripts/mint-sandbox-key.js
 *
 * Mint a scoped, capped, revocable virtual key bound to a sandbox project,
 * from the trusted server side. The plaintext token is printed ONCE — the
 * sandbox never sees any real provider key, only this token.
 *
 *   docker exec gateway-web node scripts/mint-sandbox-key.js
 *   docker exec gateway-web node scripts/mint-sandbox-key.js --name build-042 --budget 5 --rpm 30 --tpm 60000
 *   docker exec gateway-web node scripts/mint-sandbox-key.js --project aether-sandbox
 *
 * Revoke later with the admin UI (disable/delete/rotate) or:
 *   UPDATE apps SET enabled = false WHERE name = '<key-name>';
 *
 * The key is budget_enforced and its allowed_aliases are the project's
 * sandbox aliases (fail closed — a project-scoped key MUST have a non-empty
 * allowlist).
 */

const { Pool } = require('pg')
const crypto = require('node:crypto')

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[mint] DATABASE_URL is not set')
    process.exit(1)
  }
  const projectName = arg('project', 'aether-sandbox')
  const name = arg(
    'name',
    `${projectName}-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}`,
  )
  const budget = Number(arg('budget', '5'))
  const rpm = arg('rpm', null)
  const tpm = arg('tpm', null)

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 2,
  })
  const client = await pool.connect()
  try {
    const project = (
      await client.query(
        `SELECT id, default_rpm_limit, default_tpm_limit FROM projects WHERE workspace_id = $1 AND name = $2`,
        [WORKSPACE_ID, projectName],
      )
    ).rows[0]
    if (!project) {
      console.error(`[mint] project "${projectName}" not found. Run migration 009 first.`)
      process.exit(1)
    }

    const aliasRows = (
      await client.query(
        `SELECT name FROM aliases WHERE workspace_id = $1 AND sandbox_only = true ORDER BY name`,
        [WORKSPACE_ID],
      )
    ).rows
    const allowedAliases = aliasRows.map((r) => r.name)
    if (allowedAliases.length === 0) {
      console.error(
        '[mint] no sandbox aliases found — refusing to mint a key with an empty allowlist (fail closed).',
      )
      process.exit(1)
    }

    const dup = (
      await client.query(`SELECT id FROM apps WHERE workspace_id = $1 AND name = $2`, [
        WORKSPACE_ID,
        name,
      ])
    ).rows[0]
    if (dup) {
      console.error(`[mint] a key named "${name}" already exists.`)
      process.exit(1)
    }

    const token = 'sdmgw-' + crypto.randomBytes(24).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const rpmVal = rpm != null ? Math.floor(Number(rpm)) : (project.default_rpm_limit ?? null)
    const tpmVal = tpm != null ? Math.floor(Number(tpm)) : (project.default_tpm_limit ?? null)

    const row = (
      await client.query(
        `INSERT INTO apps (
           workspace_id, project_id, name, token_hash, default_alias,
           monthly_budget_usd, budget_enforced, enabled, allowed_aliases,
           fallback_allowed, rpm_limit, tpm_limit
         )
         VALUES ($1, $2, $3, $4, $5, $6, true, true, $7, true, $8, $9)
         RETURNING id`,
        [
          WORKSPACE_ID,
          project.id,
          name,
          tokenHash,
          allowedAliases[0],
          budget,
          allowedAliases,
          rpmVal,
          tpmVal,
        ],
      )
    ).rows[0]

    console.log('====================================================================')
    console.log(` Minted sandbox key "${name}" (id=${row.id})`)
    console.log('====================================================================')
    console.log(` project:         ${projectName}`)
    console.log(` allowed aliases: ${allowedAliases.join(', ')}`)
    console.log(
      ` per-key cap:     $${budget.toFixed(2)}/mo   rpm=${rpmVal ?? '—'} tpm=${tpmVal ?? '—'}`,
    )
    console.log('')
    console.log(' TOKEN (shown once — copy it now):')
    console.log('')
    console.log(`   ${token}`)
    console.log('')
    console.log(' Set on the SANDBOX side only:')
    console.log('   ANTHROPIC_API_KEY=<token>   (Claude Code CLI)')
    console.log('   OPENAI_API_KEY=<token>      (Codex CLI)')
    console.log(' Never place a real provider key in the sandbox.')
    console.log('====================================================================')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[mint] fatal:', err)
  process.exit(1)
})
