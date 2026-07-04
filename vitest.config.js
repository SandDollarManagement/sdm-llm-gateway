import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// JS-only project (no tsconfig — matches SDM-Ops-Hub). Vitest loads this .js config
// via its own bundler, so ESM import syntax works even though the package is CommonJS.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/e2e/**', '**/*.spec.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
      exclude: ['**/node_modules/**', '**/*.config.*', '**/*.spec.*', '**/e2e/**'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
