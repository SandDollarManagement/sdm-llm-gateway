import AdminShell from '@/components/AdminShell'
import AppsClient from '@/components/AppsClient'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function loadApps() {
  try {
    return await query(
      `SELECT id, name, default_alias, monthly_budget_usd, enabled,
              allowed_aliases, fallback_allowed, created_at, last_used_at
         FROM apps
        WHERE workspace_id = $1
        ORDER BY name`,
      [WORKSPACE_ID],
    )
  } catch (err) {
    console.error('[apps] load failed:', err.message)
    return []
  }
}

export default async function AppsPage() {
  const apps = await loadApps()
  return (
    <AdminShell title="Apps">
      <AppsClient initialApps={apps} />
    </AdminShell>
  )
}
