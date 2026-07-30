/**
 * Bundles the real Extension Host test entry while leaving VS Code external.
 */

import { defineConfig } from "tsup";

/** Produces the CommonJS test module loaded by VS Code's Extension Host. */
export default defineConfig({
  entry: ["tests/extensionHost/suite/index.ts"],
  tsconfig: "tsconfig.node.json",
  format: ["cjs"],
  platform: "node",
  outDir: "dist/extension-tests/suite",
  external: ["vscode"],
  noExternal: ["@noble/hashes"],
});
