import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#020617',
        },
      },
      boxShadow: {
        glass: '0 20px 80px rgba(15, 23, 42, 0.35)',
      },
    },
  },
  plugins: [],
} satisfies Config;
