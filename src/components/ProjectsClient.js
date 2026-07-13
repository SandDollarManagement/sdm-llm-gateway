'use client'

import { useState } from 'react'
import {
  Plus,
  KeyRound,
  Power,
  PowerOff,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Copy,
} from 'lucide-react'
import clsx from 'clsx'

export default function ProjectsClient({ initialProjects, initialAlerts }) {
  const [projects, setProjects] = useState(initialProjects || [])
  const [alerts, setAlerts] = useState(initialAlerts || [])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTokenInfo, setNewTokenInfo] = useState(null) // { name, token }
  const [editingId, setEditingId] = useState(null)
  const [banner, setBanner] = useState(null)

  async function refresh() {
    const [pr, ar] = await Promise.all([
      fetch('/api/admin/projects', { cache: 'no-store' }),
      fetch('/api/admin/alerts?open=true', { cache: 'no-store' }),
    ])
    if (pr.ok) setProjects((await pr.json()).projects || [])
    if (ar.ok) setAlerts((await ar.json()).alerts || [])
  }

  function showBanner(kind, message) {
    setBanner({ kind, message })
    setTimeout(() => setBanner(null), 4000)
  }

  async function handleCreate(formData) {
    const res = await fetch('/api/admin/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (!res.ok) return showBanner('error', data.error || 'Failed to create project')
    setShowAddForm(false)
    refresh()
  }

  async function handleUpdate(id, updates) {
    const res = await fetch(`/api/admin/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (!res.ok) return showBanner('error', data.error || 'Failed to update')
    showBanner('success', 'Updated.')
    setEditingId(null)
    refresh()
  }

  async function handleToggleKill(project) {
    const turningOff = project.enabled
    if (
      turningOff &&
      !confirm(
        `Kill switch: disable project "${project.name}"? Every key in it stops working immediately. Other projects and keys are unaffected.`,
      )
    )
      return
    await handleUpdate(project.id, { enabled: !project.enabled })
  }

  async function handleMintKey(project) {
    const name = prompt(
      `Name for the new scoped key in "${project.name}"?`,
      `${project.name}-${new Date().toISOString().slice(0, 10)}`,
    )
    if (name === null) return
    const res = await fetch(`/api/admin/projects/${project.id}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name.trim() ? { name: name.trim() } : {}),
    })
    const data = await res.json()
    if (!res.ok) return showBanner('error', data.error || 'Failed to mint key')
    setNewTokenInfo({ name: data.key.name, token: data.plaintext_token })
    refresh()
  }

  async function acknowledgeAlert(id) {
    const res = await fetch(`/api/admin/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acknowledged: true }),
    })
    if (res.ok) setAlerts((a) => a.filter((x) => x.id !== id))
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

      {alerts.length > 0 && (
        <div className="bg-warning/10 border border-warning/40 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-warning text-sm font-semibold">
            <AlertTriangle size={16} /> Spend alerts
          </div>
          {alerts.map((al) => (
            <div key={al.id} className="flex items-center justify-between text-sm">
              <span className="text-text-primary">
                {al.scope === 'project' ? al.project_name : al.app_name} reached {al.threshold}% of
                its cap
                {al.cap_usd != null && (
                  <span className="text-muted">
                    {' '}
                    (${Number(al.spent_usd || 0).toFixed(2)} / ${Number(al.cap_usd).toFixed(2)},{' '}
                    {al.period})
                  </span>
                )}
              </span>
              <button
                onClick={() => acknowledgeAlert(al.id)}
                className="text-xs text-muted hover:text-text-primary px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {newTokenInfo && <TokenReveal info={newTokenInfo} onDismiss={() => setNewTokenInfo(null)} />}

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted">
          Projects group keys for a shared spend cap, rate defaults, and a one-switch kill. A
          project-scoped key is locked to its allowed model aliases (fail closed).
        </p>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand hover:bg-brand-light text-white text-sm font-medium transition-colors shrink-0"
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      {showAddForm && <AddForm onCancel={() => setShowAddForm(false)} onSubmit={handleCreate} />}

      <div className="space-y-3">
        {projects.length === 0 && (
          <div className="bg-surface-card border border-border rounded-xl px-4 py-8 text-center text-muted text-sm">
            No projects yet.
          </div>
        )}
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            editing={editingId === p.id}
            onEdit={() => setEditingId(editingId === p.id ? null : p.id)}
            onToggleKill={() => handleToggleKill(p)}
            onMintKey={() => handleMintKey(p)}
            onSubmitEdit={(u) => handleUpdate(p.id, u)}
            onCancelEdit={() => setEditingId(null)}
          />
        ))}
      </div>
    </div>
  )
}

function ProjectCard({
  project,
  editing,
  onEdit,
  onToggleKill,
  onMintKey,
  onSubmitEdit,
  onCancelEdit,
}) {
  const cap = project.monthly_budget_usd != null ? Number(project.monthly_budget_usd) : null
  const spent = Number(project.spend_mtd || 0)
  const pct = cap && cap > 0 ? Math.min(100, (spent / cap) * 100) : 0
  const barColor = pct >= 90 ? 'bg-danger' : pct >= 50 ? 'bg-warning' : 'bg-success'

  return (
    <div className="bg-surface-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{project.name}</span>
            <span
              className={clsx(
                'text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded',
                project.kind === 'sandbox'
                  ? 'bg-brand/20 text-brand'
                  : 'bg-surface-hover text-muted',
              )}
            >
              {project.kind}
            </span>
            {!project.enabled && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-danger/20 text-danger">
                killed
              </span>
            )}
          </div>
          {project.description && (
            <p className="text-xs text-muted mt-1 max-w-lg">{project.description}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onMintKey}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-hover hover:bg-surface-secondary text-xs font-medium transition-colors"
            title="Mint a scoped key"
          >
            <KeyRound size={14} /> Mint key
          </button>
          <button
            onClick={onToggleKill}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
              project.enabled
                ? 'bg-surface-hover hover:bg-danger/20 hover:text-danger'
                : 'bg-success/20 text-success hover:bg-success/30',
            )}
            title={project.enabled ? 'Kill switch (disable)' : 'Re-enable'}
          >
            {project.enabled ? <PowerOff size={14} /> : <Power size={14} />}
            {project.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={onEdit}
            className="px-2.5 py-1.5 rounded-md bg-surface-hover hover:bg-surface-secondary text-xs font-medium"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted uppercase tracking-wide mb-1">Spend (mo)</div>
          <div className="font-medium">
            ${spent.toFixed(2)}
            {cap != null && <span className="text-muted"> / ${cap.toFixed(2)}</span>}
          </div>
          {cap != null && (
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-secondary overflow-hidden">
              <div className={clsx('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-muted uppercase tracking-wide mb-1">Keys</div>
          <div className="font-medium">{project.key_count}</div>
        </div>
        <div>
          <div className="text-xs text-muted uppercase tracking-wide mb-1">Rate defaults</div>
          <div className="font-medium text-xs">
            {project.default_rpm_limit ?? '—'} rpm · {project.default_tpm_limit ?? '—'} tpm
          </div>
        </div>
      </div>

      {editing && <EditForm project={project} onSubmit={onSubmitEdit} onCancel={onCancelEdit} />}
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
      <div className="font-semibold text-sm">Scoped key &quot;{info.name}&quot;</div>
      <div className="text-xs text-muted">
        This is the only time you&apos;ll see the plaintext. Set it on the sandbox side as{' '}
        <code>ANTHROPIC_API_KEY</code> (Claude Code) and the OpenAI key (Codex). Never let the
        sandbox see any real provider key.
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
  const [kind, setKind] = useState('sandbox')
  const [budget, setBudget] = useState('20')
  const [rpm, setRpm] = useState('30')
  const [tpm, setTpm] = useState('60000')

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name: name.trim(),
      kind,
      monthly_budget_usd: budget === '' ? null : Number(budget),
      default_rpm_limit: rpm === '' ? null : Number(rpm),
      default_tpm_limit: tpm === '' ? null : Number(tpm),
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-card border border-border rounded-xl p-5 space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="aether-sandbox"
            required
            className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="sandbox">sandbox</option>
            <option value="internal">internal</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <NumField label="Monthly cap (USD)" value={budget} setValue={setBudget} step="0.01" />
        <NumField label="Default rpm" value={rpm} setValue={setRpm} />
        <NumField label="Default tpm" value={tpm} setValue={setTpm} />
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
          Create Project
        </button>
      </div>
    </form>
  )
}

function EditForm({ project, onSubmit, onCancel }) {
  const [budget, setBudget] = useState(
    project.monthly_budget_usd != null ? String(project.monthly_budget_usd) : '',
  )
  const [rpm, setRpm] = useState(
    project.default_rpm_limit != null ? String(project.default_rpm_limit) : '',
  )
  const [tpm, setTpm] = useState(
    project.default_tpm_limit != null ? String(project.default_tpm_limit) : '',
  )

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit({
      monthly_budget_usd: budget === '' ? null : Number(budget),
      default_rpm_limit: rpm === '' ? null : Number(rpm),
      default_tpm_limit: tpm === '' ? null : Number(tpm),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border pt-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <NumField label="Monthly cap (USD)" value={budget} setValue={setBudget} step="0.01" />
        <NumField label="Default rpm" value={rpm} setValue={setRpm} />
        <NumField label="Default tpm" value={tpm} setValue={setTpm} />
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

function NumField({ label, value, setValue, step }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</label>
      <input
        type="number"
        min="0"
        step={step || '1'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="blank = none"
        className="w-full bg-surface-tertiary border border-border rounded-md px-3 py-2 text-sm"
      />
    </div>
  )
}
