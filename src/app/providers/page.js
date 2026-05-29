import AdminShell from '@/components/AdminShell'
import PhaseStub from '@/components/PhaseStub'

export const dynamic = 'force-dynamic'

export default function ProvidersPage() {
  return (
    <AdminShell title="Providers">
      <PhaseStub
        phase="Phase 2"
        summary="Add, edit, and test connections to Anthropic, OpenAI, Google Gemini, xAI Grok, and OpenRouter. Credentials are encrypted at rest with GATEWAY_ENCRYPTION_KEY (AES-256-GCM)."
      />
    </AdminShell>
  )
}
