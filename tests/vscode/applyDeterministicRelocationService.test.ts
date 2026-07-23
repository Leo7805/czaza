/**
 * Unit tests for applying deterministic text document changes to notes.
 */

import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";
import { applyDeterministicRelocation } from "@vscode/services/noteRelocation/sourceChanges/applyDeterministicRelocationService";
import type { SourceChangeSplice } from "@vscode/services/noteRelocation/sourceChanges/sourceChangeAnchorTransform";

const now = "2026-07-18T00:00:00.000Z";
const sourceText = [
  "const first = 1;",
  "const second = 2;",
  "const third = 3;",
  "const fourth = 4;",
  "const fifth = 5;",
].join("\n");

describe("applyDeterministicRelocation()", () => {
  it("moves section and line notes after inserted lines before them", () => {
    const currentSourceText = [
      "const inserted = 0;",
      "const first = 1;",
      "const second = 2;",
      "const third = 3;",
      "const fourth = 4;",
      "const fifth = 5;",
    ].join("\n");
    const result = applyDeterministicRelocation({
      sourceFile: createStoredSourceFile(),
      change: createSpliceChange({ insertedLineCount: 1, lineDelta: 1 }),
      currentSourceText,
      programmingLanguage: "typescript",
      now,
    });

    expect(result.sourceFile.source.sourceHash).toBe(createSourceHash(currentSourceText));
    expect(result.sourceFile.fileNote?.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(result.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 3,
      endLine: 5,
    });
    expect(result.sourceFile.sectionNotes[0]?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
    expect(result.sourceFile.lineNotes[0]?.line).toBe(4);
    expect(result.sourceFile.lineNotes[0]?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
  });

  it("expands and marks a section stale when lines are inserted inside it", () => {
    const currentSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const inserted = 20;",
      "const third = 3;",
      "const fourth = 4;",
      "const fifth = 5;",
    ].join("\n");
    const result = applyDeterministicRelocation({
      sourceFile: createStoredSourceFile(),
      change: createSpliceChange({
        startLine: 2,
        insertedLineCount: 1,
        lineDelta: 1,
      }),
      currentSourceText,
      now,
    });
    const section = result.sourceFile.sectionNotes[0]!;

    expect(section.range).toEqual({
      startLine: 2,
      endLine: 5,
    });
    expect(section.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(section.anchorHash).toBe(createSourceHash([
      "const second = 2;",
      "const third = 3;",
      "const fourth = 4;",
    ].join("\n")));
  });

  it("marks a section stale without relocating when an empty line is inserted inside it", () => {
    const currentSourceText = [
      "const first = 1;",
      "const second = 2;",
      "",
      "const third = 3;",
      "const fourth = 4;",
      "const fifth = 5;",
    ].join("\n");
    const result = applyDeterministicRelocation({
      sourceFile: createStoredSourceFile(),
      change: createSpliceChange({
        startLine: 2,
        insertedLineCount: 1,
        lineDelta: 1,
      }),
      currentSourceText,
      now,
    });
    const section = result.sourceFile.sectionNotes[0]!;

    expect(section.range).toEqual({
      startLine: 2,
      endLine: 5,
    });
    expect(section.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(section.anchorHash).toBe(createSourceHash([
      "const second = 2;",
      "const third = 3;",
      "const fourth = 4;",
    ].join("\n")));
  });

  it("moves section and line notes after deleted lines before them", () => {
    const currentSourceText = [
      "const second = 2;",
      "const third = 3;",
      "const fourth = 4;",
      "const fifth = 5;",
    ].join("\n");
    const result = applyDeterministicRelocation({
      sourceFile: createStoredSourceFile(),
      change: createSpliceChange({
        endLine: 1,
        deletedLineCount: 1,
        lineDelta: -1,
      }),
      currentSourceText,
      now,
    });

    expect(result.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 1,
      endLine: 3,
    });
    expect(result.sourceFile.sectionNotes[0]?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
    expect(result.sourceFile.lineNotes[0]?.line).toBe(2);
    expect(result.sourceFile.lineNotes[0]?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
  });

  it("clears location review when a deterministic move reanchors section and line notes", () => {
    const sourceFile = createStoredSourceFile();
    sourceFile.sectionNotes[0]!.status = {
      content: "stale",
      anchor: "needsConfirmation",
    };
    sourceFile.lineNotes[0]!.status = {
      content: "stale",
      anchor: "needsConfirmation",
    };
    const currentSourceText = [
      "const inserted = 0;",
      "const first = 1;",
      "const second = 2;",
      "const third = 3;",
      "const fourth = 4;",
      "const fifth = 5;",
    ].join("\n");
    const result = applyDeterministicRelocation({
      sourceFile,
      change: createSpliceChange({ insertedLineCount: 1, lineDelta: 1 }),
      currentSourceText,
      now,
    });

    expect(result.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 3,
      endLine: 5,
    });
    expect(result.sourceFile.sectionNotes[0]?.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(result.sourceFile.lineNotes[0]?.line).toBe(4);
    expect(result.sourceFile.lineNotes[0]?.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
  });

  it("orphanes a line note when its source line is deleted", () => {
    const currentSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const fourth = 4;",
      "const fifth = 5;",
    ].join("\n");
    const result = applyDeterministicRelocation({
      sourceFile: createStoredSourceFile(),
      change: createSpliceChange({
        startLine: 2,
        endLine: 3,
        deletedLineCount: 1,
        lineDelta: -1,
      }),
      currentSourceText,
      now,
    });

    expect(result.sourceFile.lineNotes[0]?.status).toEqual({
      content: "stale",
      anchor: "orphaned",
    });
  });

  it("orphanes a section note when its full range is deleted", () => {
    const currentSourceText = [
      "const first = 1;",
      "const fifth = 5;",
    ].join("\n");
    const result = applyDeterministicRelocation({
      sourceFile: createStoredSourceFile(),
      change: createSpliceChange({
        startLine: 1,
        endLine: 4,
        deletedLineCount: 3,
        lineDelta: -3,
      }),
      currentSourceText,
      now,
    });

    expect(result.sourceFile.sectionNotes[0]?.status).toEqual({
      content: "stale",
      anchor: "orphaned",
    });
  });

  it("marks and reanchors section and line notes for a single-line edit", () => {
    const currentSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const third = 30;",
      "const fourth = 4;",
      "const fifth = 5;",
    ].join("\n");
    const result = applyDeterministicRelocation({
      sourceFile: createStoredSourceFile(),
      change: createSpliceChange({
        startLine: 2,
        startCharacter: 14,
        endLine: 2,
        endCharacter: 15,
      }),
      currentSourceText,
      now,
    });
    const section = result.sourceFile.sectionNotes[0]!;
    const line = result.sourceFile.lineNotes[0]!;

    expect(section.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(section.anchorHash).toBe(createSourceHash([
      "const second = 2;",
      "const third = 3;",
      "const fourth = 4;",
    ].join("\n")));
    expect(line.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(line.anchorText).toBe("const third = 3;");
  });

  it("returns unsupported events without changing source notes", () => {
    const sourceFile = createStoredSourceFile();
    const result = applyDeterministicRelocation({
      sourceFile,
      change: {
        kind: "unsupported",
        reason: "multipleChanges",
      },
      currentSourceText: sourceText,
      now,
    });

    expect(result.changed).toBe(false);
    expect(result.sourceFile).toBe(sourceFile);
    expect(result.events).toEqual([
      {
        type: "unsupportedChange",
        reason: "multipleChanges",
      },
    ]);
  });

  it("moves downstream notes after a Copilot-style replacement inserts lines", () => {
    const currentSourceText = [
      "const first = 1;",
      "const replacement = 2;",
      "const inserted = 20;",
      "const extra = 21;",
      "const second = 2;",
      "const third = 3;",
      "const fourth = 4;",
      "const fifth = 5;",
    ].join("\n");
    const result = applyDeterministicRelocation({
      sourceFile: createStoredSourceFile(),
      change: createSpliceChange({
        startLine: 0,
        startCharacter: 6,
        endLine: 0,
        endCharacter: 11,
        insertedLineCount: 3,
        lineDelta: 3,
      }),
      currentSourceText,
      now,
    });

    expect(result.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 5,
      endLine: 7,
    });
    expect(result.sourceFile.lineNotes[0]?.line).toBe(6);
  });
});

/**
 * Creates a classified splice with concise overrides for relocation tests.
 *
 * @param overrides - Source splice fields that differ from defaults.
 * @returns Classified normalized source splice.
 */
function createSpliceChange(overrides: Partial<SourceChangeSplice>) {
  const splice: SourceChangeSplice = {
    startLine: 0,
    startCharacter: 0,
    endLine: overrides.startLine ?? 0,
    endCharacter: overrides.startCharacter ?? 0,
    insertedLineCount: 0,
    deletedLineCount: 0,
    lineDelta: 0,
    ...overrides,
  };

  return { kind: "splice" as const, splice };
}

/**
 * Creates a stored source bundle containing representative notes.
 *
 * @returns Stored source bundle for deterministic relocation tests.
 */
function createStoredSourceFile(): StoredSourceFile {
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
      createdBy: "user",
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    },
    sectionNotes: [
      {
        id: "section:middle",
        title: "Middle constants",
        range: {
          startLine: 2,
          endLine: 4,
        },
        anchorHash: createSourceHash([
          "const second = 2;",
          "const third = 3;",
          "const fourth = 4;",
        ].join("\n")),
        userNote: "Section note.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    ],
    lineNotes: [
      {
        id: "line:third",
        line: 3,
        anchorText: "const third = 3;",
        userNote: "Line note.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    ],
  };
}
