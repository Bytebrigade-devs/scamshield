import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#0F172A",
          deep: "#080e1a",
          surface: "#0e1726",
          card: "#13203a",
          border: "#1f2d45",
          teal: "#0F766E",
          accent: "#2DD4BF",
          accentHover: "#5EEAD4",
          success: "#34D399",
          warning: "#F59E0B",
          danger: "#F06A6A",
          text: "#EAF1F7",
          muted: "#8EA0B3",
        },
      },
    },
  },
  plugins: [],
};

export default config;
