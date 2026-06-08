/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        surface: {
          0: '#0a0a0b',
          1: '#111113',
          2: '#18181c',
          3: '#222228',
          4: '#2c2c34',
        },
        claw: {
          50: '#fff7e6',
          100: '#ffeacc',
          200: '#ffd199',
          300: '#ffb866',
          400: '#ff9933',
          500: '#ff7c00',
          600: '#cc6300',
          700: '#994a00',
          800: '#663200',
          900: '#331900',
        },
        accent: '#ff7c00',
        muted: '#52525e',
        border: '#2a2a32',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        slideIn: { from: { transform: 'translateY(8px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
      },
    },
  },
  plugins: [],
};
