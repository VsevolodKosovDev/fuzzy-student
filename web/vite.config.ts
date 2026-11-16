import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // В разработке берём исходники библиотеки напрямую (горячая перезагрузка).
    alias: {
      "fuzzy-lib": fileURLToPath(new URL("../packages/fuzzy-lib/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
