// Midabada waxay ka yimaadaan CSS variables (src/index.css) si Light/Dark u beddelmaan.
// Qaabkan function-ka ah wuxuu shaqeeyaa dhammaan Tailwind v3.x (opacity modifiers sida bg-surface/60 ayuu taageeraa).
const v = (name) => ({ opacityValue }) =>
  opacityValue === undefined ? `rgb(var(--${name}))` : `rgb(var(--${name}) / ${opacityValue})`

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        card: v('card'),
        surface: v('surface'),
        border: v('border'),
        text: {
          primary: v('text-primary'),
          secondary: v('text-secondary'),
          muted: v('text-muted'),
        },
        brand: {
          DEFAULT: v('brand'),
          secondary: v('brand-secondary'),
        },
        success: v('success'),
        danger: v('danger'),
        warning: v('warning'),
        ai: v('ai'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontFeatureSettings: {
        tabular: '"tnum" 1, "cv02" 1',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(17, 24, 39, 0.04), 0 1px 3px 0 rgba(17, 24, 39, 0.04)',
        popover: '0 8px 24px -4px rgba(17, 24, 39, 0.12)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'slide-up': { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}