import AdminShell from '@/components/AdminShell'
import ProvidersClient from '@/components/ProvidersClient'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function loadProviders() {
  try {
    return await query(
      `SELECT id, name, auth_type, base_url, enabled, created_at, updated_at,
              CASE WHEN credentials IS NULL OR credentials = '' THEN false ELSE true END AS has_credential
         FROM providers
        WHERE workspace_id = $1
        ORDER BY name, auth_type`,
      [WORKSPACE_ID]
    )
  } catch (err) {
    console.error('[providers] load failed:', err.message)
    return []
  }
}

export default async function ProvidersPage() {
  const providers = await loadProviders()
  return (
    <AdminShell title="Providers">
      <ProvidersClient initialProviders={providers} />
    </AdminShell>
  )
}
