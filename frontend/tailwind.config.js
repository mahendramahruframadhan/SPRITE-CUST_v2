/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dfe9ff',
          200: '#c5d7ff',
          300: '#a2bcff',
          400: '#7d97fb',
          500: '#5f72f5',
          600: '#4a4fe9',
          700: '#3d3ece',
          800: '#3336a6',
          900: '#2f3383',
          950: '#1c1e4e',
        },
      },
      keyframes: {
        fadeIn: {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn .4s ease both',
        'fade-in-fast': 'fadeIn .3s ease both',
      },
    },
  },
  plugins: [],
};
