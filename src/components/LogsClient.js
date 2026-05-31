'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'

export default function LogsClient({ initialLogs, apps, aliases, providers }) {
  const [logs, setLogs] = useState(initialLogs || [])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ app_id: '', alias: '', provider_id: '', status: '' })

  async function refresh() {
    setLoading(true)
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    const res = await fetch(`/api/admin/logs?${params.toString()}`, { cache: 'no-store' })
    if (res.ok) setLogs((await res.json()).logs || [])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [filters])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.app_id}
          onChange={e => setFilters({ ...filters, app_id: e.target.value })}
          className="bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        >
          <option value="">All apps</option>
          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          value={filters.alias}
          onChange={e => setFilters({ ...filters, alias: e.target.value })}
          className="bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        >
          <option value="">All aliases</option>
          {aliases.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
        </select>
        <select
          value={filters.provider_id}
          onChange={e => setFilters({ ...filters, provider_id: e.target.value })}
          className="bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        >
          <option value="">All providers</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.auth_type})</option>)}
        </select>
        <select
          value={filters.status}
          onChange={e => setFilters({ ...filters, status: e.target.value })}
          className="bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="ok">Successful (200)</option>
          <option value="error">Errors only</option>
        </select>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted hover:text-text-primary hover:bg-surface-hover disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary border-b border-border">
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">App</th>
              <th className="px-4 py-3 font-medium">Alias</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium text-right">Latency</th>
              <th className="px-4 py-3 font-medium text-right">Tokens</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted text-sm">
                  No log entries match the current filters. Make a call to <code>/v1/chat/completions</code> to populate.
                </td>
              </tr>
            )}
            {logs.map(l => {
              const ok = l.status === 200
              const tokens = (l.request_tokens ?? '?') + ' / ' + (l.response_tokens ?? '?')
              return (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">{l.app_name || '—'}</td>
                  <td className="px-4 py-2.5"><code className="text-xs">{l.alias || '—'}</code></td>
                  <td className="px-4 py-2.5 text-muted text-xs">
                    {l.provider_name || '—'}{l.auth_method ? ` (${l.auth_method})` : ''}
                  </td>
                  <td className="px-4 py-2.5 text-muted text-xs">{l.model || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted">
                    {l.latency_ms != null ? `${l.latency_ms} ms` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted">{tokens}</td>
                  <td className="px-4 py-2.5">
                    {ok
                      ? <span className="inline-flex items-center gap-1 text-success text-xs"><CheckCircle2 size={12} /> 200</span>
                      : (
                        <span className="inline-flex items-center gap-1 text-danger text-xs" title={l.error || ''}>
                          <AlertCircle size={12} /> {l.status || 'err'}
                        </span>
                      )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
