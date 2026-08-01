/** @type {import('tailwindcss').Config} */
//
// ON THE HOUSE DESIGN SYSTEM. Every colour below is a house token from
// src/app/design/tokens.css (a vendored copy of design-system/tokens.css — drift fails
// the fleet gate). The utility NAMES are unchanged, so every existing
// `bg-surface-card` / `text-muted` class keeps working and only the VALUES moved.
//
// To change a colour or a size, change the SYSTEM and re-run:
//   node /root/projects/design-system/scripts/vendor-tokens.mjs
//
module.exports = {
  content: ['./src/**/*.{js,jsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--accent)',
        'brand-light': 'var(--accent-hover)',
        surface: {
          primary: 'var(--bg)',
          secondary: 'var(--surface)',
          tertiary: 'var(--surface-2)',
          card: 'var(--surface)',
          hover: 'var(--surface-3)',
        },
        border: 'var(--border)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        muted: 'var(--text-muted)',
        'text-primary': 'var(--text)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderColor: {
        DEFAULT: 'var(--border)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius-md)',
      },
      minHeight: {
        tap: 'var(--tap-min)',
      },
    },
  },
  plugins: [],
}
