// src/lib/auth.js
// NextAuth configuration. Mirrors the Ops Hub pattern (D-019):
// GoogleProvider + JWT session + ADMIN_EMAILS whitelist in signIn callback.
//
// Unlike Ops Hub, the gateway is a single-operator service with no per-user
// data tables, so the signIn callback only enforces the whitelist; there is
// no user provisioning here.

import GoogleProvider from 'next-auth/providers/google'

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false
      const allowed = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
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
