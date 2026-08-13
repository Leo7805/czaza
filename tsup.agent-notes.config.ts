/**
 * Bundles the Agent Notes CLI as a self-contained Node executable for VSIX distribution.
 */

import { defineConfig } from "tsup";

/** Produces the standalone ESM CLI included with the packaged extension. */
export default defineConfig({
  entry: { cli: "vscode/agentNotes/agentNotesCli.ts" },
  tsconfig: "tsconfig.node.json",
  format: ["esm"],
  platform: "node",
  target: "node18",
  outDir: "dist/agent-notes",
  noExternal: ["@noble/hashes"],
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
