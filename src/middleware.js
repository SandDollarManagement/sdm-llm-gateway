// src/middleware.js
// NextAuth route protection. Any path matched here will require a valid
// session; unauthenticated requests are redirected to /login. The signIn
// callback in src/lib/auth.js separately enforces the ADMIN_EMAILS whitelist.

export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/providers/:path*',
    '/aliases/:path*',
    '/apps/:path*',
    '/usage/:path*',
    '/logs/:path*',
    '/settings/:path*',
  ],
}
