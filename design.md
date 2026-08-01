<!-- GENERATED FILE — DO NOT EDIT BY HAND.
     Source: /root/projects/design-system/ (DESIGN_SYSTEM.md + tokens.css)
     Regenerate: node /root/projects/design-system/scripts/design-md-gen.mjs --project sdm-llm-gateway
     Edits here are overwritten and do not change how anything looks. -->

# design.md — sdm-llm-gateway

**DESIGN_SYSTEM_VERSION: 1.0.1**

How this app must look. It is not this project's own taste — it is the shared
house style for Preston's internal tools, so they read as one family.

Full system, component recipes and rationale:
`/root/projects/design-system/DESIGN_SYSTEM.md`
Token contract to import: `/root/projects/design-system/tokens.css`

## Principles

- Hierarchy comes from typography and spacing, not boxes and borders.
- One accent color, used sparingly. Everything else is neutral.
- Whitespace is a feature. Default to more.
- Hairline borders or none. Soft, diffuse shadows only.
- One radius family, one spacing scale, applied everywhere without exception.
- The operator's task is the content. Chrome gets out of the way.

## Color tokens

| Token           | Light                 | Dark                   | Use                                |
|-----------------|-----------------------|------------------------|------------------------------------|
| `--bg`          | #f5f6f8               | #0b0c0e                | Page background                    |
| `--surface`     | #ffffff               | #151719                | Cards, panels                      |
| `--surface-2`   | #f0f1f4               | #1d2023                | Insets, metric tiles, active nav   |
| `--surface-3`   | #e8eaee               | #25282d                | Hover states                       |
| `--text`        | #1a1c1f               | #f2f3f5                | Primary text                       |
| `--text-muted`  | #5e646c               | #9aa1a9                | Secondary text, labels             |
| `--text-faint`  | #8a9098               | #6b727a                | Hints, timestamps                  |
| `--border`      | rgba(18,20,24,.08)    | rgba(255,255,255,.09)  | Hairline separators                |
| `--border-strong` | rgba(18,20,24,.14)  | rgba(255,255,255,.15)  | Emphasis / hover borders           |
| `--accent`      | #2f6fed               | #4d8dff                | The single accent. Used sparingly. |
| `--accent-hover`| #2a62d4               | #6a9fff                | Accent hover                       |
| `--accent-weak` | rgba(47,111,237,.10)  | rgba(77,141,255,.14)   | Tinted accent backgrounds (badges) |
| `--accent-on`   | #ffffff               | #ffffff                | Text/icons on accent fills         |
| `--success`     | #1d8a57               | #34b87d                | Running, healthy, approved         |
| `--warning`     | #b07503               | #e0a23a                | Pending, dry-run, attention        |
| `--danger`      | #c5403a               | #e0564f                | Errors, failures, destructive      |

Each semantic color has a `-weak` tinted-background partner.

## Typography

| Token         | Value | Usage                          |
|---------------|-------|--------------------------------|
| `--text-xs`   | 12px  | Labels, overlines, timestamps  |
| `--text-sm`   | 13px  | Secondary body, row meta       |
| `--text-base` | 14px  | Body default                   |
| `--text-md`   | 15px  | Emphasized body                |
| `--text-lg`   | 18px  | Subsection headings            |
| `--text-xl`   | 22px  | Page title                     |
| `--text-2xl`  | 28px  | Metric values                  |

Weights: 400 regular, 500 medium, 600 semibold. **Never 700+** — it reads heavy.
Headings and metric values use `--tracking-tight` (-0.02em).

Hierarchy recipes:

- Page title — `--text-xl`/`--text-2xl` · 600 · tracking-tight
- Section heading — `--text-sm` · 600
- Metric value — `--text-2xl` · 600 · tracking-tight
- Label / overline — `--text-xs` · 500 · `--text-muted`
- Body — `--text-base` · 400 · line-height 1.5

## Spacing scale (8px base)

