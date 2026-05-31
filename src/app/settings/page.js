import AdminShell from '@/components/AdminShell'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'

export const dynamic = 'force-dynamic'

function envStatus(name) {
  const v = process.env[name]
  return { name, set: !!v, length: v ? v.length : 0 }
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)

  const envVars = [
    envStatus('NEXTAUTH_SECRET'),
    envStatus('NEXTAUTH_URL'),
    envStatus('DATABASE_URL'),
    envStatus('GATEWAY_ENCRYPTION_KEY'),
    envStatus('LITELLM_INTERNAL_URL'),
    envStatus('LITELLM_MASTER_KEY'),
    envStatus('ANTHROPIC_OAUTH_TOKEN'),
    envStatus('GOOGLE_CLIENT_ID'),
    envStatus('GOOGLE_CLIENT_SECRET'),
  ]

  return (
    <AdminShell title="Settings">
      <div className="max-w-3xl space-y-6">

        <Panel title="Operator Session">
          <Row label="Signed in as" value={session?.user?.email || 'unknown'} />
          <Row label="Admin emails (ADMIN_EMAILS)" value={
            adminEmails.length > 0
              ? adminEmails.map(e => <code key={e} className="text-xs">{e}</code>).reduce((prev, curr) => [prev, ', ', curr])
              : <span className="text-muted italic">none set</span>
          } />
          <p className="text-xs text-muted mt-3 flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>To add or remove admin emails, edit the <code>ADMIN_EMAILS</code> env var on the gateway-web resource in Coolify and restart the container.</span>
          </p>
        </Panel>

        <Panel title="Environment Variables">
          <p className="text-xs text-muted mb-3">
            For security, values are not shown — only presence and length. To change any of these, edit the matching variable in Coolify on the gateway-web resource and restart.
          </p>
          <div className="space-y-1.5">
            {envVars.map(v => (
              <div key={v.name} className="flex items-center justify-between text-sm py-1.5">
                <code className="text-xs">{v.name}</code>
                {v.set ? (
                  <span className="inline-flex items-center gap-1.5 text-success text-xs">
                    <CheckCircle2 size={14} />
                    set ({v.length} chars)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-danger text-xs">
                    <AlertCircle size={14} />
                    not set
                  </span>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Anthropic Max Subscription Token">
          <p className="text-sm text-muted">
            The <code>ANTHROPIC_OAUTH_TOKEN</code> is consumed by the container entrypoint at startup and written to <code>/app/.claude/.credentials.json</code>. The <code>claude</code> CLI reads it from there for every Anthropic call.
          </p>
          <p className="text-sm text-muted mt-2">
            Tokens are valid for one year from when <code>claude setup-token</code> was run. To rotate, generate a new token locally, paste it into Coolify env vars on gateway-web, restart the container.
          </p>
          <p className="text-xs text-muted mt-3 flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>A built-in expiry warning (banner at 30 days remaining) is on the backlog as OD-001. Until then, set a personal calendar reminder.</span>
          </p>
        </Panel>

        <Panel title="Encryption Key Backup">
          <p className="text-sm text-muted">
            Provider credentials are encrypted at rest with <code>GATEWAY_ENCRYPTION_KEY</code> (AES-256-GCM). If this key is lost, every stored provider API key becomes unrecoverable.
          </p>
          <p className="text-sm text-muted mt-2">
            Per D-016, your backup policy is: Coolify env var only (no external backup). To raise the safety bar, copy the value to a password manager.
          </p>
        </Panel>

      </div>
    </AdminShell>
  )
}

function Panel({ title, children }) {
  return (
    <section className="bg-surface-card border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-4 text-sm py-1.5 border-b border-border last:border-0">
      <div className="text-muted">{label}</div>
      <div className="text-right break-all">{value}</div>
    </div>
  )
}
