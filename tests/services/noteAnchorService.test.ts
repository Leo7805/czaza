/**
 * Unit tests for stored note anchor updates.
 */

import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  assertValidLine,
  assertValidRange,
  updateLineAnchorText,
  updateLineNumber,
  updateProgrammingLanguage,
  updateSectionAnchorHash,
  updateSectionRange,
  updateSourceHash,
} from "@shared/services/notes/noteAnchorService";

const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";

describe("noteAnchorService", () => {
  it("updates source metadata without changing notes", () => {
    const sourceFile = createStoredSourceFile();
    const withHash = updateSourceHash(sourceFile, "sha256:new");
    const withLanguage = updateProgrammingLanguage(withHash, "typescriptreact");

    expect(withLanguage.source).toEqual({
      sourceHash: "sha256:new",
      programmingLanguage: "typescriptreact",
    });
    expect(withLanguage.sectionNotes).toBe(sourceFile.sectionNotes);
    expect(withLanguage.lineNotes).toBe(sourceFile.lineNotes);
  });

  it("updates section range and anchor hash", () => {
    const sourceFile = createStoredSourceFile();
    const withRange = updateSectionRange(
      sourceFile,
      "section:1:intro:1-2",
      { startLine: 3, endLine: 5 },
      10,
      now,
    );
    const withHash = updateSectionAnchorHash(
      withRange,
      "section:1:intro:1-2",
      "sha256:new-section",
      now,
    );

    expect(withHash.sectionNotes[0]).toMatchObject({
      range: {
        startLine: 3,
        endLine: 5,
      },
      anchorHash: "sha256:new-section",
      createdAt,
      updatedAt: now,
    });
    expect(sourceFile.sectionNotes[0]?.range.startLine).toBe(1);
  });

  it("updates line number and anchor text", () => {
    const sourceFile = createStoredSourceFile();
    const withLine = updateLineNumber(sourceFile, "line:1", 4, 10, now);
    const withText = updateLineAnchorText(withLine, "line:1", "const next = 2;", now);

    expect(withText.lineNotes[0]).toMatchObject({
      line: 4,
      anchorText: "const next = 2;",
      createdAt,
      updatedAt: now,
    });
    expect(sourceFile.lineNotes[0]?.line).toBe(1);
  });

  it("sorts line notes after line number changes", () => {
    const sourceFile = {
      ...createStoredSourceFile(),
      lineNotes: [
        createLineNote("line:1", 1),
        createLineNote("line:2", 2),
      ],
    };
    const updated = updateLineNumber(sourceFile, "line:1", 5, 10, now);

    expect(updated.lineNotes.map((note) => note.id)).toEqual(["line:2", "line:1"]);
  });

  it("throws for invalid ranges and lines", () => {
    expect(() => assertValidRange({ startLine: 0, endLine: 1 }, 10)).toThrow(
      "Invalid section range: startLine must be a positive integer.",
    );
    expect(() => assertValidRange({ startLine: 3, endLine: 2 }, 10)).toThrow(
      "Invalid section range: endLine must be greater than or equal to startLine.",
    );
    expect(() => assertValidRange({ startLine: 3, endLine: 20 }, 10)).toThrow(
      "Invalid section range: endLine exceeds source line count.",
    );
    expect(() => assertValidLine(0, 10)).toThrow(
      "Invalid line anchor: line must be a positive integer.",
    );
    expect(() => assertValidLine(20, 10)).toThrow(
      "Invalid line anchor: line exceeds source line count.",
    );
  });
});

/**
 * Creates a stored source file with section and line notes.
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
    sectionNotes: [
      {
        id: "section:1:intro:1-2",
        title: "Intro",
        range: {
          startLine: 1,
          endLine: 2,
        },
        anchorHash: "sha256:section",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    lineNotes: [
      createLineNote("line:1", 1),
    ],
  };
}

/**
 * Creates a stored line note fixture.
 *
 * @param id - Stable line note id.
 * @param line - One-based line number.
 * @returns Stored line note fixture.
 *
 * @example
 * const note = createLineNote("line:1", 1);
 */
function createLineNote(id: string, line: number) {
  return {
    id,
    line,
    anchorText: `line ${line}`,
    status: {
      content: "current" as const,
      anchor: "confirmed" as const,
    },
    createdBy: "user" as const,
    createdAt,
    updatedAt: createdAt,
  };
}
