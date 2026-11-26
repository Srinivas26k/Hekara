import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://srinivas26k.github.io",
  base: "/Hekara/",
  integrations: [],
  output: "static",
  vite: {
    ssr: {
      external: ["node:fs", "node:path"],
    },
  },
});
