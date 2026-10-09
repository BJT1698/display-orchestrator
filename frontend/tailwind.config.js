/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Archivo Variable"', 'Archivo', 'system-ui', 'sans-serif'],
      },
      // Console palette: color is reserved for state (tally), structure stays graphite.
      colors: {
        ground: '#16181C',
        surface: '#1E2126',
        raised: '#262A30',
        line: '#33383F',
        'line-strong': '#454B53',
        ink: '#E6E8EB',
        muted: '#9AA1AB',
        faint: '#6B727C',
        live: '#3FB37F',
        caution: '#D9A441',
        alert: '#E5484D',
      },
      borderRadius: {
        none: '0',
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.35rem' }],
        lg: ['1.0625rem', { lineHeight: '1.5rem' }],
        xl: ['1.375rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.75rem', { lineHeight: '2.1rem' }],
        '3xl': ['2.5rem', { lineHeight: '2.75rem' }],
      },
    },
  },
  plugins: [],
}
