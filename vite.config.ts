import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  build: {
    target: "es2022",
    sourcemap: false,
  },
  server: {
    host: true,
  },
});
