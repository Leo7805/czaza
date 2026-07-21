import { defineConfig } from "tsup";

/** Produces a self-contained VS Code extension bundle with only VS Code externalized. */
export default defineConfig({
  entry: ["vscode/extension.ts"],
  tsconfig: "tsconfig.node.json",
  format: ["cjs"],
  platform: "node",
  outDir: "dist/vscode",
  external: ["vscode"],
  noExternal: ["@noble/hashes"],
});
