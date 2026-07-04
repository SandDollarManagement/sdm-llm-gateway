// This project lints via `next lint` (no standalone ESLint config for bare `eslint`),
// so the pre-commit only FORMATS staged files. Linting runs in CI (warn-mode `next lint`).
export default {
  '*.{js,jsx,mjs,cjs,json,css,scss,md,yml,yaml}': ['prettier --write'],
}
