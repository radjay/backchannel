/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a',
        surface: '#0b1224',
        border: '#1e293b',
        'border-hover': '#334155',
        'border-active': '#475569',
        'text-primary': '#e2e8f0',
        'text-secondary': '#cbd5e1',
        'text-muted': '#94a3b8',
        'text-dim': '#64748b',
        error: '#f87171',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
