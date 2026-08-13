/**
 * Tests Team and Personal Note Store path, cache, CRUD, and managed-output isolation.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { isCzazaNoteStoreRelativePath } from "@shared/utils/managedOutputPath";
import { WorkspaceNoteStore, type NoteStoreLocation } from "@vscode/notes";
import {
  getWorkspaceNoteIndexPath,
  WorkspaceNoteStoreRepository,
} from "@vscode/notes/WorkspaceNoteStoreRepository";

const outputDirectory = ".czaza";
const relativeFilePath = "src/index.ts";
const now = "2026-08-13T00:00:00.000Z";
const personal: NoteStoreLocation = { kind: "personal", memberId: "leo-12345678" };

describe("NoteStoreLocation", () => {
  it("preserves the Team path and resolves a member Personal path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "czaza-store-location-"));
    expect(getWorkspaceNoteIndexPath(root, outputDirectory)).toBe(
      path.join(root, outputDirectory, "notes", "team", "index.json"),
    );
    expect(getWorkspaceNoteIndexPath(root, outputDirectory, personal)).toBe(
      path.join(root, outputDirectory, "notes", "personal", personal.memberId, "index.json"),
    );
  });

  it("keeps Team and Personal CRUD and caches independent for the same source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "czaza-store-isolation-"));
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));
    const sourceFile = createStoredSourceFile();

    await notes.cache.saveSourceFile(root, outputDirectory, relativeFilePath, sourceFile, now);
    await notes.cache.saveSourceFile(root, outputDirectory, relativeFilePath, sourceFile, now, {}, personal);
    await notes.crud.upsertFileNote(
      root,
      outputDirectory,
      relativeFilePath,
      createFileNoteInput("Team note"),
      now,
    );
    await notes.crud.upsertFileNote(
      root,
      outputDirectory,
      relativeFilePath,
      createFileNoteInput("Personal note"),
      now,
      personal,
    );

    expect((await notes.crud.getFileNote(root, outputDirectory, relativeFilePath))?.userNote)
      .toBe("Team note");
    expect((await notes.crud.getFileNote(root, outputDirectory, relativeFilePath, personal))?.userNote)
      .toBe("Personal note");

    notes.cache.clearCache(root, outputDirectory);
    expect((await notes.crud.getFileNote(root, outputDirectory, relativeFilePath, personal))?.userNote)
      .toBe("Personal note");
  });

  it("treats both Team and Personal roots as managed output", () => {
    expect(isCzazaNoteStoreRelativePath("/workspace", ".czaza", ".czaza/notes/index.json"))
      .toBe(true);
    expect(isCzazaNoteStoreRelativePath(
      "/workspace",
      ".czaza",
      ".czaza/notes/personal/leo-12345678/index.json",
    )).toBe(true);
    expect(isCzazaNoteStoreRelativePath("/workspace", ".czaza", "src/index.ts"))
      .toBe(false);
  });
});

/** Creates an empty source-file Store fixture. */
function createStoredSourceFile(): StoredSourceFile {
  return {
    source: { sourceHash: "sha256:source", programmingLanguage: "typescript" },
    sectionNotes: [],
    lineNotes: [],
  };
}

/** Creates a file-note input fixture. */
function createFileNoteInput(userNote: string) {
  return {
    id: "file",
    userNote,
    status: { content: "current" as const, anchor: "confirmed" as const },
    createdBy: "user" as const,
  };
}
