import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#13262C", soft: "#3D5157", muted: "#5B6B70", faint: "#8A989C" },
        petrol: { 50: "#EAF3F4", 100: "#D3E6E8", 200: "#A9CDD2", 500: "#16707F", 600: "#0E5563", 700: "#0B4652", 800: "#093944" },
        paper: { DEFAULT: "#F4F6F5", deep: "#E9EDEC" },
        line: { DEFAULT: "#D6DEDD", strong: "#B9C6C5" },
        sim: { DEFAULT: "#2C7A57", bg: "#E7F2EC", line: "#B5D6C5" },
        nao: { DEFAULT: "#B03A35", bg: "#F8E9E8", line: "#E3BAB7" },
        inc: { DEFAULT: "#9A6210", bg: "#FBF2E2", line: "#E8CD9B" },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        sheet: "0 1px 0 rgba(19,38,44,0.04), 0 1px 3px rgba(19,38,44,0.06)",
        float: "0 8px 24px rgba(19,38,44,0.16), 0 2px 6px rgba(19,38,44,0.08)",
      },
      keyframes: {
        flash: { "0%": { backgroundColor: "rgba(14,85,99,0.35)" }, "100%": { backgroundColor: "rgba(14,85,99,0.12)" } },
        "pop-in": { "0%": { opacity: "0", transform: "translateY(4px) scale(0.98)" }, "100%": { opacity: "1", transform: "none" } },
        stamp: {
          "0%": { opacity: "0", transform: "scale(1.35) rotate(-14deg)" },
          "60%": { opacity: "1", transform: "scale(0.96) rotate(-7deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-8deg)" },
        },
      },
      animation: {
        flash: "flash 1.2s ease-out",
        "pop-in": "pop-in 140ms ease-out",
        stamp: "stamp 520ms cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
