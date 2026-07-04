# Tooling standard — building & testing (project-agnostic)

The baseline testing + quality toolchain every SDM project runs, and the policy for
how its gates are enforced. Copied into every new project and retrofitted onto existing
ones (via `/init-project`). This is the north-star for "is this project set up right";
apply it proportionally — a tiny CLI does not need Playwright, a full web app does.

Two language variants below (Node/TypeScript web apps, and Python). The **drop-in kit**
that actually installs this lives in `standard-tooling/` next to this doc.

---

## The point (plain English)

Bugs get cheaper to catch the earlier you catch them. Each tool here catches a
different class of bug at a different stage:

| Tool                                    | Plain-English: what it catches                       | Stage             |
| --------------------------------------- | ---------------------------------------------------- | ----------------- |
| **Type-checking** (`tsc` / `mypy`)      | "you passed the wrong kind of data"                  | before it runs    |
| **Linting** (ESLint/Biome / ruff)       | likely-bug patterns, sloppy code                     | before it runs    |
| **Formatting** (Prettier / ruff-format) | style drift (cosmetic, but removes noise from diffs) | before commit     |
| **Unit tests** (Vitest / pytest)        | logic errors in one small piece (e.g. money math)    | fast, constant    |
| **Component tests** (Testing Library)   | a piece of UI misbehaving                            | fast              |
| **E2E tests** (Playwright)              | the whole app wired together wrong                   | slower, pre-merge |
| **Accessibility** (axe-core)            | pages unusable by keyboard/screen-reader             | in E2E            |
| **Dead-code finder** (knip)             | unused files/exports/deps — safe-deletion evidence   | on demand / CI    |
| **Coverage** (vitest/pytest --coverage) | _what isn't tested_ (blind spots)                    | reported in CI    |

The multiplier is not any single tool — it's the **enforcement layer** that runs them
automatically so nothing depends on remembering:

- **Pre-commit hooks** run the fast checks (lint/format/typecheck + related unit tests)
  the moment code is saved.
- **CI** runs the full set on every change. "CI green" is the merge gate the self-merge
  model already depends on (see `~/.claude/CLAUDE.md` → PR merge autonomy).

---

## Node / TypeScript web app — required

Package manager: **pnpm** (matches the shop's store). New TS code is the default; plain
JS projects turn on light type-checking (`checkJs`) in warn mode rather than a big-bang
TS conversion.

**Dev dependencies:**

```
typescript  vitest  @vitest/coverage-v8  @testing-library/react  @testing-library/jest-dom
  @testing-library/user-event  jsdom  @playwright/test  @axe-core/playwright
  eslint  prettier  knip  husky  lint-staged
```

**Required `package.json` scripts:**

```
"typecheck": "tsc --noEmit"
"lint":      "eslint ."
"format":    "prettier --write ."
"format:check": "prettier --check ."
"test":      "vitest run"
"test:watch":"vitest"
"coverage":  "vitest run --coverage"
"test:e2e":  "playwright test"
"knip":      "knip"
"verify":    "pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build"
```

`pnpm run verify` is the single local "is this green?" command; CI runs the same set
plus E2E.

**Configs** (drop-in copies in `standard-tooling/node/`): `vitest.config.ts` (+
`vitest.setup.ts`), `playwright.config.ts`, `.prettierrc.json`, `.prettierignore`,
`knip.json`, `eslint.config.mjs` (only when the project has no linter yet — never
overwrite an existing one, incl. a Biome setup), `.husky/pre-commit`,
`lint-staged.config.mjs`, and `.github/workflows/ci.yml`.

**Linter note:** projects already on **Biome** (an all-in-one lint+format) keep Biome —
do not force-migrate them to ESLint+Prettier. The standard is "a linter and a formatter
run in CI and pre-commit," not one specific tool.

---

## Python — required (e.g. Gmail-Drive-Manager)

Manager: whatever the project uses (`pip`/`uv`/poetry). Same shape, different names:

**Dev dependencies:** `pytest  pytest-cov  ruff  mypy  pre-commit`

**Required tasks** (Makefile targets or scripts): `typecheck` (`mypy .`), `lint`
(`ruff check .`), `format` (`ruff format .`), `test` (`pytest`), `coverage`
(`pytest --cov`).

**Configs** (drop-in in `standard-tooling/python/`): a `pyproject.toml` tooling block
(ruff + mypy + pytest), `.pre-commit-config.yaml`, and `.github/workflows/ci.yml`.

---

## Enforcement policy — warn first, then ratchet (this is the important part)

Retrofitting strict gates onto mature code surfaces a pile of pre-existing issues at
once. Turning them all blocking on day one would turn CI red and block merges — the
wrong outcome. So the rule:

1. **New gates land in WARN mode.** Type-check, lint, coverage, and knip run in CI and
   report findings, but do **not** fail the build yet. The build + existing tests stay
   the only hard-fail gates so nothing that works today starts blocking.
2. **Ratchet to blocking as the backlog clears.** As each category's findings are
   driven to zero (or an accepted baseline), flip that gate to blocking so it can never
   regress. Coverage uses a ratcheting threshold — it may only go up.
3. **A brand-new project starts with everything BLOCKING** — there's no legacy backlog,
   so it's born strict and stays strict.

Record which gates are warn vs blocking for a given project in its `PROJECT_STATE.md`
(or the project's equivalent current-state doc) so the ratchet is visible, not implicit.

---

## Optional / situational (add per project, not required)

- **Visual/screenshot regression** (Playwright snapshots) — flags unintended UI changes;
  pairs with the existing mobile-audit skills.
- **MSW** (Mock Service Worker) — deterministic API mocking in tests.
- **Lighthouse CI** — performance/accessibility/SEO budgets that fail a regression.
- **Storybook** — component catalog; only for design-system-heavy apps.

---

## How this gets applied

- **New projects** — `/new-project` wires the whole kit during bootstrap (born strict).
- **Existing projects** — `/init-project` retrofits it idempotently in warn mode.
- **The kit** — real, versioned config files + an idempotent installer live in
  `standard-tooling/`; agents copy + run them, they don't re-invent configs each time.
