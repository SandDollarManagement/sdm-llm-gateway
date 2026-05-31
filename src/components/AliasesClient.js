'use client'

import { useState } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle2, ChevronUp, ChevronDown, X, Play, Loader2 } from 'lucide-react'
import clsx from 'clsx'

const PROVIDER_MODEL_HINTS = {
  anthropic: ['claude-sonnet-4-5', 'claude-opus-4-7', 'claude-haiku-4-5'],
  openai: ['openai-gpt-4o', 'openai-gpt-4o-mini', 'openai-gpt-5'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  'xai-grok': ['grok-3'],
  openrouter: ['openrouter-deepseek', 'openrouter-llama-3.3'],
}

export default function AliasesClient({ initialAliases, initialProviders }) {
  const [aliases, setAliases] = useState(initialAliases || [])
  const [providers, setProviders] = useState(initialProviders || [])
  const [editingId, setEditingId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [banner, setBanner] = useState(null)
  const [testResults, setTestResults] = useState({}) // { [aliasId]: { running, result } }

  async function refresh() {
    const res = await fetch('/api/admin/aliases', { cache: 'no-store' })
    if (res.ok) setAliases((await res.json()).aliases || [])
  }

  function showBanner(kind, message) {
    setBanner({ kind, message })
    setTimeout(() => setBanner(null), 4000)
  }

  async function handleCreate(formData) {
    const res = await fetch('/api/admin/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (!res.ok) { showBanner('error', data.error || 'Failed to create alias'); return }
    showBanner('success', `Added ${formData.name}.`)
    setShowAddForm(false)
    refresh()
  }

  async function handleUpdate(id, updates) {
    const res = await fetch(`/api/admin/aliases/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (!res.ok) { showBanner('error', data.error || 'Failed to update'); return }
    showBanner('success', 'Updated.')
    setEditingId(null)
    refresh()
  }

  async function handleTest(id) {
    setTestResults(prev => ({ ...prev, [id]: { running: true, result: null } }))
    try {
      const res = await fetch(`/api/admin/aliases/${id}/test`, { method: 'POST' })
      const data = await res.json()
      setTestResults(prev => ({ ...prev, [id]: { running: false, result: data } }))
    } catch (err) {
      setTestResults(prev => ({ ...prev, [id]: { running: false, result: { ok: false, error: err.message } } }))
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete alias "${name}"? Apps that use this alias will fail until they're pointed at a different one.`)) return
    const res = await fetch(`/api/admin/aliases/${id}`, { method: 'DELETE' })
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
        <div className={clsx(
          'flex items-center gap-3 px-4 py-3 rounded-lg border',
          banner.kind === 'error'
            ? 'bg-danger/10 border-danger/40 text-danger'
            : 'bg-success/10 border-success/40 text-success'
        )}>
          {banner.kind === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span className="text-sm">{banner.message}</span>
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted">
          Each alias maps to a fallback chain — an ordered list of providers tried until one succeeds.
          Apps request models by alias name (<code>"model": "default"</code>), not by raw model.
        </p>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand hover:bg-brand-light text-white text-sm font-medium transition-colors shrink-0"
        >
          <Plus size={16} />
          New Alias
        </button>
      </div>

      {showAddForm && (
        <AddForm onCancel={() => setShowAddForm(false)} onSubmit={handleCreate} />
      )}

      <div className="space-y-3">
        {aliases.length === 0 && (
          <div className="bg-surface-card border border-border rounded-xl p-8 text-center text-muted text-sm">
            No aliases yet.
          </div>
        )}
        {aliases.map(a => (
          <AliasCard
            key={a.id}
            alias={a}
            providers={providers}
            isEditing={editingId === a.id}
            testState={testResults[a.id]}
            onEdit={() => setEditingId(editingId === a.id ? null : a.id)}
            onUpdate={updates => handleUpdate(a.id, updates)}
            onDelete={() => handleDelete(a.id, a.name)}
            onTest={() => handleTest(a.id)}
          />
        ))}
      </div>
    </div>
  )
}

function AliasCard({ alias, providers, isEditing, testState, onEdit, onUpdate, onDelete, onTest }) {
  const providerById = Object.fromEntries(providers.map(p => [p.id, p]))
  const running = testState?.running
  const result = testState?.result
  return (
    <div className="bg-surface-card border border-border rounded-xl">
      <div className="px-5 py-4 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <code className="text-base font-semibold">{alias.name}</code>
            <span className="text-xs text-muted">{(alias.fallback_chain || []).length} providers in chain</span>
          </div>
          {alias.description && <p className="text-sm text-muted mt-1">{alias.description}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onTest}
            disabled={running || (alias.fallback_chain || []).length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-brand/10 hover:bg-brand/20 text-brand-light disabled:opacity-40 disabled:cursor-not-allowed"
            title={(alias.fallback_chain || []).length === 0 ? 'Add a provider to the chain first' : 'Fire a sample call through this alias'}
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Test
          </button>
          <button onClick={onEdit} className="text-xs px-3 py-1.5 rounded-md hover:bg-surface-hover text-muted hover:text-text-primary">
            {isEditing ? 'Close' : 'Edit'}
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-danger">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {result && (
        <div className="px-5 pb-4">
          <div className={clsx(
            'border-t pt-3 text-sm',
            result.ok ? 'border-success/40' : 'border-danger/40'
          )}>
            {result.ok ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 size={14} />
                  <span className="font-medium">Answered by {result.provider}</span>
                  <span className="text-xs text-muted">· {result.model} · {result.latency_ms} ms</span>
                </div>
                <div className="text-sm text-muted italic">"{result.reply}"</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-danger">
                  <AlertCircle size={14} />
                  <span className="font-medium">Test failed</span>
                  <span className="text-xs text-muted">· {result.latency_ms} ms</span>
                </div>
                <div className="text-xs text-danger/80 break-all">{result.error}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {!isEditing && (
        <div className="px-5 pb-4">
          <div className="border-t border-border pt-3">
            {(alias.fallback_chain || []).length === 0 ? (
              <div className="text-xs text-muted italic">Empty chain — calls to this alias will fail.</div>
            ) : (
              <ol className="space-y-1.5">
                {(alias.fallback_chain || []).map((entry, idx) => {
                  const p = providerById[entry.provider_id]
                  return (
                    <li key={idx} className="flex items-center gap-3 text-sm">
                      <span className="text-xs text-muted w-5">{idx + 1}.</span>
                      <span className="font-medium">{p ? p.name : '(missing provider)'}</span>
                      <span className="text-xs text-muted">{p ? `(${p.auth_type})` : ''}</span>
                      <span className="text-xs text-muted">→</span>
                      <code className="text-xs">{entry.model || '(no model)'}</code>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      )}

      {isEditing && (
        <EditChain alias={alias} providers={providers} onCancel={onEdit} onSave={onUpdate} />
      )}
    </div>
  )
}

function EditChain({ alias, providers, onCancel, onSave }) {
  const [chain, setChain] = useState(alias.fallback_chain || [])
  const [description, setDescription] = useState(alias.description || '')

  function move(idx, dir) {
    const next = [...chain]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setChain(next.map((e, i) => ({ ...e, priority: i })))
  }
  function remove(idx) { setChain(chain.filter((_, i) => i !== idx).map((e, i) => ({ ...e, priority: i }))) }
  function add() {
    setChain([...chain, { provider_id: '', model: '', priority: chain.length }])
  }
  function update(idx, key, value) {
    const next = [...chain]; next[idx] = { ...next[idx], [key]: value }; setChain(next)
  }

  function save() {
    onSave({
      description: description.trim() || null,
      fallback_chain: chain.filter(e => e.provider_id).map((e, i) => ({
        provider_id: e.provider_id,
        model: (e.model || '').trim(),
        priority: i,
      })),
    })
  }

  return (
    <div className="border-t border-border bg-surface-secondary px-5 py-4 space-y-3 rounded-b-xl">
      <div>
        <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Description</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What this alias is for"
          className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-xs uppercase tracking-wide text-muted">Fallback chain (top = tried first)</label>
          <button onClick={add} className="flex items-center gap-1 text-xs text-brand hover:text-brand-light">
            <Plus size={12} /> Add provider
          </button>
        </div>
        <div className="space-y-2">
          {chain.length === 0 && <div className="text-xs text-muted italic px-3 py-2">No providers yet.</div>}
          {chain.map((entry, idx) => {
            const provider = providers.find(p => p.id === entry.provider_id)
            const hints = provider ? PROVIDER_MODEL_HINTS[provider.name] || [] : []
            return (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted hover:text-text-primary disabled:opacity-30">
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => move(idx, +1)} disabled={idx === chain.length - 1} className="text-muted hover:text-text-primary disabled:opacity-30">
                    <ChevronDown size={14} />
                  </button>
                </div>
                <select
                  value={entry.provider_id}
                  onChange={e => update(idx, 'provider_id', e.target.value)}
                  className="bg-surface-tertiary border border-border rounded-md px-2 py-1.5 text-sm min-w-[180px]"
                >
                  <option value="">Pick a provider...</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.auth_type})
                    </option>
                  ))}
                </select>
                <input
                  list={`model-hints-${idx}`}
                  type="text"
                  value={entry.model || ''}
                  onChange={e => update(idx, 'model', e.target.value)}
                  placeholder="model name (e.g. openai-gpt-4o)"
                  className="flex-1 bg-surface-tertiary border border-border rounded-md px-2 py-1.5 text-sm"
                />
                <datalist id={`model-hints-${idx}`}>
                  {hints.map(h => <option key={h} value={h} />)}
                </datalist>
                <button onClick={() => remove(idx)} className="p-1 text-muted hover:text-danger">
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onCancel} className="px-3 py-2 text-sm text-muted hover:text-text-primary">Cancel</button>
        <button onClick={save} className="px-4 py-2 rounded-md bg-brand hover:bg-brand-light text-white text-sm font-medium">Save</button>
      </div>
    </div>
  )
}

function AddForm({ onCancel, onSubmit }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  function handleSubmit(e) {
    e.preventDefault()
    onSubmit({ name: name.trim().toLowerCase(), description: description.trim() || null, fallback_chain: [] })
  }
  return (
    <form onSubmit={handleSubmit} className="bg-surface-card border border-border rounded-xl p-5 space-y-3">
      <div>
        <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Alias name (lowercase, no spaces)</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="my-custom-alias" required className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm font-mono" />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Description</label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What this alias is for" className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm" />
      </div>
      <p className="text-xs text-muted">Add providers to the chain after creating the alias.</p>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-muted hover:text-text-primary">Cancel</button>
        <button type="submit" className="px-4 py-2 rounded-md bg-brand hover:bg-brand-light text-white text-sm font-medium">Create Alias</button>
      </div>
    </form>
  )
}
