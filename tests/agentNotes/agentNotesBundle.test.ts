/**
 * Verifies the standalone Agent Notes CLI bundle can run without tsx or source aliases.
 */

import path from "node:path";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const cliPath = path.join(workspaceRoot, "dist", "agent-notes", "cli.js");

describe("Agent Notes CLI bundle", () => {
  it("runs the bundled inspect command with stdin JSON", async () => {
    const result = await runBundle("inspect", {
      workspaceRoot,
      outputDirectory: ".czaza",
      location: { kind: "team" },
      sourcePaths: ["src/does-not-exist.ts"],
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      owner: { kind: "team", label: "Team Notes" },
      files: [],
      skipped: [{ sourcePath: "src/does-not-exist.ts", reason: "sourceMissing" }],
    });
    expect(result.stderr).toBe("");
  });
});

/** Runs the built CLI with one JSON object on stdin and captures process output. */
function runBundle(command: string, input: unknown): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, command], {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}
