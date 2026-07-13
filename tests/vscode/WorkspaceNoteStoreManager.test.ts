/**
 * Integration-style tests for workspace note store manager CRUD operations.
 */

import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { WorkspaceNoteStoreManager } from "@vscode/explanations/WorkspaceNoteStoreManager";
import {
  createWorkspaceNoteFileName,
  getWorkspaceNoteFilePath,
  getWorkspaceNoteIndexPath,
  WorkspaceNoteStoreRepository,
} from "@vscode/explanations/WorkspaceNoteStoreRepository";

const outputDirectory = ".caca";
const relativeFilePath = "src/index.ts";
const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";
const later = "2026-07-14T00:00:00.000Z";
const randomId = "fixed001";

describe("WorkspaceNoteStoreManager", () => {
  it("manages file, section, and line note CRUD with repository persistence", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const manager = new WorkspaceNoteStoreManager(repository);
    const initialSourceFile = createStoredSourceFile();

    await manager.saveSourceFile(root, outputDirectory, relativeFilePath, initialSourceFile, createdAt);

    await manager.upsertFileNote(root, outputDirectory, relativeFilePath, createFileNoteInput("File note."), now);
    await manager.upsertSectionNote(
      root,
      outputDirectory,
      relativeFilePath,
      createSectionNoteInput("section:1:intro:1-2", "Intro", 1, 2),
      now,
    );
    await manager.upsertLineNote(
      root,
      outputDirectory,
      relativeFilePath,
      createLineNoteInput("line:2", 2, "const second = 2;"),
      now,
    );

    const afterInsert = await manager.getSourceFile(root, outputDirectory, relativeFilePath);

    console.log("Manager source file after inserts:", JSON.stringify(afterInsert, null, 2));

    expect(await manager.getFileNote(root, outputDirectory, relativeFilePath)).toMatchObject({
      userNote: "File note.",
      createdAt: now,
      updatedAt: now,
    });
    expect(await manager.getSectionNote(root, outputDirectory, relativeFilePath, "section:1:intro:1-2"))
      .toMatchObject({
        title: "Intro",
        createdAt: now,
        updatedAt: now,
      });
    expect(await manager.getLineNote(root, outputDirectory, relativeFilePath, "line:2")).toMatchObject({
      anchorText: "const second = 2;",
      createdAt: now,
      updatedAt: now,
    });

    await manager.upsertSectionNote(
      root,
      outputDirectory,
      relativeFilePath,
      {
        ...createSectionNoteInput("section:1:intro:1-2", "Intro updated", 1, 2),
        userNote: "Updated section.",
      },
      later,
    );
    await manager.deleteLineNote(root, outputDirectory, relativeFilePath, "line:2", later);

    const persisted = await repository.getSourceFile(root, outputDirectory, relativeFilePath);
    const indexRaw = await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8");
    const noteRaw = await readFile(
      getWorkspaceNoteFilePath(root, outputDirectory, createWorkspaceNoteFileName(relativeFilePath, randomId)),
      "utf-8",
    );

    console.log("Manager persisted index:", indexRaw.trim());
    console.log("Manager persisted note file:", noteRaw.trim());

    expect(persisted?.sectionNotes).toEqual([
      expect.objectContaining({
        id: "section:1:intro:1-2",
        title: "Intro updated",
        userNote: "Updated section.",
        createdAt: now,
        updatedAt: later,
      }),
    ]);
    expect(persisted?.lineNotes).toEqual([]);
    expect(JSON.parse(indexRaw) as unknown).toMatchObject({
      updatedAt: later,
      files: {
        [relativeFilePath]: {
          noteFile: createWorkspaceNoteFileName(relativeFilePath, randomId),
          sourceHash: "sha256:source",
          programmingLanguage: "typescript",
          updatedAt: later,
        },
      },
    });

    manager.clearCache(root, outputDirectory);

    expect(await manager.getSourceFile(root, outputDirectory, relativeFilePath)).toEqual(persisted);

    await manager.deleteFileNote(root, outputDirectory, relativeFilePath, later);

    expect(await manager.getFileNote(root, outputDirectory, relativeFilePath)).toBeUndefined();
  });

  it("throws when note CRUD is requested before a source file is initialized", async () => {
    const root = await createTempWorkspaceRoot();
    const manager = new WorkspaceNoteStoreManager();

    await expect(
      manager.upsertLineNote(root, outputDirectory, relativeFilePath, createLineNoteInput("line:1", 1, "x"), now),
    ).rejects.toThrow("Source file notes are not initialized: src/index.ts");
  });

  it("renames and deletes source file index entries without deleting the note file", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const manager = new WorkspaceNoteStoreManager(repository);
    const newRelativeFilePath = "src/renamed.ts";
    const noteFile = createWorkspaceNoteFileName(relativeFilePath, randomId);

    await manager.saveSourceFile(root, outputDirectory, relativeFilePath, createStoredSourceFile(), createdAt);
    await manager.getSourceFile(root, outputDirectory, relativeFilePath);

    const renamedIndex = await manager.renameSourceFileEntry(
      root,
      outputDirectory,
      relativeFilePath,
      newRelativeFilePath,
      now,
    );
    const oldSourceFile = await manager.getSourceFile(root, outputDirectory, relativeFilePath);
    const renamedSourceFile = await manager.getSourceFile(root, outputDirectory, newRelativeFilePath);
    const renamedIndexRaw = await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8");

    console.log("Manager index after source file rename:", JSON.stringify(renamedIndex, null, 2));
    console.log("Manager source file after source file rename:", JSON.stringify(renamedSourceFile, null, 2));

    expect(oldSourceFile).toBeUndefined();
    expect(renamedSourceFile).toEqual(createStoredSourceFile());
    expect(JSON.parse(renamedIndexRaw) as unknown).toMatchObject({
      updatedAt: now,
      files: {
        [newRelativeFilePath]: {
          noteFile,
          sourceHash: "sha256:source",
          programmingLanguage: "typescript",
          updatedAt: now,
        },
      },
    });
    expect(JSON.parse(renamedIndexRaw).files[relativeFilePath]).toBeUndefined();

    const deletedIndex = await manager.deleteSourceFileEntry(root, outputDirectory, newRelativeFilePath, later);
    const deletedIndexRaw = await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8");
    const noteRawAfterDelete = await readFile(
      getWorkspaceNoteFilePath(root, outputDirectory, noteFile),
      "utf-8",
    );

    console.log("Manager index after source file index delete:", JSON.stringify(deletedIndex, null, 2));
    console.log("Manager note file after source file index delete:", noteRawAfterDelete.trim());

    expect(JSON.parse(deletedIndexRaw) as unknown).toMatchObject({
      updatedAt: later,
      files: {},
    });
    expect(JSON.parse(noteRawAfterDelete) as unknown).toEqual(createStoredSourceFile());
  });

  it("persists fine-grained note updates through the manager", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const manager = new WorkspaceNoteStoreManager(repository);
    const sectionId = "section:1:intro:1-2";
    const lineId = "line:2";

    await manager.saveSourceFile(root, outputDirectory, relativeFilePath, createStoredSourceFile(), createdAt);
    await manager.upsertFileNote(root, outputDirectory, relativeFilePath, createFileNoteInput("Initial file note."), now);
    await manager.upsertSectionNote(
      root,
      outputDirectory,
      relativeFilePath,
      createSectionNoteInput(sectionId, "Intro", 1, 2),
      now,
    );
    await manager.upsertLineNote(
      root,
      outputDirectory,
      relativeFilePath,
      createLineNoteInput(lineId, 2, "const second = 2;"),
      now,
    );

    await manager.updateSourceHash(root, outputDirectory, relativeFilePath, "sha256:next-source", later);
    await manager.updateProgrammingLanguage(root, outputDirectory, relativeFilePath, "typescriptreact", later);
    await manager.updateFileUserNote(root, outputDirectory, relativeFilePath, "Updated file note.", later);
    await manager.updateFileAiExplanation(
      root,
      outputDirectory,
      relativeFilePath,
      { summary: "File summary.", detail: "File detail." },
      later,
    );
    await manager.updateFileNoteStatus(
      root,
      outputDirectory,
      relativeFilePath,
      { content: "stale", anchor: "confirmed" },
      later,
    );
    await manager.updateSectionRange(
      root,
      outputDirectory,
      relativeFilePath,
      sectionId,
      { startLine: 3, endLine: 5 },
      10,
      later,
    );
    await manager.updateSectionAnchorHash(root, outputDirectory, relativeFilePath, sectionId, "sha256:section-next", later);
    await manager.updateSectionTitle(root, outputDirectory, relativeFilePath, sectionId, "Intro updated", later);
    await manager.updateSectionKind(root, outputDirectory, relativeFilePath, sectionId, "setup", later);
    await manager.updateSectionUserNote(root, outputDirectory, relativeFilePath, sectionId, "Updated section note.", later);
    await manager.updateSectionAiExplanation(
      root,
      outputDirectory,
      relativeFilePath,
      sectionId,
      { summary: "Section summary.", detail: "Section detail." },
      later,
    );
    await manager.updateSectionNoteStatus(
      root,
      outputDirectory,
      relativeFilePath,
      sectionId,
      { content: "current", anchor: "needsConfirmation" },
      later,
    );
    await manager.updateLineNumber(root, outputDirectory, relativeFilePath, lineId, 6, 10, later);
    await manager.updateLineAnchorText(root, outputDirectory, relativeFilePath, lineId, "const moved = 2;", later);
    await manager.updateLineUserNote(root, outputDirectory, relativeFilePath, lineId, "Updated line note.", later);
    await manager.updateLineAiExplanation(
      root,
      outputDirectory,
      relativeFilePath,
      lineId,
      { summary: "Line summary.", detail: "Line detail." },
      later,
    );
    await manager.updateLineNoteStatus(
      root,
      outputDirectory,
      relativeFilePath,
      lineId,
      { content: "current", anchor: "confirmed" },
      later,
    );

    const persisted = await repository.getSourceFile(root, outputDirectory, relativeFilePath);
    const indexRaw = await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8");

    console.log("Manager fine-grained update index:", indexRaw.trim());
    console.log("Manager fine-grained update source file:", JSON.stringify(persisted, null, 2));

    expect(persisted).toMatchObject({
      source: {
        sourceHash: "sha256:next-source",
        programmingLanguage: "typescriptreact",
      },
      fileNote: {
        userNote: "Updated file note.",
        aiExplanation: {
          summary: "File summary.",
          detail: "File detail.",
        },
        status: {
          content: "stale",
          anchor: "confirmed",
        },
        updatedAt: later,
      },
      sectionNotes: [
        {
          id: sectionId,
          title: "Intro updated",
          kind: "setup",
          range: {
            startLine: 3,
            endLine: 5,
          },
          anchorHash: "sha256:section-next",
          userNote: "Updated section note.",
          aiExplanation: {
            summary: "Section summary.",
            detail: "Section detail.",
          },
          status: {
            content: "current",
            anchor: "needsConfirmation",
          },
          updatedAt: later,
        },
      ],
      lineNotes: [
        {
          id: lineId,
          line: 6,
          anchorText: "const moved = 2;",
          userNote: "Updated line note.",
          aiExplanation: {
            summary: "Line summary.",
            detail: "Line detail.",
          },
          status: {
            content: "current",
            anchor: "confirmed",
          },
          updatedAt: later,
        },
      ],
    });
    expect(JSON.parse(indexRaw) as unknown).toMatchObject({
      updatedAt: later,
      files: {
        [relativeFilePath]: {
          sourceHash: "sha256:next-source",
          programmingLanguage: "typescriptreact",
          updatedAt: later,
        },
      },
    });
  });
});

