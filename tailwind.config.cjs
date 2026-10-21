module.exports = {
  content: ['./index.html', './assets/js/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: { brand: { 50: '#f0fdf4', 900: '#14532d' }, slate: { 700: '#475569', 800: '#334155', 900: '#1e293b', 950: '#0f172a' } },
      animation: { 'fade-in': 'fadeIn 0.2s ease-out', 'pulse-soft': 'pulseSoft 2s infinite' },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } }
      }
    }
  }
};
