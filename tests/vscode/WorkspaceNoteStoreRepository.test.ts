/**
 * Unit tests for the new workspace note store repository.
 */

import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  createWorkspaceNoteFileName,
  getWorkspaceNoteFilePath,
  getWorkspaceNoteIndexPath,
  isWorkspaceNoteIndexV1,
  WorkspaceNoteStoreRepository,
} from "@vscode/notes/WorkspaceNoteStoreRepository";

const now = "2026-07-13T00:00:00.000Z";
const outputDirectory = ".caca";
const firstRandomId = "fixed001";
const secondRandomId = "fixed002";

describe("WorkspaceNoteStoreRepository", () => {
  it("returns null when the store file does not exist", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => firstRandomId);

    expect(await repository.loadIndex(root, outputDirectory)).toBeNull();
  });

  it("saves and loads the workspace note index", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository();
    const index = {
      schemaVersion: 1 as const,
      updatedAt: now,
      workspaceRoot: root,
      files: {
        "src/index.ts": {
          noteFile: "files/abc123.json",
          sourceHash: "sha256:abc123",
          programmingLanguage: "typescript",
          updatedAt: now,
        },
      },
    };

    await repository.saveIndex(root, outputDirectory, index);

    const raw = await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8");
    const loaded = await repository.loadIndex(root, outputDirectory);

    console.log("Persisted notes index:", raw.trim());

    expect(raw.endsWith("\n")).toBe(true);
    expect(loaded).toEqual(index);
  });

  it("returns null when the store file is invalid JSON", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository();

    await writeRawStoreFile(root, "{not json");

    expect(await repository.loadIndex(root, outputDirectory)).toBeNull();
  });

  it("returns null when the store shape is invalid", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository();

    await writeRawStoreFile(root, `${JSON.stringify({ schemaVersion: 2, updatedAt: now, files: {} })}\n`);

    expect(await repository.loadIndex(root, outputDirectory)).toBeNull();
  });

  it("saves and reads one source file note JSON through the index", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => firstRandomId);
    const sourceFile = createStoredSourceFile();
    const expectedNoteFile = createWorkspaceNoteFileName("src/index.ts", firstRandomId);

    await repository.saveSourceFile(root, outputDirectory, "src/index.ts", sourceFile, now);

    const loaded = await repository.getSourceFile(root, outputDirectory, "src/index.ts");
    const index = await repository.loadIndex(root, outputDirectory);
    const noteRaw = await readFile(
      getWorkspaceNoteFilePath(root, outputDirectory, expectedNoteFile),
      "utf-8",
    );

    console.log("Persisted source note file:", noteRaw.trim());

    expect(getWorkspaceNoteIndexPath(root, outputDirectory)).toContain(`${outputDirectory}/notes/index.json`);
    expect(loaded).toEqual(sourceFile);
    expect(index).toEqual({
      schemaVersion: 1,
      updatedAt: now,
      workspaceRoot: root,
      files: {
        "src/index.ts": {
          noteFile: expectedNoteFile,
          sourceHash: "sha256:abc123",
          programmingLanguage: "typescript",
          updatedAt: now,
        },
      },
    });
  });

  it("preserves existing source file entries when saving one file", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(createSequentialRandomId([firstRandomId, secondRandomId]));
    const firstFile = createStoredSourceFile("sha256:first");
    const secondFile = createStoredSourceFile("sha256:second");

    await repository.saveIndex(root, outputDirectory, {
      schemaVersion: 1,
      updatedAt: "2026-07-12T00:00:00.000Z",
      workspaceRoot: root,
      files: {
        "src/first.ts": {
          noteFile: createWorkspaceNoteFileName("src/first.ts", firstRandomId),
          sourceHash: "sha256:first",
          programmingLanguage: "typescript",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
      },
    });
    await writeRawNoteFile(
      root,
      outputDirectory,
      createWorkspaceNoteFileName("src/first.ts", firstRandomId),
      `${JSON.stringify(firstFile)}\n`,
    );
    await repository.saveSourceFile(root, outputDirectory, "src/second.ts", secondFile, now);

    expect(await repository.loadIndex(root, outputDirectory)).toEqual({
      schemaVersion: 1,
      updatedAt: now,
      workspaceRoot: root,
      files: {
        "src/first.ts": {
          noteFile: createWorkspaceNoteFileName("src/first.ts", firstRandomId),
          sourceHash: "sha256:first",
          programmingLanguage: "typescript",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
        "src/second.ts": {
          noteFile: createWorkspaceNoteFileName("src/second.ts", firstRandomId),
          sourceHash: "sha256:second",
          programmingLanguage: "typescript",
          updatedAt: now,
        },
      },
    });
    expect(await repository.getSourceFile(root, outputDirectory, "src/first.ts")).toEqual(firstFile);
    expect(await repository.getSourceFile(root, outputDirectory, "src/second.ts")).toEqual(secondFile);
  });

  it("validates the top-level workspace note index shape", () => {
    expect(isWorkspaceNoteIndexV1({ schemaVersion: 1, updatedAt: now, files: {} })).toBe(true);
    expect(isWorkspaceNoteIndexV1({ schemaVersion: 1, files: {} })).toBe(false);
    expect(isWorkspaceNoteIndexV1({
      schemaVersion: 1,
      updatedAt: now,
      files: {
        "src/index.ts": {
          noteFile: "files/abc123.json",
          sourceHash: "sha256:abc123",
          updatedAt: now,
        },
      },
    })).toBe(true);
  });
});

