/**
 * Unit tests for confirming source anchors as stored note baselines.
 */

import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  confirmFileSource,
  confirmLineCurrentText,
  confirmLineNumber,
  confirmSectionCurrentRange,
  confirmSectionRange,
} from "@shared/services/notes/noteConfirmationService";
import { createSourceHash } from "@shared/utils/hashUtils";

const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";
const sourceText = [
  "const first = 1;",
  "const second = 2;",
  "const third = first + second;",
  "const fourth = 4;",
].join("\n");

describe("noteConfirmationService", () => {
  it("confirms file source hash, language, and file note status", () => {
    const sourceFile = createStoredSourceFile();
    const confirmed = confirmFileSource(sourceFile, sourceText, "typescriptreact", now);

    expect(confirmed.source).toEqual({
      sourceHash: createSourceHash(sourceText),
      programmingLanguage: "typescriptreact",
    });
    expect(confirmed.fileNote).toMatchObject({
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdAt,
      updatedAt: now,
    });
    expect(confirmed.sectionNotes).toBe(sourceFile.sectionNotes);
    expect(sourceFile.source.sourceHash).toBe("sha256:old-source");
  });

  it("confirms a section against its current stored range", () => {
    const sourceFile = createStoredSourceFile();
    const confirmed = confirmSectionCurrentRange(sourceFile, "section:1", sourceText, now);

    expect(confirmed.sectionNotes[0]).toMatchObject({
      range: {
        startLine: 1,
        endLine: 2,
      },
      anchorHash: createSourceHash(["const first = 1;", "const second = 2;"].join("\n")),
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdAt,
      updatedAt: now,
    });
  });

  it("confirms a section against a relocated range", () => {
    const sourceFile = createStoredSourceFile();
    const confirmed = confirmSectionRange(
      sourceFile,
      "section:1",
      {
        startLine: 3,
        endLine: 4,
      },
      sourceText,
      now,
    );

    expect(confirmed.sectionNotes[0]).toMatchObject({
      range: {
        startLine: 3,
        endLine: 4,
      },
      anchorHash: createSourceHash(["const third = first + second;", "const fourth = 4;"].join("\n")),
      status: {
        content: "current",
        anchor: "confirmed",
      },
      updatedAt: now,
    });
  });

  it("confirms a line against its current stored line", () => {
    const sourceFile = createStoredSourceFile();
    const confirmed = confirmLineCurrentText(sourceFile, "line:2", sourceText, now);

    expect(confirmed.lineNotes[0]).toMatchObject({
      line: 2,
      anchorText: "const second = 2;",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdAt,
      updatedAt: now,
    });
  });

  it("confirms a line against a relocated line and keeps line notes sorted", () => {
    const sourceFile = {
      ...createStoredSourceFile(),
      lineNotes: [
        createLineNote("line:2", 2),
        createLineNote("line:4", 4),
      ],
    };
    const confirmed = confirmLineNumber(sourceFile, "line:2", 4, sourceText, now);

    expect(confirmed.lineNotes.map((line) => line.id)).toEqual(["line:2", "line:4"]);
    expect(confirmed.lineNotes[0]).toMatchObject({
      id: "line:2",
      line: 4,
      anchorText: "const fourth = 4;",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      updatedAt: now,
    });
  });

  it("returns the same source file when confirming a missing note id", () => {
    const sourceFile = createStoredSourceFile();

    expect(confirmSectionCurrentRange(sourceFile, "section:missing", sourceText, now)).toBe(sourceFile);
    expect(confirmLineCurrentText(sourceFile, "line:missing", sourceText, now)).toBe(sourceFile);
  });

  it("throws when confirming invalid section ranges or line numbers", () => {
    const sourceFile = createStoredSourceFile();

    expect(() =>
      confirmSectionRange(sourceFile, "section:1", { startLine: 1, endLine: 10 }, sourceText, now),
    ).toThrow("Invalid section range: endLine exceeds source line count.");
    expect(() => confirmLineNumber(sourceFile, "line:2", 10, sourceText, now))
      .toThrow("Invalid line anchor: line exceeds source line count.");
  });
});

/**
 * Creates a stored source file with file, section, and line notes.
 *
 * @returns Stored source file fixture.
 *
 * @example
 * const sourceFile = createStoredSourceFile();
 */
function createStoredSourceFile(): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:old-source",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status: {
        content: "stale",
        anchor: "confirmed",
      },
      createdBy: "user",
      createdAt,
      updatedAt: createdAt,
    },
    sectionNotes: [
      {
        id: "section:1",
        title: "Initial constants",
        range: {
          startLine: 1,
          endLine: 2,
        },
        anchorHash: "sha256:old-section",
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    lineNotes: [
      createLineNote("line:2", 2),
    ],
  };
}

/**
 * Creates a stored line note fixture.
 *
 * @param id - Stable line note id.
 * @param line - One-based source line number.
 * @returns Stored line note fixture.
 *
 * @example
 * const note = createLineNote("line:2", 2);
 */
function createLineNote(id: string, line: number) {
  return {
    id,
    line,
    anchorText: "old anchor",
    status: {
      content: "stale" as const,
      anchor: "needsConfirmation" as const,
    },
    createdBy: "user" as const,
    createdAt,
    updatedAt: createdAt,
  };
}
