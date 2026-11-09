/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.08)',
      },
      colors: {
        primary: {
          50: '#eef7ff',
          100: '#d9efff',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e3a8a',
        },
        accent: {
          500: '#14b8a6',
        },
      },
    },
  },
  plugins: [],
};
