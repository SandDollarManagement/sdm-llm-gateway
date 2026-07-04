/** @type {import('next').NextConfig} */
const pkg = require('./package.json')

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  // Warn-mode type-checking (TOOLING_STANDARD.md ratchet): adding tsconfig.json for
  // light checkJs made Next treat this JS project as TypeScript and hard-fail the
  // build on pre-existing legacy type errors. Keep `next build` a hard gate for real
  // compile/webpack errors, but do NOT block on legacy type findings — those surface
  // in the warn-mode `tsc --noEmit` CI step instead, per the warn-then-ratchet policy.
  typescript: {
    ignoreBuildErrors: true,
  },

  // Warn-mode linting (same warn-then-ratchet policy): adding an eslint config made
  // `next build` run ESLint as part of the production build and hard-fail on
  // pre-existing legacy lint findings. Keep the build a hard gate for compile/webpack
  // errors only; lint still runs as its own warn-mode CI step (`pnpm run lint`,
  // continue-on-error) so findings surface without blocking.
  eslint: {
    ignoreDuringBuilds: true,
  },

  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },

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
