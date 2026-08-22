/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1B1A17",
        paper: "#FFFFFF",
        mist: "#F8F7F4",
        canvas: "#FAF9F6",
        gold: { DEFAULT: "#E8A33D", deep: "#C9821E", light: "#FEF7EC" },
        genda: { DEFAULT: "#E8A33D", deep: "#C9821E", light: "#FEF7EC" },
        paan: { DEFAULT: "#15803D", light: "#DCFCE7" },
        coral: { DEFAULT: "#E05D44", light: "#FEF2F0" },
        line: "#E6E2D8",
        warm: {
          50: "#FAF9F6",
          100: "#F5F3ED",
          200: "#EAE6DB",
          300: "#D8D2C2",
          400: "#B8B09D",
          500: "#8C8472",
          600: "#686151",
          700: "#4D473B",
          800: "#322E26",
          900: "#1C1A16",
        }
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Manrope", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      borderRadius: {
        ticket: "18px",
      },
    },
  },
  plugins: [],
};
