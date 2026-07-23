/**
 * Unit tests for applying deterministic text document changes to notes.
 */

import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";
import { applyDeterministicRelocation } from "@vscode/services/noteRelocation/sourceChanges/applyDeterministicRelocationService";

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
      change: {
        kind: "insertLines",
        startLine: 1,
        lineCount: 1,
      },
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
      change: {
        kind: "insertLines",
        startLine: 3,
        lineCount: 1,
      },
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
      change: {
        kind: "insertLines",
        startLine: 3,
        lineCount: 1,
      },
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
      change: {
        kind: "deleteLines",
        startLine: 1,
        endLine: 1,
        lineCount: 1,
      },
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
      change: {
        kind: "insertLines",
        startLine: 1,
        lineCount: 1,
      },
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
      change: {
        kind: "deleteLines",
        startLine: 3,
        endLine: 3,
        lineCount: 1,
      },
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
      change: {
        kind: "deleteLines",
        startLine: 2,
        endLine: 4,
        lineCount: 3,
      },
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
      change: {
        kind: "editLine",
        line: 3,
      },
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
        reason: "mixedChange",
      },
      currentSourceText: sourceText,
      now,
    });

    expect(result.changed).toBe(false);
    expect(result.sourceFile).toBe(sourceFile);
    expect(result.events).toEqual([
      {
        type: "unsupportedChange",
        reason: "mixedChange",
      },
    ]);
  });
});

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
