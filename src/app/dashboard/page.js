import AdminShell from '@/components/AdminShell'
import { query } from '@/lib/db'
import { Activity, CheckCircle2, AlertCircle, Server, Layers, AppWindow } from 'lucide-react'

export const dynamic = 'force-dynamic'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function load() {
  try {
    const [todayStats, providerStats, aliasStats, totals] = await Promise.all([
      query(
        `SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 200)::int AS ok,
            COUNT(*) FILTER (WHERE status <> 200)::int AS errored,
            ROUND(AVG(latency_ms))::int AS avg_latency_ms
           FROM call_logs
          WHERE workspace_id = $1 AND created_at >= date_trunc('day', now())`,
        [WORKSPACE_ID]
      ),
      query(
        `SELECT p.name AS provider_name, p.auth_type, COUNT(*)::int AS calls
           FROM call_logs cl
           LEFT JOIN providers p ON p.id = cl.provider_id
          WHERE cl.workspace_id = $1 AND cl.created_at >= date_trunc('day', now())
          GROUP BY p.name, p.auth_type
          ORDER BY calls DESC`,
        [WORKSPACE_ID]
      ),
      query(
        `SELECT alias, COUNT(*)::int AS calls
           FROM call_logs
          WHERE workspace_id = $1 AND created_at >= date_trunc('day', now())
          GROUP BY alias
          ORDER BY calls DESC`,
        [WORKSPACE_ID]
      ),
      query(
        `SELECT
            (SELECT COUNT(*)::int FROM providers WHERE workspace_id = $1 AND enabled) AS providers,
            (SELECT COUNT(*)::int FROM aliases WHERE workspace_id = $1) AS aliases,
            (SELECT COUNT(*)::int FROM apps WHERE workspace_id = $1 AND enabled) AS apps`,
        [WORKSPACE_ID]
      ),
    ])
    return {
      today: todayStats[0] || { total: 0, ok: 0, errored: 0, avg_latency_ms: null },
      providers: providerStats,
      aliases: aliasStats,
      totals: totals[0] || { providers: 0, aliases: 0, apps: 0 },
    }
  } catch (err) {
    console.error('[dashboard] load failed:', err.message)
    return {
      today: { total: 0, ok: 0, errored: 0, avg_latency_ms: null },
      providers: [],
      aliases: [],
      totals: { providers: 0, aliases: 0, apps: 0 },
    }
  }
}

export default async function DashboardPage() {
  const { today, providers, aliases, totals } = await load()
  const successRate = today.total > 0 ? Math.round((today.ok / today.total) * 100) : null

  return (
    <AdminShell title="Dashboard">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Activity size={16} />} label="Calls today" value={today.total} />
        <StatCard
          icon={<CheckCircle2 size={16} className="text-success" />}
          label="Success rate"
          value={successRate != null ? `${successRate}%` : '—'}
          sub={`${today.ok} ok · ${today.errored} errored`}
        />
        <StatCard
          icon={<AlertCircle size={16} className={today.errored > 0 ? 'text-danger' : 'text-muted'} />}
          label="Errored today"
          value={today.errored}
        />
        <StatCard
          icon={<Activity size={16} />}
          label="Avg latency"
          value={today.avg_latency_ms != null ? `${today.avg_latency_ms} ms` : '—'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard icon={<Server size={16} />} label="Active providers" value={totals.providers} />
        <StatCard icon={<Layers size={16} />} label="Aliases" value={totals.aliases} />
        <StatCard icon={<AppWindow size={16} />} label="Registered apps" value={totals.apps} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Calls today by provider">
          {providers.length === 0
            ? <Empty>No calls yet today.</Empty>
            : (
              <ul className="divide-y divide-border">
                {providers.map((p, i) => (
                  <li key={i} className="flex justify-between items-center py-2 text-sm">
                    <span>{p.provider_name || '—'} <span className="text-xs text-muted">({p.auth_type || '—'})</span></span>
                    <span className="font-mono text-sm">{p.calls}</span>
                  </li>
                ))}
              </ul>
            )}
        </Panel>

        <Panel title="Calls today by alias">
          {aliases.length === 0
            ? <Empty>No calls yet today.</Empty>
            : (
              <ul className="divide-y divide-border">
                {aliases.map((a, i) => (
                  <li key={i} className="flex justify-between items-center py-2 text-sm">
                    <code className="text-sm">{a.alias || '—'}</code>
                    <span className="font-mono text-sm">{a.calls}</span>
                  </li>
                ))}
              </ul>
            )}
        </Panel>
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

function Panel({ title, children }) {
  return (
    <div className="bg-surface-card border border-border rounded-xl p-4">
      <div className="text-sm font-semibold mb-3">{title}</div>
      {children}
    </div>
  )
}

function Empty({ children }) {
  return <div className="text-sm text-muted text-center py-6">{children}</div>
}
