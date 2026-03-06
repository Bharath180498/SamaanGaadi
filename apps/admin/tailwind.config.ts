import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sora: ['Avenir Next', 'Avenir', 'Segoe UI', 'sans-serif'],
        manrope: ['Helvetica Neue', 'Arial', 'sans-serif']
      },
      colors: {
        brand: {
          primary: '#F97316',
          secondary: '#0F766E',
          accent: '#0F172A',
          paper: '#FFF8F1',
          card: '#FFF7ED'
        }
      },
      boxShadow: {
        soft: '0 20px 45px rgba(124, 45, 18, 0.12)'
      }
    }
  },
  plugins: []
};

export default config;
