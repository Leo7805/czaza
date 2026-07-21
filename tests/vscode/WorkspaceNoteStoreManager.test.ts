/**
 * Integration-style tests for workspace note store notes CRUD operations.
 */

import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";
import { WorkspaceNoteStore } from "@vscode/notes";
import {
  createWorkspaceNoteFileName,
  getWorkspaceNoteFilePath,
  getWorkspaceNoteIndexPath,
  WorkspaceNoteStoreRepository,
} from "@vscode/notes/WorkspaceNoteStoreRepository";

const outputDirectory = ".caca";
const relativeFilePath = "src/index.ts";
const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";
const later = "2026-07-14T00:00:00.000Z";
const randomId = "fixed001";

describe("WorkspaceNoteStore", () => {
  it("manages file, section, and line note CRUD with repository persistence", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const notes = new WorkspaceNoteStore(repository);
    const initialSourceFile = createStoredSourceFile();

    await notes.cache.saveSourceFile(root, outputDirectory, relativeFilePath, initialSourceFile, createdAt);

    await notes.crud.upsertFileNote(root, outputDirectory, relativeFilePath, createFileNoteInput("File note."), now);
    await notes.crud.upsertSectionNote(
      root,
      outputDirectory,
      relativeFilePath,
      createSectionNoteInput("section:1:intro:1-2", "Intro", 1, 2),
      now,
    );
    await notes.crud.upsertLineNote(
      root,
      outputDirectory,
      relativeFilePath,
      createLineNoteInput("line:2", 2, "const second = 2;"),
      now,
    );

    const afterInsert = await notes.cache.getSourceFile(root, outputDirectory, relativeFilePath);

    console.log("Store source file after inserts:", JSON.stringify(afterInsert, null, 2));

    expect(await notes.crud.getFileNote(root, outputDirectory, relativeFilePath)).toMatchObject({
      userNote: "File note.",
      createdAt: now,
      updatedAt: now,
    });
    expect(await notes.crud.getSectionNote(root, outputDirectory, relativeFilePath, "section:1:intro:1-2"))
      .toMatchObject({
        title: "Intro",
        createdAt: now,
        updatedAt: now,
      });
    expect(await notes.crud.getLineNote(root, outputDirectory, relativeFilePath, "line:2")).toMatchObject({
      anchorText: "const second = 2;",
      createdAt: now,
      updatedAt: now,
    });

    await notes.crud.upsertSectionNote(
      root,
      outputDirectory,
      relativeFilePath,
      {
        ...createSectionNoteInput("section:1:intro:1-2", "Intro updated", 1, 2),
        userNote: "Updated section.",
      },
      later,
    );
    await notes.crud.deleteLineNote(root, outputDirectory, relativeFilePath, "line:2", later);

    const persisted = await repository.getSourceFile(root, outputDirectory, relativeFilePath);
    const indexRaw = await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8");
    const noteRaw = await readFile(
      getWorkspaceNoteFilePath(root, outputDirectory, createWorkspaceNoteFileName(relativeFilePath, randomId)),
      "utf-8",
    );

    console.log("Store persisted index:", indexRaw.trim());
    console.log("Store persisted note file:", noteRaw.trim());

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

    notes.cache.clearCache(root, outputDirectory);

    expect(await notes.cache.getSourceFile(root, outputDirectory, relativeFilePath)).toEqual(persisted);

    await notes.crud.deleteFileNote(root, outputDirectory, relativeFilePath, later);

    expect(await notes.crud.getFileNote(root, outputDirectory, relativeFilePath)).toBeUndefined();
  });

  it("throws when note CRUD is requested before a source file is initialized", async () => {
    const root = await createTempWorkspaceRoot();
    const notes = new WorkspaceNoteStore();

    await expect(
      notes.crud.upsertLineNote(root, outputDirectory, relativeFilePath, createLineNoteInput("line:1", 1, "x"), now),
    ).rejects.toThrow("Source file notes are not initialized: src/index.ts");
  });

  it("checks tracked source file notes and returns a detection report", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const notes = new WorkspaceNoteStore(repository);
    const sourceText = ["const first = 1;", "const second = 2;"].join("\n");
    const sourceFile = {
      ...createStoredSourceFile(),
      source: {
        sourceHash: createSourceHash(sourceText),
        programmingLanguage: "typescript",
      },
    };

    await notes.cache.saveSourceFile(root, outputDirectory, relativeFilePath, sourceFile, createdAt);

    const result = await notes.detection.checkEntireSourceFileNotes(root, outputDirectory, relativeFilePath, sourceText, {
      programmingLanguage: "typescriptreact",
    });

    console.log("Store tracked source file check:", JSON.stringify(result, null, 2));

    expect(result).toMatchObject({
      kind: "tracked",
      relativeFilePath,
      report: {
        file: {
          status: {
            content: "current",
            anchor: "confirmed",
          },
          sourceHashChanged: false,
          programmingLanguageChanged: true,
          previousSourceHash: createSourceHash(sourceText),
          currentSourceHash: createSourceHash(sourceText),
          previousProgrammingLanguage: "typescript",
          currentProgrammingLanguage: "typescriptreact",
          currentLineCount: 2,
        },
        sections: [],
        lines: [],
      },
    });
  });

  it("checks changed source range notes through the manager", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const notes = new WorkspaceNoteStore(repository);
    const oldSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const third = first + second;",
      "const fourth = 4;",
    ].join("\n");
    const nextSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const third = 30;",
      "const fourth = 4;",
    ].join("\n");

    await notes.cache.saveSourceFile(
      root,
      outputDirectory,
      relativeFilePath,
      createStoredSourceFileWithAnchors(oldSourceText),
      createdAt,
    );

    const result = await notes.detection.checkChangedSourceRangeNotes(
      root,
      outputDirectory,
      relativeFilePath,
      nextSourceText,
      {
        changedStartLine: 3,
        programmingLanguage: "typescript",
      },
    );

    console.log("Store changed source range check:", JSON.stringify(result, null, 2));

    expect(result).toMatchObject({
      kind: "tracked",
      relativeFilePath,
      report: {
        file: {
          status: {
            content: "stale",
            anchor: "confirmed",
          },
          sourceHashChanged: true,
          programmingLanguageChanged: false,
          currentLineCount: 4,
        },
      },
    });

    if (result.kind !== "tracked") {
      throw new Error("Expected tracked source file notes.");
    }

    expect(result.report.sections.map((section) => section.id)).toEqual([
      "section:crosses-change",
      "section:after-change",
    ]);
    expect(result.report.lines.map((line) => line.id)).toEqual(["line:3"]);
  });

  it("checks and applies entire source file note statuses through the manager", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const notes = new WorkspaceNoteStore(repository);
    const oldSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const third = first + second;",
      "const fourth = 4;",
    ].join("\n");
    const nextSourceText = [
      "const first = 1;",
      "const second = 20;",
      "const third = 30;",
      "const fourth = 4;",
    ].join("\n");

    await notes.cache.saveSourceFile(
      root,
      outputDirectory,
      relativeFilePath,
      createStoredSourceFileWithAnchors(oldSourceText),
      createdAt,
    );

    const result = await notes.detection.checkAndApplyEntireSourceFileNoteStatus(
      root,
      outputDirectory,
      relativeFilePath,
      nextSourceText,
      {
        programmingLanguage: "typescript",
      },
      later,
    );
    const persisted = await repository.getSourceFile(root, outputDirectory, relativeFilePath);

    console.log("Store check and apply entire source file:", JSON.stringify(result, null, 2));

    expect(result).toMatchObject({
      kind: "tracked",
      updatedSourceFile: {
        fileNote: {
          status: {
            content: "stale",
            anchor: "confirmed",
          },
          updatedAt: later,
        },
      },
    });
    expect(persisted?.fileNote?.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(persisted?.sectionNotes.map((section) => section.status)).toEqual([
      {
        content: "stale",
        anchor: "needsConfirmation",
      },
      {
        content: "stale",
        anchor: "needsConfirmation",
      },
      {
        content: "stale",
        anchor: "needsConfirmation",
      },
    ]);
    expect(persisted?.lineNotes.map((line) => line.status)).toEqual([
      {
        content: "stale",
        anchor: "needsConfirmation",
      },
      {
        content: "stale",
        anchor: "needsConfirmation",
      },
    ]);
  });

  it("checks and applies changed source range note statuses through the manager", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const notes = new WorkspaceNoteStore(repository);
    const oldSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const third = first + second;",
      "const fourth = 4;",
    ].join("\n");
    const nextSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const third = 30;",
      "const fourth = 4;",
    ].join("\n");

    await notes.cache.saveSourceFile(
      root,
      outputDirectory,
      relativeFilePath,
      createStoredSourceFileWithAnchors(oldSourceText),
      createdAt,
    );

    const result = await notes.detection.checkAndApplyChangedSourceRangeNoteStatus(
      root,
      outputDirectory,
      relativeFilePath,
      nextSourceText,
      {
        changedStartLine: 3,
        programmingLanguage: "typescript",
      },
      later,
    );
    const persisted = await repository.getSourceFile(root, outputDirectory, relativeFilePath);

    console.log("Store check and apply changed source range:", JSON.stringify(result, null, 2));

    expect(result.kind).toBe("tracked");
    expect(persisted?.fileNote?.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(persisted?.sectionNotes.map((section) => [section.id, section.status])).toEqual([
      [
        "section:before-change",
        {
          content: "current",
          anchor: "confirmed",
        },
      ],
      [
        "section:crosses-change",
        {
          content: "stale",
          anchor: "needsConfirmation",
        },
      ],
      [
        "section:after-change",
        {
          content: "stale",
          anchor: "needsConfirmation",
        },
      ],
    ]);
    expect(persisted?.lineNotes.map((line) => [line.id, line.status])).toEqual([
      [
        "line:2",
        {
          content: "current",
          anchor: "confirmed",
        },
      ],
      [
        "line:3",
        {
          content: "stale",
          anchor: "needsConfirmation",
        },
      ],
    ]);
  });

  it("confirms file, section, and line anchors through the manager", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const notes = new WorkspaceNoteStore(repository);
    const oldSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const third = first + second;",
      "const fourth = 4;",
    ].join("\n");
    const nextSourceText = [
      "const first = 1;",
      "const second = 20;",
      "const third = 30;",
      "const fourth = 4;",
    ].join("\n");

    await notes.cache.saveSourceFile(
      root,
      outputDirectory,
      relativeFilePath,
      createStoredSourceFileWithAnchors(oldSourceText),
      createdAt,
    );

    await notes.confirmation.confirmFileSource(
      root,
      outputDirectory,
      relativeFilePath,
      nextSourceText,
      "typescriptreact",
      later,
    );
    await notes.confirmation.confirmSectionRange(
      root,
      outputDirectory,
      relativeFilePath,
      "section:before-change",
      {
        startLine: 2,
        endLine: 3,
      },
      nextSourceText,
      later,
    );
    await notes.confirmation.confirmLineNumber(
      root,
      outputDirectory,
      relativeFilePath,
      "line:2",
      3,
      nextSourceText,
      later,
    );

    const persisted = await repository.getSourceFile(root, outputDirectory, relativeFilePath);
    const indexRaw = await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8");

    console.log("Store confirmation persisted source file:", JSON.stringify(persisted, null, 2));
    console.log("Store confirmation persisted index:", indexRaw.trim());

    expect(persisted?.source).toEqual({
      sourceHash: createSourceHash(nextSourceText),
      programmingLanguage: "typescriptreact",
    });
    expect(persisted?.fileNote).toMatchObject({
      status: {
        content: "current",
        anchor: "confirmed",
      },
      updatedAt: later,
    });
    expect(persisted?.sectionNotes[0]).toMatchObject({
      id: "section:before-change",
      range: {
        startLine: 2,
        endLine: 3,
      },
      anchorHash: createSourceHash(["const second = 20;", "const third = 30;"].join("\n")),
      status: {
        content: "current",
        anchor: "confirmed",
      },
      updatedAt: later,
    });
    expect(persisted?.lineNotes.find((line) => line.id === "line:2")).toMatchObject({
      line: 3,
      anchorText: "const third = 30;",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      updatedAt: later,
    });
    expect(JSON.parse(indexRaw) as unknown).toMatchObject({
      updatedAt: later,
      files: {
        [relativeFilePath]: {
          sourceHash: createSourceHash(nextSourceText),
          programmingLanguage: "typescriptreact",
          updatedAt: later,
        },
      },
    });
  });

  it("returns indexEntryMissing when checking an untracked source file", async () => {
    const root = await createTempWorkspaceRoot();
    const notes = new WorkspaceNoteStore();
    const result = await notes.detection.checkSourceFileNotes(root, outputDirectory, relativeFilePath, "const value = 1;");

    expect(result).toEqual({
      kind: "indexEntryMissing",
      relativeFilePath,
    });
  });

  it("returns noteFileMissingOrInvalid when the index entry points to a missing note file", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const notes = new WorkspaceNoteStore(repository);

    await repository.saveIndex(root, outputDirectory, {
      schemaVersion: 1,
      updatedAt: createdAt,
      workspaceRoot: root,
      files: {
        [relativeFilePath]: {
          noteFile: "files/missing-note.json",
          sourceHash: "sha256:missing",
          programmingLanguage: "typescript",
          updatedAt: createdAt,
        },
      },
    });

    const result = await notes.detection.checkSourceFileNotes(root, outputDirectory, relativeFilePath, "const value = 1;");

    expect(result).toEqual({
      kind: "noteFileMissingOrInvalid",
      relativeFilePath,
    });
  });

  it("renames and deletes source file index entries without deleting the note file", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const notes = new WorkspaceNoteStore(repository);
    const newRelativeFilePath = "src/renamed.ts";
    const noteFile = createWorkspaceNoteFileName(relativeFilePath, randomId);

    await notes.cache.saveSourceFile(root, outputDirectory, relativeFilePath, createStoredSourceFile(), createdAt);
    await notes.cache.getSourceFile(root, outputDirectory, relativeFilePath);

    const renamedIndex = await notes.sourceIndex.renameSourceFileEntry(
      root,
      outputDirectory,
      relativeFilePath,
      newRelativeFilePath,
      now,
    );
    const oldSourceFile = await notes.cache.getSourceFile(root, outputDirectory, relativeFilePath);
    const renamedSourceFile = await notes.cache.getSourceFile(root, outputDirectory, newRelativeFilePath);
    const renamedIndexRaw = await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8");

    console.log("Store index after source file rename:", JSON.stringify(renamedIndex, null, 2));
    console.log("Store source file after source file rename:", JSON.stringify(renamedSourceFile, null, 2));

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

    const deletedIndex = await notes.sourceIndex.deleteSourceFileEntry(root, outputDirectory, newRelativeFilePath, later);
    const deletedIndexRaw = await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8");
    const noteRawAfterDelete = await readFile(
      getWorkspaceNoteFilePath(root, outputDirectory, noteFile),
      "utf-8",
    );

    console.log("Store index after source file index delete:", JSON.stringify(deletedIndex, null, 2));
    console.log("Store note file after source file index delete:", noteRawAfterDelete.trim());

    expect(JSON.parse(deletedIndexRaw) as unknown).toMatchObject({
      updatedAt: later,
      files: {},
    });
    expect(JSON.parse(noteRawAfterDelete) as unknown).toEqual({
      schemaVersion: 2,
      source: createStoredSourceFile().source,
      sectionNotes: {},
      lineNotes: {},
    });
  });

  it("persists fine-grained note updates through the manager", async () => {
    const root = await createTempWorkspaceRoot();
    const repository = new WorkspaceNoteStoreRepository(() => randomId);
    const notes = new WorkspaceNoteStore(repository);
    const sectionId = "section:1:intro:1-2";
    const lineId = "line:2";

    await notes.cache.saveSourceFile(root, outputDirectory, relativeFilePath, createStoredSourceFile(), createdAt);
    await notes.crud.upsertFileNote(root, outputDirectory, relativeFilePath, createFileNoteInput("Initial file note."), now);
    await notes.crud.upsertSectionNote(
      root,
      outputDirectory,
      relativeFilePath,
      createSectionNoteInput(sectionId, "Intro", 1, 2),
      now,
    );
    await notes.crud.upsertLineNote(
      root,
      outputDirectory,
      relativeFilePath,
      createLineNoteInput(lineId, 2, "const second = 2;"),
      now,
    );

    await notes.update.updateSourceHash(root, outputDirectory, relativeFilePath, "sha256:next-source", later);
    await notes.update.updateProgrammingLanguage(root, outputDirectory, relativeFilePath, "typescriptreact", later);
    await notes.update.updateFileUserNote(root, outputDirectory, relativeFilePath, "Updated file note.", later);
    await notes.update.updateFileAiExplanation(
      root,
      outputDirectory,
      relativeFilePath,
      { summary: "File summary.", detail: "File detail." },
      later,
    );
    await notes.update.updateFileNoteStatus(
      root,
      outputDirectory,
      relativeFilePath,
      { content: "stale", anchor: "confirmed" },
      later,
    );
    await notes.update.updateSectionRange(
      root,
      outputDirectory,
      relativeFilePath,
      sectionId,
      { startLine: 3, endLine: 5 },
      10,
      later,
    );
    await notes.update.updateSectionAnchorHash(root, outputDirectory, relativeFilePath, sectionId, "sha256:section-next", later);
    await notes.update.updateSectionTitle(root, outputDirectory, relativeFilePath, sectionId, "Intro updated", later);
    await notes.update.updateSectionKind(root, outputDirectory, relativeFilePath, sectionId, "setup", later);
    await notes.update.updateSectionUserNote(root, outputDirectory, relativeFilePath, sectionId, "Updated section note.", later);
    await notes.update.updateSectionAiExplanation(
      root,
      outputDirectory,
      relativeFilePath,
      sectionId,
      { summary: "Section summary.", detail: "Section detail." },
      later,
    );
    await notes.update.updateSectionNoteStatus(
      root,
      outputDirectory,
      relativeFilePath,
      sectionId,
      { content: "current", anchor: "needsConfirmation" },
      later,
    );
    await notes.update.updateLineNumber(root, outputDirectory, relativeFilePath, lineId, 6, 10, later);
    await notes.update.updateLineAnchorText(root, outputDirectory, relativeFilePath, lineId, "const moved = 2;", later);
    await notes.update.updateLineUserNote(root, outputDirectory, relativeFilePath, lineId, "Updated line note.", later);
    await notes.update.updateLineAiExplanation(
      root,
      outputDirectory,
      relativeFilePath,
      lineId,
      { summary: "Line summary.", detail: "Line detail." },
      later,
    );
    await notes.update.updateLineNoteStatus(
      root,
      outputDirectory,
      relativeFilePath,
      lineId,
      { content: "current", anchor: "confirmed" },
      later,
    );

    const persisted = await repository.getSourceFile(root, outputDirectory, relativeFilePath);
    const indexRaw = await readFile(getWorkspaceNoteIndexPath(root, outputDirectory), "utf-8");

    console.log("Store fine-grained update index:", indexRaw.trim());
    console.log("Store fine-grained update source file:", JSON.stringify(persisted, null, 2));

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
 * Creates a temporary workspace root for notes tests.
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
 * Creates a stored source file with section and line anchors for detection tests.
 *
 * @param sourceText - Source text used for the stored file hash.
 * @returns Stored source file fixture with notes before, across, and after a change.
 *
 * @example
 * const sourceFile = createStoredSourceFileWithAnchors(sourceText);
 */
function createStoredSourceFileWithAnchors(sourceText: string): StoredSourceFile {
  return {
    source: {
      sourceHash: createSourceHash(sourceText),
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
      createdAt,
      updatedAt: createdAt,
    },
    sectionNotes: [
      {
        id: "section:before-change",
        title: "Before change",
        range: {
          startLine: 1,
          endLine: 2,
        },
        anchorHash: createSourceHash(["const first = 1;", "const second = 2;"].join("\n")),
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "section:crosses-change",
        title: "Crosses change",
        range: {
          startLine: 2,
          endLine: 3,
        },
        anchorHash: createSourceHash(["const second = 2;", "const third = first + second;"].join("\n")),
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "section:after-change",
        title: "After change",
        range: {
          startLine: 3,
          endLine: 4,
        },
        anchorHash: createSourceHash(["const third = first + second;", "const fourth = 4;"].join("\n")),
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    lineNotes: [
      {
        id: "line:2",
        line: 2,
        anchorText: "const second = 2;",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "line:3",
        line: 3,
        anchorText: "const third = first + second;",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
    ],
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
