#!/usr/bin/env node
/**
 * Simple migration runner for sdm-llm-gateway.
 *
 * Behavior:
 *  - Reads all *.sql files in ./migrations in lexical order.
 *  - Tracks applied migrations in a `_migrations` table (created if missing).
 *  - Each migration runs inside its own transaction.
 *  - Safe to re-run; already-applied migrations are skipped.
 *
 * Usage:
 *  DATABASE_URL=postgres://... node scripts/migrate.js
 *
 * Runs automatically inside Coolify post-deploy if you wire it up via a hook,
 * otherwise you can `docker exec gateway-web node scripts/migrate.js` after a deploy.
 */

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[migrate] DATABASE_URL is not set')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 2,
  })

  const migrationsDir = path.join(__dirname, '..', 'migrations')
  if (!fs.existsSync(migrationsDir)) {
    console.error(`[migrate] Migrations directory not found at ${migrationsDir}`)
    process.exit(1)
  }

  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const applied = new Set(
      (await client.query('SELECT name FROM _migrations')).rows.map(r => r.name)
    )

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    let appliedCount = 0
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip   ${file} (already applied)`)
        continue
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      console.log(`[migrate] apply  ${file}`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        appliedCount++
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`[migrate] FAILED ${file}:`, err.message)
        throw err
      }
    }

    console.log(`[migrate] done. ${appliedCount} new migration(s) applied, ${files.length - appliedCount} already applied.`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error('[migrate] fatal:', err)
  process.exit(1)
})
