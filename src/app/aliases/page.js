import AdminShell from '@/components/AdminShell'
import PhaseStub from '@/components/PhaseStub'

export const dynamic = 'force-dynamic'

export default function AliasesPage() {
  return (
    <AdminShell title="Aliases">
      <PhaseStub
        phase="Phase 3"
        summary="Edit the five default aliases (default, reasoning, fast, vision, bulk-classify) or add your own. Each alias maps to a fallback chain of {provider, model, priority} entries."
      />
    </AdminShell>
  )
}
