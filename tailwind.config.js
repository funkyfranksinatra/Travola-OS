/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // MesaOS Midnight Palette
        bg: '#0a0a0c',
        panel: '#121216',
        ai: '#00f2ff', // Cyan accent
        'ai-muted': 'rgba(0, 242, 255, 0.1)',
        state: {
          avail: '#10b981',      // Emerald
          availBg: 'rgba(16, 185, 129, 0.1)',
          seated: '#ef4444',     // Rose
          seatedBg: 'rgba(239, 68, 68, 0.1)',
          reserved: '#8b5cf6',   // Violet
          reservedBg: 'rgba(139, 92, 246, 0.1)',
        }
      },
      animation: {
        'ai-pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}