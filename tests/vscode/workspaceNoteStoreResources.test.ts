/**
 * Unit tests for resource-level workspace note store operations.
 */

import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { WorkspaceNoteStore } from "@vscode/notes";
import { WorkspaceNoteStoreRepository } from "@vscode/notes/WorkspaceNoteStoreRepository";

const outputDirectory = ".caca";
const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";

describe("workspaceNoteStoreResources", () => {
  it("moves a source file entry while preserving its note file", async () => {
    const root = await createTempWorkspaceRoot();
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));
    const sourceFile = createStoredSourceFile({ anchor: "needsConfirmation" });

    await notes.cache.saveSourceFile(root, outputDirectory, "src/old.ts", sourceFile, createdAt);
    const beforeIndex = await notes.cache.getRequiredIndex(root, outputDirectory);
    const beforeNoteFile = beforeIndex.files["src/old.ts"]?.noteFile;

    const result = await notes.resources.moveSourceFileEntry(
      root,
      outputDirectory,
      "src/old.ts",
      "src/new.ts",
      now,
    );

    const afterIndex = await notes.cache.getRequiredIndex(root, outputDirectory);
    const movedSourceFile = await notes.cache.getSourceFile(root, outputDirectory, "src/new.ts");
    const oldSourceFile = await notes.cache.getSourceFile(root, outputDirectory, "src/old.ts");

    expect(result).toEqual({
      kind: "moved",
      previousRelativePath: "src/old.ts",
      nextRelativePath: "src/new.ts",
      noteFile: beforeNoteFile,
      events: [
        {
          type: "fileNoteResourceMoved",
          previousRelativePath: "src/old.ts",
          nextRelativePath: "src/new.ts",
        },
        {
          type: "fileNoteAnchorChanged",
          fileNoteId: "file",
          previousAnchor: "needsConfirmation",
          nextAnchor: "confirmed",
        },
      ],
    });
    expect(afterIndex.files["src/old.ts"]).toBeUndefined();
    expect(afterIndex.files["src/new.ts"]).toMatchObject({
      noteFile: beforeNoteFile,
      sourceHash: "sha256:source",
      updatedAt: now,
    });
    expect(movedSourceFile?.fileNote).toMatchObject({
      status: {
        content: "current",
        anchor: "confirmed",
      },
      updatedAt: now,
    });
    expect(oldSourceFile).toBeUndefined();
  });

  it("returns notFound when moving a missing source file entry", async () => {
    const root = await createTempWorkspaceRoot();
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository());

    const result = await notes.resources.moveSourceFileEntry(
      root,
      outputDirectory,
      "src/missing.ts",
      "src/new.ts",
      now,
    );

    expect(result).toEqual({
      kind: "notFound",
      previousRelativePath: "src/missing.ts",
    });
  });

  it("returns conflict without moving when the target path already has notes", async () => {
    const root = await createTempWorkspaceRoot();
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));

    await notes.cache.saveSourceFile(root, outputDirectory, "src/old.ts", createStoredSourceFile(), createdAt);
    await notes.cache.saveSourceFile(
      root,
      outputDirectory,
      "src/existing.ts",
      createStoredSourceFile({ sourceHash: "sha256:existing" }),
      createdAt,
    );

    const beforeIndex = await notes.cache.getRequiredIndex(root, outputDirectory);
    const result = await notes.resources.moveSourceFileEntry(
      root,
      outputDirectory,
      "src/old.ts",
      "src/existing.ts",
      now,
    );
    const afterIndex = await notes.cache.getRequiredIndex(root, outputDirectory);

    expect(result).toEqual({
      kind: "conflict",
      nextRelativePath: "src/existing.ts",
    });
    expect(afterIndex).toEqual(beforeIndex);
  });

  it("marks a source file entry deleted by orphaning its file note", async () => {
    const root = await createTempWorkspaceRoot();
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));

    await notes.cache.saveSourceFile(root, outputDirectory, "src/index.ts", createStoredSourceFile(), createdAt);

    const result = await notes.resources.markSourceFileEntryDeleted(
      root,
      outputDirectory,
      "src/index.ts",
      now,
    );

    const index = await notes.cache.getRequiredIndex(root, outputDirectory);
    const sourceFile = await notes.cache.getSourceFile(root, outputDirectory, "src/index.ts");

    expect(result).toEqual({
      kind: "markedDeleted",
      relativePath: "src/index.ts",
      events: [
        {
          type: "fileNoteResourceDeleted",
          relativePath: "src/index.ts",
        },
        {
          type: "fileNoteAnchorChanged",
          fileNoteId: "file",
          previousAnchor: "confirmed",
          nextAnchor: "orphaned",
        },
      ],
    });
    expect(index.files["src/index.ts"]).toBeDefined();
    expect(sourceFile?.fileNote).toMatchObject({
      status: {
        content: "current",
        anchor: "orphaned",
      },
      updatedAt: now,
    });
  });

  it("returns notFound when marking a missing source file entry deleted", async () => {
    const root = await createTempWorkspaceRoot();
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository());

    const result = await notes.resources.markSourceFileEntryDeleted(
      root,
      outputDirectory,
      "src/missing.ts",
      now,
    );

    expect(result).toEqual({
      kind: "notFound",
      relativePath: "src/missing.ts",
    });
  });
});

async function createTempWorkspaceRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "czaza-resource-store-"));
}

function createStoredSourceFile(input: {
  sourceHash?: string;
  anchor?: "confirmed" | "needsConfirmation" | "orphaned";
} = {}): StoredSourceFile {
  return {
    source: {
      sourceHash: input.sourceHash ?? "sha256:source",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status: {
        content: "current",
        anchor: input.anchor ?? "confirmed",
      },
      createdBy: "user",
      createdAt,
      updatedAt: createdAt,
    },
    sectionNotes: [],
    lineNotes: [],
  };
}
