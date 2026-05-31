import AdminShell from '@/components/AdminShell'
import LogsClient from '@/components/LogsClient'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function load() {
  try {
    const [logs, apps, aliases, providers] = await Promise.all([
      query(
        `SELECT cl.id, cl.created_at, cl.alias, cl.model, cl.auth_method,
                cl.request_tokens, cl.response_tokens, cl.cost_usd,
                cl.latency_ms, cl.status, cl.error, cl.fallback_position,
                a.name AS app_name,
                p.name AS provider_name
           FROM call_logs cl
           LEFT JOIN apps a ON a.id = cl.app_id
           LEFT JOIN providers p ON p.id = cl.provider_id
          WHERE cl.workspace_id = $1
          ORDER BY cl.created_at DESC
          LIMIT 100`,
        [WORKSPACE_ID]
      ),
      query(
        `SELECT id, name FROM apps WHERE workspace_id = $1 ORDER BY name`,
        [WORKSPACE_ID]
      ),
      query(
        `SELECT id, name FROM aliases WHERE workspace_id = $1 ORDER BY name`,
        [WORKSPACE_ID]
      ),
      query(
        `SELECT id, name, auth_type FROM providers WHERE workspace_id = $1 ORDER BY name, auth_type`,
        [WORKSPACE_ID]
      ),
    ])
    return { logs, apps, aliases, providers }
  } catch (err) {
    console.error('[logs] load failed:', err.message)
    return { logs: [], apps: [], aliases: [], providers: [] }
  }
}

export default async function LogsPage() {
  const { logs, apps, aliases, providers } = await load()
  return (
    <AdminShell title="Logs">
      <LogsClient
        initialLogs={logs}
        apps={apps}
        aliases={aliases}
        providers={providers}
      />
    </AdminShell>
  )
}
