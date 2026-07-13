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
});
