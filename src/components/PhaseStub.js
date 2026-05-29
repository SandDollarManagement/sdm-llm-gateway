import { Construction } from 'lucide-react'

/**
 * Placeholder body for Phase 1 admin pages. Each admin route shows the title
 * (rendered by AdminShell) plus this stub. Real CRUD lands in later phases.
 */
export default function PhaseStub({ phase, summary }) {
  return (
    <div className="max-w-2xl">
      <div className="bg-surface-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-surface-hover flex items-center justify-center">
            <Construction size={18} className="text-warning" />
          </div>
          <div>
            <div className="text-sm font-semibold">Coming in {phase}</div>
            <div className="text-xs text-muted mt-0.5">Phase 1 ships the auth shell only.</div>
          </div>
        </div>
        <p className="text-sm text-muted leading-relaxed">{summary}</p>
      </div>
    </div>
  )
}
