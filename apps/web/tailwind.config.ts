import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#FFFFFF',
        'surface-muted': '#F5F5F5',
        ink: '#2B2B2B',
        'ink-muted': '#6B6B6B',
        border: '#E8E8E8',
        accent: '#2B2B2B',
        success: '#3D9A6A',
        'success-muted': '#E8F5EE',
        danger: '#C45C5C',
        'danger-muted': '#FCEEED',
        warning: '#C98A32',
        'warning-muted': '#FDF6E8',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '10px',
        btn: '10px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(43, 43, 43, 0.06)',
        lift: '0 4px 24px rgba(43, 43, 43, 0.08)',
      },
      transitionDuration: {
        tap: '150ms',
      },
    },
  },
  plugins: [],
};

export default config;
