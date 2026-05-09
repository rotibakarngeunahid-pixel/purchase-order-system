/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#D32F2F',
          orange: '#FF6F00',
          yellow: '#FFC107',
          white: '#FFFFFF',
          dark: '#1A1A1A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Poppins', 'DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
