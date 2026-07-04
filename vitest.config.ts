import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // E2E specs belong to Playwright, not Vitest.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/e2e/**', '**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Ratchet these UP over time (TOOLING_STANDARD.md → warn-then-ratchet).
      // Left at 0 so a retrofit never fails on legacy blind spots.
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
      exclude: ['**/node_modules/**', '**/*.config.*', '**/*.spec.*', '**/e2e/**'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
