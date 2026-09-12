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
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        "glow-gold": "0 0 20px rgba(245,158,11,0.35), 0 0 60px rgba(245,158,11,0.12)",
        "glow-sm": "0 0 12px rgba(245,158,11,0.25)",
        "card": "0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.05)",
        "card-hover": "0 16px 40px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.07)",
        "navbar": "0 4px 24px rgba(0,0,0,0.08)",
        "xl-soft": "0 20px 60px rgba(0,0,0,0.12)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "reveal-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "reveal-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(245,158,11,0.4)" },
          "50%": { boxShadow: "0 0 0 10px rgba(245,158,11,0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "marquee": {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "count-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        "reveal-up": "reveal-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        "reveal-in": "reveal-in 0.5s cubic-bezier(0.16,1,0.3,1) both",
        float: "float 4s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.4s ease both",
        marquee: "marquee 20s linear infinite",
        "spin-slow": "spin-slow 3s linear infinite",
        "count-up": "count-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
