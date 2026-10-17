import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const target = `http://127.0.0.1:${process.env.GUARDIAN_PORT ?? 7070}`;
const gateway = `http://127.0.0.1:${process.env.PUBLIC_PORT ?? 7072}`;
const page = (f: string) => fileURLToPath(new URL(f, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/security-tests.json": target,
      "/api": target,
      "/ws": { target: target.replace("http", "ws"), ws: true },
      "/public/api": gateway,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // index.html: yerel yönetim arayüzü (token'lı). public.html: herkese açık kanıt paneli (servis kapısı).
    rollupOptions: { input: { main: page("index.html"), public: page("public.html") } },
  },
});
