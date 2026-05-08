import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Poppins', 'sans-serif'] },
      colors: {
        lavender: {
          50:  '#faf8ff',
          100: '#f3efff',
          200: '#e9e3ff',
          300: '#d4c9ff',
          400: '#b8a8f8',
          500: '#9b87f5',
          600: '#7c5fe6',
          700: '#6344cc',
          800: '#4e33a8',
          900: '#3b2680',
        },
      },
      boxShadow: {
        soft: '0 4px 24px rgba(155,135,245,0.15)',
        card: '0 2px 16px rgba(155,135,245,0.12)',
        glow: '0 0 32px rgba(155,135,245,0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
