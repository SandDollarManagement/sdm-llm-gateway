import AdminShell from '@/components/AdminShell'
import UsageClient from '@/components/UsageClient'
import { query } from '@/lib/db'
import { Activity, AlertCircle, DollarSign } from 'lucide-react'

export const dynamic = 'force-dynamic'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function load() {
  try {
    const [daily, byProvider, byAlias, totals] = await Promise.all([
      query(
        `WITH days AS (
           SELECT generate_series(
             date_trunc('day', now()) - interval '29 days',
             date_trunc('day', now()),
             interval '1 day'
           )::date AS day
         )
         SELECT to_char(d.day, 'MM-DD') AS day,
                COALESCE(c.calls, 0)::int AS calls
           FROM days d
           LEFT JOIN (
             SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS calls
               FROM call_logs
              WHERE workspace_id = $1 AND created_at >= now() - interval '30 days'
              GROUP BY 1
           ) c ON c.day = d.day
          ORDER BY d.day`,
        [WORKSPACE_ID]
      ),
      query(
        `SELECT COALESCE(p.name, 'unknown') AS name, COUNT(*)::int AS calls
           FROM call_logs cl
           LEFT JOIN providers p ON p.id = cl.provider_id
          WHERE cl.workspace_id = $1 AND cl.created_at >= date_trunc('day', now())
          GROUP BY p.name
          ORDER BY calls DESC`,
        [WORKSPACE_ID]
      ),
      query(
        `SELECT COALESCE(alias, 'unknown') AS name, COUNT(*)::int AS calls
           FROM call_logs
          WHERE workspace_id = $1 AND created_at >= date_trunc('day', now())
          GROUP BY alias
          ORDER BY calls DESC`,
        [WORKSPACE_ID]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS this_month,
           COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::numeric AS month_cost,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()) AND status <> 200)::int AS month_errors
           FROM call_logs
          WHERE workspace_id = $1`,
        [WORKSPACE_ID]
      ),
    ])
    return {
      daily,
      byProvider,
      byAlias,
      totals: totals[0] || { today: 0, this_month: 0, month_cost: 0, month_errors: 0 },
    }
  } catch (err) {
    console.error('[usage] load failed:', err.message)
    return {
      daily: [],
      byProvider: [],
      byAlias: [],
      totals: { today: 0, this_month: 0, month_cost: 0, month_errors: 0 },
    }
  }
}

export default async function UsagePage() {
  const { daily, byProvider, byAlias, totals } = await load()
  const monthCost = Number(totals.month_cost || 0)

  return (
    <AdminShell title="Usage">
      <div className="space-y-6">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon={<Activity size={16} />}
            label="Calls today"
            value={totals.today.toLocaleString()}
          />
          <StatCard
            icon={<Activity size={16} />}
            label="Calls this month"
            value={totals.this_month.toLocaleString()}
            sub={`${totals.month_errors} errored`}
          />
          <StatCard
            icon={<DollarSign size={16} />}
            label="Spend this month"
            value={`$${monthCost.toFixed(2)}`}
            sub={monthCost === 0 ? 'No per-call cost reported yet by providers' : null}
          />
        </div>

        <UsageClient daily={daily} byProvider={byProvider} byAlias={byAlias} />

      </div>
    </AdminShell>
  )
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="bg-surface-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted text-xs uppercase tracking-wide mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  )
}
