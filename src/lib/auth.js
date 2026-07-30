// src/lib/auth.js
// NextAuth configuration. Mirrors the Ops Hub pattern (D-019):
// GoogleProvider + JWT session + ADMIN_EMAILS whitelist in signIn callback.
//
// Unlike Ops Hub, the gateway is a single-operator service with no per-user
// data tables, so the signIn callback only enforces the whitelist; there is
// no user provisioning here.

import GoogleProvider from 'next-auth/providers/google'

// The LOGIN credential is AUTH_GOOGLE_*, shared across every Sand Dollar app: one OAuth
// client, its own "SDM Login" Google Cloud project, identity scopes only. Fleet-wide,
// GOOGLE_CLIENT_ID means an app's DATA-access credential (Gmail/Drive/Photos), so login
// never reads that name — even here, where this app has no data credential, because one
// name meaning two things is how the two got entangled in Ops-Hub.
//
// The fallback is a MIGRATION SHIM so this deploy does not lose sign-in before
// AUTH_GOOGLE_* is set in Coolify. Remove it once the new vars are confirmed live.
const loginClientId = process.env.AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
const loginClientSecret = process.env.AUTH_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET

if (!process.env.AUTH_GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID) {
  console.warn(
    '[auth] Using the legacy GOOGLE_CLIENT_ID for login because AUTH_GOOGLE_CLIENT_ID is not set. ' +
      'Set AUTH_GOOGLE_CLIENT_ID and AUTH_GOOGLE_CLIENT_SECRET (SDM Login project) to move onto the shared credential.',
  )
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: loginClientId,
      clientSecret: loginClientSecret,
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false
      const allowed = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
      if (allowed.length === 0) {
        console.warn('[auth] ADMIN_EMAILS is empty; denying all sign-ins.')
        return false
      }
      if (!allowed.includes(user.email.toLowerCase())) {
        console.warn(`[auth] Sign-in denied for ${user.email} (not in ADMIN_EMAILS).`)
        return false
      }
      return true
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email
      return token
    },
    async session({ session, token }) {
      if (token?.email) session.user = { ...(session.user || {}), email: token.email }
      return session
    },
  },
}
