// src/lib/routing/resolve-alias.js
// Look up an alias by name within a workspace and return its fallback
// chain hydrated with provider rows.

import { queryOne, query } from '@/lib/db'

/**
 * @param {object} opts
 * @param {string} opts.workspaceId
 * @param {string} opts.aliasName
 * @returns {Promise<{
 *   alias: { id: string, name: string, description: string, fallback_chain: Array },
 *   providers: Array<{ id: string, name: string, auth_type: string, base_url: string|null, enabled: boolean }>
 * }>}
 */
export async function resolveAlias({ workspaceId, aliasName }) {
  const alias = await queryOne(
    `SELECT id, name, description, fallback_chain
       FROM aliases
      WHERE workspace_id = $1 AND name = $2
      LIMIT 1`,
    [workspaceId, aliasName]
  )
  if (!alias) throw new Error(`Alias "${aliasName}" not found in workspace ${workspaceId}.`)

  const chain = Array.isArray(alias.fallback_chain) ? alias.fallback_chain : []
  if (chain.length === 0) {
    throw new Error(
      `Alias "${aliasName}" has an empty fallback chain. Populate it via the admin UI or seed script.`
    )
  }

  const providerIds = [...new Set(chain.map(entry => entry.provider_id).filter(Boolean))]
  let providers = []
  if (providerIds.length > 0) {
    providers = await query(
      `SELECT id, name, auth_type, base_url, enabled
         FROM providers
        WHERE id = ANY($1::uuid[])`,
      [providerIds]
    )
  }

  return { alias, providers }
}
