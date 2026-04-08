/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f6f1e7",
        paperDeep: "#efe7d4",
        ink: "#1a1814",
        inkSoft: "#3a352c",
        inkMute: "#6b6356",
        rule: "#d8cfb8",
        ochre: "#a8541c",
        ochreDeep: "#7a3a10",
        sage: "#586b4a",
        slateInk: "#2f3a3a",
      },
      fontFamily: {
        display: ['"Fraunces"', "ui-serif", "Georgia", "serif"],
        body: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        quote: ['"Fraunces"', "Georgia", "serif"],
      },
      letterSpacing: {
        tightish: "-0.01em",
        wideish: "0.08em",
      },
    },
  },
  plugins: [],
};
