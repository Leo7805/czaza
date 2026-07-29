/**
 * Tests deterministic initialization of project-local Architecture Notes.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type * as vscode from "vscode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rootDirectory: "",
  outputDirectory: ".czaza",
}));

vi.mock("@vscode/config/czazaSettings", () => ({
  getCzazaSettings: () => ({
    outputDirectory: mocks.outputDirectory,
  }),
}));

vi.mock("@vscode/config/resolveCzazaRootDirectory", () => ({
  resolveCzazaRootDirectory: () => ({
    rootDirectory: mocks.rootDirectory,
  }),
}));

import { initializeArchitectureNotesService } from "@vscode/services/architectureNotes/initializeArchitectureNotesService";

describe("initializeArchitectureNotesService()", () => {
  let temporaryDirectory: string;
  let extensionDirectory: string;
  let workspaceDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "czaza-architecture-notes-"));
    extensionDirectory = path.join(temporaryDirectory, "extension");
    workspaceDirectory = path.join(temporaryDirectory, "workspace");
    mocks.rootDirectory = workspaceDirectory;
    mocks.outputDirectory = ".czaza";

    await mkdir(path.join(extensionDirectory, "resources", "architecture-notes"), {
      recursive: true,
    });
    await mkdir(workspaceDirectory, { recursive: true });
    await writeTemplate(extensionDirectory, "AI_CONTEXT.md", "# AI Context\n");
    await writeTemplate(extensionDirectory, "README.md", "# Architecture Notes\n");
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("creates architecture directories and copies missing templates", async () => {
    const result = await initializeArchitectureNotesService({
      extensionUri: createFileUri(extensionDirectory),
    });

    const architectureDirectory = path.join(workspaceDirectory, ".czaza", "architecture-notes");
    expect(result).toEqual({
      kind: "initialized",
      architectureNotesDirectory: architectureDirectory,
    });
    expect(await readFile(path.join(architectureDirectory, "AI_CONTEXT.md"), "utf8")).toBe(
      "# AI Context\n",
    );
    expect(await readFile(path.join(architectureDirectory, "README.md"), "utf8")).toBe(
      "# Architecture Notes\n",
    );
    await expect(
      readFile(path.join(architectureDirectory, "diagrams", "missing.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves existing user files during repeated initialization", async () => {
    const architectureDirectory = path.join(workspaceDirectory, ".czaza", "architecture-notes");
    await mkdir(architectureDirectory, { recursive: true });
    await writeFile(path.join(architectureDirectory, "AI_CONTEXT.md"), "# User Context\n", "utf8");

    await initializeArchitectureNotesService({
      extensionUri: createFileUri(extensionDirectory),
    });
    await initializeArchitectureNotesService({
      extensionUri: createFileUri(extensionDirectory),
    });

    expect(await readFile(path.join(architectureDirectory, "AI_CONTEXT.md"), "utf8")).toBe(
      "# User Context\n",
    );
  });

  it("skips activation initialization when the output directory is missing", async () => {
    const result = await initializeArchitectureNotesService({
      extensionUri: createFileUri(extensionDirectory),
      requireExistingOutputDirectory: true,
    });

    expect(result).toEqual({ kind: "skipped", reason: "outputDirectoryMissing" });
    await expect(
      readFile(
        path.join(workspaceDirectory, ".czaza", "architecture-notes", "AI_CONTEXT.md"),
        "utf8",
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses the configured output directory", async () => {
    mocks.outputDirectory = "private-notes";

    const result = await initializeArchitectureNotesService({
      extensionUri: createFileUri(extensionDirectory),
    });

    expect(result).toEqual({
      kind: "initialized",
      architectureNotesDirectory: path.join(
        workspaceDirectory,
        "private-notes",
        "architecture-notes",
      ),
    });
  });

  it("reports a missing bundled template", async () => {
    await rm(
      path.join(extensionDirectory, "resources", "architecture-notes", "README.md"),
    );

    await expect(
      initializeArchitectureNotesService({
        extensionUri: createFileUri(extensionDirectory),
      }),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

/**
 * Writes one bundled template fixture.
 *
 * @param extensionDirectory - Temporary extension installation path.
 * @param fileName - Template file name.
 * @param content - Template fixture content.
 * @returns Promise resolved after writing the template.
 */
async function writeTemplate(
  extensionDirectory: string,
  fileName: string,
  content: string,
): Promise<void> {
  await writeFile(
    path.join(extensionDirectory, "resources", "architecture-notes", fileName),
    content,
    "utf8",
  );
}

/**
 * Creates the minimal local-file URI needed by the initialization service.
 *
 * @param fsPath - Absolute local file-system path.
 * @returns File URI-shaped test object.
 */
function createFileUri(fsPath: string): vscode.Uri {
  return { fsPath } as vscode.Uri;
}
