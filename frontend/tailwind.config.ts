import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        apex: {
          green: "#00E676", // Kripto Strong Buy Yeşili
          red: "#FF1744",   // Kripto Strong Sell Kırmızısı
          dark: "#0F172A",  // Slate-900 (Bloomberg/Quant Koyu Tema)
          card: "#1E293B",  // Slate-800
        }
      },
    },
  },
  plugins: [],
};
export default config;