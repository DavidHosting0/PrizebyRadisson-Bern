import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        mist: '#f1f5f9',
        accent: '#0d9488',
        warn: '#ea580c',
      },
    },
  },
  plugins: [],
};

export default config;
