/**
 * Unit tests for the new workspace note store repository.
 */

import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  createWorkspaceNoteFileName,
  getWorkspaceNoteFilePath,
  getWorkspaceNoteIndexPath,
  isRecentInternalWorkspaceNoteWrite,
  isWorkspaceNoteIndexV2,
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
      schemaVersion: 2 as const,
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

    await writeRawStoreFile(root, `${JSON.stringify({ schemaVersion: 1, updatedAt: now, files: {} })}\n`);

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
    expect(JSON.parse(noteRaw) as unknown).toEqual({
      source: sourceFile.source,
      sectionNotes: {},
      lineNotes: {},
    });
    expect(loaded).toEqual(sourceFile);
    expect(index).toEqual({
      schemaVersion: 2,
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
    expect(isRecentInternalWorkspaceNoteWrite(
      getWorkspaceNoteIndexPath(root, outputDirectory),
    )).toBe(true);
  });

  it("does not rewrite a note or index when the persistent content is unchanged", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => firstRandomId);
    const sourceFile = createStoredSourceFile();

    await repository.saveSourceFile(root, outputDirectory, "src/index.ts", sourceFile, now);

    const indexPath = getWorkspaceNoteIndexPath(root, outputDirectory);
    const notePath = getWorkspaceNoteFilePath(
      root,
      outputDirectory,
      createWorkspaceNoteFileName("src/index.ts", firstRandomId),
    );
    const beforeIndex = await readFile(indexPath, "utf-8");
    const beforeNote = await readFile(notePath, "utf-8");

    await repository.saveSourceFile(
      root,
      outputDirectory,
      "src/index.ts",
      sourceFile,
      "2026-07-14T00:00:00.000Z",
    );

    expect(await readFile(indexPath, "utf-8")).toBe(beforeIndex);
    expect(await readFile(notePath, "utf-8")).toBe(beforeNote);
  });

  it("does not rewrite semantically equal content with different property order", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => firstRandomId);
    const sourceFile = createStoredSourceFile();

    await repository.saveSourceFile(root, outputDirectory, "src/index.ts", sourceFile, now);

    const indexPath = getWorkspaceNoteIndexPath(root, outputDirectory);
    const notePath = getWorkspaceNoteFilePath(
      root,
      outputDirectory,
      createWorkspaceNoteFileName("src/index.ts", firstRandomId),
    );
    const beforeIndex = await readFile(indexPath, "utf-8");
    const beforeNote = await readFile(notePath, "utf-8");
    const reorderedSourceFile: StoredSourceFile = {
      lineNotes: [],
      sectionNotes: [],
      source: {
        programmingLanguage: sourceFile.source.programmingLanguage,
        sourceHash: sourceFile.source.sourceHash,
      },
    };

    const result = await repository.saveSourceFile(
      root,
      outputDirectory,
      "src/index.ts",
      reorderedSourceFile,
      "2026-07-14T00:00:00.000Z",
    );

    expect(result).toBe("unchanged");
    expect(await readFile(indexPath, "utf-8")).toBe(beforeIndex);
    expect(await readFile(notePath, "utf-8")).toBe(beforeNote);
  });

  it("cancels saving when an indexed Note JSON temporarily disappears", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => firstRandomId);
    const sourceFile = createStoredSourceFile();

    await repository.saveSourceFile(root, outputDirectory, "src/index.ts", sourceFile, now);

    const indexPath = getWorkspaceNoteIndexPath(root, outputDirectory);
    const notePath = getWorkspaceNoteFilePath(
      root,
      outputDirectory,
      createWorkspaceNoteFileName("src/index.ts", firstRandomId),
    );
    const beforeIndex = await readFile(indexPath, "utf-8");

    await unlink(notePath);

    const result = await repository.saveSourceFile(
      root,
      outputDirectory,
      "src/index.ts",
      sourceFile,
      "2026-07-14T00:00:00.000Z",
    );

    expect(result).toBe("cancelled");
    expect(await readFile(indexPath, "utf-8")).toBe(beforeIndex);
    await expect(readFile(notePath, "utf-8")).rejects.toThrow();
  });

  it("cancels saving when an indexed Note JSON is invalid", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => firstRandomId);
    const sourceFile = createStoredSourceFile();

    await repository.saveSourceFile(root, outputDirectory, "src/index.ts", sourceFile, now);

    const indexPath = getWorkspaceNoteIndexPath(root, outputDirectory);
    const notePath = getWorkspaceNoteFilePath(
      root,
      outputDirectory,
      createWorkspaceNoteFileName("src/index.ts", firstRandomId),
    );
    const beforeIndex = await readFile(indexPath, "utf-8");
    const invalidNote = "{temporarily invalid";

    await writeFile(notePath, invalidNote, "utf-8");

    const result = await repository.saveSourceFile(
      root,
      outputDirectory,
      "src/index.ts",
      sourceFile,
      "2026-07-14T00:00:00.000Z",
    );

    expect(result).toBe("cancelled");
    expect(await readFile(indexPath, "utf-8")).toBe(beforeIndex);
    expect(await readFile(notePath, "utf-8")).toBe(invalidNote);
  });

  it("refuses to store generated note files as source entries", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => firstRandomId);
    const sourceFile = createStoredSourceFile();

    await expect(
      repository.saveSourceFile(
        root,
        outputDirectory,
        ".caca/notes/index.json",
        sourceFile,
        now,
      ),
    ).rejects.toThrow("CZaza-managed output files cannot be stored as source-note entries.");

    await expect(
      repository.saveSourceFile(
        root,
        outputDirectory,
        ".caca/notes/files/generated.json",
        sourceFile,
        now,
      ),
    ).rejects.toThrow("CZaza-managed output files cannot be stored as source-note entries.");

    expect(await repository.loadIndex(root, outputDirectory)).toBeNull();
  });

  it("preserves existing source file entries when saving one file", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(createSequentialRandomId([firstRandomId, secondRandomId]));
    const firstFile = createStoredSourceFile("sha256:first");
    const secondFile = createStoredSourceFile("sha256:second");

    await repository.saveSourceFile(
      root,
      outputDirectory,
      "src/first.ts",
      firstFile,
      "2026-07-12T00:00:00.000Z",
    );
    await repository.saveSourceFile(root, outputDirectory, "src/second.ts", secondFile, now);

    expect(await repository.loadIndex(root, outputDirectory)).toEqual({
      schemaVersion: 2,
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
          noteFile: createWorkspaceNoteFileName("src/second.ts", secondRandomId),
          sourceHash: "sha256:second",
          programmingLanguage: "typescript",
          updatedAt: now,
        },
      },
    });
    expect(await repository.getSourceFile(root, outputDirectory, "src/first.ts")).toEqual(firstFile);
    expect(await repository.getSourceFile(root, outputDirectory, "src/second.ts")).toEqual(secondFile);
  });

  it("serializes concurrent saves without losing either index entry", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(
      createSequentialRandomId([firstRandomId, secondRandomId]),
    );

    await Promise.all([
      repository.saveSourceFile(
        root,
        outputDirectory,
        "src/first.ts",
        createStoredSourceFile("sha256:first"),
        now,
      ),
      repository.saveSourceFile(
        root,
        outputDirectory,
        "src/second.ts",
        createStoredSourceFile("sha256:second"),
        now,
      ),
    ]);

    const index = await repository.loadIndex(root, outputDirectory);

    expect(Object.keys(index?.files ?? {}).sort()).toEqual([
      "src/first.ts",
      "src/second.ts",
    ]);
  });

  it("refuses to replace an invalid existing index with a one-entry Store", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => firstRandomId);
    const invalidContent = "{temporarily invalid";

    await writeRawStoreFile(root, invalidContent);

    await expect(
      repository.saveSourceFile(
        root,
        outputDirectory,
        "src/index.ts",
        createStoredSourceFile(),
        now,
      ),
    ).rejects.toThrow("Workspace Note index is unreadable or unstable.");
    expect(
      await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8"),
    ).toBe(invalidContent);
  });

  it("refuses to recreate a missing index inside an existing Note Store", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => firstRandomId);
    const notesDirectory = path.dirname(getWorkspaceNoteIndexPath(root, outputDirectory));

    await mkdir(path.join(notesDirectory, "files"), { recursive: true });

    await expect(
      repository.saveSourceFile(
        root,
        outputDirectory,
        "src/index.ts",
        createStoredSourceFile(),
        now,
      ),
    ).rejects.toThrow("Workspace Note index disappeared from an existing Store.");
    expect(await repository.loadIndex(root, outputDirectory)).toBeNull();
  });

  it("cancels a write when its persistence permission changes inside the queue", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => firstRandomId);
    let checks = 0;

    const result = await repository.saveSourceFile(
      root,
      outputDirectory,
      "src/index.ts",
      createStoredSourceFile(),
      now,
      { canPersist: () => ++checks === 1 },
    );

    expect(result).toBe("cancelled");
    expect(await repository.loadIndex(root, outputDirectory)).toBeNull();
  });

  it("validates the top-level workspace note index shape", () => {
    expect(isWorkspaceNoteIndexV2({ schemaVersion: 2, updatedAt: now, files: {} })).toBe(true);
    expect(isWorkspaceNoteIndexV2({ schemaVersion: 2, files: {} })).toBe(false);
    expect(isWorkspaceNoteIndexV2({ schemaVersion: 1, updatedAt: now, files: {} })).toBe(false);
    expect(isWorkspaceNoteIndexV2({
      schemaVersion: 2,
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
