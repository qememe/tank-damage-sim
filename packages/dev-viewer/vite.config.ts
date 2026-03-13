import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  publicDir: resolve(packageRoot, "../../data"),
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    port: 4173
  }
});
