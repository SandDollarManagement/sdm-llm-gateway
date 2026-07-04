// Runs on staged files at commit time (via .husky/pre-commit).
// Fast checks only — the full suite runs in CI.
export default {
  '*.{ts,tsx,js,jsx,mjs,cjs}': ['eslint --fix', 'prettier --write'],
  '*.{json,css,scss,md,yml,yaml}': ['prettier --write'],
}
