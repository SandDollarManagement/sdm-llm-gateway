import AdminShell from '@/components/AdminShell'
import ProjectsClient from '@/components/ProjectsClient'
import { query } from '@/lib/db'
import { monthStartIso } from '@/lib/routing/budget'

export const dynamic = 'force-dynamic'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function loadProjects() {
  try {
    const monthStart = monthStartIso()
    return await query(
      `SELECT p.id, p.name, p.description, p.kind, p.monthly_budget_usd,
              p.default_rpm_limit, p.default_tpm_limit, p.enabled,
              (SELECT COUNT(*)::int FROM apps a WHERE a.project_id = p.id) AS key_count,
              COALESCE((
                SELECT SUM(cl.cost_usd)
                  FROM call_logs cl JOIN apps a ON a.id = cl.app_id
                 WHERE a.project_id = p.id AND cl.workspace_id = p.workspace_id
                   AND cl.created_at >= $2 AND cl.status = 200
              ), 0)::numeric AS spend_mtd
         FROM projects p
        WHERE p.workspace_id = $1
        ORDER BY p.name`,
      [WORKSPACE_ID, monthStart],
    )
  } catch (err) {
    console.error('[projects] load failed:', err.message)
    return []
  }
}

async function loadOpenAlerts() {
  try {
    return await query(
      `SELECT sa.id, sa.scope, sa.threshold, sa.period, sa.spent_usd, sa.cap_usd,
              sa.created_at, p.name AS project_name, a.name AS app_name
         FROM spend_alerts sa
         LEFT JOIN projects p ON p.id = sa.project_id
         LEFT JOIN apps a ON a.id = sa.app_id
        WHERE sa.workspace_id = $1 AND sa.acknowledged = false
        ORDER BY sa.created_at DESC LIMIT 50`,
      [WORKSPACE_ID],
    )
  } catch (err) {
    console.error('[projects] alerts load failed:', err.message)
    return []
  }
}

export default async function ProjectsPage() {
  const [projects, alerts] = await Promise.all([loadProjects(), loadOpenAlerts()])
  return (
    <AdminShell title="Projects">
      <ProjectsClient initialProjects={projects} initialAlerts={alerts} />
    </AdminShell>
  )
}
