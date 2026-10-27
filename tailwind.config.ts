import type { Config } from "tailwindcss";

// Tailwind reads the shared CSS tokens in src/app/globals.css — do not add raw hex values here.
// Source of truth: docs/THEME-AND-TYPOGRAPHY.md
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "var(--color-brand)",
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          active: "var(--color-primary-active)",
          subtle: "var(--color-primary-subtle)",
        },
        "on-primary": "var(--color-on-primary)",
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        text: "var(--color-text)",
        muted: "var(--color-text-muted)",
        "border-subtle": "var(--color-border-subtle)",
        "border-control": "var(--color-border-control)",
        success: { DEFAULT: "var(--color-success)", subtle: "var(--color-success-subtle)" },
        warning: { DEFAULT: "var(--color-warning)", subtle: "var(--color-warning-subtle)" },
        danger: { DEFAULT: "var(--color-danger)", subtle: "var(--color-danger-subtle)" },
      },
      fontFamily: {
        sans: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        control: "var(--radius-control)",
        card: "var(--radius-card)",
      },
      boxShadow: {
        surface: "var(--shadow-surface)",
      },
    },
  },
  plugins: [],
};

export default config;
