import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const target = `http://127.0.0.1:${process.env.GUARDIAN_PORT ?? 7070}`;

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": target,
      "/ws": { target: target.replace("http", "ws"), ws: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
