import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0B1F4B',
          800: '#11295D',
          700: '#1B3A78',
        },
        brand: {
          indigo: '#3B4FE0',
          'indigo-dark': '#2E3EB5',
          pink: '#E91E7B',
          teal: '#12B39A',
          amber: '#F59E0B',
          red: '#EF4444',
          gray: '#6B7590',
        },
      },
    },
  },
  plugins: [],
};

export default config;

