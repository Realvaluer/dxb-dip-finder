/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0D2B2B',
        card: '#122E2E',
        accent: '#1D9E75',
        muted: 'rgba(255,255,255,0.5)',
        border: 'rgba(255,255,255,0.08)',
        'dip-red': '#E24B4A',
        'dip-orange': '#D85A30',
        'dip-amber': '#EF9F27',
      },
    },
  },
  plugins: [],
};
