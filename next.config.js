/** @type {import('next').NextConfig} */
const pkg = require('./package.json')

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  eslint: {
    // Lint runs as its own warn-mode CI step (tooling standard, warn-then-ratchet):
    // the pre-existing lint backlog must not break the blocking build gate.
    // Flip this off once the backlog is cleared and lint ratchets to blocking.
    ignoreDuringBuilds: true,
  },

  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },

  // /health is the public watchdog path; the handler lives at /api/health.
  rewrites: async () => [{ source: '/health', destination: '/api/health' }],

  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
}

module.exports = nextConfig
