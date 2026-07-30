/**
 * Launches CZaza's isolated real VS Code Extension Host regression suite.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { runTests } from "@vscode/test-electron";

/**
 * Builds a temporary workspace and launches the real Extension Host test entry.
 *
 * @returns Promise resolved when the Extension Host exits successfully.
 */
async function main(): Promise<void> {
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "czaza-extension-host-"),
  );
  const workspacePath = path.join(temporaryRoot, "workspace");
  const userDataPath = path.join(temporaryRoot, "user-data");
  const extensionsPath = path.join(temporaryRoot, "extensions");
  const inheritedElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE;

  try {
    delete process.env.ELECTRON_RUN_AS_NODE;
    await mkdir(workspacePath, { recursive: true });
    await writeFile(
      path.join(temporaryRoot, "czaza-extension-host.code-workspace"),
      JSON.stringify({
        folders: [{ path: workspacePath }],
        settings: {
          "czaza.rootDirectory": "",
          "czaza.outputDirectory": ".czaza",
        },
      }),
      "utf8",
    );

    await runTests({
      version: "1.100.0",
      extensionDevelopmentPath: projectRoot,
      extensionTestsPath: path.join(
        projectRoot,
        "dist/extension-tests/suite/index.cjs",
      ),
      launchArgs: [
        path.join(temporaryRoot, "czaza-extension-host.code-workspace"),
        "--disable-extensions",
        "--disable-workspace-trust",
        `--user-data-dir=${userDataPath}`,
        `--extensions-dir=${extensionsPath}`,
      ],
    });
  } finally {
    if (inheritedElectronRunAsNode === undefined) {
      delete process.env.ELECTRON_RUN_AS_NODE;
    } else {
      process.env.ELECTRON_RUN_AS_NODE = inheritedElectronRunAsNode;
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error("CZaza Extension Host tests failed.", error);
  process.exitCode = 1;
});
