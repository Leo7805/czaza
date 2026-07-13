/**
 * Unit tests for source-file note detection reports.
 */

import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  detectChangedSourceRangeNotes,
  detectEntireSourceFileNotes,
  detectSourceFileNotes,
} from "@shared/services/notes/noteDetectionService";
import { createSourceHash } from "@shared/utils/hashUtils";

const sourceText = [
  "const first = 1;",
  "const second = 2;",
  "const third = first + second;",
].join("\n");

describe("noteDetectionService", () => {
  it("reports matched file, section, and line anchors", () => {
    const sourceFile = createStoredSourceFile(sourceText);
    const report = detectSourceFileNotes(sourceText, sourceFile);

    expect(report.file).toEqual({
      status: {
        content: "current",
        anchor: "confirmed",
      },
      sourceHashChanged: false,
      reason: "sourceHashMatched",
      previousSourceHash: createSourceHash(sourceText),
      currentSourceHash: createSourceHash(sourceText),
      previousProgrammingLanguage: "typescript",
      currentLineCount: 3,
    });
    expect(report.sections).toEqual([
      {
        id: "section:1",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        reason: "anchorHashMatched",
        range: {
          startLine: 1,
          endLine: 2,
        },
        previousAnchorHash: createSourceHash(["const first = 1;", "const second = 2;"].join("\n")),
        currentAnchorHash: createSourceHash(["const first = 1;", "const second = 2;"].join("\n")),
      },
    ]);
    expect(report.lines).toEqual([
      {
        id: "line:2",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        reason: "anchorTextMatched",
        line: 2,
        previousAnchorText: "const second = 2;",
        currentAnchorText: "const second = 2;",
      },
    ]);
  });

  it("reports file source hash changes", () => {
    const sourceFile = createStoredSourceFile(sourceText);
    const nextSourceText = sourceText.replace("const third", "const total");
    const report = detectSourceFileNotes(nextSourceText, sourceFile);

    expect(report.file).toEqual({
      status: {
        content: "stale",
        anchor: "confirmed",
      },
      sourceHashChanged: true,
      reason: "sourceHashChanged",
      previousSourceHash: createSourceHash(sourceText),
      currentSourceHash: createSourceHash(nextSourceText),
      previousProgrammingLanguage: "typescript",
      currentLineCount: 3,
    });
  });

  it("reports programming language changes when current language metadata is provided", () => {
    const sourceFile = createStoredSourceFile(sourceText);
    const report = detectSourceFileNotes(sourceText, sourceFile, {
      programmingLanguage: "typescriptreact",
    });

    expect(report.file).toEqual({
      status: {
        content: "current",
        anchor: "confirmed",
      },
      sourceHashChanged: false,
      programmingLanguageChanged: true,
      reason: "sourceHashMatched",
      previousSourceHash: createSourceHash(sourceText),
      currentSourceHash: createSourceHash(sourceText),
      previousProgrammingLanguage: "typescript",
      currentProgrammingLanguage: "typescriptreact",
      currentLineCount: 3,
    });
  });

  it("reports section anchors that need confirmation when range text changes", () => {
    const sourceFile = createStoredSourceFile(sourceText);
    const nextSourceText = sourceText.replace("const second = 2;", "const second = 20;");
    const report = detectSourceFileNotes(nextSourceText, sourceFile);

    expect(report.sections).toEqual([
      {
        id: "section:1",
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
        reason: "anchorHashChanged",
        range: {
          startLine: 1,
          endLine: 2,
        },
        previousAnchorHash: createSourceHash(["const first = 1;", "const second = 2;"].join("\n")),
        currentAnchorHash: createSourceHash(["const first = 1;", "const second = 20;"].join("\n")),
      },
    ]);
  });

  it("reports orphaned section anchors when the range is out of bounds", () => {
    const sourceFile = {
      ...createStoredSourceFile(sourceText),
      sectionNotes: [
        {
          ...createStoredSourceFile(sourceText).sectionNotes[0],
          range: {
            startLine: 2,
            endLine: 4,
          },
        },
      ],
    };
    const report = detectSourceFileNotes(sourceText, sourceFile);

    expect(report.sections).toEqual([
      {
        id: "section:1",
        status: {
          content: "stale",
          anchor: "orphaned",
        },
        reason: "rangeOutOfBounds",
        range: {
          startLine: 2,
          endLine: 4,
        },
        previousAnchorHash: createSourceHash(["const first = 1;", "const second = 2;"].join("\n")),
      },
    ]);
  });

  it("reports line anchors that need confirmation when line text changes", () => {
    const sourceFile = createStoredSourceFile(sourceText);
    const nextSourceText = sourceText.replace("const second = 2;", "const second = 20;");
    const report = detectSourceFileNotes(nextSourceText, sourceFile);

    expect(report.lines).toEqual([
      {
        id: "line:2",
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
        reason: "anchorTextChanged",
        line: 2,
        previousAnchorText: "const second = 2;",
        currentAnchorText: "const second = 20;",
      },
    ]);
  });

  it("reports orphaned line anchors when the line is out of bounds", () => {
    const sourceFile = {
      ...createStoredSourceFile(sourceText),
      lineNotes: [
        {
          ...createStoredSourceFile(sourceText).lineNotes[0],
          line: 4,
        },
      ],
    };
    const report = detectSourceFileNotes(sourceText, sourceFile);

    expect(report.lines).toEqual([
      {
        id: "line:2",
        status: {
          content: "stale",
          anchor: "orphaned",
        },
        reason: "lineOutOfBounds",
        line: 4,
        previousAnchorText: "const second = 2;",
      },
    ]);
  });

  it("detects the entire source file through the semantic wrapper", () => {
    const sourceFile = createStoredSourceFile(sourceText);

    expect(detectEntireSourceFileNotes(sourceText, sourceFile)).toEqual(
      detectSourceFileNotes(sourceText, sourceFile),
    );
  });

  it("detects only section and line notes affected by a changed start line", () => {
    const sourceFile = createStoredSourceFileWithMultipleNotes(sourceText);
    const nextSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const third = 30;",
      "const fourth = 4;",
    ].join("\n");
    const report = detectChangedSourceRangeNotes(nextSourceText, sourceFile, {
      changedStartLine: 3,
      programmingLanguage: "typescript",
    });

    expect(report.file).toMatchObject({
      status: {
        content: "stale",
        anchor: "confirmed",
      },
      sourceHashChanged: true,
      programmingLanguageChanged: false,
      currentLineCount: 4,
    });
    expect(report.sections.map((section) => section.id)).toEqual(["section:crosses-change", "section:after-change"]);
    expect(report.lines.map((line) => line.id)).toEqual(["line:3"]);
  });

  it("throws when changed source range detection receives an invalid start line", () => {
    expect(() =>
      detectChangedSourceRangeNotes(sourceText, createStoredSourceFile(sourceText), {
        changedStartLine: 0,
      }),
    ).toThrow("Invalid changed source range: changedStartLine must be a positive integer.");
  });
});

