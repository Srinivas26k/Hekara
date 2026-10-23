import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  plugins: [solid()],
  build: { outDir: fileURLToPath(new URL("../public", import.meta.url)), emptyOutDir: true, target: "es2022", sourcemap: false, assetsInlineLimit: 0 },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3000" } },
});
