// src/lib/admin-auth.js
// Server-side session check for /api/admin/* routes.
// Page routes are already protected by src/middleware.js (NextAuth); this
// gives the API routes the same protection plus the ADMIN_EMAILS whitelist
// re-check so an authenticated-but-non-whitelisted session can't reach
// admin APIs even if middleware were misconfigured.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export class AdminAuthError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) throw new AdminAuthError(401, 'Authentication required.')

  const allowed = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  if (!allowed.includes(email)) {
    throw new AdminAuthError(403, 'Not an admin.')
  }
  return { email }
}
