import AdminShell from '@/components/AdminShell'
import PhaseStub from '@/components/PhaseStub'

export const dynamic = 'force-dynamic'

export default function UsagePage() {
  return (
    <AdminShell title="Usage">
      <PhaseStub
        phase="Phase 5"
        summary="Filterable charts by app, provider, alias, and date range. Includes OAuth-credit burn rate and projected month-end spend."
      />
    </AdminShell>
  )
}