/**
 * Creates a temporary workspace root for repository tests.
 *
 * @returns Temporary workspace root path.
 *
 * @example
 * const root = await createTempWorkspaceRoot();
 */
async function createTempWorkspaceRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "czaza-notes-"));
}

/**
 * Creates a minimal stored source-file fixture.
 *
 * @param sourceHash - Source hash to include in the fixture.
 * @returns Stored source-file fixture.
 *
 * @example
 * const file = createStoredSourceFile("sha256:abc123");
 */
function createStoredSourceFile(sourceHash = "sha256:abc123"): StoredSourceFile {
  return {
    source: {
      sourceHash,
      programmingLanguage: "typescript",
    },
    sectionNotes: [],
    lineNotes: [],
  };
}

/**
 * Writes raw content to the notes index file for invalid-file tests.
 *
 * @param root - Temporary workspace root path.
 * @param content - Raw file content to write.
 * @returns Promise that resolves after the file is written.
 *
 * @example
 * await writeRawStoreFile(root, "{not json");
 */
async function writeRawStoreFile(root: string, content: string): Promise<void> {
  const storePath = getWorkspaceNoteIndexPath(root, outputDirectory);

  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, content, "utf-8");
}

/**
 * Writes raw content to a per-file note JSON for repository tests.
 *
 * @param root - Temporary workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param noteFile - Note file path relative to the notes directory.
 * @param content - Raw file content to write.
 * @returns Promise that resolves after the file is written.
 *
 * @example
 * await writeRawNoteFile(root, ".caca", "files/abc123.json", "{}");
 */
async function writeRawNoteFile(
  root: string,
  outputDirectory: string,
  noteFile: string,
  content: string,
): Promise<void> {
  const notePath = getWorkspaceNoteFilePath(root, outputDirectory, noteFile);

  await mkdir(path.dirname(notePath), { recursive: true });
  await writeFile(notePath, content, "utf-8");
}

/**
 * Creates a deterministic random id generator for repository tests.
 *
 * @param ids - Random ids returned in sequence.
 * @returns Random id generator.
 *
 * @example
 * const nextId = createSequentialRandomId(["fixed001"]);
 */
function createSequentialRandomId(ids: string[]): () => string {
  let index = 0;

  return () => ids[index++] ?? ids.at(-1) ?? firstRandomId;
}
