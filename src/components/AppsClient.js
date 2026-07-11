'use client'

import { useState } from 'react'
import { Plus, KeyRound, Trash2, AlertCircle, CheckCircle2, Copy } from 'lucide-react'
import clsx from 'clsx'

export default function AppsClient({ initialApps }) {
  const [apps, setApps] = useState(initialApps || [])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTokenInfo, setNewTokenInfo] = useState(null) // { name, token }
  const [editingId, setEditingId] = useState(null)
  const [banner, setBanner] = useState(null)

  async function refresh() {
    const res = await fetch('/api/admin/apps', { cache: 'no-store' })
    if (res.ok) setApps((await res.json()).apps || [])
  }

  function showBanner(kind, message) {
    setBanner({ kind, message })
    setTimeout(() => setBanner(null), 4000)
  }

  async function handleCreate(formData) {
    const res = await fetch('/api/admin/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (!res.ok) {
      showBanner('error', data.error || 'Failed to create app')
      return
    }
    setShowAddForm(false)
    setNewTokenInfo({ name: data.app.name, token: data.plaintext_token })
    refresh()
  }

  async function handleUpdate(id, updates) {
    const res = await fetch(`/api/admin/apps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (!res.ok) {
      showBanner('error', data.error || 'Failed to update')
      return
    }
    showBanner('success', 'Updated.')
    setEditingId(null)
    refresh()
  }

  async function handleRotateToken(id, name) {
    if (
      !confirm(
        `Rotate bearer token for "${name}"? The old token stops working immediately and you'll need to update the app's env var.`,
      )
    )
      return
    const res = await fetch(`/api/admin/apps/${id}/rotate-token`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      showBanner('error', data.error || 'Failed to rotate')
      return
    }
    setNewTokenInfo({ name, token: data.plaintext_token })
    refresh()
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete app "${name}"? Its bearer token stops working immediately.`)) return
    const res = await fetch(`/api/admin/apps/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showBanner('error', data.error || 'Failed to delete')
      return
    }
    showBanner('success', `Deleted ${name}.`)
    refresh()
  }

  return (
    <div className="max-w-4xl space-y-4">
      {banner && (
        <div
          className={clsx(
            'flex items-center gap-3 px-4 py-3 rounded-lg border',
            banner.kind === 'error'
              ? 'bg-danger/10 border-danger/40 text-danger'
              : 'bg-success/10 border-success/40 text-success',
          )}
        >
          {banner.kind === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span className="text-sm">{banner.message}</span>
        </div>
      )}

      {newTokenInfo && <TokenReveal info={newTokenInfo} onDismiss={() => setNewTokenInfo(null)} />}

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted">
          Each app gets a bearer token. Its consumer (Ops Hub, Media Manager, etc.) sends it as{' '}
          <code>Authorization: Bearer &lt;token&gt;</code>. Tokens are stored as SHA-256 hashes —
          you see the plaintext only once at creation or rotation.
        </p>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand hover:bg-brand-light text-white text-sm font-medium transition-colors shrink-0"
        >
          <Plus size={16} />
          Register App
        </button>
      </div>

      {showAddForm && <AddForm onCancel={() => setShowAddForm(false)} onSubmit={handleCreate} />}

      <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary border-b border-border">
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">App</th>
              <th className="px-4 py-3 font-medium">Default Alias</th>
              <th className="px-4 py-3 font-medium">Monthly Budget</th>
              <th className="px-4 py-3 font-medium">Policy</th>
              <th className="px-4 py-3 font-medium">Last Used</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted text-sm">
                  No apps registered yet. Click &quot;Register App&quot; to add your first consumer
                  (e.g. Ops Hub).
                </td>
              </tr>
            )}
            {apps.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3 text-muted">{a.default_alias || '—'}</td>
                <td className="px-4 py-3 text-muted">
                  {a.monthly_budget_usd != null
                    ? `$${Number(a.monthly_budget_usd).toFixed(2)}`
                    : 'unlimited'}
                </td>
                <td className="px-4 py-3 text-muted text-xs">
                  <div>{a.fallback_allowed === false ? 'fallback off' : 'fallback on'}</div>
                  <div>
                    {Array.isArray(a.allowed_aliases) && a.allowed_aliases.length > 0
                      ? a.allowed_aliases.join(', ')
                      : 'all aliases'}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted text-xs">
                  {a.last_used_at ? new Date(a.last_used_at).toLocaleString() : 'never'}
                </td>
                <td className="px-4 py-3">
                  {a.enabled ? (
                    <span className="inline-flex items-center gap-1.5 text-success">
                      <CheckCircle2 size={14} /> enabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted">disabled</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => handleRotateToken(a.id, a.name)}
                      className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-text-primary transition-colors"
                      title="Rotate bearer token"
                    >
                      <KeyRound size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(editingId === a.id ? null : a.id)}
                      className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-text-primary text-xs font-medium px-2 transition-colors"
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(a.id, a.name)}
                      className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-danger transition-colors"
                      title="Delete app"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {editingId && (
          <div className="border-t border-border bg-surface-secondary px-4 py-4">
            <EditForm
              app={apps.find((a) => a.id === editingId)}
              onCancel={() => setEditingId(null)}
              onSubmit={(updates) => handleUpdate(editingId, updates)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function TokenReveal({ info, onDismiss }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(info.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }
  return (
    <div className="bg-brand/10 border border-brand/40 rounded-xl p-5 space-y-3">
      <div className="font-semibold text-sm">Bearer token for &quot;{info.name}&quot;</div>
      <div className="text-xs text-muted">
        This is the only time you&apos;ll see the plaintext. Save it now — paste it into the
        consumer app&apos;s env var as <code>SDM_GATEWAY_TOKEN</code>.
      </div>
      <div className="flex items-center gap-2 bg-surface-tertiary border border-border rounded-md px-3 py-2 font-mono text-xs break-all">
        <span className="flex-1">{info.token}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 px-2 py-1 rounded bg-surface-hover hover:bg-surface-card text-xs"
        >
          <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <button onClick={onDismiss} className="text-xs text-muted hover:text-text-primary">
        Dismiss
      </button>
    </div>
  )
}

function AddForm({ onCancel, onSubmit }) {
  const [name, setName] = useState('')
  const [defaultAlias, setDefaultAlias] = useState('default')
  const [budget, setBudget] = useState('')
  const [allowedAliases, setAllowedAliases] = useState('')
  const [fallbackAllowed, setFallbackAllowed] = useState(true)

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name: name.trim(),
      default_alias: defaultAlias.trim() || 'default',
      monthly_budget_usd: budget ? Number(budget) : null,
      allowed_aliases: allowedAliases.trim()
        ? allowedAliases
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : null,
      fallback_allowed: fallbackAllowed,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-card border border-border rounded-xl p-5 space-y-4"
    >
      <div>
        <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">App Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ops-hub"
          required
          className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
            Default Alias
          </label>
          <input
            type="text"
            value={defaultAlias}
            onChange={(e) => setDefaultAlias(e.target.value)}
            placeholder="default"
            className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted mt-1">Used when the app does not specify a model.</p>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
            Monthly Budget (USD)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="leave blank for unlimited"
            className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted mt-1">429 returned when exceeded (Phase 5).</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
            Allowed Aliases
          </label>
          <input
            type="text"
            value={allowedAliases}
            onChange={(e) => setAllowedAliases(e.target.value)}
            placeholder="blank = all aliases"
            className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm px-3 mt-6">
          <input
            type="checkbox"
            checked={fallbackAllowed}
            onChange={(e) => setFallbackAllowed(e.target.checked)}
          />
          <span>Allow provider fallback</span>
        </label>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-sm text-muted hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-brand hover:bg-brand-light text-white text-sm font-medium"
        >
          Register App
        </button>
      </div>
    </form>
  )
}

function EditForm({ app, onCancel, onSubmit }) {
  const [name, setName] = useState(app.name)
  const [defaultAlias, setDefaultAlias] = useState(app.default_alias || 'default')
  const [budget, setBudget] = useState(
    app.monthly_budget_usd != null ? String(app.monthly_budget_usd) : '',
  )
  const [enabled, setEnabled] = useState(app.enabled)
  const [allowedAliases, setAllowedAliases] = useState(
    Array.isArray(app.allowed_aliases) ? app.allowed_aliases.join(', ') : '',
  )
  const [fallbackAllowed, setFallbackAllowed] = useState(app.fallback_allowed !== false)

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit({
      name: name.trim(),
      default_alias: defaultAlias.trim() || 'default',
      monthly_budget_usd: budget === '' ? null : Number(budget),
      enabled,
      allowed_aliases: allowedAliases.trim()
        ? allowedAliases
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : null,
      fallback_allowed: fallbackAllowed,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="text-sm font-medium">Edit &quot;{app.name}&quot;</div>
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={defaultAlias}
          onChange={(e) => setDefaultAlias(e.target.value)}
          className="bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        />
        <input
          type="number"
          step="0.01"
          min="0"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="monthly budget USD"
          className="bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={allowedAliases}
          onChange={(e) => setAllowedAliases(e.target.value)}
          placeholder="allowed aliases, comma separated"
          className="bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm px-3">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Enabled</span>
        </label>
        <label className="flex items-center gap-2 text-sm px-3">
          <input
            type="checkbox"
            checked={fallbackAllowed}
            onChange={(e) => setFallbackAllowed(e.target.checked)}
          />
          <span>Allow fallback</span>
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-sm text-muted hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-brand hover:bg-brand-light text-white text-sm font-medium"
        >
          Save
        </button>
      </div>
    </form>
  )
}
