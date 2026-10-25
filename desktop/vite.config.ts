// SPDX-License-Identifier: AGPL-3.0-only
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In browser dev mode the local FCC server is proxied so requests are same-origin.
const fcc = process.env.FCC_URL ?? "http://127.0.0.1:8082";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: { "/admin/api": { target: fcc, changeOrigin: true } , "/health": { target: fcc, changeOrigin: true }, "/openapi.json": { target: fcc, changeOrigin: true } },
  },
  build: { target: "es2022", outDir: "dist" },
});
