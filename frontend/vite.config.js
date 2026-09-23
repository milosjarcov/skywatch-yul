import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Frontend calls /api/*; Vite forwards it to the FastAPI backend so the
    // browser never deals with cross-origin requests in development.
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  // MapLibre's worker is an ES module, so build it as one.
  worker: { format: "es" },
  build: {
    // MapLibre alone is about 1 MB minified. It already lives in lazy-loaded
    // chunks (see App.jsx, MapPage.jsx, and Landing.jsx), so the default 500 kB warning is noise.
    chunkSizeWarningLimit: 1400,
  },
});