`--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 ·
`--space-6` 24 · `--space-8` 32 · `--space-10` 40

Card padding `--space-5`. Grid gap between cards `--space-4`. Section gap `--space-5`.

## Radius

`--radius-sm` 8 · `--radius-md` 10 · `--radius-lg` 14 · `--radius-full` 999

Cards `--radius-lg`. Buttons/inputs `--radius-md`. Pills/dots `--radius-full`.

## Hard rules — visual

1. No pure black (#000) or pure white text. Use `--text` / `--text-muted` / `--text-faint`.
2. No saturated primary colors anywhere except `--accent`. **There is no second accent.**
3. Borders are 1px hairline only. Separate with spacing first, borders second, boxes last.
4. One corner-radius family. Never mix sharp and round.
5. Shadows are soft and tinted to the background. Never hard black, never glow.
6. No gradients, bevels, or 3D effects.
7. `--font-mono` is for tabular numbers only. Everything else is `--font-sans`.

## Hard rules — mobile

Preston browses primarily on an **Android phone at ~360–390 CSS px**. "Mobile-ready"
means ALL nine of these, not a subset. He should never have to give these
instructions again, per-project.

1. **No horizontal scroll, ever.** Nothing off the right edge. Non-negotiable.
2. **No clipped or hidden content.** If it cannot fit, it WRAPS or
   TRUNCATES-with-ellipsis. It is never cut off with content unreachable.
3. **No crushed columns.** Text beside fixed-width controls must not be squeezed to
   a one-word-per-line sliver. Stack, don't squeeze.
4. **Tables become cards.** Multi-column data tables do NOT sideways-scroll on a
   phone — each row becomes a stacked, labeled card.
5. **Navigation collapses to a hamburger.** A wide sidebar becomes an off-canvas
   drawer; the page leads with CONTENT, not the nav list.
6. **Content-first.** What needs him is at the top; chrome is tucked away.
7. **Tap targets ≥ 44px** (`--tap-min`). Buttons and rows are finger-sized.
8. **Inputs clear the keyboard.** A bottom-anchored composer rides ABOVE the
   on-screen keyboard, never behind it.
9. **Modals go full-screen on a phone.**

### The three recurring causes (fix these, don't just clip)

**A. Grid `max-content` overflow — the #1 cause of off-screen text.** A single-column
grid with implicit tracks sizes to its widest child's max-content (a long URL or
path), pushing the column past the viewport. Pin every stacked grid:

```css
.some-stacked-grid { grid-template-columns: minmax(0, 1fr); }
```

**B. The global guard is a seatbelt, not a fix.** `tokens.css` ships
`overflow-x: clip` and `min-width: 0`. Those stop the damage being *visible*; they do
not remove the cause. Always eliminate A and C as well, or content is silently clipped
— which is a silent failure, and those always surface.

**C. Flex rows must be allowed to wrap.** Two adjacent inline-flex buttons with no
whitespace between them (JSX strips the newline) cannot line-break and will overflow:

```css
.button-row { display: flex; flex-wrap: wrap; gap: 8px; }
```

On a phone, prefer stacking full-width: `flex-direction: column; align-items: stretch;`
with `width: 100%` on the buttons.

### Verification protocol (mandatory — this is what was always skipped)

The recurring misses came from **reviewing code instead of rendering every screen**.
Reading a diff does not prove a page fits. So:

- **Render EVERY screen at 390px** and look at it. Not a sample. Not the one you
  changed. Every screen. Use `/audit-mobile` or the screenshot harness.
- **Fix what you find in the same pass.** Deferring a known mobile break to "next
  sprint" is how these accumulated in the first place.

---

---

## If you are about to change how this app looks

1. Do not invent a token. If you need a value that is not here, the system needs
   changing — edit `design-system/`, bump the version, regenerate. Never fork.
2. Run `/design` for a review before you open a PR on visual work.
3. Render every screen at 390px and look at it. Reading the diff does not count.
