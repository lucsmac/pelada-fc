/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        bg: '#0B0D10',
        'nav-bg': '#0E1013',
        panel: '#14171C',
        'panel-2': '#1B1F26',
        border: '#21252C',
        'border-strong': '#262B32',
        text: '#F4F5F6',
        'text-secondary': '#8A929D',
        'text-tertiary': '#5C6470',
        accent: '#C7F23E',
        dourado: '#F2A93C',
        ciano: '#4FD1FF',
        coral: '#FF6B6B',
      },
      fontFamily: {
        display: ['Anton', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0',
        none: '0',
      },
      maxWidth: {
        container: '1312px',
      },
    },
  },
};
