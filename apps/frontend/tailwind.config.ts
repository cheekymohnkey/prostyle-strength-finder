import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17212f",
        muted: "#5f6f84",
        surface: "#ffffff",
        line: "#d7dfeb",
      },
    },
  },
  plugins: [],
};

export default config;
