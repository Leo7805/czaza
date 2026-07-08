import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@node": fileURLToPath(new URL("./node", import.meta.url)),
      "@tests": fileURLToPath(new URL("./tests", import.meta.url)),
      "@vscode": fileURLToPath(new URL("./vscode", import.meta.url)),
    },
  },
});
