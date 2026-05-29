// src/lib/db.js
// Postgres connection pool + query helpers. Mirrors Ops Hub's lib/supabase.js
// signature (query, queryOne, dbInsertMany) so other SDM apps can be migrated
// with minimal mental load. Despite Ops Hub's filename, neither this nor that
// touches Supabase — both are plain pg.

import { Pool } from 'pg'

let _pool = null

export function getPool() {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('Missing DATABASE_URL environment variable')
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  }
  return _pool
}

/**
 * Execute a raw SQL query and return all rows.
 *
 * @param {string} text   - SQL with $1, $2, ... placeholders.
 * @param {any[]}  params - Values bound positionally to placeholders.
 * @returns {Promise<object[]>}
 */
export async function query(text, params = []) {
  const pool = getPool()
  const result = await pool.query(text, params)
  return result.rows
}

/**
 * Execute a query and return the first row (or null if none).
 *
 * @param {string} text
 * @param {any[]}  params
 * @returns {Promise<object|null>}
 */
export async function queryOne(text, params = []) {
  const rows = await query(text, params)
  return rows[0] || null
}

/**
 * Bulk INSERT helper. Builds a single multi-row INSERT statement from an
 * array of plain objects. All objects must have the same keys.
 *
 * @param {string} table - Target table name.
 * @param {object[]} rows - Rows to insert.
 * @returns {Promise<object[]>} Inserted rows.
 */
export async function dbInsertMany(table, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const columns = Object.keys(rows[0])
  const values = []
  const valuePlaceholders = rows.map((row, rowIdx) => {
    const placeholders = columns.map((col, colIdx) => {
      values.push(row[col])
      return `$${rowIdx * columns.length + colIdx + 1}`
    })
    return `(${placeholders.join(', ')})`
  })
  const sql = `
    INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(', ')})
    VALUES ${valuePlaceholders.join(', ')}
    RETURNING *
  `
  return await query(sql, values)
}
