import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api requests are proxied to the Express server.
// In Docker the compose file sets VITE_PROXY_TARGET=http://server:5000.
const target = process.env.VITE_PROXY_TARGET || "http://localhost:5000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { "/api": target },
  },
  preview: {
    port: 3000,
    proxy: { "/api": target },
  },
});
