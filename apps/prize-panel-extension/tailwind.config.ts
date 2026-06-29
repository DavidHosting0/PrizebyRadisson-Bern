import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        surface: '#FAFAF9',
        'surface-muted': '#F4F4F2',
        ink: '#1E293B',
        'ink-muted': '#64748B',
        border: '#E2E8F0',
        accent: '#1E293B',
        sidebar: '#1A2332',
        'sidebar-hover': '#243044',
        'sidebar-muted': '#94A3B8',
        'sidebar-border': '#2D3A4F',
        'sidebar-active': 'rgba(255, 255, 255, 0.08)',
        success: '#3D9A6A',
        'success-muted': '#E8F5EE',
        danger: '#C45C5C',
        'danger-muted': '#FCEEED',
        warning: '#C98A32',
        'warning-muted': '#FDF6E8',
        action: '#3B6FA0',
        'action-muted': '#EDF3F8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        btn: '10px',
        panel: '20px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(26, 35, 50, 0.04), 0 4px 12px rgba(26, 35, 50, 0.04)',
        lift: '0 8px 32px rgba(26, 35, 50, 0.1)',
        sidebar: '2px 0 12px rgba(26, 35, 50, 0.06)',
      },
      transitionDuration: {
        tap: '150ms',
        panel: '200ms',
      },
      transitionTimingFunction: {
        panel: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