/**
 * Creates stored notes matching the default test source text.
 *
 * @param text - Source text used for the file hash.
 * @returns Stored source file fixture.
 *
 * @example
 * const sourceFile = createStoredSourceFile("const value = 1;");
 */
function createStoredSourceFile(text: string): StoredSourceFile {
  return {
    source: {
      sourceHash: createSourceHash(text),
      programmingLanguage: "typescript",
    },
    sectionNotes: [
      {
        id: "section:1",
        title: "Initial constants",
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
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
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
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    ],
  };
}

/**
 * Creates stored notes covering lines before, across, and after a changed line.
 *
 * @param text - Source text used for the file hash.
 * @returns Stored source file fixture with multiple section and line notes.
 *
 * @example
 * const sourceFile = createStoredSourceFileWithMultipleNotes(sourceText);
 */
function createStoredSourceFileWithMultipleNotes(text: string): StoredSourceFile {
  const sourceFile = createStoredSourceFile(text);

  return {
    ...sourceFile,
    sectionNotes: [
      {
        ...sourceFile.sectionNotes[0],
        id: "section:before-change",
        range: {
          startLine: 1,
          endLine: 2,
        },
      },
      {
        ...sourceFile.sectionNotes[0],
        id: "section:crosses-change",
        range: {
          startLine: 2,
          endLine: 3,
        },
        anchorHash: createSourceHash(["const second = 2;", "const third = first + second;"].join("\n")),
      },
      {
        ...sourceFile.sectionNotes[0],
        id: "section:after-change",
        range: {
          startLine: 3,
          endLine: 3,
        },
        anchorHash: createSourceHash("const third = first + second;"),
      },
    ],
    lineNotes: [
      {
        ...sourceFile.lineNotes[0],
        id: "line:2",
        line: 2,
        anchorText: "const second = 2;",
      },
      {
        ...sourceFile.lineNotes[0],
        id: "line:3",
        line: 3,
        anchorText: "const third = first + second;",
      },
    ],
  };
}
