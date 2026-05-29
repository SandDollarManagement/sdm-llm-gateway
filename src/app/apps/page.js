import AdminShell from '@/components/AdminShell'
import PhaseStub from '@/components/PhaseStub'

export const dynamic = 'force-dynamic'

export default function AppsPage() {
  return (
    <AdminShell title="Apps">
      <PhaseStub
        phase="Phase 5"
        summary="Register consumer apps (Ops Hub, Media Manager, Gmail Drive Manager, AI Social Posting App, motivational video pipeline) and issue per-app bearer tokens. Set per-app default alias and monthly budget caps."
      />
    </AdminShell>
  )
}