/**
 * Creates a temporary workspace root for manager tests.
 *
 * @returns Temporary workspace root path.
 *
 * @example
 * const root = await createTempWorkspaceRoot();
 */
async function createTempWorkspaceRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "czaza-manager-"));
}

/**
 * Creates a minimal stored source file.
 *
 * @returns Stored source file fixture.
 *
 * @example
 * const sourceFile = createStoredSourceFile();
 */
function createStoredSourceFile(): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:source",
      programmingLanguage: "typescript",
    },
    sectionNotes: [],
    lineNotes: [],
  };
}

/**
 * Creates a file note upsert fixture.
 *
 * @param userNote - User note text.
 * @returns File note input before timestamps are applied.
 *
 * @example
 * const note = createFileNoteInput("File note.");
 */
function createFileNoteInput(userNote: string) {
  return {
    id: "file",
    userNote,
    status: {
      content: "current" as const,
      anchor: "confirmed" as const,
    },
    createdBy: "user" as const,
  };
}

/**
 * Creates a section note upsert fixture.
 *
 * @param id - Stable section note id.
 * @param title - Section title.
 * @param startLine - One-based inclusive start line.
 * @param endLine - One-based inclusive end line.
 * @returns Section note input before timestamps are applied.
 *
 * @example
 * const note = createSectionNoteInput("section:1:intro:1-2", "Intro", 1, 2);
 */
function createSectionNoteInput(id: string, title: string, startLine: number, endLine: number) {
  return {
    id,
    title,
    range: {
      startLine,
      endLine,
    },
    anchorHash: `sha256:${id}`,
    status: {
      content: "current" as const,
      anchor: "confirmed" as const,
    },
    createdBy: "user" as const,
  };
}

/**
 * Creates a line note upsert fixture.
 *
 * @param id - Stable line note id.
 * @param line - One-based line number.
 * @param anchorText - Source text captured for the line anchor.
 * @returns Line note input before timestamps are applied.
 *
 * @example
 * const note = createLineNoteInput("line:1", 1, "const value = 1;");
 */
function createLineNoteInput(id: string, line: number, anchorText: string) {
  return {
    id,
    line,
    anchorText,
    status: {
      content: "current" as const,
      anchor: "confirmed" as const,
    },
    createdBy: "user" as const,
  };
}
