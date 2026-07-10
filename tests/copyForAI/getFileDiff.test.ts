/**
 * Integration tests for retrieving the Git diff of a selected file.
 *
 * Each test creates an isolated temporary directory and, when needed,
 * initializes a real Git repository inside it. This verifies the actual
 * Git commands without modifying the CZaza repository.
 */

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getFileDiff } from "@vscode/copyForAI/getFileDiff";

const execFileAsync = promisify(execFile);

let temporaryDirectory: string;

/**
 * Runs a Git command inside the specified directory.
 */
async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

/**
 * Writes a file relative to the current temporary test directory.
 */
async function writeTestFile(relativePath: string, contents: string): Promise<string> {
  const absolutePath = path.join(temporaryDirectory, relativePath);

  await mkdir(path.dirname(absolutePath), {
    recursive: true,
  });

  await writeFile(absolutePath, contents, "utf8");

  return absolutePath;
}

/**
 * Initializes a Git repository in the current temporary directory.
 */
async function initializeRepository(): Promise<void> {
  await runGit(temporaryDirectory, ["init", "--quiet"]);
}

/**
 * Creates and commits a file to establish the repository's HEAD commit.
 */
async function createCommittedFile(relativePath: string, contents: string): Promise<string> {
  const absolutePath = await writeTestFile(relativePath, contents);

  await runGit(temporaryDirectory, ["add", "--", relativePath]);

  await runGit(temporaryDirectory, [
    "-c",
    "user.name=CZaza Test",
    "-c",
    "user.email=czaza-test@example.com",
    "commit",
    "--quiet",
    "-m",
    "Initial test commit",
  ]);

  return absolutePath;
}

describe("getFileDiff()", () => {
  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "czaza-git-diff-"));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  });

  it("identifies a file outside a Git repository", async () => {
    const filePath = await writeTestFile("Button.tsx", "export function Button() {}\n");

    const result = await getFileDiff(filePath);

    expect(result).toEqual({
      kind: "notGitRepository",
    });

    console.info("✅ getFileDiff: identified a file outside a Git repository.");
  });

  it("identifies a repository without a HEAD commit", async () => {
    await initializeRepository();

    const filePath = await writeTestFile("Button.tsx", "export function Button() {}\n");

    const result = await getFileDiff(filePath);

    expect(result.kind).toBe("noHead");

    if (result.kind === "noHead") {
      expect(result.relativePath).toBe("Button.tsx");
    }

    console.info("✅ getFileDiff: identified a repository without its first commit.");
  });

  it("identifies an untracked file", async () => {
    await initializeRepository();

    await createCommittedFile("README.md", "# CZaza test repository\n");

    const filePath = await writeTestFile("Sidebar.tsx", "export function Sidebar() {}\n");

    const result = await getFileDiff(filePath);

    expect(result.kind).toBe("untracked");

    if (result.kind === "untracked") {
      expect(result.relativePath).toBe("Sidebar.tsx");
    }

    console.info("✅ getFileDiff: identified an untracked file.");
  });

  it("identifies a tracked file with no changes", async () => {
    await initializeRepository();

    const filePath = await createCommittedFile("src/Button.tsx", "export const value = 1;\n");

    const result = await getFileDiff(filePath);

    expect(result.kind).toBe("noChanges");

    if (result.kind === "noChanges") {
      expect(result.relativePath).toBe("src/Button.tsx");
    }

    console.info("✅ getFileDiff: identified a tracked file with no changes.");
  });

  it("returns both staged and unstaged changes compared with HEAD", async () => {
    await initializeRepository();

    const relativePath = "src/Button.tsx";

    const filePath = await createCommittedFile(relativePath, "export const value = 1;\n");

    // Create a staged change.
    await writeTestFile(relativePath, "export const value = 2;\n");

    await runGit(temporaryDirectory, ["add", "--", relativePath]);

    // Add another change without staging it.
    await writeTestFile(
      relativePath,
      ["export const value = 2;", 'export const label = "unstaged";', ""].join("\n"),
    );

    const result = await getFileDiff(filePath);

    expect(result.kind).toBe("diff");

    if (result.kind === "diff") {
      expect(result.relativePath).toBe(relativePath);

      expect(result.diff).toContain("+export const value = 2;");

      expect(result.diff).toContain('+export const label = "unstaged";');
    }

    console.info("✅ getFileDiff: returned staged and unstaged changes compared with HEAD.");
  });
});
