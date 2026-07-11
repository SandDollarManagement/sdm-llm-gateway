import AdminShell from '@/components/AdminShell'
import AliasesClient from '@/components/AliasesClient'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function load() {
  try {
    const [aliases, providers] = await Promise.all([
      query(
        `SELECT id, name, description, fallback_chain,
                capability_type, fallback_allowed, local_only_eligible,
                retention_policy_notes, cost_latency_priority,
                embedding_dimension, embedding_model_family, embedding_model_version,
                created_at, updated_at
           FROM aliases WHERE workspace_id = $1 ORDER BY name`,
        [WORKSPACE_ID],
      ),
      query(
        `SELECT id, name, auth_type, enabled
           FROM providers WHERE workspace_id = $1 ORDER BY name, auth_type`,
        [WORKSPACE_ID],
      ),
    ])
    return { aliases, providers }
  } catch (err) {
    console.error('[aliases] load failed:', err.message)
    return { aliases: [], providers: [] }
  }
}

export default async function AliasesPage() {
  const { aliases, providers } = await load()
  return (
    <AdminShell title="Aliases">
      <AliasesClient initialAliases={aliases} initialProviders={providers} />
    </AdminShell>
  )
}
