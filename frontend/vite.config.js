import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The MediaPipe face detector for the owner selfie (owner decision 2026-09-24)
// is served from our own /mediapipe/, not a CDN, and only loads when the camera
// opens. It sits outside assets/, so it doesn't count toward the bundle budget.
const MEDIAPIPE_FILES = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];
const mediapipeFile = (name) => fileURLToPath(new URL(`./node_modules/@mediapipe/tasks-vision/wasm/${name}`, import.meta.url));
function mediapipeWasm() {
  return {
    name: "mediapipe-wasm",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/^\/mediapipe\/([\w.]+)$/)?.[1];
        if (!MEDIAPIPE_FILES.includes(name)) return next();
        res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        res.end(readFileSync(mediapipeFile(name)));
      });
    },
    generateBundle() {
      for (const name of MEDIAPIPE_FILES) this.emitFile({ type: "asset", fileName: `mediapipe/${name}`, source: readFileSync(mediapipeFile(name)) });
    },
  };
}

export default defineConfig({
  plugins: [react(), mediapipeWasm()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/uploads": "http://localhost:4000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/react-router-dom") || id.includes("node_modules/react-router")) {
            return "vendor-router";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
        },
      },
    },
  },
});
