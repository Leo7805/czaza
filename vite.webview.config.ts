import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: "vscode/webview-ui",
  base: "./",
  plugins: [react()],
  publicDir: false,
  resolve: {
    alias: {
      "@webview": fileURLToPath(new URL("./vscode/webview-ui/src", import.meta.url)),
    },
  },
  build: {
    outDir: "../../dist/webview",
    emptyOutDir: true,
  },
});
