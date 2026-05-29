import AdminShell from '@/components/AdminShell'
import PhaseStub from '@/components/PhaseStub'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <AdminShell title="Settings">
      <PhaseStub
        phase="Phase 5"
        summary="ADMIN_EMAILS management, encryption key rotation, log retention policy, default fallback behavior, and OAuth token expiry reminders (OD-001)."
      />
    </AdminShell>
  )
}
