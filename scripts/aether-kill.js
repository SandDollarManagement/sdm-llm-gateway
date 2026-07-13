#!/usr/bin/env node
/**
 * scripts/aether-kill.js
 *
 * One-action kill switch for a sandbox project. Flips projects.enabled, which
 * makes enforceAppPolicy refuse (403) every key in that project immediately.
 * NO other project or key is touched.
 *
 *   docker exec gateway-web node scripts/aether-kill.js            # disable aether-sandbox
 *   docker exec gateway-web node scripts/aether-kill.js --on       # re-enable aether-sandbox
 *   docker exec gateway-web node scripts/aether-kill.js --project my-proj --on
 */

const { Pool } = require('pg')

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[aether-kill] DATABASE_URL is not set')
    process.exit(1)
  }
  const args = process.argv.slice(2)
  const enable = args.includes('--on')
  const projIdx = args.indexOf('--project')
  const projectName = projIdx >= 0 && args[projIdx + 1] ? args[projIdx + 1] : 'aether-sandbox'

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 2,
  })
  try {
    const res = await pool.query(
      `UPDATE projects SET enabled = $1, updated_at = now()
        WHERE workspace_id = $2 AND name = $3
        RETURNING id, name, enabled,
          (SELECT COUNT(*)::int FROM apps a WHERE a.project_id = projects.id) AS key_count`,
      [enable, WORKSPACE_ID, projectName],
    )
    if (res.rowCount === 0) {
      console.error(`[aether-kill] project "${projectName}" not found.`)
      process.exit(1)
    }
    const p = res.rows[0]
    console.log(
      `[aether-kill] project "${p.name}" is now ${p.enabled ? 'ENABLED' : 'DISABLED (killed)'} — affects ${p.key_count} key(s). No other project touched.`,
    )
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[aether-kill] fatal:', err)
  process.exit(1)
})
