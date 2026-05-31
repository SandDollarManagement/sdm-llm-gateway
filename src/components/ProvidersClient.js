'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'

const PROVIDER_OPTIONS = [
  { name: 'anthropic',  label: 'Anthropic (API key)',  auth_type: 'api_key', placeholder: 'sk-ant-api03-...' },
  { name: 'openai',     label: 'OpenAI',               auth_type: 'api_key', placeholder: 'sk-...' },
  { name: 'gemini',     label: 'Google Gemini',        auth_type: 'api_key', placeholder: 'AIza...' },
  { name: 'xai-grok',   label: 'xAI Grok',             auth_type: 'api_key', placeholder: 'xai-...' },
  { name: 'openrouter', label: 'OpenRouter',           auth_type: 'api_key', placeholder: 'sk-or-...' },
]

export default function ProvidersClient({ initialProviders }) {
  const [providers, setProviders] = useState(initialProviders || [])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [banner, setBanner] = useState(null)

  async function refresh() {
    const res = await fetch('/api/admin/providers', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setProviders(data.providers || [])
    }
  }

  function showBanner(kind, message) {
    setBanner({ kind, message })
    setTimeout(() => setBanner(null), 4000)
  }

  async function handleCreate(formData) {
    const res = await fetch('/api/admin/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (!res.ok) {
      showBanner('error', data.error || 'Failed to create provider')
      return
    }
    showBanner('success', `Added ${formData.name}.`)
    setShowAddForm(false)
    refresh()
  }

  async function handleUpdate(id, updates) {
    const res = await fetch(`/api/admin/providers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (!res.ok) {
      showBanner('error', data.error || 'Failed to update provider')
      return
    }
    showBanner('success', 'Updated.')
    setEditingId(null)
    refresh()
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete provider "${name}"? This is permanent. Aliases that reference it will break until you reconfigure them.`)) return
    const res = await fetch(`/api/admin/providers/${id}`, { method: 'DELETE' })
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
              : 'bg-success/10 border-success/40 text-success'
          )}
        >
          {banner.kind === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span className="text-sm">{banner.message}</span>
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted">
          Provider credentials are encrypted at rest with <code>GATEWAY_ENCRYPTION_KEY</code> and passed per-request to the underlying provider.
          Adding or rotating a key here updates the gateway immediately — no Coolify, no redeploy.
        </p>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand hover:bg-brand-light text-white text-sm font-medium transition-colors shrink-0"
        >
          <Plus size={16} />
          Add Provider
        </button>
      </div>

      {showAddForm && (
        <AddForm
          onCancel={() => setShowAddForm(false)}
          onSubmit={handleCreate}
        />
      )}

      <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary border-b border-border">
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Auth Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">
                  No providers yet. Click "Add Provider" to add OpenAI, Gemini, Grok, etc.
                </td>
              </tr>
            )}
            {providers.map(p => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-muted">
                  {p.auth_type === 'oauth'
                    ? <span title="OAuth token (Anthropic Max plan, managed in Coolify env)">oauth (env)</span>
                    : 'api_key'}
                </td>
                <td className="px-4 py-3">
                  {p.enabled
                    ? <span className="inline-flex items-center gap-1.5 text-success"><CheckCircle2 size={14} /> enabled</span>
                    : <span className="inline-flex items-center gap-1.5 text-muted">disabled</span>}
                </td>
                <td className="px-4 py-3 text-muted text-xs">
                  {new Date(p.updated_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.auth_type === 'oauth' && p.name === 'anthropic' ? (
                    <span className="text-xs text-muted">managed via env var</span>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                        className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-text-primary transition-colors"
                        title="Rotate API key or toggle enabled"
                      >
                        <KeyRound size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
                        className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-danger transition-colors"
                        title="Delete provider"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {editingId && (
          <div className="border-t border-border bg-surface-secondary px-4 py-4">
            <EditForm
              provider={providers.find(p => p.id === editingId)}
              onCancel={() => setEditingId(null)}
              onSubmit={updates => handleUpdate(editingId, updates)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function AddForm({ onCancel, onSubmit }) {
  const [selectedName, setSelectedName] = useState(PROVIDER_OPTIONS[1].name) // default to OpenAI
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  const opt = PROVIDER_OPTIONS.find(o => o.name === selectedName) || PROVIDER_OPTIONS[0]

  function handleSubmit(e) {
    e.preventDefault()
    if (!apiKey.trim()) return
    onSubmit({
      name: opt.name,
      auth_type: opt.auth_type,
      api_key: apiKey.trim(),
      base_url: baseUrl.trim() || undefined,
      enabled: true,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-card border border-border rounded-xl p-5 space-y-4"
    >
      <div>
        <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Provider</label>
        <select
          value={selectedName}
          onChange={e => setSelectedName(e.target.value)}
          className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        >
          {PROVIDER_OPTIONS.map(o => (
            <option key={o.name} value={o.name}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={opt.placeholder}
          autoComplete="off"
          required
          className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm font-mono"
        />
        <p className="text-xs text-muted mt-1">
          Stored encrypted in the database. You won't see it again after saving.
        </p>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Base URL (optional)</label>
        <input
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="Leave blank for the provider's default"
          className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm font-mono"
        />
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
          Add Provider
        </button>
      </div>
    </form>
  )
}

function EditForm({ provider, onCancel, onSubmit }) {
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(provider.enabled)

  function handleSubmit(e) {
    e.preventDefault()
    const updates = { enabled }
    if (apiKey.trim()) updates.api_key = apiKey.trim()
    onSubmit(updates)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="text-sm font-medium">Edit {provider.name} ({provider.auth_type})</div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
          Rotate API Key (leave blank to keep current)
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="Paste new key, or leave blank"
          autoComplete="off"
          className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm font-mono"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
        />
        <span>Enabled</span>
      </label>

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-muted hover:text-text-primary">Cancel</button>
        <button type="submit" className="px-4 py-2 rounded-md bg-brand hover:bg-brand-light text-white text-sm font-medium">Save</button>
      </div>
    </form>
  )
}
