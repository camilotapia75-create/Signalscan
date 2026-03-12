import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-lottery": "linear-gradient(135deg, #9333ea 0%, #ec4899 50%, #f97316 100%)",
      },
      colors: {
        lottery: {
          purple: "#9333ea",
          pink: "#ec4899",
          orange: "#f97316",
        },
      },
    },
  },
  plugins: [],
};
export default config;
