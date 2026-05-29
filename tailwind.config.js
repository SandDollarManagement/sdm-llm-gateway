/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: '#6366f1',
        'brand-light': '#818cf8',
        surface: {
          primary: '#0f1117',
          secondary: '#181b24',
          tertiary: '#1e2231',
          card: '#1a1d28',
          hover: '#252a38',
        },
        border: '#2a2f42',
        success: '#10b981',
        danger: '#f43f5e',
        warning: '#f59e0b',
        muted: '#8b92a8',
        'text-primary': '#f1f3f9',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderColor: {
        DEFAULT: '#2a2f42',
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
}
