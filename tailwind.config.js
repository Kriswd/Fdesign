/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'apple-gray': '#F5F5F7',
        'apple-white': '#FFFFFF',
        'apple-blue': '#007AFF',
        'apple-green': '#34C759',
        'apple-orange': '#FF9500',
        'apple-red': '#FF3B30',
        'apple-purple': '#AF52DE',
      },
      boxShadow: {
        'apple': '0 4px 24px rgba(0, 0, 0, 0.06)',
        'apple-hover': '0 8px 32px rgba(0, 0, 0, 0.1)',
      },
      borderRadius: {
        'apple': '1.5rem',
      },
    },
  },
  plugins: [],
}
