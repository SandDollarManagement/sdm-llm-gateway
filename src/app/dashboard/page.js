import AdminShell from '@/components/AdminShell'
import PhaseStub from '@/components/PhaseStub'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return (
    <AdminShell title="Dashboard">
      <PhaseStub
        phase="Phase 5"
        summary="Current-month spend per provider, OAuth credit burn rate, fallback rate, and top-spending apps. Lights up once Phase 2 (LiteLLM + first provider) and Phase 4 (OAuth path) are in place."
      />
    </AdminShell>
  )
}
