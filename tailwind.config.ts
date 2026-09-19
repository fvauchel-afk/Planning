import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        mds: {
          blue: "#2a5790",
          "blue-dark": "#21436e",
          steel: "#6d6d6d",
          ink: "#1a1a1a",
          page: "#f6f7f9",
          line: "#e6e8ec",
          mist: "#e8eef5",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Segoe UI", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
