/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Theme: "Registry" - deep ink shell, harbour-teal actions, brass rule for emphasis.
      // `gray` and `blue` are remapped so every existing screen picks up the palette;
      // risk colours (red/orange/yellow/green) stay untouched because they carry meaning.
      colors: {
        gray: {
          50: '#F4F7F9',
          100: '#E8EEF2',
          200: '#D5DEE5',
          300: '#B7C4CF',
          400: '#8A9BA9',
          500: '#5E7080',
          600: '#475A6A',
          700: '#33444F',
          800: '#1E3140',
          900: '#0F2231',
          950: '#091621',
        },
        blue: {
          50: '#ECF6F6',
          100: '#D3EBEB',
          200: '#A9D6D7',
          300: '#78BBBD',
          400: '#45999D',
          500: '#2A7E84',
          600: '#1F666D',
          700: '#1B535A',
          800: '#17434A',
          900: '#12353B',
        },
        brass: {
          300: '#E3C98F',
          400: '#D2AE62',
          500: '#B8893B',
          600: '#96702D',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
