/**
 * Unit tests for atomically applying source-change batches to stored Notes.
 */

import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";
import { applySourceChangeBatch } from "@vscode/services/noteRelocation/sourceChanges/applySourceChangeBatchService";
import type { SourceChangeSplice } from "@vscode/services/noteRelocation/sourceChanges/sourceChangeAnchorTransform";

const now = "2026-07-23T00:00:00.000Z";
const originalText = "export const value = 1;\n";

describe("applySourceChangeBatch()", () => {
  it("applies independent splices and updates file metadata once", () => {
    const nextText = "const first = 1;\nconst second = 2;\nexport const value = 1;\n";
    const result = applySourceChangeBatch({
      sourceFile: createStoredSourceFile(),
      batch: {
        kind: "splices",
        splices: [
          createSplice({ startLine: 1, insertedLineCount: 1, lineDelta: 1 }),
          createSplice({ insertedLineCount: 1, lineDelta: 1 }),
        ],
        requiresConfirmation: false,
      },
      currentSourceText: nextText,
      programmingLanguage: "typescript",
      now,
    });

    expect(result.sourceFile.source.sourceHash).toBe(createSourceHash(nextText));
    expect(result.sourceFile.fileNote?.updatedAt).toBe(now);
    expect(result.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 2,
      endLine: 2,
    });
    expect(result.events.filter((event) => event.type === "fileNoteMarkedStale")).toHaveLength(1);
  });

  it("combines same-position insertions without requiring location review", () => {
    const result = applySourceChangeBatch({
      sourceFile: createStoredSourceFile(),
      batch: {
        kind: "splices",
        splices: [
          createSplice({ insertedLineCount: 1, lineDelta: 1 }),
          createSplice({ insertedLineCount: 2, lineDelta: 2 }),
        ],
        requiresConfirmation: false,
      },
      currentSourceText: "one\ntwo\nthree\nexport const value = 1;\n",
      now,
    });

    expect(result.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 4,
      endLine: 4,
    });
    expect(result.sourceFile.lineNotes[0]?.line).toBe(4);
    expect(result.sourceFile.sectionNotes[0]?.status.anchor).toBe("confirmed");
    expect(result.sourceFile.lineNotes[0]?.status.anchor).toBe("confirmed");
    expect(
      result.events.filter((event) => event.type === "sectionNoteNeedsConfirmation"),
    ).toHaveLength(0);
    expect(
      result.events.filter((event) => event.type === "lineNoteNeedsConfirmation"),
    ).toHaveLength(0);
  });

  it("restores a Section range across first-line Enter, Undo, and Redo", () => {
    const entered = applySourceChangeBatch({
      sourceFile: createStoredSourceFile(),
      batch: {
        kind: "splices",
        splices: [
          createSplice({
            insertedLineCount: 1,
            lineDelta: 1,
            isLineBreakInsertion: true,
          }),
        ],
        requiresConfirmation: false,
      },
      currentSourceText: `\n${originalText}`,
      now,
    });
    const undone = applySourceChangeBatch({
      sourceFile: entered.sourceFile,
      batch: {
        kind: "splices",
        splices: [
          createSplice({
            endLine: 1,
            deletedLineCount: 1,
            lineDelta: -1,
          }),
        ],
        requiresConfirmation: false,
        editReason: "undo",
      },
      currentSourceText: originalText,
      now,
    });
    const redone = applySourceChangeBatch({
      sourceFile: undone.sourceFile,
      batch: {
        kind: "splices",
        splices: [
          createSplice({
            insertedLineCount: 1,
            lineDelta: 1,
            isLineBreakInsertion: true,
          }),
        ],
        requiresConfirmation: false,
        editReason: "redo",
      },
      currentSourceText: `\n${originalText}`,
      now,
    });

    expect(entered.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 1,
      endLine: 2,
    });
    expect(undone.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 1,
      endLine: 1,
    });
    expect(redone.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 1,
      endLine: 2,
    });
  });

  it("rejects an unsupported batch without changing Notes", () => {
    const sourceFile = createStoredSourceFile();
    const result = applySourceChangeBatch({
      sourceFile,
      batch: {
        kind: "unsupported",
        reason: "overlappingChanges",
      },
      currentSourceText: originalText,
      now,
    });

    expect(result).toEqual({
      sourceFile,
      changed: false,
      events: [],
      unsupportedReason: "overlappingChanges",
    });
  });
});

/**
 * Creates a normalized insertion splice with concise overrides.
 *
 * @param overrides - Source splice fields that differ from defaults.
 * @returns Complete normalized source splice.
 */
function createSplice(overrides: Partial<SourceChangeSplice>): SourceChangeSplice {
  return {
    startLine: 0,
    startCharacter: 0,
    endLine: overrides.startLine ?? 0,
    endCharacter: 0,
    insertedLineCount: 0,
    deletedLineCount: 0,
    lineDelta: 0,
    ...overrides,
  };
}

/**
 * Creates a stored bundle with Notes anchored to the original first line.
 *
 * @returns Stored source bundle for batch application tests.
 */
function createStoredSourceFile(): StoredSourceFile {
  return {
    source: {
      sourceHash: createSourceHash(originalText),
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status: { content: "current", anchor: "confirmed" },
      createdBy: "user",
      createdAt: now,
      updatedAt: now,
    },
    sectionNotes: [
      {
        id: "section",
        title: "Export",
        range: { startLine: 1, endLine: 1 },
        anchorHash: createSourceHash("export const value = 1;"),
        userNote: "Section note.",
        status: { content: "current", anchor: "confirmed" },
        createdBy: "user",
        createdAt: now,
        updatedAt: now,
      },
    ],
    lineNotes: [
      {
        id: "line",
        line: 1,
        anchorText: "export const value = 1;",
        userNote: "Line note.",
        status: { content: "current", anchor: "confirmed" },
        createdBy: "user",
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}
