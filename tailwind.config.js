/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
        },
        brand: {
          blue: '#2563EB',
          'blue-hover': '#1D4ED8',
          'blue-light': '#EFF6FF',
        },
        surface: {
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
          muted: '#F1F5F9',
        },
        content: {
          primary: '#0F172A',
          secondary: '#475569',
          muted: '#64748B',
        },
        status: {
          success: '#059669',
          'success-bg': '#ECFDF5',
          warning: '#D97706',
          'warning-bg': '#FFFBEB',
          critical: '#DC2626',
          'critical-bg': '#FEF2F2',
        }
      },
      boxShadow: {
        'saas': '0 1px 2px rgba(15,23,42,0.03), 0 6px 18px rgba(15,23,42,0.04)',
      },
      fontFamily: {
        heading: ['Manrope', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
